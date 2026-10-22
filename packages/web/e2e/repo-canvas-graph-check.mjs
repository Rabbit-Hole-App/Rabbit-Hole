// The repository graph in the canvas, Release 1 (owner brief C:/s/spec/repo-canvas-graph.md section 14; lane contract
// repo-graph-plan.md): /apps/repo-* opens the canvas; the composer's Explore codebase opens Graph in the companion column LEFT
// of Chat, Chat still visible; the draft and the conversation survive switching and resizing; a node click is a temporary chip
// and asks nothing; Shift-click multi-selects; Add to chat pins without a second chip or a second payload entry; closing the
// viewer drops the temporary chips and keeps the pinned ones; a repository-wide question sends no selection; a selection
// question sends the repository, commit and path; a code citation opens Files at its range and Back to graph restores the
// camera and the selection; ?tab=graph and ?tab=code old links; the narrow layout; Hide right panel hides both columns.
// LOCAL stack only: local D1 and fresh browser profiles. The repository is the shared nanoGPT stub
// (e2e/nanogpt-repository-fixture.mjs; a keyless stack has no indexer). No model is ever called: /api/learn/ask and the Curious
// hook are scripted here with their request bodies CAPTURED, every other model-capable route is aborted and counted, and none
// may happen. Scripted answers prove the wiring, not suggestion quality (the lead's real-model run does that).
// Prints `ok <label>` or `FAIL <label> - <reason>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Lane A names (rg-layout): [data-companion] (aria-label Viewer), [data-companion-view] pressed buttons, [data-companion-close],
// [data-companion-back] (below lg), [data-companion-return] (Back to <view>), [data-learn-files], [data-learn-graph]. Lane B
// (rg-graph 85f12364): [data-graph-panel], [data-graph-selection] with [data-graph-add-to-chat] and [data-graph-clear], chips
// [data-code-selection] (temporary), [data-code-more] / [data-code-more-list], button[data-explore-codebase].
// Evidence goes to OUT: results.json (captured payload fields, never cookies) and *.png (graph beside Chat, selected-node
// chips, source navigation, narrow layout).
// Usage: BASE=http://127.0.0.1:8911 SMALL_CP=http://127.0.0.1:8913 VARS=<cp .dev.vars> OUT=<dir> node e2e/repo-canvas-graph-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { COMMIT, REPO, routeRepository } from './nanogpt-repository-fixture.mjs';
import { mockChatRoute } from './dev-cp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8913';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('repo-canvas-graph-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/repo-canvas-graph', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `rcg-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();
const catalog = await api('/api/apps');
// A plain canvas: no repository, so no Explore codebase (brief section 3), and it never inherits graph context.
const plain = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Plain ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(plain.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(plain).slice(0, 200)}`);

