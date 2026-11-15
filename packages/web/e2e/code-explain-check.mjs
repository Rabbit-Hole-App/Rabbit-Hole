// The code-explain card (code-explain-card-spec.md section 7, items 1-5 and 7; web lane B). A repository canvas with the shared nanoGPT stub
// (e2e/nanogpt-repository-fixture.mjs): the learner asks about model.py lines 52-70 in the Chat, the scripted answer carries `route: 'code-explain'` and a `codeExplain` payload in its
// message meta (canned here, no model), and Add as card puts the primary card with its satellite code card and the numbered connector on the canvas.
// Covers: the card, its highlighted lines and its explanation; one Undo step for the whole insertion; the depth switch (Brief two sentences, Detailed the trace, saved on the
// card); hover a sentence -> its range lights (on the primary and on the satellite); press a range -> the prose's sentence; Open in Files (small:open-code); a suggestion -> a new
// ask with the card's code as context, the card unchanged; a deleted satellite -> its anchors become file:line links; a second Add as card does not double it.
// Not covered (spec items 6, 8, 9): the router and the real handler are the control plane's (lane A) and a real answer needs a model.
// Dev build only: VITE_REHEARSAL_TRIGGER=1 (rehearsal-flag.js); a build without it has no card, so this check would fail there by design.
// NOT RUN when written (owner rule: Claude does not run browser checks); the selectors below are read from CodeExplainCard.jsx, CodeLines.jsx, CodeCard.jsx and AnswerFooter.jsx.
// LOCAL stack only, as repo-canvas-cards-check.mjs. Prints `ok <label>` or `FAIL <label> - <reason>`; exits 1 on any failure. Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8911 SMALL_CP=http://127.0.0.1:8913 VARS=<cp .dev.vars> PERSIST=<stack persist dir>
//   D1_CONFIG=<app wrangler config> [WRANGLER_BIN=<wrangler.js>] OUT=<dir> node e2e/code-explain-check.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMIT, REPO, SNAPSHOT, content, routeRepository } from './nanogpt-repository-fixture.mjs';
import { mockChatRoute } from './dev-cp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8913';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('code-explain-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/code-explain', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const login = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const session = await login(`cex-${run}@example.com`);
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...init.headers } });
  return { status: response.status, text: await response.text() };
};
const json = async (...args) => JSON.parse((await api(...args)).text || 'null');
const profile = await api('/api/profile');
assert.equal(profile.status, 200, 'local profile read');
if (!JSON.parse(profile.text)?.handle) assert.equal((await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `cex_${run}` }) })).status, 200, 'local handle setup');
const catalog = await json('/api/apps');

// The project's row in local D1 (as repo-canvas-cards-check seedProject): the board saves only for a repository the server knows.
{
  const where = `org='${catalog.org}' AND name='${REPO}'`, app = `SELECT id FROM repository_apps WHERE ${where}`;
  const sql = [`DELETE FROM repository_visibility WHERE app_id IN (${app})`, `DELETE FROM repository_versions WHERE app_id IN (${app})`, `DELETE FROM repository_apps WHERE ${where}`,
    `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${REPO}','${catalog.email}','karpathy/nanoGPT','master','${COMMIT}','ready')`,
    `INSERT INTO repository_versions(app_id,commit_sha,storage_key) ${app.replace('SELECT id', `SELECT id,'${COMMIT}','cex-fixture'`)}`,
    `INSERT INTO repository_visibility(app_id,visibility) ${app.replace('SELECT id', "SELECT id,'public'")}`].join('; ');
  const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
  const cwd = fileURLToPath(new URL('../../../', import.meta.url)), stdio = ['ignore', 'ignore', 'inherit'];
  const wrangler = args => (process.env.WRANGLER_BIN ? execFileSync(process.execPath, [process.env.WRANGLER_BIN, ...args], { cwd, stdio, windowsHide: true }) : execFileSync(`npx wrangler ${args.map(a => `"${a}"`).join(' ')}`, { cwd, shell: true, stdio }));
  wrangler(['d1', 'execute', 'rabbit-hole-learn-dev', '--local', '--persist-to', PERSIST, '--config', D1_CONFIG, '--command', sql]);
  const file = `${OUT}/cex-fixture.json`;
  writeFileSync(file, JSON.stringify({ ...SNAPSHOT, files: content }));
  wrangler(['r2', 'object', 'put', 'rabbit-hole-dev-repositories/cex-fixture', '--file', file, '--content-type', 'application/json', '--local', '--persist-to', PERSIST, '--config', D1_CONFIG]);
}

