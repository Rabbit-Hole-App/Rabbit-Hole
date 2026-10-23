// Comments on deleted objects (owner decision 2026-10-23, docs/features/canvas-comments.md Q13 and section 8): deleting a card
// takes its threads - with replies, resolved and public ones - off the canvas, the Comments panel and the toolbar badge at once,
// with no refresh, and off every server answer once the board is saved (the owner's list, the published page, a visitor's read
// and post); a list answer fetched before the delete and delivered after it never brings one back; Undo restores them with the
// same ids, replies and resolved state, even while a list answered before the Undo's save lands; Redo removes them again; a
// reload keeps them. Deleting a group with its members does the same for the group's and the members' threads. Ungroup keeps
// the members' threads and turns the group's into canvas threads at its place; its Undo and Redo move them back and again; a
// refused move keeps the group and says so.
// Freshness (owner brief 2026-10-23, Comments v2 item 1; section 10 Sync protocol): an open thread shows another person's
// reply, edit and delete and a resolve from another session without Back or reload, keeps the typed reply; scrolled up, new
// replies show New replies and the reading place stays; offline and back, it catches up with every message once.
// Against the LOCAL stack only (the fork runner's keyless stack): local D1 and a fresh browser profile. No model is called:
// /api/learn/ask is answered here and other model routes are aborted and counted. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/comments-delete-check.mjs [shotsDir]
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const total = 9; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('comments-delete-check runs against the local stack only');
const SHOTS = process.argv[2] || 'comments-delete-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const as = session => async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(session ? { cookie: `small_session=${session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const ownerSession = await sessionFor(`cmtdel-owner-${run}@example.com`, `cmtdel_${run}`);
const viewerSession = await sessionFor(`cmtdel-viewer-${run}@example.com`, `cmtview_${run}`);
const api = as(ownerSession), viewer = as(viewerSession), nobody = as(null);
const post = (call, path, body) => call(path, { method: 'POST', body: JSON.stringify(body) });

const fill = { color: '#37352f', width: 2, dash: 'solid', fill: '#fde68a', opacity: 1, round: false };
const STATE = {
  strokes: [], links: [], items: [], exchanges: [], areas: [],
  blocks: [
    { id: 'd-card', type: 'explanation', dx: 0, dy: 0, title: 'Why ice floats', body: 'Ice is less dense than liquid water.' },
    { id: 'd-two', type: 'explanation', dx: 0, dy: 0, title: 'Why lakes freeze from the top', body: 'The coldest water rises.' },
  ],
  shapes: [
    { id: 'ga', kind: 'rect', x1: 760, y1: 40, x2: 900, y2: 160, ...fill, groupId: 'g1' },
    { id: 'gb', kind: 'rect', x1: 960, y1: 40, x2: 1100, y2: 160, ...fill, groupId: 'g1' },
  ],
  groups: [{ id: 'g1', label: 'Beakers' }],
};
const canvas = (await post(api, '/api/canvases', { title: `Comments delete ${run}` })).body;
const saved = await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE }) });
assert.equal(saved.status, 200, 'the board is saved');
const boardId = saved.body.board_id, base = `/api/learn/c/${boardId}`;
const token = (await post(api, `/api/apps/${canvas.name}/publish`, {})).body?.publication_token;
assert.ok(token, 'the canvas is published');
assert.equal((await api(`${base}/comment-settings`, { method: 'PUT', body: JSON.stringify({ public_mode: 'open' }) })).status, 200);
const pub = `/api/learn/boards/shared/${token}/comments`;

