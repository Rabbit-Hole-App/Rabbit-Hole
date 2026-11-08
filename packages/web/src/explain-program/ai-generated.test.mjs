import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { parseEvent, parseGuestResult, parseState, resolveInputs } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { LIMITS } from './limits.js';
import { resolveProgram } from './program-card.js';
import { PROGRAM_STAMPS } from './stamps.js';
import { AI_GENERATED_FIXTURES, AI_REJECTED_RECORDS } from './ai-generated-fixtures.js';

// Acceptance of what the real /interactive backend produced (not the hand-authored ai-*-fixture.js). Everything is computed from the generated program's OWN data, extracted from its saved source.
// No model call: the programs are the saved testdata/generated-ai-*.json artifacts. These tests check numbers, so the evaluation deadline is relaxed (as genuine-card.test.mjs does).
const run = (engine, input) => runWithDefaultLimits(engine, input, { ...LIMITS, interruptMs: 5000 });
const load = name => JSON.parse(readFileSync(new URL(`./testdata/generated-ai-${name}.json`, import.meta.url), 'utf8'));
const engine = await loadEngine();
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

async function evaluator(record) {
  const artifact = await buildProgramArtifact({ manifest: record.artifact.manifest, source: record.artifact.source });
  return inputs => {
    const reply = run(engine, { source: artifact.source, sdkVersion: artifact.sdkVersion, operation: 'evaluate', request: { requestId: 'generated', inputs, time: 0, seed: 1, state: null } });
    assert.equal(reply.ok, true, reply.detail);
    const parsed = parseGuestResult(reply.value, artifact.manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    const view = normalizeFrame(parsed.value.frame, artifact.manifest);
    assert.equal(view.ok, true, view.issue);
    return { frame: parsed.value.frame, quantities: parsed.value.quantities };
  };
}
const objectText = (frame, id) => frame.objects.find(object => object.id === id)?.text;
const dataBefore = (source, marker, names) => new Function(`${source.slice(0, source.indexOf(marker))}; return { ${names.join(', ')} };`)();

test('the saved generated cards are exactly what the backend stored: the bundle hash is reproduced from the manifest and source', async () => {
  for (const name of ['convolution', 'attention', 'tree-split-routed', 'classifier-threshold', 'kmeans', 'gradient-retry']) {
    const record = load(name), rebuilt = await buildProgramArtifact({ manifest: record.artifact.manifest, source: record.artifact.source });
    assert.equal(rebuilt.bundleHash, record.artifact.bundleHash, name);
    assert.equal(rebuilt.sdkVersion, record.artifact.sdkVersion, name);
  }
});

test('every generated card loads through the dev fixture resolver with the stamps it was stored with', async () => {
  assert.ok(AI_GENERATED_FIXTURES.length >= 2);
  for (const fixture of AI_GENERATED_FIXTURES) {
    const resolved = await resolveProgram({ program: { fixtureId: fixture.id } }, { fixtures: true, stamps: PROGRAM_STAMPS });
    assert.equal(resolved.ok, true, `${fixture.id}: ${resolved.error?.message}`);
    assert.equal(resolved.artifact.sdkVersion, fixture.stamps.sdkVersion, fixture.id);
  }
});

test('convolution: every window and kernel matches cross-correlation on the generated card\'s own image and kernels (corner windows, blur divided by nine, stride 1, no padding)', async () => {
  const record = load('convolution'), evaluate = await evaluator(record);
  const { IMG, K } = dataBefore(record.artifact.source, 'const NAME', ['IMG', 'K']);
  assert.equal(IMG.length, 5); assert.ok(IMG.every(row => row.length === 5), 'a 5 x 5 image');
  for (const kernel of ['vertical', 'horizontal', 'blur']) {
    assert.equal(K[kernel].length, 3); assert.ok(K[kernel].every(row => row.length === 3), `${kernel} is 3 x 3`);
    for (let row = 0; row <= 2; row++) for (let col = 0; col <= 2; col++) {
      const { frame, quantities } = evaluate({ row, col, kernel });
      let sum = 0;
      for (let m = 0; m < 3; m++) for (let n = 0; n < 3; n++) {
        const product = IMG[row + m][col + n] * K[kernel][m][n];
        sum += product;
        const shown = objectText(frame, `pr_${m}_${n}`); // "pixel × weight = product", the elementwise products
        assert.ok(shown.includes(`${IMG[row + m][col + n]} × `) && shown.endsWith(`= ${product < 0 ? '−' + Math.abs(product) : product}`), `${kernel} ${row},${col} product ${m},${n}: ${shown}`);
      }
      near(quantities.sum, sum); near(quantities.output, kernel === 'blur' ? sum / 9 : sum);
      assert.equal([quantities.row, quantities.col].join(), [row, col].join(), 'the window is where the input says');
      // the whole output map is the cross-correlation at every position
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let at = 0; for (let m = 0; m < 3; m++) for (let n = 0; n < 3; n++) at += IMG[i + m][j + n] * K[kernel][m][n];
        const text = objectText(frame, `out_${i}_${j}`), value = Number(text.replace('−', '-'));
        near(value, kernel === 'blur' ? Math.round(at / 9 * 100) / 100 : at, 0.006);
      }
    }
  }
  // the corner window (the last one) with the box blur: the nine pixels at rows 2-4, columns 2-4, divided by nine
  const corner = evaluate({ row: 2, col: 2, kernel: 'blur' }).quantities, cornerSum = IMG.slice(2, 5).flatMap(row => row.slice(2, 5)).reduce((a, b) => a + b, 0);
  near(corner.sum, cornerSum); near(corner.output, cornerSum / 9);
});

