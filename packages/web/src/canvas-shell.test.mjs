// The Learn canvas shell (owner, 2026-09-30): Home top left, the tool palette left, the
// Rabbit Hole navigator top right, the minimap lower right, the composer at the bottom, and no
// app rail. Integration merges lost the Parallel toolbar side and the lower-right minimap once
// (Parallel caca1c2b vs final-integration af572dcc); these pins make a repeat fail loudly.
// The rendered geometry at root, child and grandchild is e2e/canvas-shell-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const canvas = read('AdaptiveCanvas.jsx'), page = read('LearnPage.jsx'), shell = read('Shell.jsx');

test('the tool palette docks left by default and still lives in its own gutter', () => {
  assert.match(canvas, /const \[toolSide, setToolSide\] = useState\('left'\);/);
  assert.match(canvas, /<div ref=\{gutter\} data-tool-gutter/);
  assert.match(canvas, /role="toolbar" aria-label="Canvas tools"/);
});

test('the top-left corner is Home at every depth, never a back button; no sidebar button', () => {
  assert.match(page, /data-learn-home aria-label="Home" title="Home"\r?\n\s+onClick=\{\(\) => navigate\('\/apps'\)\}/);
  assert.match(page, /className="absolute top-3 left-3 /);
  assert.doesNotMatch(canvas, /data-canvas-home/, 'recentring is Shift 0 and the minimap, not a second corner button');
  assert.doesNotMatch(shell, /immersive && !drawer/, 'Learn shows no Open sidebar button');
});

test('the minimap is lower right in the bottom strip, in flow, beside the composer', () => {
  const strip = canvas.slice(canvas.indexOf('<div data-canvas-bottom'));
  assert.ok(strip.indexOf('data-canvas-composer') < strip.indexOf('data-canvas-minimap'), 'right of the composer');
  assert.match(strip, /data-canvas-minimap[^\n]*md:justify-end/);
  assert.match(strip, /\{minimap && <CanvasMinimap /);
  assert.match(read('CanvasMinimap.jsx'), /className="relative overflow-hidden rounded-xl/, 'its frame is in flow, never absolute over the canvas');
});

test('the Rabbit Hole navigator coexists: its own right gutter with the tools left, the tools gutter top when they dock right', () => {
  assert.match(canvas, /gutterTop && toolSide === 'left' && <div data-dive-gutter/);
  assert.match(canvas, /\{toolSide === 'right' && gutterTop\}/);
  assert.match(page, /gutterTop=\{dive\.tree \? <DiveNavigator \{\.\.\.dive\.navigator\} \/> : null\}/);
});

test('every Learn level renders the same shell: a pending or nested hole is the same LearnSurface', () => {
  assert.match(page, /return hole \? <LearnSurface key=\{hole\.name\} app=\{holeApp\(props\.app, hole\)\} hole=\{hole\} \/> : <LearnSurface \{\.\.\.props\} \/>;/);
});

test('Learn keeps no persistent app rail: the immersive shell hides the sidebar', () => {
  assert.match(shell, /immersive \? 'hidden'/);
});
