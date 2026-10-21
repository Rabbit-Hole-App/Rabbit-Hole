// The /3d example in View > Slash commands (owner, 2026-10-20): a real 3D model in the canvas's own scene card and viewer
// (LearningBlocks ThreeDBody, three-d-renderer.js) on the committed GLB public/lesson-assets/slash-3d-frustum.glb, never the old
// frustum picture. LOCAL stack only. Every model and job route is counted (and a non-GET one aborted); the window must make none.
// In light and in dark:
//   1. on open the model renders: a loading line, then a live viewer with drawn pixels; no picture; Interact and Fit view sit in
//      a toolbar outside the card, above its top right, with no control in the viewer; the Interact pill reads Interact;
//   2. before Interact the wheel over the model scrolls the window's preview and leaves the camera where it was;
//   3. Interact: a drag orbits and the wheel zooms (the viewer's pixels change), and the preview does not scroll;
//   4. Fit view frames the model as it opened (the opening pixels again);
//   5. Escape ends the interaction, the window stays open, and the wheel scrolls the preview again;
//   6. closing and reopening the window shows the model live again;
// then once, in light:
//   7. a model file that 404s shows the viewer's own failure and Retry model in the card, never the picture; Retry loads it;
//   8. the selected /3d pill in the Chat composer reads 3D (never /3d) and its x is Remove 3D;
//   9. a real /3d card on the canvas - /api/learn/artifact and the scene job answered in the browser with the same GLB - has the
//      preview's card width, body size and DOM (the same ThreeDBody structure and three.js canvas);
//  10. no page errors, and no model or job request from the window (counted), none of the canvas's stubbed ones reaching the server.
// Before this change step 1 fails: /3d shows img[data-slash-illustration] (slash-3d-frustum.svg) and no viewer.
// Usage: BASE=http://127.0.0.1:9271 SMALL_CP=http://127.0.0.1:9273 VARS=C:/s/toc-ui3d/.dev.vars node e2e/slash-3d-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9271';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9273';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('slash-3d-check runs against the local stack only');
const OUT = process.argv[2] || 'slash-3d-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `slash3d-${run}@example.com`, secret }) })).json();
const canvas = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `small_session=${session}`, origin: BASE }, body: JSON.stringify({ title: `Slash 3D ${run}` }) })).json();
const GLB = readFileSync(new URL('../public/lesson-assets/slash-3d-frustum.glb', import.meta.url));

