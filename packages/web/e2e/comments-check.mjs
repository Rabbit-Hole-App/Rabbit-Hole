// Canvas comments (docs/features/canvas-comments.md): on an owned canvas, Add comment from a card's
// right-click menu and Add comment here on the empty canvas open the Comments view with a ghost pin; Send posts the
// thread, a pin follows the card, a reply lands, a member's reply arrives with an unread dot, Resolve hides the thread
// and its pin, and none of it touches the board's version. Against the LOCAL stack only: local D1 and a fresh browser
// profile. No model is called: model routes are answered or refused here. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8862 SMALL_CP=http://127.0.0.1:8863 node e2e/comments-check.mjs [shotsDir] (app on app-worker.js, SMALL_ENV=test)
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8858';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8859';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('comments-check runs against the local stack only');
const SHOTS = process.argv[2] || 'comments-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const as = session => async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const owner = { session: await sessionFor(`comments-owner-${run}@example.com`, `owner_${run}`) };
const member = { session: await sessionFor(`comments-member-${run}@example.com`, `member_${run}`) };
const api = as(owner.session), memberApi = as(member.session);

const BLOCKS = [
  { id: 'k-head', type: 'heading', dx: 0, dy: 0, level: 1, text: 'Kitchen chemistry' },
  { id: 'k-exp', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts ice', body: 'Salt dissolves into the thin film of water on ice and lowers its freezing point.' },
  { id: 'k-two', type: 'explanation', dx: 0, dy: 0, title: 'Why sugar does too', body: 'Any dissolved particle gets in the way of the crystal.' },
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Comments ${run}` }) })).body;
const saved = await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE }) });
assert.equal(saved.status, 200, 'the board is saved');
const boardId = saved.body.board_id;
const boardVersion = async () => (await api(`/api/learn/boards/${canvas.name}/main`)).body.version;
const versionBefore = await boardVersion();

// The member joins through the real invitation flow (comments-invite-check.mjs drives its screens): the app runs the
// production entry, and SMALL_ENV=test echoes the link and the code instead of mailing them.
const post = (call, path, body) => call(path, { method: 'POST', body: JSON.stringify(body), headers: { origin: BASE } });
const invited = await post(api, `/api/learn/c/${boardId}/members`, { emails: [`comments-member-${run}@example.com`] });
const inviteToken = invited.body?.invited?.[0]?.test_invite_url?.split('#')[1];
assert.ok(inviteToken, `the invitation echo (needs SMALL_ENV=test and app-worker.js): ${JSON.stringify(invited.body)}`);
const code = (await post(memberApi, '/api/learn/invites/code', { token: inviteToken })).body.test_code;
assert.deepEqual((await post(memberApi, '/api/learn/invites/accept', { token: inviteToken, code })).body, { joined: true, url: `/c/${boardId}` });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
const asks = [], stray = [], errors = [];
await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' }); });
// Next Steps' hook on canvas open is an expected request (professor-next-steps.md); it is aborted like every other write here, so no model is asked.
await context.route(/\/api\/learn\/(tutor|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); if (!route.request().url().endsWith('/api/learn/tutor/next-steps')) stray.push(route.request().url()); return route.abort(); });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
// A failing check leaves a screenshot of the page as it was.
const check = async (label, fn) => {
  try { await fn(); } catch (error) { await page.screenshot({ path: `${SHOTS}/fail-${label.split(' ')[0]}.png` }).catch(() => {}); throw error; }
  results.push(label); console.log(`ok ${label}`);
};
const shot = async (name, clip = null) => {
  await page.waitForTimeout(400);
  const box = clip ? await clip.boundingBox() : null;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } } : {}) });
  console.log('shot', name);
};
const card = id => page.locator(`[data-block-id="${id}"]`);
const panel = () => page.locator('[data-comments-panel]');
// A row's name without its shortcut hint ("Add comment", hint "C").
const rowNames = nodes => nodes.map(node => [...node.childNodes].filter(child => !child.dataset?.menuHint).map(child => child.textContent).join('').trim());
const menuItems = () => page.locator('[data-canvas-menu] [role="menuitem"]').evaluateAll(rowNames);
const menuHint = () => page.locator('[data-canvas-menu] [data-menu-add-comment] [data-menu-hint]').textContent();
const composer = () => panel().locator('[data-comment-composer] textarea');
const pins = () => page.locator('[data-comment-pin]');
// The pin slot (owner, 2026-10-08): an object's pin sits left of its selection actions (Add to chat, Quick Edit: they replaced the
// Ask in chat pill, owner 2026-10-13), never under them; and it touches its object (owner, 2026-10-13: "every comment icon should
// have a minimal contact to the shape/cafrd etc it is attached to"): their boxes overlap by a few px on both axes.
// Never under them means the pin's box never overlaps the actions' box: when the actions are clamped inside a narrow canvas
// (the Chat pane beside it) and run wider than the object, the pin sits below them at the object's corner.
const askPill = () => page.locator('[data-selection-bar]:visible').first();
const contact = (a, b) => [Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)];
const touching = (pinBox, body) => contact(pinBox, body).every(overlap => overlap >= 2);
const beside = async (pinBox, pill, object) => {
  const [box, body] = [await pill.boundingBox(), await object.boundingBox()];
  assert.ok(contact(pinBox, box).some(overlap => overlap <= 1), `never under the selection actions: ${JSON.stringify([pinBox, box])}`);
  assert.ok(touching(pinBox, body), `touching its object: ${JSON.stringify([pinBox, body])}`);
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await card('k-exp').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

await check('1 right-click a card: Start Rabbit Hole stays first, Add comment follows', async () => {
  const box = await card('k-exp').boundingBox();
  await page.mouse.click(box.x + 60, box.y + 30, { button: 'right' });
  const items = await menuItems();
  const at = items.indexOf('Add comment');
  assert.ok(at >= 0, `Add comment in ${items.join(' | ')}`);
  if (items.includes('Start Rabbit Hole')) assert.equal(items.indexOf('Start Rabbit Hole'), at - 1, 'right after Start Rabbit Hole');
  assert.equal(await menuHint(), 'C', 'the row shows its shortcut');
  await shot('01-card-menu', page.locator('[data-canvas-menu]'));
});

await check('2 Add comment opens Comments on a draft: a ghost pin, the card named, Visible to Members only', async () => {
  await page.locator('[data-menu-add-comment]').click();
  await panel().waitFor({ state: 'visible' });
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').getAttribute('data-panel-tab'), 'comments');
  assert.match(await panel().innerText(), /New comment[\s\S]*on Why salt melts ice[\s\S]*Visible to[\s\S]*Members only/);
  assert.equal(await page.locator('[data-comment-pin="draft"]').count(), 1, 'the ghost pin');
  await shot('02-draft');
});

await check('3 Send posts the thread: the author\'s name and avatar, and a pin on the card', async () => {
  await composer().fill('Is the freezing point really lower, or does the salt just melt it?');
  await composer().press('Enter');
  await panel().locator('[data-comment-thread-view]').waitFor();
  const text = await panel().innerText();
  assert.match(text, new RegExp(`@owner_${run}`), 'the author\'s handle');
  assert.match(text, /Is the freezing point really lower/);
  assert.equal(await panel().locator('[data-comment-message] img, [data-comment-message] span[title]').count() >= 1, true, 'an avatar');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-comment-pin="draft"]').count(), 0, 'the ghost is gone');
  assert.equal(await pins().count(), 1, 'one pin');
  const pin = await pins().first().boundingBox();
  await beside(pin, askPill(), card('k-exp'));
  await shot('03-thread-posted');
  // The slot does not move when the card is let go, and the pill's place stays clear.
  const body = await card('k-exp').boundingBox();
  await page.mouse.click(body.x - 200, body.y + 300);
  await page.waitForTimeout(400);
  assert.equal(await askPill().count(), 0, 'deselected');
  assert.deepEqual(await pins().first().boundingBox(), pin, 'the same slot, selected or not');
});

await check('4 a reply lands in the thread, oldest first', async () => {
  await composer().fill('Lower: it is freezing-point depression.');
  await composer().press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-message]').length === 2);
  const messages = await panel().locator('[data-comment-message]').allInnerTexts();
  assert.match(messages[0], /Is the freezing point/);
  assert.match(messages[1], /freezing-point depression/);
  await shot('04-reply');
});

// Owner bug, 2026-10-09 (preview): a send answered by the platform's HTML error page (an uncaught Worker error) showed only
// "Couldn't send."; it now names the status, and the draft stays for Retry. Before the fix this waited for a line that
// never came.
await check('4b a send answered by an HTML error page says its HTTP status, and the draft stays for Retry', async () => {
  const replies = /\/api\/learn\/c\/[^/]+\/threads\/[^/]+\/comments$/;
  const failing = route => (route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'text/html', body: '<!doctype html><title>Worker threw exception</title>' }) : route.fallback());
  await page.route(replies, failing);
  await composer().fill('This one fails.');
  await composer().press('Enter');
  await panel().getByText("Couldn't send (HTTP 500).").waitFor();
  assert.equal(await composer().inputValue(), 'This one fails.', 'the draft is kept');
  await shot('04b-send-failed');
  await page.unroute(replies, failing);
  await panel().getByRole('button', { name: 'Discard' }).click();
});

await check('5 the bare canvas takes no new comment (no menu row, C does nothing, no Comment tool); a stored canvas-point pin stays where it was placed', async () => {
  assert.equal(await page.getByRole('button', { name: /^Comment\s+C$/ }).count(), 0, 'no Comment tool in the toolbar');
  const body = await card('k-exp').boundingBox();
  await page.mouse.click(body.x - 160, body.y + 120);
  await page.mouse.click(body.x - 160, body.y + 120, { button: 'right' });
  const items = await menuItems();
  assert.equal(items.some(item => /comment/i.test(item)), false, items.join(' | '));
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('c');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('[data-comment-pin="draft"]').count(), 0, 'C with nothing selected does nothing');
  // A point comment made before this change (stored by the API): it renders at its point and stays there.
  const made = await api(`/api/learn/c/${boardId}/threads`, { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), anchor: { kind: 'point', x: -120, y: 160 }, body: 'Add a diagram of the ice surface here.', mentions: [] }), headers: { origin: BASE } });
  assert.equal(made.status, 201);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 2, null, { timeout: 15000 });
  const point = page.locator(`[data-comment-pin="${made.body.thread.id}"]`);
  // Relative to the card (selecting it may pan the camera): the point pin keeps its place on the canvas.
  const offset = async () => { const [p, c] = [await point.boundingBox(), await card('k-exp').boundingBox()]; return [Math.round(p.x - c.x), Math.round(p.y - c.y)]; };
  const before = await offset();
  await card('k-exp').click();
  await page.waitForTimeout(600);
  assert.deepEqual(await offset(), before, 'a canvas-point pin stays put');
  await shot('05-point-pin');
});

await check('6 a member replies: the owner\'s list shows the reply count and an unread dot', async () => {
  const base = `/api/learn/c/${boardId}`;
  const list = (await memberApi(`${base}/threads`)).body.threads;
  const first = list.find(thread => thread.preview.startsWith('Is the freezing point'));
  const replied = await memberApi(`${base}/threads/${first.id}/comments`, { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), body: 'Both, I think: try it with sugar.', mentions: [] }) });
  assert.equal(replied.status, 201);
  await panel().getByRole('button', { name: 'All comments' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-unread]').length === 1, null, { timeout: 15000 });
  const row = await panel().locator(`[data-comment-thread="${first.id}"]`).innerText();
  assert.match(row, /2 replies/);
  assert.match(row, /Why salt melts ice/);
  await shot('06-list-unread');
  await panel().locator(`[data-comment-thread="${first.id}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-message]').length === 3);
  assert.match(await panel().innerText(), new RegExp(`@member_${run}[\\s\\S]*try it with sugar`));
  await shot('06b-member-reply');
});

await check('7 Resolve hides the thread from Open and takes its pin away; Resolved shows it', async () => {
  await panel().getByRole('button', { name: 'Resolve' }).click();
  await panel().getByRole('button', { name: 'Reopen' }).waitFor();
  await panel().getByRole('button', { name: 'All comments' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-thread]').length === 1);
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 1);
  await panel().getByRole('combobox', { name: 'Status' }).selectOption('resolved');
  await panel().locator('[data-comment-thread]', { hasText: 'Is the freezing point' }).waitFor();
  assert.doesNotMatch(await panel().innerText(), /Add a diagram/, 'only the resolved thread');
  await shot('07-resolved');
  await panel().getByRole('combobox', { name: 'Status' }).selectOption('open');
});

await check('8 comments never touch the board: same version; a reload keeps threads and pins', async () => {
  assert.equal(await boardVersion(), versionBefore);
  await page.reload();
  await card('k-exp').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 1, null, { timeout: 15000 });
  await page.locator('[data-comment-pin]').first().click();
  await panel().locator('[data-comment-thread-view]').waitFor();
  assert.match(await panel().innerText(), /Add a diagram of the ice surface/);
  await shot('08-after-reload');
});

