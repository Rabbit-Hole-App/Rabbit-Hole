// /dive visual acceptance (docs/features/dive-v1.md), flows A-I, against the LOCAL stack only:
//   npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.jsonc --local --persist-to .small/dive-local --port 8788
// It writes to local D1 and this browser profile; never point it at a deployed worker.
// Usage: node e2e/dive-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:8788';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('dive-check runs against the local stack only');
const OUT = process.argv[2] || 'dive-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const cookie = `small_session=${session}`;
const get = async path => (await fetch(`${BASE}${path}`, { headers: { cookie } })).json();
const post = async (path, body) => (await fetch(`${BASE}${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

// A fresh root canvas per run, seeded with the NanoGPT deep-dive board.
const root = await post('/api/canvases', { title: 'Attention' });
const BOARD = 'nanogpt-deep-dive';
const ROOT_URL = `/apps/${root.name}?board=${BOARD}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const open = async url => { await page.goto(`${BASE}${url}`); await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 }); await page.waitForTimeout(1500); };
const url = () => new URL(page.url());
const blocks = () => page.$$eval('[data-block-id]:not([data-chat-block])', nodes => nodes.map(node => node.dataset.blockId));
// A card is selected by pressing its drag strip (the frame handle sits under the card's own strip).
const select = async id => { const strip = page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last(); await strip.scrollIntoViewIfNeeded(); await strip.click({ position: { x: 12, y: 8 } }); await page.waitForTimeout(300); };
const composer = () => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
const slash = async text => { await composer().click(); await composer().fill(text); await page.waitForTimeout(150); await composer().press('Enter'); await page.waitForTimeout(800); };
const deselect = async () => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }; // never a click: it could land on a card
const nav = () => page.locator('[data-dive-navigator]');
const waitPersisted = async () => { await page.waitForFunction(() => /^\/apps\/canvas-[a-f0-9]{8}$/.test(location.pathname) && !location.search.includes('hole='), null, { timeout: 15000 }); await page.waitForTimeout(600); };
// Canvas chrome never covers content (learn-canvas-blocks.md): the navigator sits in the tools' gutter, clear of the surface and the toolbar.
const inGutter = async label => {
  const g = await page.evaluate(() => { const box = s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }; return { nav: box('[data-dive-navigator]'), gutter: (() => { const r = document.querySelector('[data-dive-navigator]')?.closest('[data-dive-gutter],[data-tool-gutter]')?.getBoundingClientRect(); return r && { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; })(), surface: box('[data-canvas-surface]'), toolbar: box('[role="toolbar"][aria-label="Canvas tools"]') }; });
  const apart = (a, b) => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
  assert.ok(g.nav && g.nav.x >= g.gutter.x - 1 && g.nav.right <= g.gutter.right + 1 && g.nav.y >= g.gutter.y, `${label}: navigator inside the gutter`);
  assert.ok(apart(g.nav, g.surface), `${label}: navigator clear of the canvas surface`);
  assert.ok(apart(g.nav, g.toolbar), `${label}: navigator clear of the toolbar`);
  assert.ok(g.toolbar.bottom - g.toolbar.y > 120, `${label}: the toolbar keeps usable height`);
};
const up = async () => { await nav().getByRole('button', { name: 'Up to the parent hole' }).click(); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1500); };

// ---- root, and a selected card before diving ----
await open(ROOT_URL);
await shot('01-root-navigator');
await inGutter('root');
const [card1, card2] = (await blocks()).slice(0, 2);
// The composer: Auto (not a model picker) opens the palette; a chosen command is a removable pill.
const dock = page.locator('[data-learn-dock]');
assert.doesNotMatch(await dock.innerText(), /\b(Opus|Sonnet|Haiku)\b/, 'no model names in the Learn composer');
await composer().fill('softmax');
await dock.getByRole('button', { name: 'Auto' }).click();
await page.getByText('Go down a Rabbit Hole').first().waitFor();
await shot('01b-auto-palette');
await page.getByText('Go down a Rabbit Hole').first().click();
await dock.locator('[data-command-pill]').waitFor();
assert.equal(await composer().inputValue(), 'softmax', 'choosing a command keeps the typed text as its argument');
await shot('01c-command-pill');
await dock.getByRole('button', { name: 'Remove /dive' }).click();
assert.equal(await dock.locator('[data-command-pill]').count(), 0);
assert.equal(await composer().inputValue(), 'softmax', 'the pill\'s × keeps the text');
await dock.getByRole('button', { name: 'Auto' }).waitFor();
await composer().fill('/dive ');
await dock.locator('[data-command-pill]').waitFor();
assert.equal(await composer().inputValue(), '', 'a typed command becomes the pill');
await composer().press('Backspace');
assert.equal(await dock.locator('[data-command-pill]').count(), 0, 'Backspace on an empty argument removes the pill');
// The root navigator shows structure only: no ↑ above the root, no ↓ with nothing below.
assert.equal(await nav().getByRole('button', { name: 'Up to the parent hole' }).count(), 0, 'no ↑ at the root');
assert.equal(await nav().locator('[data-dive-down]').count(), 0, 'no ↓ without children');
assert.doesNotMatch(await nav().innerText(), /none yet/);
const activeLabel = () => nav().locator('[aria-current="location"] [data-dive-level]').evaluate(node => { const style = getComputedStyle(node); return [style.backgroundColor, style.color]; });
assert.deepEqual(await activeLabel(), ['rgb(180, 35, 24)', 'rgb(255, 255, 255)'], 'the current level is a red label with white text');
await select(card1);
await shot('02-selected-card');

