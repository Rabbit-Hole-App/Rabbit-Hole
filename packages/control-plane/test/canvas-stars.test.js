// Canvas Stars (docs/features/stars.md; migration 0028) through the routes the app worker serves, on the shared-canvas fixture
// (LEARN_DB as node:sqlite built from repository-schema.sql). Fixture evidence only: it proves the SQL, the routes and the
// authorization decisions, not a deployed D1 (whose batch is one transaction, as the fixture's is) and not a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0028-canvas-stars.sql', import.meta.url), 'utf8');
import { BEN, CARA, ANA, api, events, published, rows, star } from './stars-helpers.js';

test('0028 is additive, re-runnable and exactly what repository-schema.sql applies; it backfills nothing and creates no counter', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM canvas_stars').get().n, 0);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration.replace(/--[^\n]*/g, ''), /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvas_stars)').all().map(c => c.name), ['org', 'canvas', 'user_id', 'user_email', 'created_at', 'id', 'via_token'], 'no count column');
});

test('star and unstar are desired state: one relationship however often it is asked, never a negative count, one event per real change', async t => {
  const f = setup(t);
  const { canvas, token } = await published(f);
  const first = await star(f, token, 'ben');
  assert.deepEqual([first.status, first.body], [200, { starred_by_me: true, star_count: 1 }]);
  assert.deepEqual((await star(f, token, 'ben')).body, { starred_by_me: true, star_count: 1 }, 'a repeat star is the same relationship');
  assert.deepEqual(rows(f), [{ org: 'ana-ws', canvas: canvas.name, user_id: BEN, user_email: 'ben@test' }], 'keyed by users.id and the canonical canvas, never the token');
  assert.deepEqual((await star(f, token, 'ben', 'DELETE')).body, { starred_by_me: false, star_count: 0 });
  assert.deepEqual((await star(f, token, 'ben', 'DELETE')).body, { starred_by_me: false, star_count: 0 }, 'a repeat unstar succeeds and stays at zero');
  assert.deepEqual(events(f).map(e => [e.kind, e.reason]), [['added', 'voluntary'], ['removed', 'voluntary']], 'a retry records nothing');
  assert.deepEqual((await star(f, token, 'ben', 'GET')).body, { starred_by_me: false, star_count: 0 });
  assert.equal(f.statements.some(s => /canvas_metadata/.test(s) && /canvas_stars|canvas_star_events/.test(s)), false);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_metadata').get().n, 0, 'a star is not a content edit: updated_at is never touched');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_forks').get().n, 0, 'and not a fork');
});

test('concurrent identical requests make one relationship and one event; different people count separately; the owner may star their own', async t => {
  const f = setup(t);
  const { token } = await published(f);
  const many = await Promise.all([1, 2, 3, 4, 5].map(() => star(f, token, 'ben')));
  assert.ok(many.every(r => r.status === 200 && r.body.starred_by_me));
  assert.equal(rows(f).length, 1);
  assert.deepEqual(events(f).map(e => e.kind), ['added']);
  await Promise.all([star(f, token, 'cara'), star(f, token, 'ana'), star(f, token, 'cara')]);
  assert.deepEqual(rows(f).map(r => r.user_id), [ANA, BEN, CARA]);
  assert.equal((await star(f, token, 'ana', 'GET')).body.star_count, 3);
  assert.deepEqual(events(f).map(e => [e.user_id, e.owner_star]).sort(), [[ANA, 1], [BEN, 0], [CARA, 0]], 'the owner star is told apart');
  await Promise.all([1, 2, 3].map(() => star(f, token, 'ben', 'DELETE')));
  assert.equal(events(f).filter(e => e.kind === 'removed').length, 1);
  assert.equal((await star(f, token, 'ana', 'GET')).body.star_count, 2);
});

test('no actor, count or canvas is taken from the request', async t => {
  const f = setup(t);
  const { canvas, token } = await published(f);
  const res = await f.call('PUT', `/api/learn/boards/shared/${token}/star?user_id=${CARA}&org=x`, { as: 'ben', body: { user_id: CARA, user_email: 'cara@test', star_count: 99, org: 'other-ws', canvas: 'canvas-deadbeef', starred_by_me: false } });
  assert.deepEqual(res.body, { starred_by_me: true, star_count: 1 });
  assert.deepEqual(rows(f), [{ org: 'ana-ws', canvas: canvas.name, user_id: BEN, user_email: 'ben@test' }]);
});

