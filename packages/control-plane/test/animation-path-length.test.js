// FX-AN-111 (C9, owner): "pathLength min at the default step count": the planner-written pathLength assertion (scripts/animation/plans/sgd-loss-surface.json: min 20) must require a trail of at
// least the DEFAULT step count of points, so the trail is drawn at every step. The default step count is read from a number parameter named like steps (its default; the artifact's, else
// the plan's), else from the plan's own words (the size estimate's reading of "up to 40 steps per run", only for a plan that describes a trail); the assertion's min stays a floor and a
// trail cannot hold more than 512. Committed shapes only: the golden artifact and the Gate 1 plan fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertionProblems, defaultStepCount, planProblems } from '../src/animation-author.js';

const golden = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const pinned = JSON.parse(readFileSync(new URL('./fixtures/animation-sgd-loss-surface-plan.json', import.meta.url), 'utf8'));
const artifact = golden.artifact;
const withTrailMax = max => ({ ...artifact, scene: { ...artifact.scene, geometries: artifact.scene.geometries.map(g => (g.kind === 'trail' ? { ...g, max } : g)) } });
const planWith = (plan, min) => ({ ...plan, assertions: [{ kind: 'pathLength', min }] });

test('the Gate 1 plan states 40 steps and asks for a path of 20: the path must hold 40, the golden (64) does', () => {
  assert.equal(pinned.assertions.find(a => a.kind === 'pathLength').min, 20);
  assert.deepEqual(defaultStepCount(artifact, pinned), { n: 40, from: "the plan's own step count" });
  assert.deepEqual(assertionProblems(artifact, pinned), [], 'the golden trails hold 64');
});

test('FX-AN-111: a trail that holds the old floor but not the steps is refused, and the line says why (fails on the old code)', () => {
  assert.deepEqual(assertionProblems(withTrailMax(20), planWith(pinned, 20)).length, 1);
  assert.deepEqual(assertionProblems(withTrailMax(39), pinned).length, 1, 'one point short of the 40 steps');
  assert.deepEqual(assertionProblems(withTrailMax(40), pinned), [], 'exactly one per step');
  const [line] = assertionProblems(withTrailMax(32), pinned);
  assert.match(line, /^assertions\.2: the approved plan needs a path of at least 40 points \(one for each of its 40 steps, the plan's own step count\); use a trail geometry with max 40 or more on a node$/);
  // it reaches the validator the way every assertion does
  assert.ok(planProblems(withTrailMax(32), pinned).some(p => /at least 40 points/.test(p)));
});

test('FX-AN-111: a steps parameter sets it by its default, the artifact\'s before the plan\'s, and the min stays a floor', () => {
  const stepsParameter = (id, n) => ({ type: 'number', id, label: 'Steps', min: 1, max: 500, step: 1, default: n });
  const plan = { ...pinned, parameters: [...pinned.parameters, stepsParameter('steps', 100)] };
  assert.deepEqual(defaultStepCount(artifact, plan), { n: 100, from: 'the default of its parameter steps' });
  assert.equal(assertionProblems(withTrailMax(64), plan).length, 1, '64 < the default 100');
  assert.deepEqual(assertionProblems(withTrailMax(100), plan), []);
  const mine = { ...artifact, parameters: [...artifact.parameters, stepsParameter('stepCount', 70)] };
  assert.equal(defaultStepCount(mine, plan).n, 70, 'the artifact\'s own parameter wins');
  // a floor above the step count still holds
  assert.equal(assertionProblems(withTrailMax(30), planWith({ ...pinned, parameters: [stepsParameter('steps', 10)] }, 50)).length, 1);
  assert.match(assertionProblems(withTrailMax(30), planWith({ ...pinned, parameters: [stepsParameter('steps', 10)] }, 50))[0], /at least 50 points; use a trail/, 'no steps text when the floor decides');
});

test('FX-AN-111: no stated steps and no steps parameter means the assertion\'s own min, and a count above 512 asks for 512', () => {
  const quiet = { ...golden.plan, assertions: [{ kind: 'pathLength', min: 20 }] }; // the golden plan describes no trail
  assert.equal(defaultStepCount(artifact, quiet), null);
  assert.deepEqual(assertionProblems(withTrailMax(20), quiet), []);
  assert.equal(assertionProblems(withTrailMax(19), quiet).length, 1);
  const long = { ...pinned, parameters: [...pinned.parameters, { type: 'number', id: 'iterations', label: 'Iterations', min: 1, max: 2000, step: 1, default: 900 }] };
  assert.equal(defaultStepCount(artifact, long).n, 900);
  assert.equal(assertionProblems(withTrailMax(511), long).length, 1);
  assert.deepEqual(assertionProblems(withTrailMax(512), long), [], 'a trail cannot hold more than 512, so that is what is asked');
});

test('FX-AN-111: junk in the artifact or plan never throws', () => {
  for (const junk of [undefined, null, {}, { parameters: 'x' }, { parameters: [null, 3] }]) assert.doesNotThrow(() => defaultStepCount(junk, junk));
  assert.doesNotThrow(() => assertionProblems(artifact, { ...pinned, parameters: null }));
});
