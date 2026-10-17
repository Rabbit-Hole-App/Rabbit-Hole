// Actual-app, keyless Search acceptance. Local stack only; no product test hooks, fake canvas API or paid calls.
// BASE=<Vite/app origin> SMALL_CP=<local CP> VARS=<named dev-vars file> CANDIDATE_SHA=<served SHA>
// OUT=<evidence directory> node e2e/canvas-search-check.mjs
// BASE must proxy mutation Origin unchanged (Vite changeOrigin:false). This check never changes stack configuration.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:5441';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9093';
for (const origin of [BASE, CP]) assert.match(origin, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/, 'local stack only');
const OUT = resolve(process.env.OUT || 'e2e/shots/canvas-search'); mkdirSync(OUT, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || (process.env.VARS && readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Set TEST_BYPASS_SECRET or VARS; only the named variable is read');
const run = Date.now().toString(36), results = [], errors = [], modelAttempts = [], fixtureReads = [];
const facts = { candidate: process.env.CANDIDATE_SHA || 'not supplied; served candidate unverified', base: BASE, cp: CP, run, limitations: ['No OCR, whole-repository or unread-file content coverage is claimed.', 'Source-adapter browser permission/range coverage remains in public-code-cards and file-doc-cards checks.', 'Read-only shared-view Search is a separate required acceptance scenario.'] };
const MODEL = /^\/api\/(?:ask$|repositories\/[^/]+\/(?:ask|learn-course)$|learn\/(?:ask|selection|tutor(?:\/|$)|plan|artifact|assess|grade|home-ask|course|image|media(?:\/|$)|inline\/(?:generate|route)|journey|scene|transcribe|tts|voice\/|dive|explore))/;
let browser, context, page, session, canvas, saved, child, target, unavailable, thread, resolvedThread, large;
const request = async (path, method = 'GET', body, cookie = session, allowFailure = false) => {
  const response = await fetch(BASE + path, { method, headers: { cookie: `small_session=${cookie}`, 'content-type': 'application/json', origin: BASE }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!allowFailure) assert.ok(response.ok, `${method} ${path}: HTTP ${response.status}${data?.error ? ` (${data.error})` : ''}`);
  return allowFailure ? { status: response.status, data } : data;
};
const makeSession = async email => {
  const response = await fetch(CP + '/test/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) });
  const data = await response.json(); assert.ok(response.ok && data.session, 'local test session'); return data.session;
};
const empty = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks });
const card = (id, title, body, extra = {}) => ({ id, type: 'explanation', title, body, dx: 0, dy: 0, ...extra });
const panel = () => page.locator('[data-canvas-search]:visible');
const input = () => panel().getByRole('textbox', { name: 'Find text on canvas', exact: true });
const result = id => panel().locator(`[data-search-result="${id}"]`);
const activate = id => result(id).locator('[data-search-index]').click();
const filter = id => panel().locator(`[data-search-filter="${id}"]`).click();
const until = async (read, message, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await read()) return; await new Promise(done => setTimeout(done, 80)); } throw Error(message); };
const search = async (query, category = 'all') => { await filter(category); await input().fill(query); await until(async () => await input().inputValue() === query, 'query input did not update'); };
const count = async () => { const text = await panel().locator('[data-find-count]').innerText(); return Number((text.match(/of (\d+)/) || text.match(/^(\d+)/))?.[1]); };
const waitCount = value => until(async () => await count() === value, `expected ${value} results`);
const openFind = async () => { await page.getByRole('tab', { name: 'Find text on canvas', exact: true }).click(); await panel().waitFor(); };
const go = async name => { await page.goto(`${BASE}/apps/${name}`); await page.locator('[data-canvas-surface]').waitFor({ timeout: 60000 }); await openFind(); };
const camera = () => page.locator('[data-canvas-surface]').evaluate(surface => [...surface.children].find(element => /scale\(/.test(element.style.transform))?.style.transform || '');
const shot = name => page.screenshot({ path: resolve(OUT, `${name}.png`) });
const tests = [];
const check = (name, action) => tests.push({ name, action });

for (const category of ['all', 'cards', 'text', 'comments', 'references', 'code', 'rabbit-holes']) check(`empty query browses ${category}`, async () => {
  await search('', category);
  await until(async () => await count() > 0, `${category} should contain fixture objects`);
  assert.equal(await panel().locator(`[data-search-filter="${category}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await input().inputValue(), '');
});
check('literal case-insensitive code/path matching and one-object multiple-occurrence counts', async () => {
  await search('OPTIMIZER.STEP()', 'code'); await waitCount(1);
  assert.equal(await result('object:code').count(), 1); assert.match(await result('object:code').innerText(), /2 matches/);
  await search('/src/train.py', 'code'); await waitCount(1);
  await search('optimizer[step]', 'code'); await waitCount(0);
  assert.equal(await panel().getByRole('button', { name: 'Next match', exact: true }).isDisabled(), true);
  await search('matchword'); await waitCount(1);
  assert.match(await result('object:multi').innerText(), /3 matches/);
});
check('structured references qualify; URL prose and global context do not', async () => {
  await search('STRUCTURED_REFERENCE', 'references'); await waitCount(1);
  assert.equal(await result('object:reference').count(), 1);
  await search('https://example.invalid/prose', 'references'); await waitCount(0);
  await search('GLOBAL_CONTEXT_ONLY', 'references'); await waitCount(0);
  await search('https://example.invalid/prose', 'all'); await waitCount(1);
});
check('unavailable linked canvas hides its former title and disables opening', async () => {
  await search('UNAVAILABLE_PRIVATE_TITLE', 'all'); await waitCount(0);
  await search('', 'references');
  await result('object:unavailable-ref').waitFor();
  assert.equal(await result('object:unavailable-ref').getByRole('button', { name: 'Unavailable', exact: true }).isDisabled(), true);
});
check('reference main action focuses the card; source open is a separate action', async () => {
  await search('LINKED_TARGET_TITLE', 'references'); await waitCount(1);
  const url = page.url(); await activate('object:canvas-reference'); assert.equal(page.url(), url);
  assert.equal(await panel().isVisible(), true);
  const open = result('object:canvas-reference').getByRole('button', { name: /Open LINKED_TARGET_TITLE/ });
  assert.equal(await open.count(), 1);
  await open.click(); await page.waitForURL(new RegExp(`/apps/${target.name}`));
  await go(canvas.name);
});
check('actual child main action focuses parent; explicit Open enters existing child and resets scope', async () => {
  await search('EXISTING_CHILD_TITLE', 'rabbit-holes'); await waitCount(1);
  const before = page.url(); await activate('object:alpha'); assert.equal(page.url(), before);
  assert.equal(await input().inputValue(), 'EXISTING_CHILD_TITLE');
  await result('object:alpha').getByRole('button', { name: 'Open Rabbit Hole', exact: true }).click();
  await page.waitForURL(new RegExp(`/apps/${child.name}`)); await openFind();
  assert.equal(await input().inputValue(), '', 'new canvas must not inherit query');
  await search('CHILD_ONLY_BODY'); await waitCount(1);
  await go(canvas.name); await search('CHILD_ONLY_BODY'); await waitCount(0);
});
check('comments default open, Include resolved works, exact thread opens without resolving and Back preserves search', async () => {
  await search('commentword', 'comments'); await waitCount(1);
  await panel().getByLabel('Include resolved', { exact: true }).check(); await waitCount(2);
  await panel().getByLabel('Include resolved', { exact: true }).uncheck(); await waitCount(1);
  await activate(`comment:${thread.id}`);
  await page.locator(`[data-comment-thread-view="${thread.id}"]`).waitFor();
  assert.match(await page.locator('[data-comments-panel]').innerText(), /OPEN commentword/);
  const list = await request(`/api/learn/c/${saved.board_id}/threads?status=all`);
  assert.equal(list.threads.find(row => row.id === thread.id).status, 'open', 'opening cannot resolve');
  await page.locator('[data-search-return]').click();
  assert.equal(await input().inputValue(), 'commentword');
  assert.equal(await panel().locator('[data-search-filter="comments"]').getAttribute('aria-pressed'), 'true');
});
check('unauthorized identity cannot retrieve owner board or comment content', async () => {
  const other = await makeSession(`search-other-${run}@example.com`);
  const board = await request(`/api/learn/boards/${canvas.name}/main`, 'GET', undefined, other, true);
  const comments = await request(`/api/learn/c/${saved.board_id}/threads?status=all`, 'GET', undefined, other, true);
  assert.ok([403, 404].includes(board.status), `owner board refusal: ${board.status}`);
  assert.ok([403, 404].includes(comments.status), `owner comment refusal: ${comments.status}`);
  assert.doesNotMatch(JSON.stringify([board.data, comments.data]), /OPEN commentword|hidden document zebra/);
});
check('hidden BlockNote result reveals Editor and Back restores the pre-jump camera', async () => {
  await go(canvas.name); assert.equal(await page.locator('[data-canvas-doc]').count(), 0, 'Canvas is initial view');
  await search('hidden document zebra'); await waitCount(1); const before = await camera(); assert.ok(before);
  await activate('document:doc-p'); await page.locator('[data-doc-state="ready"]').waitFor({ timeout: 60000 });
  assert.equal(await panel().isVisible(), true); assert.equal(await input().inputValue(), 'hidden document zebra');
  assert.match(await page.locator('[data-canvas-doc]').innerText(), /hidden document zebra/);
  await panel().getByRole('button', { name: 'Back to previous view', exact: true }).click();
  await until(async () => await camera() === before, 'Back did not restore original camera');
});
check('live unsaved document text updates Search before the editor loses focus', async () => {
  await search('hidden document zebra'); await waitCount(1); await activate('document:doc-p');
  await search('DOC_UNSAVED_TOKEN'); await waitCount(0);
  const editor = page.locator('[data-canvas-doc] [contenteditable="true"]').first(); await editor.click();
  await page.keyboard.press('Control+End'); await page.keyboard.type(' DOC_UNSAVED_TOKEN');
  await waitCount(1); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-canvas-doc]')), true);
  assert.equal(await result('document:doc-p').count(), 1);
});
check('long-card text beyond its initial visible region matches and navigation preserves geometry', async () => {
  await search('NEEDLE_AT_BOTTOM'); await waitCount(1);
  const before = await request(`/api/learn/boards/${canvas.name}/main`);
  await activate('object:long');
  assert.equal(await panel().isVisible(), true); assert.equal(await input().inputValue(), 'NEEDLE_AT_BOTTOM');
  const zoom = Number((await camera()).match(/scale\(([^)]+)\)/)?.[1]); assert.ok(zoom >= .6 && zoom <= 1, `comfortable zoom ${zoom}`);
  const after = await request(`/api/learn/boards/${canvas.name}/main`);
  const geometry = value => { const b = value.state.blocks.find(block => block.id === 'long'); return [b.dx, b.dy, b.w, b.h]; };
  assert.deepEqual(geometry(after), geometry(before));
  facts.longCard = { zoom, matchHighlight: await page.evaluate(() => !!globalThis.CSS?.highlights?.get('canvas-search-match')) };
  assert.equal(facts.longCard.matchHighlight, true, 'rendered long-card match receives temporary highlight');
});
check('unsaved standalone text edits reindex immediately; deleting the object removes its result', async () => {
  await search('standalone zebra'); await waitCount(1); await activate('object:text');
  await search('LIVE_UNSAVED_TOKEN'); await waitCount(0);
  const item = page.locator('[data-item-id="text"]'); await item.dblclick();
  await page.locator('[data-rich-editor]').waitFor(); await page.keyboard.press('Control+a'); await page.keyboard.type('LIVE_UNSAVED_TOKEN');
  await waitCount(1); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-rich-editor]')), true);
  await page.keyboard.press('Escape'); await page.keyboard.press('Delete'); await waitCount(0);
});
check('keyboard result focus and activation never sends Chat; panel close/reopen retains query/filter', async () => {
  await search('optimizer.step()', 'code'); await waitCount(1);
  await input().press('ArrowDown'); await until(() => page.evaluate(() => document.activeElement?.hasAttribute('data-search-index')), 'ArrowDown did not focus a result');
  await page.keyboard.press('Enter'); assert.equal(await panel().isVisible(), true);
  await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();
  await page.locator('[data-canvas-surface]').click({ position: { x: 20, y: 20 } }); await page.keyboard.press('/');
  await panel().waitFor(); assert.equal(await input().inputValue(), 'optimizer.step()');
  assert.equal(await panel().locator('[data-search-filter="code"]').getAttribute('aria-pressed'), 'true');
});
check('large browse virtualizes results, keyboard reaches the last object, drag resizing remains responsive', async () => {
  await go(large.name); await search('', 'cards'); await waitCount(320);
  const mounted = await panel().locator('[data-search-result]').count(); assert.ok(mounted < 40, `only viewport results mount (${mounted})`);
  assert.equal(await panel().locator('iframe,video,canvas').count(), 0, 'results do not mount full renderers');
  await input().press('ArrowDown'); await page.keyboard.press('End');
  await until(() => page.evaluate(() => document.activeElement?.getAttribute('data-find-match') === 'bulk-319'), 'End did not focus last virtual result');
  const separator = page.getByRole('separator', { name: 'Resize Learn panel', exact: true }); const before = await separator.boundingBox();
  await page.mouse.move(before.x + 2, before.y + 100); await page.mouse.down(); await page.mouse.move(before.x + 250, before.y + 100, { steps: 12 }); await page.mouse.up();
  await until(async () => Number(await separator.getAttribute('aria-valuenow')) <= 330, 'panel did not narrow');
  await panel().locator('[data-search-scroll]').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
  const first = await result('object:bulk-0').boundingBox(), second = await result('object:bulk-1').boundingBox(); assert.ok(second.y > first.y, 'narrow panel uses one column');
  await separator.focus(); await page.keyboard.press('ArrowLeft'); assert.ok(Number(await separator.getAttribute('aria-valuenow')) > 320, 'keyboard resizing remains available');
  await shot('large-narrow'); facts.large = { total: 320, mounted };
});

try {
  session = await makeSession(`search-${run}@example.com`);
  await request('/api/profile', 'PUT', { handle: `search_${run}` });
  canvas = await request('/api/canvases', 'POST', { title: `Search acceptance ${run}` });
  target = await request('/api/canvases', 'POST', { title: 'LINKED_TARGET_TITLE' });
  const targetBoard = await request(`/api/learn/boards/${target.name}/main`, 'PUT', { state: empty([card('target-card', 'Target', 'target body')]) });
  unavailable = await request('/api/canvases', 'POST', { title: 'UNAVAILABLE_PRIVATE_TITLE' });
  const unavailableBoard = await request(`/api/learn/boards/${unavailable.name}/main`, 'PUT', { state: empty([card('gone-card', 'Gone', 'gone body')]) });
  const state = empty([
    card('alpha', 'Alpha attention', 'attention optimizer body'), card('multi', 'matchword', 'matchword and matchword'),
    card('long', 'Long card', Array.from({ length: 80 }, (_, i) => `Paragraph ${i} ${i === 70 ? 'NEEDLE_AT_BOTTOM' : 'ordinary text'}`).join('\n\n'), { w: 560, h: 320 }),
    { id: 'code', type: 'snippet', title: 'Code example', code: 'optimizer.step()\noptimizer.step()\n/src/train.py', language: 'python', dx: 0, dy: 0 },
    card('reference', 'Referenced card', 'body', { sources: [{ kind: 'web', title: 'STRUCTURED_REFERENCE', url: 'https://example.invalid/source' }] }),
    card('prose', 'Prose only', 'https://example.invalid/prose'),
    { id: 'canvas-reference', type: 'canvas-ref', target: targetBoard.board_id, dx: 0, dy: 0 },
    { id: 'unavailable-ref', type: 'canvas-ref', target: unavailableBoard.board_id, dx: 0, dy: 0 },
  ]);
  state.items = [{ id: 'text', kind: 'text', x: 1100, y: 700, w: 300, text: 'standalone zebra', size: 24, color: '#37352f', opacity: 1 }];
  state.shapes = [{ id: 'shape', kind: 'rect', x1: 1000, y1: 100, x2: 1200, y2: 200, text: 'shape zebra', color: '#37352f' }];
  state.sources = [{ id: 'web:global', kind: 'web', label: 'GLOBAL_CONTEXT_ONLY', attached: true }];
  state.doc = { v: 1, x: 1800, y: 200, w: 800, blocks: [{ id: 'doc-p', type: 'paragraph', content: [{ type: 'text', text: 'hidden document zebra', styles: {} }], children: [] }] };
  saved = await request(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state });
  await request(`/api/canvases/${unavailable.name}`, 'DELETE'); // Only the newly created fixture, to prove unavailable metadata.
  child = await request('/api/canvases/dives', 'POST', { name: `canvas-${randomUUID().replaceAll('-', '').slice(0, 8)}`, title: 'EXISTING_CHILD_TITLE', parent: { app: canvas.name, board: 'main' }, origin_block_id: 'alpha', dive: {} });
  await request(`/api/learn/boards/${child.name}/main`, 'PUT', { state: empty([card('child-body', 'Child', 'CHILD_ONLY_BODY')]) });
  const anchor = { kind: 'object', object_id: 'alpha', object_kind: 'block', dx: 0, dy: 0, label: 'Alpha attention' };
  thread = (await request(`/api/learn/c/${saved.board_id}/threads`, 'POST', { id: randomUUID(), anchor, body: 'OPEN commentword', mentions: [] })).thread;
  resolvedThread = (await request(`/api/learn/c/${saved.board_id}/threads`, 'POST', { id: randomUUID(), anchor, body: 'RESOLVED commentword', mentions: [] })).thread;
  await request(`/api/learn/c/${saved.board_id}/threads/${resolvedThread.id}/resolve`, 'POST', {});
  large = await request('/api/canvases', 'POST', { title: `Search large ${run}` });
  await request(`/api/learn/boards/${large.name}/main`, 'PUT', { state: empty(Array.from({ length: 320 }, (_, i) => card(`bulk-${i}`, `Bulk ${i}`, `Large browse item ${i}`))) });
  facts.canvases = { main: canvas.name, child: child.name, large: large.name, target: target.name };
  browser = await chromium.launch(); context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE && url.origin !== CP && !['data:', 'blob:'].includes(url.protocol)) return route.abort();
    if (url.pathname === '/api/learn/tutor/next-steps' || url.pathname === '/api/learn/next-steps') { fixtureReads.push('next-steps'); return route.fulfill({ json: { set_id: `search-${run}`, generated_at: new Date().toISOString(), options: [], suggestions: [], fingerprint: null } }); }
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue();
    if (MODEL.test(url.pathname)) { modelAttempts.push(`${route.request().method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => errors.push(error.message)); await go(canvas.name);
  for (const { name, action } of tests) {
    const began = performance.now();
    try { await action(); results.push({ name, status: 'passed', ms: Math.round(performance.now() - began) }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: 'failed', error: error.message, ms: Math.round(performance.now() - began) }); throw error; }
  }
  assert.equal(errors.length, 0, errors.join('\n')); assert.equal(modelAttempts.length, 0, modelAttempts.join('\n'));
  await shot('complete');
} catch (error) {
  facts.error = error.stack; process.exitCode = 1; console.error(`FAIL ${error.message}`);
  if (page) await shot('failure').catch(() => {});
} finally {
  const counts = { passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length, skipped: 0, interrupted: tests.length - results.length };
  if (facts.error && !counts.failed) facts.setupOrFinalGuardFailure = true;
  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ ...facts, counts, results, errors, modelAttempts, fixtureReads }, null, 2));
  console.log(JSON.stringify(counts)); await browser?.close();
}
