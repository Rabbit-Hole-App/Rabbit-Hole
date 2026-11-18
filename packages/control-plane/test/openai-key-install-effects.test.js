// Owner decision D3 (2026-10-26): installing OPENAI_API_KEY on rabbit-hole-app must enable ONLY the explicitly authorized image path.
// Every flag below is read from the COMMITTED production config, with the key added: each other consumer of the key stays off.
// If one of these starts failing, a flag was flipped or a new reader of the key appeared: review it, then update this test in the same commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inlineImageJobsRoute } from '../src/inline-image-jobs.js';
import { imageJobsRoute, imageJobsAllowed } from '../src/image-jobs.js';
import { planUsesOpenAI } from '../src/learn-models.js';
import { openaiTranscriber } from '../src/learn-media.js';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
// A wrangler .jsonc: whole-line comments only (a "//" inside a string, such as https://, must survive).
const prodVars = JSON.parse(read('../../web/wrangler.rabbit-hole-prod.jsonc').split('\n').filter(line => !line.trim().startsWith('//')).join('\n')).vars;
const env = { ...prodVars, OPENAI_API_KEY: 'fixture-not-a-key' };
const untouched = name => (...args) => assert.fail(`${name} was called`);

// The inline routes of dev-worker.js, executed as written (the full Worker imports build-only assets); same technique as learn-spend-boundary.test.js.
const worker = read('../../web/dev-worker.js');
function inlineRoute(path, end) {
  const start = worker.indexOf(`    if (path === '${path}' && req.method === 'POST')`);
  assert.ok(start >= 0, path);
  const code = worker.slice(start, worker.indexOf(end, start));
  return new (Object.getPrototypeOf(async function () {}).constructor)('req', 'env', 'path', 'authorizedBoardApp', 'paidRefusal', 'paidSubmissionRefusal', 'fishSpendTransport', 'isPaidSpendReply', 'fetch', 'recordMedia', 'TRANSCRIBE_ESTIMATE', 'TRANSCRIBE_NEXT_ESTIMATE', 'ESTIMATE_PRICE', code);
}
const callRoute = (route, path, body) => route(new Request(`https://app${path}`, { method: 'POST', body }), env, path, async () => ({ email: 'fixture' }), // authorization runs before the gate
   untouched('paidRefusal'), untouched('paidSubmissionRefusal'), untouched('fishSpendTransport'), untouched('isPaidSpendReply'), untouched('fetch'), untouched('recordMedia'), 6000, 4500, {});

test('the committed production configuration has every OPENAI_API_KEY consumer off except the authorized ones', () => {
  // O-8 resolved 2026-10-29: transcription on for retained Explain-back voice notes (learn-media.js openaiTranscriber, priced transcribeSpendTransport).
  assert.equal(prodVars.TRANSCRIBE_ENABLED, 'true');
  assert.equal(prodVars.IMAGE_GENERATE_ENABLED, 'true'); // public image generation is on (owner GO 2026-10-29); its gate and acceptance are docs/features/image-jobs.md 6d
  // The other authorized consumer (owner activation, ctrlk-completion.md): Ctrl+K image edit, with its 3-credit hold.
  assert.deepEqual([prodVars.INLINE_IMAGE_EDIT_ENABLED, prodVars.INLINE_IMAGE_EDIT_RESERVED_USD], ['true', '0.03']);
  for (const name of ['LEGACY_IMAGE_GENERATION', 'LEARN_PLAN_MODEL']) assert.equal(name in prodVars, false, `${name} must stay absent until its own activation`);
});

// O-8 resolved for Explain-back voice notes only (P ruling 2026-10-30: Speak answer dictation is outside that scope). With the committed flag on and
// the key present, the legacy route keeps its reply: 503 not configured, before any spend check, provider call or usage record.
test('legacy Speak answer transcription stays 503 not configured with the flag on and the key present (dev-worker.js /api/learn/transcribe)', async () => {
  assert.equal(env.TRANSCRIBE_ENABLED, 'true');
  const body = new FormData();
  body.set('audio', new Blob(['x'], { type: 'audio/webm' }), 'a.webm'); body.set('app', 'fixture');
  const response = await callRoute(inlineRoute('/api/learn/transcribe', '    // Voice Mode:'), '/api/learn/transcribe', body);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Speech to text is not configured on this environment.' });
});

