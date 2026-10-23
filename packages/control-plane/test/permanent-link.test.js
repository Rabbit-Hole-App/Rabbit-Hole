// One permanent share link and Hidden comments (owner decisions of 2026-10-22; C:/s/spec/embed/permanent-link-note.md), through the
// real routes and LEARN_DB (shared-canvas-fixture.js). ana owns the canvas, ben and cara are signed-in viewers, ben is also a member.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, scriptModel } from './shared-canvas-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const NO_ACCESS = "You don't have access to this canvas.";
const handle = (f, email, h) => { f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, NULL)').run(email); f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h); };
const share = (f, canvas, body, as = 'ana') => f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as, body });
const on = (f, canvas, extra = {}) => share(f, canvas, { shared: true, view: true, public_view: true, ...extra });
const off = (f, canvas) => share(f, canvas, { shared: false });
const tokenOf = res => res.body.sharing.view;

// A request through the comments router or the boards router, as the app worker would route it.
async function api(f, method, path, { as, body, headers = {} } = {}) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const pathname = new URL(req.url).pathname;
  const response = (await canvasCommentsRoute(pathname, req, f.env)) || await learnBoardsRoute(pathname, req, f.env);
  const type = response.headers.get('content-type') || '', text = await response.text();
  return { status: response.status, text, body: type.includes('json') ? JSON.parse(text) : null, headers: response.headers };
}
// A public thread with one comment, stored directly (the writers are tested in canvas-comments.test.js).
const THREAD = '11111111-1111-4111-8111-111111111111';
const seedThread = (f, canvas, boardId, text = 'HIDDEN-COMMENT-TEXT') => {
  f.sqlite.exec(`INSERT INTO canvas_comment_threads (id, board_id, org, canvas, audience, anchor_json, created_by, created_by_email, create_hash, created_at, last_activity_at, message_count)
    VALUES ('${THREAD}', '${boardId}', 'ana-ws', '${canvas.name}', 'public', '{"kind":"point","x":10,"y":10}', 'u-cara-71f0', 'cara@test', 'h1', '2026-10-22T00:00:00Z', '2026-10-22T00:00:00Z', 1);
    INSERT INTO canvas_comments (id, thread_id, author_id, author_email, body, create_hash, created_at) VALUES ('c1', '${THREAD}', 'u-cara-71f0', 'cara@test', '${text}', 'h2', '2026-10-22T00:00:00Z');`);
};
const boardOf = async (f, canvas) => (await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: { blocks: [{ id: 'b1', type: 'explanation', title: 'Card', body: 'Body' }] }, version: 0 } })).body.board_id
  ?? f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(canvas.name).id;

test('share, disable, old link denied with the exact text; enable, the identical URL works; toggles never move it', async t => {
  const f = setup(t), { canvas, token } = await f.shareProject();
  const open = () => api(f, 'GET', `/api/learn/boards/shared/${token}`, { as: 'ben' });
  assert.equal((await open()).status, 200);
  const disabled = await off(f, canvas);
  assert.deepEqual([disabled.body.sharing.shared, disabled.body.sharing.view], [false, token], 'the panel still gets the one URL');
  const denied = await open();
  assert.deepEqual([denied.status, denied.body.error], [404, NO_ACCESS]);
  assert.equal((await api(f, 'GET', `/api/learn/boards/shared/${'z'.repeat(32)}`, { as: 'ben' })).body.error, 'This link is not shared any more, or never was.', 'a token never issued says so');
  assert.equal(tokenOf(await on(f, canvas)), token, 'identical URL');
  assert.equal((await open()).status, 200);
  // Public -> sign-in required -> public, with enforcement following the mode on the same URL.
  assert.equal(tokenOf(await on(f, canvas, { public_view: false })), token);
  assert.equal((await api(f, 'GET', `/api/learn/boards/shared/${token}`)).status, 401);
  assert.equal((await open()).status, 200);
  assert.equal(tokenOf(await on(f, canvas)), token);
  assert.equal((await api(f, 'GET', `/api/learn/boards/shared/${token}`)).status, 200);
  // Unrelated saves and repeated, concurrent toggles.
  await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: { blocks: [] }, version: 1 } });
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? off(f, canvas) : on(f, canvas, { public_view: i % 4 === 0 }))));
  assert.deepEqual([...new Set(results.map(tokenOf))], [token]);
  assert.equal(f.sqlite.prepare('SELECT view_token FROM learn_boards WHERE app = ?').get(canvas.name).view_token, token);
});

