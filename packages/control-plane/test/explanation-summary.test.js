// The collapsed Explanation card's summary route (explanation-summary.js). Offline: global fetch is a provider double, spend enforcement is off (SMALL_ENV=test), and
// authorization is injected; no provider is contacted, nothing is paid.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { CHAIN_ENDPOINTS } from '../src/explanation-fast-chain.js';
import { SUMMARY_INSTRUCTION, SUMMARY_MAX_TOKENS, explanationSummaryRoute, summaryRequest } from '../src/explanation-summary.js';
import { capSummary } from '../../web/src/explanation-summary-text.js';

const PATH = '/api/learn/explanation-summary';
const KEYS = { SMALL_ENV: 'test', FIREWORKS_API_KEY: 'fw-synthetic', GEMINI_API_KEY: 'gm-synthetic' };
const access = { org: 'org-1', user_id: 'user-1', email: 'owner@example.com' };
const BODY = { app: 'canvas-1', title: 'Why coffee cools', body: 'A hot cup loses heat faster because the gap to the room is larger.\n\n```rh-diagram\n{"kind":"flow"}\n```\n\nAs it nears room temperature the gap shrinks.' };
let cardNumber = 0; // each call is a new card unless the test names its id: the route answers one model call per (canvas, card id)
const withId = body => (body && typeof body === 'object' && !Array.isArray(body) && !('id' in body) ? { ...body, id: `card-${++cardNumber}` } : body);
const call = (body, env = KEYS, deps = { authorize: async () => access }, init = {}) => explanationSummaryRoute(PATH, new Request(`https://x.test${PATH}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(withId(body)), ...init }), env, deps);
const reply = (summary, usage = { prompt_tokens: 120, completion_tokens: 60 }) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary }) } }], usage });

// Global fetch for one test; answers are given in order (the last repeats): an object is a 200 body, a number an HTTP status.
function providers(t, ...answers) {
  const sent = [], original = globalThis.fetch, log = console.log, lines = [];
  globalThis.fetch = (url, init) => {
    sent.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const answer = answers[Math.min(sent.length, answers.length) - 1];
    return Promise.resolve(typeof answer === 'number' ? Response.json({ message: 'synthetic failure' }, { status: answer }) : Response.json(answer));
  };
  console.log = line => { try { lines.push(JSON.parse(line)); } catch { /* not ours */ } };
  t.after(() => { globalThis.fetch = original; console.log = log; });
  return { sent, events: () => lines.filter(line => line.event === 'explanation_summary') };
}

test('one small call after delivery: the instruction, the title and body prose only (no diagram JSON), one string, 300 output tokens, low effort', async t => {
  const seen = providers(t, reply('A hot cup loses heat fastest at first because the room is much cooler.'));
  const answer = await call(BODY);
  assert.deepEqual(await answer.json(), { summary: 'A hot cup loses heat fastest at first because the room is much cooler.' });
  assert.equal(seen.sent.length, 1);
  const [{ url, body, headers }] = seen.sent;
  assert.equal(url, CHAIN_ENDPOINTS.fireworks.url, 'the cheapest step of the chain: gpt-oss on Fireworks');
  assert.equal(headers.Authorization, 'Bearer fw-synthetic');
  assert.equal(body.messages[0].content, SUMMARY_INSTRUCTION);
  assert.match(SUMMARY_INSTRUCTION, /one complete sentence of at most about 150 characters, plain words, no maths or markup, ending with a full stop, for a collapsed preview/);
  assert.match(body.messages[1].content, /^Title: Why coffee cools\n\nA hot cup loses heat/);
  assert.ok(!/rh-diagram|"kind"/.test(body.messages[1].content), 'the diagram fence is not sent');
  assert.equal(body.max_tokens, SUMMARY_MAX_TOKENS);
  assert.equal(body.reasoning_effort, 'low');
  assert.deepEqual(body.response_format.json_schema.schema.properties, { summary: { type: 'string' } }, 'a single string, nothing else');
  assert.equal(body.stream, false);
});

test('the 160-character cap is enforced on the answer: whole sentences only, else the first clause closed with a full stop; maths, markup and ellipses never reach the tile', async t => {
  const sentences = 'Heat leaves a hot cup quickly at first, because the gap to the room is wide. '.repeat(6).trim();
  providers(t, reply(sentences));
  const first = (await (await call(BODY)).json()).summary;
  assert.ok(first.length <= 160 && /\.$/.test(first), `a sentence end: ${first.length} ${first}`);
  const run = 'word '.repeat(80).trim();
  providers(t, reply(run));
  const second = (await (await call(BODY)).json()).summary;
  assert.ok(second.length <= 160 && /\.$/.test(second) && second.slice(0, -1).split(' ').every(w => w === 'word'), 'cut at a word, not inside one, and closed with a full stop');
  providers(t, reply('The rate is $\\frac{dT}{dt}=-k(T-T_0)$, so **faster** at first.'));
  assert.equal((await (await call(BODY)).json()).summary, 'The rate is , so faster at first.');
  assert.equal(capSummary('Short.'), 'Short.');
  assert.equal(capSummary(`${'a'.repeat(300)}`).length, 161, 'one unbroken word is cut at the cap and closed with a full stop');
  // The owner's example: a model answer that trails off ends as a complete sentence at its semicolon, never with an ellipsis.
  const example = 'Cross entropy tells how many extra bits are needed when we encode real data using a model; it adds the ideal bits of the true distribution to a penalty for...';
  assert.equal(capSummary(example), 'Cross entropy tells how many extra bits are needed when we encode real data using a model.');
  assert.equal(capSummary('A single sentence that runs on and on, with clauses and more clauses, and still more words after that to pass the cap, never stopping at all before the end.').match(/[.]$/)?.length, 1);
  assert.equal(capSummary('Water moves from oceans to the air. It then falls as rain and returns to the sea. A third sentence must not appear.'), 'Water moves from oceans to the air. It then falls as rain and returns to the sea.', 'at most two whole sentences');
  assert.ok(!/\.\.\.|\u2026/.test(capSummary(example)));
});

test('Fireworks failing falls to Gemini Flash Lite; each call is logged with its latency, provider, size and outcome', async t => {
  const seen = providers(t, 500, reply('Gemini wrote this one.'));
  const answer = await call(BODY);
  assert.deepEqual(await answer.json(), { summary: 'Gemini wrote this one.' });
  assert.deepEqual(seen.sent.map(s => s.url), [CHAIN_ENDPOINTS.fireworks.url, CHAIN_ENDPOINTS.google.url]);
  assert.equal(seen.sent[1].body.model, 'gemini-3.5-flash-lite');
  assert.equal(seen.sent[1].body.temperature, undefined, 'Gemini takes its default temperature, as in the chain');
  const [event, ...rest] = seen.events();
  assert.equal(rest.length, 0);
  assert.equal(event.provider, 'google');
  assert.equal(event.chars, 'Gemini wrote this one.'.length);
  assert.equal(event.outcome, 'ok');
  assert.ok(Number.isFinite(event.ms) && event.ms >= 0);
});

test('every step failing leaves the card its fallback text: 200 with a null summary, logged, nothing thrown', async t => {
  const seen = providers(t, 500, 503);
  const answer = await call(BODY);
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { summary: null, outcome: 'http_503' });
  assert.deepEqual(seen.events().map(e => [e.provider, e.chars, e.outcome]), [[null, 0, 'http_503']]);
  providers(t, { choices: [{ message: { content: 'not json' } }] });
  assert.equal((await (await call(BODY, { SMALL_ENV: 'test', FIREWORKS_API_KEY: 'fw' })).json()).outcome, 'empty');
});

test('a step whose credential is not set is skipped; with none the call is never made', async t => {
  const seen = providers(t, reply('Only Gemini is set.'));
  assert.equal((await (await call(BODY, { SMALL_ENV: 'test', GEMINI_API_KEY: 'gm' })).json()).summary, 'Only Gemini is set.');
  assert.deepEqual(seen.sent.map(s => s.url), [CHAIN_ENDPOINTS.google.url]);
  const none = providers(t, reply('never'));
  assert.deepEqual(await (await call(BODY, { SMALL_ENV: 'test' })).json(), { summary: null, outcome: 'no_credential' });
  assert.equal(none.sent.length, 0);
});

test('the request is checked before anything is sent: method, origin, shape, size; a signed-out caller is refused', async t => {
  const seen = providers(t, reply('x'));
  assert.equal((await explanationSummaryRoute(PATH, new Request(`https://x.test${PATH}`), KEYS, { authorize: async () => access })).status, 405);
  assert.equal(await explanationSummaryRoute('/api/learn/other', new Request(`https://x.test${PATH}`, { method: 'POST' }), KEYS), null);
  assert.equal((await call(BODY, KEYS, { authorize: async () => access }, { headers: { origin: 'https://evil.test' } })).status, 403);
  for (const bad of ['nope', { ...BODY, extra: 1 }, { ...BODY, body: '  ' }, { app: 'a', title: 'x' }, { ...BODY, body: 'x'.repeat(6001) }, [BODY]]) assert.equal((await call(bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  const refused = await call(BODY, KEYS, { authorize: async () => Response.json({ error: 'Sign in' }, { status: 401 }) });
  assert.equal(refused.status, 401);
  assert.equal(seen.sent.length, 0, 'no model call for a refused request');
});

test('summaryRequest is the same shape for both providers apart from the temperature', () => {
  const input = { title: 'T', body: 'B' };
  const fireworks = summaryRequest({ provider: 'fireworks', model: 'm' }, input), google = summaryRequest({ provider: 'google', model: 'g' }, input);
  assert.equal(fireworks.temperature, 0);
  assert.deepEqual({ ...fireworks, model: 'g', temperature: undefined }, { ...google, temperature: undefined });
});

test('the route is a usage feature of its own, so its spend is admitted for the signed-in payer and recorded (never charged: FREE_FEATURES)', async () => {
  const { FEATURES, usageFeature } = await import('../src/learn-usage.js');
  assert.equal(usageFeature('POST', PATH), 'explanation_summary');
  assert.equal(usageFeature('GET', PATH), null);
  assert.ok(FEATURES.includes('explanation_summary'));
  assert.match(readFileSync(new URL('../src/learn-usage.js', import.meta.url), 'utf8'), /const FREE_FEATURES = new Set\([^)]*'explanation_summary'/);
});

test('one model call per card id (owner 2026-11-08): a second request for the same canvas and card returns the stored summary, a different card or canvas asks again, a failed call stores nothing', async t => {
  const seen = providers(t, reply('The first and only summary of this card.'), reply('The summary of the other card.'));
  const same = { ...BODY, id: 'once-card' };
  assert.deepEqual(await (await call(same)).json(), { summary: 'The first and only summary of this card.' });
  assert.deepEqual(await (await call({ ...same, title: 'A different title', body: 'Different prose now.' })).json(), { summary: 'The first and only summary of this card.' }, 'stored text, whatever the body says');
  assert.equal(seen.sent.length, 1, 'the second request made no model call');
  assert.equal(seen.events().at(-1).outcome, 'stored');
  assert.deepEqual(await (await call({ ...same, id: 'other-card' })).json(), { summary: 'The summary of the other card.' });
  assert.equal(seen.sent.length, 2);
  const failing = providers(t, 500);
  assert.equal((await (await call({ ...BODY, id: 'failed-card' })).json()).summary, null);
  const retry = failing.sent.length;
  await call({ ...BODY, id: 'failed-card' });
  assert.ok(failing.sent.length > retry, 'a failed call stored nothing, so the card may ask again');
});

test('two requests in flight for one card share one model call; the card id is required and plain', async t => {
  const seen = providers(t, reply('Shared by both requests.'));
  const [a, b] = await Promise.all([call({ ...BODY, id: 'racing' }), call({ ...BODY, id: 'racing' })]);
  assert.deepEqual([await a.json(), await b.json()], [{ summary: 'Shared by both requests.' }, { summary: 'Shared by both requests.' }]);
  assert.equal(seen.sent.length, 1);
  for (const id of [undefined, '', 'a b', 'x'.repeat(65), 7]) assert.equal((await call({ ...BODY, id })).status, 400, String(id));
});

test('only the canvas owner is answered: the route asks the board authorizer for the canvas named in the request, and a refusal (403/404) reaches the caller before any model call', async t => {
  const seen = providers(t, reply('Never written.'));
  const asked = [];
  for (const status of [403, 404]) {
    const answer = await call({ ...BODY, id: 'not-mine' }, KEYS, { authorize: async (req, env, app) => { asked.push(app); return Response.json({ error: 'No access' }, { status }); } });
    assert.equal(answer.status, status);
  }
  assert.deepEqual(asked, ['canvas-1', 'canvas-1']);
  assert.equal(seen.sent.length, 0, 'no model call, nothing stored');
  const owner = await call({ ...BODY, id: 'not-mine' });
  assert.equal(owner.status, 200, 'the same card id is still unanswered for the real owner');
  assert.equal(seen.sent.length, 1);
});

test('a summary is never billed to the learner: the feature is FREE_FEATURES, the model call is still admitted and recorded under its own category', () => {
  const source = readFileSync(new URL('../src/learn-usage.js', import.meta.url), 'utf8'), free = source.match(/const FREE_FEATURES = new Set\(([^)]*)\)/)?.[1] ?? '';
  assert.ok(free.includes("'explanation_summary'"), 'billing default off until the owner says otherwise');
  assert.match(readFileSync(new URL('../src/explanation-summary.js', import.meta.url), 'utf8'), /category: 'explanation_summary'/);
});