// ---- A: an empty dive is a pending hole with a temporary portal; leaving the tree discards it ----
await page.keyboard.press('Control+k');
await page.waitForFunction(() => location.search.includes('hole='));
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1200);
assert.equal(await page.locator('[role="dialog"][aria-label*="earch"]').count(), 0, 'Ctrl+K on a selected card dives, not Search');
const pendingName = url().searchParams.get('hole');
await shot('03-pending-empty-hole');
assert.equal((await get(`/api/canvases/dives?app=${root.name}&board=${BOARD}`)).children.length, 0, 'a pending hole is not persisted');
// Chat works in the empty hole and does not keep it.
const asked = await fetch(`${BASE}/api/learn/ask`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ scope: { app: pendingName, pending: { parent: { app: root.name, board: BOARD }, title: 'Pending' } }, message: 'why?' }) });
const askedText = await asked.text();
assert.doesNotMatch(askedText, /Canvas not found|App required/, `a pending hole's ask reaches the tutor: ${asked.status} ${askedText.slice(0, 120)}`);
assert.equal((await get(`/api/canvases/dives?app=${root.name}&board=${BOARD}`)).children.length, 0, 'chat alone never persists the hole');
await up();
// Back on the parent: the empty hole is still this tab's, its card shows the temporary (dashed) portal.
assert.ok(await page.evaluate(name => !!JSON.parse(sessionStorage.getItem('small.dive.pending') || '{}')[name], pendingName), 'the pending hole survives going up');
assert.equal(await page.locator(`[data-block-id="${card1}"]`).first().evaluate(node => node.className.includes('outline-dashed') && node.className.includes('outline-[#b42318]')), true, 'temporary red portal on the card');
assert.equal(await nav().locator('[data-dive-down]').count(), 1, 'the pending child is below the root');
await select(card1);
assert.equal(await page.locator(`[data-block-id="${card1}"]`).first().evaluate(node => node.className.includes('ring-2') && node.className.includes('outline-[#b42318]')), true, 'selection and portal show together');
await shot('04-pending-portal');
// Double-click the card goes down its hole.
await page.locator(`[data-block-id="${card1}"]`).first().dblclick({ position: { x: 40, y: 40 } });
await page.waitForFunction(name => new URLSearchParams(location.search).get('hole') === name, pendingName); await page.waitForTimeout(1000);
await up();
// Leaving the tree (in-app, to Home) while it is still empty discards it.
await page.evaluate(() => { history.pushState(null, '', '/apps'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForTimeout(1000);
assert.equal(await page.evaluate(() => sessionStorage.getItem('small.dive.pending')), null, 'leaving the tree discards the pending record');
assert.equal(await page.evaluate(name => Object.keys(localStorage).filter(key => key.includes(name)).length, pendingName), 0, 'and its local keys');
await open(ROOT_URL);
assert.equal(await page.locator('[data-dive-portal]').count(), 0, 'no outline for an abandoned hole');
await shot('04b-after-leaving-tree');

console.log('flow A ok');

const tree = (app, board = 'main') => get(`/api/canvases/dives?app=${app}&board=${board}`);
const addObject = async label => { await slash(`/whiteboard ${label}`); await waitPersisted(); };
const firstCard = async () => (await blocks())[0];
const selectedRing = id => page.locator(`[data-block-id="${id}"]`).first().evaluate(node => node.className.includes('ring-2'));

// ---- B + D: /dive <topic> from a selected card; the first object keeps it; the parent card gets the red outline ----
await select(card1);
await slash('/dive softmax');
await page.waitForFunction(() => location.search.includes('hole='));
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1000);
await addObject('Softmax sketch');
const softmax = url().pathname.split('/').pop();
await shot('05-persistent-child');
// The stored origin contract: the block, the runtime scene and the authored card stay distinct.
const softmaxOrigin = (await tree(softmax)).dive.origin;
assert.equal(softmaxOrigin.origin_block_id, card1);
assert.match(softmaxOrigin.origin_scene_id, /^nanogpt-c[0-9]{2}-/);
assert.ok(softmaxOrigin.origin_card_id && softmaxOrigin.origin_card_id !== card1 && softmaxOrigin.origin_card_id !== softmaxOrigin.origin_scene_id, JSON.stringify(softmaxOrigin));
assert.ok(softmaxOrigin.origin_concept_ids.length > 0, 'concepts resolved, not defaulted to []');
let rootTree = await tree(root.name, BOARD);
assert.deepEqual(rootTree.children.map(child => [child.name, child.title, child.origin_block_id]), [[softmax, 'Softmax', card1]]);
await up();
assert.equal(url().pathname + url().search, ROOT_URL);
assert.equal(await page.locator(`[data-dive-portal="${softmax}"]`).count(), 1, 'the originating card is a portal');
assert.equal(await selectedRing(card1), true, 'climbing back selects the originating card');
await shot('06-parent-red-outline');

// ---- C: the portal enters the child; Ctrl+K on a card with a child enters it, never a duplicate ----
await page.locator(`[data-dive-portal="${softmax}"]`).click();
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
await up();
await page.locator(`[data-block-id="${card1}"]`).first().dblclick({ position: { x: 40, y: 40 } });
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
await up();
await select(card1);
await page.keyboard.press('Control+k');
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
assert.equal((await tree(root.name, BOARD)).children.length, 1, 'no duplicate child');
await up();
console.log('flows B C D ok');

// ---- E: no card selected - /dive <topic> makes a topic anchor card on this canvas and dives from it ----
const anchorCard = () => page.$$eval('[data-block-id]:not([data-chat-block])', nodes => nodes.find(node => node.innerText.includes('Explain numerical stability'))?.dataset.blockId || null);
await deselect();
await slash('/dive explain numerical stability');
await page.waitForFunction(() => location.search.includes('hole=')); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1000);
assert.equal(await nav().locator('[aria-current="location"] [data-dive-level]').innerText(), 'Numerical stability');
await shot('07-anchor-pending-hole');
await up(); // still empty: the anchor stays on the parent with the temporary portal
const anchor = await anchorCard();
assert.ok(anchor, 'the anchor card stays on the parent');
assert.equal(await page.locator(`[data-block-id="${anchor}"]`).first().evaluate(node => node.className.includes('outline-dashed')), true, 'the anchor shows the temporary portal while its hole is pending');
await page.locator(`[data-block-id="${anchor}"]`).scrollIntoViewIfNeeded();
await shot('07b-anchor-card-no-outline');
await select(anchor);
await page.keyboard.press('Control+k');
await page.waitForFunction(() => location.search.includes('hole=')); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1000);
await addObject('Stability sketch');
await up();
assert.equal(await page.locator(`[data-block-id="${anchor}"] [data-dive-portal]`).count(), 1, 'a persisted child outlines its anchor');
await shot('07c-anchor-red-outline');
const anchorChild = (await tree(root.name, BOARD)).children.find(child => child.origin_block_id === anchor);
const anchorOrigin = (await tree(anchorChild.name)).dive.origin;
assert.deepEqual([anchorOrigin.origin_block_id, anchorOrigin.origin_scene_id, anchorOrigin.origin_card_id, anchorOrigin.anchor_request], [anchor, null, null, 'explain numerical stability']);
// Bare /dive, no card, no conversation: ask, never an empty "Dive" card.
await deselect();
const before = (await blocks()).length;
await slash('/dive');
await composer().press('Enter'); await page.waitForTimeout(800); // the picker fills "/dive ", Enter runs it
await page.getByText('What do you want to go deeper into?').first().waitFor();
assert.equal((await blocks()).length, before, 'no card made without a topic');
assert.equal(url().searchParams.get('hole'), null);
await shot('07d-bare-dive-asks');
await page.locator('[data-learn-dock]').getByRole('button', { name: 'Remove /dive' }).click(); await composer().fill(''); await page.keyboard.press('Escape');
// /dive <topic> with no card: the anchor shows the topic once, with no Explanation kicker; leaving
// the empty hole takes its temporary portal with it.
await deselect();
await slash('/dive logits');
await page.waitForFunction(() => location.search.includes('hole=')); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1000);
await nav().locator('[aria-current="location"]').hover();
await nav().getByRole('button', { name: 'Delete Logits' }).click(); // "Leave this empty hole"
await page.waitForFunction(() => !location.search.includes('hole=')); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1200);
const logits = await page.$$eval('[data-block-id]:not([data-chat-block])', nodes => nodes.find(node => node.innerText.replace('Ask in chat', '').trim() === 'Logits')?.dataset.blockId || null); // the card's own hover button aside
assert.ok(logits, 'the anchor reads just "Logits": no duplicate body, no kicker');
assert.equal(await page.locator(`[data-block-id="${logits}"] [data-dive-portal]`).count(), 0, 'an abandoned pending child leaves no portal');
await page.locator(`[data-block-id="${logits}"]`).scrollIntoViewIfNeeded();
await shot('07e-anchor-title-once');
console.log('flow E ok');

