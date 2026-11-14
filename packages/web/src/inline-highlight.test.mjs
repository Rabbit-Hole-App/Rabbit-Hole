// Owner 2026-11-09 Ctrl+K over highlighted words: the chip's first words, the card text locator, the scrim path, the /explain context (question's words + the card), the beside placement
// level with the highlighted line, and the wiring pins (source-level, as the repo's other editor tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstWords, locate, scrimPath, settleRects, cardContext, contextMessage, explainContext, BODY_CAP } from './inline-highlight.js';
import { besideSpot } from './beside-placement.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the chip shows the first 2-3 words, at most 24 characters, the ellipsis inside the chip', () => {
  assert.equal(firstWords('maximum likelihood estimation of the parameters'), 'maximum likelihood esti…', 'three words, cut to 23 characters plus the ellipsis');
  assert.equal(firstWords('maximum likelihood'), 'maximum likelihood');
  assert.equal(firstWords('  a   b  c  d  '), 'a b c…');
  assert.ok(firstWords('internationalization-of-everything and more').length <= 25);
  assert.equal(firstWords('internationalization-of-everything and more'), 'internationalization-of…');
  assert.equal(firstWords(''), '');
});

test('locate maps single-spaced words back to the card text across line breaks', () => {
  const whole = 'Title line\n\nBayes rule\nupdates a prior with evidence.';
  const at = locate(whole, 'rule updates a prior');
  assert.deepEqual(at, { from: whole.indexOf('rule'), to: whole.indexOf('prior') + 'prior'.length });
  assert.equal(whole.slice(at.from, at.to), 'rule\nupdates a prior');
  assert.equal(locate(whole, 'not in the card'), null);
  assert.equal(locate(whole, '   '), null);
});

