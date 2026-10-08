import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasHref, newCanvasTitle, projectCanvases } from './project-canvases.js';

const P = 'repo-1a2b3c4d-nanogpt';
const catalog = [
  { kind: 'repository', name: P },
  { kind: 'canvas', name: 'canvas-0000000a', title: 'Attention', project: P },
  { kind: 'canvas', name: 'canvas-0000000b', title: '', project: P },
  { kind: 'canvas', name: 'canvas-0000000c', title: 'Elsewhere', project: 'repo-ffffffff-other' },
  { kind: 'canvas', name: 'canvas-0000000d', title: 'Standalone', project: null },
];

test('the switcher lists Main canvas first, then only this project\'s canvases, each at its Learn URL', () => {
  const entries = projectCanvases(P, catalog, 'canvas-0000000a');
  assert.deepEqual(entries.map((e) => [e.label, e.href, e.current]), [
    ['Main canvas', `/apps/${P}?tab=learn`, false],
    ['Attention', `/apps/${P}?tab=learn&canvas=canvas-0000000a`, true],
    ['Untitled canvas', `/apps/${P}?tab=learn&canvas=canvas-0000000b`, false],
  ]);
});

test('Main canvas is current when no canvas is picked, and alone before the catalog loads', () => {
  assert.deepEqual(projectCanvases(P, catalog).map((e) => e.current), [true, false, false]);
  assert.deepEqual(projectCanvases(P, undefined).map((e) => [e.label, e.current]), [['Main canvas', true]]);
  assert.equal(canvasHref(P), `/apps/${P}?tab=learn`);
});

test('a New canvas starts as the next number in the list', () => {
  assert.equal(newCanvasTitle(projectCanvases(P, [])), 'Canvas 2');
  assert.equal(newCanvasTitle(projectCanvases(P, catalog)), 'Canvas 4');
});
