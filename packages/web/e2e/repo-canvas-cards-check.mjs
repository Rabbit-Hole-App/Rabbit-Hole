// Repository cards on the canvas, Release 2 (owner brief C:/s/spec/repo-canvas-graph.md "Graph -> Add to canvas" and the
// Clarification sections 2-11; lane contract C:/s/spec/repo-graph-r2-plan.md). A code card (`repo-code`) and an
// interactive graph card (`repo-graph`) made from the companion Graph, its right-click menu and the Files viewer, and a
// code card from a dropped local file: the right source and revision, placement beside existing cards, one Undo step and
// Redo, reload, duplicate prevention (an equivalent card is revealed, Ctrl+D still duplicates), Open source, graph-card
// interaction that never moves the outer canvas, context and dedupe, inert code, and a viewer without repository access.
// LOCAL stack only. The repository is the shared nanoGPT stub (e2e/nanogpt-repository-fixture.mjs); its row is seeded in
// local D1 for the run, so the board saves and the share link are the server's own (as rabbit-hole-check LOCAL does).
// No model is ever called: /api/learn/ask and the Curious hook are scripted, every other model-capable route is aborted and
// counted, and none may happen. A viewer's reads go to the real server, unstubbed: the server alone decides access.
// Prints `ok <label>` or `FAIL <label> - <reason>` per check, counts and ids only (no cookies, no secrets); exits 1 on any
// failure. Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8911 SMALL_CP=http://127.0.0.1:8913 VARS=<cp .dev.vars> PERSIST=<stack persist dir>
//   D1_CONFIG=<app wrangler config> [WRANGLER_BIN=<wrangler.js>] OUT=<dir> node e2e/repo-canvas-cards-check.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMIT, REPO, SNAPSHOT, content, routeRepository } from './nanogpt-repository-fixture.mjs';

// ---------------------------------------------------------------- names the lanes own (aligned at merge)
// Labels are the brief's own words (section 1 and "Card contents"); data-* names not fixed by the contract live here only.
const SELECTORS = {
  codeCard: '[data-repo-code-card]', // CODE: CodeCard.jsx root, inside the canvas card [data-block-id]
  graphCard: '[data-repo-graph-card]', // GRAPH: GraphCard.jsx root
  graphCardScope: '[data-graph-card-scope]', // GRAPH: the header's Whole graph / Subgraph label
  unavailable: 'Repository content unavailable', // ACCESS: owner decision 5, verbatim
  openSource: 'Open source', addToChat: 'Add to chat', createCodeCard: 'Create code card', // card controls
  openInCompanion: /^(Open in (the )?(companion|Graph)|Expand)/i, // GRAPH: the graph card's expand-to-companion control
  addToCanvas: 'Add to canvas', // the selection controls' menu button, when the choices sit behind one
  addCodeCard: 'Add code card', addSelectionAsGraph: 'Add selection as graph', addGraphToCanvas: 'Add graph to canvas',
  // Context: a graph card selected with no node inside it rides as a graph-scope ref (GRAPH).
  graphScopeRef: ref => ref.kind === 'graph' || String(ref.sourceId || '').startsWith('graph:'),
  // ACCESS: the owner-checked source route for a card. Owner reads are served from the fixture here (a keyless stack has no
  // repository files); a viewer's read is never stubbed.
  cardSource: path => new RegExp(`^/api/repositories/${REPO}/(source|card-source|file)$`).test(path),
};

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8913';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('repo-canvas-cards-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/repo-canvas-cards', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const login = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const session = await login(`rcc-${run}@example.com`);
// The viewer is another organization: no membership, no repository of theirs.
const viewerSession = await login(`rcc-viewer-${run}@example.net`);
const api = async (path, init = {}, as = session) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${as}`, 'content-type': 'application/json', ...init.headers } });
  return { status: response.status, text: await response.text() };
};
const json = async (...args) => JSON.parse((await api(...args)).text || 'null');
const catalog = await json('/api/apps');

// The project's row in local D1 for the whole run: board saves and share links are served only for a repository the server
// knows (rabbit-hole-check seedProject). Deleted first by org and name, so a killed run's row never blocks this one.
const seedProject = on => {
  const where = `org='${catalog.org}' AND name='${REPO}'`;
  const sql = [`DELETE FROM repository_apps WHERE ${where}`, ...(on ? [`INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${REPO}','${catalog.email}','karpathy/nanoGPT','master','${COMMIT}','ready')`] : [])].join('; ');
  const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
  const cwd = fileURLToPath(new URL('../../../', import.meta.url)), stdio = ['ignore', 'ignore', 'inherit'];
  if (process.env.WRANGLER_BIN) execFileSync(process.execPath, [process.env.WRANGLER_BIN, 'd1', 'execute', 'rabbit-hole-learn-dev', '--local', '--persist-to', PERSIST, '--config', D1_CONFIG, '--command', sql], { cwd, stdio, windowsHide: true });
  else execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to "${PERSIST}" -c "${D1_CONFIG}" --command "${sql}"`, { cwd, shell: true, stdio });
};
seedProject(true);

// Two existing cards a new card must never cover or move (section 9).
const BLOCKS = [
  { id: 'rcc-note', type: 'explanation', x: 80, y: 80, w: 320, h: 160, title: 'Attention notes', body: 'Why the causal mask matters.' },
  { id: 'rcc-next', type: 'explanation', x: 440, y: 80, w: 320, h: 160, title: 'Training loop', body: 'How the training script steps the optimizer.' },
];
const boardKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${REPO}:ink`;
const seed = [boardKey, { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: BLOCKS }];
const N = { train: 'train', model: 'model', gpt: 'model_gpt', attn: 'model_causalselfattention', sample: 'sample' };
const line = (path, n) => content[path].split('\n')[n - 1].trim();
const PRIVATE = ['model.py', 'train.py', 'bench.py', 'model_gpt', 'CausalSelfAttention', line('model.py', 118)]; // never to a viewer

