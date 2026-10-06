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
  assert.deepEqual(sentence, { text: 'Softmax divides by the sum.', action: 'respond_text', constraints_add: null, explicit_request: null });
  assert.ok(at <= json.indexOf('So they'), 'before the rest of the text is written');
  const one = JSON.stringify({ actions: [{ type: 'respond_text', text: 'Yes, every layer.' }] });
  assert.equal(earliest(one)[0], one.indexOf('."') + 2, 'a one-sentence text is complete once its string closes');
  assert.equal(firstSentence(JSON.stringify({ actions: [{ type: 'respond_text', text: 'The weights are 0.67 and 0.24 here. Next' }] })).text, 'The weights are 0.67 and 0.24 here.');
  assert.equal(firstSentence(JSON.stringify({ actions: [{ type: 'show_authored_card', card: 'x' }, { type: 'respond_text', text: 'Here it is. Look.' }] })).text, 'Here it is.');
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

// Decision 2: a fast-tier sentence is held until its plan is complete and passes the escalation check.
test('D2: a fast plan that escalates to Opus speaks nothing of its own; Opus re-plans and speaks', async t => {
  const replies = [sse({ actions: [{ type: 'respond_text', text: 'Fast first. Then.' }, { type: 'open_dive', concept: 'softmax' }], strategy: 'none' }, 'claude-haiku-4-5-20251001'), sse(plan)];
  const events = await lines(await world(t, { TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001' })({ app: 'canvas-0a1b2c3d', context: { learner_intent: { kind: 'question' }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text'] }, stream: true }, { callModel: async () => replies.shift() }));
  assert.deepEqual(events.map(event => event.type), ['sentence', 'plan']);
  assert.equal(events[0].text, 'Every layer uses the same mask.', 'the held fast sentence is never sent');
  assert.equal(events[1].telemetry.escalated, 'an action outside the allowed types');
});

test('D2: a valid fast plan releases its held sentence only after its actions passed', async t => {
  const order = [];
  const fastPlan = { actions: [{ type: 'respond_text', text: 'Fast and fine. More.' }], strategy: 'none' };
  const turn = await planTurn({ TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001' }, { learner_intent: { kind: 'question' }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text'] }, {
    onSentence: sentence => order.push(`sentence:${sentence.text}`),
    callModel: async () => { order.push('fast:called'); return sse(fastPlan, 'claude-haiku-4-5-20251001'); },
  });
  order.push('plan');
  assert.deepEqual(order, ['fast:called', 'sentence:Fast and fine.', 'plan']);
  assert.equal(turn.telemetry.tier, 'fast');
  assert.ok(turn.telemetry.first_sentence_ms >= turn.telemetry.sentence_written_ms, 'released once the fast plan passed its check, not when written');
});

// Professor Next Steps Task 4 fix round 1: reason_codes and reason are written last, after the actions. A fast plan's held
// sentence is released once its actions are complete and pass the check (fastPlanProblem reads only the actions and an
// explicit_request written before them), never later because of the reason fields.
const HAIKU = 'claude-haiku-4-5-20251001', FAST = { TUTOR_PLANNER_FAST_MODEL: HAIKU };
const ROUTINE = { learner_intent: { kind: 'question' }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text'] };
const REASON = 'The learner asked why, so a short worked answer on the card in view keeps the mechanism visible and sets up the next question about the mask, with no quiz they did not ask for.';
const reasoned = { constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: 'Fast and fine. More.' }], reason: REASON, reason_codes: ['respond_to_question'] };
// sse(), one event per read, so a test sees how much tool input had arrived when the sentence went out. fail: the stream
// errors once that many input characters have arrived.
function paced(input, model, { stop = 'tool_use', fail = null } = {}) {
  const json = typeof input === 'string' ? input : JSON.stringify(input);
  const events = [{ type: 'message_start', message: { model, usage: { input_tokens: 2500 } } }, { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'tutor_response', id: 't1', input: {} } }];
  for (let at = 0; at < json.length; at += 7) events.push({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 7) } });
  events.push({ type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 90 } }, { type: 'message_stop' });
  let next = 0, arrived = 0;
  const body = new ReadableStream({ pull(controller) {
    if (fail != null && arrived >= fail) return controller.error(new Error('connection reset'));
    if (next === events.length) return controller.close();
    const event = events[next++];
    arrived += event.delta?.partial_json?.length || 0;
    controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  } });
  return { response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }), arrived: () => arrived };
}

