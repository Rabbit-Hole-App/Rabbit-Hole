// The workspace dock and the Map inspector (docs/features/workspace-dock.md, inspector.md), against the LOCAL stack only:
// a real session, Home, Library and Shell from the lane's local D1. The keyless stack has no indexer, so the repository
// project's endpoints are stubbed with a Graphify-shaped snapshot (index_repository.py) read off the real nanoGPT files
// pinned in packages/learn-render (commit 3adf61e). /api/learn/ask is stubbed: no model call. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8868 SMALL_CP=http://127.0.0.1:8869 node e2e/workspace-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { COMMIT, REPO, routeRepository } from './nanogpt-repository-fixture.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8868';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8869';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('workspace-check runs against the local stack only');
const SHOTS = process.argv[2] || 'workspace-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `dock-${run}@example.com`, secret, handle: `dock_${run}` }) })).json()).session;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
for (const title of ['Attention', 'Tokenization', 'Backprop', 'Softmax', 'Layer norm', 'Positional encoding']) await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `${title} ${run}` }) });

let repoStatus = 'ready';
const asks = [];
const ANSWER = 'train.py is the training loop: it builds GPT from model.py and optimises it.';

const browser = await chromium.launch();
// A crash (an unhandled error in a check, the harness or the shared fixture) still closes the browser, then fails the run:
// the error is printed and the exit code is 1. A crashed run once left 4 headless browsers behind (2026-10-07).
const crash = async (error) => { console.error(error); await browser.close().catch(() => {}); process.exit(1); };
process.once('uncaughtException', crash);
process.once('unhandledRejection', crash);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await routeRepository(context, () => repoStatus);
await context.route('**/api/learn/ask', (route) => {
  asks.push(JSON.parse(route.request().postData()));
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: ANSWER })}\n\nevent: done\ndata: {}\n\n` });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name) => { await page.waitForTimeout(400); await page.mouse.move(0, 0); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const box = (locator) => locator.evaluate((n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });
const near = (a, b, msg, tol = 1.5) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const bar = page.locator('[data-agent-bar]'), input = bar.locator('textarea'), panel = page.locator('[data-map-panel]');
const chips = async () => (await bar.locator('[data-scope-chip]').allInnerTexts()).map((t) => t.trim());
const title = () => panel.locator('[data-inspector-title]').innerText();
// The Files view is a tree since repository-browser.md: a file row is keyed by its path, under the Files tab.
const fileRow = (path) => page.locator(`[data-file-row="${path}"]`);
const openMap = async () => { await page.goto(`${BASE}/apps/${REPO}?tab=map`); await page.locator('[data-graph-node]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(600); };
const files = async () => { await page.locator('[data-project-tabs]').getByRole('tab', { name: 'Files', exact: true }).click(); await fileRow('train.py').waitFor(); };
const section = () => page.locator('main > section').first();
// A fold keeps its open state while the learner walks from object to object, so open it only when it is closed.
const fold = async (name, open = true) => { const d = panel.locator(`[data-inspector-section="${name}"]`); if ((await d.evaluate((n) => n.open)) !== open) await d.locator('summary').click(); };

await openMap();
await check('dock §1 §11: the composer spans the workspace from the sidebar edge to the window edge, never behind the sidebar', async () => {
  const b = await box(bar), side = await box(page.locator('[data-shell-sidebar]')), form = await box(bar.locator('[data-chat-composer]'));
  near(b.left, side.right, 'dock starts at the sidebar edge');
  near(b.right, 1440, 'dock ends at the window edge');
  assert.ok(form.left - b.left <= 24 && b.right - form.right <= 24, `input spans the dock, not a centred column: ${form.left - b.left} / ${b.right - form.right}`);
});
await check('dock §2 §19: the dock is chrome - a top divider, an opaque surface, no gradient, a hairline input shadow; Auto stays neutral (§5)', async () => {
  const s = await bar.evaluate((n) => { const c = getComputedStyle(n), f = getComputedStyle(n.querySelector('[data-chat-composer]')), auto = [...n.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Auto'); const a = getComputedStyle(auto); return { border: c.borderTopWidth, bg: c.backgroundColor, image: c.backgroundImage, shadow: f.boxShadow, autoColor: a.color, autoBg: a.backgroundColor }; });
  assert.equal(s.border, '1px'); assert.equal(s.bg, 'rgb(255, 255, 255)'); assert.equal(s.image, 'none');
  assert.doesNotMatch(s.shadow, /24px/, 'the popover shadow is gone'); assert.match(s.shadow, /0px 1px 2px/);
  assert.notEqual(s.autoColor, 'rgb(35, 131, 226)'); assert.ok(['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'].includes(s.autoBg), s.autoBg);
});

await check('dock §4, inspector §4: a graph node selects too - a node named like its file is that file, one chip, and a symbol node adds its file', async () => {
  await page.locator('[data-graph-node="train"]').focus(); await page.keyboard.press('Enter');
  await panel.locator('[data-inspector-title]').waitFor();
  assert.equal(await title(), 'train.py'); assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'train.py']);
  assert.ok(await panel.locator('[data-in-context]').isVisible());
  await page.locator('[data-graph-node="model_gpt"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await title(), 'GPT'); assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'GPT']);
  await bar.getByRole('button', { name: 'Remove karpathy/nanoGPT' }).click(); // only the repository's x clears it all
  assert.deepEqual(await chips(), []);
  await openMap();
});
await shot('dock-B0-inspector-closed-no-context');
await files();
await fileRow('train.py').click();
await panel.locator('[data-inspector-title]').waitFor();
await check('dock §4 §17, inspector §13: click train.py - the inspector shows it, the composer reads karpathy/nanoGPT › train.py, In context', async () => {
  assert.equal(await title(), 'train.py');
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'train.py']);
  assert.equal(await bar.locator('[data-scope-chips] svg').count() >= 1, true, 'a › between the levels');
  assert.ok(await panel.locator('[data-in-context]').isVisible());
});
await check('dock §1 §6 §15: main and inspector end exactly at the dock\'s top edge; the inspector has one left divider, no outline', async () => {
  const b = await box(bar), s = await box(section()), a = await box(panel);
  near(s.bottom, b.top, 'main workspace bottom'); near(a.bottom, b.top, 'inspector bottom');
  const st = await panel.evaluate((n) => { const c = getComputedStyle(n); return { left: c.borderLeftWidth, shadow: c.boxShadow, outline: c.outlineStyle, inner: getComputedStyle(n.lastElementChild).boxShadow }; });
  assert.equal(st.left, '1px'); assert.equal(st.shadow, 'none'); assert.equal(st.inner, 'none');
});
await check('inspector §1 §2: a sticky object header - icon, title, breadcrumb, path:line, Open source, close - and Overview | Source underline tabs only', async () => {
  const header = panel.locator('[data-inspector-header]');
  assert.equal(await header.locator('[data-inspector-crumb]').innerText(), 'karpathy/nanoGPT › train.py');
  assert.match(await header.innerText(), /train\.py:1\s*·\s*Python file/);
  assert.equal(await header.locator('[data-inspector-open-source]').getAttribute('href'), `https://github.com/karpathy/nanoGPT/blob/${COMMIT}/train.py`);
  assert.ok(await header.locator('[data-map-panel-close]').isVisible());
  assert.deepEqual((await panel.getByRole('tab').allInnerTexts()).map((t) => t.trim()), ['Overview', 'Source']);
  assert.equal(await panel.locator('[role="tablist"]').evaluate((n) => getComputedStyle(n).borderRadius), '0px', 'no pill track');
});
await check('inspector §3 §6 §7 §10 §21: Purpose and Why it matters say what is missing in one line with an ask; no debug copy, no empty sections', async () => {
  const text = await panel.innerText();
  assert.match(text, /Purpose\s*No summary yet\. Ask about this →/); assert.match(text, /Why it matters\s*No explanation yet\. Ask why →/);
  assert.doesNotMatch(text, /project decision|recorded yet|No relationships|planner|Fixture/i);
  assert.equal(await panel.locator('[data-inspector-section="relationships"]').count(), 1, 'train.py imports model.py: a canonical edge');
});
await check('inspector §14: a small source preview, 8 lines from the object\'s own line, read from the pinned commit', async () => {
  const lines = await panel.locator('[data-inspector-preview] > div').allInnerTexts();
  assert.equal(lines.length, 8); assert.match(lines[0], /^1\s/);
});
await check('inspector §11 §12: two actions, Ask about this (secondary) and Learn this, the only primary button', async () => {
  assert.deepEqual((await panel.locator('[data-inspector-actions] button').allInnerTexts()).map((t) => t.trim()), ['Ask about this', 'Learn this']);
  const primaries = await panel.locator('button').evaluateAll((all) => all.filter((b) => getComputedStyle(b).backgroundColor === 'rgb(35, 131, 226)').map((b) => b.textContent.trim()));
  assert.deepEqual(primaries, ['Learn this']);
});
await check('inspector §9: an empty conversation is one row, Ask about train.py →', async () => {
  assert.match(await panel.locator('[data-inspector-section="conversation"]').innerText(), /Conversation\s*Ask about train\.py →/);
});
await shot('dock-A-desktop-inspector-composer');
await shot('dock-D-repo-file-chips');
await shot('insp-B-file-no-explanation-yet');
await page.locator('[data-in-context]').scrollIntoViewIfNeeded();
await shot('insp-F-in-context');

