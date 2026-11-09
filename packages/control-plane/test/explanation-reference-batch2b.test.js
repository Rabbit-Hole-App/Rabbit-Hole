import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramReferenceContext } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { singleDiagramReferences } from '../../web/src/tutor-diagrams/reference-single-variants.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

const cases = [
  ['ml-repeated-sample-fits', 'Show how regression predictions vary across training samples.'],
  ['ml-soft-vote-probabilities', 'Why can averaging class probabilities disagree with hard voting?'],
  ['ml-adaboost-weight-update', 'Show how misclassified examples are reweighted in the next boosting round.'],
  ['ml-stacking-oof-predictions', 'Which training rows can a base learner see before it makes each meta-training prediction?'],
  ['ml-bayesian-acquisition-choice', 'Why would an acquisition score pick a less certain hyperparameter setting?'],
  ['ml-successive-halving-rounds', 'How can early trial scores decide which configurations get a larger budget?'],
];

for (const [id, paraphrase] of cases) {
  test(`${id}: natural questions include the worked spec in the author request`, () => {
    const reference = diagramReferences.find(ref => ref.id === id);
    assert.ok(reference, `${id} is registered`);
    assert.ok(!reference.prompts.includes(paraphrase), 'Exercise phrase matching as well as the documented prompt');
    for (const args of [...reference.prompts, paraphrase]) {
      const prepared = prepareArtifactAuthorRequest({}, {
        command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
      });
      assert.ok(!prepared.result, `${args}: unexpected refusal`);
      const selected = prepared.diagramReferences.find(item => item.id === id || item.id === `${id}-single`); // a two-panel reference goes out as its single-diagram variant (explanation-references.js preferSingleVariants)
      assert.ok(selected, `${args}: selected ${prepared.diagramReferences.map(item => item.id).join(', ')}`);
      assert.deepEqual(selected.spec, parseTutorDiagram(selected.id.endsWith('-single') ? singleDiagramReferences.find(single => single.id === selected.id).spec : reference.spec));
      assert.ok(prepared.body.system.includes(JSON.stringify(selected.spec)));
      assert.ok(prepared.diagramReferences.length <= 2);
      assert.ok(diagramReferenceContext(prepared.diagramReferences).length <= 14_000);
    }
  });
}
