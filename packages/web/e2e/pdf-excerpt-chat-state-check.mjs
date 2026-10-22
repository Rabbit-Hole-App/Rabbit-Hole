// PDF excerpt chips in a Chat thread's saved state (review 2026-10-20, P2 items 1 and 2), against the LOCAL stack only.
// The state route is REAL: PUT /api/learn/chat/threads/<id>/state and GET /api/ask/threads/<id> reach the stack's LEARN_DB, so
// what a fresh browser shows is what the server stored. Only /api/learn/ask is answered in the browser (canned SSE); every other
// model-capable request is aborted, so no model is ever called.
//   1. attach a 2,000- and an 8,000-character excerpt card (64 line boxes, a note each) to a saved thread: every state save is 200;
//   2. the server's copy of the thread holds both chips exactly as the browser sent them, each quote stored once;
//   3. a fresh browser profile reopens the thread: both chips are back, and a chip opens its PDF page with the excerpt emphasized;
//   4. the follow-up's request carries both exact quotes and both notes.
// On 688028bd step 1 fails: its validContextRefs refuses the 2,000-character excerpt's state (the chip's reader anchor, quote
// included, is 7,297 bytes against 2 KB per ref), so the PUT is a 400. Shown function-level on that commit, not run in a browser.
// Usage: BASE=http://127.0.0.1:9101 SMALL_CP=http://127.0.0.1:9103 VARS=<cp .dev.vars> node e2e/pdf-excerpt-chat-state-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9101';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9103';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('pdf-excerpt-chat-state-check runs against the local stack only');
const OUT = process.argv[2] || 'pdf-excerpt-chat-state-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pxs-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// ---------------------------------------------------------------- setup: a canvas, its one-page PDF, a saved thread, two excerpt cards
const esc = s => s.replace(/[\\()]/g, m => `\\${m}`);
function onePagePdf(lines) {
  const stream = lines.map((s, i) => `BT /F1 9 Tf 40 ${770 - i * 11} Td (${esc(s)}) Tj ET`).join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R] /Count 1 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const quoteOf = (length, mark) => Array.from({ length }, (_, i) => (i % 50 === 24 ? ' ' : String.fromCharCode(97 + ((i * 7 + mark.charCodeAt(0)) % 26)))).join('');
const SHORT = quoteOf(2000, 'q'), LONG = quoteOf(8000, 'z');
const NOTES = { short: 'First note: compare with the tides', long: 'Second note: the long passage' };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Excerpt chips ${run}` }) });
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([onePagePdf(Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of the excerpt source page.`))], { type: 'application/pdf' }), 'chips.pdf');
const DOC = (await api('/api/learn/context', { method: 'POST', body: form })).document, KEY = `doc:${DOC.id}`;
const { sha256 } = await api(`/api/learn/pdf-source?${new URLSearchParams({ app: canvas.name, key: KEY })}`);
const rects = Array.from({ length: 64 }, (_, i) => [40.123456789 + i / 7, 766.98765432109 - i * 11.0371, 560.33333333333 + i / 3, 776.44444444441 - i * 11.0371]);
const hex = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const card = (id, exact, note, dy) => ({ id, type: 'explanation', dx: 0, dy, w: 440, h: 340, title: 'chips.pdf · p. 1', note, excerpt: {
  v: 1, id: `pdfx_${hex(24)}`, kind: 'text', source: { key: KEY, sha256, name: 'chips.pdf', home: null }, page: { index: 1, label: null }, rotate: 0, view: [0, 0, 612, 792],
  rects, quote: { exact, prefix: '', suffix: '' }, highlightId: null, crop: null, part: null } });
const CARDS = { short: card('x-short', SHORT, NOTES.short, 0), long: card('x-long', LONG, NOTES.long, 420) };
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: Object.values(CARDS) } }) });
const THREAD = `canvaschat-${crypto.randomUUID()}`;
await api(`/api/learn/chat/threads/${THREAD}/messages`, { method: 'POST', body: JSON.stringify({ app: canvas.name, client_id: `c-${run}`, role: 'user', content: 'Earlier question', mode: 'ask' }) });
await api('/api/learn/chat/active', { method: 'PUT', body: JSON.stringify({ app: canvas.name, thread_id: THREAD }) });

