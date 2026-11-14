import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateProgram, TEMPLATES } from '../../web/src/interact-templates/generate.js';
import { curveBriefs } from '../../web/src/interact-curve-briefs.js';
import { curveSliders, expandBrief, extractBrief } from '../../web/src/interact-family-curve-sliders.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { planHash } from '../../web/src/interact-plan.js';
import { buildInput, validateBuildOutput } from '../src/interact-build.js';
import { buildPlanCaptureCases, headlessCaptureCard, checkSceneAgainstPlan } from '../src/interact-checks.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { fillSystem } from '../src/interact-design-fill.js';
import { briefSchema } from '../../web/src/interact-plan-brief.js';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { parseGuestResult } from '../../web/src/explain-program/contract.js';
import { frameOverlaps } from '../../web/src/explain-program/frame-overlap.js';

const { referenceCapabilities: capabilities } = await interactFixtures();
const engine = await loadEngine();
const plans = Object.fromEntries(['brief', 'balanced', 'detailed'].map(depth => [depth, expandBrief(curveBriefs[depth], depth, { catalogueHash: capabilities.catalogueHash })]));
const ctx = { ...fixtureContext(), adapters: {}, adapter: undefined };
const generated = plan => generateProgram(plan, buildInput({}, plan, 'hash'));
async function run(plan, program) {
  const job = { id: 'curve', plan, planHash: await planHash(plan), capabilities };
  const built = await validateBuildOutput(job, { main: { kind: 'program', program }, supporting: [] }, ctx);
  assert.ok(built.artifacts, JSON.stringify(built.details ?? built.problems));
  const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
  const captures = await headlessCaptureCard({})({ ...built, cases: [...cases, ...probes] });
  const det = checkSceneAgainstPlan({ ...built, plan, captures, cases, probes, oracle: null, allowPartialCard: true });
  assert.deepEqual(det.problems, [], JSON.stringify(det.problems));
  const full = captures.map(c => {
    const captureCase = [...cases, ...probes].find(x => x.id === c.caseId);
    const inputs = captureCase.inputs;
    const result = runProgram(engine, { source: program.source, sdkVersion: 'sdk-8', operation: 'evaluate', request: { requestId: c.caseId, inputs, time: 0, seed: 1, state: null } });
    assert.equal(result.ok, true, JSON.stringify(result));
    const parsed = parseGuestResult(result.value, program.manifest, 'sdk-8');
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.deepEqual(frameOverlaps(result.value.frame, 100), [], c.caseId);
    return { caseId: c.caseId, inputs, ...result.value };
  });
  return { built, captures, full };
}

test('the sealed curve has analytic samples, a clipped analytic tangent and less than two pixels chord error across the slider corners', () => {
  const program = generated(plans.detailed);
  for (const k of [0.5, 1, 3]) for (const x0 of [-2, 0, 2]) for (const xMarker of [-6, 0, 1, 6]) {
    const inputs = { k, x0, xMarker }, result = runProgram(engine, { source: program.source, sdkVersion: 'sdk-8', operation: 'evaluate', request: { requestId: 'corners', inputs, time: 0, seed: 1, state: null } });
    assert.equal(result.ok, true);
    assert.deepEqual(frameOverlaps(result.value.frame, 100), [], JSON.stringify(inputs));
    const plot = result.value.frame.objects.find(o => o.id === 'plot.curve');
    const points = plot.series[0].points, f = x => 1 / (1 + Math.exp(-k * (x - x0)));
    assert.equal(points.length, 24); assert.equal(points[0].x, -6); assert.equal(points.at(-1).x, 6);
    assert.ok(points.some(p => p.x === xMarker));
    for (const p of points) assert.ok(Math.abs(p.y - f(p.x)) < 1e-12);
    for (let i = 1; i < points.length; i++) for (const fraction of [0.25, 0.5, 0.75]) {
      const a = points[i - 1], b = points[i], x = a.x + (b.x - a.x) * fraction;
      assert.ok(Math.abs(f(x) - (a.y + (b.y - a.y) * fraction)) * 206 < 2);
    }
    const derivative = k * f(xMarker) * (1 - f(xMarker));
    for (const p of plot.series[1].points) {
      assert.ok(p.x >= -6 && p.x <= 6 && p.y >= 0 && p.y <= 1);
      assert.ok(Math.abs(p.y - (f(xMarker) + derivative * (p.x - xMarker))) < 1e-12);
    }
  }
});

