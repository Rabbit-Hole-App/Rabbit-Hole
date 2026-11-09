import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramReferenceContext, selectDiagramReferences } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

// Real author-message preparation with independently worded learner questions.
// These checks do not call a provider or assert stochastic model behavior.
const requests = [
  ['ml-tree-impurity-gain', 'How do we calculate information gain for a tree split?'],
  ['ml-svm-c-tradeoff', 'Explain how the C parameter affects an SVM.'],
  ['ml-svm-feature-map', 'How does a kernel transform SVM data into a higher dimensional space?'],
  ['ml-knn-distance-weighted-vote', 'Why can distance-weighted KNN give a different answer?'],
  ['ml-knn-scaled-distance', 'Why does scaling one feature change the nearest neighbour?'],
  ['ml-knn-k-boundaries', 'How does changing K change a KNN decision boundary?'],
  ['ml-kd-tree-partitions', 'How do KD-tree partitions divide the space when searching?'],
  ['ml-kmeans-assignment-update', 'What is the difference between the assignment and update steps in K-means?'],
  ['ml-dbscan-core-border-noise', 'How can I tell core, border and noise points apart in DBSCAN?'],
  ['ml-gmm-responsibilities', 'Why does a Gaussian mixture give one point a share in both groups?'],
];

for (const [id, paraphrase] of requests) {
  test(`${id}: documented prompts and a paraphrase reach the actual bounded author context`, () => {
    const reference = diagramReferences.find(ref => ref.id === id);
    assert.ok(reference, `${id} must be registered`);
    assert.ok(!reference.prompts.includes(paraphrase), 'Paraphrases must not duplicate documented exact-match prompts');
    assert.ok(reference.lessons.some(lesson => ['04', '05', '06', '07'].includes(lesson)));
    for (const args of [...reference.prompts, paraphrase]) {
      const prepared = prepareArtifactAuthorRequest({}, {
        command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
      });
      assert.ok(!prepared.result, `${args}: unexpected refusal`);
      assert.ok(prepared.diagramReferences.some(ref => ref.id === id),
        `${args}: selected ${prepared.diagramReferences.map(ref => ref.id).join(', ')}`);
      const selected = prepared.diagramReferences.find(ref => ref.id === id);
      assert.deepEqual(selected.spec, reference.spec);
      assert.ok(prepared.body.system.includes(JSON.stringify(selected.spec)));
      assert.ok(prepared.diagramReferences.length <= 2);
      assert.ok(diagramReferenceContext(prepared.diagramReferences).length <= 14_000);
    }
  });
}

test('new ML references cannot leak into unrelated hierarchy or code-only requests', () => {
  for (const prompt of ['Explain a family tree.', 'How do I organize folders?']) {
    const refs = selectDiagramReferences({ prompt, context: 'KNN SVM DBSCAN GMM information gain' });
    assert.ok(refs.every(ref => !requests.some(([id]) => id === ref.id)));
  }
  const prepared = prepareArtifactAuthorRequest({}, { command: 'code', args: 'Implement DBSCAN.' });
  assert.ok(!prepared.body?.system.includes('Approved diagram references'));
});