test('attention: scores are scaled by the square root of the key dimension, blocked keys get zero weight, allowed weights sum to one, the output is the weighted sum of V', async () => {
  const record = load('attention'), evaluate = await evaluator(record);
  const { Q, K, V, DK } = dataBefore(record.artifact.source, 'function vec', ['Q', 'K', 'V', 'DK']);
  assert.equal(DK, K[0].length, 'd_k is the key dimension');
  for (const query of [1, 2, 3]) for (const mask of ['off', 'on']) {
    const i = query - 1, { quantities: q } = evaluate({ query: String(query), mask });
    const allowed = [0, 1, 2].map(j => !(mask === 'on' && j > i));
    const score = j => (Q[i][0] * K[j][0] + Q[i][1] * K[j][1]) / Math.sqrt(DK);
    const peak = Math.max(...[0, 1, 2].filter(j => allowed[j]).map(score)), weights = [0, 1, 2].map(j => (allowed[j] ? Math.exp(score(j) - peak) : 0));
    const total = weights.reduce((a, b) => a + b, 0), expected = weights.map(w => w / total);
    [0, 1, 2].forEach(j => {
      near(q[`w${j + 1}`], expected[j]);
      if (allowed[j]) near(q[`s${j + 1}`], score(j)); else assert.equal(q[`w${j + 1}`], 0, `blocked key ${j + 1} has zero weight (query ${query})`);
    });
    near(q.w1 + q.w2 + q.w3, 1);
    near(q.o1, expected.reduce((a, w, j) => a + w * V[j][0], 0)); near(q.o2, expected.reduce((a, w, j) => a + w * V[j][1], 0));
  }
});

test('gradient descent: both runs FAILED in the pipeline (no accepted card); the failure and the rejected candidate are kept as generated, never replaced by a hand-authored card', () => {
  for (const name of ['gradient-run1', 'gradient-run2']) {
    const record = load(name);
    assert.equal(record.job.outcome, 'failed', name);
    assert.equal(record.job.stopReason, 'unsupported_repair', name);
    assert.equal(record.artifact, null, `${name} has no accepted artifact`);
    assert.ok(record.reviewFindings[0].findings.some(finding => finding.severity === 'major' && finding.verdict === 'visual'), `${name}: the reviewer's major visual finding is recorded`);
    assert.deepEqual(record.job.calls.map(call => call.role), ['brief', 'author', 'review', 'repair']);
    assert.match(JSON.stringify(record.rejectedCandidate.candidates), /The repair returned no program/, `${name}: the repair step returned no program`);
  }
});

