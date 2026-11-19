import test from 'node:test';
import assert from 'node:assert';
import { modalities, derived } from './topic-transfer-learning-data.js';
import { references } from './composition-transfer-learning-references.js';
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

test('C04 modality paths retain different extractors, feature spaces and task heads', () => {
  const d = derived();
  assert.strictEqual(d.counts.modalities, modalities.length);
  assert.deepStrictEqual(d.modalities.map(row => row.featureCount), modalities.map(row => row.features.length));
  const reference = references[0];
  assert.deepStrictEqual(reference.lessons, ['01', '08']);
  assert.strictEqual(reference.topic, 'transfer-learning');
  const table = reference.spec.diagram;
  assert.strictEqual(table.kind, 'matrix');
  assert.deepStrictEqual(table.columns, ['Input', 'Extractor', 'Feature vector', 'Classifier']);
  assert.deepStrictEqual(table.rows.map(row => row.cells), modalities.map(row => [row.input, row.extractor, row.name + ' vector', row.head]));
  const paths = [reference.depths.deep.spec.diagram, reference.depths.deep.detailSpec.diagram];
  for (const [i, path] of paths.entries()) {
    assert.strictEqual(path.kind, 'block-stack');
    assert.strictEqual(path.blocks[0].label, modalities[i].extractor);
    assert.strictEqual(path.blocks[2].label, modalities[i].head);
    assert.strictEqual(path.blocks[1].diagram.tensor.columns, modalities[i].features.length);
    assert.strictEqual(path.blocks[1].diagram.tensor.values, undefined, 'Only structural widths, no invented activations');
    assert.strictEqual(path.edges, undefined, 'No false cross-modality fusion edge');
  }
});

test('C04 modality views obey native schema, token-level content and card width', () => {
  const reference = references[0];
  assert.deepStrictEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
  assert.ok(reference.depths.deep.detailSpec);
  for (const view of Object.values(reference.depths)) for (const spec of Object.values(view)) {
    assert.doesNotThrow(() => parseTutorDiagram(spec));
    assert.deepStrictEqual(lintDiagramContent(spec), []);
    assert.ok(renderTutorDiagram(spec, 680).width <= 680);
    assert.strictEqual(spec.diagram.panels, undefined);
  }
});
