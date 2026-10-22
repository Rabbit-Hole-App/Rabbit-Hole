// CR-1: the chat line's capability route (chat-capability-route.js). Explicit commands and ids make no router call; plain
// words make one JEV call and nothing else (no author, render, reservation or database write before Generate); a failure
// answers, never a capability; the signed decision is bound to the learner, canvas, words, mode, selection, refs and the
// Motion input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatRouteFetch, decideChat, verifyChatRoute, FALLBACK } from '../src/chat-capability-route.js';
import { JevError } from '../src/learn-grade-jev.js';
import { CHAT_CAPABILITIES, chatCapability } from '../../web/src/inline-ai-route.js';
import { SLASH } from '../../web/src/agent/slash.js';
import { reviewRequired } from '../src/generation-proposal.js';

const MOTION_ENV = { MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) };
const untouchable = new Proxy({}, { get: (_, key) => { throw new Error(`touched ${String(key)}`); } });
const ENV = { INLINE_DECISION_KEY: 'k'.repeat(40), VERCEL_TYPESAFE_API_KEY: 'test-only', LEARN_DB: untouchable, DB: untouchable, LEARN_VIDEOS: untouchable, ...MOTION_ENV };
const EMAIL = 'owner@example.test';
const fieldsOf = (text, over = {}) => ({ app: 'canvas-0a1b2c3d', text, mode: 'auto', selection: null, source_refs: null, motion: null, ...over });
const jev = (choice, probability, confidence = 0.9, probabilities = { [choice]: probability }) => ({ body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice, confidence, probabilities } } }, ms: 40, model: 'jev-1.13.0', inputTokens: 600, cost: 0.0000252 });
const counted = reply => { const ask = async (...args) => { ask.calls.push(args); if (reply instanceof Error) throw reply; return typeof reply === 'function' ? reply(...args) : reply; }; ask.calls = []; return ask; };
const decideWith = (ask, text, { env = ENV, over = {}, capability = null, enabled = null } = {}) => decideChat(env, { email: EMAIL, app: 'canvas-0a1b2c3d', requestId: 'req-00000001', fields: fieldsOf(text, over), capability, enabled }, { ask });
// Every outbound fetch counts: routing makes none of its own (the JEV call is the stub).
function noFetch(t) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); throw new Error(`unexpected fetch ${url}`); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

test('every declared chat capability is a Learn command; proposal flow exactly where the proposal rules require review', () => {
  for (const [id, entry] of Object.entries(CHAT_CAPABILITIES)) {
    assert.ok(SLASH.some(c => c.name === id && c.places.includes('learn')), `${id} is a Learn command`);
    assert.equal(entry.flow === 'proposal', reviewRequired(id), `${id} flow`);
    assert.equal(typeof entry.intent, 'string');
  }
  assert.equal(CHAT_CAPABILITIES.explain, undefined, '/explain is not wired (owner)');
  assert.deepEqual(chatCapability('motion').settings.duration_seconds, { type: 'integer', min: 5, max: 30, unit: 's', label: 'Duration' });
  assert.equal(chatCapability('motion').settings.audio.available, false);
  assert.equal(chatCapability('youtube').settings, null, 'search gets no generation card fields');
});

test('explicit commands, picker and suggestion ids, Tutor mode and plain explain make zero router calls', async t => {
  const fetches = noFetch(t);
  const ask = counted(jev('motion', 0.99));
  const motion = await decideWith(ask, '/motion 15s explain photosynthesis');
  assert.deepEqual([motion.route, motion.via, motion.flow, motion.args, motion.paid], ['capability:motion', 'command', 'proposal', '15s explain photosynthesis', true]);
  assert.ok(motion.token && motion.settings.duration_seconds);
  const picked = await decideWith(ask, 'photosynthesis', { capability: 'youtube' });
  assert.deepEqual([picked.route, picked.via, picked.flow, picked.args, picked.paid], ['capability:youtube', 'capability', 'direct', 'photosynthesis', false]);
  assert.equal((await decideWith(ask, 'tell me more', { capability: 'answer' })).route, 'answer');
  assert.equal((await decideWith(ask, '/diagram the water cycle')).route, 'capability:diagram');
  assert.equal((await decideWith(ask, '/dive photosynthesis')).flow, 'direct', 'an undeclared Learn command keeps its own direct handler');
  const removed = await decideWith(ask, '/simplify this');
  assert.equal(removed.route, 'unsupported');
  assert.deepEqual([(await decideWith(ask, '/nope x')).route, (await decideWith(ask, '/nope x')).message], ['unsupported', '/nope is not a Learn command.']);
  const image = await decideWith(ask, '/generate-image a cat');
  assert.deepEqual([image.route, image.token], ['unsupported', null], 'a disabled feature stays disabled');
  assert.equal((await decideWith(ask, 'a diagram please', { capability: 'diagram', enabled: ['youtube'] })).route, 'unsupported', 'not in this canvas\'s enabled list');
  assert.deepEqual([(await decideWith(ask, 'make a video of rain', { over: { mode: 'tutor' } })).via], ['mode']);
  assert.equal((await decideWith(ask, 'explain this')).via, 'default');
  assert.equal(ask.calls.length, 0, 'no router call');
  assert.deepEqual(fetches, []);
});

