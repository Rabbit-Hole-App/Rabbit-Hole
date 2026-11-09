import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch2b-ensembles-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

function example(id) {
  const reference = references.find(ref => ref.id === id);
  assert.ok(reference, `Missing Lesson 11 reference ${id}`);
  return reference.spec.diagram;
}

test('normalized model probabilities give different hard and soft voting winners', () => {
  const { panels: [{ diagram: models }, { diagram: decisions }] } = example('ml-soft-vote-probabilities');
  const probabilities = models.rows.map(row => row.cells.map(value => Number(value.replace('%', ''))));
  assert.deepEqual(probabilities, [[55, 45], [55, 45], [5, 95]]);
  const votes = [0, 0];
  for (const [a, b] of probabilities) {
    assert.equal(a + b, 100);
    votes[a > b ? 0 : 1]++;
  }
  const means = [0, 1].map(column => probabilities.reduce((sum, row) => sum + row[column], 0) / probabilities.length);
  assert.deepEqual(decisions.rows.map(row => row.cells), [
    votes.map(vote => `${vote} ${vote === 1 ? 'vote' : 'votes'}`),
    means.map(mean => `${mean.toFixed(2)}%`),
  ]);
  assert.ok(votes[0] > votes[1] && means[1] > means[0]);
  assert.deepEqual(decisions.emphasis.cells, [{ row: 'hard', column: 0 }, { row: 'soft', column: 1 }]);
});

function fraction(text) {
  const [numerator, denominator] = text.split('/').map(Number);
  return numerator / denominator;
}

test('AdaBoost applies the binary update to the same examples and normalizes their weights', () => {
  const { before, after, identity } = example('ml-adaboost-weight-update');
  const starting = before.diagram.rows;
  const updated = after.diagram.rows;
  assert.equal(identity.mode, 'preserved');
  assert.deepEqual(updated.map(({ id, heading }) => [id, heading]), starting.map(({ id, heading }) => [id, heading]));
  assert.deepEqual(starting.map(row => row.cells[1]), ['1/4', '1/4', '1/4', '1/4']);
  assert.deepEqual(starting.filter(row => row.cells[0] === 'Missed').map(row => row.id), ['r3']);
  const error = starting.filter(row => row.cells[0] === 'Missed').reduce((sum, row) => sum + fraction(row.cells[1]), 0);
  assert.equal(error, 0.25);
  const alpha = Math.log((1 - error) / error) / 2;
  assert.equal(alpha, Math.log(3) / 2);
  assert.ok(before.diagram.caption.includes(String.raw`$\alpha=\ln(3)/2$`));
  const scaled = starting.map(({ cells: [result, weight] }, index) => {
    const missed = result === 'Missed';
    assert.equal(updated[index].cells[0], missed ? String.raw`$e^\alpha$` : String.raw`$e^{-\alpha}$`);
    return fraction(weight) * Math.exp(missed ? alpha : -alpha);
  });
  const normalizer = scaled.reduce((sum, weight) => sum + weight, 0);
  const weights = updated.map(row => fraction(row.cells[1]));
  assert.deepEqual(weights, [1 / 6, 1 / 6, 1 / 2, 1 / 6]);
  weights.forEach((weight, index) => assert.ok(Math.abs(weight - scaled[index] / normalizer) < 1e-12));
  assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
});

test('each stacking meta row comes from exactly one disjoint held-out prediction fold', () => {
  const { panels: [{ diagram: folds }, { diagram: meta }] } = example('ml-stacking-oof-predictions');
  assert.deepEqual(meta.columns, ['Linear', 'Tree', 'Target']);
  assert.deepEqual(meta.rows.map(row => row.id), ['r1', 'r2', 'r3', 'r4']);
  const allRows = meta.rows.map(row => row.heading.split(' · ')[0]);
  const predicted = [];
  assert.equal(folds.rows.length, 2);
  for (const fold of folds.rows) {
    const [fit, heldOut] = fold.cells.map(cell => cell.split(', '));
    assert.equal(fit.length, 2);
    assert.equal(heldOut.length, 2);
    assert.deepEqual([...fit, ...heldOut].sort(), allRows);
    assert.ok(heldOut.every(row => !fit.includes(row)));
    predicted.push(...heldOut);
    assert.deepEqual(meta.rows.filter(row => row.heading.endsWith(` · ${fold.heading}`))
      .map(row => row.heading.split(' · ')[0]), heldOut);
  }
  assert.deepEqual(predicted.sort(), allRows);
  assert.deepEqual(meta.rows.map(row => row.cells[2]), ['0', '1', '0', '1']);
  assert.ok(meta.rows.every(row => row.cells.slice(0, 2).every(value => Number(value) >= 0 && Number(value) <= 1)));
});

test('all three ensemble references serialize and render their teaching marks at 320, 408 and 720 px', () => {
  const marks = {
    'ml-soft-vote-probabilities': [/data-tutor-matrix-row="model-3"/, /data-tutor-matrix-row="soft"/, /61\.67%/],
    'ml-adaboost-weight-update': [/data-tutor-matrix-row="r3"/, /1\/2/, /data-tutor-arrowhead/],
    'ml-stacking-oof-predictions': [/data-tutor-matrix-row="f1"/, /data-tutor-matrix-row="r4"/, /Target/],
  };
  assert.equal(references.length, 3);
  for (const ref of references) {
    assert.deepEqual(ref.lessons, ['11']);
    const saved = JSON.stringify(ref.spec);
    assert.deepEqual(parseTutorDiagram(saved), ref.spec);
    for (const availableWidth of [320, 408, 720]) {
      const { element, width, height } = renderTutorDiagram(saved, availableWidth);
      const svg = renderToStaticMarkup(element);
      assert.ok(width >= availableWidth && width <= Math.max(availableWidth, 408), `${ref.id} rendered ${width}px at ${availableWidth}px`);
      assert.ok(height > 0);
      assert.match(svg, /^<svg\b/);
      assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      marks[ref.id].forEach(mark => assert.match(svg, mark));
    }
  }
});
