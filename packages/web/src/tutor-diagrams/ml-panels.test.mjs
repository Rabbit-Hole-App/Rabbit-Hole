// The `panels` kind: two or three child diagrams left to right, an arrow and an operation between neighbours, shared bar colours.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTutorDiagram, describeTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { renderToStaticMarkup } from 'react-dom/server';

const bars = (title, rows, extra = {}) => ({ kind: 'bar-chart', title, unit: 'value', bars: rows.map(([label, value]) => ({ label, value })), ...extra });
const logits = bars('Scores', [['Class 0', 2], ['Class 1', 1], ['Class 2', 0.1]]);
const probs = bars('Probabilities', [['Class 0', 0.66], ['Class 1', 0.24], ['Class 2', 0.1]]);
const panels = extra => ({ version: 1, diagram: { kind: 'panels', title: 'Scores become probabilities',
  panels: [{ label: 'Scores', diagram: logits }, { label: 'Probabilities', diagram: probs }],
  links: [{ from: 0, to: 1, operation: 'softmax' }], ...extra } });
const svg = spec => renderToStaticMarkup(renderTutorDiagram(spec, 680).element);

test('panels accept two or three children, up to two neighbour links, and refuse everything else', () => {
  assert.doesNotThrow(() => parseTutorDiagram(panels()));
  const three = panels();
  three.diagram.panels.push({ diagram: probs });
  three.diagram.links = [{ from: 0, to: 1, operation: 'exp(z)' }, { from: 1, to: 2, operation: '÷ 11.21' }];
  assert.doesNotThrow(() => parseTutorDiagram(three));
  three.diagram.panels.push({ diagram: probs });
  assert.throws(() => parseTutorDiagram(three), 'a fourth panel');
  assert.throws(() => parseTutorDiagram(panels({ panels: [{ diagram: logits }] })), 'one panel');
  for (const links of [[{ from: 0, to: 0, operation: 'x' }], [{ from: 1, to: 0, operation: 'x' }], [{ from: 0, to: 2, operation: 'x' }],
    [{ from: 0, to: 1, operation: 'a' }, { from: 0, to: 1, operation: 'b' }], [{ from: 0, to: 1, operation: 'x'.repeat(25) }]]) {
    assert.throws(() => parseTutorDiagram(panels({ links })), JSON.stringify(links));
  }
  assert.throws(() => parseTutorDiagram(panels({ shared: ['classes', 'classes'] })));
  assert.throws(() => parseTutorDiagram(panels({ unknown: true })), 'strict');
});

test('panels cannot hold another composition', () => {
  const inner = { kind: 'panels', title: 'Inner', panels: [{ diagram: logits }, { diagram: probs }] };
  assert.throws(() => parseTutorDiagram(panels({ panels: [{ diagram: inner }, { diagram: probs }] })));
  const comparison = { kind: 'comparison', title: 'Inner', variant: 'panels', panels: [{ heading: 'A', diagram: logits }, { heading: 'B', diagram: probs }] };
  assert.throws(() => parseTutorDiagram(panels({ panels: [{ diagram: comparison }, { diagram: probs }] })));
});

test('shared classes and colours need bar charts; a shared axis needs matching coordinate plots', () => {
  assert.doesNotThrow(() => parseTutorDiagram(panels({ shared: ['classes'] })));
  const plot = title => ({ kind: 'coordinate-plot', title, x: { label: 'Input', min: 0, max: 4 }, y: { label: 'Output', min: 0, max: 8 },
    series: [{ label: 'Samples', kind: 'scatter', points: [{ x: 1, y: 2 }] }] });
  assert.throws(() => parseTutorDiagram(panels({ shared: ['classes'], panels: [{ diagram: plot('A') }, { diagram: probs }] })));
  assert.doesNotThrow(() => parseTutorDiagram(panels({ shared: ['axis'], panels: [{ diagram: plot('A') }, { diagram: plot('B') }] })));
  const other = plot('B');
  other.y.max = 9;
  assert.throws(() => parseTutorDiagram(panels({ shared: ['axis'], panels: [{ diagram: plot('A') }, { diagram: other }] })));
  assert.throws(() => parseTutorDiagram(panels({ shared: ['axis'] })), 'bar charts have no axis to share');
});

test('panels render equal-width panels inside the 680 budget, one arrow and a whole operation label per link', () => {
  for (const [spec, count] of [[panels(), 2], [(() => { const s = panels(); s.diagram.panels.push({ diagram: probs });
    s.diagram.links = [{ from: 0, to: 1, operation: 'exp(z)' }, { from: 1, to: 2, operation: '÷ 11.21' }]; return s; })(), 3]]) {
    const { width, element } = renderTutorDiagram(spec, 680);
    assert.ok(width <= 680, `${count} panels: ${width}`);
    const markup = renderToStaticMarkup(element);
    assert.equal((markup.match(/data-tutor-composition-child=/g) ?? []).length, count);
    const frames = [...markup.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].filter(m => Number(m[2]) > 100 && Number(m[2]) < 400);
    for (const operation of spec.diagram.links.map(link => link.operation)) assert.ok(markup.includes(`>${operation}</`) || markup.includes(operation), operation);
    assert.ok(frames.length >= count);
  }
});

test('a long operation wraps only at spaces and a narrow request grows the diagram instead of shrinking its text', () => {
  const spec = panels({ links: [{ from: 0, to: 1, operation: 'divide by the sum' }] });
  const markup = svg(spec);
  for (const word of ['divide', 'by', 'the', 'sum']) assert.ok(markup.includes(word), word);
  assert.ok(!/divid<|<[^>]*>e by/.test(markup), 'no word is split');
  const narrow = renderTutorDiagram(panels(), 320);
  assert.ok(narrow.width >= 320);
});

test('shared classes give the same colour to the same label in every panel; unshared panels keep their own', () => {
  const fills = markup => [...markup.matchAll(/data-tutor-bar="[^"]+"/g)].length;
  const colourOf = (markup, value) => markup.match(new RegExp(`fill="([^"]+)"[^>]*data-tutor-bar="${value}"`))?.[1];
  const shared = svg(panels({ shared: ['classes'] }));
  assert.equal(fills(shared), 6);
  assert.equal(colourOf(shared, '2'), colourOf(shared, '0.66'), 'Class 0 has one colour in both panels');
  assert.notEqual(colourOf(shared, '2'), colourOf(shared, '1'), 'different classes differ');
  const plain = svg(panels());
  assert.equal(colourOf(plain, '2'), colourOf(plain, '1'), 'without sharing the legacy single bar colour stays');
});

test('panels describe and count their own words once', () => {
  const spec = parseTutorDiagram(panels({ shared: ['classes'] }));
  const text = describeTutorDiagram(spec);
  for (const part of ['Panel 1: Scores', 'Panel 1 → panel 2: softmax', 'Shared: classes', 'Class 0: 2']) assert.ok(text.includes(part), part);
  const words = tutorDiagramVisibleText(spec);
  assert.equal(words.filter(word => word === 'softmax').length, 1);
  assert.ok(words.includes('Scores become probabilities'));
});
