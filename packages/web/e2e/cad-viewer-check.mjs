// The CAD card's viewer and controls (UI changes brief section 4, clarifications 4, 7 and 8; cad-controls placement
// requirement), against the LOCAL stack only. The board save is real; the CAD job routes, the fixture GLB/thumbnail/STEP and
// (in the fallback steps) the model-loaders chunk are answered in the browser; every other model-capable request is aborted
// and counted, so no model or executor is ever called. A synthetic triangle proves UI wiring, not CAD quality.
//   1. a completed model renders live 3D without selecting it; no control sits in the viewer; Edit and Explain are gone;
//      a pending job shows its spinner (data-gen-active true), a failed one none;
//   2. the wheel over the live, unentered viewer zooms the model and never moves the canvas (owner, 2026-10-22: hover is
//      enough); one click enters the model (Interact pressed, Done shown);
//      orbit stays in the viewer; Escape returns control and leaves the card selected; deselecting ends interaction;
//   3. the selected card's toolbar holds Interact, Fit view and Show dimensions; keyboard Enter enters, tooltips and a
//      focus ring show on focus, every icon target is at least 32 px; Fit view leaves the canvas where it was;
//   4. Show dimensions is off by default, kept in this browser per account and card (not on the board), after a reload too;
//   5. Expand and Download are icon buttons with names and tooltips; Download gives STEP; the context menu's Download STEP
//      downloads too;
//   6. White / Black / None paint the viewport only, save on the card, survive a reload, and a share-link viewer sees the
//      choice without the control;
//   7. the expanded view has the same tools in its own toolbar; Escape there ends interaction first, the panel stays;
//      the card keeps its camera when its viewer gives the slot up for the expanded one and takes it back;
//   8. at most three viewers render at once; the others show the saved preview, never an error;
//   9. a viewer whose model-loaders chunk is gone (404, as production after a release) shows the saved preview and Retry,
//      never the raw import error and never an automatic reload; after a failed Retry the stale build is confirmed and
//      Reload to update is offered, blocked while a chat draft is typed, and reloads only on its click;
//  10. Building -> Ready in the same tab: the finished card loads its interactive 3D model with no reload, under the same
//      card id, with no second job started and a typed draft kept (owner bug report 2026-10-23: the card reached Ready,
//      showed the saved image and "The 3D viewer could not load", and only a page refresh fixed it);
//  11. a model download that fails once: the fallback names it and Retry fetches the saved model again, in place;
//  12. a viewer chunk the server does not have (the tab is older than a release) and then has again: the fallback, then
//      Retry loads it under a fresh URL in place, never by an automatic reload; a draft is kept;
//  13. a model that stays unavailable: the saved preview, the message and a working Retry, until the model is served;
//  14. no browser errors and no model requests.
// Before this change step 1 fails: the completed card shows its thumbnail until selected, and Edit / Explain are present.
// Usage: BASE=http://127.0.0.1:9151 SMALL_CP=http://127.0.0.1:9153 VARS=<cp .dev.vars> node e2e/cad-viewer-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:9151';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9153';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('cad-viewer-check runs against the local stack only');
const OUT = process.argv[2] || 'cad-viewer-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cadv-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// ---------------------------------------------------------------- fixture: one ready model, one pending, one failed; extra ready ones for the cap
await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `cadv_${run}` }) });
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `CAD viewer ${run}` }) });
const manifest = id => ({ schema: 'cad-model/1', revisionId: 'revision-1', title: 'Fixture plate', units: 'mm', parameters: { length: 40 }, assumptions: ['Fixture.'], validation: { baselinePassed: true, checks: [], unchecked: [] }, artifacts: [
  { kind: 'glb', name: 'model.glb', url: `/api/learn/files/fs_${id}/d/fd_glb` }, { kind: 'step', name: 'model.step', url: `/api/learn/files/fs_${id}/d/fd_step` }, { kind: 'thumbnail', name: 'thumbnail.svg', url: `/api/learn/files/fs_${id}/d/fd_thumbnail` }] });
