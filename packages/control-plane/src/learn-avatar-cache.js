// Avatar Teacher V1, AV4 groundwork (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §13-§16): the two cache
// keys, the scopes, the LEARN_MEDIA layout and the shared public_course clip store. Neither key ever reads
// learning_goal, visual_value, a learner's identity or the brief's provenance: a canonical clip is
// moment x concept x course. The store reuses the LearnVideos job pattern and its shared download and serve
// helpers (learn-video.js): persist before submit, one generating job, alarm polling, never resubmit.
// ponytail: not bound or routed yet - the LEARN_AVATAR_CLIPS binding, its new_sqlite_classes migration and the
// /api/learn/avatar routes land with the AV4 deploy GO (the wrangler configs are infrastructure's). Personalized
// (learner-scope) clips are deferred (§32), so the store refuses them.
import { authorizedBoardApp } from './learn-board.js';
import { paidRefusal } from './learn-paid.js';
import { learnMedia } from './learn-storage.js';
import { downloadClip, serveClip } from './learn-video.js';
import { AvatarError, HEYGEN_ADAPTER_VERSION, avatarProvider, renderInputFor } from './learn-avatar-provider.js';
import { BRIEF_VERSION, DEFAULT_SECONDS, DIRECTOR_PROMPT_VERSION, briefSlotId, directorInput, prepareScript, validateBrief } from './learn-avatar-brief.js';
import { CLAIMS, CONCEPTS, SLICE_CARDS, cardModule, claimsOfConcept, targetClaims } from '../../web/src/learn-tutor-claims.js';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
// Hex SHA-256, the same form as LearnVideos keys (learn-video-schema.js videoCacheKey; the asset GET takes 64 hex).
const sha256 = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
export const AVATAR_REGISTRY = { concepts: Object.keys(CONCEPTS), cards: SLICE_CARDS };

// V1 has one public course: the Tutor's nanoGPT slice at the pinned revision. The pin is nanoSourceVersion in
// web nanogpt-lesson.js, which only Vite can import; test/learn-avatar.test.js keeps the two equal.
export const V1_COURSE = 'karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291';
// One Durable Object instance per scope (§14: idFromName(["avatar", scope])).
export const scopeName = scope => JSON.stringify(['avatar', scope.kind, scope.course ?? null]);
export const VIDEO_TYPES = Object.freeze({ 'video/webm': 'webm', 'video/mp4': 'mp4' });

// One canonical slot, grounded in the Tutor registry (§5.1 allowed inputs): per concept, the card that teaches it -
// its label, title, learning question and claims (cited as the card's ref) and up to 3 pinned code source notes.
// moment x concept x to_concept, as the Tutor names a slot (avatarSlotId). A Rabbit Hole return (owner, 2026-10-04)
// is concept = the child hole's concept -> to_concept = the parent concept: the brief's from_concept and
// current_concept, so the script-slot key carries both sides. Returns { slot, authored }: the brief's fields
// before its script, and the Director's authored content.
export function canonicalRequest({ moment, concept, to_concept = null, duration_seconds = DEFAULT_SECONDS }) {
  const lc = moment === 'rabbit_hole_return' ? { current_concept: to_concept, from_concept: concept }
    : moment === 'transition' ? { current_concept: concept, next_concept: to_concept } : { current_concept: concept };
  const ids = [lc.from_concept, lc.current_concept, lc.next_concept].filter(id => id != null);
  if (!ids.length || ids.some(id => !CONCEPTS[id]) || ((moment === 'rabbit_hole_return' || moment === 'transition') && ids.length < 2)) throw new Error('Unknown or missing concept');
  const authored = {}, source_refs = [];
  ids.forEach((id, i) => {
    const card = SLICE_CARDS.find(cardId => targetClaims({ card_id: cardId }).some(claim => CLAIMS[claim].concept === id));
    const module = cardModule(card), ref = `C${i + 1}`;
    source_refs.push({ id: ref, kind: 'card', card_id: card });
    const sources = (module.sources || []).filter(source => source.kind === 'code' && source.path && source.lines?.length === 2).slice(0, 3).map(source => {
      const sourceId = `S${source_refs.length}`;
      source_refs.push({ id: sourceId, kind: 'code', repository: source.repo, commit: source.revision, path: source.path, start_line: source.lines[0], end_line: source.lines[1] });
      return { id: sourceId, note: source.note };
    });
    authored[id] = { ref, label: CONCEPTS[id].label, title: module.scene.title, learning_question: module.evidence.learningQuestion, claims: claimsOfConcept(id).map(claim => CLAIMS[claim].statement), sources };
  });
  const slot = {
    brief_version: BRIEF_VERSION, prompt_spec_version: DIRECTOR_PROMPT_VERSION, purpose: moment, origin: 'product',
    scope: { kind: 'public_course', course: V1_COURSE }, learner_context: { ...lc, personalization: 'none' }, source_refs, duration_seconds,
  };
  return { slot, authored };
}
// The Director input of a canonical slot.
export const canonicalInput = ({ slot, authored }) => directorInput({
  purpose: slot.purpose, scope: slot.scope, duration_seconds: slot.duration_seconds, authored,
  concepts: { current: slot.learner_context.current_concept, next: slot.learner_context.next_concept, from: slot.learner_context.from_concept },
});

