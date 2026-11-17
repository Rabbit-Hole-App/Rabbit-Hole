// The Explanation card's audio control (docs/features/explain.md, "Audio control"; ExplanationAudio.jsx, wired in LearningBlocks ExplanationBody's header): LearningBlockBody rendered with react-dom
// into linkedom after an esbuild bundle, the mount pattern of explanation-card-interactions.test.mjs. HTMLAudioElement is a fake that records play and pause and lets a test raise its events; the
// file read is the figures' own (followSource -> loadSource -> GET /api/learn/files/<id>), answered by a fake fetch. These checks prove WIRING and state, not sound, the real element or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
window.Element.prototype.getBoundingClientRect ||= () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async () => {} } } });
globalThis.MERMAID_STUB = { fail: false, rendered: [] };

// The fake audio element: what the card calls (play, pause, currentTime, src) and the events it listens for.
const audios = [];
globalThis.Audio = class extends EventTarget {
  constructor() { super(); this.src = ''; this.currentTime = 0; this.paused = true; this.ended = false; this.plays = 0; audios.push(this); }
  play() { this.plays += 1; this.paused = false; this.ended = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
};
const reads = [];
globalThis.fetch = async url => { reads.push(String(url)); return new Response(new Blob(['id3'], { type: 'audio/mpeg' }), { status: 200 }); };
globalThis.URL.createObjectURL = () => `blob:audio-${reads.length}`;
globalThis.URL.revokeObjectURL = () => {};

const dir = mkdtempSync(join(tmpdir(), 'explanation-audio-')), outfile = join(dir, 'explanation.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { getPlayingCard, getTranscript, closeTranscript } from './audio-playing.js'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^(mermaid|shiki)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /^mermaid$/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render() { return { svg: "<svg></svg>" }; } };' }));
    build.onLoad({ filter: /^shiki$/, namespace: 'stub' }, () => ({ contents: 'export async function codeToHtml() { throw new Error("no shiki in node"); }' }));
  } }],
});
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const ref = id => ({ v: 1, source: { id, rev: 'rev-1' }, meta: { name: 'explanation.mp3', type: 'audio/mpeg', size: 700000 } });
const ready = (id = 'fs_audio', over = {}) => ({ status: 'ready', fileRef: ref(id), seconds: 84, script: 'x', provider: 'fish', model: 's1', voiceId: 'v', ...over });
const card = (id = 'card-1', over = {}) => ({ id, type: 'explanation', dx: 0, dy: 0, title: `Why ${id}`, body: 'A decision tree asks simple questions.', narration: ready(), ...over });

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
let root = null;
async function mount(...blocks) {
  const options = blocks.at(-1)?.type ? {} : blocks.pop();
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  const body = block => B.createElement(B.LearningBlockBody, { key: block.id, block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'demo', selected: true, readOnly: !!options.readOnly, onExpandHeight() {} });
  await B.act(async () => root.render(B.createElement('div', { onPointerDown: options.onPointerDown }, ...blocks.map(body))));
  await settle();
}
test.after(async () => { if (root) await B.act(async () => root.unmount()); });
const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
const click = target => B.act(async () => { target.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 25)); });
const raise = (audio, type, patch = {}) => B.act(async () => { Object.assign(audio, patch); audio.dispatchEvent(new Event(type)); });
const toasts = [];
window.addEventListener('small:toast', event => toasts.push(event.detail));
const reset = () => { audios.length = 0; reads.length = 0; toasts.length = 0; };

test('no narration, or a failed one, draws nothing, and a card without it is unchanged', async () => {
  reset();
  await mount(card('a', { narration: undefined }));
  assert.equal($('[data-explanation-audio]'), null);
  assert.ok($('[data-explanation-head]'), 'the card itself is drawn as before');
  await mount(card('a', { narration: { status: 'failed' } }));
  assert.equal($('[data-explanation-audio]'), null);
  await mount(card('a', { narration: { status: 'ready' } }));
  assert.equal($('[data-explanation-audio]'), null, 'ready without a file names nothing to play');
});

