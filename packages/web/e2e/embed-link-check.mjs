// SHARE-04 owner decisions of 2026-10-22 (C:/s/spec/embed/permanent-link-note.md): ONE permanent share link, and Hidden comments
// for share links. LOCAL stack only, no model call, prints no secrets. HTTP for the contract, one Chromium page on the distinct-origin
// host (embed-harness.mjs) for what a visitor sees and for an embed iframe that must survive off and on with no new code.
//   - the token is made once; off, sign-in required, public and every toggle (repeated, concurrent) keep the same URL;
//   - off: every API a token reaches answers 404 "You don't have access to this canvas." (also conditional requests), a token
//     the server never issued keeps the old text, and the embed iframe on the same URL shows the text, then works again on re-enable;
//   - comments for the link are Hidden by default (404 for visitors, no comment keys in the JSON the page reads, no panel), View only
//     and Allow comments restore what was stored, and Explore's own setting is independent.
// Not covered here: that the guest Chat allowance survives off and on (it needs real admissions, which the keyless stack cannot make;
// control-plane tests cover it).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/embed-link-check.mjs [shotsDir]
import { BASE, startHost, launchAvailable, sessionFor, run, api, post, SEED, PNG, contextOptions, reporter, hostUrl, embedPath } from './embed-harness.mjs';

const { check, finish, plan } = reporter('embed-link-check');
plan(19);
const owner = { session: await sessionFor(`link-owner-${run}@example.com`, `lnk_${run}`) };
const viewer = { session: await sessionFor(`link-viewer-${run}@example.org`, `lnkv_${run}`) };
const NO_ACCESS = "You don't have access to this canvas.", NEVER = 'This link is not shared any more, or never was.';
const M = { 'X-RH-Embed': '1' };
const made = (await post(owner, '/api/canvases', { title: `Permanent link ${run}` })).body;
const board = `/api/learn/boards/${made.name}/main`;
const share = (shared, publicView) => post(owner, `${board}/share`, { shared, view: true, public_view: publicView, state: SEED('link') });
const on = await share(true, true);
const T = on.body.sharing.view;
const shared = `/api/learn/boards/shared/${T}`;
const get = (who, path, headers = {}) => api(who, path, { headers });
const put = (path, type) => fetch(`${BASE}${path}`, { method: 'PUT', body: PNG, headers: { cookie: `small_session=${owner.session}`, 'content-type': type } });
await put(`${board}/assets/${encodeURIComponent('drop:a')}`, 'image/png');
await put(`${board}/thumbnail/custom`, 'image/png');
const etag = (await fetch(`${BASE}${shared}/thumbnail`)).headers.get('etag');

// ---- the token ----
const off = await share(false, false), onAgain = await share(true, true);
const signIn = await share(true, false), publicAgain = await share(true, true);
check('the link is made once: off keeps returning the same token, and on again, sign-in required and public again all give the identical URL', !!T && off.body.sharing.view === T && off.body.sharing.shared === false && onAgain.body.sharing.view === T && signIn.body.sharing.view === T && signIn.body.sharing.public_view === false && publicAgain.body.sharing.view === T, JSON.stringify([T, off.body.sharing, signIn.body.sharing]));
const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => share(i % 2 === 0, i % 4 === 0)));
await share(true, true);
check('repeated and concurrent toggles never change the token', burst.every(r => r.status === 200 && r.body.sharing.view === T) && (await api(owner, board)).body.sharing.view === T, burst.map(r => r.body?.sharing?.view === T).join());
await share(true, false);
const anon = await get(null, shared), signed = await get(viewer, shared);
check('sign-in required: the same URL answers a signed-out visitor with a sign-in request and a signed-in one with the canvas', anon.status === 401 && signed.status === 200 && !!signed.body?.state, `${anon.status} ${signed.status}`);
await share(true, true);