// The repository's Main canvas holds two cards, seeded where the canvas reads its board in this browser (canvas-context-check).
const BLOCKS = [
  { id: 'rcg-note', type: 'explanation', dx: 0, dy: 0, title: 'Attention notes', body: 'Why the causal mask matters.' },
  { id: 'rcg-next', type: 'explanation', dx: 0, dy: 0, title: 'Training loop', body: 'How train.py steps the optimizer.' },
];
const seed = name => [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`, { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: BLOCKS }];
// Fixture graph nodes (index_repository.py shape): file nodes are named after the file, a class after file_class.
const N = { train: 'train', model: 'model', gpt: 'model_gpt', attn: 'model_causalselfattention', sample: 'sample', bench: 'bench', mlp: 'model_mlp' };

// ---------------------------------------------------------------- routes: capture, scripted answers, refuse the rest
const captured = [], hooks = [], refused = [], outside = [], errors = [];
let replies = 0, cite = null;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/(ask|learn-course)$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/(plan|handoff)|dive|explore))/;
const options = () => [1, 2, 3].map(n => ({ id: `rcg-${n}`, hook: `Scripted technical direction ${n}`, selected_next_step: { kind: 'explain', title: `Scripted direction ${n}` } }));
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  // A read elsewhere (the notebook runtime's warm-up) is refused quietly; a write elsewhere is counted and fails the run.
  if (url.origin !== BASE) { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) outside.push(`${request.method()} ${url.hostname}`); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`, text = `Scripted answer ${reply}.${cite ? `\n\n${cite}` : ''}`; cite = null;
    captured.push({ body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text })
      + frame('answer_meta', { messageId, actions: [], followUps: [{ id: `f-${reply}`, kind: 'question', text: `Scripted follow-up ${reply}: trace the caller` }], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `rcg-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  // The Curious hook: scripted, its input captured (Release 1 adds repository: { repo, commit } to it).
  if (path === '/api/learn/tutor/next-steps') {
    hooks.push(body);
    return route.fulfill({ json: { set_id: `rcg-set-${hooks.length}`, generated_at: new Date().toISOString(), options: options() } });
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\/rcg-/.test(path)) return route.fulfill({ json: { ok: true } });
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
let page = null, context = null;
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    // A click that timed out says why: what took the pointer, or that the target never showed.
    const lines = String(error?.message || error).split('\n'), why = lines.find(l => /intercepts pointer events|not visible|outside of the viewport/.test(l));
    const message = `${lines[0]}${why ? ` (${why.replace(/\u001b\[[0-9;]*m/g, '').trim().slice(0, 240)})` : ''}`.slice(0, 600);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const openContext = async (viewport = { width: 1800, height: 1000 }) => {
  await context?.close();
  context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([key, value]) => { if (window !== window.top) return; try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* a sandboxed frame */ } }, seed(REPO));
  await routeRepository(context); // registered first, so the router below runs first and falls back to it
  await context.route('**/*', router);
  // CR-1: a Chat line (any mode) asks POST /api/learn/chat/route first; a contract-valid answer decision (dev-cp.mjs), registered last so it wins. CI has no JEV key.
  await mockChatRoute(context);
  page = await context.newPage();
  page.setDefaultTimeout(15000); // an action on a missing control fails in 15 s instead of waiting forever
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const box = async locator => locator.boundingBox();

// ---------------------------------------------------------------- page helpers
const canvasFrame = () => page.locator('[aria-label="Lesson canvas"]');
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
// Owner brief 2026-10-16 items 3-6: the Chat header's one Context / Files / Graph control opens the companion; its Graph tab
// shows the graph (the composer's Explore codebase is gone).
const companionControl = () => page.locator('[data-panel-companion]');
const explore = async () => {
  if (await companionControl().getAttribute('aria-pressed') !== 'true') await companionControl().click();
  await page.locator('[data-companion-view="graph"]').click();
};
const companion = () => page.locator('[data-companion]');
const graphPanel = () => page.locator('[data-companion] [data-graph-panel]');
// The companion's shown view: its view buttons are a pressed switch (lane A, CompanionHeader).
const view = () => companion().locator('[data-companion-view][aria-pressed="true"]').getAttribute('data-companion-view', { timeout: 2000 }).catch(() => null);
const showView = id => companion().locator(`[data-companion-view="${id}"]`).click();
// A node's dot, where a learner clicks: the center of the whole node (dot and label) can fall between them once the graph scales.
const node = id => graphPanel().locator(`[data-graph-node="${id}"] :is(circle, rect)`).first();
const selectedNodes = () => graphPanel().locator('[data-graph-node][data-selected]').evaluateAll(all => all.map(n => n.dataset.graphNode).sort());
const camera = () => graphPanel().locator('[data-graph-layer]').getAttribute('transform');
const selection = () => graphPanel().locator('[data-graph-selection]');
// Every context entry in the Chat pane by its key: temporary (dashed selection) or pinned (ready), outermost element only.
// Lane B: a viewer selection is a dashed [data-code-selection] chip; Add to chat makes it [data-context-chip="ready"].
const entries = () => pane().evaluate(() => [...document.querySelectorAll('[data-chat-pane] [data-context-chip], [data-chat-pane] [data-context-selection], [data-chat-pane] [data-code-selection]')]
  .filter((el, i, all) => !all.some(other => other !== el && other.contains(el)))
  .map(el => ({ key: el.getAttribute('data-ref-key'), text: el.innerText.replace(/\s+/g, ' ').trim(), chip: el.getAttribute('data-context-chip'), temporary: el.hasAttribute('data-context-selection') || el.hasAttribute('data-code-selection') })));
// The overflow list's keys count too: a compact "+N" hides entries, it does not drop them.
const overflowKeys = async () => {
  const more = pane().locator('[data-code-more]');
  if (!await more.count()) return [];
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
  const keys = await page.locator('[data-code-more-list] [data-ref-key]').evaluateAll(all => all.map(el => el.getAttribute('data-ref-key')));
  await page.keyboard.press('Escape');
  return keys;
};
const codeKeys = async () => [...(await entries()).map(e => e.key), ...(await overflowKeys())].filter(key => key?.startsWith('code:'));
const codeRefs = body => (body.context_refs || []).filter(ref => ref.kind === 'code' || String(ref.sourceId).startsWith('code:'));
const asked = () => captured.length;
const openCanvas = async (path = `/apps/${REPO}`) => {
  await page.goto(`${BASE}${path}`);
  await canvasFrame().waitFor({ timeout: 60000 });
  await page.locator('[aria-label="Lesson canvas"] [data-block-id="rcg-note"]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
};
// A closed column keeps its views mounted at zero width (ResizableSidePanel), so open means the column's own width.
const companionOpen = async () => ((await companion().boundingBox().catch(() => null))?.width ?? 0) > 100;
const openGraph = async () => {
  if (await companionOpen() && await view() === 'graph') return;
  await explore();
  await graphPanel().waitFor({ state: 'visible', timeout: 15000 });
  await node(N.train).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600); // the first fit
};
// The composer starts in Tutor mode (a planner turn); these questions are Ask turns, on the scripted /api/learn/ask.
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
const closeViewer = () => companion().locator('[data-companion-close]').click();

// ================================================================ the run
await openContext();

await check('1 /apps/<repo> opens the canvas, no repository page; Chat and the header control Context, Files and Graph; no composer graph icon', async () => {
  await openCanvas();
  assert.equal(await page.locator('[data-project-tabs]').count(), 0, 'no Files | Graph | Learn switcher');
  assert.equal(new URL(page.url()).pathname, `/apps/${REPO}`);
  await pane().waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await graphPanel().isVisible().catch(() => false), false, 'the graph is not forced open');
  await companionControl().waitFor({ timeout: 10000 });
  assert.equal(await companionControl().getAttribute('aria-label'), 'Context, Files and Graph', 'one control names the three views');
  assert.equal(await pane().locator('[data-chat-composer]').locator('button[aria-label="Explore codebase"], [data-explore-codebase]').count(), 0, 'no Explore codebase in the composer');
  // The repository is one named dropdown (owner brief 2026-10-16 item 1): its GitHub link is the dropdown's first row.
  await page.locator('[data-repo-menu]').click();
  const badge = page.locator('[data-menu-button-open] a[data-repo-badge]');
  assert.equal(await badge.getAttribute('target'), '_blank', 'the repository link opens GitHub in a new tab');
  assert.match(await badge.getAttribute('href'), /^https:\/\/github\.com\/karpathy\/nanoGPT/);
  await page.keyboard.press('Escape');
  facts.opened = { asks: asked(), hooks: hooks.length };
});

// Everything below runs on the canvas: if it did not open, the rest would only time out one by one.
const finish = () => {
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, commit: COMMIT, results, facts }, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`repo-canvas-graph-check: ${results.length - failed.length}/${results.length} checks passed`);
  return failed.length ? 1 : 0;
};
if (!results[0].ok) { console.log('stopped: the repository canvas did not open, so no other check can run'); await browser.close(); process.exit(finish()); }

let draft = `draft ${run} about the optimizer`;
await check('2 the header control and its Graph tab open Graph in the companion column LEFT of Chat, side by side, Chat and its composer visible; nothing is asked', async () => {
  await send('What does this repository do?'); // history to keep (check 3)
  await field().fill(draft);
  const before = { asks: asked(), hooks: hooks.length };
  await openGraph();
  assert.equal(await view(), 'graph');
  const g = await box(companion()), c = await box(pane()), cv = await box(canvasFrame());
  assert.ok(g.x + g.width <= c.x + 2, `the companion ends where Chat starts (${Math.round(g.x + g.width)} > ${Math.round(c.x)})`);
  assert.ok(Math.min(g.y + g.height, c.y + c.height) - Math.max(g.y, c.y) > Math.min(g.height, c.height) * 0.8, 'side by side, not stacked');
  assert.ok(cv.x + cv.width <= g.x + 2, `the canvas ends where the companion starts (${Math.round(cv.x + cv.width)} > ${Math.round(g.x)})`);
  assert.ok(await field().isVisible(), 'the composer stays visible');
  assert.equal(await field().inputValue(), draft, 'the draft stays');
  await page.waitForTimeout(600);
  assert.deepEqual({ asks: asked(), hooks: hooks.length }, before, 'opening the graph asks nothing');
  facts.layout = { companion: g, chat: c, canvas: cv };
  await shot('01-graph-beside-chat');
});

await check('3 the draft and the conversation survive Graph to Files to Context to Graph and a companion resize', async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:open-files')));
  await waitFor(async () => await view() === 'files', 5000, 'small:open-files did not show Files');
  await showView('context');
  await waitFor(async () => await view() === 'context', 5000, 'Context did not show in the companion');
  assert.ok(await pane().isVisible(), 'Chat stays visible with Context open');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:open-graph')));
  await waitFor(async () => await view() === 'graph', 5000, 'small:open-graph did not show Graph');
  const handle = companion().locator('[role="separator"]').first(), h = await box(handle), w0 = (await box(companion())).width;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x - 80, h.y + h.height / 2, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  assert.ok((await box(companion())).width > w0 + 40, 'the companion resizes from its left edge');
  assert.equal(await field().inputValue(), draft, 'the draft survives');
  assert.ok(await pane().getByText('Scripted answer 1.').first().isVisible(), 'the earlier answer survives');
});

await check('4 a node click is a temporary chip naming its file; no request, no card, the draft untouched', async () => {
  const before = { asks: asked(), hooks: hooks.length }, cards = await canvasFrame().locator('[data-block-id]').count();
  await node(N.train).click();
  await waitFor(async () => (await entries()).some(e => e.temporary && e.key?.startsWith('code:')), 5000, 'no temporary code chip');
  const chip = (await entries()).find(e => e.temporary && e.key?.startsWith('code:'));
  assert.equal(chip.key, `code:karpathy/nanoGPT@${COMMIT}:train.py|null`, `the chip's identity is repository, commit and path: ${chip.key}`);
  assert.match(chip.text, /train\.py/);
  assert.deepEqual(await selectedNodes(), [N.train]);
  await page.waitForTimeout(800);
  assert.deepEqual({ asks: asked(), hooks: hooks.length }, before, 'selecting asks nothing');
  assert.equal(await canvasFrame().locator('[data-block-id]').count(), cards, 'no canvas card');
  assert.equal(await field().inputValue(), draft, 'the draft stays');
  await shot('02-node-selected-chip');
});

await check('4b Shift-click adds and removes; a plain click selects one; Ctrl-click is no second multi-select; empty space and Escape clear', async () => {
  await node(N.gpt).click({ modifiers: ['Shift'] });
  await waitFor(async () => (await selectedNodes()).length === 2, 3000, 'Shift-click did not add');
  assert.equal((await codeKeys()).length, 2, 'two temporary chips, two identities');
  assert.match((await selection().innerText()).trim(), /^2 selected/, 'the selection controls count 2');
  await node(N.gpt).click({ modifiers: ['Shift'] });
  await waitFor(async () => (await selectedNodes()).length === 1, 3000, 'Shift-click did not remove');
  await node(N.sample).click();
  assert.deepEqual(await selectedNodes(), [N.sample], 'a plain click selects one');
  await node(N.bench).click({ modifiers: ['Control'] }); // owner: Ctrl/Cmd is no multi-select rule; a plain click or inert, as lane B reports
  assert.ok(['["sample"]', '["bench"]'].includes(JSON.stringify(await selectedNodes())), `Ctrl-click does not add: ${JSON.stringify(await selectedNodes())}`);
  const svg = await box(graphPanel().locator('svg[aria-label="Repository dependency graph"]'));
  const empty = await page.evaluate(([x0, y0, w, h]) => { for (let y = y0 + 20; y < y0 + h - 20; y += 16) for (let x = x0 + 20; x < x0 + w - 20; x += 16) { const el = document.elementFromPoint(x, y); if (el?.tagName === 'svg') return { x, y }; } return null; }, [svg.x, svg.y, svg.width, svg.height]);
  assert.ok(empty, 'an empty point of the graph');
  await page.mouse.click(empty.x, empty.y);
  await waitFor(async () => (await selectedNodes()).length === 0 && (await codeKeys()).length === 0, 3000, 'empty space did not clear');
  await node(N.train).click(); await node(N.model).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Escape');
  await waitFor(async () => (await selectedNodes()).length === 0, 3000, 'Escape did not clear');
  assert.equal((await codeKeys()).length, 0, 'no temporary chip after Escape');
});

await check('4c five selected nodes are five identities in a compact chip row with an inspectable +N list', async () => {
  await node(N.train).click();
  for (const id of [N.model, N.gpt, N.attn, N.sample]) await node(id).click({ modifiers: ['Shift'] });
  await waitFor(async () => (await selectedNodes()).length === 5, 3000, 'five nodes selected');
  const keys = await codeKeys();
  assert.equal(new Set(keys).size, 5, `five distinct identities: ${JSON.stringify(keys)}`);
  assert.equal((await pane().locator('[data-code-more]').innerText()).trim(), '+2 more', 'three chips shown, the rest behind +N');
  assert.equal(await pane().locator('[data-context-chips] > ul > li[data-code-selection]').count(), 3, 'three chips in the row, the rest in the list');
  await shot('03-five-selected-chips');
  await page.keyboard.press('Escape');
});

await check('5 Add to chat pins in place: the same chip turns solid, no second chip; the question carries each node once', async () => {
  await node(N.train).click(); await node(N.gpt).click({ modifiers: ['Shift'] });
  await waitFor(async () => (await codeKeys()).length === 2, 3000, 'two temporary chips');
  await selection().locator('[data-graph-add-to-chat]').click();
  await waitFor(async () => (await entries()).filter(e => e.key?.startsWith('code:') && e.chip === 'ready').length === 2, 5000, 'Add to chat did not pin both');
  const all = await codeKeys();
  assert.equal(all.length, 2, `no duplicate chip after pinning: ${JSON.stringify(all)}`);
  await selection().locator('[data-graph-add-to-chat]').click().catch(() => {}); // a second press adds nothing
  assert.equal((await codeKeys()).length, 2, 'a second Add to chat adds nothing');
  const body = await send('How do these two relate?');
  const refs = codeRefs(body);
  facts.s5 = { context_refs: refs.map(r => ({ sourceId: r.sourceId, range: r.range ?? null })), repository_context: body.repository_context ?? null };
  assert.equal(refs.length, 2, `two code refs: ${JSON.stringify(facts.s5.context_refs)}`);
  assert.equal(new Set(refs.map(r => `${r.sourceId}|${JSON.stringify(r.range ?? null)}`)).size, 2, 'no ref twice');
  assert.ok(refs.every(r => r.sourceId.includes(COMMIT.slice(0, 7))), 'each at the indexed commit');
  await shot('04-pinned-chips');
});

await check('6 closing the viewer drops temporary chips, keeps pinned ones, the draft and Chat; a removed pin does not come back; New chat starts empty', async () => {
  await node(N.sample).click({ modifiers: ['Shift'] }); // temporary beside the two pinned
  await waitFor(async () => (await codeKeys()).length === 3, 3000, 'three entries');
  await field().fill(draft);
  await closeViewer();
  await companion().waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(300);
  const left = await entries();
  assert.equal(left.filter(e => e.key?.startsWith('code:') && e.temporary).length, 0, 'no temporary chip after close');
  assert.equal(left.filter(e => e.key?.startsWith('code:') && e.chip === 'ready').length, 2, 'the pinned chips stay');
  assert.ok(await pane().isVisible(), 'Chat stays open');
  assert.equal(await field().inputValue(), draft, 'the draft stays');
  const pinned = pane().locator('[data-context-chip="ready"][data-ref-key*=":train.py"]').first();
  await pinned.locator('button[aria-label^="Remove "]').click();
  await page.waitForTimeout(600);
  await openGraph();
  await page.waitForTimeout(600);
  assert.equal((await codeKeys()).filter(k => k.includes(':train.py')).length, 0, 'the removed pin does not come back from the graph selection');
  await pane().locator('[data-chat-new]').click();
  await page.waitForTimeout(500);
  assert.equal((await entries()).filter(e => e.key?.startsWith('code:') && e.chip === 'ready').length, 0, 'New chat holds no pinned code');
});

await check('7 a repository-wide question with nothing selected: the repository at its commit, no selection, the whole-canvas package; a follow-up fills the composer, unsent', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const body = await send('Where is the training loop?');
  facts.s7 = { repository_context: body.repository_context ?? null, code_refs: codeRefs(body).length, canvas_context: !!body.canvas_context, scope: body.scope ?? null };
  assert.equal(body.scope?.app, REPO, 'scoped to the repository canvas');
  assert.equal(body.repository_context?.commit, COMMIT);
  for (const key of ['range', 'path', 'nodeId']) assert.equal(body.repository_context?.[key], undefined, `no ${key} without a selection`);
  assert.equal(codeRefs(body).length, 0, 'no code ref without a selection');
  assert.ok(body.canvas_context, 'the whole-canvas package still rides');
  // The answer's follow-ups (lane C answer_meta) continue the conversation: a click fills the composer and sends nothing.
  const n = asked();
  await pane().locator('[data-answer-followup]:visible').last().click();
  await page.waitForTimeout(400);
  assert.match(await field().inputValue(), /^Scripted follow-up \d+: trace the caller$/, 'a follow-up fills the composer');
  assert.equal(asked(), n, 'and sends nothing');
  await field().fill('');
});