test('preparing shows a spinner with the name Preparing audio, play disabled and no replay', async () => {
  reset();
  await mount(card('a', { narration: { status: 'preparing' } }));
  const pill = $('[data-explanation-audio]');
  assert.equal(pill.getAttribute('data-audio-state'), 'preparing');
  const play = pill.querySelector('[data-audio-play]');
  assert.equal(play.getAttribute('title'), 'Preparing audio');
  assert.equal(play.getAttribute('aria-label'), 'Preparing audio');
  assert.ok(play.hasAttribute('disabled'));
  assert.match(play.innerHTML, /animate-spin/, 'the app spinner (Loader2)');
  assert.equal(pill.querySelector('[data-audio-replay]'), null);
  assert.equal(audios.length, 0);
});

test('ready shows play and replay (no time), inside the card header, and reads nothing until pressed', async () => {
  reset();
  await mount(card('a'));
  const head = $('[data-explanation-head]'), pill = $('[data-explanation-audio]');
  assert.ok(head.contains(pill), 'in the pinned header, next to the title');
  assert.equal(pill.getAttribute('data-audio-state'), 'idle');
  const play = pill.querySelector('[data-audio-play]'), replay = pill.querySelector('[data-audio-replay]');
  assert.equal(play.getAttribute('title'), 'Play explanation');
  assert.equal(replay.getAttribute('title'), 'Replay from the start');
  assert.equal(replay.getAttribute('aria-label'), 'Replay from the start');
  assert.equal(pill.querySelector('[data-audio-time]'), null, 'no time is shown');
  for (const button of [play, replay]) { assert.equal(button.tagName, 'BUTTON'); assert.equal(button.getAttribute('type'), 'button'); assert.match(button.className, /\bh-7\b/); assert.match(button.className, /\bw-7\b/); assert.match(button.className, /focus-visible:outline-2/); }
  assert.equal(reads.length, 0, 'no audio is downloaded until it is played');
  assert.equal(audios.every(a => a.plays === 0), true, 'never autoplays');
});

test('play reads the card file like its figures, plays, becomes Pause; pause keeps the position and play resumes from it', async () => {
  reset();
  await mount(card('a'));
  await click($('[data-audio-play]'));
  assert.deepEqual(reads, ['/api/learn/files/fs_audio'], 'GET /api/learn/files/<source id>');
  const audio = audios[0];
  assert.match(audio.src, /^blob:/);
  assert.equal(audio.plays, 1);
  assert.equal($('[data-audio-play]').getAttribute('title'), 'Pause explanation');
  assert.equal($('[data-explanation-audio]').getAttribute('data-audio-state'), 'playing');
  assert.match($('[data-audio-play]').innerHTML, /lucide-pause/);
  await raise(audio, 'timeupdate', { currentTime: 12.6 });
  assert.equal($('[data-audio-time]'), null, 'no time is shown');
  await click($('[data-audio-play]'));
  assert.equal(audio.paused, true);
  assert.equal($('[data-audio-play]').getAttribute('title'), 'Play explanation');
  assert.equal($('[data-explanation-audio]').getAttribute('data-audio-state'), 'paused');
  assert.equal(audio.currentTime, 12.6, 'the position is kept');
  assert.equal($('[data-audio-time]'), null, 'no time is shown');
  await click($('[data-audio-play]'));
  assert.equal(audio.plays, 2);
  assert.equal(audio.currentTime, 12.6, 'resumed, not restarted');
  assert.equal(reads.length, 1, 'the file was read once');
  assert.equal(audios.length, 1, 'one audio element per card');
});

test('replay restarts at zero and plays, also before the file was ever read', async () => {
  reset();
  await mount(card('a'));
  await click($('[data-audio-replay]'));
  const audio = audios[0];
  assert.equal(audio.plays, 1);
  assert.equal(audio.currentTime, 0);
  await raise(audio, 'timeupdate', { currentTime: 40 });
  await click($('[data-audio-replay]'));
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.plays, 2);
  assert.equal($('[data-audio-time]'), null, 'no time is shown');
  assert.equal($('[data-audio-play]').getAttribute('title'), 'Pause explanation');
});

