import assert from 'node:assert/strict';
import test from 'node:test';
import { selectDiagramReferences } from '../src/explanation-references.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import cases from './fixtures/explanation-reference-batch3c-cases.json' with { type: 'json' };

for (const { referenceId, kind, prompt, paraphrase } of cases) {
  test(`${referenceId}: original and paraphrase reach the prepared Explanation author`, () => {
    const reference = diagramReferences.find(({ id }) => id === referenceId);
    assert.ok(reference, `${referenceId} is registered`);
    assert.deepEqual(reference.lessons, ['19']);
    assert.ok(reference.prompts.includes(prompt));
    assert.ok(!reference.prompts.includes(paraphrase));

    for (const args of [prompt, paraphrase]) {
      assert.equal(selectDiagramReferences({ prompt: args })[0]?.id, referenceId, args);
      const request = prepareArtifactAuthorRequest({}, {
        command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
      });
      assert.ok(!request.result, args);
      const [selected] = request.diagramReferences;
      assert.equal(selected?.id, referenceId, args);
      assert.equal(selected.spec.diagram.kind, kind, args);
      assert.ok(request.body.system.includes(JSON.stringify(selected.spec)));
    }
  });
}
