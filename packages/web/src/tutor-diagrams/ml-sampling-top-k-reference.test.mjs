import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { samplingTopK } from './ml-sampling-top-k-data.js';
import { samplingTopKReference as reference } from './ml-sampling-top-k-reference.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('both distributions sum to one and only the highest-scored tokens retain mass', () => {
  const { k, logits, full, filtered, fullPercent, filteredPercent, keptMassPercent } = samplingTopK;
  const weights = logits.map(Math.exp);
  const cutoff = [...logits].sort((a, b) => b - a)[k - 1];
  const fullDenominator = sum(weights);
  const keptDenominator = sum(weights.filter((_, i) => logits[i] >= cutoff));

  near(sum(full), 1);
  near(sum(filtered), 1);
  assert.equal(filtered.filter(value => value > 0).length, k);
  assert.equal(sum(fullPercent), 100);
  assert.equal(sum(filteredPercent), 100);
  near(keptMassPercent / 100, keptDenominator / fullDenominator);
  for (const [i, weight] of weights.entries()) {
    near(full[i], weight / fullDenominator);
    if (logits[i] >= cutoff) near(filtered[i], weight / keptDenominator);
    else assert.equal(filtered[i], 0);
    near(fullPercent[i] / 100, full[i]);
    near(filteredPercent[i] / 100, filtered[i]);
  }
});

test('all three depths render the same aligned grouped percentages and zero marks at 408 px', () => {
  const { tokens, fullPercent, filteredPercent } = samplingTopK;
  assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
  for (const { spec } of Object.values(reference.depths)) {
    const { diagram } = parseTutorDiagram(spec);
    assert.deepEqual(lintDiagramContent(spec), []);
    assert.equal(diagram.variant, 'grouped');
    assert.equal(diagram.unit, '%');
    assert.deepEqual(diagram.categories, tokens);
    assert.deepEqual(diagram.series.map(series => series.values), [fullPercent, filteredPercent]);

    const { element, width } = renderTutorDiagram(spec, 408);
    const svg = renderToStaticMarkup(element);
    assert.equal(width, 408);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    assert.equal([...svg.matchAll(/data-tutor-grouped-bar="/g)].length, tokens.length * 2);
    assert.equal([...svg.matchAll(/data-tutor-grouped-bar="0"/g)].length, tokens.length - samplingTopK.k);
  }
});
