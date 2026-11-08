// EXP-T12 slice 1: the /explain model, limit and timing policy. Model calls go through the real anthropic() dispatcher to a
// recording fetch, so the model id, headers and tool choice are what the wire would carry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropic } from '../src/ask.js';
import { ASK_MODELS, LEARN_TASKS, MODEL_PRICES } from '../src/learn-models.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { EXPLAIN_LIMITS, EXPLAIN_ROLES, EXPLAIN_TARGETS, callExplainRole, checkExplainRequest, explainModel, explainRequest, explainReservation,
  explainToolInput, explainTransport, roleBoundMicros, servedIdentity, newTiming, markTiming, beginStage, countStage, endStage, timingSummary } from '../src/explain-policy.js';

const env = { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-key' };
const tool = { name: 'visual_spec', description: 'The spec.', input_schema: { type: 'object', properties: { parts: { type: 'array' } }, required: ['parts'] } };
const png = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
const ROLES = ['brief', 'author', 'review', 'repair'];

function recordFetch(t, reply = body => ({ model: body.model, content: [{ type: 'tool_use', id: 't1', name: tool.name, input: { parts: [] } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } }), status = 200) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    calls.push({ host: new URL(url).host, headers: options.headers || {}, body });
    return Response.json(reply(body), { status });
  };
  return calls;
}
const captureLog = t => {
  const lines = [], original = console.log;
  t.after(() => { console.log = original; });
  console.log = (...args) => { lines.push(args.join(' ')); };
  return () => lines.filter(line => line.includes('"learn_model"')).map(line => JSON.parse(line));
};

test('the four /explain roles are pinned to Opus 5.5 with no picker or fallback; artifact keeps its model', () => {
  for (const role of ROLES) {
    const task = LEARN_TASKS[`explain_${role}`];
    assert.ok(Object.isFrozen(task), role);
    assert.deepEqual({ provider: task.provider, model: task.model, picker: task.picker, fallback: task.fallback, toolChoice: task.toolChoice },
      { provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', toolChoice: 'auto (exactly one tool call)' }, role);
    assert.ok(Number.isSafeInteger(task.maxTokens) && task.maxTokens > 0, role);
  }
  assert.equal(LEARN_TASKS.artifact.model, 'claude-opus-5');
  assert.equal(LEARN_TASKS.artifact.toolChoice, 'any');
});

test('picker keys, Auto, a default or a request override cannot substitute the pinned model', () => {
  for (const role of ROLES) {
    assert.equal(explainModel(role), 'claude-opus-5-5');
    assert.equal(explainModel(role, 'claude-opus-5-5'), 'claude-opus-5-5');
    for (const other of [null, 'auto', ...Object.keys(ASK_MODELS), ...Object.values(ASK_MODELS), 'claude-opus-5-5-fast'])
      assert.throws(() => explainModel(role, other), { code: 'model_override' }, `${role} ${other}`);
  }
  assert.throws(() => explainModel('artifact'), { code: 'unknown_role' });
});

test('a role call reaches the wire as claude-opus-5-5, one tool on auto, no fallback, beta, thinking or org route', async t => {
  const logged = captureLog(t);
  // An OpenAI plan model on the deployment does not move /explain: its roles are 'anthropic', not 'plan'.
  for (const deployment of [env, { ...env, OPENAI_API_KEY: 'o', LEARN_PLAN_MODEL: 'gpt-4.1-mini' }]) {
    const calls = recordFetch(t);
    const out = await callExplainRole(deployment, 'review', { system: 'Review.', tool, content: [{ type: 'text', text: 'spec' }, png] }, { callModel: anthropic });
    assert.equal(calls.length, 1);
    const [{ host, headers, body }] = calls;
    assert.equal(host, 'api.anthropic.com');
    assert.equal(body.model, 'claude-opus-5-5');
    assert.equal(headers['anthropic-beta'], undefined);
    assert.deepEqual(body.tool_choice, { type: 'auto' });
    assert.deepEqual(body.tools.map(x => x.name), ['visual_spec']);
    assert.equal(body.max_tokens, LEARN_TASKS.explain_review.maxTokens);
    for (const key of ['fallbacks', 'thinking', 'output_config', 'temperature']) assert.equal(key in body, false, key);
    // The image arrives as a base64 block, unchanged (no beta header needed).
    assert.deepEqual(body.messages[0].content[1], png);
    assert.deepEqual(out.identity, { requested: 'claude-opus-5-5', served: 'claude-opus-5-5', matches: true });
    assert.deepEqual(out.input, { parts: [] });
  }
  const pick = ({ task, provider, requested, source, served }) => ({ task, provider, requested, source, served });
  assert.deepEqual(logged().map(pick), Array(2).fill({ task: 'explain_review', provider: 'anthropic', requested: 'claude-opus-5-5', source: 'task', served: 'claude-opus-5-5' }));
});

test('served identity: unknown stays unknown, a dated snapshot matches, another model is refused', async t => {
  assert.deepEqual(servedIdentity('author', {}), { requested: 'claude-opus-5-5', served: null, matches: null });
  assert.deepEqual(servedIdentity('author', { model: 'claude-opus-5-5-20261001' }), { requested: 'claude-opus-5-5', served: 'claude-opus-5-5-20261001', matches: true });
  assert.throws(() => servedIdentity('author', { model: 'claude-opus-5' }), { code: 'model_substituted', served: 'claude-opus-5' });
  recordFetch(t, body => ({ model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: 't', name: tool.name, input: { parts: [] } }] }));
  await assert.rejects(callExplainRole(env, 'author', { system: 's', tool, content: 'x' }, { callModel: anthropic }), { code: 'model_substituted' });
});

