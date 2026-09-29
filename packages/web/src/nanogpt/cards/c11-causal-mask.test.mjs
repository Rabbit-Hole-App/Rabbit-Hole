import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { validateActivity, PREDICATES } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence, TRIL, TARGETS } from './c11-causal-mask.js';

// Independent oracle: the tokenizer card's sentence split into characters, the
// triangle and the even split written out in plain JS - never the derive graph.
const TEXT = [...fx.tokenizer.text];
const T = 6;
const r3 = v => Math.round(v * 1000) / 1000;
// A data cell carries the canonical value (float noise removed at 9 decimals).
const c9 = v => Math.round(v * 1e9) / 1e9;
const tril = Array.from({ length: T }, (unused, i) => Array.from({ length: T }, (unused2, j) => (j <= i ? 1 : 0)));
const weightsOn = tril.flatMap((row, i) => row.map(v => (v ? c9(1 / (i + 1)) : null)));
const weightsOff = Array(T * T).fill(c9(1 / T));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };

test('c11 passes every gate at both review states', () => {
  assertCardGates(scene, reviewStates);
  assert.deepEqual(reviewStates, [{ mask: true }, { mask: false }]);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.equal(scene.objects[0].initialState.typography, 'heading');
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.label, i.default]), [['mask', 'bool', 'Causal mask (off = What-if)', true]]);
  assert.ok(scene.objects.length <= 60);
});

test('c11 plan: staged, verbatim objective, sequence "Self-attention" 1 of 3, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(plan.boundary.reviewed, {});
  assert.equal(plan.objective, 'After this card, the learner should understand that the causal mask is one fixed lower triangle over the T × T scores, so every position reads only itself and earlier positions, never the next character it is trained to predict.');
  assert.deepEqual(plan.boundary.sequence, { name: 'Self-attention', position: 1, of: 3, relationships: [
    { type: 'prerequisite', card: 'c12-score-scaling', direction: 'out' },
    { type: 'prerequisite', card: 'c10-weighted-values', direction: 'out' },
    { type: 'prerequisite', card: 'c05-position-mixing', direction: 'out' },
    { type: 'prerequisite', card: 'c13-multi-head', direction: 'out' },
  ] });
  assert.ok(scene.height <= 900);
});

test('c11 labels: real shakespeare_char characters, row i predicts character i + 1', () => {
  assert.equal(TEXT.slice(0, 7).join(''), 'Before ');
  const [result] = assertCardGates(scene, [{ mask: true }]);
  const table = byId(result, 'mask-table');
  assert.deepEqual(table.rowLabels, ['0 · B → e', '1 · e → f', '2 · f → o', '3 · o → r', '4 · r → e', '5 · e → •']);
  assert.deepEqual(table.columnLabels, ['0 B', '1 e', '2 f', '3 o', '4 r', '5 e']);
  assert.deepEqual(byId(result, 'weights').rowLabels, table.columnLabels);
  assert.deepEqual(byId(result, 'weights').columnLabels, table.columnLabels);
  // The legend names the space, the character after the window, and never uses
  // "read" for the labels ("read" is what attention may access).
  assert.match(byId(result, 'legend').label, /^Row label .*\(• = space, beyond this window\)/);
});

test('c11 mask on: the triangle, the even split, and every highlighted target is its row\'s first 0', () => {
  const [result] = assertCardGates(scene, [{ mask: true }]);
  const table = byId(result, 'mask-table');
  assert.deepEqual(TRIL, tril);
  assert.deepEqual(table.values, tril.flat());
  assert.equal(table.numberFormat, 'integer');
  assert.deepEqual(byId(result, 'weights').values, weightsOn);
  // Each row's kept weights sum to 1 before display rounding.
  const values = byId(result, 'weights').values;
  for (let i = 0; i < T; i += 1) assert.equal(r3(values.slice(i * T, (i + 1) * T).reduce((sum, v) => sum + (v ?? 0), 0)), 1, `row ${i}`);
  // Highlighted cells: (i, i + 1) for rows 0-4; row 5's target is past the window.
  assert.deepEqual(TARGETS, [1, 8, 15, 22, 29]);
  assert.deepEqual(table.cellHighlight, TARGETS);
  assert.equal(table.cellHighlightKind, 'highlight');
  // ① shades its 1s on the same fixed [0, 1] heat as ②, so the triangle reads.
  assert.deepEqual([table.heat, table.valueDomain], [byId(result, 'weights').heat, { min: 0, max: 1 }]);
  // Each target is framed by four lines inside its own cell, in a hue that is not the grid's.
  const lines = result.state.objects.filter(o => o.type === 'line');
  assert.equal(lines.length, 4 * TARGETS.length);
  for (const [i] of TARGETS.entries()) {
    const own = lines.filter(o => o.id.startsWith(`target-${i}-`));
    const xs = own.flatMap(o => [o.from.x, o.to.x]), ys = own.flatMap(o => [o.from.y, o.to.y]);
    const cx = table.x + (i + 1) * 44, cy = table.y + i * 44;
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [cx + 3, cx + 41, cy + 3, cy + 41], `target ${i}`);
    assert.ok(own.every(o => o.role === 'observed'));
  }
  for (const [i, index] of TARGETS.entries()) {
    assert.equal(index, i * T + i + 1);
    const row = tril[i];
    assert.equal(row.indexOf(0), i + 1, `row ${i}: the target is the first 0`);
    assert.equal(weightsOn[index], null, `row ${i}: the target's weight is blocked`);
  }
  assert.equal(table.label, '① causal mask: 1 = may read, 0 = blocked');
  assert.equal(byId(result, 'weights').label, '② weights: 0 → score −∞ → weight 0');
  assert.equal(byId(result, 'reads').label, 'Each position reads itself and every earlier one, never a later one.');
  assert.equal(byId(result, 'target').label, 'The highlighted cell is the next character, the one that row is trained to predict: always blocked.');
});

