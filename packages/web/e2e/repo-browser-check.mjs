// The repository browser (docs/features/repository-browser.md; owner brief, 2026-10-07): Files · Graph · Learn, one search,
// Layers, one canonical selection, the code reader's [Ask] [Learn]. LOCAL stack only: a real session and Shell from the lane's
// local D1; the repository project is the shared nanoGPT stub (e2e/nanogpt-repository-fixture.mjs, no indexer on a keyless
// stack). /api/learn/ask is stubbed: no model call, ever. Cases 1-12 are the brief's §16 list, in order; 13+ back §1-§3, §13.
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/repo-browser-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { COMMIT, REPO, SNAPSHOT, content, repoRow, routeRepository } from './nanogpt-repository-fixture.mjs';
import { OVERVIEW_TAB } from '../src/inspector.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('repo-browser-check runs against the local stack only');
const SHOTS = process.argv[2] || 'repo-browser-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `browse-${run}@example.com`, secret, handle: `browse_${run}` }) })).json()).session;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Attention ${run}` }) });

// A second project of the same repository: another resource, which must start with no selection (case 9).
const REPO2 = 'repo-3adf61e2-nanogpt';
const asks = [], learnRequests = [];
const ANSWER = 'Stubbed answer: no model was called.';

const browser = await chromium.launch();
let page;
const crash = async (error) => { console.error(error); await page?.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {}); await browser.close().catch(() => {}); process.exit(1); };
process.once('uncaughtException', crash);
process.once('unhandledRejection', crash);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }); // case 10b reads what Copy put there
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await routeRepository(context);
const real = await api('/api/apps');
await context.route(`**/api/{apps,repositories}/${REPO2}{,/snapshot,/file}`, (route) => {
  const p = new URL(route.request().url()).pathname;
  if (p.endsWith('/snapshot')) return route.fulfill({ json: SNAPSHOT });
  if (p.endsWith('/file')) { const { path } = JSON.parse(route.request().postData()); return route.fulfill({ json: { path, commit: COMMIT, content: content[path] } }); }
  return route.fulfill({ json: { ...repoRow(real), name: REPO2 } });
});
await context.route('**/api/learn/ask', (route) => {
  asks.push(JSON.parse(route.request().postData()));
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: `${ANSWER} #${asks.length}` })}\n\nevent: done\ndata: {}\n\n` });
});
page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// Next Steps (contract §1.3) posts its own hook request when a canvas with cards opens; that is not the learner asking.
page.on('request', (r) => { const p = new URL(r.url()).pathname; if (r.method() !== 'GET' && /^\/api\/(ask|learn\/(tutor|journey|teach))/.test(p) && p !== '/api/learn/tutor/next-steps') learnRequests.push(p); });
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name) => { await page.waitForTimeout(400); await page.mouse.move(0, 0); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };

const bar = page.locator('[data-agent-bar]'), input = bar.locator('textarea'), panel = page.locator('[data-map-panel]');
const reader = page.getByRole('region', { name: 'Repository source' }), tree = page.locator('[data-file-tree]');
const actions = page.locator('[data-range-actions]');
const chips = async () => (await bar.locator('[data-scope-chip]').allInnerTexts()).map((t) => t.trim());
const title = () => panel.locator('[data-inspector-title]').innerText();
const tab = (name) => page.locator('[data-project-tabs]').getByRole('tab', { name, exact: true });
const search = page.getByRole('textbox', { name: 'Search repository' });
const open = async (path = `/apps/${REPO}`) => { await page.goto(`${BASE}${path}`); await page.locator('[data-graph-node]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(500); };
const files = async () => { await tab('Files').click(); await tree.waitFor(); };
const graph = async () => { await tab('Graph').click(); await page.locator('[data-graph-node]').first().waitFor(); await page.waitForTimeout(400); };
const fileRow = (path) => tree.locator(`[data-file-row="${path}"]`);
const symbolRow = (id) => tree.locator(`[data-symbol-row="${id}"]`);
const line = (n) => reader.locator(`[data-source-line="${n}"]`);
const lit = () => reader.locator('[data-highlighted]').evaluateAll((all) => all.map((n) => Number(n.dataset.sourceLine)));
const graphNode = async (id) => { await page.locator(`[data-graph-node="${id}"]`).focus(); await page.keyboard.press('Enter'); await panel.locator('[data-inspector-title]').waitFor(); };
// Each stubbed answer is numbered, so a send waits for its own answer, never an earlier one. With something selected it
// streams into that object's Chat in the inspector; with nothing selected, into the window (owner, 2026-10-08).
const send = async (text) => {
  const n = asks.length; await input.fill(text); await input.press('Enter');
  await page.locator('[data-inspector-chat], [data-result-sheet]').getByText(`${ANSWER} #${n + 1}`).waitFor({ timeout: 10000 }); assert.equal(asks.length, n + 1, 'one stubbed ask');
  if (await page.locator('[data-result-sheet]').count()) await page.getByRole('button', { name: 'Collapse results' }).click();
  return asks.at(-1);
};
const inView = (n) => line(n).evaluate((row) => { const r = row.getBoundingClientRect(), box = row.closest('.overflow-auto').getBoundingClientRect(); return r.top >= box.top && r.bottom <= box.bottom; });
// A real mouse drag over the text of lines a..b, as a learner selects code (never a scripted selection).
const drag = async (a, b) => {
  await page.evaluate(() => window.getSelection().removeAllRanges()); // as a click elsewhere would: a press inside a selection drags it
  await line(Math.round((a + b) / 2)).evaluate((n) => n.scrollIntoView({ block: 'center' }));
  const from = await line(a).locator('[data-source-text]').boundingBox(), to = await line(b).locator('[data-source-text]').boundingBox();
  await page.mouse.move(from.x + 1, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(to.x + to.width - 1, to.y + to.height / 2, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);
};
const selected = () => page.evaluate(() => window.getSelection().toString());

await open();
await check('13 §1: one navigation - Files · Graph · Learn as restrained underline tabs; /apps/<repo> lands on Graph; no Map | Learn pill, no Files | Graph buttons', async () => {
  assert.deepEqual((await page.locator('[data-project-tabs]').getByRole('tab').allInnerTexts()).map((t) => t.trim()), ['Files', 'Graph', 'Learn']);
  assert.equal(await tab('Graph').getAttribute('aria-selected'), 'true');
  const s = await tab('Graph').evaluate((n) => { const c = getComputedStyle(n); return { bg: c.backgroundColor, color: c.color, border: c.borderBottomColor, width: c.borderBottomWidth }; });
  assert.ok(['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'].includes(s.bg), `a tab is not a filled button: ${s.bg}`);
  assert.notEqual(s.border, 'rgb(35, 131, 226)', 'the active underline is not the primary blue'); assert.equal(s.width, '2px');
  assert.equal(await page.locator('main button[aria-pressed]').count(), 0, 'no Files | Graph toggle buttons');
  for (const legacy of ['map', 'overview']) { await open(`/apps/${REPO}?tab=${legacy}`); assert.equal(await tab('Graph').getAttribute('aria-selected'), 'true', `?tab=${legacy}`); }
});
await shot('A-files-graph-learn-tabs');
await check('14 §3: Layers is a labelled panel beside the graph, never over its nodes - Code checked; Decisions, Questions and Sessions off as none recorded yet, never on without records', async () => {
  const button = page.locator('[data-map-layers-open]');
  assert.equal((await button.innerText()).trim(), 'Layers');
  await button.click();
  const layers = page.locator('[data-map-layers]');
  assert.ok(await layers.getByRole('checkbox', { name: 'Code' }).isChecked());
  for (const name of ['Decisions', 'Questions', 'Sessions']) {
    const box = layers.getByRole('checkbox', { name: new RegExp(`^${name}`) });
    assert.ok(await box.isDisabled(), `${name} can be switched on with no records`); assert.equal(await box.isChecked(), false);
  }
  assert.equal((await layers.innerText()).match(/none recorded yet/g).length, 3);
  assert.doesNotMatch(await layers.innerText(), /Fixture/);
  // A floating popover once covered the graph's top-right nodes and controls (a node under it could not be clicked).
  const panel = await layers.boundingBox(), canvas = await page.locator('svg[aria-label="Repository dependency graph"]').boundingBox();
  assert.ok(panel.x >= canvas.x + canvas.width, `the panel sits beside the graph, not over it: ${panel.x} < ${canvas.x + canvas.width}`);
});
await shot('C-layers-panel');
await page.locator('[data-map-layers-open]').click();
await page.locator('[data-map-layers]').waitFor({ state: 'detached' });

await files();
await check('1 file click attaches file context: the reader opens train.py, the inspector shows it, the composer reads karpathy/nanoGPT › train.py', async () => {
  await fileRow('train.py').click();
  await line(1).waitFor();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'train.py']);
  assert.equal(await title(), 'train.py');
  assert.equal(await reader.locator('[data-source-title]').innerText(), 'karpathy/nanoGPT › train.py');
  assert.equal(await input.getAttribute('placeholder'), 'Ask about train.py…');
  assert.deepEqual(await lit(), [], 'a whole file highlights no line');
  const sent = await send('What does this file do?');
  assert.deepEqual(sent.repository_context, { commit: COMMIT, path: 'train.py', label: 'train.py' });
  assert.equal(sent.message, 'What does this file do?', 'typed naturally: no slash command');
});
await shot('D-file-selected');

