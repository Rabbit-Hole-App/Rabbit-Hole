// Canvas persistence, the cross-device proof (docs/features/canvas-persistence.md, Proof items 1-7) and the retired
// browser warnings (step 8, checks 8-10): fresh browser profiles (A, B, and F for 8) on one account, against the LOCAL
// stack only - local D1, no model calls (/api/learn/ask is aborted as a guard; no composer is ever sent). Prints no secrets.
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/cross-device-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('cross-device-check runs against the local stack only');
const SHOTS = process.argv[2] || 'cross-device-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`xd-owner-${run}@example.com`, `xd_${run}`) };
const colleague = { session: await sessionFor(`xd-colleague-${run}@example.com`, `xdc_${run}`) }; // same workspace
const stranger = { session: await sessionFor(`xd-stranger-${run}@example.org`, `xds_${run}`) }; // another workspace
const api = async (who, path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } }); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { /* not JSON */ } return { status: r.status, text, body }; };
const boardOf = async name => (await api(owner, `/api/learn/boards/${name}/main`)).body;
const until = async (what, fn, timeout = 20000) => { const end = Date.now() + timeout; let last; while (Date.now() < end) { last = await fn(); if (last) return last; await new Promise(r => setTimeout(r, 400)); } throw Error(`timed out: ${what}`); };

const catalog = (await api(owner, '/api/apps')).body;
const DEVICE_A = `device-a-${run}`, DEVICE_B = `device-b-${run}`;
const keysOf = name => { const base = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}`; return { ink: `${base}:ink`, chat: `${base}:chat` }; };
const newCanvas = async title => (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title, device_id: DEVICE_A }) })).body;
// A canvas is saved on the server at creation now (canvas-persistence.md, Saved at creation). Older canvases, made before
// that, have no main board until a browser saves one; they still exist, so their paths stay checked. An older canvas is
// made here the only way one exists: the canvas row with its creation-time empty board removed from the local stack's
// Learn D1 (PERSIST, the stack's --persist-to; local only, like everything this check touches).
const PERSIST = new URL(`${process.env.PERSIST || '../../../.small/fork-local'}/v3/d1/miniflare-D1DatabaseObject/`, import.meta.url);
const learnDb = () => readdirSync(PERSIST).filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite').map(f => new DatabaseSync(new URL(f, PERSIST)))
  .find(db => db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'learn_boards'").get() || (db.close(), false));
const olderCanvas = async title => {
  const canvas = await newCanvas(title);
  const db = learnDb();
  try { assert.equal(db.prepare("DELETE FROM learn_boards WHERE app = ? AND board = 'main' AND version = 0").run(canvas.name).changes, 1, 'the empty board from creation'); } finally { db.close(); }
  return canvas;
};

// What browser A holds: cards, an image, a PDF, a notebook and a chat card (the shapes Learn writes; canvas-sharing-files).
const NOTEBOOK_ID = crypto.randomUUID();
const IPYNB = { cells: [{ cell_type: 'code', id: 'c1', metadata: {}, outputs: [], execution_count: null, source: 'from helper import triple\ntriple(3)' }], metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, nbformat: 4, nbformat_minor: 5 };
const INK = {
  strokes: [], shapes: [], items: [], links: [], groups: [], areas: [],
  blocks: [
    { id: 'e1', type: 'explanation', dx: 0, dy: 0, title: 'Why softmax uses exp', body: 'Exponentials are positive and keep the order of the logits.' },
    { id: 'e2', type: 'explanation', dx: 0, dy: 0, title: 'The max trick', body: 'Subtract the largest logit first so nothing overflows.' },
    { id: 'img1', type: 'file', kind: 'image', dx: 0, dy: 0, assetKey: 'drop:xd-image', label: 'red.png' },
    { id: 'pdf1', type: 'pdf', dx: 0, dy: 0, assetKey: 'pdf:xd-pdf', label: 'tiny.pdf', h: 420 },
    { id: 'nb1', type: 'notebook', notebook_id: NOTEBOOK_ID, language: 'python', dx: 0, dy: 0, h: 520, active_path: 'experiment.ipynb', ipynb_path: 'experiment.ipynb', ipynb: IPYNB,
      files: ['experiment.ipynb', 'helper.py'], seed_files: { 'helper.py': 'def triple(x):\n    return 3 * x\n' } },
  ],
};
const CHAT = [{ id: 'q1', question: 'Why does softmax use exp?', answer: 'Positive weights that sum to one.', status: 'done' }];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';

const browser = await chromium.launch();
const errors = [];
const profile = async (device, who = owner) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(id => {
    if (!localStorage.getItem('small.device')) localStorage.setItem('small.device', id);
    window.__toasts = []; window.addEventListener('small:toast', event => window.__toasts.push(event.detail?.message ?? event.detail)); // a 3 s toast, caught when it fires
  }, device);
  await context.route('**/api/learn/ask**', route => route.abort()); // no model call can leave this check
  // A hole's opening question is a Tutor turn (#46): answered here; the planner's real wiring is covered on the journey stack.
  await context.route('**/api/learn/tutor/plan', route => route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'What would you like to explore first?' }] } }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${device}: ${error.message}`));
  return { context, page };
};
const A = await profile(DEVICE_A), B = await profile(DEVICE_B);
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const open = async (page, name, ready = '[data-tool-gutter]') => { await page.goto(`${BASE}/apps/${name}`); await page.locator(ready).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(1500); };
const local = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);
const canvasBox = page => page.locator('[aria-label="Lesson canvas"]').boundingBox();
// One pen stroke on an empty part of the canvas: an edit through the canvas UI.
const draw = async (page, at = 0) => {
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const box = await canvasBox(page);
  const x = box.x + box.width - 260, y = box.y + 140 + at * 40;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 120, y + 20, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('Escape');
};

