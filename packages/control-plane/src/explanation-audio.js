// The spoken add-on of an /explain card (owner decisions 2026-11-17; docs/features/explain.md "Card audio"). Two routes, each its own paid step:
//
//   POST /api/learn/explanation-audio/script { app, id, title, body, more?, depth, question? }
//        -> { script, transcript, seconds_estimate, scriptBy: { provider, model } } or { script: null, outcome, reason }   (still 200: the card is unaffected)
//        Called once by the canvas when a new card is delivered (never before the card is shown). ONE model call on the written /explain chain's google-low profile: Gemini Flash Lite, then
//        Fireworks gpt-oss-120b when it fails (explanation-models.js). The prompt and the deterministic number check are explanation-audio-script.js. No verifier, no retry.
//   POST /api/learn/explanation-audio/voice { app, id, script, confirmed: true }
//        -> { narration: { status: 'ready', fileRef, seconds, provider, model, voiceId } } or { narration: { status: 'error', failed: 'audio', code, reason } }
//        Called on the learner's first Play. ElevenLabs Flash v2.5 speaks the SCRIPT (never the transcript); the mp3 is kept as a file source of the board's owner (the way EXP-13 keeps a
//        picture), so the owner, and anyone the board is shared with, play it through the same file route. The same script on the same card is made once: a second call returns the kept file.
//
// The server never writes a board (canvas content is browser-only): the client lands the answer on the card as block.narration (web/src/explanation-audio.js). A generation failure is an
// answer ({ status: 'error' }), never an error thrown into the card. Access: the signed-in owner of the canvas, as /api/learn/artifact (authorizedBoardApp, then the subscription owner
// rule); a visitor on a shared page has no route to either call. Money: the script is platform-funded work the learner did not press for (usage feature explanation_script, recorded, never
// charged); the voice is the learner's own Play (explanation_audio, charged) behind the paid confirmation and elevenSpendTransport. Per-user hour and day caps (admitUsage) count each real call.
// Logs carry counts and outcomes only, never card text.
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { spendTransport } from './learn-spend.js';
import { CHAIN_ENDPOINTS, anthropicReply } from './explanation-fast-chain.js';
import { chainSteps, resolveExplanationProfile } from './explanation-models.js';
import { ELEVEN_MODEL, elevenSpendTransport, isPaidSpendReply } from './learn-paid-transport.js';
import { priceUsage } from './pricing-registry.js';
import { paidRefusal } from './learn-paid.js';
import { NO_CAP, admitUsage, limitsFrom } from './learn-shared-ask.js';
import { learnMedia } from './learn-storage.js';
import { validDepth, DEFAULT_DEPTH } from './chat-depth.js';
import { cardDataNumbers, cardNumbers, reaskMessage, scriptSystem, scriptUser, secondsEstimate, splitCard, stripUnsafe, verdict, wordCount } from './explanation-audio-script.js';