await check('2 symbol click attaches symbol context: model.py lists its symbols; GPT selects the canonical node, jumps the reader to its line and the composer reads model.py › GPT', async () => {
  await fileRow('model.py').click();
  await symbolRow('model_gpt').click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'GPT']);
  assert.equal(await title(), 'GPT');
  assert.equal(await reader.locator('[data-source-title]').innerText(), 'karpathy/nanoGPT › model.py › GPT');
  assert.deepEqual(await lit(), [118]);
  assert.ok(await inView(118), 'the reader jumped to the symbol');
  assert.equal(await symbolRow('model_gpt').getAttribute('aria-current'), 'true');
  const sent = await send('Why is this structured this way?');
  assert.deepEqual(sent.repository_context, { commit: COMMIT, nodeId: 'model_gpt', label: 'GPT' });
});
await shot('E-symbol-selected');

let fromGraph;
await check('3 Graph selection and Files selection resolve to the same canonical object, in both directions', async () => {
  await graph();
  await graphNode('model_causalselfattention');
  fromGraph = { chips: await chips(), crumb: await panel.locator('[data-inspector-crumb]').innerText() };
  assert.deepEqual(fromGraph.chips, ['karpathy/nanoGPT', 'model.py', 'CausalSelfAttention']);
  await files(); // Graph → Files: the reader opens the node's file at its line, the tree marks it
  assert.deepEqual(await lit(), [29]);
  assert.equal(await symbolRow('model_causalselfattention').getAttribute('aria-current'), 'true');
  await shot('H-graph-node-to-files');
  await symbolRow('model_gpt').click(); await symbolRow('model_causalselfattention').click(); // Files picks the same object
  assert.deepEqual({ chips: await chips(), crumb: await panel.locator('[data-inspector-crumb]').innerText() }, fromGraph);
  await symbolRow('model_mlp').click(); // Files → Graph: the node is lit when the Graph opens
  await graph();
  assert.deepEqual(await page.locator('[data-graph-node][data-selected]').evaluateAll((all) => all.map((n) => n.dataset.graphNode)), ['model_mlp']);
  await files(); // a symbol outside the bounded overview joins it, lit
  await symbolRow('model_gpt_crop_block_size').click();
  await graph();
  assert.deepEqual(await page.locator('[data-graph-node][data-selected]').evaluateAll((all) => all.map((n) => n.dataset.graphNode)), ['model_gpt_crop_block_size']);
});

