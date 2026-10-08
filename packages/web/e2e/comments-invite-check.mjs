// Canvas comments, members and invitations (docs/features/canvas-comments.md sections 5-6) end to end in the browser:
// the owner invites by email from Share; a fresh account opens the /i link (the token leaves the address at once), sends
// a code to the invited address, confirms it and joins; the member page (/c) shows the canvas read-only with the
// Comments panel; an @mention is picked from the menu; Library lists the canvas under Shared with you; Remove access ends
// it. Against the LOCAL stack only, run with app-worker.js (the production entry: invitations are control-plane POSTs a
// dev barrier refuses) and SMALL_ENV=test, whose test echoes stand in for email. No model is called. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8862 SMALL_CP=http://127.0.0.1:8863 node e2e/comments-invite-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8862';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8863';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('comments-invite-check runs against the local stack only');
const SHOTS = process.argv[2] || 'comments-invite-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { email: `invite-owner-${run}@example.com`, handle: `owner_${run}` };
const guest = { email: `invite-guest-${run}@example.com`, handle: `guest_${run}` };
owner.session = await sessionFor(owner.email, owner.handle);
guest.session = await sessionFor(guest.email, guest.handle);
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json', origin: BASE } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const BLOCKS = [{ id: 'k-head', type: 'heading', dx: 0, dy: 0, level: 1, text: 'Kitchen chemistry' }, { id: 'k-exp', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts ice', body: 'Salt lowers the freezing point of water.' }];
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Invite ${run}` }) })).body;
const boardId = (await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS } }) })).body.board_id;
assert.ok(boardId);

const browser = await chromium.launch();
const errors = [], stray = [];
const contextFor = async session => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  if (session) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  // Next Steps' hook on canvas open is an expected request (professor-next-steps.md); it is aborted like every other write here, so no model is asked.
  await context.route(/\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); if (!route.request().url().endsWith('/api/learn/tutor/next-steps')) stray.push(route.request().url()); return route.abort(); });
  return context;
};
const ownerContext = await contextFor(owner.session), guestContext = await contextFor(guest.session);
const page = await ownerContext.newPage(), guestPage = await guestContext.newPage();
for (const p of [page, guestPage]) p.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (p, name, clip = null) => { await p.waitForTimeout(400); const box = clip ? await clip.boundingBox() : null; await p.screenshot({ path: `${SHOTS}/${name}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } } : {}) }); console.log('shot', name); };
const share = () => page.locator('[role="dialog"][aria-label="Share this board"]');
let inviteUrl;

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="k-exp"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);