await check('dock §5 §17: type naturally - Auto sends the question with train.py as context, no slash; the answer lands in the bar\'s window', async () => {
  await input.fill('Why does this exist?');
  await input.press('Enter');
  await page.locator('[data-result-sheet]').getByText(ANSWER).waitFor({ timeout: 10000 });
  const sent = asks.at(-1);
  assert.equal(sent.message, 'Why does this exist?');
  assert.deepEqual(sent.repository_context, { commit: COMMIT, path: 'train.py', label: 'train.py' });
  assert.equal(sent.scope.app, REPO);
  const sheet = await box(page.locator('[data-result-sheet] > div')), side = await box(panel);
  assert.ok(sheet.right <= side.left + 1, `the window sits over the workspace, not the inspector: ${sheet.right} > ${side.left}`);
});
await shot('dock-K-answer-in-the-window');
await page.getByRole('button', { name: 'Collapse results' }).click();
await check('inspector §9: the conversation about train.py counts and opens its messages', async () => {
  const conv = panel.locator('[data-inspector-section="conversation"]');
  assert.match(await conv.locator('summary').innerText(), /Conversation\s*2 messages/);
  await fold('conversation');
  assert.match(await conv.innerText(), /Why does this exist\?[\s\S]*training loop/);
});
await shot('insp-D-conversation-with-messages');

