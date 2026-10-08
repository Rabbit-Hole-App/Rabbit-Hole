// Canvas comments, first increment (docs/features/canvas-comments.md): on an owned canvas, Add comment from a card's
// right-click menu and Add comment here on the empty canvas open the Comments view with a ghost pin; Send posts the
// thread, a pin follows the card, a reply lands, a member's reply arrives with an unread dot, Resolve hides the thread
// and its pin, and none of it touches the board's version. Against the LOCAL stack only: local D1 and a fresh browser
// profile. No model is called: model routes are answered or refused here. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8858 SMALL_CP=http://127.0.0.1:8859 MEMBER_SQL=<cmd> node e2e/comments-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
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

// The member: invitations are their own stage, so the membership row is written to the local D1 directly (MEMBER_SQL
// runs one statement against the local Learn database; see the stack's run.sh).
const memberMe = await (await fetch(`${CP}/api/me`, { headers: { cookie: `small_session=${member.session}` } })).json();
const ownerOrg = (await api('/api/apps')).body.org;
if (process.env.MEMBER_SQL) {
  const sql = `INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m-${run}', '${ownerOrg}', '${canvas.name}', '${memberMe.email}', '${memberMe.user_id}', '${memberMe.email}', 'active', 'sent', 'e2e', 0, 0)`;
  execFileSync('bash', ['-c', `${process.env.MEMBER_SQL} "$1"`, '--', sql], { stdio: 'ignore' });
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
const asks = [], stray = [], errors = [];
await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' }); });
await context.route(/\/api\/learn\/(tutor|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); stray.push(route.request().url()); return route.abort(); });
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
const menuItems = () => page.locator('[data-canvas-menu] [role="menuitem"]').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
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
  assert.ok(process.env.MEMBER_SQL, 'MEMBER_SQL makes the member');
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

await check('9 no model call, no stray write, no page error', async () => {
  assert.deepEqual([asks, stray, errors], [[], [], []]);
});

await browser.close();
console.log(`comments-check: ${results.length} checks passed`);
