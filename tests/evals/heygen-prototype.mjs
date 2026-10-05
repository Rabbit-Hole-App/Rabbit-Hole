// Avatar Teacher: controlled HeyGen prototypes (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §33.2-§33.4).
// Owner GOs 2026-10-04: discovery; then ONE MP4 generation (heygen-prototype-1); then ONE WebM + SRT caption
// generation (heygen-prototype-2). Each through the real adapter (HeyGenAvatarProvider), $1 hard ceiling per
// generation, $5 total, no automatic retry, temporary local storage only (no R2, no Worker).
// Hand-run, never in CI. HEYGEN_API_KEY is read from the root .env (small-deploy) and never printed or stored.
//   node tests/evals/heygen-prototype.mjs [--job <name>] discover                 balance, public studio looks, English voices
//   node tests/evals/heygen-prototype.mjs [--job <name>] generate <look> <voice> [mp4|webm]   submit once, poll, validate, download, delete
//   node tests/evals/heygen-prototype.mjs [--job <name>] resume                   poll a stored ticket again; never resubmits
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEYGEN_ADAPTER_VERSION, HeyGenAvatarProvider, renderInputFor } from '../../packages/control-plane/src/learn-avatar-provider.js';
import { renderKey, sniffVideoType } from '../../packages/control-plane/src/learn-avatar-cache.js';
import { scriptProblems } from '../../packages/control-plane/src/learn-avatar-brief.js';
import { downloadClip } from '../../packages/control-plane/src/learn-video.js';

const args = process.argv.slice(2);
const jobAt = args.indexOf('--job');
const JOB = jobAt >= 0 ? args.splice(jobAt, 2)[1] : 'heygen-prototype-1';
if (!/^[a-z0-9-]+$/.test(JOB || '')) { console.error('--job takes a plain name'); process.exit(1); }
const here = dirname(fileURLToPath(import.meta.url));
const TMP = join(here, '..', '..', '.claude', 'jobs', JOB, 'tmp', 'avatar'); // gitignored, never committed
const RUN = join(TMP, 'run.json');
mkdirSync(TMP, { recursive: true });