test('plain words: one JEV call and nothing else; Motion gets a proposal route, never a job, render or reservation', async t => {
  const fetches = noFetch(t);
  const ask = counted(jev('motion', 0.93, 0.8, { motion: 0.93, answer: 0.05 }));
  const out = await decideWith(ask, 'Create a 15-second animated explanation of photosynthesis');
  assert.deepEqual([out.route, out.via, out.flow, out.capability, out.args], ['capability:motion', 'jev', 'proposal', 'motion', 'Create a 15-second animated explanation of photosynthesis']);
  assert.deepEqual([out.probability, out.confidence, out.meta.model, out.meta.input_tokens], [0.93, 0.8, 'jev-1.13.0', 600]);
  assert.equal(ask.calls.length, 1);
  const sent = ask.calls[0][1];
  assert.deepEqual(Object.keys(sent.questions), ['route'], 'one Choice question');
  assert.ok(sent.questions.route.criteria.answer && sent.questions.route.criteria.motion && sent.questions.route.criteria.youtube);
  assert.equal(JSON.stringify(sent).includes('photosynthesis'), true);
  assert.deepEqual(fetches, [], 'no author, render or orchestrator call');
  // the untouchable LEARN_DB / DB / LEARN_VIDEOS throw on any use: reaching here means no reservation or write
});

test('JEV outcomes: answer, low confidence and several ask one question, none and unavailable features are refused', async t => {
  noFetch(t);
  assert.deepEqual((await decideWith(counted(jev('answer', 0.97)), 'Can Motion generate audio?')).route, 'answer');
  const low = await decideWith(counted(jev('motion', 0.45, 0.3)), 'make something about photosynthesis');
  assert.deepEqual([low.route, low.clarification.options, low.token], ['clarify', ['motion', 'answer'], null]);
  const several = await decideWith(counted(jev('several', 0.8, 0.8, { several: 0.8, diagram: 0.1, motion: 0.09, answer: 0.01 })), 'a diagram and a video of this');
  assert.deepEqual([several.route, several.clarification.options], ['clarify', ['diagram', 'motion', 'answer']]);
  assert.equal((await decideWith(counted(jev('none', 0.9)), 'email this to my teacher')).route, 'unsupported');
  const paused = await decideWith(counted(jev('motion', 0.95)), 'make this into a video', { env: { ...ENV, MOTION_GENERATION_PAUSED: '1' } });
  assert.deepEqual([paused.route, paused.token], ['unsupported', null]);
  assert.match(paused.message, /temporarily unavailable/);
  const noOrchestrator = await decideWith(counted(jev('motion', 0.95)), 'make this into a video', { env: { ...ENV, MOTION_ORCHESTRATOR_URL: undefined } });
  assert.equal(noOrchestrator.route, 'unsupported');
  assert.equal((await decideWith(counted(jev('generate-image', 0.95)), 'draw me a cat')).route, 'unsupported', 'image generation is off: routing never enables it');
});