// Increment 2: the owner's Share settings and the published page (/e).
const visitor = { session: await sessionFor(`comments-visitor-${run}@example.com`, `visitor_${run}`) };
let token;
const share = () => page.locator('[role="dialog"][aria-label="Share this board"]');
// Owner 2026-10-21: View > Comments is a switch like Minimap; off hides the pins, on brings them back, remembered on this device.
await check('8b View > Comments: a switch, on by default; off hides the pins and survives a reload; on shows them again', async () => {
  const bar = page.getByRole('menubar', { name: 'Canvas menu' });
  const toggle = bar.getByRole('switch', { name: 'Comments', exact: true });
  const set = async on => {
    if (!(await toggle.count())) await bar.getByRole('menuitem', { name: 'View' }).click();
    await toggle.waitFor({ timeout: 5000 });
    if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click();
    await page.waitForFunction(v => document.querySelector('[role="menubar"] [role="switch"][aria-label="Comments"]')?.getAttribute('aria-checked') === v, String(on), { timeout: 5000 });
    await page.keyboard.press('Escape');
  };
  await bar.getByRole('menuitem', { name: 'View' }).click();
  assert.equal(await toggle.getAttribute('aria-checked'), 'true', 'on by default');
  await page.keyboard.press('Escape');
  await set(false);
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 0, null, { timeout: 5000 });
  await page.reload(); await card('k-exp').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  assert.equal(await pins().count(), 0, 'off after a reload: no pins');
  await set(true);
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 1, null, { timeout: 15000 });
});