// Model-capable and job routes: counted for every method; a non-GET one is aborted unless this check answers it.
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course|artifact|cad\/jobs|motion))/;
// The canvas page's own reads, which run whether or not the window is open: LearnPage restores CAD job status once on load
// (cadClient().list()) and LearnJourney refreshes the board's journey every 5 s. Neither starts anything.
const PAGE_READS = ['GET /api/learn/cad/jobs', 'GET /api/learn/journey'];
// The page's idle warm-up opens the notebook site hidden once the learner pauses (learn-warmup.js warmNotebookSite): aborted
// here and counted, never the window's.
const WARMUP_HOST = new URL(readFileSync(new URL('../src/learn-notebook.js', import.meta.url), 'utf8').match(/VITE_NOTEBOOK_ORIGIN \|\| '([^']+)'/)[1]).hostname;
const seen = [], refused = [], outside = [], errors = [], warmups = [];
let missingGlb = false, canvasStubs = false, placement = null, phase = 'page';
// What the window asked for since `from`: every model or job route request except the page's own reads above.
const fromWindow = from => seen.slice(from).filter(entry => entry.phase === 'window' && !PAGE_READS.includes(entry.request)).map(entry => entry.request);
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === WARMUP_HOST) { warmups.push(phase); return route.abort(); }
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(`${url.hostname} (step ${results.length + 1}, ${phase}, from ${request.frame()?.url() || '?'})`); return route.abort(); }
  if (url.pathname === '/lesson-assets/slash-3d-frustum.glb' && missingGlb) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (!MODEL.test(url.pathname)) return route.fallback();
  seen.push({ phase, request: `${request.method()} ${url.pathname}` });
  // Step 9 only: a real /3d request's answers, as the server and the Blender job give them, all in the browser.
  if (canvasStubs && url.pathname === '/api/learn/artifact') {
    const body = JSON.parse(request.postData() || '{}');
    assert.equal(body.command, '3d');
    return route.fulfill({ json: { result: 'paid_proposal', primitive: 'blender_scene', message: 'This uses paid generation.', estimatedCost: null, repaired: false,
      block: { type: 'scene', title: 'Perspective projection', brief: 'Blender compiles this validated scene into a glTF asset; the viewer below is the same three.js renderer.', operation: { op: 'generate_3d_animation', id: 'perspective-frustum', concept: 'perspective projection', purpose: 'spatial_intuition', output: 'glb', duration: 3, caption: 'A camera frustum.', scene: { objects: [{ id: 'cube', type: 'cube', position: [0, 0, -3] }], animations: [] } }, status: 'idle', modelUrl: '', camera: {}, autoRotate: false, animation: { autoplay: true }, animationTime: 0 } } });
  }
  if (canvasStubs && url.pathname === '/api/learn/scene') {
    if (request.method() === 'POST') { placement = `l9-${run}`; return route.fulfill({ json: { placementId: placement } }); }
    if (url.searchParams.get('asset')) return route.fulfill({ contentType: 'model/gltf-binary', body: GLB });
    return route.fulfill({ json: { scenes: placement ? [{ id: placement, status: 'ready', key: 'l9-key' }] : [] } });
  }
  if (request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 16; // 6 per theme, then 4
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

// A PNG's pixels (RGB or RGBA, filtered), for the share of drawn pixels and the share that changed between two shots.
function decode(png) {
  const b = Buffer.from(png); let at = 8, w = 0, h = 0, bpp = 4; const idat = [];
  while (at < b.length) { const len = b.readUInt32BE(at), type = b.toString('ascii', at + 4, at + 8); if (type === 'IHDR') { w = b.readUInt32BE(at + 8); h = b.readUInt32BE(at + 12); bpp = b[at + 17] === 2 ? 3 : 4; } if (type === 'IDAT') idat.push(b.subarray(at + 8, at + 8 + len)); at += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, up = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      out[y * stride + x] = (line[x] + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
    }
  }
  return { w, h, bpp, out };
}
const ink = png => {
  const { w, h, bpp, out } = decode(png);
  const tally = new Map(); for (let i = 0; i < out.length; i += bpp) { const k = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2]; tally.set(k, (tally.get(k) || 0) + 1); }
  const bg = [...tally.entries()].sort((x, y) => y[1] - x[1])[0][0], [r, g, b] = [bg >> 16, (bg >> 8) & 255, bg & 255];
  let count = 0; for (let i = 0; i < out.length; i += bpp) if (Math.abs(out[i] - r) + Math.abs(out[i + 1] - g) + Math.abs(out[i + 2] - b) > 40) count++;
  return count / (w * h);
};
const changed = (one, two) => {
  const a = decode(one), b = decode(two);
  if (a.w !== b.w || a.h !== b.h) return 1;
  let count = 0; for (let i = 0; i < a.out.length; i += a.bpp) if (Math.abs(a.out[i] - b.out[i]) + Math.abs(a.out[i + 1] - b.out[i + 1]) + Math.abs(a.out[i + 2] - b.out[i + 2]) > 24) count++;
  return count / (a.w * a.h);
};

const browser = await chromium.launch();
const open = async theme => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 760 }, colorScheme: theme });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(value => { try { localStorage.setItem('small.theme', value); } catch { /* the default theme then */ } }, theme);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(`${theme}: ${error.message}`));
  const mark = seen.length;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
  // The page's one-time CAD status read lands before the window opens, so the window's count cannot catch it.
  await until(() => Promise.resolve(seen.slice(mark).some(entry => entry.request === 'GET /api/learn/cad/jobs')), 'the page never restored CAD status', 30000);
  return { context, page };
};
const sheetOf = page => page.getByRole('dialog', { name: 'Slash commands' });
const openSheet = async page => {
  phase = 'window';
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: 'Slash commands' }).click();
  await sheetOf(page).waitFor();
  await sheetOf(page).locator('[data-slash-help="3d"]').click();
};
const close = async page => { await sheetOf(page).getByRole('button', { name: 'Close slash commands' }).click(); await sheetOf(page).waitFor({ state: 'detached' }); phase = 'page'; };
const parts = page => {
  const sheet = sheetOf(page), card = sheet.locator('[data-slash-card="scene"]'), viewer = card.locator('[data-three-d-viewer]');
  const tools = sheet.locator('[data-cad-tools^="slash-sheet:"]');
  // The preview's scroll box: the pane around the card.
  const pane = card.locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]');
  return { sheet, card, viewer, tools, pane, interact: tools.locator('[data-cad-interact]'), fit: tools.locator('[data-cad-fit]') };
};
// The viewer's picture above its foot, where the loading and Drag to orbit hints sit: the camera checks compare the model only.
// Brought fully into view first, so two shots compare the same pixels wherever the preview was scrolled (callers check the
// preview's scroll before taking one).
const still = async (page, viewer) => {
  await viewer.scrollIntoViewIfNeeded();
  const box = await viewer.boundingBox();
  return page.screenshot({ clip: { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 34 } });
};
const live = viewer => until(() => viewer.evaluate(node => node.hasAttribute('data-viewer-live')), 'the viewer never went live', 20000);
// The scroll box is put at the top and the model under the pointer, so one wheel tick can scroll it.
const hover = async (page, viewer) => { const box = await viewer.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); return box; };