await files();
await symbolRow('model_gpt_forward').click();
const before = { chips: await chips(), asks: asks.length };
await check('4 highlighted code does NOT auto-attach: a drag over lines 177-179 only highlights them and offers [Ask] [Learn]', async () => {
  await drag(177, 179);
  assert.match(await selected(), /tok_emb = self\.transformer\.wte/);
  assert.equal(await actions.count(), 1);
  assert.equal((await actions.innerText()).replace(/\s+/g, ' ').trim(), 'model.py:177–179 Ask Learn');
  assert.deepEqual(await lit(), [177, 178, 179]);
  assert.deepEqual(await chips(), before.chips, 'the composer context did not move');
  assert.equal(asks.length, before.asks, 'nothing was sent');
  await page.keyboard.press('Escape'); // Esc drops the offer, the selection stays the learner's
  assert.equal(await actions.count(), 0);
  assert.deepEqual(await lit(), [170]);
});

await check('5 Ask attaches the exact range and focuses the composer: karpathy/nanoGPT › model.py › lines 177–179', async () => {
  await drag(177, 179);
  await shot('F-highlighted-code-ask-learn');
  await actions.getByRole('button', { name: 'Ask', exact: true }).click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'lines 177–179']);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-agent-bar]') !== null && document.activeElement.tagName), 'TEXTAREA');
  assert.equal(await input.getAttribute('placeholder'), 'Ask about lines 177–179…');
  // Ask writes a ready question; the learner presses Send (owner, 2026-10-08).
  await page.waitForTimeout(200);
  assert.equal(await input.inputValue(), 'What do lines 177–179 of model.py do?');
  assert.equal(asks.length, before.asks, 'nothing was sent');
  assert.equal(await actions.count(), 0);
  assert.deepEqual(await lit(), [177, 178, 179], 'the attached range stays highlighted');
  assert.equal(await title(), 'model.py:177–179');
});
await shot('G-composer-repo-file-range');
await check('I §13: the inspector shows the selected range - title, breadcrumb, path:lines, Open source at the range, Ask about this and Learn this', async () => {
  assert.equal(await panel.locator('[data-inspector-crumb]').innerText(), 'karpathy/nanoGPT › model.py › lines 177–179');
  assert.match(await panel.locator('[data-inspector-header]').innerText(), /model\.py:177–179\s*·\s*3 selected lines/);
  assert.equal(await panel.locator('[data-inspector-open-source]').getAttribute('href'), `https://github.com/karpathy/nanoGPT/blob/${COMMIT}/model.py#L177-L179`);
  assert.ok(await panel.locator('[data-in-context]').isVisible());
  assert.deepEqual((await panel.locator('[data-inspector-actions] button').allInnerTexts()).map((t) => t.trim()), ['Ask about this', 'Learn this']);
  assert.equal(await panel.locator('[data-inspector-section="relationships"]').count(), 0, 'a range shows no relationships, never its file\'s');
  // The reader already shows model.py, so the inspector does not repeat the code: no preview, no Source tab (owner, 2026-10-08).
  assert.equal(await panel.locator('[data-inspector-preview]').count(), 0);
  assert.deepEqual((await panel.getByRole('tab').allInnerTexts()).map((t) => t.trim()), [...(OVERVIEW_TAB ? ['Overview'] : []), 'Chat'], 'Overview is hidden for now (OVERVIEW_TAB)');
});
await shot('I-inspector-selected-range');