test('a disabled link reaches nothing: page, Chat, assets, thumbnail, hooks, holes, card source, fork, Rabbit Hole, comments, embed probe', async t => {
  const f = setup(t), sent = scriptModel(t);
  handle(f, 'ana@test', 'ana');
  const { canvas, token } = await f.shareProject();
  await off(f, canvas);
  const base = `/api/learn/boards/shared/${token}`;
  const probes = [['GET', base], ['GET', `${base}/ask`], ['POST', `${base}/ask`, { message: 'hi' }], ['GET', `${base}/assets/key`], ['GET', `${base}/thumbnail`], ['POST', `${base}/next-steps`, { origin: null }],
    ['GET', `${base}/holes`], ['GET', `${base}/cards/b1/source`], ['POST', `${base}/fork`, {}], ['POST', '/api/learn/boards/fork', { source: { token }, key: 'fork-key-0001' }],
    ['POST', `${base}/rabbit-hole`, { origin: null }], ['GET', `${base}/comments`], ['GET', `${base}/comments/threads`]];
  for (const [method, path, body] of probes) {
    for (const [as, headers] of [[undefined, {}], ['ben', {}], ['ana', {}], [undefined, { 'x-rh-embed': '1', 'x-rh-action-key': 'send-key-0001' }]]) {
      const res = await api(f, method, path, { as, body, headers });
      // A signed-out fork or Rabbit Hole start is asked to sign in before anything about the link is looked at.
      if (!as && /fork|rabbit-hole/.test(path)) { assert.ok([401, 404].includes(res.status), `${path} ${res.status}`); continue; }
      assert.equal(res.status, 404, `${method} ${path} as ${as} ${JSON.stringify(headers)} -> ${res.status} ${res.text.slice(0, 80)}`);
      if (!path.includes('/thumbnail') || res.body) assert.match(res.body?.error ?? '', /access to this canvas|not shared/, `${method} ${path}`);
    }
  }
  assert.equal(sent.length, 0, 'no model call through a disabled link');
  // The embed probe, conditional thumbnail: a retained ETag is not proof either.
  assert.equal((await api(f, 'GET', `${base}/thumbnail`, { headers: { 'if-none-match': '"x"' } })).status, 404);
  // Back on: everything above works again with the same URL and no new embed code.
  await on(f, canvas);
  assert.equal((await api(f, 'GET', `${base}/ask`, { headers: { 'x-rh-embed': '1' } })).status, 200);
  assert.equal((await api(f, 'GET', base)).status, 200);
});

test('the guest allowance and the per-link caps survive off and on: the link key is the token\'s, and the browser key is the cookie\'s', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { canvas, token } = await f.shareProject();
  const ask = (n, extra = {}) => api(f, 'POST', `/api/learn/boards/shared/${token}/ask`, { body: { message: `q${n}` }, headers: { 'x-rh-action-key': `key-${String(n).padStart(6, '0')}`, ...extra } });
  const jar = { guest: 'g'.repeat(32), embed: 'e'.repeat(32) };
  const cookie = `rh_guest=${jar.guest}; rh_embed=${jar.embed}`;
  for (let i = 1; i <= 3; i++) assert.equal((await ask(i, { cookie })).status, 200);
  for (let i = 4; i <= 5; i++) assert.equal((await ask(i, { cookie, 'x-rh-embed': '1' })).status, 200);
  await off(f, canvas);
  assert.equal((await ask(6, { cookie })).status, 404);
  await on(f, canvas);
  const allowance = async extra => (await api(f, 'GET', `/api/learn/boards/shared/${token}/ask`, { headers: { cookie, ...extra } })).body.guest.used;
  assert.deepEqual([await allowance({}), await allowance({ 'x-rh-embed': '1' })], [3, 2], 'neither trial was reset by the toggle');
  const keys = f.sqlite.prepare('SELECT DISTINCT share_key FROM shared_ask_events').all();
  assert.equal(keys.length, 1, 'one link key across off and on');
  assert.equal(sent.length, 5);
});

