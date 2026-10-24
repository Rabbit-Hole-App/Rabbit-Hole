// The CAD viewer recovers in place (owner bug report 2026-10-23: a card reached Ready, showed its saved image and "The 3D viewer
// could not load. The saved preview is shown.", and only a page refresh brought the 3D view). That notice is the module branch
// of CadPreview: a dynamic import of the viewer's code failed. The real CadPreview is bundled with esbuild and mounted into
// linkedom; the viewer's two lazy modules are real ES modules on disk, imported by Node, whose loader keeps a module that
// failed as failed for its URL, as a browser does. Each module throws a browser's import error while `served` says the server
// does not have it. On the build before this change: the Building -> Ready test fails (the code is first asked for at Ready,
// after the "deploy"), and the Retry tests fail (Retry imported the same failed URL again, so only a reload could recover).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
let reloads = 0;
Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'http://localhost', href: 'http://localhost/apps/x', reload() { reloads += 1; } } });
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true });
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { constructor(callback) { this.callback = callback; } observe(target) { this.callback([{ isIntersecting: true, target }]); } disconnect() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

// A one-triangle GLB that passes inspectGlb.
function glb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 36 }] })), length = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(20 + length + 8 + 36, 32);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); json.copy(bytes, 20);
  bytes.writeUInt32LE(36, 20 + length); bytes.writeUInt32LE(0x004e4942, 24 + length);
  return bytes;
}
const GLB = glb();
// The server: which built chunks it has now, what the model request answers, and every request made.
const served = { renderer: true, loaders: true }, glbAnswers = [], requests = [];
globalThis.__served = served;
globalThis.__evaluated = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = init.method || 'GET';
  requests.push(`${method} ${url}`);
  if (method === 'HEAD' && url.startsWith('http://localhost/static/')) return new Response(null, { status: served.renderer && served.loaders ? 200 : 404 });
  if (url.includes('fd_thumbnail')) return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
  if (url.includes('fd_glb')) { const status = glbAnswers.shift() ?? 200; return status === 200 ? new Response(GLB, { status, headers: { 'content-type': 'model/gltf-binary' } }) : new Response('unavailable', { status }); }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

// The viewer's lazy modules. `served[kind]`: true (on the server), false (gone or failing) or 'once' (the first request fails).
const dir = mkdtempSync(join(tmpdir(), 'cad-viewer-recovery-'));
const chunk = (kind, built, body) => `globalThis.__evaluated.push('${kind}' + new URL(import.meta.url).search);
if (globalThis.__served.${kind} !== true) { if (globalThis.__served.${kind} === 'once') globalThis.__served.${kind} = true; throw new TypeError('Failed to fetch dynamically imported module: http://localhost/static/${built}'); }
${body}`;
writeFileSync(join(dir, 'renderer.mjs'), chunk('renderer', 'three-d-renderer-Old1.js', `export function createThreeDRenderer(host, props, onChange, onReady, onError, options = {}) {
  const gl = document.createElement('canvas'); host.appendChild(gl); let gone = false;
  // As three-d-renderer.js: options.load fetches the model and imports model-loaders.js; a failure is reported by its message.
  Promise.resolve().then(() => options.load({})).then(() => { if (!gone) onReady([], { size: [1, 1, 1], kind: 'mesh' }); }, error => { if (!gone) onError(error.message); });
  return { interact() {}, zoom() {}, update() {}, destroy() { gone = true; gl.remove(); }, camera() { return null; }, fit() {}, background() {}, poster() { return null; }, redraw() {}, project() { return []; } };
}`));
writeFileSync(join(dir, 'loaders.mjs'), chunk('loaders', 'model-loaders-Old2.js', 'export async function loadModel() { return { object: {}, animations: [], kind: "mesh" }; }'));
const moduleUrl = (kind, tag, retry = '') => `${pathToFileURL(join(dir, `${kind}.mjs`)).href}?case=${tag}${retry}`;