const SOURCE_FIELDS = ['id', 'kind', 'card_id', 'repository', 'commit', 'path', 'start_line', 'end_line'];
// Level 1 (§14): the approved script for a slot. slot: a brief's fields before its script exists. Two learners
// at the same canonical moment share one script, so they share one render.
export async function scriptSlotKey(slot) {
  const lc = slot.learner_context;
  return sha256(JSON.stringify([
    slot.brief_version, slot.prompt_spec_version, slot.scope, slot.purpose,
    lc.current_concept, lc.next_concept ?? null, lc.from_concept ?? null,
    slot.source_refs.map(ref => SOURCE_FIELDS.map(field => ref[field] ?? null)),
    slot.duration_seconds, lc.personalization, [...(lc.session_concepts || [])].sort(),
  ]));
}

// Level 2 (§14): the clip. input is renderInputFor(...): provider ids already resolved server-side.
export async function renderKey(input, adapterVersion) {
  return sha256(JSON.stringify([
    input.script_text, input.provider, input.provider_avatar_id, input.provider_voice_id, input.engine, input.alpha,
    input.aspect_ratio, input.resolution, input.framing, input.expressiveness, input.motion_direction ?? null, input.captions, adapterVersion,
  ]));
}

// learn-avatar/<scope hash>/<render key>.<webm|mp4> in LEARN_MEDIA (learnMedia(env)), with the clip's real type.
export async function avatarObjectKey(scope, key, contentType) {
  const ext = VIDEO_TYPES[contentType];
  if (!ext) throw new AvatarError('download_failed');
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Not a render key');
  if (scope?.kind !== 'public_course') throw new Error('Personalized teacher clips are not available yet');
  return `learn-avatar/${await sha256(JSON.stringify(['public_course', scope.course]))}/${key}.${ext}`;
}