const ready = (id, dx, dy, extra = {}) => ({ type: 'cad', id, jobId: `job-${id}`, modelId: 'm', revisionId: 'revision-1', status: 'ready', title: `Plate ${id}`, units: 'mm', w: 460, h: 420, dx, dy, briefSummary: 'Fixture.', manifest: manifest(id), acceptedManifest: manifest(id), ...extra });
const MAIN = 'cad-main';
const blocks = [ready(MAIN, 0, 140), { type: 'cad', id: 'cad-pending', jobId: 'job-cad-pending', modelId: 'm', revisionId: null, status: 'building', title: 'Pending plate', units: 'mm', w: 460, h: 300, dx: 560, dy: 140, briefSummary: 'Fixture.' },
  { type: 'cad', id: 'cad-failed', jobId: 'job-cad-failed', modelId: 'm', revisionId: null, status: 'failed', title: 'Failed plate', units: 'mm', w: 460, h: 300, dx: 1120, dy: 140, briefSummary: 'Fixture.' }];
const jobs = Object.fromEntries(blocks.map(block => [block.jobId, { id: block.jobId, cardId: block.id, modelId: 'm', state: block.status, stage: block.status, attempt: 1, revisionId: block.revisionId, manifest: block.manifest, createdAt: Date.now() - 4000, updatedAt: Date.now() }]));
const boardPath = `/api/learn/boards/${canvas.name}/main`;
const board = () => api(boardPath).then(out => out.state);
await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks } }) });

