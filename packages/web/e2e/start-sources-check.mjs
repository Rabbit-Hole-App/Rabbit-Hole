// Start a rabbit hole with combined sources (owner brief 2026-10-23 and the integrator's binding decisions; docs/features/start-sources.md),
// against the LOCAL stack only: local D1 and R2, the real control plane and a fresh browser profile. The server answers context
// documents, file sources and boards for real; the nanoGPT repository is the shared stub (nanogpt-repository-fixture.mjs) with its
// D1 row and snapshot seeded for the run (as repo-canvas-cards-check does), so a repository project's context documents are the
// server's own. No model is ever called: /api/learn/ask is answered here with canned text and its request bodies CAPTURED, which is
// where "the context actually available to Chat" is read (context_refs and the context chips); every other model-capable route is
// aborted and counted. Webpage capture and arXiv search are answered here (no network).
// Flows: A a blank canvas imports nothing from the list; B files + a stored PDF + links on a new canvas, a .md stored once and
// copied into the context by the server, context-only and canvas-only links, a choice window cancelled and retried alone, the
// resulting cards AND the Chat context; C a partial failure, a reload and a retry that repeats nothing that worked; D an existing
// repository + files + a link + the overview card, files keeping their context beside the repository; E the list: an unsupported
// file says why, a source with neither option is left out and not stored, nothing is written while listing.
// Prints `ok <label>` or `FAIL <label> - <reason>` per check and `N/total passed`; exits 1 on any failure. Evidence: OUT/*.png.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 VARS=<cp .dev.vars> PERSIST=<stack persist dir>
//   D1_CONFIG=<app wrangler config> [WRANGLER_BIN=<wrangler.js>] [OUT=<dir>] node e2e/start-sources-check.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMIT, REPO, SNAPSHOT, content, routeRepository } from './nanogpt-repository-fixture.mjs';
import { heldResult } from './webpage-card-fixtures.mjs';
import { mockChatRoute } from './dev-cp.mjs';

const total = 6; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('start-sources-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || fileURLToPath(new URL('./shots/start-sources', import.meta.url));
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `startsrc-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } }); return { status: r.status, body: await r.json().catch(() => null) }; };
// An older local session service may not create handles; satisfy the same prerequisite as the real app.
if (!(await api('/api/profile')).body?.handle) assert.equal((await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `ss_${run}` }) })).status, 200, 'local handle setup');
const catalog = (await api('/api/apps')).body;

// ---------------------------------------------------------------- the project's row and snapshot in local D1 and R2 (as repo-canvas-cards-check)
const seedProject = () => {
  const where = `org='${catalog.org}' AND name='${REPO}'`, app = `SELECT id FROM repository_apps WHERE ${where}`;
  const sql = [`DELETE FROM repository_visibility WHERE app_id IN (${app})`, `DELETE FROM repository_versions WHERE app_id IN (${app})`, `DELETE FROM repository_apps WHERE ${where}`,
    `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${REPO}','${catalog.email}','karpathy/nanoGPT','master','${COMMIT}','ready')`,
    `INSERT INTO repository_versions(app_id,commit_sha,storage_key) ${app.replace('SELECT id', `SELECT id,'${COMMIT}','ss-fixture'`)}`,
    `INSERT INTO repository_visibility(app_id,visibility) ${app.replace('SELECT id', "SELECT id,'public'")}`,
    // The Main board a created project always has (repositories.js inserts it with the project); a file source needs it to exist.
    `DELETE FROM learn_boards WHERE org='${catalog.org}' AND owner_email='${catalog.email}' AND app='${REPO}' AND board='main'`,
    `INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_by, updated_at) VALUES ('ss-board-${run}', '${catalog.org}', '${catalog.email}', '${REPO}', 'main', json_object('strokes', json('[]'), 'shapes', json('[]'), 'items', json('[]'), 'links', json('[]'), 'blocks', json('[]'), 'groups', json('[]'), 'areas', json('[]'), 'exchanges', json('[]'), 'sources', json('[]')), 0, '${catalog.email}', '2026-10-23T00:00:00.000Z')`].join('; ');
  const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
  const cwd = fileURLToPath(new URL('../../../', import.meta.url)), stdio = ['ignore', 'ignore', 'inherit'];
  const wrangler = args => (process.env.WRANGLER_BIN
    ? execFileSync(process.execPath, [process.env.WRANGLER_BIN, ...args], { cwd, stdio, windowsHide: true })
    : execFileSync(`npx wrangler ${args.map(a => `"${a}"`).join(' ')}`, { cwd, shell: true, stdio }));
  wrangler(['d1', 'execute', 'rabbit-hole-learn-dev', '--local', '--persist-to', PERSIST, '--config', D1_CONFIG, '--command', sql]);
  const file = `${OUT}/ss-fixture.json`;
  writeFileSync(file, JSON.stringify({ ...SNAPSHOT, files: content }));
  wrangler(['r2', 'object', 'put', 'rabbit-hole-dev-repositories/ss-fixture', '--file', file, '--content-type', 'application/json', '--local', '--persist-to', PERSIST, '--config', D1_CONFIG]);
};
seedProject();