// The threads: on the card, one with a reply, one resolved and one public by a visitor; on the group and on one of its members;
// one on the canvas.
const on = (id, kind, label) => ({ kind: 'object', object_id: id, object_kind: kind, dx: 10, dy: 10, label });
const start = async (call, path, anchor, body) => {
  const made = await post(call, `${path}/threads`, { id: crypto.randomUUID(), anchor, body, mentions: [] });
  assert.equal(made.status, 201, `${body}: HTTP ${made.status} ${JSON.stringify(made.body)}`);
  return made.body.thread.id;
};
const T = {
  replied: await start(api, base, on('d-card', 'block', 'Why ice floats'), 'Is it the hydrogen bonds?'),
  resolved: await start(api, base, on('d-card', 'block', 'Why ice floats'), 'Resolved question on the card'),
  visitor: await start(viewer, pub, on('d-card', 'block', 'Why ice floats'), 'A visitor asks about the card'),
  group: await start(api, base, on('g1', 'group', 'Beakers'), 'About the whole group'),
  member: await start(api, base, on('ga', 'shape', ''), 'About the first beaker'),
  point: await start(api, base, { kind: 'point', x: 400, y: 600 }, 'On the empty canvas'),
};
assert.equal((await post(api, `${base}/threads/${T.replied}/comments`, { id: crypto.randomUUID(), body: 'Yes, they hold it open.', mentions: [] })).status, 201);
assert.equal((await post(api, `${base}/threads/${T.resolved}/resolve`, {})).status, 200);
const CARD = [T.replied, T.resolved, T.visitor], GROUP = [T.group, T.member];
const listed = async (call = api, path = base) => (await call(`${path}/threads?status=all`)).body?.threads || [];
const ids = async (call, path) => (await listed(call, path)).map(thread => thread.id);
// Waits for the server's answer to settle (the board reaches the server 400 ms + 1.5 s after an edit).
const serverHas = async (wanted, present, call = api, path = base) => expect.poll(async () => { const now = await ids(call, path); return wanted.every(id => now.includes(id) === present); }, { timeout: 20000 }).toBe(true);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await context.addCookies([{ name: 'small_session', value: ownerSession, url: BASE }]);
const asks = [], stray = [], errors = [];
await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' }); });
await context.route(/\/api\/learn\/(tutor|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); if (!route.request().url().endsWith('/api/learn/tutor/next-steps')) stray.push(route.request().url()); return route.abort(); });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => {
  try { await fn(); } catch (error) { await page.screenshot({ path: `${SHOTS}/fail-${results.length + 1}.png` }).catch(() => {}); console.log(`FAIL ${label}: ${error.message}`); await browser.close(); process.exit(1); }
  results.push(label); console.log(`ok ${label}`);
};
const pin = id => page.locator(`[data-comment-pin="${id}"]`);
const row = id => page.locator(`[data-comments-panel] [data-comment-thread="${id}"]`);
const badge = () => page.locator('[data-comments-header] [data-comments-count]');
const card = id => page.locator(`[data-block-id="${id}"]`);
const shape = id => page.locator(`[data-shape-id="${id}"]`);
const status = () => page.getByRole('combobox', { name: 'Status' });
// Shown: the pin of every open thread and the panel row of every thread (the list is on All); gone: neither.
const shown = async list => { for (const id of list) await expect(row(id)).toHaveCount(1, { timeout: 3000 }); for (const id of list.filter(id => id !== T.resolved)) await expect(pin(id)).toHaveCount(1, { timeout: 3000 }); };
const gone = async list => { for (const id of list) { await expect(row(id)).toHaveCount(0, { timeout: 3000 }); await expect(pin(id)).toHaveCount(0, { timeout: 3000 }); } };
const canvasKey = async key => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press(key); };
const select = async locator => { const box = await locator.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + Math.min(30, box.height / 2)); await page.evaluate(() => document.activeElement?.blur?.()); };
// A list answer fetched from the server now and handed to the page only when released: a late, out-of-order answer.
const held = [];
const holdLists = () => page.route(/\/api\/learn\/c\/[^/]+\/threads\?/, async route => { const response = await route.fetch(); held.push(() => route.fulfill({ response })); });
const releaseLists = async () => {
  const delivered = page.waitForResponse(response => /\/threads\?/.test(response.url()));
  for (const send of held.splice(0)) await send();
  await delivered;
  await page.unroute(/\/api\/learn\/c\/[^/]+\/threads\?/);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
};
// The board's server save, held until released: what the page shows meanwhile comes from the canvas alone (owner addition
// 2026-10-23: the hide happens before the board save fires and without a refresh).
const parked = [], SAVE = new RegExp(`/api/learn/boards/${canvas.name}/main$`);
const holdSaves = () => page.route(SAVE, route => (route.request().method() === 'PUT' ? parked.push(route) : route.continue()));
const releaseSaves = async () => { await page.unroute(SAVE); for (const route of parked.splice(0)) await route.continue(); };
const askList = async () => { const asked = page.waitForRequest(request => /\/threads\?/.test(request.url())); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await asked; await expect.poll(() => held.length, { timeout: 10000 }).toBeGreaterThan(0); };