const C1 = await olderCanvas(`Softmax ${run}`);

await check('0 an older canvas, neither copy exists: another browser shows the truthful NOT_HERE state', async () => {
  await B.page.goto(`${BASE}/apps/${C1.name}`);
  await B.page.locator('[data-canvas-gate]').getByRole('heading', { name: "This canvas's content isn't available in this browser." }).waitFor({ timeout: 30000 });
  assert.equal((await boardOf(C1.name)).exists, false);
});
await shot(B.page, '00-B-not-here-neither-copy');

let hole;
await check('1a on A: cards, an image, a PDF, a notebook, a chat card, edits and a Rabbit Hole reach the server', async () => {
  await open(A.page, C1.name);
  await A.page.evaluate(async ([keys, ink, chat, png, pdf]) => {
    localStorage.setItem(keys.ink, JSON.stringify(ink)); localStorage.setItem(keys.chat, JSON.stringify(chat));
    const bytes = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('small-learn-assets', 1); r.onupgradeneeded = () => r.result.createObjectStore('assets'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const put = (key, value) => new Promise((resolve, reject) => { const r = db.transaction('assets', 'readwrite').objectStore('assets').put(value, key); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
    await put('drop:xd-image', new File([bytes(png)], 'red.png', { type: 'image/png' }));
    await put('pdf:xd-pdf', new File([pdf], 'tiny.pdf', { type: 'application/pdf' }));
  }, [keysOf(C1.name), INK, CHAT, PNG, PDF]);
  await open(A.page, C1.name, '[data-block-id="e1"]');
  await until('the first server copy', async () => (await boardOf(C1.name)).version >= 1);
  // Edits through the canvas: a duplicated card and a pen stroke.
  await A.page.locator('[data-block-id="e2"]').first().click({ position: { x: 40, y: 14 } });
  await A.page.keyboard.press('Control+d');
  await draw(A.page);
  const saved = await until('the edits on the server', async () => { const b = await boardOf(C1.name); return b.state?.blocks?.length === 6 && b.state.strokes?.length === 1 && b; });
  assert.deepEqual(saved.state.exchanges.map(e => e.question), [CHAT[0].question]);
  assert.equal(saved.sharing.shared, false, 'private: saved, not shared');
  const keys = await until('the image and PDF on the server', async () => { const k = (await api(owner, `/api/learn/boards/${C1.name}/main/assets`)).body.keys; return k.includes('drop:xd-image') && k.includes('pdf:xd-pdf') && k; });
  assert.ok(keys);
  await shot(A.page, '01-A-made-here');
  // A Rabbit Hole: double-click a card, then its first object (a stroke) keeps it.
  await A.page.locator('[data-block-id="e1"]').first().dblclick({ position: { x: 40, y: 14 } });
  await A.page.waitForURL(/[?&]hole=canvas-[a-f0-9]{8}/, { timeout: 20000 });
  await A.page.locator('[data-tool-gutter]').waitFor(); await A.page.waitForTimeout(800);
  await draw(A.page);
  await A.page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 20000 });
  hole = new URL(A.page.url()).pathname.split('/').pop();
  await until('the hole\'s board on the server', async () => (await boardOf(hole)).state?.strokes?.length === 1);
  // The notebook's workspace follows once the notebook has started (the real notebook, in this browser).
  await open(A.page, C1.name, '[data-block-id="nb1"]');
  const files = await until('the notebook workspace on the server', async () => {
    const r = await api(owner, `/api/learn/boards/${C1.name}/main/assets/${encodeURIComponent(`notebook:${NOTEBOOK_ID}`)}`);
    return r.status === 200 && r.body && Object.keys(r.body).includes('helper.py') && Object.keys(r.body);
  }, 240000);
  assert.ok(files.includes('experiment.ipynb'), files.join(','));
});

await check('1b on B (a fresh profile): everything A made is there', async () => {
  await open(B.page, C1.name, '[data-block-id="e1"]');
  for (const id of ['e1', 'e2', 'img1', 'pdf1', 'nb1']) assert.equal(await B.page.locator(`[data-block-id="${id}"]`).count() >= 1, true, id);
  const ink = await local(B.page, keysOf(C1.name).ink);
  assert.equal(ink.blocks.length, 6, 'the duplicated card too');
  assert.equal(ink.strokes.length, 1, 'the stroke');
  const image = B.page.locator('[data-block-id="img1"] img');
  await image.waitFor({ timeout: 30000 });
  assert.equal(await image.evaluate(node => node.complete && node.naturalWidth === 1), true, 'the image, loaded from the server');
  await B.page.locator('[data-block-id="pdf1"] iframe').waitFor({ timeout: 30000 });
  assert.equal(await B.page.getByText('This PDF is not in this browser', { exact: false }).count(), 0);
  await B.page.getByText(CHAT[0].question).first().waitFor({ timeout: 10000 });
  // The notebook workspace B's notebook loads into its empty workspace (NotebookCard load: the same request).
  const workspace = await B.page.evaluate(async ([name, id]) => (await (await fetch(`/api/learn/boards/${name}/main/assets/${encodeURIComponent(`notebook:${id}`)}`)).json()), [C1.name, NOTEBOOK_ID]);
  assert.match(workspace['helper.py']?.content || '', /def triple/);
  assert.equal(await B.page.locator(`[data-dive-portal="${hole}"]`).count(), 1, 'the hole\'s portal on its card');
  await shot(B.page, '02-B-everything-there');
});
await check('1c on B: the Rabbit Hole opens with its content', async () => {
  await open(B.page, hole);
  assert.equal((await local(B.page, keysOf(hole).ink)).strokes.length, 1);
});

await check('2 edit on B, then reopen A: B\'s edit is there', async () => {
  await open(B.page, C1.name, '[data-block-id="e1"]');
  const before = (await boardOf(C1.name)).version;
  await draw(B.page, 1);
  await until('B\'s stroke on the server', async () => (await boardOf(C1.name)).state.strokes.length === 2);
  assert.equal((await boardOf(C1.name)).version, before + 1);
  await open(A.page, C1.name, '[data-block-id="e1"]');
  await until('the server copy replaces the copy on A', () => A.page.evaluate(() => window.__toasts.includes('You are seeing the latest saved version of this board.')));
  assert.equal((await local(A.page, keysOf(C1.name).ink)).strokes.length, 2);
});

await check('3 concurrent edits on A and B: the second gets the 409 message, overwrites nothing and stops pushing', async () => {
  await open(B.page, C1.name, '[data-block-id="e1"]'); // both on the same version now
  await draw(A.page, 2);
  const afterA = await until('A\'s stroke on the server', async () => { const b = await boardOf(C1.name); return b.state.strokes.length === 3 && b; });
  const puts = [];
  B.page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === `/api/learn/boards/${C1.name}/main`) puts.push(Date.now()); }); // the board, not its files
  await draw(B.page, 3);
  await B.page.locator('[data-toast-error]').filter({ hasText: 'This board changed in another tab or on another device. Reload to see those changes; your newer edits here are not saved.' }).waitFor({ timeout: 15000 });
  const now = await boardOf(C1.name);
  assert.deepEqual([now.version, now.state.strokes.length], [afterA.version, 3], 'A\'s save stands; B\'s stale save is not written');
  assert.equal(puts.length, 1, 'one refused PUT');
  await shot(B.page, '03-B-conflict-409');
  await draw(B.page, 4);
  await B.page.waitForTimeout(3000);
  assert.equal(puts.length, 1, 'no PUT after the 409 until reload');
  await open(B.page, C1.name, '[data-block-id="e1"]');
  assert.equal((await local(B.page, keysOf(C1.name).ink)).strokes.length, 3, 'reload loads the server copy');
});

