import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { layoutFigure } from './figure-layout.js';

function draw(diagram, width = 320) {
  const layout = layoutFigure(diagram, width);
  assert.equal(layout.width, width);
  assert.ok(Number.isFinite(layout.height) && layout.height > 100);
  const svg = renderToStaticMarkup(h('svg', { viewBox: `0 0 ${width} ${layout.height}` }, ...layout.elements));
  assert.doesNotMatch(svg, /NaN|Infinity/);
  return { ...layout, svg };
}

function text(svg) {
  return svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

test('cell shows four numbered anchors and matching readable callouts', () => {
  const { svg } = draw({ figure: 'cell', callouts: [
    { anchor: 'membrane', label: 'Membrane' },
    { anchor: 'nucleus', label: 'Nucleus', detail: 'Contains most of the cell’s DNA' },
    { anchor: 'cytoplasm', label: 'Cytoplasm' },
    { anchor: 'mitochondrion', label: 'Mitochondrion' },
  ] });
  for (const [index, anchor] of ['membrane', 'nucleus', 'cytoplasm', 'mitochondrion'].entries()) {
    assert.match(svg, new RegExp(`data-figure-anchor="${anchor}" data-figure-number="${index + 1}"`));
    assert.match(svg, new RegExp(`data-figure-callout="${anchor}" data-figure-number="${index + 1}"`));
  }
  assert.match(text(svg), /Contains most of the cell’s DNA/);
});

test('cross-section uses named positions and wraps literal callout text at card width', () => {
  const callout = { anchor: 'interface', label: 'Bond & interface', detail: 'A deliberately long explanation that fits the available text width without cutting off any words.' };
  const short = draw({ figure: 'cross-section', callouts: [{ anchor: 'interface', label: callout.label }] });
  const long = draw({ figure: 'cross-section', callouts: [callout] });
  assert.ok(long.height > short.height);
  assert.match(long.svg, /data-figure-anchor="interface"/);
  assert.match(long.svg, /Bond &amp; interface/);
  assert.match(text(long.svg), /without cutting off any words/);
});

test('free-body arrows face the named directions and preserve relative magnitude', () => {
  const { svg } = draw({ figure: 'free-body', unit: 'N', callouts: [
    { anchor: 'body', label: 'Body' }, { anchor: 'left', label: 'Resistance' },
  ], vectors: [
    { direction: 'up', magnitude: 20, label: 'Lift' },
    { direction: 'down', magnitude: 10, label: 'Weight' },
    { direction: 'left', magnitude: 5, label: 'Drag' },
    { direction: 'right', magnitude: 10, label: 'Thrust' },
  ] });
  const expected = {
    up: '160,92 160,28', down: '160,140 160,172',
    left: '131,116 115,116', right: '189,116 221,116',
  };
  for (const [direction, points] of Object.entries(expected)) {
    assert.match(svg, new RegExp(`data-figure-vector="${direction}">.*?<polyline points="${points}"`));
  }
  assert.match(text(svg), /Lift.*20 N.*Weight.*10 N.*Drag.*5 N.*Thrust.*10 N/);
  assert.match(svg, /data-figure-anchor="left"/);
  assert.equal((svg.match(/data-tutor-arrowhead/g) ?? []).length, 4);
});

test('small forces retain visible arrows and disclose their minimum size', () => {
  const { svg } = draw({ figure: 'free-body', unit: 'N', callouts: [{ anchor: 'body', label: 'Body' }], vectors: [
    { direction: 'left', magnitude: 100, label: 'Force A' },
    { direction: 'right', magnitude: 1, label: 'Force B' },
  ] });
  assert.match(svg, /data-figure-vector="right">.*?<polyline points="189,116 197,116"[^>]*stroke-width="1.5"/);
  assert.match(text(svg), /Force B.*1 N/);
  assert.match(text(svg), /minimum arrow length/);
});
