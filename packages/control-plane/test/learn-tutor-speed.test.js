// Tutor architecture v2, Decision 5 (owner, 2026-10-01): planner speed options, request construction
// only - no model is called. 5A prompt caching of the stable planner material; 5B Opus 5.5 fast mode as
// a separate benchmark arm; 5C the larger evaluator stays fixed whatever the planner knobs say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFreeText, planTurn } from '../src/learn-tutor-routes.js';
import { FAST_MODE_BETA, PLANNER_SYSTEM, plannerRequest, TUTOR_TOOL, tutorQuestions } from '../src/agents/learn-tutor.js';
import { anthropic } from '../src/ask.js';

const context = learner => ({ learner_intent: { kind: 'question', raw_user_message: `${learner} asks why softmax sums to one` }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text'] });
const plan = { constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: 'It divides by the sum.' }] };
const reply = (usage = {}) => Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 900, output_tokens: 80, ...usage }, content: [{ type: 'tool_use', name: 'tutor_response', input: plan }], stop_reason: 'tool_use' });
const recorder = (usage) => { const calls = []; return { calls, callModel: async (env, body, model) => { calls.push({ body, model }); return reply(usage); } }; };

test('5A: caching marks only the stable prefix - tool schema and policy prompt - never the learner\'s state', () => {
  const docs = [{ type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'canvas notes' } }];
  const a = plannerRequest(context('Ada'), 2000, docs, { cache: true }), b = plannerRequest(context('Bo'), 2000, [], { cache: true });
  assert.deepEqual(a.system, [{ type: 'text', text: PLANNER_SYSTEM, cache_control: { type: 'ephemeral' } }]);
  assert.equal(JSON.stringify([a.tools, a.system]), JSON.stringify([b.tools, b.system]), 'the cached prefix is byte-identical across learners and turns');
  assert.deepEqual(a.tools, [TUTOR_TOOL], 'the tool itself carries no marker: the system breakpoint covers tools -> system');
  const marked = JSON.stringify(a.messages);
  assert.equal(marked.includes('cache_control'), false, 'no breakpoint inside the learner-specific message');
  assert.ok(marked.includes('Ada asks why') && !JSON.stringify(a.system).includes('Ada'), 'the Teaching State stays out of the cached prefix');
  assert.ok(marked.includes('canvas notes'), 'context documents stay uncached too');
  assert.equal(plannerRequest(context('Ada'), 2000).system, PLANNER_SYSTEM, 'off: Baseline A request shape');
});

test('5A: caching is on by default (accepted F) and reports cache writes and reads; TUTOR_PLANNER_CACHE=off and SUBSCRIPTION_ONLY turn it off', async () => {
  const on = recorder({ cache_creation_input_tokens: 1400, cache_read_input_tokens: 0 });
  const turn = await planTurn({ TUTOR_PLANNER_FAST_MODEL: 'off' }, context('Ada'), { callModel: on.callModel });
  assert.ok(Array.isArray(on.calls[0].body.system));
  assert.deepEqual([turn.telemetry.cache, turn.telemetry.cache_creation_input_tokens, turn.telemetry.cache_read_input_tokens], [true, 1400, 0]);
  for (const env of [{ TUTOR_PLANNER_FAST_MODEL: 'off', TUTOR_PLANNER_CACHE: 'off' }, { TUTOR_PLANNER_FAST_MODEL: 'off', SUBSCRIPTION_ONLY: 'true' }]) {
    const off = recorder();
    const plain = await planTurn(env, context('Ada'), { callModel: off.callModel });
    assert.equal(typeof off.calls[0].body.system, 'string');
    assert.equal(plain.telemetry.cache, undefined);
  }
  const fast = recorder({ cache_read_input_tokens: 1400 });
  const tiered = await planTurn({ TUTOR_PLANNER_CACHE: 'on', TUTOR_PLANNER_FAST_MODEL: 'claude-sonnet-5-5' }, context('Ada'), { callModel: fast.callModel });
  assert.deepEqual([fast.calls[0].model, Array.isArray(fast.calls[0].body.system), tiered.telemetry.cache_read_input_tokens], ['claude-sonnet-5-5', true, 1400], 'the fast tier caches the same prefix');
});

