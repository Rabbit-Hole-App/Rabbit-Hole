// Budgets for the model viewer (file-imports Lane 4): synthetic files at the 25 MiB source cap, through the real
// importer and card (e2e/model-viewer.html), timed to a ready card, with the JS heap and the WebGL renderer named.
// A measurement, not a check: `node e2e/model-budget-measure.mjs [gpu]` (gpu: ask headless Chromium for D3D11).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { splatFile, spzFile, plyPoints, stlBinary } from './model-fixtures.mjs';

const MiB = 1048576;
function bigStl(triangles) {
  const out = new DataView(new ArrayBuffer(84 + triangles * 50)); out.setUint32(80, triangles, true);
  for (let k = 0; k < triangles; k++) { const at = 84 + k * 50, x = (k % 1000) / 100, y = Math.floor(k / 1000) / 100; [0, 0, 1, x, y, 0, x + 0.01, y, 0, x, y + 0.01, Math.sin(x) * 0.1].forEach((v, i) => out.setFloat32(at + i * 4, v, true)); }
  return new Uint8Array(out.buffer);
}
function bigGlb(side) { // a side x side grid: side^2 vertices, 2(side-1)^2 triangles, uint32 indices
  const n = side * side, pos = new Float32Array(n * 3), idx = new Uint32Array((side - 1) * (side - 1) * 6);
  for (let i = 0; i < n; i++) { const x = i % side, y = Math.floor(i / side); pos.set([x / side, Math.sin(x / 40) * Math.cos(y / 40) * 0.05, y / side], i * 3); }
  let k = 0; for (let y = 0; y < side - 1; y++) for (let x = 0; x < side - 1; x++) { const a = y * side + x; idx.set([a, a + side, a + 1, a + 1, a + side, a + side + 1], k); k += 6; }
  const bin = new Uint8Array(pos.byteLength + idx.byteLength); bin.set(new Uint8Array(pos.buffer)); bin.set(new Uint8Array(idx.buffer), pos.byteLength);
  const json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: [0, -0.05, 0], max: [1, 0.05, 1] }, { bufferView: 1, componentType: 5125, count: idx.length, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength }], buffers: [{ byteLength: bin.length }] });
  const j = new TextEncoder().encode(json + ' '.repeat((4 - (json.length % 4)) % 4));
  const out = new DataView(new ArrayBuffer(12 + 8 + j.length + 8 + bin.length));
  out.setUint32(0, 0x46546c67, true); out.setUint32(4, 2, true); out.setUint32(8, out.byteLength, true);
  out.setUint32(12, j.length, true); out.setUint32(16, 0x4e4f534a, true); new Uint8Array(out.buffer).set(j, 20);
  out.setUint32(20 + j.length, bin.length, true); out.setUint32(24 + j.length, 0x004e4942, true); new Uint8Array(out.buffer).set(bin, 28 + j.length);
  return new Uint8Array(out.buffer);
}
const ring = n => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 * 37, r = 1 + (i % 97) / 300; return { x: Math.cos(a) * r, y: ((i % 1013) / 1013 - 0.5) * 0.6, z: Math.sin(a) * r, scale: [0.01, 0.01, 0.006], rot: [1, 0, 0, 0], rgb: [(i % 255) / 255, 0.5, 0.7], opacity: 0.8 }; });

const files = {
  'stl-500k.stl': bigStl(500_000),
  'glb-1m.glb': bigGlb(708),
  'points-1.6m.ply': plyPoints(1_600_000),
  'splat-780k.splat': splatFile(ring(780_000)),
  'spz-1.5m.spz': spzFile(ring(1_500_000)),
  'cube.stl': stlBinary(),
};
const server = await createServer({ root: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), server: { port: 5392, strictPort: false }, logLevel: 'error' });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const gpu = process.argv.includes('gpu');
const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route('**/__fixtures/**', route => { const body = files[decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__fixtures\//, ''))]; return body ? route.fulfill({ body: Buffer.from(body) }) : route.fulfill({ status: 404 }); });
await page.goto(`${origin}/e2e/model-viewer.html`, { waitUntil: 'commit', timeout: 180000 });
await page.waitForFunction(() => window.__drop, null, { timeout: 300000 });
const glName = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
const rows = [];
for (const name of Object.keys(files)) {
  await page.evaluate(() => window.__clear());
  const heap0 = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  const started = Date.now();
  const { blocks, errors } = await page.evaluate(list => window.__drop(list), [name]);
  const id = blocks[0]?.id;
  await page.locator(`[data-block-id="${id}"] [data-model-card][data-model-state="ready"], [data-block-id="${id}"] [data-model-error], [data-block-id="${id}"] [data-model-limited]`).first().waitFor({ timeout: 240000 }).catch(() => {});
  const readyMs = Date.now() - started;
  const state = id ? await page.locator(`[data-block-id="${id}"] [data-model-card]`).getAttribute('data-model-state') : 'none';
  // Frame pacing while orbiting: mean and worst rAF interval over 60 frames of an active drag.
  let frames = null;
  if (state === 'ready') {
    await page.locator(`[data-block-id="${id}"] [data-model-interact]`).click();
    const box = await page.locator(`[data-block-id="${id}"] [data-pointer-body]`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    const sampling = page.evaluate(() => new Promise(resolve => { const t = []; let last = performance.now(); const tick = now => { t.push(now - last); last = now; if (t.length < 60) requestAnimationFrame(tick); else resolve(t); }; requestAnimationFrame(tick); }));
    for (let i = 0; i < 30; i++) await page.mouse.move(box.x + box.width / 2 + i * 6, box.y + box.height / 2 + Math.sin(i) * 20);
    const t = await sampling; await page.mouse.up(); await page.keyboard.press('Escape');
    frames = { meanMs: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1), worstMs: Math.round(Math.max(...t)) };
  }
  const heap1 = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  const counts = id ? await page.locator(`[data-block-id="${id}"] [data-model-counts]`).textContent({ timeout: 200 }).catch(() => '') : '';
  rows.push({ name, MiB: +(files[name].length / MiB).toFixed(1), state, readyMs, counts, heapMiB: +((heap1 - heap0) / MiB).toFixed(0), ...frames, error: errors[0] || '' });
}
console.log(`renderer: ${glName}`);
console.table(rows);
await browser.close(); await server.close();