await check('10 Share: Allow comments (on by default); published, Public comments Off / Open / Closed, disabled while comments are off', async () => {
  token = (await api(`/api/apps/${canvas.name}/publish`, { method: 'POST', body: '{}' })).body.publication_token;
  assert.ok(token, 'published');
  await page.reload();
  await card('k-exp').waitFor({ timeout: 60000 });
  await page.locator('[data-share-button]').click();
  await share().locator('[data-comment-settings]').waitFor();
  const allow = share().getByRole('switch', { name: 'Allow comments' });
  assert.equal(await allow.getAttribute('aria-checked'), 'true');
  assert.equal(await share().getByRole('radio', { name: 'Off' }).getAttribute('aria-checked'), 'true', 'public comments start Off');
  await share().getByRole('radio', { name: 'Open' }).click();
  await share().getByText('Anyone signed in to Rabbit Hole can comment.').waitFor();
  await allow.click();
  await share().getByText('Only you can comment. Existing comments stay visible.').waitFor();
  assert.equal(await share().getByRole('radio', { name: 'Closed' }).isDisabled(), true, 'the public setting is disabled while comments are off');
  await shot('10-share-comments-off', share());
  await allow.click();
  await share().getByText('Anyone signed in to Rabbit Hole can comment.').waitFor();
  await shot('10b-share-comments-open', share());
  await page.keyboard.press('Escape');
});

const other = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await other.route(/\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); if (!route.request().url().endsWith('/api/learn/tutor/next-steps')) stray.push(route.request().url()); return route.abort(); });
const visit = async session => {
  await other.clearCookies();
  if (session) await other.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const tab = await other.newPage();
  tab.on('pageerror', error => errors.push(error.message));
  await tab.goto(`${BASE}/e/${token}`);
  await tab.locator('[data-block-id="k-exp"]').waitFor({ timeout: 60000 });
  await tab.waitForTimeout(1200);
  return tab;
};

await check('11 /e signed in as anyone: Add comment on a card posts a Public thread with a pin', async () => {
  const tab = await visit(visitor.session);
  await tab.locator('[data-comments-button]').waitFor();
  const box = await tab.locator('[data-block-id="k-exp"]').boundingBox();
  await tab.mouse.click(box.x + 80, box.y + 40, { button: 'right' });
  const items = await tab.locator('[data-canvas-menu] [role="menuitem"]').evaluateAll(rowNames);
  assert.deepEqual(items, ['Start Rabbit Hole', 'Add comment']);
  await tab.locator('[data-menu-add-comment]').click();
  const side = tab.locator('[data-shared-comments]');
  await side.locator('[data-comment-draft]').waitFor();
  assert.match(await side.innerText(), /Visible to[\s\S]*Public/);
  await side.locator('[data-comment-composer] textarea').fill('Does pepper do the same thing?');
  await side.locator('[data-comment-composer] textarea').press('Enter');
  await side.locator('[data-comment-thread-view]').waitFor();
  assert.match(await side.innerText(), new RegExp(`Public[\\s\\S]*@visitor_${run}[\\s\\S]*pepper`));
  await tab.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 1);
  await tab.screenshot({ path: `${SHOTS}/11-public-posted.png` }); console.log('shot 11-public-posted');
  await tab.close();
});