function triangleGlb() {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [0.04, 0.02, 0] }] };
  const text = Buffer.from(JSON.stringify(json)), length = Math.ceil(text.length / 4) * 4, bin = Buffer.alloc(36); [0, 0, 0, 0.04, 0, 0, 0, 0.02, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const bytes = Buffer.alloc(12 + 8 + length + 8 + bin.length, 32); bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); text.copy(bytes, 20); bytes.writeUInt32LE(bin.length, 20 + length); bytes.writeUInt32LE(0x004e4942, 24 + length); bin.copy(bytes, 28 + length); return bytes;
}
const GLB = triangleGlb();
const refused = [], outside = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course|artifact))/;
let brokenLoaders = false, brokenRenderer = false, flipReady = false, glbFailures = 0;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  // As production after a release: the tab's hashed chunk is no longer on the server (GET and HEAD both 404).
  if (brokenLoaders && /^\/static\/model-loaders-[^/]+\.js$/.test(url.pathname)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  // As a tab older than a release: the renderer chunk is gone until `brokenRenderer` is cleared (GET and HEAD both 404).
  if (brokenRenderer && /^\/static\/three-d-renderer-[^/]+\.js$/.test(url.pathname)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  const file = url.pathname.match(/^\/api\/learn\/files\/fs_[^/]+\/d\/(fd_glb|fd_step|fd_thumbnail)$/)?.[1];
  if (file === 'fd_glb' && glbFailures > 0) { glbFailures -= 1; return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' }); }
  if (file === 'fd_glb') return route.fulfill({ contentType: 'model/gltf-binary', body: GLB });
  if (file === 'fd_step') return route.fulfill({ contentType: 'model/step', body: 'ISO-10303-21; fixture' });
  if (file === 'fd_thumbnail') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect x="20" y="50" width="120" height="60" fill="#999"/></svg>' });
  if (url.pathname.startsWith('/api/learn/cad/jobs')) {
    if (request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
    const id = url.pathname.split('/')[5];
    // The poll of the card that is building: once `flipReady` it answers Ready with the model's files, as the server does.
    if (id === 'job-cad-flip' && flipReady) { const done = ready('cad-flip', 0, 640); return route.fulfill({ json: { job: { ...jobs[id], state: 'ready', stage: 'ready', revisionId: 'revision-1', manifest: done.manifest }, block: done } }); }
    const current = await board().catch(() => ({ blocks }));
    const block = current.blocks.find(entry => entry.jobId === id) || blocks.find(entry => entry.jobId === id);
    return route.fulfill({ json: id ? { job: jobs[id], block } : { jobs: Object.values(jobs), blocks: current.blocks } });
  }
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 14;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async ({ signedIn = true, path = `/apps/${canvas.name}`, dark = false } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
  if (signedIn) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}${path}`);
  await page.locator(`[data-block-id="${MAIN}"] [data-cad-card]`).waitFor();
  return { context, page };
};
const cardOf = (page, id = MAIN) => page.locator(`[data-block-id="${id}"]`);
const viewerOf = (page, id = MAIN) => cardOf(page, id).locator('[data-cad-viewer]');
const toolsOf = (page, key = MAIN) => page.locator(`[data-cad-tools="${key}"]`);
const interactOf = (page, key = MAIN) => toolsOf(page, key).locator('[data-cad-interact]');
const pixels = async locator => createHash('sha256').update(await locator.screenshot()).digest('hex');
const settled = async locator => { let prior; for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 150)); const now = await pixels(locator); if (now === prior) return now; prior = now; } throw Error('viewer pixels did not settle'); };
const select = async (page, id = MAIN) => { await cardOf(page, id).locator('[data-drag-zone]').first().click(); await toolsOf(page, id).waitFor(); };
const deselect = async page => { await cardOf(page, 'cad-pending').locator('[data-drag-zone]').first().click(); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

const { page } = await open();

await step('a completed model renders live 3D without being selected; no control in the viewer; Edit and Explain are gone; a pending job spins, a failed one does not', async () => {
  await viewerOf(page).locator('canvas').waitFor();
  await until(async () => (await viewerOf(page).getAttribute('data-viewer-live')) === 'true', 'the viewer never went live');
  assert.equal(await cardOf(page).getAttribute('aria-current'), null, 'not selected');
  assert.equal(await viewerOf(page).locator('button').count(), 0, 'no control over the model');
  for (const name of ['Edit', 'Explain', 'Interact', 'Fit view']) assert.equal(await cardOf(page).locator('[data-cad-card]').getByRole('button', { name, exact: true }).count(), 0, `${name} is not in the card`);
  assert.equal(await cardOf(page).locator('[data-cad-action="edit"]').count(), 0);
  const pending = cardOf(page, 'cad-pending').locator('[data-cad-progress]');
  assert.equal(await pending.getAttribute('data-gen-active'), 'true');
  assert.equal(await pending.locator('svg.animate-spin').count(), 1, 'a spinner, not a percentage');
  const failed = cardOf(page, 'cad-failed').locator('[data-cad-progress]');
  assert.equal(await failed.getAttribute('data-gen-active'), 'false');
  assert.equal(await failed.locator('svg.animate-spin').count(), 0, 'a failed job stops its spinner');
  assert.equal(await cardOf(page).locator('[data-alert], [role="alert"]').count(), 0);
  await shot(page, 'after-1-default-live-light');
});

await step('the wheel over the unentered viewer zooms the model, never the canvas; a click enters the model; Escape and deselection give control back', async () => {
  const viewer = viewerOf(page);
  let box = await viewer.boundingBox();
  const before = await cardOf(page).boundingBox(), unzoomed = await settled(viewer);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -240);
  const zoomed = await settled(viewer), moved = await cardOf(page).boundingBox();
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - moved[key]) < 2, `the wheel over an unentered viewer moved the canvas (${key})`);
  assert.notEqual(zoomed, unzoomed, 'the wheel over an unentered viewer did not zoom the model');
  assert.equal(await interactOf(page).getAttribute('aria-pressed'), 'false', 'hovering zoomed without entering');
  await page.mouse.wheel(0, 240); // back to the opening view
  box = await viewer.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await until(async () => (await interactOf(page).getAttribute('aria-pressed')) === 'true', 'a click did not enter the model');
  assert.equal((await interactOf(page).innerText()).trim(), 'Done', 'the active state says how to leave');
  const card = await cardOf(page).boundingBox(), still = await settled(viewer);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 25, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, 120);
  const after = await cardOf(page).boundingBox();
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(card[key] - after[key]) < 2, `${key} moved while interacting`);
  assert.notEqual(await settled(viewer), still, 'the orbit changed the model view');
  await shot(page, 'after-2-interacting-light');
  await page.keyboard.press('Escape');
  await until(async () => (await interactOf(page).getAttribute('aria-pressed')) === 'false', 'Escape did not end interaction');
  assert.equal(await cardOf(page).getAttribute('aria-current'), 'true', 'Escape ended interaction, not the selection');
  await interactOf(page).click();
  await until(async () => (await interactOf(page).getAttribute('aria-pressed')) === 'true', 'Interact did not enter');
  await deselect(page);
  await until(async () => (await viewer.getAttribute('data-viewer-active')) === null, 'deselecting did not end interaction');
});

await step('the toolbar outside the card: names, tooltips and focus ring on focus, 32 px targets, keyboard Enter, Fit view leaves the canvas alone', async () => {
  await select(page);
  const tools = toolsOf(page);
  assert.equal(await cardOf(page).locator('[data-cad-card] [data-cad-tools]').count(), 0, 'the tools are outside the card body');
  for (const [selector, name] of [['[data-cad-interact]', 'Interact'], ['[data-cad-fit]', 'Fit view'], ['[data-cad-dimensions-toggle]', 'Show dimensions']]) {
    const button = tools.locator(selector);
    assert.equal((await button.evaluate(el => el.getAttribute('aria-label') || el.innerText)).trim(), name);
    const size = await button.boundingBox();
    assert.ok(size.width >= 32 && size.height >= 32, `${name} is ${size.width}x${size.height}`);
  }
  await tools.locator('[data-cad-fit]').focus();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); // keyboard focus: :focus-visible
  const focus = await tools.locator('[data-cad-fit]').evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, tip: el.closest('.group\\/tip')?.querySelector('[role="tooltip"]') && getComputedStyle(el.closest('.group\\/tip').querySelector('[role="tooltip"]')).display, label: el.closest('.group\\/tip')?.querySelector('[role="tooltip"]')?.innerText }));
  assert.notEqual(focus.outline, 'none', 'a visible focus ring');
  assert.notEqual(focus.tip, 'none', 'the tooltip shows on keyboard focus');
  assert.equal(focus.label.trim(), 'Fit view');
  await shot(page, 'after-3-toolbar-focus-light');
  const viewer = viewerOf(page), card = await cardOf(page).boundingBox();
  await interactOf(page).focus(); await page.keyboard.press('Enter');
  await until(async () => (await interactOf(page).getAttribute('aria-pressed')) === 'true', 'Enter on Interact did not enter');
  const box = await viewer.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 10, { steps: 8 }); await page.mouse.up();
  const orbited = await settled(viewer);
  await tools.locator('[data-cad-fit]').click();
  assert.notEqual(await settled(viewer), orbited, 'Fit view reframed the model');
  const after = await cardOf(page).boundingBox();
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(card[key] - after[key]) < 2, `Fit view moved the canvas (${key})`);
  await interactOf(page).focus(); // the focus on the toolbar, outside the viewer: Esc is still the viewer's
  await page.keyboard.press('Escape');
  await until(async () => (await interactOf(page).getAttribute('aria-pressed')) === 'false', 'Escape did not end interaction');
  assert.equal(await cardOf(page).getAttribute('aria-current'), 'true', 'that Escape did not also deselect the card');
});

await step('Show dimensions is off by default and kept per account and card in this browser, not on the board', async () => {
  const toggle = toolsOf(page).locator('[data-cad-dimensions-toggle]');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await viewerOf(page).getAttribute('data-cad-dimensions'), 'off');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await viewerOf(page).getAttribute('data-cad-dimensions'), 'on');
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('rh.cad-dimensions:')));
  assert.equal(keys.length, 1); assert.ok(keys[0].includes(`cadv-${run}@example.com`) && keys[0].endsWith(`:${MAIN}`), keys[0]);
  await page.waitForTimeout(1500);
  assert.ok(!JSON.stringify(await board()).includes('imension'), 'nothing about dimensions on the board');
  await page.reload(); await select(page);
  assert.equal(await toolsOf(page).locator('[data-cad-dimensions-toggle]').getAttribute('aria-pressed'), 'true', 'kept after a reload');
  await toolsOf(page).locator('[data-cad-dimensions-toggle]').click();
});

await step('Expand and Download are named icon buttons with tooltips; Download and the context menu Download STEP both download', async () => {
  for (const name of ['Expand', 'Download']) {
    const button = cardOf(page).getByRole('button', { name, exact: true });
    assert.equal((await button.innerText()).trim(), '', `${name} is icon-only`);
    const size = await button.boundingBox(); assert.ok(size.width >= 32 && size.height >= 32, `${name} target`);
    assert.equal((await button.evaluate(el => el.closest('.group\\/tip')?.querySelector('[role="tooltip"]')?.innerText)).trim(), name);
  }
  await cardOf(page).getByRole('button', { name: 'Download', exact: true }).click();
  const formats = cardOf(page).getByRole('group', { name: 'Download formats' });
  const offered = (await formats.getByRole('button').allInnerTexts()).map(text => text.trim());
  assert.ok(offered.includes('STEP') && offered.includes('GLB') && !offered.includes('STL'), offered.join(','));
  let download = page.waitForEvent('download');
  await formats.getByRole('button', { name: 'STEP', exact: true }).click();
  assert.equal((await download).suggestedFilename(), 'model.step');
  await cardOf(page).locator('[data-drag-zone]').first().click({ button: 'right', position: { x: 20, y: 6 } });
  const row = page.locator('[data-canvas-menu] [data-menu-cad-download="step"]');
  await row.waitFor();
  assert.equal((await row.innerText()).trim(), 'Download STEP');
  assert.equal(await page.locator('[data-canvas-menu] [data-menu-cad-download="stl"]').count(), 0, 'only saved formats');
  await shot(page, 'after-5-context-menu-light');
  download = page.waitForEvent('download');
  await row.click();
  assert.equal((await download).suggestedFilename(), 'model.step');
});

await step('White / Black / None paint only the viewport, save on the card, survive a reload, and a share viewer sees the choice without the control', async () => {
  await select(page);
  const control = cardOf(page).getByRole('group', { name: 'Viewer background' });
  assert.equal(await control.getByRole('button', { name: 'White background' }).getAttribute('aria-pressed'), 'true', 'white by default');
  const theme = await page.evaluate(() => document.documentElement.className);
  await control.getByRole('button', { name: 'Black background' }).click();
  await until(async () => (await board()).blocks.find(block => block.id === MAIN).viewerBackground === 'black', 'black not saved on the card');
  assert.equal(await viewerOf(page).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  assert.equal(await page.evaluate(() => document.documentElement.className), theme, 'the app theme is unchanged');
  await shot(page, 'after-6-black-light');
  await control.getByRole('button', { name: 'No background' }).click();
  await until(async () => (await board()).blocks.find(block => block.id === MAIN).viewerBackground === 'none', 'none not saved');
  assert.equal(await viewerOf(page).evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await shot(page, 'after-6-none-light');
  await control.getByRole('button', { name: 'Black background' }).click();
  await until(async () => (await board()).blocks.find(block => block.id === MAIN).viewerBackground === 'black', 'black not saved');
  await page.reload();
  await until(async () => (await viewerOf(page).getAttribute('data-cad-background')) === 'black', 'black lost on reload');
  const shared = await api(`${boardPath}/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: await board() }) });
  const viewer = await open({ signedIn: false, path: `/b/${shared.sharing.view}` });
  await until(async () => (await viewerOf(viewer.page).getAttribute('data-cad-background')) === 'black', 'the share viewer does not see black');
  assert.equal(await cardOf(viewer.page).getByRole('group', { name: 'Viewer background' }).count(), 0, 'read-only: no background control');
  await shot(viewer.page, 'after-6-share-viewer-light');
  await viewer.context.close();
});