// One existing card, so the new cards' place is judged against something. The board is seeded in the browser's storage (the canvas's own key).
const boardKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${REPO}:ink`;
const seed = [boardKey, { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: [{ id: 'cex-note', type: 'explanation', x: 80, y: 80, w: 320, h: 160, title: 'Attention notes', body: 'Why the causal mask matters.' }] }];

// The answer's message meta: the control plane's `meta.route` and `meta.codeExplain` (code-explain.schema.json messageMeta; the model's cardIds are assigned by the client).
const meta = {
  route: 'code-explain',
  codeExplain: {
    type: 'codeExplain', title: 'How attention hides later tokens', question: 'how does attention hide later tokens?', repo: 'karpathy/nanoGPT', commit: COMMIT,
    files: [{ path: 'model.py', ranges: [{ id: 'r1', start: 52, end: 60 }, { id: 'r2', start: 67, end: 70 }] }, { path: 'configurator.py', ranges: [{ id: 'r3', start: 30, end: 34 }] }],
    mentioned: [{ id: 'm1', path: 'bench.py', start: 88, end: 88 }],
    depth: 'standard',
    depths: {
      brief: { prose: 'Attention sets the scores of later tokens to minus infinity. The softmax then gives them zero weight.', anchors: [{ sentence: 0, target: 'r2' }] },
      standard: { prose: 'The model builds a lower-triangular matrix of ones. Positions above the diagonal are zero. The mask is applied with masked_fill before the softmax. The softmax turns minus infinity into zero weight. The config can override the block size.', anchors: [{ sentence: 1, target: 'r1' }, { sentence: 2, target: 'r2' }, { sentence: 4, target: 'r3' }] },
      detailed: { prose: 'Take T equal to 4. The mask is tril of ones. Row zero keeps only its own score. The rest become minus infinity. After the softmax row zero is one and zeros. The same holds for every row. A benchmark exercises this path.', anchors: [{ sentence: 1, target: 'r1' }, { sentence: 6, target: 'm1' }], trace: { input: 'T = 4', steps: ['mask = tril(ones(4,4))', 'att[0] = [s, -inf, -inf, -inf]', 'softmax -> [1, 0, 0, 0]'] } },
    },
    suggestions: ['Why is the mask added before the softmax?', 'What does -inf do to a probability?', 'What changes with flash attention?'],
    evidence: { model: 'claude-sonnet-5-5', sources: ['model.py:52-60', 'model.py:67-70', 'configurator.py:30-34', 'bench.py:88'], createdAt: '2026-11-15T19:20:00Z' },
  },
};

const captured = [], refused = [], errors = [], consoleErrors = [];
let replies = 0;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/(ask|learn-course)$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/repositories/card-source') return route.fulfill({ json: { path: url.searchParams.get('path'), commit: COMMIT, content: content[url.searchParams.get('path')] ?? '' } });
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Scripted answer ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null, ...meta })
      + frame('done', { ok: true, threadId: body.thread_id || `cex-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/next-steps') return route.fulfill({ json: { set_id: 'cex-set', generated_at: new Date().toISOString(), options: [] } });
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\/cex-/.test(path)) return route.fulfill({ json: { ok: true } });
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, value]) => { if (window !== window.top) return; try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* a sandboxed frame */ } }, seed);
await routeRepository(context);
await context.route('**/*', router);
await mockChatRoute(context);
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)); });
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) { const message = String(error?.message || error).split('\n')[0].slice(0, 600); results.push({ label, ok: false, error: message }); console.log(`FAIL ${label} - ${message}`); await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {}); }
};
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };

const canvas = () => page.locator('[aria-label="Lesson canvas"]');
const pane = () => page.locator('[data-chat-pane]');
const blocks = () => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }, boardKey);
const ofType = async type => ((await blocks()).blocks || []).filter(b => b.type === type);
const primary = () => canvas().locator('[data-code-explain-card]').first();
const satellite = () => canvas().locator('[data-code-card][data-code-colors]').filter({ has: page.locator('[data-code-card-from]') }).first();
const sentences = () => primary().locator('[data-sentence]');

await page.goto(`${BASE}/apps/${REPO}`);
await canvas().waitFor({ timeout: 60000 });
await canvas().locator('[data-block-id="cex-note"]').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);

