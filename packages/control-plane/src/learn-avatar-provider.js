// Avatar Teacher V1, AV3 groundwork (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §8, §9): the
// AvatarProvider contract and the HeyGen v3 adapter. Same asynchronous contract as video-provider.js:
// submit(input) -> durable ticket; poll(ticket) -> null while pending, or the finished clip. Download, the
// size cap, R2 and polling belong to the job runner (LearnAvatarClips, learn-avatar-cache.js), not to this adapter.
// Off unless LEARN_AVATAR_PROVIDER=heygen and HEYGEN_API_KEY are set (§9: neither exists on any Worker yet, and
// none is set on production before AV9). The key lives only in the Worker env and a private field; it never
// appears in a message, a ticket, an error or a log.

export const AVATAR_ERRORS = ['not_configured', 'unsupported_config', 'rejected_content', 'provider_credits', 'rate_limited', 'provider_failed', 'timeout', 'submission_uncertain', 'download_failed'];
// Learner-safe, fixed messages (§8, §24): no provider body, status text or input ever reaches a message.
const MESSAGES = {
  not_configured: 'Teacher clips are not available here.',
  unsupported_config: 'This teacher clip is not supported with its current settings.',
  rejected_content: 'The video provider declined this teacher clip.',
  provider_credits: 'The video provider has no credits left for teacher clips.',
  rate_limited: 'The video provider is busy. Try again later.',
  provider_failed: 'The video provider could not make this teacher clip.',
  timeout: 'The teacher clip took too long.',
  submission_uncertain: 'The teacher clip request could not be confirmed. Check provider history before trying again.',
  download_failed: 'The teacher clip could not be downloaded.',
};
// final: the job is done (failed); not final: keep the ticket and poll again (the LearnVideos alarm reads
// error.final the same way). code: the provider's machine code (e.g. HeyGen failure_code), for diagnostics only.
export class AvatarError extends Error {
  constructor(category, { final = true, code = null } = {}) {
    super(MESSAGES[category]);
    this.category = category; this.final = final; this.code = code;
  }
}

// The server-side credential presence check: null when this Worker may call the provider, else why not
// ('provider_off' | 'no_key'). Reads presence only; the value is never returned.
export function avatarGate(env) {
  if (env?.LEARN_AVATAR_PROVIDER !== 'heygen') return 'provider_off';
  if (!env.HEYGEN_API_KEY) return 'no_key';
  return null;
}

// Rabbit Hole profile id -> provider ids (§8: never taken from a brief or the browser; §17 profile registry).
// ponytail: empty until AV1 picks the stock look (trained with matting) and its native voice; entries look like
// avatars: { 'rh-teacher-1': { avatar_id, engine: 'avatar_iv', alpha: true } }, voices: { 'rh-voice-1': { voice_id } }.
export const AVATAR_PROFILES = Object.freeze({ avatars: Object.freeze({}), voices: Object.freeze({}) });

export function avatarProvider(env, { transport = fetch, profiles = AVATAR_PROFILES } = {}) {
  if (avatarGate(env)) throw new AvatarError('not_configured');
  return new HeyGenAvatarProvider(env.HEYGEN_API_KEY, transport, profiles);
}

// The provider-neutral render input for one brief, with provider ids resolved from configuration (§8). Exactly
// what the provider may receive (§16): the script text, the look and voice ids and the render settings - never
// learning_goal, visual_value, an identity or a turn. Alpha asked of a look without matting is downgraded
// visibly (downgrades, §11), never silently; an unknown profile is refused.
export function renderInputFor(brief, profiles = AVATAR_PROFILES) {
  const look = profiles.avatars[brief.render.avatar_profile], voice = profiles.voices[brief.render.voice_profile];
  if (!look || !voice) throw new AvatarError('unsupported_config');
  const alpha = brief.render.output.alpha && !!look.alpha;
  return {
    script_text: brief.script.text, provider: 'heygen', provider_avatar_id: look.avatar_id, provider_voice_id: voice.voice_id, engine: look.engine,
    alpha, aspect_ratio: brief.render.output.aspect_ratio, resolution: brief.render.output.resolution, captions: true,
    framing: brief.render.framing, expressiveness: brief.render.expressiveness, motion_direction: brief.render.motion_direction ?? null,
    downgrades: brief.render.output.alpha && !alpha ? ['alpha'] : [],
  };
}

const API = 'https://api.heygen.com';
// The v3 get-video reference's example URLs are all on files.heygen.ai (read 2026-10-04).
// ponytail: confirm the host on the first real response; until then anything else is download_failed.
export const HEYGEN_OUTPUT_HOSTS = ['files.heygen.ai'];
const PENDING = ['pending', 'processing', 'waiting']; // create answers "waiting", which the status enum lacks (§31)

