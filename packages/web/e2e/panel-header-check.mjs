// The canvas's right panel header (docs/features/panel-header.md): Chat (permanent, first and the default: chat workspace
// brief 2026-10-13 section 3), Find, Table of contents and Comments as icon tabs, then Pin and Close; a real find that frames and selects a card off screen. Against the LOCAL stack
// only: local D1 and fresh browser profiles. No model is called: /api/learn/ask is answered here and any other model
// route fails the run. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 node e2e/panel-header-check.mjs [shotsDir]
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8889';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('panel-header-check runs against the local stack only');
const SHOTS = process.argv[2] || 'panel-header-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`panel-owner-${run}@example.com`, `panel_${run}`) };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };

// Search owner brief 2026-10-16: empty query browses objects; direct titles rank before body matches.
// The first salt card has ice only in its body, while the far card names ice in its title.
// A section, two salt cards near the top, filler, and one card far down the column that only a find brings into view.
const filler = Array.from({ length: 8 }, (_, i) => ({ id: `k-fill-${i}`, type: 'explanation', dx: 0, dy: 0, title: `Filler card ${i + 1}`, body: 'Water molecules slow down and line up as they cool. '.repeat(6) }));
const BLOCKS = [
  { id: 'k-head', type: 'heading', dx: 0, dy: 0, level: 1, text: 'Kitchen chemistry' },
  { id: 'k-exp', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts frozen water', body: 'Salt dissolves into the thin film of water on ice and lowers its freezing point.' },
  { id: 'k-quiz', type: 'quiz', dx: 0, dy: 0, question: 'What does SALT do to the freezing point of water?', options: [{ key: 'A', text: 'Lowers it', correct: true }, { key: 'B', text: 'Raises it' }] },
  ...filler,
  { id: 'k-far', type: 'explanation', dx: 0, dy: 0, title: 'Zephyr ice cream', body: 'Churning while it freezes keeps the ice crystals small.' },
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Panel header ${run}` }) })).body;
const catalog = (await api('/api/apps')).body;
const inkKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
await context.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, [inkKey, STATE]);
const asks = [], stray = [], errors = [], hookBases = [];
await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' }); });
await context.route(/\/api\/learn\/(tutor(?!\/next-steps)|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); stray.push(route.request().url()); return route.abort(); });
// Professor Next Steps (#46): opening the canvas asks for hooks. The request goes to the real route, whose planner the gate
// stack answers at the provider boundary with the journey fixture (e2e/provider-tripwire.js); its basis is recorded so the
// check holds it to the eligibility rules (docs/features/professor-next-steps.md §2.3).
// Counted per page load: check 12's reload is a fresh page, which may ask for its basis again (the server cache answers it).
const hookStarted = Date.now(), hookTiming = [], hookRequests = new WeakMap();
const hookTrace = (kind, detail = {}) => { const entry = { ms: Date.now() - hookStarted, kind, ...detail }; hookTiming.push(entry); console.log('HOOK_TRACE', JSON.stringify(entry)); };
let load = 0;
await context.route(/\/api\/learn\/tutor\/next-steps$/, route => {
  const body = JSON.parse(route.request().postData() || '{}');
  const detail = { load, basis: body.input?.basis ?? null, refresh: body.refresh ?? null, reason: body.reason ?? body.input?.reason ?? null, ms: Date.now() - hookStarted };
  hookBases.push(detail); hookRequests.set(route.request(), hookBases.length);
  hookTrace('request', { number: hookBases.length, ...detail });
  return route.continue();
});
const page = await context.newPage();
page.on('domcontentloaded', () => { load++; hookTrace('domcontentloaded', { load }); }); // full document loads only, never an in-app route change
page.on('pageerror', error => errors.push(error.message));
page.on('framenavigated', frame => { if (frame === page.mainFrame()) hookTrace('navigation', { path: new URL(frame.url()).pathname }); });
page.on('console', message => { if (/\[vite\]|Fast Refresh|hot updated|hmr/i.test(message.text())) hookTrace('hmr-console', { text: message.text().slice(0, 500) }); });
page.on('response', response => { const number = hookRequests.get(response.request()); if (number) hookTrace('response', { number, status: response.status() }); });
page.on('requestfailed', request => { const number = hookRequests.get(request); if (number) hookTrace('failed', { number, error: request.failure()?.errorText }); });
const startupResponses = [];
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  if (path === '/api/apps' || path === '/api/profile' || path.startsWith('/api/learn/boards/')) startupResponses.push({ path, status: response.status() });
});
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const panel = () => page.locator('aside[aria-label="Learn agent chat"]');
const shot = async (name, clip = null) => {
  await page.waitForTimeout(400);
  const box = clip ? await clip.boundingBox() : null;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } } : {}) });
  console.log('shot', name);
};
const tab = name => page.getByRole('tab', { name, exact: true });
const card = id => page.locator(`[data-block-id="${id}"]`);
const isOpen = async () => (await page.getByRole('button', { name: 'Hide the right panel' }).count()) === 1;
const openPanel = async () => { if (!(await isOpen())) await page.getByRole('button', { name: 'Show the right panel' }).click(); await page.waitForTimeout(500); };
const selected = async () => page.locator('[role="tab"][aria-selected="true"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-tab')));
const findInput = () => page.getByRole('textbox', { name: 'Find text on canvas' });
const count = () => page.locator('[data-find-count]').innerText();
const inCanvas = async id => {
  const frame = await page.locator('[data-canvas-surface]').boundingBox(), box = await card(id).boundingBox();
  return box.y >= frame.y && box.y + Math.min(box.height, 60) <= frame.y + frame.height && box.x >= frame.x && box.x + box.width <= frame.x + frame.width;
};
// A press on the canvas surface beside the cards: no card, no chrome.
const pressCanvas = async () => {
  const point = await page.evaluate(() => {
    const surface = document.querySelector('[data-canvas-surface]'), frame = surface.getBoundingClientRect();
    const card = document.querySelector('[data-block-id="k-exp"]').getBoundingClientRect();
    const describe = hit => ({ tag: hit?.tagName, label: hit?.getAttribute('aria-label'), canvas: !!hit?.closest('[data-canvas-surface]'), panel: !!hit?.closest('aside') });
    const oldPoint = { x: card.right + 120, y: card.top + 20 }, oldHit = describe(document.elementFromPoint(oldPoint.x, oldPoint.y));
    const excluded = '[data-block-id],[data-item-id],[data-shape-id],[data-group-box],[data-group-chip],[data-connection],button,a,input,textarea,[role="toolbar"],[role="menu"],[data-zoom],[data-canvas-doc]';
    for (let y = Math.max(0, frame.top) + 80; y < Math.min(innerHeight, frame.bottom) - 80; y += 48) {
      for (let x = Math.max(0, frame.left) + 80; x < Math.min(innerWidth, frame.right) - 40; x += 48) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('[data-canvas-surface]') === surface && !hit.closest(excluded)) return { x, y, hit: describe(hit), oldPoint, oldHit };
      }
    }
    return { oldPoint, oldHit };
  });
  console.log('CANVAS_PRESS_HIT', JSON.stringify(point));
  assert.ok(Number.isFinite(point.x), 'a real blank canvas point exists');
  // The Search camera centers comfortably with panel space accounted for. A guessed offset
  // beside a card can land in the panel; press only a hit-tested canvas background instead.
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(500);
};

try {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await card('k-exp').waitFor({ timeout: 60000 });
} catch (error) {
  // Preserve the failed startup, including an access/onboarding/error screen, before closing the browser.
  // Only fixture object IDs and response paths/statuses: no cookies, token-bearing queries or storage dump.
  const visible = await page.evaluate(key => {
    let seed = null;
    try { seed = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* diagnostic only */ }
    return { pathname: location.pathname, text: document.body?.innerText.slice(0, 1800),
      seedBlockIds: seed?.blocks?.map(block => block.id) || [],
      renderedBlockIds: [...document.querySelectorAll('[data-block-id]')].map(node => node.dataset.blockId) };
  }, inkKey).catch(() => ({ unavailable: true }));
  const diagnostic = { ...visible, pageErrors: errors, responses: startupResponses };
  writeFileSync(`${SHOTS}/startup-failure.json`, JSON.stringify(diagnostic, null, 2));
  console.error('PANEL_STARTUP_FAILURE', JSON.stringify(diagnostic));
  await page.screenshot({ path: `${SHOTS}/startup-failure.png` }).catch(() => {});
  await browser.close();
  throw error;
}
await page.waitForTimeout(2500); // past the 1200 ms hook debounce
const hooksAtOpen = hookBases.length;

// Owner UI brief 2026-10-20 section 7: Links left the tray for Search's Links filter (toc-links-search-check.mjs), so four tabs.
await check('1 the header is seven icon buttons in the owner\'s order: four tabs (Chat first, Comments last, no Links), the one Context / Files / Graph control, Pin, Close; no visible text', async () => {
  await openPanel();
  const header = page.locator('[data-panel-header]');
  const names = await header.locator('button').evaluateAll(nodes => nodes.map(node => [node.getAttribute('aria-label'), node.getAttribute('title')]));
  assert.deepEqual(names, [['Chat', 'Chat'], ['Find text on canvas', 'Find text on canvas'], ['Table of contents', 'Table of contents'], ['Comments', 'Comments'], ['Context', 'Context'], ['Keep sidebar open', 'Keep sidebar open'], ['Close sidebar', 'Close sidebar']]);
  assert.equal((await header.innerText()).trim(), '', 'icons only');
  assert.equal(await header.locator('button svg').count(), 7);
  assert.equal(await page.locator('[data-panel-header] [role="tablist"] [role="tab"]').count(), 4, 'the four tabs share one group');
  // Owner brief 2026-10-16 items 3-4: one Context / Files / Graph control (named Context on a canvas with no repository), not a tab,
  // set apart from the navigation icons by spacing.
  assert.equal(await page.locator('[data-panel-header] [role="tablist"] [data-panel-companion]').count(), 0, 'the companion control is not a tab');
  assert.equal(await page.locator('[data-panel-companion]').getAttribute('aria-pressed'), 'false', 'a toggle, the companion closed');
  const [tabs, utility] = [await header.locator('[role="tablist"]').boundingBox(), await page.locator('[data-panel-companion]').boundingBox()];
  assert.ok(utility.x - (tabs.x + tabs.width) >= 12, `the utilities sit apart from the tabs: ${Math.round(utility.x - (tabs.x + tabs.width))} px`);
  assert.equal(await page.locator('[data-panel-header] [role="tablist"] [data-panel-pin], [data-panel-header] [role="tablist"] [data-panel-close]').count(), 0, 'Pin and Close sit outside it');
});

await check('2 Chat is the default tab; Table of contents selects a soft purple with a purple icon (dark too), its outline below the header', async () => {
  assert.deepEqual(await selected(), ['chat']);
  await tab('Table of contents').click();
  assert.deepEqual(await selected(), ['toc']);
  const [bg, fg] = await tab('Table of contents').evaluate(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]);
  // Owner brief 2026-10-16 item 3 (the approved toc-upload-context mockup): pale purple, purple icon; inactive icons neutral.
  assert.deepEqual([bg, fg], ['rgb(238, 229, 252)', 'rgb(100, 49, 160)']);
  assert.notEqual(await tab('Find text on canvas').evaluate(node => getComputedStyle(node).color), fg, 'inactive icons are neutral');
  const dark = await page.evaluate(() => { document.documentElement.classList.add('dark'); const node = document.querySelector('[data-panel-tab="toc"]'); const out = [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]; document.documentElement.classList.remove('dark'); return out; });
  assert.deepEqual(dark, ['rgb(69, 48, 96)', 'rgb(225, 207, 249)'], 'the dark treatment');
  assert.ok(await panel().locator('[data-toc]').isVisible());
  // Owner brief 2026-10-16 item 7 (replaces R4 decision 1A's "Topic 1:"): the title button is the title, its number beside it.
  assert.ok(await panel().getByRole('button', { name: 'Kitchen chemistry', exact: true }).isVisible(), 'the canvas heading is listed');
  assert.equal(await panel().locator('[data-canvas-find]').isVisible(), false);
});
await shot('01-header-toc-active', panel());
await shot('01b-page-toc-active');

// Owner brief 2026-10-16 item 7 (replaces R4 A3's docked Chat composer): the Table of contents has its own conversation and
// composer below the contents, Tutor its only mode. The long contents, drafts kept apart, Send and the narrow panel are on
// their own canvas below (L1-L8).
// Owner UI brief 2026-10-20 section 6: with no TOC messages there is no "TOC conversation" section, only the compact entry
// (data-toc-start); pressing it opens the composer (data-toc-ask), which becomes the conversation once a turn is sent.
const docked = (on = page) => on.locator('aside[aria-label="Learn agent chat"]').locator('[data-toc-conversation], [data-toc-ask]');
const startToc = async (on = page) => { const entry = on.locator('aside[aria-label="Learn agent chat"] [data-toc-start] button'); await entry.waitFor(); await entry.click(); await docked(on).waitFor(); };
const below = async (upper, lower) => { const a = await upper.boundingBox(), b = await lower.boundingBox(); return !!a && !!b && a.y + a.height <= b.y + 1; };
await check('2b short contents, no TOC messages: no TOC conversation section, one entry; pressed, its focused composer stays below them, Tutor its only mode; no Chat header or conversation over the contents', async () => {
  await panel().locator('[data-toc-start]').waitFor();
  assert.equal(await panel().locator('[data-toc-conversation], [data-toc-ask], [data-toc-composer]').count(), 0, 'no empty section or composer');
  assert.equal(await panel().getByText('TOC conversation', { exact: true }).count(), 0, 'no "TOC conversation" header');
  await startToc();
  assert.ok(await docked().locator('[data-toc-composer] textarea').first().isVisible(), 'the composer shows');
  await expect(docked().locator('[data-toc-composer] textarea').first()).toBeFocused();
  assert.ok(await below(panel().locator('[data-toc]'), docked()), 'below the contents');
  const [aside, pane] = [await panel().boundingBox(), await docked().boundingBox()];
  assert.ok(Math.abs(aside.y + aside.height - (pane.y + pane.height)) < 40, `anchored at the panel's foot: pane ends ${Math.round(pane.y + pane.height)}, panel ${Math.round(aside.y + aside.height)}`);
  assert.equal(await docked().locator('[data-chat-mode]').getAttribute('data-chat-mode'), 'tutor');
  assert.equal(await docked().getByRole('button', { name: 'Mode', exact: true }).count(), 0, 'no mode menu');
  assert.equal(await panel().locator('[data-chat-header]').isVisible(), false);
  assert.equal(await page.getByRole('tabpanel', { name: 'Chat', exact: true }).count(), 0, 'the Table of contents is the one tabpanel');
});
await shot('01c-toc-composer-short', panel());

