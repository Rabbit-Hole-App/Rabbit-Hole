import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectDiagramReferences } from '../../../control-plane/src/explanation-references.js';
import { diagramReferences } from './reference-library.js';

const demo = [
  ['decision-regions', 'how does a decision tree split a two-feature dataset into regions?'],
  ['gini-split', 'how do I compute the Gini impurity on both sides of a split and the information gain?'],
  ['threshold-search', 'how does a decision tree search for the best threshold on one feature?'],
  ['grown-tree', 'how does a decision tree trace a new point from the root to a prediction?'],
  ['depth-overfit', 'how does held-out error change as a decision tree grows deeper?'],
  ['bootstrap-roots', 'what does a bootstrap sample of the training rows look like, and which rows repeat?'],
  ['majority-vote', 'how does a random forest combine the predictions of its trees into one answer?'],
  ['feature-importance', 'compare impurity-based feature importance with permutation importance when one feature is random noise'],
];

for (const [name, prompt] of demo) {
  const id = `ml-trees-${name}`;
  test(`the exact demo prompt selects ${id} at every depth`, () => {
    assert.ok(diagramReferences.find(ref => ref.id === id)?.prompts.includes(prompt));
    for (const depth of ['overview', 'standard', 'deep']) {
      assert.equal(selectDiagramReferences({ prompt, depth })[0]?.id, id, depth);
    }
  });
}

test('short learner requests reach the lesson while existing definition prompts keep their picks', () => {
  const picks = prompt => selectDiagramReferences({ prompt }).map(ref => ref.id);
  for (const ref of diagramReferences.filter(ref => ref.id.startsWith('ml-trees-'))) {
    assert.ok(ref.shortKeywords.length >= 2);
    for (const phrase of ref.shortKeywords) {
      assert.ok(ref.keywords.includes(phrase));
      assert.ok(picks(`show me the ${phrase}`).includes(ref.id), `${ref.id} / ${phrase}`);
    }
  }
  assert.deepEqual(picks('what is gini impurity'), ['tree-impurity-mixtures']);
  assert.deepEqual(picks('what is a random forest?'), ['ml-bagging-vote-flow']);
});
