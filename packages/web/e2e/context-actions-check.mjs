// Context and shared actions (owner review UI-10, 2026-10-21, C:/s/spec/day-1021/review-findings-1240.md item 3), against the
// LOCAL stack only: local D1 and a fresh browser profile. The Context row's one "Use in this chat" toggle is the same state as the
// composer chip and the refs the next message sends; the canvas default (new chats on this canvas) sits apart in the row's More
// menu and never changes this chat; a source open but not used says "Not attached"; a short expanded preview is content-sized and
// a long one scrolls inside a bounded box; Add to canvas is the inverse Button, Upload blue, the removal icon red. A code card
// added from the canvas is its code-card.js ref (an uploaded card with its stored text, a repository card with its file, commit
// and lines). The sends that compare refs to pills are answered here with canned text; every other model-capable route is
// aborted and counted, and none may happen.
// Prints `ok <label>` per check and `PASS <n> checks`, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:9601 SMALL_CP=http://127.0.0.1:9603 VARS=<cp .dev.vars> OUT=<dir> node e2e/context-actions-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9601';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9603';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('context-actions-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/context-actions', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ctxact-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// ---------------------------------------------------------------- a canvas, three context documents, two code cards
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Context actions ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error('the canvas was not created');
function makePdf(pages = 2) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let n = 1; n <= pages; n++) {
    const stream = `BT /F1 48 Tf 60 400 Td (PAGE ${n}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (n - 1) * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const upload = async (name, bytes, type) => {
  const form = new FormData();
  form.append('app', canvas.name);
  form.append('file', new Blob([bytes], { type }), name);
  const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json()).document;
  if (!/^ctx:[0-9a-f]{12}$/.test(doc?.id || '')) throw Error(`context document ${name} was not stored`);
  // Off for the canvas: a new chat starts without it, so each step starts from its own state.
  await api(`/api/learn/context/${encodeURIComponent(doc.id)}?app=${canvas.name}`, { method: 'PATCH', body: JSON.stringify({ app: canvas.name, attached: false }) });
  return { ...doc, name };
};
const SHORT = await upload('short.txt', 'One line of notes.', 'text/plain');
const LONG = await upload('long.txt', Array.from({ length: 400 }, (_, i) => `Line ${i + 1} of a long document about attention.`).join('\n'), 'text/plain');
const PDF = await upload('paper.pdf', makePdf(2), 'application/pdf');
const serverDoc = async doc => ((await api(`/api/learn/context?app=${canvas.name}`)).documents || []).find(d => d.id === doc.id);
const COMMIT = '37baab7c1f0e2d3a4b5c6d7e8f9a0b1c2d3e4f50', ASSET = `code:${run}:utils`;
const CODE_TEXT = 'def add(a, b):\n    return a + b\n';
const BLOCKS = [
  { id: 'up-code', type: 'repo-code', dx: 0, dy: 0, title: 'utils.py', language: 'python', source: { kind: 'upload', assetKey: ASSET, name: 'utils.py', size: CODE_TEXT.length } },
  { id: 'repo-code', type: 'repo-code', dx: 0, dy: 0, title: 'model.py', language: 'python', source: { kind: 'repository', app: 'repo-mingpt', repo: 'karpathy/minGPT', commit: COMMIT, path: 'mingpt/model.py', start: 27, end: 56 } },
  { id: 'c-a', type: 'explanation', dx: 0, dy: 0, title: 'Card A: tides', body: 'The moon pulls.', groupId: 'g1' },
  { id: 'c-b', type: 'explanation', dx: 0, dy: 0, title: 'Card B: bulges', body: 'Two bulges.', groupId: 'g1' },
];
const SEED = { strokes: [], shapes: [], items: [], links: [], groups: [{ id: 'g1', label: 'Pair' }], areas: [], exchanges: [], blocks: BLOCKS };
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
// A saved chat to restore (its first message creates it); it holds no attachment.
const SAVED = `canvaschat-${randomUUID()}`;
{ const saved = await api(`/api/learn/chat/threads/${SAVED}/messages`, { method: 'POST', body: JSON.stringify({ app: canvas.name, client_id: `ca${run}saved`, role: 'user', content: 'Saved question', title: 'Saved chat' }) }); if (saved?.error) throw Error(`the saved chat was not made: ${saved.error}`); }

// ---------------------------------------------------------------- routes: model routes counted; deliberate sends canned
const model = [], sends = [], errors = [];
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask$|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, seed, asset, text]) => {
  try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* a sandboxed frame */ }
  // The uploaded code card's stored file, in the browser's asset cache (learn-asset-cache.js), as an upload leaves it.
  try { const open = indexedDB.open('small-learn-assets', 1); open.onupgradeneeded = () => open.result.createObjectStore('assets'); open.onsuccess = () => { open.result.transaction('assets', 'readwrite').objectStore('assets').put(text, asset); }; } catch { /* no IndexedDB in this frame */ }
}, [INK, SEED, ASSET, CODE_TEXT]);
let answer = false;
await context.route('**/api/**', route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (path === '/api/learn/ask' && request.method() === 'POST' && answer) {
    let body = {}; try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
    sends.push(body);
    const n = sends.length;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: `Canned reply ${n}.` })
      + frame('answer_meta', { messageId: `m-${n}`, actions: [], followUps: [], alternatives: [`m-${n}`], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `ca-${run}-${n}`, userMessageId: `u-${n}`, messageId: `m-${n}` }) });
  }
  if (/^\/api\/learn\/chat\/(threads|messages)\/ca-/.test(path)) return route.fulfill({ json: { ok: true } });
  if (MODEL.test(path) && !(path === '/api/learn/journey' && request.method() === 'GET')) { model.push(`${request.method()} ${path}`); return route.abort(); }
  return route.continue();
});
let page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));

const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const settle = (ms = 350) => page.waitForTimeout(ms);
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const pane = () => page.locator('[data-chat-pane]');
const sourcesPane = () => page.locator('[data-sources-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
const row = doc => sourcesPane().locator(`[data-material-row][data-source-id="doc:${doc.id}"]`);
const action = (doc, name) => (name === 'context' ? page.locator('[data-material-menu] [data-material-action="context"]') : row(doc).locator(`[data-material-action="${name}"]`));
const useToggle = doc => action(doc, 'chat');
const using = async doc => (await useToggle(doc).getAttribute('aria-pressed')) === 'true';
const chipOf = doc => pane().locator(`[data-chat-composer] [data-context-chip][data-ref-key^="doc:${doc.id}|"]`);
const chatTab = async () => { const tab = page.locator('[data-panel-tab="chat"]'); if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') await tab.click(); await pane().waitFor({ state: 'visible', timeout: 10000 }); };
const sourcesOpen = () => page.evaluate(() => ['aside[data-companion]', '[data-context-panel]'].every(s => (document.querySelector(s)?.getBoundingClientRect().width || 0) > 50));
const openSources = async () => { if (!(await sourcesOpen())) await page.locator('[data-panel-companion]').click({ timeout: 5000 }); await sourcesPane().waitFor({ state: 'visible', timeout: 10000 }); await waitFor(async () => (await row(PDF).count()) && (await row(LONG).count()) && (await row(SHORT).count()), 20000, 'the Context rows did not show'); };
const setMode = async mode => { await chatTab(); if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return; await pane().getByRole('button', { name: 'Mode', exact: true }).click(); await page.locator(`[data-chat-mode-option="${mode}"]`).click(); await settle(200); };
const newChat = async () => { await chatTab(); await pane().locator('[data-chat-new]').click(); await settle(400); };
const openChat = async id => {
  await chatTab();
  if (!(await page.locator('[data-chat-history-search]').isVisible().catch(() => false))) await pane().getByRole('button', { name: 'History', exact: true }).click();
  await page.locator(`[data-chat-history-row="${id}"]`).click();
  await waitFor(async () => !(await page.locator('[data-chat-history-search]').isVisible().catch(() => false)), 10000, 'History did not close on the pick');
  await settle(800);
};
const open = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"] [data-block-id="repo-code"]').first().waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await settle(1200);
};
const send = async text => {
  await chatTab();
  await field().fill(text);
  const n = sends.length;
  answer = true;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => sends.length > n, 15000, 'the send did not reach /api/learn/ask');
  answer = false;
  await pane().getByText(`Canned reply ${n + 1}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  return sends[n];
};
// The attached chips the composer shows, and the refs a body sends, as sourceId|range keys (chat-context.js refKey).
const rangeKey = range => JSON.stringify(range ?? null, range ? Object.keys(range).sort() : undefined);
const sentKeys = body => (body.context_refs || []).map(ref => `${ref.sourceId}|${rangeKey(ref.range)}`).sort();
const shownKeys = () => pane().locator('[data-chat-composer] [data-context-chip="ready"]').evaluateAll(els => els.map(el => el.getAttribute('data-ref-key')).sort());
const clickCard = async id => {
  const target = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
  await chatTab();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last().click({ position: { x: 12, y: 8 }, force: true });
  await settle();
};
const addToChat = async () => { await page.locator('[data-selection-bar]:visible').getByRole('button', { name: 'Add to chat', exact: true }).click(); await settle(); };
const clearSelection = async () => { await page.keyboard.press('Escape'); await settle(250); };
const quiet = (label, before) => assert.deepEqual(model.slice(before), [], `${label}: model request`);

