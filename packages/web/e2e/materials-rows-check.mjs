// Materials row actions (owner spec "PDF Materials controls, chat-context duplication, and panel clipping", sections 1-5 and
// the matching scenarios of section 8), against the LOCAL stack only: local D1 and fresh browser profiles. No model is ever
// called: /api/learn/ask is answered here with canned text and its request bodies CAPTURED; every other model-capable route is
// aborted and counted, and none may happen.
// Setup: a canvas and five context documents built here (each page says "<TAG> PAGE n"): alpha.pdf (5 pages), beta.pdf (4),
// two different documents both named same-name.pdf (2 and 3 pages), remove-me.pdf (3), and one with a very long name (2).
// The row contract (sections 1-2): [data-material-row][data-source-id="doc:ctx:<id>"], its name [data-material-name] (title =
// the full name), and, in order, [data-material-action] context (canvas context, aria-pressed), canvas (Add to canvas), chat
// (Attach to this chat, aria-pressed), remove (Remove from Materials, confirmed in [data-material-remove-confirm]); the
// actions sit in [data-material-actions]; Upload is [data-materials-upload]; the old header [data-source-add-canvas] is gone.
// Covered (section 8): 1 every row action affects only its own PDF; 2 the reader shows A while B's Add to canvas opens B's
// dialog and a double-clicked confirm inserts once; 3 identical filenames stay distinct by id; 4 canvas context and chat
// attachment are independent; 10 Remove from Materials (Cancel, a failed DELETE keeps the row, then remove, reload, the chip
// dropped, while its pages still render, the reader opens page 2 and a page question sends the doc ref at that page);
// 11 a long name truncates with its full-name title, the four actions stay visible and unclipped at Sources widths 320 and
// 480 px in light and dark, Tab reaches each action with a visible focus style; screenshots of the rows at rest.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8881 SMALL_CP=http://127.0.0.1:8883 VARS=<cp .dev.vars> OUT=<dir> node e2e/materials-rows-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8881';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8883';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('materials-rows-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/materials-rows', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `mrows-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// ---------------------------------------------------------------- the PDFs: Helvetica text "<TAG> PAGE n", a correct xref
function makePdf(tag, count) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let n = 1; n <= count; n++) {
    const stream = `0 g BT /F1 64 Tf 60 396 Td (${tag} PAGE ${n}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${3 + n * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---------------------------------------------------------------- setup: a canvas and its context documents
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Materials rows ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const uploadDoc = async (name, tag, count) => {
  const form = new FormData();
  form.append('app', canvas.name);
  form.append('file', new Blob([makePdf(tag, count)], { type: 'application/pdf' }), name);
  const body = await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json();
  if (!/^ctx:[0-9a-f]{12}$/.test(body.document?.id || '')) throw Error(`${name} was not stored: ${JSON.stringify(body).slice(0, 200)}`);
  return { ...body.document, name, tag, count };
};
const LONG_NAME = `quarterly-maintenance-handbook-for-the-northern-pumping-station-${run}-revised-final-version.pdf`;
const A = await uploadDoc('alpha.pdf', 'ALPHA', 5);
const B = await uploadDoc('beta.pdf', 'BETA', 4);
const C1 = await uploadDoc('same-name.pdf', 'SAMEONE', 2);
const C2 = await uploadDoc('same-name.pdf', 'SAMETWO', 3);
const R = await uploadDoc('remove-me.pdf', 'RMV', 3);
const L = await uploadDoc(LONG_NAME, 'LONG', 2);
const docsNow = async () => (await api(`/api/learn/context?app=${canvas.name}`)).documents || [];
const serverDoc = async doc => (await docsNow()).find(d => d.id === doc.id) || null;
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [];
let replies = 0, failDelete = null, deletes = 0;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/handoff|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (request.method() === 'DELETE' && path.startsWith('/api/learn/context/')) {
    deletes += 1;
    if (failDelete && decodeURIComponent(path).endsWith(failDelete)) return route.fulfill({ status: 500, json: { error: 'Forced failure (materials-rows-check)' } });
    return route.fallback();
  }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ route: 'ask', body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `mrows-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/plan') {
    const reply = ++replies;
    captured.push({ route: 'plan', body, reply });
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: `Canned reply ${reply}.` }] } });
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } }); // the canned thread ids exist nowhere
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
let page = null;
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}${String(error?.stack || '').split(String.fromCharCode(10)).filter(line => line.includes('materials-rows-check.mjs')).slice(0, 3).map(line => ` @${line.trim().replace(/.*check\.mjs:/, '')}`).join('')}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
// A fresh profile; init sets localStorage before the app reads it (the theme and the Sources width).
const profile = async (name, init = null) => {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  if (init) await context.addInitScript(values => { try { for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v); } catch { /* private mode */ } }, init);
  await context.route('**/*', router);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(`${name}: ${error.message.slice(0, 160)}`));
  return { context, page: p };
};
const openCanvas = async p => {
  await p.goto(`${BASE}/apps/${canvas.name}`);
  await p.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await p.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await p.waitForTimeout(1500);
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// ---------------------------------------------------------------- Materials rows
const pane = () => page.locator('[data-chat-pane]');
const sourcesPane = () => page.locator('[data-sources-pane]');
// The side panel holding Sources (labelled Sources, or Context once it is a navigation tab); the composer's own Sources button
// shares the label, so the panel is the one that holds the pane.
const sourcesPanel = () => page.locator(':is([aria-label="Sources"],[aria-label="Context"]):has([data-sources-pane])');
const row = doc => page.locator(`[data-material-row][data-source-id="doc:${doc.id}"]`);
const action = (doc, name) => row(doc).locator(`[data-material-action="${name}"]`);
const expander = doc => row(doc).locator('button[aria-expanded]').first();
const pressed = async (doc, name) => (await action(doc, name).getAttribute('aria-pressed')) === 'true';
// A new chat may start with the canvas's switched-on documents attached, so a chat-attach scenario starts from its own state.
const clearChat = async (...docs) => {
  for (const doc of docs) if (await pressed(doc, 'chat')) {
    await press(doc, 'chat');
    await waitFor(async () => !(await pressed(doc, 'chat')), 5000, 'a chat attachment did not clear');
  }
};
const readerTitle = async () => (await page.locator('[data-sources-header] h2').innerText().catch(() => '')).trim();
const sourcesOpen = () => page.evaluate(() => (document.querySelector('[data-sources-pane]')?.closest('[aria-label="Sources"],[aria-label="Context"]')?.getBoundingClientRect().width || 0) > 50);
const openSources = async () => {
  if (!(await sourcesOpen())) await page.locator('[data-chat-sources]:visible').first().click({ timeout: 5000 });
  await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
  // Every row is listed and ready (its expand control enabled).
  await waitFor(async () => {
    for (const doc of [A, B, C1, C2, L]) if (!(await expander(doc).isEnabled().catch(() => false))) return false;
    return true;
  }, 30000, 'the Materials rows are not all listed and ready');
};
const closeSources = async () => { if (await sourcesOpen()) { await page.locator('[data-sources-close]').click(); await page.waitForTimeout(300); } };
// Click one row action and check it neither expanded its row nor switched the reader.
const press = async (doc, name) => {
  const expanded = await expander(doc).getAttribute('aria-expanded'), reader = await readerTitle();
  await action(doc, name).click();
  await page.waitForTimeout(300);
  assert.equal(await expander(doc).getAttribute('aria-expanded'), expanded, `${name} on ${doc.name} changed its row's expansion`);
  assert.equal(await readerTitle(), reader, `${name} on ${doc.name} switched the reader`);
};
// The canvas-level flag of a document, once it changed from `from` (the PATCH is async).
const flagBecomes = (doc, want) => waitFor(async () => (await serverDoc(doc))?.attached === want, 8000, `${doc.name} (${doc.id}) canvas context did not become ${want}`);
const chipsOf = doc => pane().locator(`[data-context-chip] button[title="Open ${doc.name}"]`);

// ---------------------------------------------------------------- the composer and the canvas
const field = () => pane().locator('[data-chat-composer] textarea').first();
const setMode = async mode => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await page.waitForTimeout(200);
};
const newChat = async () => { await pane().locator('[data-chat-new]').click(); await page.waitForTimeout(300); };
const send = async text => {
  await field().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000, 'no model request was sent for the turn');
  const cap = captured[n];
  await pane().getByText(`Canned reply ${cap.reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  return cap;
};
const refsOf = cap => (cap.body.context_refs || []).map(r => ({ sourceId: r.sourceId, kind: r.kind, page: r.range?.page ?? null }));
const wholeDoc = (refs, doc) => refs.some(r => r.sourceId === `doc:${doc.id}` && r.page == null);
const inkBlocks = async () => (await page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, INK))?.blocks || [];
const dialog = () => page.locator('[data-pdf-add-dialog] [role="dialog"]');
const dialogRoot = () => page.locator('[data-pdf-add-dialog]');
const confirmButton = () => dialog().locator('button').last();
const closed = (ms = 90000) => dialogRoot().waitFor({ state: 'detached', timeout: ms }).catch(() => { throw Error('the dialog did not close'); });
const choosePages = async (from, to) => {
  await dialog().locator('[data-pdf-choice="pages"]').click();
  if (from == null) { await dialog().locator('[data-pdf-choice="all"]').click(); return; }
  await dialog().locator('[data-pdf-choice="range"]').click();
  await dialog().locator('[data-pdf-from]').fill(String(from));
  await dialog().locator('[data-pdf-to]').fill(String(to));
};
const openAddFor = async doc => {
  await press(doc, 'canvas');
  await dialog().waitFor({ timeout: 10000 });
  await waitFor(async () => (await dialog().locator('[data-pdf-total]').innerText()).trim() === `${doc.count} pages`, 20000, `the dialog shows no "${doc.count} pages" for ${doc.name}`);
};
const rightEdge = async () => Math.min(...(await Promise.all([pane(), sourcesPane()].map(async l => ((await l.isVisible().catch(() => false)) ? (await l.boundingBox()).x : 1e9))))) - 30;
const barePoint = async () => page.evaluate(limit => {
  for (let y = 120; y < 800; y += 40) for (let x = 360; x < limit; x += 40) {
    const element = document.elementFromPoint(x, y);
    if (element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-shape-id],[data-block],[data-view-selection],[data-group-box],[role="dialog"],[data-chat-pane],[data-sources-pane],button,a,iframe')) return { x, y };
  }
  return null;
}, await rightEdge());
const reveal = async locator => {
  const view = page.viewportSize(), right = await rightEdge();
  for (let i = 0; i < 14; i += 1) {
    const b = await locator.boundingBox();
    const w = Math.min(b?.width ?? 0, 260), h = Math.min(b?.height ?? 0, 120);
    if (b && b.x > 340 && b.x + w < right && b.y > 100 && b.y + h < view.height - 200) return b;
    const dx = b ? b.x + w / 2 - right / 2 : 0, dy = b ? b.y + h / 2 - view.height * 0.4 : 0;
    const at = await barePoint() || { x: right / 2, y: view.height * 0.4 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(Math.round(dx), Math.round(dy));
    await frames();
  }
  return locator.boundingBox();
};
const selectBlock = async id => {
  const target = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
  await reveal(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(350);
    const b = await target.boundingBox();
    await page.mouse.click(b.x + 60, b.y + 30);
    if (await pane().locator(`[data-selected-card="${id}"]`).waitFor({ timeout: 2500 }).then(() => true, () => false)) return;
  }
  throw Error(`selecting block ${id} showed no [data-selected-card] pill`);
};
// ================================================================ the run
const P = await profile('A');
page = P.page;
await openCanvas(page);

await check('Materials lists every document as its own row with the four actions in order; Upload is a labelled button; no header Add to canvas', async () => {
  await openSources();
  for (const doc of [A, B, C1, C2, R, L]) {
    assert.equal(await row(doc).count(), 1, `one row for ${doc.name} (${doc.id})`);
    const order = await row(doc).locator('[data-material-action]').evaluateAll(els => els.map(el => el.dataset.materialAction));
    assert.deepEqual(order, ['context', 'canvas', 'chat', 'remove'], `${doc.name}: the actions in order`);
  }
  assert.equal(await page.locator('[data-materials-upload]').count(), 1, 'one Upload button');
  assert.match((await page.locator('[data-materials-upload]').innerText()).trim(), /^Upload$/, 'Upload is labelled');
  assert.equal(await page.locator('[data-source-add-canvas]').count(), 0, 'no document action is left in the header');
  // Names: tooltips and accessible names say the document and the scope.
  const labels = async doc => Object.fromEntries(await Promise.all(['context', 'canvas', 'chat', 'remove'].map(async name => [name, [await action(doc, name).getAttribute('title'), await action(doc, name).getAttribute('aria-label')]])));
  const a = await labels(A);
  assert.match(a.context[0], /^(Attach|Detach) alpha\.pdf (to|from) canvas context$/, `context title: ${a.context[0]}`);
  assert.equal(a.canvas[0], 'Add alpha.pdf to canvas');
  assert.match(a.chat[0], /^(Attach alpha\.pdf to|Remove alpha\.pdf from) this chat$/, `chat title: ${a.chat[0]}`);
  assert.equal(a.remove[0], 'Remove alpha.pdf from Materials');
  for (const [name, [title, label]] of Object.entries(a)) assert.ok(label && label === title, `${name}: aria-label matches its tooltip (${label})`);
  assert.ok(['true', 'false'].includes(await action(A, 'context').getAttribute('aria-pressed')), 'canvas context exposes its state');
  assert.ok(['true', 'false'].includes(await action(A, 'chat').getAttribute('aria-pressed')), 'chat attachment exposes its state');
  await shot('01-materials-rows');
});

// Scenario 1: every row action affects only its own PDF.
await check('two PDFs: canvas context and chat attachment on one row change only that PDF', async () => {
  await newChat();
  await setMode('ask');
  await openSources();
  const before = { a: (await serverDoc(A)).attached, b: (await serverDoc(B)).attached, aPressed: await pressed(A, 'context'), bPressed: await pressed(B, 'context') };
  assert.equal(before.aPressed, before.a, 'A\'s toggle shows its server state');
  await press(A, 'context');
  await flagBecomes(A, !before.a);
  assert.equal((await serverDoc(B)).attached, before.b, 'B\'s canvas context is unchanged');
  assert.equal(await pressed(A, 'context'), !before.a, 'A\'s toggle flipped');
  assert.equal(await pressed(B, 'context'), before.bPressed, 'B\'s toggle is unchanged');
  await press(A, 'context');
  await flagBecomes(A, before.a);
  // Chat attachment on B only.
  await clearChat(A, B);
  await press(B, 'chat');
  await waitFor(async () => pressed(B, 'chat'), 5000, 'B did not show attached to this chat');
  assert.equal(await pressed(A, 'chat'), false, 'A is not attached to this chat');
  assert.equal(await chipsOf(B).count(), 1, 'one chip for B');
  assert.equal(await chipsOf(A).count(), 0, 'no chip for A');
  assert.equal(await action(B, 'chat').getAttribute('title'), 'Remove beta.pdf from this chat', 'the pressed chat action says what it does next');
  const cap = await send('What do the attached documents say?');
  const refs = refsOf(cap);
  facts.scenario1 = { refs };
  assert.ok(wholeDoc(refs, B), `the request names B (${JSON.stringify(refs)})`);
  assert.ok(!refs.some(r => r.sourceId === `doc:${A.id}`), 'and never A');
  await press(B, 'chat');
  await waitFor(async () => !(await pressed(B, 'chat')), 5000, 'B stayed attached to this chat');
  assert.equal(await chipsOf(B).count(), 0, 'B\'s chip is gone');
});

// Scenario 2: the reader shows A while Add to canvas is pressed on row B; a double-clicked confirm inserts once.
await check('reader on A, Add to canvas on row B: the dialog is B\'s (name, page count), the pages carry B\'s key, a double-click inserts once, the reader stays on A', async () => {
  await openSources();
  await expander(A).click();
  await waitFor(async () => (await readerTitle()) === A.name, 10000, `the reader did not open ${A.name}`);
  await openAddFor(B);
  assert.equal((await dialog().locator('[data-pdf-file]').innerText()).trim(), B.name, 'the dialog names the clicked row\'s file');
  assert.equal(await readerTitle(), A.name, 'the reader still shows A');
  await choosePages(2, 3);
  assert.equal((await confirmButton().innerText()).trim(), 'Add 2 pages', 'the confirm button names the count');
  const before = (await inkBlocks()).filter(b => b.type === 'slide').length;
  await confirmButton().dblclick();
  await closed();
  await page.waitForTimeout(1500);
  const slides = (await inkBlocks()).filter(b => b.type === 'slide');
  const added = slides.slice(before);
  facts.scenario2 = { added: added.map(b => [b.pdf, b.number]) };
  assert.deepEqual(added.map(b => [b.pdf, b.number]), [[`doc:${B.id}`, 2], [`doc:${B.id}`, 3]], 'B\'s pages 2 and 3, once');
  assert.ok(!slides.some(b => b.pdf === `doc:${A.id}`), 'nothing of A was inserted');
  assert.equal(await readerTitle(), A.name, 'the reader is still on A');
  await shot('02-reader-a-add-b');
});

// Scenario 3: identical filenames, different ids.
await check('two documents both named same-name.pdf stay distinct: each row acts on its own id', async () => {
  await newChat();
  await setMode('ask');
  await openSources();
  assert.notEqual(C1.id, C2.id);
  const c1 = (await serverDoc(C1)).attached, c2 = (await serverDoc(C2)).attached;
  await press(C2, 'context');
  await flagBecomes(C2, !c2);
  assert.equal((await serverDoc(C1)).attached, c1, 'the other same-name document is unchanged');
  await press(C2, 'context');
  await flagBecomes(C2, c2);
  await clearChat(C1, C2);
  await press(C1, 'chat');
  await waitFor(async () => pressed(C1, 'chat'), 5000, 'C1 did not show attached to this chat');
  assert.equal(await pressed(C2, 'chat'), false, 'C2 is not attached to this chat');
  const cap = await send('Summarize the attached document.');
  const refs = refsOf(cap);
  facts.scenario3 = { c1: C1.id, c2: C2.id, refs };
  assert.ok(wholeDoc(refs, C1), 'the request names C1 by id');
  assert.ok(!refs.some(r => r.sourceId === `doc:${C2.id}`), 'and never C2');
  await press(C1, 'chat');
  await waitFor(async () => !(await pressed(C1, 'chat')), 5000, 'C1 stayed attached');
  // Add to canvas on C2 opens C2 (3 pages), not C1 (2 pages); Escape adds nothing.
  const before = (await inkBlocks()).length;
  await openAddFor(C2);
  await page.keyboard.press('Escape');
  await closed(5000);
  await page.waitForTimeout(600);
  assert.equal((await inkBlocks()).length, before, 'Escape added nothing');
});

// Scenario 4: canvas context and chat attachment are independent.
await check('canvas context and chat attachment are independent: toggling one leaves the other (state, aria-pressed, server flag)', async () => {
  await newChat();
  await openSources();
  const flag = (await serverDoc(A)).attached, context = await pressed(A, 'context');
  await clearChat(A);
  await press(A, 'chat');
  await waitFor(async () => pressed(A, 'chat'), 5000, 'A did not show attached to this chat');
  await page.waitForTimeout(800);
  assert.equal((await serverDoc(A)).attached, flag, 'attaching to this chat left the canvas context flag');
  assert.equal(await pressed(A, 'context'), context, 'and its toggle');
  await press(A, 'context');
  await flagBecomes(A, !flag);
  assert.equal(await pressed(A, 'chat'), true, 'toggling canvas context left the chat attachment');
  assert.equal(await chipsOf(A).count(), 1, 'and its chip');
  await press(A, 'context');
  await flagBecomes(A, flag);
  await press(A, 'chat');
  await waitFor(async () => !(await pressed(A, 'chat')), 5000, 'A stayed attached to this chat');
  assert.equal((await serverDoc(A)).attached, flag, 'detaching from this chat left the canvas context flag');
});

// Scenario 10: Remove from Materials.
let rPages = [];
await check('Remove from Materials: R\'s pages are on the canvas and R is attached to this chat (setup)', async () => {
  await newChat();
  await setMode('ask');
  await openSources();
  await openAddFor(R);
  await choosePages(null);
  assert.equal((await confirmButton().innerText()).trim(), 'Add 3 pages');
  await confirmButton().click();
  await closed();
  await page.waitForTimeout(1500);
  rPages = (await inkBlocks()).filter(b => b.type === 'slide' && b.pdf === `doc:${R.id}`);
  assert.deepEqual(rPages.map(b => b.number), [1, 2, 3], 'R\'s three pages landed');
  await clearChat(R);
  await press(R, 'chat');
  await waitFor(async () => pressed(R, 'chat'), 5000, 'R did not show attached to this chat');
});

await check('Remove from Materials: a failed removal shows an error and keeps the row for retry; Cancel keeps it', async () => {
  failDelete = R.id;
  try {
    await press(R, 'remove');
    const confirm = page.locator('[data-material-remove-confirm]');
    await confirm.waitFor({ timeout: 5000 });
    const text = (await confirm.innerText()).trim();
    facts.remove_confirm = text.slice(0, 400);
    assert.match(text, /Materials/, 'the confirmation names Materials');
    assert.match(text, /canvas/i, 'and says what happens to the canvas');
    await shot('10a-remove-confirm');
    await confirm.getByRole('button', { name: 'Remove from Materials', exact: true }).click();
    await waitFor(async () => (await row(R).locator('[role="alert"]').count()) > 0, 8000, 'no role=alert in the row after the failed removal');
    assert.equal(await row(R).count(), 1, 'the row stays');
    assert.ok(await serverDoc(R), 'the document is still listed');
    await shot('10b-remove-failed');
  } finally { failDelete = null; }
  await press(R, 'remove');
  const confirm = page.locator('[data-material-remove-confirm]');
  await confirm.waitFor({ timeout: 5000 });
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await confirm.waitFor({ state: 'detached', timeout: 5000 }).catch(async () => assert.equal(await confirm.isVisible(), false, 'the confirmation closed'));
  assert.equal(await row(R).count(), 1, 'Cancel keeps the row');
  assert.ok(await serverDoc(R), 'and the document');
});

await check('Remove from Materials: confirmed, the row and its chat chip go and no other document changes; after a reload it stays gone', async () => {
  const others = Object.fromEntries(await Promise.all([A, B, C1, C2, L].map(async doc => [doc.id, (await serverDoc(doc))?.attached])));
  await press(R, 'remove');
  const confirm = page.locator('[data-material-remove-confirm]');
  await confirm.waitFor({ timeout: 5000 });
  await confirm.getByRole('button', { name: 'Remove from Materials', exact: true }).click();
  await waitFor(async () => (await row(R).count()) === 0, 8000, 'the row stayed');
  await waitFor(async () => !(await serverDoc(R)), 8000, 'the server still lists R');
  await waitFor(async () => (await chipsOf(R).count()) === 0, 5000, 'R\'s chat chip stayed');
  for (const doc of [A, B, C1, C2, L]) assert.equal((await serverDoc(doc))?.attached, others[doc.id], `${doc.name} (${doc.id}) is unchanged`);
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await openSources();
  assert.equal(await row(R).count(), 0, 'after a reload R is still gone from Materials');
  assert.equal(await chipsOf(R).count(), 0, 'and no chip brings it back');
  await shot('10c-removed-after-reload');
});

await check('Remove from Materials kept R\'s pages: they render, the reader opens page 2, and a question on page 2 sends the doc ref at page 2', async () => {
  await closeSources();
  const ids = rPages.map(b => b.id);
  await waitFor(async () => {
    const loaded = await page.evaluate(list => list.map(id => { const img = document.querySelector(`[aria-label="Lesson canvas"] [data-block-id="${id}"] img`); return !!(img && img.complete && img.naturalWidth); }), ids);
    return loaded.every(Boolean);
  }, 30000, 'R\'s page images did not all load');
  const two = rPages.find(b => b.number === 2);
  await newChat();
  await setMode('ask');
  await selectBlock(two.id);
  await page.keyboard.press('Enter');
  await waitFor(async () => /RMV PAGE 2/.test(await page.locator('[aria-label="Paper page text"]').first().innerText().catch(() => '')), 20000, 'the reader did not draw R page 2');
  await shot('10d-removed-reader-page-2');
  await selectBlock(two.id);
  const cap = await send('What is on this page?');
  const refs = refsOf(cap);
  facts.scenario10_page = { refs };
  assert.ok(refs.some(r => r.sourceId === `doc:${R.id}` && r.kind === 'doc' && r.page === 2), `the doc ref at page 2 rides (${JSON.stringify(refs)})`);
  assert.ok(!wholeDoc(refs, R), 'the removed whole document does not ride');
});
await P.context.close();

// Scenario 11: a long name, Sources at 320 and 480 px, light and dark, keyboard focus; the rows at rest.
for (const theme of ['light', 'dark']) for (const width of [320, 480]) {
  await check(`${theme} ${width}px: the long name truncates with its full-name title, the four actions stay visible inside the pane, Tab reaches each with a visible focus`, async () => {
    const Q = await profile(`${theme}-${width}`, { 'small.theme': theme, 'rh.sources.width': String(width) });
    page = Q.page;
    try {
      await openCanvas(page);
      await openSources();
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', `the ${theme} theme is on`);
      const panel = await sourcesPanel().boundingBox();
      assert.ok(Math.abs(panel.width - width) <= 2, `Sources is ${width}px wide (${panel.width})`);
      assert.ok(await sourcesPane().evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'no horizontal overflow in Sources');
      const name = row(L).locator('[data-material-name]');
      assert.equal(await name.getAttribute('title'), LONG_NAME, 'the long name keeps its full name as its title');
      assert.ok(await name.evaluate(el => el.scrollWidth > el.clientWidth), 'the long name truncates');
      const nameBox = await name.boundingBox();
      for (const kind of ['context', 'canvas', 'chat', 'remove']) {
        const b = await action(L, kind).boundingBox();
        assert.ok(b && b.width >= 20 && b.height >= 20, `${kind} has a usable target (${b && `${b.width}x${b.height}`})`);
        assert.ok(b.x >= panel.x - 0.5 && b.x + b.width <= panel.x + panel.width + 0.5, `${kind} sits inside the pane`);
        const overlaps = !(b.x >= nameBox.x + nameBox.width || b.x + b.width <= nameBox.x || b.y >= nameBox.y + nameBox.height || b.y + b.height <= nameBox.y);
        assert.ok(!overlaps, `${kind} does not overlap the name`);
      }
      if (width === 320) {
        const actions = await row(L).locator('[data-material-actions]').boundingBox();
        assert.ok(actions.y >= nameBox.y + nameBox.height - 2, 'at 320px the actions are on their own line under the name');
      }
      // At rest: the pointer away from every control.
      await page.mouse.move(5, 995);
      await page.waitForTimeout(300);
      await sourcesPanel().screenshot({ path: `${OUT}/11-rows-rest-${theme}-${width}.png` });
      // Keyboard: Tab walks the four actions in order, each with a visible focus style.
      await action(L, 'context').focus();
      for (const kind of ['canvas', 'chat', 'remove']) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement?.dataset?.materialAction || null);
        assert.equal(focused, kind, `Tab moves to ${kind} (got ${focused})`);
        const style = await action(L, kind).evaluate(el => { const s = getComputedStyle(el); return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none', visible: el.matches(':focus-visible') }; });
        assert.ok(style.visible && (style.outline || style.shadow), `${kind} shows a visible focus style (${JSON.stringify(style)})`);
      }
      await sourcesPanel().screenshot({ path: `${OUT}/11-rows-focus-${theme}-${width}.png` });
    } finally { await Q.context.close(); }
  });
}

await check('no model call beyond the canned questions, no other model-capable request, no page error', async () => {
  assert.equal(captured.length, 3, `only the three questions this check sent (${captured.map(c => c.route).join(', ')})`);
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, documents: Object.fromEntries([A, B, C1, C2, R, L].map(d => [d.tag, d.id])), passed: results.length - failed.length, failed: failed.length, checks: results, facts,
  deletes, model_capable_refused: refused, outside_hosts: [...new Set(outside)], page_errors: errors }, null, 2));
console.log(failed.length ? `FAIL ${failed.length} of ${results.length} checks (see ${OUT}/results.json)` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