await check('12 /e signed out: the public thread reads, and posting is a sign-in link; no Add comment in the menu', async () => {
  const tab = await visit(null);
  await tab.locator('[data-comments-button]').click();
  const side = tab.locator('[data-shared-comments]');
  await side.locator('[data-comment-thread]').first().click();
  await side.locator('[data-comment-sign-in]').waitFor();
  assert.match(await side.innerText(), /Does pepper do the same thing\?/);
  const box = await tab.locator('[data-block-id="k-exp"]').boundingBox();
  await tab.mouse.click(box.x + 80, box.y + 40, { button: 'right' });
  const items = await tab.locator('[data-canvas-menu] [role="menuitem"]').evaluateAll(rowNames);
  assert.deepEqual(items, ['Start Rabbit Hole']);
  await tab.keyboard.press('Escape');
  await tab.screenshot({ path: `${SHOTS}/12-public-signed-out.png` }); console.log('shot 12-public-signed-out');
  await tab.close();
});

await check('13 the owner sees the public thread on their canvas (header Comments button), labelled Public, with the audience filter', async () => {
  await page.reload();
  await card('k-exp').waitFor({ timeout: 60000 });
  await page.locator('[data-comments-header]').click();
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').getAttribute('data-panel-tab'), 'comments');
  await panel().locator('[data-comment-thread]', { hasText: 'pepper' }).waitFor();
  assert.equal(await panel().getByRole('group', { name: 'Audience' }).count(), 1);
  assert.match(await panel().locator('[data-comment-thread]', { hasText: 'pepper' }).innerText(), /Public/);
  await shot('13-owner-sees-public');
});

await check('14 Closed: the published page keeps the thread readable and says comments are closed', async () => {
  const base = `/api/learn/c/${boardId}`;
  assert.equal((await api(`${base}/comment-settings`, { method: 'PUT', body: JSON.stringify({ public_mode: 'closed' }) })).body.public_mode, 'closed');
  const tab = await visit(visitor.session);
  await tab.locator('[data-comments-button]').click();
  const side = tab.locator('[data-shared-comments]');
  await side.locator('[data-comment-thread]').first().click();
  await side.getByText('Comments are closed. Existing comments stay visible.').waitFor();
  await tab.screenshot({ path: `${SHOTS}/14-public-closed.png` }); console.log('shot 14-public-closed');
  await tab.close();
  await other.close();
});

// Owner, 2026-10-08: comments on drawn shapes and groups, and C on any selection - on a second canvas of its own.
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const shapesCanvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Comments shapes ${run}` }) })).body;
assert.equal((await api(`/api/learn/boards/${shapesCanvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: {
  strokes: [], links: [], items: [], exchanges: [], areas: [],
  blocks: [{ id: 's-card', type: 'explanation', dx: 0, dy: 0, title: 'Brine', body: 'Salt water freezes at a lower temperature.' }],
  shapes: [
    { id: 's-box', kind: 'rect', x1: -560, y1: 40, x2: -360, y2: 160, ...style, text: 'Ice' },
    { id: 'g-a', kind: 'ellipse', x1: -560, y1: 320, x2: -440, y2: 420, ...style, groupId: 'g-ice' },
    { id: 'g-b', kind: 'rect', x1: -380, y1: 320, x2: -260, y2: 420, ...style, groupId: 'g-ice' },
  ],
  groups: [{ id: 'g-ice', label: 'Ice setup' }],
} }) })).status, 200, 'the shapes canvas is saved');
const shape = id => page.locator(`[data-shape-id="${id}"]`);
const centre = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
// The selection's style panel floats over the canvas's left side: close it (an overlay, so nothing reflows) or it takes the press.
const noStylePanel = async () => { if (await page.locator('[data-style-panel]').isVisible()) await page.getByRole('button', { name: 'Style', exact: true }).click(); };
const dragBy = async (from, dx, dy) => { await noStylePanel(); await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400); };
const send = async text => { await composer().fill(text); await composer().press('Enter'); await panel().locator('[data-comment-thread-view]').waitFor(); };
// Zoom to fit (Shift+1) - from the canvas, not the composer the page focuses on open.
const fit = async () => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(800); };
const lastPin = async () => { await page.waitForTimeout(400); return pins().last().boundingBox(); };

await check('15 right-click a drawn shape: Add comment (hint C) puts the pin on the shape, and the pin follows the shape', async () => {
  await page.goto(`${BASE}/apps/${shapesCanvas.name}`);
  await shape('s-box').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await fit();
  await shot('15a-shapes-canvas');
  const at = await centre(shape('s-box'));
  await page.mouse.click(at.x, at.y + 30, { button: 'right' });
  assert.ok((await menuItems()).includes('Add comment'), (await menuItems()).join(' | '));
  assert.equal(await menuHint(), 'C');
  await shot('15-shape-menu', page.locator('[data-canvas-menu]'));
  await page.locator('[data-menu-add-comment]').click();
  assert.match(await panel().innerText(), /on Ice/);
  await send('Is this the ice or the brine?');
  assert.equal(await pins().count(), 1);
  const before = await lastPin(), body = await shape('s-box').boundingBox();
  assert.ok(touching(before, body), `the pin touches the shape: ${JSON.stringify([before, body])}`);
  await dragBy(await centre(shape('s-box')), 150, 40);
  const after = await lastPin();
  assert.ok(Math.abs(after.x - before.x - 150) < 4 && Math.abs(after.y - before.y - 40) < 4, `the pin followed the shape: ${JSON.stringify([before, after])}`);
  await shot('15b-shape-pin-moved');
});

