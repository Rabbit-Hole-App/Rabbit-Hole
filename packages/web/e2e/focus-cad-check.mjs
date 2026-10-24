// Focus CAD model (docs/features/focus-study.md sections 5 and 7; owner brief C:/s/spec/focus-study/brief.md 3.3, 6.2), against the
// LOCAL keyless stack only (fresh browser profile, local D1). A READY CAD card with a real 3D asset: the fixture GLB (one
// triangle), STEP and thumbnail and the CAD job routes are answered in the browser exactly as cad-viewer-check.mjs answers them,
// so the three.js viewer goes live with no network, no CAD executor and no model. Asserts: the selected ready card shows Focus CAD
// model; Focus fills the working pane in place and the viewer and its renderer resize with it; Interact, Fit view and Show
// dimensions sit in the Focus header beside Back to canvas and work there (Interact orbits the model, Fit view reframes it, Show
// dimensions toggles the overlay); container Focus and the 3D Fit view stay apart (Fit view leaves the Focus frame where it is,
// a Focus round trip leaves the camera where it was); Escape ends Interact first and a second Escape leaves Focus; each exit
// puts the card box back within 2 px, keeps the same element and the saved geometry, and no step saves the board or calls a model.
// A synthetic triangle proves wiring, not CAD quality. Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one.
// Prints `ok <label>` per step, ids and counts only (no cookies, no secrets), then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/focus-cad-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeMenus, openMenu } from './canvas-menu-helpers.mjs';

const total = 9; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('focus-cad-check runs against the local stack only');
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../focus-cad-shots` : 'focus-cad-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `focus-cad-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

// The fixture model, as cad-viewer-check.mjs builds it: one triangle in a valid glTF 2.0 binary, generated here.
function triangleGlb() {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [0.04, 0.02, 0] }] };
  const text = Buffer.from(JSON.stringify(json)), length = Math.ceil(text.length / 4) * 4, bin = Buffer.alloc(36); [0, 0, 0, 0.04, 0, 0, 0, 0.02, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const bytes = Buffer.alloc(12 + 8 + length + 8 + bin.length, 32); bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); text.copy(bytes, 20); bytes.writeUInt32LE(bin.length, 20 + length); bytes.writeUInt32LE(0x004e4942, 24 + length); bin.copy(bytes, 28 + length); return bytes;
}
const GLB = triangleGlb();
const MAIN = 'cad';
const manifest = { schema: 'cad-model/1', revisionId: 'revision-1', title: 'Fixture plate', units: 'mm', parameters: { length: 40 }, assumptions: ['Fixture.'], validation: { baselinePassed: true, checks: [], unchecked: [] }, artifacts: [
  { kind: 'glb', name: 'model.glb', url: `/api/learn/files/fs_${MAIN}/d/fd_glb` }, { kind: 'step', name: 'model.step', url: `/api/learn/files/fs_${MAIN}/d/fd_step` }, { kind: 'thumbnail', name: 'thumbnail.svg', url: `/api/learn/files/fs_${MAIN}/d/fd_thumbnail` }] };