await check('dock §10 §18, §11: closing the inspector keeps the context; the workspace widens and the dock still spans', async () => {
  const before = await box(section());
  await panel.locator('[data-map-panel-close]').click();
  await page.waitForTimeout(500);
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'train.py']);
  const after = await box(section()), b = await box(bar);
  assert.ok(after.width > before.width + 300, `${before.width} -> ${after.width}`);
  near(b.right, 1440, 'dock still to the edge'); near(after.bottom, b.top, 'main ends at the dock');
});
await shot('dock-E-context-survives-collapse');

await page.locator('[data-map-panel-open]').click();
await fileRow('model.py').click();
await page.waitForTimeout(300);
await check('inspector §4 §8: a code file lists its symbols and its canonical relationships in the graph\'s own words', async () => {
  assert.equal(await title(), 'model.py');
  assert.match(await panel.locator('[data-inspector-section="symbols"] summary').innerText(), /Symbols\s*\d+/);
  const rel = panel.locator('[data-inspector-section="relationships"]');
  assert.match(await rel.locator('summary').innerText(), /Relationships\s*\d+/);
  await fold('relationships');
  const groups = await rel.locator('[data-relation]').evaluateAll((all) => all.map((g) => g.dataset.relation));
  assert.ok(groups.includes('Contains') && groups.includes('Imports') && groups.includes('Imported by'), groups.join(', '));
  assert.match(await rel.locator('[data-relation="Imported by"]').innerText(), /train\.py/);
});
await page.locator('[data-inspector-section="relationships"]').scrollIntoViewIfNeeded();
await shot('insp-C-relationships-expanded');
await check('inspector §18, dock §6 §7: the header stays put while the body scrolls on its own', async () => {
  await fold('symbols');
  const body = panel.locator('[role="tabpanel"]').first();
  await body.evaluate((n) => { n.scrollTop = 0; });
  const y0 = (await box(panel.locator('[data-inspector-header]'))).top;
  await body.evaluate((n) => { n.scrollTop = n.scrollHeight; });
  await page.waitForTimeout(150);
  assert.ok(await body.evaluate((n) => n.scrollTop > 100), 'the body scrolled');
  near((await box(panel.locator('[data-inspector-header]'))).top, y0, 'header did not move', 0.5);
  assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0, 'the page itself did not scroll');
  await body.evaluate((n) => { n.scrollTop = 0; });
  await fold('symbols', false);
});
await page.locator('[data-inspector-section="relationships"] [data-relation]').first().waitFor();
await page.evaluate(() => { document.querySelector('[data-map-panel] [role="tabpanel"]').scrollTop = 0; });
await shot('insp-A-code-file-metadata');

