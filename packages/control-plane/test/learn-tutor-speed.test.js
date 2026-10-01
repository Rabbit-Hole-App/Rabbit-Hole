// Tutor architecture v2, Decision 5 (owner, 2026-10-01): planner speed options, request construction
// only - no model is called. 5A prompt caching of the stable planner material; 5B Opus 5.5 fast mode as
// a separate benchmark arm; 5C the larger evaluator stays fixed whatever the planner knobs say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFreeText, planTurn } from '../src/learn-tutor-routes.js';
import { PLANNER_SYSTEM, plannerRequest, TUTOR_TOOL } from '../src/agents/learn-tutor.js';

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

test('5A: TUTOR_PLANNER_CACHE=on sends the marker and reports cache writes and reads; off by default and under SUBSCRIPTION_ONLY', async () => {
  const on = recorder({ cache_creation_input_tokens: 1400, cache_read_input_tokens: 0 });
  const turn = await planTurn({ TUTOR_PLANNER_CACHE: 'on' }, context('Ada'), { callModel: on.callModel });
  assert.ok(Array.isArray(on.calls[0].body.system));
  assert.deepEqual([turn.telemetry.cache, turn.telemetry.cache_creation_input_tokens, turn.telemetry.cache_read_input_tokens], [true, 1400, 0]);
  for (const env of [{}, { TUTOR_PLANNER_CACHE: 'on', SUBSCRIPTION_ONLY: 'true' }]) {
    const off = recorder();
    const plain = await planTurn(env, context('Ada'), { callModel: off.callModel });
    assert.equal(typeof off.calls[0].body.system, 'string');
    assert.equal(plain.telemetry.cache, undefined);
  }
  const fast = recorder({ cache_read_input_tokens: 1400 });
  const tiered = await planTurn({ TUTOR_PLANNER_CACHE: 'on', TUTOR_PLANNER_FAST_MODEL: 'claude-sonnet-5-5' }, context('Ada'), { callModel: fast.callModel });
  assert.deepEqual([fast.calls[0].model, Array.isArray(fast.calls[0].body.system), tiered.telemetry.cache_read_input_tokens], ['claude-sonnet-5-5', true, 1400], 'the fast tier caches the same prefix');
});
