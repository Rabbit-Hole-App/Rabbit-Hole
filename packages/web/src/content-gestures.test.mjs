// Zoom belongs to the content under the cursor (owner, 2026-10-22; content-gestures.js). DOM-level: the real cards are bundled
// with esbuild and mounted with react-dom into linkedom, under a stand-in canvas whose NATIVE wheel listener sits on an ancestor,
// as AdaptiveCanvas's does. The 3D renderer is faked (no WebGL here): its canvas takes the wheel the way OrbitControls does
// (preventDefault, only while interacting) and records each hover zoom.
//
// The reported bug (3D model and canvas zooming together) reproduced here first: the canvas's 3D model card (ThreeDBody, orbit
// always live) stopped the wheel with React's onWheel, which runs at React's root, after the canvas's native listener had already
// moved the camera. The first test failed on ebd0ea74 with the canvas listener reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { dollyFactor, holdContentGestures } from './content-gestures.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="canvas"><div id="app"></div></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { constructor(callback) { this.callback = callback; } observe(target) { this.callback([{ isIntersecting: true, target }]); } disconnect() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
// A card frame 640 x 400 at the canvas's 100%.
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 640; } });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 400; } });
window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 400, width: 640, height: 400, x: 0, y: 0 });

// Every request the cards make while mounted; a gesture must add none (no AI call, no recapture).
const requests = [];
globalThis.fetch = async url => { requests.push(String(url)); return new Response(JSON.stringify({ v: 1, width: 1280, height: 3000, tiles: [], text: null }), { status: 200, headers: { 'content-type': 'application/json' } }); };

const three = { orbit: 0, zoom: [] };
globalThis.__three = three;
const FAKE_RENDERER = `export function createThreeDRenderer(host, props, onChange, onReady) {
  const gl = document.createElement('canvas'); host.appendChild(gl); let on = false;
  gl.addEventListener('wheel', event => { if (on) { event.preventDefault(); globalThis.__three.orbit += 1; } }, { passive: false });
  setTimeout(() => onReady([], { size: [1, 1, 1] }), 0);
  return { interact(value) { on = value; }, zoom(factor) { globalThis.__three.zoom.push(factor); }, update() {}, destroy() {}, camera() { return null; }, fit() {}, background() {}, poster() { return null; }, redraw() {}, project() { return []; } };
}`;

const dir = mkdtempSync(join(tmpdir(), 'content-gestures-')), outfile = join(dir, 'cards.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { CadPreview } from './CadCard.jsx'; export { default as WebpageCard } from './WebpageCard.jsx'; export { setFileScope } from './file-source-client.js'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /three-d-renderer\.js$/ }, () => ({ path: 'renderer', namespace: 'fake3d' }));
    build.onLoad({ filter: /.*/, namespace: 'fake3d' }, () => ({ contents: FAKE_RENDERER }));
  } }],
});
// Bundled, React's act() queues its tasks through a MessageChannel, whose ports would keep the run alive after the last test;
// a setImmediate stand-in delivers the same task.
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// The stand-in canvas: a native, non-passive wheel listener on an ancestor (AdaptiveCanvas: surface.addEventListener('wheel')).
const canvas = { wheel: 0 };
document.getElementById('canvas').addEventListener('wheel', event => { canvas.wheel += 1; event.preventDefault(); }, { passive: false });
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.getElementById('canvas').addEventListener(type, () => { canvas.wheel += 1; });

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
let root = null;
const mount = async element => {
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').innerHTML = '';
  root = B.createRoot(document.getElementById('app'));
  await B.act(async () => root.render(element));
  await settle();
};
const wheel = (target, init = {}) => {
  const event = new window.Event('wheel', { bubbles: true, cancelable: true });
  Object.assign(event, { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false, clientX: 320, clientY: 200, ...init });
  target.dispatchEvent(event);
  return event;
};
const gesture = (target, type, scale) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { scale, clientX: 320, clientY: 200 });
  target.dispatchEvent(event);
  return event;
};
const reset = () => { canvas.wheel = 0; three.orbit = 0; three.zoom.length = 0; requests.length = 0; };
const act = fn => B.act(async () => { fn(); });

