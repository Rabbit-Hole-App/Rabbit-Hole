import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import g from '../depth/fixtures/generation.generated.js';
import { validateActivity, PREDICATES } from '../../scene-activity.js';
import { distributeRounding } from '../../scene-derive.js';
import { formatCell, ungroupedNumbers } from '../../scene-format.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c22-top-k.js';

// Independent oracle in plain JS floats - never the scene's derive graph. The
// logits and the practice's distribution are typed here as the plan lists them.
const LOGITS = [3, 2, 1, 0.5, 0, -1];
const NAMES = ['z', 'e', 't', 's', 'a', '•'];
const P_WHATIF = [0.45, 0.15, 0.13, 0.11, 0.10, 0.06];
const V = LOGITS.length;
const softmax = xs => {
  const kept = xs.filter(x => x !== null);
  const top = Math.max(...kept);
  const total = kept.reduce((s, x) => s + Math.exp(x - top), 0);
  return xs.map(x => (x === null ? null : Math.exp(x - top) / total));
};
// generate(): v, _ = torch.topk(logits, min(top_k, V)); logits[logits < v[:, [-1]]] = -inf (null here).
const topK = (logits, k) => {
  const vk = [...logits].sort((a, b) => b - a)[Math.min(k, logits.length) - 1];
  return logits.map(x => (x < vk ? null : x));
};
const P_ALL = softmax(LOGITS);
const KS = [1, 2, 3, 4, 5, 6];
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const ALL = KS.flatMap((k, topK) => [false, true].map(revealed => ({ topK, revealed })));
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
const shownCells = object => (object.distribution ? distributeRounding(object.values, 2) : object.values).map(v => (v === null ? '' : formatCell(v)));
const close = (a, b, tol, where) => a.forEach((x, i) => assert.ok(x === null ? b[i] === null : Math.abs(x - b[i]) <= tol, `${where}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`));

test('c22 passes every gate at every review state and every input combination; 38 objects at scale 1, one frame for every state', () => {
  assertCardGates(scene, reviewStates);
  const results = assertCardGates(scene, ALL);
  assert.deepEqual(reviewStates, [{ topK: 1 }, { topK: 0 }, { topK: 2 }, { topK: 5 }, { topK: 1, revealed: true }, { topK: 5, revealed: true }]);
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.default, i.presentation, !!i.hidden]), [['topK', 'index', 1, 'slider', false], ['revealed', 'bool', false, undefined, true]]);
  assert.equal(scene.inputs[0].label, 'top_k (preset)');
  assert.deepEqual(scene.exampleData.kLabels, ['1', '2', '3', '4', '5', '6 (nothing cut)'], 'bare values: the lock line reads "top_k (preset) = 2", never "= k = 2"');
  assert.equal(scene.id, 'nanogpt-c22-top-k');
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.equal(scene.objects.length, 38);
  assert.equal(scene.objects.find(o => o.id === 'space-key').initialState.text, '• = space', 'the • column is keyed on the card');
  assert.equal(scene.height, 771);
  const legibility = sceneLegibility(scene);
  assert.ok(scene.height >= legibility.viewport.h && scene.height < legibility.viewport.h + 1, 'the scene box holds the padded content');
  assert.equal(legibility.scale, 1);
  assert.ok(scene.height <= 900);
  // The static bounds (what the frame is sized from) equal every evaluated
  // state's, revealed or not: the What-if band sits inside the footer, and every
  // filled readout ends inside the widest static line, so nothing ever moves.
  for (const [k, result] of results.entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
  }
});

test('c22 plan: staged, verbatim objective, standalone (no sequence), no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(plan.boundary.reviewed, {});
  assert.equal(plan.boundary.sequence, undefined, 'standalone: the header shows no sequence');
  // Standalone, yet the surface says where the cut sits in each pass of the loop the Generation context path walked (c24).
  const [result] = assertCardGates(scene, [{ topK: 1 }]);
  assert.equal(byId(result, 'loop-step').label, 'Each generate() pass (the generation loop): last position’s logits ÷ T → top-k (if set) → softmax → one random draw');
  assert.equal(plan.objective, 'After this card, the learner should understand that top-k sets every logit below the k-th largest to −∞, so softmax gives those candidates probability exactly 0 and shares the whole 1 among the candidates that remain, each in proportion to its old probability.');
  assert.ok(plan.prerequisites[0].startsWith('c21-temperature'));
  assert.equal(scene.title, 'Top-k: truncating the distribution');
});