await check('7 context survives follow-up prompts: five questions in a row, the brief\'s "Show me the data flow." among them, each carry the same range', async () => {
  for (const text of ['Why are token and positional embeddings added here?', 'Why?', 'What calls this?', 'What happens next?', 'Show me the data flow.']) {
    const sent = await send(text); // "Show me…" names no resource, so with a selection it is a question, not a No matches search (router.js)
    assert.equal(sent.message, text);
    assert.deepEqual(sent.repository_context, { commit: COMMIT, range: { path: 'model.py', start: 177, end: 179 }, label: 'model.py:177–179' });
    assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'lines 177–179']);
  }
  // All five are the range's conversation, in its Chat (owner, 2026-10-08), and none was a No matches search.
  const chat = panel.locator('[data-inspector-chat]');
  await chat.getByText('Show me the data flow.').waitFor();
  assert.equal(await chat.getByText('No matches.').count(), 0);
  assert.equal(await page.locator('[data-result-sheet]').count(), 0, 'no node answer opened the window');
  assert.ok(asks.slice(-5).every((a) => a.node === 'range:model.py:177-179'), 'one conversation, for the range');
});
await shot('G2-show-me-routed-to-ask');

await check('12 the selected source reaches the existing repository handoff: /api/learn/ask in project scope with identity and range, no source text', async () => {
  const sent = asks.at(-1);
  assert.equal(sent.scope.app, REPO);
  assert.doesNotMatch(JSON.stringify(sent), /tok_emb|transformer\.wte/, 'no code text rides along');
});

