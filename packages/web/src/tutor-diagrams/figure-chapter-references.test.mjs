import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { selectDiagramReferences } from '../../../control-plane/src/explanation-references.js';
import { figureChapterReferences } from './figure-chapter-references.js';
import { parseTutorDiagram } from './spec.js';
import budgets from './figure-chapter-token-budgets.json' with { type: 'json' };

const depths = ['overview', 'standard', 'deep'];

test('worked figure references validate at all depths and match their measured token budgets', () => {
  assert.equal(budgets.encoding, 'cl100k_base');
  assert.equal(budgets.maxSpecTokens, 300);
  assert.deepEqual(Object.keys(budgets.refs), figureChapterReferences.map(ref => ref.id));
  for (const ref of figureChapterReferences) {
    for (const depth of depths) {
      const { spec, detailSpec } = { ...ref, ...ref.depths?.[depth] };
      const visuals = detailSpec ? [spec, detailSpec] : [spec];
      const measured = budgets.refs[ref.id][depth];
      const name = ref.id + '/' + depth;
      assert.equal(visuals.length, measured.length, name);
      for (const [index, visual] of visuals.entries()) {
        const json = JSON.stringify(visual);
        assert.deepEqual(parseTutorDiagram(json), parseTutorDiagram(visual), name);
        assert.deepEqual(lintDiagramContent(visual), [], name);
        assert.equal(createHash('sha256').update(json).digest('hex'), measured[index].sha256, name);
        assert.ok(measured[index].tokens > 0 && measured[index].tokens <= budgets.maxSpecTokens, name);
      }
    }
  }
});

test('learner prompts and paraphrases reach the intended worked references and depths', () => {
  for (const ref of figureChapterReferences) {
    assert.ok(ref.prompts.length && ref.paraphrases?.length, ref.id);
    for (const prompt of [...ref.prompts, ...ref.paraphrases]) {
      for (const depth of depths) {
        const selected = selectDiagramReferences({ prompt, depth })[0];
        const { spec, detailSpec } = { ...ref, ...ref.depths?.[depth] };
        assert.equal(selected?.id, ref.id, prompt);
        assert.deepEqual(selected.spec, parseTutorDiagram(spec), prompt);
        assert.deepEqual(selected.detailSpec, detailSpec ? parseTutorDiagram(detailSpec) : undefined, prompt);
      }
    }
  }
});