await step('the expanded view has its own toolbar; Escape ends interaction before the panel; the card keeps its camera through it', async () => {
  await select(page);
  const viewer = viewerOf(page);
  await interactOf(page).click();
  const box = await viewer.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 25, box.y + box.height / 2 + 12, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('Escape');
  const camera = await settled(viewer);
  await toolsOf(page).locator('[data-cad-fit]').click();
  const framed = await settled(viewer);
  assert.notEqual(framed, camera, 'the orbit moved the camera away from the opening framing');
  await interactOf(page).click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 25, box.y + box.height / 2 + 12, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('Escape');
  const orbited = await settled(viewer);
  await cardOf(page).getByRole('button', { name: 'Expand', exact: true }).click();
  const panel = page.locator('[role="dialog"]');
  const key = `${MAIN}:expanded`;
  await panel.locator('[data-cad-viewer] canvas').waitFor();
  await until(async () => !(await interactOf(page, key).isDisabled()), 'the expanded viewer never went live');
  assert.equal(await panel.locator('[data-cad-viewer] button').count(), 0, 'no control over the expanded model');
  assert.equal(await toolsOf(page, key).locator('[data-cad-fit]').count(), 1);
  await interactOf(page, key).click();
  await until(async () => (await interactOf(page, key).getAttribute('aria-pressed')) === 'true', 'expanded Interact');
  await shot(page, 'after-7-expanded-light');
  await page.keyboard.press('Escape');
  await until(async () => (await interactOf(page, key).getAttribute('aria-pressed')) === 'false', 'Escape did not end expanded interaction');
  await page.waitForTimeout(400);
  assert.equal(await panel.count(), 1, 'the first Escape kept the panel');
  await page.keyboard.press('Escape');
  await until(async () => (await panel.count()) === 0, 'the second Escape closes the panel');
  await until(async () => (await viewer.getAttribute('data-viewer-live')) === 'true', 'the card viewer did not come back');
  const back = await settled(viewer);
  assert.notEqual(back, framed, 'the card came back at its orbited camera, not the opening framing');
  assert.equal(back, orbited, 'the card kept its camera');
});