test('canvas 3D model card: the wheel and pinch zoom the model once and never reach the canvas (the reported double zoom)', async () => {
  await mount(B.createElement(B.LearningBlockBody, { block: { id: 'm1', type: 'model3d', status: 'ready', modelUrl: 'blob:model', title: 'Model' }, onChange() {} }));
  const viewer = document.querySelector('[data-three-d-viewer]');
  assert.equal(viewer.getAttribute('data-viewer-live'), 'true');
  const gl = viewer.querySelector('canvas');
  reset();
  let event; await act(() => { event = wheel(gl); });
  assert.equal(canvas.wheel, 0, 'the canvas did not pan or zoom');
  assert.equal(three.orbit, 1, 'the model zoomed (OrbitControls on its canvas)');
  assert.equal(three.zoom.length, 0, 'and not a second time');
  assert.equal(event.defaultPrevented, true);
  await act(() => { event = wheel(gl, { ctrlKey: true, deltaY: -4 }); });
  assert.equal(canvas.wheel, 0, 'a trackpad pinch (Ctrl+wheel) never zooms the canvas');
  assert.equal(event.defaultPrevented, true, 'nor the browser page');
  await act(() => { gesture(gl, 'gesturestart', 1); gesture(gl, 'gesturechange', 1.5); event = gesture(gl, 'gestureend', 1.5); });
  assert.equal(canvas.wheel, 0, 'a Safari pinch never reaches the canvas');
  assert.ok(three.zoom.length === 1 && Math.abs(three.zoom[0] - 1.5) < 1e-9, `the Safari pinch zoomed the model 1.5x (${three.zoom})`);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(requests, [], 'no request: no AI call, nothing fetched again');
});

test('CAD 3D viewport: hover is enough (no Interact); an interacting viewer zooms once; the canvas never moves', async () => {
  const manifest = { revisionId: 'r1', artifacts: [{ kind: 'glb', url: '/api/learn/cad/x.glb' }] };
  await mount(B.createElement(B.CadPreview, { manifest, active: true, id: 'c1' }));
  const viewer = document.querySelector('[data-cad-viewer]');
  assert.equal(viewer.getAttribute('data-viewer-live'), 'true');
  assert.equal(viewer.getAttribute('data-viewer-active'), null, 'not interacting');
  reset();
  const surface = viewer.querySelector('[data-cad-click-surface]');
  let event; await act(() => { event = wheel(surface, { deltaY: -100 }); });
  assert.equal(canvas.wheel, 0, 'hovering the model, the wheel is the model\'s');
  assert.equal(three.zoom.length, 1);
  assert.ok(three.zoom[0] > 1, 'a wheel up moves closer');
  assert.equal(event.defaultPrevented, true);
  await act(() => { wheel(surface, { ctrlKey: true, deltaY: 3 }); });
  assert.equal(canvas.wheel, 0);
  assert.ok(three.zoom[1] < 1 && Math.abs(three.zoom[1] - dollyFactor({ deltaY: 3, deltaMode: 0, ctrlKey: true })) < 1e-12, 'a pinch out moves away, at pinch strength');
  assert.deepEqual(requests.filter(url => !url.includes('x.glb')), [], 'no request beyond the model itself');
});

test('the gesture helper: a wheel the content gives back goes on; a Ctrl+wheel inside a Safari pinch is not counted twice', async () => {
  const host = document.createElement('div'), seen = [];
  document.getElementById('canvas').appendChild(host);
  let pass = false;
  const stop = holdContentGestures(host, { wheel: event => { seen.push(['wheel', event.ctrlKey]); return pass ? false : undefined; }, scale: factor => seen.push(['scale', factor]) });
  reset();
  pass = true; const given = wheel(host);
  assert.equal(canvas.wheel, 1, 'given back: the canvas takes it'); assert.equal(given.defaultPrevented, true, 'the canvas stand-in prevented it, not the helper');
  pass = false; reset();
  gesture(host, 'gesturestart', 1); wheel(host, { ctrlKey: true, deltaY: -2 }); gesture(host, 'gesturechange', 2); gesture(host, 'gesturechange', 3); gesture(host, 'gestureend', 3);
  assert.deepEqual(seen.slice(1), [['scale', 2], ['scale', 1.5]]);
  assert.equal(canvas.wheel, 0);
  stop(); reset(); wheel(host);
  assert.equal(canvas.wheel, 1, 'removed: the wheel is the canvas\'s again');
  host.remove();
});

// ---- the webpage card
const capture = { lineage: 'wc_0123456789abcdef01234567', manifestId: 'fs_aaaaaaaaaaaaaaaaaaaaaaaa', sha256: 'a'.repeat(64), capturedAt: 1, finalUrl: 'https://example.com/a', width: 1280, height: 3000, truncated: { height: false, bytes: false, text: false } };
const fileRef = { source: { id: capture.manifestId, rev: capture.sha256 }, bundle: [] };
const webBlock = (over = {}) => ({ id: 'w1', type: 'webpage', x: 10, y: 20, w: 640, h: 460, url: 'https://example.com/a', title: 'Example Domain', capture, fileRef, pending: null, failure: null, scrollTop: 0, scrollLocked: false, ...over });
const column = () => document.querySelector('[data-webcard-column]');
const view = () => { const style = column().getAttribute('style'); return { width: Number(/width:\s*([\d.]+)px/.exec(style)[1]), x: Number(/translateX\((-?[\d.e+-]+)px\)/.exec(style)[1]), y: Number(/translateY\((-?[\d.e+-]+)px\)/.exec(style)[1]) }; };