// Comments is live on a saved canvas (docs/features/canvas-comments.md); comments-check.mjs covers the view itself.
await check('3 Comments selects on a saved canvas and shows the Comments view; the Table of contents comes back', async () => {
  const comments = tab('Comments');
  assert.equal(await comments.getAttribute('aria-disabled'), null);
  await comments.click();
  await page.locator('[data-comments-panel]').waitFor();
  assert.deepEqual(await selected(), ['comments']);
  await tab('Table of contents').click();
  assert.deepEqual(await selected(), ['toc']);
});
await shot('02-comments-tab', page.locator('[data-panel-header]'));

await check('4 one tab at a time: Find replaces the outline and takes the typing focus', async () => {
  await tab('Find text on canvas').click();
  await expect(findInput()).toBeFocused();
  assert.deepEqual(await selected(), ['find']);
  assert.ok(await panel().locator('[data-canvas-find]').isVisible());
  assert.equal(await panel().locator('[data-toc]').isVisible(), false);
  assert.equal(await findInput().evaluate(node => node === document.activeElement), true);
});

await check('5 arrow keys move between the enabled tabs, Comments included on a saved canvas, and wrap', async () => {
  await tab('Find text on canvas').focus();
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['toc']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['comments']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['chat'], 'wraps after Comments, the last tab');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['find']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['toc']);
  assert.equal(await tab('Table of contents').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await selected(), ['find']);
});

