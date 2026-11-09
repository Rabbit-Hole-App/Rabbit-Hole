import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramReferenceContext, selectDiagramReferences } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import cases from './fixtures/explanation-reference-batch3b-cases.json' with { type: 'json' };

for (const { referenceId, kind, prompt, paraphrase } of cases) {
  test(`${referenceId}: learner wording and a paraphrase reach the prepared author request`, () => {
    const reference = diagramReferences.find(ref => ref.id === referenceId);
    assert.ok(reference, `${referenceId} is registered`);
    assert.deepEqual(reference.lessons, ['16']);
    assert.ok(reference.prompts.includes(prompt));
    assert.ok(!reference.prompts.includes(paraphrase));

    const spec = parseTutorDiagram(reference.spec);
    assert.equal(spec.diagram.kind, kind);
    for (const args of [prompt, paraphrase]) {
      assert.equal(selectDiagramReferences({ prompt: args })[0]?.id, referenceId, args);
      const prepared = prepareArtifactAuthorRequest({}, {
        command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
      });
      assert.ok(!prepared.result, `Unexpected refusal for ${args}`);
      assert.equal(prepared.diagramReferences[0]?.id, referenceId, args);
      assert.deepEqual(prepared.diagramReferences[0].spec, spec);
      assert.ok(prepared.body.system.includes(JSON.stringify(spec)));
      assert.ok(diagramReferenceContext(prepared.diagramReferences).length <= 14_000);
    }
  });
}

test('existing z-score, contextual, isolation, IQR and DBSCAN examples keep their own prompts', () => {
  for (const id of [
    'zscore-anomaly-band', 'contextual-time-anomaly', 'ml-isolation-tree',
    'iqr-fences-and-outliers', 'dbscan-density-neighbourhoods',
  ]) {
    const { prompts: [prompt] } = diagramReferences.find(ref => ref.id === id);
    assert.equal(selectDiagramReferences({ prompt })[0]?.id, id, prompt);
  }
});