await check('8 clearing the range falls back one level: to model.py, then to the repository', async () => {
  await bar.getByRole('button', { name: 'Remove lines 177–179' }).click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py']);
  assert.deepEqual((await send('And this file?')).repository_context, { commit: COMMIT, path: 'model.py', label: 'model.py' });
  await bar.getByRole('button', { name: 'Remove model.py' }).click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT']);
  assert.equal((await send('And the repository?')).repository_context, undefined);
  assert.equal(await reader.locator('[data-source-title]').innerText(), 'karpathy/nanoGPT › model.py', 'the reader keeps the file it shows');
});

await check('10 a large selection keeps its whole range and stays bounded: 1-330 is one range identity, no text on the wire', async () => {
  await line(1).evaluate((n) => n.scrollIntoView({ block: 'center' }));
  await line(1).getByRole('button', { name: 'Select line 1' }).click();
  await line(330).getByRole('button', { name: 'Select line 330' }).click({ modifiers: ['Shift'] });
  assert.match(await actions.innerText(), /model\.py:1–330/);
  await actions.getByRole('button', { name: 'Ask', exact: true }).click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'lines 1–330']);
  const sent = await send('How does data flow through this?'); // 'Walk me through …' would be a learning request (router.js LEARN_INTENT)
  assert.deepEqual(sent.repository_context.range, { path: 'model.py', start: 1, end: 330 });
  assert.ok(JSON.stringify(sent).length < 400, `the request stays small: ${JSON.stringify(sent).length} bytes`);
  assert.equal(await title(), 'model.py:1–330');
});

await check('11 internal code controls and copy never navigate or change context: a line number, Ctrl+C, a folder toggle', async () => {
  const url = page.url(), length = await page.evaluate(() => history.length), was = await chips();
  await drag(52, 54);
  await page.keyboard.press('Control+C');
  await line(60).getByRole('button', { name: 'Select line 60' }).click();
  await tree.locator('summary', { hasText: 'config' }).click();
  await fileRow('config/train_gpt2.py').waitFor();
  await tree.locator('summary', { hasText: 'config' }).click();
  assert.equal(page.url(), url); assert.equal(await page.evaluate(() => history.length), length);
  assert.deepEqual(await chips(), was);
  assert.equal(await reader.locator('[data-source-title]').innerText(), 'karpathy/nanoGPT › model.py › lines 1–330');
  assert.match(await actions.innerText(), /model\.py:60/, 'a line number only offers the line');
  await page.keyboard.press('Escape');
});