await check('8 a selection question carries the repository, the commit and the symbol: model.py GPT', async () => {
  await openGraph();
  // By keyboard (lane B: Enter selects, Space toggles): the companion was resized and the camera never refits, so a node can
  // sit outside the visible graph; a learner pans or tabs to it.
  await graphPanel().locator(`[data-graph-node="${N.gpt}"]`).focus(); await page.keyboard.press('Enter');
  await waitFor(async () => (await codeKeys()).length === 1, 3000, 'one temporary chip');
  const body = await send('What does this class do?');
  const refs = codeRefs(body);
  facts.s8 = { context_refs: refs.map(r => ({ sourceId: r.sourceId, range: r.range ?? null })), repository_context: body.repository_context ?? null };
  assert.equal(refs.length, 1, `one code ref: ${JSON.stringify(facts.s8.context_refs)}`);
  assert.match(refs[0].sourceId, new RegExp(`^code:.+@${COMMIT.slice(0, 7)}[0-9a-f]*:model\\.py#${N.gpt}$`), `repository, commit, path and node: ${refs[0].sourceId}`);
  assert.equal(body.repository_context?.commit, COMMIT);
  assert.ok(!('text' in refs[0]) || !refs[0].text || refs[0].text.length < 4000, 'a bounded excerpt at most; the server resolves the code');
});

