import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates, plan, activity, TOY, PARTS } from './c04-block-stack.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { PREDICATES, validateActivity } from '../../scene-activity.js';
import { formatCell, groupDigits } from '../../scene-format.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';

const byId = result => new Map(result.state.objects.map(object => [object.id, object]));

// Independent oracle: the parameter tensors one Block owns in model.py @3adf61e
// with bias = False - nn.Linear(in, out) stores its weight as (out, in),
// LayerNorm(ndim) a weight of ndim - written from the source, not from the card.
const C = 384, L = 6, L_DEFAULT = 12, MAX = 12; // config/train_shakespeare_char.py:22,24; model.py:112 and train.py:52
const DEPTHS = Array.from({ length: MAX }, (unused, i) => i + 1);
// Sub-cards: 0 the chain, 1 the tensors and toy table (one block), 2 the count and bars (× n_layer).
const on = part => DEPTHS.map(n => ({ part, layers: n - 1 }));
const EVERY = [0, 1, 2].flatMap(on);
const CHAIN = ['x-in', 'a-x', ...DEPTHS.map(n => `block-${n - 1}`), ...DEPTHS.slice(0, -1).map(n => `a-${n - 1}`), 'a-lnf', 'ln-f', 'a-head', 'to-head'];
const PART_IDS = [
  ['question', ...CHAIN, 'newest', 'takeaway'],
  ['question-owns', 'tensors-head', ...[0, 1, 2, 3, 4, 5].flatMap(j => [`tensor-${j}`, `shape-${j}`]), 'per-block', 'per-block-2', 'toy-grid', 'scale', 'toy-note', 'takeaway-2'],
  ['question-count', 'count', 'bars', 'bars-1', 'bars-2', 'bars-3', 'bars-4'],
];
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
  // n_layer = 1, 6 and 12 on every part; 2 (the first arrow; the first pair) on the chain and
  // the toy table; 7 (the wrap) on the chain.
  assert.deepEqual(reviewStates, [
    { part: 0, layers: 0 }, { part: 0, layers: 1 }, { part: 0, layers: 5 }, { part: 0, layers: 6 }, { part: 0, layers: 11 },
    { part: 1, layers: 0 }, { part: 1, layers: 1 }, { part: 1, layers: 5 }, { part: 1, layers: 11 },
    { part: 2, layers: 0 }, { part: 2, layers: 5 }, { part: 2, layers: 11 },
  ]);
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, EVERY);
  assert.ok(scene.height <= 900 && scene.width === 960);
  for (const part of [0, 1, 2]) assert.ok(scene.objects.filter(object => object.part === undefined || object.part === part).length <= 60);
  // One INTERACT control: an n_layer slider over 1..12, starting at the source
  // value; the pager draws in the card header.
  const visible = scene.inputs.filter(input => !input.hidden);
  assert.deepEqual(visible.map(input => `${input.name}:${input.type}:${input.presentation}`), ['part:index:pager', 'layers:index:slider']);
  const slider = visible[1];
  assert.deepEqual(scene.exampleData[slider.of], DEPTHS);
  assert.equal(scene.exampleData[slider.of][slider.default], L);
});

test('sub-cards: three parts, each object on one part, only the status on all, one visual each', () => {
  assert.deepEqual(PARTS, ['Blocks run in order', 'What each Block owns', 'The parameter count']);
  assert.deepEqual(scene.inputs.find(input => input.presentation === 'pager'),
    { name: 'part', type: 'index', label: 'Part', of: 'parts', default: 0, presentation: 'pager' });
  assert.deepEqual(scene.exampleData.parts, PARTS);
  assert.deepEqual(scene.objects.filter(object => object.part === undefined).map(object => object.id), ['status']);
  PART_IDS.forEach((ids, part) => assert.deepEqual(scene.objects.filter(object => object.part === part).map(object => object.id).sort(), [...ids].sort(), `part ${part}`));
  // Question first on each part: its first object, on the top line, and before the status in document order.
  PART_IDS.forEach((ids, part) => {
    const first = scene.objects.find(object => object.part === part);
    assert.deepEqual([first.id, first.type, first.initialState.y], [ids[0], 'text', 34], `part ${part}`);
    const shown = evaluated(scene, { part }).state.objects.filter(object => object.visible).map(object => object.id);
    assert.deepEqual(shown.slice(0, 2), [ids[0], 'status'], `part ${part}`);
  });
  // One visual per part: the chain, the bars, the toy table.
  assert.ok(scene.objects.filter(object => ['box', 'arrow'].includes(object.type)).every(object => object.part === 0), 'the chain lives on 1/3');
  assert.deepEqual([0, 1, 2].map(part => scene.objects.filter(object => object.part === part && ['bars', 'grid'].includes(object.type)).map(object => object.id)), [[], ['toy-grid'], ['bars']]);
  // What shows: the status and the part's own objects, and on the chain only the built blocks.
  const built = (id, n) => { const k = /^(block|a)-(\d+)$/.exec(id); return !k || (k[1] === 'block' ? +k[2] < n : +k[2] + 1 < n); };
  assertCardGates(scene, EVERY).forEach((result, i) => {
    const { part, layers } = EVERY[i];
    const shown = result.state.objects.filter(object => object.visible).map(object => object.id).sort();
    assert.deepEqual(shown, ['status', ...PART_IDS[part].filter(id => built(id, layers + 1))].sort(), JSON.stringify(EVERY[i]));
  });
});