await check('6 Learn attaches the exact range and carries it into Learn, sending nothing; the Tutor chooses the pedagogy', async () => {
  const n = asks.length;
  await drag(177, 179);
  await actions.getByRole('button', { name: 'Learn', exact: true }).click();
  await page.waitForURL(/[?]tab=learn$/);
  await page.getByText(/^Asking about: model\.py:177–179 · 3adf61e/).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  assert.equal(asks.length, n, 'Learn sent no question');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('small.learn.request')), null, 'no Learn request (learnHandoff is off)');
  // The Map icon opens the repository's Files in Learn's right panel (owner, 2026-10-08): the same reader, the range still lit.
  await page.locator('[data-learn-map]').click();
  const learnFiles = page.locator('[data-learn-files]');
  await learnFiles.locator('[data-file-tree]').waitFor({ timeout: 10000 });
  assert.deepEqual(await lit(), [177, 178, 179], 'the panel reader shows model.py with the range lit');
  await shot('L-learn-files-panel');
  await learnFiles.locator('[data-learn-open-map]').click();
  await page.waitForURL(/[?]tab=map$/);
  await reader.waitFor();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'lines 177–179']);
  assert.equal(await tab('Files').getAttribute('aria-selected'), 'true', 'back to the view it left');
});

// Learn's composer is an input (LearnPage, Dive.jsx), a textarea in other docks: match either.
const COMPOSER = '[data-learn-dock] textarea, [data-learn-dock] [data-chat-composer] input:not([type="file"])';
await check('10 the Main canvas\'s Map icon opens Files in the right panel: a file opens, Ask in chat puts the lines on the canvas as a selected Code card and writes the question, with the range as context; nothing is sent', async () => {
  const n = asks.length, sent = learnRequests.length;
  await tab('Learn').click();
  await page.waitForURL(/[?]tab=learn$/);
  await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
  await page.locator('[data-learn-map]').click();
  const learnFiles = page.locator('[data-learn-files]');
  await learnFiles.locator('[data-file-tree]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-panel-tab="files"]').getAttribute('aria-selected'), 'true', 'the panel opens on its Files tab');
  await learnFiles.locator('[data-file-row="train.py"]').click();
  await learnFiles.getByRole('region', { name: 'Repository source' }).locator('[data-source-line="5"]').waitFor({ timeout: 10000 });
  await drag(5, 7);
  // The panel's selection offers exactly Ask in chat and Copy (owner, 2026-10-08); the Map's own keeps Ask and Learn (case 6).
  assert.deepEqual((await actions.getByRole('button').allInnerTexts()).map((t) => t.trim()), ['Ask in chat', 'Copy']);
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  await page.getByText(/^Asking about: train\.py:5–7/).first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator(COMPOSER).first().inputValue(), 'What do lines 5–7 of train.py do?');
  // The chip names the file, the lines and a preview of them, and can be removed.
  const chip = page.locator('[data-learn-dock] [data-repository-context]');
  assert.equal((await chip.locator('[data-context-path]').innerText()).trim(), 'train.py · lines 5–7');
  assert.ok((await chip.locator('[data-context-excerpt]').innerText()).includes(content['train.py'].split('\n')[4].trim()), 'the preview shows line 5');
  assert.equal(await chip.getByRole('button', { name: 'Clear repository selection' }).count(), 1);
  // The lines are on the canvas as a Code card (owner, 2026-10-08: "put the highlighted code as code card"), holding exactly
  // them, selected: the selected-card pill names it, beside the repository chip.
  const lines = content['train.py'].split('\n').slice(4, 7);
  const codeCards = page.getByLabel('Lesson canvas').locator('[data-block-id]').filter({ hasText: lines[0].trim() }).filter({ hasText: 'train.py' });
  await codeCards.first().waitFor({ timeout: 10000 });
  assert.equal(await codeCards.count(), 1, 'one Code card');
  for (const text of lines.filter((l) => l.trim())) assert.ok((await codeCards.first().innerText()).includes(text.trim()), `the card holds ${text.trim()}`);
  const cardId = await codeCards.first().getAttribute('data-block-id');
  await page.locator(`[data-learn-dock] [data-selected-card="${cardId}"]`).waitFor({ timeout: 5000 });
  // Ask in chat on the same lines again reselects that card: no second card.
  await drag(5, 7);
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await codeCards.count(), 1, 'the same lines make no second card');
  await page.locator(`[data-learn-dock] [data-selected-card="${cardId}"]`).waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  assert.equal(asks.length, n, 'Ask wrote the question and sent nothing'); assert.equal(learnRequests.length, sent);
  await shot('L-learn-files-ask');
});

