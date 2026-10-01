// Tutor v2 checkpoint I: the planner streams, and the plan's first sentence is handed over as soon as
// it is complete and safe to know (docs/features/tutor-architecture-v2.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns, readOnlyControlPlane } from './live-storage-spy.js';
import { planTurn, tutorRoute } from '../src/learn-tutor-routes.js';
import { firstSentence, parsePartial } from '../src/agents/learn-tutor.js';

// Every prefix of `json`, the first one firstSentence answers, as [prefix length, sentence].
const earliest = json => {
  for (let n = 1; n <= json.length; n++) { const sentence = firstSentence(json.slice(0, n)); if (sentence) return [n, sentence]; }
  return null;
};

test('parsePartial closes what is open and leaves out what is unfinished', () => {
  assert.deepEqual(parsePartial('{"actions":[{"type":"respond_text","te').value, { actions: [{ type: 'respond_text' }] });
  assert.deepEqual(parsePartial('{"a":12').value, {}, 'a number cut at the end may go on');
  assert.deepEqual(parsePartial('{"a":"x\\u00').value, { a: 'x' }, 'a cut escape is dropped');
  const { value, open } = parsePartial('{"actions":[{"type":"respond_text","text":"Hi th');
  assert.equal(open.owner, value.actions[0]);
  assert.equal(open.key, 'text');
  assert.deepEqual(parsePartial(JSON.stringify({ a: [1, true, null, 'q"x'] })).value, { a: [1, true, null, 'q"x'] });
});

test('firstSentence: the first respond_text\'s first sentence, as soon as it has ended', () => {
  const json = JSON.stringify({ actions: [{ type: 'respond_text', text: 'Softmax divides by the sum. So they add to 1.' }, { type: 'show_authored_card', card: 'c21-temperature' }], strategy: 'none' });
  const [at, sentence] = earliest(json);
  assert.equal(sentence, 'Softmax divides by the sum.');
  assert.ok(at <= json.indexOf('So they'), 'before the rest of the text is written');
  const one = JSON.stringify({ actions: [{ type: 'respond_text', text: 'Yes, every layer.' }] });
  assert.equal(earliest(one)[0], one.indexOf('."') + 2, 'a one-sentence text is complete once its string closes');
  assert.equal(firstSentence(JSON.stringify({ actions: [{ type: 'respond_text', text: 'The weights are 0.67 and 0.24 here. Next' }] })), 'The weights are 0.67 and 0.24 here.');
  assert.equal(firstSentence(JSON.stringify({ actions: [{ type: 'show_authored_card', card: 'x' }, { type: 'respond_text', text: 'Here it is. Look.' }] })), 'Here it is.');
});

test('firstSentence waits while an earlier action has no type, and ignores text past the third action', () => {
  assert.equal(firstSentence('{"actions":[{"card":"x"'), null);
  assert.equal(firstSentence(JSON.stringify({ actions: [{ card: 'x', type: 'show_authored_card' }, { text: 'Not yet typed. More', type: 'respond_text' }] }).replace(',"type":"respond_text"}]}', '')), null, 'text before its type is not known to be respond_text');
  const three = [{ type: 'focus_part', card: 'c', part_id: 'p' }, { type: 'suggest_depth', card: 'c' }, { type: 'suggest_practice', card: 'c' }];
  assert.equal(firstSentence(JSON.stringify({ actions: [...three, { type: 'respond_text', text: 'Dropped. Yes.' }] })), null);
  assert.equal(firstSentence(JSON.stringify({ actions: [{ type: 'respond_text', text: 'No end yet' }] })), null, 'a closed text with no end mark is not a sentence');
});

// An Anthropic SSE stream of a tutor_response call, its input split into small fragments.
function sse(input, model = 'claude-opus-5-5') {
  const json = typeof input === 'string' ? input : JSON.stringify(input), events = [
    { type: 'message_start', message: { model, usage: { input_tokens: 2500 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'tutor_response', id: 't1', input: {} } },
  ];
  for (let at = 0; at < json.length; at += 7) events.push({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 7) } });
  events.push({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 90 } }, { type: 'message_stop' });
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
}
function world(t, envExtra = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Board')");
  const env = { LEARN_DB, DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: readOnlyControlPlane({ apps: {} }), ANTHROPIC_API_KEY: 'k', TYPESAFE_API_KEY: 'jev', ...envExtra };
  return (body, deps) => tutorRoute('/api/learn/tutor/plan', new Request('https://dev.test/api/learn/tutor/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, deps);
}
const lines = async response => (await response.text()).trim().split('\n').map(line => JSON.parse(line));
const plan = { actions: [{ type: 'respond_text', text: 'Every layer uses the same mask. It is built once.' }], strategy: 'none' };

test('plan with stream: NDJSON - the first sentence, then the plan; the request streams the tool input', async t => {
  const sent = [];
  const response = await world(t)({ app: 'canvas-0a1b2c3d', context: { route: { row: 'x' } }, stream: true }, { callModel: async (env, body) => { sent.push(body); return sse(plan); } });
  assert.equal(response.headers.get('Content-Type'), 'application/x-ndjson');
  const events = await lines(response);
  assert.deepEqual(events.map(event => event.type), ['sentence', 'plan']);
  assert.equal(events[0].text, 'Every layer uses the same mask.');
  assert.deepEqual(events[1].actions, plan.actions);
  assert.deepEqual([events[1].telemetry.streamed, typeof events[1].telemetry.first_sentence_ms, events[1].telemetry.input_tokens, events[1].telemetry.output_tokens], [true, 'number', 2500, 90]);
  assert.equal(sent[0].stream, true);
  assert.equal(sent[0].tools[0].eager_input_streaming, true);
});

test('plan with stream: invalid streamed JSON is an invalid turn; subscription mode does not stream', async t => {
  const broken = await lines(await world(t)({ app: 'canvas-0a1b2c3d', context: {}, stream: true }, { callModel: async () => sse(JSON.stringify(plan).replace('"strategy"', '"strat"egy"')) }));
  assert.deepEqual([broken.at(-1).type, broken.at(-1).telemetry.outcome], ['error', 'invalid']);
  const sent = [], spoken = [];
  const turn = await planTurn({ SUBSCRIPTION_ONLY: 'true' }, {}, { onSentence: text => spoken.push(text), callModel: async (env, body) => {
    sent.push(body);
    return Response.json({ model: 'claude-opus-5-5', usage: {}, content: [{ type: 'tool_use', name: 'tutor_response', input: plan }], stop_reason: 'tool_use' });
  } });
  assert.equal('stream' in sent[0], false);
  assert.deepEqual(turn.actions, plan.actions);
  assert.deepEqual(spoken, [], 'no early sentence without a stream');
});

test('plan with stream and a tiered fast plan re-planned on Opus: one sentence only', async t => {
  const replies = [sse({ actions: [{ type: 'respond_text', text: 'Fast first. Then.' }, { type: 'open_dive', concept: 'softmax' }], strategy: 'none' }, 'claude-haiku-4-5'), sse(plan)];
  const events = await lines(await world(t, { TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5' })({ app: 'canvas-0a1b2c3d', context: { learner_intent: { kind: 'question' }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text'] }, stream: true }, { callModel: async () => replies.shift() }));
  assert.deepEqual(events.map(event => event.type), ['sentence', 'plan']);
  assert.equal(events[0].text, 'Fast first.');
  assert.equal(events[1].telemetry.escalated, 'an action outside the allowed types', 'the mismatch is visible; the browser records it as spoken.consistent = false');
});