test('c22 fixture: c21’s six toy logits, strictly descending, so largest first is also column order', () => {
  assert.deepEqual(fx.temperature.logits, LOGITS);
  assert.equal(fx.temperature.context, 'First Citi');
  assert.deepEqual(scene.exampleData.display, NAMES);
  LOGITS.forEach((x, i) => { if (i) assert.ok(x < LOGITS[i - 1], `logit ${i} is below logit ${i - 1}`); });
  close(P_ALL, [0.6048, 0.2225, 0.0819, 0.0496, 0.0301, 0.0111], 0.00005, 'the plan’s uncut p');
});

test('c22 the cut rows match generate()’s rule, k capped at V; a tie with v_k survives', () => {
  assert.deepEqual(scene.exampleData.maskedByK, KS.map(k => topK(LOGITS, k)));
  assert.deepEqual(scene.exampleData.kPosByK, KS.map(k => Math.min(k, V) - 1));
  assert.deepEqual(topK(LOGITS, g.sample.top_k.value), LOGITS, 'min(200, V) keeps every candidate');
  assert.deepEqual(topK([3, 2, 2, 1], 2), [3, 2, 2, null], 'the oracle keeps a tie (strictly below is cut)');
  assert.deepEqual(scene.exampleData.keepByK, KS.map(k => topK(LOGITS, k).map(x => (x === null ? 0 : 1))));
});

test('c22 every preset: v_k, the rings, the −∞ marks, ③, the bars, the masses and the captions match the oracle', () => {
  const results = assertCardGates(scene, ALL);
  const KEPT = ['0.605', '0.827', '0.909', '0.959', '0.989', '1'];
  const CUT = ['0.395', '0.173', '0.091', '0.041', '0.011', '0'];
  const SHOWN = [['1.00', '', '', '', '', ''], ['0.73', '0.27', '', '', '', ''], ['0.67', '0.24', '0.09', '', '', ''],
    ['0.63', '0.23', '0.09', '0.05', '', ''], ['0.61', '0.22', '0.08', '0.05', '0.03', ''], ['0.60', '0.22', '0.08', '0.05', '0.03', '0.01']];
  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
  ALL.forEach(({ topK: pos }, n) => {
    const result = results[n], where = JSON.stringify(ALL[n]), k = KS[pos];
    const masked = topK(LOGITS, k), cut = softmax(masked);
    const keptIdx = masked.flatMap((x, i) => (x === null ? [] : [i])), cutIdx = masked.flatMap((x, i) => (x === null ? [i] : []));
    const keptMass = keptIdx.reduce((s, i) => s + P_ALL[i], 0);
    close(byId(result, 'logits').values, LOGITS, 1e-12, `${where} ①`);
    close(byId(result, 'p-all').values, P_ALL, 1e-9, `${where} ② never changes`);
    close(byId(result, 'p-cut').values, cut, 1e-9, `${where} ③`);
    close(byId(result, 'bars').values, cut, 1e-9, `${where} bars`);
    // ③ = uncut p ÷ kept mass on the survivors, exactly 0 (blank) elsewhere, summing to 1.
    keptIdx.forEach(i => assert.ok(Math.abs(cut[i] - P_ALL[i] / keptMass) < 1e-12, `${where} renormalized ${i}`));
    assert.ok(Math.abs(keptIdx.reduce((s, i) => s + cut[i], 0) - 1) < 1e-12);
    assert.deepEqual(shownCells(byId(result, 'p-cut')), SHOWN[pos], `${where} ③ as drawn`);
    assert.deepEqual(shownCells(byId(result, 'p-all')), SHOWN[5], `${where} ② as drawn: each cell rounded on its own`);
    assert.deepEqual(byId(result, 'logits').cellHighlight, keptIdx, `${where} rings`);
    // A −∞ under exactly the cut cells, each centred under its own column: plain display-size text, never a chip.
    const logits = byId(result, 'logits');
    for (let j = 1; j < V; j += 1) {
      const mark = byId(result, `cut-mark-${j}`);
      assert.equal(mark.type, 'text');
      assert.equal(mark.typography, 'display', 'taller than the annotation text; ∞ at the mono cell size is 4 px');
      assert.equal(mark.label.trim(), cutIdx.includes(j) ? '−∞' : '', `${where} column ${j}`);
      assert.equal(mark.x + 44 / 2, logits.x + (j + 0.5) * logits.cell, `${where} mark ${j} centred`);
    }
    assert.ok(!cutIdx.includes(0), 'the top logit is never cut, so column 0 has no mark');
    // The survivors' ring wraps exactly the kept columns, in ③'s colour: outside ① on the left, top and bottom,
    // its right edge on the kept/cut divider so no cut cell is inside it (clear of the grid at k = V).
    const ring = byId(result, 'kept-ring');
    assert.equal(ring.role, byId(result, 'p-cut').role);
    const divider = logits.x + keptIdx.length * logits.cell;
    assert.ok(ring.x < logits.x && ring.y < logits.y && ring.y + ring.h > logits.y + logits.cell, `${where} ring outside ①`);
    assert.equal(ring.x + ring.w, k < V ? divider : divider + (logits.x - ring.x), `${where} ring right edge`);
    const vk = LOGITS[Math.min(k, V) - 1];
    assert.equal(byId(result, 'k-readout').label, `top_k = ${k} · v_k = ${vk.toFixed(2)}`, `${where} v_k printed as its ① cell, never as bare k`);
    assert.equal(byId(result, 'k-readout').label.split(' · ')[1].slice(6), shownCells(byId(result, 'logits'))[Math.min(k, V) - 1]);
    assert.equal(byId(result, 'vk-readout').label, `v_k = the ${ORD[pos]} largest logit`);
    assert.equal(byId(result, 'k-line').label, k < V ? 'every logit below v_k → −∞' : 'nothing is below v_k: no cut');
    assert.equal(byId(result, 'kept-count').label, `${keptIdx.length} of 6 can be drawn`);
    assert.equal(byId(result, 'cut-mass').label, `cut: ${cutIdx.map(i => NAMES[i]).join(', ') || 'none'}, which held ${CUT[pos]}`);
    assert.equal(byId(result, 'kept-mass').label, `kept: ${keptIdx.map(i => NAMES[i]).join(', ')} held ${KEPT[pos]}`);
    assert.equal(Number(KEPT[pos]), Math.round(keptMass * 1000) / 1000, `${where} kept mass`);
    assert.equal(byId(result, 'factor').label, `every kept p × ${(1 / keptMass).toFixed(3)} (= 1 ÷ ${KEPT[pos]})`);
    assert.doesNotMatch(byId(result, 'factor').label, /same ratios/);
    const f4 = v => v.toFixed(4);
    assert.equal(byId(result, 'old-new').label, `z ${f4(P_ALL[0])} → ${f4(cut[0])} · e ${f4(P_ALL[1])} → ${cut[1] === null ? '0, cut' : f4(cut[1])}`);
    // k = 6: •'s 0.0111 bar is about 1 px on a p = 1 axis, so the caption points at its ③ cell, not at a sliver.
    assert.equal(byId(result, 'consequence').label, k === 1 ? 'only z is left: every draw is z (greedy)' : k < V ? 'softmax: −∞ → p exactly 0, never drawn' : '③ = ②; •: 0.01 in ③, bar too thin to see');
  });
});

