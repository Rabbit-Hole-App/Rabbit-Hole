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
  assert.match(canvas, /className=\{`pointer-events-none absolute top-\[var\(--canvas-top,0px\)\] bottom-0 z-20 flex flex-col justify-center-safe gap-2 \[&>\*\]:pointer-events-auto \$\{toolSide === 'left' \? 'left-0 /, 'absolute over the surface, below the header, the pointer through');
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
  assert.match(strip, /<div data-zoom-stack className="flex w-fit flex-col items-stretch gap-2">\n\s+\{drawnWidgets.minimap && !minimapFolded && <div data-canvas-minimap>\n\s+<CanvasMinimap [\s\S]*?<\/div>\}\n\s+<div data-zoom /, 'one group: the minimap panel above the one pill (feedback | map | zoom), owner 2026-11-15');
  assert.ok(strip.indexOf('data-canvas-minimap') < strip.indexOf('data-canvas-composer') && strip.indexOf('data-canvas-composer') < strip.indexOf('data-canvas-lower-right'), 'minimap left, composer, hooks right');
  assert.match(strip, /md:grid [\s\S]*?md:items-end/, 'one lower edge: the hooks\' bottom is the composer\'s; three grid columns, the two side ones equal, so the composer is centred (owner 2026-11-15)');
  // On a phone the hooks sit above the composer, at the right.
  assert.match(strip, /data-canvas-composer data-composer-hidden=\{composerHidden \? '' : undefined\} className=\{`\$\{DOCK_WIDTH\} relative min-w-0 md:col-start-2 md:mx-0 max-md:order-2 \$\{composerHidden \? 'hidden' : ''\}`\}/);
  assert.match(strip, /data-canvas-lower-right className="flex items-end justify-end gap-2 md:col-start-3 max-md:order-1"/);
  assert.doesNotMatch(canvas.slice(0, canvas.indexOf('<div data-canvas-bottom')), /<CanvasMinimap boxes=\{minimapBoxes\} view=\{view\} onFit=\{zoomFit\}\n\s+surface=\{\{ w: surface\.current\?\.clientWidth \|\| 0, h: surface\.current\?\.clientHeight \|\| 0 \}\}\n\s+onView=\{next => setView\(v => \(\{ \.\.\.v, x: next\.x, y: next\.y \}\)\)\} \/>\}/, 'no second desktop minimap');
  assert.match(read('CanvasMinimap.jsx'), /className="relative overflow-hidden rounded-xl/, 'its frame is in the strip\'s flow');
});

// Owner 2026-11-13: Add to chat and Quick Edit on a card that is only hovered did nothing. The hover row selects the card and unmounts, and it then ran its own copy of the action,
// made before the selection existed; the action reads the selection, so it saw none. It must run the newest handler, after the canvas re-rendered with the card selected.
test('the hover row selects the card, waits for the re-render, then runs the NEWEST action (never its own stale copy)', () => {
  const actions = read('SelectionActions.jsx');
  assert.match(actions, /freshest = value;/, 'the provider publishes its newest value on every render');
  assert.match(actions, /const act = name => \{ select\(id\); requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => freshest\?\.\[name\]\?\.\(\)\)\); \};/);
  assert.doesNotMatch(actions.slice(actions.indexOf('export function HoverActions'), actions.indexOf('A host row')), /latest\.current/, 'no copy held from before the selection');
});

// Owner 2026-11-13: a card added to the canvas folds the chat window away so the learner can focus on the card; the command's own
// "Working on /name" pill is gone because the chat already shimmers while it works.
test('adding a card folds the chat window: the page announces a card count that grew after the board loaded, the window listens', () => {
  const page = read('LearnPage.jsx'), ask = read('ask.jsx');
  assert.match(page, /if \(cardCount\.current != null && count > cardCount\.current\) window\.dispatchEvent\(new Event\('rh-card-added'\)\);/);
  assert.match(page, /if \(restoredBoard !== boardPath\) return;\n\s+const count = \(canvasState\.cards \|\| \[\]\)\.length;/, 'the board\'s own load is the baseline, not a new card');
  // The effect reads restoredBoard and boardPath, so it must come after their declarations: above them it is a ReferenceError and the page cannot load.
  assert.ok(page.indexOf('const cardCount = useRef(null);') > page.indexOf('const boardPath = `/api/learn/boards/'), 'the card-count effect is below the declarations it reads');
  assert.ok(page.indexOf('const cardCount = useRef(null);') > page.indexOf('const [restoredBoard, setRestoredBoard] = useState(null);'));
  assert.match(ask, /window\.addEventListener\('rh-card-added', fold\);/);
  assert.match(ask, /const fold = \(\) => setWinState\('min'\);/);
  assert.doesNotMatch(read('LearnSlash.jsx'), /Working on \/\$\{name\}/, 'no Working on pill under the reply');
});

