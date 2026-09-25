import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates, plan, activity } from './c04-block-stack.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { PREDICATES, validateActivity } from '../../scene-activity.js';
import { formatCell } from '../../scene-format.js';

const byId = result => new Map(result.state.objects.map(object => [object.id, object]));
const ALL = Array.from({ length: fx.architecture.n_layer }, (unused, block) => ({ block }));

// Independent oracle: the parameter tensors one Block owns in model.py @3adf61e
// with bias = False - nn.Linear(in, out) stores its weight as (out, in),
// LayerNorm(ndim) a weight of ndim - written from the source, not from the card.
const C = 384, L = 6, L_DEFAULT = 12; // config/train_shakespeare_char.py:22,24 and train.py:52
const blockTensors = i => [
  [`transformer.h.${i}.ln_1.weight`, [C]],
  [`transformer.h.${i}.attn.c_attn.weight`, [3 * C, C]],
  [`transformer.h.${i}.attn.c_proj.weight`, [C, C]],
  [`transformer.h.${i}.ln_2.weight`, [C]],
  [`transformer.h.${i}.mlp.c_fc.weight`, [4 * C, C]],
  [`transformer.h.${i}.mlp.c_proj.weight`, [C, 4 * C]],
];
const numel = shape => shape.reduce((n, d) => n * d, 1);
const shapeText = shape => `(${shape.join(', ')}${shape.length === 1 ? ',' : ''}): ${numel(shape)} values`;
const PER_BLOCK = blockTensors(0).reduce((n, [, shape]) => n + numel(shape), 0);
const millions = n => String(Math.round(n / 1e4) / 100);

test('passes every card gate at every block', () => {
  assert.deepEqual(reviewStates, [{ block: 0 }, { block: 1 }, { block: 4 }, { block: 5 }]);
  assertCardGates(scene, ALL);
  assert.deepEqual(scene.inputs.filter(input => !input.hidden).map(input => `${input.type}:${input.presentation}`), ['index:picker']);
});

test('plan: the approved batch-2 plan, no unreviewed boundary flags', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'single');
  assert.deepEqual(plan.boundary.sequence, { name: 'The block and the stack', position: 2, of: 2, relationships: [{ type: 'deepens', card: 'c02-block-anatomy' }] });
  assert.equal(plan.objective, 'After this card, the learner should understand that NanoGPT applies n_layer Blocks in order, each with the same structure but its own learned weights.');
});

test('source values: n_layer, C and the default depth come from the fixture', () => {
  assert.deepEqual([fx.architecture.n_layer, fx.architecture.n_embd, fx.config.defaults.n_layer], [L, C, L_DEFAULT]);
  assert.deepEqual([scene.exampleData.L, scene.exampleData.C, scene.exampleData.Ldefault], [L, C, L_DEFAULT]);
  assert.equal(PER_BLOCK, 12 * C * C + 2 * C);
  const blocks = scene.objects.filter(object => /^block-\d+$/.test(object.id));
  assert.deepEqual(blocks.map(block => block.initialState.label), Array.from({ length: L }, (unused, k) => `h[${k}]`));
});