export const SCRIPT_PATH = '/api/learn/explanation-audio/script', VOICE_PATH = '/api/learn/explanation-audio/voice';
export const audioRoute = path => path === SCRIPT_PATH || path === VOICE_PATH;
export const SCRIPT_PROFILE = 'google-low'; // the production written /explain profile: Gemini Flash Lite, Fireworks as the fallback
export const SCRIPT_MAX_TOKENS = 3000; // two strings of up to about 400 words (about 550 tokens each) and the model's own reasoning
export const SCRIPT_DEADLINE_MS = 25000; // off the card's critical path, so longer than the chain's 8 and 12 s
export const VOICE_ID = 'cgSgspJ2msm6clMCkdW9'; // Jessica (female), chosen in AUD-2
export const VOICE_SETTINGS = Object.freeze({ stability: 0.4, similarity_boost: 0.75, speed: 1.1 }); // a little more energetic and faster (owner); Flash v2.5 takes no style or speaker boost
export const VOICE_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`;
export const VOICE_TIMEOUT_MS = 90000;
export const VOICE_MAX_CHARS = 4000, VOICE_MAX_BYTES = 8 * 1024 * 1024;
export const AUDIO_BITRATE = 64000; // mp3_44100_64 is constant 64 kbps: the length is its bytes
export const AUDIO_LIMITS = { EXPLANATION_SCRIPT_HOUR: 60, EXPLANATION_SCRIPT_DAY: 200, EXPLANATION_AUDIO_HOUR: 30, EXPLANATION_AUDIO_DAY: 100 }; // launch protection, not product policy; a worker var of the same name overrides one
const BODY_CHARS = 9000, MORE_CHARS = 6000;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const SCHEMA = { type: 'object', additionalProperties: false, required: ['script', 'transcript'], properties: { script: { type: 'string' }, transcript: { type: 'string' } } };
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// ---- the script ----
export function scriptRequest(step, input) {
  const family = step.provider === 'google' ? 'gemini' : 'standard';
  return { model: step.model, stream: false, max_tokens: SCRIPT_MAX_TOKENS, reasoning_effort: 'low', ...(step.provider === 'google' ? {} : { temperature: 0.4 }),
    messages: [{ role: 'system', content: scriptSystem(input.depth, family) }, { role: 'user', content: scriptUser(input) }],
    response_format: { type: 'json_schema', json_schema: { name: 'audio_script', strict: true, schema: SCHEMA } } };
}

// One model call on one step. -> { content } (the model's JSON text) or { outcome }.
async function askStep(env, step, request, org, identity) {
  const { url } = CHAIN_ENDPOINTS[step.provider];
  let seen = null;
  try {
    const response = await spendTransport(env, request, step.model, org, async () => {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), SCRIPT_DEADLINE_MS);
      try {
        const sent = await fetch(url, { method: 'POST', signal: abort.signal, headers: { Authorization: `Bearer ${env[step.credentialRef]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        if (!sent.ok) return sent;
        const reply = await sent.json();
        seen = reply?.choices?.[0]?.message?.content;
        const { model, usage } = anthropicReply(reply, 'script');
        return Response.json({ model, usage });
      } finally { clearTimeout(timer); }
    }, { provider: step.provider, category: 'explanation_script', ...identity });
    if (!response.ok) return { outcome: (await response.clone().json().catch(() => null))?.code || `http_${response.status}` }; // our own admission refusals carry a code
    return { content: seen };
  } catch (error) { return { outcome: error?.name === 'AbortError' ? 'timeout' : 'error' }; }
}
// The model's JSON -> { rawWords, kept } with the number check applied, or null when it is unreadable or empty.
function readScript(content, input) {
  let parsed = null;
  try { parsed = JSON.parse(content); } catch { /* an unreadable answer is a failed step */ }
  if (typeof parsed?.script !== 'string' || !parsed.script.trim()) return null;
  return { rawWords: wordCount(parsed.script), kept: stripUnsafe(parsed.script, typeof parsed.transcript === 'string' ? parsed.transcript : '', input.allowed) };
}
// The voice's cost in AI units, from the registry row (rounded up): what the first Play's confirmation shows. null when it cannot be priced.
export const voiceCredits = script => { const price = priceUsage({ provider: 'elevenlabs', model: ELEVEN_MODEL, quantities: { input_chars: script.length } }); return price ? Math.ceil(price.micros / 10_000) : null; };