test('the scrim is one even-odd path: the surface, then one hole per line of the highlighted words', () => {
  const path = scrimPath({ w: 800, h: 600 }, [{ left: 100, top: 50, width: 80, height: 18 }, { left: 40, top: 70, width: 120, height: 18 }]);
  assert.match(path, /^path\(evenodd, "M0 0H800V600H0z/);
  assert.equal((path.match(/M/g) || []).length, 3);
});

test('the whole card is the context: id, type, title, prose with [visual n], each diagram\'s saved spec, each picture\'s prompt, alt and caption, questions and terms, the highlighted words flagged', () => {
  const diagram = { version: 1, diagram: { kind: 'flow', title: 'Light and dark reactions', nodes: [{ id: 'a', label: 'Absorb sunlight', role: 'process' }, { id: 'b', label: 'Fix carbon', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
  const picture = { id: 'p1', prompt: 'A cutaway of a chloroplast showing thylakoid stacks', alt: 'Chloroplast cutaway', caption: 'Look at the stacked discs' };
  const block = { id: 'card-1', type: 'explanation', title: 'Photosynthesis', body: ['Plants turn light into sugar.', '```rh-diagram\n' + JSON.stringify(diagram) + '\n```', 'Chlorophyll absorbs sunlight.', '```rh-illustration\n' + JSON.stringify(picture) + '\n```', 'The sugar feeds the plant.'].join('\n\n'),
    interactions: { questions: [{ id: 'q1', text: 'Why is chlorophyll green?' }], terms: [{ id: 't1', label: 'chlorophyll' }] } };
  const card = cardContext(block, '  Chlorophyll\n absorbs   sunlight ');
  assert.equal(card.cardId, 'card-1');
  assert.equal(card.cardType, 'explanation');
  assert.equal(card.title, 'Photosynthesis');
  assert.equal(card.highlighted, 'Chlorophyll absorbs sunlight');
  assert.match(card.body, /Plants turn light into sugar\.\n\n\[visual 1\]\n\nChlorophyll absorbs sunlight\.\n\n\[visual 2\]\n\nThe sugar feeds the plant\./);
  assert.equal(card.visuals.length, 2);
  assert.deepEqual(card.visuals[0], { kind: 'diagram', spec: diagram.diagram });
  assert.deepEqual(card.visuals[1], { kind: 'picture', prompt: picture.prompt, alt: picture.alt, caption: picture.caption });
  assert.deepEqual(card.questions, ['Why is chlorophyll green?']);
  assert.deepEqual(card.terms, ['chlorophyll']);
  const message = contextMessage(card);
  assert.ok(message.startsWith('The learner highlighted these words in this card: "Chlorophyll absorbs sunlight". The card is: {'));
  assert.ok(message.length <= 8000);
});

test('the context is capped inside the 8000 characters: the prose at BODY_CAP, the specs at SPEC_CAP in all (the rest named, not silently cut), pictures in full', () => {
  const big = { version: 1, diagram: { kind: 'flow', title: 'x', nodes: Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, label: 'node label number ' + i, role: 'process' })), edges: [] } };
  const block = { id: 'c', type: 'explanation', title: 'T', body: 'word '.repeat(5000) + '\n\n```rh-diagram\n' + JSON.stringify(big) + '\n```\n\n```rh-diagram\n' + JSON.stringify(big) + '\n```' };
  const card = cardContext(block, 'word');
  assert.equal(card.body.length <= BODY_CAP, true);
  assert.equal(card.visuals.length, 2);
  assert.match(String(card.visuals[0].spec) + String(card.visuals[1].spec), /left out of this message/);
  assert.ok(contextMessage(card).length <= 8000);
  assert.equal(cardContext({ id: 'n', type: 'note', title: 'N', text: 'just a note' }, 'note').cardType, 'note');
});

test('/explain from Ctrl+K sends the whole-card message when the handoff carries the card; every other caller keeps the words', () => {
  const card = cardContext({ id: 'c', type: 'explanation', title: 'T', body: 'Some prose.' }, 'prose');
  assert.equal(explainContext({ text: 'ignored', card }), contextMessage(card));
  assert.equal(explainContext({ text: 'just words' }), 'just words');
  assert.equal(explainContext({ text: '' }), null);
  assert.equal(explainContext(null), null);
});

test('a card made from highlighted words starts level with that line, inside the source; no line, the old placement', () => {
  const source = { x: 0, y: 100, w: 440, h: 900 };
  assert.deepEqual(besideSpot(source, { w: 546, h: 300 }, []), { x: 480, y: 100 });
  assert.deepEqual(besideSpot(source, { w: 546, h: 300 }, [], { dy: 260 }), { x: 480, y: 360 });
  assert.equal(besideSpot(source, { w: 546, h: 300 }, [], { dy: 5000 }).y, 100 + 900 - 40, 'clamped inside the source');
  // an occupied slot there: the next free slot to the right in the same row
  assert.equal(besideSpot(source, { w: 546, h: 300 }, [{ x: 480, y: 340, w: 546, h: 400 }], { dy: 260 }).x, 480 + 546 + 40);
});

test('wiring: the canvas picks the highlight, the editor draws the chip, the mark, the scrim and hands the card over; the slash command uses the context and the line', () => {
  const canvas = read('AdaptiveCanvas.jsx'), editor = read('InlineAiEditor.jsx'), slash = read('learn-slash.js'), css = read('index.css');
  assert.match(canvas, /pickedHighlight\(shell\.current, board\.blocks, viewRef\.current\.z\)/);
  assert.match(canvas, /highlight=\{inline\.highlight \|\| null\}/);
  assert.doesNotMatch(canvas, /onClearHighlight/, 'no chip x: the window closes it');
  assert.match(canvas, /besideSpot\(source, size, boardObstacles\(\[beside\]\), \{ dy: besideDy \}\)/);
  assert.doesNotMatch(editor, /Remove the highlighted text/, 'the chip has no x');
  assert.match(editor, /data-inline-close/, 'the x belongs to the window');
  assert.ok(editor.includes("config.transport.route({ requestId: crypto.randomUUID(), prompt: asked, selection: (highlight?.text ?? preset.prompt ?? '').slice(0, 1500) })"), 'a plain prompt asks the router which command it is, over highlighted words and over the bulb passage');
  assert.ok(editor.includes('intent.probability >= INTENT_AT'));
  assert.ok(editor.includes('config.handoff(line, { selection: highlight ? highlightSelection() : null })'), 'a picked command is handed to Chat');
  assert.doesNotMatch(editor, /askChat/, 'a plain prompt with no command stays in Ctrl+K');
  assert.ok(editor.includes('highlightedCard: highlightedCardMessage()'), 'the in-editor Explain carries the whole card');
  assert.match(read('inline-ai-context.js'), /highlightedCard/);
  assert.ok(read('ask.jsx').includes('handoff?.target?.card?.highlighted'));
  assert.ok(read('ChatMessages.jsx').includes('data-chat-highlight-chip'), 'the Chat turn shows the highlighted words as a short chip');
  assert.ok(read('inline-ai-transport.js').includes('/api/learn/inline/route'));
  assert.ok(editor.includes('handedOff.current = true; onClose()'), 'sent to Chat: the mark stays');
  assert.ok(editor.includes('if (!handedOff.current) markClear()'), 'closed without sending: the mark goes');
  const chat = read('ChatMessages.jsx');
  assert.ok(chat.includes('data-chat-highlight-clear') && chat.includes('aria-label="Remove the highlight"') && chat.includes('onClick={markClear}'), 'the Chat chip has the x that un-highlights');
  assert.ok(chat.includes('{live && <button'), 'the x only while the mark is on');
  assert.match(editor, /firstWords\(highlight\.text\)/);
  assert.match(editor, /title=\{highlight\.text\}/);
  assert.ok(editor.includes('markSet(highlight)'));
  assert.ok(read('inline-highlight-mark.js').includes("CSS.highlights.set('inline-target', new Highlight(current.live))"));
  assert.match(editor, /data-inline-scrim /);
  // Owner 2026-11-09: everything dims except the window: a full canvas scrim (no hole over the words) and a viewport scrim portalled outside the canvas's box (the Chat panel), both click-through, both under the window.
  assert.ok(editor.includes('data-inline-scrim data-thumbnail-hide aria-hidden="true" className="pointer-events-none absolute inset-0 z-[45] bg-black/40"'));
  assert.ok(editor.includes('data-inline-scrim-page') && editor.includes('createPortal(') && editor.includes('pointer-events-none fixed inset-0 z-[45] bg-black/40'));
  assert.ok(editor.includes('scrimPath({ w: window.innerWidth, h: window.innerHeight }, [pageBox], 0)'), 'the viewport scrim leaves out only the canvas box');
  assert.ok(!editor.includes('scrimPath(surface, marked)'), 'no hole over the highlighted words');
  assert.match(editor, /data-inline-ai-overlay[^>]*z-\[46\]/, 'the ghosts stay above the scrim');
  assert.match(editor, /data-inline-ai data-keep-focus[\s\S]*?className="absolute z-50 /, 'the window stands above the scrim');
  assert.ok(editor.includes('beside: true, alignY: highlight.alignY'));
  assert.match(slash, /besideDy: target\.alignY/);
  assert.match(slash, /context: explainContext\(target\)/);
  assert.match(css, /::highlight\(inline-target\)/);
});

test('the mark store: one mark at a time, a new one replaces it, clearing notifies the Chat chip', async () => {
  const { markSet, markClear, markGet } = await import('./inline-highlight-mark.js');
  assert.equal(markGet(), null);
  markSet({ id: 'a', text: 'first words here', live: null });
  assert.equal(markGet().text, 'first words here');
  markSet({ id: 'b', text: 'other', live: null });
  assert.equal(markGet().id, 'b');
  markClear();
  assert.equal(markGet(), null);
});

// ---- the window's place: close to the words, never over them (owner 2026-11-09) ----
import { placeBesideWords, WORDS_GAP, WORDS_GAP_MAX } from './inline-highlight.js';
const SURFACE = { w: 1280, h: 900 }, SIZE = { w: 420, h: 136 };
const overlapPx = (spot, size, rects) => rects.reduce((sum, r) => sum + Math.max(0, Math.min(spot.left + size.w, r.left + r.width) - Math.max(spot.left, r.left)) * Math.max(0, Math.min(spot.top + size.h, r.top + r.height) - Math.max(spot.top, r.top)), 0);
const inside = (spot, size, surface) => spot.left >= 0 && spot.top >= 0 && spot.left + size.w <= surface.w && spot.top + size.h <= surface.h;

test('the window goes below the last line of the words, the left edge on the words, a small gap', () => {
  const rects = [{ left: 500, top: 300, width: 125, height: 17 }];
  const spot = placeBesideWords(rects, SIZE, SURFACE);
  assert.equal(spot.side, 'below');
  assert.equal(spot.top, 300 + 17 + WORDS_GAP);
  assert.equal(spot.left, 500);
  assert.equal(spot.gap, WORDS_GAP);
  assert.equal(overlapPx(spot, SIZE, rects), 0);
});

test('a multi-line highlight: below the LAST line, and no line is covered', () => {
  const rects = [{ left: 520, top: 300, width: 220, height: 17 }, { left: 400, top: 318, width: 300, height: 17 }, { left: 400, top: 336, width: 90, height: 17 }];
  const spot = placeBesideWords(rects, SIZE, SURFACE);
  assert.equal(spot.side, 'below');
  assert.equal(spot.top, 336 + 17 + WORDS_GAP);
  assert.equal(spot.left, 400, 'on the last line\'s left');
  assert.equal(overlapPx(spot, SIZE, rects), 0);
});

test('near the bottom edge it flips above the first line, held by its bottom edge, still close', () => {
  const rects = [{ left: 500, top: 800, width: 125, height: 17 }];
  const spot = placeBesideWords(rects, SIZE, SURFACE);
  assert.equal(spot.side, 'above');
  assert.equal(spot.up, true);
  assert.equal(spot.top + SIZE.h, 800 - WORDS_GAP, 'its bottom edge is a gap above the words');
  assert.equal(overlapPx(spot, SIZE, rects), 0);
  assert.ok(spot.gap <= WORDS_GAP_MAX);
});

test('near the top edge it stays below; at the right edge it is clamped inside the viewport', () => {
  const top = placeBesideWords([{ left: 500, top: 20, width: 125, height: 17 }], SIZE, SURFACE);
  assert.equal(top.side, 'below');
  const edge = placeBesideWords([{ left: 1200, top: 300, width: 60, height: 17 }], SIZE, SURFACE);
  assert.equal(edge.side, 'below');
  assert.ok(inside(edge, SIZE, SURFACE), 'inside the viewport');
  assert.equal(overlapPx(edge, SIZE, [{ left: 1200, top: 300, width: 60, height: 17 }]), 0);
});

test('a tall highlight that fills the viewport: beside it (right, then left), never over it, inside the viewport', () => {
  const rects = Array.from({ length: 40 }, (_, i) => ({ left: 300, top: 10 + i * 20, width: 300, height: 17 }));
  const spot = placeBesideWords(rects, SIZE, SURFACE);
  assert.ok(['right', 'left'].includes(spot.side), spot.side);
  assert.equal(overlapPx(spot, SIZE, rects), 0);
  assert.ok(inside(spot, SIZE, SURFACE));
  const cramped = placeBesideWords(rects.map(r => ({ ...r, left: 40, width: 1200 })), SIZE, SURFACE);
  assert.ok(inside(cramped, SIZE, SURFACE), 'when nothing is clear it is still inside the viewport');
});

test('the card\'s own toolbar and the bottom strip are kept clear when a clear spot exists', () => {
  const rects = [{ left: 500, top: 300, width: 125, height: 17 }];
  const strip = { x: 400, y: 320, w: 600, h: 60 };
  const spot = placeBesideWords(rects, SIZE, SURFACE, { avoid: [strip] });
  assert.equal(spot.side, 'above', 'below is taken by the strip');
  assert.equal(overlapPx(spot, SIZE, rects), 0);
});

test('big zoom: words that are 3 times taller keep the same small gap', () => {
  const rects = [{ left: 300, top: 200, width: 400, height: 54 }];
  const spot = placeBesideWords(rects, SIZE, SURFACE);
  assert.equal(spot.gap, WORDS_GAP);
  assert.equal(overlapPx(spot, SIZE, rects), 0);
  assert.equal(placeBesideWords([], SIZE, SURFACE), null);
});

// ---- the camera: the words and the window centred, zoomed in a little, never out (owner 2026-11-09) ----
import { cameraForWords, CAMERA_ZOOM_MAX } from './inline-highlight.js';
const AREA = { left: 0, top: 0, right: 1280, bottom: 900 }, WIN = { w: 420, h: 160, gap: 10 };
// where the union of the words and the window lands on screen after the camera `next` (the window keeps its size, the words grow)
const landed = (words, view, next) => { const k = next.z / view.z, wl = (words.left - view.x) / view.z * next.z + next.x, wt = (words.top - view.y) / view.z * next.z + next.y, ww = (words.right - words.left) * k, wh = (words.bottom - words.top) * k, w = Math.max(ww, WIN.w), h = wh + WIN.gap + WIN.h; return { cx: wl + w / 2, cy: wt + h / 2, w, h }; };
test('the words and the window are centred in the visible area AFTER the zoom (the window does not scale)', () => {
  const view = { x: 0, y: 0, z: 1 }, words = { left: 100, top: 600, right: 180, bottom: 622 };
  const next = cameraForWords(words, WIN, view, AREA);
  assert.ok(next.z >= 1 && next.z <= CAMERA_ZOOM_MAX);
  const at = landed(words, view, next);
  assert.ok(Math.abs(at.cx - 640) <= 1 && Math.abs(at.cy - 450) <= 1, 'the union centre lands on the area centre: ' + JSON.stringify(at));
});
test('wide words (a multi-line highlight): centred the same way', () => {
  const view = { x: 40, y: -30, z: 0.8 }, words = { left: 300, top: 500, right: 700, bottom: 560 };
  const next = cameraForWords(words, WIN, view, AREA), at = landed(words, view, next);
  assert.ok(Math.abs(at.cx - 640) <= 1 && Math.abs(at.cy - 450) <= 1);
});
test('the zoom goes up to the cap or the fit, never past 1.5 and never down', () => {
  assert.equal(cameraForWords({ left: 600, top: 400, right: 640, bottom: 420 }, WIN, { x: 0, y: 0, z: 1 }, AREA).z, CAMERA_ZOOM_MAX, 'small words: the cap');
  const wide = cameraForWords({ left: 0, top: 0, right: 1100, bottom: 400 }, WIN, { x: 0, y: 0, z: 1 }, AREA);
  assert.ok(wide.z < CAMERA_ZOOM_MAX && wide.z >= 1, 'wide words: the fit, inside the area with padding');
  assert.equal(cameraForWords({ left: 0, top: 0, right: 3000, bottom: 400 }, WIN, { x: 0, y: 0, z: 0.8 }, AREA).z, 0.8, 'words bigger than the area: no zoom out');
  assert.equal(cameraForWords({ left: 600, top: 400, right: 640, bottom: 420 }, WIN, { x: 0, y: 0, z: 2 }, AREA).z, 2, 'already zoomed in: kept');
});
test('the right Chat panel narrows the area: the union centres in what is left', () => {
  const view = { x: 0, y: 0, z: 1 }, words = { left: 100, top: 300, right: 400, bottom: 330 };
  const next = cameraForWords(words, WIN, view, { left: 0, top: 0, right: 900, bottom: 900 }), at = landed(words, view, next);
  assert.ok(Math.abs(at.cx - 450) <= 1, 'centred on x = 450, not 640');
});
test('already centred and readable: nothing moves', () => {
  assert.equal(cameraForWords({ left: 640 - 210, top: 450 - 90, right: 640 + 210, bottom: 450 - 80 }, { w: 420, h: 160, gap: 10 }, { x: 0, y: 0, z: 1.5 }, AREA), null);
  assert.equal(cameraForWords({ left: 0, top: 0, right: 0, bottom: 10 }, WIN, { x: 0, y: 0, z: 1 }, AREA), null);
});
test('wiring: the window is placed by placeBesideWords against the live words, the camera frames words and window and goes back unless a command was sent', () => {
  const editor = read('InlineAiEditor.jsx'), canvas = read('AdaptiveCanvas.jsx');
  assert.ok(editor.includes('placeBesideWords(marked, { w: width, h: height }, surface, { avoid: canvas.chromeRects(), edge: EDGE })'));
  assert.ok(editor.includes("document.addEventListener('scroll', again, true)") && editor.includes("window.addEventListener('resize', again)"), 'recomputed on scroll and resize');
  assert.ok(editor.includes('canvas.frameWords(words,'));
  assert.ok(editor.includes('if (!handedOff.current) restore?.()'), 'closed without sending: the camera goes back; a sent command: the new card frame takes over');
  assert.ok(canvas.includes('frameWords: (words, win) => { const free = visibleArea()') && canvas.includes('const target = cameraForWords(words, win, viewRef.current, area);'));
  assert.ok(editor.includes('canvas.frameWords(words, { w: W, h: FRAME_ROOM, gap: 10 })'), 'the camera centres the words and the first window height, not the whole reserve');
  assert.ok(canvas.includes('glideTo(target, true)'), 'the canvas\'s own short glide (none under reduced motion)');
});

test('the window is placed once, against where the camera glide leaves the words, and never again when its content grows', () => {
  const words = [{ left: 300, top: 200, width: 120, height: 18 }];
  const from = { x: 0, y: 0, z: 1 }, to = { x: -90, y: 40, z: 1.5 };
  const [end] = settleRects(words, from, to);
  assert.deepEqual(end, { left: 300 * 1.5 - 90, top: 200 * 1.5 + 40, width: 180, height: 27 }, 'the words as the glide leaves them (world point to the new camera)');
  const SURF = { w: 1280, h: 900 };
  const first = placeBesideWords([end], { w: 420, h: 300 }, SURF);
  assert.deepEqual(placeBesideWords([end], { w: 420, h: 300 }, SURF), first, 'the same rects and size give the same place on every render');
  const editor = read('InlineAiEditor.jsx');
  assert.ok(editor.includes('if (settled) return settled;'), 'the rects the window follows are the settled ones, not the live words mid-glide');
  assert.ok(/useLayoutEffect\(\(\) => \{\s+const origin = overlay\.current\?\.getBoundingClientRect\(\);\s+if \(!highlight \|\| !origin \|\| !canvas\.frameWords\) return undefined;/.test(editor), 'framed before the first paint');
  assert.ok(!editor.includes('setTimeout(() => tick(n => n + 1), 420)'), 'no re-place when the glide ends');
  assert.ok(read('AdaptiveCanvas.jsx').includes('{ from: was, to: target }'), 'the canvas hands back the camera the glide ends at');
});

test('over highlighted words the mode is only the label Explain selection: no dropdown, no Edit', () => {
  const editor = read('InlineAiEditor.jsx');
  assert.ok(editor.includes("cardEditReason || highlight ? 'explain'"), 'a highlight forces Explain even when a menu asked for edit');
  assert.ok(editor.includes('{wordsSubject ? <span data-inline-mode-label') && editor.includes('Explain selection</span> : <>'), 'a fixed label, the toggle only in the other branch');
  const label = editor.slice(editor.indexOf('{wordsSubject ? <span'), editor.indexOf(' : <>', editor.indexOf('{wordsSubject ? <span')));
  assert.ok(!label.includes('data-inline-mode-toggle') && !label.includes('ChevronDown'), 'the label is plain text: not a control, no chevron');
  assert.ok(editor.includes('const wordsSubject = !!highlight || !!preset;'));
});

test('the selection toolbar Ctrl+K button opens the same opener as the key, with the words and no pill', () => {
  const canvas = read('AdaptiveCanvas.jsx'), layer = read('ExplanationInteractions.jsx'), editor = read('InlineAiEditor.jsx');
  assert.ok(canvas.includes('quickAsk: () => openInlineRef.current()') && canvas.includes('openInlineRef.current = () => openInline(performance.now());'), 'openInline reads the page selection as the key path does (inlineTarget picks the highlight)');
  assert.ok(layer.includes('const quickAsk = () => { if (bar && host?.quickAsk?.()) setBar(null); };') && read('selection-toolbar.jsx').includes("chordLabel('quick-edit', mac)"));
  assert.ok(!layer.includes('Ask in chat'.concat('"')) && !layer.includes('askInChat'), 'Ask in chat is gone from this toolbar');
  assert.ok(editor.includes('cardEditReason || highlight'), 'a highlight opens as Explain selection');
  assert.ok(editor.includes('useState(preset?.command ?? null)'), 'no preset means no command pill: the router picks the command on Send');
});