await check('16 right-click a group (its outline, or its name chip): Add comment on the group, and the pin follows the group', async () => {
  const left = await shape('g-a').boundingBox(), right = await shape('g-b').boundingBox();
  const gap = { x: (left.x + left.width + right.x) / 2, y: left.y + left.height / 2 };
  await noStylePanel();
  await page.mouse.click(gap.x, gap.y, { button: 'right' });
  assert.ok((await menuItems()).includes('Add comment'), `the outline: ${(await menuItems()).join(' | ')}`);
  await page.keyboard.press('Escape');
  const chip = await centre(page.locator('[data-group-chip="g-ice"]'));
  await page.mouse.click(chip.x, chip.y, { button: 'right' });
  assert.ok((await menuItems()).includes('Add comment'), `the chip: ${(await menuItems()).join(' | ')}`);
  await page.locator('[data-menu-add-comment]').click();
  assert.match(await panel().innerText(), /on Ice setup/);
  const known = await pins().evaluateAll(nodes => nodes.map(node => node.dataset.commentPin));
  await send('Label both beakers.');
  assert.equal(await pins().count(), 2);
  const id = (await pins().evaluateAll(nodes => nodes.map(node => node.dataset.commentPin))).find(pin => !known.includes(pin));
  const groupPin = async () => { await page.waitForTimeout(400); return page.locator(`[data-comment-pin="${id}"]`).boundingBox(); };
  await shot('16a-group-comment');
  const before = await groupPin();
  await beside(before, askPill(), page.locator('[data-group-box="g-ice"]'));
  const [a, b] = [await shape('g-a').boundingBox(), await shape('g-b').boundingBox()];
  await dragBy({ x: (a.x + a.width + b.x) / 2, y: a.y + a.height / 2 }, 120, 60);
  const after = await groupPin();
  assert.ok(Math.abs(after.x - before.x - 120) < 4 && Math.abs(after.y - before.y - 60) < 4, `the pin followed the group: ${JSON.stringify([before, after])}`);
  await page.reload();
  await shape('s-box').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 2, null, { timeout: 15000 });
  await shot('16-group-pin-after-reload');
});

await check('17 C with a selection: a card, a shape and a group each get a draft anchored to them; C typed in the composer stays text', async () => {
  const draftFor = async (locator, offset, label) => {
    await page.evaluate(() => document.activeElement?.blur?.());
    await noStylePanel();
    const at = await centre(locator);
    await page.mouse.click(at.x + offset.x, at.y + offset.y);
    await page.keyboard.press('c');
    await panel().locator('[data-comment-draft]').waitFor();
    assert.match(await panel().innerText(), label);
    assert.equal(await page.locator('[data-comment-pin="draft"]').count(), 1, 'a ghost pin');
    await composer().pressSequentially('cc');
    assert.equal(await composer().inputValue(), 'cc', 'C types in the composer');
    await panel().getByRole('button', { name: 'Cancel' }).click();
  };
  await fit();
  await draftFor(page.locator('[data-block-id="s-card"]'), { x: 0, y: 0 }, /on Brine/);
  await draftFor(shape('s-box'), { x: 0, y: 30 }, /on Ice(?! setup)/);
  await draftFor(shape('g-a'), { x: 0, y: 0 }, /on Ice setup/);
  await shot('17-c-on-group');
});

// Owner, 2026-10-08: a pin is a canvas object - orange and solid by default with its live count, picked and opened by a
// click that keeps the keyboard on it, recoloured from the shapes' palette, deleted with Del by whoever may delete it.
const shapesApi = `/api/learn/c/${(await api(`/api/learn/boards/${shapesCanvas.name}/main`)).body.board_id}`;
const threadOn = async objectId => (await api(`${shapesApi}/threads`)).body.threads.find(thread => thread.anchor.object_id === objectId);
const pinFor = id => page.locator(`[data-comment-pin="${id}"]`);
const styleOf = (locator, name) => locator.evaluate((node, property) => getComputedStyle(node)[property], name);
const freshList = async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(600); };
const ORANGE = 'rgb(245, 158, 11)';
// A reload or a close waits for quiet: the local dev proxy has dropped when a page went away mid-request.
const quiet = tab => tab.waitForLoadState('networkidle').catch(() => {});

await check('18 a pin is orange with a solid outline and shows its count; the + and the count are white in light mode, dark in dark mode', async () => {
  const thread = await threadOn('s-box');
  const pin = pinFor(thread.id);
  assert.deepEqual([await styleOf(pin, 'borderTopStyle'), await styleOf(pin, 'backgroundColor'), await styleOf(pin, 'borderTopColor')], ['solid', ORANGE, ORANGE]);
  assert.deepEqual([await pin.locator('[data-pin-count]').textContent(), await pin.getAttribute('aria-label')], ['1', '1 comment']);
  // The theme is read when the page loads (main.jsx applyTheme), so dark mode is a fresh tab with the dark scheme.
  const draftOn = async (tab, scheme) => {
    const box = await tab.locator('[data-shape-id="s-box"]').boundingBox();
    await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 30, { button: 'right' });
    await tab.locator('[data-menu-add-comment]').click();
    const ghost = tab.locator('[data-comment-pin="draft"]');
    await ghost.waitFor();
    const seen = { border: await styleOf(ghost, 'borderTopStyle'), fill: await styleOf(ghost, 'backgroundColor'), plus: await styleOf(ghost.locator('svg'), 'color'),
      count: await styleOf(tab.locator(`[data-comment-pin="${thread.id}"] [data-pin-count]`), 'color') };
    await tab.screenshot({ path: `${SHOTS}/18-draft-${scheme}.png` }); console.log(`shot 18-draft-${scheme}`);
    await tab.locator('[data-comments-panel]').getByRole('button', { name: 'Cancel' }).click();
    return seen;
  };
  // Check 17 leaves the group selected; with the Chat pane beside the canvas its style panel floats over the box: close it.
  await noStylePanel();
  assert.deepEqual(await draftOn(page, 'light'), { border: 'solid', fill: ORANGE, plus: 'rgb(255, 255, 255)', count: 'rgb(255, 255, 255)' });
  const dark = await context.newPage();
  dark.on('pageerror', error => errors.push(error.message));
  await dark.emulateMedia({ colorScheme: 'dark' });
  await dark.goto(`${BASE}/apps/${shapesCanvas.name}`);
  await dark.locator('[data-shape-id="s-box"]').waitFor({ timeout: 60000 });
  await dark.waitForTimeout(1200);
  await dark.evaluate(() => document.activeElement?.blur?.()); await dark.keyboard.press('Shift+Digit1'); await dark.waitForTimeout(800);
  assert.equal(await dark.evaluate(() => document.documentElement.classList.contains('dark')), true, 'the app took the dark scheme');
  await dark.locator(`[data-comment-pin="${thread.id}"]`).waitFor();
  assert.deepEqual(await draftOn(dark, 'dark'), { border: 'solid', fill: ORANGE, plus: 'rgb(25, 25, 25)', count: 'rgb(25, 25, 25)' });
  await quiet(dark);
  await dark.close();
});