test('c11 mask off (What-if): every cell 1, every row spread over all T, row 5 unchanged', () => {
  const [on, off] = assertCardGates(scene, reviewStates);
  const table = byId(off, 'mask-table');
  assert.deepEqual(table.values, Array(T * T).fill(1));
  assert.deepEqual(table.cellHighlight, TARGETS, 'the targets stay highlighted');
  assert.deepEqual(byId(off, 'weights').values, weightsOff);
  assert.deepEqual(byId(off, 'weights').values.slice(5 * T), byId(on, 'weights').values.slice(5 * T), 'row 5 is the same in both states');
  assert.equal(table.label, '① What-if, no mask: every cell 1');
  assert.equal(byId(off, 'weights').label, `② What-if weights: every row spreads over all ${T}`);
  assert.equal(byId(off, 'reads').label, `What-if, no mask: every row reads all ${T} positions, later ones included.`);
  // Row 5 has no highlighted cell, so the caption names rows 0 to 4 only.
  assert.equal(byId(off, 'target').label, 'Rows 0 to 4 could each read their highlighted cell: the very character each is trained to predict.');
  // What holds in both states is identical text.
  for (const id of ['question', 'status', 'equal-scores', 'legend', 'footer', 'rounding']) assert.equal(byId(on, id).label, byId(off, id).label, id);
  // No "this": with the mask off there is no triangle on screen to point at.
  assert.equal(byId(on, 'footer').label, `NanoGPT always uses the triangle, in every head and every layer, for any T up to block_size = ${fx.architecture.block_size}.`);
});

test('c11 frame: scale 1, identical bounds in both states, grid titles inside the frame', () => {
  const results = assertCardGates(scene, reviewStates);
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1, 'drawn unscaled');
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  // sceneContentBounds measures every grid title too, so identical bounds in
  // both states mean no title (the long What-if one included) refits the frame.
  for (const [k, result] of results.entries()) {
    const bounds = sceneContentBounds(result.scene);
    assert.deepEqual(withoutContributors(bounds), withoutContributors(legibility.bounds), JSON.stringify(reviewStates[k]));
    assert.ok(bounds.xMax <= scene.width, `xMax ${bounds.xMax}`);
    // No rounding note in a grid label.
    for (const id of ['mask-table', 'weights']) assert.doesNotMatch(byId(result, id).label, /round|0\.99|1\.02/);
  }
  // The replay: grid 1 with its target frames at 0 s, arrow at 0.6 s, grid 2 at 1.0 s; no input-bound opacity.
  const frames = scene.objects.filter(o => o.type === 'line').map(o => o.id);
  assert.deepEqual(scene.timeline.map(e => [e.at, e.target]), [[0, 'mask-table'], ...frames.map(id => [0, id]), [0.6, 'mask-to-weights'], [1, 'weights']]);
});

test('c11 practice: row 99 of a 256 window, a row the card does not draw', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.deepEqual(activity.fixedInputs, { mask: true });
  const BS = fx.architecture.block_size;
  assert.equal(BS, 256);
  assert.ok(activity.prompt.includes(`T = ${BS}`) && activity.prompt.includes('position 99'));
  assert.ok(99 >= T, 'the card draws rows 0-5 only');
  assert.deepEqual(activity.answer.options.map(o => [o.id, o.label]), [['before', '0 to 98'], ['self', '0 to 99'], ['target', '0 to 100'], ['all', '0 to 255 (all 256)']]);
  // The rule, applied independently: row i keeps columns 0..i of a BS-long window.
  const kept = Array.from({ length: BS }, (unused, j) => j).filter(j => j <= 99);
  assert.deepEqual([kept[0], kept.at(-1), kept.length], [0, 99, 100]);
  assert.equal(activity.answer.default, 'all');
  for (const { id } of activity.answer.options) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'self');
  assert.equal(PREDICATES.choice_equals({ answer: activity.answer.default }, activity), false, 'the naive default is wrong');
  assert.equal(activity.feedbackPass, 'Right: position 99 reads positions 0 to 99, itself and every earlier one, 100 in all. Position 100 is the character it is trained to predict, and it is blocked with everything after it, up to 255.');
  assert.match(activity.feedbackFail, /diagonal stays/);
  assert.match(activity.feedbackFail, /row 5 reads 0 to 5/);
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
});

test('c11 sources: every status is labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Calculated toy example', 'Live calculation', 'What-if']);
  assert.equal(sources.find(s => s.status === 'Calculated toy example').reproduce, undefined, 'authored on the card, not by the generator');
  assert.match(sources.find(s => s.status === 'Live calculation').note, /0\.99.*1\.02/, 'the rounding is explained in sources');
  const cites = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  assert.deepEqual(cites, ['model.py:46-50', 'model.py:67-69', 'model.py:70-70', 'model.py:44-45', 'model.py:62-64', 'model.py:99-99', 'model.py:130-130',
    'model.py:173-173', 'train.py:123-125', 'model.py:184-187', 'config/train_shakespeare_char.py:19-19']);
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c11 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  assert.ok(quotes >= 16, `${quotes} quotes checked`);
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(Number(config[19 - 1].match(/block_size = (\d+)/)[1]), fx.architecture.block_size);
});

test('c11 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
});