test('gradient descent, rejected candidates: the numbers are right (w at step t is 3(1 - rate)^t, loss is w^2/2); what failed review was the visibility of the points, a visual matter', async () => {
  const shapes = { 'gradient-run1': { rate: 'eta', option: { '0.2': 0.2, '0.8': 0.8, '1.2': 1.2, '2.1': 2.1 }, w: 'w', loss: 'loss' }, 'gradient-run2': { rate: 'rate', option: { r0_2: 0.2, r0_8: 0.8, r1_2: 1.2, r2_1: 2.1 }, w: 'w_now', loss: 'loss_now' } };
  for (const [name, shape] of Object.entries(shapes)) {
    const record = load(name), evaluate = await evaluator({ artifact: record.rejectedCandidate });
    for (const [value, rate] of Object.entries(shape.option)) for (let step = 0; step <= 8; step++) {
      const { quantities } = evaluate({ [shape.rate]: value, step });
      const expected = 3 * (1 - rate) ** step;
      near(quantities[shape.w], expected, 1e-9); near(quantities[shape.loss], expected * expected / 2, 1e-9);
    }
  }
});

async function statefulRunner(candidate) {
  const artifact = await buildProgramArtifact({ manifest: candidate.manifest, source: candidate.source });
  const { manifest, source, sdkVersion } = artifact;
  assert.equal(artifact.schemaVersion, 2);
  return (savedInputs = {}) => {
    const inputs = resolveInputs(manifest, savedInputs);
    const call = (operation, extra) => {
      const reply = run(engine, { source, sdkVersion, operation, request: { inputs, ...extra } });
      assert.equal(reply.ok, true, reply.detail);
      const parsed = operation === 'evaluate' ? parseGuestResult(reply.value, manifest) : parseState(reply.value);
      assert.equal(parsed.ok, true, parsed.issue);
      return parsed.value;
    };
    let state = call('initialize');
    const evaluate = () => { const result = call('evaluate', { state }); assert.equal(normalizeFrame(result.frame, manifest).ok, true); return result; };
    return { evaluate, select: target => { const event = { type: 'select', target }; assert.equal(parseEvent(event, manifest).ok, true); state = call('reduce', { state, event }); return evaluate(); }, press: action => { const event = { type: 'action', action }; assert.equal(parseEvent(event, manifest).ok, true); state = call('reduce', { state, event }); return evaluate(); } };
  };
}