test('an unavailable model is explicit and is not retried on another model', async t => {
  const calls = recordFetch(t, () => ({ type: 'error', error: { type: 'not_found_error', message: 'model: claude-opus-5-5' } }), 404);
  await assert.rejects(callExplainRole(env, 'brief', { system: 's', tool, content: 'x' }, { callModel: anthropic }), { code: 'model_unavailable' });
  assert.equal(calls.length, 1);
});

test('exactly one call of the offered tool; none, two or another tool is an invalid turn', () => {
  const reply = (...blocks) => ({ content: blocks });
  const use = (name, input = { parts: [] }) => ({ type: 'tool_use', id: name, name, input });
  assert.deepEqual(explainToolInput('author', reply({ type: 'text', text: 'Here.' }, use('visual_spec')), tool), { parts: [] });
  // An object sent as a JSON string is parsed once by the tool's schema.
  assert.deepEqual(explainToolInput('author', reply(use('visual_spec', '{"parts":[1]}')), tool), { parts: [1] });
  for (const bad of [reply({ type: 'text', text: 'no tool' }), reply(use('visual_spec'), use('visual_spec')), reply(use('other')), reply(use('visual_spec', '[1]')), {}])
    assert.throws(() => explainToolInput('author', bad, tool), { code: 'invalid_turn' });
});

test('no transport is wired: a role call without an admitted callModel makes no request', async t => {
  const calls = recordFetch(t);
  await assert.rejects(callExplainRole(env, 'author', { system: 's', tool, content: 'x' }, {}), { code: 'no_transport' });
  assert.equal(calls.length, 0);
});

test('finite limits: three correction rounds shared by all gates, and calls derived from them', () => {
  assert.equal(EXPLAIN_LIMITS.correctionRounds, 3);
  assert.deepEqual(EXPLAIN_LIMITS.calls, { brief: 1, author: 1, review: 4, repair: 3 });
  assert.equal(EXPLAIN_LIMITS.render.rounds, 4);
  assert.equal(EXPLAIN_LIMITS.render.browsersPerJob, 1);
  assert.equal(EXPLAIN_LIMITS.render.capturesPerRound, EXPLAIN_ROLES.review.maxImages);
  for (const value of [EXPLAIN_LIMITS.refinements, ...Object.values(EXPLAIN_LIMITS.preparation), ...Object.values(EXPLAIN_LIMITS.deadlines)]) assert.ok(Number.isSafeInteger(value) && value > 0);
  assert.ok(Object.isFrozen(EXPLAIN_LIMITS) && Object.isFrozen(EXPLAIN_LIMITS.calls));
});

test('prior prices come from MODEL_PRICES; preparation and generation are separate worst cases', () => {
  const [input, output] = MODEL_PRICES['claude-opus-5-5'];
  const bound = role => Math.ceil((EXPLAIN_ROLES[role].maxInputTokens + EXPLAIN_ROLES[role].maxImages * 4784) * input * 1.25 + LEARN_TASKS[`explain_${role}`].maxTokens * output);
  for (const role of ROLES) assert.equal(roleBoundMicros(role), bound(role), role);
  assert.deepEqual(explainReservation(), { version: 1, preparationMicros: bound('brief'), generationMicros: bound('author') + 4 * bound('review') + 3 * bound('repair') });
  // Numbers as of MODEL_PRICES 2026-09-25 ($4/$20 per MTok, cache write 1.25x): about $0.38 to prepare, $3.31 worst case to generate.
  assert.deepEqual(explainReservation(), { version: 1, preparationMicros: 375680, generationMicros: 3313280 });
});