// ---- H: two cards, two holes: the child picker ----
await nav().locator('[data-dive-down]').click();
await page.locator('[data-dive-picker]').waitFor();
await shot('08-child-picker');
await page.locator('[data-dive-picker]').getByRole('menuitem', { name: 'Softmax' }).click();
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
console.log('flow H ok');

// ---- F: double-click a level name to rename; Enter saves ----
await nav().locator('[aria-current="location"] [data-dive-level]').dblclick();
const rename = nav().getByRole('textbox', { name: 'Rename this Rabbit Hole' });
await rename.fill('Softmax, from scores');
await shot('09-rename');
await rename.press('Enter'); await page.waitForTimeout(800);
assert.equal((await tree(root.name, BOARD)).children.find(child => child.name === softmax).title, 'Softmax, from scores');
console.log('flow F ok');

// ---- G: depth - four levels and more, no cap ----
const levels = [softmax];
for (const topic of ['temperature', 'exp and log', 'overflow', 'float32']) {
  await select(await firstCard());
  await slash(`/dive ${topic}`);
  await page.waitForFunction(() => location.search.includes('hole=')); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(800);
  await addObject(`${topic} sketch`);
  levels.push(url().pathname.split('/').pop());
  if (levels.length === 3) await shot('10-navigator-4-levels');
}
assert.equal((await tree(levels.at(-1))).path.length, 6);
await shot('10b-navigator-6-levels-folded');
await inGutter('six levels');
await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(800);
await inGutter('six levels at 1280x720');
await shot('10c-six-levels-1280x720');
await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(500);
console.log('flow G ok');