test('decision tree split, rejected candidate (its own 12-point dataset): counts, impurity, weighted impurity and gain follow the cutoff for Gini and entropy; Reveal marks the best cutoff for the active criterion and keeps the learner cutoff visible', async () => {
  const record = load('tree-split'), candidate = record.rejectedCandidate;
  assert.equal(record.job.outcome, 'failed'); assert.equal(record.artifact, null);
  const { XS, CL, N } = dataBefore(candidate.source, 'function imp', ['XS', 'CL', 'N']);
  assert.equal(N, XS.length);
  const impurity = (a, b, measure) => { const n = a + b; if (!n) return 0; const p = a / n, q = b / n; return measure === 'gini' ? 1 - p * p - q * q : -[p, q].filter(v => v > 0).reduce((t, v) => t + v * Math.log2(v), 0); };
  const split = (cutoff, measure) => {
    let la = 0, lb = 0, ra = 0, rb = 0;
    XS.forEach((x, i) => { if (x < cutoff) { if (CL[i]) lb++; else la++; } else if (CL[i]) rb++; else ra++; });
    const IL = impurity(la, lb, measure), IR = impurity(ra, rb, measure), P = impurity(la + ra, lb + rb, measure), W = (la + lb) / XS.length * IL + (ra + rb) / XS.length * IR;
    return { la, lb, ra, rb, IL, IR, P, W, G: P - W };
  };
  const mids = XS.slice(1).map((x, i) => (XS[i] + x) / 2);
  const bestOf = measure => mids.reduce((best, c) => (split(c, measure).G > best.g + 1e-12 ? { c, g: split(c, measure).G } : best), { c: 0, g: -1 });
  const make = await statefulRunner(candidate);
  for (const measure of ['gini', 'entropy']) {
    const best = bestOf(measure);
    for (const cutoff of [0, 0.3, 1.0, 2.4, 3.0, 4.5, 6.0, 7.7, 9.5, 10, ...mids]) {
      const { frame, quantities: q } = make({ cutoff, measure }).evaluate(), e = split(cutoff, measure);
      near(q.leftImpurity, e.IL); near(q.rightImpurity, e.IR); near(q.parent, e.P); near(q.weighted, e.W); near(q.gain, e.G); near(q.bestCutoff, best.c); near(q.bestGain, best.g);
      assert.equal(objectText(frame, 'blL'), `Left group: ${e.la} A, ${e.lb} B`, `left counts at ${cutoff}`);
      assert.equal(objectText(frame, 'blR'), `Right group: ${e.ra} A, ${e.rb} B`, `right counts at ${cutoff}`);
    }
    // Reveal: the best marker for the ACTIVE criterion appears and the learner's own cutoff marker stays.
    const learner = 3.3, runner = make({ cutoff: learner, measure }), before = runner.evaluate().frame, after = runner.press('reveal').frame;
    const ids = frame => new Set(frame.objects.map(object => object.id));
    assert.ok(!ids(before).has('bestline') && !ids(before).has('gbest'), 'no best marker before Reveal');
    for (const id of ['bestline', 'bestlab', 'gbest', 'cut', 'cutlab', 'gmark']) assert.ok(ids(after).has(id), `${measure}: ${id} is drawn after Reveal`);
    const object = id => after.objects.find(item => item.id === id);
    near(object('bestline').from.x, 80 + 800 * best.c / 10, 1e-6); near(object('cut').from.x, 80 + 800 * learner / 10, 1e-6);
    assert.ok(objectText(after, 'bestlab').includes(`best cutoff x = ${best.c.toFixed(2)}`), 'the label names the best cutoff for this criterion');
    assert.ok(!ids(runner.press('reveal').frame).has('bestline'), 'a second press hides the best split again');
  }
  assert.notEqual(XS.length, 10, 'this card uses its own 12-point data, not the 10-point reference, so the reference answers (Gini 9, entropy 15) do not apply to it');
});

test('decision tree split, ACCEPTED card from plain words through the router (its own 12-point dataset): counts, impurity, weighted impurity and gain follow the cutoff for Gini and entropy; Reveal marks the best cutoff and keeps the learner cutoff', async () => {
  const record = load('tree-split-routed');
  assert.equal(record.job.outcome, 'card'); assert.ok(record.artifact);
  assert.equal(record.routing.recordedInBrowser[0].body.via, 'jev'); assert.equal(record.routing.recordedInBrowser[0].body.capability, 'explain');
  const { XS, CL, N } = dataBefore(record.artifact.source, 'function imp', ['XS', 'CL', 'N']);
  assert.equal(N, XS.length); assert.equal(N, 12);
  const impurity = (a, b, measure) => { const n = a + b; if (!n) return 0; const p = a / n, q = b / n; return measure === 'gini' ? 1 - p * p - q * q : -[p, q].filter(v => v > 0).reduce((t, v) => t + v * Math.log2(v), 0); };
  const split = (cutoff, measure) => {
    let la = 0, lb = 0, ra = 0, rb = 0;
    XS.forEach((x, i) => { if (x < cutoff) { if (CL[i]) lb++; else la++; } else if (CL[i]) rb++; else ra++; });
    const IL = impurity(la, lb, measure), IR = impurity(ra, rb, measure), P = impurity(la + ra, lb + rb, measure), W = (la + lb) / N * IL + (ra + rb) / N * IR;
    return { la, lb, ra, rb, IL, IR, P, W, G: P - W };
  };
  const mids = XS.slice(1).map((x, i) => (XS[i] + x) / 2);
  const bestOf = measure => mids.reduce((best, c) => (split(c, measure).W < best.w - 1e-12 ? { c, w: split(c, measure).W } : best), { c: 0, w: Infinity });
  const make = await statefulRunner(record.artifact);
  for (const measure of ['gini', 'entropy']) {
    const best = bestOf(measure);
    for (const cutoff of [0.5, 1.0, 2.4, 3.0, 4.5, 6.0, 7.7, 9.5, ...mids]) {
      const { frame, quantities: q } = make({ cutoff, measure }).evaluate(), e = split(cutoff, measure);
      near(q.weighted, e.W); near(q.gain, e.G); near(q.parent, e.P); near(q.best, best.c); near(q.bestW, best.w);
      assert.equal(objectText(frame, 'left'), `Left side: ${e.la} A, ${e.lb} B  (n = ${e.la + e.lb})`, `left counts at ${cutoff}`);
      assert.equal(objectText(frame, 'right'), `Right side: ${e.ra} A, ${e.rb} B  (n = ${e.ra + e.rb})`, `right counts at ${cutoff}`);
    }
    const learner = 3.3, runner = make({ cutoff: learner, measure }), before = runner.evaluate().frame, after = runner.press('reveal').frame;
    const ids = frame => new Set(frame.objects.map(object => object.id));
    assert.ok(!ids(before).has('bestline') && !ids(before).has('bestpt'), 'no best marker before Reveal');
    for (const id of ['bestline', 'bestlabel', 'bestpt', 'cut', 'cutlabel', 'youpt']) assert.ok(ids(after).has(id), `${measure}: ${id} is drawn after Reveal`);
    const object = id => after.objects.find(item => item.id === id);
    near(object('bestline').from.x, 60 + 54 * best.c, 1e-6); near(object('cut').from.x, 60 + 54 * learner, 1e-6);
    assert.ok(objectText(after, 'bestlabel').includes(`best cutoff x = ${best.c.toFixed(2)}`), 'the label names the best cutoff for this criterion');
    assert.ok(!ids(runner.press('hide').frame).has('bestline'), 'hide removes the best marker again');
  }
  assert.notEqual(N, 10, 'own 12-point data: the 10-point reference answers (Gini 9, entropy 15) do not apply');
});

