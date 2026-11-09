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
  ['gini-vs-entropy', 'how does Gini impurity change as the fraction of one class goes from 0 to 1, compared with entropy?'],
  ['cost-complexity-pruning', 'how does cost-complexity pruning trade tree size against accuracy as alpha increases?'],
  ['regression-step-fit', 'how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 4?'],
  ['bootstrap-coverage', 'why does a bootstrap sample contain only about 63% of the unique training rows?'],
  ['forest-size-accuracy', 'how does test accuracy change with 1, 5, 10, 50 and 200 trees in a random forest?'],
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