// ---- I: delete a leaf after a confirmation; a hole with holes inside needs the subtree warning ----
await nav().locator('[aria-current="location"]').hover();
await nav().getByRole('button', { name: 'Delete float32' }).click();
await page.getByRole('dialog').waitFor();
await shot('11-delete-leaf-confirm');
await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForFunction(name => location.pathname.endsWith(name), levels.at(-2)); await page.waitForTimeout(1200);
assert.equal((await tree(levels.at(-2))).children.length, 0);
await nav().locator('[data-dive-level]').first().click(); // the root
await page.waitForFunction(() => location.search.includes('board=')); await page.waitForTimeout(1500);
await nav().locator('[data-dive-down]').click();
await page.locator('[data-dive-picker] .group', { hasText: 'Softmax, from scores' }).hover();
await page.locator('[data-dive-picker]').getByRole('button', { name: 'Delete Softmax, from scores' }).click();
await page.getByRole('dialog').waitFor();
await shot('12-delete-subtree-confirm');
assert.match(await page.getByRole('dialog').innerText(), /3 holes inside it/);
await page.getByRole('dialog').getByRole('button', { name: /Delete 4 holes/ }).click();
await page.waitForTimeout(1200);
rootTree = await tree(root.name, BOARD);
assert.deepEqual(rootTree.children.map(child => child.title), ['Numerical stability']);
assert.equal(await page.locator(`[data-dive-portal="${softmax}"]`).count(), 0, 'the outline goes with the hole');
console.log('flow I ok');

// ---- the agent-suggested dive (structure only) ----
const card3 = (await blocks())[2];
await page.evaluate(id => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId: id, topic: 'cross-entropy' } })), card3);
await page.locator('[data-dive-suggestion]').waitFor();
await shot('13-agent-suggestion');
await page.getByRole('button', { name: 'Keep it on this canvas' }).click();
assert.equal(await page.locator('[data-dive-suggestion]').count(), 0);

// ---- Ctrl+K with no card selected is the global Search, unchanged ----
await deselect();
await page.keyboard.press('Control+k');
await page.waitForTimeout(600);
assert.equal(url().searchParams.get('hole'), null);
await shot('14-ctrl-k-no-card-search');
await page.keyboard.press('Escape');
console.log('all flows ok; root', ROOT_URL);
await browser.close();
if (errors.length) { console.log('page errors:', errors); process.exit(1); }