test('Hidden comments are absent from every viewer response while stored; View only reads; Allow posts; hiding deletes nothing', async t => {
  const f = setup(t), sent = scriptModel(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'cara@test', 'cara');
  const { canvas, token } = await f.shareProject();
  const boardId = f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(canvas.name).id;
  seedThread(f, canvas, boardId);
  const link = `/api/learn/boards/shared/${token}/comments`;
  const sees = async (as, headers = {}) => {
    const out = [];
    for (const path of [link, `${link}/threads`, `${link}/threads/${THREAD}`, `${link}/people?q=ca`]) out.push(await api(f, 'GET', path, { as, headers }));
    return out;
  };
  const hiddenEverywhere = async (as, headers) => {
    for (const res of await sees(as, headers)) { assert.equal(res.status, 404, res.text.slice(0, 100)); assert.ok(!res.text.includes('HIDDEN-COMMENT-TEXT')); }
    // The page itself carries no comment content, count, pin or member id for a visitor.
    const page = await api(f, 'GET', `/api/learn/boards/shared/${token}`, { as, headers });
    assert.equal(page.status, 200);
    assert.ok(!/HIDDEN-COMMENT|comment_count|message_count|member_board_id|threads/i.test(page.text), 'no comment field in the shared GET');
  };
  // Default: Hidden (a link has never shown comments to visitors).
  await hiddenEverywhere(undefined); await hiddenEverywhere('cara'); await hiddenEverywhere('ben');
  assert.equal((await api(f, 'POST', `${link}/threads`, { as: 'cara', body: { id: crypto.randomUUID(), anchor: { kind: 'point', x: 1, y: 1 }, body: 'x' } })).status, 404, 'no composer');
  // The owner keeps the data through the owner interface.
  const owned = await api(f, 'GET', `/api/learn/c/${boardId}/threads?audience=public&status=all`, { as: 'ana' });
  assert.equal(owned.status, 200);
  assert.ok(owned.text.includes('HIDDEN-COMMENT-TEXT'));
  assert.equal((await api(f, 'GET', `/api/learn/c/${boardId}`, { as: 'ana' })).body.link_comments, 'hidden');
  // View only.
  const saved = await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'view' } });
  assert.deepEqual([saved.status, saved.body.link_comments], [200, 'view']);
  const viewOnly = await sees('cara');
  assert.deepEqual(viewOnly.map(r => r.status), [200, 200, 200, 200]);
  assert.ok(viewOnly[1].text.includes('HIDDEN-COMMENT-TEXT') || viewOnly[1].text.includes('threads'));
  assert.equal((await sees(undefined))[1].status, 200, 'signed out reads on a public link');
  const closed = await api(f, 'POST', `${link}/threads`, { as: 'cara', body: { id: crypto.randomUUID(), anchor: { kind: 'point', x: 1, y: 1 }, body: 'nope' } });
  assert.deepEqual([closed.status, closed.body.code], [403, 'closed']);
  assert.equal(viewOnly[0].body.link_comments, undefined, 'a visitor is not told the owner setting');
  // Allow comments: a signed-in visitor posts; signed out does not.
  await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'allow' } });
  const posted = await api(f, 'POST', `${link}/threads`, { as: 'cara', body: { id: crypto.randomUUID(), anchor: { kind: 'point', x: 2, y: 2 }, body: 'a new comment' } });
  assert.equal(posted.status, 201);
  assert.notEqual((await api(f, 'POST', `${link}/threads`, { body: { id: crypto.randomUUID(), anchor: { kind: 'point', x: 2, y: 2 }, body: 'anon' } })).status, 201);
  // Back to Hidden: gone for visitors, still stored; restoring brings both threads back.
  await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'hidden' } });
  await hiddenEverywhere('cara');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comment_threads').get().n, 2, 'hiding deletes nothing');
  await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'view' } });
  assert.equal(JSON.parse((await api(f, 'GET', `${link}/threads`, { as: 'cara' })).text).threads.length, 2);
  assert.equal((await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'cara', body: { link_comments: 'allow' } })).status, 404, 'only the owner (a stranger does not even see the canvas)');
  assert.equal((await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'everyone' } })).status, 400);
  assert.equal(sent.length, 0);
});

