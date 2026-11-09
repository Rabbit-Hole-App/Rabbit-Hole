import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sequenceSelfMessage } from '../../scripts/batch-1-followup-fixtures.mjs';
import { layouts } from './layouts.js';
import { parseTutorDiagram } from './spec.js';

const cases = {
  comparison: {
    diagram: { columns: [
      { heading: 'Start a new lesson', items: ['Short introduction', 'Worked example'] },
      { heading: 'Revisit the lesson', items: ['Previous notes'] },
      { heading: 'Practice the lesson', items: ['Retrieval exercise'] },
      { heading: 'Apply the lesson', items: ['Different context'] },
    ] },
    labels: ['Start', 'introduction', 'Worked', 'Previous', 'Retrieval', 'Different'],
  },
  timeline: {
    diagram: { events: [
      { time: '1843', label: 'First event', detail: 'Published notes on a proposed calculating engine' },
      { time: '1945', label: 'Second event' },
    ] },
    labels: ['1843', 'First event', 'Published notes', '1945', 'Second event'],
  },
  sequence: {
    diagram: {
      actors: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Cache' }, { id: 'c', label: 'API' }, { id: 'd', label: 'Database' }],
      messages: [{ from: 'a', to: 'd', label: 'Fetch record' }, { from: 'c', to: 'b', label: 'Store result' }],
    },
    labels: ['Client', 'Cache', 'API', 'Database', 'Fetch record', 'Store result'],
  },
  matrix: {
    diagram: {
      columns: ['A', 'B', 'C', 'D', 'E'],
      rows: [{ heading: 'Fast', cells: ['0', '1', '2', '3', '4'] }, { heading: 'Slow', cells: ['4', '3', '2', '1', '0'] }],
    },
    labels: ['A', 'B', 'C', 'D', 'E', 'Fast', 'Slow', '0', '4'],
  },
  layers: {
    diagram: { layers: [{ label: 'Application', detail: 'End-user features' }, { label: 'Transport', detail: 'Reliable delivery' }] },
    labels: ['Application', 'End-user features', 'Transport', 'Reliable delivery'],
  },
  cycle: {
    diagram: { steps: ['Plan', 'Act', 'Reflect'] },
    labels: ['Plan', 'Act', 'Reflect'],
  },
};

function render(layout) {
  return renderToStaticMarkup(h('svg', { viewBox: `0 0 ${layout.width} ${layout.height}` }, ...layout.elements));
}

test('a sequence self-message leaves and returns to the same lifeline between messages', () => {
  const { diagram } = parseTutorDiagram(sequenceSelfMessage);
  for (const width of [320, 408, 960]) {
    const layout = layouts.sequence(diagram, width);
    const wires = layout.elements.filter(element => element.type === 'g').map(element =>
      element.props.children[0].props.points.split(' ').map(point => point.split(',').map(Number)));
    const [send, loop, reply] = wires;
    assert.equal(wires.length, 3);
    assert.equal(loop.length, 4);
    assert.equal(loop[0][0], send.at(-1)[0]);
    assert.equal(loop.at(-1)[0], reply[0][0]);
    assert.ok(loop[1][0] < loop[0][0] && loop[1][0] > send[0][0]);
    assert.ok(send[0][1] < loop[0][1] && loop[0][1] < loop.at(-1)[1] && loop.at(-1)[1] < reply[0][1]);
    assert.match(render(layout).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '), /Decrypt with private key/);
  }
});

for (const [kind, { diagram, labels }] of Object.entries(cases)) {
  test(`${kind} keeps its content and valid bounds at narrow and wide widths`, () => {
    for (const width of [320, 720]) {
      const layout = layouts[kind](diagram, width);
      assert.ok(Number.isFinite(layout.width) && layout.width >= width);
      assert.ok(Number.isFinite(layout.height) && layout.height > 0);
      const svg = render(layout);
      const visibleText = svg.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
      for (const expected of labels) {
        assert.ok(visibleText.includes(expected.replace(/\s+/g, '')), `${expected} missing from ${kind}`);
      }
      assert.doesNotMatch(svg, /NaN|Infinity/);
      for (const rect of svg.matchAll(/<rect\b[^>]*>/g)) {
        const get = name => Number(rect[0].match(new RegExp(` ${name}="([^"]+)"`))?.[1] ?? 0);
        assert.ok(get('x') >= 0 && get('y') >= 0, rect[0]);
        assert.ok(get('x') + get('width') <= layout.width + 0.01, rect[0]);
        assert.ok(get('y') + get('height') <= layout.height + 0.01, rect[0]);
      }
    }
  });
}

test('a comparison keeps a long label readable without widening a two-column card', () => {
  const long = 'Keep every word readable even at the smallest Tutor card width.';
  const short = { columns: [{ heading: 'Before', items: ['Brief'] }, { heading: 'After', items: ['Summary'] }] };
  const brief = layouts.comparison(short, 320);
  const wrapped = layouts.comparison({ columns: [short.columns[0], { heading: 'After', items: [long] }] }, 320);
  assert.equal(wrapped.width, 320);
  assert.ok(wrapped.height > brief.height);
  const text = render(wrapped);
  for (const word of ['every', 'readable', 'smallest', 'width.']) assert.ok(text.includes(word), word);
});

test('narrow comparison columns keep common single-word headings intact', () => {
  const diagram = { columns: [
    { heading: 'Base color', items: ['Surface tint'] },
    { heading: 'Normal map', items: ['Surface direction'] },
    { heading: 'Roughness', items: ['Controls sharpness'] },
  ] };
  const svg = render(layouts.comparison(diagram, 320));
  assert.match(svg, />Roughness<\/tspan>/);
  assert.match(svg, />sharpness<\/tspan>/);
});
