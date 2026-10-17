// Model cards in a real browser (file-imports Lane 4): every 3D, PLY and splat fixture goes through the real importer
// into the real ModelCard on a stand-in canvas (e2e/model-viewer.html), renders visible pixels, and the explicit
// interaction state holds: an inactive viewer passes the wheel and presses to the canvas, an active one keeps them, Esc
// ends it first; at most MAX_LIVE renderers; a lost context never writes the card; missing and external dependencies
// are named and never fetched. Self-contained: starts its own Vite dev server, serves fixtures from memory.
//   node e2e/model-viewer-check.mjs            (KHRONOS=<dir> adds the downloaded Khronos samples; MEASURE=1 prints timings)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { inflateSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { allFixtures } from './model-fixtures.mjs';

const F = allFixtures();
const khronos = process.env.KHRONOS || 'C:/s/fi-fixtures/3d/khronos';
const extra = existsSync(khronos) ? { 'khronos/Fox.glb': 'Fox.glb', 'khronos/DamagedHelmet.glb': 'DamagedHelmet.glb', 'khronos/Duck/Duck.gltf': 'Duck/Duck.gltf', 'khronos/Duck/Duck0.bin': 'Duck/Duck0.bin', 'khronos/Duck/DuckCM.png': 'Duck/DuckCM.png' } : {};
for (const [key, rel] of Object.entries(extra)) F[key] = new Uint8Array(readFileSync(join(khronos, rel)));

let step = 0, failed = 0;
const total = 16;
const ok = (cond, label, detail = '') => { step++; if (cond) console.log(`✓ ${step}/${total} ${label}`); else { failed++; console.log(`✗ ${step}/${total} ${label} ${detail}`); } };

// PNG -> share of pixels that differ from the background.
function inkShare(png) {
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
  // The background is the most common colour (the renderer's clear colour after colour management).
  const tally = new Map(); for (let i = 0; i < out.length; i += bpp) { const k = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2]; tally.set(k, (tally.get(k) || 0) + 1); }
  const bg = [...tally.entries()].sort((x, y) => y[1] - x[1])[0][0], [br, bgc, bb] = [bg >> 16, (bg >> 8) & 255, bg & 255];
  let ink = 0; for (let i = 0; i < out.length; i += bpp) if (Math.abs(out[i] - br) + Math.abs(out[i + 1] - bgc) + Math.abs(out[i + 2] - bb) > 40) ink++;
  return ink / (w * h);
}

const server = await createServer({ root: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), server: { port: 5391, strictPort: false }, logLevel: 'error' });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 2600 } });
const outside = [];
page.on('request', request => { const url = request.url(); if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) outside.push(url); });
page.on('pageerror', error => console.log('  page error:', error.message));
await page.route('**/__fixtures/**', route => { const name = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__fixtures\//, '')); const body = F[name]; return body ? route.fulfill({ body: Buffer.from(body) }) : route.fulfill({ status: 404 }); });
// A cold Vite start optimises dependencies first (and may reload once): wait for the harness, not the load event.
// The STEP card's derivatives, as the file routes will serve them (canvas-file-imports.md 4.2; converter output shape).
await page.route('**/api/learn/files/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/d/fd_mesh')) return route.fulfill({ body: Buffer.from(F['cube.glb']), contentType: 'model/gltf-binary' });
  if (path.endsWith('/d/fd_structure')) return route.fulfill({ json: { source_unit: 'millimetre', unit: 'metre', quality: 'normal', parts: 1, meshes: 1, tree: { name: 'cube', meshes: 1 } } });
  return route.fulfill({ status: 404 });
});
await page.goto(`${origin}/e2e/model-viewer.html`, { waitUntil: 'commit', timeout: 180000 });
await page.waitForFunction(() => window.__drop, null, { timeout: 300000 });

