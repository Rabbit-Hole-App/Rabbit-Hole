import assert from 'node:assert/strict';
import test from 'node:test';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { selectDiagramReferences } from '../src/explanation-references.js';

const examples = [
  ['ml-mle-bernoulli-likelihood', 'how does maximum likelihood estimation find the best coin bias?'],
  ['ml-kfold-validation', 'how does five-fold cross-validation rotate the validation fold and combine the scores?'],
];

for (const [id, prompt] of examples) {
  test(id + ' ranks first for its learner prompt and paraphrase at each depth', () => {
    const ref = diagramReferences.find(entry => entry.id === id);
    assert.ok(ref?.prompts.includes(prompt));
    assert.equal(ref.paraphrases.length, 1);
    for (const query of [prompt, ref.paraphrases[0]]) {
      for (const depth of ['overview', 'standard', 'deep']) {
        const selected = selectDiagramReferences({ prompt: query, depth })[0];
        assert.equal(selected?.id, id, query);
        assert.deepEqual(selected.spec, ref.depths?.[depth]?.spec ?? ref.spec);
      }
    }
  });
}
