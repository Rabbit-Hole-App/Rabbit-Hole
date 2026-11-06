// R8b: the calculator as a dispatcher tool. Own switch (ROADMAP_CALCULATOR), default off, also behind ROADMAP_ENABLED. Offline: no D1, network or model double is even constructed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/roadmap/roadmap-tools.js';
import { calculatorEnabled, calculatorHandlers, verifyComputationEvidence } from '../src/roadmap/roadmap-calculate.js';

const ON = { ROADMAP_ENABLED: 'true', ROADMAP_CALCULATOR: 'true' };
const call = args => ({ name: 'calculate_expression', args });
const run = (args, env = ON, deps = {}, extra = {}) => T.runRoadmapTool(call(args), { handlers: calculatorHandlers(env, deps), flags: T.toolFlags(env), purpose: 'propose', ...extra });

test('flag off adds nothing: no flag, no handler, no catalogue entry, no dispatch, with ROADMAP_ENABLED unset or true', async () => {
  const offs = [null, {}, { ROADMAP_CALCULATOR: 'true' }, { ROADMAP_ENABLED: 'true' }, { ROADMAP_ENABLED: 'true', ROADMAP_CALCULATOR: 'TRUE' }, { ROADMAP_ENABLED: 'true', ROADMAP_CALCULATOR: '1' },
    { ROADMAP_ENABLED: 'true', ROADMAP_CALCULATOR: '' }, { ROADMAP_ENABLED: 'false', ROADMAP_CALCULATOR: 'true' }];
  for (const env of offs) {
    assert.equal(calculatorEnabled(env), false, JSON.stringify(env));
    assert.deepEqual(T.toolFlags(env), {});
    assert.deepEqual(calculatorHandlers(env), {});
    assert.ok(!T.capabilityCatalogue(T.toolFlags(env)).some(c => c.name === 'calculate_expression'));
    assert.deepEqual(T.enabledCapabilities(T.toolFlags(env)).map(c => c.name), ['read_source', 'check_claims']);
    const out = await run({ expression: '1 + 1' }, env);
    assert.deepEqual([out.status, out.reason], ['unavailable', 'not_enabled'], JSON.stringify(env));
  }
  // even a caller that passes the flag but forgot the handler gets a typed refusal, and a handler built flag-off refuses by itself
  assert.equal((await T.runRoadmapTool(call({ expression: '1' }), { handlers: {}, flags: { calculate_expression: true }, purpose: 'propose' })).reason, 'no_handler');
});

test('flag on: offered with a closed schema, dispatched, evidence returned, tool budget counted', async () => {
  assert.equal(calculatorEnabled(ON), true);
  assert.deepEqual(T.toolFlags(ON), { calculate_expression: true });
  const cat = T.capabilityCatalogue(T.toolFlags(ON)).find(c => c.name === 'calculate_expression');
  assert.equal(cat.input_schema.additionalProperties, false);
  assert.deepEqual(cat.input_schema.required, ['expression']);
  assert.deepEqual(Object.keys(cat.input_schema.properties), ['expression', 'variables', 'units', 'premises', 'resultUnit']);
  assert.equal(cat.input_schema.properties.variables.additionalProperties.type, 'number');
  assert.ok(!/bexecut|bevalb|bcodeb/i.test(cat.description.replace(/Not code execution/, '')));
  const budget = { used: 0 };
  const out = await run({ expression: 'm * v ^ 2 / 2', variables: { m: 2, v: 3 } }, ON, {}, { budget });
  assert.equal(out.status, 'ok');
  assert.equal(out.evidence.result, 9);
  assert.equal(budget.used, 1);
  assert.deepEqual(await verifyComputationEvidence(out.evidence), { ok: true, evidenceClass: 'computed' });
  assert.equal((await run({ expression: '1' }, ON, {}, { budget: { used: 8 } })).reason, 'tool_budget_exhausted');
  assert.equal((await run({ expression: '1' }, ON, {}, { purpose: 'plan' })).reason, 'wrong_purpose');
});