await check('19 a click on a pin opens its thread in the panel and keeps the focus on the pin; its count follows a reply and a deleted reply', async () => {
  const thread = await threadOn('s-box');
  await pinFor(thread.id).click();
  await panel().locator('[data-comment-thread-view]').waitFor();
  assert.match(await panel().innerText(), /Is this the ice or the brine\?/);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.commentPin), thread.id, 'the pin keeps the focus');
  assert.equal(await pinFor(thread.id).getAttribute('data-picked'), '', 'picked: the selection ring');
  await shot('19-pin-picked-open');
  await send('Neither: it is the salt.');
  await page.waitForFunction(id => document.querySelector(`[data-comment-pin="${id}"] [data-pin-count]`)?.textContent === '2', thread.id, { timeout: 15000 });
  const reply = (await api(`${shapesApi}/threads/${thread.id}`)).body.messages[1].id;
  assert.equal((await api(`${shapesApi}/comments/${reply}`, { method: 'DELETE', headers: { origin: BASE } })).status, 200);
  await freshList();
  await page.waitForFunction(id => document.querySelector(`[data-comment-pin="${id}"] [data-pin-count]`)?.textContent === '1', thread.id, { timeout: 15000 });
});

await check('20 a picked pin takes a colour from the shapes\' palette; it stays after a reload and never touches the board', async () => {
  const before = (await api(`/api/learn/boards/${shapesCanvas.name}/main`)).body.version;
  const thread = await threadOn('s-box');
  await pinFor(thread.id).click();
  const style = page.locator('[role="group"][aria-label="Style"]');
  await style.waitFor();
  assert.equal(await style.locator('button').count(), 6, 'the six colours, nothing else');
  assert.ok((await style.boundingBox()).width >= 64, 'the swatches show side by side, not clipped to a sliver');
  await shot('20-pin-colour', style);
  await style.getByRole('button', { name: 'Color #2383e2' }).click();
  await page.waitForFunction(id => getComputedStyle(document.querySelector(`[data-comment-pin="${id}"]`)).backgroundColor === 'rgb(35, 131, 226)', thread.id);
  await quiet(page);
  await page.reload();
  await shape('s-box').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  await pinFor(thread.id).waitFor();
  assert.equal(await styleOf(pinFor(thread.id), 'backgroundColor'), 'rgb(35, 131, 226)', 'after a reload');
  assert.equal((await threadOn('s-box')).color, '#2383e2');
  assert.equal((await api(`/api/learn/boards/${shapesCanvas.name}/main`)).body.version, before, 'the board version is unchanged');
});

await check('21 Del right after a click deletes the pin\'s thread; Backspace on a thread with replies asks first', async () => {
  await fit();
  const group = await threadOn('g-ice');
  await pinFor(group.id).click();
  await page.keyboard.press('Delete');
  await pinFor(group.id).waitFor({ state: 'detached' });
  assert.equal((await api(`${shapesApi}/threads/${group.id}`)).status, 404, 'gone on the server');
  const thread = await threadOn('s-box');
  assert.equal((await api(`${shapesApi}/threads/${thread.id}/comments`, { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), body: 'One more.', mentions: [] }), headers: { origin: BASE } })).status, 201);
  await freshList();
  await pinFor(thread.id).click();
  await page.keyboard.press('Backspace');
  const ask = page.locator('[data-pin-ask][role="dialog"]');
  await ask.waitFor();
  assert.match(await ask.innerText(), /Delete the thread and its 1 reply\?/);
  await shot('21-delete-asks', page.locator('[data-comment-pins]'));
  await ask.getByRole('button', { name: 'Delete' }).click();
  await pinFor(thread.id).waitFor({ state: 'detached' });
  assert.equal((await api(`${shapesApi}/threads/${thread.id}`)).status, 404);
});

await check('22 a member presses Del on the owner\'s pin: refused, with a line by the pin, and the pin stays', async () => {
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await guest.route(/\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); if (!route.request().url().endsWith('/api/learn/tutor/next-steps')) stray.push(route.request().url()); return route.abort(); });
  await guest.addCookies([{ name: 'small_session', value: member.session, url: BASE }]);
  const tab = await guest.newPage();
  tab.on('pageerror', error => errors.push(error.message));
  await tab.goto(`${BASE}/c/${boardId}`);
  await tab.locator('[data-block-id="k-exp"]').waitFor({ timeout: 60000 });
  const owners = (await memberApi(`/api/learn/c/${boardId}/threads`)).body.threads.find(thread => thread.preview?.startsWith('Add a diagram'));
  const pin = tab.locator(`[data-comment-pin="${owners.id}"]`);
  // The member page opens with Comments showing, and the pins come from that panel's thread list: wait for the list to
  // land (its pin drawn) before closing it, or a slow list never arrives (the panel is gone). Closed, the pin stays, and
  // the click on it opens Comments again.
  await tab.locator('[data-member-comments]').waitFor();
  await pin.waitFor();
  await tab.locator('[data-comments-button]').click();
  await tab.locator('[data-member-comments]').waitFor({ state: 'detached' });
  await pin.waitFor();
  await pin.click();
  await tab.locator('[data-member-comments] [data-comment-thread-view]').waitFor();
  assert.equal(await tab.evaluate(id => document.activeElement?.dataset?.commentPin, owners.id), owners.id, 'picked from a closed panel, the pin keeps the focus');
  await tab.keyboard.press('Delete');
  const note = tab.locator('[data-pin-ask][role="status"]');
  await note.waitFor();
  assert.equal((await note.innerText()).trim(), "You can't delete this thread.");
  await tab.screenshot({ path: `${SHOTS}/22-member-refused.png` }); console.log('shot 22-member-refused');
  assert.equal(await pin.count(), 1, 'the pin stays');
  assert.equal((await memberApi(`/api/learn/c/${boardId}/threads/${owners.id}`)).status, 200);
  await quiet(tab);
  await guest.close();
});