await open();
await newChat();
await setMode('ask');

await check('code cards: Add to chat gives the uploaded card its stored text and the repository card its file, commit and lines; the sent refs are the pills', async () => {
  const before = model.length;
  await clickCard('up-code'); await addToChat();
  await clickCard('repo-code'); await addToChat();
  await clearSelection();
  const shown = await shownKeys();
  assert.deepEqual(shown, [`code:karpathy/minGPT@${COMMIT}:mingpt/model.py|${rangeKey({ path: 'mingpt/model.py', start: 27, end: 56 })}`, `upload:${ASSET}|null`].sort(), JSON.stringify(shown));
  const texts = await pane().locator('[data-chat-composer] [data-context-chip="ready"]').allInnerTexts();
  assert.ok(texts.some(t => /^utils\.py/.test(t.trim())) && texts.some(t => /^model\.py\s+L27-56/.test(t.trim())), `file names and lines on the pills: ${JSON.stringify(texts)}`);
  quiet('Add to chat', before);
  const body = await send('What do these do?');
  assert.deepEqual(sentKeys(body), shown, 'context_refs are exactly the pills');
  const up = body.context_refs.find(ref => ref.sourceId === `upload:${ASSET}`), repo = body.context_refs.find(ref => ref.kind === 'code');
  assert.equal(up.name, 'utils.py');
  assert.match(up.text || '', /def add\(a, b\):/, 'the uploaded card carries its stored code');
  assert.equal(repo.name, 'model.py');
  assert.equal(repo.version, COMMIT, 'the repository ref keeps its revision');
  assert.deepEqual(repo.range, { path: 'mingpt/model.py', start: 27, end: 56 }, 'and its selected lines');
});

