import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates, plan, activity, TOY } from './c04-block-stack.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { PREDICATES, validateActivity } from '../../scene-activity.js';
import { formatCell, groupDigits } from '../../scene-format.js';

const byId = result => new Map(result.state.objects.map(object => [object.id, object]));

// Independent oracle: the parameter tensors one Block owns in model.py @3adf61e
// with bias = False - nn.Linear(in, out) stores its weight as (out, in),
// LayerNorm(ndim) a weight of ndim - written from the source, not from the card.
const C = 384, L = 6, L_DEFAULT = 12, MAX = 12; // config/train_shakespeare_char.py:22,24; model.py:112 and train.py:52
const DEPTHS = Array.from({ length: MAX }, (unused, i) => i + 1);
const ALL = DEPTHS.map(n => ({ layers: n - 1 }));
const blockTensors = i => [
  [`transformer.h.${i}.ln_1.weight`, [C]],
  [`transformer.h.${i}.attn.c_attn.weight`, [3 * C, C]],
  [`transformer.h.${i}.attn.c_proj.weight`, [C, C]],
  [`transformer.h.${i}.ln_2.weight`, [C]],
  [`transformer.h.${i}.mlp.c_fc.weight`, [4 * C, C]],
  [`transformer.h.${i}.mlp.c_proj.weight`, [C, 4 * C]],
];
const numel = shape => shape.reduce((n, d) => n * d, 1);
const shapeText = shape => `(${shape.join(', ')}${shape.length === 1 ? ',' : ''}): ${groupDigits(numel(shape))} values`;
const PER_BLOCK = blockTensors(0).reduce((n, [, shape]) => n + numel(shape), 0);
const millions = n => (n / 1e6).toFixed(2);
const visibleLabels = result => result.state.objects.filter(object => object.visible && object.label).map(object => object.label);

test('passes every card gate at every depth and every review state', () => {
  assert.deepEqual(reviewStates, [{ layers: 0 }, { layers: 1 }, { layers: 5 }, { layers: 6 }, { layers: 11 }]);
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
  assert.ok(scene.height <= 900 && scene.width === 960);
  assert.ok(scene.objects.length <= 60);
  // One control: an n_layer slider over 1..12, starting at the source value.
  const visible = scene.inputs.filter(input => !input.hidden);
  assert.deepEqual(visible.map(input => `${input.name}:${input.type}:${input.presentation}`), ['layers:index:slider']);
  assert.deepEqual(scene.exampleData[visible[0].of], DEPTHS);
  assert.equal(scene.exampleData[visible[0].of][visible[0].default], L);
});

test('plan: the rebuilt c04 plan, no unreviewed boundary flags', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'single');
  assert.equal(plan.boundary.reviewed, undefined, 'the scene raises no rubric flag');
  assert.deepEqual(plan.boundary.sequence, { name: 'The block and the stack', position: 2, of: 2, relationships: [{ type: 'deepens', card: 'c02-block-anatomy' }] });
  assert.equal(plan.objective, 'After this card, the learner should understand that NanoGPT applies n_layer Blocks in order, each with the same structure but its own learned weights.');
  assert.match(plan.primaryInteraction, /^slide n_layer from 1 to 12/);
  assert.match(plan.check, /24-layer/, 'the practice names its undrawn case');
});

test('source values: n_layer, C and the default depth come from the fixture', () => {
  assert.deepEqual([fx.architecture.n_layer, fx.architecture.n_embd, fx.config.defaults.n_layer], [L, C, L_DEFAULT]);
  assert.equal(scene.exampleData.C, C);
  assert.equal(PER_BLOCK, 12 * C * C + 2 * C);
  assert.equal(PER_BLOCK, 1770240);
  const blocks = scene.objects.filter(object => /^block-\d+$/.test(object.id));
  assert.deepEqual(blocks.map(block => block.initialState.label), DEPTHS.map(n => `h[${n - 1}]`));
});