for (const theme of ['light', 'dark']) {
  const { context, page } = await open(theme);
  let opening;
  await step(`${theme}: the model renders on open in the scene card, with Interact and Fit view outside it and no picture`, async () => {
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', 'the theme class');
    const before = seen.length;
    await openSheet(page);
    const { sheet, card, viewer, tools, interact, fit } = parts(page);
    await card.waitFor();
    await live(viewer);
    assert.equal(await sheet.locator('img[data-slash-illustration]').count(), 0, 'no picture');
    assert.equal(await viewer.locator('canvas[data-engine^="three.js"]').count(), 1, 'the three.js renderer canvas');
    assert.equal(await card.getByText('3D model', { exact: true }).count(), 1, 'the scene card kicker');
    // The toolbar is outside the card and above it at its right; nothing inside the viewer is a control.
    assert.equal(await card.locator('[data-cad-tools]').count(), 0, 'no toolbar in the card');
    assert.equal(await viewer.locator('button, [role="toolbar"]').count(), 0, 'no control in the viewer');
    const [toolBox, cardBox] = [await tools.boundingBox(), await card.boundingBox()];
    assert.ok(toolBox.y + toolBox.height <= cardBox.y && Math.abs(toolBox.x + toolBox.width - (cardBox.x + cardBox.width)) <= 1, `toolbar ${JSON.stringify(toolBox)} card ${JSON.stringify(cardBox)}`);
    assert.equal((await interact.innerText()).trim(), 'Interact');
    assert.ok(await interact.isEnabled() && await fit.isEnabled(), 'Interact and Fit view are on once the model is live');
    assert.equal(await tools.locator('[data-cad-dimensions-toggle]').count(), 0, 'no Show dimensions for a scene');
    const drawn = ink(await viewer.screenshot());
    assert.ok(drawn > 0.01 && drawn < 0.9, `drawn pixels ${drawn.toFixed(3)}`);
    // Paused so the camera checks compare still frames (the sample's 3 s sweep plays by default, as on the canvas).
    await card.getByRole('button', { name: 'Pause animation' }).click();
    await page.waitForTimeout(400);
    opening = await still(page, viewer);
    // The review shot: the whole window at a taller size, the preview at its top (Pause scrolled it).
    await page.setViewportSize({ width: 1440, height: 1000 });
    await parts(page).pane.evaluate(node => { node.scrollTop = 0; });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await sheet.screenshot({ path: `${OUT}/${theme}-1-open.png` });
    await page.setViewportSize({ width: 1440, height: 760 });
    await page.waitForTimeout(300);
    assert.deepEqual(fromWindow(before), [], 'model or job requests from the window');
  });
  await step(`${theme}: before Interact the wheel scrolls the window and the camera stays`, async () => {
    const { viewer, pane } = parts(page);
    await pane.evaluate(node => { node.scrollTop = 0; });
    assert.ok(await pane.evaluate(node => node.scrollHeight > node.clientHeight + 20), 'the preview overflows, so it can scroll');
    await hover(page, viewer);
    await page.mouse.wheel(0, 200);
    await until(() => pane.evaluate(node => node.scrollTop > 0), 'the preview did not scroll');
    await page.waitForTimeout(300);
    const after = await still(page, viewer);
    assert.ok(changed(opening, after) < 0.002, `the camera moved: ${changed(opening, after).toFixed(4)}`);
    await pane.evaluate(node => { node.scrollTop = 0; });
  });
  await step(`${theme}: Interact - a drag orbits and the wheel zooms, and the window does not scroll`, async () => {
    const { sheet, viewer, interact, pane } = parts(page);
    await interact.click();
    await until(() => viewer.evaluate(node => node.hasAttribute('data-viewer-active')), 'Interact did not start');
    assert.equal(await interact.getAttribute('aria-pressed'), 'true');
    assert.equal((await interact.innerText()).trim(), 'Done');
    const box = await hover(page, viewer);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 25, { steps: 10 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const orbited = await still(page, viewer);
    assert.ok(changed(opening, orbited) > 0.01, `a drag did not move the camera: ${changed(opening, orbited).toFixed(4)}`);
    const top = await pane.evaluate(node => node.scrollTop);
    await hover(page, viewer);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(300);
    assert.equal(await pane.evaluate(node => node.scrollTop), top, 'the window scrolled while interacting');
    const zoomed = await still(page, viewer);
    assert.ok(changed(orbited, zoomed) > 0.01, `the wheel did not zoom: ${changed(orbited, zoomed).toFixed(4)}`);
    await sheet.screenshot({ path: `${OUT}/${theme}-3-interacting.png` });
  });
  await step(`${theme}: Fit view frames the model as it opened`, async () => {
    const { viewer, fit } = parts(page);
    await fit.click();
    await page.waitForTimeout(400);
    const fitted = await still(page, viewer);
    assert.ok(changed(opening, fitted) < 0.002, `not the opening framing: ${changed(opening, fitted).toFixed(4)}`);
  });
  await step(`${theme}: Escape ends the interaction and the window stays open`, async () => {
    const { sheet, viewer, interact, pane } = parts(page);
    await page.keyboard.press('Escape');
    await until(() => viewer.evaluate(node => !node.hasAttribute('data-viewer-active')), 'Escape did not end the interaction');
    assert.equal(await interact.getAttribute('aria-pressed'), 'false');
    await page.waitForTimeout(300);
    assert.ok(await sheet.isVisible(), 'the window closed');
    await pane.evaluate(node => { node.scrollTop = 0; });
    await hover(page, viewer);
    await page.mouse.wheel(0, 200);
    await until(() => pane.evaluate(node => node.scrollTop > 0), 'after Escape the wheel did not scroll the window');
    await pane.evaluate(node => { node.scrollTop = 0; });
  });
  await step(`${theme}: closing and reopening the window shows the model live again`, async () => {
    const before = seen.length;
    await close(page);
    await openSheet(page);
    const { sheet, viewer, interact } = parts(page);
    await live(viewer);
    assert.ok(await interact.isEnabled(), 'Interact is on again');
    assert.equal(await interact.getAttribute('aria-pressed'), 'false');
    const drawn = ink(await viewer.screenshot());
    assert.ok(drawn > 0.01, `drawn pixels ${drawn.toFixed(3)}`);
    await sheet.screenshot({ path: `${OUT}/${theme}-6-reopened.png` });
    assert.deepEqual(fromWindow(before), [], 'model or job requests from the window');
    await close(page);
  });
  if (theme === 'dark') { await context.close(); continue; }

  await step('a model file that 404s shows the viewer\'s own failure and Retry model, never the picture; Retry loads it', async () => {
    missingGlb = true;
    await openSheet(page);
    const { sheet, card, viewer, interact } = parts(page);
    const failure = card.locator('[data-three-d-error]');
    await failure.waitFor();
    assert.match(await failure.innerText(), /Model download failed \(404\)/);
    assert.equal(await sheet.locator('img[data-slash-illustration]').count(), 0, 'no picture');
    assert.ok(!(await interact.isEnabled()), 'Interact stays off for a failed viewer');
    await sheet.screenshot({ path: `${OUT}/light-7-failure.png` });
    missingGlb = false;
    await failure.getByRole('button', { name: 'Retry model' }).click();
    await live(viewer);
    assert.equal(await failure.count(), 0);
    await close(page);
  });
  const dock = page.locator('[data-chat-pane]');
  const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
  await step('the selected /3d pill reads 3D, and its x is Remove 3D', async () => {
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    await composer().click();
    await composer().fill('/3d ');
    const pill = dock.locator('[data-command-pill="3d"]');
    await pill.waitFor();
    assert.equal((await pill.innerText()).trim(), '3D');
    assert.equal(await dock.getByRole('button', { name: 'Remove 3D', exact: true }).count(), 1);
    await dock.screenshot({ path: `${OUT}/light-8-pill.png` });
  });
  await step('a real /3d card on the canvas has the preview\'s card width, body size and DOM, on the same renderer', async () => {
    canvasStubs = true; phase = 'canvas';
    await composer().fill('a camera frustum');
    await composer().press('Enter');
    await dock.locator('[data-paid-generate]').click();
    const block = page.locator('[data-block-id]').filter({ has: page.locator('[data-three-d-viewer]') });
    await block.waitFor({ timeout: 20000 });
    await live(block.locator('[data-three-d-viewer]'));
    canvasStubs = false;
    // The ThreeDBody subtree: tags, data- and role attribute names, classes; values that differ per card (ids) left out.
    const shape = root => root.evaluate(node => {
      const walk = element => [element.tagName.toLowerCase(), [...element.attributes].map(a => a.name).filter(n => n.startsWith('data-') || n === 'role').sort().join(','),
        typeof element.className === 'string' ? element.className : '', [...element.children].map(walk)];
      const body = node.querySelector('[data-three-d-viewer]').parentElement;
      return { tree: JSON.stringify(walk(body)), body: [body.offsetWidth, body.offsetHeight], viewer: [body.querySelector('[data-three-d-viewer]').offsetWidth, body.querySelector('[data-three-d-viewer]').offsetHeight], engine: body.querySelector('canvas').dataset.engine };
    });
    const onCanvas = await shape(block);
    const frameWidth = await block.evaluate(node => node.offsetWidth);
    await page.locator('body').evaluate(() => document.activeElement?.blur());
    await openSheet(page);
    const { card, viewer } = parts(page);
    await live(viewer);
    const inSheet = await shape(card);
    assert.equal(inSheet.tree, onCanvas.tree, 'the same ThreeDBody DOM');
    assert.deepEqual(inSheet.body, onCanvas.body, 'the same body size');
    assert.deepEqual(inSheet.viewer, onCanvas.viewer, 'the same viewer size');
    assert.equal(inSheet.engine, onCanvas.engine);
    assert.equal(await card.evaluate(node => node.offsetWidth), frameWidth, 'the same card width');
    console.log(`   card ${frameWidth} px wide, body ${onCanvas.body.join('x')}, viewer ${onCanvas.viewer.join('x')}, ${onCanvas.engine}`);
    await close(page);
    await page.screenshot({ path: `${OUT}/light-9-canvas-card.png` });
  });
  await context.close();
}

await step('no page errors; no model or job request from the window; the canvas\'s stubbed ones never reached the server', async () => {
  const during = which => seen.filter(entry => entry.phase === which).map(entry => entry.request);
  const tally = list => Object.entries(list.reduce((out, request) => ({ ...out, [request]: (out[request] || 0) + 1 }), {})).map(([request, n]) => `${request} x${n}`).join(', ') || 'none';
  assert.deepEqual(fromWindow(0), [], 'model or job requests from the window');
  // The page's own reads seen while the window was open run with it closed too.
  for (const request of new Set(during('window'))) assert.ok(during('page').includes(request), `${request} came only while the window was open`);
  const canvasRequests = during('canvas');
  assert.ok(canvasRequests.every(request => PAGE_READS.includes(request) || /^(POST|GET) \/api\/learn\/(artifact|scene)$/.test(request)), canvasRequests.join(' '));
  assert.ok(canvasRequests.includes('POST /api/learn/artifact') && canvasRequests.includes('POST /api/learn/scene'), canvasRequests.join(' '));
  assert.deepEqual(refused, [], 'aborted model requests');
  assert.deepEqual(outside, [], 'requests to other origins');
  assert.deepEqual(errors, [], 'page errors');
  console.log(`   window (both themes: open, reopen, 404 and Retry): model/job requests: ${tally(fromWindow(0))}; the page's own reads meanwhile: ${tally(during('window'))}`);
  console.log(`   the canvas's /3d card, every one answered in the browser: ${tally(canvasRequests)}`);
  console.log(`   the page's idle notebook warm-up (aborted): ${warmups.length} request(s)`);
});
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