await page.goto(`${BASE}/apps/${canvas.name}`);
await card('d-card').waitFor({ timeout: 60000 });
await page.locator('[data-comments-header]').click();
await page.locator('[data-comments-panel]').waitFor();
await status().selectOption('all');
await shown([...CARD, ...GROUP, T.point]);

await check('1 deleting a card takes its threads - replied, resolved and public - off the canvas, the panel and the badge at once; a list fetched before the delete and delivered after it never brings them back', async () => {
  await expect(badge()).toHaveText('5');
  await holdLists();
  await askList(); // fetched now, with the card's threads in it
  await holdSaves();
  await select(card('d-card'));
  await canvasKey('Delete');
  await expect(card('d-card')).toHaveCount(0);
  await gone(CARD);
  await expect(badge()).toHaveText('3');
  await shown([...GROUP, T.point]);
  assert.ok((await ids()).includes(T.replied), 'hidden while the server, its save held, still serves them: the canvas did it, no save, no refresh');
  await releaseLists();
  await releaseSaves();
  await gone(CARD);
  await expect(badge()).toHaveText('3');
  await page.screenshot({ path: `${SHOTS}/01-card-deleted.png` });
});

await check('2 once saved, no server answer carries them: the owner\'s list, the published page and a visitor\'s read; nobody can start a thread on the card', async () => {
  await serverHas(CARD, false);
  await serverHas([T.visitor], false, nobody, pub);
  assert.deepEqual((await ids(nobody, pub)).filter(id => CARD.includes(id)), [], 'the published page');
  assert.equal((await viewer(`${pub}/threads/${T.visitor}`)).status, 404, 'a visitor reads it no more');
  assert.equal((await api(`${base}/threads/${T.replied}`)).status, 404, 'nor does the owner');
  assert.equal((await api(`${base}/threads`)).body.open_count, 3, 'the badge count the server gives');
  const late = await post(viewer, `${pub}/threads`, { id: crypto.randomUUID(), anchor: on('d-card', 'block', 'Why ice floats'), body: 'Commenting on a deleted card', mentions: [] });
  assert.deepEqual([late.status, late.body?.code], [409, 'object_not_on_canvas'], 'a visitor with the card still on their screen is refused');
  const owners = await post(api, `${base}/threads`, { id: crypto.randomUUID(), anchor: on('d-card', 'block', 'Why ice floats'), body: 'From a stale tab', mentions: [] });
  assert.deepEqual([owners.status, owners.body?.code], [409, 'object_not_on_canvas'], 'and the owner from a stale tab');
});

await check('3 Undo brings the card and its threads back at once with the same ids, reply and resolved state, even while a list answered before the Undo was saved lands; Redo removes them again', async () => {
  await holdLists();
  await holdSaves();
  await canvasKey('Control+z');
  await card('d-card').waitFor();
  await shown(CARD);
  await expect(badge()).toHaveText('5');
  assert.equal((await ids()).includes(T.replied), false, 'back while the server, its save held, still leaves them out: no save, no refresh');
  await askList(); // fetched before the Undo reaches the server: the card's threads are not in it
  await releaseLists();
  await releaseSaves();
  await shown(CARD);
  await expect(badge()).toHaveText('5');
  await serverHas(CARD, true);
  const after = await listed();
  assert.equal(after.find(thread => thread.id === T.resolved).status, 'resolved', 'still resolved');
  assert.equal(after.find(thread => thread.id === T.replied).replies, 1, 'its reply kept');
  assert.equal(after.find(thread => thread.id === T.visitor).audience, 'public');
  assert.equal((await viewer(`${pub}/threads/${T.visitor}`)).status, 200, 'the visitor reads it again');
  await canvasKey('Control+Shift+z');
  await expect(card('d-card')).toHaveCount(0);
  await gone(CARD);
  await serverHas(CARD, false);
  await canvasKey('Control+z');
  await shown(CARD);
  await serverHas(CARD, true);
});

