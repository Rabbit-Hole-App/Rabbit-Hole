// Family contract fix (brief 21 task 2): each family input declares its sign, [id, kind, { sign }] with sign 'positive' (the default, every toss input), 'nonnegative' or 'any'. The brief schema honours it; the toss
// schema and fill text stay byte-identical (interact-family-contract.test.js holds the snapshot; the first test here repeats the comparison for the three depths).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { briefSchema } from '../../web/src/interact-plan-brief.js';
import { extractBrief } from '../../web/src/interact-family-vertical-throw.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { fillSystem } from '../src/interact-design-fill.js';

const SNAPSHOT = JSON.parse(readFileSync(new URL('./fixtures/toss-family-snapshot.json', import.meta.url), 'utf8'));
const { referencePlans } = await interactFixtures();
const base = extractBrief(referencePlans.tossOverview);

const label = id => ({ label: id, unit: '', meaning: `the ${id}` });
const stub = {
  FAMILY: { id: 'stub', depths: { brief: { template: 'one-body', roles: ['height'], inputs: [['x0', 'range', { sign: 'any' }], ['k', 'range', { sign: 'nonnegative' }], ['m', 'range', { sign: 'positive' }], ['u', 'range'], ['z', 'fixed', { sign: 'any' }], ['w', 'fixed', { sign: 'nonnegative' }], ['p', 'fixed']] } } },
  INPUTS: Object.fromEntries(['x0', 'k', 'm', 'u', 'z', 'w', 'p'].map(id => [id, label(id)])), ROLES: { height: { label: 'height', unit: 'm', meaning: 'the height' } }, scalars: [{ id: 'launchHeight', description: 'launch height', max: 10 }], LIMITS: { launchHeight: 10 },
};
const range = (min, max, def) => ({ min, max, default: def, step: 0.1 });
const raw = (over = {}) => ({ title: base.title, story: base.story, cardDescription: base.cardDescription, instructions: base.instructions, launchHeight: 0, x0: range(-5, 5, 0), k: range(0, 4, 1), m: range(0.5, 4, 1), u: range(-3, 3, 0), z: { fixed: -2 }, w: { fixed: 0 }, p: { fixed: 3 }, formulas: { height: base.formulas.height }, words: base.words, ...over });

test('the toss brief schema, keys and fill text are byte-identical to the snapshot at the three depths (a toss input declares no sign: a fixed value stays positive, a range stays unconstrained)', () => {
  for (const depth of ['brief', 'balanced', 'detailed']) {
    const info = briefSchema(depth), s = SNAPSHOT[depth];
    assert.equal(JSON.stringify(info.jsonSchema), JSON.stringify(s.schema), `${depth} schema`);
    assert.equal(fillSystem(depth, info), s.fill, `${depth} fill text`);
  }
});

test('a sign: any input accepts zero and negative values in its range and as a fixed value; the other inputs keep their sign', () => {
  const { parse } = briefSchema('brief', stub);
  const ok = parse(raw());
  assert.equal(ok.ok, true, JSON.stringify(ok.problems));
  assert.deepEqual([ok.value.x0.min, ok.value.x0.default, ok.value.z.fixed, ok.value.w.fixed, ok.value.k.min], [-5, 0, -2, 0, 0]);
});

test('a sign: nonnegative input accepts 0 and refuses a negative value, range and fixed, with the sign rule in the problem line', () => {
  const { parse } = briefSchema('brief', stub);
  const neg = parse(raw({ k: range(-1, 4, 1) })); assert.equal(neg.ok, false); assert.ok(neg.problems.some(p => /^k\.min: must be 0 or more \(sign: nonnegative\)/.test(p)), neg.problems.join('|'));
  const negFixed = parse(raw({ w: { fixed: -0.5 } })); assert.equal(negFixed.ok, false); assert.ok(negFixed.problems.some(p => /^w\.fixed: must be 0 or more \(sign: nonnegative\)/.test(p)), negFixed.problems.join('|'));
});

test('a sign: positive input refuses 0 and negative values, range and fixed, with the sign rule in the problem line', () => {
  const { parse } = briefSchema('brief', stub);
  for (const [over, path] of [[{ m: range(0, 4, 1) }, 'm.min'], [{ m: range(-2, 4, 1) }, 'm.min'], [{ m: range(0.5, 4, -1) }, 'm.default'], [{ p: { fixed: 0 } }, 'p.fixed'], [{ p: { fixed: -1 } }, 'p.fixed']]) {
    const out = parse(raw(over)); assert.equal(out.ok, false, path);
    assert.ok(out.problems.some(p => p.startsWith(`${path}: must be greater than 0 (sign: positive)`)), `${path}: ${out.problems.join('|')}`);
  }
});

test('the model-facing JSON schema has no positive-only bound for sign: any, a minimum of 0 for nonnegative, and the plain number for positive', () => {
  const { jsonSchema } = briefSchema('brief', stub), num = key => jsonSchema.properties[key].properties;
  for (const k of ['min', 'max', 'default', 'step']) assert.deepEqual(num('x0')[k], { type: 'number' }, `any: ${k}`);
  assert.deepEqual(num('z').fixed, { type: 'number' });
  for (const k of ['min', 'max', 'default']) assert.deepEqual(num('k')[k], { type: 'number', minimum: 0 }, `nonnegative: ${k}`);
  assert.deepEqual(num('k').step, { type: 'number' }); assert.deepEqual(num('w').fixed, { type: 'number', minimum: 0 });
  assert.deepEqual(num('m').min, { type: 'number' }); assert.deepEqual(num('p').fixed, { type: 'number' });
});

test('an input with no declared sign keeps the old rule: a fixed value must be positive, a range is unconstrained (the negative x0 range of the curve)', () => {
  const { parse } = briefSchema('brief', stub);
  assert.equal(parse(raw({ u: range(-3, 3, 0) })).ok, true);
  const out = parse(raw({ p: { fixed: 0 } })); assert.equal(out.ok, false); assert.ok(out.problems.some(p => p.startsWith('p.fixed: must be greater than 0 (sign: positive)')));
});

test('an unknown sign is refused when the schema is built', () => {
  const bad = { ...stub, FAMILY: { id: 'stub', depths: { brief: { ...stub.FAMILY.depths.brief, inputs: [['x0', 'range', { sign: 'odd' }]] } } } };
  assert.throws(() => briefSchema('brief', bad), /sign "odd"/);
});