// Owner, 2026-11-13 (replaces the 2026-10-13 in-composer hide icon): the canvas's bottom chat strip has its Minimize as a round
// button outside the composer, on its left; minimized, the strip is the Rabbit Hole mark on black at the lower right, and the last choice
// lasts for the visit only: every canvas opens with the strip active (owner 2026-11-14). The canvas no longer gives the composer a ComposerHide context, so the composer's
// own Hide icon (ChatComposer.jsx) never shows in it.
test('the chat strip: the Chat\'s own composer as a pill, a small round Minimize on its top-left corner, the Rabbit Hole button at the lower right, every canvas opening with it active', () => {
  assert.match(canvas, /const \[composerHidden, setComposerHidden\] = useState\(false\);/, 'open by default on every canvas, whatever an earlier canvas was left at');
  assert.doesNotMatch(canvas, /saveUiPref\('chatStrip'|uiPrefs\(\)\.chatStrip/, 'a minimize is not carried to the next canvas');
  assert.doesNotMatch(canvas, /ComposerHide\.Provider/);
  const strip = canvas.slice(canvas.indexOf('<div data-canvas-bottom'));
  assert.match(strip, /\{\/\*[^\n]*\*\/\}\n\s+\{hooks && <div data-hooks-slot[^\n]*\n\s+\{composer\}/, 'the three Curious pills, then the composer');
  // Minimize is the last button of the one tools pill inside the chat box (ChatComposer, owner 2026-11-15); it tells the canvas by an event.
  assert.match(read('ChatComposer.jsx'), /\{onMinimize && <button type="button" data-composer-hide aria-label="Minimize chat composer"[^\n]*onClick=\{onMinimize\}\n\s+className=\{COMPOSER_TOOL\}><ChevronsDown/);
  assert.match(read('ask.jsx'), /onMinimize=\{stripMode \? \(\) => window\.dispatchEvent\(new Event\('rh-strip-minimize'\)\) : null\}/);
  assert.match(canvas, /window\.addEventListener\('rh-strip-minimize', hideComposer\)/);
  assert.match(read('ask.jsx'), /className=\{cn\('relative shrink-0', stripMode \? 'w-full' : 'mt-2', !compact && !stripMode && 'sticky bottom-0 bg-white pt-1 pb-2'\)\}/, 'in the strip nothing behind the pill is opaque: no sticky white band clipping the canvas');
  assert.match(strip, /\{composer && composerHidden && <button type="button" data-composer-show aria-label="Show chat composer"/);
  assert.match(strip, /bg-black[^\n]*<img src="\/static\/rabbit-hole-white-on-black-128\.png"/, 'white mark on black, under /static, the one public path the workers serve for it');
  assert.ok(strip.indexOf('data-hooks-slot') < strip.indexOf('data-composer-show'), 'beside the Curious card, at the lower right');
  const page = read('LearnPage.jsx'), ask = read('ask.jsx'), composer = read('ChatComposer.jsx');
  assert.match(page, /composer=\{panelOpen \? null : <div ref=\{setStripHost\} data-canvas-chat-strip \/>\}/, 'only while the right panel is closed');
  assert.match(page, /hooks=\{steps && !panelOpen \? <NextStepsCard/, 'Curious leaves with it');
  assert.match(page, /const chatAskProps = \{ stripHost,/);
  assert.match(page, /<ResizableSidePanel aria-label="Learn agent chat"[^\n]*keepMounted collapsed=\{!panelOpen\}/, 'the Chat stays mounted while closed, so its composer can be the strip');
  // One composer, not a second one: the Chat's AskPanel moves its own composer region between its slot and the strip host.
  assert.match(ask, /const stripMode = !!\(stripHost && chat && !tocView\);/);
  assert.match(ask, /where\.appendChild\(regionHost\)/);
  assert.match(ask, /\{createPortal\(composerRegion, regionHost\)\}/);
  assert.match(ask, /dock=\{dock \|\| stripMode\}/);
  assert.match(ask, /stacked=\{!!chat && !stripMode\} pill=\{stripMode\}/, 'a pill with the same tools, not the stacked box');
  // Owner 2026-11-13: Send from the strip no longer opens the panel; a small fixed-height window above the strip holds the conversation.
  assert.doesNotMatch(ask, /if \(stripMode\) chat\.panels\.openChat\(\);/, 'Send leaves the panel closed');
  assert.match(ask, /if \(stripMode\) \{ setWindowSeen\(true\); setWinState\(state => \(state === 'min' \? 'normal' : state\)\); \}/, 'Send opens the window (and restores a minimized one)');
  assert.match(ask, /const windowMode = stripMode && !!windowHost && windowSeen;/);
  assert.match(ask, /where\.appendChild\(convHost\)/);
  assert.match(ask, /\{createPortal\(conversationRegion, convHost\)\}/, 'the conversation moves into the window without remounting');
  assert.match(ask, /winState === 'normal' && 'h-80 max-h-\[55vh\]'/, 'fixed height');
  assert.match(ask, /data-chat-window-minimize aria-label="Minimize chat"/);
  assert.match(ask, /winState === 'min' && 'hidden'\)\}>/, 'minimized, the window is gone completely');
  assert.match(ask, /data-chat-window-toggle label=\{winState === 'min' \? 'Show chat' : 'Hide chat'\}/, 'the strip\'s chat button brings it back');
  assert.match(ask, /trailing=\{stripMode \? <>\{curiousButton\}\{chatWindowButton\}<\/> : dock \|\| chat \? null : chatControl\}/, 'the two view buttons are in the one tools pill inside the chat box');
  assert.match(composer, /if \(pill\) return <form data-chat-composer data-composer-pill[\s\S]*?<div data-composer-tools className="flex shrink-0 items-center gap-0\.5 rounded-full border border-line bg-white p-0\.5 shadow-sm">\n\s+\{leading\}\s+\{trailing\}[\s\S]*?<\/div>\s+\{body\}\s+\{send\}\s+<\/form>/, 'the tools and Minimize are one white pill inside the chat box at its left, before the field and Send');
  assert.match(ask, /data-chat-window-maximize aria-label=\{winState === 'max' \? 'Restore chat size' : 'Maximize chat'\}/);
  assert.match(page, /chatWindow=\{panelOpen \? null : <div ref=\{setWindowHost\} data-canvas-chat-window className="empty:hidden" \/>\}/);
  assert.match(canvas, /\{chatWindow\}\n\s+\{\/\*[^\n]*\n\s+\{hooks && <div data-hooks-slot/, 'above the suggestions and the composer');
  assert.match(composer, /rounded-full py-2 pr-2\.5 pl-2.5/, 'round on both sides');
  assert.doesNotMatch(read('ChatComposer.jsx'), /data-canvas-strip-composer/, 'never a second composer element');
});

// Owner, 2026-10-08: "in the canvas above the chat composer you are cutting the canvas too much". The canvas runs to the
// bottom and the strip floats over it; chrome may float over the canvas but never hides what the learner cannot reach.
test('the bottom strip floats: the canvas runs to the bottom, the strip lets the pointer through, only its controls take it', () => {
  assert.match(canvas, /<div data-canvas-bottom ref=\{bottomStrip\} className=\{`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 md:grid \$\{chromeOff \? 'md:grid-cols-\[minmax\(0,1fr\)_minmax\(200px,780px\)_minmax\(0,1fr\)\]' : 'md:grid-cols-\[minmax\(264px,1fr\)_minmax\(200px,780px\)_minmax\(264px,1fr\)\]'\} md:items-end md:gap-3 \$\{DOCK_PAD\} \[&>\*>\*\]:pointer-events-auto`\}>/);
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
  assert.match(canvas, /const controlRects = \(\) => \{[\s\S]*?gutter\.current\?\.querySelectorAll\('\[role="toolbar"\], \[data-gutter-top\] > \*'\)[\s\S]*?getBoundingClientRect\(\)/);
  // Owner 2026-10-29: the opaque header band counts whole and 32 px deeper, so a first-row card's own row of controls (and the
  // floating bar) stand below it, never moved over other content (fast-e2e 40845874842, 40850976588, 40853973678).
  assert.match(canvas, /found = pageHeader\(\);\s*const header = found && getComputedStyle\(found\)\.position === 'absolute' \? found : null;/);
  assert.match(canvas, /bottom: rect\.bottom - frame\.top \+ \(node === header \? BAND_ROOM : 0\)/);
  // The canvas checks (canvas-chrome, canvas-skeleton, canvas-toolbar) import the same value, never a copy of it.
  assert.match(read('canvas-slots.js'), /export const BAND_ROOM = 32;/);
  for (const check of ['canvas-chrome-check.mjs', 'canvas-skeleton-check.mjs', 'canvas-toolbar-check.mjs']) {
    assert.match(readFileSync(new URL(`../e2e/${check}`, import.meta.url), 'utf8'), /import \{[^}]*BAND_ROOM[^}]*\} from '\.\.\/src\/canvas-slots\.js';/, check);
  }
  assert.match(canvas, /const controlArea = \(\) => freeArea\(\{ w: surface\.current\.clientWidth, h: surface\.current\.clientHeight \}, controlRects\(\), 0\);/);
  assert.match(canvas, /const visibleArea = \(\) => \{[\s\S]*?overlays\.push\(\.\.\.controlRects\(\)\);/, 'reveal, search and placement in view (visibleWorld) read visibleArea');
  assert.match(canvas, /const area = controlArea\(\), w = area\.right - area\.left;/, 'fit');
  assert.equal(canvas.match(/homeView\(controlArea\(\), COLUMN\)/g).length, 3, 'the opening camera, zoomReset and the Reset zoom button');
  assert.doesNotMatch(canvas, /Math\.max\(24, \(surface\.current\.clientWidth - COLUMN\) \/ 2\)/, 'no camera centred on the whole surface under the tools');
  // The header's classes are CanvasLoading.jsx's, shared with the loading skeleton (owner brief 2026-10-23).
  assert.match(page, /data-canvas-header className=\{`\$\{headerOver \? OWNER_HEADER_OVER : 'relative shrink-0'\}/, 'the header floats over the canvas');
  // Owner 2026-10-29: an opaque band in the canvas colour that takes the pointer; no card shows between the title and the menus.
  assert.match(read('CanvasLoading.jsx'), /export const OWNER_HEADER_OVER = 'absolute inset-x-0 top-0 z-40 bg-white';/, 'the header floats over the canvas as an opaque band');
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
  assert.match(canvas, /const \[minimapPref, setMinimapPref\] = useState\(\(\) => uiPrefs\(\)\.minimap\);/, 'the View menu\'s persisted choice owns it (Study shows it through effectiveWidgets)');
});

// UI-19 follow-up (integrator, 2026-10-21: controls must not obstruct cards): now that the minimap shows at every width, it
// must count as floating chrome everywhere a card is fitted, revealed or placed. Those all read the bottom strip's
// grandchildren (chromeTop for fit/focus/reveal, placementChrome for an insert in view), so the minimap must sit inside one:
// the zoom stack, a direct child of the strip's first column, with the minimap inside it.
test('UI-19: the minimap is floating chrome for fit, reveal and placement (a grandchild of the bottom strip)', () => {
  const strip = canvas.slice(canvas.indexOf('<div data-canvas-bottom'));
  const column = strip.slice(strip.indexOf('\n') + 1, strip.indexOf('<div data-zoom-stack'));
  assert.match(column, /^\s+<div className="flex items-end gap-2 md:col-start-1">\n/, 'the strip\'s first column opens first');
  assert.equal((column.match(/<div\b/g) || []).length, 1, 'the zoom stack is a direct child of that column (a strip grandchild)');
  assert.match(strip, /<div data-zoom-stack className="flex w-fit flex-col items-stretch gap-2">\n\s+\{drawnWidgets.minimap && !minimapFolded && <div data-canvas-minimap>/, 'the minimap is inside the zoom stack, so its box is the stack\'s');
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
  assert.match(canvas, /<div data-gutter-top [^\n]*>\n(?:[^\n]*\n){2}\s+\{gutterTop && <div className=\{drawnWidgets\.holeMap \? undefined : 'hidden'\}>\{gutterTop\}<\/div>\}/);
  assert.match(page, /gutterTop=\{dive\.tree \? <DiveNavigator \{\.\.\.dive\.navigator\} \/> : null\}/);
});

// Owner brief 2026-10-21 item 3, replaced by the 2026-10-22 canvas-menu redesign (item 6): View > Show / hide lists Toolbar, Right panel,
// Minimap, Rabbit Hole Map, Comment pins and Learning suggestions as labelled checked rows, each driving the state that already shows
// or hides the thing, and the widgets remembered on this device (ui-prefs.js) through the canvas's showWidget; the browser run is
// e2e/view-menu-check.mjs.
test('View > Show / hide: checked rows for the toolbar, minimap, Rabbit Hole Map and Learning suggestions, remembered on this device', () => {
  const menus = read('canvas-menus.js');
  const rows = [...menus.matchAll(/checkRow\('([^']+)', .+?, (?:widget\('(\w+)'\)|([\w.]+))\)/g)];
  assert.deepEqual(rows.map(row => [row[1], row[2] || row[3]]), [['Toolbar', 'toolbar'], ['Right panel', 'panel.setOpen'], ['Minimap', 'minimap'], ['Rabbit Hole Map', 'holeMap'], ['Comment pins', 'comments.setPins'], ['Learning suggestions', 'curious']]);
  assert.ok(menus.includes('const widget = name => on => canvas()?.showWidget(name, on);'));
  const bar = read('CanvasMenubar.jsx');
  assert.ok(bar.includes("if (kind === 'menuitemcheckbox') { item.onToggle(!item.check); return; }"), 'a check row flips in place and keeps the menu open');
  assert.match(canvas, /const \[minimapPref, setMinimapPref\] = useState\(\(\) => uiPrefs\(\)\.minimap\);\n\s+const \[holeMapPref, setHoleMapPref\] = useState\(\(\) => uiPrefs\(\)\.holeMap\);\n\s+const \[curious, setCurious\] = useState\(\(\) => uiPrefs\(\)\.curious\);/);
  assert.ok(canvas.includes('const [toolbar, setToolbar] = useState(() => uiPrefs().toolbar);'));
  assert.ok(canvas.includes('{!readOnly && toolbarShown && <div ref={toolbarRef} role="toolbar"'), 'the toolbar draws only while it is on');
  assert.ok(canvas.includes('const toolbarShown = toolbarDrawn(toolbar, '), 'drawn from the saved choice, never written by Study or Focus');
  assert.match(canvas, /try \{ saveUiPref\(name, on\); \}/);
});

test('every Learn level renders the same shell: a pending or nested hole is the same LearnSurface', () => {
  assert.match(page, /\{hole \? <LearnSurface key=\{hole\.name\} app=\{holeApp\(props\.app, hole\)\} hole=\{hole\} \/> : <LearnSurface \{\.\.\.props\} \/>\}<\/ChatWorkspaceProvider>;/);
});

test('Learn keeps no persistent app rail: the immersive shell hides the sidebar', () => {
  assert.match(shell, /immersive \? 'hidden'/);
});