await check('4 a reload shows the restored threads; the badge counts them', async () => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.reload();
  await card('d-card').waitFor({ timeout: 60000 });
  // The panel may come back open (remembered) or closed; open it on Comments either way.
  await page.locator('[data-comments-header]').waitFor();
  if (!(await page.locator('[data-comments-panel]').isVisible())) await page.locator('[data-comments-header]').click();
  await page.locator('[data-comments-panel]').waitFor();
  if (await status().inputValue() !== 'all') await status().selectOption('all');
  await shown([...CARD, ...GROUP, T.point]);
  await expect(badge()).toHaveText('5');
});

await check('5 deleting a group with its members takes the group\'s and the members\' threads; Undo brings both back', async () => {
  // The shapes sit right of the column, off the canvas at the opening camera with the panel open (fast-e2e run 39986263086
  // clicked beside them): zoom to fit until the group is on the canvas surface.
  await canvasKey('Shift+Digit1');
  await expect.poll(() => shape('gb').evaluate(node => { const box = node.getBoundingClientRect(), surface = node.closest('[data-canvas-surface]').getBoundingClientRect(); return box.left >= surface.left && box.right <= surface.right && box.top >= surface.top && box.bottom <= surface.bottom; }), { timeout: 10000 }).toBe(true);
  await select(shape('ga'));
  await canvasKey('Delete');
  await expect(shape('ga')).toHaveCount(0);
  await gone(GROUP);
  await expect(badge()).toHaveText('3');
  await serverHas(GROUP, false);
  await canvasKey('Control+z');
  await shape('ga').waitFor();
  await shown(GROUP);
  await serverHas(GROUP, true);
});

const anchorOf = async id => (await listed()).find(thread => thread.id === id)?.anchor;
await check('6 Ungroup keeps the member\'s thread and turns the group\'s into a canvas thread at its place; Undo puts it back on the group, Redo on the canvas again', async () => {
  await select(shape('ga'));
  await canvasKey('Control+Shift+g');
  await expect(page.locator('[data-group-box="g1"]')).toHaveCount(0);
  await expect.poll(async () => (await anchorOf(T.group))?.kind, { timeout: 10000 }).toBe('point');
  assert.equal((await anchorOf(T.member)).object_id, 'ga', 'the member keeps its thread');
  await shown(GROUP);
  await page.screenshot({ path: `${SHOTS}/06-ungrouped.png` });
  await canvasKey('Control+z');
  await page.locator('[data-group-box="g1"]').waitFor();
  await expect.poll(async () => (await anchorOf(T.group))?.object_id, { timeout: 10000 }).toBe('g1');
  await shown(GROUP);
  await canvasKey('Control+Shift+z');
  await expect.poll(async () => (await anchorOf(T.group))?.kind, { timeout: 10000 }).toBe('point');
  await shown(GROUP);
  await canvasKey('Control+z');
  await expect.poll(async () => (await anchorOf(T.group))?.object_id, { timeout: 10000 }).toBe('g1');
  await serverHas(GROUP, true);
});

await check('7 a refused move keeps the group and its comments, and says so; no model call, no stray write, no page error', async () => {
  await page.route(/\/api\/learn\/c\/[^/]+\/anchors$/, route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The server failed. Try again.' }) }));
  await select(shape('ga'));
  await canvasKey('Control+Shift+g');
  await expect(page.locator('[data-toast-error]').filter({ hasText: 'Not ungrouped' })).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('[data-group-box="g1"]')).toHaveCount(1);
  assert.equal((await anchorOf(T.group)).object_id, 'g1', 'the group\'s thread stays on it');
  await shown(GROUP);
  await page.unroute(/\/api\/learn\/c\/[^/]+\/anchors$/);
  assert.deepEqual([asks, stray, errors], [[], [], []]);
});

