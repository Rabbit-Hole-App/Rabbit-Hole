import test from 'node:test';
import assert from 'node:assert/strict';
import { currentProposal, generationField, madeFrom, proposalActive, proposalBlock } from './generation-proposal-chat.js';

const soon = Math.floor(Date.now() / 1000) + 3600;
const p = (id, version, over = {}) => ({ proposal_id: id, version, command: 'motion', title: `T ${id} ${version}`, settings: { duration_seconds: 10, audio: false }, input: { request: '/motion explain rain', concept: 'Weather' }, expires_at: soon, ...over });
const answer = proposal => ({ role: 'assistant', content: 'ok', meta: { proposal } });

test('a refinement supersedes: only the newest version of a proposal is live; generated or expired ones are not', () => {
  const v1 = p('gp-a', 1), v2 = p('gp-a', 2), other = p('gp-b', 1);
  const msgs = [{ role: 'user', content: 'a video of rain' }, answer(v1), { role: 'user', content: 'make it 20 seconds' }, answer(v2), answer(other)];
  assert.deepEqual([v1, v2, other].map(x => proposalActive(x, msgs)), [false, true, true]);
  assert.equal(currentProposal(msgs), other, 'the last live one is what a chat turn revises');
  assert.equal(currentProposal(msgs, id => id === 'gp-b'), v2, 'a generated proposal is no longer revised');
  assert.equal(proposalActive(p('gp-c', 1, { expires_at: 10 }), [answer(p('gp-c', 1, { expires_at: 10 }))]), false, 'expired');
  assert.equal(currentProposal([{ role: 'user', content: 'hi' }]), null);
});

test('the chat turn sends what a Motion proposal is about, and only where Motion is offered', () => {
  assert.equal(generationField({ offered: false, concept: 'Weather' }), null);
  assert.deepEqual(generationField({ offered: true, concept: 'Weather' }), { motion: { concept: 'Weather' } });
  const target = { id: 'k1', kind: 'explanation', title: 'Clouds', text: 'Clouds are droplets.' };
  const current = p('gp-a', 2);
  assert.deepEqual(generationField({ offered: true, concept: '', target, current }), { motion: { concept: null, context: { selection: { cardId: 'k1', kind: 'explanation', title: 'Clouds', text: 'Clouds are droplets.' } } }, current });
});

test('Generate adds the existing Motion video card, confirmed, with the exact approved proposal as its operation', () => {
  const v = p('gp-a', 3, { input: { request: '/motion explain this', concept: 'Weather', context: { selection: { cardId: 'k1', kind: 'x', text: 't' } } } });
  const block = proposalBlock(v);
  assert.deepEqual(block.operation, { op: 'motion_request', request: '/motion explain this', location: { concept: 'Weather' }, context: v.input.context, proposal: v });
  assert.deepEqual([block.type, block.mode, block.confirmedStart, block.title], ['video', 'generate', true, v.title]);
  assert.equal(madeFrom('gp-a')(block), true);
  assert.equal(madeFrom('gp-b')(block), false);
});

// MOT-20b: one proposal system, Motion its first capability. The card's fields and Generate's card come from the declaration
// (CHAT_CAPABILITIES via proposal-capabilities.js) and an adapter; a capability with neither shows no settings and cannot Generate here.
test('generic: only declared capabilities are proposed; fields and the Generate card come from the declaration and an adapter', async () => {
  const { proposalFields, reviewRequired } = await import('./proposal-capabilities.js');
  const { CHAT_CAPABILITIES } = await import('./inline-ai-route.js');
  assert.deepEqual(Object.keys(CHAT_CAPABILITIES).filter(reviewRequired), ['motion']);
  assert.deepEqual(['motion', 'search', 'dive', 'notebook', 'whiteboard', 'explain', 'video', 'flashcards'].map(reviewRequired), [true, false, false, false, false, false, false, false], 'search, navigation and blank inserts stay direct; nothing else is enabled');
  assert.deepEqual(proposalFields('motion').map(f => [f.key, f.type, f.available ?? true]), [['duration_seconds', 'integer', true], ['audio', 'boolean', false]]);
  assert.deepEqual(proposalFields('flashcards'), [], 'no duration or audio where a capability does not declare them');
  assert.equal(proposalBlock(p('gp-x', 1, { command: 'flashcards' })), null, 'no adapter: no card to add');
  assert.equal(proposalBlock(p('gp-y', 1)).operation.op, 'motion_request');
});

