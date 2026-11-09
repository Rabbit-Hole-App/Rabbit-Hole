import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { deriveVisualRequirements, requiredVisualProblem } from '../src/explanation-visuals.js';
import { diagramReferenceContext, selectDiagramReferences } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

const cases = [
  ['ml-ordinal-encoding', 'How can ordered categories be represented by numbers?'],
  ['ml-value-binning', 'Which bucket does a number on a bin edge belong to?'],
  ['ml-feature-interaction', 'Why add a feature that multiplies two inputs?'],
  ['ml-raw-log-distributions', 'What happens to a skewed distribution when we take logs?'],
  ['ml-confusion-denominators', 'How do I calculate precision, recall and specificity from a confusion matrix?'],
  ['ml-regression-error-metrics', 'How do absolute and squared prediction mistakes produce different scores?'],
];

for (const [id, paraphrase] of cases) {
  test(`${id}: ordinary questions supply the worked example to the real author request`, () => {
    const reference = diagramReferences.find(ref => ref.id === id);
    assert.ok(reference, `${id} is registered`);
    assert.ok(!reference.prompts.includes(paraphrase), 'Paraphrase must not use the documented exact-match prompt');
    for (const args of [...reference.prompts, paraphrase]) {
      const prepared = prepareArtifactAuthorRequest({}, {
        command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
      });
      assert.ok(!prepared.result, `${args}: unexpected refusal`);
      const selected = prepared.diagramReferences.filter(ref => (ref.sourceId ?? ref.id) === id);
      assert.ok(selected.length, `${args}: selected ${prepared.diagramReferences.map(ref => ref.id).join(', ')}`);
      for (const item of selected) {
        const diagram = item.sourceId ? reference.spec.diagram.panels[item.partIndex].diagram : reference.spec.diagram;
        assert.deepEqual(item.spec, { version: 1, diagram });
        assert.ok(prepared.body.system.includes(JSON.stringify(item.spec)));
      }
      assert.ok(prepared.diagramReferences.length <= 2);
      assert.ok(diagramReferenceContext(prepared.diagramReferences).length <= 14_000);
    }
  });
}

test('new evaluation references do not hijack unrelated structural questions through source keywords', () => {
  for (const prompt of ['How does a binary tree work?', 'Explain a folder hierarchy.']) {
    const selected = selectDiagramReferences({ prompt, context: 'ordinal encoding bin edges feature interaction log transform MAE RMSE precision recall specificity' });
    assert.ok(selected.every(ref => !cases.some(([id]) => id === ref.id)));
  }
});

test('an explicit histogram request receives the two real histogram panels, preserving the strict kind requirement', () => {
  const args = 'Show two histograms comparing raw and log-transformed values.';
  const reference = diagramReferences.find(ref => ref.id === 'ml-raw-log-distributions');
  const prepared = prepareArtifactAuthorRequest({}, {
    command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
  });
  assert.equal(prepared.diagramReferences.length, 2);
  assert.equal(new Set(prepared.diagramReferences.map(ref => ref.id)).size, 2);
  assert.ok(prepared.body.messages[0].content.includes('"diagramKind":"histogram"'));
  for (const [index, selected] of prepared.diagramReferences.entries()) {
    assert.equal(selected.sourceId, reference.id);
    assert.equal(selected.partIndex, index);
    assert.equal(selected.spec.diagram.kind, 'histogram');
    assert.deepEqual(selected.spec.diagram, reference.spec.diagram.panels[index].diagram);
    assert.deepEqual(parseTutorDiagram(selected.spec), selected.spec);
    assert.ok(prepared.body.system.includes(JSON.stringify(selected.spec)));
  }
  const conceptual = selectDiagramReferences({ prompt: reference.prompts[1] });
  assert.deepEqual(conceptual.find(ref => ref.id === reference.id).spec, reference.spec,
    'Without a required leaf kind the author still receives the complete composition');
  const fence = spec => `\n\n\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\`\n\n`;
  const body = prepared.diagramReferences.map(ref => `A histogram of illustrative values.${fence(ref.spec)}`).join('Compare their stated axes.');
  assert.equal(requiredVisualProblem({ body }, deriveVisualRequirements(args)), null);
  assert.match(requiredVisualProblem({ body: fence(reference.spec) }, deriveVisualRequirements(args)), /histogram.*comparison/,
    'A composition wrapper still cannot masquerade as the explicitly required histogram kind');
});

test('a required matrix can use both existing sides of an identity-preserving transformation', () => {
  const source = diagramReferences.find(ref => ref.id === 'ml-feature-interaction');
  const selected = selectDiagramReferences({ prompt: source.prompts[0], requiredKinds: ['matrix'] });
  assert.equal(selected.length, 2);
  for (const [index, ref] of selected.entries()) {
    assert.equal(ref.sourceId, source.id);
    assert.equal(ref.partIndex, index);
    assert.deepEqual(ref.spec.diagram, source.spec.diagram[index ? 'after' : 'before'].diagram);
  }
});