// Owner, 2026-10-13: Esc in the New comment panel is Cancel, and no comment pin without a text comment. On the first
// canvas's second card, which has no thread: C after selecting it (with the Hand tool armed, so a canvas Esc would show).
const ghost = () => page.locator('[data-comment-pin="draft"]');
const draftView = () => panel().locator('[data-comment-draft]');
const threadCount = async () => (await api(`/api/learn/c/${boardId}/threads?status=all`)).body.threads.length;
const startDraft = async () => {
  if (await card('k-two').getAttribute('aria-current') !== 'true') await card('k-two').click();
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('h');
  await page.keyboard.press('c');
  await draftView().waitFor();
};
// What a draft leaves once it has closed (or failed to): the panel, the ghost, the server, the canvas, the focus, and
// the words kept for this card's next draft.
const leftBehind = async () => {
  await draftView().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  return {
    draft: await draftView().count(), ghost: await ghost().count(), threads: await threadCount(),
    selected: await card('k-two').getAttribute('aria-current'),
    hand: await page.getByRole('button', { name: 'Hand — pan the canvas' }).first().getAttribute('aria-pressed'),
    focus: await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('[data-canvas-surface]')),
    kept: await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.includes(':new:') && key.includes('"k-two"')).map(key => JSON.parse(sessionStorage.getItem(key)).body)),
  };
};

await check('23 Esc in the New comment panel is Cancel: with an empty or a typed draft, the same state - no ghost, the list back, nothing posted, the canvas keeps its selection and tool, the focus on the canvas', async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await card('k-two').waitFor({ timeout: 60000 });
  await page.locator('[data-comments-header]').waitFor(); // comments are on: C now opens a draft
  const before = await threadCount();
  for (const text of ['', 'Half a thought about sugar']) {
    const left = {};
    for (const [how, leave] of [['Cancel', () => panel().getByRole('button', { name: 'Cancel' }).click()], ['Esc', () => composer().press('Escape')]]) {
      await startDraft();
      await composer().fill(text);
      await leave();
      left[how] = await leftBehind();
      if (how === 'Esc') await shot(`23-esc-${text ? 'typed' : 'empty'}`);
    }
    assert.deepEqual(left.Esc, left.Cancel, `Esc with ${text ? 'a typed' : 'an empty'} draft leaves what Cancel leaves`);
    assert.deepEqual(left.Cancel, { draft: 0, ghost: 0, threads: before, selected: 'true', hand: 'true', focus: true, kept: text ? [text] : [] });
  }
});

await check('24 Esc with the @ menu open closes only the menu; the next Esc cancels the comment', async () => {
  const before = await threadCount();
  await startDraft();
  await composer().fill('@');
  await panel().locator('[data-mention-menu]').waitFor();
  await composer().press('Escape');
  await panel().locator('[data-mention-menu]').waitFor({ state: 'detached' });
  assert.deepEqual([await draftView().count(), await ghost().count(), await composer().inputValue()], [1, 1, '@'], 'the first Esc closes only the menu');
  await composer().press('Escape');
  const left = await leftBehind();
  assert.deepEqual([left.draft, left.ghost, left.threads, left.selected, left.hand, left.focus], [0, 0, before, 'true', 'true', true], 'the next Esc cancels the comment');
});

await check('25 a draft left without Cancel leaves no pin: the ghost goes while the panel is hidden or on another tab, and shows again with its draft', async () => {
  await startDraft();
  await page.getByRole('button', { name: 'Hide the right panel' }).click();
  await ghost().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  if (await ghost().count()) await shot('25-ghost-panel-hidden');
  assert.equal(await ghost().count(), 0, 'the panel is hidden: no ghost');
  await page.getByRole('button', { name: 'Show the right panel' }).click();
  await ghost().waitFor();
  await page.locator('[role="tab"][data-panel-tab="toc"]').click();
  await ghost().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  assert.equal(await ghost().count(), 0, 'another tab: no ghost');
  await page.locator('[role="tab"][data-panel-tab="comments"]').click();
  await ghost().waitFor();
  await panel().getByRole('button', { name: 'Cancel' }).click();
  await ghost().waitFor({ state: 'detached' });
});

await check('26 deleting a thread\'s only comment takes its pin away; the thread stays in the list as deleted', async () => {
  await startDraft();
  await composer().fill('Only comment here.');
  await composer().press('Enter');
  await panel().locator('[data-comment-thread-view]').waitFor();
  const id = (await api(`/api/learn/c/${boardId}/threads`)).body.threads.find(thread => thread.preview === 'Only comment here.').id;
  await pinFor(id).waitFor();
  const message = panel().locator('[data-comment-message]').first();
  await message.hover();
  await message.getByRole('button', { name: 'Comment actions' }).click();
  await panel().getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await panel().getByRole('menuitem', { name: 'Confirm delete' }).click();
  await panel().getByText('This comment was deleted').waitFor();
  await page.waitForFunction(id => !document.querySelector(`[data-comment-pin="${id}"]`) || document.querySelector(`[data-comment-pin="${id}"] [data-pin-count]`)?.textContent === '0', id, { timeout: 15000 });
  if (await pinFor(id).count()) await shot('26-empty-pin');
  assert.equal(await pinFor(id).count(), 0, 'no pin without a text comment');
  await panel().getByRole('button', { name: 'All comments' }).click();
  assert.match(await panel().locator(`[data-comment-thread="${id}"]`).innerText(), /This comment was deleted/);
});

