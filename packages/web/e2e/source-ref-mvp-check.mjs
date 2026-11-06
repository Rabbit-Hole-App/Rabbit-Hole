// Source passage references, the MVP smoke (Tutor release R3; docs/features/source-refs.md), against the LOCAL stack only, with no model
// call: the status route is a fake in this browser (as whiteboard-mvp-check.mjs). The board is seeded with a stored Markdown file card and
// four explanation cards made from it: one current, one whose reference names an older revision, one whose source is gone, and one that
// came from a share (a label with no id).
// Covers: each card's source line and its status word (current: View passage; changed and not available: the status, no View passage;
// a shared label: only where it came from); View passage on the current card moves to the file card and emphasizes the quoted sentence
// for a moment, then clears it; clicking the sentence in the file offers View explanation, which selects the explanation card; the
// changed card is never found by position or text; the same after a reload from the saved board; no model request, no page error.
// Needs the R3 wiring in AdaptiveCanvas (the source line under a card and the published blocks): hand-back patch.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/source-ref-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('source-ref-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'source-ref-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 5; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `srcref-mvp-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Source ref MVP ${run}` }) });

const SENTENCE = 'The loss is the mean squared error.';
const MD = `# Notes\n\nSome opening words.\n\n${SENTENCE}\n\nThen a closing paragraph.\n`;
const REV = 'a'.repeat(64), OLD = 'b'.repeat(64), FILE_ID = `fs_${'1'.repeat(24)}`, GONE_ID = `fs_${'2'.repeat(24)}`;
const ids = { current: `sref_${'1'.repeat(24)}`, changed: `sref_${'2'.repeat(24)}`, missing: `sref_${'3'.repeat(24)}` };
const quote = { exact: SENTENCE, prefix: 'Some opening words.\n\n', suffix: '\n\nThen a closing' };
const ref = (id, key, rev, name) => ({ v: 1, id, kind: 'markdown', source: { key, rev, name, home: null }, anchor: { quote } });
const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [], asked = [];
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};

const router = async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
  if (path === `/api/learn/files/${FILE_ID}` && method === 'GET') return route.fulfill({ status: 200, contentType: 'text/markdown', body: MD });
  if (path === '/api/learn/pdf-highlights' && method === 'GET') return route.fulfill({ json: { sha256: REV, highlights: [], changed: 0 } });
  if (path === '/api/learn/source-refs/resolve' && method === 'POST') {
    const body = request.postDataJSON();
    asked.push(body.ids);
    const status = { [ids.current]: 'current', [ids.changed]: 'changed', [ids.missing]: 'missing' };
    return route.fulfill({ json: { refs: body.ids.map(id => ({ id, status: status[id] || 'unavailable', rev: status[id] === 'missing' ? null : REV })) } });
  }
  if (path === '/api/learn/chat/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (MODEL.test(path) && method !== 'GET') { stray.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

const explanation = (id, title, sourceRef, dy) => ({ id, type: 'explanation', title, body: `${title} explains the loss.`, dx: 0, dy, ...(sourceRef ? { sourceRef } : {}) });
const state = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [],
  blocks: [
    { id: 'repeat.md', type: 'file', kind: 'markdown', format: 'md', label: 'repeat.md', dx: 0, dy: 0, size: MD.length,
      fileRef: { v: 1, source: { id: FILE_ID, rev: REV }, family: 'markdown', meta: { name: 'repeat.md', title: 'repeat.md' }, view: {}, derivatives: [] } },
    explanation('exp-current', 'Current', ref(ids.current, `file:${FILE_ID}`, REV, 'repeat.md'), 700),
    explanation('exp-changed', 'Changed', ref(ids.changed, `file:${FILE_ID}`, OLD, 'repeat.md'), 1100),
    explanation('exp-missing', 'Missing', ref(ids.missing, `file:${GONE_ID}`, REV, 'gone.md'), 1500),
    explanation('exp-shared', 'Shared', { v: 1, kind: 'markdown', source: { name: 'repeat.md' } }, 1900),
  ] };
const saved = await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state, version: 0 }) });
assert.ok(saved.board_id || saved.version !== undefined, 'the seeded board was saved');