// A notebook card's kernel downloads Pyodide packages while it starts; going offline mid-start leaves that kernel dead for
// the page load (docs/features/notebook-kernel-startup.md, a product issue tracked on its own). So the offline step waits
// until every notebook frame on the page has a ready (idle) kernel, or was torn down while being read. Nothing is removed.
const NOTEBOOK_FRAME = /\/lab\/\?mode=single-document&workspace=(?!warmup)/;
const kernelsSettled = async (page) => {
  const frames = page.frames().filter(frame => NOTEBOOK_FRAME.test(frame.url()));
  if (!frames.length) return null; // not mounted yet: a notebook that mounts later would start offline
  const states = await Promise.all(frames.map(frame => frame.isDetached() ? 'torn down'
    : frame.evaluate(() => document.querySelector('.jp-Notebook-ExecutionIndicator')?.getAttribute('data-status') || 'starting').catch(() => (frame.isDetached() ? 'torn down' : 'unreadable'))));
  return states.every(state => state === 'idle' || state === 'torn down') ? states : null;
};
const stamp = what => console.log(`${what} ${new Date().toISOString()}`);

await check('4 an edit on A while offline lands on reconnect', async () => {
  await open(A.page, C1.name, '[data-block-id="e1"]');
  // One stroke online first: the pen's lazy chunks load now, since a chunk that fails offline reloads the page (main.jsx).
  const warm = (await boardOf(C1.name)).state.strokes.length;
  await draw(A.page, 6);
  const before = await until('the online stroke on the server', async () => { const b = await boardOf(C1.name); return b.state.strokes.length === warm + 1 && b; });
  // ...and the idle warm-up's chunks (learn-warmup.js) are in before the network goes.
  await until('the idle warm-up', () => A.page.evaluate(() => performance.getEntriesByName('rh:warmup:done').length > 0), 120000);
  const kernels = await until('the notebook kernels on A ready or torn down', () => kernelsSettled(A.page), 120000);
  stamp(`notebook kernels on A ${JSON.stringify(kernels)} at`);
  stamp('offline A');
  await A.context.setOffline(true);
  await draw(A.page, 5);
  await A.page.waitForTimeout(3500);
  assert.equal((await boardOf(C1.name)).version, before.version, 'nothing reached the server offline');
  assert.equal((await local(A.page, keysOf(C1.name).ink)).strokes.length, before.state.strokes.length + 1, 'kept in this browser');
  stamp('online A');
  await A.context.setOffline(false);
  const after = await until('the offline edit on the server', async () => { const b = await boardOf(C1.name); return b.state.strokes.length === before.state.strokes.length + 1 && b; });
  assert.equal(after.version, before.version + 1);
});