// -> { script, transcript, seconds_estimate, scriptBy, removed, check } or { script: null, outcome, check }. input: { depth, question, title, prose, labels, allowed, cardData } already checked.
// The kept script must pass the floor and speak one of the card's numbers (verdict). One call to a step that fails them is followed by ONE bounded re-ask to the same model with the first
// answer and a user turn naming the failed rule(s) (owner 2026-11-17, superseding "no model retry in v1"); still failing after it, the script is an error, never short audio.
export async function writeScript(env, input, org, identity = {}) {
  const steps = chainSteps(resolveExplanationProfile(SCRIPT_PROFILE).roles.author).filter(step => env[step.credentialRef]);
  let outcome = 'no_credential', reasked = false;
  for (const step of steps) {
    const request = scriptRequest(step, input), by = { provider: step.provider, model: step.model };
    const first = await askStep(env, step, request, org, identity);
    if (first.outcome) { outcome = first.outcome; continue; }
    let read = readScript(first.content, input);
    if (!read) { outcome = 'empty'; continue; }
    const before = { firstRawWords: read.rawWords, firstStrippedWords: wordCount(read.kept.script) };
    let check = verdict(read.kept.script, input.depth, input.cardData);
    const firstFailed = check.failed;
    if (check.failed.length && !reasked) {
      reasked = true;
      const again = await askStep(env, step, { ...request, messages: [...request.messages, { role: 'assistant', content: first.content }, { role: 'user', content: reaskMessage(check, input.depth, input.cardData) }] }, org, identity);
      if (again.outcome) { outcome = again.outcome; continue; }
      read = readScript(again.content, input);
      if (!read) { outcome = 'empty'; continue; }
      check = verdict(read.kept.script, input.depth, input.cardData);
    }
    const info = { reasked, ...before, ...(reasked ? { firstFailed } : {}), rawWords: read.rawWords, strippedWords: check.words, failed: check.failed };
    if (check.failed.length) return { script: null, outcome: check.failed.includes('floor') ? 'too_short' : 'no_card_number', removed: read.kept.removed, scriptBy: by, check: info };
    // The window shows the script's own words when the model sent no transcript, or one the check emptied.
    return { script: read.kept.script, transcript: read.kept.transcript || read.kept.script, seconds_estimate: secondsEstimate(read.kept.script), scriptBy: by, removed: read.kept.removed, check: info };
  }
  return { script: null, outcome };
}

// One script per card (the summary route's rule): kept in this isolate, and two requests in flight for one card share one call. shortcut: another isolate or a restart asks again; the client asks once per new card.
const memo = new Map(), pending = new Map(), MEMO_MAX = 300;
const keyOf = (org, app, id) => `${org}|${app}|${id}`;

// ---- the voice ----
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))].map(n => n.toString(16).padStart(2, '0')).join('');
export const secondsOf = bytes => Math.round((bytes * 8) / AUDIO_BITRATE);
const fileRefOf = (source, sha256, name, size) => ({ v: 1, source: { id: source, rev: sha256 }, meta: { name, type: 'audio/mpeg', size } });
const readyNarration = (source, sha256, name, bytes) => ({ status: 'ready', fileRef: fileRefOf(source, sha256, name, bytes), seconds: secondsOf(bytes), provider: 'elevenlabs', model: ELEVEN_MODEL, voiceId: VOICE_ID });
const failed = (code, reason) => ({ status: 'error', failed: 'audio', code, reason });

// The board's owner, whose file source the audio is (the same mechanism as learn-artifact.js store() for a card's pictures). null: no owner or no board to keep it for.
async function boardStore(req, env, app, board = 'main') {
  const { boardOwner, ownerRow } = await import('./learn-boards.js');
  const owner = await boardOwner(req, env, app);
  if (owner instanceof Response || !owner?.org || !owner?.email) return null;
  const row = await ownerRow(env, owner, app, board).catch(() => null);
  return { org: owner.org, email: owner.email, app, boardId: row?.id ?? null };
}

