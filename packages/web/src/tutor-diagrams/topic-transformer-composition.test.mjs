import test from 'node:test';
import assert from 'node:assert';
import { derived, parameters } from './topic-transformer-data.js';
import { references } from './composition-transformer-references.js';
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

test('C03 cross-attention excludes padding before stable softmax and recomputes weighted source contexts', () => {
  const d = derived();
  for (const [name, scale] of [['base', 1], ['broad', parameters.broadQueryScale]]) {
    for (const [i, query] of parameters.queries.entries()) {
      const scores = parameters.keys.slice(0, d.counts.source).map(key => key.reduce((sum, value, j) => sum + value * query[j] * scale, 0) / Math.sqrt(query.length));
      const exps = scores.map(value => Math.exp(value));
      const denominator = exps.reduce((sum, value) => sum + value, 0);
      const weights = exps.map(value => value / denominator);
      weights.forEach((value, j) => assert.ok(Math.abs(d[name].weights[i][j] - value) < 1e-12));
      assert.ok(Math.abs(d[name].weights[i].reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
      const displayed = weights.map(value => Number(value.toFixed(parameters.precision)));
      assert.deepStrictEqual(d[name].grid[i], [...displayed, null]);
      const units = 10 ** parameters.precision;
      assert.equal(displayed.reduce((sum, value) => sum + Math.round(value * units), 0), units);
      const context = parameters.values[0].map((_, j) => weights.reduce((sum, weight, k) => sum + weight * parameters.values[k][j], 0));
      context.forEach((value, j) => assert.ok(Math.abs(d[name].contexts[i][j] - value) < 1e-12));
    }
  }
  assert.ok(d.base.weights[0][0] > d.base.weights[0][2]);
  assert.ok(d.base.weights[1][1] > d.base.weights[1][0]);
  assert.ok(d.broad.weights[0][0] < d.base.weights[0][0]);
  assert.ok(Math.abs(d.base.contexts[0][0] - 1.4359461) < 1e-6);
});

test('C03 context eligibility adds prior memory without revealing future current keys', () => {
  const d = derived();
  assert.deepStrictEqual(d.masks.causal, [[1, null, null], [1, 1, null], [1, 1, 1]]);
  assert.deepStrictEqual(d.masks.bidirectional, [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
  assert.deepStrictEqual(d.masks.memory, [[1, 1, 1, null, null], [1, 1, 1, 1, null], [1, 1, 1, 1, 1]]);
  assert.deepStrictEqual(d.masks.visibleCounts.memory.map((count, i) => count - d.masks.visibleCounts.causal[i]), [2, 2, 2]);
});

test('C03 new views preserve source identity, contextual slots, schema, content and card width', () => {
  const d = derived();
  assert.strictEqual(references.length, 3);
  for (const reference of references) {
    assert.deepStrictEqual(reference.lessons, []);
    assert.deepStrictEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.ok(reference.depths.deep.detailSpec, `${reference.id}: implicit probe`);
    for (const view of Object.values(reference.depths)) for (const spec of Object.values(view)) {
      assert.doesNotThrow(() => parseTutorDiagram(spec));
      assert.deepStrictEqual(lintDiagramContent(spec), []);
      assert.ok(renderTutorDiagram(spec, 680).width <= 680, reference.id);
      assert.ok((spec.diagram.panels ?? []).every(part => !['panels', 'comparison', 'transformation'].includes(part.diagram.kind)));
    }
    const plots = (reference.spec.diagram.panels ?? []).filter(part => part.diagram.kind === 'coordinate-plot');
    assert.ok(plots.length <= 2);
  }
  const alignment = references.find(ref => ref.id === 'ml-transformer-cross-attention-alignment');
  for (const view of [alignment.depths.overview.spec, alignment.spec, alignment.depths.deep.detailSpec]) {
    assert.strictEqual(view.diagram.kind, 'heatmap', 'Alignment uses a full-width native grid, never role-reversed token links');
    assert.strictEqual(view.diagram.rowLabel, 'Target query');
    assert.strictEqual(view.diagram.columnLabel, 'Source key');
    assert.deepStrictEqual(view.diagram.columns, [...d.sourceTokens, '<pad>']);
    assert.ok(view.diagram.rows.every(row => row.cells.at(-1) === null));
    assert.strictEqual(view.diagram.panels, undefined, 'The dense grid is never scaled into an ordered child');
  }
  assert.strictEqual(alignment.depths.overview.spec.diagram.rows.length, 1);
  assert.deepStrictEqual(alignment.depths.overview.spec.diagram.rows.map(row => row.cells), d.base.grid.slice(0, 1));
  assert.deepStrictEqual(alignment.spec.diagram.rows.map(row => row.label), d.targetQueries);
  assert.deepStrictEqual(alignment.spec.diagram.rows.map(row => row.cells), d.base.grid);
  for (const [i, word] of d.sourceTokens.entries()) {
    assert.ok(alignment.spec.diagram.caption.includes(`${word} $(${parameters.values[i].join(',')})$`), 'Visible source values explain the weighted context');
  }
  const weighted = alignment.depths.deep.spec.diagram;
  assert.strictEqual(weighted.kind, 'bar-chart');
  const exps = parameters.keys.slice(0, parameters.source.length).map(key => Math.exp(key.reduce((sum, value, i) => sum + value * parameters.queries[0][i], 0) / Math.sqrt(parameters.queries[0].length)));
  const denominator = exps.reduce((sum, value) => sum + value, 0);
  const expected = parameters.values[0].map((_, j) => Number(exps.reduce((sum, exp, i) => sum + exp / denominator * parameters.values[i][j], 0).toFixed(parameters.precision)));
  assert.deepStrictEqual(weighted.bars.map(bar => bar.value), expected);
  for (const [i, weight] of d.base.display.weights[0].entries()) {
    assert.ok(weighted.caption.includes(`${weight}(${parameters.values[i].join(',')})`), 'Visible arithmetic uses each original coefficient/value pair');
  }
  assert.deepStrictEqual(alignment.depths.deep.detailSpec.diagram.rows.map(row => row.cells), d.broad.grid);
  const rules = references.find(ref => ref.id === 'ml-transformer-context-rules').depths;
  for (const { spec } of [rules.standard, rules.deep]) {
    assert.deepStrictEqual(spec.diagram.panels.map(({ diagram }) => diagram.rows.map(row => row.cells)),
      [d.masks.causal, d.masks.bidirectional]);
  }
  assert.deepStrictEqual(rules.deep.detailSpec.diagram.rows.map(row => row.cells), d.masks.memory);
});

test('C03 contextual states recompute coloured updates in the same named slots at every depth', () => {
  const { slots, slotLookups, slotMixWeights, focus } = parameters;
  const reference = references.find(ref => ref.id === 'ml-transformer-contextual-layer-states');
  const recompute = causal => {
    const result = [slotLookups];
    for (const weights of slotMixWeights) {
      const previous = result.at(-1);
      result.push(slots.map((_, position) => {
        const neighbours = previous.filter((_, i) => Math.abs(i - position) === 1 && (!causal || i < position));
        return weights.map((row, out) => neighbours.reduce((value, neighbour) =>
          value + neighbour.reduce((addition, feature, j) => addition + feature * row[j], 0),
        previous[position][out]));
      }));
    }
    return result;
  };
  const encoder = recompute(false);
  const causal = recompute(true);
  assert.deepStrictEqual(derived().slotStates, { bidirectional: encoder, causal });
  assert.deepStrictEqual(causal.map(layer => layer[0]), causal.map(() => slotLookups[0]));
  assert.notDeepStrictEqual(encoder.at(-1), causal.at(-1));
  const assertView = ({ diagram }, layers) => {
    assert.deepStrictEqual([diagram.kind, diagram.layout], ['matrix', 'teaching']);
    assert.deepStrictEqual(diagram.columns, layers.map((_, i) => i ? `Layer ${i}` : 'Lookup'));
    assert.deepStrictEqual(diagram.rows.map(row => row.heading), slots);
    for (const [i, row] of diagram.rows.entries()) {
      assert.deepStrictEqual(row.cells, layers.map(layer => `$(${layer[i].join(', ')})$`));
    }
    const focusIndex = slots.indexOf(focus);
    assert.deepStrictEqual(diagram.states, layers.slice(1).map((layer, i) => {
      assert.notDeepStrictEqual(layer[focusIndex], layers[i][focusIndex]);
      return { row: diagram.rows[focusIndex].id, column: i + 1, state: 'changed' };
    }));
  };
  for (const { spec } of Object.values(reference.depths)) assertView(spec, encoder);
  assertView(reference.depths.deep.detailSpec, causal);
});
