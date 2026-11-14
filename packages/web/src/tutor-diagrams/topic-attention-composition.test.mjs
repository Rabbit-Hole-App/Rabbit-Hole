import test from 'node:test';
import assert from 'node:assert';
import { derived, keys, parameters } from './topic-attention-data.js';
import { references } from './composition-attention-references.js';
import { tutorDiagramSchema } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

test('C02 attention divides two-component query-key dot products by the square root of head width', () => {
  const d = derived();
  assert.ok(keys.length <= 10 && parameters.query.length <= 2);
  assert.strictEqual(d.headWidth, parameters.query.length);
  assert.strictEqual(d.divisor, Math.sqrt(parameters.query.length));
  for (const [name, factor, expectedRaw] of [['base', 1, [2, 1, 3]], ['doubled', parameters.queryScale, [4, 2, 6]]]) {
    const query = parameters.query.map(value => value * factor);
    const raw = keys.map(({ key }) => key.reduce((total, value, i) => total + query[i] * value, 0));
    assert.deepStrictEqual(d[name].query, query);
    assert.deepStrictEqual(d[name].raw, expectedRaw);
    assert.deepStrictEqual(d[name].raw, raw);
    assert.deepStrictEqual(d[name].scaled, raw.map(value => value / Math.sqrt(query.length)));
  }
});

test('C02 stable softmax agrees with direct exponentials and keeps the ranking when the query doubles', () => {
  const d = derived();
  for (const row of [d.base, d.doubled]) {
    const exponentials = row.raw.map(value => Math.exp(value / Math.sqrt(parameters.query.length)));
    const denominator = exponentials.reduce((total, value) => total + value, 0);
    const expected = exponentials.map(value => value / denominator);
    row.weights.forEach((weight, i) => assert.ok(Math.abs(weight - expected[i]) < 1e-14));
    assert.ok(row.weights.every(weight => weight > 0 && weight < 1));
    assert.ok(Math.abs(row.total - 1) < 1e-14);
    assert.deepStrictEqual(row.weights.map((weight, i) => i).sort((a, b) => row.weights[b] - row.weights[a]), [2, 0, 1]);
  }
  assert.ok(d.doubled.weights[2] > d.base.weights[2]);
  assert.ok(d.doubled.weights[1] < d.base.weights[1]);
});

test('C02 attention depths and the deep comparison satisfy schema, content and the 680-pixel width budget', () => {
  const reference = references[0];
  assert.deepStrictEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
  assert.strictEqual(reference.depths.overview.spec.diagram.panels.length, 2);
  assert.strictEqual(reference.depths.standard.spec.diagram.panels.length, 3);
  assert.strictEqual(reference.depths.deep.spec.diagram.panels.length, 3);
  assert.strictEqual(reference.depths.deep.detailSpec.diagram.kind, 'comparison');
  assert.strictEqual(reference.depths.deep.detailSpec.diagram.variant, 'panels');
  for (const [depth, view] of Object.entries(reference.depths)) for (const [field, spec] of Object.entries(view)) {
    const parsed = tutorDiagramSchema.safeParse(spec);
    assert.ok(parsed.success, `${depth}/${field}: ${parsed.error?.message}`);
    assert.deepStrictEqual(lintDiagramContent(spec), [], `${depth}/${field}: content`);
    const rendered = renderTutorDiagram(spec, 680);
    assert.ok(rendered.width <= 680 && rendered.height > 0, `${depth}/${field}: ${rendered.width}px`);
  }
});

test('C02 attention bar magnitudes and normalized totals use computed rounding at every depth', () => {
  const d = derived();
  const round = value => Number(value.toFixed(parameters.precision));
  const { overview, standard, deep } = references[0].depths;
  const cases = [[overview.spec.diagram, d.base, ['raw', 'weights']],
    [standard.spec.diagram, d.base, ['raw', 'scaled', 'weights']],
    [deep.spec.diagram, d.doubled, ['raw', 'scaled', 'weights']]];
  for (const [diagram, row, fields] of cases) {
    diagram.panels.forEach(({ diagram: chart }, i) => {
      assert.strictEqual(chart.kind, 'bar-chart');
      assert.deepStrictEqual(chart.bars.map(bar => bar.label), keys.map(key => key.label));
      assert.deepStrictEqual(chart.bars.map(bar => bar.value), row[fields[i]].map(round));
    });
    const distribution = diagram.panels.at(-1).diagram;
    assert.strictEqual(distribution.variant, 'stacked');
    assert.strictEqual(distribution.total, round(row.total));
  }
  deep.detailSpec.diagram.panels.forEach(({ diagram: chart }, i) => {
    const row = [d.base, d.doubled][i];
    assert.strictEqual(chart.variant, 'stacked');
    assert.strictEqual(chart.total, round(row.total));
    assert.deepStrictEqual(chart.bars.map(bar => bar.label), keys.map(key => key.label));
    assert.deepStrictEqual(chart.bars.map(bar => bar.value), row.weights.map(round));
  });
});