async function makeVoice(env, store, id, script, sourceId) {
  const db = env.LEARN_DB;
  let response;
  try {
    response = await elevenSpendTransport(env, script, () => fetch(VOICE_URL, { method: 'POST', signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: script, model_id: ELEVEN_MODEL, voice_settings: VOICE_SETTINGS }) }));
  } catch (error) { return failed(error?.name === 'TimeoutError' ? 'timeout' : 'provider_error', 'The voice took too long to make. Try again.'); }
  if (isPaidSpendReply(response)) return failed('spend_refused', (await response.clone().json().catch(() => null))?.error || 'This could not be made right now.');
  if (!response.ok) return failed(`http_${response.status}`, 'The voice could not be made right now. Try again.');
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { return failed('body_lost', 'The voice could not be made right now. Try again.'); }
  if (!bytes.length || bytes.length > VOICE_MAX_BYTES) return failed('invalid_audio', 'The voice could not be made right now. Try again.');
  const sha256 = await sha(bytes), r2Key = `file-sources/${sourceId}/original/${sha256}`, name = 'explanation-audio.mp3', now = Date.now();
  try {
    await learnMedia(env).put(r2Key, bytes, { httpMetadata: { contentType: 'audio/mpeg' }, sha256, customMetadata: { explanationAudio: id } });
    await db.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, ?, ?, ?, ?, 'audio', ?, 'audio/mpeg', 'audio/mpeg', ?, ?, ?, 'stored', ?, ?) ON CONFLICT (id) DO NOTHING")
      .bind(sourceId, store.org, store.email, store.app, store.boardId ?? null, name, bytes.length, sha256, r2Key, now, now).run();
  } catch { return failed('not_stored', 'The voice could not be saved. Try again.'); }
  return readyNarration(sourceId, sha256, name, bytes.length);
}
const pendingVoice = new Map();

// ---- the routes ----
export async function explanationAudioRoute(path, req, env, deps = {}) {
  if (!audioRoute(path)) return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 4 * (BODY_CHARS + MORE_CHARS)) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.app !== 'string' || typeof body.id !== 'string' || !SAFE_ID.test(body.id)) throw new Error('Invalid request');
  } catch { return json({ error: 'Invalid request' }, 400); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  const subscription = subscriptionOwnerRefusal(env, access);
  if (subscription) return subscription;
  if (path === VOICE_PATH) { const refused = paidRefusal(body); if (refused) return refused; } // the learner's Play is the confirmation
  return path === SCRIPT_PATH ? scriptRoute(env, body, access) : voiceRoute(req, env, body, access, deps);
}

// A per-user hour and day cap counted when a real call is about to be made (the explore find pattern). null: admitted.
async function limited(env, category, prefix, access) {
  if (!env.LEARN_DB) return null; // the spend admission still fails closed without it
  const caps = limitsFrom(AUDIO_LIMITS, env);
  const over = await admitUsage(env.LEARN_DB, { category, viewer: access.email, shareKey: '', boardId: '', owner: '', viewerHour: caps[`${prefix}_HOUR`], viewerDay: caps[`${prefix}_DAY`], shareHour: NO_CAP, shareDay: NO_CAP });
  return over ? json({ error: 'You have made a lot of audio in a short time. Try again later.', code: 'rate_limited' }, 429) : null;
}

