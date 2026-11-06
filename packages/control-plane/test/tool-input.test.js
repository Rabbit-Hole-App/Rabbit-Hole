// packages/control-plane/test/tool-input.test.js
// The schema-directed tool-input boundary (src/tool-input.js) and its call site: the hook planner's callRole. Tutor cleanup
// P4 retired the journey planners that this file used to exercise (their live 2026-10-05 corpus fixtures went with them);
// the boundary is the same module, so the cases below run on the Next Steps tool's schema. No model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolInput } from '../src/tool-input.js';
import { NEXT_STEPS_TOOL, nextStepsOutput } from '../src/agents/learn-next-steps.js';
import { PlannerInvalid, planNextSteps } from '../src/learn-next-steps-planner.js';
import { fixtureFor } from '../src/learn-next-steps-fixtures.js';

const SCHEMA = NEXT_STEPS_TOOL.input_schema;
const INPUT = { mode: 'canvas', basis: 'b1', goal: 'Understand how kilns fire pottery', canvas: { title: 'Kilns', blocks: [{ id: 'b1', type: 'explanation', title: 'Firing a kiln' }] }, scope: { concepts: {}, claims: {} }, recent: {}, previous: { hooks: [] }, constraints: {} };
const GOOD = fixtureFor('suggest_next_steps', INPUT);

// ---------- The boundary ----------

test('1. a stringified array where the schema says array is parsed once, then the existing validator passes it', () => {
  const out = normalizeToolInput(SCHEMA, { ...GOOD, options: JSON.stringify(GOOD.options) });
  assert.deepEqual(out.options, GOOD.options);
  assert.equal(nextStepsOutput(out, INPUT).ok, true);
});

test('2. a stringified object where the schema says object is parsed once (an array item, nested)', () => {
  const out = normalizeToolInput({ type: 'object', properties: { options: { type: 'array', items: { type: 'object', properties: { claim: { type: 'object' } } } } } },
    { options: [{ claim: JSON.stringify({ id: 'c1' }) }] });
  assert.deepEqual(out.options[0].claim, { id: 'c1' });
});

test('3. malformed JSON is left as it came and the existing validator rejects it', () => {
  const text = JSON.stringify(GOOD.options).slice(0, -1);
  const out = normalizeToolInput(SCHEMA, { options: text });
  assert.equal(out.options, text);
  assert.equal(nextStepsOutput(out, INPUT).ok, false);
});

test('4. JSON that parses to the wrong type is left as it came and rejected', () => {
  for (const text of ['{"hook":"x"}', 'null', '"three hooks"', '42', 'true']) {
    const out = normalizeToolInput(SCHEMA, { options: text });
    assert.equal(out.options, text, text);
    assert.equal(nextStepsOutput(out, INPUT).ok, false, text);
  }
  // Parsed exactly once: a doubly serialized array parses to a string, which is the wrong type.
  const twice = JSON.stringify(JSON.stringify(GOOD.options));
  assert.equal(normalizeToolInput(SCHEMA, { options: twice }).options, twice);
});

test('5. a JSON-looking value in a string field stays a string; booleans and untyped fields are never coerced', () => {
  const odd = { options: GOOD.options.map(o => ({ ...o, hook: '{"a": 1}', reason_internal: '["not", "a", "list"]' })), ambiguous: 'true' };
  const out = normalizeToolInput(SCHEMA, odd);
  assert.equal(out.options[0].hook, '{"a": 1}');
  assert.equal(out.options[0].reason_internal, '["not", "a", "list"]');
  assert.equal(out.ambiguous, 'true');
  assert.equal(out, odd, 'nothing to normalize: the same object');
});

test('6. native arrays and objects pass through by reference', () => {
  assert.equal(normalizeToolInput(SCHEMA, GOOD), GOOD);
  assert.equal(normalizeToolInput(undefined, GOOD), GOOD);
});

test('7. a normalized value that is semantically invalid still fails ordinary validation', () => {
  const out = normalizeToolInput(SCHEMA, { options: JSON.stringify(GOOD.options.slice(0, 1)) });
  assert.equal(Array.isArray(out.options), true);
  assert.equal(nextStepsOutput(out, INPUT).ok, false, 'one hook is not three');
});

// ---------- The call site ----------

const scripted = (...inputs) => {
  const calls = [];
  return { calls, callModel: async (_env, body) => { const input = inputs[Math.min(calls.length, inputs.length - 1)]; calls.push(body); return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: body.tools[0].name, input }] }) }; } };
};

test('wiring, hook planner callRole: a stringified options array is planned without escalation; a malformed one fails the plan', async () => {
  const ok = scripted({ ...GOOD, options: JSON.stringify(GOOD.options) });
  const planned = await planNextSteps({}, INPUT, { callModel: ok.callModel });
  assert.equal(ok.calls.length, 1);
  assert.equal(planned.options.length, 3);
  const bad = scripted({ options: JSON.stringify(GOOD.options).slice(0, -1) });
  await assert.rejects(planNextSteps({}, INPUT, { callModel: bad.callModel }), error => error instanceof PlannerInvalid);
});