// Phase 02 cases. Replay inputs (cutoffs, slope/intercept pairs, selections) are the arrays inside the tests; no model call.
test('classifier threshold, ACCEPTED card from plain words (its own ten scores): the four counts, precision, recall and accuracy follow the cutoff; a score equal to the cutoff is positive; precision is undefined with no positive predictions', async () => {
  const record = load('classifier-threshold');
  assert.equal(record.job.outcome, 'card'); assert.ok(record.artifact);
  assert.equal(record.routing.recordedInBrowser[0].body.via, 'jev'); assert.equal(record.routing.recordedInBrowser[0].body.capability, 'explain');
  const { S } = dataBefore(record.artifact.source, 'export function', ['S']);
  assert.equal(S.length, 10); assert.equal(S.filter(d => d.p).length, 2, 'two actual positives');
  const evaluate = await evaluator(record);
  const expected = cutoff => { let tp = 0, fp = 0, fn = 0, tn = 0; for (const d of S) { const pred = d.s >= cutoff; if (d.p && pred) tp++; else if (d.p) fn++; else if (pred) fp++; else tn++; } return { tp, fp, fn, tn }; };
  const cutoffs = [0, 0.1, ...S.map(d => d.s), ...S.map(d => d.s + 0.001), 0.5, 0.7, 1];
  for (const cutoff of cutoffs) {
    const { frame, quantities: q } = evaluate({ cutoff }), e = expected(cutoff);
    for (const key of ['tp', 'fp', 'fn', 'tn']) assert.equal(q[key], e[key], `${key} at ${cutoff}`);
    near(q.recall, e.tp / (e.tp + e.fn)); near(q.accuracy, (e.tp + e.tn) / 10);
    if (e.tp + e.fp > 0) near(q.precision, e.tp / (e.tp + e.fp)); else { assert.equal(q.precision, undefined, 'precision absent when nothing is predicted positive'); assert.match(objectText(frame, 'mp'), /undefined/); }
  }
  // Lowering the cutoff across the second positive: it is caught and false alarms do not decrease.
  const positives = S.filter(d => d.p).map(d => d.s).sort((a, b) => b - a), hi = evaluate({ cutoff: positives[0] }).quantities, lo = evaluate({ cutoff: positives[1] }).quantities;
  assert.equal(hi.tp, 1); assert.equal(lo.tp, 2); assert.ok(lo.fp >= hi.fp);
  assert.equal(S.some(d => d.s === 0.7), false, 'own scores: the reference numbers (0.70 to 0.50 adds two false alarms) do not apply');
});

