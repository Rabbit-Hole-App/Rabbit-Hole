// GEN-1 R1 / G5 (offline): a card with a plan is sent a schema of its planned kind(s) only; Gemini keeps those kinds (a planned box-plot is no longer dropped) and gets the
// code-computed fields `derive`, `op`, `t` there; every other bundle is unchanged. The size re-check drops the fields again when a narrowed schema is ever over the limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { stepRequest, geminiRequestSchema, schemaProperties, GEMINI_PROPERTY_LIMIT } from '../src/explanation-fast-chain.js';
import { CORE_KINDS, QUANT_KINDS, NEW_KINDS, plannedBundleKinds, narrowedKinds } from '../src/explanation-references.js';
import { exclusiveOneOfToAnyOf } from '../src/interact-model-adapters.js';

const ALL = [...CORE_KINDS, ...QUANT_KINDS, ...NEW_KINDS, 'tensor', 'token-links', 'block-stack'];
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const plan = kinds => ({ planner: 'jev', visuals: [{ type: 'diagram', ...(kinds.length === 1 ? { kind: kinds[0] } : { choose: kinds }) }], kind: kinds[0], fixed: kinds.length === 1, depthTreatment: 'mechanism', flags: {}, confidence: { kind: 0.9 }, probabilities: { kind: null } });
const bodyFor = (kinds, args = 'zzz') => prepareArtifactAuthorRequest(env, { command: 'explanation', args, depth: 'standard', ...(kinds ? { planned: true, plan: plan(kinds) } : {}) }).body;
const request = (provider, body) => stepRequest({ provider, model: 'm' }, 'low', body).response_format.json_schema.schema;
const kindsIn = schema => { const v = schema.properties.visuals.items, spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram; return (u.oneOf ?? u.anyOf).map(b => b.properties.kind.const); };
const has = (schema, key) => JSON.stringify(schema).includes(`"${key}":{`);

test('every kind alone: the Gemini schema holds exactly that kind, under the limit, with derive / op / t only where the kind has them', () => {
  for (const kind of ALL) {
    const gemini = request('google', bodyFor([kind]));
    assert.deepEqual(kindsIn(gemini), [kind], kind);
    assert.ok(schemaProperties(gemini) <= GEMINI_PROPERTY_LIMIT, `${kind}: ${schemaProperties(gemini)} properties`);
    assert.equal(has(gemini, 'derive'), kind === 'coordinate-plot', `${kind}: derive`);
    assert.equal(has(gemini, 'op'), kind === 'transformation', `${kind}: op`);
  }
});

test('the largest offered pair (coordinate-plot and block-stack) and a mixed pair stay under the limit and keep both kinds', () => {
  for (const pair of [['coordinate-plot', 'block-stack'], ['transformation', 'coordinate-plot'], ['box-plot', 'heatmap']]) {
    const gemini = request('google', bodyFor(pair));
    assert.deepEqual([...kindsIn(gemini)].sort(), [...pair].sort());
    assert.ok(schemaProperties(gemini) <= GEMINI_PROPERTY_LIMIT, `${pair}: ${schemaProperties(gemini)}`);
  }
});

test('a planned heatmap, sample-set, histogram or box-plot reaches Gemini; with no plan it still does not (the Phase 02 drop is unchanged)', () => {
  for (const kind of NEW_KINDS) {
    assert.deepEqual(kindsIn(request('google', bodyFor([kind]))), [kind], kind);
    assert.ok(!kindsIn(request('google', bodyFor(null, 'how does the water cycle work?'))).includes(kind), `no plan: ${kind} stays dropped`);
  }
});

test('the other providers get the same narrowed schema as Gemini (one kind is sent as an anyOf, which the provider adapter accepts)', () => {
  for (const kind of ['flow', 'coordinate-plot', 'box-plot']) {
    const body = bodyFor([kind]), fw = request('fireworks', body);
    assert.deepEqual(kindsIn(fw), [kind]);
    assert.doesNotThrow(() => exclusiveOneOfToAnyOf(body.tools[0].input_schema));
  }
});

test('no plan: no schema is narrowed, so Gemini keeps withholding derive / op / t', () => {
  const body = bodyFor(null, 'how does the water cycle work?');
  assert.equal(narrowedKinds(body.tools[0].input_schema), null);
  for (const key of ['derive', 'op']) assert.ok(!has(request('google', body), key), key);
});

test('a plan whose diagram has no kind yet, or the rules deciding, narrows nothing (plannedBundleKinds)', () => {
  assert.deepEqual(plannedBundleKinds({ source: 'rules', visuals: [] }), []);
  assert.deepEqual(plannedBundleKinds({ source: 'plan', visuals: [{ type: 'picture' }] }), []);
  assert.deepEqual(plannedBundleKinds({ source: 'plan', visuals: [{ type: 'diagram' }] }), []);
  assert.deepEqual(plannedBundleKinds({ source: 'plan', visuals: [{ type: 'diagram', kind: 'flow' }] }), ['flow']);
  assert.deepEqual(plannedBundleKinds({ source: 'plan', visuals: [{ type: 'diagram', choose: ['tree', 'flow'] }] }), ['tree', 'flow']);
  assert.deepEqual(plannedBundleKinds({ source: 'plan', visuals: [{ type: 'diagram', kind: 'flow' }, { type: 'picture' }, { type: 'diagram', kind: 'bar-chart' }] }), ['flow', 'bar-chart']);
  assert.deepEqual(plannedBundleKinds({ source: 'plan', visuals: [{ type: 'diagram', kind: 'flow' }, { type: 'diagram' }] }), []);
});

test('the over-limit re-check: a narrowed schema over the limit loses derive / op / t before anything else is cut; under it keeps them', () => {
  const schema = request('fireworks', bodyFor(['coordinate-plot'])), narrowed = narrowedKinds(schema);
  assert.deepEqual(narrowed, ['coordinate-plot']);
  const keep = new Set(narrowed), withFields = schemaProperties(geminiRequestSchema(schema, keep, narrowed));
  assert.ok(has(geminiRequestSchema(schema, keep, narrowed), 'derive'));
  const tight = geminiRequestSchema(schema, keep, narrowed, withFields - 1);
  assert.ok(!has(tight, 'derive'), 'over the limit: derive is withheld again');
  assert.ok(schemaProperties(tight) < withFields);
});