test('a router timeout, failure, malformed answer or missing key answers normally: never a paid capability', async t => {
  noFetch(t);
  for (const [ask, code] of [[counted(new JevError('timeout', 'Jev timed out after 2500 ms')), 'timeout'], [counted(new JevError('http', 'Jev 500', 500)), 'unavailable'], [counted({ body: { answers: { route: { type: 'choice', choice: 'rocket', confidence: 1, probabilities: { rocket: 1 } } } } }), 'malformed']]) {
    const out = await decideWith(ask, 'Create a 15-second animated explanation of photosynthesis');
    assert.deepEqual([out.route, out.via, out.code, out.retryable, out.capability, out.paid, out.token, out.message], ['answer', 'fallback', code, true, null, false, null, FALLBACK]);
  }
  const ask = counted(jev('motion', 0.99));
  const keyless = await decideWith(ask, 'make this into a video', { env: { ...ENV, VERCEL_TYPESAFE_API_KEY: undefined } });
  assert.deepEqual([keyless.route, keyless.code, ask.calls.length], ['answer', 'unavailable', 0]);
});

test('the signed decision keeps the canvas, words, mode, selection, refs and Motion input, for this learner only', async () => {
  const selection = { id: 'k-card', kind: 'card', title: 'Photosynthesis', text: 'Light reactions' };
  const refs = [{ kind: 'doc', sourceId: 'doc:12', name: 'Leaf.pdf' }];
  const motion = { concept: 'Photosynthesis', context: { kind: 'card' } };
  const out = await decideWith(counted(jev('motion', 0.95)), 'Make this into a video', { over: { selection, source_refs: refs, motion } });
  const ask = { scope: { app: 'canvas-0a1b2c3d' }, message: 'Make this into a video', mode: 'auto', canvas_target: selection, context_refs: refs, generation: { motion }, route_token: out.token };
  assert.deepEqual(await verifyChatRoute(ENV, ask, EMAIL), { cap: 'motion', flow: 'proposal' });
  assert.deepEqual(await verifyChatRoute(ENV, { ...ask, canvas_target: { text: 'Light reactions', title: 'Photosynthesis', kind: 'card', id: 'k-card' } }, EMAIL), { cap: 'motion', flow: 'proposal' }, 'key order is not part of it');
  for (const changed of [{ scope: { app: 'canvas-ffffffff' } }, { message: 'Make this into a long video' }, { mode: 'ask' }, { canvas_target: { ...selection, id: 'k-other' } }, { canvas_target: undefined }, { context_refs: [] }, { generation: { motion: { concept: 'Respiration' } } }, { route_token: out.token.replace(/.$/, c => (c === 'A' ? 'B' : 'A')) }]) {
    assert.equal(await verifyChatRoute(ENV, { ...ask, ...changed }, EMAIL), null, JSON.stringify(Object.keys(changed)));
  }
  assert.equal(await verifyChatRoute(ENV, ask, 'someone@example.test'), null, 'another learner');
  assert.equal(await verifyChatRoute({ ...ENV, INLINE_DECISION_KEY: 'x'.repeat(40) }, ask, EMAIL), null, 'another key');
});

test('POST /api/learn/chat/route: authorized for the canvas, validated, and decided', async t => {
  noFetch(t);
  const authorize = async (_req, _env, app) => (app === 'canvas-0a1b2c3d' ? { email: EMAIL, org: 'o', kind: 'owner' } : Response.json({ error: 'Not found' }, { status: 404 }));
  const post = body => new Request('https://dev.test/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ask = counted(jev('youtube', 0.9));
  const body = { request_id: 'req-00000001', app: 'canvas-0a1b2c3d', text: 'Find me a video about photosynthesis', mode: 'auto' };
  const res = await chatRouteFetch(post(body), ENV, { authorize, ask });
  assert.equal(res.status, 200);
  assert.deepEqual(((({ route, flow }) => [route, flow])(await res.json())), ['capability:youtube', 'direct']);
  assert.equal((await chatRouteFetch(post({ ...body, app: 'canvas-ffffffff' }), ENV, { authorize, ask })).status, 404);
  for (const bad of [{ mode: 'loud' }, { request_id: 'x' }, { text: 5 }, { capability: 'Not An Id' }, { selection: [] }, { source_refs: {} }, { text: '' }]) {
    assert.equal((await chatRouteFetch(post({ ...body, ...bad }), ENV, { authorize, ask })).status, 400, JSON.stringify(bad));
  }
  assert.equal(ask.calls.length, 1);
});