test('c22 the survivors keep their odds: p(z)/p(e) = e at every k ≥ 2', () => {
  const results = assertCardGates(scene, KS.map((k, topK) => ({ topK })));
  results.slice(1).forEach((result, n) => {
    const [z, e] = byId(result, 'p-cut').values;
    assert.ok(Math.abs(z / e - Math.E) < 1e-6, `k = ${n + 2}: ${z / e}`);
  });
  assert.ok(Math.abs(P_ALL[0] / P_ALL[1] - Math.E) < 1e-12);
});

test('c22 the printed numbers obey the printed rule: ② → ③ is one common factor, and no drawn change hands the cut to a lower survivor', () => {
  const results = assertCardGates(scene, KS.map((k, topK) => ({ topK })));
  const nums = text => [...text.matchAll(/\d+\.\d+|\d+/g)].map(m => Number(m[0]));
  results.forEach((result, pos) => {
    const k = KS[pos], where = `k = ${k}`;
    const before = shownCells(byId(result, 'p-all')).map(Number);
    const after = shownCells(byId(result, 'p-cut')).map(t => (t === '' ? null : Number(t)));
    const keptMass = nums(byId(result, 'kept-mass').label).at(-1);
    const [, factor, factorKept] = byId(result, 'factor').label.match(/× ([\d.]+) \(= 1 ÷ ([\d.]+)\)/).map(Number);
    assert.equal(factorKept, keptMass, `${where}: the factor line divides by the printed kept mass`);
    assert.ok(Math.abs(factor - 1 / keptMass) < 0.0006, `${where}: factor ${factor} = 1 ÷ ${keptMass}`);
    // z and e before and after, to 4 decimals: old ÷ kept and old × factor both land within 0.001 of new.
    const [z0, z1, e0, e1] = nums(byId(result, 'old-new').label);
    for (const [old, now, name] of [[z0, z1, 'z'], [e0, e1, 'e']]) {
      if (name === 'e' && k === 1) { assert.equal(now, 0, 'e is cut at k = 1'); continue; }
      assert.ok(Math.abs(old / keptMass - now) < 0.001 && Math.abs(old * factor - now) < 0.001, `${where} ${name}: ${old} ÷ ${keptMass} vs ${now}`);
    }
    // The cells: never a survivor unchanged while a lower-ranked one rises.
    after.forEach((p, i) => {
      if (p === null || p !== before[i]) return;
      after.slice(i + 1).forEach((q, j) => assert.ok(q === null || q <= before[i + 1 + j], `${where}: ${NAMES[i]} unchanged while ${NAMES[i + 1 + j]} rises`));
    });
  });
  // At the default k = 2 the 2-decimal cells already obey it; at k = 5 z visibly gains.
  const [k2, k5] = [results[1], results[4]].map(r => [shownCells(byId(r, 'p-all')), shownCells(byId(r, 'p-cut'))].map(row => row.map(Number)));
  [0, 1].forEach(i => assert.equal(Math.round((k2[0][i] / 0.827) * 100) / 100, k2[1][i]));
  assert.ok(k5[1][0] > k5[0][0], 'k = 5: ③ z above ② z');
});