test('sliding n_layer: only built blocks show, the newest is haloed, ln_f follows it, and it all fits', () => {
  const results = assertCardGates(scene, ALL);
  results.forEach((result, i) => {
    const n = i + 1, where = `n_layer = ${n}`, objects = byId(result);
    for (let k = 0; k < MAX; k += 1) {
      const block = objects.get(`block-${k}`);
      assert.equal(block.visible, k < n, `${where}: block-${k} shown only when built`);
      assert.equal(block.highlighted, k === n - 1, `${where}: block-${k} halo on the newest only`);
      if (k < MAX - 1) assert.equal(objects.get(`a-${k}`).visible, k + 1 < n, `${where}: arrow into h[${k + 1}]`);
    }
    // x feeds h[0]; the last built block feeds ln_f, in its row, to its right.
    const newest = objects.get(`block-${n - 1}`), lnf = objects.get('ln-f'), into = objects.get('a-lnf');
    assert.ok(objects.get('x-in').visible && objects.get('a-x').visible && lnf.visible && objects.get('to-head').visible, where);
    assert.equal(lnf.y, newest.y, `${where}: ln_f in the newest block's row`);
    assert.ok(lnf.x > newest.x + newest.w && lnf.x - (newest.x + newest.w) <= 30, `${where}: ln_f right after h[${n - 1}]`);
    assert.ok(into.from.x > newest.x + newest.w && into.to.x < lnf.x && into.from.y === newest.y + newest.h / 2, `${where}: arrow h[${n - 1}] -> ln_f`);
    assert.ok(objects.get('to-head').x > lnf.x + lnf.w, `${where}: lm_head after ln_f`);
    // The wrap arrow h[5] -> h[6] ends above h[6]'s halo (8 above the box).
    assert.ok(objects.get('a-5').to.y <= objects.get('block-6').y - 8, `${where}: wrap arrow clears the halo`);
    // Fits 960 wide, no two chain boxes overlap.
    const shown = result.state.objects.filter(object => object.visible);
    for (const object of shown) {
      const right = object.type === 'arrow' ? Math.max(object.from.x, object.to.x) : object.x + (object.w || 0);
      assert.ok(right <= scene.width - 8, `${where}: ${object.id} ends at x=${right}`);
    }
    const boxes = shown.filter(object => object.type === 'box');
    boxes.forEach((a, p) => boxes.slice(p + 1).forEach(b => assert.ok(
      a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${where}: ${a.id} overlaps ${b.id}`)));
  });
  // Two rows of six at n_layer = 12, so every label keeps its full size.
  const twelve = byId(results[MAX - 1]);
  assert.equal(new Set(DEPTHS.map(n => twelve.get(`block-${n - 1}`).y)).size, 2);
  assert.ok(twelve.get('block-0').w >= 80);
});

test('sliding n_layer: names change by the index, shapes never do, the count is n_layer × one block', () => {
  assertCardGates(scene, ALL).map(byId).forEach((objects, i) => {
    const n = i + 1, where = `n_layer = ${n}`;
    blockTensors(n - 1).forEach(([name, shape], j) => {
      assert.equal(objects.get(`tensor-${j}`).label, name, where);
      assert.equal(objects.get(`shape-${j}`).label, shapeText(shape), where);
    });
    assert.equal(objects.get('tensors-head').label, `Parameter tensors of h[${n - 1}], the newest block`);
    const word = n === 1 ? '1 block' : `${n} blocks`;
    assert.equal(objects.get('count').label,
      `n_layer = ${n}: ${word} × ${groupDigits(PER_BLOCK)} = ${groupDigits(n * PER_BLOCK)} block parameters (${millions(n * PER_BLOCK)}M)`, where);
    // Constant lines.
    assert.equal(objects.get('per-block').label, `One block: ${groupDigits(PER_BLOCK)} parameters = 12C² + 2C at C = ${C}`);
    // The live step: the count at n minus the count at n - 1, recomputed here.
    assert.equal(objects.get('bars-3').label, `n_layer ${n - 1} → ${n} adds ${groupDigits(n * PER_BLOCK - (n - 1) * PER_BLOCK)} parameters.`, where);
    assert.equal(objects.get('bars-4').label, `Halo, dark bar and ring mark the newest block, h[${n - 1}].`, where);
  });
  // The printed numbers, spelled out once.
  assert.deepEqual(DEPTHS.map(n => millions(n * PER_BLOCK)),
    ['1.77', '3.54', '5.31', '7.08', '8.85', '10.62', '12.39', '14.16', '15.93', '17.70', '19.47', '21.24']);
  assert.equal(groupDigits(L_DEFAULT * PER_BLOCK), '21,242,880');
});

test('the bars: one per depth, equal steps, blank past n_layer, the current one marked', () => {
  assertCardGates(scene, ALL).map(byId).forEach((objects, i) => {
    const n = i + 1, bars = objects.get('bars');
    assert.deepEqual(bars.labels, DEPTHS.map(String));
    // One meaning, a running total: bar k is h[0] .. h[k-1], never block k's size.
    assert.equal(bars.label, 'Running total: bar k = h[0] … h[k−1] together');
    assert.equal(objects.get('bars-1').label, 'Bar k is k blocks together, not the size of block k.');
    assert.equal(objects.get('bars-2').label, 'Blank past n_layer: those blocks are not built.');
    assert.equal(bars.cellHighlight, n - 1, `n_layer = ${n}: marked bar`);
    bars.values.forEach((value, k) => {
      if (k < n) assert.ok(Math.abs(value - ((k + 1) * PER_BLOCK) / 1e6) < 1e-6, `n_layer = ${n}: bar ${k + 1} = ${value}`);
      else assert.equal(value, null, `n_layer = ${n}: bar ${k + 1} not built`);
    });
    // Linear: every built step is the same one block's worth.
    const steps = bars.values.slice(1, n).map((value, k) => value - bars.values[k]);
    steps.forEach(step => assert.ok(Math.abs(step - PER_BLOCK / 1e6) < 1e-6));
    // A pinned axis: the tallest possible bar fits, and no bar rescales between states.
    assert.ok(bars.peak >= (MAX * PER_BLOCK) / 1e6 && bars.peak < (MAX * PER_BLOCK) / 1e6 + 0.01);
  });
});

test('status follows the depth: Source value only at 6; 12 is NanoGPT’s default; every other depth a What-if', () => {
  assertCardGates(scene, ALL).forEach((result, i) => {
    const n = i + 1, status = byId(result).get('status').label, shown = visibleLabels(result).join('\n');
    if (n === L) {
      assert.ok(status.startsWith(`Source value: n_layer = ${L}, C = n_embd = ${C} (shakespeare_char)`), status);
    } else {
      assert.ok(status.startsWith(`What-if: n_layer = ${n}`), status);
      assert.doesNotMatch(shown, /Source value/, `n_layer = ${n} is never labelled a source value`);
      assert.match(status, new RegExp(`C = ${C}`));
      // The source depth is named for shakespeare_char, never read as C's.
      if (n !== L_DEFAULT) assert.ok(status.includes(`(shakespeare_char’s n_layer is ${L})`), status);
      else assert.ok(status.includes('(its default C is 768), here at C = 384'), status);
    }
    assert.equal(n === L_DEFAULT, status.includes('NanoGPT’s default depth'), status);
    assert.match(status, /Live calculation/);
  });
});

test('toy table: the previous and the newest block, h[0] alone at n_layer = 1', () => {
  assertCardGates(scene, ALL).map(byId).forEach((objects, i) => {
    const n = i + 1, grid = objects.get('toy-grid'), note = objects.get('toy-note').label;
    assert.ok(note.startsWith('Calculated toy example (not trained or initialised): '), note);
    if (n === 1) {
      assert.deepEqual([grid.rows, grid.rowLabels, grid.values, grid.cellHighlight], [1, ['h[0]'], TOY[0], { row: 0 }]);
      assert.match(note, /only h\[0\] is built/);
      assert.doesNotMatch(note, /h\[1\]/);
    } else {
      assert.deepEqual([grid.rows, grid.rowLabels, grid.values, grid.cellHighlight],
        [2, [`h[${n - 2}]`, `h[${n - 1}]`], [...TOY[n - 2], ...TOY[n - 1]], { row: 1 }], `n_layer = ${n}`);
      assert.match(note, new RegExp(`h\\[${n - 2}\\] and h\\[${n - 1}\\]: same shape, different numbers`));
    }
    // The legend sits under the table, whatever its height.
    assert.equal(objects.get('scale').y, grid.y + grid.rows * grid.cell + 26);
  });
});

test('toy rows: twelve, every row differs from every other in every entry, printed legibly', () => {
  assert.equal(TOY.length, MAX);
  TOY.forEach(row => assert.equal(row.length, 5));
  for (let a = 0; a < MAX; a += 1) {
    for (let b = a + 1; b < MAX; b += 1) TOY[a].forEach((value, j) => assert.notEqual(value, TOY[b][j], `h[${a}] vs h[${b}] column ${j}`));
  }
  const values = TOY.flat();
  assert.deepEqual(values.map(value => formatCell(value)), values.map(value => value.toFixed(2)));
  assert.ok(values.every(value => /^-?0\.\d\d$/.test(formatCell(value))));
  assert.equal(scene.objects.find(object => object.id === 'toy-grid').initialState.matrixKind, 'input');
  assert.ok(byId(evaluated(scene, {})).get('toy-grid').cell >= 42);
});

test('numbers in text: every long number carries separators, at every depth', () => {
  for (const result of assertCardGates(scene, ALL)) {
    for (const label of visibleLabels(result)) assert.doesNotMatch(label, /\d{5,}/, label);
  }
  for (const text of [activity.prompt, activity.feedbackPass, activity.feedbackFail, ...activity.answer.options.map(option => option.label)]) {
    assert.doesNotMatch(text, /\d{5,}/, text);
  }
});

test('practice: a 24-layer stack, past the slider - graded, citation-free, naive default wrong', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.ok(24 > Math.max(...scene.exampleData.counts), 'the asked depth is not drawn on the card');
  assert.match(activity.prompt, /^A 24-layer stack at the same C = 384/);
  const option = id => activity.answer.options.find(entry => entry.id === id).label;
  // The three readings, recomputed here: shared weights, separate weights,
  // deeper-means-bigger - as bare numbers, so no option restates the rule.
  assert.deepEqual(['shared', 'linear', 'bigger'].map(option), [PER_BLOCK, 24 * PER_BLOCK, 300 * PER_BLOCK].map(value => groupDigits(value)));
  for (const { label } of activity.answer.options) assert.match(label, /^[\d,]+$/);
  assert.equal(24 * 25 / 2, 300);
  assert.deepEqual([24 * PER_BLOCK, 300 * PER_BLOCK], [42485760, 531072000]);
  assert.equal(activity.expected, 'linear');
  assert.notEqual(activity.answer.default, activity.expected, 'the naive default is wrong');
  assert.equal(PREDICATES.choice_equals({ answer: 'linear' }, activity), true);
  for (const wrong of ['shared', 'bigger']) assert.equal(PREDICATES.choice_equals({ answer: wrong }, activity), false);
  assert.ok(activity.feedbackPass.includes(`= ${groupDigits(24 * PER_BLOCK)} (42.49M)`));
  assert.ok(activity.feedbackFail.includes(`= ${groupDigits(24 * PER_BLOCK)}`));
  for (const text of [activity.feedbackPass, activity.feedbackFail]) {
    assert.match(text, /one block's worth per layer/);
    // Both misconceptions explained by their numbers, now the options carry none.
    for (const value of [PER_BLOCK, 300 * PER_BLOCK]) assert.ok(text.includes(groupDigits(value)), `feedback names ${groupDigits(value)}`);
  }
  for (const text of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(text, /\.py\b|:\d+|generate_fixtures/);
});

test('sources: well-formed, pinned, and every status labelled on the card', () => {
  assertSources(sources, scene);
  const cited = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  for (const ref of ['model.py:130-130', 'model.py:180-182', 'model.py:96-101', 'model.py:35-37', 'model.py:82-84', 'model.py:21-24',
    'train.py:56-56', 'model.py:162-166', 'model.py:141-145', 'model.py:138-138', 'config/train_shakespeare_char.py:22-24', 'model.py:112-114', 'train.py:52-54']) {
    assert.ok(cited.includes(ref), `cites ${ref}`);
  }
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Live calculation', 'Calculated toy example', 'What-if']);
  // Typed on this card, not by the fixture generator: no reproduce command.
  assert.equal(sources.find(s => s.status === 'Calculated toy example').reproduce, undefined);
});

const pinned = sources.filter(s => s.kind === 'code').every(s => pinnedFile(s.path));
test('sources: quoted code is verbatim at the cited lines', { skip: !pinned && 'pinned NanoGPT cache not present (run generate_fixtures.py)' }, () => {
  for (const { path, lines: [start, end], note } of sources.filter(s => s.kind === 'code')) {
    const cited = pinnedFile(path).slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start}: note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
  // The oracle's sizes are the pinned files' literals.
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(config[22 - 1].trim(), `n_layer = ${L}`);
  assert.equal(config[24 - 1].trim(), `n_embd = ${C}`);
  assert.equal(pinnedFile('train.py')[52 - 1].trim(), `n_layer = ${L_DEFAULT}`);
  assert.equal(pinnedFile('model.py')[112 - 1].trim(), `n_layer: int = ${L_DEFAULT}`);
});

test('takeaways: the list comprehension builds the Blocks, the ModuleList holds them; no weight is shared between Blocks', () => {
  const objects = byId(evaluated(scene, {}));
  assert.equal(objects.get('takeaway').label, 'n_layer Blocks from one recipe, held in an nn.ModuleList; h[0] reads x, each later Block the previous one’s output.');
  assert.ok(objects.get('takeaway-2').label.startsWith('No weight is shared between Blocks.'));
  assert.match(objects.get('takeaway-2').label, /wte = lm_head, sits outside the stack/);
});

test('evidence record is complete and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(evidence.learningQuestion.length <= 95);
  assert.match(evidence.control, /slider/);
  assert.match(evidence.provenance, /:141-145/);
});
