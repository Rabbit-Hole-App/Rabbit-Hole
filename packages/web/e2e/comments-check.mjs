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
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name, clip = null) => {
  await page.waitForTimeout(400);
  const box = clip ? await clip.boundingBox() : null;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } } : {}) });
  console.log('shot', name);
};
const card = id => page.locator(`[data-block-id="${id}"]`);
const panel = () => page.locator('[data-comments-panel]');
// A row's name without its shortcut hint ("Add comment", hint "C").
const menuItems = () => page.locator('[data-canvas-menu] [role="menuitem"]').evaluateAll(nodes => nodes.map(node => [...node.childNodes].filter(child => !child.dataset?.menuHint).map(child => child.textContent).join('').trim()));
const menuHint = () => page.locator('[data-canvas-menu] [data-menu-add-comment] [data-menu-hint]').textContent();
const composer = () => panel().locator('[data-comment-composer] textarea');
const pins = () => page.locator('[data-comment-pin]');

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
  const pin = await pins().first().boundingBox(), body = await card('k-exp').boundingBox();
  assert.ok(pin.x + 2 >= body.x && pin.x <= body.x + body.width && pin.y + pin.height >= body.y - 2 && pin.y <= body.y + body.height, 'the pin sits on the card');
  await shot('03-thread-posted');
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

await check('5 right-click the empty canvas: Add comment here is first, and makes a canvas comment', async () => {
  const body = await card('k-exp').boundingBox();
  await page.mouse.click(body.x - 160, body.y + 120, { button: 'right' });
  const items = await menuItems();
  assert.equal(items[0], 'Add comment here', items.join(' | '));
  await page.locator('[data-menu-add-comment]').click();
  assert.match(await panel().innerText(), /on the canvas/);
  await composer().fill('Add a diagram of the ice surface here.');
  await composer().press('Enter');
  await panel().locator('[data-comment-thread-view]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 2);
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
  const items = await tab.locator('[data-canvas-menu] [role="menuitem"]').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
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
  const items = await tab.locator('[data-canvas-menu] [role="menuitem"]').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
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
const dragBy = async (from, dx, dy) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400); };
const send = async text => { await composer().fill(text); await composer().press('Enter'); await panel().locator('[data-comment-thread-view]').waitFor(); };
const lastPin = async () => { await page.waitForTimeout(400); return pins().last().boundingBox(); };

await check('15 right-click a drawn shape: Add comment (hint C) puts the pin on the shape, and the pin follows the shape', async () => {
  await page.goto(`${BASE}/apps/${shapesCanvas.name}`);
  await shape('s-box').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Shift+Digit1');
  await page.waitForTimeout(800);
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
  assert.ok(before.x + 2 >= body.x && before.x <= body.x + body.width && before.y + before.height >= body.y - 2 && before.y <= body.y + body.height, 'the pin sits on the shape');
  await dragBy(await centre(shape('s-box')), 150, 40);
  const after = await lastPin();
  assert.ok(Math.abs(after.x - before.x - 150) < 4 && Math.abs(after.y - before.y - 40) < 4, `the pin followed the shape: ${JSON.stringify([before, after])}`);
  await shot('15b-shape-pin-moved');
});

await check('16 right-click a group (its outline, or its name chip): Add comment on the group, and the pin follows the group', async () => {
  const left = await shape('g-a').boundingBox(), right = await shape('g-b').boundingBox();
  const gap = { x: (left.x + left.width + right.x) / 2, y: left.y + left.height / 2 };
  await page.mouse.click(gap.x, gap.y, { button: 'right' });
  assert.ok((await menuItems()).includes('Add comment'), `the outline: ${(await menuItems()).join(' | ')}`);
  await page.keyboard.press('Escape');
  const chip = await centre(page.locator('[data-group-chip="g-ice"]'));
  await page.mouse.click(chip.x, chip.y, { button: 'right' });
  assert.ok((await menuItems()).includes('Add comment'), `the chip: ${(await menuItems()).join(' | ')}`);
  await page.locator('[data-menu-add-comment]').click();
  assert.match(await panel().innerText(), /on Ice setup/);
  await send('Label both beakers.');
  assert.equal(await pins().count(), 2);
  const before = await lastPin();
  await dragBy(gap, 120, 60);
  const after = await lastPin();
  assert.ok(Math.abs(after.x - before.x - 120) < 4 && Math.abs(after.y - before.y - 60) < 4, `the pin followed the group: ${JSON.stringify([before, after])}`);
  await page.reload();
  await shape('s-box').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 2, null, { timeout: 15000 });
  await shot('16-group-pin-after-reload');
});

await check('17 C with a selection: a card, a shape and a group each get a draft anchored to them; C typed in the composer stays text', async () => {
  const draftFor = async (locator, offset, label) => {
    await page.evaluate(() => document.activeElement?.blur?.());
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
  await page.keyboard.press('Shift+Digit1');
  await page.waitForTimeout(800);
  await draftFor(page.locator('[data-block-id="s-card"]'), { x: 0, y: 0 }, /on Brine/);
  await draftFor(shape('s-box'), { x: 0, y: 30 }, /on Ice(?! setup)/);
  await draftFor(shape('g-a'), { x: 0, y: 0 }, /on Ice setup/);
  await shot('17-c-on-group');
});

await check('18 no model call, no stray write, no page error', async () => {
  assert.deepEqual([asks, stray, errors], [[], [], []]);
});

await browser.close();
console.log(`comments-check: ${results.length} checks passed`);