test('c22 the What-if: softmax of ln p′ gives p′ back; cut to top_k = 2 it is 0.75 and 0.25, drawn only after Check', () => {
  close(softmax(P_WHATIF.map(Math.log)), P_WHATIF, 1e-12, 'softmax(ln p′)');
  close(softmax(topK(P_WHATIF.map(Math.log), 2)), [0.75, 0.25, null, null, null, null], 1e-12, 'the oracle');
  const results = assertCardGates(scene, ALL);
  ALL.forEach(({ revealed }, n) => {
    const result = results[n], where = JSON.stringify(ALL[n]);
    for (const id of ['whatif', 'name-whatif']) assert.equal(byId(result, id).opacity, revealed ? 1 : 0, `${where} ${id}`);
    assert.equal(byId(result, 'whatif-hint').opacity, revealed ? 0 : 1, `${where} the empty slot says what fills it`);
    assert.equal(byId(result, 'whatif').role, byId(result, 'p-cut').role, 'a cut What-if cell looks like a cut ③ cell');
    const values = byId(result, 'whatif').values;
    if (revealed) {
      close(values, [0.75, 0.25, null, null, null, null], 1e-9, where);
      assert.deepEqual(shownCells(byId(result, 'whatif')), ['0.75', '0.25', '', '', '', '']);
      assert.equal(byId(result, 'whatif-before').label, 'other model’s p: 0.45, 0.15 · 0.40 cut', 'the What-if names itself another model, not z … sp');
      assert.equal(byId(result, 'whatif-after').label, 'each ÷ 0.60 → 0.75, 0.25 (3 : 1 kept)');
    } else {
      assert.ok(values.every(v => v === null), `${where}: no What-if value before a committed attempt`);
      assert.equal(byId(result, 'whatif-before').label.trim(), '');
      assert.equal(byId(result, 'whatif-after').label.trim(), '');
    }
    // The reveal adds; the card's own rows stay.
    close(byId(result, 'p-all').values, P_ALL, 1e-9, `${where} ② stays`);
  });
  assert.equal(byId(results[1], 'name-whatif').label, 'What-if (k = 2)');
  // No appear on the What-if objects: their opacity is derived.
  assert.equal(byId(results[1], 'whatif-hint').label, 'What-if (k = 2): fills in after you check a Practice answer');
  assert.ok(!scene.timeline.some(e => ['whatif', 'name-whatif', 'whatif-before', 'whatif-after', 'whatif-hint'].includes(e.target)));
});

