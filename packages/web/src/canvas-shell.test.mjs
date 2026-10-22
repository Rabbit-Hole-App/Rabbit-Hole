// The Learn canvas shell (owner, 2026-09-30): Home top left, the tool palette left, the
// Rabbit Hole navigator top right (since UI-17, 2026-10-21: the top of the tools gutter), the composer at the bottom, and no app rail. Since 2026-10-08 (owner) the minimap sits
// lower left above the zoom row, and the Next Steps hooks lower right beside the composer. Integration merges lost the Parallel toolbar side and the lower-right minimap once
// (Parallel caca1c2b vs final-integration af572dcc); these pins make a repeat fail loudly.
// The rendered geometry at root, child and grandchild is e2e/canvas-shell-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // a CRLF checkout reads as LF
const canvas = read('AdaptiveCanvas.jsx'), page = read('LearnPage.jsx'), shell = read('Shell.jsx');

// Owner decision 2026-10-22 (supersedes the reserved tools gutter): the drawing surface fills the canvas workspace and the
// tools column floats over it, taking no pointer and clipping nothing; only its controls take the pointer.
test('the tool palette docks left by default, in a column that floats over the canvas (owner, 2026-10-22)', () => {
  assert.match(canvas, /const \[toolSide, setToolSide\] = useState\('left'\);/);
  assert.match(canvas, /<div ref=\{gutter\} data-tool-gutter/);
  assert.match(canvas, /className=\{`pointer-events-none absolute top-\[var\(--canvas-top,0px\)\] bottom-0 z-20 flex flex-col justify-center gap-2 \[&>\*\]:pointer-events-auto \$\{toolSide === 'left' \? 'left-0 /, 'absolute over the surface, below the header, the pointer through');
  assert.doesNotMatch(canvas, /data-tool-gutter[^\n]*\n[^\n]*\n[^\n]*shrink-0/, 'no row width of its own');
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
  assert.match(strip, /<div data-zoom-stack className="flex w-fit flex-col items-stretch gap-2">\n\s+\{minimap && <div data-canvas-minimap>\n\s+<CanvasMinimap [\s\S]*?<\/div>\}\n\s+<div data-zoom /, 'one group: the minimap, then the zoom row, stretched to one outer width (owner brief 2026-10-16 item 8)');
  assert.ok(strip.indexOf('data-canvas-minimap') < strip.indexOf('data-canvas-composer') && strip.indexOf('data-canvas-composer') < strip.indexOf('data-canvas-lower-right'), 'minimap left, composer, hooks right');
  assert.match(strip, /md:flex-row md:items-end/, 'one lower edge: the hooks\' bottom is the composer\'s');
  // On a phone the hooks sit above the composer, at the right.
  assert.match(strip, /data-canvas-composer data-composer-hidden=\{composerHidden \? '' : undefined\} className=\{`\$\{DOCK_WIDTH\} relative min-w-0 md:mx-0 md:shrink max-md:order-2 \$\{composerHidden \? 'hidden' : ''\}`\}/);
  assert.match(strip, /data-canvas-lower-right className="flex justify-end md:min-w-fit md:flex-1 md:basis-0 max-md:order-1"/);
  assert.doesNotMatch(canvas.slice(0, canvas.indexOf('<div data-canvas-bottom')), /<CanvasMinimap boxes=\{minimapBoxes\} view=\{view\} onFit=\{zoomFit\}\n\s+surface=\{\{ w: surface\.current\?\.clientWidth \|\| 0, h: surface\.current\?\.clientHeight \|\| 0 \}\}\n\s+onView=\{next => setView\(v => \(\{ \.\.\.v, x: next\.x, y: next\.y \}\)\)\} \/>\}/, 'no second desktop minimap');
  assert.match(read('CanvasMinimap.jsx'), /className="relative overflow-hidden rounded-xl/, 'its frame is in the strip\'s flow');
});

// Owner, 2026-10-13: "the icon to hide the main chat composer, should be better placed and not hanging above". It is the composer's
// own icon button in its own row (ChatComposer.jsx, through the canvas's ComposerHide context), not a pill the canvas positions
// from outside over the composer's top border. e2e/canvas-shell-check.mjs measures that it lies inside the composer.
test('Hide chat composer is a button in the composer row, before Send, not a pill hanging over its border', () => {
  const composer = read('ChatComposer.jsx');
  assert.match(composer, /export const ComposerHide = createContext\(null\);/);
  assert.match(composer, /data-composer-hide aria-label="Hide chat composer" title="Hide chat composer - your draft stays" onClick=\{hide\} className=\{COMPOSER_ADD\}><ChevronDown size=\{14\} strokeWidth=\{1\.5\} \/>/);
  assert.match(composer, /\{trailing\}\n\s+\{dock && <ComposerHideButton \/>\}\n\s+\{send\}/, 'in the row, after the field and before Send');
  assert.match(composer, /const send = voice \? null : busy && onStop \?/);
  assert.match(canvas, /<ComposerHide\.Provider value=\{hideComposer\}>\{composer\}<\/ComposerHide\.Provider>/);
  assert.doesNotMatch(canvas, /data-composer-hide|absolute -top-2\.5 right-4/, 'the canvas no longer positions the button over the composer');
});

// Owner, 2026-10-08: "in the canvas above the chat composer you are cutting the canvas too much". The canvas runs to the
// bottom and the strip floats over it; chrome may float over the canvas but never hides what the learner cannot reach.
test('the bottom strip floats: the canvas runs to the bottom, the strip lets the pointer through, only its controls take it', () => {
  assert.match(canvas, /<div data-canvas-bottom ref=\{bottomStrip\} className=\{`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 md:flex-row md:items-end md:gap-3 \$\{DOCK_PAD\} \[&>\*>\*\]:pointer-events-auto`\}>/);
  assert.doesNotMatch(canvas, /data-canvas-bottom[^\n]*shrink-0/, 'no band of its own under the canvas');
  // The side columns' heights reach what must clear them: the Voice caption and the tools' gutter on that side.
  assert.match(canvas, /host\.style\.setProperty\('--chrome-left', `\$\{Math\.max\(0, bottom - strip\.firstElementChild\.getBoundingClientRect\(\)\.top\)\}px`\);/);
  assert.match(canvas, /host\.style\.setProperty\('--chrome-right', `\$\{Math\.max\(0, bottom - strip\.lastElementChild\.getBoundingClientRect\(\)\.top\)\}px`\);/);
  assert.match(canvas, /'left-0 items-start pl-2 pb-\(--chrome-left\) /);
  assert.match(canvas, /'right-\(--edge\) items-end pr-2 pb-\(--chrome-right\) /);
  assert.match(canvas, /parseFloat\(getComputedStyle\(bar\.parentElement\)\.paddingBottom \|\| 0\)/, 'the tools\' room leaves the column out');
  // A phone (UI-19, owner 2026-10-21): the tools stay the same left column, padded clear of the floating strip's left column.
  assert.doesNotMatch(canvas, /@max-\[640px\]:(order-first|pb-0|grid|w-full)\b/);
});

test('fit, focus and a new card stop above the floating chrome over their span (a bottom inset); panning still reaches it', () => {
  assert.match(canvas, /const chromeTop = \(x0, x1\) => \{[\s\S]*?querySelectorAll\('\[data-canvas-bottom\] > \* > \*'\) \|\| \[\]\)\]\.flatMap\(boxesIn\)[\s\S]*?rect\.left - at\.left < x1 && rect\.right - at\.left > x0[\s\S]*?\.map\(rect => rect\.top - at\.top\)\);\n  \};/);
  // The composer's root is display: contents: it counts by its children.
  assert.match(canvas, /const boxesIn = node => \{ const rect = node\.getBoundingClientRect\(\); return rect\.width \|\| rect\.height \? \[rect\] : \[\.\.\.node\.children\]\.flatMap\(boxesIn\); \};/);
  // frame (zoom to fit, zoom to selection, presenting, a section): fit to the height above the chrome, inside what the
  // floating toolbar and header leave (controlArea, owner 2026-10-22).
  assert.match(canvas, /const h = Math\.min\(area\.bottom, chromeTop\(across\(z\) \+ left \* z, across\(z\) \+ right \* z\)\) - area\.top;\n\s+z = fit\(h\);/);
  assert.match(canvas, /y: area\.top \+ \(height \+ pad \* 2 < h \? \(h - height\) \/ 2 : pad\) - top \* z,/);
  // showBox (a new or revealed card): the chrome over the card's span is a floor.
  assert.match(canvas, /const floor = chromeTop\(first\.x \+ box\.x \* current\.z, first\.x \+ \(box\.x \+ box\.w\) \* current\.z\) - 24;/);
  // centerOn (an asked card): centred above the chat sheet and the chrome.
  assert.match(canvas, /const h = Math\.max\(120, Math\.min\(open, chromeTop\(x \+ box\.x \* v\.z, x \+ \(box\.x \+ box\.w\) \* v\.z\)\) - area\.top\);/);
  // insertBlock: the new block's top in view above the chrome.
  assert.match(canvas, /y: Math\.min\(v\.y, chromeTop\(v\.x, v\.x \+ COLUMN \* v\.z\) - 280 - /);
});

// Owner, 2026-10-22: fit, reveal and new-card placement avoid the floating controls' ACTUAL rectangles, measured, never a
// constant gutter; the opening camera is compensated (canvas-slots homeView) so saved boards do not jump.
test('fit, reveal, placement and the opening camera keep clear of the measured toolbar, navigator and header', () => {
  assert.match(canvas, /const controlRects = \(\) => \{[\s\S]*?gutter\.current\?\.querySelectorAll\('\[role="toolbar"\], \[data-gutter-top\] > \*'\)[\s\S]*?pageHeader\(\)\?\.children[\s\S]*?getBoundingClientRect\(\)/);
  assert.match(canvas, /const controlArea = \(\) => freeArea\(\{ w: surface\.current\.clientWidth, h: surface\.current\.clientHeight \}, controlRects\(\), 0\);/);
  assert.match(canvas, /const visibleArea = \(\) => \{[\s\S]*?overlays\.push\(\.\.\.controlRects\(\)\);/, 'reveal, search and placement in view (visibleWorld) read visibleArea');
  assert.match(canvas, /const area = controlArea\(\), w = area\.right - area\.left;/, 'fit');
  assert.equal(canvas.match(/homeView\(controlArea\(\), COLUMN\)/g).length, 3, 'the opening camera, zoomReset and the Reset zoom button');
  assert.doesNotMatch(canvas, /Math\.max\(24, \(surface\.current\.clientWidth - COLUMN\) \/ 2\)/, 'no camera centred on the whole surface under the tools');
  assert.match(page, /data-canvas-header className=\{`\$\{headerOver \? 'pointer-events-none absolute inset-x-0 top-0 z-40 \[&>\*\]:pointer-events-auto' : 'relative shrink-0'\}/, 'the header floats over the canvas');
  assert.match(page, /expanded-page-frame @container\/frame relative /);
});

// UI-17 (owner, 2026-10-21): from a 784 px canvas row the map kept a full-height 92 px column right of the drawing surface
// (overflow hidden), so the surface ended 92 px short of the panel and cut cards there. The row's widths, read from the source
// (the tools column's class, the map column's class and its mapBeside rule), must leave the surface running to the panel edge.
// Owner, 2026-10-22: the tools column floats (absolute), so it takes none of the row either.
const COLUMN = Number(/const COLUMN = (\d+);/.exec(canvas)[1]);
const rowOf = width => {
  const floating = /data-tool-gutter[\s\S]{0,400}className=\{`pointer-events-none absolute /.test(canvas);
  const tools = floating ? 0 : Number(/pb-\(--chrome-left\) w-\[(\d+)px\]'/.exec(canvas)[1]);
  const column = /<div data-dive-gutter className=\{`[^`]*\bw-\[(\d+)px\]/.exec(canvas);
  const rule = /const mapBeside = !shellWidth \|\| shellWidth - (\d+) - (\d+) >= COLUMN \+ (\d+);/.exec(canvas);
  const map = column && (!rule || width - Number(rule[1]) - Number(rule[2]) >= COLUMN + Number(rule[3])) ? Number(column[1]) : 0;
  return { tools, map, surface: width - tools - map, strip: map };
};
// UI-19 (owner, 2026-10-21): the tools stay one vertical column on the left at every panel width, and the canvas has one
// minimap, lower left above the zoom row, shown as View > Minimap says - no Show/Hide overview button, no narrow strip.
test('UI-19: one vertical tools column at every width, one minimap, no overview toggle', () => {
  const toolbar = /<div ref=\{toolbarRef\} role="toolbar" aria-label="Canvas tools"[\s\S]*?className=\{`([^`]*)`\}>/.exec(canvas);
  assert.ok(toolbar, 'the Canvas tools toolbar');
  assert.match(toolbar[1], /\bgrid-cols-2\b/, 'two tools per row: a vertical palette');
  assert.doesNotMatch(toolbar[1], /@max-\[|grid-flow-col|col-start/, 'no narrow-width strip variant on the toolbar');
  const gutter = canvas.slice(canvas.indexOf('<div ref={gutter} data-tool-gutter'), canvas.indexOf('{/* Presenting replaces the zoom pill'));
  // The Rabbit Hole Map slot (data-gutter-top) keeps its own narrow rule (UI-17, settled); nothing else in the gutter has one.
  assert.equal(gutter.match(/@max-\[640px\]|@min-\[641px\]/g)?.length || 0, 1, 'only the map slot has a narrow-width rule');
  assert.doesNotMatch(gutter, /grid-flow-col|col-start|col-span-3/, 'no narrow strip layout in the tools gutter');
  assert.doesNotMatch(canvas, /Show overview|Hide overview|setOverview|overviewOpen/, 'no separate overview toggle or state');
  assert.equal(canvas.match(/<CanvasMinimap /g).length, 1, 'one canvas minimap');
  assert.match(canvas, /<div className="flex min-h-0 flex-1">/, 'the canvas row never stacks the tools under the canvas');
  assert.match(canvas, /const \[minimap, setMinimap\] = useState\(\(\) => uiPrefs\(\)\.minimap\);/, 'the View menu\'s persisted choice owns it');
});

// UI-19 follow-up (integrator, 2026-10-21: controls must not obstruct cards): now that the minimap shows at every width, it
// must count as floating chrome everywhere a card is fitted, revealed or placed. Those all read the bottom strip's
// grandchildren (chromeTop for fit/focus/reveal, placementChrome for an insert in view), so the minimap must sit inside one:
// the zoom stack, a direct child of the strip's first column, with the minimap inside it.
test('UI-19: the minimap is floating chrome for fit, reveal and placement (a grandchild of the bottom strip)', () => {
  const strip = canvas.slice(canvas.indexOf('<div data-canvas-bottom'));
  const column = strip.slice(strip.indexOf('\n') + 1, strip.indexOf('<div data-zoom-stack'));
  assert.match(column, /^\s+<div className="flex items-end gap-2 md:min-w-fit md:flex-1 md:basis-0">\n/, 'the strip\'s first column opens first');
  assert.equal((column.match(/<div\b/g) || []).length, 1, 'the zoom stack is a direct child of that column (a strip grandchild)');
  assert.match(strip, /<div data-zoom-stack className="flex w-fit flex-col items-stretch gap-2">\n\s+\{minimap && <div data-canvas-minimap>/, 'the minimap is inside the zoom stack, so its box is the stack\'s');
  assert.match(canvas, /const chromeTop = \(x0, x1\) => \{[\s\S]*?querySelectorAll\('\[data-canvas-bottom\] > \* > \*'\)/, 'fit, focus and reveal stop above every strip grandchild');
  assert.match(canvas, /const placementChrome = \(\) => \{[\s\S]*?strip\.querySelectorAll\(':scope > \* > \*'\)/, 'a card placed in view keeps clear of every strip grandchild');
});

test('the canvas row: the drawing surface runs from the outer edge to the panel edge at every width, no map or tools column (UI-17; owner 2026-10-22)', () => {
  for (const width of [628, 712, 783, 784, 1032, 1180]) {
    const row = rowOf(width);
    assert.deepEqual(row, { tools: 0, map: 0, surface: width, strip: 0 }, `${width} px row: ${JSON.stringify(row)}`);
  }
});

test('the Rabbit Hole navigator sits at the top of the tools gutter on either side, hidden (never unmounted) when off', () => {
  assert.doesNotMatch(canvas, /data-dive-gutter className/, 'no map column of its own');
  assert.doesNotMatch(canvas, /mapBeside/);
  // View > Rabbit Hole Map off (owner brief 2026-10-21 item 3): hidden, never unmounted.
  // Owner decision 2026-10-22: the slot's own padding (pt-3, pt-12 in dev) is no band: only the map inside it takes the pointer.
  // Important (!): the tools column's own `[&>*]:pointer-events-auto` also matches this slot, at the same specificity and emitted later
  // than a plain pointer-events-none, so without it the slot's padding stayed a band (gate 39830037683 and 39834718527, 4 of 39 probes).
  assert.match(canvas, /<div data-gutter-top className=\{`pointer-events-none! mb-auto [^\n]*\[&>\*\]:pointer-events-auto /);
  assert.match(canvas, /<div data-gutter-top [^\n]*>\n(?:[^\n]*\n){2}\s+\{gutterTop && <div className=\{holeMap \? undefined : 'hidden'\}>\{gutterTop\}<\/div>\}/);
  assert.match(page, /gutterTop=\{dive\.tree \? <DiveNavigator \{\.\.\.dive\.navigator\} \/> : null\}/);
});

// Owner brief 2026-10-21 item 3: View lists Minimap, Rabbit Hole Map and Curious as three identical switch rows (one shape, one
// switch component), each saved on this device (ui-prefs.js) through the canvas's showWidget; the browser run is
// e2e/view-menu-check.mjs.
test('View: three identical switch rows for the minimap, the Rabbit Hole Map and Curious, remembered on this device', () => {
  const rows = [...read('canvas-menus.js').matchAll(/\{ label: '([^']+)', icon: \w+, toggle: canvasState\.(\w+), onToggle: on => canvas\(\)\?\.showWidget\('(\w+)', on\) \}/g)];
  assert.deepEqual(rows.map(row => [row[1], row[2], row[3]]), [['Minimap', 'minimap', 'minimap'], ['Rabbit Hole Map', 'holeMap', 'holeMap'], ['Curious', 'curious', 'curious']]);
  const bar = read('CanvasMenubar.jsx');
  assert.match(bar, /<Toggle on=\{item\.toggle\} onChange=\{item\.onToggle\} aria-label=\{item\.label\} \/>/);
  assert.doesNotMatch(bar.slice(bar.indexOf('item.toggle !== undefined'), bar.indexOf('item.choice ?')), /setOpen\(null\)/, 'a switch keeps the menu open');
  assert.match(canvas, /const \[minimap, setMinimap\] = useState\(\(\) => uiPrefs\(\)\.minimap\);\n\s+const \[holeMap, setHoleMap\] = useState\(\(\) => uiPrefs\(\)\.holeMap\);\n\s+const \[curious, setCurious\] = useState\(\(\) => uiPrefs\(\)\.curious\);/);
  assert.match(canvas, /try \{ saveUiPref\(name, on\); \}/);
});

test('every Learn level renders the same shell: a pending or nested hole is the same LearnSurface', () => {
  assert.match(page, /\{hole \? <LearnSurface key=\{hole\.name\} app=\{holeApp\(props\.app, hole\)\} hole=\{hole\} \/> : <LearnSurface \{\.\.\.props\} \/>\}<\/ChatWorkspaceProvider>;/);
});

test('Learn keeps no persistent app rail: the immersive shell hides the sidebar', () => {
  assert.match(shell, /immersive \? 'hidden'/);
});