// ---------------------------------------------------------------- routes: the state route stays real; the model never runs
const captured = [], refused = [], outside = [], errors = [], statePuts = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (request.method() === 'POST' && url.pathname === '/api/learn/ask') {
    const body = JSON.parse(request.postData() || '{}'), n = captured.push(body);
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: `Canned reply ${n}.` })
      + frame('answer_meta', { messageId: `m-${n}`, actions: [], followUps: [], alternatives: [`m-${n}`], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id, userMessageId: `u-${n}`, messageId: `m-${n}` }) });
  }
  // MOCKED CR-1 route decision (chat-route-interface.md): an answer, as JEV would decide for a question. A code, page or file turn
  // in Auto asks it before /api/learn/ask, and CI has no JEV key, so the real route would fall back and send nothing.
  if (request.method() === 'POST' && url.pathname === '/api/learn/chat/route') return route.fulfill({ json: { route: 'answer', via: 'jev', capability: null, flow: null, token: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};
const browser = await chromium.launch();
let page = null;
const profile = async () => {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  p.on('response', async response => {
    if (response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/learn/chat/threads/${THREAD}/state`) {
      statePuts.push({ status: response.status(), body: JSON.parse(response.request().postData() || '{}'), error: response.ok() ? null : (await response.json().catch(() => ({}))).error });
    }
  });
  await p.goto(`${BASE}/apps/${canvas.name}`);
  await p.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await p.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  return { context, p };
};
const pane = () => page.locator('[data-chat-pane]');
const chips = () => pane().locator('[data-context-chip]');
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) { results.push({ label, ok: false }); console.log(`FAIL ${label} - ${String(error?.message || error).split('\n')[0].slice(0, 400)}`); await page?.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {}); }
};
const selectCard = async id => {
  const target = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
  await target.waitFor({ timeout: 30000 });
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const b = await target.boundingBox();
  await page.mouse.click(b.x + 60, b.y + 24);
  await pane().locator(`[data-selected-card="${id}"]`).waitFor({ timeout: 5000 });
};

let first = await profile();
page = first.p;
await waitFor(async () => (await pane().getByText('Earlier question', { exact: true }).count()) > 0, 30000, 'the saved thread was not restored');

await check('1. two excerpt cards (2,000 and 8,000 characters, 64 line boxes, a note each) attach to the saved thread, and every state save is 200', async () => {
  for (const which of ['short', 'long']) {
    await selectCard(CARDS[which].id);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+l');
  }
  await waitFor(async () => (await chips().count()) >= 2, 8000, `${await chips().count()} chips after attaching two`);
  await waitFor(() => statePuts.some(p => (p.body.contextRefs || []).filter(r => r.kind === 'excerpt').length === 2), 10000, `no state save with both chips (${JSON.stringify(statePuts.map(p => [p.status, p.error]))})`);
  assert.deepEqual(statePuts.map(p => p.status).filter(s => s !== 200), [], `a state save failed: ${JSON.stringify(statePuts.filter(p => p.status !== 200).map(p => p.error))}`);
  await page.screenshot({ path: `${OUT}/1-attached.png` });
});

let sent = null;
await check('2. the server holds both chips exactly as sent (text with quote and note, and the reader anchor), each quote stored once', async () => {
  sent = statePuts.filter(p => p.status === 200).at(-1).body.contextRefs;
  const thread = await api(`/api/ask/threads/${THREAD}`);
  assert.deepEqual(thread.contextRefs, sent);
  for (const [which, exact] of [['short', SHORT], ['long', LONG]]) {
    const ref = thread.contextRefs.find(r => r.sourceId === `excerpt:${CARDS[which].excerpt.id}`);
    assert.ok(ref.text.includes(exact) && ref.text.endsWith(`Learner note: ${NOTES[which]}`), `${which}: quote and note in the text`);
    assert.equal(ref.open.range.excerpt.id, CARDS[which].excerpt.id, `${which}: the anchor a chip click opens`);
    assert.equal(JSON.stringify(ref).split(exact).length, 2, `${which}: the quote is stored once`);
  }
});
await first.context.close();

const second = await profile();
page = second.p;
await check('3. a fresh browser profile reopens the thread with both chips, and a chip opens its PDF page with the excerpt emphasized', async () => {
  await waitFor(async () => (await chips().count()) >= 2, 30000, `${await chips().count()} chips restored`);
  const names = await chips().allInnerTexts();
  assert.equal(names.filter(n => n.includes('chips.pdf · p. 1')).length, 2, `chip names ${JSON.stringify(names)}`);
  await chips().last().locator('button').first().click();
  await page.locator('[data-sources-pane] section[aria-label="Paper reader"]').first().waitFor({ timeout: 30000 });
  await page.locator('[data-pdf-emphasis]').first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${OUT}/3-reopened-source.png` });
});

await check('4. the follow-up from the reopened thread sends both exact quotes and both notes', async () => {
  await pane().locator('[data-chat-composer] textarea').first().fill('And what follows from these?');
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > 0, 20000, 'no /api/learn/ask request');
  const body = captured.at(-1), refs = (body.context_refs || []).filter(r => r.kind === 'excerpt');
  assert.equal(body.thread_id, THREAD, 'the follow-up is in the reopened thread');
  assert.equal(refs.length, 2, `two excerpt refs (${refs.length})`);
  for (const [which, exact] of [['short', SHORT], ['long', LONG]]) {
    const ref = refs.find(r => r.sourceId === `excerpt:${CARDS[which].excerpt.id}`);
    assert.ok(ref?.text?.includes(exact), `${which}: the exact quote rides`);
    assert.ok(ref.text.includes(`Learner note: ${NOTES[which]}`), `${which}: the note rides`);
  }
});

await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`model requests aborted: ${refused.length}; outside hosts: ${[...new Set(outside)].join(', ') || 'none'}; page errors: ${errors.length}`);
for (const error of errors) console.log(`  page error: ${error}`);
console.log(`${results.length - failed}/4 passed`);
process.exit(failed || results.length !== 4 || errors.length ? 1 : 0);
