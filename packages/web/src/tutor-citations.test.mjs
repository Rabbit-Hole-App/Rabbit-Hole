// Use in answer (owner brief 2026-10-21 "Selecting evidence"): only lines of a file the shown codebase activity cites, at its
// commit and inside the cited lines, become a citation; overlapping ranges and more than CITATION_MAX are refused; the stored
// shape is the one the attempt store checks again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITATION_MAX, citationLabel, sourceLabel, startSource } from './learn-codebase-goals.js';
import { citeRange, citedFile, setCitationTarget, setCitations } from './tutor-citations.js';

const ref = (path, start, end, role = 'source', symbol) => ({ kind: 'repository_file', id: `karpathy/minGPT:${path}`, version: 'c'.repeat(40), hash: 'h'.repeat(64), locator: { path, start, end, role, ...(symbol ? { symbol } : {}) } });
const refs = [ref('mingpt/model.py', 27, 56, 'source', 'CausalSelfAttention'), ref('mingpt/trainer.py', 1, 30), ref('tests/test_model.py', 1, 20, 'test')];
const at = (path, start, end, commit = 'c'.repeat(40)) => ({ repo: 'karpathy/minGPT', commit, path, start, end });

test('Use in answer adds only cited lines of cited files, once each, as the immutable ref', () => {
  setCitationTarget({ activityId: 'act-1', repo: 'karpathy/minGPT', refs });
  setCitations('act-1', []);
  assert.equal(citedFile(at('mingpt/bpe.py', 1, 2)), null, 'a file the question does not cite');
  assert.equal(citedFile(at('mingpt/model.py', 30, 31, 'd'.repeat(40))), null, 'another commit');
  assert.match(citeRange(at('mingpt/bpe.py', 1, 2)), /Only code this question cites/);
  assert.match(citeRange(at('mingpt/model.py', 20, 30)), /Only the cited lines 27–56/);
  assert.equal(citeRange(at('mingpt/model.py', 42, 47)), null);
  assert.match(citeRange(at('mingpt/model.py', 47, 50)), /overlap/);
  assert.equal(citeRange(at('mingpt/model.py', 48, 50)), null, 'a second, non-overlapping range');
  setCitations('act-1', []);
  for (let i = 0; i < CITATION_MAX; i += 1) assert.equal(citeRange(at('mingpt/model.py', 27 + i, 27 + i)), null);
  assert.match(citeRange(at('mingpt/model.py', 40, 40)), /at most 5/);
  assert.equal(citeRange(at('mingpt/trainer.py', 1, 1)) !== null, true, 'the limit holds across files');
  setCitationTarget(null);
  assert.match(citeRange(at('mingpt/model.py', 42, 47)), /Only code this question cites/, 'no shown activity: nothing to cite into');
});

test('learner-readable labels: file and symbol or kind for a source, file and lines for a citation; Start here follows the goal', () => {
  assert.equal(sourceLabel(refs[0]), 'model.py · CausalSelfAttention');
  assert.equal(sourceLabel(refs[1]), 'trainer.py');
  assert.equal(sourceLabel(refs[2]), 'test_model.py · tests');
  // An index label that is a docstring (production minGPT bpe.py, trainer.py) is not a name: the file alone.
  assert.equal(sourceLabel(ref('mingpt/bpe.py', 94, 123, 'source', 'this function uses self.bpe_ranks to iteratively merge all the possible bpe…')), 'bpe.py');
  assert.equal(sourceLabel(ref('mingpt/trainer.py', 1, 30, 'source', 'Simple training loop; Boilerplate that could apply to any arbitrary neural…')), 'trainer.py');
  assert.equal(sourceLabel(ref('mingpt/trainer.py', 1, 30, 'source', 'Trainer.run()')), 'trainer.py · Trainer.run()');
  assert.equal(citationLabel({ ...refs[0], locator: { ...refs[0].locator, start: 42, end: 47 } }), 'model.py · lines 42–47');
  assert.equal(citationLabel({ ...refs[0], locator: { ...refs[0].locator, start: 42, end: 42 } }), 'model.py · line 42');
  assert.equal(startSource(refs, 'understand_feature'), refs[0]);
  assert.equal(startSource(refs, 'debug_behavior'), refs[2], 'debugging starts from the test');
});