await check('5 a browser-only canvas from before this release migrates on its first open; updated_at does not move', async () => {
  const C2 = await olderCanvas(`Old notes ${run}`);
  const created = (await api(owner, `/api/apps/${C2.name}`)).body.updated_at;
  const ink = { ...INK, blocks: INK.blocks.slice(0, 2) };
  await A.page.evaluate(([keys, ink, chat]) => { localStorage.setItem(keys.ink, JSON.stringify(ink)); localStorage.setItem(keys.chat, JSON.stringify(chat)); }, [keysOf(C2.name), ink, CHAT]);
  assert.equal((await boardOf(C2.name)).exists, false, 'only in this browser');
  await new Promise(r => setTimeout(r, 1100)); // a bump would now show as a later second
  await open(A.page, C2.name, '[data-block-id="e1"]');
  const migrated = await until('the migrated copy', async () => { const b = await boardOf(C2.name); return b.version && b; });
  assert.equal(migrated.version, 1);
  assert.deepEqual(migrated.state.blocks.map(b => b.id), ['e1', 'e2']);
  assert.deepEqual(migrated.state.exchanges.map(e => e.id), ['q1']);
  assert.equal((await api(owner, `/api/apps/${C2.name}`)).body.updated_at, created, 'a sync, not a meaningful change');
  await open(A.page, C2.name, '[data-block-id="e1"]');
  await A.page.waitForTimeout(2500);
  assert.equal((await boardOf(C2.name)).version, 1, 'opening again saves nothing');
  await open(B.page, C2.name, '[data-block-id="e1"]');
});

