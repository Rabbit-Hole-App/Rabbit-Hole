import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramReferenceContext } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

const cases = [
  ['ml-minority-accuracy-trap', 'Why can high accuracy hide a missed minority class?'],
  ['ml-majority-undersampling', 'Show how dropping majority examples balances the classes.'],
  ['ml-recursive-feature-elimination', 'How do feature rankings change after dropping the weakest input?'],
  ['ml-psi-bin-contributions', 'How do the bin contributions add up to a drift score?'],
];

function authorRequest(args) {
  return prepareArtifactAuthorRequest({}, {
    command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
  });
}

for (const [id, paraphrase] of cases) {
  test(`${id}: ordinary requests include the worked reference spec`, () => {
    const reference = diagramReferences.find(item => item.id === id);
    assert.ok(reference, `${id} is registered`);
    assert.ok(!reference.prompts.includes(paraphrase), 'Check phrase matching independently of an exact prompt');
    for (const args of [...reference.prompts, paraphrase]) {
      const prepared = authorRequest(args);
      assert.ok(!prepared.result, `${args}: unexpected refusal`);
      const selected = prepared.diagramReferences.find(item => item.id === id);
      assert.ok(selected, `${args}: selected ${prepared.diagramReferences.map(item => item.id).join(', ')}`);
      assert.deepEqual(selected.spec, parseTutorDiagram(reference.spec));
      assert.ok(prepared.body.system.includes(JSON.stringify(selected.spec)));
      assert.ok(prepared.diagramReferences.length <= 2);
      assert.ok(diagramReferenceContext(prepared.diagramReferences).length <= 14_000);
    }
  });
}

test('undersampling alone selects the example that removes majority rows', () => {
  const prepared = authorRequest('Explain undersampling.');
  assert.deepEqual(prepared.diagramReferences.map(item => item.id), ['ml-majority-undersampling']);
});