// Item 1: ask in the Chat (the code the learner would add is in the stub's snapshot), the answer carries the payload, Add as card.
await check('the scripted answer arrives and offers Add as card', async () => {
  const mode = pane().locator('[data-chat-mode]');
  if (await mode.getAttribute('data-chat-mode') !== 'ask') { await pane().getByRole('button', { name: 'Mode', exact: true }).click(); await page.locator('[data-chat-mode-option="ask"]').click(); }
  await pane().locator('[data-chat-composer] textarea').first().fill('how does attention hide later tokens?');
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length === 1, 20000, 'no ask was sent');
  await pane().getByText('Scripted answer 1.', { exact: false }).first().waitFor({ timeout: 15000 });
  await pane().locator('[data-answer]').last().hover();
  await pane().locator('[data-answer]').last().locator('[data-add-to-canvas]').waitFor({ state: 'visible' });
});
await check('Add as card puts the code-explain card, its satellite and a connector labelled 1 on the canvas, level and to the right', async () => {
  await pane().locator('[data-answer]').last().locator('[data-add-to-canvas]').click();
  await primary().waitFor({ timeout: 15000 });
  const board = await blocks(), cards = (board.blocks || []).filter(b => b.type === 'codeExplain'), sats = (board.blocks || []).filter(b => b.type === 'repo-code' && b.from);
  assert.equal(cards.length, 1, 'one primary');
  assert.equal(sats.length, 1, 'one satellite');
  assert.deepEqual(cards[0].files.map(f => f.cardId), ['self', sats[0].id]);
  assert.equal(sats[0].from, `codeExplain:${cards[0].id}`);
  assert.deepEqual(sats[0].ranges, [{ id: 'r3', start: 30, end: 34 }]);
  assert.equal(sats[0].source.path, 'configurator.py');
  assert.equal(cards[0].depth, 'standard');
  assert.equal(cards[0].generated, undefined, 'the learner\'s card, not a generated one');
  const links = (board.links || []).filter(l => l.from === cards[0].id && l.to === sats[0].id);
  assert.equal(links.length, 1, 'one connector');
  assert.equal(links[0].label, '1');
  const a = await primary().boundingBox(), b = await satellite().boundingBox();
  assert.ok(b.x > a.x + a.width - 1, 'the satellite is to the right of the primary');
  assert.ok(Math.abs(b.y - a.y) < 120, 'level with the primary');
});
await check('the primary shows model.py at the short commit, the highlighted ranges, the explanation and three suggestions', async () => {
  await page.waitForTimeout(800);
  assert.match(await primary().innerText(), new RegExp(`karpathy/nanoGPT @ ${COMMIT.slice(0, 7)}`));
  assert.equal(await primary().locator('[data-code-explain-path]').innerText(), 'model.py');
  const lit = await primary().locator('[data-code-explain-lines] [data-highlighted="true"]').evaluateAll(rows => rows.map(r => Number(r.dataset.codeLine)));
  assert.deepEqual(lit, [...Array(9)].map((_, i) => 52 + i).concat([67, 68, 69, 70]));
  assert.ok(await primary().locator('[data-code-explain-lines] [data-code-line].opacity-40').count() > 0, 'the lines between are dimmed');
  assert.equal(await sentences().count(), 5);
  assert.equal(await primary().locator('[data-code-explain-suggestion]').count(), 3);
  const sat = await satellite().locator('[data-highlighted="true"]').evaluateAll(rows => rows.map(r => Number(r.dataset.codeLine)));
  assert.deepEqual(sat, [30, 31, 32, 33, 34]);
  assert.match(await satellite().locator('[data-code-card-from]').innerText(), /from: How attention hides later tokens/);
  await page.screenshot({ path: `${OUT}/card.png` });
});
await check('Show whole file turns the dimming off', async () => {
  await primary().locator('[data-code-explain-whole]').click();
  assert.equal(await primary().locator('[data-code-explain-lines] [data-code-line].opacity-40').count(), 0);
  assert.ok(await primary().locator('[data-code-explain-lines] [data-code-line]').count() > 300, 'every line of model.py');
  await primary().locator('[data-code-explain-whole]').click();
});
await check('a second Add as card finds the card and adds nothing; Undo takes the whole insertion in one step', async () => {
  await pane().locator('[data-answer]').last().hover();
  await pane().locator('[data-answer]').last().locator('[data-add-to-canvas]').click();
  await page.waitForTimeout(500);
  assert.equal((await ofType('codeExplain')).length, 1);
  assert.equal((await ofType('repo-code')).length, 1);
  await canvas().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Control+z');
  await waitFor(async () => (await ofType('codeExplain')).length === 0, 8000, 'Undo did not remove the card');
  assert.equal((await ofType('repo-code')).length, 0, 'the satellite goes in the same step');
  assert.equal(((await blocks()).links || []).length, 0, 'and the connector');
  await page.keyboard.press('Control+y');
  await waitFor(async () => (await ofType('codeExplain')).length === 1 && (await ofType('repo-code')).length === 1, 8000, 'Redo did not bring both back');
  await primary().waitFor();
});

// Item 2: the depth switch, saved on the card.
await check('Brief is two sentences and Detailed shows the trace; the depth is saved on the card', async () => {
  await primary().locator('[data-depth-option="brief"]').click();
  assert.equal(await sentences().count(), 2);
  await primary().locator('[data-depth-option="detailed"]').click();
  assert.equal(await primary().locator('[data-code-explain-trace]').count(), 1);
  assert.match(await primary().locator('[data-code-explain-trace]').innerText(), /T = 4/);
  await waitFor(async () => (await ofType('codeExplain'))[0]?.depth === 'detailed', 8000, 'the depth was not saved');
  await primary().locator('[data-depth-option="standard"]').click();
  assert.equal(await primary().locator('[data-code-explain-trace]').count(), 0);
});