const message = id => page.locator(`[data-comments-panel] [data-comment-message="${id}"]`);
const reply = async (body, call = viewer) => {
  const sent = await post(call, `${pub}/threads/${T.visitor}/comments`, { id: crypto.randomUUID(), body, mentions: [] });
  assert.equal(sent.status, 201, `${body}: HTTP ${sent.status} ${JSON.stringify(sent.body)}`);
  return sent.body.comment.id;
};
// The open thread syncs every 10 s while shown (SYNC_MS): each wait is for the asserted state, bounded by two ticks and slack.
const SYNC = { timeout: 25000 };
await check('8 an open thread shows another person\'s reply, edit and delete and a resolve from another session, with no Back or reload; the typed reply stays', async () => {
  await row(T.visitor).click();
  await page.locator(`[data-comment-thread-view="${T.visitor}"]`).waitFor();
  const draft = page.locator('[data-comments-panel] [data-comment-composer] textarea');
  await draft.fill('A reply I am still typing');
  const live = await reply('A reply from the visitor while the owner reads');
  await expect(message(live)).toContainText('A reply from the visitor while the owner reads', SYNC);
  assert.equal((await viewer(`${pub}/comments/${live}`, { method: 'PATCH', body: JSON.stringify({ body: 'The visitor edited this reply', mentions: [] }) })).status, 200);
  await expect(message(live)).toContainText('The visitor edited this reply', SYNC);
  await expect(message(live)).toContainText('edited');
  assert.equal((await viewer(`${pub}/comments/${live}`, { method: 'DELETE' })).status, 200);
  await expect(message(live)).toContainText('This comment was deleted', SYNC);
  assert.equal((await post(api, `${base}/threads/${T.visitor}/resolve`, {})).status, 200, 'the owner resolves it from another session');
  await expect(page.locator(`[data-comment-thread-view="${T.visitor}"]`)).toContainText('Resolved', SYNC);
  await expect(page.locator('[data-comments-panel]').getByRole('button', { name: 'Reopen' })).toHaveCount(1);
  assert.equal((await post(api, `${base}/threads/${T.visitor}/reopen`, {})).status, 200);
  await expect(page.locator('[data-comments-panel]').getByRole('button', { name: 'Resolve' })).toHaveCount(1, SYNC);
  await expect(message(live)).toHaveCount(1);
  await expect(draft).toHaveValue('A reply I am still typing');
  assert.deepEqual([asks, stray, errors], [[], [], []]);
  await page.screenshot({ path: `${SHOTS}/08-live-thread.png` });
});

await check('9 scrolled up, new replies show New replies and the reading place stays; offline and back, the thread catches up with every message once', async () => {
  const replies = [];
  for (let i = 1; i <= 20; i += 1) replies.push(await reply(`Visitor reply number ${i}, long enough to take a line of the panel`));
  await expect(message(replies.at(-1))).toHaveCount(1, SYNC);
  const list = page.locator('[data-comments-panel] [data-comment-messages]');
  await expect.poll(() => list.evaluate(node => node.scrollHeight - node.clientHeight), { timeout: 5000 }).toBeGreaterThan(200);
  await list.evaluate(node => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  const later = await reply('A reply that arrives while the owner reads the top');
  await expect(page.locator('[data-comments-panel] [data-new-replies]')).toHaveText('New replies', SYNC);
  assert.ok(await list.evaluate(node => node.scrollTop) < 10, 'the reading place stays at the top');
  await page.locator('[data-comments-panel] [data-new-replies]').click();
  await expect(message(later)).toBeInViewport();
  await expect(page.locator('[data-comments-panel] [data-new-replies]')).toHaveCount(0);
  await page.locator('[data-comments-panel] [data-comment-composer] textarea').fill('Typed before going offline');
  assert.deepEqual([asks, stray, errors], [[], [], []]);
  await context.setOffline(true);
  const away = await reply('A reply posted while the owner was offline');
  await page.waitForEvent('requestfailed', { predicate: request => request.url().includes(`/threads/${T.visitor}?since=`), timeout: 25000 }); // a sync tried and failed offline
  await context.setOffline(false);
  await expect(message(away)).toHaveCount(1, SYNC);
  const shown = await page.locator('[data-comments-panel] [data-comment-message]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-comment-message')));
  assert.equal(new Set(shown).size, shown.length, 'every message once');
  for (const id of [...replies, later, away]) assert.ok(shown.includes(id), `${id} shown`);
  await expect(page.locator('[data-comments-panel] [data-comment-composer] textarea')).toHaveValue('Typed before going offline');
  assert.deepEqual([asks, stray], [[], []]);
});

await browser.close();
console.log(`${results.length}/${total} checks passed`);
process.exit(results.length === total ? 0 : 1);
