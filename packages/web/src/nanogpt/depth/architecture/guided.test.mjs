import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates } from './guided.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { groupDigits } from '../../../scene-format.js';

const byId = result => new Map(result.state.objects.map(object => [object.id, object]));
const labels = result => result.state.objects.filter(o => o.visible && o.opacity > 0 && o.label).map(o => o.label);
const A = fx.architecture;
const SETTINGS = { C: [384, 768], V: [65, 50304] };

// Independent oracle: the parameter tensors model.py @3adf61e builds for a
// config (bias = False), listed one by one, with lm_head.weight tied to wte
// (nn.Module.parameters() yields a shared tensor once).
function inventory({ V, C, L, T }) {
  const tensors = [['transformer.wte.weight', V * C], ['transformer.wpe.weight', T * C]];
  for (let i = 0; i < L; i += 1) {
    tensors.push([`h.${i}.ln_1.weight`, C], [`h.${i}.attn.c_attn.weight`, 3 * C * C], [`h.${i}.attn.c_proj.weight`, C * C],
      [`h.${i}.ln_2.weight`, C], [`h.${i}.mlp.c_fc.weight`, 4 * C * C], [`h.${i}.mlp.c_proj.weight`, 4 * C * C]);
  }
  tensors.push(['transformer.ln_f.weight', C]);
  const count = prefix => tensors.filter(([name]) => name.includes(prefix)).reduce((n, [, k]) => n + k, 0);
  const total = tensors.reduce((n, [, k]) => n + k, 0);
  return {
    wte: V * C, wpe: T * C, lnf: C, total, nonEmb: total - T * C,
    attn: count('h.0.attn'), mlp: count('h.0.mlp'), ln2: count('h.0.ln_'), block: count('h.0.'), blocks: count('h.'),
  };
}
const configOf = ({ width, vocab }) => ({ V: SETTINGS.V[vocab], C: SETTINGS.C[width], L: A.n_layer, T: A.block_size });

test('passes every card gate in all four settings', () => {
  assert.equal(reviewStates.length, 4);
  assertCardGates(scene, reviewStates);
});

test('Guided ladder rung: two pickers, real numbers, no equations, builds on the Overview', () => {
  const visible = scene.inputs.filter(input => !input.hidden);
  assert.deepEqual(visible.map(input => `${input.type}:${input.presentation}`), ['index:picker', 'index:picker']);
  assert.equal(scene.objects.filter(o => o.type === 'equation' || o.type === 'code').length, 0);
  assert.equal(scene.objects[1].initialState.text, 'Builds on: the text-to-next-character pipeline; counting a matrix as rows × columns');
  for (const inputs of reviewStates) {
    assert.doesNotMatch(labels(evaluated(scene, inputs)).join('\n'), /\b(beginner|intermediate|advanced|expert|newcomer)s?\b/i);
  }
});

test('the settings are source values: 384 and 65 from shakespeare_char, 768 and 50304 from NanoGPT defaults', () => {
  assert.deepEqual(scene.exampleData.Cs, SETTINGS.C);
  assert.deepEqual(scene.exampleData.Vs, SETTINGS.V);
  assert.equal(A.n_embd, 384);
  assert.equal(fx.config.defaults.n_embd, 768);
  assert.deepEqual([A.n_layer, A.block_size, A.bias], [6, 256, false]);
});

test('every count matches the tensor inventory at every setting', () => {
  for (const inputs of reviewStates) {
    const want = inventory(configOf(inputs));
    const result = evaluated(scene, inputs);
    const d = result.derived;
    const where = JSON.stringify(inputs);
    assert.deepEqual([d.wte[0], d.wpe[0], d.attn[0], d.mlp[0], d.ln2[0], d.block, d.blocks[0], d.total, d.nonEmb],
      [want.wte, want.wpe, want.attn, want.mlp, want.ln2, want.block, want.blocks, want.total, want.nonEmb], where);
    const objects = byId(result);
    const { V, C } = configOf(inputs);
    assert.equal(objects.get('wte-count').label, `V × C = ${groupDigits(V)} × ${C} = ${groupDigits(want.wte)}`, where);
    assert.equal(objects.get('wpe-count').label, `block_size × C = 256 × ${C} = ${groupDigits(want.wpe)}`, where);
    assert.equal(objects.get('lnf-count').label, `C = ${want.lnf}`, where);
    assert.equal(objects.get('blocks-count').label, `6 × ${groupDigits(want.block)} = ${groupDigits(want.blocks)}`, where);
    assert.equal(objects.get('block-split').label,
      `One block: attention 4C² = ${groupDigits(want.attn)} · MLP 8C² = ${groupDigits(want.mlp)} · two LayerNorms 2C = ${groupDigits(want.ln2)}`, where);
    // Only 384 / 65 is a shipped config (config/train_shakespeare_char.py); the rest are what-ifs.
    const shipped = inputs.width === 0 && inputs.vocab === 0;
    assert.equal(objects.get('total').label,
      `Total: wte + wpe + blocks + ln_f = ${groupDigits(want.total)} (${shipped ? 'Source value sizes' : 'What-if sizes'})`, where);
    // The block split's coefficients, from the Linear shapes: 3 + 1 = 4 and 4 + 4 = 8.
    assert.equal(objects.get('block-origin').label,
      'attention: c_attn C × 3C = 3C², c_proj C × C = C² · MLP: c_fc C × 4C = 4C², c_proj 4C × C = 4C²');
    assert.equal(3 * C * C + C * C, want.attn, where);
    assert.equal(4 * C * C + 4 * C * C, want.mlp, where);
    assert.equal(objects.get('printed').label,
      `The start-up count leaves wpe out: ${groupDigits(want.total)} − ${groupDigits(want.wpe)} = ${groupDigits(want.nonEmb)}. NanoGPT prints it as`, where);
    // model.py: print("number of parameters: %.2fM" % (self.get_num_params()/1e6,))
    assert.equal(objects.get('printed-line').label, `number of parameters: ${(want.nonEmb / 1e6).toFixed(2)}M`, where);
  }
});