const card = id => page.locator(`[data-block-id="${id}"]`);
async function dropOne(items, { wait = 'ready' } = {}) {
  const result = await page.evaluate(list => window.__drop(list), items);
  const id = result.blocks[0]?.id;
  const started = Date.now();
  if (id && wait) await card(id).locator(`[data-model-card][data-model-state="${wait}"], [data-model-error], [data-model-limited], [data-model-missing]`).first().waitFor({ timeout: 60000 }).catch(() => {});
  return { ...result, id, readyMs: Date.now() - started };
}
// SHOTS=<dir> keeps each card's screenshot for a visual look.
const viewerInk = async (id, name = '') => {
  // A static model draws on demand, and headless Chromium keeps only the frame it just drew for a screenshot: Fit draws one.
  await card(id).locator('[data-model-fit]').click(); await page.waitForTimeout(300);
  const ink = inkShare(await card(id).locator('[data-pointer-body]').screenshot(process.env.SHOTS && name ? { path: join(process.env.SHOTS, `viewer-${name.split('/').join('_')}.png`) } : {}));
  if (process.env.SHOTS && name) { await card(id).locator('[data-model-fit]').click(); await page.waitForTimeout(300); await card(id).screenshot({ path: join(process.env.SHOTS, `${name.split('/').join('_')}.png`) }); }
  return ink;
};
const clear = () => page.evaluate(() => window.__clear());
const timings = [];

