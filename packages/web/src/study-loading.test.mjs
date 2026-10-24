import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { savedStudy } from './study-loading.js';
import { effectiveWidgets } from './widget-visibility.js';

const memory = entries => { const map = new Map(Object.entries(entries)); return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: k => map.get(k) ?? null }; };
const OLDER = JSON.stringify({ v: 1, mode: 'study', work: 'canvas', pin: null, notebookId: null, split: 0.4, reader: null, canvasView: null });
const KEY = 'small.adaptive-canvas:org1:me@example.com:canvas-0a1b2c3d:study';
const shown = study => effectiveWidgets({ mode: study?.mode === 'study' ? 'study' : 'canvas', canvas: {}, study: study?.state?.maps });

test('by canvas name: an older Study arrangement reads as Study with both maps hidden; none or several is Canvas', () => {
  const study = savedStudy(memory({ [KEY]: OLDER }), { name: 'canvas-0a1b2c3d' });
  assert.equal(study.mode, 'study');
  assert.deepEqual([shown(study).minimap, shown(study).holeMap], [false, false]);
  assert.equal(savedStudy(memory({}), { name: 'canvas-0a1b2c3d' }), null);
  assert.equal(savedStudy(memory({ [KEY]: OLDER, 'small.adaptive-canvas:org2:you@example.com:canvas-0a1b2c3d:study': OLDER }), { name: 'canvas-0a1b2c3d' }), null);
  assert.equal(savedStudy(memory({ [`${KEY.slice(0, -6)}main:study`]: OLDER }), { name: 'canvas-0a1b2c3d' }), null, 'a board scope is another arrangement');
  assert.equal(savedStudy(null, { name: 'x' }), null);
});

test('with the canvas record: the exact scope, and an explicit Study choice is kept', () => {
  const chosen = JSON.stringify({ v: 1, mode: 'study', maps: { minimap: true } });
  const study = savedStudy(memory({ [KEY]: chosen }), { app: { org: 'org1', email: 'me@example.com', name: 'canvas-0a1b2c3d' } });
  assert.deepEqual([shown(study).minimap, shown(study).holeMap], [true, false]);
  assert.equal(savedStudy(memory({ [KEY]: chosen }), { app: { org: 'org1', owner_email: 'me@example.com', name: 'canvas-0a1b2c3d' } }).mode, 'study');
  assert.equal(savedStudy(memory({}), { app: { org: 'o', email: 'e', name: 'n' } }).mode, 'canvas');
});

test('the owner loaders hand the saved arrangement to the placeholder', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
  const loading = read('./CanvasLoading.jsx');
  assert.match(loading, /export function OwnerCanvasLoading\(\{ study = null \}\)/);
  assert.match(loading, /<CanvasChromeLoading feedback top=\{48\} study=\{study\} \/>/);
  assert.match(loading, /export function CanvasPageLoading\(\{ app = null, name = null \}\) \{\s+return <div className=\{CANVAS_PAGE_COLUMN\}><OwnerCanvasLoading study=\{savedStudy\(browserStorage\(\), \{ app, name \}\)\} \/><\/div>;/);
  assert.match(read('./CanvasPage.jsx'), /<OwnerCanvasLoading study=\{savedStudy\(browserStorage\(\), \{ app \}\)\} \/>/);
  const share = read('./SharePage.jsx');
  assert.match(share, /!app && !error\) return <CanvasPageLoading name=\{slug\} \/>;/);
  assert.match(share, /fallback=\{<CanvasPageLoading app=\{app\} \/>\}/);
});
