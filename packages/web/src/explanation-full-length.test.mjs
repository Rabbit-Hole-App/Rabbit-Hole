// A new written Explanation (owner 2026-11-08): shown at its full length without a resize, the camera framing it whole once, and again only
// while it grows and the learner has not moved the camera; a reopened board is left as it was. Also its header without the light bulb, and the
// six-dot drag grip every card shares, and the one animated camera move (glideTo) every jump to a card takes. Markup and sources only, no browser: real heights and the camera on screen are the owner's visual check.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { fullLength, freshFitStep, fitFrame, fullContent } from './card-layout.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n');
const dir = mkdtempSync(join(tmpdir(), 'explanation-full-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, 'b.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { default as CardHeader } from './CardHeader.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: here, loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);
const card = block => B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'x', selected: true }));
const GENERATED = { id: 'e1', type: 'explanation', dx: 0, dy: 0, title: 'Why coffee cools fast at first', body: 'A big temperature gap drives fast heat loss.\n\nAs the gap closes, cooling slows.',
  illustration: { cacheKey: 'illus:cup', alt: 'A cup', caption: 'A cooling cup', aspect: 1.5 } };

test('a generated Explanation opens in Full content: no height, no cap, its body never scrolls inside', () => {
  const opened = fullLength(GENERATED, 440);
  assert.deepEqual(opened.cardLayout, { mode: 'full', fullWidth: 440 }, 'Full content at the type width, with no slot: it takes its own height in the column');
  assert.equal(fullContent(opened), true);
  assert.equal(opened.h, undefined);
  // CanvasNode: a Full card's frame is fitFrame(undefined, undefined, false), so its height is its content's and grows when a picture arrives.
  assert.deepEqual(fitFrame(undefined, undefined, false), { height: undefined, maxHeight: undefined });
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /\.\.\.fitFrame\(full \? undefined : [^]*?, full \|\| cardLayout \? undefined : /, 'a Full card gets neither a height nor the type cap');
  assert.match(canvas, /data-card-layout=\{full \? 'full' : 'scrollable'\}/);
  // The body is the [data-scroll] flow, which a Full card draws whole (card-layout.css).
  assert.match(card(opened), /data-scroll="true" data-explanation-flow="true"/);
  assert.match(read('card-layout.css'), /\[data-card-layout="full"\] \[data-scroll\][^{]*\{ overflow: visible; max-height: none; flex: none; \}/);
});

test('only a new card is opened full: a saved layout is kept, and the board load path never applies it', () => {
  const saved = { ...GENERATED, cardLayout: { mode: 'scrollable', scrollableSize: { w: 440, h: 520 }, fullWidth: 440, slot: { w: 440, h: 520 } } };
  assert.equal(fullLength(saved, 440), saved, 'a card that already has a layout is untouched');
  assert.equal(fullLength({ type: 'paper' }, 440).cardLayout, undefined, 'a card without Full content is untouched');
  const canvas = read('AdaptiveCanvas.jsx');
  assert.equal(canvas.match(/fullLength\(/g).length, 1, 'only insertBlock opens a card full');
  assert.match(canvas, /if \(fit\) added = fullLength\(added, BLOCK_TYPES\[added\.type\]\?\.width\);/);
  assert.match(read('learn-slash.js'), /canvas\.insertBlock\(withPrompt\(result\.block, promptUsed\), \{ into: slot, \.\.\.\(result\.block\?\.type === 'explanation' \? \{ fit: true \} : \{\}\),/);
});

test('the camera frames the new card once with its measured box, again only when it grows, never after the learner moved', () => {
  const want = { moves: 3, h: null }, box = { x: 10, y: 20, w: 440, h: 900 };
  assert.equal(freshFitStep(want, null, 3), 'wait', 'not measured yet');
  assert.equal(freshFitStep(want, box, 3), 'fit', 'measured: framed');
  want.h = box.h;
  assert.equal(freshFitStep(want, box, 3), 'wait', 'the same box is not framed twice');
  assert.equal(freshFitStep(want, { ...box, h: 860 }, 3), 'wait', 'a card that shrinks is not reframed');
  assert.equal(freshFitStep(want, { ...box, h: 1240 }, 3), 'fit', 'a picture arrived: framed again');
  assert.equal(freshFitStep(want, { ...box, h: 1500 }, 4), 'drop', 'the learner moved the camera: never again');
  assert.equal(freshFitStep(null, box, 3), 'drop', 'a reopened board arms nothing');
  const canvas = read('AdaptiveCanvas.jsx');
  assert.equal(canvas.match(/\.fit = \{/g).length, 1, 'the fit is armed in one place, insertBlock');
  assert.match(canvas, /if \(step === 'fit'\) \{ want\.fit\.h = box\.h; frame\(\[box\], 64, 1, true\); \}/, "framed with the card's bounds, zooming out or in up to 100%");
  assert.match(canvas, /if \(auto\) autoView\.current = next;/, "the canvas's own frame is not counted as the learner's move");
});

test('the written Explanation header has no light bulb and no gap; other cards keep their icon', () => {
  const markup = card(GENERATED);
  assert.match(markup, /data-card-header/);
  assert.doesNotMatch(markup, /data-card-icon/);
  assert.match(markup, /<h3 data-card-title[^>]*>Why coffee cools fast at first<\/h3>/);
  assert.match(markup, /data-card-meta="true" class="mt-0\.5 truncate text-xs text-ink-3 "/, 'the meta line starts under the title');
  assert.match(B.renderToStaticMarkup(B.createElement(B.CardHeader, { block: { id: 'q', type: 'quiz', title: 'Q' }, meta: 'Quiz' })), /data-card-icon/);
  assert.match(card({ id: 't', type: 'explanation', title: 'Topic', anchor: { source: 'dive' } }), /data-card-icon/, 'a Rabbit Hole topic card keeps its icon');
});

test('every card drags by one six-dot grip, shown on hover or focus, never the old bar', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  const strip = canvas.match(/<div data-drag-handle data-drag-zone[^]*?<\/div>/)[0];
  assert.match(strip, /<GripHorizontal data-drag-grip size=\{13\}/);
  assert.match(strip, /opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100/);
  assert.equal(canvas.match(/data-drag-handle/g).length, 1, 'one shared strip');
  for (const name of ['AdaptiveCanvas.jsx', 'SlotCard.jsx', 'SlashCommandPreview.jsx']) assert.doesNotMatch(read(name), /h-1 w-12 rounded-full bg-line/, name);
});

// Owner 2026-11-08: a jump to a card (chat and reference chips, Locate, Search, a new card's reveal and fit) is one short animated camera move.
test('every jump to a card goes through the one glideTo camera move, animated, instant under reduced motion or a drag', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  const frame = canvas.match(/const frame = \(boxes, pad = 48, maxZoom = 1, auto = false\) => \{[^]*?\n  \};/)[0];
  assert.match(frame, /glideTo\(next, auto\);/, 'frame (chips: focusBlock, focusObject, locateObject, source refs; the new-card fit) glides');
  assert.doesNotMatch(frame, /setView\(/, 'and never sets the camera itself');
  const show = canvas.match(/const showBox = [^]*?\n  \};/)[0];
  assert.match(show, /glideTo\(next, true\);/, 'showBox (a new card reveal, Tutor and slot cards) glides');
  assert.doesNotMatch(show, /setView\(/);
  assert.match(canvas, /viewRef\.current = next; glideTo\(next\);/, 'a Search result glides');
  for (const command of ['focusBlock', 'focusObject', 'locateObject']) assert.match(canvas.match(new RegExp(`      ${command}: id => \{[^]*?\n      \},`))[0], /cameraRef\.current = \{ id, frame: true \}/, `${command} reaches frame`);
  assert.match(canvas, /if \(want\.frame\) frame\(\[box\], 64, 1\); else showBox\(box, want\.smooth, want\.centre\);/);
  const glide = canvas.match(/const glideTo = \(next, auto = false\) => \{[^]*?\n  \};/)[0];
  assert.match(glide, /document\.body\.classList\.contains\('canvas-dragging'\) \? 0 : count \+ 1/, 'no glide while the learner drags');
  assert.match(canvas, /\$\{glide \? 'transition-transform duration-300 ease-in-out motion-reduce:transition-none' : ''\}/, 'eased, 300ms, none under prefers-reduced-motion');
  assert.match(read('index.css'), /\.canvas-dragging \[data-canvas-world\] \{ transition: none; \}/, 'a drag that starts mid-glide is never animated');
  assert.equal((canvas.match(/setGlide\(true\)/g) || []).length, 0, 'no camera move glides on its own path');
});

// Owner correction 2026-11-08: a Full content card keeps the bottom-right resize; dragging it takes the card out of Full at the dragged size.
import { resizeCardLayout } from './card-layout.js';
test('a Full card renders the corner resize; a corner drag leaves Full at the new size; a locked card has none', () => {
  const opened = fullLength(GENERATED, 440);
  const sized = resizeCardLayout(opened, 520, 610, null, undefined, true);
  assert.equal(sized.cardLayout, undefined, 'a card that opened full becomes an ordinary sized card');
  assert.equal(sized.w, 520); assert.equal(sized.h, 610);
  assert.equal(sized.body, GENERATED.body); assert.equal(sized.dx, 0);
  const slotted = { ...GENERATED, cardLayout: { mode: 'full', scrollableSize: { w: 440, h: 520 }, fullWidth: 440, slot: { w: 440, h: 520 } } };
  assert.deepEqual(resizeCardLayout(slotted, 500, 400, null, undefined, true).cardLayout, { mode: 'scrollable', scrollableSize: { w: 500, h: 400 }, fullWidth: 440, slot: { w: 440, h: 520 } }, 'a slotted Full card turns Scrollable at that size');
  assert.equal(resizeCardLayout(opened, 600, 900, null).cardLayout.mode, 'full', 'the side sliders still change the width only');
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /\{!locked && resizable && <button type="button" aria-label="Resize chat block" title="Resize block"/, 'the corner shows on Full cards too, never on a locked one');
  assert.doesNotMatch(canvas, /\{!full && !locked && resizable && <button/);
  assert.match(canvas, /if \(event\.button !== 0 \|\| locked\) return;\n    const element = card\.current, sized = fit \|\| opensSized;/, 'a Full card can be corner-dragged; a locked one cannot');
  assert.match(canvas, /if \(cardLayout\) edit\.resizeCard\?\.\(id, last\.w, last\.h, null, undefined, false, true\);/, 'the release goes through the existing resizeCard, as a corner resize');
  assert.match(canvas, /resizeCardLayout\(block, w, h, x, minimum, corner\)/);
  assert.match(canvas, /if \(cornerDrag && opensSized\) cardLayout = null;\n  const full = cardLayout\?\.mode === 'full' && !cornerDrag;/, 'drawn at the dragged size while dragged');
});