test('5B: TUTOR_PLANNER_SPEED=fast asks Opus 5.5 for fast mode exactly as documented; never the fast tier, never under SUBSCRIPTION_ONLY', async () => {
  const request = plannerRequest(context('Ada'), 2000, [], { speed: 'fast' });
  assert.deepEqual([request.speed, request.betas], ['fast', [FAST_MODE_BETA]]);
  assert.equal(FAST_MODE_BETA, 'fast-mode-2026-02-01');
  assert.equal('speed' in plannerRequest(context('Ada'), 2000), false, 'off by default');
  const opus = recorder({ speed: 'fast' });
  const turn = await planTurn({ TUTOR_PLANNER_SPEED: 'fast', TUTOR_PLANNER_FAST_MODEL: 'off' }, context('Ada'), { callModel: opus.callModel });
  assert.deepEqual([opus.calls[0].model, opus.calls[0].body.speed, turn.telemetry.requested_speed, turn.telemetry.speed], ['claude-opus-5-5', 'fast', 'fast', 'fast'], 'usage.speed shows what served it');
  const standard = recorder({ speed: 'standard' });
  const fellBack = await planTurn({ TUTOR_PLANNER_SPEED: 'fast', TUTOR_PLANNER_FAST_MODEL: 'off' }, context('Ada'), { callModel: standard.callModel });
  assert.deepEqual([fellBack.telemetry.requested_speed, fellBack.telemetry.speed], ['fast', 'standard'], 'a standard-speed answer is visible, not hidden');
  const tier = recorder();
  await planTurn({ TUTOR_PLANNER_SPEED: 'fast', TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001' }, context('Ada'), { callModel: tier.callModel });
  assert.equal('speed' in tier.calls[0].body, false, 'the fast tier model never gets fast mode');
  const sub = recorder();
  await planTurn({ TUTOR_PLANNER_SPEED: 'fast', TUTOR_PLANNER_FAST_MODEL: 'off', SUBSCRIPTION_ONLY: 'true' }, context('Ada'), { callModel: sub.callModel });
  assert.equal('speed' in sub.calls[0].body, false);
});

test('5B: ask.js anthropic() lifts betas into the anthropic-beta header and keeps them out of the body', async t => {
  const sent = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => { sent.push({ headers: options.headers, body: JSON.parse(options.body) }); return reply(); };
  await anthropic({ ANTHROPIC_API_KEY: 'k' }, plannerRequest(context('Ada'), 2000, [], { speed: 'fast' }), 'claude-opus-5-5', null);
  assert.equal(sent[0].headers['anthropic-beta'], 'fast-mode-2026-02-01');
  assert.deepEqual([sent[0].body.speed, 'betas' in sent[0].body, sent[0].body.model], ['fast', false, 'claude-opus-5-5']);
  await anthropic({ ANTHROPIC_API_KEY: 'k' }, plannerRequest(context('Ada'), 2000), 'claude-opus-5-5', null);
  assert.equal('anthropic-beta' in sent[1].headers, false, 'no beta header without fast mode (Baseline A)');
});

test('5C: the larger evaluator stays fixed - Opus 5.5, no cache, no fast mode - whatever the planner knobs say', async () => {
  const spec = { answering: false, claims: [{ id: 'softmax/normalizes-to-one', concept: 'softmax', statement: 'Softmax outputs sum to one.', ideas: ['outputs sum to one'], misconceptions: [], drawn: 'one row' }], gaps: [{ concept: 'exponent', statement: 'e to the x is positive.', claims: ['softmax/normalizes-to-one'] }] };
  const keys = Object.keys(tutorQuestions(spec));
  const ask = async () => ({ body: { answers: Object.fromEntries(keys.map(key => [key, { type: 'noul', noul: key === 'g0' ? 0.5 : key === 'attempt' ? 1 : 0 }])) } }); // an uncertain gap escalates
  const calls = [];
  const callModel = async (env, body, model) => { calls.push({ body, model }); return Response.json({ model, usage: {}, content: [{ type: 'text', text: JSON.stringify(Object.fromEntries(keys.map(key => [key, 'no']))) }] }); };
  const knobs = { TYPESAFE_API_KEY: 'jev', TUTOR_PLANNER_CACHE: 'on', TUTOR_PLANNER_SPEED: 'fast', TUTOR_PLANNER_FAST_MODEL: 'claude-sonnet-5-5', TUTOR_PLANNER_EFFORT: 'low' };
  const result = await evaluateFreeText(knobs, spec, 'I am not sure why they add up.', { ask, callModel });
  assert.equal(result.telemetry.larger.called, true);
  assert.equal(calls[0].model, 'claude-opus-5-5');
  assert.deepEqual(['speed', 'betas', 'system', 'output_config'].filter(key => key in calls[0].body), [], 'the evaluator request is untouched by every planner knob');
  assert.equal(JSON.stringify(calls[0].body).includes('cache_control'), false);
});

test('accepted F (owner, 2026-10-01): with no knobs set, routine turns go to Sonnet 5.5 at effort low with caching, everything else to Opus 5.5', async () => {
  const fast = recorder();
  const routine = await planTurn({}, context('Ada'), { callModel: fast.callModel });
  assert.deepEqual([fast.calls[0].model, fast.calls[0].body.output_config, Array.isArray(fast.calls[0].body.system), routine.telemetry.tier], ['claude-sonnet-5-5', { effort: 'low' }, true, 'fast']);
  const opus = recorder();
  const graded = await planTurn({}, { ...context('Ada'), learner_intent: { kind: 'explanation' }, route: { row: 'misconception' } }, { callModel: opus.callModel });
  assert.deepEqual([opus.calls[0].model, 'output_config' in opus.calls[0].body, graded.telemetry.tier], ['claude-opus-5-5', false, 'opus'], 'Opus at its default effort');
  const haiku = recorder();
  await planTurn({ TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001' }, context('Ada'), { callModel: haiku.callModel });
  assert.equal('output_config' in haiku.calls[0].body, false, 'Haiku 4.5 never gets an effort');
  const sonnetDefault = recorder();
  await planTurn({ TUTOR_PLANNER_FAST_EFFORT: 'default' }, context('Ada'), { callModel: sonnetDefault.callModel });
  assert.equal('output_config' in sonnetDefault.calls[0].body, false, 'default = the model default effort (arm E)');
  const opusOnly = recorder();
  await planTurn({ TUTOR_PLANNER_FAST_MODEL: 'off', TUTOR_PLANNER_CACHE: 'off' }, context('Ada'), { callModel: opusOnly.callModel });
  assert.deepEqual([opusOnly.calls[0].model, typeof opusOnly.calls[0].body.system], ['claude-opus-5-5', 'string'], 'Baseline A reproduction');
});
