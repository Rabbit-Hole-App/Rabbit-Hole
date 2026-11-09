import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch2c-imbalance-references.js';
import { parseTutorDiagram } from './spec.js';
import { TEACHING } from './teaching-theme.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const accuracyTrap = 'ml-minority-accuracy-trap';
const undersampling = 'ml-majority-undersampling';
function specFor(id) {
  const reference = references.find(ref => ref.id === id);
  assert.ok(reference, `${id} is available as an author reference`);
  assert.deepEqual(reference.lessons, ['17']);
  return reference.spec;
}

const sum = values => values.reduce((total, value) => total + value, 0);

test('minority recall and accuracy count different populations in the same confusion matrix', () => {
  const { diagram } = parseTutorDiagram(specFor(accuracyTrap));
  assert.equal(diagram.kind, 'comparison');
  assert.equal(diagram.variant, 'panels');
  const [confusion, metrics] = diagram.panels.map(panel => panel.diagram);
  assert.equal(confusion.kind, 'heatmap');
  assert.equal(confusion.rowLabel, 'Actual');
  assert.equal(confusion.columnLabel, 'Predicted');
  assert.deepEqual(confusion.rows.map(row => row.label), ['Majority', 'Minority']);
  assert.deepEqual(confusion.columns, ['Majority', 'Minority']);
  const counts = confusion.rows.map(row => row.cells);
  assert.deepEqual(counts, [[95, 0], [5, 0]]);
  assert.deepEqual(confusion.highlights, [{ row: 1, column: 0 }]);

  const allCases = sum(counts.flat());
  const allCorrect = sum(counts.map((row, i) => row[i]));
  const minorityCases = sum(counts[1]);
  const minorityFound = counts[1][1];
  assert.equal(metrics.kind, 'matrix');
  assert.equal(metrics.layout, 'teaching');
  for (const [id, correct, cases] of [
    ['accuracy', allCorrect, allCases],
    ['minority-recall', minorityFound, minorityCases],
  ]) {
    assert.deepEqual(metrics.rows.find(row => row.id === id).cells, [
      String.raw`$\frac{${correct}}{${cases}}$`, `${100 * correct / cases}%`,
    ]);
  }
});

test('undersampling keeps two majority rows and both minority rows', () => {
  const { diagram } = parseTutorDiagram(specFor(undersampling));
  assert.equal(diagram.kind, 'sample-set');
  const { samples, groups } = diagram;
  const ids = samples.map(sample => sample.id);
  const byClass = (members, label) => samples.filter(sample => sample.class === label && members.includes(sample.id))
    .map(sample => sample.id);
  const originalMinority = byClass(ids, 'Minority');
  assert.deepEqual([byClass(ids, 'Majority').length, originalMinority.length], [6, 2]);
  assert.equal(samples.length, 8);

  const retained = groups.find(group => group.id === 'retained');
  assert.equal(retained.members.length, 4);
  assert.equal(new Set(retained.members).size, 4);
  assert.equal(byClass(retained.members, 'Majority').length, 2);
  assert.deepEqual(byClass(retained.members, 'Minority'), originalMinority);
  assert.ok(!retained.replacement);
  assert.deepEqual(new Set(retained.omitted), new Set(ids.filter(id => !retained.members.includes(id))));
});

for (const id of [accuracyTrap, undersampling]) {
  test(`${id} renders the checked data at 320, 408 and 720 px`, () => {
    const spec = specFor(id);
    const saved = JSON.stringify(spec);
    assert.deepEqual(parseTutorDiagram(saved), spec);
    for (const width of [320, 408, 720]) {
      const rendered = renderTutorDiagram(saved, width);
      const svg = renderToStaticMarkup(rendered.element);
      assert.ok(rendered.width >= width && rendered.width <= width + 24);
      assert.ok(Number.isFinite(rendered.height) && rendered.height > 0);
      assert.match(svg, /^<svg .*role="img"/);
      assert.ok(svg.includes(TEACHING.blueSoft));
      assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));

      if (id === accuracyTrap) {
        assert.match(svg, /stroke-width="3" data-tutor-heatmap-cell="1:0"/);
        assert.match(svg, /data-tutor-matrix-cell="minority-recall:1"/);
        for (const value of ['Actual', 'Predicted', '95', '5', '95%', '0%']) {
          assert.ok(svg.includes(`>${value}</tspan>`), `${value} is visible at ${width} px`);
        }
        for (const fraction of [String.raw`$\frac{95}{100}$`, String.raw`$\frac{0}{5}$`]) {
          assert.ok(svg.includes(`data-tutor-tex="${fraction}"`), `${fraction} is typeset at ${width} px`);
        }
      } else {
        const originals = [...svg.matchAll(/data-tutor-sample="([^"]+)"/g)].map(match => match[1]);
        assert.deepEqual(originals, spec.diagram.samples.map(sample => sample.id));
        const retained = spec.diagram.groups.find(group => group.id === 'retained');
        const members = [...svg.matchAll(/data-tutor-sample-member="retained:([^"]+)" data-tutor-multiplicity="1"/g)]
          .map(match => match[1]);
        assert.deepEqual(members, retained.members);
        assert.ok(svg.includes(`>Omitted: ${retained.omitted.join(', ')}</tspan>`));
      }
    }
  });
}