test('reason last (a): a valid fast plan releases its held sentence once its actions pass, before the reason fields stream', async () => {
  const json = JSON.stringify(reasoned), stream = paced(json, HAIKU);
  let at = null;
  const turn = await planTurn(FAST, ROUTINE, { onSentence: () => { at = stream.arrived(); }, callModel: async () => stream.response });
  assert.ok(at != null && at < json.indexOf(REASON) + 28, `released at ${at} of ${json.length} characters; the reason starts at ${json.indexOf(REASON)}`);
  assert.equal(turn.reason, REASON);
  assert.deepEqual(turn.reason_codes, ['respond_to_question']);
  assert.deepEqual([turn.telemetry.tier, turn.telemetry.escalated, 'tail_lost' in turn.telemetry], ['fast', null, false]);
  assert.ok(turn.telemetry.sentence_written_ms <= turn.telemetry.first_sentence_ms && turn.telemetry.first_sentence_ms <= turn.telemetry.ms, 'first_sentence_ms is the release time');
});

test('reason last (b): fast actions that fail the check release nothing and escalate, as before', async () => {
  const bad = { ...reasoned, actions: [{ type: 'respond_text', text: 'Fast first. Then.' }, { type: 'open_dive', concept: 'softmax' }] };
  const replies = [paced(bad, HAIKU).response, sse(plan)], spoken = [];
  const turn = await planTurn(FAST, ROUTINE, { onSentence: sentence => spoken.push(sentence.text), callModel: async () => replies.shift() });
  assert.deepEqual(spoken, ['Every layer uses the same mask.'], 'the held fast sentence is never sent');
  assert.deepEqual([turn.telemetry.tier, turn.telemetry.escalated], ['opus', 'an action outside the allowed types']);
});

test('reason last (c): a fast stream cut or dropped after its released actions keeps the plan that spoke, reason fields null, flagged', async () => {
  const json = JSON.stringify(reasoned);
  for (const [name, reply] of [['truncated', () => paced(json.slice(0, json.indexOf(REASON) + 40), HAIKU, { stop: 'max_tokens' })], ['dropped', () => paced(json, HAIKU, { fail: json.indexOf(REASON) + 40 })]]) {
    const spoken = [];
    let calls = 0;
    const turn = await planTurn(FAST, ROUTINE, { onSentence: sentence => spoken.push(sentence.text), callModel: async () => { calls++; return reply().response; } });
    assert.deepEqual([calls, spoken], [1, ['Fast and fine.']], `${name}: spoken once, no re-plan`);
    assert.deepEqual({ ...turn, telemetry: undefined }, { constraints_add: [], strategy: 'none', actions: reasoned.actions, reason: null, reason_codes: null, telemetry: undefined }, name);
    assert.deepEqual([turn.telemetry.tier, turn.telemetry.escalated, turn.telemetry.tail_lost, turn.telemetry.outcome], ['fast', null, true, 'ok'], name);
  }
});

test('reason last (d): the Opus tier is unchanged - its sentence goes out as written, a cut stream is still an invalid turn', async () => {
  const opusContext = { ...ROUTINE, route: { row: 'misconception' } };
  const json = JSON.stringify({ ...reasoned, actions: plan.actions }), stream = paced(json, 'claude-opus-5-5');
  let at = null;
  const turn = await planTurn(FAST, opusContext, { onSentence: () => { at = stream.arrived(); }, callModel: async () => stream.response });
  assert.equal(turn.telemetry.tier, 'opus');
  assert.ok(at < json.indexOf('It is built once') + 14, 'spoken as soon as it is written, inside the actions');
  assert.deepEqual([turn.reason, turn.reason_codes, 'tail_lost' in turn.telemetry], [REASON, ['respond_to_question'], false]);
  const cut = paced(json.slice(0, json.indexOf(REASON) + 40), 'claude-opus-5-5', { stop: 'max_tokens' });
  await assert.rejects(planTurn(FAST, opusContext, { onSentence: () => {}, callModel: async () => cut.response }), /The tutor returned no turn/);
});

test('reason last (e): a fast plan without reason fields releases at its end, as before', async () => {
  const spoken = [];
  const turn = await planTurn(FAST, ROUTINE, { onSentence: sentence => spoken.push(sentence.text), callModel: async () => paced({ constraints_add: [], strategy: 'none', actions: reasoned.actions }, HAIKU).response });
  assert.deepEqual(spoken, ['Fast and fine.']);
  assert.equal(turn.telemetry.first_sentence_ms, turn.telemetry.ms, 'released when the plan ended');
  assert.deepEqual(['reason' in turn, 'tail_lost' in turn.telemetry, turn.telemetry.escalated], [false, false, null]);
});
