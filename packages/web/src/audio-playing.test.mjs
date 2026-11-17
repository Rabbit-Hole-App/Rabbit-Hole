// The playing-card store (audio-playing.js) and where it shows: the minimap's green mark (CanvasMinimap rendered for real) and the canvas card's green frame (CanvasNode's
// data-audio-playing and its index.css rule, read from source: AdaptiveCanvas is too large to mount here). WIRING only: the real frame's pixels are the owner's to see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { clearPlayingCard, getPlayingCard, setPlayingCard, subscribePlaying } from './audio-playing.js';
import { minimapLayout } from './learn-minimap.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('the store holds one playing id: set replaces, clear empties, a stale clear does not', () => {
  setPlayingCard(null);
  setPlayingCard('a'); assert.equal(getPlayingCard(), 'a');
  setPlayingCard('b'); assert.equal(getPlayingCard(), 'b', 'only one at a time');
  clearPlayingCard('a'); assert.equal(getPlayingCard(), 'b', 'a card that was replaced cannot clear the new one');
  clearPlayingCard('b'); assert.equal(getPlayingCard(), null);
  setPlayingCard('c'); setPlayingCard(undefined); assert.equal(getPlayingCard(), null);
});

test('subscribers hear each change once, not a repeat, and none after unsubscribing', () => {
  setPlayingCard(null);
  let calls = 0;
  const off = subscribePlaying(() => { calls += 1; });
  setPlayingCard('a'); setPlayingCard('a'); setPlayingCard('b'); setPlayingCard(null);
  assert.equal(calls, 3);
  off(); setPlayingCard('a');
  assert.equal(calls, 3);
  setPlayingCard(null);
});

test('the minimap layout keeps each card id, so the playing card is findable', () => {
  const layout = minimapLayout([{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 0, w: 50, h: 50 }], { x: 0, y: 0, z: 1 }, { w: 1000, h: 500 }, { w: 180, h: 120 });
  assert.equal(layout.boxes[0].id, 'a');
  assert.equal('id' in layout.boxes[1], false);
});

test('the minimap marks the playing card green and no other, and follows the store live', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-playing-')), outfile = join(dir, 'minimap.cjs');
  await esbuild.build({
    stdin: { contents: "export { default as CanvasMinimap } from './CanvasMinimap.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'; export { setPlayingCard } from './audio-playing.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
    bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  });
  const B = createRequire(import.meta.url)(outfile);
  rmSync(dir, { recursive: true, force: true });
  const html = () => B.renderToStaticMarkup(B.createElement(B.CanvasMinimap, { boxes: [{ id: 'a', x: 0, y: 0, w: 300, h: 200 }, { id: 'b', x: 400, y: 0, w: 300, h: 200 }], view: { x: 0, y: 0, z: 1 }, surface: { w: 1000, h: 500 }, onView() {}, onFit() {} }));
  assert.doesNotMatch(html(), /data-minimap-playing/);
  B.setPlayingCard('b');
  const marked = html();
  assert.equal((marked.match(/data-minimap-playing/g) || []).length, 1);
  assert.match(marked, /<rect[^>]*data-minimap-playing[^>]*stroke-\[var\(--viz-playing\)\]/, 'the green token as the stroke');
  assert.match(marked, /fill-\[color-mix\(in_srgb,var\(--viz-playing\)_35%,transparent\)\]/, 'and a light tint of it');
  B.setPlayingCard(null);
  assert.doesNotMatch(html(), /data-minimap-playing/);
});