// HTTP status + HeyGen error code -> category (developers.heygen.com/docs/error-codes, re-read 2026-10-04: the
// body is { error: { code, message, param?, doc_url } }). A 5xx or a lost answer to a submit is uncertain: the
// POST may have been accepted and charged.
function categorize(status, code, phase) {
  if (status === 401 || (status === 403 && code !== 'voice_not_usable')) return new AvatarError('not_configured', { code });
  if (status === 402 || code === 'quota_exceeded') return new AvatarError('provider_credits', { code });
  if (status === 429) return new AvatarError('rate_limited', { final: phase !== 'poll', code });
  if (code === 'request_in_progress') return new AvatarError('submission_uncertain', { code });
  if (code === 'content_policy_violation' || code === 'avatar_not_usable') return new AvatarError('rejected_content', { code });
  if (status >= 500) return phase === 'submit' ? new AvatarError('submission_uncertain', { code }) : new AvatarError('provider_failed', { final: false, code });
  if (phase === 'poll' && status === 404) return new AvatarError('provider_failed', { code });
  return new AvatarError('unsupported_config', { code });
}

// Part of the render key (§14): bump it when the adapter changes what a render looks like.
export const HEYGEN_ADAPTER_VERSION = 'heygen-v3:adapter-1';

export class HeyGenAvatarProvider {
  #key;
  constructor(key, transport = fetch, profiles = AVATAR_PROFILES) {
    this.#key = key; this.transport = transport; this.profiles = profiles;
    this.version = HEYGEN_ADAPTER_VERSION;
  }

  capabilities(profileId) {
    const look = this.profiles.avatars[profileId];
    if (!look) throw new AvatarError('unsupported_config');
    // ponytail: from configuration only; AV3 proper reads supported_api_engines from GET /v3/avatars/looks/{id}.
    return { engines: [look.engine], alpha: !!look.alpha, max_seconds: 30, resolutions: ['720p', '1080p'], aspect_ratios: ['16:9', '1:1', '9:16'] };
  }

  // One provider request. A thrown fetch (network, timeout) is null: the caller decides what that means.
  async #send(path, phase, init = {}) {
    const transport = this.transport; // Worker fetch requires the global receiver, not this adapter.
    const headers = { 'X-Api-Key': this.#key, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers };
    let response;
    try { response = await transport(`${API}${path}`, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(20000) }); } catch { return null; }
    if (response.ok) return response.json().catch(() => ({}));
    const body = await response.json().catch(() => null);
    throw categorize(response.status, typeof body?.error?.code === 'string' ? body.error.code.slice(0, 60) : null, phase);
  }

  // input: renderInputFor(...); renderKey: the 64-hex render key (§14), sent as the Idempotency-Key - a second
  // line of defence against a duplicate charge, never a reason to retry.
  async submit(input, renderKey) {
    if (!/^[0-9a-f]{64}$/.test(renderKey || '')) throw new AvatarError('unsupported_config');
    const body = {
      type: 'avatar', avatar_id: input.provider_avatar_id, script: input.script_text, voice_id: input.provider_voice_id,
      engine: { type: input.engine }, output_format: input.alpha ? 'webm' : 'mp4', resolution: input.resolution, aspect_ratio: input.aspect_ratio,
      title: `rh-avatar-${renderKey.slice(0, 12)}`,
      // motion_prompt is rejected for video avatars on Avatar IV; expressiveness is for photo avatars only. A V1
      // stock look sends neither. Captions need no field: "A sidecar subtitle file is always returned via
      // subtitle_url" (create-video reference, re-read 2026-10-04).
      ...(input.engine === 'avatar_v' && input.motion_direction ? { motion_prompt: input.motion_direction } : {}),
    };
    const result = await this.#send('/v3/videos', 'submit', { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': renderKey } });
    const id = result?.data?.video_id;
    if (typeof id !== 'string' || !id) throw new AvatarError('submission_uncertain');
    return { id, provider: 'heygen', engine: input.engine, alpha: input.alpha, submitted_at: Date.now() };
  }

  async poll(ticket) {
    const result = await this.#send(`/v3/videos/${encodeURIComponent(ticket.id)}`, 'poll');
    if (!result) throw new AvatarError('provider_failed', { final: false }); // a lost poll: keep the ticket
    const video = result.data || {};
    if (PENDING.includes(video.status)) return null;
    if (video.status === 'failed') throw new AvatarError('provider_failed', { code: typeof video.failure_code === 'string' ? video.failure_code.slice(0, 60) : null });
    if (video.status !== 'completed') throw new AvatarError('provider_failed', { final: false });
    const url = allowedOutput(video.video_url);
    if (!url) throw new AvatarError('download_failed');
    return {
      videoUrl: url, contentType: ticket.alpha ? 'video/webm' : 'video/mp4', durationSeconds: typeof video.duration === 'number' ? video.duration : null,
      captionsUrl: allowedOutput(video.subtitle_url), provider: 'heygen', generationId: ticket.id, engine: ticket.engine,
    };
  }

  // Delete the provider-side copy once ours is stored (§16). Already gone is fine.
  async remove(ticket) {
    try { await this.#send(`/v3/videos/${encodeURIComponent(ticket.id)}`, 'remove', { method: 'DELETE' }); }
    catch (error) { if (error.code !== 'video_not_found') throw error; }
    return true;
  }
}

function allowedOutput(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && HEYGEN_OUTPUT_HOSTS.includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