await check('9 a code citation opens Files at its range, not pinned and asking nothing; the Graph tab restores the camera and the selection', async () => {
  await openGraph();
  await graphPanel().getByRole('button', { name: 'Zoom in', exact: true }).click();
  await graphPanel().locator(`[data-graph-node="${N.attn}"]`).focus(); await page.keyboard.press(' '); // Space adds to the selection
  await page.waitForTimeout(400);
  const was = { camera: await camera(), selected: await selectedNodes() };
  cite = 'The causal mask is applied in model.py:177-179.';
  await send('Where is the causal mask applied?');
  const n = asked(), pinnedBefore = (await entries()).filter(e => e.chip === 'ready').length;
  const link = pane().getByRole('button', { name: 'Open model.py lines 177–179', exact: true }).first();
  await link.click();
  await waitFor(async () => await view() === 'files', 5000, 'the citation did not open Files');
  await companion().locator('[data-file-row="model.py"][aria-current="true"]').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-companion] [data-highlighted]')].map(n => n.dataset.sourceLine).join() === '177,178,179', null, { timeout: 10000 });
  assert.ok(await companion().locator('[data-source-line="177"]').isVisible(), 'scrolled to the range');
  assert.equal((await entries()).filter(e => e.chip === 'ready').length, pinnedBefore, 'viewing a citation pins nothing');
  await page.waitForTimeout(400);
  assert.equal(asked(), n, 'the click asked nothing');
  await shot('05-citation-in-files');
  // No Back to graph (owner brief 2026-10-16 item 4): the labelled Graph tab returns.
  assert.equal(await companion().locator('[data-companion-return]').count(), 0, 'no Back to <view> link');
  await companion().locator('[data-companion-view="graph"]').click();
  await graphPanel().waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(400);
  facts.s9 = { before: was, after: { camera: await camera(), selected: await selectedNodes() } };
  assert.deepEqual(facts.s9.after, was, 'the same camera and selection');
});

