// Owner decision D3 (2026-10-26): installing OPENAI_API_KEY on rabbit-hole-app must enable ONLY the explicitly authorized image path.
// Every flag below is read from the COMMITTED production config, with the key added: each other consumer of the key stays off.
// If one of these starts failing, a flag was flipped or a new reader of the key appeared: review it, then update this test in the same commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inlineImageJobsRoute } from '../src/inline-image-jobs.js';
import { imageJobsRoute, imageJobsAllowed } from '../src/image-jobs.js';
import { planUsesOpenAI } from '../src/learn-models.js';

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

test('the committed production configuration has every OPENAI_API_KEY consumer off', () => {
  assert.equal(prodVars.TRANSCRIBE_ENABLED, 'false');
  assert.equal(prodVars.IMAGE_GENERATE_ENABLED, 'false');
  for (const name of ['INLINE_IMAGE_EDIT_ENABLED', 'INLINE_IMAGE_EDIT_RESERVED_USD', 'LEGACY_IMAGE_GENERATION', 'LEARN_PLAN_MODEL']) assert.equal(name in prodVars, false, `${name} must stay absent until its own activation`);
});

test('spoken-answer transcription stays 503 with the key present (dev-worker.js /api/learn/transcribe, gate TRANSCRIBE_ENABLED)', async () => {
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

test('Ctrl+K image edit stays unavailable with the key present (inline-image-jobs.js enabled(), gates INLINE_IMAGE_EDIT_ENABLED and INLINE_IMAGE_EDIT_RESERVED_USD)', async () => {
  let addressed = 0;
  const bound = { ...env, LEARN_DB: {}, LEARN_MEDIA: {}, FILE_JOBS: { idFromName: () => { addressed++; }, get: () => { addressed++; } } };
  const access = { identity: async () => ({ org: 'o', email: 'someone@example.test' }), board: untouched('board'), source: untouched('source') };
  const url = '/api/learn/files/image-edits';
  const quote = await inlineImageJobsRoute(url, new Request(`https://app${url}`), bound, access);
  assert.deepEqual(await quote.json(), { available: false, maximumReservedCredits: null, model: null });
  const submit = await inlineImageJobsRoute(url, new Request(`https://app${url}`, { method: 'POST', body: '{}' }), bound, access);
  assert.equal(submit.status, 503);
  assert.equal(addressed, 0);
});

test('public image generation stays off with the key present; only IMAGE_ACCEPTANCE_EMAILS may use it (image-jobs.js, gates IMAGE_GENERATE_ENABLED and IMAGE_ACCEPTANCE_EMAILS)', async () => {
  assert.equal(imageJobsAllowed(env, 'someone@example.test'), false);
  const [operator] = String(prodVars.IMAGE_ACCEPTANCE_EMAILS).split(/\s+/);
  assert.equal(imageJobsAllowed(env, operator), true, 'the owner acceptance path is the one authorized consumer');
  const quote = async email => (await imageJobsRoute('/api/learn/image-jobs', new Request('https://app/api/learn/image-jobs'), { ...env, IMAGE_JOBS: {}, LEARN_DB: {}, LEARN_MEDIA: {} }, { identity: async () => ({ org: 'o', email }) })).json();
  assert.equal((await quote('someone@example.test')).available, false);
  assert.deepEqual([(await quote(operator)).available, (await quote(operator)).operatorOnly], [true, true]);
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
    'control-plane/src/learn-models.js', // planUsesOpenAI
    'control-plane/src/pricing-registry.js', // a comment
    'web/dev-worker.js', // legacy /api/learn/image (LEGACY_IMAGE_GENERATION) and /api/learn/transcribe (TRANSCRIBE_ENABLED)
  ]);
});

// Transcription migration (gpt-4o-transcribe shuts down 2027-02-26): only the route's model choice and its estimate change; the flag gate is unchanged.
test('TRANSCRIBE_MODEL picks the model sent and recorded: default and any unknown value stay gpt-4o-transcribe, gpt-transcribe is explicit', async () => {
  const route = inlineRoute('/api/learn/transcribe', '    // Voice Mode:');
  for (const [value, model, estimate] of [[undefined, 'gpt-4o-transcribe', 6000], ['', 'gpt-4o-transcribe', 6000], ['gpt-5-transcribe', 'gpt-4o-transcribe', 6000], ['gpt-transcribe', 'gpt-transcribe', 4500]]) {
    const sent = [], recorded = [];
    const body = new FormData();
    body.set('audio', new Blob(['x'], { type: 'audio/webm' }), 'a.webm'); body.set('app', 'fixture');
    const response = await route(new Request('https://app/api/learn/transcribe', { method: 'POST', body }), { OPENAI_API_KEY: 'fixture', TRANSCRIBE_ENABLED: 'true', ...(value === undefined ? {} : { TRANSCRIBE_MODEL: value }) }, '/api/learn/transcribe',
      async () => ({ email: 'fixture' }), untouched('paidRefusal'), async () => null, untouched('fishSpendTransport'), untouched('isPaidSpendReply'),
      async (url, init) => { sent.push([url, init.body.get('model')]); return Response.json({ text: ' heard ' }); }, async (_env, entry) => { recorded.push(entry); }, 6000, 4500, {});
    assert.deepEqual(await response.json(), { text: 'heard' });
    assert.deepEqual(sent, [['https://api.openai.com/v1/audio/transcriptions', model]], String(value));
    assert.deepEqual([recorded[0].model, recorded[0].estimateMicros], [model, estimate]);
  }
});
