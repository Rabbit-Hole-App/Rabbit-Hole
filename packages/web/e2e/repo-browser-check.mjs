// The repository's Files and Graph inside the canvas (docs/features/repository-browser.md; repo-canvas-graph.md, owner
// correction to decision 2, 2026-10-15): there is no Files · Graph · Learn page any more; /apps/<repo> is the canvas, and Files
// and Graph open in the companion column beside Chat. Each case keeps the intent of the old repository-page case it carries
// (the old case numbers), now on the canvas: one search, Layers, one canonical selection, the code reader's Ask in chat and
// Copy. A viewer selection rides as a code ref in context_refs (lane B: code:<repo>@<commit>:<path>, #<node id> for a symbol,
// range for lines); repository_context carries only the commit. LOCAL stack only: a real session and Shell from the lane's
// local D1; the repository project is the shared nanoGPT stub (e2e/nanogpt-repository-fixture.mjs, no indexer on a keyless
// stack). /api/learn/ask is stubbed: no model call, ever.
// Retired with the repository page: the Map inspector (old case I §13: its header, crumb and tabs; GraphPanel's node details
// carry Open source and Learn this, cases 3 and 6), the dock's resource chips, and the Files search (the companion's Files
// has no search field; the Graph's search is case 15).
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 [VARS=<cp .dev.vars>] node e2e/repo-browser-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { COMMIT, REPO, SNAPSHOT, content, repoRow, routeRepository } from './nanogpt-repository-fixture.mjs';
import { mockChatRoute } from './dev-cp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('repo-browser-check runs against the local stack only');
const SHOTS = process.argv[2] || 'repo-browser-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `browse-${run}@example.com`, secret, handle: `browse_${run}` }) })).json()).session;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Attention ${run}` }) });

// A second project of the same repository: another resource, which must start with no selection (case 9).
const REPO2 = 'repo-3adf61e2-nanogpt';
const asks = [], learnRequests = [];
const ANSWER = 'Stubbed answer: no model was called.';
let cite = null;
// The code ref identities (lane B repo-context.js, chat-context.js refKey): the repository is the GitHub repo, not the project.
const SRC = (path) => `code:karpathy/nanoGPT@${COMMIT}:${path}`;
const fileKey = (path) => `${SRC(path)}|null`;
const linesKey = (path, start, end) => `${SRC(path)}|${JSON.stringify({ end, path, start })}`;