test('picking a block: names change by the index, shapes never do, the count grows by one block', () => {
  const results = assertCardGates(scene, ALL).map(byId);
  results.forEach((objects, i) => {
    const where = `h[${i}]`;
    blockTensors(i).forEach(([name, shape], j) => {
      assert.equal(objects.get(`tensor-${j}`).label, name, where);
      assert.equal(objects.get(`shape-${j}`).label, shapeText(shape), where);
    });
    assert.equal(objects.get('tensors-head').label, `Parameter tensors of h[${i}]`);
    const running = (i + 1) * PER_BLOCK;
    const lit = i === 0 ? 'h[0]' : `h[0] … h[${i}]`;
    const word = i === 0 ? '1 block' : `${i + 1} blocks`;
    assert.equal(objects.get('running').label, `Lit ${lit}: ${word} × ${PER_BLOCK} = ${running} parameters (${millions(running)}M)`);
    // The chain: lit through the pick, halo on the pick only; the table ring on its row.
    for (let k = 0; k < L; k += 1) {
      assert.equal(objects.get(`block-${k}`).role, k <= i ? 'output' : 'neutral', `${where}: block-${k} role`);
      assert.equal(objects.get(`block-${k}`).highlighted, k === i, `${where}: block-${k} halo`);
    }
    assert.deepEqual(objects.get('toy-grid').cellHighlight, { row: i });
    // Constant lines.
    assert.equal(objects.get('per-block').label, `One block: ${PER_BLOCK} parameters = 12C² + 2C at C = ${C}`);
    assert.equal(objects.get('stack').label, `The whole stack, n_layer = ${L} blocks: ${L * PER_BLOCK} parameters (${millions(L * PER_BLOCK)}M).`);
    assert.equal(objects.get('what-if').label,
      `What-if: NanoGPT’s default depth, n_layer = ${L_DEFAULT}, at the same C: ${L_DEFAULT * PER_BLOCK} (${millions(L_DEFAULT * PER_BLOCK)}M) - more blocks, not bigger ones.`);
  });
  // The printed numbers, spelled out once.
  assert.equal(PER_BLOCK, 1770240);
  assert.deepEqual(results.map((unused, i) => millions((i + 1) * PER_BLOCK)), ['1.77', '3.54', '5.31', '7.08', '8.85', '10.62']);
  assert.equal(millions(L_DEFAULT * PER_BLOCK), '21.24');
});

test('toy table: one row per block, every row differs from every other in every entry', () => {
  const grid = byId(evaluated(scene, { block: 0 })).get('toy-grid');
  assert.deepEqual([grid.rows, grid.cols], [L, 5]);
  assert.equal(scene.objects.find(object => object.id === 'toy-grid').initialState.matrixKind, 'input');
  const rows = Array.from({ length: L }, (unused, r) => grid.values.slice(r * 5, (r + 1) * 5));
  for (let a = 0; a < L; a += 1) {
    for (let b = a + 1; b < L; b += 1) rows[a].forEach((value, j) => assert.notEqual(value, rows[b][j], `h[${a}] vs h[${b}] column ${j}`));
  }
  // Each cell prints its authored two-decimal value with the leading zero
  // (the 12px floor on those numbers is a gate).
  assert.deepEqual(grid.values.map(value => formatCell(value)), grid.values.map(value => value.toFixed(2)));
  assert.ok(grid.values.every(value => /^-?0\.\d\d$/.test(formatCell(value))));
  assert.ok(grid.cell >= 42);
});

test('practice: do two blocks share weights - graded, citation-free, and answerable from the card', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.equal(activity.expected, 'separate');
  assert.ok(activity.answer.options.some(option => option.id === activity.expected));
  assert.equal(PREDICATES.choice_equals({ answer: 'separate' }, activity), true);
  for (const wrong of ['shared', 'attention']) assert.equal(PREDICATES.choice_equals({ answer: wrong }, activity), false);
  for (const text of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(text, /\.py\b|:\d+|generate_fixtures/);
  // The two blocks the task names are pickable, and their rows differ.
  const grid = byId(evaluated(scene, { block: 1 })).get('toy-grid');
  const row = r => grid.values.slice(r * 5, (r + 1) * 5);
  assert.match(activity.prompt, /^h\[1\] and h\[4\] /);
  row(1).forEach((value, j) => assert.notEqual(value, row(4)[j]));
});

test('sources: well-formed, pinned, and every status labelled on the card', () => {
  assertSources(sources, scene);
  const cited = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  for (const ref of ['model.py:130-130', 'model.py:180-182', 'model.py:96-101', 'model.py:35-37', 'model.py:82-84', 'model.py:21-24',
    'train.py:56-56', 'model.py:162-166', 'model.py:138-138', 'config/train_shakespeare_char.py:22-24', 'train.py:52-54']) {
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
});

test('evidence record is complete and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(evidence.learningQuestion.length <= 95);
});
