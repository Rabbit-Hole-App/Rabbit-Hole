// Independent numerical/algorithmic checks for documentation-only toy examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisationModel } from './before-after-normalisation.mjs';
import { tokenizationModel } from './before-after-tokenization.mjs';
import { pruningModel } from './before-after-pruning.mjs';

const near = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const list = value => Array.from(value);

test('population z-scores agree with an independent sum-of-squares calculation at every admitted measurement', () => {
  const m = normalisationModel('detailed');
  for (let last = 8; last <= 20; last++) {
    const f = m.evaluate({ ...m.defaults(), last });
    const raw = [2, 3, 4, 4, 5, 6, 6, 7, last];
    const sum = 37 + last, squares = 191 + last ** 2, mean = sum / raw.length;
    const sd = Math.sqrt(squares / raw.length - mean ** 2);
    assert.deepEqual(list(f.raw), raw); near(f.mean, mean); near(f.sd, sd);
    assert.ok(sd > 0, 'the fixed entries contain distinct values');
    f.z.forEach((z, i) => near(z, (raw[i] - mean) / sd));
    near(f.z.reduce((a, b) => a + b, 0), 0);
    near(f.z.reduce((a, b) => a + b * b, 0) / raw.length, 1);
    assert.ok(Math.max(...f.z.map(Math.abs)) <= Math.sqrt(raw.length - 1));
    assert.deepEqual(list(m.axes.raw), [0, 20]); assert.deepEqual(list(m.axes.z), [-3, 3]);
    for (let i = 1; i < raw.length; i++) assert.equal(Math.sign(f.z[i] - f.z[i - 1]), Math.sign(raw[i] - raw[i - 1]));
    for (let selected = 1; selected <= raw.length; selected++) {
      const marked = m.evaluate({ last, selected });
      near(marked.marked.raw, raw[selected - 1]); near(marked.marked.z, (raw[selected - 1] - mean) / sd);
    }
  }
});

test('normalisation defaults, clipping, rounding to steps and brief fixed selection are explicit', () => {
  const m = normalisationModel('detailed'), f = m.evaluate(m.defaults());
  near(f.mean, 5); near(f.sd, Math.sqrt(10 / 3)); near(f.marked.z, 3 / Math.sqrt(10 / 3));
  assert.deepEqual(m.normalize({ last: -5, selected: 99 }), { last: 8, selected: 9 });
  assert.deepEqual(m.normalize({ last: 100, selected: -1 }), { last: 20, selected: 1 });
  assert.equal(m.normalize({ last: 11.7 }).last, 12);
  assert.equal(normalisationModel('brief').normalize({ selected: 1 }).selected, 9);
});