test('regression fit, rejected candidate (its own six points, stateful): each residual segment ends at the prediction for the same x, MSE is the mean of the six squared residuals, a selected point reports its own error', async () => {
  const record = load('regression-fit'), candidate = record.rejectedCandidate;
  assert.equal(record.job.outcome, 'failed'); assert.equal(record.artifact, null);
  const { P } = dataBefore(candidate.source, 'export function initialState', ['P']);
  assert.equal(P.length, 6);
  const make = await statefulRunner(candidate);
  const X0 = 60, Y0 = 40, S = 42, W = 420, px = v => X0 + v * S, py = v => Y0 + W - v * S, clampY = y => Math.min(Math.max(y, Y0), Y0 + W);
  for (const [slope, intercept] of [[0.8, 1], [0.35, 3.3], [1.5, -2], [0, 5]]) {
    const runner = make({ slope, intercept }), { frame, quantities: q } = runner.evaluate();
    const squares = P.map(([x, y]) => (y - (slope * x + intercept)) ** 2), sse = squares.reduce((a, b) => a + b, 0);
    near(q.sse, sse, 1e-9); near(q.mse, sse / 6, 1e-9);
    P.forEach(([x, y], i) => {
      const prediction = slope * x + intercept, segment = frame.objects.find(object => object.id === `err${i + 1}`);
      if (Math.abs(clampY(py(y)) - clampY(py(prediction))) > 0.5) { assert.ok(segment, `segment ${i + 1}`); near(segment.from.x, px(x), 1e-9); near(segment.to.x, px(x), 1e-9); near(segment.from.y, clampY(py(y)), 1e-6); near(segment.to.y, clampY(py(prediction)), 1e-6); }
      near(Number(objectText(frame, `bv${i + 1}`)), squares[i], 0.006);
    });
    const picked = runner.select('pt3'), expectedError = P[2][1] - (slope * P[2][0] + intercept);
    near(picked.quantities.selected_error, expectedError, 1e-9);
    assert.equal(runner.select('pt3').quantities.selected_error, 0, 'selecting the same point again clears the selection');
  }
});

test('regression fit, rejected candidate: at two input extremes the frame has more than the 60 objects the contract allows, so the card cannot draw (a real defect of the rejected program, kept as found)', async () => {
  const make = await statefulRunner(load('regression-fit').rejectedCandidate);
  for (const [slope, intercept] of [[1.5, 5], [0, -2]]) assert.throws(() => make({ slope, intercept }).evaluate(), /Too big|60 items/, `slope ${slope}, intercept ${intercept}`);
});