test('the canvas card carries data-audio-playing from the store, and index.css frames it in the palette green --viz-playing without a ring or a thicker border', () => {
  const canvas = read('AdaptiveCanvas.jsx'), css = read('index.css');
  assert.match(canvas, /const audioPlaying = usePlayingCard\(id\);/);
  assert.match(canvas, /data-audio-playing=\{audioPlaying \|\| undefined\}/);
  assert.match(canvas, /\.\.\.box, id, hole: true \} : \{ \.\.\.box, id \}/, 'the minimap boxes carry the card id');
  const rule = css.match(/\[data-block\]\[data-audio-playing\] \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /border-color: var\(--viz-playing\)/);
  assert.match(rule, /outline: 3px solid color-mix\(in srgb, var\(--viz-playing\) 25%, transparent\)/);
  assert.match(rule, /outline-offset: 0/);
  assert.doesNotMatch(rule, /ring|border-width|border:|animation/);
  assert.match(css, /\[data-block\]\[data-block-id\] \{ transition-property: box-shadow, border-color; \}/, 'the colour fades over the card 150 ms');
  assert.match(css, /--viz-playing: #3A7E69;/, 'the palette variable exists (generated from palette.js, one value in both themes)');
});

// The transcript window's data (audio-playing.js): one card's { cardId, script, t, d }, published from the audio element's time.
import { closeTranscript, getTranscript, openTranscript, restartTranscript, updateTranscript } from './audio-playing.js';

test('the transcript store: opens for one card with its script, follows t and d, and a second card replaces it', () => {
  closeTranscript('a'); closeTranscript('b');
  openTranscript('a', 'one two three');
  assert.deepEqual(getTranscript(), { cardId: 'a', script: 'one two three', t: 0, d: 0 });
  updateTranscript('a', 2, 10);
  assert.deepEqual(getTranscript(), { cardId: 'a', script: 'one two three', t: 2, d: 10 });
  updateTranscript('b', 5, 10); assert.equal(getTranscript().t, 2, 'another card cannot move it');
  openTranscript('b', 'four five'); assert.equal(getTranscript().cardId, 'b');
  closeTranscript('a'); assert.equal(getTranscript().cardId, 'b', 'a replaced card cannot close the new window');
  closeTranscript('b'); assert.equal(getTranscript(), null);
});

test('no script, no window; a resume keeps its position; a replay restarts it', () => {
  closeTranscript('a');
  for (const script of [undefined, '', '  ', 5]) { openTranscript('a', script); assert.equal(getTranscript(), null); }
  openTranscript('a', 'x y'); updateTranscript('a', 4, 10);
  openTranscript('a', 'x y'); assert.equal(getTranscript().t, 4, 'play after a pause');
  restartTranscript('a'); assert.equal(getTranscript().t, 0);
  closeTranscript('a');
});

test('updates are throttled: a change under 0.2 s is not published, the end and a new length are', () => {
  closeTranscript('a');
  openTranscript('a', 'x y'); updateTranscript('a', 1, 10);
  let calls = 0; const off = subscribePlaying(() => { calls += 1; });
  updateTranscript('a', 1.1, 10); assert.equal(calls, 0);
  updateTranscript('a', 1.3, 10); assert.equal(calls, 1);
  updateTranscript('a', 1.3, 12); assert.equal(calls, 2, 'the length arrived');
  updateTranscript('a', 12, 12); assert.equal(calls, 3, 'the end');
  updateTranscript('a', NaN, 12); assert.equal(calls, 3);
  off(); closeTranscript('a');
});

test('only the owning card hears the window change (usePlayingTranscript answers null for the others)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'transcript-hook-')), outfile = join(dir, 'hook.cjs');
  await esbuild.build({
    stdin: { contents: "export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'; export { usePlayingTranscript, openTranscript, closeTranscript } from './audio-playing.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
    bundle: true, outfile, format: 'cjs', platform: 'node', logLevel: 'error',
  });
  const B = createRequire(import.meta.url)(outfile);
  rmSync(dir, { recursive: true, force: true });
  const Probe = ({ id }) => { const data = B.usePlayingTranscript(id); return B.createElement('i', null, data ? data.script : 'none'); };
  B.openTranscript('a', 'hello');
  assert.equal(B.renderToStaticMarkup(B.createElement(Probe, { id: 'a' })), '<i>hello</i>');
  assert.equal(B.renderToStaticMarkup(B.createElement(Probe, { id: 'b' })), '<i>none</i>');
  B.closeTranscript('a');
});
