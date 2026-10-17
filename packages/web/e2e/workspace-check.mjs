// The workspace dock and the repository inspector (docs/features/workspace-dock.md, inspector.md), against the LOCAL stack only:
// a real session, Home, Library and Shell from the lane's local D1. The keyless stack has no indexer, so the repository
// project's endpoints are stubbed with a Graphify-shaped snapshot (index_repository.py) read off the real nanoGPT files
// pinned in packages/learn-render (commit 3adf61e). /api/learn/ask and the Curious hook are scripted: no model call. Prints no
// secrets.
// Since the repository graph Release 1 (docs/features/repo-canvas-graph.md, owner 2026-10-15) a repository is only its canvas:
// the dock (the Agent Bar) lives on Home and the Library and is hidden on every canvas, and the Map page's inspector is the
// Graph view's node details in the companion column beside Chat. Each case below keeps its old intent on the new surface.
// Retired, with their subject gone:
//   - inspector Overview sections (Purpose, Why it matters, preview, symbols fold, sticky header): Overview was already hidden
//     (inspector.js OVERVIEW_TAB) and the Map inspector is gone.
//   - the inspector's per-object Chat tab (count, empty state): answers land in the canvas Chat; the dock §5 case asks through it.
//   - main and inspector ending at the dock's edge, and the dock's scope chips on the project: no dock on a canvas.
// Usage: BASE=http://127.0.0.1:8868 SMALL_CP=http://127.0.0.1:8869 [VARS=<cp .dev.vars>] node e2e/workspace-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { installPointerDiagnostics, reportPointerFailure } from './pointer-diagnostics.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { COMMIT, REPO, routeRepository } from './nanogpt-repository-fixture.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8868';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8869';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('workspace-check runs against the local stack only');
const SHOTS = process.argv[2] || 'workspace-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `dock-${run}@example.com`, secret, handle: `dock_${run}` }) })).json()).session;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
for (const title of ['Attention', 'Tokenization', 'Backprop', 'Softmax', 'Layer norm', 'Positional encoding']) await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `${title} ${run}` }) });
const catalog = await api('/api/apps');
// The repository's Main canvas holds a card, seeded where the canvas reads its board in this browser.
const SEED = [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${REPO}:ink`, { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [],
  blocks: [{ id: 'ws-note', type: 'explanation', dx: 0, dy: 0, title: 'Attention notes', body: 'Why the causal mask matters.' }] }];

let repoStatus = 'ready';
const asks = [], hooks = [];
const ANSWER = 'train.py is the training loop: it builds GPT from model.py and optimises it.';
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const browser = await chromium.launch();
// A crash (an unhandled error in a check, the harness or the shared fixture) still closes the browser, then fails the run:
// the error is printed and the exit code is 1. A crashed run once left 4 headless browsers behind (2026-10-07).
const crash = async (error) => { console.error(error); await browser.close().catch(() => {}); process.exit(1); };
process.once('uncaughtException', crash);
process.once('unhandledRejection', crash);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, value]) => { if (window !== window.top) return; try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* a sandboxed frame */ } }, SEED);
await routeRepository(context, () => repoStatus);
await context.route('**/api/learn/ask', (route) => {
  asks.push(JSON.parse(route.request().postData()));
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frame('chunk', { text: ANSWER }) + frame('done', { ok: true, threadId: `ws-thread-${asks.length}`, messageId: `ws-m-${asks.length}` }) });
});
// The Curious hook on the canvas: scripted, so nothing reaches a model and the planner's absence on a keyless stack is quiet.
await context.route('**/api/learn/tutor/next-steps', (route) => { hooks.push(1); return route.fulfill({ json: { set_id: `ws-set-${hooks.length}`, generated_at: new Date().toISOString(), options: [] } }); });
await installPointerDiagnostics(context);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name) => { await page.waitForTimeout(400); await page.mouse.move(0, 0); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const box = (locator) => locator.evaluate((n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });
const near = (a, b, msg, tol = 1.5) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };

// The dock (Home and the Library).
const bar = page.locator('[data-agent-bar]'), input = bar.locator('textarea');
// The repository canvas: Chat, its composer, the companion column and the Graph view's node details (the old inspector).
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
const companion = () => page.locator('[data-companion]');
const graphPanel = () => page.locator('[data-companion] [data-graph-panel]');
const details = () => graphPanel().locator('[data-node-details]');
const title = () => details().locator('h3').innerText();
// A node's dot, where a learner clicks: the middle of the whole node can fall between its dot and its label.
const node = (id) => graphPanel().locator(`[data-graph-node="${id}"] :is(circle, rect)`).first();
const view = () => companion().locator('[data-companion-view][aria-pressed="true"]').getAttribute('data-companion-view', { timeout: 2000 }).catch(() => null);
const companionOpen = async () => ((await companion().boundingBox().catch(() => null))?.width ?? 0) > 100;
// The temporary code chips over the composer: their keys are code:<repo>@<commit>:<path>[#node]|<range>.
const codeChips = () => pane().locator('[data-code-selection]').evaluateAll((all) => all.map((n) => n.getAttribute('data-ref-key')));
const openCanvas = async () => {
  await page.goto(`${BASE}/apps/${REPO}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1000);
};
// The Chat header's one Context / Files / Graph control, then its Graph tab (owner brief 2026-10-16; no Explore codebase).
const showGraph = async () => {
  const control = page.locator('[data-panel-companion]');
  if (await control.getAttribute('aria-pressed') !== 'true') await control.click();
  await companion().locator('[data-companion-view="graph"]').click();
};
const openGraph = async () => {
  if (await companionOpen() && await view() === 'graph') return;
  await showGraph();
  await node('train').waitFor({ timeout: 30000 });
  await page.waitForTimeout(600); // the first fit
};
const askMode = async () => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === 'ask') return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator('[data-chat-mode-option="ask"]').click();
  await page.waitForTimeout(200);
};