await step('at most three viewers render at once; the rest show the saved preview, never an error', async () => {
  const extra = [ready('cad-x1', 0, 480), ready('cad-x2', 560, 480), ready('cad-x3', 1120, 480)];
  const state = await board();
  await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: { ...state, blocks: [...state.blocks, ...extra] } }) });
  for (const block of extra) jobs[block.jobId] = { id: block.jobId, cardId: block.id, modelId: 'm', state: 'ready', stage: 'ready', attempt: 1, revisionId: 'revision-1', manifest: block.manifest, createdAt: Date.now(), updatedAt: Date.now() };
  await page.reload();
  await page.keyboard.press('Shift+Digit1'); // fit everything in view
  const ids = [MAIN, ...extra.map(block => block.id)];
  // What each viewer shows now. Waited for, not slept for: under load the first model takes longer than any fixed pause.
  const shown = async () => {
    const live = [], posters = [];
    for (const id of ids) { if ((await viewerOf(page, id).getAttribute('data-viewer-live')) === 'true') live.push(id); else if (await viewerOf(page, id).locator('[data-cad-poster]').count()) posters.push(id); }
    return { live, posters };
  };
  await until(async () => { const now = await shown(); return now.live.length >= 1 && now.live.length + now.posters.length === ids.length; }, 'a viewer going live while the rest show their saved preview', 30000);
  const { live, posters } = await shown();
  assert.ok(live.length <= 3 && live.length >= 1, `live: ${live.join(',')}`);
  assert.equal(live.length + posters.length, ids.length, `every model shows something: live ${live} posters ${posters}`);
  assert.equal(await page.locator('[data-cad-viewer-fallback]').count(), 0);
  assert.ok(await page.locator('[data-cad-viewer] canvas').count() <= 3, 'renderers on the page');
  await shot(page, 'after-8-viewer-cap-light');
});

