// One chat-context entry per PDF document and page (docs/features/pdf-materials-refinement.md section 6, scenarios 5-9 of
// section 8), against the LOCAL stack only: local D1 and fresh browser profiles. No model is ever called: /api/learn/ask (an SSE
// stream) and the Tutor planner are answered here with canned text and their request bodies CAPTURED; every other model-capable
// route is aborted and counted, and none may happen.
// Setup: a canvas with two 4-page PDF context documents of the SAME file name (A switched on for the canvas, B off), and on
// the canvas A's PDF card, A's pages 2 and 3 and B's page 2 (seeded ink; the page images are not needed).
// Covered: 5 selecting A's card (already in this chat as the canvas's document) is one entry, Added to chat on the selection
// bar, and one ref of A in the request; selecting A's page 2 is one dashed selection chip (no pill above the composer), Add to
// chat upgrades it in place, and the request holds that page once; 6 deselecting keeps the pinned page and drops a page only
// selected; 7 x on a pinned page that is also selected removes it and the selection, and it does not come back; 8 A p.2, A p.3
// and B p.2 stay three entries with their own pages, B never merged into A by name, each ref exact in the request; 9 a page
// pinned in chat A is not in chat B or a New chat, comes back with chat A, and after a reload.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Evidence goes to OUT: results.json (the captured context_refs, canvas_target, paper_context and page_context; never cookies)
// and *.png. The same run against a build before the change is the before evidence (it fails scenario 5 on the duplicate).
// Usage: BASE=http://127.0.0.1:8901 SMALL_CP=http://127.0.0.1:8903 VARS=<cp .dev.vars> OUT=<dir> node e2e/chat-context-pill-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8901';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8903';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('chat-context-pill-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/chat-context-pill', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ccp-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// ---------------------------------------------------------------- two PDFs of one name: 4 pages each, "A n" / "B n" on page n
function makePdf(tag, pages = 4) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let n = 1; n <= pages; n++) {
    const stream = `BT /F1 96 Tf 60 400 Td (${tag} ${n}) Tj ET`;
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + `${5 + (n - 1) * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const NAME = 'notes.pdf';
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Chat context ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const upload = async tag => {
  const form = new FormData();
  form.append('app', canvas.name);
  form.append('file', new Blob([makePdf(tag)], { type: 'application/pdf' }), NAME);
  const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json()).document;
  if (!/^ctx:[0-9a-f]{12}$/.test(doc?.id || '')) throw Error(`context document ${tag} was not stored`);
  return doc;
};
const A = await upload('A'), B = await upload('B');
// B is on the canvas but not switched on for its context, so a new chat starts with A's document only.
await api(`/api/learn/context/${encodeURIComponent(B.id)}?app=${canvas.name}`, { method: 'PATCH', body: JSON.stringify({ app: canvas.name, attached: false }) });
const KEY_A = `doc:${A.id}`, KEY_B = `doc:${B.id}`;
const BLOCKS = [
  { id: 'card-a', type: 'pdf', assetKey: KEY_A, label: NAME },
  { id: 'a-p2', type: 'slide', pdf: KEY_A, number: 2, label: NAME, assetKey: `slide:${run}:a2` },
  { id: 'a-p3', type: 'slide', pdf: KEY_A, number: 3, label: NAME, assetKey: `slide:${run}:a3` },
  { id: 'b-p2', type: 'slide', pdf: KEY_B, number: 2, label: NAME, assetKey: `slide:${run}:b2` },
];
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const SEED = { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: BLOCKS.map(block => ({ dx: 0, dy: 0, ...block })) };
// Two saved chats on this canvas (scenario 9): the client mints a chat's id, and its first message creates it.
const thread = async title => {
  const id = `canvaschat-${randomUUID()}`;
  const saved = await api(`/api/learn/chat/threads/${id}/messages`, { method: 'POST', body: JSON.stringify({ app: canvas.name, client_id: `ccp${run}${title.replace(/\W/g, '')}`, role: 'user', content: `${title} question`, title }) });
  if (saved?.error) throw Error(`chat ${title} was not saved: ${saved.error}`);
  return id;
};
const CHAT_A = await thread('Chat A'), CHAT_B = await thread('Chat B');

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [];
let replies = 0;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/handoff|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ route: 'ask', body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `ccp-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/plan') {
    const reply = ++replies;
    captured.push({ route: 'plan', body, reply });
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: `Canned reply ${reply}.` }] } });
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  // The canned chats exist nowhere; the two saved chats (canvaschat-<uuid>) save their state for real.
  if (/^\/api\/learn\/chat\/(threads|messages)\/ccp-/.test(path)) return route.fulfill({ json: { ok: true } });
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
    console.log(`FAIL ${label} - ${message}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// Every frame runs init scripts; a sandboxed iframe has no localStorage, so the seed is written where there is one.
await context.addInitScript(([key, seed]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* a sandboxed frame */ } }, [INK, SEED]);
await context.route('**/*', router);
page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const pane = () => page.locator('[data-chat-pane]');
const openCanvas = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[aria-label="Lesson canvas"] [data-block-id="b-p2"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
};

// ---------------------------------------------------------------- the composer's context entries for one document and page
// Every entry in the Chat pane that stands for a PDF: the context chips and any selection pill or chip, by their visible text.
// Read by text and by data-ref-key, so the same count runs on a build before the change (which has no data-ref-key).
const entries = () => pane().evaluate(() => [...document.querySelectorAll('[data-chat-pane] [data-context-chip], [data-chat-pane] [data-canvas-target]')]
  .filter((el, i, all) => !all.some(other => other !== el && other.contains(el)))
  .map(el => ({ text: el.innerText.replace(/\s+/g, ' ').trim(), key: el.getAttribute('data-ref-key'), selection: el.hasAttribute('data-canvas-target'), chip: el.getAttribute('data-context-chip'), temporary: el.hasAttribute('data-context-selection') })));
const keyOf = (sourceId, page = null) => `${sourceId}|${JSON.stringify(page ? { page } : null)}`;
// The entries for one document and page: by key when the build marks one; by name and page label otherwise.
const entriesFor = async (sourceId, page = null) => (await entries()).filter(entry => (entry.key ? entry.key === keyOf(sourceId, page)
  : entry.text.includes(NAME) && (page ? entry.text.includes(`p. ${page}`) || entry.text.includes(`page ${page}`) : !/\b(p\.|page) \d/.test(entry.text))));

// ---------------------------------------------------------------- the canvas: select, deselect, Add to chat
const rightEdge = async () => ((await pane().boundingBox())?.x ?? 1400) - 30;
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
const deselect = async () => {
  const point = await barePoint();
  assert.ok(point, 'a bare point of canvas');
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(300);
};
// Select one block: a press on its top strip (a PDF card's frame, a page's image), until the pane names it as selected.
const select = async id => {
  await deselect(); // a selection that stepped aside for Add to chat comes back only on a new selection
  const target = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
  await reveal(target);
  for (const [dx, dy] of [[60, 8], [60, 30], [24, 4]]) {
    await page.waitForTimeout(300);
    const b = await target.boundingBox();
    await page.mouse.click(b.x + dx, b.y + dy);
    if (await pane().locator(`[data-selected-card="${id}"]`).waitFor({ timeout: 2500 }).then(() => true, () => false)) return;
  }
  throw Error(`selecting block ${id} showed no [data-selected-card] in the Chat pane`);
};
const addToChat = async () => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('Control+l'); await page.waitForTimeout(400); };
const barButton = () => page.locator('[data-add-to-chat]:visible').first();
const field = () => pane().locator('[data-chat-composer] textarea').first();
const setMode = async mode => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await page.waitForTimeout(200);
};
const newChat = async () => { await pane().locator('[data-chat-new]').click(); await page.waitForTimeout(400); };
const send = async text => {
  await field().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000, 'no model request was sent for the turn');
  const cap = captured[n];
  await pane().getByText(`Canned reply ${cap.reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  return cap;
};
// What a request says about the PDFs: every ref as [sourceId, page], and the other PDF fields.
const pdfFields = body => ({
  context_refs: (body.context_refs || []).map(ref => ({ sourceId: ref.sourceId, kind: ref.kind, range: ref.range ?? null, text: 'text' in ref })),
  canvas_target: body.canvas_target ? { id: body.canvas_target.id, kind: body.canvas_target.kind, title: body.canvas_target.title } : null,
  paper_context: body.paper_context ?? null, page_context: body.page_context ?? null,
});
const refsOf = (body, sourceId, page = null) => (body.context_refs || []).filter(ref => ref.sourceId === sourceId && JSON.stringify(ref.range ?? null) === JSON.stringify(page ? { page } : null));

// ================================================================ the run
await openCanvas();
await newChat();
await setMode('ask');

await check('5a: a new chat holds the canvas\'s document A once, and B (switched off) not at all', async () => {
  await waitFor(async () => (await entriesFor(KEY_A)).length === 1, 10000, `document A is not one entry: ${JSON.stringify(await entries())}`);
  assert.equal((await entriesFor(KEY_B)).length, 0, 'B is not in this chat');
});

await check('5b: selecting A\'s PDF card, already in this chat, is still one entry for A; the selection bar reads Added to chat', async () => {
  await select('card-a');
  await shot('05b-selected-pdf-card');
  const found = await entriesFor(KEY_A);
  facts.s5b_entries = await entries();
  assert.equal(found.length, 1, `A shows as ${found.length} entries: ${JSON.stringify(found.map(e => e.text))}`);
  assert.equal(await pane().locator('[data-canvas-target]:not([data-context-chip])').count(), 0, 'no separate selection pill');
  assert.equal(await barButton().getAttribute('data-added'), 'true', 'the bar says Added to chat');
  assert.equal((await barButton().innerText()).split('\n')[0].trim(), 'Added to chat');
});

await check('5c: Add to chat on A\'s card again adds nothing; the question carries A once and no card ref for the PDF', async () => {
  await addToChat();
  assert.equal((await entriesFor(KEY_A)).length, 1, 'still one entry for A');
  await select('card-a');
  const cap = await send('What is in this PDF?');
  facts.s5c = { route: cap.route, ...pdfFields(cap.body) };
  assert.equal(refsOf(cap.body, KEY_A).length, 1, 'A once in context_refs');
  assert.equal((cap.body.context_refs || []).filter(ref => ref.sourceId === 'card:card-a').length, 0, 'never a card:<block> ref for the PDF card');
  assert.equal(new Set((cap.body.context_refs || []).map(ref => `${ref.sourceId}|${JSON.stringify(ref.range ?? null)}`)).size, (cap.body.context_refs || []).length, 'no ref twice');
});

await check('5d: selecting A\'s page 2 is one dashed selection chip in the composer, not a pill above it', async () => {
  await deselect();
  await select('a-p2');
  await shot('05d-selected-page-2');
  const found = await entriesFor(KEY_A, 2);
  facts.s5d_entries = await entries();
  assert.equal(found.length, 1, `page 2 shows as ${found.length} entries`);
  assert.equal(found[0].temporary, true, 'a selection chip, not yet in this chat');
  assert.ok(await pane().locator('[data-chat-composer] [data-context-selection]').count() === 1, 'it sits in the composer\'s context area');
  assert.equal(await barButton().getAttribute('data-added'), null, 'the bar offers Add to chat');
  const cap = await send('What does this page say?');
  facts.s5d = { route: cap.route, ...pdfFields(cap.body) };
  assert.equal(refsOf(cap.body, KEY_A, 2).length, 1, 'the selected page rides once');
});

await check('5e: Add to chat upgrades that entry in place: one pinned chip for A p.2, Added to chat, one ref in the request', async () => {
  await select('a-p2');
  await addToChat();
  await waitFor(async () => (await entriesFor(KEY_A, 2)).some(entry => entry.chip === 'ready'), 5000, 'page 2 was not pinned');
  const after = await entriesFor(KEY_A, 2);
  assert.equal(after.length, 1, `page 2 shows as ${after.length} entries after Add to chat`);
  await select('a-p2');
  await shot('05e-pinned-and-selected-page-2');
  assert.equal((await entriesFor(KEY_A, 2)).length, 1, 'still one entry with the page selected again');
  assert.equal(await barButton().getAttribute('data-added'), 'true', 'Added to chat');
  await addToChat();
  assert.equal((await entriesFor(KEY_A, 2)).length, 1, 'a second Add to chat adds nothing');
  const cap = await send('And now?');
  facts.s5e = { route: cap.route, ...pdfFields(cap.body) };
  assert.equal(refsOf(cap.body, KEY_A, 2).length, 1, 'page 2 once');
  assert.equal(refsOf(cap.body, KEY_A).length, 1, 'the whole document once');
});

await check('6: deselecting keeps the pinned page; a page only selected goes with the selection', async () => {
  await deselect();
  assert.equal((await entriesFor(KEY_A, 2)).length, 1, 'the pinned page stays after deselection');
  await select('a-p3');
  assert.equal((await entriesFor(KEY_A, 3)).length, 1, 'page 3 selected');
  await deselect();
  await page.waitForTimeout(400);
  assert.equal((await entriesFor(KEY_A, 3)).length, 0, 'page 3 (selected only) is gone');
  await shot('06-deselected');
  const cap = await send('Summarize the attached page.');
  facts.s6 = { route: cap.route, ...pdfFields(cap.body) };
  assert.equal(refsOf(cap.body, KEY_A, 2).length, 1, 'page 2 rides');
  assert.equal(refsOf(cap.body, KEY_A, 3).length, 0, 'page 3 does not');
  assert.equal(cap.body.canvas_target ?? null, null, 'nothing selected rides');
});

await check('7: x on the pinned page while it is selected removes it and the selection; it does not come back', async () => {
  await select('a-p2');
  const chip = pane().locator(`[data-context-chip][data-selected-card="a-p2"]`);
  await chip.waitFor({ timeout: 5000 });
  await chip.locator('button[aria-label^="Remove "]').click();
  await page.waitForTimeout(1200);
  assert.equal((await entriesFor(KEY_A, 2)).length, 0, `page 2 came back: ${JSON.stringify(await entries())}`);
  assert.equal((await entriesFor(KEY_A)).length, 1, 'the unrelated document A stays');
  await shot('07-removed');
  const cap = await send('Anything attached?');
  facts.s7 = { route: cap.route, ...pdfFields(cap.body) };
  assert.equal(refsOf(cap.body, KEY_A, 2).length, 0, 'page 2 is not sent');
});

await check('8: A p.2, A p.3 and B p.2 (same file name) are three entries with their own pages, and three exact refs', async () => {
  for (const id of ['a-p2', 'a-p3', 'b-p2']) { await select(id); await addToChat(); }
  await deselect();
  const a2 = await entriesFor(KEY_A, 2), a3 = await entriesFor(KEY_A, 3), b2 = await entriesFor(KEY_B, 2);
  facts.s8_entries = await entries();
  assert.deepEqual([a2.length, a3.length, b2.length], [1, 1, 1], `entries ${JSON.stringify(facts.s8_entries.map(e => e.key || e.text))}`);
  for (const [entry, n] of [[a2[0], 2], [a3[0], 3], [b2[0], 2]]) assert.ok(entry.text.includes(`p. ${n}`), `the entry names page ${n}: ${entry.text}`);
  assert.equal((await entries()).filter(entry => entry.text.includes('label only')).length, 0, 'context document pages are read: none marked label only');
  await shot('08-three-pages');
  const cap = await send('Compare these pages.');
  facts.s8 = { route: cap.route, ...pdfFields(cap.body) };
  assert.equal(refsOf(cap.body, KEY_A, 2).length, 1, 'A p.2');
  assert.equal(refsOf(cap.body, KEY_A, 3).length, 1, 'A p.3');
  assert.equal(refsOf(cap.body, KEY_B, 2).length, 1, 'B p.2, its own document');
});

const openChat = async id => {
  if (!(await page.locator('[data-chat-history-search]').isVisible().catch(() => false))) await pane().getByRole('button', { name: 'History', exact: true }).click();
  await page.locator(`[data-chat-history-row="${id}"]`).click();
  await waitFor(async () => !(await page.locator('[data-chat-history-search]').isVisible().catch(() => false)), 10000, 'History did not close on the pick');
  await page.waitForTimeout(800);
};
await check('9: a page pinned in chat A is not in chat B or a New chat, returns with chat A, and after a reload', async () => {
  await openChat(CHAT_A);
  await waitFor(async () => (await entriesFor(KEY_A, 3)).length === 0, 5000, 'chat A opened with another chat\'s page');
  await select('a-p3');
  await addToChat();
  await deselect();
  assert.equal((await entriesFor(KEY_A, 3)).length, 1, 'A p.3 pinned in chat A');
  await page.waitForTimeout(1500); // the thread's state save (chat-threads.js SAVE_DELAY)
  await openChat(CHAT_B);
  assert.equal((await entriesFor(KEY_A, 3)).length, 0, 'chat B does not have chat A\'s page');
  await shot('09-chat-b');
  await newChat();
  assert.equal((await entriesFor(KEY_A, 3)).length, 0, 'a New chat does not inherit it');
  await openChat(CHAT_A);
  await waitFor(async () => (await entriesFor(KEY_A, 3)).length === 1, 8000, 'chat A came back without its page');
  await shot('09-chat-a-again');
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(2000);
  if ((await entriesFor(KEY_A, 3)).length === 0) await openChat(CHAT_A);
  await waitFor(async () => (await entriesFor(KEY_A, 3)).length === 1, 8000, 'after a reload chat A lost its page');
  assert.equal((await entriesFor(KEY_A, 2)).length, 0, 'and has no other chat\'s page');
  await shot('09-reloaded');
  await setMode('ask');
  const cap = await send('Still attached?');
  facts.s9 = { route: cap.route, ...pdfFields(cap.body) };
  assert.equal(refsOf(cap.body, KEY_A, 3).length, 1, 'the restored page rides');
});

// Outside hosts (the canvas's notebook origin) are aborted and recorded in results.json, as pdf-to-canvas-check does.
await check('no model route was called and no page error', async () => {
  assert.deepEqual(refused, [], `model-capable routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify({ canvas: canvas.name, documents: { A: A.id, B: B.id }, chats: { A: CHAT_A, B: CHAT_B }, results, facts, outside_hosts: [...new Set(outside)], requests: captured.map(c => ({ route: c.route, ...pdfFields(c.body) })) }, null, 2));
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `FAIL ${failed.length} of ${results.length}` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