test('the shared page carries the count and my state; signed out sees the public count and never a star of its own', async t => {
  const f = setup(t);
  const { token } = await published(f);
  await star(f, token, 'ben'); await star(f, token, 'cara');
  const asBen = (await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).body;
  const out = (await f.call('GET', `/api/learn/boards/shared/${token}`)).body;
  assert.deepEqual([asBen.star_count, asBen.starred_by_me, out.star_count, out.starred_by_me], [2, true, 2, false]);
  assert.equal(asBen.fork_count, 0, 'fork semantics are untouched');
  // Viewer-specific, so never cacheable: the page JSON and the star answers are no-store (route called directly for its headers).
  const headers = async (path, method = 'GET') => (await learnBoardsRoute(path, new Request(`https://app.test${path}`, { method, headers: { cookie: 'small_session=ben' } }), f.env)).headers.get('cache-control');
  assert.deepEqual([await headers(`/api/learn/boards/shared/${token}`), await headers(`/api/learn/boards/shared/${token}/star`), await headers(`/api/learn/boards/shared/${token}/star`, 'PUT')], ['no-store', 'no-store', 'no-store']);
  // Explore's card carries the public count and never my own state (a public list is the same for everyone).
  const explore = await f.call('GET', '/api/learn/boards/published', { as: 'ben' });
  assert.equal(explore.body.canvases[0].star_count, 2);
  assert.doesNotMatch(explore.text, /starred_by_me|u-ben/);
});

test('signed out cannot star (sign-in is offered); a private link needs sign-in to read the count; a guessed token or canvas names nothing', async t => {
  const f = setup(t);
  const { token } = await published(f);
  const out = await star(f, token, undefined);
  assert.deepEqual([out.status, out.body.signIn], [401, true]);
  assert.deepEqual((await star(f, token, undefined, 'GET')).body, { starred_by_me: false, star_count: 0 }, 'a public canvas shows its count signed out');
  assert.equal((await star(f, token, undefined, 'DELETE')).status, 401);
  assert.equal(rows(f).length, 0);
  const { token: closed } = await f.shareProject({ publicView: false });
  assert.deepEqual([(await star(f, closed, undefined, 'GET')).status, (await star(f, closed, undefined)).status], [401, 401], 'a link that is not public asks who you are first');
  assert.equal((await star(f, closed, 'ben')).status, 200, 'any signed-in account may open a share link, so may star it');
  for (const guess of ['not-a-token', 'A'.repeat(32), `${token}x`]) assert.equal((await star(f, guess, 'ben')).status, 404, guess);
  // Remove by the star's own id answers the same for a star that never existed (or is someone else's): it probes nothing.
  assert.deepEqual((await api(f, 'DELETE', `/api/learn/stars/${'0'.repeat(32)}`, 'ben')).body, { starred_by_me: false });
  const mine = f.sqlite.prepare('SELECT id FROM canvas_stars WHERE user_id = ?').get(BEN).id;
  const theirs = await api(f, 'DELETE', `/api/learn/stars/${mine}`, 'cara');
  assert.deepEqual([theirs.status, theirs.body, rows(f).length], [200, { starred_by_me: false }, 1], "another person's id removes nothing");
  for (const bad of ['/api/learn/stars/not-an-id', '/api/learn/stars/canvas/ana-ws/canvas-00000000']) assert.equal((await api(f, 'DELETE', bad, 'ben')).status, 404, bad);
  assert.equal((await api(f, 'DELETE', `/api/learn/stars/${mine}`)).status, 401, 'signed out');
  assert.equal((await api(f, 'PUT', `/api/learn/stars/${mine}`, 'ben')).status, 405, 'no star by id: access is decided by a live route');
});

test('a revoked link, an unpublished canvas and a canvas in Trash accept no star and show no count; restoring brings the relationship back', async t => {
  const f = setup(t);
  const { canvas, token } = await published(f);
  await star(f, token, 'ben');
  // Public to private: Remove from Explore kills the publication token.
  await f.call('POST', `/api/apps/${canvas.name}/unpublish`, { as: 'ana' });
  assert.deepEqual([(await star(f, token, 'cara')).status, (await star(f, token, 'cara', 'GET')).status, (await star(f, token, 'ben', 'DELETE')).status], [404, 404, 404]);
  assert.deepEqual(rows(f).map(r => r.user_id), [BEN], 'nothing was written, and the relationship is kept');
  // An unlisted link: switch it off, back on, and put its canvas in Trash.
  const { canvas: shared, token: link } = await f.shareProject({ publicView: true });
  assert.equal((await star(f, link, 'cara')).body.star_count, 1);
  await f.call('POST', `/api/learn/boards/${shared.name}/main/share`, { as: 'ana', body: { shared: false } });
  assert.equal((await star(f, link, 'ben')).status, 404, 'revoked: the old link is not a way to star');
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${link}`, { as: 'ben' })).status, 404);
  await f.call('POST', `/api/learn/boards/${shared.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true } });
  assert.equal((await star(f, link, 'ben')).body.star_count, 2);
  await f.call('POST', `/api/apps/${shared.name}/trash`, { as: 'ana' });
  assert.deepEqual([(await star(f, link, 'cara')).status, (await star(f, link, 'cara', 'DELETE')).status], [404, 404], 'Trash suspends the link');
  assert.equal(rows(f).filter(r => r.canvas === shared.name).length, 2, 'Trash keeps the relationships');
  await f.call('POST', `/api/apps/${shared.name}/untrash`, { as: 'ana' });
  assert.deepEqual((await star(f, link, 'cara', 'GET')).body, { starred_by_me: true, star_count: 2 }, 'restored: the same relationships, nothing re-created');
  // The way out of a star whose route is gone: by its own id, own row only.
  await f.call('POST', `/api/learn/boards/${shared.name}/main/share`, { as: 'ana', body: { shared: false } });
  const id = f.sqlite.prepare('SELECT id FROM canvas_stars WHERE user_id = ? AND canvas = ?').get(CARA, shared.name).id;
  const out = await api(f, 'DELETE', `/api/learn/stars/${id}`, 'cara');
  assert.deepEqual(out.body, { starred_by_me: false });
  assert.deepEqual(rows(f).filter(r => r.canvas === shared.name).map(r => r.user_id), [BEN], 'only the caller\'s own star went');
  assert.deepEqual(events(f).at(-1), { kind: 'removed', reason: 'voluntary', user_id: CARA, owner_star: 0, surface: null, delivered_at: null });
});

