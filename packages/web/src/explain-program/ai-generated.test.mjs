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
  for (const name of ['convolution', 'attention', 'tree-split-routed']) {
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
    return { evaluate, press: action => { const event = { type: 'action', action }; assert.equal(parseEvent(event, manifest).ok, true); state = call('reduce', { state, event }); return evaluate(); } };
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

test('every generated card and every rejected candidate loads through the dev fixture resolver', async () => {
  for (const fixture of AI_GENERATED_FIXTURES) {
    const resolved = await resolveProgram({ program: { fixtureId: fixture.id } }, { fixtures: true, stamps: PROGRAM_STAMPS });
    assert.equal(resolved.ok, true, `${fixture.id}: ${resolved.error?.message}`);
  }
  assert.deepEqual(Object.keys(AI_REJECTED_RECORDS).sort(), ['gradient-run1', 'gradient-run2', 'tree-split']);
  assert.ok(AI_GENERATED_FIXTURES.filter(fixture => fixture.generated.rejected).every(fixture => fixture.id.endsWith('-rejected')));
});

test('every record names its prompt, the routing decision, the model, the job and the cost', () => {
  for (const name of ['convolution', 'attention', 'gradient-run1', 'gradient-run2', 'tree-split', 'tree-split-routed']) {
    const record = load(name);
    assert.ok(record.prompt.length > 40, name);
    assert.equal(record.routing.replayedExplicit.via, 'command', name);
    assert.equal(record.routing.replayedExplicit.capability, 'explain', name);
    if (name === 'tree-split-routed') { assert.equal(record.routing.replayedPlainWords.via, 'jev'); assert.equal(record.routing.replayedPlainWords.capability, 'explain'); }
    else assert.equal(record.routing.replayedPlainWords.via, 'fallback', `${name}: plain words never reached the classifier on the dev clone`);
    assert.match(record.job.jobId, /^ej_[0-9a-f]{32}$/, name);
    assert.ok(record.job.calls.every(call => call.model === 'claude-opus-5-5' && call.costUsd > 0), name);
    near(record.job.costUsd, record.job.calls.reduce((sum, call) => sum + call.costUsd, 0), 0.0015);
  }
});