const CAD = { type: 'cad', id: MAIN, jobId: 'job-focus-cad', modelId: 'm', revisionId: 'revision-1', status: 'ready', title: 'Fixture plate', units: 'mm', w: 460, h: 420, dx: 0, dy: 140, briefSummary: 'Fixture.', manifest, acceptedManifest: manifest };
const JOB = { id: CAD.jobId, cardId: MAIN, modelId: 'm', state: 'ready', stage: 'ready', attempt: 1, revisionId: 'revision-1', manifest, createdAt: Date.now() - 4000, updatedAt: Date.now() };
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [CAD] };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Focus CAD ${run}` }) });
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const model = [], saves = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course|video|cad))/;
const router = route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  const file = url.pathname.match(/^\/api\/learn\/files\/fs_[^/]+\/d\/(fd_glb|fd_step|fd_thumbnail)$/)?.[1];
  if (file === 'fd_glb') return route.fulfill({ contentType: 'model/gltf-binary', body: GLB });
  if (file === 'fd_step') return route.fulfill({ contentType: 'model/step', body: 'ISO-10303-21; fixture' });
  if (file === 'fd_thumbnail') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect x="20" y="50" width="120" height="60" fill="#999"/></svg>' });
  // The card's status poll: the job is Ready and answers the card as saved, so the poll changes nothing and stops.
  if (url.pathname.startsWith('/api/learn/cad/jobs') && request.method() === 'GET') return route.fulfill({ json: url.pathname.split('/')[5] ? { job: JOB, block: CAD } : { jobs: [JOB], blocks: [CAD] } });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  // A save of the board itself (PUT /api/learn/boards/<canvas>/<board>): Focus and the 3D tools may make none.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && /^\/api\/learn\/boards\/[^/]+\/[^/]+$/.test(url.pathname)) saves.push(`${request.method()} ${url.pathname}`);
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, seed]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* a sandboxed frame */ } }, [INK, STATE]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const shot = name => page.screenshot({ path: `${SHOTS}/${name}.png` });
const card = `[data-block-id="${MAIN}"]`, viewer = `${card} [data-cad-viewer]`, frameSel = `[data-focus-frame="${MAIN}"]`;
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn().catch(() => false)) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const rect = selector => page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null; }, selector);
const same = (a, b, what, px = 1) => { for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(a[key] - b[key]) <= px, `${what}: ${key} ${Math.round(b[key])}, was ${Math.round(a[key])}`); };
const geometry = () => page.evaluate(key => { const board = JSON.parse(localStorage.getItem(key) || '{}'); return JSON.stringify((board.blocks || []).map(b => [b.id, b.dx, b.dy, b.w, b.h, b.cardLayout || null])); }, INK);
const settle = async () => { let last = -1, still = 0; while (still < 30) { if (saves.length === last) still++; else { last = saves.length; still = 0; } await page.waitForTimeout(100); } };
const counts = () => [model.length, saves.length];
const quiet = async (label, before) => { await page.waitForTimeout(2000); assert.deepEqual(counts(), before, `${label}: model ${model.join()} saves ${saves.slice(before[1]).join()}`); };
const focused = () => page.evaluate(sel => document.querySelector(sel)?.hasAttribute('data-focus-host') ?? null, card);
// The viewer's drawn pixels, once two frames 150 ms apart agree (cad-viewer-check.mjs): the camera's view, compared by hash.
const pixels = async () => createHash('sha256').update(await page.locator(viewer).screenshot()).digest('hex');
const settled = async () => { let prior; for (let i = 0; i < 12; i++) { await page.waitForTimeout(150); const now = await pixels(); if (now === prior) return now; prior = now; } throw Error('viewer pixels did not settle'); };
// The pointer rests on empty canvas beside the card before each pixel read, so no hover style differs between reads.
const rest = async () => { const [box, pane] = [await rect(card), await rect('[data-canvas-surface]')]; const x = box.right + 60 < pane.right - 20 ? box.right + 60 : box.left - 60; await page.mouse.move(x, Math.min(box.bottom, pane.bottom) - 30); };
const fitCanvas = async () => { const panel = await openMenu(page, 'View'); await panel.locator('[data-menu-item="Fit canvas"]').click(); await closeMenus(page); };
const visiblePart = selector => page.evaluate(sel => {
  const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect();
  if (!r || !f) return null;
  const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom);
  return right - left > 8 && bottom - top > 8 ? { left, right, top, bottom } : null;
}, selector);
// Selects the card by its drag strip, the press a learner makes (focus-adapters-check.mjs).
const select = async () => {
  let at = await visiblePart(`${card} [data-drag-handle]`);
  if (!at) { await fitCanvas(); await until(async () => !!(at = await visiblePart(`${card} [data-drag-handle]`)), 'the CAD card is on screen'); }
  await page.mouse.click((at.left + at.right) / 2, (at.top + at.bottom) / 2);
  await until(async () => (await page.getAttribute(card, 'aria-current')) === 'true', 'the CAD card is selected');
};
// A control is pressed with the mouse at its centre, after checking that the centre hits it (never locator.click, whose
// scroll-into-view would slide the clipped canvas surface).
const tap = async (locator, what) => {
  await locator.waitFor({ timeout: 5000 });
  const at = await locator.boundingBox();
  assert.ok(at, `${what} has a box`);
  const [x, y] = [at.x + at.width / 2, at.y + at.height / 2];
  const hit = await locator.evaluate((node, [px, py]) => { const top = document.elementFromPoint(px, py); return !!top && (node === top || node.contains(top)) ? null : (top ? `${top.tagName} ${[...top.attributes].map(a => a.name).filter(n => n.startsWith('data-')).join(' ')}` : 'nothing'); }, [x, y]);
  assert.equal(hit, null, `${what} is covered at (${Math.round(x)}, ${Math.round(y)}) by ${hit}`);
  await page.mouse.click(x, y);
};
const focusButton = page.getByRole('button', { name: 'Focus CAD model', exact: true });
const tools = page.locator(`${frameSel} [data-cad-tools]`);
const interact = tools.locator('[data-cad-interact]');
// Enters Focus with the card's own control (from the canvas, the card selected); a no-op while already focused.
const enter = async () => {
  if (await focused()) return;
  await select();
  await tap(focusButton, 'Focus CAD model');
  await until(async () => (await focused()) === true, 'Focus CAD model focused the card');
  await until(async () => !(await interact.isDisabled()), 'the focused viewer is live');
};
// Drags across the middle of the viewer, after checking the point hits the viewer (not the Focus header or another layer).
const orbit = async dx => {
  const box = await page.locator(viewer).boundingBox(), [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  assert.ok(await page.evaluate(([sel, px, py]) => !!document.elementFromPoint(px, py)?.closest(sel), [viewer, x, y]), 'the middle of the viewer takes the pointer');
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + 20, { steps: 8 }); await page.mouse.up();
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator(viewer).waitFor({ timeout: 60000 });
await settle();

let before, geo, prior, element;
await check('1 A ready CAD card with a real GLB goes live in the viewer; selected, it shows Focus CAD model as its only Focus control', async () => {
  await until(async () => (await page.getAttribute(viewer, 'data-viewer-live')) === 'true', 'the CAD viewer never went live on the fixture GLB', 30000);
  assert.equal(await page.locator(`${viewer} canvas`).count(), 1, 'the three.js canvas is drawn');
  await select();
  await focusButton.waitFor({ timeout: 5000 });
  const names = await page.getByRole('button', { name: /^Focus / }).evaluateAll(nodes => nodes.filter(node => node.offsetParent).map(node => node.getAttribute('aria-label') || node.textContent.trim()));
  assert.deepEqual([...new Set(names)], ['Focus CAD model'], `only its own Focus control (${names.join(', ')})`);
  assert.equal(await page.locator(`[data-cad-tools="${MAIN}"]`).count(), 1, 'the selected card row carries its 3D tools');
  await shot('1-selected');
});

let opening;
await check('2 Focus CAD model fills the pane in place; the viewer and its renderer resize; Interact, Fit view and Show dimensions sit in the Focus header beside Back to canvas', async () => {
  await select();
  await settle();
  element = await page.evaluate(sel => { const node = document.querySelector(sel); node.__focusMark = 'kept'; return !!node; }, card);
  assert.ok(element, 'the CAD card is on the canvas');
  [before, geo, prior] = [await rect(card), await geometry(), counts()];
  const small = await rect(viewer);
  await rest();
  opening = await settled();
  await tap(focusButton, 'Focus CAD model');
  await until(async () => (await focused()) === true, 'Focus CAD model focused the card');
  await page.waitForTimeout(300);
  const [box, pane, view] = [await rect(card), await rect('[data-canvas-surface]'), await rect(viewer)];
  assert.ok(box.left >= pane.left - 1 && box.top >= pane.top - 1 && box.right <= pane.right + 1 && box.bottom <= pane.bottom + 1, `the card ${JSON.stringify(box)} lies in the pane ${JSON.stringify(pane)}`);
  assert.ok(box.width * box.height > before.width * before.height * 1.2, `the card grew (${Math.round(before.width)}x${Math.round(before.height)} -> ${Math.round(box.width)}x${Math.round(box.height)})`);
  assert.ok(view.width > small.width * 1.2 && view.height > small.height * 1.2, `the viewer container grew (${Math.round(small.width)}x${Math.round(small.height)} -> ${Math.round(view.width)}x${Math.round(view.height)})`);
  // three-d-renderer.js's ResizeObserver sizes its canvas to the host it is appended to (the viewer's inset-0 layer).
  await until(() => page.evaluate(sel => { const c = document.querySelector(sel), r = c.getBoundingClientRect(), h = c.parentElement.getBoundingClientRect(); return Math.abs(r.width - h.width) <= 2 && Math.abs(r.height - h.height) <= 2; }, `${viewer} canvas`), 'the renderer canvas follows the viewer to its new size');
  assert.equal(await page.getAttribute(frameSel, 'data-focus-kind'), 'cad');
  assert.ok(await page.locator(`${frameSel} [data-focus-back]`).isVisible(), 'Back to canvas in the header');
  assert.equal(await page.locator('[data-cad-tools]').count(), 1, 'one 3D toolbar, the one in the Focus header');
  for (const [selector, name] of [['[data-cad-interact]', 'Interact'], ['[data-cad-fit]', 'Fit view'], ['[data-cad-dimensions-toggle]', 'Show dimensions']]) {
    const button = tools.locator(selector);
    assert.ok(await button.isVisible(), `${name} in the Focus header`);
    assert.equal((await button.evaluate(el => el.getAttribute('aria-label') || el.innerText)).trim(), name);
  }
  await until(async () => !(await interact.isDisabled()), 'Interact is enabled: the focused viewer is live');
  assert.equal(await page.locator(`${frameSel} [data-focus-back]`).count() + await tools.locator('[data-cad-fit]').count(), 2, 'Back to canvas and Fit view are two separate controls');
  await shot('2-focused');
});

await check('3 Back to canvas puts the card back within 2 px with the same element and saved geometry, no board save, and the camera where it was (Focus never moves the camera)', async () => {
  await tap(page.locator(`${frameSel} [data-focus-back]`), 'Back to canvas');
  await until(async () => !(await page.locator('[data-focus-host]').count()), 'Focus ended');
  await page.waitForTimeout(300);
  same(before, await rect(card), 'the card box', 2);
  assert.equal(await page.evaluate(sel => document.querySelector(sel)?.__focusMark, card), 'kept', 'the same element throughout (never remounted)');
  assert.equal(await geometry(), geo, 'the saved geometry is unchanged');
  await quiet('Focus and Back to canvas', prior);
  await rest();
  assert.equal(await settled(), opening, 'the model is drawn exactly as before Focus: container Focus left the camera alone');
});

let orbited, frame;
await check('4 Interact in the Focus header orbits the model inside the focused viewer; the card and the Focus frame stay put', async () => {
  [before, geo, prior] = [await rect(card), await geometry(), counts()];
  await enter();
  frame = { card: await rect(card), header: await rect(frameSel) };
  await tap(interact, 'Interact');
  await until(async () => (await interact.getAttribute('aria-pressed')) === 'true', 'Interact did not enter the model');
  assert.equal((await interact.innerText()).trim(), 'Done', 'the active state says how to leave');
  assert.ok(await page.locator(`${viewer}[data-viewer-active]`).count() === 1, 'the viewer reports the interaction');
  const still = await settled();
  await orbit(80);
  orbited = await settled();
  assert.notEqual(orbited, still, 'the orbit changed the model view');
  same(frame.card, await rect(card), 'the focused card while orbiting');
  same(frame.header, await rect(frameSel), 'the Focus frame while orbiting');
  await shot('4-interacting');
});

await check('5 Escape ends Interact first; the card stays focused', async () => {
  assert.equal(await interact.getAttribute('aria-pressed'), 'true', 'interacting before Escape');
  await page.keyboard.press('Escape');
  await until(async () => (await interact.getAttribute('aria-pressed')) === 'false', 'Escape did not end Interact');
  assert.equal(await page.locator(`${viewer}[data-viewer-active]`).count(), 0, 'the viewer gave the pointer back');
  await page.waitForTimeout(300);
  assert.equal(await focused(), true, 'the first Escape did not leave Focus');
  assert.ok(await page.locator(`${frameSel} [data-focus-back]`).isVisible(), 'the Focus header is still there');
  orbited = await settled();
});

await check('6 Fit view in the Focus header reframes the model and leaves the Focus frame and the card where they are', async () => {
  await enter();
  await tap(tools.locator('[data-cad-fit]'), 'Fit view');
  const framed = await settled();
  assert.notEqual(framed, orbited, 'Fit view reframed the orbited model');
  assert.equal(await focused(), true, 'Fit view did not leave Focus');
  same(frame.card, await rect(card), 'the focused card after Fit view');
  same(frame.header, await rect(frameSel), 'the Focus frame after Fit view');
  assert.equal(await interact.getAttribute('aria-pressed'), 'false', 'Fit view did not start Interact');
  await shot('6-fit-view');
});

await check('7 Show dimensions in the Focus header toggles the overlay on the focused viewer, on and off, never on the board', async () => {
  await enter();
  const toggle = tools.locator('[data-cad-dimensions-toggle]');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'off by default');
  assert.equal(await page.getAttribute(viewer, 'data-cad-dimensions'), 'off');
  assert.equal(await page.locator(`${viewer} [data-cad-dimensions-overlay]`).count(), 0);
  await tap(toggle, 'Show dimensions');
  await until(async () => (await toggle.getAttribute('aria-pressed')) === 'true', 'Show dimensions did not turn on');
  assert.equal(await page.getAttribute(viewer, 'data-cad-dimensions'), 'on');
  assert.equal(await page.locator(`${viewer} [data-cad-dimensions-overlay]`).count(), 1, 'the overlay is drawn on the focused viewer');
  await shot('7-dimensions');
  await tap(toggle, 'Show dimensions');
  await until(async () => (await toggle.getAttribute('aria-pressed')) === 'false', 'Show dimensions did not turn off');
  assert.equal(await page.locator(`${viewer} [data-cad-dimensions-overlay]`).count(), 0, 'the overlay is gone');
  assert.ok(!String(await page.evaluate(key => localStorage.getItem(key), INK)).includes('imension'), 'nothing about dimensions on the board');
});

await check('8 A second Escape leaves Focus: the card box back within 2 px, the same element, the saved geometry unchanged, and no board save across Focus and its 3D tools', async () => {
  assert.equal(await focused(), true, 'still focused before the second Escape');
  assert.equal(await interact.getAttribute('aria-pressed'), 'false', 'not interacting');
  await page.keyboard.press('Escape');
  await until(async () => !(await page.locator('[data-focus-host]').count()), 'the second Escape did not leave Focus');
  await page.waitForTimeout(300);
  same(before, await rect(card), 'the card box', 2);
  assert.equal(await page.evaluate(sel => document.querySelector(sel)?.__focusMark, card), 'kept', 'the same element throughout (never remounted)');
  assert.equal(await geometry(), geo, 'the saved geometry is unchanged');
  await quiet('Focus, Interact, Fit view, Show dimensions and Escape', prior);
});

await check('9 No model call or CAD job write at any point, no page error', async () => {
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