await check('a group added to chat is one pinned pill; deselection drops only the temporary selection, never the pin', async () => {
  const before = model.length;
  await newChat();
  await clickCard('c-a'); await addToChat();
  await clickCard('repo-code');
  const pinned = await pane().locator('[data-chat-composer] [data-context-chip="ready"]').allInnerTexts();
  assert.ok(pinned.length === 1 && /^Pair\s+2 cards/.test(pinned[0].trim()), `the pinned group: ${JSON.stringify(pinned)}`);
  await clearSelection();
  assert.equal(await pane().locator('[data-chat-composer] [data-context-selection]').count(), 0, 'no temporary selection after a deselect');
  assert.equal(await pane().locator('[data-chat-composer] [data-context-chip="ready"]').count(), 1, 'the pinned group stays');
  quiet('group', before);
});

await check('Use in this chat: one toggle per row, synchronized with the composer pill and the refs sent; the canvas default is untouched', async () => {
  const before = model.length;
  await newChat();
  await openSources();
  const flag = (await serverDoc(LONG)).attached;
  assert.equal(await using(LONG), false, 'a new chat does not use a document the canvas has off');
  assert.match(await useToggle(LONG).innerText(), /^Use in this chat$/);
  await useToggle(LONG).click();
  await waitFor(() => using(LONG), 5000, 'the toggle did not turn on');
  await chatTab();
  assert.equal(await chipOf(LONG).count(), 1, 'its pill is in the composer');
  let body = await send('What does the long document say?');
  assert.ok(sentKeys(body).includes(`doc:${LONG.id}|null`), `the document rides: ${sentKeys(body)}`);
  assert.deepEqual(sentKeys(body), await shownKeys(), 'context_refs are exactly the pills');
  // x on the composer pill turns the row's toggle off: one state.
  await chipOf(LONG).getByRole('button', { name: /^Remove .* from this chat$/ }).click();
  await settle();
  await openSources();
  assert.equal(await using(LONG), false, 'the composer x turned the toggle off');
  body = await send('And now?');
  assert.ok(!sentKeys(body).includes(`doc:${LONG.id}|null`), 'the removed document does not ride');
  assert.equal((await serverDoc(LONG)).attached, flag, 'this chat never changed the canvas default');
  quiet('toggle', before - 0);
});