test('a request is checked against its role before it can be sent: images, transport and the per-call bound', () => {
  // The largest request that fits passes, and its admission bound is within the role's prior price.
  const fits = explainRequest(env, 'review', { system: 'Review.', tool, content: [{ type: 'text', text: 'x'.repeat(30000) }, ...Array(6).fill(png)] });
  assert.ok(Math.round(requestSpendBound(fits, 'claude-opus-5-5') * 1e6) <= roleBoundMicros('review'));
  assert.throws(() => explainRequest(env, 'review', { system: 's', tool, content: Array(7).fill(png) }), { code: 'images', images: 7 });
  assert.throws(() => explainRequest(env, 'repair', { system: 's', tool, content: Array(3).fill(png) }), { code: 'images' });
  assert.throws(() => explainRequest(env, 'review', { system: 's', tool, content: 'x'.repeat(70000) }), { code: 'input_too_large' }); // over text plus every image slot
  // The subscription bridge cannot carry images: an image request is refused there, a text one is not.
  const bridge = { ...env, SUBSCRIPTION_ONLY: 'true' };
  assert.equal(explainTransport(bridge).images, false);
  assert.equal(explainTransport(env).images, true);
  assert.throws(() => explainRequest(bridge, 'review', { system: 's', tool, content: [png] }), { code: 'transport_images' });
  assert.equal(explainRequest(bridge, 'review', { system: 's', tool, content: 'x' }).system, 's');
  // Hand-made bodies cannot slip a forced tool, a model, fallbacks or thinking past the check.
  const base = explainRequest(env, 'author', { system: 's', tool, content: 'x' });
  for (const change of [{ tool_choice: { type: 'tool', name: 'visual_spec' } }, { tool_choice: { type: 'any' } }, { tools: [tool, { ...tool, name: 'b' }] }, { model: 'claude-opus-5' }, { fallbacks: 'default' }, { thinking: { type: 'enabled' } }])
    assert.throws(() => checkExplainRequest(env, 'author', { ...base, ...change }), /tool|model|fallback/, JSON.stringify(change));
});

test('stage timing: marks, per-stage counters, and processing time without the approval wait', () => {
  const timing = newTiming('researched', 1000);
  markTiming(timing, 'firstFeedback', 1200);
  markTiming(timing, 'firstFeedback', 9999); // the first time counts
  beginStage(timing, 'preparing', 1200); countStage(timing, { calls: 1, inputTokens: 900, outputTokens: 300 });
  beginStage(timing, 'awaiting_approval', 4000); markTiming(timing, 'proposalReady', 4000);
  beginStage(timing, 'authoring', 64000); markTiming(timing, 'generate', 64000); countStage(timing, { calls: 1 });
  beginStage(timing, 'rendering', 70000); countStage(timing, { captures: 4 });
  beginStage(timing, 'reviewing', 72000); countStage(timing, { calls: 1, images: 4 });
  assert.equal(timingSummary(timing).processingMs, null); // an open stage has no duration yet
  endStage(timing, 'accepted', 75000); markTiming(timing, 'result', 75000);
  const summary = timingSummary(timing);
  assert.deepEqual({ ...summary, stages: summary.stages.map(s => [s.stage, s.ms]) }, {
    requestClass: 'researched', cache: null, firstFeedbackMs: 200, proposalMs: 3000, generateToResultMs: 11000,
    processingMs: 2800 + 11000, approvalWaitMs: 60000, calls: 3, repairs: 0,
    stages: [['preparing', 2800], ['awaiting_approval', 60000], ['authoring', 6000], ['rendering', 2000], ['reviewing', 3000]],
  });
  assert.throws(() => newTiming('fast'), { code: 'request_class' });
  assert.throws(() => beginStage(timing, 'publishing'), { code: 'timing_stage' });
  // No target is invented before measurements exist (Q10).
  // L4's frozen targets (t22-targets.json): simple from observed runs; researched and Edit unmeasured, so no number.
  assert.deepEqual(EXPLAIN_TARGETS.simple, { firstFeedbackMs: 1000, proposalMs: null, resultMs: 75000, capabilityGapAnswerMs: 15000, reloadModelCalls: 0, basis: 'observed (t22-targets.json)' });
  for (const c of ['researched', 'edit']) assert.deepEqual(EXPLAIN_TARGETS[c], { firstFeedbackMs: null, proposalMs: null, resultMs: null, basis: 'unmeasured' });
});
