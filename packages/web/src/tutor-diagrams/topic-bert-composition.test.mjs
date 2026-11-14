import test from 'node:test';
import assert from 'node:assert';
import { messageRows, parameters, derived } from './topic-bert-data.js';
import { references } from './composition-bert-references.js';
import manifest from './topic-bert-sources.json' with { type: 'json' };
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

test('C04 supervised row identities keep supplied targets attached through reordering', () => {
  const d = derived();
  assert.strictEqual(d.counts.examples, messageRows.length);
  assert.strictEqual(d.training.overview.length, 2);
  assert.deepStrictEqual(new Set(d.training.overview.map(row => row.target)), new Set(parameters.classes));
  assert.deepStrictEqual(d.training.reordered.map(row => row.id), parameters.reorderedIds);
  assert.notDeepStrictEqual(d.training.reordered.map(row => row.id), messageRows.map(row => row.id));
  for (const row of d.training.reordered) assert.deepStrictEqual(row, messageRows.find(source => source.id === row.id));
  for (const group of d.training.groups) assert.deepStrictEqual(group.members, d.training.reordered.filter(row => row.target === group.label).map(row => row.id));
});

test('C04 class scores independently recompute the selected contextual CLS row and linear head', () => {
  const d = derived();
  const index = parameters.tokens.indexOf('[CLS]');
  const selected = parameters.states[index];
  const scores = parameters.bias.map((bias, j) => selected.reduce((sum, value, i) => sum + value * parameters.weights[i][j], bias));
  assert.deepStrictEqual(d.readout.base.summary, selected);
  assert.deepStrictEqual(d.readout.base.scores, scores);
  assert.deepStrictEqual(scores, [1, 2]);
  assert.strictEqual(d.readout.predictedClass, 'Request');
  assert.deepStrictEqual(d.readout.probe.states[index], selected);
  assert.notDeepStrictEqual(d.readout.probe.states, d.readout.base.states);
  assert.deepStrictEqual(d.readout.probe.scores, scores, 'Only already-encoded non-CLS rows change');
  assert.strictEqual(d.counts.positions, parameters.tokens.length);
  assert.strictEqual(d.counts.features, selected.length);
});

test('C04 BERT views preserve source lessons, magnitude readout and readable full-width native grids', () => {
  const d = derived();
  assert.strictEqual(references.length, 2);
  const source = manifest.references.find(entry => entry.queueId === 'ml-bert-summary-token-readout');
  assert.deepStrictEqual(source.lessons, ['01', '03']);
  assert.deepStrictEqual(source.source.lessons, ['01']);
  assert.deepStrictEqual(source.alsoCovers[0].lessons, ['03']);
  for (const reference of references) {
    assert.deepStrictEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.ok(reference.depths.deep.detailSpec);
    for (const view of Object.values(reference.depths)) for (const spec of Object.values(view)) {
      assert.doesNotThrow(() => parseTutorDiagram(spec));
      assert.deepStrictEqual(lintDiagramContent(spec), []);
      assert.ok(renderTutorDiagram(spec, 680).width <= 680);
      assert.ok(!['panels', 'comparison', 'token-links'].includes(spec.diagram.kind));
    }
  }
  const readout = references.find(reference => reference.id === source.referenceId);
  for (const spec of [readout.depths.overview.spec, readout.spec, readout.depths.deep.detailSpec]) {
    assert.strictEqual(spec.diagram.kind, 'heatmap');
    assert.deepStrictEqual(spec.diagram.rows.map(row => row.label), parameters.tokens);
    assert.ok(spec.diagram.highlights.every(cell => cell.row === parameters.tokens.indexOf('[CLS]')));
    assert.ok(spec.diagram.caption.includes('CLS'));
  }
  assert.strictEqual(readout.depths.overview.spec.diagram.columns.length, 1);
  assert.strictEqual(readout.spec.diagram.columns.length, parameters.features.length);
  assert.deepStrictEqual(readout.depths.deep.spec.diagram.bars.map(bar => bar.value), d.readout.base.scores);
  assert.ok(readout.depths.deep.spec.diagram.caption.includes('hW+b'));
  assert.match(readout.depths.deep.detailSpec.diagram.caption, /after encoding.*CLS.*fixed/iu);
});