await check('6 find matches case-insensitively, one row per card, with a count', async () => {
  await findInput().fill('salt');
  await expect(page.locator('[data-find-count]')).toHaveText('2 results');
  assert.equal(await count(), '2 results');
  assert.deepEqual(await page.locator('[data-find-match]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-find-match'))), ['k-exp', 'k-quiz']);
  assert.deepEqual(await page.locator('[data-find-match] mark').allInnerTexts(), ['salt', 'SALT']);
});

await check('7 Enter and Next frame and select each match in turn; Previous goes back', async () => {
  await findInput().press('Enter');
  await expect(page.locator('[data-find-count]')).toHaveText('1 of 2');
  await expect(card('k-exp')).toHaveAttribute('aria-current', 'true');
  assert.equal(await count(), '1 of 2');
  assert.equal(await card('k-exp').getAttribute('aria-current'), 'true');
  await page.getByRole('button', { name: 'Next match' }).click();
  await expect(page.locator('[data-find-count]')).toHaveText('2 of 2');
  await expect(card('k-quiz')).toHaveAttribute('aria-current', 'true');
  assert.equal(await count(), '2 of 2');
  assert.equal(await card('k-quiz').getAttribute('aria-current'), 'true');
  assert.notEqual(await card('k-exp').getAttribute('aria-current'), 'true', 'one selection');
  await page.getByRole('button', { name: 'Previous match' }).click();
  await expect(card('k-exp')).toHaveAttribute('aria-current', 'true');
  assert.equal(await count(), '1 of 2');
});

