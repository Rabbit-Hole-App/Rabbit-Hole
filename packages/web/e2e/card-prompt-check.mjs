// A generated card's Prompt row (docs/features/card-prompt.md), against the LOCAL stack only. The board save is REAL: what a
// fresh browser and a share link show is what the server stored. Only /api/learn/artifact and the CAD job routes are answered
// in the browser; every other model-capable request is aborted and counted, so no model is ever called.
//   1. /explain from the Chat box makes a card with a Prompt row, closed;
//   2. opened, it shows the typed line exactly;
//   3. Copy puts the line on the clipboard;
//   4. the chat icon puts the line in the Chat box and sends nothing;
//   5. /cad (Generate) makes a CAD card whose row holds its typed line, kept while the job is polled;
//   6. the server's board holds both prompts; a card made before this (no prompt) has no row; a chat card's row is its question;
//   7. a fresh browser shows both rows again, closed;
//   8. a share-link viewer sees the row with Copy and no chat icon.
// Before this change step 1 fails: no card has a Prompt row.
// Usage: BASE=http://127.0.0.1:9121 SMALL_CP=http://127.0.0.1:9123 VARS=<cp .dev.vars> node e2e/card-prompt-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9121';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9123';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-prompt-check runs against the local stack only');
const OUT = process.argv[2] || 'card-prompt-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cpr-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// ---------------------------------------------------------------- setup: a canvas holding an older card and a chat card
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Card prompts ${run}` }) });
const OLD = { id: 'old-card', type: 'explanation', title: 'Made before prompts', body: 'No prompt was kept for this card.', dx: 900, dy: 0 };
const CHAT = { id: 'chat-card', question: 'What does softmax do to scores?', answer: 'It turns them into probabilities.', status: 'done', linkFrom: null, dx: 900, dy: 500 };
const board = () => api(`/api/learn/boards/${canvas.name}/main`).then(out => out.state);
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [CHAT], blocks: [OLD] } }) });

// ---------------------------------------------------------------- routes: the board stays real; the model never runs
const EXPLAIN_LINE = '/explain why a token id is only an index';
const CAD_LINE = '/cad a 40 mm mounting bracket with two holes';
const EXPLAIN = { type: 'explanation', title: 'A token id is only an index', body: 'The embedding table turns the index into a learned vector.' };
const cadBlock = { type: 'cad', id: 'cad-prompt', jobId: 'cad-job', modelId: 'cad-model', revisionId: null, status: 'queued', title: 'Mounting bracket', units: 'mm', briefSummary: 'Fixture.' };
const cadJob = { id: 'cad-job', cardId: 'cad-prompt', modelId: 'cad-model', state: 'queued', stage: 'queued', attempt: 1, createdAt: Date.now(), updatedAt: Date.now() };
const posts = [], refused = [], outside = [], errors = [], cadStarts = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  if (url.pathname === '/api/learn/artifact') { posts.push(request.postDataJSON()); return route.fulfill({ json: { result: 'artifact', primitive: 'explanation', block: EXPLAIN } }); }
  if (url.pathname.startsWith('/api/learn/cad/jobs')) {
    if (request.method() === 'POST') cadStarts.push(request.postDataJSON());
    return route.fulfill({ json: url.pathname === '/api/learn/cad/jobs' && request.method() === 'GET' ? { jobs: [cadJob], blocks: [cadBlock] } : { job: cadJob, block: cadBlock } });
  }
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 8;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async ({ signedIn = true, path = `/apps/${canvas.name}` } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  if (signedIn) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}${path}`);
  return { context, page };
};
const rowOf = (page, id) => page.locator(`[data-block-id="${id}"] [data-card-prompt]`);
const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
const send = async (page, text) => { const box = composerOf(page); await box.click(); await box.fill(text); await page.waitForTimeout(150); await box.press('Enter'); };
const newCardId = async page => {
  const ids = await page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-block-id')));
  return ids.find(id => ![OLD.id, CHAT.id, cadBlock.id].includes(id) && !id.startsWith('slot'));
};

let first = await open(), page = first.page, explainId = null;
await page.locator(`[data-block-id="${OLD.id}"]`).waitFor({ timeout: 60000 });

await step('/explain makes a card with a Prompt row, closed', async () => {
  await send(page, EXPLAIN_LINE);
  await until(async () => !!(explainId = await newCardId(page)) && (await rowOf(page, explainId).count()) === 1, 'no Prompt row on the new card');
  assert.equal(await rowOf(page, explainId).locator('[data-card-prompt-toggle]').getAttribute('aria-expanded'), 'false');
  assert.equal(await rowOf(page, explainId).locator('[data-card-prompt-text]').count(), 0, 'closed: the prompt text is not shown');
  assert.equal(posts.length, 1);
  await page.screenshot({ path: `${OUT}/1-closed.png` });
});

await step('opened, the row shows the typed line exactly', async () => {
  await rowOf(page, explainId).locator('[data-card-prompt-toggle]').click();
  assert.equal(await rowOf(page, explainId).locator('[data-card-prompt-text]').innerText(), EXPLAIN_LINE);
  await page.screenshot({ path: `${OUT}/2-open.png` });
});

