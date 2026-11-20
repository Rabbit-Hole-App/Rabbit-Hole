import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { titleWithUnit } from './axis-title.js';
import { references } from './gen-1-box-plot-references.js';
import { diagramReferences } from './reference-library.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const text = svg => svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('titleWithUnit adds the unit once and never when the label already ends with it', () => {
  assert.equal(titleWithUnit('Time', 'ms'), 'Time (ms)');
  assert.equal(titleWithUnit('Time (ms)', 'ms'), 'Time (ms)');
  assert.equal(titleWithUnit('Time in MS ', 'ms'), 'Time in MS ');
  assert.equal(titleWithUnit('Error %', '%'), 'Error %');
  assert.equal(titleWithUnit('Loss', 's'), 'Loss (s)'); // a word that merely ends in the unit letter
  assert.equal(titleWithUnit('Time', undefined), 'Time');
  assert.equal(titleWithUnit('Time (ms) late', 'ms'), 'Time (ms) late (ms)');
});

test('a box-plot axis whose label already carries its unit prints the unit once', () => {
  const { spec } = references[0];
  const doubled = { ...spec, diagram: { ...spec.diagram, x: { ...spec.diagram.x, label: 'Seedling height (cm)' } } };
  const svg = text(renderToStaticMarkup(renderTutorDiagram(doubled, 408).element));
  assert.match(svg, /Seedling height \(cm\)/);
  assert.doesNotMatch(svg, /\(cm\)\s*\(cm\)/);
});

test('no library or gallery diagram prints the same (unit) twice in a row', () => {
  for (const { id, spec } of diagramReferences) {
    assert.doesNotMatch(text(renderToStaticMarkup(renderTutorDiagram(spec, 408).element)), /\(([a-z%/·μ°]+)\)\s*\(\1\)/i, id);
  }
});