await check('8 a real find brings a card from off screen into view and selects it', async () => {
  assert.equal(await inCanvas('k-far'), false, 'starts below the visible canvas');
  await findInput().fill('zephyr');
  await expect(page.locator('[data-find-count]')).toHaveText('1 result');
  assert.equal(await count(), '1 result');
  await findInput().press('Enter');
  await expect.poll(() => inCanvas('k-far')).toBe(true);
  assert.equal(await card('k-far').getAttribute('aria-current'), 'true');
  assert.equal(await inCanvas('k-far'), true);
});

await check('8b a click on a match row frames that card: back up the column to the first salt card', async () => {
  assert.equal(await inCanvas('k-exp'), false, 'framing the far card moved the first one out of view');
  await findInput().fill('ice');
  await expect(page.locator('[data-find-count]')).toHaveText('2 results');
  const rows = await page.locator('[data-find-match]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-find-match')));
  assert.deepEqual(rows, ['k-far', 'k-exp'], 'the title match precedes the body-only match');
  await page.locator('[data-find-match="k-exp"]').click();
  await expect.poll(() => inCanvas('k-exp')).toBe(true);
  assert.equal(await count(), '2 of 2');
  assert.equal(await page.locator('[data-find-match="k-exp"]').getAttribute('aria-current'), 'true');
  assert.equal(await card('k-exp').getAttribute('aria-current'), 'true');
  assert.equal(await inCanvas('k-exp'), true);
});
await shot('03-find-active-matches');
await shot('03b-find-panel', panel());

