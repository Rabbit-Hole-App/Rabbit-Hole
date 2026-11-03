// OFFLINE FIXTURE tests, no model call: test/fixtures/animation-mvp1-correction-fixture.json is a hand-built SGD scene (derived from the
// repaired draft of aj_086fd46) that shows the MVP1 v2 correction together on the real validators and the real pinned engine: four readouts,
// arrows at one disclosed scale, a zero update hidden and shown as 0, an off-plot marker at the true boundary crossing, off plot told apart
// from diverged, disclosures kept. Every expected number is computed here from the model (the loss, the update rule, the plan's numbers),
// not read from the program's own output. This proves how these rules look and compute on this one scene and that the qualification check
// can fail; it does NOT prove that a model's future generation keeps them (owner 2026-11-02, answers 4, 5 and 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runReviewProgram, REVIEW_LIMITS } from '../../web/src/animation3d/review.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { pendulumDemo } from '../../web/src/animation3d/pendulum-demo.js';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';
import { clientProblems, sealArtifact, validateStage } from '../src/animation-author.js';
import { ANIMATION_CAPTURE, captureManifest, captureViews, chosenManifest, middleOf } from '../src/animation-render.js';
import { DEFAULT_IDS, candidatesOf, fullBatchAfter, qualifySgd } from '../animation-sgd-qualification.mjs';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const fixture = read('animation-mvp1-correction-fixture.json'), savedJob = read('animation-aj_086fd46.json');
const PROMPT = savedJob.prompt;