await step('Copy puts the line on the clipboard', async () => {
  await page.evaluate(() => navigator.clipboard.writeText('before'));
  await rowOf(page, explainId).locator('[data-card-prompt-copy]').click();
  await until(async () => (await page.evaluate(() => navigator.clipboard.readText())) === EXPLAIN_LINE, 'clipboard does not hold the prompt');
  assert.equal(await rowOf(page, explainId).getByRole('status').innerText(), 'Copied');
});

await step('the chat icon puts the line in the Chat box and sends nothing', async () => {
  const before = posts.length + refused.length;
  await composerOf(page).fill('');
  await rowOf(page, explainId).locator('[data-card-prompt-chat]').click();
  await until(async () => (await composerOf(page).inputValue()) === EXPLAIN_LINE, 'the Chat box does not hold the prompt');
  await page.waitForTimeout(800);
  assert.equal(posts.length + refused.length, before, 'nothing was sent');
  await composerOf(page).fill('');
});

await step('/cad makes a CAD card whose row holds its typed line, kept while the job is polled', async () => {
  await send(page, CAD_LINE);
  await page.locator('[data-chat-pane] [data-paid-generate]').click();
  await rowOf(page, cadBlock.id).waitFor();
  assert.equal(cadStarts[0]?.prompt, 'a 40 mm mounting bracket with two holes', 'the job gets the words after the command');
  await rowOf(page, cadBlock.id).locator('[data-card-prompt-toggle]').click();
  assert.equal(await rowOf(page, cadBlock.id).locator('[data-card-prompt-text]').innerText(), CAD_LINE);
  await page.waitForTimeout(6000); // the card polls its job (2.5 s); a polled block carries no prompt
  assert.equal(await rowOf(page, cadBlock.id).locator('[data-card-prompt-text]').innerText(), CAD_LINE);
  await page.screenshot({ path: `${OUT}/5-cad.png` });
});

await step('the server board holds both prompts; the older card has no row; the chat card row is its question', async () => {
  await until(async () => { const state = await board(); return state.blocks.find(b => b.id === explainId)?.promptUsed === EXPLAIN_LINE && state.blocks.find(b => b.id === cadBlock.id)?.promptUsed === CAD_LINE; }, 'the saved board lacks the prompts', 20000);
  assert.ok(!Object.hasOwn((await board()).blocks.find(b => b.id === OLD.id), 'promptUsed'));
  assert.equal(await rowOf(page, OLD.id).count(), 0);
  const chatRow = page.locator(`[data-block-id="${CHAT.id}"] [data-card-prompt]`);
  await chatRow.locator('[data-card-prompt-toggle]').click();
  assert.equal(await chatRow.locator('[data-card-prompt-text]').innerText(), CHAT.question);
});
await first.context.close();

const second = await open();
await step('a fresh browser shows both rows again, closed', async () => {
  await rowOf(second.page, explainId).waitFor({ timeout: 60000 });
  for (const id of [explainId, cadBlock.id]) {
    assert.equal(await rowOf(second.page, id).locator('[data-card-prompt-toggle]').getAttribute('aria-expanded'), 'false', id);
    assert.equal(await rowOf(second.page, id).locator('[data-card-prompt-text]').count(), 0, id);
  }
  await rowOf(second.page, explainId).locator('[data-card-prompt-toggle]').click();
  assert.equal(await rowOf(second.page, explainId).locator('[data-card-prompt-text]').innerText(), EXPLAIN_LINE);
});
await second.context.close();

const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: await board() }) });
const viewer = await open({ signedIn: false, path: `/b/${shared.sharing.view}` });
await step('a share-link viewer sees the row with Copy and no chat icon', async () => {
  await rowOf(viewer.page, explainId).waitFor({ timeout: 60000 });
  assert.equal(await rowOf(viewer.page, explainId).locator('[data-card-prompt-copy]').count(), 1);
  assert.equal(await rowOf(viewer.page, explainId).locator('[data-card-prompt-chat]').count(), 0);
  await rowOf(viewer.page, explainId).locator('[data-card-prompt-toggle]').click();
  assert.equal(await rowOf(viewer.page, explainId).locator('[data-card-prompt-text]').innerText(), EXPLAIN_LINE);
  await viewer.page.screenshot({ path: `${OUT}/8-shared.png` });
});
await browser.close();

const passed = results.filter(Boolean).length;
// Outside hosts (the notebook origin's preload) are aborted and listed, as in pdf-excerpt-chat-state-check; they reach no model.
const clean = !refused.length && !errors.length;
console.log(`${clean ? 'ok' : 'FAIL'} no model call beyond the stubbed routes (${refused.join(', ') || 'none refused'}), no page error${errors.length ? `: ${errors.join(' | ')}` : ''}; outside hosts aborted: ${[...new Set(outside)].join(', ') || 'none'}`);
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total && clean ? 0 : 1);