// ---------------------------------------------------------------- fixtures on disk (a path keeps its modified time, so choosing the same file again is the same file)
function makePdf(count) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let n = 1; n <= count; n++) {
    const stream = `BT /F1 48 Tf 60 396 Td (PAGE ${n}) Tj ET`;
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
const fixture = (name, data) => { const path = `${OUT}/${name}`; writeFileSync(path, data); return { path, name }; };
const F = {
  md: fixture(`notes-${run}.md`, '# Softmax\n\nweights add up to one\n'),
  md2: fixture(`more-${run}.md`, '# Cross entropy\n\nthe loss over shifted tokens\n'),
  txt: fixture(`plain-${run}.txt`, 'a plain text note for context only\n'),
  txt2: fixture(`late-${run}.txt`, 'a second note kept for context\n'),
  pdf: fixture(`paper-${run}.pdf`, makePdf(3)),
  py: fixture(`tool-${run}.py`, "print('hello from the start check')\n"),
  csv: fixture(`table-${run}.csv`, 'a,b\n1,2\n'),
  skip: fixture(`skipped-${run}.md`, '# Left out\n'),
};
const L = {
  both: `https://example.com/both-${run}`, context: `https://example.org/context-${run}`, arxiv: 'https://arxiv.org/abs/1706.03762',
  x: `https://example.com/x-${run}`, y: `https://example.org/y-${run}`, repoLink: `https://example.com/repo-${run}`,
};

// ---------------------------------------------------------------- routes: capture, canned answers, nothing else leaves
const captured = [], refused = [], outside = [], errors = [], requests = [];
let replies = 0, failLink = 0, capture = 'unavailable';
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/(ask|learn-course)$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== BASE) { if (method !== 'GET') outside.push(`${method} ${url.hostname}`); return route.abort(); }
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask' || /^\/api\/repositories\/[^/]+\/ask$/.test(path)) {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ body, reply, path });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `ss-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/webpages' && method === 'POST') return route.fulfill({ json: heldResult(capture, { reason: 'This page could not be captured.', url: body.url }) });
  if (path === '/api/learn/search' && url.searchParams.get('source') === 'arxiv') {
    return route.fulfill({ json: { exact: true, results: [{ key: '1706.03762', title: 'Attention Is All You Need', subtitle: 'arXiv:1706.03762', exact: true, thumbnail: null,
      item: { id: '1706.03762', title: 'Attention Is All You Need', authors: ['Vaswani'], pdfUrl: 'https://arxiv.org/pdf/1706.03762' } }] } });
  }
  if (path === '/api/learn/context/link' && failLink > 0) { failLink -= 1; return route.fulfill({ status: 502, json: { error: 'This link could not be read: the check made it fail' } }); }
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } });
  if (MODEL.test(path)) { refused.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await routeRepository(context); // the project's reads, registered first; the routes below run before it
await context.route('**/*', router);
await mockChatRoute(context); // the Chat's route decision, registered last so it wins (dev-cp.mjs); CI has no model key
context.on('request', request => {
  const url = new URL(request.url());
  if (url.origin !== BASE || request.method() === 'GET' || !url.pathname.startsWith('/api/')) return;
  const raw = request.postDataBuffer()?.toString('latin1') || '';
  const upload = /name="file"; filename="([^"]+)"/.exec(raw)?.[1];
  requests.push({ method: request.method(), path: url.pathname, file: upload || null, source: /name="source_id"/.test(raw) || null });
});
const count = (method, test) => requests.filter(r => r.method === method && test(r)).length;
const sinceCount = (mark, method, test) => requests.slice(mark).filter(r => r.method === method && test(r)).length;