// The real content type, from the bytes (§13: LearnVideos assumed MP4). Anything else is not a clip.
export function sniffVideoType(bytes) {
  if (bytes?.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm'; // EBML
  if (bytes?.length > 8 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp') return 'video/mp4';
  return null;
}

// One line per job state change (§16): ids, kinds and timings - never the script, a provider body or a key.
const logJob = (job, extra = {}) => console.log(JSON.stringify({
  event: 'learn_avatar', kind: 'job', render_key_prefix: job.key.slice(0, 12), scope_kind: job.scope.kind, purpose: job.purpose,
  provider: job.provider, engine: job.input.engine, status: job.status, category: job.category ?? null, ms: Date.now() - job.startedAt, cache_hit: false, ...extra,
}));
const view = (job, cacheHit = false) => ({
  render_key: job.key, slot: job.slot, status: job.status, cache_hit: cacheHit, retryable: !job.uncertain,
  ...(job.error ? { error: job.error, category: job.category } : {}), content_type: job.contentType ?? null, downgrades: job.input.downgrades,
});

const POLL_MS = 10000;
const MAX_WAIT_MS = 30 * 60 * 1000;

// The shared clip store of one scope (§14): canonical product content that Rabbit Hole prepares once per slot and
// every learner reuses. Learners only read from it (avatarClipFetch); script, approve and render are owner-run.
//   GET            the ready list the Tutor's resource stage reads: [{ slot, render_key, ... }]
//   GET ?asset=K   the stored clip, served with its own content type
//   POST script    { moment, concept, to_concept?, duration_seconds? } -> the slot's script, written from the
//                  registry (canonicalRequest) by prepareScript; a cached slot makes no model call
//   POST approve   { script_key } -> the owner approves the slot's script (§14)
//   POST render    { brief, confirmed: true } -> the clip; a ready render key makes no provider call
export class LearnAvatarClips {
  // deps is for tests only; the runtime passes state and env. { transport, profiles, director(request), reviewer(request) }.
  constructor(state, env, deps = {}) { this.state = state; this.env = env; this.deps = deps; }

  async fetch(req) {
    if (req.method === 'GET') {
      const key = new URL(req.url).searchParams.get('asset');
      if (key == null) return json({ clips: [...(await this.state.storage.list({ prefix: 'ready:' })).values()] });
      if (!/^[a-f0-9]{64}$/.test(key)) return json({ error: 'Invalid asset' }, 400);
      const job = await this.state.storage.get(`job:${key}`);
      if (job?.status !== 'ready') return json({ error: 'Video not ready' }, 404);
      return serveClip(this.env, job, req);
    }
    // Serialized like LearnVideos, so two concurrent misses for one clip submit once.
    return this.state.blockConcurrencyWhile(async () => {
      try {
        const raw = await req.text();
        if (raw.length > 20000) return json({ error: 'Request too large' }, 413);
        const body = JSON.parse(raw);
        if (body.action === 'script') return json(await this.script(body));
        if (body.action === 'approve') return json(await this.approve(body));
        if (body.action !== 'render') return json({ error: 'Unknown action' }, 400);
        // Every submission passes the one paid gate (§15), the owner's product clips included.
        const refused = paidRefusal(body); if (refused) return refused;
        return await this.render(body);
      } catch (error) {
        return json({ error: error.message, ...(error.category ? { category: error.category } : {}) }, error.category ? 422 : 400);
      }
    });
  }

  // The authored content comes from the registry here, never from the caller.
  async script({ moment, concept, to_concept, duration_seconds }) {
    const request = canonicalRequest({ moment, concept, to_concept, duration_seconds });
    const key = await scriptSlotKey(request.slot);
    const cached = await this.state.storage.get(`slot:${key}`);
    if (cached) return { script_key: key, ...cached, cached: true };
    // ponytail: only the hand-run eval (tests/evals/avatar-director.mjs) calls the models today; the store's route
    // GO wires loggedModel('avatar_director' / 'avatar_script_reviewer', anthropic) here.
    if (!this.deps.director || !this.deps.reviewer) throw new Error('The Avatar Director is not enabled');
    const out = await prepareScript(this.deps, canonicalInput(request));
    if (out.status !== 'ok') return { script_key: key, status: 'failed', stage: out.stage, errors: out.errors ?? out.blocking.map(finding => finding.category) };
    const record = { script: out.script, teaching_goal: out.teaching_goal, approved: false };
    await this.state.storage.put(`slot:${key}`, record);
    return { script_key: key, ...record, cached: false };
  }

  async approve({ script_key }) {
    const record = await this.state.storage.get(`slot:${script_key}`);
    if (!record) throw new Error('No script for this slot');
    await this.state.storage.put(`slot:${script_key}`, { ...record, approved: true });
    return { script_key, approved: true };
  }

  async render(body) {
    const brief = validateBrief(body.brief, AVATAR_REGISTRY);
    if (brief.scope.kind !== 'public_course') throw new Error('Personalized teacher clips are not available yet');
    const slot = await this.state.storage.get(`slot:${await scriptSlotKey(brief)}`);
    if (!slot?.approved || slot.script.text !== brief.script.text) throw new Error("Approve this slot's script first");
    const input = renderInputFor(brief, this.deps.profiles);
    const key = await renderKey(input, HEYGEN_ADAPTER_VERSION);
    let job = await this.state.storage.get(`job:${key}`);
    if (job?.status === 'ready') return json(view(job, true)); // cached: no generation, no cost
    if (!job || (body.retry === true && job.status === 'failed' && !job.uncertain)) {
      const all = await this.state.storage.list({ prefix: 'job:' });
      if ([...all.values()].some(other => other.status === 'generating')) return json({ error: 'One teacher clip is already generating. Wait for it before requesting another.' }, 409);
      const provider = avatarProvider(this.env, this.deps); // not_configured without the provider and its key
      job = { key, slot: briefSlotId(brief), purpose: brief.purpose, scope: brief.scope, duration_seconds: brief.duration_seconds, input, status: 'generating', startedAt: Date.now(), provider: 'heygen' };
      // Persist before submitting. Never automatically repeat a potentially charged POST (§8).
      await this.state.storage.put(`job:${key}`, job);
      await this.state.storage.setAlarm(Date.now() + POLL_MS);
      try { job.ticket = await provider.submit(input, key); }
      catch (error) {
        job.category = error instanceof AvatarError ? error.category : 'submission_uncertain';
        // A refusal the provider stated (credits, 429, policy, configuration) was not accepted; anything else may have been.
        Object.assign(job, { status: 'failed', uncertain: job.category === 'submission_uncertain', error: new AvatarError(job.category).message });
      }
      await this.state.storage.put(`job:${key}`, job);
      logJob(job);
    } else if (body.retry === true && job.uncertain) {
      return json({ error: job.error }, 409);
    }
    return json(view(job), 202);
  }

  async alarm() {
    // A finished clip is stored only in LEARN_MEDIA, never a fallback bucket (dev-prod-write-barrier.md).
    if (!this.env.LEARN_MEDIA) throw new Error('LEARN_MEDIA is not bound on this worker');
    const jobs = await this.state.storage.list({ prefix: 'job:' });
    for (const [name, job] of jobs) {
      if (job.status !== 'generating') continue;
      // A crash after POST but before storing its ticket cannot safely be retried.
      if (!job.ticket) Object.assign(job, { status: 'failed', uncertain: true, category: 'submission_uncertain', error: new AvatarError('submission_uncertain').message });
      else {
        try {
          const provider = avatarProvider(this.env, this.deps);
          const result = await provider.poll(job.ticket);
          if (result) {
            const bytes = await downloadClip(result.videoUrl);
            const contentType = sniffVideoType(bytes);
            if (!contentType) throw new AvatarError('download_failed');
            job.storageKey = await avatarObjectKey(job.scope, job.key, contentType);
            await learnMedia(this.env).put(job.storageKey, bytes, { httpMetadata: { contentType } });
            // Never the provider URL: it expires, and our copy is the clip from now on.
            Object.assign(job, { status: 'ready', contentType, result: { provider: result.provider, generationId: result.generationId, engine: result.engine, durationSeconds: result.durationSeconds } });
            await this.state.storage.put(`ready:${job.slot}`, { slot: job.slot, render_key: job.key, purpose: job.purpose, duration_seconds: Math.round(result.durationSeconds ?? job.duration_seconds), content_type: contentType, alpha: job.input.alpha });
            // Our copy is stored: delete the provider's (§16). A failed delete is recorded, never retried here.
            try { await provider.remove(job.ticket); } catch { job.provider_copy = 'kept'; }
          } else if (Date.now() - job.startedAt > MAX_WAIT_MS) throw new AvatarError('timeout');
        } catch (error) {
          // Transient polling and download errors keep the ticket: no paid resubmission. Once a ticket exists,
          // only the provider's own "failed" makes a retry safe; anything else may already have been charged.
          if ((error instanceof AvatarError && error.final) || Date.now() - job.startedAt > MAX_WAIT_MS) {
            const category = error instanceof AvatarError ? error.category : 'timeout';
            Object.assign(job, { status: 'failed', category, uncertain: category !== 'provider_failed', error: new AvatarError(category).message });
          }
        }
      }
      await this.state.storage.put(name, job);
      if (job.status !== 'generating') logJob(job);
    }
    if ([...(await this.state.storage.list({ prefix: 'job:' })).values()].some(job => job.status === 'generating')) await this.state.storage.setAlarm(Date.now() + POLL_MS);
  }
}

// The scope-checked read route (§14 "Playback"): any signed-in learner reads the public course's ready list and
// clips; there is no learner write path to the shared store. ?course= must be the V1 course.
export async function avatarClipFetch(req, env, { authorize = authorizedBoardApp } = {}) {
  if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
  const url = new URL(req.url);
  if (url.searchParams.get('course') !== V1_COURSE) return json({ error: 'Unknown course' }, 404);
  if (url.searchParams.has('workspace')) {
    const headers = new Headers(req.headers); headers.set('x-small-workspace', url.searchParams.get('workspace'));
    req = new Request(req, { headers });
  }
  const app = await authorize(req, env, url.searchParams.get('app'));
  if (app instanceof Response) return app;
  if (!app.email) return json({ error: 'Sign in first' }, 401);
  const binding = env.LEARN_AVATAR_CLIPS;
  if (!binding) return json({ error: new AvatarError('not_configured').message }, 503);
  return binding.get(binding.idFromName(scopeName({ kind: 'public_course', course: V1_COURSE }))).fetch(req);
}
