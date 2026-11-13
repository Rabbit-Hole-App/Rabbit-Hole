// Build-half sprint item 2: the headless run (INTERACT_RUN=headless). The sealed artifact of run 15 (a real READY card from the clone, saved under
// docs/features/interact/evidence/2026-11-12-clone-runs/runs/15-boundary-capture-fix-READY; copies in fixtures/interact) runs in-process at its plan's cases and the
// deterministic checks give the result the recorded browser run gave: the same ten captures (job timing: rendering, captures 10), no problem, every control probed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyComposition } from '../../web/src/interact-composition.js';
import { buildPlanCaptureCases, checkSceneAgainstPlan, headlessCaptureCard } from '../src/interact-checks.js';
import { captureRole } from '../src/interact-job.js';
import { interactOracle } from '../src/interact-oracle.js';

const load = name => JSON.parse(readFileSync(new URL(`./fixtures/interact/${name}`, import.meta.url), 'utf8'));
const { artifact, composition } = load('run15-result-artifact.json'), plan = load('run15-plan.json').plan, recorded = load('run15-job-detail.json');
const artifacts = { main: { kind: 'program', program: artifact }, supporting: [] };

test('run 15 headless: the sealed artifact is intact, runs at the plan\'s cases and passes every deterministic check, as the recorded browser run did', async () => {
  assert.deepEqual(await verifyComposition(composition, artifacts), []);
  const { cases, probes, coverage } = buildPlanCaptureCases(plan, composition, artifacts);
  assert.equal(cases.length + probes.length, recorded.diagnostics.timing.stages.find(s => s.stage === 'rendering').captures, 'the same number of captures as the recorded run');
  assert.deepEqual([coverage.incomplete, coverage.problems], [false, []]);
  const captures = await headlessCaptureCard({})({ composition, artifacts, cases: [...cases, ...probes] });
  assert.equal(captures.length, cases.length + probes.length);
  const det = checkSceneAgainstPlan({ plan, composition, artifacts, captures, cases, probes, oracle: interactOracle(plan), allowPartialCard: true });
  assert.deepEqual(det.problems, [], 'the recorded run passed the checks in the same round (a reviewer, not a check, rejected its first candidate)');
  assert.deepEqual(det.coverage.cases, cases.map(c => c.id));
  assert.deepEqual(det.coverage.effects.untested, []);
  assert.deepEqual(det.coverage.effects.tested, plan.controls.filter(c => c.binding.kind === 'input' && c.affects.length).map(c => c.id));
  assert.equal(det.coverage.oracle.checked, 0, 'this plan is not a canonical one: the numbers are checked structurally and the coverage says so');
  assert.match(det.coverage.oracle.note, /no trusted expected values/);
});

test('a headless capture is a trace and nothing else: synthetic, no pixels, no key, no hash of a picture, and the program ran at the case\'s own time and inputs', async () => {
  const { cases } = buildPlanCaptureCases(plan, composition, artifacts);
  const captures = await headlessCaptureCard({})({ composition, artifacts, cases });
  for (const [i, c] of captures.entries()) {
    assert.deepEqual([c.synthetic, c.completeCard, c.png, c.key, c.sha256, c.compositionHash], [true, false, undefined, undefined, null, composition.envelopeHash]);
    assert.equal(c.caseId, cases[i].id);
    assert.equal(c.trace.time, cases[i].time);
    assert.match(c.trace.frameHash, /^[0-9a-f]{64}$/);
    assert.ok(Object.keys(c.trace.quantities).length && c.trace.objects.length);
  }
});

test('INTERACT_RUN: unset or browser keeps the job\'s own capture seam, headless replaces it, anything else is refused', async () => {
  const seam = async () => [];
  const role = { env: {}, captureCard: seam };
  assert.equal(captureRole(role), role);
  assert.equal(captureRole({ ...role, env: { INTERACT_RUN: 'browser' } }).captureCard, seam);
  const headless = captureRole({ ...role, env: { INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow' } });
  assert.notEqual(headless.captureCard, seam);
  assert.equal(typeof headless.captureCard, 'function');
  assert.throws(() => captureRole({ ...role, env: { INTERACT_RUN: 'Headless' } }), /INTERACT_RUN must be browser or headless/);
  assert.throws(() => captureRole({ ...role, env: { INTERACT_RUN: 'headless' } }), /needs INTERACT_REVIEW=shadow/, 'no pixels for the gating review');
});