// Owner, 2026-10-13: every pin touches its object - a card, a dropped image, an image, a text box, a sticky note (two threads),
// a chat card, a shape, a small shape and a group - at 100% and at 25%, whatever offset its thread stored. Threads made by the
// API on a canvas of their own; a wide view so every object is on screen at 100%.
await check('26b every pin touches its object, of every kind, at 100% and at 25%', async () => {
  const made = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Comments contact ${run}` }) })).body;
  const catalog = (await api('/api/apps')).body;
  const key = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${made.name}`;
  const SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path d="M0 18 C 15 18, 25 2, 40 2" stroke="#2383e2" fill="none"/></svg>')}`;
  const ink = {
    strokes: [], links: [], areas: [], exchanges: [],
    blocks: [
      { id: 't-card', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts ice', body: 'Salt lowers the freezing point of the water film.' },
      { id: 't-file', type: 'file', kind: 'image', dx: 0, dy: 0, assetKey: `img:${run}`, label: 'diagram.png', mediaId: `media-${run}` },
      { id: 't-img', type: 'image', mode: 'url', dx: 0, dy: 0, title: 'The sigmoid curve', src: SVG, alt: 'An S-curve' },
    ],
    items: [
      { id: 't-text', kind: 'text', x: -700, y: 40, w: 320, text: 'the mask hides the future', level: 'h3' },
      { id: 't-note', kind: 'sticky', x: -700, y: 200, w: 160, h: 160, text: 'remember the mask', color: '#fde68a', opacity: 1 },
    ],
    shapes: [
      { id: 't-box', kind: 'rect', x1: 760, y1: 40, x2: 960, y2: 160, ...style, text: 'Ice' },
      { id: 't-dot', kind: 'ellipse', x1: 760, y1: 240, x2: 790, y2: 270, ...style },
      { id: 't-ga', kind: 'rect', x1: 760, y1: 380, x2: 860, y2: 460, ...style, groupId: 't-g' },
      { id: 't-gb', kind: 'ellipse', x1: 900, y1: 380, x2: 1000, y2: 460, ...style, groupId: 't-g' },
    ],
    groups: [{ id: 't-g', label: 'Beakers' }],
  };
  const chat = [{ id: 't-chat', question: 'Why exponentiate the scores?', answer: 'Scores become positive weights that add to 1.', status: 'done', dx: 0, dy: 0 }];
  const board = (await api(`/api/learn/boards/${made.name}/main`)).body?.board_id;
  assert.ok(board, 'the board id for its comments');
  const ON = [['t-card', 'block'], ['t-file', 'block'], ['t-img', 'block'], ['t-text', 'item'], ['t-note', 'item'], ['t-note', 'item'], ['t-chat', 'exchange'], ['t-box', 'shape'], ['t-dot', 'shape'], ['t-g', 'group']];
  const threads = [];
  for (const [id, kind] of ON) {
    const posted = await post(api, `/api/learn/c/${board}/threads`, { id: crypto.randomUUID(), anchor: { kind: 'object', object_id: id, object_kind: kind, dx: 400, dy: -200, label: id }, body: `About ${id}?`, mentions: [] });
    assert.equal(posted.status, 201, `thread on ${id}: HTTP ${posted.status} ${JSON.stringify(posted.body)}`);
    threads.push([posted.body.thread.id, id]);
  }
  await context.addInitScript(seeds => { for (const [name, value] of Object.entries(seeds)) if (!localStorage.getItem(name)) localStorage.setItem(name, JSON.stringify(value)); }, { [`${key}:ink`]: ink, [`${key}:chat`]: chat });
  const tab = await context.newPage();
  tab.on('pageerror', error => errors.push(error.message));
  await tab.setViewportSize({ width: 2400, height: 1600 });
  await tab.goto(`${BASE}/apps/${made.name}`);
  await tab.locator('[data-block-id="t-card"]').waitFor({ timeout: 60000 });
  await tab.waitForFunction(count => document.querySelectorAll('[data-comment-pin]').length === count, threads.length, { timeout: 15000 });
  const objectOf = id => tab.locator(`[data-block-id="${id}"], [data-item-id="${id}"], [data-shape-id="${id}"], [data-group-box="${id}"]`).first();
  const off = [];
  for (const [zoom, keys] of [['100', ['Shift+Digit1', 'Shift+Digit0']], ['25', ['Shift+Digit1', ...Array(8).fill('Control+Minus')]]]) {
    await tab.evaluate(() => document.activeElement?.blur?.());
    for (const name of keys) await tab.keyboard.press(name);
    await tab.waitForTimeout(900);
    assert.equal(await tab.locator('button[title="Reset zoom"]').textContent(), `${zoom}%`, 'the zoom');
    await tab.screenshot({ path: `${SHOTS}/26b-contact-${zoom}.png` });
    for (const [thread, id] of threads) {
      const [pin, body] = [await tab.locator(`[data-comment-pin="${thread}"]`).boundingBox(), await objectOf(id).boundingBox()];
      assert.ok(pin && body, `${id} and its pin are drawn`);
      if (!touching(pin, body)) off.push(`${id} at ${zoom}%: ${contact(pin, body).map(n => n.toFixed(1)).join(' x ')} px of overlap`);
      const x = Math.max(0, Math.min(pin.x, body.x) - 24), y = Math.max(0, Math.min(pin.y, body.y) - 24);
      const clip = { x, y, width: Math.min(2400, Math.max(pin.x + pin.width, body.x + body.width) + 24) - x, height: Math.min(1600, Math.max(pin.y + pin.height, body.y + body.height) + 24) - y };
      if (clip.width > 0 && clip.height > 0) await tab.screenshot({ path: `${SHOTS}/26b-${id}-${thread.slice(0, 4)}-${zoom}.png`, clip });
    }
  }
  assert.deepEqual(off, [], 'every pin overlaps its object');
  await tab.close();
});

await check('27 no model call, no stray write, no page error', async () => {
  assert.deepEqual([asks, stray, errors], [[], [], []]);
});

await browser.close();
console.log(`comments-check: ${results.length} checks passed`);