const results = [];
let page = null;
const check = async (label, fn) => {
  try { page = await context.newPage(); page.on('pageerror', error => errors.push(error.message.slice(0, 160))); await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  } finally { await page.close().catch(() => {}); }
};
const waitFor = async (test, ms = 15000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(200); } };

// ---------------------------------------------------------------- the Start dialog and the page after it
const dialog = () => page.getByRole('dialog', { name: 'Start a rabbit hole', exact: true });
const rows = () => dialog().locator('[data-start-row]');
const rowOf = label => rows().filter({ hasText: label });
const option = (label, name) => rowOf(label).getByRole('checkbox', { name, exact: true });
const chip = () => page.locator('[data-start-chip]');
const draftGone = () => page.evaluate(() => !sessionStorage.getItem('small.start.draft'));
const openStart = async () => {
  await page.goto(`${BASE}/library?type=canvases`);
  await page.getByRole('button', { name: 'Start a rabbit hole' }).first().click();
  await dialog().waitFor({ timeout: 30000 });
};
const addFiles = async (...list) => { await dialog().locator('[data-start-file-input]').setInputFiles(list.map(f => f.path)); await rows().nth(0).waitFor({ timeout: 10000 }); };
const addLink = async (url, { context: ctx = true, canvas = true } = {}) => {
  await dialog().getByRole('button', { name: 'Add link', exact: true }).click();
  await dialog().getByPlaceholder('https://', { exact: true }).fill(url);
  await dialog().getByRole('button', { name: 'Add', exact: true }).click();
  const label = new URL(url).host === 'arxiv.org' ? 'arXiv 1706.03762' : url.replace(/^https?:\/\//, '');
  await rowOf(label).waitFor({ timeout: 5000 });
  if (!ctx) await option(label, 'Use as context').uncheck();
  if (!canvas) await option(label, 'Add to canvas').uncheck();
  return label;
};
const start = () => dialog().getByRole('button', { name: 'Start rabbit hole', exact: true }).click();
const slugNow = () => new URL(page.url()).pathname.replace(/^\/apps\//, '');
const boardKey = slug => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${slug}:ink`;
const blocks = slug => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || '{}').blocks || []; } catch { return []; } }, boardKey(slug));
const onCanvas = async slug => {
  await page.waitForURL(url => url.pathname === `/apps/${slug}`, { timeout: 60000 });
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
};
const contextDocs = async slug => (await api(`/api/learn/context?app=${slug}`)).body?.documents || [];
const names = async slug => (await contextDocs(slug)).map(d => d.name).sort();
// Chat: the question a learner sends carries the context the new chat starts with (docs switched on in the Context panel).
const pane = () => page.locator('[data-chat-pane]');
const send = async text => {
  const tab = page.locator('[data-panel-tab="chat"]');
  if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await pane().locator('[data-chat-composer] textarea').first().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000, 'no question was sent');
  return captured[n].body.context_refs || [];
};
const chipNames = () => pane().evaluate(() => [...document.querySelectorAll('[data-chat-pane] [data-context-chip] button[title^="Open "]')].map(b => b.title.slice(5)).sort());
const settledOk = (what) => waitFor(async () => (await draftGone()) && !(await chip().count()), 90000, `${what}: Start did not finish`);
const chipText = async () => (await chip().count() ? (await chip().innerText()).replace(/\s+/g, ' ') : '');

// ================================================================ A: blank
await check('A blank canvas: the list is not imported, one canvas opens empty, nothing is stored', async () => {
  const mark = requests.length;
  await openStart();
  await addFiles(F.md, F.pdf);
  await addLink(L.both);
  assert.equal(await dialog().getByRole('button', { name: 'Start with a blank canvas', exact: true }).isEnabled(), true);
  await dialog().getByRole('button', { name: 'Start with a blank canvas', exact: true }).click();
  await page.waitForURL(url => /^\/apps\/canvas-[a-f0-9]{8}$/.test(url.pathname), { timeout: 60000 });
  const slug = slugNow();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/canvases'), 1, 'exactly one canvas was created');
  assert.equal(sinceCount(mark, 'POST', r => /^\/api\/learn\/(context|files|webpages)/.test(r.path)) + sinceCount(mark, 'PUT', r => r.path.startsWith('/api/learn/files')), 0, 'blank imported nothing');
  assert.deepEqual(await names(slug), []);
  assert.deepEqual((await blocks(slug)).filter(b => b.type !== undefined).length, 0, 'no card on the blank canvas');
  assert.equal(await draftGone(), true, 'the list is gone once the canvas opened');
});

// ================================================================ B: files + a stored PDF + links on a new canvas
let slugB = null;
await check('B files, a stored PDF and links: one canvas; each source in the destinations asked; a .md sent once; the Chat context holds exactly the context sources', async () => {
  capture = 'unavailable';
  const mark = requests.length;
  await openStart();
  await addFiles(F.md, F.txt, F.pdf, F.py);
  await option(F.txt.name, 'Add to canvas').uncheck(); // context only
  assert.equal(await option(F.py.name, 'Use as context').isDisabled(), true, 'a .py has no context road');
  assert.match(await rowOf(F.py.name).innerText(), /Context takes PDF, text and Markdown files only/);
  const lBoth = await addLink(L.both);
  await addLink(L.context, { canvas: false }); // context only: no card, no page
  await addLink(L.arxiv, { context: false }); // canvas only
  assert.equal(await dialog().locator('[data-start-summary]').innerText(), '5 context sources, 5 canvas cards');
  assert.match(await rowOf(lBoth).innerText(), /Chat gets the name and address only/);
  await start();
  slugB = await page.waitForURL(url => /^\/apps\/canvas-[a-f0-9]{8}$/.test(url.pathname), { timeout: 60000 }).then(slugNow);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  // The .py opens the existing choice window; cancelling it adds no card and fails that row alone.
  const choice = page.locator('[data-file-import-dialog]');
  await choice.waitFor({ timeout: 60000 });
  assert.match(await choice.innerText(), new RegExp(F.py.name.replace('.', '[.]')));
  await choice.getByRole('button', { name: 'Cancel' }).click();
  // Two rows need another try: the cancelled window (no card), and the page whose capture the check made unavailable (its card stays).
  await waitFor(async () => /2 sources need another try/.test(await chipText()), 60000, 'the chip did not report the cancelled window and the unavailable page');
  assert.match(await chipText(), /tool-.*[.]py: No card was added/);
  assert.match(await chipText(), /both-.*: This page could not be captured/);
  // Cards: the .md from its one stored source, the PDF from its context document, the webpage and the paper from their links.
  const board = await waitFor(async () => { const b = await blocks(slugB); return b.some(x => x.type === 'paper') && b.some(x => x.type === 'webpage') && b.some(x => x.type === 'pdf') && b.some(x => x.type === 'file') ? b : null; }, 60000, 'the cards did not all land');
  assert.equal(board.filter(b => b.type === 'file' && b.kind === 'markdown').length, 1, 'one Markdown card');
  assert.ok(board.find(b => b.type === 'file').fileRef.source.id.startsWith('fs_'), 'the card reads a stored file source');
  assert.equal(board.filter(b => b.type === 'pdf' && String(b.assetKey).startsWith('doc:')).length, 1, 'one PDF card from the stored context document');
  assert.equal(board.filter(b => b.type === 'webpage').length, 1);
  assert.equal(board.filter(b => b.type === 'paper').length, 1);
  assert.equal(board.some(b => /plain-|context-/.test(JSON.stringify(b))), false, 'a context-only source has no card');
  // Context: five documents, each once; the .md was sent once and copied by the server; no card-only source reached it.
  const docs = await names(slugB);
  assert.equal(docs.length, 5, `context documents: ${docs.join(' | ')}`);
  for (const wanted of [F.md.name, F.txt.name, F.pdf.name]) assert.equal(docs.filter(d => d === wanted).length, 1, `${wanted} once`);
  assert.equal(docs.some(d => d.includes('both-') || d === 'example.com/both-' + run), true, 'the link note');
  assert.equal(docs.some(d => d.includes(F.py.name)), false);
  assert.equal(sinceCount(mark, 'PUT', r => r.path.startsWith('/api/learn/files/')), 1, 'the .md bytes were sent once');
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/learn/context' && r.file === F.md.name), 0, 'the .md was not uploaded a second time as a context file');
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/learn/context' && r.source === true), 1, 'the .md was copied into the context from its stored source');
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/learn/context/link'), 2, 'two link notes');
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/canvases'), 1);
  // What Chat can use: the context_refs of a question and the chips. The .py and the arXiv card are not in it.
  const refs = await send('What did I add?');
  const refNames = refs.filter(r => r.kind === 'doc').map(r => r.name).sort();
  assert.deepEqual(refNames, docs, 'the question carries every context document and nothing else');
  assert.deepEqual(await chipNames(), docs, 'the chips show the same');
  // Retry takes only the cancelled window again (the page's card is already on the canvas): nothing is sent or stored a second time.
  const before = requests.length;
  await chip().getByRole('button', { name: 'Retry' }).click();
  await choice.waitFor({ timeout: 30000 });
  await choice.locator('[data-import-choice="code"]').click();
  await choice.getByRole('button', { name: 'Add to canvas' }).click();
  await settledOk('B retry');
  assert.equal((await blocks(slugB)).filter(b => b.type === 'repo-code').length, 1, 'the Code card landed once');
  assert.equal(requests.slice(before).filter(r => /^\/api\/learn\/(context|files)/.test(r.path)).length, 0, 'the retry stored nothing again');
});

// ================================================================ C: partial failure, reload, retry
await check('C a link note that fails keeps the rest; a reload keeps the list; Retry does only the failed one, once, on the same canvas', async () => {
  const mark = requests.length;
  failLink = 1;
  await openStart();
  await addFiles(F.txt2);
  await option(F.txt2.name, 'Add to canvas').uncheck();
  const x = await addLink(L.x, { canvas: false }), y = await addLink(L.y, { canvas: false });
  await start();
  const slug = await page.waitForURL(url => /^\/apps\/canvas-[a-f0-9]{8}$/.test(url.pathname), { timeout: 60000 }).then(slugNow);
  await waitFor(async () => /1 source needs another try/.test(await chipText()), 60000, 'no failure was reported');
  assert.match(await chipText(), new RegExp(`${x.replace(/[.]/g, '[.]')}: This link could not be read`));
  assert.deepEqual((await names(slug)).filter(n => n.includes(run)).length, 2, 'the file and the other link are stored');
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await waitFor(async () => /1 source needs another try/.test(await chipText()), 30000, 'the chip did not come back after a reload');
  await chip().getByRole('button', { name: 'Retry' }).click();
  await settledOk('C retry');
  const docs = await names(slug);
  assert.equal(docs.filter(n => n.includes(run)).length, 3, `each source once: ${docs.join(' | ')}`);
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/learn/context/link'), 3, 'one failed, one worked, one retried');
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/learn/context' && r.file === F.txt2.name), 1, 'the file was stored once');
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/canvases'), 1, 'the retry used the same canvas');
  void y;
});

// ================================================================ D: an existing repository + files + a link + the overview
await check('D an existing repository, a .md that keeps its context beside it, a link and the overview card; the Chat context holds the document', async () => {
  const mark = requests.length;
  await openStart();
  await dialog().getByRole('button', { name: 'Connect repository', exact: true }).click();
  await dialog().getByPlaceholder('https://github.com/owner/repository').fill('https://github.com/karpathy/nanoGPT');
  await dialog().getByRole('button', { name: 'Check repository' }).click();
  await dialog().locator('[data-start-row="repository"]').waitFor({ timeout: 20000 });
  assert.equal(await dialog().getByRole('checkbox', { name: 'Connect repository as context', exact: true }).isChecked(), true);
  await addFiles(F.md2);
  assert.equal(await option(F.md2.name, 'Use as context').isEnabled(), true, 'being in a repository project does not disable file context');
  assert.equal(await option(F.md2.name, 'Use as context').isChecked(), true);
  await dialog().getByRole('checkbox', { name: 'Add overview to canvas', exact: true }).check();
  await addLink(L.repoLink, { canvas: false }); // a link note kept as context on the project, no card
  await start();
  await onCanvas(REPO);
  await settledOk('D');
  const board = await blocks(REPO);
  assert.equal(board.filter(b => b.type === 'repo-graph').length, 1, 'one overview card, never a card per file');
  assert.equal(board.find(b => b.type === 'repo-graph').scope, 'whole');
  assert.equal(board.filter(b => b.type === 'file' && b.kind === 'markdown').length, 1);
  const docs = await names(REPO);
  assert.ok(docs.includes(F.md2.name) && docs.some(d => d.includes(run)), `the repository project holds its context: ${docs.join(' | ')}`);
  assert.equal(sinceCount(mark, 'POST', r => r.path === '/api/repositories'), 0, 'a connected repository is opened, never connected twice');
  const refs = await send('Where is the loss?');
  assert.ok(refs.some(r => r.kind === 'doc' && r.name === F.md2.name), 'the question carries the document');
});

// ================================================================ E: the list
await check('E the list: an unsupported file says why, a source with neither option is left out and not stored', async () => {
  const mark = requests.length;
  await openStart();
  await addFiles(F.csv, F.skip, F.md);
  assert.equal(await option(F.csv.name, 'Use as context').isDisabled(), true);
  assert.match(await rowOf(F.csv.name).innerText(), /Context takes PDF, text and Markdown files only/);
  assert.equal(await option(F.csv.name, 'Add to canvas').isChecked(), true);
  await option(F.skip.name, 'Use as context').uncheck();
  await option(F.skip.name, 'Add to canvas').uncheck();
  assert.match(await rowOf(F.skip.name).innerText(), /Choose context, canvas, or both[.] This source will not be added[.]/);
  assert.match(await dialog().locator('[data-start-summary]').innerText(), /1 not added/);
  assert.equal(await dialog().getByRole('button', { name: 'Start rabbit hole', exact: true }).isEnabled(), true, 'the rest can start');
  assert.equal(sinceCount(mark, 'POST', r => /^\/api\/(canvases|learn\/(context|files))/.test(r.path)), 0, 'listing writes nothing');
  await option(F.md.name, 'Use as context').uncheck();
  await option(F.csv.name, 'Add to canvas').uncheck();
  await option(F.md.name, 'Add to canvas').uncheck();
  assert.equal(await dialog().getByRole('button', { name: 'Start rabbit hole', exact: true }).isDisabled(), true, 'nothing left to add');
});

// ================================================================ F: the page stayed clean
await check('F no page error, nothing outside the stack, and no model call', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  assert.deepEqual(refused, []);
});

await context.close();
await browser.close();
const passed = results.filter(r => r.ok).length;
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`${passed}/${total} checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