await step('a gone model-loaders chunk: saved preview and Retry, no raw error, no automatic reload; then a confirmed stale build offers Reload to update, blocked by a draft', async () => {
  brokenLoaders = true;
  const state = await board();
  await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: { ...state, blocks: state.blocks.filter(block => !block.id.startsWith('cad-x')) } }) });
  const broken = await open();
  let loads = 0; broken.page.on('load', () => { loads += 1; });
  const fallback = viewerOf(broken.page).locator('[data-cad-viewer-fallback="module"]');
  await fallback.waitFor();
  assert.ok(!/dynamically imported module|model-loaders/.test(await cardOf(broken.page).innerText()), 'no raw import error in the card');
  assert.equal(await viewerOf(broken.page).locator('[data-cad-poster]').count(), 1, 'the saved preview is shown');
  assert.match(await fallback.innerText(), /The 3D viewer could not load\. The saved preview is shown\./);
  assert.equal(await fallback.locator('[data-cad-reload-update]').count(), 0, 'Retry first: no reload offered yet');
  await shot(broken.page, 'after-9-fallback-light');
  await fallback.locator('[data-cad-viewer-retry]').click();
  await until(async () => (await viewerOf(broken.page).locator('[data-cad-reload-update]').count()) === 1, 'Retry failed again but no stale build was confirmed');
  assert.match(await fallback.innerText(), /older version of Rabbit Hole/);
  const composer = broken.page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
  await composer.fill('a draft the reload would lose');
  await until(async () => await fallback.locator('[data-cad-reload-update]').isDisabled(), 'a typed draft did not block the reload', 5000);
  assert.match(await fallback.innerText(), /Text you typed is not sent or saved yet/);
  await shot(broken.page, 'after-9-reload-blocked-light');
  await composer.fill('');
  await until(async () => !(await fallback.locator('[data-cad-reload-update]').isDisabled()), 'the reload stayed blocked once the draft was cleared and the board saved', 8000);
  assert.equal(loads, 0, 'never reloaded on its own');
  await shot(broken.page, 'after-9-reload-offered-light');
  brokenLoaders = false; // the "new build" is now served
  await Promise.all([broken.page.waitForEvent('load'), fallback.locator('[data-cad-reload-update]').click()]);
  await until(async () => (await viewerOf(broken.page).getAttribute('data-viewer-live')) === 'true', 'after the reload the viewer did not load');
  assert.equal(loads, 1, 'exactly one reload, on the click');
  await broken.context.close();
});