const envFile = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const KEY = envFile.match(/^HEYGEN_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
if (!KEY) { console.error('HEYGEN_API_KEY required in the root .env'); process.exit(1); }

const SCRIPT = 'Welcome to attention. Here, each character looks back at the earlier ones to decide what matters.';
// $ per generated minute on Avatar IV, by the look's avatar_type (owner's current API prices, 2026-10-04).
const RATE = { studio_avatar: 4.83, digital_twin: 4.83, photo_avatar: 2.31 };
const CEILING_USD = 1;
const save = record => writeFileSync(RUN, `${JSON.stringify(record, null, 2)}\n`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// The hostname only: a presigned URL's path and query carry its signature.
const hostOf = value => { try { return new URL(value).hostname; } catch { return value == null ? null : 'invalid'; } };

async function api(path) {
  const response = await fetch(`https://api.heygen.com${path}`, { headers: { 'X-Api-Key': KEY, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GET ${path.split('?')[0]} -> ${response.status} ${body?.error?.code ?? ''} ${body?.error?.message ?? ''}`);
  return body;
}
// Billing fields only: never the username, email or name.
async function balance() {
  const { data = {} } = await api('/v3/users/me');
  return { billing_type: data.billing_type ?? null, wallet: data.wallet ?? null, subscription: data.subscription ? { plan: data.subscription.plan, credits: data.subscription.credits } : null, usage_based: data.usage_based ?? null, at: new Date().toISOString() };
}
async function pages(path, max) {
  const items = [];
  for (let token = null, page = 0; page < max; page++) {
    const { data, has_more, next_token } = await api(`${path}${token ? `&token=${encodeURIComponent(token)}` : ''}`);
    items.push(...data);
    if (!has_more || !next_token) break;
    token = next_token;
  }
  return items;
}
// The provider's own record of a video, reduced to what is safe to keep: hostnames, timings, failure details.
async function detail(id) {
  const { data: video = {} } = await api(`/v3/videos/${encodeURIComponent(id)}`);
  return {
    status: video.status, created_at: video.created_at, completed_at: video.completed_at, render_s: video.completed_at && video.created_at ? video.completed_at - video.created_at : null,
    duration: video.duration, video_host: hostOf(video.video_url), subtitle_host: hostOf(video.subtitle_url), captioned_video_host: hostOf(video.captioned_video_url),
    thumbnail_host: hostOf(video.thumbnail_url), failure_code: video.failure_code ?? null, failure_message: video.failure_message ?? null,
  };
}

async function discover() {
  const before = await balance();
  const looks = await pages('/v3/avatars/looks?ownership=public&avatar_type=studio_avatar&limit=50', 12);
  const voices = await pages('/v3/voices?type=public&language=English&limit=100', 12);
  const after = await balance();
  const record = { before, after, looks: looks.map(({ id, name, avatar_type, gender, tags, default_voice_id, supported_api_engines, preferred_orientation, image_width, image_height, preview_image_url }) => ({ id, name, avatar_type, gender, tags, default_voice_id, supported_api_engines, preferred_orientation, image_width, image_height, preview_image_url })), voices };
  writeFileSync(join(TMP, 'discovery.json'), `${JSON.stringify(record, null, 2)}\n`);
  const voiceName = id => voices.find(voice => voice.voice_id === id);
  const iv = record.looks.filter(look => look.supported_api_engines?.includes('avatar_iv'));
  console.log(`balance before: ${JSON.stringify(before)}\nbalance after:  ${JSON.stringify(after)}`);
  console.log(`${looks.length} public studio looks, ${iv.length} with avatar_iv; ${voices.length} English public voices`);
  for (const look of iv) {
    const voice = voiceName(look.default_voice_id);
    console.log([look.id, look.name, look.gender, look.preferred_orientation, (look.tags || []).join('/'), look.default_voice_id, voice ? `${voice.name} (${voice.gender}, ${voice.default_engine})` : 'voice not in English list'].join(' | '));
  }
}

// MP4 duration from the movie header (mvhd): timescale and duration, version 0 or 1.
function mp4Duration(bytes) {
  const at = Buffer.from(bytes).indexOf('mvhd');
  if (at < 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), v1 = bytes[at + 4] === 1;
  const timescale = view.getUint32(at + (v1 ? 24 : 16));
  return (v1 ? Number(view.getBigUint64(at + 28)) : view.getUint32(at + 20)) / timescale;
}
// WebM duration from the Segment Info: Duration (0x4489, a float in TimecodeScale units; 0x2AD7B1, default 1 ms).
function webmDuration(bytes) {
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, 65536));
  let scale = 1e6;
  const ts = head.indexOf(Buffer.from([0x2a, 0xd7, 0xb1]));
  if (ts >= 0 && head[ts + 3] & 0x80) scale = head.readUIntBE(ts + 4, head[ts + 3] & 0x7f);
  const at = head.indexOf(Buffer.from([0x44, 0x89]));
  if (at < 0) return null;
  const value = head[at + 2] === 0x84 ? head.readFloatBE(at + 3) : head[at + 2] === 0x88 ? head.readDoubleBE(at + 3) : null;
  return value == null ? null : value * scale / 1e9;
}
// SRT cues and how much of the script they carry (words compared without case or punctuation).
function srtCheck(text) {
  const cues = text.replace(/\r/g, '').trim().split(/\n\s*\n/).map(block => block.split('\n')).filter(lines => lines.some(line => line.includes('-->')));
  const timing = /^(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})$/;
  const seconds = (h, m, s, ms) => +h * 3600 + +m * 60 + +s + ms / 1000;
  const parsed = cues.map(lines => { const index = lines.findIndex(line => line.includes('-->')); const match = lines[index].trim().match(timing); return { start: match ? seconds(...match.slice(1, 5)) : null, end: match ? seconds(...match.slice(5, 9)) : null, text: lines.slice(index + 1).join(' ').trim() }; });
  const words = value => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const said = words(parsed.map(cue => cue.text).join(' ')), expected = words(SCRIPT);
  return { cues: parsed.length, well_formed: parsed.every(cue => cue.start != null && cue.end > cue.start), first_start_s: parsed[0]?.start ?? null, last_end_s: parsed.at(-1)?.end ?? null, words_match: said.join(' ') === expected.join(' '), cue_texts: parsed.map(cue => cue.text) };
}

// Poll until done, then validate, download and delete. Never submits.
async function finish(record, provider) {
  const { ticket } = record;
  record.poll_errors ??= 0;
  let result = null;
  while (!result) {
    if (Date.now() - ticket.submitted_at > 30 * 60e3) { record.outcome = 'timeout'; save(record); return record; }
    await sleep(10000);
    try { result = await provider.poll(ticket); } catch (error) {
      if (error.final === false) { record.poll_errors++; continue; } // a lost poll keeps the ticket
      // A provider failure or an unlisted output host (download_failed, code unlisted_host:<hostname>): fail
      // closed, keep the provider copy until the owner rules, and record whether the wallet moved.
      record.outcome = { category: error.category, code: error.code };
      record.provider = await detail(ticket.id).catch(e => ({ error: e.message }));
      record.after = await balance(); save(record); return record;
    }
  }
  record.completed_after_ms = Date.now() - ticket.submitted_at;
  record.provider = await detail(ticket.id);
  record.output = { host: hostOf(result.videoUrl), protocol: new URL(result.videoUrl).protocol, reported_duration_s: result.durationSeconds, captions_allowed: !!result.captionsUrl };
  save(record);
  let bytes;
  try { bytes = await downloadClip(result.videoUrl, { sniffed: true }); } catch (error) { record.outcome = { category: 'download_failed', message: error.message }; save(record); return record; }
  const type = sniffVideoType(bytes), expected = ticket.alpha ? 'video/webm' : 'video/mp4';
  const seconds = type === 'video/mp4' ? mp4Duration(bytes) : type === 'video/webm' ? webmDuration(bytes) : null;
  writeFileSync(join(TMP, `clip.${type === 'video/webm' ? 'webm' : type === 'video/mp4' ? 'mp4' : 'bin'}`), bytes);
  record.validation = {
    sniffed_type: type, expected_type: expected, is_expected_type: type === expected, bytes: bytes.length, container_duration_s: seconds,
    within_ceiling: seconds != null && seconds <= record.max_seconds,
    // A WebM with alpha declares the Matroska AlphaMode element (0x53C0) = 1 on its video track and carries the alpha
    // plane in BlockAdditional data; the decoded pixels are checked separately.
    alpha_mode_element: type === 'video/webm' ? Buffer.from(bytes).indexOf(Buffer.from([0x53, 0xc0, 0x81, 0x01])) >= 0 : null,
  };
  if (result.captionsUrl) {
    try {
      const response = await fetch(result.captionsUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      const text = response.ok ? await response.text() : '';
      record.captions = { status: response.status, content_type: response.headers.get('content-type'), bytes: text.length };
      if (response.ok && text.length < 200000) { writeFileSync(join(TMP, 'captions.srt'), text); Object.assign(record.captions, srtCheck(text)); }
    } catch (error) { record.captions = { error: error.message }; }
  } else record.captions = { subtitle_host: record.provider.subtitle_host, downloaded: false };
  record.after = await balance();
  try { await provider.remove(ticket); record.provider_copy = 'deleted'; } catch (error) { record.provider_copy = { category: error.category, code: error.code }; }
  record.outcome = record.validation.is_expected_type && record.validation.within_ceiling ? 'ok' : 'invalid_output';
  save(record);
  return record;
}

async function generate(lookId, voiceId, format = 'mp4') {
  if (existsSync(RUN) && JSON.parse(readFileSync(RUN, 'utf8')).render_key) throw new Error(`Job ${JOB} already has a run: a prototype never submits twice. Use resume.`);
  if (!lookId || !voiceId || !['mp4', 'webm'].includes(format)) throw new Error('usage: generate <look_id> <voice_id> [mp4|webm]');
  const problems = scriptProblems(SCRIPT, 8);
  if (problems.length) throw new Error(`script: ${problems.join(', ')}`);
  const { data: look } = await api(`/v3/avatars/looks/${encodeURIComponent(lookId)}`);
  if (!look.supported_api_engines?.includes('avatar_iv')) throw new Error(`look ${lookId} does not list avatar_iv`);
  const rate = RATE[look.avatar_type];
  if (!rate) throw new Error(`no price for avatar_type ${look.avatar_type}`);
  const words = SCRIPT.split(/\s+/).length, estimate_s = words / 150 * 60 + 1.5, max_seconds = CEILING_USD / rate * 60;
  if (estimate_s > max_seconds) throw new Error(`estimate ${estimate_s.toFixed(1)} s is over the $${CEILING_USD} ceiling (${max_seconds.toFixed(1)} s)`);
  const before = await balance();
  if (before.wallet?.currency === 'usd' && !(before.wallet.remaining_balance >= CEILING_USD)) throw new Error('the wallet holds less than the per-generation ceiling');

  // alpha on the profile is this experiment's claim to test, not a known capability (§32, interpretation 4).
  const alpha = format === 'webm';
  const profiles = { avatars: { 'rh-teacher-1': { avatar_id: look.id, engine: 'avatar_iv', alpha } }, voices: { 'rh-voice-1': { voice_id: voiceId } } };
  const brief = { script: { text: SCRIPT }, render: { avatar_profile: 'rh-teacher-1', voice_profile: 'rh-voice-1', framing: 'head_shoulders', expressiveness: 'low', output: { alpha, aspect_ratio: '16:9', resolution: '720p' } } };
  const input = renderInputFor(brief, profiles), key = await renderKey(input, HEYGEN_ADAPTER_VERSION);
  // Records what the adapter actually sends (the POST and the DELETE; polls are not listed): method, path,
  // Idempotency-Key and body. Never the X-Api-Key header.
  // The create answer's status and resolved output_format are kept too (get-video has no output_format).
  const requests = [];
  const transport = async (url, init = {}) => {
    const sent = init.method ? { method: init.method, path: new URL(url).pathname, idempotency_key: init.headers?.['Idempotency-Key'] ?? null, body: init.body ? JSON.parse(init.body) : null } : null;
    if (sent) requests.push(sent);
    const response = await fetch(url, init);
    if (sent?.method === 'POST') {
      const answer = await response.clone().json().catch(() => null);
      sent.answer = { http: response.status, status: answer?.data?.status ?? null, output_format: answer?.data?.output_format ?? null, error_code: answer?.error?.code ?? null, error_message: answer?.error?.message ?? null };
    }
    return response;
  };
  const provider = new HeyGenAvatarProvider(KEY, transport, profiles);
  const record = {
    job: JOB, format,
    look: { id: look.id, name: look.name, avatar_type: look.avatar_type, gender: look.gender, supported_api_engines: look.supported_api_engines, preferred_orientation: look.preferred_orientation, default_voice_id: look.default_voice_id },
    voice_id: voiceId, rate_usd_per_min: rate, estimate_s, estimate_usd: estimate_s * rate / 60, max_seconds, render_key: key, adapter: HEYGEN_ADAPTER_VERSION, requests, before,
  };
  save(record); // persisted before the paid POST
  const submitted = Date.now();
  try { record.ticket = await provider.submit(input, key); } catch (error) {
    record.outcome = { phase: 'submit', category: error.category, code: error.code, after_ms: Date.now() - submitted };
    record.after = await balance().catch(e => ({ error: e.message })); save(record); return record;
  }
  record.submit_ms = Date.now() - submitted;
  save(record);
  return finish(record, provider);
}

async function resume() {
  const record = JSON.parse(readFileSync(RUN, 'utf8'));
  if (!record.ticket) throw new Error('no stored ticket');
  return finish(record, new HeyGenAvatarProvider(KEY, fetch, {}));
}

const [mode, ...rest] = args;
const run = { discover, generate: () => generate(...rest), resume }[mode];
if (!run) { console.error('usage: [--job <name>] discover | generate <look_id> <voice_id> [mp4|webm] | resume'); process.exit(1); }
const record = await run();
if (record) console.log(JSON.stringify(record, null, 2));