let historyLength;
await check('inspector §8 §15, dock §3: a related object selects in place - inspector and context follow, the URL does not; Back is local', async () => {
  historyLength = await page.evaluate(() => history.length);
  const url = page.url();
  await panel.locator('[data-relation="Contains"] button').filter({ hasText: /^GPT$/ }).click();
  await page.waitForTimeout(200);
  assert.equal(await title(), 'GPT');
  assert.equal(await panel.locator('[data-inspector-crumb]').innerText(), 'karpathy/nanoGPT › model.py › GPT');
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'GPT']);
  assert.equal(page.url(), url); assert.equal(await page.evaluate(() => history.length), historyLength);
  await panel.locator('[data-inspector-back]').click();
  assert.equal(await title(), 'model.py');
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py', 'GPT'], 'Back moves the inspector only');
  await fold('relationships');
  await panel.locator('[data-relation="Contains"] button').filter({ hasText: /^GPT$/ }).click();
});
await shot('insp-H1-symbol');
await check('dock §3 §18, inspector §13: each chip comes off alone, one level at a time; the inspector stays on GPT and loses In context', async () => {
  assert.ok(await panel.locator('[data-in-context]').isVisible());
  await bar.getByRole('button', { name: 'Remove GPT' }).click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'model.py']);
  assert.equal(await title(), 'GPT'); assert.equal(await panel.locator('[data-in-context]').count(), 0);
  await bar.getByRole('button', { name: 'Remove model.py' }).click();
  assert.deepEqual(await chips(), ['karpathy/nanoGPT']);
  assert.ok(await panel.isVisible());
});
await check('inspector §4: an external dependency is its own object - no file, no source, no preview', async () => {
  await panel.getByRole('button', { name: 'Back' }).click(); // model.py
  await fold('relationships');
  await panel.locator('[data-relation="Imports"] button').filter({ hasText: /^torch$/ }).click();
  assert.equal(await title(), 'torch');
  assert.match(await panel.locator('[data-inspector-header]').innerText(), /External dependency/);
  assert.equal(await panel.getByRole('tab').count(), 0); assert.equal(await panel.locator('[data-inspector-open-source], [data-inspector-preview]').count(), 0);
  assert.deepEqual(await chips(), ['karpathy/nanoGPT', 'torch']);
  const importers = await panel.locator('[data-relation="Imported by"] button').allInnerTexts();
  assert.deepEqual(importers, [...new Set(importers)], 'each file once');
});
await shot('insp-H2-external');
await check('inspector §16: Source shows the file at the pinned commit with a link to it; Open source stays in the header', async () => {
  await fileRow('model.py').click();
  await panel.getByRole('tab', { name: 'Source' }).click();
  const reader = panel.getByRole('region', { name: 'Repository source' });
  await reader.locator('[data-source-line="1"]').waitFor();
  assert.equal(await reader.locator('[data-source-commit]').getAttribute('data-source-commit'), COMMIT);
  assert.ok(await panel.locator('[data-inspector-open-source]').isVisible());
});
await shot('insp-E-source');
await panel.getByRole('tab', { name: 'Overview' }).click();

await check('dock §9: the divider resizes 320-520, the width is remembered, double-click resets to 380', async () => {
  const sep = panel.getByRole('separator', { name: 'Resize the inspector' });
  const drag = async (dx) => { const s = await box(sep); await page.mouse.move(s.left + 3, s.top + 200); await page.mouse.down(); await page.mouse.move(s.left + 3 + dx, s.top + 200, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200); };
  await drag(-400);
  assert.equal((await box(panel)).width, 520);
  await shot('dock-C1-inspector-wider');
  await drag(400);
  assert.equal((await box(panel)).width, 320);
  await shot('insp-G-narrow-inspector');
  await shot('dock-C2-inspector-narrower');
  await page.reload(); await page.locator('[data-graph-node]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-map-panel-open]').click(); await page.waitForTimeout(400);
  assert.equal((await box(panel)).width, 320, 'remembered after reload');
  await sep.dblclick(); await page.waitForTimeout(400);
  assert.equal((await box(panel)).width, 380);
});

