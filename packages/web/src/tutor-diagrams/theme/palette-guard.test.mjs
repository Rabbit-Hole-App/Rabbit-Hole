import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import kindGallery from '../kind-gallery.json' with { type: 'json' };
import { diagramReferences } from '../reference-library.js';
import { renderTutorDiagram } from '../TutorDiagram.js';
import { allowedColors } from './palette.js';

// Every kind's render contains only palette colours: the palette itself and the 18% tints of its fills over the ground (legend pills, bands). A var() fallback counts.
test('every reference and every kind gallery shape renders with palette colours only, at 408', () => {
  const allowed = allowedColors();
  const stray = [];
  for (const { id, spec } of [...kindGallery.map(entry => ({ id: `shape-${entry.diagram.kind}`, spec: entry })), ...diagramReferences.map(({ id, spec }) => ({ id, spec }))]) {
    const markup = renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
    for (const match of markup.matchAll(/#[0-9A-Fa-f]{8}\b|#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|rgba?\([^)]*\)|\b(?:white|black)\b(?=["';])/g)) {
      if (!allowed.has(match[0].toUpperCase())) stray.push(`${id} ${match[0]}`);
    }
  }
  assert.deepEqual([...new Set(stray)].slice(0, 20), []);
});