await check('the canvas default sits in More, says its scope, changes only new chats: this chat and a restored chat keep their own state', async () => {
  const before = model.length;
  await openSources();
  await row(SHORT).locator('[data-material-action="more"]').click();
  await action(SHORT, 'context').waitFor({ timeout: 5000 });
  assert.equal(await action(SHORT, 'context').getAttribute('aria-checked'), 'false');
  assert.match(await page.locator('[data-material-menu-note]').innerText(), /This chat is unchanged\./);
  await action(SHORT, 'context').click();
  await waitFor(async () => (await serverDoc(SHORT)).attached === true, 8000, 'the canvas default did not turn on');
  assert.equal(await using(SHORT), false, 'this chat does not start using it');
  await openChat(SAVED);
  await openSources();
  assert.equal(await using(SHORT), false, 'a restored chat keeps its own attachments');
  await newChat();
  await openSources();
  await waitFor(() => using(SHORT), 8000, 'a new chat does not start with the canvas default');
  await chatTab();
  assert.equal(await chipOf(SHORT).count(), 1, 'and shows its pill');
  // Back off for the canvas, from the keyboard: Enter on More focuses the item, Space toggles it.
  await openSources();
  await row(SHORT).locator('[data-material-action="more"]').focus();
  await page.keyboard.press('Enter');
  await waitFor(async () => action(SHORT, 'context').evaluate(el => el === document.activeElement).catch(() => false), 3000, 'the menu did not take the focus');
  await page.keyboard.press('Space');
  await waitFor(async () => (await serverDoc(SHORT)).attached === false, 8000, 'the canvas default did not turn off from the keyboard');
  assert.equal(await using(SHORT), true, 'turning the default off leaves this chat using it');
  quiet('canvas default', before);
});

await check('preview only: an open source this chat does not use says Not attached; using it removes the note', async () => {
  const before = model.length;
  await openSources();
  await row(LONG).locator('button[aria-expanded]').first().click();
  await waitFor(async () => (await row(LONG).locator('[data-not-attached]').count()) === 1, 8000, 'no Not attached on the preview');
  assert.equal((await row(LONG).locator('[data-not-attached]').innerText()).trim(), 'Not attached');
  await useToggle(LONG).click();
  await waitFor(async () => (await row(LONG).locator('[data-not-attached]').count()) === 0, 5000, 'Not attached stayed after using it');
  await useToggle(LONG).click();
  quiet('preview', before);
});

await check('expanded previews: a short one is content-sized, a long one scrolls inside a bounded box', async () => {
  await openSources();
  const sectionOf = doc => page.locator('[data-sources-pane] section', { has: page.locator(`[data-material-row][data-source-id="doc:${doc.id}"]`) });
  await row(SHORT).locator('button[aria-expanded]').first().click();
  await waitFor(async () => /One line of notes/.test(await sectionOf(SHORT).innerText()), 10000, 'the short preview did not open');
  const short = await sectionOf(SHORT).evaluate(el => el.getBoundingClientRect().height);
  assert.ok(short < 200, `the short preview is content-sized (${Math.round(short)} px)`);
  await row(LONG).locator('button[aria-expanded]').first().click();
  await waitFor(async () => /Line 1 of a long document/.test(await sectionOf(LONG).innerText()), 10000, 'the long preview did not open');
  const long = await sectionOf(LONG).evaluate(el => { const box = el.getBoundingClientRect(), view = el.querySelector('[data-source-text-view]'); return { h: box.height, vh: innerHeight, scrolls: !!view && view.scrollHeight > view.clientHeight + 10 }; });
  assert.ok(long.h <= long.vh * 0.7 + 1, `the long preview is bounded (${Math.round(long.h)} of ${long.vh} px)`);
  assert.ok(long.scrolls, 'and scrolls inside');
  await page.screenshot({ path: `${OUT}/01-previews-light.png` });
});

