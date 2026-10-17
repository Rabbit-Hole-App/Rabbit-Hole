// Keyless actual-app Search through the normal CSV/DOCX drop path. No parsed text or source routes are stubbed.
// BASE=<local app> SMALL_CP=<local CP> VARS=<dev vars> CANDIDATE_SHA=<served SHA/dirt> OUT=<evidence> node e2e/canvas-search-files-check.mjs
import { chromium } from '@playwright/test';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'three/addons/libs/fflate.module.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:5441', CP = process.env.SMALL_CP || 'http://127.0.0.1:9093';
for (const value of [BASE, CP]) assert.match(value, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/, 'local stack only');
const OUT = resolve(process.env.OUT || 'e2e/shots/canvas-search-files'); mkdirSync(OUT, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || (process.env.VARS && readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Provide TEST_BYPASS_SECRET or VARS (only that named variable is read)');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const CSV_TOKEN = 'SEARCH_CSV_DEEP_NEEDLE', DOCX_TOKEN = 'SEARCH_DOCX_DEEP_NEEDLE';
const csv = Buffer.from(['row,description,value', ...Array.from({ length: 500 }, (_, i) => `${i + 1},${i === 449 ? CSV_TOKEN : `ordinary row ${i + 1}`},${i * 7}`)].join('\n'));
// Extend the checked-in DOCX, preserving its real package relationships/styles/images. No parsing result is invented.
const archive = unzipSync(readFileSync(new URL('../test/fixtures/file-imports/document.docx', import.meta.url)));
let xml = strFromU8(archive['word/document.xml']);
const paragraphs = Array.from({ length: 150 }, (_, i) => `<w:p><w:r><w:t>${i === 144 ? DOCX_TOKEN : `Search acceptance paragraph ${i + 1}: ordinary document content.`}</w:t></w:r></w:p>`).join('');
assert.ok(xml.includes('</w:body>'), 'real fixture DOCX body');
xml = xml.includes('<w:sectPr') ? xml.replace('<w:sectPr', `${paragraphs}<w:sectPr`) : xml.replace('</w:body>', `${paragraphs}</w:body>`);
archive['word/document.xml'] = strToU8(xml);
const docx = Buffer.from(zipSync(Object.fromEntries(Object.entries(archive).map(([name, bytes]) => [name, [bytes, { mtime: new Date('2000-01-01T00:00:00Z') }]]))));
writeFileSync(resolve(OUT, 'search-deep.csv'), csv); writeFileSync(resolve(OUT, 'search-deep.docx'), docx);
const files = [{ name: 'search-deep.csv', type: 'text/csv', bytes: csv, token: CSV_TOKEN, kind: 'table' }, { name: 'search-deep.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: docx, token: DOCX_TOKEN, kind: 'document' }];
const run = Date.now().toString(36), results = [], errors = [], models = [], traffic = [];
const facts = { candidate: process.env.CANDIDATE_SHA || 'served candidate not supplied', base: BASE, run, fixtures: files.map(({ name, bytes }) => ({ name, bytes: bytes.length, sha256: sha(bytes) })), coverage: 'Already-parsed CSV rows and DOCX body text only; no OCR or new source reads initiated by Search.' };
let browser, context, page, session, canvas, phase = 'initial', cards = [];
const until = async (read, message, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await read()) return; await new Promise(done => setTimeout(done, 100)); } throw Error(message); };
const api = async (path, method = 'GET', body) => {
  const response = await fetch(BASE + path, { method, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null); assert.ok(response.ok, `${method} ${path}: ${response.status}${data?.error ? ` (${data.error})` : ''}`); return data;
};
const MODEL = /^\/api\/(?:ask$|repositories\/[^/]+\/(?:ask|learn-course)$|learn\/(?:ask|selection|tutor(?:\/|$)|plan|artifact|assess|grade|home-ask|course|image|media(?:\/|$)|inline\/(?:generate|route)|journey|scene|transcribe|tts|voice\/|dive|explore))/;
async function openFresh() {
  context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== BASE && url.origin !== CP && !['blob:', 'data:'].includes(url.protocol)) return route.abort();
    if (url.pathname === '/api/learn/tutor/next-steps' || url.pathname === '/api/learn/next-steps') return route.fulfill({ json: { set_id: `search-files-${run}`, generated_at: new Date().toISOString(), options: [] } });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && MODEL.test(url.pathname)) { models.push(`${req.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  context.on('request', request => {
    const path = new URL(request.url()).pathname, method = request.method();
    if (/^\/api\/learn\/files(?:\/|$)/.test(path)) traffic.push({ phase, method, path });
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => errors.push(error.message)); await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-canvas-surface]').waitFor();
}
async function drop(file) {
  const surface = page.locator('[data-canvas-surface]'), box = await surface.boundingBox();
  await surface.evaluate((element, { name, type, b64, x, y }) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type }));
    const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
    element.dispatchEvent(new DragEvent('dragover', init)); element.dispatchEvent(new DragEvent('drop', init));
  }, { name: file.name, type: file.type, b64: file.bytes.toString('base64'), x: box.x + box.width / 2, y: box.y + box.height / 2 });
}
const panel = () => page.locator('[data-canvas-search]:visible');
async function searchSource(file, block) {
  await page.getByRole('tab', { name: 'Find text on canvas', exact: true }).click();
  await panel().locator('[data-search-filter="all"]').click();
  await panel().getByRole('textbox', { name: 'Find text on canvas', exact: true }).fill(file.token);
  const result = panel().locator(`[data-search-result="object:${block.id}"]`);
  await result.waitFor({ timeout: 30000 });
  await until(async () => /^1 result$/.test(await panel().locator('[data-find-count]').innerText()), 'expected exactly one source-content result');
  assert.match(await result.innerText(), /Source text/, 'source body must be identified separately from visible card text');
  assert.match(await result.locator('mark').innerText(), new RegExp(file.token));
  return result;
}
const tests = [
  ['normal drop imports real CSV/DOCX once and saves only source references', async () => {
    for (const file of files) { await drop(file); await page.locator(`[data-file-doc-card="${file.kind}"]`).waitFor(); }
    await until(async () => {
      const state = (await api(`/api/learn/boards/${canvas.name}/main`)).state;
      cards = state?.blocks?.filter(block => files.some(file => file.name === block.label)) || [];
      return cards.length === 2 && cards.every(block => block.fileRef?.source?.id && block.fileRef?.source?.rev && ['extracted', 'partial'].includes(block.fileRef?.status?.context));
    }, 'two source-backed cards and their existing text extraction were not saved');
    for (const file of files) {
      const block = cards.find(card => card.label === file.name); assert.equal(block.fileRef.source.rev, sha(file.bytes));
      assert.equal(block.type, 'file'); assert.equal(block.kind, file.kind);
    }
    const state = (await api(`/api/learn/boards/${canvas.name}/main`)).state;
    assert.doesNotMatch(JSON.stringify(state), new RegExp(`${CSV_TOKEN}|${DOCX_TOKEN}`), 'parsed source text must not be persisted in the board');
    const creates = traffic.filter(row => row.method === 'POST' && row.path === '/api/learn/files');
    const originals = traffic.filter(row => row.method === 'PUT' && /^\/api\/learn\/files\/fs_[^/]+$/.test(row.path));
    assert.equal(creates.length, 2, 'one create per original'); assert.equal(originals.length, 2, 'one byte upload per original');
    facts.sources = cards.map(block => ({ id: block.id, name: block.label, source: block.fileRef.source }));
  }],
  ['CSV row450 is searchable beyond the rendered viewport and is labeled Source text', async () => {
    const file = files[0], block = cards.find(card => card.label === file.name);
    const table = page.locator(`[data-block-id="${block.id}"] [data-file-doc-table]`); await table.waitFor();
    assert.doesNotMatch(await table.innerText(), new RegExp(CSV_TOKEN), 'deep row should not be mounted in initial virtual table viewport');
    const beforeReads = traffic.length; await searchSource(file, block);
    facts.csv = { deepRow: 450, initialDOMContainsToken: false, searchTraffic: traffic.slice(beforeReads) };
    assert.equal(traffic.slice(beforeReads).some(row => row.method === 'GET' && /^\/api\/learn\/files\/fs_[^/]+$/.test(row.path)), false, 'Search must reuse already-loaded original');
    await page.screenshot({ path: resolve(OUT, 'csv-source-match.png') });
  }],
  ['DOCX paragraph145 is searchable below its visible card region and is labeled Source text', async () => {
    const file = files[1], block = cards.find(card => card.label === file.name);
    const document = page.locator(`[data-block-id="${block.id}"] [data-file-doc-document]`); await document.waitFor();
    const deep = document.getByText(DOCX_TOKEN, { exact: true }); await deep.waitFor({ state: 'attached' });
    const position = await deep.evaluate(element => { const parent = element.closest('[data-file-doc-document]'); const box = element.getBoundingClientRect(), visible = parent.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, visibleTop: visible.top, visibleBottom: visible.bottom, scrollTop: parent.scrollTop }; });
    assert.ok(position.top >= position.visibleBottom, 'deep paragraph starts beyond initial visible document region');
    await searchSource(file, block); facts.docx = { paragraph: 145, beforeSearch: position };
    await page.screenshot({ path: resolve(OUT, 'docx-source-match.png') });
  }],
  ['fresh-browser reload rereads saved originals, restores both deep matches, and uploads nothing', async () => {
    await context.close(); phase = 'reload'; await openFresh();
    for (const file of files) await searchSource(file, cards.find(card => card.label === file.name));
    const next = (await api(`/api/learn/boards/${canvas.name}/main`)).state.blocks.filter(block => files.some(file => file.name === block.label));
    assert.equal(next.length, 2); assert.deepEqual(next.map(block => block.fileRef.source).sort((a, b) => a.id.localeCompare(b.id)), cards.map(block => block.fileRef.source).sort((a, b) => a.id.localeCompare(b.id)));
    const reload = traffic.filter(row => row.phase === 'reload');
    for (const block of cards) assert.ok(reload.some(row => row.method === 'GET' && row.path === `/api/learn/files/${block.fileRef.source.id}`), 'fresh profile must read original through authorized source route');
    assert.equal(reload.filter(row => row.method === 'POST' && row.path === '/api/learn/files' || row.method === 'PUT' && /^\/api\/learn\/files\/fs_[^/]+$/.test(row.path)).length, 0, 'reload may not create or upload originals');
    assert.equal(errors.length, 0, errors.join('\n')); assert.equal(models.length, 0, models.join('\n'));
    await page.screenshot({ path: resolve(OUT, 'fresh-reload.png') });
  }],
];
try {
  const response = await fetch(CP + '/test/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `search-files-${run}@example.com`, secret }) });
  session = (await response.json()).session; assert.ok(session, 'local test session');
  await api('/api/profile', 'PUT', { handle: `sfiles_${run}` });
  canvas = await api('/api/canvases', 'POST', { title: `Search files ${run}` }); facts.canvas = canvas.name;
  await api(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state: { blocks: [], items: [], shapes: [], links: [], strokes: [], groups: [], areas: [], exchanges: [] } });
  browser = await chromium.launch(); await openFresh();
  for (const [name, action] of tests) {
    const start = performance.now();
    try { await action(); results.push({ name, status: 'passed', ms: Math.round(performance.now() - start) }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: 'failed', error: error.message, ms: Math.round(performance.now() - start) }); throw error; }
  }
} catch (error) {
  facts.error = error.stack; process.exitCode = 1; console.error(`FAIL ${error.message}`);
  if (page) await page.screenshot({ path: resolve(OUT, 'failure.png') }).catch(() => {});
} finally {
  const counts = { passed: results.filter(row => row.status === 'passed').length, failed: results.filter(row => row.status === 'failed').length, skipped: 0, interrupted: tests.length - results.length };
  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ ...facts, counts, results, errors, models, traffic }, null, 2));
  console.log(JSON.stringify(counts)); await browser?.close();
}