await check('9 Escape clears the query and restores current-canvas browsing', async () => {
  await findInput().focus();
  await page.keyboard.press('Escape');
  assert.equal(await findInput().inputValue(), '');
  await expect(page.locator('[data-find-count]')).toHaveText(`${BLOCKS.length} results`);
  assert.ok(await page.locator('[data-find-match]').count() > 0, 'empty query browses virtualized results');
  assert.ok(await page.locator('[data-find-match]').count() <= BLOCKS.length);
  await expect(page.locator('[data-find-match="k-head"]')).toBeVisible();
  assert.ok(await isOpen(), 'and leaves the panel open');
});

await check('10 pinned by default: a press on the canvas keeps the panel open', async () => {
  const pin = page.locator('[data-panel-pin]');
  assert.equal(await pin.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('small.learn-panel:pinned')), null, 'nothing stored until the learner chooses');
  await tab('Table of contents').click();
  await pressCanvas();
  assert.ok(await isOpen());
});
await shot('04a-pinned', page.locator('[data-panel-header]'));

await check('11 unpinned: the choice is stored, a find row keeps the panel, a press on the canvas closes it', async () => {
  await page.locator('[data-panel-pin]').click();
  assert.equal(await page.locator('[data-panel-pin]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('small.learn-panel:pinned')), 'false');
  await shot('04b-unpinned', page.locator('[data-panel-header]'));
  await tab('Find text on canvas').click();
  await findInput().fill('salt');
  await expect(page.locator('[data-find-count]')).toHaveText('2 results');
  await page.locator('[data-find-match="k-quiz"]').click();
  await expect(card('k-quiz')).toHaveAttribute('aria-current', 'true');
  assert.ok(await isOpen(), 'working in the panel is not a press on the canvas');
  assert.equal(await card('k-quiz').getAttribute('aria-current'), 'true');
  await pressCanvas();
  assert.equal(await isOpen(), false);
});

await check('12 the pin choice survives a reload', async () => {
  await page.reload();
  await card('k-exp').waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await openPanel();
  assert.equal(await page.locator('[data-panel-pin]').getAttribute('aria-pressed'), 'false');
  await page.locator('[data-panel-pin]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('small.learn-panel:pinned')), 'true');
});

await check('13 Close shuts the panel and changes no canvas content', async () => {
  await page.waitForTimeout(600);
  const before = await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)).blocks.map(block => [block.id, block.title || block.text || block.question])), inkKey);
  const cards = await page.locator('[data-block-id]').count();
  await page.locator('[data-panel-close]').click();
  await page.waitForTimeout(700);
  assert.equal(await isOpen(), false);
  assert.equal(await page.locator('[data-block-id]').count(), cards);
  const after = await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)).blocks.map(block => [block.id, block.title || block.text || block.question])), inkKey);
  assert.equal(after, before);
});
await shot('05-closed');