try {
  // 1-2. Every renderable fixture becomes a ready card with visible pixels.
  const singles = ['cube.glb', 'cube-textured.glb', 'cube-animated.glb', 'cube-embedded.gltf', 'cube-binary.stl', 'cube-ascii.stl', 'cube-no-mtl.obj', 'cube.3mf', 'cube-ascii.fbx', 'cube-binary.fbx', 'mesh-ascii.ply', 'mesh-binary.ply', 'points.ply', 'splat-3dgs.ply', 'splat-3dgs-sh1.ply', 'ring.splat', 'ring.ksplat', 'ring.spz', 'ring.sog', ...(extra['khronos/Fox.glb'] ? ['khronos/Fox.glb', 'khronos/DamagedHelmet.glb'] : [])];
  const bad = [];
  for (const name of singles) {
    const r = await dropOne([name]);
    const state = await card(r.id).locator('[data-model-card]').getAttribute('data-model-state');
    const error = await card(r.id).locator('[data-model-error], [data-model-limited]').first().textContent({ timeout: 100 }).catch(() => '');
    const ink = state === 'ready' ? await viewerInk(r.id, name) : 0;
    const counts = await card(r.id).locator('[data-model-counts]').textContent({ timeout: 100 }).catch(() => '');
    timings.push({ name, bytes: F[name].length, importMs: r.importMs, readyMs: r.readyMs, counts, ink: +ink.toFixed(3) });
    if (state !== 'ready' || error || ink < 0.01 || ink > 0.9) bad.push(`${name}: state=${state} ink=${ink.toFixed(3)} ${error}`);
    await clear();
  }
  ok(!bad.length, `${singles.length} single-file fixtures render (glb, gltf, stl, obj, 3mf, fbx, ply mesh/points/splat, splat, ksplat, spz, sog)`, bad.join('; '));
  const tex = await dropOne(['obj/cube.obj', 'obj/cube.mtl', 'obj/checker.png']);
  const sep = await dropOne(['gltf-separate/cube.gltf', 'gltf-separate/cube.bin', 'gltf-separate/textures/checker.png']);
  const folder = await dropOne(Object.keys(F).filter(k => k.startsWith('sog-folder/')).map(k => ({ url: k, bundleRoot: 'sog-folder', bundlePath: k.slice('sog-folder/'.length) })));
  const bundles = [tex, sep, folder];
  const bundleState = await Promise.all(bundles.map(b => card(b.id).locator('[data-model-card]').getAttribute('data-model-state')));
  ok(bundles.every(b => b.blocks.length === 1 && !b.leftovers.length) && bundleState.every(s => s === 'ready') && (await viewerInk(tex.id, 'obj-textured')) > 0.01, 'OBJ+MTL+PNG, glTF+bin+PNG and an unpacked SOG folder are one ready card each', JSON.stringify(bundleState));
  await clear();

  // 3. Missing dependencies are named; supplying them makes the card whole.
  const lonely = await dropOne(['gltf-separate/cube.gltf'], { wait: null });
  await card(lonely.id).locator('[data-model-missing]').waitFor();
  const missingText = await card(lonely.id).locator('[data-model-missing]').textContent();
  await card(lonely.id).locator('[data-model-missing] input[type=file]').setInputFiles([{ name: 'cube.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(F['gltf-separate/cube.bin']) }, { name: 'checker.png', mimeType: 'image/png', buffer: Buffer.from(F['gltf-separate/textures/checker.png']) }]);
  await card(lonely.id).locator('[data-model-card][data-model-state="ready"]').waitFor({ timeout: 30000 }).catch(() => {});
  const healed = await card(lonely.id).locator('[data-model-missing]').count();
  ok(/cube\.bin/.test(missingText) && /checker\.png/.test(missingText) && healed === 0, 'a lonely .gltf names cube.bin and checker.png; adding them repairs the card', missingText);
  await clear();

  // 4. External references are listed and never requested.
  const ext = await dropOne(['cube-external-refs.gltf'], { wait: null });
  await card(ext.id).locator('[data-model-missing]').waitFor();
  await page.waitForTimeout(1500);
  const extText = await card(ext.id).locator('[data-model-missing]').textContent();
  ok(/example\.com\/cube\.bin/.test(extText) && !outside.length, 'a glTF naming https:// and file:/// resources lists them and the browser fetches neither', `${extText} | outside: ${outside.join(', ')}`);
  await clear();

  // 5. A ZIP with two models asks; choosing one shows it.
  const two = await dropOne(['two-models.zip'], { wait: null });
  await card(two.id).locator('[data-model-choice]').first().waitFor();
  const choices = await card(two.id).locator('[data-model-choice]').count();
  await card(two.id).locator('[data-model-choice="b/cube.glb"]').click();
  await card(two.id).locator('[data-model-card][data-model-state="ready"]').waitFor({ timeout: 30000 }).catch(() => {});
  ok(choices === 2 && (await card(two.id).locator('[data-model-card]').getAttribute('data-model-state')) === 'ready', 'a ZIP holding two models offers both; the chosen one opens');
  await clear();

  // 6-9. Interaction state on one card.
  const one = await dropOne(['cube.glb']);
  const viewer = card(one.id).locator('[data-pointer-body]');
  const box = await viewer.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let before = await page.evaluate(() => window.__log.wheel);
  await page.mouse.wheel(0, 120);
  const inactiveWheel = (await page.evaluate(() => window.__log.wheel)) - before;
  ok(inactiveWheel > 0 && (await card(one.id).locator('[data-model-card]').getAttribute('data-model-state')) === 'ready', 'inactive: the wheel over the viewer reaches the canvas');
  await card(one.id).locator('[data-model-interact]').click();
  const activeState = await card(one.id).locator('[data-model-card]').getAttribute('data-model-state');
  before = await page.evaluate(() => ({ wheel: window.__log.wheel, pointer: window.__log.pointer, changes: window.__log.changes.length }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 }); await page.mouse.up();
  const after = await page.evaluate(() => ({ wheel: window.__log.wheel, pointer: window.__log.pointer }));
  ok(activeState === 'active' && after.wheel === before.wheel && after.pointer === before.pointer, 'active: orbit and zoom stay inside the viewer (no wheel or press reaches the canvas)', JSON.stringify({ activeState, before, after }));
  await page.keyboard.press('Escape');
  const escape = await page.evaluate(() => window.__log.keys.filter(k => k.key === 'Escape').at(-1));
  const afterEsc = await card(one.id).locator('[data-model-card]').getAttribute('data-model-state');
  const saved = await page.evaluate(n => window.__log.changes.slice(n), before.changes);
  ok(escape?.viewerOwnsFocus && afterEsc === 'ready', 'Esc ends the interaction first, while the viewer owns the focus (the canvas key handler stands down)', JSON.stringify({ escape, afterEsc }));
  ok(saved.length === 1 && saved[0].camera?.position?.every(Number.isFinite), 'the camera is saved once, when the interaction ends', JSON.stringify(saved));
  // A press outside the card ends an interaction too.
  await viewer.dblclick();
  const viaDbl = await card(one.id).locator('[data-model-card]').getAttribute('data-model-state');
  await page.mouse.click(5, 5);
  ok(viaDbl === 'active' && (await card(one.id).locator('[data-model-card]').getAttribute('data-model-state')) === 'ready', 'double-click enters; a press outside the card ends it');

  // 11. Context loss: the card says so, writes nothing, and reloads.
  const changesBefore = await page.evaluate(() => window.__log.changes.length);
  await page.evaluate(id => document.querySelector(`[data-block-id="${id}"] canvas`).getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(), one.id);
  await card(one.id).locator('[data-model-error]').waitFor({ timeout: 5000 }).catch(() => {});
  const lostText = await card(one.id).locator('[data-model-error]').textContent({ timeout: 100 }).catch(() => '');
  const changesAfter = await page.evaluate(() => window.__log.changes.length);
  await card(one.id).getByRole('button', { name: 'Reload viewer' }).click();
  await card(one.id).locator('[data-model-card][data-model-state="ready"]').waitFor({ timeout: 30000 }).catch(() => {});
  ok(/graphics context was lost/.test(lostText) && changesAfter === changesBefore && (await card(one.id).locator('[data-model-card]').getAttribute('data-model-state')) === 'ready', 'a lost WebGL context pauses the viewer without writing the card; Reload viewer recovers', lostText);
  await clear();

  // 12. Live renderer cap.
  const many = [];
  for (let i = 0; i < 5; i++) many.push(await dropOne(['cube-binary.stl'], { wait: null }));
  await page.waitForTimeout(3000);
  const canvases = await page.locator('[data-model-card] canvas').count();
  const live = await page.evaluate(() => window.__liveCount());
  const shows = await page.locator('[data-model-show]').count();
  ok(canvases <= 3 && live <= 3 && shows >= 2, 'five visible models: at most three renderers, the rest offer Show 3D', JSON.stringify({ canvases, live, shows }));
  await page.locator('[data-model-show]').first().click();
  await page.waitForTimeout(1500);
  ok((await page.locator('[data-model-card] canvas').count()) <= 3, 'Show 3D takes a slot from the least recently used viewer, never past three');
  await clear();

  // 14. Unsafe packages make no card.
  const unsafe = [];
  for (const name of ['traversal.zip', 'symlink.zip', 'bomb.zip', 'bad-splat-missing-rot.ply']) { const r = await page.evaluate(list => window.__drop(list), [name]); unsafe.push([name, r.blocks.length, r.errors[0]]); }
  ok(unsafe.every(([, n, e]) => n === 0 && e), 'traversal, symlink and bomb ZIPs and an inconsistent splat PLY are refused with a reason', JSON.stringify(unsafe));
  await clear();

  // 15-16. STEP: awaiting the converter, then its GLB derivative in the same viewer, sized in the file's unit.
  const step = await dropOne(['cube-header-only.step'], { wait: null });
  const awaiting = await card(step.id).locator('[data-model-cad]').getAttribute('data-model-cad', { timeout: 10000 }).catch(() => null);
  const download = await card(step.id).locator('[data-model-download]').isEnabled();
  ok(awaiting === 'awaiting' && download, 'a STEP card says it awaits the converter and keeps Download original', String(awaiting));
  await page.evaluate(id => window.__patch(id, { fileRef: { v: 1, source: { id: 'fs_test', rev: 'x' }, family: 'cad', job: null, derivatives: { mesh: 'fd_mesh', structure: 'fd_structure' } } }), step.id);
  await card(step.id).locator('[data-model-card][data-model-state="ready"]').waitFor({ timeout: 30000 }).catch(() => {});
  const cadSize = await card(step.id).locator('[data-model-size]').textContent({ timeout: 2000 }).catch(() => '');
  const cadNote = await card(step.id).locator('[data-model-cad-note]').count();
  ok(cadSize === '1000 × 1000 × 1000 mm' && cadNote === 1 && (await viewerInk(step.id, 'step-derivative')) > 0.01, 'with its GLB derivative the STEP card renders, sized in the declared millimetres, marked a preview mesh', cadSize);
} finally {
  if (process.env.MEASURE) console.table(timings);
  await browser.close(); await server.close();
}
console.log(failed ? `FAIL ${step - failed}/${total}` : `PASS ${step}/${total}`);
process.exit(failed || step !== total ? 1 : 0);
