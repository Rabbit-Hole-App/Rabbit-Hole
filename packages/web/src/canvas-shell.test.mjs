// The Learn canvas shell (owner, 2026-09-30): Home top left, the tool palette left, the
// Rabbit Hole navigator top right, the composer at the bottom, and no app rail. Since 2026-10-08 (owner) the minimap sits
// lower left above the zoom row, and the Next Steps hooks lower right beside the composer. Integration merges lost the Parallel toolbar side and the lower-right minimap once
// (Parallel caca1c2b vs final-integration af572dcc); these pins make a repeat fail loudly.
// The rendered geometry at root, child and grandchild is e2e/canvas-shell-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // a CRLF checkout reads as LF
const canvas = read('AdaptiveCanvas.jsx'), page = read('LearnPage.jsx'), shell = read('Shell.jsx');

test('the tool palette docks left by default and still lives in its own gutter', () => {
  assert.match(canvas, /const \[toolSide, setToolSide\] = useState\('left'\);/);
  assert.match(canvas, /<div ref=\{gutter\} data-tool-gutter/);
  assert.match(canvas, /role="toolbar" aria-label="Canvas tools"/);
});

test('the top-left corner goes Back (owner, 2026-10-04: no longer a jump to Home), Home when opened directly; no sidebar button', () => {
  assert.match(page, /data-learn-home aria-label="Back" title="Back"\r?\n\s+onClick=\{\(\) => goBack\('\/apps'\)\}/);
  assert.match(page, /className="absolute top-3 left-3 /);
  assert.doesNotMatch(canvas, /data-canvas-home/, 'recentring is Shift 0 and the minimap, not a second corner button');
  assert.doesNotMatch(shell, /immersive && !drawer/, 'Learn shows no Open sidebar button');
});

// Owner, 2026-10-08: "move the minimap to the left bottom above the zoom buttons. so that they are all in one together" and
// "move the 3 hooks options window to the bottom right aligned with the lower of the chat composer".
test('the bottom strip: the minimap above the zoom row at lower left, the hooks lower right beside the composer, all in flow', () => {
  const strip = canvas.slice(canvas.indexOf('<div data-canvas-bottom'));
  assert.match(strip, /<div data-zoom-stack className="flex flex-col items-start gap-2">\n\s+\{minimap && <div data-canvas-minimap className="hidden md:block @max-\[640px\]:hidden">\n\s+<CanvasMinimap [\s\S]*?<\/div>\}\n\s+<div data-zoom /, 'one group: the minimap, then the zoom row, one left edge');
  assert.ok(strip.indexOf('data-canvas-minimap') < strip.indexOf('data-canvas-composer') && strip.indexOf('data-canvas-composer') < strip.indexOf('data-canvas-lower-right'), 'minimap left, composer, hooks right');
  assert.match(strip, /md:flex-row md:items-end/, 'one lower edge: the hooks\' bottom is the composer\'s');
  // On a phone the hooks sit above the composer, at the right.
  assert.match(strip, /data-canvas-composer className=\{`\$\{DOCK_WIDTH\} min-w-0 md:mx-0 md:shrink max-md:order-2`\}/);
  assert.match(strip, /data-canvas-lower-right className="flex justify-end md:min-w-fit md:flex-1 md:basis-0 max-md:order-1"/);
  assert.doesNotMatch(canvas.slice(0, canvas.indexOf('<div data-canvas-bottom')), /<CanvasMinimap boxes=\{minimapBoxes\} view=\{view\} onFit=\{zoomFit\}\n\s+surface=\{\{ w: surface\.current\?\.clientWidth \|\| 0, h: surface\.current\?\.clientHeight \|\| 0 \}\}\n\s+onView=\{next => setView\(v => \(\{ \.\.\.v, x: next\.x, y: next\.y \}\)\)\} \/>\}/, 'no second desktop minimap');
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
