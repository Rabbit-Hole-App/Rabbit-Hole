// R8b: the restricted evaluator and its computational evidence. Pure and offline; no model, no network, no D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/roadmap/roadmap-calculate.js';

const calc = (expression, variables) => C.calculateExpression({ expression, variables });
const val = (e, v) => { const r = calc(e, v); assert.equal(r.ok, true, `${e}: ${r.reason}`); return r.value; };
const why = (e, v) => { const r = calc(e, v); assert.equal(r.ok, false, `${JSON.stringify(e)} should be refused`); return r.reason; };

test('golden results: precedence, associativity, unary minus, signed powers, decimals', () => {
  assert.equal(val('1 + 2 * 3'), 7);
  assert.equal(val('(1 + 2) * 3'), 9);
  assert.equal(val('10 - 4 - 3'), 3, 'left-associative');
  assert.equal(val('100 / 10 / 5'), 2);
  assert.equal(val('2 ^ 3 ^ 2'), 512, '^ is right-associative');
  assert.equal(val('-2 ^ 2'), -4, 'unary minus binds looser than ^');
  assert.equal(val('2 ^ -1'), 0.5);
  assert.equal(val('(-2) ^ 2'), 4);
  assert.equal(val('--3'), 3);
  assert.equal(val('-(-3)'), 3);
  assert.equal(val('7 % 4'), 3);
  assert.equal(val('1.5 * 4'), 6);
  assert.equal(val('.5 + .25'), 0.75);
  assert.equal(val('2e3'), 2000);
  assert.equal(val('sqrt(16) + abs(-3)'), 7);
  assert.equal(val('max(1, 5, 3) - min(4, 2)'), 3);
  assert.equal(val('round(2.5) + floor(2.9) + ceil(2.1) + trunc(-2.9)'), 3 + 2 + 3 - 2);
  assert.equal(val('2 * pi'), 2 * Math.PI);
  assert.equal(val('ln(e)'), 1);
  assert.ok(!Object.is(val('0 * -1'), -0), 'negative zero is normalised');
});

test('variables are bound by name, bounded and cannot shadow constants or functions', () => {
  assert.equal(val('m * v ^ 2 / 2', { m: 2, v: 3 }), 9);
  assert.equal(why('x + 1'), 'unbound_name');
  for (const bad of [{ pi: 3 }, { sqrt: 1 }, { 'a b': 1 }, { 'a.b': 1 }, { x: '5' }, { x: NaN }, { x: Infinity }, { x: null }, { x: 1e301 }]) assert.equal(why('1', bad), 'bad_variable', JSON.stringify(bad));
  assert.equal(why('1', { ['v'.repeat(33)]: 1 }), 'bad_variable');
  assert.equal(why('1', Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`v${i}`, 1]))), 'too_many_variables');
  assert.equal(why('1', [1, 2]), 'bad_variables');
  // a JSON-parsed __proto__ key is an ordinary name here and pollutes nothing
  assert.equal(val('__proto__ + 1', JSON.parse('{"__proto__": 4}')), 5);
  assert.equal(({}).polluted, undefined);
  assert.equal(why('constructor + 1'), 'unbound_name');
  assert.equal(why('toString(1)'), 'unlisted_function');
});

test('prohibited syntax is refused by the tokenizer or parser, never evaluated', () => {
  const cases = {
    'process.exit()': 'bad_character', 'a.b': 'bad_character', 'x = 1': 'bad_character', '"abc"': 'bad_character', "'a'": 'bad_character', '`1`': 'bad_character',
    '[1,2]': 'bad_character', '{}': 'bad_character', 'x;y': 'bad_character', '1 // 2': 'syntax', '2 ** 3': 'syntax', 'import("fs")': 'bad_character',
    'require(1)': 'unlisted_function', 'eval(1)': 'unlisted_function', 'Function(1)': 'unlisted_function', 'fetch(1)': 'unlisted_function',
    'x => 1': 'bad_character', '1 ? 2 : 3': 'bad_character', '$a': 'bad_character', '1_000': 'syntax', '0x10': 'syntax', '1 2': 'syntax',
    'Infinity': 'unbound_name', 'NaN': 'unbound_name', '1e999': 'not_finite', '': 'empty', '   ': 'empty', '(': 'syntax', ')': 'syntax', '1 +': 'syntax',
    'sqrt()': 'syntax', 'sqrt(1, 2)': 'syntax', 'min(1)': 'syntax', 'abs(1,)': 'syntax', '(1))': 'syntax', 'é': 'bad_character',
  };
  for (const [expression, reason] of Object.entries(cases)) assert.equal(why(expression), reason, JSON.stringify(expression));
  for (const notText of [1, null, undefined, {}, ['1']]) assert.equal(why(notText), 'expression_not_text');
});