const browser = await chromium.launch();
let page;
const crash = async (error) => { console.error(error); await page?.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {}); await browser.close().catch(() => {}); process.exit(1); };
process.once('uncaughtException', crash);
process.once('unhandledRejection', crash);
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
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
// CR-1 route decision (dev-cp.mjs chatRouteAnswer): an answer. CI has no JEV key, so the real route would fall back and send nothing.
await mockChatRoute(context);
await context.route('**/api/learn/ask', (route) => {
  asks.push(JSON.parse(route.request().postData()));
  // cite: one stubbed answer's own words after the usual line (case 10d: code references), then it clears.
  const text = `${ANSWER} #${asks.length}${cite ? `\n\n${cite}` : ''}`; cite = null;
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {}\n\n` });
});
page = await context.newPage();
page.setDefaultTimeout(15000); // an action on a missing control fails in 15 s instead of waiting forever
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// Next Steps (contract §1.3) posts its own hook request when a canvas with cards opens; that is not the learner asking.
page.on('request', (r) => { const p = new URL(r.url()).pathname; if (r.method() !== 'GET' && /^\/api\/(ask|learn\/(tutor|journey|teach))/.test(p) && p !== '/api/learn/tutor/next-steps') learnRequests.push(p); });
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name) => { await page.waitForTimeout(400); await page.mouse.move(0, 0); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };

// Learn's composer is an input (LearnPage, Dive.jsx), a textarea in other docks: match either.
const COMPOSER = '[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])';
const companion = page.locator('[data-companion]'), learnFiles = companion.locator('[data-learn-files]'), graphPanel = companion.locator('[data-graph-panel]');
const reader = learnFiles.getByRole('region', { name: 'Repository source' }), tree = learnFiles.locator('[data-file-tree]');
const actions = learnFiles.locator('[data-range-actions]');
const fileRow = (path) => tree.locator(`[data-file-row="${path}"]`);
const symbolRow = (id) => tree.locator(`[data-symbol-row="${id}"]`);
const line = (n) => reader.locator(`[data-source-line="${n}"]`);
const lit = () => reader.locator('[data-highlighted]').evaluateAll((all) => all.map((n) => Number(n.dataset.sourceLine)));
const field = () => page.locator(COMPOSER).first();
const search = graphPanel.getByRole('textbox', { name: 'Search repository' });
const view = () => companion.locator('[data-companion-view][aria-pressed="true"]').getAttribute('data-companion-view', { timeout: 2000 }).catch(() => null);
const shows = (want) => page.waitForFunction((v) => document.querySelector(`[data-companion] [data-companion-view="${v}"][aria-pressed="true"]`), want, { timeout: 15000 });
// The code entries above the composer: a dashed selection ([data-code-selection]) or a pinned chip, by key.
const codeChips = () => page.locator('[data-chat-pane] [data-code-selection], [data-chat-pane] [data-context-chip]').evaluateAll((all) => all
  .map((n) => ({ key: n.getAttribute('data-ref-key'), selected: n.hasAttribute('data-code-selection'), text: n.innerText.replace(/\s+/g, ' ').trim() }))
  .filter((c) => c.key?.startsWith('code:')));
const keys = async () => (await codeChips()).map((c) => c.key);
const chipFor = (key) => page.waitForFunction((k) => [...document.querySelectorAll('[data-chat-pane] [data-code-selection]')].some((n) => n.dataset.refKey === k), key, { timeout: 10000 });
const codeRefs = (sent) => (sent.context_refs || []).filter((r) => String(r.sourceId).startsWith('code:'));
const open = async (path = `/apps/${REPO}`) => { await page.goto(`${BASE}${path}`); await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 }); await page.locator('[data-chat-pane]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(800); };
// Files and Graph are the companion column's views (lane A): its view switch when the column is open; else Files by the page
// event (LearnPage small:open-files, as a code reference does) and Graph by the composer's Explore codebase.
// A closed column keeps its views mounted (inert, zero width), so open means the column's own width.
const columnOpen = async () => ((await companion.boundingBox().catch(() => null))?.width ?? 0) > 300;
const files = async () => {
  const button = companion.locator('[data-companion-view="files"]');
  if (await columnOpen()) { if (await view() !== 'files') await button.click(); }
  else await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:open-files')));
  await tree.waitFor();
};
const graph = async () => {
  const button = companion.locator('[data-companion-view="graph"]');
  if (await columnOpen()) { if (await view() !== 'graph') await button.click(); }
  else { await page.locator('[data-panel-companion]').click(); await button.click(); } // the Chat header's one control (owner brief 2026-10-16)
  await graphPanel.locator('[data-graph-node]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
};
// Enter on a focused node selects it (lane B), as a click would.
const graphNode = async (id) => { await graphPanel.locator(`[data-graph-node="${id}"]`).focus(); await page.keyboard.press('Enter'); await graphPanel.locator('[data-node-details]').waitFor(); };
// Each stubbed answer is numbered, so a send waits for its own answer, never an earlier one.
// Auto sends a question with no selection to the Tutor (a planner turn); these are Ask turns, on the stubbed /api/learn/ask.
const askMode = async () => {
  const pane = page.locator('[data-chat-pane]').first();
  if (await pane.locator('[data-chat-mode]').getAttribute('data-chat-mode') === 'ask') return;
  await pane.getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator('[data-chat-mode-option="ask"]').click();
  await page.waitForTimeout(200);
};
const send = async (text) => {
  await askMode();
  const n = asks.length; await field().fill(text); await field().press('Enter');
  await page.locator('[data-chat-pane]').getByText(`${ANSWER} #${n + 1}`).first().waitFor({ timeout: 10000 }); assert.equal(asks.length, n + 1, 'one stubbed ask');
  return asks.at(-1);
};
const inView = (n) => line(n).evaluate((row) => { const r = row.getBoundingClientRect(), box = row.closest('.overflow-auto').getBoundingClientRect(); return r.top >= box.top && r.bottom <= box.bottom; });
// A real mouse drag over the text of lines a..b, as a learner selects code (never a scripted selection).
const drag = async (a, b) => {
  await page.evaluate(() => window.getSelection().removeAllRanges()); // as a click elsewhere would: a press inside a selection drags it
  // The companion's reader is narrow: keep the code scrolled to its left edge and the drag inside the reader's visible box.
  await line(Math.round((a + b) / 2)).evaluate((n) => { n.scrollIntoView({ block: 'center' }); n.closest('.overflow-auto').scrollLeft = 0; });
  const view = await line(a).evaluate((n) => { const r = n.closest('.overflow-auto').getBoundingClientRect(); return { left: r.left, right: r.right }; });
  const from = await line(a).locator('[data-source-text]').boundingBox(), to = await line(b).locator('[data-source-text]').boundingBox();
  await page.mouse.move(Math.max(from.x + 1, view.left + 2), from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(Math.min(to.x + to.width - 1, view.right - 4), to.y + to.height / 2, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);
};
const selected = () => page.evaluate(() => window.getSelection().toString());

await open();
await check('13 §1: no repository page - /apps/<repo> is the canvas with Chat, no Files · Graph · Learn tabs, no viewer forced open; an old ?tab= link opens its viewer once and leaves the plain address', async () => {
  assert.equal(await page.locator('[data-project-tabs]').count(), 0, 'no Files · Graph · Learn tabs');
  assert.equal(await page.locator('[data-learn-map]').count(), 0, 'no Map button');
  assert.equal(await columnOpen(), false, 'no viewer forced open');
  for (const [tab, want] of [['code', 'files'], ['map', 'graph'], ['overview', 'graph'], ['graph', 'graph']]) {
    await open(`/apps/${REPO}?tab=${tab}`);
    await shows(want);
    assert.equal(new URL(page.url()).search, '', `?tab=${tab} leaves the plain address`);
  }
});
await shot('A-canvas-with-graph-beside-chat');
await check('14 §3: Layers (review fixtures) is a labelled panel in the Graph, never over its nodes - Code checked; with no fixtures there is no Layers button', async () => {
  assert.equal(await graphPanel.locator('[data-map-layers-open]').count(), 0, 'no Layers without review fixtures');
  await open(`/apps/${REPO}?tab=graph&fixtures=1`);
  await graphPanel.locator('[data-graph-node]').first().waitFor({ timeout: 30000 });
  const button = graphPanel.locator('[data-map-layers-open]');
  assert.equal((await button.innerText()).trim(), 'Layers');
  await button.click();
  const layers = graphPanel.locator('aside#graph-layers');
  assert.equal(await layers.getAttribute('aria-label'), 'Layers');
  assert.ok(await layers.getByRole('checkbox', { name: 'Code' }).isChecked());
  for (const name of ['Decisions', 'Questions', 'Sessions']) assert.equal(await layers.getByRole('checkbox', { name: new RegExp(`^${name}`) }).count(), 1, `${name} is a layer`);
  // A floating popover once covered the graph's top-right nodes and controls (a node under it could not be clicked).
  const panel = await layers.boundingBox(), svg = await graphPanel.locator('svg[aria-label="Repository dependency graph"]').boundingBox();
  const overlap = Math.max(0, Math.min(panel.x + panel.width, svg.x + svg.width) - Math.max(panel.x, svg.x)) * Math.max(0, Math.min(panel.y + panel.height, svg.y + svg.height) - Math.max(panel.y, svg.y));
  assert.equal(overlap, 0, 'the Layers panel sits beside or below the graph, not over it');
  await shot('C-layers-panel');
  await open(`/apps/${REPO}?fixtures=0`); // the review fixtures off again for the rest
});

await files();
await check('1 a file click is file context: the reader opens train.py and a dashed train.py chip waits above the composer; the question carries it as a code ref, repository_context only the commit', async () => {
  await fileRow('train.py').click();
  await line(1).waitFor();
  assert.deepEqual(await keys(), [fileKey('train.py')]);
  assert.equal((await codeChips())[0].selected, true, 'a selection chip, not pinned');
  assert.equal(await reader.locator('[data-source-title]').innerText(), 'karpathy/nanoGPT › train.py');
  assert.deepEqual(await lit(), [], 'a whole file highlights no line');
  const sent = await send('What does this file do?');
  assert.deepEqual(codeRefs(sent).map((r) => [r.sourceId, r.range ?? null]), [[SRC('train.py'), null]]);
  assert.deepEqual(sent.repository_context, { commit: COMMIT });
  assert.equal(sent.message, 'What does this file do?', 'typed naturally: no slash command');
});
await shot('D-file-selected');

await check('2 a symbol click is symbol context: model.py lists its symbols; GPT is the canonical node, the reader jumps to its line, one chip replaces the file chip', async () => {
  await fileRow('model.py').click();
  await symbolRow('model_gpt').click();
  const chips = await codeChips();
  assert.equal(chips.length, 1, `one selection: ${JSON.stringify(chips.map((c) => c.key))}`);
  assert.ok(chips[0].key.startsWith(`${SRC('model.py')}#model_gpt|`), chips[0].key);
  assert.equal(await reader.locator('[data-source-title]').innerText(), 'karpathy/nanoGPT › model.py › GPT');
  await reader.locator('[data-highlighted][data-source-line="118"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  assert.deepEqual(await lit(), [118]);
  assert.ok(await inView(118), 'the reader jumped to the symbol');
  assert.equal(await symbolRow('model_gpt').getAttribute('aria-current'), 'true');
  const sent = await send('Why is this structured this way?');
  assert.deepEqual(codeRefs(sent).map((r) => r.sourceId), [`${SRC('model.py')}#model_gpt`]);
});
await shot('E-symbol-selected');

await check('3 Graph and Files selections are one canonical object: the same symbol picked in both is one chip; Open source in the Graph opens Files at its line; the Graph tab keeps the pick', async () => {
  await symbolRow('model_causalselfattention').click();
  const fromFiles = await keys();
  await graph();
  await graphNode('model_causalselfattention');
  assert.deepEqual(await keys(), fromFiles, 'the graph pick of the same symbol adds no second chip');
  await graphPanel.locator('[data-node-open-source]').click();
  await shows('files');
  await reader.locator('[data-highlighted][data-source-line="29"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  assert.deepEqual(await lit(), [29]);
  assert.equal(await symbolRow('model_causalselfattention').getAttribute('aria-current'), 'true');
  await shot('H-graph-node-to-files');
  assert.equal(await companion.getByRole('button', { name: 'Back to graph', exact: true }).count(), 0, 'no Back to graph (owner brief 2026-10-16 item 4)');
  await companion.locator('[data-companion-view="graph"]').click();
  await graphPanel.locator('[data-graph-node="model_causalselfattention"][data-selected]').waitFor({ timeout: 5000 });
  await graphPanel.locator('[data-graph-clear]').click(); // the graph's selection off; the Files selection stays
  await files();
});

await symbolRow('model_gpt_forward').click();
const before = { keys: await keys(), asks: asks.length };
await check('4 highlighted code does NOT auto-attach: a drag over lines 177-179 only highlights them and offers [Ask in chat] [Add to canvas] [Copy]', async () => {
  await drag(177, 179);
  assert.match(await selected(), /tok_emb = self\.transformer\.wte/);
  assert.equal(await actions.count(), 1);
  assert.deepEqual((await actions.getByRole('button').allInnerTexts()).map((t) => t.trim()), ['Ask in chat', 'Add to canvas', 'Copy']);
  assert.match(await actions.innerText(), /model\.py:177–179/);
  await reader.locator('[data-highlighted][data-source-line="177"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  assert.deepEqual(await lit(), [177, 178, 179]);
  assert.deepEqual(await keys(), before.keys, 'the composer context did not move');
  assert.equal(asks.length, before.asks, 'nothing was sent');
  await page.keyboard.press('Escape'); // Esc drops the offer, the selection stays the learner's
  assert.equal(await actions.count(), 0);
});

await check('5 Ask in chat attaches the exact range and writes the question, sending nothing: a dashed model.py 177–179 chip, a Code card on the canvas', async () => {
  const cards = await page.getByLabel('Lesson canvas').locator('[data-block-id]').count();
  await drag(177, 179);
  await shot('F-highlighted-code-actions');
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  await chipFor(linesKey('model.py', 177, 179));
  assert.deepEqual(await keys(), [linesKey('model.py', 177, 179)], 'the range replaces the symbol as the Files selection');
  await page.waitForTimeout(200);
  assert.equal(await field().inputValue(), 'What do lines 177–179 of model.py do?');
  assert.equal(asks.length, before.asks, 'nothing was sent');
  assert.equal(await actions.count(), 0);
  await reader.locator('[data-highlighted][data-source-line="177"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  assert.deepEqual(await lit(), [177, 178, 179], 'the attached range stays highlighted');
  await page.waitForFunction((n) => document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]').length === n + 1, cards, { timeout: 10000 });
});
await shot('G-composer-range-chip');

await check('7 context survives follow-up prompts: five questions in a row, the brief\'s "Show me the data flow." among them, each carry the same range once', async () => {
  for (const text of ['Why are token and positional embeddings added here?', 'Why?', 'What calls this?', 'What happens next?', 'Show me the data flow.']) {
    const sent = await send(text);
    assert.equal(sent.message, text);
    assert.deepEqual(codeRefs(sent).map((r) => [r.sourceId, r.range]), [[SRC('model.py'), { path: 'model.py', start: 177, end: 179 }]]);
    assert.deepEqual(sent.repository_context, { commit: COMMIT });
    assert.deepEqual(await keys(), [linesKey('model.py', 177, 179)]);
  }
  assert.equal(await page.locator('[data-chat-pane]').getByText('No matches.').count(), 0, 'no question became a search');
});
await shot('G2-follow-ups');

await check('12 the selected source reaches the repository ask: /api/learn/ask in project scope with the range identity, no source text in the code ref or the repository context', async () => {
  const sent = asks.at(-1);
  assert.equal(sent.scope.app, REPO);
  assert.doesNotMatch(JSON.stringify([codeRefs(sent), sent.repository_context]), /tok_emb|transformer\.wte/, 'no code text rides in the identity');
});

await check('8 clearing the selection: x on the range chip drops it; the next question carries no code ref, the repository at its commit', async () => {
  await page.locator('[data-chat-pane] [data-code-selection]').filter({ hasText: 'model.py' }).getByRole('button', { name: /^Remove .* from the selection$/ }).click();
  await page.waitForFunction(() => !document.querySelector('[data-chat-pane] [data-code-selection]'), null, { timeout: 5000 });
  const sent = await send('And the repository?');
  assert.deepEqual(codeRefs(sent), []);
  assert.deepEqual(sent.repository_context, { commit: COMMIT });
  assert.match(await reader.locator('[data-source-title]').innerText(), /^karpathy\/nanoGPT › model\.py/, 'the reader keeps the file it shows');
});

await check('10 a large selection keeps its whole range and stays bounded: 1-330 is one range identity, no text in it', async () => {
  await line(1).evaluate((n) => n.scrollIntoView({ block: 'center' }));
  await line(1).getByRole('button', { name: 'Select line 1' }).click();
  await line(330).getByRole('button', { name: 'Select line 330' }).click({ modifiers: ['Shift'] });
  assert.match(await actions.innerText(), /model\.py:1–330/);
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  await chipFor(linesKey('model.py', 1, 330));
  const sent = await send('How does data flow through this?'); // 'Walk me through …' would be a learning request (router.js LEARN_INTENT)
  const [ref] = codeRefs(sent);
  assert.deepEqual(ref.range, { path: 'model.py', start: 1, end: 330 });
  assert.ok(JSON.stringify(ref).length < 400, `the code ref stays small: ${JSON.stringify(ref).length} bytes`);
});

await check('11 internal code controls and copy never navigate or change context: a line number, Ctrl+C, a folder toggle', async () => {
  const url = page.url(), length = await page.evaluate(() => history.length), was = await keys();
  await drag(52, 54);
  await page.keyboard.press('Control+C');
  await line(60).getByRole('button', { name: 'Select line 60' }).click();
  await tree.locator('summary', { hasText: 'config' }).click();
  await fileRow('config/train_gpt2.py').waitFor();
  await tree.locator('summary', { hasText: 'config' }).click();
  assert.equal(page.url(), url); assert.equal(await page.evaluate(() => history.length), length);
  assert.deepEqual(await keys(), was);
  assert.match(await actions.innerText(), /model\.py:60/, 'a line number only offers the line');
  await page.keyboard.press('Escape');
});

await check('6 Learn this in the Graph writes a ready question and sends nothing; the Tutor chooses the pedagogy', async () => {
  const n = asks.length, sent = learnRequests.length;
  await graph();
  await graphNode('model_block');
  await graphPanel.locator('[data-node-learn]').click();
  await page.waitForTimeout(300);
  assert.equal(await field().inputValue(), 'Teach me Block');
  assert.equal(asks.length, n, 'Learn this sent no question'); assert.equal(learnRequests.length, sent);
  await field().fill('');
  await graphPanel.locator('[data-graph-clear]').click();
});

// Ask in chat focuses the composer; the next range is dragged after going back to the companion's Files view, at train.py.
const panelFiles = async () => {
  await files();
  const source = reader.locator('[data-source-line="5"]');
  if (!await source.count()) await fileRow('train.py').click();
  await source.waitFor({ timeout: 10000 });
};

await check('10 Files beside Chat: a file opens, Ask in chat puts the lines on the canvas as a selected Code card and writes the question, with the range as context; nothing is sent', async () => {
  const n = asks.length, sent = learnRequests.length;
  await open(`/apps/${REPO}?tab=code`);
  await tree.waitFor({ timeout: 10000 });
  assert.equal(await view(), 'files', 'the companion opens on Files');
  assert.ok(await page.locator('[data-chat-pane]').first().isVisible(), 'Chat stays visible beside it');
  await fileRow('train.py').click();
  await line(5).waitFor({ timeout: 10000 });
  await drag(5, 7);
  // The panel's selection offers exactly Ask in chat and Copy (owner, 2026-10-08).
  assert.deepEqual((await actions.getByRole('button').allInnerTexts()).map((t) => t.trim()), ['Ask in chat', 'Add to canvas', 'Copy']);
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  await chipFor(linesKey('train.py', 5, 7));
  // The question lands just after its chip: wait for it rather than read once (a race on 60422ff5, Toolbar 2026-10-15).
  for (let i = 0; i < 30 && (await field().inputValue()) !== 'What do lines 5–7 of train.py do?'; i++) await page.waitForTimeout(100);
  assert.equal(await field().inputValue(), 'What do lines 5–7 of train.py do?');
  // The lines are on the canvas as a Code card (owner, 2026-10-08: "put the highlighted code as code card"), holding exactly
  // them, selected: the selected-card chip names it, beside the code chip.
  const lines = content['train.py'].split('\n').slice(4, 7);
  const codeCards = page.getByLabel('Lesson canvas').locator('[data-block-id]').filter({ hasText: lines[0].trim() }).filter({ hasText: 'train.py' });
  await codeCards.first().waitFor({ timeout: 10000 });
  assert.equal(await codeCards.count(), 1, 'one Code card');
  for (const text of lines.filter((l) => l.trim())) assert.ok((await codeCards.first().innerText()).includes(text.trim()), `the card holds ${text.trim()}`);
  const cardId = await codeCards.first().getAttribute('data-block-id');
  await page.locator(`[data-chat-pane] [data-selected-card="${cardId}"]`).waitFor({ timeout: 5000 });
  // Ask in chat on the same lines again reselects that card: no second card.
  await panelFiles();
  await drag(5, 7);
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await codeCards.count(), 1, 'the same lines make no second card');
  await page.locator(`[data-chat-pane] [data-selected-card="${cardId}"]`).waitFor({ timeout: 5000 });
  assert.equal((await keys()).filter((k) => k === linesKey('train.py', 5, 7)).length, 1, 'one chip for the range');
  await page.waitForTimeout(500);
  assert.equal(asks.length, n, 'Ask wrote the question and sent nothing'); assert.equal(learnRequests.length, sent);
  await shot('L-learn-files-ask');
});

await check('10b Copy in the panel says Copied on the button; pasting it on the canvas asks Code card or Jupyter notebook first, and Cancel places nothing; prose pastes as text', async () => {
  const n = asks.length, sent = learnRequests.length, canvasFrame = page.getByLabel('Lesson canvas');
  await panelFiles();
  await drag(5, 7);
  await actions.getByRole('button', { name: 'Copy', exact: true }).click();
  await actions.getByRole('button', { name: 'Copied', exact: true }).waitFor({ timeout: 5000 }); // in place, not a corner toast
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // The OS clipboard may hand back CRLF (Windows); the paste below keeps it, as a real paste would, and map-files.js same() must still match.
  assert.equal(copied.replace(/\r\n/g, '\n'), content['train.py'].split('\n').slice(4, 7).join('\n'));
  const paste = (text) => page.evaluate((t) => { document.activeElement?.blur(); const data = new DataTransfer(); data.setData('text/plain', t); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true })); }, text);
  const dialog = page.locator('[data-file-import-dialog]');
  await paste(copied);
  await dialog.locator('[data-import-file]').waitFor({ timeout: 5000 }); // the wrapper has no box of its own: the dialog inside is fixed
  assert.equal((await dialog.locator('[data-import-file]').innerText()).trim(), 'train.py', 'text copied from a file keeps its name');
  assert.deepEqual((await dialog.locator('[data-import-choice]').allInnerTexts()).map((t) => t.trim()), ['Code card', 'Jupyter notebook']);
  await shot('L-paste-code-dialog');
  const cards = await canvasFrame.locator('[data-block-id]').count(); // case 10's Code card is already there
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  assert.equal(await canvasFrame.locator('[data-block-id]').count(), cards, 'Cancel placed nothing');
  await paste(copied);
  await dialog.locator('[data-import-file]').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  await paste(copied);
  await dialog.locator('[data-import-choice="code"]').click();
  await dialog.getByRole('button', { name: 'Add to canvas', exact: true }).click();
  await page.waitForFunction((n) => document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]').length === n + 1, cards, { timeout: 10000 });
  // Code from elsewhere (the conservative heuristic) asks too, named snippet.py; a notebook is offered and nothing runs.
  await paste('def attention(q, k, v):\n    w = q @ k.T\n    return w @ v');
  await dialog.locator('[data-import-file]').waitFor({ timeout: 5000 });
  assert.equal((await dialog.locator('[data-import-file]').innerText()).trim(), 'snippet.py');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Plain prose is a text paste, as before: no dialog.
  await paste(`Attention weighs every token ${run}.`);
  await page.waitForTimeout(600);
  assert.equal(await dialog.count(), 0, 'prose asks nothing');
  await canvasFrame.getByText(`Attention weighs every token ${run}.`).first().waitFor({ timeout: 5000 });
  assert.equal(asks.length, n, 'copying and pasting asked nothing'); assert.equal(learnRequests.length, sent);
});

await check('10c Send carries the Code card and the line range on the Learn chat path, and the answer stays tied to them; Files keeps its file across a view switch', async () => {
  const n = asks.length, tutorTurns = learnRequests.filter((p) => p.startsWith('/api/learn/tutor')).length;
  // Ask in chat once more: its Code card is selected again and the question waits, unsent.
  await panelFiles();
  await drag(5, 7);
  await actions.getByRole('button', { name: 'Ask in chat', exact: true }).click();
  const pill = page.locator('[data-chat-pane] [data-selected-card]').first();
  await pill.waitFor({ timeout: 5000 });
  const cardId = await pill.getAttribute('data-selected-card');
  assert.equal(asks.length, n, 'nothing sent before Send');
  await field().fill('What do lines 5–7 of train.py do?');
  await field().press('Enter');
  await page.getByText(`${ANSWER} #${n + 1}`).first().waitFor({ timeout: 10000 });
  assert.equal(asks.length, n + 1, 'one stubbed ask');
  const sent = asks.at(-1);
  assert.deepEqual(codeRefs(sent).map((r) => [r.sourceId, r.range]), [[SRC('train.py'), { path: 'train.py', start: 5, end: 7 }]]);
  assert.deepEqual(sent.repository_context, { commit: COMMIT });
  assert.equal(sent.canvas_target?.id, cardId, 'the Code card rides as the selected card');
  assert.ok(String(sent.canvas_target?.text || '').includes(content['train.py'].split('\n')[4].trim()), 'with its lines');
  assert.equal(learnRequests.filter((p) => p.startsWith('/api/learn/tutor')).length, tutorTurns, 'not a Tutor turn');
  await shot('L-learn-files-send');
  // Every view stays mounted: the Graph and back finds Files where it was.
  await graph();
  await files();
  assert.equal(await fileRow('train.py').getAttribute('aria-current'), 'true', 'Files kept train.py open');
});

await check('10d a code reference in an answer opens Files beside Chat at that range, selected; a path the repository does not have stays text; nothing is asked', async () => {
  const n = asks.length;
  cite = 'The causal mask is applied in model.py:177-179, and nanogpt/missing.py:1-2 does not exist.';
  await field().fill('Where is the causal mask applied?');
  await field().press('Enter');
  await page.getByText(`${ANSWER} #${n + 1}`).first().waitFor({ timeout: 10000 });
  const link = page.getByRole('button', { name: 'Open model.py lines 177–179', exact: true }).first();
  await link.waitFor({ timeout: 5000 });
  assert.equal(await page.locator('[data-code-ref^="nanogpt/missing.py"]').count(), 0, 'an unknown path is no link');
  assert.ok(await page.getByText(/nanogpt\/missing\.py:1-2 does not exist/).count() > 0, 'it stays as text');
  // From another view, the click turns the companion to Files, model.py, lines 177-179 selected (Ask in chat and Copy act on).
  await graph();
  await link.click();
  await shows('files');
  await learnFiles.locator('[data-file-row="model.py"][aria-current="true"]').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-learn-files] [data-highlighted]')].map((n) => n.dataset.sourceLine).join() === '177,178,179', null, { timeout: 10000 });
  assert.deepEqual((await actions.getByRole('button').allInnerTexts()).map((t) => t.trim()), ['Ask in chat', 'Add to canvas', 'Copy']);
  assert.ok(await line(177).isVisible(), 'scrolled into view');
  assert.ok(await page.locator('[data-chat-pane]').first().isVisible(), 'Chat stays beside it');
  await page.waitForTimeout(400);
  assert.equal(asks.length, n + 1, 'the click asked nothing');
  await shot('L-code-ref-open');
});

await check('9 another repository or canvas never inherits the context: a canvas shows no code chip and no Graph view, another project starts with nothing selected', async () => {
  await page.evaluate((to) => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }, `/apps/${canvas.name}`);
  await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  assert.deepEqual(await keys(), []);
  assert.equal(await page.locator('[data-companion-view="graph"]').count(), 0, 'no repository on a plain canvas');
  await open(`/apps/${REPO2}`);
  assert.deepEqual(await keys(), []);
  await graph();
  assert.equal(await graphPanel.locator('[data-graph-node][data-selected]').count(), 0);
  await files();
  assert.equal(await reader.count(), 0, 'no file is open');
});

await check('15 §2: the Graph\'s search focuses the matching nodes', async () => {
  await open();
  await graph();
  assert.equal(await search.getAttribute('placeholder'), 'Search files or symbols…');
  await search.fill('Block');
  await shot('B-graph-search');
  const shown = await graphPanel.locator('[data-graph-node]').evaluateAll((all) => all.map((n) => n.getAttribute('aria-label')));
  assert.ok(shown.length && shown.every((l) => /block/i.test(l)), `Graph focuses the matches: ${shown.join(', ')}`);
  await search.fill('');
});

await check('no page errors, no model call, nothing but stubbed asks', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(learnRequests, []);
  assert.ok(asks.length >= 9, `${asks.length} stubbed asks`);
});

await browser.close();
console.log(`${results.length}/${results.length} checks passed`);