test('at the end it returns to the idle ready state with the position back at zero', async () => {
  reset();
  await mount(card('a'));
  await click($('[data-audio-play]'));
  const audio = audios[0];
  await raise(audio, 'timeupdate', { currentTime: 83.9 });
  await raise(audio, 'ended', { ended: true, paused: true });
  assert.equal(audio.currentTime, 0);
  assert.equal($('[data-explanation-audio]').getAttribute('data-audio-state'), 'idle');
  assert.equal($('[data-audio-play]').getAttribute('title'), 'Play explanation');
  assert.equal($('[data-audio-time]'), null, 'no time is shown');
});

test('only one card plays at a time: starting another pauses the first, which keeps its place', async () => {
  reset();
  await mount(card('a', { narration: ready('fs_a') }), card('b', { narration: ready('fs_b', { seconds: 61 }) }));
  const [first, second] = $$('[data-explanation-audio]');
  await click(first.querySelector('[data-audio-play]'));
  await raise(audios[0], 'timeupdate', { currentTime: 5 });
  await click(second.querySelector('[data-audio-play]'));
  assert.equal(audios.length, 2);
  assert.equal(audios[0].paused, true, 'the first was paused');
  assert.equal(audios[1].paused, false);
  assert.equal(first.getAttribute('data-audio-state'), 'paused');
  assert.equal(second.getAttribute('data-audio-state'), 'playing');
  assert.equal(audios[0].currentTime, 5);
  assert.equal(second.querySelector('[data-audio-time]'), null, 'no time is shown');
});

test('it stops when the card becomes a minimized tile, and when the card goes away', async () => {
  reset();
  await mount(card('a'));
  await click($('[data-audio-play]'));
  const audio = audios[0];
  assert.equal(audio.paused, false);
  await mount(card('a', { minimized: true, summary: 'Short.' }));
  assert.equal(audio.paused, true, 'minimizing stops it');
  assert.equal($('[data-explanation-audio]'), null, 'no pill on the tile');
  assert.ok($('[data-explanation-tile]'));
  await mount(card('a'));
  await click($('[data-audio-play]'));
  const again = audios.at(-1);
  assert.equal(again.paused, false);
  await B.act(async () => root.unmount());
  root = null;
  assert.equal(again.paused, true, 'unmounting (the board closing) stops it');
});

test('an audio error or a stall shows a button-local failure, no toast, and the next press tries again', async () => {
  reset();
  await mount(card('a'));
  await click($('[data-audio-play]'));
  const audio = audios[0];
  await raise(audio, 'error');
  assert.equal($('[data-explanation-audio]').getAttribute('data-audio-state'), 'failed');
  assert.equal($('[data-audio-play]').getAttribute('title'), 'Audio could not play. Try again.');
  assert.equal($('[data-audio-time]'), null, 'no time is shown');
  assert.equal(audio.paused, true);
  assert.deepEqual(toasts, [], 'no toast');
  await click($('[data-audio-play]'));
  assert.equal(audio.plays, 2);
  assert.equal($('[data-audio-play]').getAttribute('title'), 'Pause explanation');
  await raise(audio, 'stalled');
  assert.equal($('[data-explanation-audio]').getAttribute('data-audio-state'), 'failed');
});

test('a card this viewer cannot edit draws no pill (the audio route is owner-only)', async () => {
  reset();
  await mount(card('a'), { readOnly: true });
  assert.equal($('[data-explanation-audio]'), null);
  assert.equal(audios.length, 0);
});

test('a press on the pill never reaches the card (no drag, no selection)', async () => {
  reset();
  let reached = false;
  await mount(card('a'), { onPointerDown: () => { reached = true; } }); // a React handler on an ancestor, as the canvas's card drag is
  await B.act(async () => { $('[data-audio-play]').dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true })); });
  assert.equal(reached, false);
});