test('the default setting reproduces the count NanoGPT prints for shakespeare_char', () => {
  const want = inventory(configOf({ width: 0, vocab: 0 }));
  assert.equal(want.nonEmb, 10646784);
  // model.py: print("number of parameters: %.2fM" % (self.get_num_params()/1e6,))
  assert.equal((want.nonEmb / 1e6).toFixed(2), '10.65');
  assert.equal(byId(evaluated(scene, {})).get('printed-line').label, 'number of parameters: 10.65M');
});

test('relationships the learner can check: C² terms x4 and C terms x2 when C doubles; V moves only wte', () => {
  const at = inputs => evaluated(scene, inputs).derived;
  for (const vocab of [0, 1]) {
    const small = at({ width: 0, vocab }), big = at({ width: 1, vocab });
    assert.equal(big.attn[0], 4 * small.attn[0]);
    assert.equal(big.mlp[0], 4 * small.mlp[0]);
    assert.equal(big.wte[0], 2 * small.wte[0]);
    assert.equal(big.wpe[0], 2 * small.wpe[0]);
    assert.equal(big.ln2[0], 2 * small.ln2[0]);
    assert.equal(small.mlp[0], 2 * small.attn[0]);
  }
  for (const width of [0, 1]) {
    const chars = at({ width, vocab: 0 }), bpe = at({ width, vocab: 1 });
    assert.notEqual(chars.wte[0], bpe.wte[0]);
    for (const key of ['wpe', 'attn', 'mlp', 'blocks']) assert.deepEqual(chars[key], bpe[key], `${key} ignores V`);
  }
});

test('each row sits beside the Overview stage it implements, and lm_head adds nothing', () => {
  const inside = (row, box) => row.y >= box.y && row.y + 34 <= box.y + box.h;
  for (const inputs of reviewStates) {
    const objects = byId(evaluated(scene, inputs));
    const { V } = configOf(inputs);
    assert.deepEqual(['gutter-lists', 'gutter-blocks', 'gutter-scores'].map(id => objects.get(`${id}-stage`).label),
      ['number lists', '6 blocks', `${groupDigits(V)} scores`]);
    // Each stage names what its parameters are; the blocks' share is compared
    // live against the oracle (at C = 384 with GPT-2 tokens wte outgrows them).
    const want = inventory(configOf(inputs));
    const most = want.blocks > want.total - want.blocks;
    assert.deepEqual(['gutter-lists', 'gutter-blocks', 'gutter-scores'].map(id => `${objects.get(`${id}-role-0`).label} ${objects.get(`${id}-role-1`).label}`),
      ['token + position embeddings', `${most ? 'most of the' : 'under half the'} parameters`, 'token matrix, reused (tied)'], JSON.stringify(inputs));
    assert.equal(most, !(inputs.width === 0 && inputs.vocab === 1), JSON.stringify(inputs));
    for (const id of ['gutter-lists', 'gutter-blocks', 'gutter-scores']) {
      const box = objects.get(id);
      for (const line of ['stage', 'role-0', 'role-1']) {
        const { y } = objects.get(`${id}-${line}`);
        assert.ok(y - 12 > box.y && y + 4 < box.y + box.h, `${id}-${line} sits inside its gutter box`);
      }
    }
    assert.ok(inside(objects.get('wte-bar'), objects.get('gutter-lists')) && inside(objects.get('wpe-bar'), objects.get('gutter-lists')));
    assert.ok(inside(objects.get('blocks-bar'), objects.get('gutter-blocks')));
    assert.ok(inside(objects.get('lnf-bar'), objects.get('gutter-scores')));
    const lmhead = objects.get('lmhead-name');
    const scores = objects.get('gutter-scores');
    assert.ok(lmhead.y > scores.y && lmhead.y < scores.y + scores.h);
    assert.equal(objects.get('lmhead-count').label, 'the wte matrix again (tied): +0');
    // The oracle agrees: the tied lm_head.weight is not a second tensor.
    assert.equal(inventory(configOf(inputs)).total, evaluated(scene, inputs).derived.total);
  }
});