test('no dynamic execution primitive appears in the evaluator source', () => {
  const src = readFileSync(new URL('../src/roadmap/roadmap-calculate.js', import.meta.url), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  for (const banned of [/\beval\s*\(/, /new\s+Function/, /\bFunction\s*\(/, /\bimport\s*\(/, /\brequire\s*\(/, /\bvm\./, /child_process/, /\bfetch\s*\(/, /\bglobalThis\b/, /\bwith\s*\(/]) assert.ok(!banned.test(src), String(banned));
});

test('domain errors, division by zero and non-finite results are refused, never returned', () => {
  assert.equal(why('1 / 0'), 'division_by_zero');
  assert.equal(why('1 % 0'), 'division_by_zero');
  assert.equal(why('0 ^ -1'), 'division_by_zero');
  assert.equal(why('1 / (2 - 2)'), 'division_by_zero');
  assert.equal(why('sqrt(-1)'), 'domain_error');
  assert.equal(why('ln(0)'), 'domain_error');
  assert.equal(why('log10(-5)'), 'domain_error');
  assert.equal(why('asin(2)'), 'domain_error');
  assert.equal(why('(-8) ^ 0.5'), 'domain_error');
  assert.equal(why('10 ^ 400'), 'not_finite');
  assert.equal(why('10 ^ 301'), 'not_finite');
  assert.equal(why('2 ^ 20000'), 'exponent_too_large');
  assert.equal(why('exp(1000)'), 'not_finite');
  assert.equal(why('1e200 * 1e200'), 'not_finite');
});

test('resource bounds are enforced before evaluation', () => {
  assert.equal(why('1+'.repeat(300) + '1'), 'too_long');
  assert.equal(why('1+'.repeat(120) + '1'), 'too_many_tokens'); // 241 tokens in 241 chars
  assert.equal(why('('.repeat(40) + '1' + ')'.repeat(40)), 'too_deep');
  assert.equal(why('-'.repeat(60) + '1'), 'too_deep');
  assert.equal(why('2^'.repeat(60) + '2'), 'too_deep');
  assert.equal(C.calculateExpression({ expression: '1+2+3+4' }, { ...C.CALC_LIMITS, nodes: 5 }).reason, 'too_many_nodes');
  assert.equal(C.calculateExpression({ expression: 'abs(abs(abs(abs(1))))' }, { ...C.CALC_LIMITS, operations: 3 }).reason, 'too_many_operations');
  assert.equal(C.calculateExpression({ expression: 'a'.repeat(33) }).reason, 'name_too_long');
  assert.equal(val('x' + ' + x'.repeat(40), { x: 1 }), 41, 'a long but within-limits expression evaluates');
});

test('an adversarial long expression finishes immediately', () => {
  const started = process.hrtime.bigint();
  for (const e of ['9'.repeat(499), '('.repeat(499), '1+'.repeat(249), ' '.repeat(499) + '1', '(('.repeat(12) + '1' + '))'.repeat(12)]) calc(e);
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 500);
});

test('evidence is deterministic: same inputs, same id; a new value, a new identity', async () => {
  const a = await C.computationEvidence({ expression: ' m *  v^2 / 2 ', variables: { v: 3, m: 2 }, units: { m: 'kg', v: 'm/s' } });
  const b = await C.computationEvidence({ expression: 'm * v^2 / 2', variables: { m: 2, v: 3 }, units: { v: 'm/s', m: 'kg' } });
  assert.equal(a.status, 'ok');
  assert.deepEqual(a.evidence, b.evidence);
  assert.equal(a.evidence.kind, 'computation');
  assert.match(a.evidence.id, /^cmp_[0-9a-f]{16}$/);
  assert.equal(a.evidence.result, 9);
  assert.equal(a.evidence.evaluatorVersion, C.EVALUATOR_VERSION);
  assert.equal(a.evidence.limitsVersion, C.CALC_LIMITS_VERSION);
  assert.deepEqual(a.evidence.inputs, [{ name: 'm', value: 2, unit: 'kg' }, { name: 'v', value: 3, unit: 'm/s' }]);
  assert.ok(a.evidence.limitations.includes('floating_point_not_exact_proof'));
  assert.ok(a.evidence.limitations.includes('inputs_not_bound_to_a_source'));
  const c = await C.computationEvidence({ expression: 'm * v^2 / 2', variables: { m: 2, v: 4 } });
  assert.notEqual(c.evidence.id, a.evidence.id);
  assert.equal(c.evidence.display, '16');
  assert.ok(!('url' in a.evidence), 'no fake web evidence shape');
  const third = await C.computationEvidence({ expression: '1 / 3' });
  assert.equal(third.evidence.display, '0.333333333333');
  assert.equal(third.evidence.result, 1 / 3);
  assert.equal((await C.computationEvidence({ expression: '0.1 + 0.2' })).evidence.display, '0.3');
});

test('unsupported units and unbound variables ask instead of inventing precision; refusals carry no evidence', async () => {
  const ask = await C.computationEvidence({ expression: 'd / t', variables: { d: 5, t: 2 }, units: { d: 'km', t: 'h' }, resultUnit: 'mph' });
  assert.deepEqual([ask.status, ask.reason], ['needs_clarification', 'unit_conversion_unsupported']);
  const same = await C.computationEvidence({ expression: 'a + b', variables: { a: 1, b: 2 }, units: { a: 'm', b: 'm' }, resultUnit: 'm' });
  assert.equal(same.status, 'ok');
  assert.equal((await C.computationEvidence({ expression: 'a', variables: { a: 1 }, units: { a: '<script>' } })).reason, 'unit_unsupported');
  assert.equal((await C.computationEvidence({ expression: 'a', variables: { a: 1 }, units: { zz: 'm' } })).reason, 'unit_unsupported');
  const mixed = await C.computationEvidence({ expression: 'd / t', variables: { d: 5, t: 2 }, units: { d: 'km', t: 'h' } });
  assert.ok(mixed.evidence.limitations.includes('units_labels_only_no_dimensional_analysis'));
  const unbound = await C.computationEvidence({ expression: 'a + b', variables: { a: 1 } });
  assert.deepEqual([unbound.status, unbound.reason, unbound.evidence], ['needs_clarification', 'unbound_name', undefined]);
  const bad = await C.computationEvidence({ expression: '1 / 0' });
  assert.deepEqual([bad.status, bad.reason, bad.evidence], ['unsupported', 'division_by_zero', undefined]);
});

test('verification re-evaluates: tampering, a foreign version and a changed premise are refused; a good derivation is "computed"', async () => {
  const premises = { ev_aaaaaaaaaaaaaaaa: { value: 2, unit: 'kg', revision: 'r1' }, ev_bbbbbbbbbbbbbbbb: { value: 3, unit: 'm/s', revision: 'r1' } };
  const { evidence } = await C.computationEvidence({ expression: 'm * v^2 / 2', variables: { m: 2, v: 3 }, units: { m: 'kg', v: 'm/s' }, premises: { m: 'ev_aaaaaaaaaaaaaaaa', v: 'ev_bbbbbbbbbbbbbbbb' } });
  assert.ok(!evidence.limitations.includes('inputs_not_bound_to_a_source'));
  assert.deepEqual(await C.verifyComputationEvidence(evidence, { premises }), { ok: true, evidenceClass: 'computed' });
  const r = async (patch, p = premises) => (await C.verifyComputationEvidence({ ...evidence, ...patch }, { premises: p })).reason;
  assert.equal(await r({ result: 10 }), 'result_mismatch');
  assert.equal(await r({ display: '10' }), 'result_mismatch');
  assert.equal(await r({ result: Infinity }), 'not_finite');
  assert.equal(await r({ result: NaN }), 'not_finite');
  assert.equal(await r({ inputHash: 'sha256:00' }), 'input_hash_mismatch');
  assert.equal(await r({ evaluatorVersion: 'roadmap-calc-0' }), 'evaluator_version_mismatch');
  assert.equal(await r({ kind: 'web' }), 'not_a_computation');
  assert.equal(await r({ expression: 'm * v' }), 'input_hash_mismatch');
  assert.equal(await r({ inputs: evidence.inputs.map(i => (i.name === 'v' ? { ...i, value: 4 } : i)) }), 'premise_changed');
  assert.equal(await r({}, { ...premises, ev_bbbbbbbbbbbbbbbb: { value: 5, unit: 'm/s' } }), 'premise_changed');
  assert.equal(await r({}, { ev_aaaaaaaaaaaaaaaa: premises.ev_aaaaaaaaaaaaaaaa }), 'premise_missing');
  assert.equal(await r({}, { ...premises, ev_aaaaaaaaaaaaaaaa: { ...premises.ev_aaaaaaaaaaaaaaaa, stale: true } }), 'premise_stale');
  assert.equal((await C.verifyComputationEvidence(null)).reason, 'not_a_computation');
});

test('disclosure shows the expression, inputs and caveat but no evaluator ids or hashes', async () => {
  const { evidence } = await C.computationEvidence({ expression: 'a * 2', variables: { a: 1.5 }, units: { a: 'm' } });
  const d = C.computationDisclosure(evidence);
  assert.deepEqual(d.inputs, [{ name: 'a', value: 1.5, unit: 'm' }]);
  assert.equal(d.result, '3');
  assert.ok(!/cmp_|sha256|roadmap-calc/.test(JSON.stringify(d)));
});