await check('6 a board over 1.9 MB is refused visibly and its local copy is kept', async () => {
  const C3 = await newCanvas(`Huge ${run}`);
  const ink = { ...INK, blocks: [{ ...INK.blocks[0], notes: 'x'.repeat(1_950_000) }] };
  await A.page.evaluate(([keys, ink]) => localStorage.setItem(keys.ink, JSON.stringify(ink)), [keysOf(C3.name), ink]);
  await open(A.page, C3.name, '[data-block-id="e1"]');
  await A.page.locator('[data-toast-error]').filter({ hasText: 'This board is over 1.9 MB, so it was not saved to your account and stays only in this browser.' }).waitFor({ timeout: 15000 });
  await shot(A.page, '04-A-over-cap-refused');
  const kept = await boardOf(C3.name);
  assert.ok(kept.exists !== false && kept.version === 0 && !kept.state.blocks.length, 'only the empty board from creation: the refused copy is not on the server');
  assert.equal((await local(A.page, keysOf(C3.name).ink)).blocks[0].notes.length, 1_950_000, 'kept in this browser');
  await draw(A.page);
  await A.page.waitForTimeout(3000);
  assert.equal((await A.page.locator('[data-toast-error]').filter({ hasText: 'over 1.9 MB' }).count()), 1, 'said once, not on every edit');
});

await check('7 another account cannot read the private board; Trash still suspends links', async () => {
  for (const [who, status] of [[colleague, 403], [stranger, 404]]) {
    for (const path of [`/api/learn/boards/${C1.name}/main`, `/api/learn/boards/${C1.name}/main/assets`, `/api/learn/boards/${C1.name}/main/assets/${encodeURIComponent('drop:xd-image')}`, `/api/learn/boards/${hole}/main`]) {
      const read = await api(who, path);
      assert.equal(read.status, status, path);
      assert.ok(!read.text.includes('softmax') && !read.text.includes('Softmax'), `${path}: no content`);
    }
  }
  const token = (await api(owner, `/api/learn/boards/${C1.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true }) })).body.sharing.view;
  assert.equal((await api(stranger, `/api/learn/boards/shared/${token}`)).status, 200);
  await api(owner, `/api/apps/${C1.name}/trash`, { method: 'POST', body: '{}' });
  assert.equal((await api(stranger, `/api/learn/boards/shared/${token}`)).status, 404, 'Trash suspends the link');
  await api(owner, `/api/apps/${C1.name}/untrash`, { method: 'POST', body: '{}' });
  assert.equal((await api(stranger, `/api/learn/boards/shared/${token}`)).status, 200);
  await api(owner, `/api/learn/boards/${C1.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: false }) });
  assert.equal((await api(stranger, `/api/learn/boards/shared/${token}`)).status, 404, 'private again');
});