test('c22 before a committed attempt no cell, readout or caption at any k shows an answer number', () => {
  const FORBIDDEN = [0.45, 0.15, 0.60, 0.40, 0.75, 0.25, 0.65, 0.35, 0.85];
  const results = assertCardGates(scene, KS.map((k, topK) => ({ topK, revealed: false })));
  for (const [n, result] of results.entries()) {
    const visible = result.state.objects.filter(o => o.visible && (o.opacity ?? 1) > 0);
    const texts = visible.flatMap(o => [o.label, ...(o.columnLabels || []), ...(o.rowLabels || []), ...(o.tokens || []), ...(o.labels || [])].filter(Boolean));
    // One exemption: z's own uncut p, 0.6048, prints 0.60 in ② (and in ③ at k = 6).
    // It is not the What-if's kept mass and answers nothing; every other 0.60 is caught.
    const cells = visible.filter(o => ['grid', 'strip'].includes(o.type))
      .flatMap(o => shownCells(o).filter((text, i) => Math.abs(o.values[i] - P_ALL[0]) > 1e-9));
    const numbers = [...texts.flatMap(t => [...t.matchAll(/\d*\.\d+|\d+/g)].map(m => m[0])), ...cells.filter(Boolean)].map(Number);
    for (const bad of FORBIDDEN) assert.ok(!numbers.some(x => Math.abs(x - bad) < 1e-9), `k = ${n + 1}: ${bad} is on the card`);
    assert.deepEqual(texts.flatMap(ungroupedNumbers), []);
  }
});

test('c22 practice: an undrawn six-value distribution at top_k = 2; the naive default is wrong', () => {
  validateActivity(activity);
  assert.equal(activity.id, 'c22-practice');
  assert.equal(activity.check, 'choice_equals');
  assert.equal(activity.version, 1);
  assert.deepEqual(activity.fixedInputs, { topK: 1 });
  assert.equal(scene.exampleData.kLabels[activity.fixedInputs.topK], '2');
  assert.equal(activity.revealInput, 'revealed');
  assert.equal(activity.prompt, 'The card is at top_k = 2. Suppose a different model gave these six probabilities before any cut (not drawn): 0.45, 0.15, 0.13, 0.11, 0.10, 0.06. With top_k = 2, what would the two survivors’ probabilities be?');
  const labels = Object.fromEntries(activity.answer.options.map(o => [o.id, o.label]));
  assert.deepEqual(labels, { same: '0.45 and 0.15', even: '0.65 and 0.35', top: '0.85 and 0.15', proportional: '0.75 and 0.25' });
  assert.equal(new Set(Object.values(labels)).size, 4, 'distinct options');
  assert.equal(activity.answer.default, 'same', 'the naive default is wrong');
  assert.equal(activity.expected, 'proportional');
  for (const id of Object.keys(labels)) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'proportional');
  // The options are what each belief computes; only proportional renormalization sums to 1 with 3 : 1 kept.
  const [a, b] = P_WHATIF, keptMass = a + b, cutMass = 1 - keptMass;
  assert.equal(labels.same, `${a.toFixed(2)} and ${b.toFixed(2)}`);
  assert.equal(labels.even, `${(a + cutMass / 2).toFixed(2)} and ${(b + cutMass / 2).toFixed(2)}`);
  assert.equal(labels.top, `${(a + cutMass).toFixed(2)} and ${b.toFixed(2)}`);
  assert.equal(labels.proportional, `${(a / keptMass).toFixed(2)} and ${(b / keptMass).toFixed(2)}`);
  assert.equal(activity.feedbackPass, 'Right. top_k = 2 keeps the two largest logits; the other four become −∞, so their 0.40 is gone and softmax shares the whole 1 over what is left: each survivor ÷ 0.60, the kept mass. 0.45 → 0.75 and 0.15 → 0.25, still 3 to 1. The What-if row now shows it.');
  assert.equal(activity.feedbackFail, 'Not quite. The cut four get exactly 0; softmax shares the whole 1 over the survivors in proportion to their old p, each ÷ 0.60 (the kept mass): 0.75 and 0.25. “0.45 and 0.15” sums to 0.60, not 1; an even split or all to the top one breaks the 3 : 1 ratio. The What-if row now shows it.');
  assert.ok(activity.feedbackFail.length <= activity.feedbackPass.length + 40, 'the fail feedback is no heavier than the pass (two lines)');
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(t, /\.py\b|:\d{2,}|generate_fixtures/);
  // Not drawn: the card's own six p are not p′ at any k.
  for (const k of KS) assert.notDeepEqual(softmax(topK(LOGITS, k)).map(p => (p === null ? null : Math.round(p * 100) / 100)).slice(0, 2), [0.45, 0.15]);
});

