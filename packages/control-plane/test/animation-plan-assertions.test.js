// AN-18/AN-20 (owner decision 13): a plan's assertions are checked against the artifact before any review is paid, and only a plan that carries them is held to
// them. assertionProblems is pure; validateStage turns its lines into a repairable spec problem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertionProblems, planProblems, validateStage } from '../src/animation-author.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { hashAnimationPlan } from '../../web/src/animation3d/contract.js';
import { primitivesFixture } from '../../web/src/animation3d/fixtures.js';

const edit = (value, change) => { const copy = structuredClone(value); change(copy); return copy; };
const artifact = primitivesFixture.artifact;
// The fixture's plan has no parameters; the artifact below has a number parameter learningRate 0.1 to 1.5 so compare has something to check.
const withRate = edit(artifact, a => { a.parameters = [{ type: 'number', id: 'learningRate', label: 'Learning rate', min: 0.1, max: 1.5, step: 0.1, default: 0.5 }]; });
const planOf = assertions => ({ ...primitivesFixture.plan, parameters: [{ type: 'number', id: 'learningRate', label: 'Learning rate', min: 0.1, max: 1.5, step: 0.1, default: 0.5 }], assertions });

test('clamp: the node must exist and carry clampTo', () => {
  assert.deepEqual(assertionProblems(artifact, planOf([{ kind: 'clamp', node: 'ball' }])), []);
  assert.deepEqual(assertionProblems(artifact, planOf([{ kind: 'clamp', node: 'trail' }])), ['assertions.0: the approved plan clamps node trail to its surface; give that node clampTo { node: <the surface node> }']);
  assert.deepEqual(assertionProblems(artifact, planOf([{ kind: 'clamp', node: 'nowhere' }])), ['assertions.0: the approved plan clamps node nowhere, which the scene does not declare']);
});

test('compare: the parameter must be a number whose range includes both values', () => {
  const compare = values => planOf([{ kind: 'compare', parameter: 'learningRate', values }]);
  assert.deepEqual(assertionProblems(withRate, compare([0.1, 1.5])), [], 'both ends are included');
  assert.deepEqual(assertionProblems(withRate, compare([1.5, 0.1])), [], 'in either order');
  assert.deepEqual(assertionProblems(withRate, compare([0.1, 0.5])), []);
  assert.deepEqual(assertionProblems(withRate, compare([0.1, 2])), ['assertions.0: parameter learningRate must cover both compared values, 0.1 and 2 (it has 0.1 to 1.5)']);
  assert.deepEqual(assertionProblems(withRate, compare([0, 1])), ['assertions.0: parameter learningRate must cover both compared values, 0 and 1 (it has 0.1 to 1.5)']);
  assert.deepEqual(assertionProblems(artifact, compare([0.1, 1.5])), ['assertions.0: the approved plan compares values of parameter learningRate, which the scene does not declare']);
  const toggle = edit(artifact, a => { a.parameters = [{ type: 'toggle', id: 'learningRate', label: 'Fast', default: false }]; });
  assert.deepEqual(assertionProblems(toggle, compare([0.1, 1.5])), ['assertions.0: parameter learningRate must cover both compared values, 0.1 and 1.5 (it has toggle)']);
});

test('pathLength: some node must draw a trail whose max is at least min', () => {
  const path = min => planOf([{ kind: 'pathLength', min }]);
  assert.deepEqual(assertionProblems(artifact, path(100)), [], 'the fixture trail holds 100');
  assert.deepEqual(assertionProblems(artifact, path(1)), []);
  assert.deepEqual(assertionProblems(artifact, path(101)), ['assertions.0: the approved plan needs a path of at least 101 points; use a trail geometry with max 101 or more on a node']);
  const unused = edit(artifact, a => { a.scene.nodes = a.scene.nodes.filter(n => n.geometry !== 'pathTrail' && n.geometry !== 'pathGhost'); });
  assert.equal(assertionProblems(unused, path(10)).length, 1, 'a trail geometry no node draws is not a path');
  const markers = edit(artifact, a => { a.scene.geometries = a.scene.geometries.filter(g => g.kind !== 'trail'); a.scene.nodes = a.scene.nodes.filter(n => !['trail', 'ghost'].includes(n.id)); });
  assert.equal(assertionProblems(markers, path(10)).length, 1);
});

test('every assertion is reported, in order, one line each; no assertions and a garbled draft are no problem', () => {
  const lines = assertionProblems(artifact, planOf([{ kind: 'clamp', node: 'trail' }, { kind: 'pathLength', min: 200 }, { kind: 'clamp', node: 'ball' }]));
  assert.deepEqual(lines.map(l => l.split(':')[0]), ['assertions.0', 'assertions.1']);
  assert.deepEqual(assertionProblems(artifact, primitivesFixture.plan), []);
  assert.deepEqual(assertionProblems(artifact, { assertions: [] }), []);
  for (const junk of [undefined, null, {}, { scene: 1 }, { scene: { nodes: [null, 3], geometries: 'x' }, parameters: 'x' }]) assert.doesNotThrow(() => assertionProblems(junk, planOf([{ kind: 'clamp', node: 'a' }, { kind: 'compare', parameter: 'p', values: [1, 2] }, { kind: 'pathLength', min: 3 }])));
  assert.doesNotThrow(() => assertionProblems(artifact, undefined));
});

test('planProblems and the validate stage hold a plan to its assertions only when it carries them', async () => {
  assert.deepEqual(planProblems(artifact, primitivesFixture.plan), [], 'a plan with no assertions: as before');
  assert.deepEqual(planProblems(artifact, { ...primitivesFixture.plan, assertions: [] }), []);
  const plan = { ...primitivesFixture.plan, assertions: [{ kind: 'clamp', node: 'trail' }] };
  assert.deepEqual(planProblems(artifact, plan), assertionProblems(artifact, plan));
  const job = (draft, p) => ({ prompt: 'a ball in a bowl', plan: p, planHash: artifact.planHash, resultId: artifact.artifactId, approval: { at: '2026-11-03T00:00:00Z' }, draft, evidence: [], attempt: 1, repairs: 0,
    counts: { review: 0 }, calls: [{ role: 'author', status: 'settled', served: 'claude-opus-5-5' }], features: ANIMATION_CLIENT_FEATURES });
  const env = { ANTHROPIC_API_KEY: 'offline' };
  const refused = await validateStage(job(structuredClone(artifact), plan), { env });
  assert.deepEqual([refused.category, refused.repairable, refused.problems], ['spec', true, assertionProblems(artifact, plan)]);
  assert.equal((await validateStage(job(structuredClone(artifact), primitivesFixture.plan), { env })).problems, undefined, 'without assertions the draft passes');
  const met = { ...primitivesFixture.plan, assertions: [{ kind: 'clamp', node: 'ball' }, { kind: 'pathLength', min: 50 }] };
  assert.equal((await validateStage(job(structuredClone(artifact), met), { env })).problems, undefined, 'assertions the draft meets are no problem');
  assert.equal(typeof await hashAnimationPlan(met), 'string');
});