await check('10b Copy in the panel says Copied on the button; pasting it on the canvas asks Code card or Jupyter notebook first, and Cancel places nothing; prose pastes as text', async () => {
  const n = asks.length, sent = learnRequests.length, canvasFrame = page.getByLabel('Lesson canvas');
  await drag(5, 7);
  await actions.getByRole('button', { name: 'Copy', exact: true }).click();
  await actions.getByRole('button', { name: 'Copied', exact: true }).waitFor({ timeout: 5000 }); // in place, not a corner toast
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, content['train.py'].split('\n').slice(4, 7).join('\n'));
  const paste = (text) => page.evaluate((t) => { document.activeElement?.blur(); const data = new DataTransfer(); data.setData('text/plain', t); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true })); }, text);
  const dialog = page.locator('[data-file-import-dialog]');
  await paste(copied);
  await dialog.waitFor({ timeout: 5000 });
  assert.equal((await dialog.locator('[data-import-file]').innerText()).trim(), 'train.py', 'text copied from a file keeps its name');
  assert.deepEqual((await dialog.locator('[data-import-choice]').allInnerTexts()).map((t) => t.trim()), ['Code card', 'Jupyter notebook']);
  await shot('L-paste-code-dialog');
  const before = await canvasFrame.locator('[data-block-id]').count(); // case 10's Code card is already there
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  assert.equal(await canvasFrame.locator('[data-block-id]').count(), before, 'Cancel placed nothing');
  await paste(copied);
  await dialog.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  await paste(copied);
  await dialog.locator('[data-import-choice="code"]').click();
  await dialog.getByRole('button', { name: 'Add to canvas', exact: true }).click();
  await page.waitForFunction((n) => document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]').length === n + 1, before, { timeout: 10000 });
  // Code from elsewhere (the conservative heuristic) asks too, named snippet.py; a notebook is offered and nothing runs.
  await paste('def attention(q, k, v):\n    w = q @ k.T\n    return w @ v');
  await dialog.waitFor({ timeout: 5000 });
  assert.equal((await dialog.locator('[data-import-file]').innerText()).trim(), 'snippet.py');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Plain prose is a text paste, as before: no dialog.
  await paste(`Attention weighs every token ${run}.`);
  await page.waitForTimeout(600);
  assert.equal(await dialog.count(), 0, 'prose asks nothing');
  await canvasFrame.getByText(`Attention weighs every token ${run}.`).first().waitFor({ timeout: 5000 });
  assert.equal(asks.length, n, 'copying and pasting asked nothing'); assert.equal(learnRequests.length, sent);
});