await check('10 old links: ?tab=graph and ?tab=map open the canvas with Graph, ?tab=code with Files, once (the address becomes the plain one); a plain link and ?tab=learn open no viewer', async () => {
  for (const tab of ['graph', 'map']) {
    await openCanvas(`/apps/${REPO}?tab=${tab}`);
    await graphPanel().waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('[data-project-tabs]').count(), 0);
    await waitFor(() => new URL(page.url()).search === '', 5000, `?tab=${tab} stayed in the address`);
  }
  await openCanvas(`/apps/${REPO}?tab=code`);
  await waitFor(async () => await view() === 'files', 15000, '?tab=code did not open Files');
  await waitFor(() => new URL(page.url()).search === '', 5000, '?tab=code stayed in the address');
  await openCanvas(`/apps/${REPO}`);
  await page.waitForTimeout(800);
  assert.equal(await companion().isVisible().catch(() => false), false, 'a plain link forces no viewer');
  await openCanvas(`/apps/${REPO}?tab=learn`);
  assert.equal(await companion().isVisible().catch(() => false), false);
});

await check('11 Hide right panel hides Chat and the companion whatever the view; Show brings both back with the graph as it was', async () => {
  await openGraph();
  await node(N.model).click();
  const was = { camera: await camera(), selected: await selectedNodes() }, full = (await box(canvasFrame())).width;
  // A hidden column keeps its contents mounted at zero width (ResizableSidePanel), so the columns' own widths say it.
  const widths = async () => [(await box(companion()))?.width ?? 0, (await box(page.locator('aside[aria-label="Learn agent chat"]')))?.width ?? 0];
  await page.locator('button[aria-label="Hide the right panel"]').first().click();
  await waitFor(async () => (await widths()).every(w => w < 2), 5000, `a column stayed open: ${JSON.stringify(await widths())}`);
  assert.ok((await box(canvasFrame())).width > full + 300, 'the canvas takes both columns');
  await page.locator('button[aria-label="Show the right panel"]').first().click();
  await waitFor(async () => (await widths()).every(w => w > 300), 5000, `both columns did not come back: ${JSON.stringify(await widths())}`);
  await page.waitForTimeout(400);
  facts.s11 = { before: was, after: { camera: await camera(), selected: await selectedNodes() } };
  assert.deepEqual(facts.s11.after, was, `the graph kept its camera and selection: ${JSON.stringify(facts.s11)}`);
});