test('c22 replay in pipeline order: ① and ② at 0, the ring and −∞ marks at 0.4, ③ at 0.8, the bars at 1.2, their top line at 1.4', () => {
  const at = id => scene.timeline.find(e => e.action === 'appear' && e.target === id)?.at;
  assert.deepEqual(['logits', 'p-all', 'kept-ring', 'cut-mark-1', 'cut-mark-5', 'p-cut', 'bars', 'bars-top', 'bars-top-key'].map(at), [0, 0, 0.4, 0.4, 0.4, 0.8, 1.2, 1.4, 1.4]);
  assert.equal(scene.duration, 1.6);
  for (const id of ['loop-step', 'k-readout', 'cut-mass', 'kept-mass', 'consequence', 'blank-note', 'default-note', 'order-note']) {
    assert.equal(scene.objects.find(o => o.id === id).initialState.opacity, undefined, `${id} is drawn at rest and at every moment`);
  }
});

test('c22 sources: every status is labelled on the card; the Source values are the fixtures’', () => {
  assertSources(sources, scene);
  assert.deepEqual([...new Set(sources.filter(s => s.kind === 'calculation').map(s => s.status))], ['Calculated toy example', 'Live calculation', 'Source value']);
  assert.ok(!sources.some(s => s.status === 'What-if'), 'the reveal labels itself; assertSources reads the default state');
  const cites = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  assert.deepEqual(cites, ['model.py:319-322', 'model.py:317-318', 'model.py:323-324', 'model.py:325-326', 'model.py:312-330', 'model.py:306-306',
    'sample.py:18-18', 'sample.py:87-87', 'README.md:54-54', 'data/shakespeare_char/prepare.py:24-25', 'data/shakespeare_char/prepare.py:55-61', 'train.py:137-155', 'model.py:133-133']);
  assert.equal(g.sample.top_k.value, 200);
  assert.equal(g.generateDefaults.top_k, null);
  assert.equal(fx.tokenizer.tokenizers.find(t => t.id === 'char').vocabSize, 65);
  const [result] = assertCardGates(scene, [{ topK: 1 }]);
  assert.equal(byId(result, 'default-note').label, 'Source value: generate() cuts nothing by default (top_k = None); the sampler sets 200, above all 65 characters.');
  assert.equal(byId(result, 'status').label, 'Logits: Calculated toy example · p, kept and cut mass: Live calculation · top_k defaults, 65: Source value');
});

const PATHS = ['model.py', 'sample.py', 'README.md', 'data/shakespeare_char/prepare.py', 'train.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c22 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
  const squash = t => t.replace(/\s+/g, ' ').trim();
  let quotes = 0;
  for (const source of sources.filter(s => s.kind === 'code')) {
    const [start, end] = source.lines;
    const cited = squash(pinnedFile(source.path).slice(start - 1, end).join(' '));
    for (const [, quote] of source.note.matchAll(/"([^"]+)"/g)) {
      quotes += 1;
      assert.ok(cited.includes(squash(quote)), `${source.path}:${start}-${end} lacks "${quote}"`);
    }
  }
  assert.ok(quotes >= 20, `${quotes} quotes checked`);
  // 65 is the logits' width: meta.pkl's vocab_size sets the model's, and lm_head emits one logit per entry.
  assert.match(pinnedFile('train.py')[155 - 1], /model_args\['vocab_size'\] = meta_vocab_size if meta_vocab_size is not None else 50304/);
  const model = pinnedFile('model.py'), sample = pinnedFile('sample.py');
  assert.match(model[133 - 1], /self\.lm_head = nn\.Linear\(config\.n_embd, config\.vocab_size, bias=False\)/);
  assert.match(model[306 - 1], /def generate\(self, idx, max_new_tokens, temperature=1\.0, top_k=None\):/);
  assert.match(model[318 - 1], /logits = logits\[:, -1, :\] \/ temperature/);
  assert.match(model[320 - 1], /if top_k is not None:/);
  assert.match(model[321 - 1], /v, _ = torch\.topk\(logits, min\(top_k, logits\.size\(-1\)\)\)/);
  assert.match(model[322 - 1], /logits\[logits < v\[:, \[-1\]\]\] = -float\('Inf'\)/, 'strictly below: a tie survives');
  assert.match(model[324 - 1], /probs = F\.softmax\(logits, dim=-1\)/);
  assert.match(model[326 - 1], /idx_next = torch\.multinomial\(probs, num_samples=1\)/);
  assert.ok(!model.slice(312 - 1, 330).some(l => /argmax/.test(l)), 'generate() has no argmax branch');
  assert.equal(Number(sample[18 - 1].match(/^top_k = (\d+)/)[1]), g.sample.top_k.value);
});

test('c22 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.equal(evidence.card, 'c22-top-k');
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
});