test('the takeaway follows state: it names the part holding most parameters, in that bar\'s colour, above the arithmetic', () => {
  const growth = 'a wider C grows the C² terms fastest.';
  for (const inputs of reviewStates) {
    const want = inventory(configOf(inputs));
    const where = JSON.stringify(inputs);
    const objects = byId(evaluated(scene, inputs));
    const takeaway = objects.get('takeaway');
    // "Most" is a majority of the total, checked against the oracle.
    const blocksMost = want.blocks > want.total / 2;
    assert.ok(blocksMost || want.wte > want.total / 2, `${where}: neither part holds most`);
    assert.equal(takeaway.label, `Most parameters live in ${blocksMost ? 'the blocks' : 'wte here'}; ${growth}`, where);
    assert.equal(takeaway.role, objects.get(blocksMost ? 'blocks-bar' : 'wte-bar').role, where);
    assert.equal(blocksMost, !(inputs.width === 0 && inputs.vocab === 1), where);
    assert.equal(takeaway.typography, 'heading');
    assert.equal(takeaway.opacity, 1, `${where}: shown on the final frame`);
    assert.ok(takeaway.y > objects.get('axis-title').y && takeaway.y < objects.get('block-split').y, `${where}: between the bars and the arithmetic`);
    // The growth clause at every setting: doubling C grows each C² term x4,
    // every other part (C, V x C, block_size x C) only x2.
    const wide = inventory({ ...configOf(inputs), C: 2 * configOf(inputs).C });
    assert.deepEqual([wide.attn / want.attn, wide.mlp / want.mlp], [4, 4], where);
    assert.deepEqual([wide.wte / want.wte, wide.wpe / want.wpe, wide.lnf / want.lnf], [2, 2, 2], where);
  }
  // Staged: hidden until every bar has drawn.
  assert.equal(byId(evaluated(scene, {}, 2.5)).get('takeaway').opacity, 0);
});

test('bars: one fixed axis, lengths proportional to the counts, the blocks bar cut into six equal parts', () => {
  const PX = 500 / 45e6;
  for (const inputs of reviewStates) {
    const want = inventory(configOf(inputs));
    const objects = byId(evaluated(scene, inputs));
    const near = (a, b, id) => assert.ok(Math.abs(a - b) <= 0.01, `${JSON.stringify(inputs)} ${id}: ${a} vs ${b}`);
    near(objects.get('wte-bar').w, want.wte * PX, 'wte');
    near(objects.get('wpe-bar').w, want.wpe * PX, 'wpe');
    near(objects.get('lnf-bar').w, want.lnf * PX, 'ln_f');
    near(objects.get('blocks-bar').w, want.blocks * PX, 'blocks');
    for (let i = 0; i < A.n_layer - 1; i += 1) {
      const divider = objects.get(`block-divider-${i}`);
      near(divider.from.x, 420 + (i + 1) * want.block * PX, `divider ${i}`);
      assert.equal(divider.from.x, divider.to.x);
    }
    assert.ok(420 + objects.get('blocks-bar').w <= 920, 'blocks stay on the axis');
    assert.ok(420 + objects.get('wte-bar').w <= 920, 'wte stays on the axis');
    assert.notEqual(objects.get('wpe-bar').role, 'observed', 'wpe is tinted like the other bars');
  }
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
const lines = path => readFileSync(join(PINNED, path), 'utf8').split('\n');
test('50304 and 768 are what the pinned sources say', { skip: !existsSync(PINNED) && 'pinned NanoGPT copy not present' }, () => {
  assert.match(lines('model.py')[110], /vocab_size: int = 50304 /);
  assert.match(lines('train.py')[154], /else 50304$/);
  assert.match(lines('train.py')[53], /^n_embd = 768$/);
});

test('sources: well-formed, pinned, every status labelled, quotes verbatim', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status).sort(), ['Live calculation', 'Source value', 'What-if']);
  if (!existsSync(PINNED)) return;
  for (const { path, lines: [start, end], note } of sources.filter(source => source.kind === 'code')) {
    const cited = lines(path).slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start}: note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

test('evidence record is complete, depth-labelled and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Guided');
  assert.equal(evidence.prerequisites, scene.objects[1].initialState.text);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].initialState.text, evidence.learningQuestion);
  assert.ok(evidence.learningQuestion.length <= 95);
});