test('toy word and greedy subword segmentation have independently specified IDs and half-open source offsets', () => {
  const m = tokenizationModel('detailed');
  const expected = [
    { sentence: 0, mode: 0, text: 'unhelpful cats.', pieces: [['unhelpful', 1, 0, 9], ['cats', 2, 10, 14], ['.', 4, 14, 15]] },
    { sentence: 0, mode: 1, text: 'unhelpful cats.', pieces: [['un', 1, 0, 2], ['##help', 2, 2, 6], ['##ful', 3, 6, 9], ['cats', 4, 10, 14], ['.', 6, 14, 15]] },
    { sentence: 1, mode: 0, text: 'cats nap.', pieces: [['cats', 2, 0, 4], ['nap', 3, 5, 8], ['.', 4, 8, 9]] },
    { sentence: 1, mode: 1, text: 'cats nap.', pieces: [['cats', 4, 0, 4], ['nap', 5, 5, 8], ['.', 6, 8, 9]] },
  ];
  for (const x of expected) {
    const f = m.evaluate(x);
    assert.equal(f.text, x.text);
    assert.deepEqual(f.tokens.map(t => [t.piece, t.id, t.start, t.end]), x.pieces);
    for (const t of f.tokens) {
      assert.equal(t.piece.replace(/^##/, ''), x.text.slice(t.start, t.end));
      assert.equal(f.vocabulary[t.id], t.piece);
    }
    assert.equal(f.coveredCharacters, x.text.replace(/\s/g, '').length);
    assert.equal(f.skippedSpaces, x.text.length - f.coveredCharacters);
    assert.equal(f.sourceCharacters, x.text.length);
    const joined = f.tokens.map(t => x.text.slice(t.start, t.end)).join('');
    assert.equal(joined, x.text.replace(/\s/g, ''));
  }
});

test('the subword matcher is longest-first, keeps continuation prefixes and makes the whole unsegmentable word unknown', () => {
  const m = tokenizationModel('detailed');
  const vocabulary = ['[UNK]', 'un', 'u', '##n', '##help', '##h', '##elp', '##ful'];
  assert.deepEqual(m.tokenize('unhelpful', 1, vocabulary).map(t => t.piece), ['un', '##help', '##ful']);
  const unknown = m.tokenize('unhelpz', 1, vocabulary);
  assert.deepEqual(unknown.map(t => [t.piece, t.id, t.start, t.end]), [['[UNK]', 0, 0, 7]]);
  assert.equal(m.normalize({ sentence: 0, mode: 1, selected: 99 }).selected, 5);
  assert.equal(m.normalize({ sentence: 1, mode: 0, selected: 5 }).selected, 3);
  assert.equal(tokenizationModel('brief').normalize({ mode: 0 }).mode, 1);
});

test('tree predictions, matched-record counts and mistakes are calculated from each actual subtree', () => {
  const m = pruningModel('detailed');
  const expected = { full: { nodes: 5, leaves: 3, train: 1, heldout: 2 }, pruned: { nodes: 3, leaves: 2, train: 2, heldout: 0 }, root: { nodes: 1, leaves: 1, train: 5, heldout: 3 } };
  assert.equal(m.records.training.length, 10); assert.equal(m.records.heldout.length, 9);
  for (const [id, e] of Object.entries(expected)) {
    const tree = m.trees[id];
    const training = m.score(tree, m.records.training), heldout = m.score(tree, m.records.heldout);
    assert.equal(training.nodes, e.nodes); assert.equal(training.leaves, e.leaves);
    assert.equal(training.mistakes, e.train); assert.equal(heldout.mistakes, e.heldout);
    assert.equal(training.matches.root.length, m.records.training.length);
    assert.equal(heldout.matches.root.length, m.records.heldout.length);
    for (const records of [m.records.training, m.records.heldout]) {
      const predictions = records.map(r => id === 'root' ? 'Ready' : !r.practiced ? 'Needs review' : id === 'pruned' || r.notes ? 'Ready' : 'Needs review');
      assert.deepEqual(records.map(r => m.predict(tree, r)), predictions);
    }
  }
  const f = m.evaluate({ ...m.defaults(), dataset: 0 });
  assert.equal(f.before.matches['notes-no'].length, 3); assert.equal(f.before.matches['notes-yes'].length, 4);
  assert.equal(f.after.matches['practiced-yes'].length, 7);
});

test('count-based complexity cost selects the real subtree at every alpha step, with smaller-tree ties', () => {
  const m = pruningModel('detailed');
  for (let alpha = 0; alpha <= 2; alpha += 0.25) {
    const f = m.evaluate({ ...m.defaults(), alpha });
    const costs = { full: 1 + 3 * alpha, pruned: 2 + 2 * alpha, root: 5 + alpha };
    for (const c of f.candidates) near(c.cost, costs[c.id]);
    assert.equal(f.selected, alpha < 1 ? 'full' : 'pruned');
    assert.equal(f.after.tree, m.trees[f.selected]);
    near(f.afterCost, costs[f.selected]);
    assert.equal(m.evaluate({ alpha, dataset: 1 }).selected, f.selected, 'held-out data never choose the subtree');
  }
  assert.equal(m.evaluate({ alpha: 1 }).selected, 'pruned');
  assert.equal(m.evaluate({ alpha: 1.5 }).afterCost, 5);
  assert.equal(m.normalize({ alpha: -1 }).alpha, 0); assert.equal(m.normalize({ alpha: 8 }).alpha, 2);
  assert.equal(m.normalize({ alpha: 1.37 }).alpha, 1.25);
  const brief = pruningModel('brief');
  assert.equal(brief.evaluate({ branch: 0 }).selected, 'full'); assert.equal(brief.evaluate({ branch: 1 }).selected, 'pruned');
});