// One bundle per test, so each test's modules are first imported in that test (Node, like a browser, keeps one record per URL).
async function bundle(tag) {
  const outfile = join(dir, `cad-${tag}.cjs`);
  await esbuild.build({
    stdin: { contents: "export { CadPreview, chunkImport, importFresh } from './CadCard.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
    bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
    loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
    plugins: [{ name: 'chunks', setup(build) {
      build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
      build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
      build.onResolve({ filter: /three-d-renderer\.js$/ }, () => ({ path: moduleUrl('renderer', tag), external: true }));
      build.onResolve({ filter: /model-loaders\.js$/ }, () => ({ path: moduleUrl('loaders', tag), external: true }));
    } }],
  });
  const B = createRequire(import.meta.url)(outfile);
  // The browser's import of a built chunk's URL, here the same module file under that URL's query (a new record).
  B.chunkImport.load = url => { requests.push(`IMPORT ${url}`); const { pathname, search } = new URL(url); return import(moduleUrl(pathname.includes('three-d-renderer') ? 'renderer' : 'loaders', tag, search.replace('?', '&'))); };
  return B;
}
// Bundled, React's act() queues its tasks through a MessageChannel, whose ports would keep the run alive after the last test.
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
test.after(() => rmSync(dir, { recursive: true, force: true }));

const manifest = { revisionId: 'r1', title: 'Plate', artifacts: [{ kind: 'glb', url: '/api/learn/files/fs_1/d/fd_glb' }, { kind: 'thumbnail', url: '/api/learn/files/fs_1/d/fd_thumbnail' }] };
let B, root;
async function mount(tag, props) {
  if (root) await B.act(async () => root.unmount());
  B = await bundle(tag); document.getElementById('app').innerHTML = '';
  root = B.createRoot(document.getElementById('app'));
  await render(props);
}
const render = props => B.act(async () => { root.render(B.createElement(B.CadPreview, { active: true, id: 'card-1', ...props })); });
const viewer = () => document.querySelector('[data-cad-viewer]');
const live = () => viewer()?.getAttribute('data-viewer-live') === 'true';
const fallback = () => viewer()?.querySelector('[data-cad-viewer-fallback]');
async function until(check, label) {
  for (let i = 0; i < 100; i++) { if (check()) return; await B.act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
  throw new Error(label);
}
const click = element => B.act(async () => { element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); });
const reset = () => { requests.length = 0; globalThis.__evaluated.length = 0; glbAnswers.length = 0; Object.assign(served, { renderer: true, loaders: true }); };

test('Building -> Ready: the viewer code loads while the card builds, so a deploy during the build cannot strand it; the model goes live in place', async () => {
  reset();
  await mount('building', { manifest: null });
  await until(() => globalThis.__evaluated.length === 2, 'warm').catch(() => {}); // asserted below, after the owner's symptom
  const whileBuilding = [...globalThis.__evaluated].sort();
  assert.equal(live(), false);
  assert.ok(!requests.some(entry => entry.includes('fd_glb')), 'no model is asked for before it exists');
  // A deploy replaces the hashed chunks while the job runs: the tab's chunk URLs now fail.
  Object.assign(served, { renderer: false, loaders: false });
  await render({ manifest }); // the poll flips the card to Ready: the same mounted viewer gets the manifest with its GLB
  await until(() => live() || fallback(), 'the viewer neither went live nor failed when the GLB appeared');
  assert.equal(fallback()?.textContent ?? null, null, 'no fallback (the reported symptom)');
  assert.deepEqual(whileBuilding, ['loaders?case=building', 'renderer?case=building'], 'the viewer code loaded while the card was building');
  assert.ok(live());
  assert.ok(!requests.some(entry => entry.startsWith('IMPORT')), 'no retry was needed');
  assert.equal(requests.filter(entry => entry.includes('fd_glb')).length, 1, 'the saved model, fetched once');
  assert.equal(reloads, 0);
});

test('a first chunk request that fails (a first-load race or blip) is retried at once under a fresh URL; the viewer goes live with no fallback', async () => {
  reset(); served.renderer = 'once';
  await mount('blip', { manifest });
  await until(live, 'the viewer did not recover from one failed chunk request');
  assert.equal(fallback(), null);
  assert.deepEqual(requests.filter(entry => entry.startsWith('IMPORT')).map(entry => entry.replace(/retry=\d+/, 'retry=n')), ['IMPORT http://localhost/static/three-d-renderer-Old1.js?retry=n']);
  assert.equal(reloads, 0);
});

test('a chunk that stays unavailable for a while: the saved preview and Retry, then Retry loads the 3D view in place (no reload)', async () => {
  reset(); served.renderer = false;
  await mount('outage', { manifest });
  await until(() => fallback(), 'no fallback for a viewer whose code could not load');
  assert.equal(fallback().getAttribute('data-cad-viewer-fallback'), 'module');
  assert.match(fallback().textContent, /The 3D viewer could not load\. The saved preview is shown\./);
  assert.ok(viewer().querySelector('[data-cad-poster]'), 'the saved preview is shown');
  served.renderer = true; // the server answers again; the browser still holds the failed import of the original URL
  await click(fallback().querySelector('[data-cad-viewer-retry]'));
  await until(live, 'Retry did not load the viewer in place');
  assert.equal(fallback(), null);
  const imports = requests.filter(entry => entry.startsWith('IMPORT'));
  assert.equal(new Set(imports).size, imports.length, 'every retry asks under a URL not tried before');
  assert.equal(requests.filter(entry => entry.includes('fd_glb')).length, 1, 'the saved model, fetched once it could be shown');
  assert.equal(reloads, 0);
});

test('a model download that fails once: the fallback names it, Retry fetches the saved model again and goes live', async () => {
  reset(); glbAnswers.push(503);
  await mount('glb', { manifest });
  await until(() => fallback(), 'no fallback for a failed model download');
  assert.equal(fallback().getAttribute('data-cad-viewer-fallback'), 'model');
  assert.match(fallback().textContent, /Model download failed \(503\)/);
  await click(fallback().querySelector('[data-cad-viewer-retry]'));
  await until(live, 'Retry did not fetch the model again');
  assert.equal(requests.filter(entry => entry.includes('fd_glb')).length, 2);
  assert.equal(reloads, 0);
});

test('a chunk gone for good (a deploy before the card mounted): the honest fallback, Retry, then Reload to update on a click only', async () => {
  reset(); served.loaders = false;
  await mount('gone', { manifest });
  await until(() => fallback(), 'no fallback for a gone chunk');
  assert.equal(fallback().getAttribute('data-cad-viewer-fallback'), 'module');
  assert.equal(fallback().querySelector('[data-cad-reload-update]'), null, 'Retry first');
  await click(fallback().querySelector('[data-cad-viewer-retry]'));
  await until(() => fallback()?.querySelector('[data-cad-reload-update]'), 'a confirmed gone chunk did not offer Reload to update');
  assert.match(fallback().textContent, /older version of Rabbit Hole/);
  assert.ok(requests.includes('HEAD http://localhost/static/model-loaders-Old2.js'), 'the gone chunk was checked by its clean URL');
  assert.equal(live(), false);
  assert.equal(reloads, 0, 'never reloads on its own');
  await B.act(async () => root.unmount()); root = null;
});

test("importFresh retries only an import error naming one of this origin's built chunks, and returns only the module asked for", async () => {
  const H = await bundle('helper'), asked = [];
  H.chunkImport.load = async url => { asked.push(url); return url.includes('dep-') ? { other: 1 } : { wanted: 1 }; };
  const failing = message => () => Promise.reject(new TypeError(message));
  const chrome = 'Failed to fetch dynamically imported module: http://localhost/static/viewer-A1.js';
  assert.deepEqual(await H.importFresh(failing(chrome), 'wanted', 'http://localhost'), { wanted: 1 });
  assert.deepEqual(await H.importFresh(failing('error loading dynamically imported module: http://localhost/static/viewer-A1.js'), 'wanted', 'http://localhost'), { wanted: 1 }, 'Firefox words');
  assert.equal(asked.length, 2); assert.notEqual(asked[0], asked[1], 'a new URL each time');
  assert.match(asked[0], /^http:\/\/localhost\/static\/viewer-A1\.js\?retry=\d+$/);
  for (const message of ['Failed to fetch dynamically imported module: https://evil.example/static/viewer-A1.js', 'Failed to fetch dynamically imported module: http://localhost/api/x.js', 'Importing a module script failed.', 'createThreeDRenderer is not a function'])
    await assert.rejects(H.importFresh(failing(message), 'wanted', 'http://localhost'), { message }, `not retried: ${message}`);
  await assert.rejects(H.importFresh(failing(chrome.replace('viewer-A1', 'dep-B2')), 'wanted', 'http://localhost'), /dep-B2/, 'a module without the export: the original error');
  assert.equal(asked.length, 3, 'only the same-origin chunk failures were retried');
  assert.deepEqual(await H.importFresh(async () => ({ wanted: 2 }), 'wanted', 'http://localhost'), { wanted: 2 }, 'a working import is used as is');
  assert.equal(asked.length, 3);
});