// ---------------------------------------------------------------- the dock, on Home
await page.goto(`${BASE}/apps`);
await bar.waitFor({ timeout: 60000 });
await page.waitForTimeout(800);
await check('dock §1 §11: the dock spans the workspace from the sidebar edge to the window edge, never behind the sidebar; its input is half of it, centred', async () => {
  const b = await box(bar), side = await box(page.locator('[data-shell-sidebar]')), form = await box(bar.locator('[data-chat-composer]'));
  near(b.left, side.right, 'dock starts at the sidebar edge');
  near(b.right, 1440, 'dock ends at the window edge');
  // The input is half of the dock's content width (its padding excluded), centred, never under 28rem (owner, 2026-10-08;
  // AgentBar.jsx md:w-1/2 md:min-w-[min(100%,28rem)]); measured against the element the half is taken of.
  const m = await bar.locator('[data-chat-composer]').evaluate((n) => { let d = n; while (d && !/(^|\s)md:w-1\/2(\s|$)/.test(d.className)) d = d.parentElement; const p = d.parentElement, c = getComputedStyle(p); return { w: d.getBoundingClientRect().width, inner: p.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) }; });
  const half = Math.max(m.inner / 2, Math.min(m.inner, 448));
  assert.ok(Math.abs(m.w - half) <= 2 && Math.abs((form.left - b.left) - (b.right - form.right)) <= 2, `input is ${m.w}px at ${form.left - b.left} / ${b.right - form.right}, not half the dock's ${m.inner}px content (${half}px) centred`);
});
await check('dock §2 §19: the dock is chrome - a top divider, an opaque surface, no gradient, a hairline input shadow; Auto stays neutral (§5)', async () => {
  const s = await bar.evaluate((n) => { const c = getComputedStyle(n), f = getComputedStyle(n.querySelector('[data-chat-composer]')), auto = [...n.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Auto'); const a = getComputedStyle(auto); return { border: c.borderTopWidth, bg: c.backgroundColor, image: c.backgroundImage, shadow: f.boxShadow, autoColor: a.color, autoBg: a.backgroundColor }; });
  assert.equal(s.border, '1px'); assert.equal(s.bg, 'rgb(255, 255, 255)'); assert.equal(s.image, 'none');
  assert.doesNotMatch(s.shadow, /24px/, 'the popover shadow is gone'); assert.match(s.shadow, /0px 1px 2px/);
  assert.notEqual(s.autoColor, 'rgb(35, 131, 226)'); assert.ok(['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'].includes(s.autoBg), s.autoBg);
});
await check('dock §12: the input grows upward to five lines, then scrolls', async () => {
  const one = await box(input), top0 = (await box(bar)).top;
  await input.fill(Array.from({ length: 9 }, (_, i) => `line ${i + 1} of a long paste`).join('\n'));
  await page.waitForTimeout(300);
  const many = await input.evaluate((n) => ({ h: n.clientHeight, sh: n.scrollHeight }));
  assert.ok(one.height <= 40, `one line: ${one.height}`);
  assert.equal(many.h, 132, 'five 24px lines and the 12px padding'); assert.ok(many.sh > many.h, 'then it scrolls');
  assert.ok((await box(bar)).top < top0 - 90, 'the dock grew upward');
  await input.fill('');
});
await shot('dock-F-multiline');
// dock §13: + (the Start paths) belonged to the project's Map and an app's page; the Map is gone, and Home, the Library and
// Explore never had it (AgentBar.jsx plus). Home keeps its input free of it.
await check('dock §13: no + on Home - the Start paths live on an app page, not on Home', async () => {
  assert.equal(await bar.getByRole('button', { name: 'Add' }).count(), 0);
});
// Owner, 2026-10-08: "if we are not in a particular project, the breadcrumbs disappear". A repository is now only its canvas,
// where the dock is hidden (Chat's composer asks there), so no repository chip ever rides the dock.
await check('the dock shows no repository breadcrumbs off a repository, and none on its canvas: there the dock is hidden and Chat asks', async () => {
  assert.equal(await bar.locator('[data-scope-chip], [data-scope-chips]').count(), 0, 'no breadcrumb row on Home');
  await openCanvas();
  assert.equal(await page.locator('[data-agent-bar]').isVisible().catch(() => false), false, 'no dock on the repository canvas');
  assert.ok(await field().isVisible(), 'Chat\'s composer is the input there');
});

// ---------------------------------------------------------------- the inspector: the Graph view's node details
await openGraph();
await shot('dock-B0-graph-nothing-selected');
await check('inspector §4, dock §4: a graph node selects - a node named like its file is that file, one chip; a symbol is its own object; white space clears', async () => {
  await node('train').click();
  await details().waitFor();
  assert.equal(await title(), 'train.py');
  assert.deepEqual(await codeChips(), [`code:karpathy/nanoGPT@${COMMIT}:train.py|null`]);
  await node('model_gpt').click();
  await waitFor(async () => await title() === 'GPT', 5000, 'the symbol did not select');
  assert.equal((await codeChips()).length, 1, 'a plain click selects one');
  assert.match((await codeChips())[0], new RegExp(`^code:karpathy/nanoGPT@${COMMIT}:model\\.py#model_gpt\\|`));
  // A click on the graph's white space deselects (owner, 2026-10-08): no node lit, no details, no chip.
  const graph = graphPanel().getByRole('img', { name: 'Repository dependency graph' });
  // A fixed corner can contain a node on Linux's layout. Choose actual SVG
  // background, then use a real pointer click; selecting a node is not this case.
  const point = await graph.evaluate(svg => {
    const r = svg.getBoundingClientRect();
    for (const fy of [0.95, 0.05, 0.5, 0.25, 0.75]) for (const fx of [0.05, 0.95, 0.5, 0.25, 0.75]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y) === svg) return {x,y};
    }
    return null;
  });
  assert.ok(point, 'the visible graph has empty background to deselect on');
  try {
    await page.mouse.click(point.x, point.y);
    await waitFor(async () => (await details().count()) === 0, 3000, 'white space did not deselect');
    assert.equal(await graphPanel().locator('[data-graph-node][data-selected]').count(), 0);
    assert.deepEqual(await codeChips(), []);
  } catch(error) {
    await reportPointerFailure(page, `${SHOTS}/graph-whitespace-failed.png`, 'graph white-space deselection', point);
    throw error;
  }
});
await node('train').click();
await details().waitFor();
await check('inspector §1 §2: an object header - icon, title, path:line and type, Open on GitHub at the pinned commit - and its actions', async () => {
  assert.match(await details().innerText(), /train\.py:1\s*·\s*Python file/);
  assert.equal(await details().locator('[data-node-github]').getAttribute('href'), `https://github.com/karpathy/nanoGPT/blob/${COMMIT}/train.py`);
  assert.deepEqual((await details().getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 6), ['Open source', 'Add code card', 'Ask about this', 'Ask why', 'Learn this', 'Explore']);
});
await shot('insp-A-file-details');
await check('inspector §11 §12: Ask about this and Learn this write a ready question in Chat\'s composer; nothing is sent', async () => {
  const before = asks.length;
  await details().getByRole('button', { name: 'Ask about this' }).click();
  await waitFor(async () => /train\.py/.test(await field().inputValue()), 3000, 'Ask about this wrote nothing');
  await details().getByRole('button', { name: 'Learn this' }).click();
  await waitFor(async () => await field().inputValue() === 'Teach me train.py', 3000, 'Learn this did not write Teach me train.py');
  await page.waitForTimeout(500);
  assert.equal(asks.length, before, 'nothing sent');
  await field().fill('');
});
await check('dock §5 §17: a question with train.py selected sends it as one code ref at the pinned commit; the answer streams into Chat', async () => {
  await askMode();
  await field().fill('Why does this exist?');
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => asks.length === 1, 15000, 'no ask was sent');
  await pane().getByText(ANSWER).first().waitFor({ timeout: 15000 });
  const sent = asks.at(-1);
  assert.equal(sent.message, 'Why does this exist?');
  assert.deepEqual(sent.repository_context, { commit: COMMIT }, 'repository_context names only the commit');
  const code = (sent.context_refs || []).filter((ref) => ref.kind === 'code');
  assert.deepEqual(code.map((ref) => ref.sourceId), [`code:karpathy/nanoGPT@${COMMIT}:train.py`], 'train.py rides once, as a code ref');
  assert.equal(sent.scope.app, REPO);
});
await shot('dock-K-answer-in-chat');