test('legacy image generation stays off with the key present (dev-worker.js /api/learn/image, gate LEGACY_IMAGE_GENERATION)', async () => {
  const response = await callRoute(inlineRoute('/api/learn/image', "    if (path === '/api/learn/scene')"), '/api/learn/image', JSON.stringify({ app: 'fixture', prompt: 'x', confirmed: true }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'image_generation_unavailable');
});

test('Ctrl+K image edit is the authorized consumer: available with the key and a 3-credit hold, unavailable without the key (inline-image-jobs.js enabled())', async () => {
  let addressed = 0;
  const bind = e => ({ ...e, LEARN_DB: {}, LEARN_MEDIA: {}, FILE_JOBS: { idFromName: () => { addressed++; }, get: () => { addressed++; } } });
  const access = { identity: async () => ({ org: 'o', email: 'someone@example.test' }), board: untouched('board'), source: untouched('source') };
  const url = '/api/learn/files/image-edits';
  const quote = await inlineImageJobsRoute(url, new Request(`https://app${url}`), bind(env), access);
  assert.deepEqual(await quote.json(), { available: true, maximumReservedCredits: 3, model: 'gpt-image-2.5-sunburst-2026-09-08' });
  const { OPENAI_API_KEY: _key, ...keyless } = env;
  assert.deepEqual(await (await inlineImageJobsRoute(url, new Request(`https://app${url}`), bind(keyless), access)).json(), { available: false, maximumReservedCredits: null, model: null });
  const submit = await inlineImageJobsRoute(url, new Request(`https://app${url}`, { method: 'POST', body: '{}' }), bind(keyless), access);
  assert.equal(submit.status, 503);
  assert.equal(addressed, 0);
});

test('public image generation is ON with the key present (held flip): everyone is offered it, the owner list stays for the operator surfaces (image-jobs.js, gates IMAGE_GENERATE_ENABLED and IMAGE_ACCEPTANCE_EMAILS)', async () => {
  assert.equal(imageJobsAllowed(env, 'someone@example.test'), true);
  const [operator] = String(prodVars.IMAGE_ACCEPTANCE_EMAILS).split(/\s+/);
  assert.equal(imageJobsAllowed(env, operator), true);
  const quote = async email => (await imageJobsRoute('/api/learn/image-jobs', new Request('https://app/api/learn/image-jobs'), { ...env, IMAGE_JOBS: {}, LEARN_DB: {}, LEARN_MEDIA: {} }, { identity: async () => ({ org: 'o', email }) })).json();
  assert.deepEqual([(await quote('someone@example.test')).available, (await quote('someone@example.test')).operatorOnly], [true, undefined], 'a learner is offered it and is not an operator');
  assert.deepEqual([(await quote(operator)).available, (await quote(operator)).operatorOnly], [true, undefined], 'public is not an operator-only window');
});

test('the planning model does not move to OpenAI with the key alone (learn-models.js planUsesOpenAI needs LEARN_PLAN_MODEL)', () => {
  assert.equal(planUsesOpenAI(env), false);
});

test('tripwire: exactly these server files read OPENAI_API_KEY; a new reader fails here until it is reviewed', () => {
  const sources = [];
  for (const dir of ['../src/', '../../web/']) for (const file of readdirSync(new URL(dir, import.meta.url))) if (/\.js$/.test(file)) sources.push([dir + file, read(dir + file)]);
  const readers = sources.filter(([, text]) => text.includes('OPENAI_API_KEY')).map(([file]) => file.replace('../src/', 'control-plane/src/').replace('../../web/', 'web/'));
  assert.deepEqual(readers.sort(), [
    'control-plane/src/ask.js', // planModel only, behind planUsesOpenAI (LEARN_PLAN_MODEL)
    'control-plane/src/image-providers.js', // IMG-01 OpenAI models, behind IMAGE_GENERATE_ENABLED / the acceptance emails
    'control-plane/src/inline-image-jobs.js', // Ctrl+K image edit, behind INLINE_IMAGE_EDIT_ENABLED
    'control-plane/src/learn-media.js', // Explain-back voice transcript (openaiTranscriber), behind TRANSCRIBE_ENABLED (O-8 resolved 2026-10-29)
    'control-plane/src/learn-models.js', // planUsesOpenAI
    'control-plane/src/pricing-registry.js', // a comment
    'web/dev-worker.js', // legacy /api/learn/image (LEGACY_IMAGE_GENERATION) and /api/learn/transcribe (TRANSCRIBE_ENABLED)
  ]);
});

// Transcription migration (gpt-4o-transcribe shuts down 2027-02-26). Since O-8 the one transcription caller is learn-media.js openaiTranscriber
// (Explain-back voice notes; the legacy route answers not configured), so the model rule is checked there: same flag gate, same model choice.
test('TRANSCRIBE_MODEL picks the model sent: default and any unknown value stay gpt-4o-transcribe, gpt-transcribe is explicit', async () => {
  for (const [value, model] of [[undefined, 'gpt-4o-transcribe'], ['', 'gpt-4o-transcribe'], ['gpt-5-transcribe', 'gpt-4o-transcribe'], ['gpt-transcribe', 'gpt-transcribe']]) {
    const sent = [];
    const fetchImpl = async (url, init) => { sent.push([url, init.body.get('model')]); return Response.json({ text: ' heard ' }); };
    const transcriber = openaiTranscriber({ OPENAI_API_KEY: 'fixture', TRANSCRIBE_ENABLED: 'true', SMALL_ENV: 'test', ...(value === undefined ? {} : { TRANSCRIBE_MODEL: value }) }, { fetchImpl });
    assert.equal(transcriber.model, model, String(value));
    assert.deepEqual(await transcriber.transcribe({ bytes: new Uint8Array([1]), mime: 'audio/webm' }), { text: ' heard ' });
    assert.deepEqual(sent, [['https://api.openai.com/v1/audio/transcriptions', model]], String(value));
  }
  assert.equal(openaiTranscriber({ OPENAI_API_KEY: 'fixture', TRANSCRIBE_ENABLED: 'false' }), null, 'the flag still gates it');
});