const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
const requestsTo = (page, needle) => { const seen = []; page.on('request', request => { if (request.url().includes(needle)) seen.push(request.url()); }); return seen; };

await step('Building -> Ready in the same tab: the finished card loads its interactive 3D model with no reload, the same card, no second job, a draft kept', async () => {
  const building = { type: 'cad', id: 'cad-flip', jobId: 'job-cad-flip', modelId: 'm', revisionId: null, status: 'building', title: 'Flip plate', units: 'mm', w: 460, h: 420, dx: 0, dy: 640, briefSummary: 'Fixture.' };
  jobs['job-cad-flip'] = { id: 'job-cad-flip', cardId: 'cad-flip', modelId: 'm', state: 'building', stage: 'building', attempt: 1, revisionId: null, manifest: null, createdAt: Date.now(), updatedAt: Date.now() };
  const state = await board();
  await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: { ...state, blocks: [...state.blocks.filter(block => block.id !== 'cad-flip'), building] } }) });
  const tab = await open();
  let loads = 0; tab.page.on('load', () => { loads += 1; });
  const models = requestsTo(tab.page, 'fs_cad-flip/d/fd_glb');
  await tab.page.keyboard.press('Shift+Digit1');
  await cardOf(tab.page, 'cad-flip').locator('[data-cad-progress][data-gen-active="true"]').waitFor();
  await composerOf(tab.page).fill('a draft kept while the model builds');
  assert.deepEqual(models, [], 'no model is asked for before it exists');
  flipReady = true;
  await until(async () => (await viewerOf(tab.page, 'cad-flip').getAttribute('data-viewer-live')) === 'true', 'the finished card never loaded its 3D model without a reload', 30000);
  assert.equal(await viewerOf(tab.page, 'cad-flip').locator('[data-cad-viewer-fallback]').count(), 0, 'no "could not load" notice');
  assert.equal(await cardOf(tab.page, 'cad-flip').count(), 1, 'the same card, not a second one');
  assert.equal(loads, 0, 'no reload');
  assert.equal(models.length, 1, 'the saved model, fetched once');
  assert.equal(await composerOf(tab.page).inputValue(), 'a draft kept while the model builds');
  await shot(tab.page, 'after-11-building-to-ready-light');
  await tab.context.close();
  flipReady = false;
  const after = await board();
  await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: { ...after, blocks: after.blocks.filter(block => block.id !== 'cad-flip') } }) });
});

await step('a model download that fails once: the fallback names it, and Retry fetches the saved model again in place with the draft kept', async () => {
  glbFailures = 1;
  const tab = await open();
  let loads = 0; tab.page.on('load', () => { loads += 1; });
  const fallback = viewerOf(tab.page).locator('[data-cad-viewer-fallback="model"]');
  await fallback.waitFor();
  assert.match(await fallback.innerText(), /Model download failed \(503\)/);
  assert.equal(await viewerOf(tab.page).locator('[data-cad-poster]').count(), 1, 'the saved preview is shown');
  await composerOf(tab.page).fill('a draft kept through Retry');
  await fallback.locator('[data-cad-viewer-retry]').click();
  await until(async () => (await viewerOf(tab.page).getAttribute('data-viewer-live')) === 'true', 'Retry did not load the saved model in place');
  assert.equal(await cardOf(tab.page).count(), 1);
  assert.equal(loads, 0, 'no reload');
  assert.equal(await composerOf(tab.page).inputValue(), 'a draft kept through Retry');
  await tab.context.close();
});