test('an embed never sees hidden comments, even the owner\'s embed; Explore and invitations keep their own settings', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'cara@test', 'cara');
  const { canvas, token } = await f.shareProject();
  const boardId = f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(canvas.name).id;
  seedThread(f, canvas, boardId);
  const link = `/api/learn/boards/shared/${token}/comments`;
  // Link View only: a signed-in owner browsing normally reads; the same owner in an embed is the public's.
  await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'view' } });
  assert.equal((await api(f, 'GET', link, { as: 'ana' })).body.role, 'owner');
  const embedded = await api(f, 'GET', link, { as: 'ana', headers: { 'x-rh-embed': '1' } });
  assert.deepEqual([embedded.status, embedded.body.role], [200, 'viewer'], 'view only: read as the public');
  assert.equal(embedded.body.link_comments, undefined);
  // Link Hidden: the owner browsing sees them (owner interface); the owner's embed does not.
  await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'hidden' } });
  assert.equal((await api(f, 'GET', `${link}/threads`, { as: 'ana' })).status, 200, 'the owner keeps access through their own session');
  for (const query of ['', '?embed=1']) {
    const res = await api(f, 'GET', `${link}/threads${query}`, { as: 'ana', headers: query ? {} : { 'x-rh-embed': '1' } });
    assert.equal(res.status, 404, `embed ${query || 'header'}`);
    assert.ok(!res.text.includes('HIDDEN-COMMENT-TEXT'));
  }
  assert.equal((await api(f, 'GET', `/api/learn/c/${boardId}/threads`, { as: 'ana', headers: { 'x-rh-embed': '1' } })).status, 401, 'the owner interface does not answer an embed either');
  // Explore: publish and open it; its setting is its own and the link stays Hidden.
  const pub = (await f.call('POST', `/api/apps/${canvas.name}/publish`, { as: 'ana' })).body.publication_token;
  assert.ok(pub);
  await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { public_mode: 'closed' } });
  assert.equal((await api(f, 'GET', `/api/learn/boards/shared/${pub}/comments/threads`, { as: 'cara' })).status, 200, 'Explore View only');
  assert.equal((await api(f, 'GET', `${link}/threads`, { as: 'cara' })).status, 404, 'the link stays Hidden');
  await api(f, 'PUT', `/api/learn/c/${boardId}/comment-settings`, { as: 'ana', body: { link_comments: 'allow', public_mode: 'off' } });
  assert.equal((await api(f, 'GET', `/api/learn/boards/shared/${pub}/comments/threads`, { as: 'cara' })).status, 404, 'Explore Hidden, link Allow: independent');
  assert.equal((await api(f, 'GET', `${link}/threads`, { as: 'cara' })).status, 200);
  // Disabling the link removes neither Explore nor the stored comments; a disabled link answers the comments routes with the denial text.
  await off(f, canvas);
  const denied = await api(f, 'GET', `${link}/threads`, { as: 'cara' });
  assert.deepEqual([denied.status, denied.body.error], [404, NO_ACCESS]);
  assert.equal((await api(f, 'GET', `/api/learn/boards/shared/${pub}`)).status, 200, 'Explore still open');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comment_threads').get().n, 1);
  // Invitations: a member reads through the member family whatever the link says.
  f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m1', 'ana-ws', ?, 'ben@test', 'u-ben-9a2b', 'ben@test', 'active', 'sent', 'u-ana-5d1e', '2026-10-22T00:00:00Z', '2027-10-22T00:00:00Z')").run(canvas.name);
  assert.equal((await api(f, 'GET', `/api/learn/c/${boardId}/threads?audience=public`, { as: 'ben' })).status, 200);
});