await check('shared actions: Add to canvas is the inverse Button (ink in light, light in dark), Upload stays blue, the removal icon is red; narrow panel fits', async () => {
  const seen = {};
  for (const [theme, width] of [['light', 480], ['dark', 480], ['dark', 320], ['light', 320]]) {
    await page.evaluate(([t, w]) => { localStorage.setItem('small.theme', t); localStorage.setItem('rh.companion.width', String(w)); }, [theme, width]);
    await open();
    await openSources();
    await page.mouse.move(5, 5); // at rest: a hovered button shows its hover fill
    await settle(200);
    // One probe per token: two text colours on one element would leave whichever the stylesheet orders last.
    const tokens = await page.evaluate(() => { const probe = (cls, prop) => { const el = document.createElement('span'); el.className = cls; document.body.append(el); const value = getComputedStyle(el)[prop]; el.remove(); return value; }; return { ink: probe('bg-ink', 'backgroundColor'), danger: probe('text-danger', 'color') }; });
    const add = await action(PDF, 'canvas').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, text: el.innerText.trim() }));
    assert.equal(add.text, 'Add to canvas');
    assert.equal(add.bg, tokens.ink, `${theme}: Add to canvas uses the ink fill (${add.bg}, ink ${tokens.ink})`);
    assert.equal(await action(PDF, 'remove').evaluate(el => getComputedStyle(el).color), tokens.danger, `${theme}: the removal icon is red`);
    // The --action-blue token: rgb(23, 108, 206) in light, its own dark-theme blue in dark.
    const blue = await page.evaluate(() => { const el = document.createElement('span'); el.style.backgroundColor = 'var(--action-blue)'; document.body.append(el); const value = getComputedStyle(el).backgroundColor; el.remove(); return value; });
    assert.equal(await page.locator('[data-materials-upload]').evaluate(el => getComputedStyle(el).backgroundColor), blue, `${theme}: Upload stays blue (${blue})`);
    if (theme === 'light') assert.equal(blue, 'rgb(23, 108, 206)');
    const fit = await sourcesPane().evaluate(el => { const box = el.getBoundingClientRect(); return { overflow: el.scrollWidth - el.clientWidth, outside: [...el.querySelectorAll('[data-material-action]')].filter(a => { const r = a.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }).length }; });
    assert.deepEqual(fit, { overflow: 0, outside: 0 }, `${theme} ${width}: the row actions fit`);
    seen[theme] = add.bg;
    await page.locator('aside[data-companion]').first().screenshot({ path: `${OUT}/02-rows-${theme}-${width}.png` });
  }
  assert.notEqual(seen.light, seen.dark, 'the ink fill flips with the theme (black in light, white in dark)');
  await page.evaluate(() => { localStorage.removeItem('small.theme'); localStorage.removeItem('rh.companion.width'); });
  // Removing context keeps its confirmation: it never deletes canvas cards, earlier messages or the stored file.
  await open();
  await openSources();
  await action(SHORT, 'remove').click();
  const confirm = page.getByRole('dialog', { name: 'Remove from Materials?' });
  await confirm.waitFor({ timeout: 5000 });
  assert.match(await confirm.innerText(), /Canvas cards and pages that use it keep working, earlier messages stay as they are, and the file is not deleted\./);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
});

await check('no model route was called outside the canned sends, and no page error', async () => {
  assert.deepEqual(model, [], `model-capable routes: ${model.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify({ canvas: canvas.name, documents: { short: SHORT.id, long: LONG.id, pdf: PDF.id }, results, sends: sends.map(b => ({ context_refs: (b.context_refs || []).map(r => ({ sourceId: r.sourceId, name: r.name, version: r.version, range: r.range, text: typeof r.text === 'string' ? r.text.length : null })) })) }, null, 2));
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `FAIL ${failed.length} of ${results.length}` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