await step('a viewer chunk missing from the server and then served again: the fallback, then Retry loads it under a fresh URL in place, never by a reload', async () => {
  brokenRenderer = true;
  const tab = await open();
  let loads = 0; tab.page.on('load', () => { loads += 1; });
  const chunks = requestsTo(tab.page, '/static/three-d-renderer-');
  const fallback = viewerOf(tab.page).locator('[data-cad-viewer-fallback="module"]');
  await fallback.waitFor();
  assert.equal(await viewerOf(tab.page).locator('[data-cad-poster]').count(), 1, 'the saved preview is shown');
  await composerOf(tab.page).fill('a draft kept through the chunk retry');
  brokenRenderer = false;
  await fallback.locator('[data-cad-viewer-retry]').click();
  await until(async () => (await viewerOf(tab.page).getAttribute('data-viewer-live')) === 'true', 'Retry did not load the viewer in place once the chunk was served');
  assert.ok(chunks.some(url => /\?retry=\d+$/.test(url)), `Retry asked for the chunk under a fresh URL: ${chunks.join(' ')}`);
  assert.equal(loads, 0, 'no automatic reload');
  assert.equal(await cardOf(tab.page).count(), 1);
  assert.equal(await composerOf(tab.page).inputValue(), 'a draft kept through the chunk retry');
  await tab.context.close();
});

await step('a model that stays unavailable: the saved preview, the message and a working Retry, until it is served', async () => {
  glbFailures = Infinity;
  const tab = await open();
  const fallback = viewerOf(tab.page).locator('[data-cad-viewer-fallback="model"]');
  await fallback.waitFor();
  await fallback.locator('[data-cad-viewer-retry]').click();
  await until(async () => (await fallback.locator('[data-cad-viewer-retry]').count()) === 1 && /Model download failed \(503\)/.test(await fallback.innerText()), 'the fallback did not stay honest after a failed Retry');
  assert.equal(await viewerOf(tab.page).getAttribute('data-viewer-live'), null);
  assert.equal(await viewerOf(tab.page).locator('[data-cad-poster]').count(), 1, 'the saved preview is shown');
  assert.equal(await fallback.locator('[data-cad-reload-update]').count(), 0, 'a model failure never offers a reload');
  glbFailures = 0;
  await fallback.locator('[data-cad-viewer-retry]').click();
  await until(async () => (await viewerOf(tab.page).getAttribute('data-viewer-live')) === 'true', 'Retry did not recover once the model was served');
  await tab.context.close();
});

await step('no browser errors and no model requests escaped', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(refused, []);
  // Other origins (the notebook origin's preconnect, fonts) are aborted above; none is a model or executor.
  assert.deepEqual(outside.filter(host => /anthropic|openai|fly\.dev|cad/i.test(host)), []);
});

// Dark-theme screenshots of the same states (not counted: what they show is checked above).
const dark = await open({ dark: true });
await viewerOf(dark.page).locator('canvas').waitFor(); await dark.page.waitForTimeout(1500);
await shot(dark.page, 'after-1-default-live-dark');
await select(dark.page); await until(async () => !(await interactOf(dark.page).isDisabled()), 'dark viewer live'); await interactOf(dark.page).click(); await dark.page.waitForTimeout(500);
await shot(dark.page, 'after-2-interacting-dark');
await dark.page.keyboard.press('Escape');
await cardOf(dark.page).getByRole('group', { name: 'Viewer background' }).getByRole('button', { name: 'No background' }).click(); await dark.page.waitForTimeout(600);
await shot(dark.page, 'after-6-none-dark');
await cardOf(dark.page).getByRole('group', { name: 'Viewer background' }).getByRole('button', { name: 'White background' }).click(); await dark.page.waitForTimeout(600);
await shot(dark.page, 'after-6-white-dark');
await cardOf(dark.page).getByRole('button', { name: 'Expand', exact: true }).click(); await dark.page.locator('[role="dialog"] [data-cad-viewer] canvas').waitFor(); await dark.page.waitForTimeout(1200);
await shot(dark.page, 'after-7-expanded-dark');
await dark.context.close();
brokenLoaders = true;
const darkBroken = await open({ dark: true });
await viewerOf(darkBroken.page).locator('[data-cad-viewer-fallback]').waitFor();
await shot(darkBroken.page, 'after-9-fallback-dark');
await darkBroken.context.close();

await browser.close();
const passed = results.filter(Boolean).length;
const clean = !errors.length && !refused.length;
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total && clean ? 0 : 1);