test('the playing card id follows audible playback: set on play, cleared on pause, end, failure, another card and unmount', async () => {
  reset();
  await mount(card('a', { narration: ready('fs_a') }), card('b', { narration: ready('fs_b') }));
  const [first, second] = $$('[data-explanation-audio]');
  assert.equal(B.getPlayingCard(), null, 'idle: nothing plays');
  await click(first.querySelector('[data-audio-play]'));
  assert.equal(B.getPlayingCard(), 'a');
  await click(first.querySelector('[data-audio-play]'));
  assert.equal(B.getPlayingCard(), null, 'paused');
  await click(first.querySelector('[data-audio-play]'));
  await click(second.querySelector('[data-audio-play]'));
  assert.equal(B.getPlayingCard(), 'b', 'starting another card moves it, and the first card pausing does not clear the new one');
  await raise(audios[1], 'ended', { ended: true, paused: true });
  assert.equal(B.getPlayingCard(), null, 'ended');
  await click(second.querySelector('[data-audio-replay]'));
  assert.equal(B.getPlayingCard(), 'b');
  await raise(audios[1], 'error');
  assert.equal(B.getPlayingCard(), null, 'a failure');
  await click(first.querySelector('[data-audio-replay]'));
  assert.equal(B.getPlayingCard(), 'a');
  await B.act(async () => root.unmount());
  root = null;
  assert.equal(B.getPlayingCard(), null, 'unmounting');
});

test('the transcript window data follows the audio: opens on play with the script, t and d from timeupdate, stays on pause and at the end, replaces on another card, closes on failure and unmount', async () => {
  reset(); B.closeTranscript('a'); B.closeTranscript('b');
  await mount(card('a', { narration: ready('fs_a', { script: 'First card words.' }) }), card('b', { narration: ready('fs_b', { script: 'Second card words.' }) }), card('c', { narration: ready('fs_c', { script: '' }) }));
  const [first, second, third] = $$('[data-explanation-audio]');
  assert.equal(B.getTranscript(), null, 'idle: no window');
  await click(first.querySelector('[data-audio-play]'));
  assert.deepEqual(B.getTranscript(), { cardId: 'a', script: 'First card words.', t: 0, d: 0 });
  await raise(audios[0], 'timeupdate', { currentTime: 3, duration: 10 });
  assert.equal(B.getTranscript().t, 3); assert.equal(B.getTranscript().d, 10);
  await click(first.querySelector('[data-audio-play]'));
  assert.equal(B.getTranscript()?.cardId, 'a', 'paused: the window stays, frozen');
  await click(first.querySelector('[data-audio-play]'));
  assert.equal(B.getTranscript().t, 3, 'a resume keeps the position');
  await click(second.querySelector('[data-audio-play]'));
  assert.equal(B.getTranscript().cardId, 'b', 'another card starting takes the window');
  await raise(audios[1], 'timeupdate', { currentTime: 4, duration: 8 });
  await raise(audios[1], 'ended', { ended: true, paused: true });
  assert.equal(B.getTranscript().t, 8, 'the end keeps the window with the full text'); assert.equal(B.getTranscript().d, 8);
  await click(second.querySelector('[data-audio-replay]'));
  assert.equal(B.getTranscript().t, 0, 'a replay starts the window again');
  await click(third.querySelector('[data-audio-play]'));
  assert.equal(B.getTranscript(), null, 'a card with no script has no window');
  await click(first.querySelector('[data-audio-replay]'));
  assert.equal(B.getTranscript().cardId, 'a');
  await raise(audios[0], 'error');
  assert.equal(B.getTranscript(), null, 'a failure closes it');
  await click(second.querySelector('[data-audio-replay]'));
  await B.act(async () => root.unmount());
  root = null;
  assert.equal(B.getTranscript(), null, 'unmounting closes it');
});

test('the window shows narration.transcript (LaTeX) when there is one, else the script; the voice file is the same either way', async () => {
  reset(); B.closeTranscript('a');
  await mount(card('a', { narration: ready('fs_a', { script: 'e to the minus one per step.', transcript: 'Decay is $e^{-1}$ per step.' }) }));
  await click($('[data-audio-play]'));
  assert.equal(B.getTranscript().script, 'Decay is $e^{-1}$ per step.', 'the displayed text is the LaTeX transcript');
  assert.equal(reads.length, 1, 'the same one audio file is read');
  await mount(card('a', { narration: ready('fs_a2', { script: 'plain spoken words.', transcript: '  ' }) }));
  await click($('[data-audio-play]'));
  assert.equal(B.getTranscript().script, 'plain spoken words.', 'a blank transcript falls back to the script');
  await B.act(async () => root.unmount());
  root = null;
});