test('bad arguments never reach the handler; evaluator refusals are typed limitations, not verified labels', async () => {
  let reached = 0;
  const spy = { calculate_expression: async () => { reached += 1; return { status: 'ok' }; } };
  const bad = [{}, { expression: '' }, { expression: 'x'.repeat(501) }, { expression: 1 }, { expression: '1', extra: 1 }, { expression: '1', variables: [1] }, { expression: '1', variables: { a: 'x' } },
    { expression: '1', variables: { a: NaN } }, { expression: '1', variables: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`v${i}`, 1])) }, { expression: '1', units: { a: 5 } }, { expression: '1', resultUnit: 'x'.repeat(25) }];
  for (const args of bad) assert.equal((await T.runRoadmapTool(call(args), { handlers: spy, flags: T.toolFlags(ON), purpose: 'propose' })).status, 'unsupported', JSON.stringify(args));
  assert.equal(reached, 0);
  for (const [args, status, reason] of [[{ expression: 'process.exit()' }, 'unsupported', 'bad_character'], [{ expression: '1/0' }, 'unsupported', 'division_by_zero'],
    [{ expression: 'x + 1' }, 'needs_clarification', 'unbound_name'], [{ expression: 'eval(1)' }, 'unsupported', 'unlisted_function'], [{ expression: '(('.repeat(20) + '1' + '))'.repeat(20) }, 'unsupported', 'too_deep'],
    [{ expression: 'd/t', variables: { d: 1, t: 1 }, units: { d: 'km', t: 'h' }, resultUnit: 'mph' }, 'needs_clarification', 'unit_conversion_unsupported']]) {
    const out = await run(args);
    assert.deepEqual([out.status, out.reason, out.evidence], [status, reason, undefined], JSON.stringify(args));
  }
});

test('a named premise must equal the supplied value; a changed or stale premise is a clarification', async () => {
  const premises = { ev_aaaaaaaaaaaaaaaa: { value: 2, unit: 'kg' }, ev_stale0000000000: { value: 2, unit: 'kg', stale: true } };
  const deps = { premise: async id => premises[id] ?? null };
  const args = { expression: 'm * 2', variables: { m: 2 }, units: { m: 'kg' }, premises: { m: 'ev_aaaaaaaaaaaaaaaa' } };
  const ok = await run(args, ON, deps);
  assert.equal(ok.status, 'ok');
  assert.deepEqual(ok.evidence.inputs, [{ name: 'm', value: 2, unit: 'kg', premiseId: 'ev_aaaaaaaaaaaaaaaa' }]);
  assert.deepEqual(await verifyComputationEvidence(ok.evidence, { premises: { ev_aaaaaaaaaaaaaaaa: premises.ev_aaaaaaaaaaaaaaaa } }), { ok: true, evidenceClass: 'computed' });
  assert.equal((await run({ ...args, variables: { m: 3 } }, ON, deps)).reason, 'premise_mismatch');
  assert.equal((await run({ ...args, units: { m: 'g' } }, ON, deps)).reason, 'premise_mismatch');
  assert.equal((await run({ ...args, premises: { m: 'ev_stale0000000000' } }, ON, deps)).reason, 'premise_unavailable');
  assert.equal((await run({ ...args, premises: { m: 'ev_unknown000000000' } }, ON, deps)).reason, 'premise_unavailable');
  assert.equal((await run(args, ON, {})).reason, 'no_premise_reader');
});

test('the calculator is not a paid tool and registers no other capability', () => {
  const cap = T.CAPABILITIES.find(c => c.name === 'calculate_expression');
  assert.deepEqual([cap.paid, cap.enabled, cap.optIn, cap.release], [false, true, true, 'R8b']);
  assert.deepEqual(T.CAPABILITIES.filter(c => c.enabled).map(c => c.name), ['read_source', 'check_claims', 'calculate_expression']);
  assert.ok(!T.CAPABILITIES.some(c => c.name !== 'calculate_expression' && c.optIn));
});
