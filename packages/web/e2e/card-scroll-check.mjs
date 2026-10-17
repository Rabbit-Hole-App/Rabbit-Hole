// Feature B acceptance through the actual app. No model calls, source rewrites, or runtime test hooks.
// BASE=<local app> SMALL_CP=<local CP> VARS=<named vars file> OUT=<evidence dir> CANDIDATE_SHA=<served SHA>
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { layoutBoard, longCode } from './card-scroll-fixtures.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5441', CP = process.env.SMALL_CP || 'http://127.0.0.1:9093';
for (const origin of [BASE, CP]) assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, 'local stack only');
const OUT = resolve(process.env.OUT || 'e2e/shots/card-scroll'); mkdirSync(OUT, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || (process.env.VARS && readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Set TEST_BYPASS_SECRET or VARS');
const run = Date.now().toString(36), results = [], errors = [], blocked = [];
const until = async (condition, message, ms = 12000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await condition()) return; await new Promise(r => setTimeout(r, 80)); } throw Error(message); };
const close = (actual, expected, message, tolerance = 2) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const api = async (path, method = 'GET', body) => {
  const response = await fetch(BASE + path, { method, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', origin: BASE }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.ok(response.ok, `${method} ${path}: ${response.status}`); return data;
};
const minted = await fetch(CP + '/test/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `layout-${run}@example.com`, secret }) });
const session = (await minted.json()).session; assert.ok(session);
await api('/api/profile', 'PUT', { handle: `layout_${run}` });
const browser = await chromium.launch();
const guard = async context => context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  const model = /^\/api\/(?:ask|repositories\/[^/]+\/(?:ask|learn-course)|learn\/(?:ask|selection|tutor|plan|artifact|assess|grade|home-ask|course|image|media|inline|journey|scene|transcribe|tts|voice|dive|explore))(?:\/|$)/.test(url.pathname) || /\/shared\/[^/]+\/(ask|next-steps)$/.test(url.pathname);
  if (model && request.method() !== 'GET') { blocked.push(url.pathname); return route.abort(); }
  if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== BASE) return route.abort();
  return route.continue();
});
async function fixture(type = 'explanation', options = {}) {
  const canvas = await api('/api/canvases', 'POST', { title: `Layout ${type} ${run}` });
  const path = `/api/learn/boards/${canvas.name}/main`;
  const state = options.state || layoutBoard(type); await api(path, 'PUT', { state });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await guard(context); await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  if (options.prepare) await options.prepare(page);
  await page.goto(`${BASE}/apps/${canvas.name}`, { waitUntil: 'domcontentloaded' }); await page.locator('[data-block-id="subject"]').waitFor({ timeout: 60000 });
  const card = page.locator('[data-block-id="subject"]');
  const saved = async () => (await api(path)).state;
  const mode = () => card.getAttribute('data-card-layout');
  const setLayout = async label => {
    await card.locator('[data-drag-handle]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Layout', exact: true }).click();
    const option = page.getByRole('menuitemradio', { name: label, exact: true });
    await option.click(); await until(async () => await mode() === (label === 'Full content' ? 'full' : 'scrollable'), `mode ${label}`);
  };
  const geometry = () => page.evaluate(() => {
    const surface = document.querySelector('[data-canvas-surface]'), origin = surface.getBoundingClientRect();
    const world = [...surface.children].find(e => /scale\(/.test(e.style.transform)), matrix = new DOMMatrix(getComputedStyle(world).transform);
    const box = id => { const r = document.querySelector(`[data-block-id="${id}"]`).getBoundingClientRect(); return { x: (r.x - origin.x - matrix.e) / matrix.a, y: (r.y - origin.y - matrix.f) / matrix.d, w: r.width / matrix.a, h: r.height / matrix.d }; };
    return { camera: world.style.transform, zoom: matrix.a, subject: box('subject'), neighbor: box('neighbor') };
  });
  const waitSaved = mode => until(async () => (await saved()).blocks.find(b => b.id === 'subject').cardLayout?.mode === mode, 'layout persisted');
  const noOverflow = async () => {
    const failures = await card.evaluate(root => [...root.querySelectorAll('*')].filter(e => {
      const s = getComputedStyle(e); if (!e.clientWidth || !e.clientHeight) return false;
      return (/auto|scroll|hidden|clip/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 3) || (/auto|scroll|hidden|clip/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 3);
    }).map(e => ({ tag: e.tagName, cls: e.className, w: e.clientWidth, sw: e.scrollWidth, h: e.clientHeight, sh: e.scrollHeight })));
    assert.deepEqual(failures, [], 'Full content must expose content, not hide clipped overflow');
  };
  return { page, context, card, path, state, saved, mode, setLayout, geometry, waitSaved, noOverflow };
}
const checks = [];
const check = (name, action) => checks.push({ name, action });
const unchanged = (before, after) => {
  assert.equal(after.camera, before.camera, 'layout must not change camera');
  close(after.subject.x, before.subject.x, 'subject world x'); close(after.subject.y, before.subject.y, 'subject world y');
  for (const key of ['x', 'y', 'w', 'h']) close(after.neighbor[key], before.neighbor[key], `neighbor world ${key}`);
};
for (const type of ['explanation', 'snippet', 'table', 'image']) check(`${type}: round-trip preserves content, placement, camera, and remembered dimensions`, async () => {
  const f = await fixture(type);
  try {
    const before = await f.geometry(), originalState = await f.saved(), original = originalState.blocks;
    await f.page.screenshot({ path: resolve(OUT, `${type}-scrollable.png`) });
    await f.setLayout('Full content'); await f.waitSaved('full');
    await f.noOverflow(); const full = await f.geometry(); unchanged(before, full);
    const storedState = await f.saved(), stored = storedState.blocks; assert.deepEqual(storedState.links, originalState.links, 'connections preserved');
    for (let i = 0; i < original.length; i++) for (const key of Object.keys(original[i]).filter(k => !['w', 'h'].includes(k))) assert.deepEqual(stored[i][key], original[i][key], `unchanged ${type}.${key}`);
    if (type === 'explanation' || type === 'snippet' || type === 'table') assert.ok(full.subject.h > before.subject.h + 100, 'long content expands');
    if (type === 'snippet') {
      await f.page.evaluate(() => {
        const write = navigator.clipboard.writeText.bind(navigator.clipboard);
        window.__cardCopyWrites = [];
        navigator.clipboard.writeText = text => { window.__cardCopyWrites.push(text); return write(text); };
      });
      await f.card.getByRole('button', { name: 'Copy', exact: true }).first().click();
      assert.deepEqual(await f.page.evaluate(() => window.__cardCopyWrites), [longCode], 'app copies exact original LF source');
      assert.equal((await f.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), longCode, 'OS clipboard preserves source apart from independently observed Windows CRLF normalization');
    }
    if (type === 'image') { const size = await f.card.locator('img').evaluate(e => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, loaded: e.complete && e.naturalWidth > 0 })); assert.ok(size.loaded); close(size.w / size.h, 2, 'image aspect ratio', .01); }
    await f.page.screenshot({ path: resolve(OUT, `${type}-full.png`) });
    await f.setLayout('Scrollable'); await f.waitSaved('scrollable');
    const back = await f.geometry(); unchanged(before, back); close(back.subject.w, before.subject.w, 'restored width'); close(back.subject.h, before.subject.h, 'restored height');
  } finally { await f.context.close(); }
});
check('opening a wide matrix disclosure raises readable width and height without moving the canvas', async () => {
  const state = layoutBoard();
  state.blocks[0].body = 'A compact explanation before opening the complete matrix.';
  const row = Array.from({ length: 56 }, (_, i) => `x_{${i}}`).join(' & ');
  state.blocks[0].more = [{ label: 'Show the complete matrix', text: String.raw`$$\begin{bmatrix}${row}\\${row}\end{bmatrix}$$` + '\n\n' + 'Additional explanation. '.repeat(60) }];
  assert.ok(state.blocks[0].more[0].text.includes(String.raw`\begin{bmatrix}`), 'fixture contains literal LaTeX begin');
  assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(state.blocks[0].more[0].text), 'fixture has no escaped control characters');
  const f = await fixture('explanation', { state }); try {
    await f.setLayout('Full content'); await f.waitSaved('full'); const before = await f.geometry();
    await f.card.getByRole('button', { name: 'Show the complete matrix', exact: true }).click();
    await f.card.locator('.katex-html').waitFor();
    await until(async () => (await f.geometry()).subject.w > 1200, 'real matrix raises the width beyond the default maximum');
    const after = await f.geometry(); unchanged(before, after); assert.ok(after.subject.h > before.subject.h, 'disclosed content grows natural height');
    const bounds = await f.card.locator('.katex-html').evaluate(e => { const r = e.getBoundingClientRect(), c = e.closest('[data-block-id]').getBoundingClientRect(); return { left: r.left, right: r.right, cardLeft: c.left, cardRight: c.right, rendered: e.textContent }; });
    assert.ok(bounds.left >= bounds.cardLeft - 2 && bounds.right <= bounds.cardRight + 2, 'actual rendered matrix fits the card');
    assert.ok(bounds.rendered.includes('55')); await f.noOverflow();
    await f.page.screenshot({ path: resolve(OUT, 'matrix-disclosure-open.png') });
    await f.card.getByRole('button', { name: 'Show the complete matrix', exact: true }).click();
    await until(async () => (await f.geometry()).subject.h < after.subject.h, 'closing disclosure contracts natural height');
    assert.deepEqual((await f.saved()).blocks[0].more, state.blocks[0].more, 'disclosure and measurement preserve original math source');
    await f.page.screenshot({ path: resolve(OUT, 'matrix-disclosure.png') });
  } finally { await f.context.close(); }
});
check('late image decoding grows natural height with stable width, neighbors and camera', async () => {
  const state = layoutBoard('image'); state.blocks[0].src = `${BASE}/__card-layout-delayed-image.svg`;
  let release; const ready = new Promise(resolve => { release = resolve; });
  const f = await fixture('image', { state, prepare: page => page.route('**/__card-layout-delayed-image.svg', async route => { await ready; await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600" fill="#b8c8da"/></svg>' }); }) });
  try {
    await f.setLayout('Full content'); await f.waitSaved('full'); const before = await f.geometry(); release();
    await until(() => f.card.locator('img').evaluate(e => e.complete && e.naturalWidth === 800), 'original delayed image loads');
    await until(async () => (await f.geometry()).subject.h > before.subject.h + 300, 'decoded image grows card');
    const after = await f.geometry(); unchanged(before, after); close(after.subject.w, before.subject.w, 'image load preserves width');
    const size = await f.card.locator('img').evaluate(e => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }));
    close(size.w / size.h, .5, 'late image original aspect ratio', .01); await f.noOverflow();
  } finally { release(); await f.context.close(); }
});
check('mode switch is one Undo operation and reload preserves Full content', async () => {
  const f = await fixture(); try {
    await f.setLayout('Full content'); await f.waitSaved('full');
    await f.page.keyboard.press('Control+z'); await until(async () => await f.mode() === 'scrollable', 'Undo restores mode');
    await f.page.keyboard.press('Control+Shift+z'); await until(async () => await f.mode() === 'full', 'Redo restores mode');
    await f.waitSaved('full'); const before = await f.saved(); await f.page.reload(); await f.card.waitFor();
    await until(async () => await f.mode() === 'full', 'reload restores mode'); assert.deepEqual((await f.saved()).blocks, before.blocks);
  } finally { await f.context.close(); }
});
check('width-only handles reflow at two zooms and preserve camera, top edge, neighbors and preferences', async () => {
  const f = await fixture(); try {
    await f.setLayout('Full content'); await f.waitSaved('full');
    const right = f.card.getByRole('slider', { name: 'Resize card width from right', exact: true });
    assert.equal(await f.card.getByRole('slider', { name: 'Resize card width from left', exact: true }).count(), 1);
    const originalHeight = (await f.geometry()).subject.h;
    for (const zoomOut of [false, true]) {
      if (zoomOut) { await f.page.mouse.move(900, 300); await f.page.keyboard.down('Control'); await f.page.mouse.wheel(0, 250); await f.page.keyboard.up('Control'); }
      const before = await f.geometry(), box = await right.boundingBox(); assert.ok(box);
      await f.page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2)); await f.page.mouse.down(); await f.page.mouse.move(box.x + box.width / 2 + 100 * before.zoom, box.y + Math.min(40, box.height / 2), { steps: 12 }); await f.page.mouse.up();
      await until(async () => (await f.geometry()).subject.w > before.subject.w + 50, 'width gesture grows card');
      const after = await f.geometry(); unchanged(before, after); assert.ok(after.subject.h <= before.subject.h + 2, 'wider text cannot grow taller (line-break plateaus allowed)'); await f.noOverflow();
    }
    assert.ok((await f.geometry()).subject.h < originalHeight - 20, 'real text reflows shorter over the measured width range');
    const preferred = (await f.geometry()).subject.w; await f.setLayout('Scrollable'); await f.setLayout('Full content'); close((await f.geometry()).subject.w, preferred, 'full width remembered');
    await f.page.screenshot({ path: resolve(OUT, 'full-wide.png') });
    await right.focus(); for (let i = 0; i < 100; i++) await f.page.keyboard.press('ArrowLeft');
    const narrow = await f.geometry(), minimum = Number(await right.getAttribute('aria-valuemin')); assert.ok(Number.isFinite(minimum) && minimum > 0); close(narrow.subject.w, minimum, 'keyboard stops at content-aware minimum'); assert.ok(narrow.subject.w < preferred); await f.noOverflow();
    await f.page.screenshot({ path: resolve(OUT, 'full-narrow.png') });
    for (let i = 0; i < 100; i++) await f.page.keyboard.press('ArrowRight');
    const maximum = Number(await right.getAttribute('aria-valuemax')); close((await f.geometry()).subject.w, maximum, 'keyboard stops at effective maximum');
    assert.ok(maximum >= minimum); await f.noOverflow();
    const left = f.card.getByRole('slider', { name: 'Resize card width from left', exact: true });
    const anchored = await f.geometry(); await left.focus(); await f.page.keyboard.press('ArrowLeft');
    await until(async () => (await f.geometry()).subject.w < anchored.subject.w - 10, 'left handle changes width');
    const leftSized = await f.geometry(); close(leftSized.subject.x + leftSized.subject.w, anchored.subject.x + anchored.subject.w, 'left resize anchors right edge'); close(leftSized.subject.y, anchored.subject.y, 'left resize anchors top');
    assert.equal(leftSized.camera, anchored.camera); for (const key of ['x', 'y', 'w', 'h']) close(leftSized.neighbor[key], anchored.neighbor[key], `left resize neighbor ${key}`);
    await f.card.locator('[data-drag-handle]').first().click(); await f.page.keyboard.press('Control+a');
    assert.equal(await f.page.getByRole('slider', { name: /Resize card width/ }).count(), 0, 'multi-selection cannot bypass full-content resize constraints');
  } finally { await f.context.close(); }
});
check('duplicate, canvas fork and trash/restore retain layout and exact content', async () => {
  const f = await fixture(); try {
    await f.setLayout('Full content'); await f.waitSaved('full');
    const original = (await f.saved()).blocks.find(b => b.id === 'subject');
    await f.card.locator('[data-drag-handle]').first().click(); await f.page.keyboard.press('Control+d');
    await until(async () => (await f.saved()).blocks.length === 3, 'duplicate persisted');
    const copy = (await f.saved()).blocks.find(b => !['subject', 'neighbor'].includes(b.id));
    assert.ok(copy && copy.id !== original.id); assert.equal(copy.body, original.body); assert.deepEqual(copy.cardLayout, original.cardLayout);
    await f.page.keyboard.press('Control+z'); await until(async () => (await f.saved()).blocks.length === 2, 'duplicate Undo persisted');
    const fork = await api('/api/learn/boards/fork', 'POST', { source: { canvas: f.path.split('/')[4] }, title: `Layout fork ${run}`, key: `layout-fork-${run}` });
    assert.ok(fork.name, 'fork returns new canvas');
    const forked = (await api(`/api/learn/boards/${fork.name}/main`)).state.blocks.find(b => b.id === 'subject');
    assert.equal(forked.body, original.body); assert.deepEqual(forked.cardLayout, original.cardLayout);
    const name = f.path.split('/')[4];
    await api(`/api/apps/${name}/trash`, 'POST'); await api(`/api/apps/${name}/untrash`, 'POST');
    await f.page.reload(); await f.card.waitFor(); assert.equal(await f.mode(), 'full');
    const restored = (await f.saved()).blocks.find(b => b.id === 'subject'); assert.equal(restored.body, original.body); assert.deepEqual(restored.cardLayout, original.cardLayout);
  } finally { await f.context.close(); }
});
check('Search reveals late full-card content and Back restores camera with the panel open', async () => {
  const f = await fixture(); try {
    await f.setLayout('Full content'); await f.waitSaved('full');
    await f.page.getByRole('tab', { name: 'Find text on canvas', exact: true }).click();
    const panel = f.page.locator('[data-canvas-search]:visible'); await panel.getByRole('textbox', { name: 'Find text on canvas', exact: true }).fill('FULL_CONTENT_SEARCH_NEEDLE');
    const result = panel.locator('[data-search-result="object:subject"]'); await result.waitFor();
    const before = await f.geometry(); await result.locator('[data-search-index]').click();
    await until(async () => (await f.geometry()).camera !== before.camera, 'late match changes view');
    assert.equal(await panel.isVisible(), true); assert.equal(await f.mode(), 'full');
    await panel.getByRole('button', { name: 'Back to previous view', exact: true }).click();
    await until(async () => (await f.geometry()).camera === before.camera, 'Back restores camera');
  } finally { await f.context.close(); }
});
check('shared reader sees Full content but cannot resize or persist layout', async () => {
  const f = await fixture(); let viewer; try {
    await f.setLayout('Full content'); await f.waitSaved('full');
    const shared = await api(f.path + '/share', 'POST', { shared: true, view: true, public_view: true }); assert.ok(shared.sharing?.view);
    viewer = await browser.newContext({ viewport: { width: 1500, height: 950 } }); await guard(viewer);
    const page = await viewer.newPage(); await page.goto(`${BASE}/b/${shared.sharing.view}`);
    const card = page.locator('[data-block-id="subject"]'); await card.waitFor({ timeout: 60000 }); assert.equal(await card.getAttribute('data-card-layout'), 'full');
    assert.equal(await card.getByRole('slider', { name: /Resize card width/ }).count(), 0);
    const before = await f.saved();
    const point = await card.evaluate(e => {
      const r = e.getBoundingClientRect(), viewport = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
      const left = Math.max(r.left, viewport.left, 0), top = Math.max(r.top, viewport.top, 0);
      const right = Math.min(r.right, viewport.right, innerWidth), bottom = Math.min(r.bottom, viewport.bottom, innerHeight);
      if (right - left < 30 || bottom - top < 30) throw Error('Shared card has no visible mouse target');
      return { x: left + 15, y: top + 15 };
    });
    await page.mouse.click(point.x, point.y);
    await page.locator('[data-view-selection="subject"]').waitFor();
    await page.mouse.click(point.x, point.y, { button: 'right' });
    assert.equal(await page.getByRole('menuitem', { name: 'Layout', exact: true }).count(), 0); assert.deepEqual(await f.saved(), before);
  } finally { await viewer?.close(); await f.context.close(); }
});
try {
  for (const test of checks) {
    const started = Date.now(); try { await test.action(); results.push({ name: test.name, pass: true, ms: Date.now() - started }); }
    catch (error) { results.push({ name: test.name, pass: false, ms: Date.now() - started, error: error.stack }); }
    console.log(`${results.at(-1).pass ? 'PASS' : 'FAIL'} ${test.name}${results.at(-1).error ? ': ' + results.at(-1).error : ''}`);
  }
} finally {
  await browser.close();
  const report = { candidate: process.env.CANDIDATE_SHA || 'unverified', results, errors, blockedModelRequests: blocked, limitations: ['Deterministic layout acceptance only; no real model-edit verification.', 'Background next-steps requests are blocked, never executed.'] };
  writeFileSync(resolve(OUT, 'result.json'), JSON.stringify(report, null, 2));
  const passed = results.filter(x => x.pass).length; console.log(`${passed}/${results.length} checks passed; ${errors.length} page errors`);
  process.exitCode = passed === checks.length && !errors.length ? 0 : 1;
}
