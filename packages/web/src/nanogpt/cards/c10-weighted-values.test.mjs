import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { validateActivity, PREDICATES } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { ungroupedNumbers } from '../../scene-format.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence, Q, K, V, PLANE } from './c10-weighted-values.js';

// Independent oracle in plain JS - never the scene's derive graph: q·k over
// the visible keys, × 1/√hs, softmax, then Σ w_j v_j.
const CHARS = ['B', 'e', 'f', 'o'];
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const weightsAt = q => {
  const s = K.slice(0, q + 1).map(k => dot(Q[q], k) / Math.sqrt(2));
  const e = s.map(x => Math.exp(x - Math.max(...s)));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / t);
};
const mix = w => [0, 1].map(d => w.reduce((s, wj, j) => s + wj * V[j][d], 0));
const px = ([a, b]) => [PLANE.x0 + PLANE.unit * a, PLANE.y0 - PLANE.unit * b];
const close = (a, b, tol, where) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `${where}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
const ALL = [0, 1, 2, 3].flatMap(query => [false, true].map(revealed => ({ query, revealed })));

test('c10 passes every gate at every review state and every input combination', () => {
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.deepEqual(scene.inputs.map(i => [i.name, i.default, !!i.hidden]), [['query', 3, false], ['revealed', false, true]]);
  assert.deepEqual(reviewStates, [{ query: 3 }, { query: 2 }, { query: 1 }, { query: 0 }, { query: 3, revealed: true }]);
  // Characters, the same "Before we…" line as c11, c12 and c05 (resolved question 4).
  assert.deepEqual(scene.exampleData.tokens, CHARS);
  assert.deepEqual(scene.exampleData.tokens, fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 4));
  assert.ok(scene.objects.length <= 60);
});

test('c10 plan: single, verbatim objective, Self-attention 3 of 3, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'single');
  assert.deepEqual(plan.boundary.reviewed, {});
  assert.equal(plan.objective, 'After this card, the learner should understand that one attention head\'s output for a query is the weighted average of the value vectors that query can see, so it always lands between those values, pulled toward each in proportion to its weight.');
  const { name, position, of, relationships } = plan.boundary.sequence;
  assert.deepEqual([name, position, of], ['Self-attention', 3, 3]);
  assert.deepEqual(relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c11-causal-mask', 'in'], ['prerequisite', 'c12-score-scaling', 'in'],
    ['deepens', 'c13-multi-head', 'out'], ['prerequisite', 'c05-position-mixing', 'out']]);
  assert.ok(scene.height <= 900);
});

test('c10 toy literals and the plan\'s oracle table', () => {
  assert.deepEqual(Q, [[1, 0], [0, 1], [1, 1], [1, -1]]);
  assert.deepEqual(K, [[1, 0], [0, 1], [1, 1], [-1, 1]]);
  assert.deepEqual(V, [[1, 0], [-1, 0], [0, 1], [1, 1]]);
  assert.equal(scene.exampleData.invSqrtHs, 1 / Math.sqrt(2), 'computed, never a typed 0.7071');
  const ORACLE = [
    [[1], [1, 0]],
    [[0.33, 0.67], [-0.34, 0]],
    [[0.248, 0.248, 0.503], [0, 0.503]],
    [[0.539, 0.131, 0.266, 0.065], [0.472, 0.33]],
  ];
  ORACLE.forEach(([w, out], q) => {
    close(weightsAt(q), w, 0.005, `weights ${q}`);
    close(mix(weightsAt(q)), out, 0.005, `output ${q}`);
  });
});

test('c10 every query: weight row, output row, output dot, spokes and fades match the oracle', () => {
  const results = assertCardGates(scene, ALL);
  ALL.forEach(({ query, revealed }, k) => {
    const result = results[k];
    const where = JSON.stringify({ query, revealed });
    const w = weightsAt(query), out = mix(w);
    const row = byId(result, 'weights-row').values;
    close(row.slice(0, query + 1), w, 1e-6, where);
    assert.deepEqual(row.slice(query + 1), Array(3 - query).fill(null), `${where}: later characters are masked (blank), not 0`);
    close(byId(result, 'out-row').values, out, 1e-6, where);
    // The dot sits at the output drawn through the same affine map (the pool
    // rounds each weight to 3 decimals, so allow half a unit).
    const outDot = byId(result, 'out-dot');
    close([outDot.x, outDot.y], px(out), 0.5, `${where} out-dot`);
    for (let j = 0; j < 4; j += 1) {
      const spoke = byId(result, `spoke-${j}`);
      assert.deepEqual(spoke.from, { x: px(V[j])[0], y: px(V[j])[1] }, where);
      assert.deepEqual(spoke.to, { x: outDot.x, y: outDot.y }, `${where}: every spoke ends at the output dot`);
      assert.equal(spoke.opacity, j <= query && query > 0 ? 1 : 0, `${where} spoke ${j}`);
      assert.equal(byId(result, `value-${j}`).opacity, j <= query ? 1 : 0.3, `${where} value ${j}`);
      assert.equal(byId(result, `name-${j}`).opacity, j <= query ? 1 : 0.3, `${where} name ${j}`);
    }
    const top = w.indexOf(Math.max(...w));
    assert.equal(byId(result, 'caption').label, `Pulled hardest by “${CHARS[top]}”, its largest weight.`, where);
    assert.equal(byId(result, 'out-row').label, `this head’s output for “${CHARS[query]}”`);
    assert.equal(byId(result, 'weights-row').label, `weights of “${CHARS[query]}” (blank = later, weight 0)`);
    // Risk 4: "pulled hardest" names the largest weight; in this toy it is also the nearest value.
    const dist = V.slice(0, query + 1).map(v => Math.hypot(v[0] - out[0], v[1] - out[1]));
    assert.equal(dist.indexOf(Math.min(...dist)), top, `${where}: largest weight = nearest value in this toy`);
    // The output lands between the visible values: inside their bounding box.
    for (const d of [0, 1]) {
      const seen = V.slice(0, query + 1).map(v => v[d]);
      assert.ok(out[d] >= Math.min(...seen) - 1e-9 && out[d] <= Math.max(...seen) + 1e-9, `${where} dim ${d}`);
    }
  });
});

test('c10 the states the plan names: on B, between two, between three, inside four', () => {
  const [q3, q2, q1, q0] = assertCardGates(scene, reviewStates.slice(0, 4));
  assert.deepEqual(byId(q0, 'out-row').values, [1, 0], 'B: exactly its own value');
  const e = byId(q1, 'out-row').values;
  assert.equal(e[1], 0, 'e: on the segment between B and e');
  close(byId(q2, 'out-row').values, [0, 0.503], 0.001, 'f');
  close(byId(q3, 'out-row').values, [0.472, 0.33], 0.001, 'o');
});

test('c10 one colour scale that never moves, and a frame that never refits', () => {
  const results = assertCardGates(scene, ALL);
  for (const result of results) {
    assert.deepEqual(byId(result, 'v-table').valueDomain, byId(result, 'out-row').valueDomain);
    assert.deepEqual(byId(result, 'v-table').valueDomain, { min: -1, max: 1 });
  }
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  for (const [k, result] of results.entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
  }
  // Query-bound opacity never shares an object with a timeline appear.
  const bound = scene.objects.filter(o => o.initialState.opacity?.$derive).map(o => o.id);
  assert.ok(bound.length >= 13);
  assert.ok(!scene.timeline.some(event => bound.includes(event.target)));
  assert.deepEqual(scene.timeline.map(e => [e.action, e.target]).sort(), [['appear', 'out-dot'], ['appear', 'out-row'], ['appear', 'v-table'], ['appear', 'weights-row'], ['highlight', 'out-dot']]);
});

test('c10 practice: an equal-weight mix the card never draws', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.deepEqual(activity.fixedInputs, { query: 3 });
  assert.equal(activity.revealInput, 'revealed');
  assert.ok(scene.inputs.some(i => i.name === 'revealed' && i.hidden && i.type === 'bool'));
  const labels = Object.fromEntries(activity.answer.options.map(o => [o.id, o.label]));
  assert.deepEqual(labels, { unchanged: '(0.47, 0.33)', own: '(1.00, 1.00)', top: '(1.00, 0.00)', average: '(0.25, 0.50)', sum: '(1.00, 2.00)' });
  assert.equal(activity.answer.default, 'unchanged');
  assert.equal(activity.expected, 'average');
  for (const id of Object.keys(labels)) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'average');
  // Oracle: the plain average of V.
  close(mix([0.25, 0.25, 0.25, 0.25]), [0.25, 0.5], 1e-12, 'mean');
  // Undrawn: no drawn row is uniform over every character it sees, and no
  // drawn output is the mean.
  for (let q = 1; q < 4; q += 1) assert.ok(new Set(weightsAt(q).map(x => x.toFixed(3))).size > 1, `row ${q} is not uniform`);
  for (let q = 0; q < 4; q += 1) assert.ok(Math.hypot(...mix(weightsAt(q)).map((x, d) => x - [0.25, 0.5][d])) > 0.1, `output ${q} is not the mean`);
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
  assert.ok(activity.prompt.includes('“o”') && activity.prompt.includes('1/4'));
  assert.ok(activity.feedbackPass.includes('((1 − 1 + 0 + 1)/4, (0 + 0 + 1 + 1)/4) = (0.25, 0.50)'));
  for (const label of Object.values(labels)) assert.ok(activity.feedbackFail.includes(label), `feedbackFail explains ${label}`);
});

test('c10 reveal: a grey What-if dot at the mean, only after Check and only at the practice query', () => {
  const results = assertCardGates(scene, ALL);
  ALL.forEach(({ query, revealed }, k) => {
    const shown = revealed && query === 3 ? 1 : 0;
    const mean = byId(results[k], 'mean-dot');
    assert.equal(mean.opacity, shown);
    assert.equal(byId(results[k], 'legend-mean').opacity, shown);
    close([mean.x, mean.y], px([0.25, 0.5]), 1e-9, 'mean-dot');
  });
  assert.ok(byId(results[7], 'legend-mean').label.includes('What-if'));
});

test('c10 sources: every status is labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Calculated toy example', 'Live calculation']);
  assert.equal(sources.find(s => s.status === 'Calculated toy example').reproduce, undefined, 'authored on the card, not by the generator');
  const cites = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  assert.deepEqual(cites, ['model.py:66-71', 'model.py:56-59', 'model.py:33-33', 'model.py:62-64', 'model.py:39-39', 'model.py:70-70',
    'model.py:72-72', 'model.py:75-76', 'model.py:104-104', 'config/train_shakespeare_char.py:23-25', 'sample.py:51-51', 'train.py:216-228']);
  const [result] = assertCardGates(scene, [{ query: 3 }]);
  const A = fx.architecture;
  assert.equal(byId(result, 'size-note').label, `Source value: shakespeare_char heads have hs = ${A.n_embd} / ${A.n_head} = ${A.n_embd / A.n_head} numbers per v; this toy has hs = 2.`);
  assert.ok(byId(result, 'dropout-note').label.includes(`p = ${A.dropout}`));
  const labels = result.state.objects.filter(o => o.visible && o.label).map(o => o.label);
  assert.deepEqual(labels.flatMap(ungroupedNumbers), []);
});

const PATHS = ['model.py', 'config/train_shakespeare_char.py', 'sample.py', 'train.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c10 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(Number(config[23 - 1].match(/n_head = (\d+)/)[1]), fx.architecture.n_head);
  assert.equal(Number(config[24 - 1].match(/n_embd = (\d+)/)[1]), fx.architecture.n_embd);
  assert.equal(Number(config[25 - 1].match(/dropout = ([\d.]+)/)[1]), fx.architecture.dropout);
});

test('c10 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
});