await files();
await fileRow('train.py').click();
await check('dock §12: the input grows upward to five lines, then scrolls; the workspace shrinks with it, nothing underneath', async () => {
  const one = await box(input), top0 = (await box(bar)).top;
  await input.fill(Array.from({ length: 9 }, (_, i) => `line ${i + 1} of a long paste`).join('\n'));
  await page.waitForTimeout(300);
  const many = await input.evaluate((n) => ({ h: n.clientHeight, sh: n.scrollHeight }));
  assert.ok(one.height <= 40, `one line: ${one.height}`);
  assert.equal(many.h, 132, 'five 24px lines and the 12px padding'); assert.ok(many.sh > many.h, 'then it scrolls');
  const b = await box(bar);
  assert.ok(b.top < top0 - 90, 'the dock grew upward');
  near((await box(section())).bottom, b.top, 'main follows the dock'); near((await box(panel)).bottom, b.top, 'inspector follows the dock');
});
await shot('dock-F-multiline');
await input.fill('');
await check('dock §13: + adds input and sources only - the Start paths, nothing else', async () => {
  await bar.getByRole('button', { name: 'Add' }).click();
  const items = (await page.locator('[data-agent-bar] .shadow-pop button, [data-agent-bar] [role="menu"] button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  assert.deepEqual(items, ['Repository', 'Blank canvas']);
  await page.keyboard.press('Escape');
});

await check('dock §14: a background activity row above the input - Reading repository… - dismissible, and the input stays usable', async () => {
  repoStatus = 'indexing';
  await openMap();
  const row = bar.locator('[data-activity="repository"]');
  await row.waitFor({ timeout: 10000 });
  assert.equal((await row.innerText()).trim(), 'Reading repository…');
  assert.ok((await box(row)).bottom <= (await box(bar.locator('[data-chat-composer]'))).top + 1, 'above the input');
  assert.equal(await page.locator('main [role="status"]').count(), 0, 'no blocking box in the page while a snapshot is shown');
  await input.fill('Still typing');
  assert.equal(await input.inputValue(), 'Still typing');
  await shot('dock-G-activity-row');
  await row.getByRole('button').click();
  assert.equal(await row.count(), 0);
  await input.fill('');
  repoStatus = 'ready';
});

await check('dock §16 H: a narrow laptop keeps the inline inspector beside a narrower workspace; the dock stays global', async () => {
  await page.setViewportSize({ width: 1180, height: 760 });
  await openMap(); await files(); await fileRow('train.py').click(); await page.waitForTimeout(500);
  const a = await box(panel), b = await box(bar);
  assert.equal(await panel.evaluate((n) => getComputedStyle(n).position), 'relative');
  near(a.right, 1180, 'inspector at the edge'); near(a.bottom, b.top, 'inspector on the dock'); near(b.right, 1180, 'dock to the edge');
});
await shot('dock-H-narrow-laptop');
await check('dock §16 I, inspector §19: a tablet shows the inspector as a right drawer over the workspace, ending at the dock', async () => {
  await page.setViewportSize({ width: 820, height: 1000 }); await page.waitForTimeout(500);
  const a = await box(panel), b = await box(bar), form = await box(bar.locator('[data-chat-composer]'));
  assert.equal(await panel.evaluate((n) => getComputedStyle(n).position), 'absolute');
  near(a.right, 820, 'drawer at the right edge'); near(a.bottom, b.top, 'drawer ends at the dock'); near(a.width, 416, 'drawer width');
  assert.ok(form.width > 500, `composer not squeezed: ${form.width}`);
});
await shot('dock-I1-tablet-drawer');
await check('dock §16 I, inspector §19: a phone shows it as a full-width sheet between the top strip and the dock; the composer keeps its width', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  const a = await box(panel), b = await box(bar), form = await box(bar.locator('[data-chat-composer]'));
  near(a.left, 0, 'full width'); near(a.right, 390, 'full width'); near(a.top, 40, 'below the top strip'); near(a.bottom, b.top, 'ends at the dock');
  assert.ok(form.width >= 350, `composer width ${form.width}`);
  assert.equal(await title(), 'train.py');
});
await shot('dock-I2-phone-sheet');
await page.setViewportSize({ width: 1440, height: 900 });

await check('dock §15: on Home and in the Library nothing hides behind the dock - the last card ends above it', async () => {
  await page.setViewportSize({ width: 1440, height: 640 });
  for (const where of ['/apps', '/library?type=canvases']) {
    await page.goto(`${BASE}${where}`);
    await page.locator('[data-library-card], [data-home-card], main a, main button').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500); // no networkidle: the page keeps a connection open
    // Scroll every scroller to its end until the page stops growing (cards fill in their counts after the first paint).
    for (let last = -1, now = 0; last !== now; await page.waitForTimeout(400)) { last = now; now = await page.evaluate(() => { let h = 0; document.querySelectorAll('main, main *').forEach((n) => { if (n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) { n.scrollTop = n.scrollHeight; h += n.scrollHeight; } }); return h; }); }
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