test('curve axes come from the formula interval, including for a polynomial rather than a logistic', () => {
  const plan = structuredClone(plans.detailed);
  const rules = { y: 'k*x^2+x0', slope: '2*k*x', yAtMarker: 'k*xMarker^2+x0' };
  for (const q of plan.scene.quantities) if (rules[q.id]) q.formula = rules[q.id];
  const program = generated(plan);
  const result = runProgram(engine, { source: program.source, sdkVersion: 'sdk-8', operation: 'evaluate', request: { requestId: 'polynomial', inputs: { k: 3, x0: 2, xMarker: 1 }, time: 0, seed: 1, state: null } });
  assert.equal(result.ok, true);
  const axis = result.value.frame.objects.find(o => o.id === 'plot.curve').axes.y;
  assert.ok(axis.min <= -2 && axis.max >= 3 * 6 ** 2 + 2);
  assert.equal(result.value.quantities.yAtMarker, 3 * 1 ** 2 + 2);
});
const near = (a, b, path = '') => {
  if (typeof a === 'number' && typeof b === 'number') return assert.ok(Math.abs(a - b) <= 1e-6, path + ': ' + a + ' vs ' + b);
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path);
    for (const key of Object.keys(a)) near(a[key], b[key], path + '.' + key);
  } else assert.equal(a, b, path);
};
test('all curve templates are registered without replacing any toss template', () => {
  for (const id of ['one-body', 'two-lane', 'body-plot', 'curve-one', 'curve-compare', 'curve-readouts']) assert.ok(TEMPLATES[id], id);
});
test('the new fill contract uses depth-aware rules and no toss names or gravity limits for a curve', () => {
  for (const [depth, plan] of Object.entries(plans)) {
    const text = fillSystem(depth, briefSchema(depth, curveSliders), curveSliders);
    assert.doesNotMatch(text, /launchSpeed|gravity: every|marker time/);
    assert.equal(typeof curveSliders.formulaRules, 'function');
    // The fill's whitelist excludes the hidden fixed constants; the fixture
    // formulas write those as literals, so there are no contradictory names.
    const names = ['x', ...curveSliders.FAMILY.depths[depth].inputs.map(([id]) => id)];
    assert.ok(text.includes('names ' + names.join(', ')));
    const formulaText = Object.values(extractBrief(plan).formulas).map(f => f.formula).join(' ');
    if (depth === 'brief') assert.doesNotMatch(formulaText, /\bx0\b|\bxMarker\b/);
    if (depth === 'balanced') assert.doesNotMatch(formulaText, /\bxMarker\b/);
  }
});
for (const [depth, plan] of Object.entries(plans)) {
  test(depth + ': template and handwritten reference have identical complete frames at every capture', async () => {
    const { curveDraft } = await import('../../web/src/interact-curve-programs.js');
    const a = await run(plan, curveDraft(depth).main.program), b = await run(plan, generated(plan));
    assert.ok(a.full.length >= 5);
    for (const frame of a.full) near(frame, b.full.find(g => g.caseId === frame.caseId), depth + '.' + frame.caseId);
    const rebuilt = expandBrief(extractBrief(plan), depth, { catalogueHash: capabilities.catalogueHash });
    const c = await run(rebuilt, generated(rebuilt));
    near(b.full, c.full, depth + '.roundtrip');
  });
  test(depth + ': marker, tangent, subtitle and value ownership follow the approved depth rules', async () => {
    const { full } = await run(plan, generated(plan));
    for (const r of full) {
      assert.equal(r.frame.width, 640);
      const objects = r.frame.objects, plot = objects.find(o => o.id === 'plot.curve'), marker = objects.find(o => o.id === 'ball.marker');
      assert.ok(plot && marker); assert.equal(plot.kind, 'plot'); assert.equal(marker.kind, 'circle');
      assert.equal(plot.series.length, depth === 'brief' ? 1 : 2);
      assert.deepEqual(r.frame.readouts.map(v => v.id), plan.scene.readoutIds);
      const at = r.quantities.xMarker, y = 1 / (1 + Math.exp(-r.quantities.k * (at - r.quantities.x0)));
      assert.ok(Math.abs(r.quantities.yAtMarker - y) < 1e-12);
      assert.ok(Math.abs(r.quantities.slope - r.quantities.k * y * (1 - y)) < 1e-12);
      const lines = objects.filter(o => /^callout\.marker\.l/.test(o.id));
      assert.ok(lines.some(o => o.text.includes(at.toFixed(1).replace('-', '−'))));
      assert.ok(lines.every(o => !/y =|Slope =|dy\/dx/.test(o.text)));
      const state = objects.find(o => o.id === 'scene.state').text;
      assert.equal(state, r.quantities.k < curveBriefs[depth].k.default ? plan.scene.words.state_gentler : r.quantities.k > curveBriefs[depth].k.default ? plan.scene.words.state_steeper : plan.scene.words.state_default);
      assert.equal(plot.axes.y.min, 0); assert.equal(plot.axes.y.max, 1);
      if (depth !== 'brief') assert.deepEqual(plot.series.map(s => s.label), [plan.scene.words.legend_curve, plan.scene.words.legend_tangent]);
    }
  });
}