// ---------------------------------------------------------------- routes: capture, scripted answers, refuse the rest
const captured = [], hooks = [], refused = [], outside = [], errors = [], sourceReads = [];
let replies = 0, holdSource = null;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/(ask|learn-course)$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/(plan|handoff)|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  // Anything elsewhere is aborted; a write elsewhere (a notebook kernel, an upload host) is counted and fails the run.
  if (url.origin !== BASE) { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) outside.push(`${request.method()} ${url.hostname}`); return route.abort(); }
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (SELECTORS.cardSource(path)) {
    const ask = { ...Object.fromEntries(url.searchParams), ...body };
    sourceReads.push({ path: ask.path, commit: ask.commit ?? null });
    if (holdSource) await holdSource;
    if (ask.commit && ask.commit !== COMMIT) return route.fulfill({ status: 404, json: { error: 'Repository content unavailable' } });
    return route.fulfill({ json: { path: ask.path, commit: COMMIT, content: content[ask.path] ?? '', text: content[ask.path] ?? '' } });
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Scripted answer ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `rcc-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/next-steps') { hooks.push(body); return route.fulfill({ json: { set_id: `rcc-set-${hooks.length}`, generated_at: new Date().toISOString(), options: [] } }); }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\/rcc-/.test(path)) return route.fulfill({ json: { ok: true } });
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
let page = null, context = null;
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const lines = String(error?.message || error).split('\n'), why = lines.find(l => /intercepts pointer events|not visible|outside of the viewport|not enabled/.test(l));
    const message = `${lines[0]}${why ? ` (${why.replace(/\u001b\[[0-9;]*m/g, '').trim().slice(0, 240)})` : ''}`.slice(0, 600);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const openContext = async ({ viewport = { width: 1800, height: 1000 }, as = session, owner = true } = {}) => {
  await context?.close();
  context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: as, url: BASE }]);
  if (owner) {
    await context.addInitScript(([key, value]) => { if (window !== window.top) return; try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* a sandboxed frame */ } }, seed);
    await routeRepository(context); // registered first, so the router below runs first and falls back to it
  }
  await context.route('**/*', router);
  page = await context.newPage();
  page.setDefaultTimeout(15000); // an action on a missing control fails in 15 s instead of waiting forever
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const box = locator => locator.boundingBox();

// ---------------------------------------------------------------- page helpers (Release 1 names, repo-canvas-graph-check)
const canvasFrame = () => page.locator('[aria-label="Lesson canvas"]');
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
const explore = () => page.locator('button[aria-label="Explore codebase"]');
const companion = () => page.locator('[data-companion]');
const graphPanel = () => page.locator('[data-companion] [data-graph-panel]');
const view = () => companion().locator('[data-companion-view][aria-pressed="true"]').getAttribute('data-companion-view', { timeout: 2000 }).catch(() => null);
const showView = id => companion().locator(`[data-companion-view="${id}"]`).click();
const node = (id, scope = graphPanel()) => scope.locator(`[data-graph-node="${id}"] :is(circle, rect)`).first();
const selectedIn = scope => scope.locator('[data-graph-node][data-selected]').evaluateAll(all => all.map(n => n.dataset.graphNode).sort());
const cameraOf = scope => scope.locator('[data-graph-layer]').first().getAttribute('transform');
const entries = () => pane().evaluate(() => [...document.querySelectorAll('[data-chat-pane] [data-context-chip], [data-chat-pane] [data-context-selection], [data-chat-pane] [data-code-selection]')]
  .filter((el, i, all) => !all.some(other => other !== el && other.contains(el)))
  .map(el => ({ key: el.getAttribute('data-ref-key'), chip: el.getAttribute('data-context-chip'), temporary: el.hasAttribute('data-context-selection') || el.hasAttribute('data-code-selection') })));
const codeRefs = body => (body.context_refs || []).filter(ref => ref.kind === 'code' || String(ref.sourceId).startsWith('code:'));
const companionOpen = async () => ((await companion().boundingBox().catch(() => null))?.width ?? 0) > 100;
const openCanvas = async (path = `/apps/${REPO}`) => {
  await page.goto(`${BASE}${path}`);
  await canvasFrame().waitFor({ timeout: 60000 });
  await page.locator('[aria-label="Lesson canvas"] [data-block-id="rcc-note"]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
};
const openGraph = async () => {
  if (await companionOpen() && await view() === 'graph') return;
  await explore().click();
  await graphPanel().waitFor({ state: 'visible', timeout: 15000 });
  await node(N.train).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
};
const askMode = async () => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === 'ask') return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator('[data-chat-mode-option="ask"]').click();
  await page.waitForTimeout(200);
};
const send = async text => {
  await askMode();
  await field().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000, 'no ask was sent for the turn');
  await pane().getByText(`Scripted answer ${captured[n].reply}.`, { exact: false }).first().waitFor({ timeout: 15000 });
  return captured[n].body;
};

// The board as this browser saved it (canvas-persist.js: the canvas's storageKey, then the server copy).
const blocks = () => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || '{}').blocks || []; } catch { return []; } }, boardKey);
const ofType = async type => (await blocks()).filter(b => b.type === type);
const cardEl = id => canvasFrame().locator(`[data-block-id="${id}"]`).first();
const waitCount = (type, n, what) => waitFor(async () => (await ofType(type)).length === n, 8000, `${what}: ${type} count is not ${n}`);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// A new card never covers an existing one and never moves it.
const assertPlaced = async (added, what) => {
  const all = await blocks(), ids = new Set(added.map(b => b.id));
  for (const seeded of BLOCKS) {
    const now = all.find(b => b.id === seeded.id);
    assert.deepEqual([now.x, now.y], [seeded.x, seeded.y], `${what}: ${seeded.id} moved`);
  }
  for (const a of added) for (const b of all) if (!ids.has(b.id) || a.id < b.id) if (a.id !== b.id && overlaps(a, b)) throw Error(`${what}: ${a.id} overlaps ${b.id}`);
  // Visible in the canvas viewport, not under the companion or Chat.
  const frame = await box(canvasFrame());
  for (const a of added) {
    const r = await box(cardEl(a.id));
    assert.ok(r && r.x >= frame.x - 1 && r.x + Math.min(r.width, 120) <= frame.x + frame.width + 1 && r.y < frame.y + frame.height, `${what}: ${a.id} is not in the visible canvas`);
  }
};
// An empty point of the canvas surface, to give the canvas keyboard focus without selecting anything.
const emptyCanvasPoint = async () => {
  const f = await box(canvasFrame());
  const p = await page.evaluate(([x0, y0, w, h]) => {
    for (let y = y0 + h - 60; y > y0 + 60; y -= 24) for (let x = x0 + 60; x < x0 + w - 60; x += 24) {
      const el = document.elementFromPoint(x, y);
      if (el?.closest('[aria-label="Lesson canvas"]') && !el.closest('[data-block], button, a, input, textarea, [role="toolbar"], [role="menu"], nav, aside, svg')) return { x, y };
    }
    return null;
  }, [f.x, f.y, f.width, f.height]);
  assert.ok(p, 'an empty point on the canvas');
  return p;
};
const focusCanvas = async () => { const p = await emptyCanvasPoint(); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200); };
const undo = async () => { await focusCanvas(); await page.keyboard.press('Control+z'); await page.waitForTimeout(500); };
const redo = async () => { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(500); };
// The graph's add choices: a direct control, or one behind the selection controls' Add to canvas menu.
const chooseAdd = async label => {
  const direct = graphPanel().getByRole('button', { name: label, exact: true });
  if (await direct.count() && await direct.first().isVisible()) return direct.first().click();
  await graphPanel().getByRole('button', { name: SELECTORS.addToCanvas, exact: true }).first().click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
};
// What the insertion must leave alone: no ask, no model call, no message, no pinned chip, the draft.
const quiet = async () => ({ asks: captured.length, refused: refused.length, pinned: (await entries()).filter(e => e.chip === 'ready').length, draft: await field().inputValue() });
const assertRepositorySource = (block, path, what) => {
  assert.equal(block.source?.kind, 'repository', `${what}: a repository source`);
  assert.deepEqual([block.source.app, block.source.repo, block.source.commit, block.source.path], [REPO, 'karpathy/nanoGPT', COMMIT, path], `${what}: source ${JSON.stringify(block.source)}`);
  // A repository card stores NO source text (contract): the server reads it at its commit.
  const raw = JSON.stringify(block), sample = content[path].split('\n').map(l => l.trim()).filter(l => l.length > 24).slice(0, 5);
  assert.ok(!sample.some(l => raw.includes(l)), `${what}: source text is stored in the board`);
};

// ================================================================ the run
await openContext();
const draft = `draft ${run} stays`;

await check('1 a node right-click Add code card makes one repo-code card at the commit and symbol, beside the existing cards; it asks, sends and pins nothing', async () => {
  await openCanvas();
  await openGraph();
  await field().fill(draft);
  const before = await quiet();
  await node(N.gpt).click({ button: 'right' });
  await page.getByRole('menuitem', { name: SELECTORS.addCodeCard, exact: true }).click();
  await waitCount('repo-code', 1, 'Add code card');
  const [card] = await ofType('repo-code');
  assertRepositorySource(card, 'model.py', 'the GPT card');
  assert.equal(card.source.nodeId, N.gpt, 'the graph node rides');
  if (card.source.start != null) assert.equal(card.source.start, 118, 'the symbol starts where the index says');
  await assertPlaced([card], 'one card');
  const el = cardEl(card.id).locator(SELECTORS.codeCard);
  await el.waitFor({ timeout: 15000 });
  await el.getByText(line('model.py', 118), { exact: false }).first().waitFor({ timeout: 15000 });
  const text = (await el.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /model\.py/, 'the card names its path');
  assert.ok(text.includes(COMMIT.slice(0, 7)), 'the card shows its commit, short');
  await waitFor(async () => await el.locator('pre span[style*="color"], code span[style*="color"]').count() > 0, 15000, 'no syntax highlighting (shiki)');
  await page.waitForTimeout(600);
  assert.deepEqual(await quiet(), before, 'Add to canvas is independent from Chat: nothing asked, sent or pinned; the draft stays');
  facts.c1 = { source: card.source, w: card.w, h: card.h };
  await shot('01-code-card-from-node');
});

const finish = () => {
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, commit: COMMIT, results, facts }, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`repo-canvas-cards-check: ${results.length - failed.length}/${results.length} checks passed`);
  return failed.length ? 1 : 0;
};
// Every case below starts from a code card on the repository canvas: without one they would only time out one by one.
if (!results[0].ok) { console.log('stopped: no code card was made, so no other check can run'); await browser.close(); seedProject(false); process.exit(finish()); }

await check('2 one Undo removes the card, Redo restores the same card and source', async () => {
  const [card] = await ofType('repo-code');
  await undo();
  await waitCount('repo-code', 0, 'Undo');
  await redo();
  await waitCount('repo-code', 1, 'Redo');
  const [back] = await ofType('repo-code');
  assert.equal(back.id, card.id, 'the same card');
  assert.deepEqual(back.source, card.source, 'the same source');
});

await check('3 an equivalent Add code card reveals the existing card, never a second; Ctrl+D still duplicates on purpose, sharing the source', async () => {
  const [card] = await ofType('repo-code');
  await node(N.gpt).click({ button: 'right' });
  await page.getByRole('menuitem', { name: SELECTORS.addCodeCard, exact: true }).click();
  await page.waitForTimeout(800);
  assert.equal((await ofType('repo-code')).length, 1, 'no duplicate for the same source and range');
  const el = cardEl(card.id), r = await box(el), f = await box(canvasFrame());
  assert.ok(r && r.y < f.y + f.height && r.y + r.height > f.y, 'the existing card is in view');
  // Intentional duplicate: the normal canvas Duplicate (Ctrl+D) on the selected card.
  await el.click({ position: { x: 12, y: 8 } });
  await waitFor(async () => await el.getAttribute('aria-current') === 'true', 3000, 'the card did not select');
  await page.keyboard.press('Control+d');
  await waitCount('repo-code', 2, 'Ctrl+D');
  const twins = await ofType('repo-code');
  assert.deepEqual(twins[0].source, twins[1].source, 'the duplicate shares the source reference');
  await undo();
  await waitCount('repo-code', 1, 'Undo of the duplicate');
});

await check('4 three selected nodes, Add code card: one card per code node as a compact group, no neighbour added, no overlap; one Undo removes all, Redo restores all', async () => {
  await openGraph();
  await node(N.train).click();
  for (const id of [N.sample, N.attn]) await node(id).click({ modifiers: ['Shift'] });
  await waitFor(async () => (await selectedIn(graphPanel())).length === 3, 3000, 'three selected');
  const before = (await ofType('repo-code')).map(b => b.id), q = await quiet();
  await chooseAdd(SELECTORS.addCodeCard);
  await waitCount('repo-code', before.length + 3, 'Add code card for three');
  const added = (await ofType('repo-code')).filter(b => !before.includes(b.id));
  assert.deepEqual(added.map(b => b.source.nodeId).sort(), [N.attn, N.sample, N.train].sort(), 'exactly the selected nodes');
  for (const b of added) assert.equal(b.source.commit, COMMIT);
  await assertPlaced(added, 'the group');
  const xs = added.map(b => [b.x, b.y, b.x + b.w, b.y + b.h]);
  const span = Math.max(...xs.map(r => r[2])) - Math.min(...xs.map(r => r[0])) + Math.max(...xs.map(r => r[3])) - Math.min(...xs.map(r => r[1]));
  assert.ok(span < 4 * (added[0].w + added[0].h), `a compact group, not scattered (${Math.round(span)})`);
  assert.deepEqual({ ...await quiet(), draft: q.draft }, q, 'nothing asked, sent or pinned');
  await shot('02-three-code-cards');
  await undo();
  await waitCount('repo-code', before.length, 'one Undo for the whole insertion');
  await redo();
  await waitCount('repo-code', before.length + 3, 'Redo for the whole insertion');
  facts.c4 = added.map(b => ({ id: b.id, nodeId: b.source.nodeId, x: b.x, y: b.y }));
});

await check('5 Add selection as graph: one repo-graph subgraph card with exactly the selected nodes and their known links, no neighbour; one Undo removes it', async () => {
  await openGraph();
  await node(N.train).click();
  for (const id of [N.model, N.gpt]) await node(id).click({ modifiers: ['Shift'] });
  await waitFor(async () => (await selectedIn(graphPanel())).length === 3, 3000, 'three selected');
  await chooseAdd(SELECTORS.addSelectionAsGraph);
  await waitCount('repo-graph', 1, 'Add selection as graph');
  const [card] = await ofType('repo-graph');
  assert.equal(card.scope, 'subgraph');
  assert.deepEqual([...card.nodeIds].sort(), [N.gpt, N.model, N.train].sort(), 'the selected nodes, no neighbour');
  assert.deepEqual([card.repository?.app, card.repository?.repo, card.repository?.commit], [REPO, 'karpathy/nanoGPT', COMMIT], `the repository at its commit: ${JSON.stringify(card.repository)}`);
  assert.ok(!JSON.stringify(card).includes('"edges"') && JSON.stringify(card).length < 2000, 'compact card state, no serialized graph');
  await assertPlaced([card], 'the graph card');
  const el = cardEl(card.id).locator(SELECTORS.graphCard);
  await el.locator('[data-graph-node]').first().waitFor({ timeout: 20000 });
  assert.deepEqual(await el.locator('[data-graph-node]').evaluateAll(all => all.map(n => n.dataset.graphNode).sort()), [N.gpt, N.model, N.train].sort(), 'the card renders only its nodes');
  const header = (await el.innerText()).replace(/\s+/g, ' ');
  assert.match(header, /nanoGPT/, 'the card names the repository');
  assert.ok(header.includes(COMMIT.slice(0, 7)), 'the card shows its revision');
  assert.match((await el.locator(SELECTORS.graphCardScope).innerText()).trim(), /subgraph|selection|3 nodes/i, 'the card says it is a subgraph');
  facts.c5 = { id: card.id, nodeIds: card.nodeIds, repository: card.repository };
  await shot('03-subgraph-card');
});

await check('6 Add graph to canvas: one whole-graph card, every indexed node or a stated display limit; Undo removes it', async () => {
  await openGraph();
  await page.keyboard.press('Escape');
  await graphPanel().getByRole('button', { name: SELECTORS.addGraphToCanvas, exact: true }).first().click();
  await waitCount('repo-graph', 2, 'Add graph to canvas');
  const card = (await ofType('repo-graph')).find(b => b.scope === 'whole');
  assert.ok(card, 'a whole-graph card');
  assert.deepEqual(card.nodeIds, [], 'whole: no node list stored');
  await assertPlaced([card], 'the whole graph card');
  const el = cardEl(card.id).locator(SELECTORS.graphCard);
  await el.locator('[data-graph-node]').first().waitFor({ timeout: 20000 });
  const shown = await el.locator('[data-graph-node]').count(), text = (await el.innerText()).replace(/\s+/g, ' ');
  assert.ok(shown === SNAPSHOT.graph.nodes.length || /of \d+|limit|showing/i.test(text), `all ${SNAPSHOT.graph.nodes.length} nodes or a stated limit (${shown} shown)`);
  assert.match((await el.locator(SELECTORS.graphCardScope).innerText()).trim(), /whole/i, 'the card says whole graph');
  await shot('04-whole-graph-card');
  await undo();
  await waitCount('repo-graph', 1, 'Undo of the whole graph');
});

await check('7 the Files viewer Add code card and a file dragged from Files make repo-code cards for that file at the commit; the drag lands at its drop point', async () => {
  await showView('files');
  await companion().locator('[data-file-row="sample.py"]').click();
  const before = (await ofType('repo-code')).map(b => b.id);
  await companion().getByRole('button', { name: SELECTORS.addCodeCard, exact: true }).first().click();
  await waitCount('repo-code', before.length + 1, 'Files Add code card');
  const made = (await ofType('repo-code')).find(b => !before.includes(b.id));
  assertRepositorySource(made, 'sample.py', 'the Files card');
  await assertPlaced([made], 'the Files card');
  const f = await box(canvasFrame()), at = { x: f.width * 0.35, y: f.height * 0.75 };
  await companion().locator('[data-file-row="bench.py"]').dragTo(canvasFrame(), { targetPosition: at });
  await waitCount('repo-code', before.length + 2, 'dragging a file from Files');
  const dragged = (await ofType('repo-code')).find(b => b.source?.path === 'bench.py');
  assertRepositorySource(dragged, 'bench.py', 'the dragged card');
  const r = await box(cardEl(dragged.id));
  assert.ok(Math.hypot(r.x - (f.x + at.x), r.y - (f.y + at.y)) < 260, 'placed at the drop point or nearby free space');
  await assertPlaced([dragged], 'the dragged card');
});

await check('8 Open source on a code card opens Files at its revision and range, pins nothing and asks nothing', async () => {
  const card = (await ofType('repo-code')).find(b => b.source?.nodeId === N.gpt);
  const q = await quiet();
  await cardEl(card.id).getByRole('button', { name: SELECTORS.openSource, exact: true }).first().click();
  await waitFor(async () => await view() === 'files', 5000, 'Open source did not show Files');
  await companion().locator('[data-file-row="model.py"][aria-current="true"]').waitFor({ timeout: 10000 });
  await companion().locator('[data-highlighted][data-source-line="118"]').first().waitFor({ timeout: 10000 });
  assert.ok(await companion().locator('[data-source-line="118"]').isVisible(), 'scrolled to the symbol');
  assert.ok(sourceReads.every(r => !r.commit || r.commit === COMMIT), 'every read at the card commit');
  await page.waitForTimeout(400);
  assert.deepEqual(await quiet(), q, 'nothing asked or pinned');
  await shot('05-open-source');
});

await check('9 inside a graph card: click and Shift-click select nodes, background drag pans and wheel zooms the card graph only, the outer canvas and the card stay; Escape clears the inner selection only; keys stay inside', async () => {
  const card = (await ofType('repo-graph'))[0], outer = cardEl(card.id), el = outer.locator(SELECTORS.graphCard);
  const note0 = await box(cardEl('rcc-note')), card0 = await box(outer);
  await node(N.train, el).click();
  await node(N.model, el).click({ modifiers: ['Shift'] });
  await waitFor(async () => (await selectedIn(el)).length === 2, 3000, 'two nodes selected in the card');
  const svg = await box(el.locator('svg').first());
  const empty = await page.evaluate(([x0, y0, w, h]) => { for (let y = y0 + 12; y < y0 + h - 12; y += 10) for (let x = x0 + 12; x < x0 + w - 12; x += 10) { const e = document.elementFromPoint(x, y); if (e?.tagName === 'svg') return { x, y }; } return null; }, [svg.x, svg.y, svg.width, svg.height]);
  assert.ok(empty, 'an empty point of the card graph');
  const cam0 = await cameraOf(el);
  await page.mouse.move(empty.x, empty.y); await page.mouse.down();
  await page.mouse.move(empty.x + 50, empty.y + 30, { steps: 6 }); await page.mouse.up();
  await page.mouse.move(empty.x + 50, empty.y + 30); await page.mouse.wheel(0, -240);
  await page.waitForTimeout(400);
  assert.notEqual(await cameraOf(el), cam0, 'the card graph panned or zoomed');
  assert.deepEqual(await box(cardEl('rcc-note')), note0, 'the outer canvas did not move');
  const card1 = await box(outer);
  assert.deepEqual([card1.x, card1.y], [card0.x, card0.y], 'the card did not move');
  assert.equal((await selectedIn(el)).length, 2, 'panning kept the selection');
  // Keyboard: Enter selects, Space toggles, Delete never removes the card or a node.
  await el.locator(`[data-graph-node="${N.gpt}"]`).focus(); await page.keyboard.press(' ');
  await waitFor(async () => (await selectedIn(el)).length === 3, 3000, 'Space did not add');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  assert.ok((await ofType('repo-graph')).some(b => b.id === card.id), 'Delete inside the graph kept the card');
  assert.equal(await el.locator('[data-graph-node]').count(), 3, 'Delete removed no node');
  await page.keyboard.press('Escape');
  await waitFor(async () => (await selectedIn(el)).length === 0, 3000, 'Escape did not clear the inner selection');
  assert.ok((await ofType('repo-graph')).some(b => b.id === card.id), 'Escape kept the card');
  assert.deepEqual(await box(cardEl('rcc-note')), note0, 'still no outer movement');
});

await check('10 graph-card nodes give the same chips as the companion; Create code card from a card node reuses the existing card; the card opens in the companion Graph', async () => {
  const card = (await ofType('repo-graph'))[0], el = cardEl(card.id).locator(SELECTORS.graphCard);
  await node(N.gpt, el).click();
  await waitFor(async () => (await entries()).some(e => e.temporary && e.key?.startsWith('code:')), 5000, 'no temporary code chip from the card');
  const keys = (await entries()).filter(e => e.temporary).map(e => e.key);
  assert.ok(keys.every(k => k.startsWith(`code:karpathy/nanoGPT@${COMMIT}:`)), `card chips use the canonical identity: ${JSON.stringify(keys)}`);
  const count = (await ofType('repo-code')).length;
  await el.getByRole('button', { name: SELECTORS.createCodeCard, exact: true }).first().click().catch(async () => {
    await node(N.gpt, el).click({ button: 'right' });
    await page.getByRole('menuitem', { name: new RegExp(`^(${SELECTORS.createCodeCard}|${SELECTORS.addCodeCard})$`) }).click();
  });
  await page.waitForTimeout(800);
  assert.equal((await ofType('repo-code')).length, count, 'the GPT card already exists, so it is revealed, not duplicated');
  await page.keyboard.press('Escape');
  await cardEl(card.id).getByRole('button', { name: SELECTORS.openInCompanion }).first().click();
  await waitFor(async () => await companionOpen() && await view() === 'graph', 5000, 'the card did not open in the companion Graph');
});

await check('11 a selected code card rides as its code ref at its commit and range; Add to chat pins one chip; the same symbol from the graph adds no second; a whole-file card stays distinct', async () => {
  await page.keyboard.press('Escape');
  const gpt = (await ofType('repo-code')).find(b => b.source?.nodeId === N.gpt);
  await cardEl(gpt.id).getByRole('button', { name: SELECTORS.addToChat, exact: true }).first().click();
  await waitFor(async () => (await entries()).filter(e => e.chip === 'ready' && e.key?.startsWith('code:')).length === 1, 5000, 'Add to chat did not pin one chip');
  await openGraph();
  await node(N.gpt).click();
  await page.waitForTimeout(500);
  const keys = (await entries()).filter(e => e.key?.startsWith('code:')).map(e => e.key);
  assert.equal(new Set(keys).size, keys.length, `no duplicate identity: ${JSON.stringify(keys)}`);
  assert.equal(keys.filter(k => k.includes(`#${N.gpt}`)).length, 1, 'the card and the graph name GPT once');
  const body = await send('What does this class do?');
  const refs = codeRefs(body);
  facts.c11 = refs.map(r => ({ sourceId: r.sourceId, range: r.range ?? null }));
  assert.equal(refs.filter(r => r.sourceId.endsWith(`:model.py#${N.gpt}`)).length, 1, `one GPT ref: ${JSON.stringify(facts.c11)}`);
  assert.ok(refs.every(r => r.sourceId.includes(`@${COMMIT}`)), 'every ref at the card commit');
  assert.equal(body.repository_context?.commit, COMMIT);
  assert.ok(body.canvas_context, 'the whole-canvas package still rides');
  // A whole-file card of the same file is another range: Add to chat makes a second, distinct entry.
  await showView('files');
  await companion().locator('[data-file-row="model.py"]').click();
  await companion().getByRole('button', { name: SELECTORS.addCodeCard, exact: true }).first().click();
  await waitFor(async () => (await ofType('repo-code')).some(b => b.source?.path === 'model.py' && !b.source.nodeId), 5000, 'no whole-file model.py card');
  const file = (await ofType('repo-code')).find(b => b.source?.path === 'model.py' && !b.source.nodeId);
  await cardEl(file.id).getByRole('button', { name: SELECTORS.addToChat, exact: true }).first().click();
  await waitFor(async () => (await entries()).filter(e => e.chip === 'ready' && e.key?.startsWith('code:')).length === 2, 5000, 'the whole-file card did not pin a distinct chip');
  await pane().locator('[data-chat-new]').click();
});