// ---- disabled ----
await share(false, false);
const paths = [['shared data', shared], ['Chat allowance', `${shared}/ask`], ['asset', `${shared}/assets/${encodeURIComponent('drop:a')}`], ['thumbnail', `${shared}/thumbnail`], ['holes', `${shared}/holes`]];
const gone = [];
for (const [label, path] of paths) for (const [who, name] of [[null, 'anon'], [viewer, 'viewer'], [owner, 'owner']]) { const r = await get(who, path, M); gone.push({ label, who: name, status: r.status, text: r.body?.error }); }
check('a disabled link answers 404 "You don\'t have access to this canvas." for data, Chat allowance, assets, thumbnail and holes, to anyone, the owner included', gone.every(g => g.status === 404 && g.text === NO_ACCESS), JSON.stringify(gone.filter(g => g.status !== 404 || g.text !== NO_ACCESS)));
const attempts = [['Chat send', `${shared}/ask`, { message: 'hello' }, { ...M, 'X-RH-Action-Key': `link-${run}-1` }], ['fork', '/api/learn/boards/fork', { source: { token: T }, key: `link-fork-${run}` }, {}], ['Rabbit Hole', `${shared}/rabbit-hole`, {}, {}], ['next steps', `${shared}/next-steps`, { input: {} }, {}]];
const writes = [];
for (const [label, path, body, headers] of attempts) { const r = await post(viewer, path, body, headers); writes.push({ label, status: r.status, text: r.body?.error }); }
check('a disabled link refuses Chat send, fork, Start Rabbit Hole and next steps with the same 404 text, nothing created', writes.every(w => w.status === 404 && w.text === NO_ACCESS), JSON.stringify(writes));
const cond = await fetch(`${BASE}${shared}/thumbnail`, { headers: { 'if-none-match': etag || 'x' } }), condAsset = await fetch(`${BASE}${shared}/assets/${encodeURIComponent('drop:a')}`, { headers: { 'if-none-match': '*' } });
check('conditional requests (If-None-Match with the old ETag) on a disabled link are 404, never 304', !!etag && cond.status === 404 && condAsset.status === 404, `${etag} ${cond.status} ${condAsset.status}`);
const never = await get(null, `/api/learn/boards/shared/${'Q'.repeat(32)}`, M);
check('a token the server never issued keeps the old text, so the two cases stay distinguishable', never.status === 404 && never.body?.error === NEVER, JSON.stringify(never.body));

// ---- the page and an embed iframe on the same URL ----
const host = await startHost();
const browser = await launchAvailable();
const context = await browser.newContext(contextOptions);
const page = await context.newPage();
await page.goto(hostUrl(host, 'a', embedPath('b', T), '&lazy=0&h=420'));
const frame = page.frameLocator('iframe').first();
await frame.getByText(NO_ACCESS).first().waitFor({ timeout: 60000 }).catch(() => {});
check('the embed iframe already on a page shows "You don\'t have access to this canvas." while the link is off', await frame.getByText(NO_ACCESS).count() >= 1 && await frame.locator('[data-canvas-surface]').count() === 0);
const direct = await context.newPage();
await direct.goto(`${host.app}/b/${T}`);
await direct.getByText(NO_ACCESS).first().waitFor({ timeout: 60000 }).catch(() => {});
check('the ordinary /b page of the same URL shows the same text and no canvas', await direct.getByText(NO_ACCESS).count() >= 1 && await direct.locator('[data-canvas-surface]').count() === 0);
await share(true, true);
await page.reload();
const back = page.frameLocator('iframe').first();
await back.locator('[data-canvas-surface]').first().waitFor({ timeout: 60000 }).catch(() => {});
check('re-enabled, the SAME embed iframe (no new embed code) shows the canvas again', await back.locator('[data-canvas-surface]').count() === 1 && new URL(await page.locator('iframe').getAttribute('src')).pathname === `/embed/b/${T}`);
await direct.reload();
await direct.locator('[data-canvas-surface]').first().waitFor({ timeout: 60000 }).catch(() => {});
check('and the ordinary /b page of the same URL works again', await direct.locator('[data-canvas-surface]').count() === 1);