test('a project board is not a canvas: it has no stars and no count, never a 0', async t => {
  const f = setup(t);
  const board = await f.call('POST', '/api/learn/boards/repo-0a1b2c3d-nanogpt/main/share', { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } });
  const token = board.body.sharing.view;
  const page = (await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).body;
  assert.deepEqual([page.star_count, page.starred_by_me, page.fork_count], [null, false, null]);
  const res = await star(f, token, 'ben');
  assert.deepEqual([res.status, res.body.code], [404, 'not_starrable']);
  assert.equal(rows(f).length, 0);
});

test('a session with no users.id (a CLI token) cannot star: there is no stable account to key it on', async t => {
  const f = setup(t);
  const { token } = await published(f);
  const env = { ...f.env, CONTROL_PLANE: { fetch: async () => Response.json({ email: 'cli@test', org: 'cli-ws', orgName: null, user_id: null }) } };
  const path = `/api/learn/boards/shared/${token}/star`;
  const put = await learnBoardsRoute(path, new Request(`https://app.test${path}`, { method: 'PUT', headers: { cookie: 'small_session=x' } }), env);
  assert.deepEqual([put.status, (await put.json()).code], [403, 'no_account']);
  assert.equal(rows(f).length, 0);
});

test('deleting a canvas removes its stars as lifecycle removals, never as voluntary unstars; a hole deleted from its parent does the same', async t => {
  const f = setup(t);
  const { token } = await published(f);
  await star(f, token, 'ben'); await star(f, token, 'ana');
  await star(f, token, 'cara'); await star(f, token, 'cara', 'DELETE');
  // A published canvas has been used, so the "undo while untouched" delete is for a fresh one: star that through its owner's link.
  const fresh = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Scratch' } })).body;
  await f.call('POST', `/api/learn/boards/${fresh.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true } });
  const link = f.sqlite.prepare("SELECT view_token FROM learn_boards WHERE app = ? AND board = 'main'").get(fresh.name).view_token;
  await star(f, link, 'ben'); await star(f, link, 'ana');
  assert.equal((await f.call('DELETE', `/api/apps/${fresh.name}`, { as: 'ana' })).status, 200);
  assert.equal(rows(f).filter(r => r.canvas === fresh.name).length, 0);
  const lifecycle = f.sqlite.prepare("SELECT user_id, owner_star FROM canvas_star_events WHERE canvas = ? AND reason = 'lifecycle' AND kind = 'removed' ORDER BY user_id").all(fresh.name);
  assert.deepEqual(lifecycle.map(e => [e.user_id, e.owner_star]), [[ANA, 1], [BEN, 0]]);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM canvas_star_events WHERE canvas = ? AND reason = 'voluntary' AND kind = 'removed'").get(fresh.name).n, 0);
  assert.deepEqual(rows(f).map(r => r.user_id), [ANA, BEN], 'the other canvas keeps its stars');
  // A Rabbit Hole under a canvas of ana's.
  f.sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('ana-ws','canvas-0000b0b0','ana@test','A hole')").run();
  f.sqlite.prepare("INSERT INTO canvas_dives(org,owner_email,child,parent_app,origin_block_id,dive_json) VALUES('ana-ws','ana@test','canvas-0000b0b0','canvas-00000000','b1','{}')").run();
  f.sqlite.prepare("INSERT INTO canvas_stars (org, canvas, user_id, user_email) VALUES ('ana-ws','canvas-0000b0b0', ?, 'ben@test')").run(BEN);
  assert.equal((await f.call('DELETE', '/api/canvases/dives/canvas-0000b0b0', { as: 'ana' })).status, 200);
  assert.equal(rows(f).filter(r => r.canvas === 'canvas-0000b0b0').length, 0);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM canvas_star_events WHERE canvas = 'canvas-0000b0b0' AND reason = 'lifecycle'").get().n, 1);
});