// Item 3: hover a sentence -> its range lights, on the primary or on the satellite; press a range -> the sentence.
await check('hovering a sentence lights its range on the primary, and the one anchored to the satellite lights there', async () => {
  await primary().locator('[data-sentence="1"]').hover();
  assert.deepEqual(await primary().locator('[data-code-explain-lines] [data-lit="true"]').evaluateAll(rows => rows.map(r => Number(r.dataset.codeLine))), [...Array(9)].map((_, i) => 52 + i));
  await primary().locator('[data-sentence="4"]').hover();
  await waitFor(async () => (await satellite().locator('[data-lit="true"]').count()) === 5, 4000, 'the satellite range did not light');
  assert.equal(await primary().locator('[data-code-explain-lines] [data-lit="true"]').count(), 0);
  await page.mouse.move(5, 5);
  await waitFor(async () => (await satellite().locator('[data-lit="true"]').count()) === 0, 4000, 'the range stayed lit');
});
await check('pressing a highlighted range scrolls the prose to its sentence', async () => {
  await primary().locator('[data-code-explain-lines] [data-code-line="68"]').click();
  await waitFor(async () => /bg-accent\/15/.test(await primary().locator('[data-sentence="2"]').getAttribute('class')), 4000, 'sentence 2 was not marked');
  await satellite().locator('[data-code-line="31"]').click();
  await waitFor(async () => /bg-accent\/15/.test(await primary().locator('[data-sentence="4"]').getAttribute('class')), 4000, 'a range on the satellite did not reach the primary');
});

// Item 4: Open in Files.
await check('Open in Files asks Files for model.py at the first range (small:open-code)', async () => {
  await page.evaluate(() => { window.__opened = []; window.addEventListener('small:open-code', event => window.__opened.push({ ...event.detail })); });
  await primary().locator('[data-code-explain-open]').click();
  const opened = await page.evaluate(() => window.__opened);
  assert.equal(opened.length, 1);
  assert.deepEqual([opened[0].path, opened[0].start, opened[0].end, opened[0].repo, opened[0].commit], ['model.py', 52, 60, 'karpathy/nanoGPT', COMMIT]);
  await waitFor(async () => (await page.locator('[data-companion]').boundingBox().catch(() => null))?.width > 100, 8000, 'the Files panel did not open');
});

// Item 5: a suggestion asks the chat with the card's code as context; the first card is unchanged.
await check('a suggestion sends its question with the card\'s code as context and leaves the card unchanged', async () => {
  const before = JSON.stringify((await ofType('codeExplain'))[0]);
  await primary().locator('[data-code-explain-suggestion]').first().click();
  await waitFor(() => captured.length === 2, 20000, 'the suggestion was not asked');
  const refs = (captured[1].body.context_refs || []).filter(ref => ref.kind === 'code');
  assert.equal(captured[1].body.message, 'Why is the mask added before the softmax?');
  assert.deepEqual(refs.map(ref => ref.sourceId.split(':').pop()).sort(), ['configurator.py', 'model.py']);
  assert.equal(JSON.stringify((await ofType('codeExplain'))[0]), before);
});

// Item 7: delete the satellite -> its anchors become file:line links; nothing else changes.
await check('deleting the satellite turns its anchor into a configurator.py:30-34 link that opens Files', async () => {
  const sat = (await ofType('repo-code'))[0];
  await satellite().locator('[data-card-header]').click();
  await page.keyboard.press('Delete');
  await waitFor(async () => (await ofType('repo-code')).length === 0, 8000, 'the satellite was not deleted');
  assert.equal(await sentences().count(), 5, 'the prose is unchanged');
  assert.equal(await primary().locator('[data-anchor]').count(), 3, 'anchors are never dropped');
  const link = primary().locator('[data-anchor-link="r3"]');
  assert.equal(await link.innerText(), 'configurator.py:30-34');
  await page.evaluate(() => { window.__opened = []; });
  await link.click();
  const opened = await page.evaluate(() => window.__opened);
  assert.deepEqual([opened[0].path, opened[0].start, opened[0].end], ['configurator.py', 30, 34]);
  assert.ok(sat.id.startsWith('chat-'), 'the satellite id derives from the answer');
});

await check('no model was called, no page error', async () => {
  assert.deepEqual(refused, []);
  assert.deepEqual(errors, []);
});
writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, refused, errors, consoleErrors: consoleErrors.slice(0, 20) }, null, 2));
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