await check('12 Curious asks for the repository canvas at its indexed commit and shows its three directions (the answer\'s follow-ups are case 7)', async () => {
  await waitFor(() => hooks.length > 0, 15000, 'the Curious hook never asked');
  const last = hooks.at(-1);
  // Lane C: the server reads the canvas's repository itself (learn-next-steps-routes.js curiousRepository); the client adds the
  // indexed commit to the basis, so a new commit asks again (learn-next-steps.js repositoryBasis).
  facts.s12 = { app: last.app ?? null, commit_in_basis: JSON.stringify(last).includes(`@${COMMIT.slice(0, 12)}`), hooks: hooks.length };
  assert.equal(facts.s12.app, REPO, 'the hook asks for the repository canvas');
  assert.ok(facts.s12.commit_in_basis, 'the hook basis carries the indexed commit');
  await page.locator('[data-next-steps] [data-next-step]').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-next-steps] [data-next-step]').count(), 3, 'three directions');
});

await check('13 another canvas never inherits graph context; it shows no Graph view', async () => {
  await node(N.train).click().catch(() => {});
  await openCanvas(`/apps/${plain.name}`).catch(async () => { await page.goto(`${BASE}/apps/${plain.name}`); await pane().waitFor({ timeout: 30000 }); });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.locator('[data-companion-view="graph"]').count(), 0, 'no graph entry without a repository');
  assert.equal(await companionControl().getAttribute('aria-label'), 'Context', 'the header control opens Context alone');
  assert.equal((await codeKeys()).length, 0, 'no code chip carried over');
});

// The narrow layout runs in its own browser: below lg one column at a time, the viewer in place of Chat with Back to chat.
await openContext({ width: 900, height: 900 });
await check('14 narrow: the Graph view shows in place of Chat; Back to chat returns with the draft; never two squeezed columns', async () => {
  await openCanvas();
  await field().fill(draft);
  await openGraph();
  assert.equal(await pane().isVisible(), false, 'Chat steps aside below lg');
  assert.ok((await box(graphPanel())).width >= 320, 'the graph keeps a usable width');
  await shot('06-narrow-graph');
  await companion().locator('[data-companion-back]').click();
  await pane().waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await field().inputValue(), draft, 'the draft stays');
  await shot('07-narrow-back-to-chat');
});

await check('15 no model route, no request outside the stack, no page error', async () => {
  facts.counts = { asks: captured.length, hooks: hooks.length, refused, outside: [...new Set(outside)], errors };
  assert.deepEqual([refused, outside, errors], [[], [], []]);
});

await browser.close();
process.exit(finish());