test('webpage card, unlocked: the wheel scrolls the page, Ctrl/Cmd+wheel and a pinch zoom it at the cursor; nothing reaches the canvas or fetches', async () => {
  B.setFileScope({ app: 'demo', board: 'main' });
  const saved = [];
  const block = webBlock();
  await mount(B.createElement(B.WebpageCard, { block, appName: 'demo', selected: false, zoom: 1, onChange: next => saved.push(next), onChangeQuiet: next => saved.push(next), onRemove() {} }));
  const frame = document.querySelector('[data-webcard-frame]');
  assert.deepEqual(view(), { width: 640, x: 0, y: 0 }, 'the page fits the card width');
  reset();
  let event; await act(() => { event = wheel(frame, { deltaY: -100 }); });
  assert.equal(canvas.wheel, 0, 'at the top, a wheel up stops at the limit: it does not pan the canvas');
  assert.equal(event.defaultPrevented, true);
  await act(() => { wheel(frame, { deltaY: 100 }); });
  assert.deepEqual(view(), { width: 640, x: 0, y: -100 }, 'the page scrolled');
  await act(() => { event = wheel(frame, { ctrlKey: true, deltaY: -200 }); });
  assert.equal(canvas.wheel, 0, 'Ctrl+wheel zoomed the page, not the canvas');
  assert.equal(event.defaultPrevented, true, 'nor the browser page');
  const zoomed = view();
  assert.ok(Math.abs(zoomed.width - 640 * Math.exp(0.4)) < 1e-6, `zoomed in (${zoomed.width})`);
  // The point under the cursor (320, 200 in the frame) stays put: before it was page px (320, 100 + 200) at scale 0.5.
  const s = zoomed.width / 1280;
  assert.ok(Math.abs((320 - zoomed.x) / s - 640) < 1e-6 && Math.abs((200 - zoomed.y) / s - 600) < 1e-6, `the cursor's point stays (${JSON.stringify(zoomed)})`);
  await act(() => { event = wheel(frame, { metaKey: true, deltaY: -5000 }); });
  assert.equal(view().width, 640 * 4, 'Cmd+wheel zooms too, and holds at 4x');
  await act(() => { event = wheel(frame, { ctrlKey: true, deltaY: -100 }); });
  assert.equal(view().width, 640 * 4); assert.equal(canvas.wheel, 0, 'at the zoom limit the gesture still stops here'); assert.equal(event.defaultPrevented, true);
  await act(() => { wheel(frame, { deltaX: 100, deltaY: 0 }); });
  assert.ok(view().x < zoomed.x, 'zoomed in, a sideways wheel scrolls sideways');
  await act(() => { gesture(frame, 'gesturestart', 1); event = gesture(frame, 'gesturechange', 0.5); gesture(frame, 'gestureend', 0.5); });
  assert.equal(view().width, 640 * 2, 'a Safari pinch in zooms out');
  assert.equal(event.defaultPrevented, true); assert.equal(canvas.wheel, 0);
  await act(() => { wheel(frame, { ctrlKey: true, deltaY: 5000 }); });
  assert.equal(view().width, 640, 'and holds at the card width');
  assert.equal(canvas.wheel, 0);
  assert.deepEqual(requests, [], 'scrolling and zooming fetch nothing: no AI call, no recapture');
  assert.ok(saved.every(next => next.x === block.x && next.y === block.y && next.w === block.w && next.h === block.h), 'the card keeps its place and size');
  B.setFileScope(null);
});

test('webpage card, scroll-locked: a plain wheel goes on to the canvas; a zoom gesture is held and zooms nothing', async () => {
  B.setFileScope({ app: 'demo', board: 'main' });
  await mount(B.createElement(B.WebpageCard, { block: webBlock({ scrollLocked: true }), appName: 'demo', selected: true, zoom: 1, onChange() {}, onChangeQuiet() {}, onRemove() {} }));
  const frame = document.querySelector('[data-webcard-frame]');
  reset();
  await act(() => { wheel(frame); });
  assert.equal(canvas.wheel, 1, 'locked: the wheel pans the canvas');
  assert.deepEqual(view(), { width: 640, x: 0, y: 0 }, 'and the page stays');
  reset();
  let event; await act(() => { event = wheel(frame, { ctrlKey: true, deltaY: -200 }); });
  assert.equal(canvas.wheel, 0, 'a blocked zoom does not leak to the canvas');
  assert.equal(event.defaultPrevented, true, 'nor to the browser');
  await act(() => { gesture(frame, 'gesturestart', 1); event = gesture(frame, 'gesturechange', 2); gesture(frame, 'gestureend', 2); });
  assert.equal(canvas.wheel, 0); assert.equal(event.defaultPrevented, true);
  assert.deepEqual(view(), { width: 640, x: 0, y: 0 }, 'nothing zoomed');
  assert.deepEqual(requests, []);
  B.setFileScope(null);
});

test.after(async () => { if (root) await B.act(async () => root.unmount()); });