await check('inspector §4 §8 §15, dock §3: a file lists its relationships in the graph\'s own words; a related object selects in place, the URL does not move', async () => {
  await node('model').click();
  await waitFor(async () => await title() === 'model.py', 5000, 'model.py did not select');
  const groups = await details().locator('[data-relation]').evaluateAll((all) => all.map((g) => g.dataset.relation));
  assert.ok(groups.includes('Contains') && groups.includes('Imports') && groups.includes('Imported by'), groups.join(', '));
  assert.match(await details().locator('[data-relation="Imported by"]').innerText(), /train\.py/);
  const historyLength = await page.evaluate(() => history.length), url = page.url();
  await details().locator('[data-relation="Contains"] button').filter({ hasText: /^GPT$/ }).click();
  await waitFor(async () => await title() === 'GPT', 3000, 'the related object did not select');
  assert.match((await codeChips())[0] || '', /model\.py#model_gpt/);
  assert.equal(page.url(), url); assert.equal(await page.evaluate(() => history.length), historyLength);
});
await shot('insp-H1-symbol');
await check('inspector §4: an external dependency is its own object - no file, no source, no GitHub link', async () => {
  await node('model').click();
  await waitFor(async () => await title() === 'model.py', 5000, 'model.py did not select');
  await details().locator('[data-relation="Imports"] button').filter({ hasText: /^torch$/ }).click();
  await waitFor(async () => await title() === 'torch', 3000, 'torch did not select');
  assert.match(await details().innerText(), /External dependency/);
  assert.ok(await details().locator('[data-node-open-source]').isDisabled(), 'no source to open');
  assert.equal(await details().locator('[data-node-github]').count(), 0);
  const importers = await details().locator('[data-relation="Imported by"] button').allInnerTexts();
  assert.deepEqual(importers, [...new Set(importers)], 'each file once');
});
await shot('insp-H2-external');
await check('inspector §16: Open source shows the file at the pinned commit in Files beside Chat; the Graph tab keeps the selection', async () => {
  await node('model').click();
  await waitFor(async () => await title() === 'model.py', 5000, 'model.py did not select');
  await details().locator('[data-node-open-source]').click();
  await waitFor(async () => await view() === 'files', 5000, 'Open source did not show Files');
  const reader = companion().getByRole('region', { name: 'Repository source' });
  await reader.locator('[data-source-line="1"]').waitFor();
  assert.equal(await reader.locator('[data-source-commit]').getAttribute('data-source-commit'), COMMIT);
  assert.ok(await pane().isVisible(), 'Chat stays beside it');
  assert.equal(await companion().locator('[data-companion-return]').count(), 0, 'no Back to graph (owner brief 2026-10-16 item 4)');
  await companion().locator('[data-companion-view="graph"]').click();
  await waitFor(async () => await view() === 'graph', 5000, 'the Graph tab did not return to Graph');
  assert.deepEqual(await graphPanel().locator('[data-graph-node][data-selected]').evaluateAll((all) => all.map((n) => n.dataset.graphNode)), ['model']);
});
await shot('insp-E-source');

await check('dock §10 §18: closing the viewer keeps Chat, clears the temporary selection; the canvas widens', async () => {
  const canvas = page.locator('[aria-label="Lesson canvas"]'), before = await box(canvas);
  await companion().locator('[data-companion-close]').click();
  await page.waitForTimeout(600);
  assert.equal(await companionOpen(), false, 'the column closed');
  assert.ok(await pane().isVisible(), 'Chat stays');
  assert.deepEqual(await codeChips(), [], 'no invisible selection rides the next question');
  const after = await box(canvas);
  assert.ok(after.width > before.width + 300, `${before.width} -> ${after.width}`);
});
await shot('dock-E-viewer-closed');

await check('dock §9: the viewer\'s divider resizes it, never under 320 px; the width is remembered; double-click resets to 360', async () => {
  await openGraph();
  const sep = companion().getByRole('separator', { name: 'Resize viewer' });
  const drag = async (dx) => { const s = await box(sep); await page.mouse.move(s.left + 3, s.top + 200); await page.mouse.down(); await page.mouse.move(s.left + 3 + dx, s.top + 200, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(250); };
  await drag(-120);
  const wider = (await box(companion())).width;
  assert.ok(wider >= 470, `wider: ${wider}`);
  await drag(400);
  assert.equal((await box(companion())).width, 320, 'never under 320');
  await page.reload(); await pane().waitFor({ timeout: 30000 }); await openGraph();
  assert.equal((await box(companion())).width, 320, 'remembered after reload');
  await sep.dblclick(); await page.waitForTimeout(400);
  assert.equal((await box(companion())).width, 360);
});

await check('dock §14: indexing shows as a status in the canvas header - Reading the repository… - and Chat stays usable', async () => {
  repoStatus = 'indexing';
  await openCanvas();
  const status = page.locator('[data-repo-status="indexing"]');
  await status.waitFor({ timeout: 10000 });
  assert.match((await status.innerText()).trim(), /Reading the repository…/);
  await field().fill('Still typing');
  assert.equal(await field().inputValue(), 'Still typing');
  await shot('dock-G-indexing-status');
  await field().fill('');
  repoStatus = 'ready';
});

await check('dock §16 H: a narrow laptop keeps the viewer beside Chat, both inline, the canvas still in view', async () => {
  await page.setViewportSize({ width: 1180, height: 760 });
  await openCanvas(); await openGraph();
  const g = await box(companion()), c = await box(pane()), cv = await box(page.locator('[aria-label="Lesson canvas"]'));
  assert.ok(g.right <= c.left + 2, `the viewer ends where Chat starts: ${g.right} > ${c.left}`);
  assert.ok(cv.width >= 300, `canvas width ${cv.width}`);
});
await shot('dock-H-narrow-laptop');
for (const [width, height, name] of [[820, 1000, 'dock-I1-tablet'], [390, 844, 'dock-I2-phone']]) {
  await check(`dock §16 I, inspector §19: at ${width} px the viewer takes Chat's place, with Back to chat; the draft stays`, async () => {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(500);
    if (await companionOpen()) await companion().locator('[data-companion-back]').click();
    await field().waitFor({ state: 'visible' });
    await field().fill('kept draft');
    await showGraph();
    await graphPanel().waitFor({ state: 'visible', timeout: 10000 });
    const back = companion().locator('[data-companion-back]');
    assert.ok(await back.isVisible(), 'Back to chat');
    assert.ok((await box(companion())).width >= width - 40, 'the viewer is full width');
    await shot(name);
    await back.click(); await page.waitForTimeout(400);
    assert.ok(await field().isVisible(), 'Chat is back');
    assert.equal(await field().inputValue(), 'kept draft');
    await field().fill('');
  });
}
await page.setViewportSize({ width: 1440, height: 900 });

await check('dock §15: on Home and in the Library nothing hides behind the dock - the last card ends above it', async () => {
  await page.setViewportSize({ width: 1440, height: 640 });
  for (const where of ['/apps', '/library?type=canvases']) {
    await page.goto(`${BASE}${where}`);
    await page.locator('[data-library-card], [data-home-card], main a, main button').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500); // no networkidle: the page keeps a connection open
    // Scroll every scroller to its end until the page stops growing (cards fill in their counts after the first paint).
    for (let last = -1, now = 0; last !== now; await page.waitForTimeout(400)) { last = now; now = await page.evaluate(() => { let h = 0; document.querySelectorAll('main, main *').forEach((n) => { if (n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) { n.scrollTop = n.scrollHeight; h += n.scrollHeight; } }); window.scrollTo(0, document.scrollingElement.scrollHeight); return h + document.scrollingElement.scrollHeight; }); }
    const top = (await box(bar)).top;
    const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('main *')].filter((n) => n.getBoundingClientRect().height > 0 && n.children.length === 0 && getComputedStyle(n).visibility !== 'hidden').map((n) => n.getBoundingClientRect().bottom)));
    assert.ok(lowest <= top + 1, `${where}: content ends at ${lowest}, the dock starts at ${top}`);
    near((await box(bar)).left, (await box(page.locator('[data-shell-sidebar]'))).right, `${where}: dock from the sidebar edge`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/apps`); await page.waitForTimeout(1200);
});
await shot('dock-J-home');

await check('no page errors, no model call, no email in the workspace or the dock', async () => {
  assert.deepEqual(errors, []);
  assert.ok(asks.length === 1, `${asks.length} stubbed asks`);
  for (const where of ['main', '[data-agent-bar]']) assert.doesNotMatch(await page.locator(where).first().innerText(), /@example\.com/);
});

await browser.close();
console.log(`${results.length}/${results.length} checks passed`);