await check('1 Share → People with access: invite by email; pending with its expiry; no link anywhere on the page', async () => {
  await page.locator('[data-share-button]').click();
  await share().locator('[data-people-with-access]').waitFor();
  await share().getByRole('textbox', { name: 'Add people by email' }).fill(guest.email.toUpperCase());
  const [response] = await Promise.all([page.waitForResponse(r => r.url().endsWith(`/api/learn/c/${boardId}/members`) && r.request().method() === 'POST'), share().locator('[data-invite-button]').click()]);
  const made = await response.json();
  assert.equal(made.invited[0].email_status, 'sent');
  inviteUrl = made.invited[0].test_invite_url;
  assert.match(inviteUrl, /^\/i#[A-Za-z0-9_-]{20,}$/, 'the test echo (SMALL_ENV=test only)');
  await share().locator('[data-member-row="pending"]').waitFor();
  assert.match(await share().locator('[data-member-row="pending"]').innerText(), new RegExp(`${guest.email}[\\s\\S]*Invited · expires`));
  assert.doesNotMatch(await page.content(), /\/i#/, 'the owner never sees an invitation link');
  await shot(page, '01-share-invited', share());
  await page.keyboard.press('Escape');
});

await check('2 /i: the token leaves the address; who gets access; a code to the masked address; join', async () => {
  await guestPage.goto(`${BASE}${inviteUrl}`);
  await guestPage.locator('[data-invite-account]').waitFor({ timeout: 30000 });
  assert.equal(new URL(guestPage.url()).pathname, '/i');
  assert.equal(new URL(guestPage.url()).hash, '', 'the fragment is gone from the address');
  const text = await guestPage.locator('[data-invite]').innerText();
  assert.match(text, new RegExp(`@${owner.handle} invited you to view and comment on Invite ${run}`));
  assert.match(text, new RegExp(`@${guest.handle}`));
  assert.match(text, /i•••@example\.com/);
  await shot(guestPage, '02-invite-account');
  const [response] = await Promise.all([guestPage.waitForResponse(r => r.url().endsWith('/api/learn/invites/code')), guestPage.locator('[data-send-code]').click()]);
  const sent = await response.json();
  assert.match(sent.test_code, /^\d{6}$/);
  await guestPage.locator('[data-code-input]').waitFor();
  assert.match(await guestPage.locator('[data-invite]').innerText(), /We sent a new 6-digit code to i•••@example\.com[\s\S]*Resend code in (1:00|0:[45]\d)/);
  await guestPage.locator('[data-code-input]').fill(sent.test_code === '000000' ? '111111' : '000000');
  await guestPage.locator('[data-confirm-join]').click();
  await guestPage.getByText(/That code isn't right\. 4 tries left\./).waitFor();
  await shot(guestPage, '02b-invite-wrong-code');
  await guestPage.locator('[data-code-input]').fill(sent.test_code);
  await guestPage.locator('[data-confirm-join]').click();
  await guestPage.getByText(`You've joined Invite ${run}.`).waitFor();
  await shot(guestPage, '02c-invite-joined');
});

await check('3 /c: the canvas read-only for the member, with the Comments panel and who shared it', async () => {
  await guestPage.getByRole('button', { name: 'Open canvas' }).click();
  await guestPage.waitForURL(`**/c/${boardId}`);
  await guestPage.locator('[data-block-id="k-exp"]').waitFor({ timeout: 60000 });
  assert.match(await guestPage.locator('header').innerText(), new RegExp(`Invite ${run}[\\s\\S]*View and comment[\\s\\S]*Shared with you by @${owner.handle}`));
  await guestPage.locator('[data-member-comments]').waitFor();
});

await check('4 the member comments on a card with an @mention picked from the menu', async () => {
  const box = await guestPage.locator('[data-block-id="k-exp"]').boundingBox();
  await guestPage.mouse.click(box.x + 80, box.y + 40, { button: 'right' });
  await guestPage.locator('[data-menu-add-comment]').click();
  const composer = guestPage.locator('[data-member-comments] [data-comment-composer] textarea');
  await composer.click();
  await composer.pressSequentially(`@${owner.handle.slice(0, 4)}`);
  await guestPage.locator('[data-mention-menu]').waitFor();
  await shot(guestPage, '04-mention-menu');
  await composer.press('Enter');
  await composer.pressSequentially('is the depression linear?');
  await composer.press('Enter');
  await guestPage.locator('[data-member-comments] [data-mention]').waitFor();
  assert.equal(await guestPage.locator('[data-member-comments] [data-mention]').innerText(), `@${owner.handle}`);
  await guestPage.waitForFunction(() => document.querySelectorAll('[data-comment-pin]').length === 1);
  await shot(guestPage, '04b-member-posted');
});

await check('5 the owner sees the news: a dot on the header Comments button, and the thread with the mention', async () => {
  await page.reload();
  await page.locator('[data-block-id="k-exp"]').waitFor({ timeout: 60000 });
  await page.locator('[data-comments-header] [data-unread-dot]').waitFor({ timeout: 20000 });
  await page.locator('[data-comments-header]').click();
  await page.locator('[data-comments-panel] [data-comment-thread]').first().click();
  await page.locator('[data-comments-panel] [data-mention]').waitFor();
  await shot(page, '05-owner-sees-mention');
});

await check('6 Library → Shared with you lists the canvas for the member', async () => {
  await guestPage.goto(`${BASE}/library`);
  await guestPage.locator('[data-shared-with-you] [data-shared-canvas]').waitFor({ timeout: 30000 });
  assert.match(await guestPage.locator('[data-shared-with-you]').innerText(), new RegExp(`Invite ${run}[\\s\\S]*Shared by @${owner.handle}`));
  await shot(guestPage, '06-shared-with-you', guestPage.locator('[data-shared-with-you]'));
});

await check('7 Remove access: the member\'s page answers that the canvas is not available', async () => {
  await page.locator('[data-share-button]').click();
  await share().locator('[data-member-row="active"]').waitFor();
  assert.match(await share().locator('[data-member-row="active"]').innerText(), new RegExp(`@${guest.handle}[\\s\\S]*verified ${guest.email}`));
  await shot(page, '07-share-member', share());
  await share().locator('[data-member-row="active"] [aria-expanded]').click();
  await share().locator('[data-remove]').click();
  await page.waitForFunction(() => !document.querySelector('[data-member-row="active"]'));
  await guestPage.goto(`${BASE}/c/${boardId}`);
  await guestPage.getByText("This canvas isn't available to you.").waitFor();
});

await check('8 /i with no token says to open the email link again; no model call, no stray write, no page error', async () => {
  const fresh = await guestContext.newPage();
  await fresh.goto(`${BASE}/i`);
  await fresh.getByText('Open the invitation link from your email again.').waitFor();
  assert.deepEqual([stray, errors], [[], []]);
});

await browser.close();
console.log(`comments-invite-check: ${results.length} checks passed`);