// L: a canvas with a long contents list, in its own browser context (its own routes; the hook counts above stay this page's).
// /api/learn/ask is answered here with a canned stream; every other model route fails the run; every request to a chat, ask or
// Tutor route is recorded, so opening the tab is shown to request nothing.
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const HEADINGS = Array.from({ length: 30 }, (_, i) => ({ id: `t-h-${i}`, type: 'heading', dx: 0, dy: 0, level: i % 3 === 0 ? 1 : 2, text: `Part ${i + 1}: heat and phase` }));
const LONG = { ...STATE, blocks: [{ id: 't-card', type: 'explanation', dx: 0, dy: 0, title: 'Heat flows from hot to cold', body: 'A metal spoon conducts heat away from your hand faster than wood.' }, ...HEADINGS] };
const longCanvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Panel contents ${run}` }) })).body;
const longKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${longCanvas.name}:ink`;
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx2.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
await ctx2.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, [longKey, LONG]);
const tocAsks = [], tocStray = [], tocErrors = [], chatRequests = [];
await ctx2.route('**/api/learn/ask', route => {
  tocAsks.push(JSON.parse(route.request().postData() || '{}'));
  const n = tocAsks.length;
  return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: `Canned answer ${n}.` }) + frame('done', { ok: true, threadId: `canned-thread-${n}`, userMessageId: `u-${n}`, messageId: `m-${n}` }) });
});
await ctx2.route(/\/api\/learn\/(tutor(?!\/next-steps)|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); tocStray.push(route.request().url()); return route.abort(); });
await ctx2.route(/\/api\/learn\/chat\//, route => (route.request().method() === 'GET' ? route.continue() : route.fulfill({ json: { ok: true } }))); // the canned thread exists nowhere
const p2 = await ctx2.newPage();
p2.on('pageerror', error => tocErrors.push(error.message));
p2.on('request', request => { const path = new URL(request.url()).pathname; if (/^\/api\/(ask\b|learn\/(ask|chat|tutor)\b)/.test(path)) chatRequests.push(`${request.method()} ${path}`); });
const panel2 = () => p2.locator('aside[aria-label="Learn agent chat"]');
const field = () => p2.locator('[data-chat-pane] [data-chat-composer] textarea').first();
const send2 = () => p2.locator('[data-chat-pane] [data-chat-composer] button[aria-label="Send"]');
const mode2 = () => p2.locator('[data-chat-pane] [data-chat-mode]').getAttribute('data-chat-mode');
// The TOC's own composer (owner brief 2026-10-16 item 7): its field, Send and mode.
const tocField = () => docked(p2).locator('[data-toc-composer] textarea').first();
const tocSend = () => docked(p2).locator('[data-toc-composer] button[aria-label="Send"]');
const tocMode = () => docked(p2).locator('[data-chat-mode]').getAttribute('data-chat-mode');
const pickMode = async id => { await p2.locator('[data-chat-pane]').getByRole('button', { name: 'Mode', exact: true }).click(); await p2.locator(`[data-chat-mode-option="${id}"]`).click(); };
const tab2 = name => p2.getByRole('tab', { name, exact: true });
const selected2 = async () => p2.locator('[role="tab"][aria-selected="true"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-tab')));
const list = () => panel2().locator('[data-toc]');
const lastEntry = () => list().getByRole('button', { name: 'Part 30: heat and phase', exact: true });
const chip = () => p2.locator('[data-chat-pane] [data-context-chip]', { hasText: 'Heat flows from hot to cold' }); // Add to chat's attached card
const shot2 = async (name, clip = null) => {
  await p2.waitForTimeout(400);
  const box = clip ? await clip.boundingBox() : null;
  await p2.screenshot({ path: `${SHOTS}/${name}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } } : {}) });
  console.log('shot', name);
};
// The contents reach their last entry above the composer: the list scrolls by itself, and its end shows clear of the composer.
const reachable = async () => {
  assert.ok(await below(list(), docked(p2)), 'the composer is below the contents, never over them');
  const [scrolls, sideways] = await list().evaluate(node => [node.scrollHeight > node.clientHeight + 4, node.scrollWidth > node.clientWidth + 1]);
  assert.ok(scrolls, 'the long contents scroll in their own area');
  assert.equal(sideways, false, 'no horizontal scroll');
  await lastEntry().scrollIntoViewIfNeeded();
  assert.ok(await lastEntry().isVisible());
  assert.ok(await below(lastEntry(), docked(p2)), 'the last entry shows above the composer');
};

await p2.goto(`${BASE}/apps/${longCanvas.name}`);
await p2.locator('[data-block-id="t-card"]').waitFor({ timeout: 60000 });
if (!(await p2.getByRole('button', { name: 'Hide the right panel' }).count())) await p2.getByRole('button', { name: 'Show the right panel' }).click();
await field().waitFor();

await check('L1 in Chat: one Ask question answered, then an unsent draft and a card attached', async () => {
  assert.deepEqual(await selected2(), ['chat']);
  await pickMode('ask'); // Auto on a canvas is the Tutor's planner; Ask is the one /api/learn/ask turn this context answers
  await field().fill('Why does a metal spoon feel colder than a wooden one?');
  await send2().click();
  await p2.locator('[data-chat-pane]').getByText('Canned answer 1.', { exact: true }).waitFor({ timeout: 15000 });
  await field().fill('Which part should I review next?');
  await p2.locator('[data-block-id="t-card"] [data-drag-zone]').last().click({ position: { x: 12, y: 8 }, force: true });
  await p2.getByRole('button', { name: 'Add to chat', exact: true }).click();
  await chip().waitFor();
  assert.equal(await field().inputValue(), 'Which part should I review next?');
  assert.equal(tocAsks.length, 1);
});

await check('L2 opening the Table of contents: its own composer below the long contents, Tutor only and empty; Chat\'s draft, card and conversation stay in Chat; nothing requested', async () => {
  await p2.waitForTimeout(1200); // past the 800 ms thread-state save of the draft and the card (chat-threads.js SAVE_DELAY)
  const mark = chatRequests.length;
  await tab2('Table of contents').click();
  await startToc(p2);
  assert.equal(await tocMode(), 'tutor');
  assert.equal(await tocField().inputValue(), '', 'Chat\'s draft is not here');
  assert.equal(await docked(p2).locator('[data-context-chip]', { hasText: 'Heat flows from hot to cold' }).count(), 0, 'Chat\'s attached card is not here');
  assert.equal(await p2.getByText('Canned answer 1.', { exact: true }).isVisible(), false, 'the conversation stays in Chat');
  await reachable();
  await p2.waitForTimeout(1200); // past the same save delay: entering the tab saves nothing either
  assert.deepEqual(chatRequests.slice(mark), [], 'no chat, ask or Tutor request from opening the tab');
  assert.equal(tocAsks.length, 1);
});
await shot2('06-toc-composer-long', panel2());

await check('L3 drafts and modes stay apart: a TOC draft and Chat\'s draft each survive switching; Chat keeps its own mode, TOC stays Tutor', async () => {
  await tocField().fill('Add a part on boiling points');
  await tab2('Chat').click();
  assert.equal(await field().inputValue(), 'Which part should I review next?', 'Chat\'s draft');
  assert.equal(await mode2(), 'ask', 'Chat\'s own mode, never moved by the TOC');
  await tab2('Table of contents').click();
  await docked(p2).waitFor();
  assert.equal(await tocField().inputValue(), 'Add a part on boiling points', 'the TOC draft');
  assert.equal(await tocMode(), 'tutor');
});

await check('L4 coming back to the contents restores their scroll position, from Chat and after hiding the panel', async () => {
  await tab2('Table of contents').click();
  await docked(p2).waitFor();
  const box = await list().boundingBox();
  await p2.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p2.mouse.wheel(0, 260);
  await p2.waitForFunction(() => document.querySelector('aside[aria-label="Learn agent chat"] [data-toc]').scrollTop > 100);
  const was = await list().evaluate(node => node.scrollTop);
  await tab2('Chat').click();
  await tab2('Table of contents').click();
  await docked(p2).waitFor();
  assert.ok(Math.abs((await list().evaluate(node => node.scrollTop)) - was) <= 2, `back from Chat at ${was}`);
  await p2.getByRole('button', { name: 'Hide the right panel' }).click();
  await p2.getByRole('button', { name: 'Show the right panel' }).click();
  await docked(p2).waitFor();
  assert.ok(Math.abs((await list().evaluate(node => node.scrollTop)) - was) <= 2, `reopened at ${was}`);
});

await check('L5 Send from the TOC: a Tutor turn in the TOC\'s own new thread; the answer shows in the TOC conversation and the panel stays on TOC; Chat and its New chat leave it', async () => {
  await tocSend().click();
  await docked(p2).getByText('Canned answer 2.', { exact: true }).waitFor({ timeout: 15000 });
  assert.deepEqual(await selected2(), ['toc'], 'the panel stays on the Table of contents');
  assert.equal(await docked(p2).getByText('Canned answer 1.', { exact: true }).count(), 0, 'Chat\'s turn is not in the TOC conversation');
  assert.equal(tocAsks.length, 2);
  assert.equal(tocAsks[1].mode, 'tutor', 'the existing Tutor pipeline');
  assert.equal(tocAsks[1].thread_id ?? null, null, 'a new TOC thread, never Chat\'s canned-thread-1');
  await tab2('Chat').click();
  assert.equal(await p2.locator('[data-chat-pane]').getByText('Canned answer 2.', { exact: true }).count(), 0, 'the TOC answer is not in Chat');
  await p2.locator('[data-chat-pane]').getByRole('button', { name: 'New chat', exact: true }).click();
  await tab2('Table of contents').click();
  assert.ok(await docked(p2).getByText('Canned answer 2.', { exact: true }).isVisible(), 'New chat in Chat leaves the TOC conversation');
});
await shot2('07-sent-from-contents-chat', panel2());

await check('L6 a narrow panel (its minimum width) and a phone: contents and composer both usable, no overlap, no horizontal scroll', async () => {
  await tab2('Table of contents').click();
  await docked(p2).waitFor();
  const handle = p2.getByRole('separator', { name: 'Resize Learn panel' });
  await handle.focus();
  for (let i = 0; i < 20; i += 1) await p2.keyboard.press('ArrowRight');
  if (await handle.getAttribute('aria-valuenow') !== await handle.getAttribute('aria-valuemin')) for (let i = 0; i < 40; i += 1) await p2.keyboard.press('ArrowLeft');
  assert.equal(await handle.getAttribute('aria-valuenow'), await handle.getAttribute('aria-valuemin'), 'at the minimum width');
  await reachable();
  assert.ok((await tocField().boundingBox()).width > 200, 'room to type');
  assert.equal(await panel2().evaluate(node => node.scrollWidth > node.clientWidth + 1), false, 'the panel does not scroll sideways');
  await shot2('08-toc-composer-narrow', panel2());
  await p2.setViewportSize({ width: 390, height: 844 });
  await docked(p2).scrollIntoViewIfNeeded();
  assert.ok((await list().boundingBox()).height > 60, 'the contents keep room on a phone');
  await reachable();
  await shot2('09-toc-composer-phone');
});

// Chat's saved thread (an Ask chat) answers only after the tab was entered: it restores into Chat with its own mode, and never
// into the TOC, which stays Tutor. The TOC's own pointer (slot=toc) reads the server's (none: the canned thread exists nowhere).
let releaseThread, threadAsked = false;
const threadHeld = new Promise(resolve => { releaseThread = resolve; });
await p2.route(/\/api\/learn\/chat\/active\?(?!.*slot=toc)/, route => (route.request().method() === 'GET' ? route.fulfill({ json: { threadId: 'toc-thread-2' } }) : route.fallback()));
await p2.route(/\/api\/ask\/threads\/toc-thread-2$/, async route => {
  threadAsked = true;
  await threadHeld;
  return route.fulfill({ json: { id: 'toc-thread-2', title: 'Saved Ask chat', mode: 'ask', contextRefs: [], draft: null, messages: [{ role: 'user', content: 'An earlier Ask question', status: 'done' }, { role: 'assistant', content: 'An earlier Ask answer', status: 'done' }] } });
});
await check('L8 entered before Chat\'s saved thread loads: it restores into Chat with its own mode, never into the TOC, which stays Tutor', async () => {
  await p2.setViewportSize({ width: 1440, height: 900 });
  await p2.reload();
  await p2.locator('[data-block-id="t-card"]').waitFor({ timeout: 60000 });
  for (const end = Date.now() + 30000; !threadAsked; await p2.waitForTimeout(50)) if (Date.now() > end) throw Error('the saved thread was never asked for');
  assert.equal(await p2.locator('[data-chat-pane]').getAttribute('data-chat-restore'), 'loading');
  await tab2('Table of contents').click();
  await startToc(p2); // the canned TOC thread exists nowhere, so the reloaded TOC has no messages: the entry, then the composer
  assert.equal(await tocMode(), 'tutor', 'Tutor in the TOC, Chat\'s thread still loading');
  releaseThread();
  await p2.waitForFunction(() => document.querySelector('[data-chat-pane]')?.dataset.chatRestore === 'ready');
  assert.equal(await tocMode(), 'tutor', 'the saved Ask mode never reaches the TOC');
  assert.equal(await docked(p2).getByText('An earlier Ask answer', { exact: true }).count(), 0, 'Chat\'s thread is not restored into the TOC');
  await tab2('Chat').click();
  await p2.locator('[data-chat-pane]').getByText('An earlier Ask answer', { exact: true }).waitFor();
  assert.equal(await mode2(), 'ask', 'Chat restores its own saved mode');
});

await check('L7 the long canvas: no other model route, no page error', async () => {
  assert.deepEqual(tocStray, []);
  assert.deepEqual(tocErrors, []);
  assert.equal(tocAsks.length, 2);
});
await ctx2.close();

await check('no model route was called and no page error', async () => {
  assert.deepEqual(asks, []);
  assert.deepEqual(stray, []);
  assert.deepEqual(errors, []);
});

// Owner decision 3a (2026-10-20, Tutor workflow): hooks are proactive Tutor suggestions, so opening a canvas, and anything the
// panel does, asks for none (the page opens in Auto; tutor-controls-check covers Tutor On at rest).
await check('the canvas asked for no hooks on open, and nothing the panel did asked (owner 3a; §2.3: never on selection, camera or panel)', async () => {
  writeFileSync(`${SHOTS}/hook-timing.json`, JSON.stringify({ requests: hookBases, events: hookTiming }, null, 2));
  console.log(`hook requests: ${hookBases.length} (${hooksAtOpen} on open)`);
  assert.equal(hooksAtOpen, 0, 'no hook request for the opened canvas');
  assert.equal(hookBases.length, 0, 'find, tabs, pin, close and reloads are never triggers');
});

await browser.close();
console.log(`${results.length}/25 checks passed`);
process.exit(results.length === 25 ? 0 : 1);