await check('12 a graph card selected with no node inside rides as its graph scope, not every file', async () => {
  await page.keyboard.press('Escape');
  const card = (await ofType('repo-graph'))[0];
  await cardEl(card.id).click({ position: { x: 12, y: 8 } }); // the header: the card as a canvas object
  await waitFor(async () => await cardEl(card.id).getAttribute('aria-current') === 'true', 3000, 'the graph card did not select');
  const body = await send('How do these parts fit together?');
  const refs = body.context_refs || [];
  facts.c12 = refs.map(r => ({ kind: r.kind ?? null, sourceId: r.sourceId ?? null }));
  assert.ok(refs.some(SELECTORS.graphScopeRef), `a graph-scope ref: ${JSON.stringify(facts.c12)}`);
  assert.ok(codeRefs(body).length <= card.nodeIds.length, 'not every file of the repository');
});

await check('13 reload: every card keeps its source and revision, no ask on reload, no temporary chip resurrected; the server copy has the cards and no source text', async () => {
  const was = (await blocks()).filter(b => b.type.startsWith('repo-')).map(b => ({ id: b.id, type: b.type, source: b.source ?? null, repository: b.repository ?? null, nodeIds: b.nodeIds ?? null }));
  await page.waitForTimeout(1500); // the board's debounced server save
  const n = captured.length;
  await openCanvas();
  await page.waitForTimeout(1500);
  const now = (await blocks()).filter(b => b.type.startsWith('repo-')).map(b => ({ id: b.id, type: b.type, source: b.source ?? null, repository: b.repository ?? null, nodeIds: b.nodeIds ?? null }));
  assert.deepEqual(now, was, 'the same cards, sources and revisions');
  for (const b of was.filter(b => b.type === 'repo-code')) await cardEl(b.id).locator(SELECTORS.codeCard).waitFor({ timeout: 15000 });
  assert.equal(captured.length, n, 'nothing asked on reload');
  assert.equal((await entries()).filter(e => e.temporary).length, 0, 'no temporary chip after reload');
  const server = await api(`/api/learn/boards/${REPO}/main`);
  assert.equal(server.status, 200, `the owner reads the board (${server.status})`);
  for (const b of was) assert.ok(server.text.includes(b.id), `the server copy has ${b.id}`);
  assert.ok(!server.text.includes(line('model.py', 118)), 'the server copy stores no repository source text');
  facts.c13 = { cards: was.length };
});