// ---- the model, written here: loss L = 0.5 (A w^2 + C b^2), update = -lr * gradient; the plan: steeper along the intercept ----
const A = 0.5, C = 2, START = [-2.8, 1.3], WM = 4, BM = 2, LIMIT = 2 / C, DEFAULT_LR = 0.3, UPDATE_EVERY = 8;
const loss = (w, b) => 0.5 * (A * w * w + C * b * b);
const surfaceY = (w, b) => 0.4 * loss(w, b); // the bowl's drawn height: 0.1 w^2 + 0.4 b^2
const full = (w, b, lr) => [-lr * A * w, -lr * C * b]; // the full-batch update at (w, b)
const norm = v => Math.hypot(v[0], v[1]);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} is not ${b}`);
// The segment p -> p + d leaves the box |w| <= 4, |b| <= 2 where it first crosses an edge.
function crossing(p, d) {
  let t = 1;
  [[p[0], d[0], WM], [p[1], d[1], BM]].forEach(([x, dx, m]) => { if (dx > 0 && x + dx > m) t = Math.min(t, (m - x) / dx); if (dx < 0 && x + dx < -m) t = Math.min(t, (-m - x) / dx); });
  return [p[0] + t * d[0], p[1] + t * d[1]];
}

// ---- the real engine ----
let engine;
const workerFactory = () => {
  const worker = { terminated: false, terminate() { worker.terminated = true; },
    postMessage(message) { queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...runProgram(engine, message) } }); }); } };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
let sealed;
const sgd = async () => {
  engine ??= await loadEngine();
  if (!sealed) {
    const v = await validateStage({ prompt: PROMPT, evidence: [], context: null, plan: fixture.plan, planHash: fixture.planHash, resultId: fixture.resultId, approval: { at: fixture.approvalAt }, draft: fixture.draft, calls: [], features: ['curve_radius'] }, { env: {} });
    assert.equal(v.problems, undefined, JSON.stringify(v.problems));
    sealed = { ...v, hash: v.artifactHash };
  }
  return sealed;
};
const runOn = async (artifact, hash, inputs, { events = [], leadTicks = 0, ticks = 0, time = 0 } = {}) => {
  engine ??= await loadEngine();
  const r = await runReviewProgram({ artifact, artifactHash: hash, view: captureViews(artifact)[0], inputs, time, events, leadTicks, ticks, seed: artifact.seed, theme: 'light', width: 960, height: 540 }, { workerFactory });
  assert.ok(r.ok, JSON.stringify(r));
  return { readouts: r.trace.readouts, nodes: r.frame.nodes };
};
const DEFAULTS = { learningRate: DEFAULT_LR, batchSize: '4', showTrueGradient: true };
const run = async (inputs = {}, options = {}) => { const { artifact, hash } = await sgd(); return runOn(artifact, hash, { ...DEFAULTS, ...inputs }, options); };
const FULL_BATCH = { batchSize: '64' };
const oneStep = { type: 'action', action: 'oneStep' }, keepPath = { type: 'action', action: 'keepPath' };
const drag = (type, value) => ({ type, node: 'start', value });
// The drawing scale, read from the artifact's own disclosure (assumptions[3]: "2 units of length per 1.0 of update").
const scaleOf = artifact => Number(/(\d+(?:\.\d+)?) units of length per 1\.0 of update/.exec(artifact.assumptions.join(' '))?.[1]);
// A node's arrow: [update vector in (w, b), drawn length] from its frame (an arrow points along its local +Y).
const arrowOf = (nodes, id, K) => {
  const f = nodes[id]; if (f.visible === false) return null;
  const [x, y, z, w] = f.quaternion, dir = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  assert.ok(Math.abs(dir[1]) < 1e-9, 'a horizontal arrow');
  return { vector: [dir[0] * f.scale[1] / K, dir[2] * f.scale[1] / K], length: f.scale[1], thickness: f.scale[0] };
};
const numberIn = text => Number(/(-?[\d.]+(?:e-?\d+)?)$/.exec(text)[1]);
const withinDigits = (shown, truth) => assert.ok(Math.abs(shown - truth) <= 0.0501 * Math.abs(truth) || shown === truth, `label ${shown} vs ${truth}`);

test('the fixture is labelled an offline fixture, passes the real validators, and the browser gate still applies to its tubes', async () => {
  assert.match(fixture.offlineFixture, /OFFLINE FIXTURE.*NOT generated by a model/);
  assert.match(fixture.draft.title, /^Offline fixture:/);
  assert.match(fixture.draft.description, /^OFFLINE FIXTURE, not generated by a model/);
  assert.match(fixture.plan.description, /^OFFLINE FIXTURE, not generated by a model/);
  const { artifact, hash } = await sgd(); // validateStage: program, plan binding, browser features, the contract, the review and repair request sizes
  assert.equal(artifact.provenance.origin, 'generated', 'sealed like any draft; the label is in the title, description and assumption 1');
  assert.match(artifact.assumptions[0], /^Offline fixture, not generated by a model\. Simplified simulation/);
  assert.equal(validateAnimationArtifact(artifact).ok, true);
  assert.equal(await sha256Hex(canonicalJson(artifact)), hash);
  const tubes = artifact.scene.geometries.filter(g => g.kind === 'curve');
  assert.ok(tubes.length >= 6 && tubes.every(g => g.radius === 0.04), 'a bowl wireframe of tube curves');
  assert.equal(artifact.scene.geometries.some(g => g.kind === 'cylinder' && /^c\d/.test(g.id)), false, 'no stacked filled discs');
  // The gate: a browser that did not say curve_radius is never given this scene (animation-job.js), and validation names the fix.
  assert.ok(clientProblems(artifact, {}).length >= 6);
  assert.equal(clientProblems(artifact, { features: ['curve_radius'] }).length, 0);
});

test('four readouts at the start, with correct values and truthful zeros', async () => {
  const { artifact } = await sgd();
  assert.deepEqual(artifact.readouts.map(r => r.id).sort(), ['dist', 'loss', 'passes', 'stepNo']);
  const { readouts, nodes } = await run();
  assert.deepEqual(readouts, { loss: loss(...START), dist: norm(START), stepNo: 0, passes: 0 });
  assert.equal(nodes.status.text, 'Ready');
  // Before any step the passes through the data are 0: a real zero, not a placeholder (the quantity exists and is 0).
  const { artifact: a2, hash } = await sgd();
  const one = await runOn(a2, hash, { ...DEFAULTS, batchSize: '16' }, { events: [oneStep, oneStep, oneStep] });
  assert.deepEqual([one.readouts.stepNo, one.readouts.passes], [3, 3 * 16 / 64], 'passes = steps x batch size / 64');
});

// Low, default and near-zero magnitudes: the learning rate sets the size of every update; the near-zero one is a full-batch run that has
// almost reached the lowest point. The full-batch update is noise-free, so its whole path is the closed form of the update rule.
const MAGNITUDES = [['low (0.01)', 0.01, 4], ['default (0.3)', DEFAULT_LR, 4], ['near zero (0.5, 11 steps)', 0.5, 11]];
for (const [name, lr, k] of MAGNITUDES) {
  test(`magnitude ${name}: four readouts, proportional arrows at the disclosed scale, labels that read the true size`, async () => {
    const { artifact } = await sgd(), K = scaleOf(artifact);
    assert.equal(K, 2, 'the disclosed drawing scale');
    const events = k <= 4 ? Array(k).fill(oneStep) : [], ticks = k <= 4 ? 0 : k * UPDATE_EVERY;
    const { readouts, nodes } = await run({ ...FULL_BATCH, learningRate: lr }, { events, ticks });
    const { w, b } = fullBatchAfter(k, lr);
    assert.deepEqual(readouts.stepNo, k);
    near(readouts.passes, k * 64 / 64);
    near(readouts.loss, loss(w, b));
    near(readouts.dist, norm([w, b]));
    const update = full(w, b, lr), grey = arrowOf(nodes, 'trueArrow', K), orange = arrowOf(nodes, 'stepArrow', K);
    // Both arrows include the learning rate: length = scale x |update|, direction = the update's; full batch means no noise, so they coincide.
    for (const arrow of [grey, orange]) {
      near(arrow.length, K * norm(update), 1e-9);
      near(arrow.vector[0], update[0], 1e-9); near(arrow.vector[1], update[1], 1e-9);
      assert.equal(arrow.thickness, 2, 'one constant thickness: only length carries the magnitude');
    }
    // Labels name the quantity for what it is and show its true size.
    assert.match(nodes.lblStep.text, /^noisy update /); assert.match(nodes.lblTrue.text, /^full-batch update /);
    withinDigits(numberIn(nodes.lblStep.text), norm(update)); withinDigits(numberIn(nodes.lblTrue.text), norm(update));
    // No minimum length: the old programs drew at least 0.3 or 0.5 whatever the step; a small update is drawn small.
    if (norm(update) * K < 0.3) assert.ok(orange.length < 0.3, `drawn ${orange.length}`);
  });
}

test('one constant scale across magnitudes: arrow length / (learning rate x |gradient|) is the same at low, default and near-zero', async () => {
  const { artifact } = await sgd(), K = scaleOf(artifact), ratios = [];
  for (const [, lr, k] of MAGNITUDES) {
    const { nodes } = await run({ ...FULL_BATCH, learningRate: lr }, k <= 4 ? { events: Array(k).fill(oneStep) } : { ticks: k * UPDATE_EVERY });
    const { w, b } = fullBatchAfter(k, lr);
    ratios.push(arrowOf(nodes, 'stepArrow', K).length / (lr * norm([A * w, C * b])));
  }
  ratios.forEach(r => near(r, K));
});

test('the noisy arrow is the update the next step really takes, and differs from the full-batch update when the batch is small', async () => {
  const { artifact } = await sgd(), K = scaleOf(artifact);
  for (const batchSize of ['1', '4', '16']) {
    const before = await run({ batchSize }, { events: [oneStep, oneStep] }), after = await run({ batchSize }, { events: [oneStep, oneStep, oneStep] });
    const [w, b] = [before.nodes.ball.position[0], before.nodes.ball.position[2]], u = arrowOf(before.nodes, 'stepArrow', K).vector, g = arrowOf(before.nodes, 'trueArrow', K).vector;
    near(after.nodes.ball.position[0], w + u[0], 1e-9); near(after.nodes.ball.position[2], b + u[1], 1e-9); // the step taken is the arrow shown, divided by the scale
    near(g[0], -DEFAULT_LR * A * w, 1e-9); near(g[1], -DEFAULT_LR * C * b, 1e-9); // the grey arrow is minus lr x the exact gradient at the same spot
    assert.ok(Math.hypot(u[0] - g[0], u[1] - g[1]) > 1e-3, `batch ${batchSize}: the noisy update differs from the full-batch update`);
    assert.equal(after.readouts.stepNo, 3);
  }
  // At the full batch the noise is exactly 0: the two arrows are the same vector.
  const f = await run(FULL_BATCH, { events: [oneStep, oneStep] }), u = arrowOf(f.nodes, 'stepArrow', K), g = arrowOf(f.nodes, 'trueArrow', K);
  near(u.vector[0], g.vector[0]); near(u.vector[1], g.vector[1]);
});

test('a zero update: the arrow is hidden, its label and quantity read 0, nothing is drawn at a minimum length', async () => {
  // Learning rate 0.5 on this bowl takes b to 0 in one full-batch step (1 - 0.5 x 2 = 0); the start dragged to w = 0 then sits exactly on the lowest point.
  const { readouts, nodes } = await run({ ...FULL_BATCH, learningRate: 0.5 }, { events: [drag('drag_start', 0), drag('drag_move', 0), drag('drag_end', 0), oneStep] });
  assert.deepEqual(readouts, { loss: 0, dist: 0, stepNo: 1, passes: 1 });
  assert.equal(nodes.stepArrow.visible, false); assert.equal(nodes.trueArrow.visible, false);
  assert.equal(nodes.lblStep.text, 'noisy update 0'); assert.equal(nodes.lblTrue.text, 'full-batch update 0');
  assert.equal(nodes.lblStep.visible, true, 'the 0 stays shown');
  // The same state with a tiny nonzero update is drawn, at its true tiny length.
  const { artifact } = await sgd(), K = scaleOf(artifact);
  const tiny = await run({ ...FULL_BATCH, learningRate: 0.01 }, { events: [drag('drag_start', 0.01), drag('drag_end', 0.01)] });
  const u = full(0.01, START[1], 0.01);
  near(arrowOf(tiny.nodes, 'stepArrow', K).length, K * norm(u));
  // The scale bar is a fixed labelled rod: no arrowhead (not an arrow geometry), and its length is the scale x 1.0.
  const bar = artifact.scene.nodes.find(n => n.id === 'bar'), geometry = artifact.scene.geometries.find(g => g.id === bar.geometry);
  assert.equal(geometry.kind, 'box'); assert.equal(geometry.size[0], K * 1.0);
  assert.match(artifact.scene.geometries.find(g => g.id === 'lBar').text, /^Scale bar: an update of 1\.0 is this long$/);
});

test('off plot: the marker is where the step crosses the edge, the readouts keep the true values, and the status is Diverged only above the learning-rate limit', async () => {
  const { artifact } = await sgd(), K = scaleOf(artifact);
  // The owner's audited step: (-2.8, 1.3) -> (0.7, -5.2) at learning rate 2.5, full batch, crosses b = -2 near (-1.0231, -2), not (0.7, -2).
  const u = full(START[0], START[1], 2.5), landing = [START[0] + u[0], START[1] + u[1]], exit = crossing(START, u);
  near(landing[0], 0.7); near(landing[1], -5.2); near(exit[0], -1.0231, 1e-4); near(exit[1], -2);
  const { readouts, nodes } = await run({ ...FULL_BATCH, learningRate: 2.5 }, { events: [oneStep] });
  near(nodes.exitM.position[0], exit[0]); near(nodes.exitM.position[2], exit[1]);
  near(nodes.exitM.position[1], surfaceY(exit[0], exit[1]) + 0.06, 1e-9);
  assert.ok(Math.hypot(nodes.exitM.position[0] - 0.7, nodes.exitM.position[2] + 2) > 1, 'not the independently clamped (0.7, -2)');
  assert.equal(nodes.ball.visible, false, 'the ball is not drawn at a clamped position');
  near(readouts.loss, loss(...landing)); near(readouts.dist, norm(landing)); // the true landing, outside the plot
  assert.equal(readouts.stepNo, 1);
  assert.equal(nodes.stepArrow.visible, false, 'a stopped run has no next step to draw');
  assert.match(nodes.status.text, /^Diverged at step 1: off plot, learning rate above 1\.0$/);
  assert.equal(LIMIT, 1);
  // The edge it names is drawn: the rim curve passes through the marker's point on the surface (the b = -2 edge).
  const rim = artifact.scene.geometries.find(g => g.id === 'gedge');
  assert.ok(rim.points.some(p => p[2] === -2) && rim.points.some(p => p[0] === 4));
  // Off plot below the limit (batch 1 at learning rate 0.8, 9 steps): stopped, NOT called diverged; the marker is the segment's crossing.
  const before = await run({ batchSize: '1', learningRate: 0.8 }, { leadTicks: 8 * UPDATE_EVERY }), p = [before.nodes.ball.position[0], before.nodes.ball.position[2]];
  const d = arrowOf(before.nodes, 'stepArrow', K).vector, to = [p[0] + d[0], p[1] + d[1]], e = crossing(p, d);
  assert.ok(Math.abs(to[0]) > WM || Math.abs(to[1]) > BM, 'step 9 lands outside the plot');
  const off = await run({ batchSize: '1', learningRate: 0.8 }, { leadTicks: 8 * UPDATE_EVERY, events: [oneStep] });
  near(off.nodes.exitM.position[0], e[0]); near(off.nodes.exitM.position[2], e[1]);
  assert.ok(Math.abs(Math.abs(e[0]) - WM) < 1e-9 || Math.abs(Math.abs(e[1]) - BM) < 1e-9, 'on an edge');
  near(off.readouts.loss, loss(...to)); near(off.readouts.dist, norm(to));
  assert.match(off.nodes.status.text, /^Off plot at step 9: stopped, not proven diverged$/);
  assert.doesNotMatch(off.nodes.status.text, /Diverged/);
  // At the limit itself (1.0) b only flips sign: nothing leaves the plot and nothing is called diverged.
  const edge = await run({ ...FULL_BATCH, learningRate: 1.0 }, { ticks: 90 });
  assert.equal(edge.nodes.exitM.visible, false); assert.equal(edge.nodes.status.text, 'Running');
});

test('Keep Path after a path exists keeps a non-empty saved path and starts a fresh run; further steps draw a new current path', async () => {
  const before = await run({}, { events: [oneStep, oneStep, oneStep] });
  const dots = (nodes, prefix) => Array.from({ length: 40 }, (_, i) => nodes[`${prefix}${i}`]).filter(n => n?.visible).map(n => n.position);
  const path = dots(before.nodes, 'p');
  assert.equal(path.length, 3);
  const kept = await run({}, { events: [oneStep, oneStep, oneStep, keepPath] });
  assert.deepEqual(dots(kept.nodes, 'o'), path, 'the saved path is the previous current path');
  assert.equal(dots(kept.nodes, 'p').length, 0); assert.equal(kept.readouts.stepNo, 0);
  assert.deepEqual([kept.readouts.loss, kept.readouts.passes], [loss(...START), 0]);
  const further = await run({}, { events: [oneStep, oneStep, keepPath, oneStep], ticks: 3 * UPDATE_EVERY });
  assert.equal(dots(further.nodes, 'o').length, 2); assert.equal(dots(further.nodes, 'p').length, 4); assert.equal(further.readouts.stepNo, 4);
  // Other parameters stay as set: the saved path is untouched by further steps and by the comparison arrow toggle.
  assert.equal(further.nodes.trueArrow.visible, true);
  // A capture is bounded to 4 events and 90 steps (11 updates), so 40 points are not reachable here: the cap is checked in the program text.
  assert.equal((fixture.draft.program.source.match(/slice\(-40\)/g) || []).length, 1);
});

test('what the general sampler draws for this scene: initial, the middle learning rate after a path and Keep Path, and the high end, within the capture limits', async () => {
  const { artifact } = await sgd(), manifest = captureManifest(artifact);
  assert.deepEqual(manifest.coverage.views, ['default', 'side']);
  const labels = manifest.coverage.sampled.map(s => s.label);
  assert.equal(labels[0], 'initial');
  assert.match(labels[1], /^learningRate at 0\.16: 60 steps, then oneStep, keepPath, then 30 steps$/);
  assert.equal(middleOf(artifact.parameters[0]), 0.16);
  assert.match(labels[2], /^learningRate at its high end \(2\.5\), after 90 steps$/);
  assert.ok(manifest.entries.length <= 6);
  for (const e of manifest.entries) assert.ok(e.events.length <= ANIMATION_CAPTURE.maxEvents && e.ticks <= ANIMATION_CAPTURE.maxTicks);
  // Run the middle state as the sampler specifies it (steps, keep path, further steps): a saved path exists and the current path is non-empty.
  const mid = manifest.entries.find(e => e.id === 'v0-s1'), { hash } = await sgd();
  const r = await runOn(artifact, hash, mid.inputs, { events: mid.events, leadTicks: mid.leadTicks, ticks: mid.ticks });
  assert.ok(Array.from({ length: 40 }, (_, i) => r.nodes[`o${i}`]).filter(n => n?.visible).length >= 1, 'a saved path to compare with');
  assert.ok(Array.from({ length: 40 }, (_, i) => r.nodes[`p${i}`]).filter(n => n?.visible).length >= 1);
  assert.equal(r.nodes.trueArrow.visible, true, 'the comparison arrow stays on');
  assert.equal(mid.inputs.batchSize, '4'); assert.equal(mid.inputs.showTrueGradient, true); // only the main control varies
  // The three owner-chosen review states fit the limits of an offline chosen run (6 captures, 4 events, 90 steps each).
  const states = [{ label: 'initial', inputs: {} }, { label: 'mid', inputs: { learningRate: 0.16 }, events: [oneStep, oneStep, keepPath, oneStep], ticks: 30 }, { label: 'high', inputs: { learningRate: 2.5 }, ticks: 90 }];
  const chosen = chosenManifest(artifact, states);
  assert.equal(chosen.entries.length, 3);
  assert.ok(chosen.entries.every(e => e.events.length <= REVIEW_LIMITS.events && e.ticks <= REVIEW_LIMITS.ticks));
});

test('disclosures are preserved: the simplification first, simulated noise, the plan limitations unchanged, the new arrow, scale and edge rules stated', async () => {
  const { artifact } = await sgd(), text = artifact.assumptions.join('\n');
  assert.match(artifact.assumptions[0], /Simplified simulation: an idealized loss bowl with simulated batch noise, not a model trained on real data/);
  assert.match(text, /A noisy step can raise the full-data loss; it falls only on average/);
  assert.match(text, /exactly 0 at B=64/);
  assert.match(text, /2 units of length per 1\.0 of update/); assert.match(text, /no minimum or maximum length/); assert.match(text, /An update of 0 has no arrow; its label reads 0/);
  assert.match(text, /Diverged only if the learning rate is above 1\.0, else Off plot/); assert.match(text, /readouts keep true values/);
  assert.match(text, /Dragging the start moves it along w only/); assert.match(text, /New run, keep old path draws new noise/);
  // The approved plan's limitations, and its first assumptions, are the saved plan's, word for word.
  assert.deepEqual(fixture.plan.limitations, savedJob.plan.limitations);
  assert.deepEqual(fixture.plan.assumptions.slice(0, 3), savedJob.plan.assumptions.slice(0, 3));
  // An update is never called "the gradient": labels, node names, parameter label, plan arrow assumption and the artifact's arrow assumption.
  const shown = [artifact.parameters[2].label, ...artifact.scene.nodes.map(n => n.name ?? ''), ...artifact.scene.geometries.filter(g => g.kind === 'label').map(g => g.text), fixture.plan.parameters[2].label];
  shown.forEach(t => assert.doesNotMatch(t, /(^|[^-])gradient/i, t));
  assert.match(fixture.plan.assumptions[4], /noisy update \(minus learning rate times noisy gradient\)\. Grey arrow: the full-batch update/);
  assert.equal(fixture.plan.assumptions[4].includes('shows the step actually taken'), false);
  assert.equal(artifact.parameters[2].id, 'showTrueGradient', 'the toggle keeps the plan id; only its label changed');
});

// ---- the qualification check (animation-sgd-qualification.mjs) ----
const sealOf = async draft => sealArtifact(draft, { artifactId: fixture.resultId, planHash: fixture.planHash, createdAt: new Date(fixture.approvalAt).toISOString() });
const mutant = async (change) => { const draft = structuredClone(fixture.draft); change(draft); return sealOf(draft); };
const failed = result => result.checks.filter(c => !c.ok).map(c => `${c.name} ${c.detail ?? ''}`).join(' | ');

test('qualification: the fixture passes; step, passes through data, loss and distance exist with correct values', async () => {
  const result = await qualifySgd((await sgd()).artifact);
  assert.equal(result.ok, true, failed(result));
  assert.ok(result.checks.length >= 9);
  assert.deepEqual(DEFAULT_IDS.readouts, { step: 'stepNo', passes: 'passes', loss: 'loss', dist: 'dist' });
});

test('qualification: the saved repaired draft of aj_086fd46 fails on the missing passes readout, before and after repair', async () => {
  const candidates = await candidatesOf(savedJob);
  assert.deepEqual(candidates.map(c => c.name), ['author draft (before repair)', 'repaired draft (after repair)']);
  for (const { name, artifact } of candidates) {
    const result = await qualifySgd(artifact);
    assert.equal(result.ok, false, name);
    const bad = result.checks.filter(c => !c.ok);
    assert.ok(bad.some(c => /readout passes: declared with id passes/.test(c.name) && /loss, dist, stepNo/.test(c.detail)), `${name}: names the missing readout and the ones declared`);
    assert.ok(bad.every(c => /passes/.test(`${c.name} ${c.detail}`)), `${name}: the other three readouts are correct, so only passes fails: ${failed(result)}`);
    // step, loss and distance have correct values in the saved draft: those checks themselves still pass.
    assert.ok(result.checks.filter(c => /^readout (step|loss|dist)/.test(c.name)).every(c => c.ok));
  }
});

test('qualification: wrong values fail too (a wrong passes formula, a doubled loss, an off-by-one step, a renamed id, a repair that drops a readout)', async () => {
  const src = fixture.draft.program.source;
  const cases = [
    ['passes formula', d => { d.program.source = src.replace('passes:s.k*B/64', 'passes:s.k*B/32'); }, /passes \(passes\): got/],
    ['doubled loss', d => { d.program.source = src.replace('loss:Lf(s.w,s.b)', 'loss:2*Lf(s.w,s.b)'); }, /loss \(loss\): got/],
    ['step off by one', d => { d.program.source = src.replace('stepNo:s.k,', 'stepNo:s.k+1,'); }, /step \(stepNo\): got/],
    ['wrong distance', d => { d.program.source = src.replace('dist:Math.hypot(s.w,s.b)', 'dist:Math.abs(s.w)+Math.abs(s.b)'); }, /dist \(dist\): got/],
    ['renamed readout id', d => { d.readouts.find(r => r.id === 'passes').id = 'passesThroughData'; d.program.source = src.replace('passes:s.k', 'passesThroughData:s.k'); }, /readout passes: declared with id passes/],
    ['repair drops a readout', d => { d.readouts = d.readouts.filter(r => r.id !== 'passes'); }, /readout passes: declared with id passes/],
    ['keep path forgets to reset the step', d => { d.program.source = src.replace('return fresh(s.w0,s.run+1,s.path);', 'return {...fresh(s.w0,s.run+1,s.path),k:s.k};'); }, /after Keep Path/],
  ];
  for (const [name, change, pattern] of cases) {
    const result = await qualifySgd(await mutant(change));
    assert.equal(result.ok, false, name);
    assert.match(failed(result), pattern, name);
  }
  // The same rename passes once the ids are given explicitly (ids are options, never guessed from labels).
  const renamed = await mutant(d => { d.readouts.find(r => r.id === 'passes').id = 'passesThroughData'; d.program.source = src.replace('passes:s.k', 'passesThroughData:s.k'); });
  assert.equal((await qualifySgd(renamed, { ids: { readouts: { passes: 'passesThroughData' } } })).ok, true);
});

// ---- non-SGD regression: the shared changes (tube curves, the sampler, the validators, the engine) leave an unrelated scene alone ----
test('non-SGD regression: the saved pendulum scene validates, samples and computes as before, and the SGD check refuses it without crashing', async () => {
  engine ??= await loadEngine();
  const artifact = pendulumDemo.artifact, hash = await sha256Hex(canonicalJson(artifact));
  assert.equal(validateAnimationArtifact(artifact).ok, true);
  assert.deepEqual(clientProblems(artifact, {}), [], 'no tube curve, so an older browser may be given it');
  const manifest = captureManifest(artifact), labels = manifest.coverage.sampled.map(s => s.label);
  assert.equal(labels[0], 'initial');
  assert.match(labels[1], /^length at /); assert.match(labels[2], /high end/);
  assert.ok(manifest.entries.length <= 6);
  const lengths = new Set();
  for (const e of manifest.entries) {
    const r = await runOn(artifact, hash, e.inputs, { time: e.time, events: e.events, leadTicks: e.leadTicks, ticks: e.ticks });
    const L = e.inputs.length;
    near(r.readouts.period, 2 * Math.PI * Math.sqrt(L / 9.81)); near(r.readouts.lenR, L); // T = 2 pi sqrt(L / g), computed here
    lengths.add(L);
  }
  assert.ok(lengths.size >= 3, 'the sampler still varies the main control: low, middle and high');
  assert.equal(artifact.scene.geometries.some(g => g.kind === 'curve' && g.radius !== undefined), false);
  const refused = await qualifySgd(artifact);
  assert.equal(refused.ok, false);
  assert.match(failed(refused), /readout step: declared with id stepNo/);
});
