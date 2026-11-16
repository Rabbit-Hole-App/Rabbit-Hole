import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch2a-encoding-references.js';
import { describeTutorDiagram, parseTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { TEACHING } from './teaching-theme.js';

const record = id => {
  const reference = references.find(reference => reference.id === id);
  assert.ok(reference, `${id} must be available as an author reference`);
  return reference;
};
const panels = id => record(id).spec.diagram.panels.map(panel => panel.diagram);
const cell = (table, row, column) => {
  const index = table.columns.indexOf(column);
  assert.ok(index >= 0, `the table must show ${column}`);
  return row.cells[index];
};

test('two lesson 08 encoding references survive the public saved-JSON contract', () => {
  assert.deepEqual(references.map(reference => reference.id), ['ml-ordinal-encoding', 'ml-value-binning']);
  for (const reference of references) {
    assert.deepEqual(reference.lessons, ['08']);
    assert.ok(reference.prompts.length > 0 && reference.prompts.every(prompt => prompt.length > 30));
    assert.ok(reference.keywords.length >= 4 && reference.useWhen.length > 40);
    const saved = JSON.stringify(reference.spec);
    assert.ok(saved.length < 16_384);
    assert.deepEqual(parseTutorDiagram(saved), reference.spec);
    assert.deepEqual(parseTutorDiagram(JSON.parse(saved)), reference.spec);
    assert.equal(reference.spec.version, 1);
    assert.equal(reference.spec.diagram.kind, 'comparison');
    assert.equal(reference.spec.diagram.variant, 'panels');
    assert.ok(tutorDiagramVisibleText(reference.spec).includes(reference.spec.diagram.title));
    assert.ok(describeTutorDiagram(reference.spec).length > reference.spec.diagram.title.length);
    for (const { diagram } of reference.spec.diagram.panels) {
      assert.ok(['matrix', 'histogram'].includes(diagram.kind));
      if (diagram.kind === 'matrix') {
        assert.equal(diagram.layout, 'teaching');
        assert.ok(diagram.columns.length <= 3, 'short tables keep values readable');
      }
    }
  }
});

test('ordinal codes follow the meaningful ranking for every stable sample row', () => {
  const [codebook, samples] = panels('ml-ordinal-encoding');
  const orderedLevels = ['Low', 'Medium', 'High'];
  const codeByLevel = new Map(codebook.rows.map(row => [cell(codebook, row, 'Level'), Number(cell(codebook, row, 'Code'))]));
  assert.equal(codeByLevel.size, orderedLevels.length);
  assert.deepEqual(codebook.rows.map(row => cell(codebook, row, 'Level')), orderedLevels);
  for (const [rank, level] of orderedLevels.entries()) assert.equal(codeByLevel.get(level), rank);
  assert.deepEqual(samples.rows.map(row => [row.id, row.heading, cell(samples, row, 'Level')]), [
    ['a', 'A', 'Low'], ['b', 'B', 'High'], ['c', 'C', 'Medium'],
    ['d', 'D', 'Medium'], ['e', 'E', 'Low'], ['f', 'F', 'High'],
  ]);
  const counts = new Map();
  for (const row of samples.rows) {
    const level = cell(samples, row, 'Level');
    const code = Number(cell(samples, row, 'Code'));
    assert.equal(code, orderedLevels.indexOf(level), `${row.heading} must encode its own category`);
    assert.equal(code, codeByLevel.get(level), 'repeated categories reuse the same codebook');
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  assert.deepEqual([...counts].sort(([a], [b]) => a - b), [[0, 2], [1, 2], [2, 2]]);
  const explanation = tutorDiagramVisibleText(record('ml-ordinal-encoding').spec).join(' ');
  assert.match(explanation, /not measured equal spacing/i);
  assert.match(explanation, /nominal categories/i);
});

test('bin memberships are recomputed from raw values and declared edges, conserving all seven observations', () => {
  const [table, histogram] = panels('ml-value-binning');
  const edges = histogram.binEdges;
  assert.deepEqual(edges, [0, 10, 20, 30, 40]);
  const values = table.rows.map(row => Number(cell(table, row, 'Value')));
  assert.deepEqual(values, [5, 12, 19, 20, 26, 39, 40]);
  assert.equal(new Set(table.rows.map(row => row.id)).size, values.length);
  const derivedCounts = Array(edges.length - 1).fill(0);
  const memberships = values.map((value, rowIndex) => {
    const bin = edges.slice(0, -1).findIndex((lower, index) => value >= lower &&
      (value < edges[index + 1] || index === edges.length - 2 && value === edges[index + 1]));
    assert.ok(bin >= 0, `${value} must belong to exactly one displayed bin`);
    assert.equal(Number(cell(table, table.rows[rowIndex], 'Bin')), bin, `${value} uses the stated edge convention`);
    derivedCounts[bin] += 1;
    return bin;
  });
  assert.deepEqual(memberships, [0, 1, 1, 2, 2, 3, 3]);
  assert.equal(memberships[values.indexOf(20)], 2, '20 belongs to the interval starting at 20');
  assert.equal(memberships[values.indexOf(40)], edges.length - 2, 'the final bin includes 40');
  assert.equal(histogram.measure, 'count');
  assert.equal(histogram.density ?? false, false);
  assert.equal(histogram.series.length, 1);
  assert.deepEqual(histogram.series[0].values, derivedCounts);
  assert.equal(derivedCounts.reduce((sum, count) => sum + count, 0), table.rows.length);
  const description = describeTutorDiagram(record('ml-value-binning').spec);
  assert.match(description, /left-closed, right-open/i);
  assert.match(description, /final bin includes 40/i);
  assert.match(description, /\[20, 30\): 2/);
  assert.match(description, /\[30, 40\]: 2/);
});

for (const id of ['ml-ordinal-encoding', 'ml-value-binning']) {
  test(`${id} renders real teaching SVG with intact table values at 320, 408 and 720`, () => {
    const reference = record(id);
    const saved = parseTutorDiagram(JSON.stringify(reference.spec));
    for (const width of [320, 408, 720]) {
      const rendered = renderTutorDiagram(saved, width);
      assert.ok(Number.isFinite(rendered.width) && rendered.width > 0);
      assert.ok(Number.isFinite(rendered.height) && rendered.height > 0);
      const markup = renderToStaticMarkup(rendered.element);
      assert.doesNotMatch(markup, /NaN|Infinity|undefined/);
      const { document } = parseHTML(markup);
      const svg = document.querySelector('svg');
      assert.ok(svg && svg.getAttribute('role') === 'img');
      assert.ok(svg.getAttribute('style').includes(TEACHING.ink));
      assert.ok(markup.includes(TEACHING.blue));
      const groups = [...svg.querySelectorAll('[data-tutor-composition-child]')];
      assert.equal(groups.length, reference.spec.diagram.panels.length);
      reference.spec.diagram.panels.forEach(({ diagram }, panelIndex) => {
        const group = groups[panelIndex];
        if (diagram.kind === 'matrix') {
          assert.equal(group.querySelectorAll('[data-tutor-matrix-cell]').length, diagram.rows.length * diagram.columns.length);
          diagram.columns.forEach((heading, column) => {
            const box = group.querySelector(`[data-tutor-matrix-column="${column}"]`);
            const text = box.nextElementSibling;
            assert.equal(text.localName, 'text');
            assert.equal(text.textContent, heading);
            assert.equal(text.querySelectorAll('tspan').length, 1, `${heading} must stay on one line at ${width}`);
          });
          for (const row of diagram.rows) {
            assert.equal(group.querySelector(`[data-tutor-matrix-row="${row.id}"]`).nextElementSibling.textContent, row.heading);
            row.cells.forEach((value, column) => {
              const box = group.querySelector(`[data-tutor-matrix-cell="${row.id}:${column}"]`);
              const text = box.nextElementSibling;
              assert.equal(text.localName, 'text');
              assert.equal(text.textContent, value);
              assert.equal(text.querySelectorAll('tspan').length, 1, `${row.id}:${column} must not split ${value} at ${width}`);
              if (/^-?\d+(\.\d+)?$/.test(value)) assert.match(value, /^-?\d+(\.\d{1,4})?$/);
            });
          }
        } else {
          const bars = [...group.querySelectorAll('[data-tutor-histogram-bin]')];
          assert.equal(bars.length, diagram.binEdges.length - 1);
          bars.forEach((bar, bin) => {
            const mass = diagram.series[0].values[bin];
            assert.equal(Number(bar.getAttribute('data-tutor-bin-mass')), mass);
            assert.equal(Number(bar.getAttribute('data-tutor-bin-height')), mass);
            assert.ok(Number(bar.getAttribute('height')) > 0);
          });
          const visibleText = [...group.querySelectorAll('text')].map(node => node.textContent).join(' ');
          assert.match(visibleText, /\[20, 30\): 2/);
          assert.match(visibleText, /\[30, 40\]: 2/);
        }
      });
    }
  });
}
