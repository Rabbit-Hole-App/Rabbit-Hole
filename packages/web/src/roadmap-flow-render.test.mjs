// After Accept roadmap (production crash, undefined.left): render the real surfaces with the real hook's return and the recorded accepted-plan
// views, markup only, no browser. useRoadmap's own return feeds RoadmapCanvas and the Table of contents, so a missing field throws here.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { pillOf, tocOf } from './roadmap-client.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const tmp = mkdtempSync(join(tmpdir(), 'roadmap-flow-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { useRoadmap } from './use-roadmap.js'; export { RoadmapCanvas } from './RoadmapSurfaces.jsx'; export { default as TableOfContents } from './TableOfContents.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);

// The hook as the page uses it (nothing fetched during markup rendering), its return captured.
function hookReturn() {
  let out;
  const Probe = () => { out = lib.useRoadmap({ api: async () => { throw new Error('no network in markup'); }, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host: {}, enabled: true }); return null; };
  lib.renderToStaticMarkup(lib.createElement(Probe));
  return out;
}
const seeded = name => {
  const state = { view: view(name), busy: [], editing: false, flag: 'on', notice: null, invitation: null, limitation: null, draft: null };
  return { state, pill: pillOf(state), toc: tocOf(state) };
};

test('the hook returns what RoadmapCanvas and the canvas overlay read', () => {
  const r = hookReturn();
  for (const key of ['position', 'surface', 'showOverlay', 'acceptPlan', 'go', 'toc', 'pill', 'controller', 'state']) assert.ok(key in r, `${key} is returned`);
  assert.equal(typeof r.position.left, 'number');
  assert.equal(typeof r.surface.width, 'number');
});

test('Accept roadmap, first proposal pending: the canvas overlay renders from the hook position, the ToC renders the accepted rows', () => {
  const base = hookReturn(), s = seeded('status-active-proposal-pending');
  assert.ok(s.pill, 'the accepted plan has a pending first proposal');
  const roadmap = { ...base, ...s, showOverlay: true, controller: base.controller };
  const canvas = lib.renderToStaticMarkup(lib.createElement(lib.RoadmapCanvas, { roadmap, hosted: false }));
  assert.match(canvas, /data-roadmap-overlay/);
  assert.ok(canvas.includes(s.pill.title));
  const toc = lib.renderToStaticMarkup(lib.createElement(lib.TableOfContents, { roadmap, outline: [], canvasApi: { current: null } }));
  assert.match(toc, /data-roadmap-step/);
  assert.ok(toc.includes(s.toc.steps[0].title));
});

test('every recorded status view renders on the canvas and in the ToC without throwing', () => {
  const base = hookReturn();
  for (const name of ['status-active-proposal-pending', 'status-delivered-next-ready', 'status-held-for-checking', 'status-failed-card', 'status-cancelled-paused', 'status-completed', 'status-proposed-plan', 'accept-proposal-response-generating']) {
    const s = seeded(name), roadmap = { ...base, ...s, showOverlay: !!s.pill };
    lib.renderToStaticMarkup(lib.createElement(lib.RoadmapCanvas, { roadmap, hosted: false }));
    lib.renderToStaticMarkup(lib.createElement(lib.TableOfContents, { roadmap, outline: [], canvasApi: { current: null } }));
  }
});
