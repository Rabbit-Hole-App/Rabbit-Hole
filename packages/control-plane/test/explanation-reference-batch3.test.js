import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { selectDiagramReferences, diagramReferenceContext } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import bench from './fixtures/explanation-reference-batch3-cases.json' with { type: 'json' };

for (const { id, prompt, kind, referenceId, paraphrase } of bench.cases) {
  test(`${id}: the pinned prompt and an independent paraphrase steer to the intended kind`, () => {
    const record = diagramReferences.find(ref => ref.id === referenceId);
    assert.ok(record, `${referenceId} is registered`);
    assert.ok(record.prompts.includes(prompt), 'Keep the pinned learner prompt');
    assert.ok(!record.prompts.includes(paraphrase), 'Exercise learner keyword matching');
    for (const args of [prompt, paraphrase]) {
      const selected = selectDiagramReferences({ prompt: args });
      assert.equal(selected[0]?.id, referenceId, `Picks for "${args}": ${selected.map(r => r.id)}`);
      assert.equal(selected[0].spec.diagram.kind, kind);
      const prepared = prepareArtifactAuthorRequest({}, {
        command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
      });
      assert.ok(!prepared.result, `Unexpected refusal for "${args}"`);
      assert.ok([referenceId, `${referenceId}-single`].includes(prepared.diagramReferences[0]?.id)); // two-panel references go out as their single variant
      assert.ok(prepared.body.system.includes(JSON.stringify(prepared.diagramReferences[0].spec)));
      assert.ok(prepared.diagramReferences.length <= 2);
      assert.ok(diagramReferenceContext(prepared.diagramReferences).length <= 14_000);
    }
  });
}

test('AI/ML learner keywords leave the named collision controls clear', () => {
  const picked = prompt => selectDiagramReferences({ prompt }).map(ref => ref.id);
  const newIds = new Set(bench.cases.map(item => item.referenceId));
  for (const prompt of bench.protectedPrompts) {
    assert.ok(picked(prompt).every(id => !newIds.has(id)), prompt);
  }
  assert.equal(picked(bench.protectedPrompts[0])[0], 'softmax-probabilities');
  assert.equal(picked(bench.protectedPrompts[6])[0], 'ml-value-binning');
  assert.equal(picked(bench.protectedPrompts[7])[0], 'ml-feature-scaling-transformation');
});
