// Source passage references, the command path (Tutor release R3; docs/features/source-refs.md), against the LOCAL stack only, with no
// model call: the source-ref route and the /explain job API are fakes in this browser (as whiteboard-command-check.mjs). The board is
// seeded with a stored Markdown file card whose original, revision and highlight list the fakes serve (no upload).
// Covers: selecting a sentence in the Markdown card offers Explain next to Highlight; Explain mints the reference (the request names the
// canvas, the file source, its revision and the quote with its surroundings), then starts the explanation with the reference id and the
// passage as the job's context; the pending card shows "From repeat.md" and no model request is made; a source that changed since it
// was selected stops the command with the learner's words before any job is made; no page error.
// Needs the R3 wiring in LearnPage (the rh:explain-passage handler) and AdaptiveCanvas (the source line under a card): hand-back patches.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/source-ref-command-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('source-ref-command-check runs against the local stack only');
const SHOTS = process.argv[2] || 'source-ref-command-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 5; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `srcref-cmd-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Source ref command ${run}` }) });

const SENTENCE = 'The loss is the mean squared error.';
const MD = `# Notes\n\nSome opening words.\n\n${SENTENCE}\n\nThen a closing paragraph.\n`;
const REV = 'a'.repeat(64), FILE_ID = `fs_${'1'.repeat(24)}`, REF_ID = `sref_${'3'.repeat(24)}`;
const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [];
const flow = { mints: [], jobs: [], mode: 'current' };
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};

const refOf = body => ({ v: 1, id: REF_ID, kind: 'markdown', source: { key: body.key, rev: body.rev, name: 'repeat.md', home: null }, anchor: body.anchor });
const router = async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
  // The stored original, and an empty highlight list at the card's revision (so the owner's selection toolbar is offered).
  if (path === `/api/learn/files/${FILE_ID}` && method === 'GET') return route.fulfill({ status: 200, contentType: 'text/markdown', body: MD });
  if (path === '/api/learn/pdf-highlights' && method === 'GET') return route.fulfill({ json: { sha256: REV, highlights: [], changed: 0 } });
  if (path === '/api/learn/source-refs' && method === 'POST') {
    const body = request.postDataJSON();
    flow.mints.push(body);
    if (flow.mode === 'changed') return route.fulfill({ status: 409, json: { error: 'The file changed.', code: 'source_changed', rev: 'b'.repeat(64) } });
    return route.fulfill({ json: { ref: refOf(body) } });
  }
  if (path === '/api/learn/source-refs/resolve' && method === 'POST') return route.fulfill({ json: { refs: request.postDataJSON().ids.map(id => ({ id, status: 'current', rev: REV })) } });
  if (path === '/api/learn/explain/jobs' && method === 'GET') return route.fulfill({ json: { jobs: [] } });
  if (path === '/api/learn/explain/jobs' && method === 'POST') {
    const body = request.postDataJSON();
    flow.jobs.push(body);
    const job = { id: `ej_${run}`, version: 1, boardId: body.boardId, cardId: body.cardId, requestClass: 'simple', stage: 'queued', attempt: 1, terminal: false, round: 0, failure: null, recovery: [], usage: { credits: 0, unknown: false },
      sourceRef: refOf(flow.mints.at(-1)), createdAt: 0, updatedAt: 0 };
    flow.job = job;
    return route.fulfill({ status: 202, json: { job } });
  }
  if (/^\/api\/learn\/explain\/jobs\/[^/]+$/.test(path) && method === 'GET') return route.fulfill({ json: { job: flow.job } });
  if (path === '/api/learn/chat/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (MODEL.test(path) && method !== 'GET') { stray.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

// The seeded board: one stored Markdown file card, as a dropped .md file leaves it.
const state = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [],
  blocks: [{ id: 'repeat.md', type: 'file', kind: 'markdown', format: 'md', label: 'repeat.md', dx: 0, dy: 0, size: MD.length,
    fileRef: { v: 1, source: { id: FILE_ID, rev: REV }, family: 'markdown', meta: { name: 'repeat.md', title: 'repeat.md' }, view: {}, derivatives: [] } }] };
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
const select = page => page.evaluate(sentence => {
  const root = document.querySelector('[data-block-id="repeat.md"] [data-file-doc-md]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.includes(sentence)) {
    const range = document.createRange(); range.setStart(node, node.data.indexOf(sentence)); range.setEnd(node, node.data.indexOf(sentence) + sentence.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return true;
  }
  return false;
}, SENTENCE);

try {
  const { context, page } = await open();
  const toolbar = () => page.locator('[data-block-id="repeat.md"] [data-file-doc-selection-toolbar]');
  await step('selecting a sentence offers the Ctrl+K quick-ask and Highlight', async () => {
    assert.equal(await select(page), true);
    await toolbar().waitFor();
    await toolbar().locator('[data-quick-ask]').waitFor();
    await toolbar().getByRole('button', { name: 'Highlight' }).waitFor();
  });
  await step('Explain mints the reference to this file at this revision and quote, opens Ctrl+K with the interactive pill and the passage (no job yet), and sending it starts the explanation with its id and the passage', async () => {
    await toolbar().locator('[data-quick-ask]').click();
    // The bulb never generates (LearnPage.jsx onPassage -> inlineAi with HIGHLIGHT_EXPLAIN_COMMAND, source-refs.js:130): the learner sends the Ctrl+K line.
    const editor = page.locator('[data-inline-ai]');
    await editor.waitFor({ timeout: 20000 });
    await editor.locator('[data-command-pill="explain"]').waitFor();
    assert.ok((await editor.locator('[data-inline-prompt]').inputValue()).includes(SENTENCE), 'the passage is the Ctrl+K words');
    assert.equal(flow.jobs.length, 0, 'the bulb starts no job by itself');
    await editor.locator('[data-inline-submit]').click();
    await until(() => flow.jobs.length === 1, 'one explanation job');
    assert.equal(flow.mints.length, 1);
    const mint = flow.mints[0];
    assert.deepEqual([mint.app, mint.key, mint.rev, mint.anchor.quote.exact], [canvas.name, `file:${FILE_ID}`, REV, SENTENCE]);
    assert.ok(mint.anchor.quote.prefix.length <= 500 && mint.anchor.quote.suffix.length <= 500);
    assert.equal(flow.jobs[0].sourceRefId, REF_ID, 'the job is given the id, never an anchor');
    assert.equal('sourceRef' in flow.jobs[0], false);
    assert.ok(JSON.stringify(flow.jobs[0].context).includes(SENTENCE), 'the passage is the job context');
  });
  await step('the pending card shows where it came from', async () => {
    const chip = page.locator(`[data-block-id="${flow.jobs[0].cardId}"] [data-source-ref]`);
    await chip.waitFor({ timeout: 20000 });
    assert.match(await chip.innerText(), /From repeat\.md/);
    await chip.screenshot({ path: `${SHOTS}/A-chip.png` });
  });
  await step('a file that changed since it was shown stops the command with the learner\'s words, and no job is made', async () => {
    flow.mode = 'changed';
    const before = flow.jobs.length;
    assert.equal(await select(page), true);
    await toolbar().locator('[data-quick-ask]').click();
    await page.locator('[data-block-id="repeat.md"] [data-file-doc-highlight-notice]').getByText('This source changed since you selected this passage. Select the passage again.').waitFor();
    assert.equal(flow.jobs.length, before);
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