const browser = await chromium.launch();
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  current = page;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
  await page.locator('[data-block-id="repeat.md"] [data-file-doc-md]').first().waitFor({ timeout: 60000 });
  return { context, page };
};
const chip = (page, id) => page.locator(`[data-block-id="${id}"] [data-source-ref]`);
// The sentences the browser's highlight registry paints in the Markdown card right now.
const painted = page => page.evaluate(() => {
  const root = document.querySelector('[data-block-id="repeat.md"] [data-file-doc-md]');
  return [...(CSS.highlights.get('wiki-highlight') || [])].filter(range => root.contains(range.commonAncestorContainer)).map(String);
});
const clickSentence = page => page.evaluate(sentence => {
  const root = document.querySelector('[data-block-id="repeat.md"] [data-file-doc-md]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.includes(sentence)) {
    const range = document.createRange(); range.setStart(node, node.data.indexOf(sentence) + 4); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    root.closest('[data-file-doc-text]').click(); return true;
  }
  return false;
}, SENTENCE);

const checks = async (page, label) => {
  await step(`${label}: each card says where it came from, and its status word when the source is not the one it was made from`, async () => {
    for (const id of ['exp-current', 'exp-changed', 'exp-missing', 'exp-shared']) await chip(page, id).waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    assert.match(await chip(page, 'exp-current').innerText(), /From repeat\.md/);
    assert.equal(await chip(page, 'exp-current').getAttribute('data-source-ref-status'), 'current');
    assert.match(await chip(page, 'exp-changed').locator('[data-source-ref-note]').innerText(), /Source changed/);
    assert.match(await chip(page, 'exp-missing').locator('[data-source-ref-note]').innerText(), /Source not available/);
    assert.equal(await chip(page, 'exp-shared').locator('[data-source-ref-note], [data-source-ref-open]').count(), 0, 'a shared label says nothing more and opens nothing');
    assert.equal(await chip(page, 'exp-changed').locator('[data-source-ref-open]').count() + await chip(page, 'exp-missing').locator('[data-source-ref-open]').count(), 0, 'a changed or missing source is never opened');
    assert.ok(asked.flat().includes(ids.current) && !asked.flat().includes(undefined), 'the status of a card with an id is asked; a label is never asked about');
  });
  await step(`${label}: View passage moves to the file card and emphasizes the quoted sentence for a moment`, async () => {
    await chip(page, 'exp-current').locator('[data-source-ref-open]').click();
    await until(async () => (await painted(page)).includes(SENTENCE), 'the sentence emphasized');
    await page.screenshot({ path: `${SHOTS}/${label}-passage.png` });
    await until(async () => (await painted(page)).length === 0, 'the emphasis cleared', 6000);
  });
  await step(`${label}: clicking the sentence offers View explanation, which selects the explanation card`, async () => {
    assert.equal(await clickSentence(page), true);
    const item = page.locator('[data-block-id="repeat.md"] [data-file-doc-view-explanation]');
    await item.waitFor();
    assert.deepEqual(await painted(page), [SENTENCE], 'the passage is shown while the menu is open');
    await item.click();
    await page.locator('[data-selected-card="exp-current"]').first().waitFor({ timeout: 10000 }); // the composer's chip for the selected card
  });
};

try {
  let { context, page } = await open();
  await checks(page, 'first load');
  await step('a reload from the saved board gives the same statuses and navigation, with a fresh status read', async () => {
    await context.close();
    asked.length = 0;
    ({ context, page } = await open());
    await chip(page, 'exp-current').waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    assert.equal(await chip(page, 'exp-current').getAttribute('data-source-ref-status'), 'current');
    assert.equal(await chip(page, 'exp-changed').getAttribute('data-source-ref-status'), 'changed');
    assert.ok(asked.length > 0, 'statuses are read again, never trusted from the saved card');
    await chip(page, 'exp-current').locator('[data-source-ref-open]').click();
    await until(async () => (await painted(page)).includes(SENTENCE), 'the sentence emphasized after reload');
  });
  await context.close();
  await step('no model request and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);

async function until(fn, label, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await Promise.resolve(fn()).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error(`timed out waiting for ${label}`);
}