// CR-1's route decision as the Chat uses it (chat-route-interface.md sections 3-5; MOT-20b keeps the UI).
test('route: the bound fields come from the ask payload; each decision becomes send, direct or a shown decision with the draft kept', async () => {
  const { routeChat, routeOutcome, ROUTE_FAILED } = await import('./generation-proposal-chat.js');
  const sent = [];
  const reply = (status, json) => async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { status, ok: status < 400, json: async () => json }; };
  const payload = { scope: { app: 'canvas-1', pending: null }, message: 'Create a 15-second animated explanation of photosynthesis', mode: 'auto', canvas_target: { id: 'k1' }, context_refs: [{ sourceId: 'card:shape:k1' }], generation: { motion: { concept: 'Biology' } } };
  const proposal = { route: 'capability:motion', flow: 'proposal', via: 'jev', capability: 'motion', token: 'tok' };
  assert.deepEqual(await routeChat(reply(200, proposal), payload), proposal);
  const [url, body] = sent[0];
  assert.equal(url, '/api/learn/chat/route');
  assert.deepEqual({ ...body, request_id: 'x' }, { request_id: 'x', app: 'canvas-1', pending: null, text: payload.message, capability: null, mode: 'auto', selection: { id: 'k1' }, source_refs: [{ sourceId: 'card:shape:k1' }], motion: { concept: 'Biology' } });
  assert.deepEqual(routeOutcome(proposal), { send: true, token: 'tok' }, 'a proposal is the ordinary turn with its token');
  assert.deepEqual(routeOutcome({ route: 'capability:motion', flow: 'proposal', token: null }).show.kind, 'fallback', 'no token: never sent as a proposal');
  assert.deepEqual(routeOutcome({ route: 'answer', via: 'jev' }), { send: true, token: null });
  assert.deepEqual(routeOutcome({ route: 'capability:youtube', flow: 'direct', capability: 'youtube', args: 'photosynthesis' }), { direct: { command: 'youtube', args: 'photosynthesis' } }, 'a search keeps its own handler: no Generate card');
  assert.deepEqual(routeOutcome({ route: 'clarify', clarification: { question: 'Did you want a Motion video or an answer in chat?', options: ['motion', 'answer'] } }).show, { kind: 'clarify', message: 'Did you want a Motion video or an answer in chat?', options: ['motion', 'answer'] });
  assert.deepEqual(routeOutcome({ route: 'unsupported', message: 'Motion is paused.' }).show, { kind: 'unsupported', message: 'Motion is paused.' });
  const failed = { route: 'answer', via: 'fallback', retryable: true, code: 'timeout', message: ROUTE_FAILED };
  assert.deepEqual(routeOutcome(failed).show, { kind: 'fallback', message: ROUTE_FAILED, retryable: true }, 'a router failure is shown with Answer normally and Retry, never answered as a paid capability');
  // Not deployed (404): the turn goes as today. A network error or a refusal: the failure, retryable.
  assert.equal(await routeChat(reply(404, null), payload), null);
  assert.deepEqual(routeOutcome(null), { send: true, token: null });
  assert.equal((await routeChat(async () => { throw new Error('offline'); }, payload)).via, 'fallback');
  assert.equal((await routeChat(reply(400, { error: 'bad' }), payload)).message, 'bad');
  await routeChat(reply(200, { route: 'answer' }), payload, { capability: 'motion' });
  assert.equal(sent.at(-1)[1].capability, 'motion', 'a clarification option asks again with the capability named');
});

test('the Chat routes plain turns and proposed commands; other command prompts, regenerations and Tutor turns do not', async () => {
  const { readFileSync } = await import('node:fs');
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.ok(ask.includes("if (chat && learnChat && !tocView && !privateChat && !attached && !regenerate && !isDemo && payload.mode !== 'tutor' && routeAs !== 'answer' && ((!prompted && !commandName) || reviewRequired(commandName))) {"), 'plain turns and proposed commands route; other command prompts never loop back through it');
  assert.ok(ask.includes('{ capability: routeAs ?? commandName ?? null }'), 'an explicit command names its capability: zero router calls');
  assert.ok(ask.includes('if (outcome.token) payload.route_token = outcome.token;'));
  assert.ok(ask.includes('if (!keepDraft) setInput(current => current || (commandName ?'), 'a shown decision gives the words back, never over a kept draft');
});
test('the e2e route fixture (e2e/dev-cp.mjs) passes the client: routeChat keeps it and the turn is sent; a body with no route falls back', async () => {
  const { routeChat, routeOutcome, ROUTE_FAILED } = await import('./generation-proposal-chat.js');
  const { CHAT_ROUTE_PROTOCOL_VERSION } = await import('./inline-ai-route.js');
  const { chatRouteAnswer, mockChatRoute } = await import('../e2e/dev-cp.mjs');
  const payload = { scope: { app: 'canvas-0a1b2c3d' }, message: 'Why does a metal spoon feel colder than a wooden one?', mode: 'ask' };
  const serve = make => async (url, init) => { const json = make(JSON.parse(init.body)); return { status: 200, ok: true, json: async () => json }; };
  const decision = await routeChat(serve(chatRouteAnswer), payload);
  assert.deepEqual(decision, chatRouteAnswer({ text: payload.message }), 'kept as served, args the line as typed');
  assert.equal(decision.meta.protocol, CHAT_ROUTE_PROTOCOL_VERSION);
  assert.deepEqual(routeOutcome(decision), { send: true, token: null }, 'an answer: the turn is sent, with no token');
  // The catch-all the checks used to answer it with ({ ok: true }) is malformed: the fallback, and no turn.
  const caught = await routeChat(serve(() => ({ ok: true })), payload);
  assert.deepEqual([caught.via, caught.code, routeOutcome(caught).show], ['fallback', 'malformed', { kind: 'fallback', message: ROUTE_FAILED, retryable: true }]);
  // mockChatRoute answers only the route path, with the request's own body.
  const handlers = [];
  await mockChatRoute({ route: async (pattern, handler) => handlers.push([pattern, handler]) }, []);
  const [[pattern, handler]] = handlers;
  assert.ok(pattern.test('http://127.0.0.1:9261/api/learn/chat/route'));
  assert.ok(!pattern.test('http://127.0.0.1:9261/api/learn/chat/threads/x/state'));
  let fulfilled = null;
  await handler({ request: () => ({ postData: () => JSON.stringify({ text: ' hi ' }) }), fulfill: async reply => { fulfilled = reply; } });
  assert.deepEqual(fulfilled, { json: chatRouteAnswer({ text: ' hi ' }) });
  assert.equal(fulfilled.json.args, 'hi');
});