// ---- comments for the link ----
const boardId = (await api(owner, board)).body.board_id;
const settings = async body => (await api(owner, `/api/learn/c/${boardId}/comment-settings`, { method: 'PUT', body: JSON.stringify(body) })).status;
const aboutLink = async () => (await api(owner, `/api/learn/c/${boardId}`)).body?.link_comments;
const visitorThreads = async () => { const r = await get(null, `${shared}/comments/threads`); return { status: r.status, n: r.body?.threads?.length }; };
const commentKeys = body => [...JSON.stringify(body ?? {}).matchAll(/"([^"]*(?:comment|member_board_id)[^"]*)":/gi)].map(m => m[1]);
const seen = [];
const hiddenRead = await visitorThreads(), hiddenData = await get(null, shared);
check('Hidden is the default: visitors get 404 from every comment route and no comment key is in the JSON the page reads', await aboutLink() === 'hidden' && hiddenRead.status === 404 && (await get(null, `${shared}/comments`)).status === 404 && hiddenData.status === 200 && commentKeys(hiddenData.body).length === 0, JSON.stringify({ about: await aboutLink(), hiddenRead, keys: commentKeys(hiddenData.body) }));
const fresh = await context.newPage();
fresh.on('response', r => { if (/\/comments/.test(new URL(r.url()).pathname)) seen.push({ url: new URL(r.url()).pathname, status: r.status() }); });
await fresh.goto(`${host.app}/b/${T}`);
await fresh.locator('[data-canvas-surface]').first().waitFor({ timeout: 60000 });
check('Hidden in the viewer UI: no comments toggle, no comments panel and no comment thread, and no comment request succeeded in the network', await fresh.locator('[data-comments-header], [data-shared-comments], [data-comment-thread]').count() === 0 && seen.every(s => s.status === 404), JSON.stringify(seen));
const thread = { id: crypto.randomUUID(), anchor: { kind: 'point', x: 40, y: 40 }, body: `Stored comment ${run}` };
await settings({ link_comments: 'allow' });
const stored = await post(viewer, `${shared}/comments/threads`, thread);
const allowed = await visitorThreads();
check('Allow comments: a signed-in visitor posts on the link and the thread is readable there; the setting reads back', stored.status < 300 && allowed.status === 200 && allowed.n === 1 && await aboutLink() === 'allow', JSON.stringify([stored.status, stored.body, allowed, await aboutLink()]));
await settings({ link_comments: 'view' });
const viewOnly = await visitorThreads(), tryPost = await post(viewer, `${shared}/comments/threads`, { ...thread, id: crypto.randomUUID(), body: 'second' });
check('View only: visitors read the thread and cannot post another', viewOnly.n === 1 && tryPost.status >= 400, `${viewOnly.n} ${tryPost.status} ${JSON.stringify(tryPost.body)}`);
await fresh.reload();
await fresh.locator('[data-comments-header]').first().waitFor({ timeout: 60000 }).catch(() => {});
await fresh.locator('[data-comments-header]').first().click().catch(() => {});
await fresh.locator('[data-shared-comments]').first().waitFor({ timeout: 30000 }).catch(() => {});
check('View only in the viewer UI: the comments toggle opens the panel with the thread, and there is no composer, sign-in-to-post or Add comment control', await fresh.locator('[data-shared-comments]').count() >= 1 && /Stored comment/.test(await fresh.locator('[data-shared-comments]').first().innerText().catch(() => '')) && await fresh.locator('[data-comment-composer], [data-comment-sign-in], [data-menu-add-comment], [data-comment-draft]').count() === 0, JSON.stringify(seen));
await settings({ link_comments: 'hidden' });
const again = await visitorThreads(), kept = await api(owner, `/api/learn/c/${boardId}/threads`);
await settings({ link_comments: 'allow' });
const restored = await visitorThreads();
check('Hiding deletes nothing: hidden gives 404 to visitors while the owner still reads the thread, and Allow brings the same thread back', again.status === 404 && JSON.stringify(kept.body).includes(`Stored comment ${run}`) && restored.n === 1, JSON.stringify([again, kept.status, restored]));
await post(owner, `/api/apps/${made.name}/publish`, {});
const pubToken = (await api(owner, board)).body.sharing.publication;
await settings({ link_comments: 'hidden' });
const exploreOpen = await settings({ public_mode: 'open' });
const [linkNow, exploreNow] = [await visitorThreads(), await get(null, `/api/learn/boards/shared/${pubToken}/comments/threads`)];
check('Explore\'s setting is independent: with the link Hidden, the /e publication can have comments Open, and the link stays Hidden', exploreOpen < 300 && linkNow.status === 404 && exploreNow.status === 200 && await aboutLink() === 'hidden', JSON.stringify([exploreOpen, linkNow, exploreNow.status]));
await settings({ link_comments: 'allow' });
await fresh.reload();
await fresh.locator('[data-comments-header]').first().waitFor({ timeout: 60000 }).catch(() => {});
const toggle = await fresh.locator('[data-comments-header]').count();
await fresh.locator('[data-comments-header]').first().click().catch(() => {});
await fresh.locator('[data-shared-comments]').first().waitFor({ timeout: 30000 }).catch(() => {});
check('Allow comments: the comments toggle is in the header, and it opens the comments panel for a visitor of the link', toggle >= 1 && await fresh.locator('[data-shared-comments]').count() >= 1, JSON.stringify({ toggle, seen }));
await browser.close(); await host.close();
finish();
