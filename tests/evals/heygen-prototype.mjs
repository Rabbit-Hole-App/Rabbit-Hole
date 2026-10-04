// Avatar Teacher: the first controlled HeyGen prototype (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §33.2).
// Owner GO 2026-10-04: discovery, then exactly ONE generation through the real adapter (HeyGenAvatarProvider), $1
// hard ceiling per generation, $5 total, no automatic retry, temporary local storage only (no R2, no Worker).
// Hand-run, never in CI. HEYGEN_API_KEY is read from the root .env (small-deploy) and never printed or stored.
//   node tests/evals/heygen-prototype.mjs discover                    balance, public studio looks, English voices
//   node tests/evals/heygen-prototype.mjs generate <look_id> <voice_id>  submit once, poll, validate, download, delete
//   node tests/evals/heygen-prototype.mjs resume                      poll a stored ticket again; never resubmits
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEYGEN_ADAPTER_VERSION, HeyGenAvatarProvider, renderInputFor } from '../../packages/control-plane/src/learn-avatar-provider.js';
import { renderKey, sniffVideoType } from '../../packages/control-plane/src/learn-avatar-cache.js';
import { scriptProblems } from '../../packages/control-plane/src/learn-avatar-brief.js';
import { downloadClip } from '../../packages/control-plane/src/learn-video.js';

const here = dirname(fileURLToPath(import.meta.url));
const TMP = join(here, '..', '..', '.claude', 'jobs', 'heygen-prototype-1', 'tmp', 'avatar'); // gitignored, never committed
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
      // An unlisted output host lands here (download_failed, code unlisted_host:<hostname>): fail closed, keep
      // the provider copy until the owner rules on the host.
      record.outcome = { category: error.category, code: error.code }; save(record); return record;
    }
  }
  record.completed_after_ms = Date.now() - ticket.submitted_at;
  record.output = { host: new URL(result.videoUrl).hostname, protocol: new URL(result.videoUrl).protocol, reported_duration_s: result.durationSeconds, captions_host: result.captionsUrl ? new URL(result.captionsUrl).hostname : null };
  save(record);
  let bytes;
  try { bytes = await downloadClip(result.videoUrl, { sniffed: true }); } catch (error) { record.outcome = { category: 'download_failed', message: error.message }; save(record); return record; }
  const type = sniffVideoType(bytes), seconds = type === 'video/mp4' ? mp4Duration(bytes) : null;
  writeFileSync(join(TMP, `clip.${type === 'video/mp4' ? 'mp4' : 'bin'}`), bytes);
  record.validation = { sniffed_type: type, is_mp4: type === 'video/mp4', bytes: bytes.length, mvhd_duration_s: seconds, within_ceiling: seconds != null && seconds <= record.max_seconds };
  record.after = await balance();
  try { await provider.remove(ticket); record.provider_copy = 'deleted'; } catch (error) { record.provider_copy = { category: error.category, code: error.code }; }
  record.outcome = record.validation.is_mp4 && record.validation.within_ceiling ? 'ok' : 'invalid_output';
  save(record);
  return record;
}

async function generate(lookId, voiceId) {
  if (existsSync(RUN) && JSON.parse(readFileSync(RUN, 'utf8')).render_key) throw new Error('A run exists: this prototype never submits twice. Use resume.');
  if (!lookId || !voiceId) throw new Error('usage: generate <look_id> <voice_id>');
  const problems = scriptProblems(SCRIPT, 8);
  if (problems.length) throw new Error(`script: ${problems.join(', ')}`);
  const { data: look } = await api(`/v3/avatars/looks/${encodeURIComponent(lookId)}`);
  if (!look.supported_api_engines?.includes('avatar_iv')) throw new Error(`look ${lookId} does not list avatar_iv`);
  const rate = RATE[look.avatar_type];
  if (!rate) throw new Error(`no price for avatar_type ${look.avatar_type}`);
  const words = SCRIPT.split(/\s+/).length, estimate_s = words / 150 * 60 + 1.5, max_seconds = CEILING_USD / rate * 60;
  if (estimate_s > max_seconds) throw new Error(`estimate ${estimate_s.toFixed(1)} s is over the $${CEILING_USD} ceiling (${max_seconds.toFixed(1)} s)`);

  const profiles = { avatars: { 'rh-teacher-1': { avatar_id: look.id, engine: 'avatar_iv', alpha: false } }, voices: { 'rh-voice-1': { voice_id: voiceId } } };
  const brief = { script: { text: SCRIPT }, render: { avatar_profile: 'rh-teacher-1', voice_profile: 'rh-voice-1', framing: 'head_shoulders', expressiveness: 'low', output: { alpha: false, aspect_ratio: '16:9', resolution: '720p' } } };
  const input = renderInputFor(brief, profiles), key = await renderKey(input, HEYGEN_ADAPTER_VERSION);
  // Records what the adapter actually sends (the POST and the DELETE; polls are not listed): method, path,
  // Idempotency-Key and body. Never the X-Api-Key header.
  const requests = [];
  const transport = (url, init = {}) => {
    if (init.method) requests.push({ method: init.method || 'GET', path: new URL(url).pathname, idempotency_key: init.headers?.['Idempotency-Key'] ?? null, body: init.body ? JSON.parse(init.body) : null });
    return fetch(url, init);
  };
  const provider = new HeyGenAvatarProvider(KEY, transport, profiles);
  const record = {
    look: { id: look.id, name: look.name, avatar_type: look.avatar_type, gender: look.gender, supported_api_engines: look.supported_api_engines, preferred_orientation: look.preferred_orientation, default_voice_id: look.default_voice_id },
    voice_id: voiceId, rate_usd_per_min: rate, estimate_s, estimate_usd: estimate_s * rate / 60, max_seconds, render_key: key, adapter: HEYGEN_ADAPTER_VERSION, requests, before: await balance(),
  };
  save(record); // persisted before the paid POST
  const submitted = Date.now();
  try { record.ticket = await provider.submit(input, key); } catch (error) {
    record.outcome = { phase: 'submit', category: error.category, code: error.code, after_ms: Date.now() - submitted }; save(record); return record;
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

const [mode, ...rest] = process.argv.slice(2);
const run = { discover, generate: () => generate(...rest), resume }[mode];
if (!run) { console.error('usage: discover | generate <look_id> <voice_id> | resume'); process.exit(1); }
const record = await run();
if (record) console.log(JSON.stringify({ ...record, requests: record.requests }, null, 2));