test('k-means, ACCEPTED card from plain words (its own 12 points, stateful): Assign colours each point by its nearest centroid, Update moves each centroid to its group mean, two starts reach different groups and inertia, Reset restores the start', async () => {
  const record = load('kmeans');
  assert.equal(record.job.outcome, 'card'); assert.ok(record.artifact);
  assert.equal(record.routing.recordedInBrowser[0].body.via, 'jev'); assert.equal(record.routing.recordedInBrowser[0].body.capability, 'explain');
  const { PTS } = dataBefore(record.artifact.source, 'const SX', ['PTS']);
  assert.equal(PTS.length, 12);
  const make = await statefulRunner(record.artifact);
  const d2 = (p, c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2, groupOf = c => PTS.map(p => (d2(p, c[0]) <= d2(p, c[1]) ? 0 : 1));
  const meanOf = (a, c) => [0, 1].map(k => { const own = PTS.filter((_, i) => a[i] === k); return own.length ? [own.reduce((t, p) => t + p[0], 0) / own.length, own.reduce((t, p) => t + p[1], 0) / own.length] : c[k]; });
  const inertia = (a, c) => PTS.reduce((t, p, i) => t + d2(p, c[a[i]]), 0);
  const roleOf = (frame, id) => frame.objects.find(object => object.id === id)?.role, ROLE = ['input', 'output'];
  const centroidText = (frame, id) => objectText(frame, id).match(/\(([-\d.]+), ([-\d.]+)\)/).slice(1).map(Number);
  const hasLines = frame => frame.objects.some(object => /^ln\d+$/.test(object.id));
  const outcomes = {};
  for (const [name, start] of [['top-bottom', { c1x: 5, c1y: 6.5, c2x: 5, c2y: 1 }], ['left-right', { c1x: 1, c1y: 3.5, c2x: 9, c2y: 3.5 }]]) {
    const run = make(start), first = run.evaluate();
    let c = [[start.c1x, start.c1y], [start.c2x, start.c2y]], a = null, last;
    assert.ok(!hasLines(first.frame), 'no assignment lines before the first Assign');
    for (let n = 0; n < 12; n++) {
      a = groupOf(c); last = run.press('assign');
      PTS.forEach((p, i) => assert.equal(roleOf(last.frame, 'p' + i), ROLE[a[i]], `${name}: point ${i} after Assign ${n + 1}`));
      near(last.quantities.sse, inertia(a, c), 1e-9);
      near(centroidText(last.frame, 'h1')[0], c[0][0], 0.005); near(centroidText(last.frame, 'h2')[1], c[1][1], 0.005); // Assign moves no centroid
      if (last.quantities.converged === 1) break;
      c = meanOf(a, c); last = run.press('update');
      centroidText(last.frame, 'h1').forEach((v, j) => near(v, c[0][j], 0.005)); centroidText(last.frame, 'h2').forEach((v, j) => near(v, c[1][j], 0.005));
      near(last.quantities.sse, inertia(a, c), 1e-9);
      if (last.quantities.converged === 1) break;
    }
    assert.equal(last.quantities.converged, 1, `${name}: reaches convergence`);
    outcomes[name] = { groups: a.join(''), inertia: inertia(a, c) };
    near(last.quantities.sse, outcomes[name].inertia, 1e-9);
    const reset = run.press('reset');
    assert.equal(reset.quantities.rounds, 0); near(centroidText(reset.frame, 'h1')[1], start.c1y, 0.005); near(centroidText(reset.frame, 'h2')[1], start.c2y, 0.005);
    assert.ok(!hasLines(reset.frame), 'Reset clears the assignment');
  }
  assert.notEqual(outcomes['top-bottom'].groups, outcomes['left-right'].groups, 'the two starts reach different groups');
  assert.ok(outcomes['top-bottom'].inertia > outcomes['left-right'].inertia, 'top/bottom groups have the larger total squared distance, as the card says');
});

// Retry batch (repair output cap raised to 10000 tokens; build 6a0e43cfd).
test('gradient descent retry, ACCEPTED by the pipeline (round 1): w and the loss follow 3(1 - rate)^k for four rates and steps 0 to 8, but at rate 1.2 the markers of steps 4 to 8 sit on top of each other (the owner criterion fails)', async () => {
  const record = load('gradient-retry');
  assert.equal(record.job.outcome, 'card'); assert.ok(record.artifact);
  const evaluate = await evaluator(record);
  for (const eta of ['0.2', '0.8', '1.2', '2.1']) for (let k = 0; k <= 8; k++) {
    const { quantities: q } = evaluate({ eta, step: k }), w = 3 * (1 - Number(eta)) ** k;
    near(q.w_now, w, 1e-9); near(q.loss_now, w * w / 2, 1e-9);
  }
  const { frame } = evaluate({ eta: '1.2', step: 8 });
  const centers = [4, 5, 6, 7, 8].map(i => frame.objects.find(object => object.id === 'p' + i)).map(object => { assert.ok(object, 'marker drawn'); return [object.x, object.y]; });
  let nearest = Infinity; centers.forEach((a, i) => centers.slice(i + 1).forEach(b => { nearest = Math.min(nearest, Math.hypot(a[0] - b[0], a[1] - b[1])); }));
  assert.ok(nearest < 1, `closest pair of the step 4 to 8 markers is ${nearest.toFixed(3)} px apart (marker radius 7 to 11): not distinguishable`);
});

test('regression fit retry, FAILED (incomplete_review after round 2; its own six points, stateless): residuals end at the prediction for the same x, MSE is the mean of the squares, and no slider extreme exceeds the 60-object limit', async () => {
  const record = load('regression-fit-retry'), candidate = record.rejectedCandidate;
  assert.equal(record.job.outcome, 'failed'); assert.equal(record.artifact, null); assert.equal(record.job.failure.message, 'The explanation could not be reviewed (incomplete_review).');
  const { XS, YS } = dataBefore(candidate.source, 'export function', ['XS', 'YS']);
  const evaluate = await evaluator({ artifact: candidate });
  const py = y => 30 + 460 - (y + 1.5) * 40, px = x => 60 + x * 40;
  let worst = 0;
  for (const slope of [-1, 0, 0.6, 3]) for (const intercept of [-2, 1.5, 6]) for (const focus of ['none', 'p3']) {
    const { frame, quantities: q } = evaluate({ slope, intercept, focus });
    worst = Math.max(worst, frame.objects.length);
    const e2 = XS.map((x, i) => (YS[i] - (slope * x + intercept)) ** 2), sse = e2.reduce((a, b) => a + b, 0);
    near(q.sse, sse, 1e-9); near(q.mse, sse / 6, 1e-9);
    XS.forEach((x, i) => { const segment = frame.objects.find(object => object.id === `err${i}`); near(segment.points[0][0], px(x), 1e-9); near(segment.points[1][0], px(x), 1e-9); near(segment.points[0][1], py(YS[i]), 1e-9); near(segment.points[1][1], py(slope * x + intercept), 1e-9); });
    near(q.focus_share, focus === 'p3' && sse > 1e-12 ? 100 * e2[2] / sse : 0, 1e-9);
  }
  assert.ok(worst <= 60, `most objects at any slider corner: ${worst}`);
});

test('every generated card and every rejected candidate loads through the dev fixture resolver', async () => {
  for (const fixture of AI_GENERATED_FIXTURES) {
    const resolved = await resolveProgram({ program: { fixtureId: fixture.id } }, { fixtures: true, stamps: PROGRAM_STAMPS });
    assert.equal(resolved.ok, true, `${fixture.id}: ${resolved.error?.message}`);
  }
  assert.deepEqual(Object.keys(AI_REJECTED_RECORDS).sort(), ['gradient-run1', 'gradient-run2', 'regression-fit', 'regression-fit-retry', 'tree-split']);
  assert.ok(AI_GENERATED_FIXTURES.filter(fixture => fixture.generated.rejected).every(fixture => fixture.id.endsWith('-rejected')));
});

test('every record names its prompt, the routing decision, the model, the job and the cost', () => {
  for (const name of ['convolution', 'attention', 'gradient-run1', 'gradient-run2', 'tree-split', 'tree-split-routed', 'classifier-threshold', 'regression-fit', 'kmeans', 'gradient-retry', 'regression-fit-retry']) {
    const record = load(name);
    assert.ok(record.prompt.length > 40, name);
    assert.equal(record.routing.replayedExplicit.via, 'command', name);
    assert.equal(record.routing.replayedExplicit.capability, 'explain', name);
    if (name === 'tree-split-routed' || name === 'classifier-threshold' || name === 'regression-fit' || name === 'kmeans' || name === 'gradient-retry' || name === 'regression-fit-retry') { assert.equal(record.routing.replayedPlainWords.via, 'jev'); assert.equal(record.routing.recordedInBrowser[0].body.capability, 'explain');
      // The gradient prompt sits at the classifier's threshold (0.57 when generated, a 0.56 clarify on replay): the replay is informational there.
      if (name !== 'gradient-retry') assert.equal(record.routing.replayedPlainWords.capability, 'explain'); }
    else assert.equal(record.routing.replayedPlainWords.via, 'fallback', `${name}: plain words never reached the classifier on the dev clone`);
    assert.match(record.job.jobId, /^ej_[0-9a-f]{32}$/, name);
    assert.ok(record.job.calls.every(call => call.model === 'claude-opus-5-5' && call.costUsd > 0), name);
    near(record.job.costUsd, record.job.calls.reduce((sum, call) => sum + call.costUsd, 0), 0.0015);
  }
});
