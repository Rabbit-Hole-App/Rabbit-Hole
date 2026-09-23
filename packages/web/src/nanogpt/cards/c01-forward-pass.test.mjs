import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, evidence } from './c01-forward-pass.js';
import { assertCardGates, assertEvidence, evaluated } from '../card-gates.mjs';

const TRAIN = { mode: 0 }, GEN = { mode: 1 };
const byId = result => new Map(result.state.objects.map(object => [object.id, object]));
const shown = (objects, id) => objects.get(id).visible && objects.get(id).opacity > 0;
// First sampled time an object is on screen during the replay (Infinity: never).
const firstShown = (inputs, id) => {
  for (let t = 0; t <= scene.duration + 1e-9; t += 0.05) if (shown(byId(evaluated(scene, inputs, t)), id)) return t;
  return Infinity;
};

test('c01 passes every card gate in both call-site presets', () => {
  assertCardGates(scene, [TRAIN, GEN]);
});

test('config numbers are bound to the fixture, and the fixture matches config/train_shakespeare_char.py @3adf61e', () => {
  // Independent oracle: the literals in the pinned config file (batch_size = 64,
  // block_size = 256, n_layer = 6, n_embd = 384, dropout = 0.2) and the
  // tinyshakespeare character vocabulary prepare.py builds (65 chars).
  const A = fx.architecture;
  assert.deepEqual([A.batch_size, A.block_size, A.n_layer, A.n_embd, A.dropout, A.vocab_size], [64, 256, 6, 384, 0.2, 65]);
  // The card binds these fixture values, it does not retype them.
  const { B, T, C, V, L, p } = scene.exampleData;
  assert.deepEqual({ B, T, C, V, L, p }, { B: A.batch_size, T: A.block_size, C: A.n_embd, V: A.vocab_size, L: A.n_layer, p: A.dropout });
  for (const inputs of [TRAIN, GEN]) {
    const objects = byId(assertCardGates(scene, [inputs])[0]);
    assert.equal(objects.get('config').label,
      'train_shakespeare_char.py (source): B = batch_size = 64 · T = block_size = 256 · C = n_embd = 384 · n_layer = 6');
    assert.match(objects.get('vocab').label, /^V = vocab_size = 65: /);
    assert.equal(objects.get('x-sub-p').label, 'dropout p = 0.2 (train_shakespeare_char.py:25)');
    assert.match(objects.get('blocks-sub-1').label, /^6 separate Blocks/);
  }
  // Labels follow the binding: change the bound value, the label changes.
  const moved = structuredClone(scene);
  Object.assign(moved.exampleData, { B: 7, p: 0.35 });
  const objects = byId(evaluated(moved, TRAIN));
  assert.match(objects.get('config').label, /B = batch_size = 7 /);
  assert.equal(objects.get('x-sub-p').label, 'dropout p = 0.35 (train_shakespeare_char.py:25)');
});

test('one box per Block module - n_layer separate boxes, h[0]..h[n_layer-1]', () => {
  const objects = assertCardGates(scene, [TRAIN])[0].state.objects;
  const blocks = objects.filter(object => /^block-\d+$/.test(object.id));
  assert.equal(blocks.length, fx.architecture.n_layer);
  assert.deepEqual(blocks.map(block => block.label), Array.from({ length: fx.architecture.n_layer }, (unused, i) => `h[${i}]`));
});

