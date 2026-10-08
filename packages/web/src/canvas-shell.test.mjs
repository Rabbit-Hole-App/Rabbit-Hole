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
test('the bottom strip: the minimap above the zoom row at lower left, the hooks lower right beside the composer', () => {
  const strip = canvas.slice(canvas.indexOf('<div data-canvas-bottom'));
  assert.match(strip, /<div data-zoom-stack className="flex flex-col items-start gap-2">\n\s+\{minimap && <div data-canvas-minimap className="hidden md:block @max-\[640px\]:hidden">\n\s+<CanvasMinimap [\s\S]*?<\/div>\}\n\s+<div data-zoom /, 'one group: the minimap, then the zoom row, one left edge');
  assert.ok(strip.indexOf('data-canvas-minimap') < strip.indexOf('data-canvas-composer') && strip.indexOf('data-canvas-composer') < strip.indexOf('data-canvas-lower-right'), 'minimap left, composer, hooks right');
  assert.match(strip, /md:flex-row md:items-end/, 'one lower edge: the hooks\' bottom is the composer\'s');
  // On a phone the hooks sit above the composer, at the right.
  assert.match(strip, /data-canvas-composer className=\{`\$\{DOCK_WIDTH\} min-w-0 md:mx-0 md:shrink max-md:order-2`\}/);
  assert.match(strip, /data-canvas-lower-right className="flex justify-end md:min-w-fit md:flex-1 md:basis-0 max-md:order-1"/);
  assert.doesNotMatch(canvas.slice(0, canvas.indexOf('<div data-canvas-bottom')), /<CanvasMinimap boxes=\{minimapBoxes\} view=\{view\} onFit=\{zoomFit\}\n\s+surface=\{\{ w: surface\.current\?\.clientWidth \|\| 0, h: surface\.current\?\.clientHeight \|\| 0 \}\}\n\s+onView=\{next => setView\(v => \(\{ \.\.\.v, x: next\.x, y: next\.y \}\)\)\} \/>\}/, 'no second desktop minimap');
  assert.match(read('CanvasMinimap.jsx'), /className="relative overflow-hidden rounded-xl/, 'its frame is in the strip\'s flow');
});

// Owner, 2026-10-08: "in the canvas above the chat composer you are cutting the canvas too much". The canvas runs to the
// bottom and the strip floats over it; chrome may float over the canvas but never hides what the learner cannot reach.
test('the bottom strip floats: the canvas runs to the bottom, the strip lets the pointer through, only its controls take it', () => {
  assert.match(canvas, /<div data-canvas-bottom ref=\{bottomStrip\} className=\{`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 md:flex-row md:items-end md:gap-3 \$\{DOCK_PAD\} \[&>\*>\*\]:pointer-events-auto`\}>/);
  assert.doesNotMatch(canvas, /data-canvas-bottom[^\n]*shrink-0/, 'no band of its own under the canvas');
  // The side columns' heights reach what must clear them: the Voice caption and the tools' gutter on that side.
  assert.match(canvas, /host\.style\.setProperty\('--chrome-left', `\$\{Math\.max\(0, bottom - strip\.firstElementChild\.getBoundingClientRect\(\)\.top\)\}px`\);/);
  assert.match(canvas, /host\.style\.setProperty\('--chrome-right', `\$\{Math\.max\(0, bottom - strip\.lastElementChild\.getBoundingClientRect\(\)\.top\)\}px`\);/);
  assert.match(canvas, /order-first items-start pl-2 pb-\(--chrome-left\) /);
  assert.match(canvas, /items-end pr-2 mr-\(--edge\) pb-\(--chrome-right\) /);
  assert.match(canvas, /parseFloat\(getComputedStyle\(bar\.parentElement\)\.paddingBottom \|\| 0\)/, 'the tools\' room leaves the column out');
  // A phone: the tools' strip goes to the top, so the composer floats at the bottom.
  assert.match(canvas, /@max-\[640px\]:order-first @max-\[640px\]:pb-0 /);
});

test('fit, focus and a new card stop above the floating chrome over their span (a bottom inset); panning still reaches it', () => {
  assert.match(canvas, /const chromeTop = \(x0, x1\) => \{[\s\S]*?querySelectorAll\('\[data-canvas-bottom\] > \* > \*'\)[\s\S]*?rect\.left - at\.left < x1 && rect\.right - at\.left > x0[\s\S]*?\.map\(rect => rect\.top - at\.top\)\);\n  \};/);
  // frame (zoom to fit, zoom to selection, presenting, a section): fit to the height above the chrome.
  assert.match(canvas, /const h = Math\.min\(element\.clientHeight, chromeTop\(across\(z\) \+ left \* z, across\(z\) \+ right \* z\)\);\n\s+z = fit\(h\);/);
  assert.match(canvas, /y: \(height \+ pad \* 2 < h \? \(h - height\) \/ 2 : pad\) - top \* z,/);
  // showBox (a new or revealed card): the chrome over the card's span is a floor.
  assert.match(canvas, /const floor = chromeTop\(first\.x \+ box\.x \* current\.z, first\.x \+ \(box\.x \+ box\.w\) \* current\.z\) - 24;/);
  // centerOn (an asked card): centred above the chat sheet and the chrome.
  assert.match(canvas, /const h = Math\.max\(120, Math\.min\(open, chromeTop\(x \+ box\.x \* v\.z, x \+ \(box\.x \+ box\.w\) \* v\.z\)\)\);/);
  // insertBlock: the new block's top in view above the chrome.
  assert.match(canvas, /y: Math\.min\(v\.y, chromeTop\(v\.x, v\.x \+ COLUMN \* v\.z\) - 280 - /);
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