test('the frame never refits: every part at every depth has the static bounds, drawn at scale 1', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  const { contributors: _c, ...fixed } = legibility.bounds;
  // The tallest part fits the viewport cap unscaled (about 800 x 1060 content units).
  assert.ok(fixed.yMax - fixed.yMin <= 800 && fixed.xMax - fixed.xMin <= 1060, JSON.stringify(fixed));
  for (const [i, result] of assertCardGates(scene, EVERY).entries()) {
    const { contributors: _d, ...box } = sceneContentBounds(result.scene);
    assert.deepEqual(box, fixed, JSON.stringify(EVERY[i]));
  }
});

test('plan: the rebuilt c04 plan, no unreviewed boundary flags', () => {
  assert.match(plan.boundary.reason, /Paged into three sub-cards, one visual each: Part 1\/3 the chain, Part 2\/3 the tensors and toy table/);
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'single');
  assert.equal(plan.boundary.reviewed, undefined, 'the scene raises no rubric flag');
  assert.deepEqual(plan.boundary.sequence, { name: 'The block and the stack', position: 2, of: 2, relationships: [{ type: 'deepens', card: 'c02-block-anatomy', direction: 'in' }] });
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
  const results = assertCardGates(scene, on(0));
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
    // The two notes sit under the last built row (and its halo), not under an empty one.
    const lowest = Math.max(...shown.filter(object => object.type === 'box').map(object => object.y + object.h));
    assert.equal(objects.get('newest').y, n <= 6 ? 180 : 272, where);
    assert.equal(objects.get('takeaway').y, objects.get('newest').y + 24, where);
    assert.ok(objects.get('newest').y - 13 >= lowest + 8 + 8, `${where}: notes clear the halo`);
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
  // The tensors on 2/3, the count and step on 3/3: each read where it shows.
  const counts = assertCardGates(scene, on(2)).map(byId);
  assertCardGates(scene, on(1)).map(byId).forEach((owns, i) => {
    const n = i + 1, where = `n_layer = ${n}`;
    const objects = new Map([...owns, ...counts[i]].filter(([, object]) => object.visible));
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
    assert.equal(objects.get('bars-4').label, `Dark bar: the total through the newest block, h[${n - 1}].`, where);
  });
  // The printed numbers, spelled out once.
  assert.deepEqual(DEPTHS.map(n => millions(n * PER_BLOCK)),
    ['1.77', '3.54', '5.31', '7.08', '8.85', '10.62', '12.39', '14.16', '15.93', '17.70', '19.47', '21.24']);
  assert.equal(groupDigits(L_DEFAULT * PER_BLOCK), '21,242,880');
});

test('the bars: one per depth, equal steps, blank past n_layer, the current one marked', () => {
  assertCardGates(scene, on(2)).map(byId).forEach((objects, i) => {
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
  assertCardGates(scene, EVERY).forEach((result, i) => {
    const n = EVERY[i].layers + 1, status = byId(result).get('status').label, shown = visibleLabels(result).join('\n');
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
  assertCardGates(scene, on(1)).map(byId).forEach((objects, i) => {
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
  assert.ok(byId(evaluated(scene, { part: 1 })).get('toy-grid').cell >= 42);
});

test('numbers in text: every long number carries separators, at every depth', () => {
  for (const result of assertCardGates(scene, EVERY)) {
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
  // Each status is labelled on the sub-card whose values it describes; the
  // card-wide check reads every part at once. The status line is on all three.
  assertSources(sources, { ...scene, objects: scene.objects.map(({ part: _part, ...object }) => object) });
  const labels = part => visibleLabels(evaluated(scene, { part })).join('\n');
  assert.deepEqual([0, 1, 2].map(part => ['Source value', 'Live calculation', 'What-if', 'Calculated toy example'].filter(status => labels(part).includes(status))),
    [['Source value', 'Live calculation', 'What-if'], ['Source value', 'Live calculation', 'What-if', 'Calculated toy example'], ['Source value', 'Live calculation', 'What-if']]);
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
  // The chain's takeaway and halo note on 1/3, the no-sharing takeaway on 2/3.
  const objects = new Map([...byId(evaluated(scene, { part: 0 }))].filter(([id]) => /^(takeaway|newest)$/.test(id))
    .concat([...byId(evaluated(scene, { part: 1 }))].filter(([id]) => id === 'takeaway-2')));
  assert.ok([...objects.values()].every(object => object.visible));
  assert.equal(objects.get('newest').label, 'The halo marks the newest block, h[5].');
  assert.equal(objects.get('takeaway').label, 'n_layer Blocks from one recipe, held in an nn.ModuleList; h[0] reads x, each later Block the previous one’s output.');
  assert.ok(objects.get('takeaway-2').label.startsWith('No weight is shared between Blocks.'));
  assert.match(objects.get('takeaway-2').label, /wte = lm_head, sits outside the stack/);
});

test('evidence record is complete and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].semanticId, 'question');
  // The card's question, asked a part at a time on the surface.
  assert.equal(evidence.learningQuestion, 'n_layer Blocks run in order - what do they share, and what does each Block own?');
  assert.deepEqual(PART_IDS.map(ids => scene.objects.find(object => object.id === ids[0]).initialState.text), [
    'n_layer Blocks run in order - what does each Block read?',
    'What do the Blocks share, and what does each Block own?',
    'Add one Block - how much does the parameter count grow?',
  ]);
  assert.ok(evidence.learningQuestion.length <= 95);
  assert.match(evidence.consequence, /Part · 1\/3/);
  assert.match(evidence.control, /slider/);
  assert.match(evidence.provenance, /:141-145/);
});