// ---- Step 8: the browser warnings go only where the board is on the server ----
const WARNING = /Content in this browser|On another device|stored only in the browser that created it/;
const cardOf = (page, sel, title) => page.locator(sel).filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
const library = async page => { await page.goto(`${BASE}/library?type=canvases`); await cardOf(page, '[data-library-card="canvas"]', `Softmax ${run}`).waitFor({ timeout: 60000 }); };
const home = async page => { await page.goto(`${BASE}/apps`); await page.locator('[data-continue-card]').waitFor({ timeout: 60000 }); };
const noteOf = async (page, sel, title) => { const note = cardOf(page, sel, title).locator('[data-card-note]'); return (await note.count()) ? (await note.innerText()).trim() : ''; };
const away = note => note.startsWith('On another device') && note.includes('Its content is stored only in the browser that created it.');

await check('8 A\'s canvas on other profiles: Library and Home carry no browser warning, and its content opens', async () => {
  const F = await profile(`device-f-${run}`); // has opened nothing: before step 8 its Library said On another device
  await library(F.page);
  for (const title of [`Softmax ${run}`, `Old notes ${run}`]) assert.equal(await noteOf(F.page, '[data-library-card="canvas"]', title), '', title);
  assert.doesNotMatch(await cardOf(F.page, '[data-library-card="canvas"]', `Softmax ${run}`).innerText(), WARNING);
  await shot(F.page, '05-F-library-no-warning');
  await cardOf(F.page, '[data-library-card="canvas"]', `Softmax ${run}`).locator('[data-card-title]').click();
  await F.page.locator('[data-block-id="e1"]').first().waitFor({ timeout: 60000 });
  assert.equal(await F.page.locator('[data-canvas-gate]').count(), 0);
  await home(F.page);
  const section = F.page.getByRole('region', { name: 'Continue' });
  assert.equal((await section.locator('h2').innerText()).trim(), 'Continue learning');
  assert.ok((await section.innerText()).includes(`Softmax ${run}`));
  assert.doesNotMatch(await F.page.locator('main').innerText(), WARNING, 'nothing on Home says browser-only');
  assert.doesNotMatch(await F.page.locator('main').innerText(), /on this device/);
  await shot(F.page, '06-F-home-continue-learning');
  // B opened them before: before step 8 its cards said Content in this browser.
  await library(B.page);
  for (const title of [`Softmax ${run}`, `Old notes ${run}`]) assert.equal(await noteOf(B.page, '[data-library-card="canvas"]', title), '', title);
  await shot(B.page, '07-B-library-no-warning');
  await home(B.page);
  const continued = B.page.getByRole('region', { name: 'Continue' });
  assert.equal((await continued.locator('h2').innerText()).trim(), 'Continue learning');
  assert.doesNotMatch(await continued.innerText(), WARNING);
  for (const title of [`Softmax ${run}`, `Old notes ${run}`]) assert.equal(await noteOf(B.page, '[data-recent-card]', title), '', title);
  await shot(B.page, '08-B-home-no-warning');
  await F.context.close();
});