async function scriptRoute(env, body, access) {
  const bad = () => json({ error: 'Invalid request' }, 400);
  if (Object.keys(body).some(key => !['app', 'id', 'title', 'body', 'more', 'depth', 'question'].includes(key)) || typeof body.title !== 'string' || body.title.length > 300 || typeof body.body !== 'string' || !body.body.trim() || body.body.length > BODY_CHARS
    || (body.more !== undefined && (typeof body.more !== 'string' || body.more.length > MORE_CHARS)) || (body.question !== undefined && (typeof body.question !== 'string' || body.question.length > 1000))
    || (body.depth !== undefined && !validDepth(body.depth))) return bad();
  const started = Date.now(), key = keyOf(access.org, body.app, body.id), log = (outcome, extra = {}) => console.log(JSON.stringify({ event: 'explanation_audio', step: 'script', ms: Date.now() - started, outcome, ...extra }));
  const earlier = memo.get(key);
  if (earlier) { log('stored', { words: wordCount(earlier.script) }); return json(earlier); }
  const card = splitCard(`${body.body}${body.more ? `\n\n${body.more}` : ''}`);
  if (!card.prose) return bad();
  // The check and the set are one synchronous step, so two requests for one card share one call (and one cap count).
  if (!pending.has(key)) {
    const input = { depth: validDepth(body.depth) || DEFAULT_DEPTH, question: body.question || '', title: body.title, prose: card.prose, labels: card.labels, allowed: cardNumbers(card.prose, card.visualText, body.title, body.question), cardData: cardDataNumbers(card.prose, card.visualText, body.title, body.question) };
    pending.set(key, (async () => (await limited(env, 'explanation_script', 'EXPLANATION_SCRIPT', access)) || writeScript(env, input, access.org, { userId: access.user_id || access.email }))().finally(() => pending.delete(key)));
  }
  const done = await pending.get(key);
  if (done instanceof Response) return done.clone();
  if (!done.script) { log(done.outcome, { removed: done.removed ?? 0, ...(done.check ?? {}) }); return json({ script: null, outcome: done.outcome, reason: 'The audio script could not be made. Try again.', ...(done.check ? { check: done.check } : {}) }); }
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  const answer = { script: done.script, transcript: done.transcript, seconds_estimate: done.seconds_estimate, scriptBy: done.scriptBy, voice_estimate_credits: voiceCredits(done.script), check: done.check };
  memo.set(key, answer);
  log('ok', { provider: done.scriptBy.provider, words: wordCount(done.script), removed: done.removed, ...done.check });
  return json(answer);
}

async function voiceRoute(req, env, body, access, deps) {
  if (Object.keys(body).some(key => !['app', 'id', 'script', 'confirmed', 'board'].includes(key)) || typeof body.script !== 'string' || !body.script.trim() || body.script.length > VOICE_MAX_CHARS
    || (body.board !== undefined && (typeof body.board !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.board)))) return json({ error: 'Invalid request' }, 400);
  const started = Date.now(), script = body.script.trim(), log = (outcome, extra = {}) => console.log(JSON.stringify({ event: 'explanation_audio', step: 'voice', ms: Date.now() - started, chars: script.length, outcome, ...extra }));
  const answer = narration => json({ narration });
  if (!env.ELEVENLABS_API_KEY) { log('not_configured'); return answer(failed('not_configured', 'Audio is not set up on this server yet.')); }
  const store = await (deps.store || boardStore)(req, env, body.app, body.board);
  if (!store || !env.LEARN_DB || !learnMedia(env)) { log('no_storage'); return answer(failed('no_storage', 'The voice could not be saved here.')); }
  // One file per card and script: a second call finds it and spends nothing.
  const sourceId = `fs_${(await sha(`explanation-audio:${store.org}:${store.app}:${body.id}:${await sha(script)}`)).slice(0, 24)}`;
  const kept = await env.LEARN_DB.prepare("SELECT id, bytes, sha256, name FROM file_sources WHERE id = ? AND status = 'stored'").bind(sourceId).first().catch(() => null);
  if (kept) { log('stored'); return answer(readyNarration(kept.id, kept.sha256, kept.name, kept.bytes)); }
  if (!pendingVoice.has(sourceId)) {
    pendingVoice.set(sourceId, (async () => (await limited(env, 'explanation_audio', 'EXPLANATION_AUDIO', access)) || makeVoice(env, store, body.id, script, sourceId).catch(() => failed('error', 'The voice could not be made right now. Try again.')))().finally(() => pendingVoice.delete(sourceId)));
  }
  const narration = await pendingVoice.get(sourceId);
  if (narration instanceof Response) return narration.clone();
  log(narration.status === 'ready' ? 'ok' : narration.code, narration.status === 'ready' ? { bytes: narration.fileRef.meta.size, seconds: narration.seconds } : {});
  return answer(narration);
}