let token = null;
await check('14 a viewer of another organization: the share link shows Repository content unavailable, and neither the board nor the source routes give a path, a node name or code', async () => {
  const state = JSON.parse(await page.evaluate(key => localStorage.getItem(key), boardKey));
  const shared = await json(`/api/learn/boards/${REPO}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state }) });
  token = shared?.sharing?.view;
  assert.ok(token, `a view link: ${JSON.stringify(shared).slice(0, 200)}`);
  const leaks = text => PRIVATE.filter(s => text.includes(s));
  const board = await api(`/api/learn/boards/shared/${token}`, {}, viewerSession);
  facts.c14 = { board: board.status };
  assert.deepEqual(leaks(board.text), [], `the shared board leaks to the viewer (HTTP ${board.status})`);
  for (const path of [`/api/repositories/${REPO}/snapshot`, `/api/repositories/${REPO}`]) {
    const r = await api(path, {}, viewerSession);
    facts.c14[path] = r.status;
    assert.ok([401, 403, 404].includes(r.status), `${path} answers the viewer ${r.status}`);
    assert.deepEqual(leaks(r.text), [], `${path} leaks to the viewer`);
  }
  await openContext({ as: viewerSession, owner: false });
  await page.goto(`${BASE}/b/${token}`);
  await canvasFrame().waitFor({ timeout: 60000 });
  await page.getByText(SELECTORS.unavailable).first().waitFor({ timeout: 20000 });
  const seen = await canvasFrame().innerText();
  assert.deepEqual(leaks(seen), [], 'the viewer page shows a path, a name or code');
  await shot('06-viewer-unavailable');
});

await check('15 dropping local code files: the dialog offers Code card, Escape and Cancel add nothing, two files are named before anything is made, a binary file is refused; the card keeps exact text, its upload provenance and survives reload; nothing runs', async () => {
  await openContext();
  await openCanvas();
  const surface = canvasFrame().locator('div.touch-none').first();
  const dialog = page.getByRole('dialog', { name: 'Add to canvas' });
  const drop = async (files, at = { x: 0.6, y: 0.6 }) => {
    const b = await box(surface), target = await surface.elementHandle();
    await page.evaluate(([element, list, x, y]) => {
      const transfer = new DataTransfer();
      for (const [name, body] of list) transfer.items.add(new File([typeof body === 'string' ? body : new Uint8Array(body)], name, { type: '' }));
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
      element.dispatchEvent(new DragEvent('dragover', init));
      element.dispatchEvent(new DragEvent('drop', init));
    }, [target, files, b.x + b.width * at.x, b.y + b.height * at.y]);
    await page.waitForTimeout(500);
  };
  const JS = 'export function greet(name) {\n\treturn `hi ${name}`;\n}\n\n    // four spaces kept\n';
  const uploads = () => ofType('repo-code').then(all => all.filter(b => b.source?.kind === 'upload'));
  await drop([['greet.js', JS]]);
  await dialog.waitFor({ timeout: 5000 });
  assert.equal((await dialog.locator('[data-import-file]').first().innerText()).trim(), 'greet.js');
  assert.ok((await dialog.locator('[data-import-choice]').allInnerTexts()).map(t => t.trim()).includes('Code card'), 'Code card is offered');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 3000 });
  await drop([['greet.js', JS]]);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  assert.equal((await uploads()).length, 0, 'Escape and Cancel add nothing');
  await drop([['greet.js', JS]]);
  await dialog.locator('[data-import-choice="code"]').click();
  await dialog.getByRole('button', { name: 'Add to canvas' }).click();
  await waitFor(async () => (await uploads()).length === 1, 15000, 'no uploaded code card');
  const [card] = await uploads();
  assert.equal(card.source.name, 'greet.js');
  assert.ok(card.source.assetKey, 'stored in canvas asset storage');
  assert.equal(card.source.repo, undefined, 'no invented repository');
  const el = cardEl(card.id).locator(SELECTORS.codeCard);
  await el.waitFor({ timeout: 15000 });
  assert.ok([JS, JS.replace(/\n$/, '')].includes(await el.locator('pre').first().evaluate(n => n.textContent)), 'the exact code and whitespace');
  // Two files: both named before anything is made.
  await drop([['a.ts', 'export const a = 1;\n'], ['b.go', 'package main\n']], { x: 0.3, y: 0.7 });
  const names = (await dialog.innerText());
  assert.ok(names.includes('a.ts') && names.includes('b.go'), 'the dialog names both files');
  assert.equal((await uploads()).length, 1, 'nothing made before the choice');
  await dialog.getByRole('button', { name: 'Add to canvas' }).click();
  await waitFor(async () => (await uploads()).length === 3, 15000, 'two more code cards');
  // A binary file says so and makes nothing.
  await drop([['blob.py', [0, 1, 2, 0, 255, 254, 0, 0]]]);
  await dialog.locator('[data-import-choice="code"]').click().catch(() => {});
  await dialog.getByRole('button', { name: 'Add to canvas' }).click().catch(() => {});
  await page.locator('[data-import-error], [role="alert"]').filter({ hasText: /blob\.py/ }).first().waitFor({ timeout: 5000 });
  assert.equal((await uploads()).length, 3, 'the binary file made no card');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await openCanvas();
  await cardEl(card.id).locator(SELECTORS.codeCard).getByText('four spaces kept', { exact: false }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('iframe[src*="notebook"]').count(), 0, 'no notebook opened');
  await shot('07-dropped-code-cards');
});

await check('16 a late source answer never fills a deleted card', async () => {
  let release;
  holdSource = new Promise(resolve => { release = resolve; });
  await openGraph();
  await node(N.sample).click({ button: 'right' });
  await page.getByRole('menuitem', { name: SELECTORS.addCodeCard, exact: true }).click().catch(() => {}); // revealed if it exists
  await page.keyboard.press('Escape');
  const card = (await ofType('repo-code')).find(b => b.source?.nodeId === N.sample);
  if (card) {
    await cardEl(card.id).click({ position: { x: 12, y: 8 } });
    await page.keyboard.press('Delete');
    await waitFor(async () => !(await ofType('repo-code')).some(b => b.id === card.id), 5000, 'the card was not deleted');
  }
  release(); holdSource = null;
  await page.waitForTimeout(1200);
  assert.ok(card && !(await ofType('repo-code')).some(b => b.id === card.id), 'the late answer did not bring the card back');
  assert.equal(await canvasFrame().locator(`[data-block-id="${card?.id}"]`).count(), 0);
});

await check('17 no model route, no write outside the stack, no page error', async () => {
  facts.counts = { asks: captured.length, hooks: hooks.length, sourceReads: sourceReads.length, refused, outside: [...new Set(outside)], errors };
  assert.deepEqual([refused, outside, errors], [[], [], []]);
});

// ponytail: not in the browser here - a restricted member's save keeping the owner's card fields (ACCESS unit tests own the
// server merge), the BlockNote document's placement, and large-graph timing; add them when a member fixture exists.
await browser.close();
if (token) await api(`/api/learn/boards/${REPO}/main/share`, { method: 'POST', body: JSON.stringify({ shared: false }) }).catch(() => {});
seedProject(false);
process.exit(finish());