await check('9 a never-synced canvas keeps its truthful state: Content in this browser where it was made, On another device elsewhere, and it does not open there', async () => {
  // Made on A before this release and never opened since: its content is only in A's localStorage.
  const C4 = await olderCanvas(`Never synced ${run}`);
  await A.page.evaluate(([keys, ink, chat, name]) => {
    localStorage.setItem(keys.ink, JSON.stringify(ink)); localStorage.setItem(keys.chat, JSON.stringify(chat));
    localStorage.setItem('small.recent', JSON.stringify([name, ...JSON.parse(localStorage.getItem('small.recent') || '[]')]));
  }, [keysOf(C4.name), { ...INK, blocks: INK.blocks.slice(0, 1) }, CHAT, C4.name]);
  await library(A.page);
  assert.equal(await noteOf(A.page, '[data-library-card="canvas"]', `Never synced ${run}`), 'Content in this browser');
  assert.equal(await noteOf(A.page, '[data-library-card="canvas"]', `Softmax ${run}`), '', 'a saved board beside it');
  await shot(A.page, '09-A-library-never-synced');
  await home(A.page);
  const section = A.page.getByRole('region', { name: 'Continue' });
  assert.equal((await section.locator('h2').innerText()).trim(), 'Continue learning');
  const text = await section.innerText();
  assert.ok(text.includes(`Never synced ${run}`) && text.includes('Content in this browser'), text);
  assert.equal(await noteOf(A.page, '[data-recent-card]', `Never synced ${run}`), 'Content in this browser');
  await shot(A.page, '10-A-home-never-synced');
  await library(B.page);
  assert.ok(away(await noteOf(B.page, '[data-library-card="canvas"]', `Never synced ${run}`)));
  await shot(B.page, '11-B-library-never-synced-away');
  await B.page.goto(`${BASE}/apps/${C4.name}`);
  await B.page.locator('[data-canvas-gate]').getByRole('heading', { name: "This canvas's content isn't available in this browser." }).waitFor({ timeout: 30000 });
  assert.equal((await boardOf(C4.name)).exists, false, 'Library and Home saved nothing');
});

await check('10 a board over 1.9 MB keeps Content in this browser where it was refused, saved before or not, until a save lands', async () => {
  // C3 (check 6) was refused on its first copy; C5 was saved, then grew past the cap.
  const C5 = await newCanvas(`Grew huge ${run}`);
  await A.page.evaluate(([keys, ink]) => localStorage.setItem(keys.ink, JSON.stringify(ink)), [keysOf(C5.name), { ...INK, blocks: INK.blocks.slice(0, 1) }]);
  await open(A.page, C5.name, '[data-block-id="e1"]');
  await until('C5 on the server', async () => (await boardOf(C5.name)).version === 1);
  const huge = { ...INK, blocks: [{ ...INK.blocks[0], notes: 'x'.repeat(1_950_000) }] };
  await A.page.evaluate(([keys, ink]) => localStorage.setItem(keys.ink, JSON.stringify(ink)), [keysOf(C5.name), huge]);
  await open(A.page, C5.name, '[data-block-id="e1"]');
  await A.page.locator('[data-toast-error]').filter({ hasText: 'over 1.9 MB' }).waitFor({ timeout: 15000 });
  assert.equal((await boardOf(C5.name)).version, 1, 'refused');
  await library(A.page);
  for (const title of [`Huge ${run}`, `Grew huge ${run}`]) assert.equal(await noteOf(A.page, '[data-library-card="canvas"]', title), 'Content in this browser', title);
  await shot(A.page, '12-A-library-over-cap');
  // ponytail: Huge has its empty board from creation, so another browser cannot know this browser's copy was refused:
  // it shows no note and opens the empty board (canvas-persistence.md, Saved at creation). A refusal flag on the server
  // would let B say so; add it if refused-first-copy canvases turn up in practice.
  await library(B.page);
  assert.equal(await noteOf(B.page, '[data-library-card="canvas"]', `Huge ${run}`), '', 'its empty board from creation is on the server');
  // Back under the cap: the next save lands and the note goes.
  await A.page.evaluate(([keys, ink]) => localStorage.setItem(keys.ink, JSON.stringify(ink)), [keysOf(C5.name), { ...INK, blocks: INK.blocks.slice(0, 2) }]);
  await open(A.page, C5.name, '[data-block-id="e2"]');
  await until('the smaller copy on the server', async () => (await boardOf(C5.name)).version === 2);
  await library(A.page);
  assert.equal(await noteOf(A.page, '[data-library-card="canvas"]', `Grew huge ${run}`), '');
});

const unexpected = errors.filter(message => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED|ResizeObserver/.test(message));
if (unexpected.length) console.log('page errors:', unexpected);
await browser.close();
const total = 13;
console.log(`${results.length}/${total} checks passed`);
process.exitCode = results.length === total && !unexpected.length ? 0 : 1;