await check('10c Send carries the Code card and the line range on the Learn chat path, and the answer stays tied to them', async () => {
  const n = asks.length, tutorTurns = learnRequests.filter((p) => p.startsWith('/api/learn/tutor')).length;
  const field = page.locator(COMPOSER).first();
  // Ask in chat once more: its Code card is selected again and the question waits, unsent.
  await drag(5, 7);
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  const pill = page.locator('[data-learn-dock] [data-selected-card]');
  await pill.waitFor({ timeout: 5000 });
  const cardId = await pill.getAttribute('data-selected-card');
  assert.equal(asks.length, n, 'nothing sent before Send');
  await field.fill('What do lines 5–7 of train.py do?');
  await field.press('Enter');
  await page.getByText(`${ANSWER} #${n + 1}`).first().waitFor({ timeout: 10000 });
  assert.equal(asks.length, n + 1, 'one stubbed ask');
  assert.deepEqual(asks.at(-1).repository_context?.range, { path: 'train.py', start: 5, end: 7 });
  assert.equal(asks.at(-1).repository_context?.commit, COMMIT);
  assert.equal(asks.at(-1).canvas_target?.id, cardId, 'the Code card rides as the selected card');
  assert.ok(String(asks.at(-1).canvas_target?.text || '').includes(content['train.py'].split('\n')[4].trim()), 'with its lines');
  assert.equal(learnRequests.filter((p) => p.startsWith('/api/learn/tutor')).length, tutorTurns, 'not a Tutor turn');
  await page.locator('[data-chat-sheet] blockquote', { hasText: 'train.py · lines 5–7' }).first().waitFor({ timeout: 5000 }); // the question's own passage line
  await shot('L-learn-files-send');
  const learnFiles = page.locator('[data-learn-files]');
  await learnFiles.locator('[data-learn-open-map]').click();
  await page.waitForURL(/[?]tab=map$/);
});

await check('9 another repository or canvas never inherits the context: a canvas shows no repository context, another project starts at its root', async () => {
  await page.evaluate((to) => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }, `/apps/${canvas.name}`);
  await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
  assert.equal(await page.getByText(/^Asking about:/).count(), 0);
  assert.equal(await bar.count(), 0, 'the canvas has its own composer');
  await page.evaluate((to) => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }, `/apps/${REPO2}`);
  await page.locator('[data-graph-node]').first().waitFor({ timeout: 30000 });
  await bar.locator('[data-scope-chip="resource"]').waitFor();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT']);
  assert.equal(await page.locator('[data-graph-node][data-selected]').count(), 0);
  await files();
  assert.equal(await reader.count(), 0, 'no file is open');
  await open(); // and the first project, opened afresh, starts at its root too
  assert.deepEqual(await chips(), ['karpathy/nanoGPT']);
});

await check('15 §2: one search field - in Files it finds files and symbols, in Graph it focuses the matching nodes', async () => {
  await files();
  await fileRow('model.py').click();
  assert.equal(await search.getAttribute('placeholder'), 'Search files or symbols…');
  await search.fill('forward');
  const groups = await tree.locator('p').allInnerTexts();
  assert.deepEqual(groups.map((t) => t.trim()), ['Symbols']);
  assert.ok((await tree.locator('[data-symbol-row]').count()) >= 5);
  await search.fill('prepare');
  assert.deepEqual(await tree.locator('[data-file-row]').evaluateAll((all) => all.map((n) => n.dataset.fileRow)), ['data/openwebtext/prepare.py', 'data/shakespeare/prepare.py', 'data/shakespeare_char/prepare.py']);
  assert.equal(await tree.locator('[data-symbol-row]').count(), 0, 'prepare names files, no symbol');
  await search.fill('Block');
  await shot('B-contextual-search-files');
  await tree.locator('[data-symbol-row="model_block"]').click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'Block']);
  await graph();
  const shown = await page.locator('[data-graph-node]').evaluateAll((all) => all.map((n) => n.getAttribute('aria-label')));
  assert.ok(shown.length && shown.every((l) => /block/i.test(l)), `Graph focuses the matches: ${shown.join(', ')}`);
});
await shot('B2-contextual-search-graph');
await search.fill('');

await check('no page errors, no model call, nothing but stubbed asks', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(learnRequests, []);
  assert.ok(asks.length >= 9, `${asks.length} stubbed asks`);
});

await browser.close();
console.log(`${results.length}/${results.length} checks passed`);
