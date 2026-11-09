import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { kfoldValidationReference as reference } from './ml-kfold-validation-reference.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const specs = [reference.depths.overview.spec, reference.spec, reference.depths.deep.spec];

test('five-fold validation fits on four folds and highlights a different held-out fold in every round', () => {
  for (const spec of specs) {
    const { diagram } = parseTutorDiagram(spec);
    assert.deepEqual(lintDiagramContent(spec), []);
    assert.match(diagram.caption, /^Worked example\./);
    assert.equal(diagram.columns.length, 5);
    assert.equal(diagram.rows.length, 5);
    const heldOut = diagram.rows.map((row, index) => {
      assert.equal(row.cells.filter(cell => cell === 'Fit').length, 4);
      assert.notEqual(row.cells[index], 'Fit');
      return { row: row.id, column: index };
    });
    assert.deepEqual(diagram.emphasis.cells, heldOut);
    const { element, width, height } = renderTutorDiagram(spec, 408);
    assert.ok(width >= 408 && height > 0);
    const svg = renderToStaticMarkup(element);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    const highlighted = [...svg.matchAll(/data-tutor-matrix-cell="([^"]+)" data-emphasis="true"/g)].map(([, cell]) => cell);
    assert.deepEqual(highlighted, heldOut.map(({ row, column }) => `${row}:${column}`));
  }
});

test('the displayed accuracies and mean follow nearest neighbors in the other four folds', () => {
  const folds = [
    [['A', 0, 0], ['B', 1, 0]], [['C', 2, 0], ['D', 3, 0]], [['E', 4, 1], ['F', 5, 1]],
    [['G', 6, 1], ['H', 7, 1]], [['I', 8, 1], ['J', 9, 1]],
  ];
  const scores = folds.map((heldOut, i) => {
    const fit = folds.filter((_, j) => j !== i).flat();
    return heldOut.filter(([, x, label]) => {
      const [nearest] = fit.slice().sort((a, b) => Math.abs(a[1] - x) - Math.abs(b[1] - x) || a[1] - b[1]);
      return nearest[2] === label;
    }).length;
  });
  assert.deepEqual(scores, [2, 1, 1, 2, 2]);
  const balanced = reference.spec.diagram;
  const detailed = reference.depths.deep.spec.diagram;
  assert.deepEqual(balanced.rows.map((row, i) => row.cells[i]), scores.map((score, i) => `${score / folds[i].length * 100}%`));
  assert.deepEqual(detailed.columns, folds.map((fold, i) => `Fold ${i + 1} ${fold.map(([id, , label]) => `${id}${label}`).join(',')}`));
  assert.deepEqual(detailed.rows.map((row, i) => row.cells[i]), scores.map((score, i) => `${score} of ${folds[i].length}`));
  assert.match(balanced.caption, /mean is 80%/);
  assert.ok(detailed.caption.includes('$(1+0.5+0.5+1+1)/5=0.8$'));
});