test('targets given (:184): all positions, (B, T, V) logits, a loss; none: last position, (B, 1, V), loss None', () => {
  const [train, gen] = assertCardGates(scene, [TRAIN, GEN]).map(byId);
  // model.py:184-187 - targets given: lm_head(x) on every position, cross-entropy loss.
  assert.equal(train.get('slice').label, 'x, all T positions (B, T, C)');
  assert.match(train.get('slice-sub').label, /\(:184\)/);
  assert.equal(train.get('logits').label, 'logits (B, T, V)');
  assert.equal(train.get('lm-head-sub-2').label, 'lm_head(x) (:186)');
  assert.equal(train.get('targets').label, 'targets Y (B, T)');
  assert.equal(train.get('targets').role, 'observed');
  assert.equal(train.get('loss').label, 'loss (scalar)');
  assert.equal(train.get('loss').role, 'output');
  assert.equal(train.get('loss-sub').label, 'F.cross_entropy (:187)');
  for (const id of ['targets', 'loss', 'a-logits-loss', 'a-targets-loss']) assert.ok(shown(train, id), `${id} shown in training`);
  // model.py:188-191 - no targets: lm_head(x[:, [-1], :]), loss = None.
  assert.equal(gen.get('slice').label, 'x[:, [-1], :]  (B, 1, C)');
  assert.equal(gen.get('logits').label, 'logits (B, 1, V)');
  assert.equal(gen.get('lm-head-sub-2').label, 'lm_head(x[:, [-1], :]) (:190)');
  assert.equal(gen.get('targets').label, 'targets = None');
  assert.equal(gen.get('loss').label, 'loss = None (:191)');
  assert.equal(gen.get('loss-sub').label, 'targets is None (:184)');
  assert.notEqual(gen.get('slice').role, train.get('slice').role);
  assert.ok(!shown(gen, 'a-logits-loss'), 'logits do not feed a loss without targets');
  // Dropout is labelled as the separate train()/eval() switch it is.
  assert.equal(train.get('x-sub-mode').label, 'dropout on: model.train() (train.py:227)');
  assert.equal(gen.get('x-sub-mode').label, 'dropout off: model.eval() (sample.py:51)');
  assert.match(gen.get('x-sub-switch').label, /not targets/);
  // Code path and shapes up to ln_f are the same call in both presets.
  for (const id of ['idx', 'tok-emb', 'pos-emb', 'x-emb', 'ln-f']) assert.equal(train.get(id).label, gen.get(id).label);
});

test('no object hides by derived opacity, so the timeline alone decides when things show', () => {
  assert.deepEqual(scene.objects.filter(object => object.initialState.opacity?.$derive).map(object => object.id), []);
  // At t = 0 only the header and the provenance footer are on screen, in both presets.
  const always = ['question', 'mode-caption', 'config', 'vocab', 'bt-note', 'provenance'];
  for (const inputs of [TRAIN, GEN]) {
    const objects = byId(evaluated(scene, inputs, 0));
    const early = [...objects.keys()].filter(id => shown(objects, id) && !always.includes(id));
    assert.deepEqual(early, [], `shown at t=0 in ${JSON.stringify(inputs)}`);
  }
});

test('the replay reveals stages in data-flow order in both presets', () => {
  const order = ['idx', 'tok-emb', 'pos-emb', 'plus', 'x-emb', ...Array.from({ length: fx.architecture.n_layer }, (unused, i) => `block-${i}`),
    'ln-f', 'slice', 'lm-head', 'logits', 'targets', 'loss'];
  for (const inputs of [TRAIN, GEN]) {
    const times = order.map(id => firstShown(inputs, id));
    for (let i = 1; i < order.length; i += 1) assert.ok(times[i - 1] < times[i], `${order[i - 1]} before ${order[i]} in ${JSON.stringify(inputs)}`);
    assert.ok(firstShown(inputs, 'tying') > firstShown(inputs, 'lm-head'), 'tying note after both tied boxes');
  }
  assert.ok(firstShown(TRAIN, 'a-logits-loss') > firstShown(TRAIN, 'logits'));
  assert.equal(firstShown(GEN, 'a-logits-loss'), Infinity);
});

test('evidence record is complete and pinned to the fixture revision', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, 'karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291');
  assert.equal(scene.objects[0].initialState.text, evidence.learningQuestion);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(evidence.learningQuestion.length <= 95);
});
