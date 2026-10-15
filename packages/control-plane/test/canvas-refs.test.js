// Canvas references (C:/s/spec/references-plan.md): the board is authoritative, learn_canvas_refs is the backlink index
// written in the save's own batch, and every read is filtered by who may read which canvas. Through the routes the app
// worker serves, on LEARN_DB as node:sqlite built from repository-schema.sql. ana and ann share a workspace; ben is elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { libraryTrashFetch, libraryTrashRoute } from '../src/library-trash.js';
import { boardRefs, canvasRefsFetch, canvasRefsRoute, MAX_BOARD_REFS, MAX_CARD_REFS, reidRefs } from '../src/canvas-refs.js';

const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws', user_id: 'u-ana' }, ann: { email: 'ann@test', org: 'ana-ws', user_id: 'u-ann' }, ben: { email: 'ben@test', org: 'ben-ws', user_id: 'u-ben' } };
const EMPTY = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [] };
const card = (id, refs, title = id) => ({ id, type: 'explanation', title, dx: 0, dy: 0, refs });
const board = (...blocks) => ({ ...EMPTY, blocks });

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.method !== 'GET') throw new Error('live small-cp write');
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  const LEARN_MEDIA = { put: async () => {}, get: async () => null, list: async () => ({ objects: [], truncated: false }) };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'touched production storage'));
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const url = new URL(req.url);
    const response = canvasRefsRoute(url.pathname) ? await canvasRefsFetch(req, env) : libraryTrashRoute(url.pathname) ? await libraryTrashFetch(req, env)
      : canvasRoute(url) ? await canvasesFetch(req, env) : await learnBoardsRoute(url.pathname, req, env);
    return { status: response.status, body: await response.json() };
  };
  // A canvas with its board id (a canvas comes with its empty version 0 board).
  const canvas = async (as, title) => {
    const { name } = (await call('POST', '/api/canvases', { as, body: { title } })).body;
    return { name, id: (await call('GET', `/api/learn/boards/${name}/main`, { as })).body.board_id };
  };
  const save = (as, c, state, version) => call('PUT', `/api/learn/boards/${c.name}/main`, { as, body: { state, version } });
  const indexed = c => sqlite.prepare('SELECT ref_id, source_object, object_title, target_board FROM learn_canvas_refs WHERE source_board = ? ORDER BY ref_id').all(c.id).map(row => ({ ...row }));
  const links = (as, c) => call('GET', `/api/learn/links/${c.id}`, { as });
  const member = (owner, c, who) => sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'active', 'sent', ?, 0, 0)")
    .run(crypto.randomUUID(), PEOPLE[owner].org, c.name, PEOPLE[who].email, PEOPLE[who].user_id, PEOPLE[who].email, PEOPLE[owner].email);
  return { sqlite, env, call, canvas, save, indexed, links, member };
}

test('a reference is indexed from the accepted save and derived as a backlink; an unreadable target is not indexed and resolves as Unavailable', async t => {
  const f = setup(t);
  const trees = await f.canvas('ana', 'Trees'), recursion = await f.canvas('ana', 'Recursion'), secret = await f.canvas('ben', 'Ben private');
  const saved = await f.save('ana', trees, board(card('card-1', [{ id: 'r1', target: recursion.id }, { id: 'r2', target: secret.id }], 'Recursive traversal')), 0);
  assert.equal(saved.status, 200);
  assert.deepEqual(f.indexed(trees), [{ ref_id: 'r1', source_object: 'card-1', object_title: 'Recursive traversal', target_board: recursion.id }], 'ben\'s canvas is not indexed');
  const from = (await f.links('ana', trees)).body;
  assert.deepEqual(from.from, [
    { target: recursion.id, title: 'Recursion', path: null, href: `/apps/${recursion.name}`, unavailable: false, refs: [{ id: 'r1', object: 'card-1', objectTitle: 'Recursive traversal' }] },
    { target: secret.id, unavailable: true, refs: [{ id: 'r2', object: 'card-1', objectTitle: 'Recursive traversal' }] },
  ]);
  assert.doesNotMatch(JSON.stringify(from), /Ben private/, 'no private title leaks');
  const to = (await f.links('ana', recursion)).body;
  assert.deepEqual(to.to, [{ source: trees.id, title: 'Trees', path: null, href: `/apps/${trees.name}`, refs: [{ id: 'r1', object: 'card-1', objectTitle: 'Recursive traversal', href: `/apps/${trees.name}?card=card-1` }] }]);
  assert.deepEqual(to.from, []);
  // Rename the target: the relationship is by id, the title is read now.
  await f.call('PATCH', `/api/apps/${recursion.name}`, { as: 'ana', body: { title: 'Recursion basics' } });
  assert.equal((await f.links('ana', trees)).body.from[0].title, 'Recursion basics');
  // Nobody reads a canvas they cannot open, and no one signed out reads anything.
  assert.equal((await f.links('ana', secret)).status, 404);
  assert.equal((await f.links('ben', trees)).status, 404);
  assert.equal((await f.links(null, trees)).status, 401);
  assert.equal((await f.call('GET', '/api/learn/links/not-a-board', { as: 'ana' })).status, 404);
});

// Beta hardening 4a's gate (canvas-persistence.test.js): both saves read the same version before either writes.
const OWNER_ROW = 'SELECT * FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = ?';
function gateOwnerRow(f) {
  const prepare = f.env.LEARN_DB.prepare, waiting = [];
  let reads = 0;
  f.env.LEARN_DB.prepare = sql => {
    const statement = prepare(sql);
    if (sql !== OWNER_ROW) return statement;
    const first = statement.first;
    statement.first = async () => {
      if (++reads <= 2) await new Promise(resolve => { waiting.push(resolve); if (waiting.length === 2) waiting.forEach(open => open()); });
      return first();
    };
    return statement;
  };
}

test('two saves from the same base version: the loser cannot touch the index; the winner\'s references are indexed', async t => {
  const f = setup(t);
  const src = await f.canvas('ana', 'Source'), a = await f.canvas('ana', 'Target A'), b = await f.canvas('ana', 'Target B');
  assert.equal((await f.save('ana', src, board(card('c1', [{ id: 'r0', target: a.id }])), 0)).status, 200);
  gateOwnerRow(f);
  const [x, y] = await Promise.all([
    f.save('ana', src, board(card('c1', [{ id: 'ra', target: a.id }])), 1),
    f.save('ana', src, board(card('c1', [{ id: 'rb', target: b.id }])), 1),
  ]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  const won = x.status === 200 ? 'ra' : 'rb';
  assert.deepEqual(f.indexed(src).map(row => row.ref_id), [won], 'exactly the stored board\'s references');
  // First saves racing on a canvas with no board row yet: one row, one index.
  const fresh = await f.canvas('ana', 'Fresh');
  f.sqlite.prepare('DELETE FROM learn_boards WHERE app = ?').run(fresh.name);
  gateOwnerRow(f);
  const [p, q] = await Promise.all(['rp', 'rq'].map(id => f.save('ana', fresh, board(card('c1', [{ id, target: a.id }])), 0)));
  assert.deepEqual([p.status, q.status].sort(), [200, 409]);
  const row = f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(fresh.name);
  assert.deepEqual(f.sqlite.prepare('SELECT source_board, ref_id FROM learn_canvas_refs WHERE ref_id IN (?, ?)').all('rp', 'rq').map(r => ({ ...r })), [{ source_board: row.id, ref_id: p.status === 200 ? 'rp' : 'rq' }]);
});

test('removing a reference removes its backlink; a delayed stale save cannot resurrect it; Undo restores it once', async t => {
  const f = setup(t);
  const src = await f.canvas('ana', 'Source'), dst = await f.canvas('ana', 'Dest');
  const linked = board(card('c1', [{ id: 'r1', target: dst.id }]));
  assert.equal((await f.save('ana', src, linked, 0)).body.version, 1);
  assert.equal((await f.save('ana', src, board(card('c1', [])), 1)).body.version, 2);
  assert.deepEqual(f.indexed(src), []);
  assert.deepEqual((await f.links('ana', dst)).body.to, []);
  const stale = await f.save('ana', src, linked, 1);
  assert.deepEqual([stale.status, stale.body.version], [409, 2]);
  assert.deepEqual(f.indexed(src), [], 'the stale save changed nothing');
  // Undo is an ordinary save of the earlier board: the reference and its backlink return, once.
  assert.equal((await f.save('ana', src, linked, 2)).status, 200);
  assert.equal((await f.save('ana', src, linked, 3)).status, 200);
  assert.deepEqual(f.indexed(src).map(row => row.ref_id), ['r1']);
  assert.equal((await f.links('ana', dst)).body.to[0].refs.length, 1);
  // Deleting the source card is a save without it.
  assert.equal((await f.save('ana', src, board(), 4)).status, 200);
  assert.deepEqual((await f.links('ana', dst)).body.to, []);
});

test('bounds: over 20 references on a card or 500 on a board is 413 too_many_refs and nothing is written', async t => {
  const f = setup(t);
  const src = await f.canvas('ana', 'Source'), dst = await f.canvas('ana', 'Dest');
  const refs = n => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, target: dst.id }));
  assert.equal((await f.save('ana', src, board(card('c1', refs(MAX_CARD_REFS))), 0)).status, 200);
  const card21 = await f.save('ana', src, board(card('c1', refs(MAX_CARD_REFS + 1))), 1);
  assert.deepEqual([card21.status, card21.body.code], [413, 'too_many_refs']);
  const many = Array.from({ length: MAX_BOARD_REFS / MAX_CARD_REFS + 1 }, (_, i) => card(`c${i}`, refs(MAX_CARD_REFS).map(r => ({ ...r, id: `${r.id}-${i}` }))));
  const board501 = await f.save('ana', src, board(...many), 1);
  assert.deepEqual([board501.status, board501.body.code], [413, 'too_many_refs']);
  assert.equal((await f.call('GET', `/api/learn/boards/${src.name}/main`, { as: 'ana' })).body.version, 1, 'nothing written');
  assert.equal(f.indexed(src).length, MAX_CARD_REFS);
  assert.equal(boardRefs(board(card('c1', refs(MAX_CARD_REFS + 1)))), null);
  // Malformed references stay in the board and are never indexed.
  assert.deepEqual(boardRefs(board(card('c1', [{ id: 'ok', target: dst.id }, { id: 'ok', target: dst.id }, { target: dst.id }, { id: 'x', target: 'not-a-board' }, null]))).map(r => r.id), ['ok']);
});

test('the picker lists only the viewer\'s own and member canvases, by title, bounded; no holes, Trash, archived or the excluded canvas', async t => {
  const f = setup(t);
  f.sqlite.prepare("INSERT INTO user_profiles (email, name, updated_at) VALUES ('ben@test', 'Ben B', '2026-10-15')").run();
  const here = await f.canvas('ana', 'Alpha here'), mine = await f.canvas('ana', 'Alpha mine'), gone = await f.canvas('ana', 'Alpha gone'), old = await f.canvas('ana', 'Alpha old');
  const shared = await f.canvas('ben', 'Alpha shared');
  await f.canvas('ben', 'Alpha private'); await f.canvas('ann', 'Alpha ann');
  await f.call('POST', `/api/apps/${gone.name}/trash`, { as: 'ana', body: {} });
  await f.call('POST', `/api/apps/${old.name}/archive`, { as: 'ana', body: {} });
  await f.call('POST', '/api/canvases/dives', { as: 'ana', body: { name: 'canvas-0000a1fa', title: 'Alpha hole', parent: { app: mine.name, board: 'main' }, origin_block_id: 'c1', dive: {} } });
  f.member('ben', shared, 'ana');
  const pick = async (query, as = 'ana') => (await f.call('GET', `/api/learn/canvas-picker?${query}`, { as })).body;
  const all = await pick(`q=alpha&exclude=${here.id}`);
  assert.deepEqual(all.canvases.map(c => c.title).sort(), ['Alpha mine', 'Alpha shared']);
  assert.equal(all.more, false);
  assert.deepEqual(all.canvases.find(c => c.id === shared.id), { id: shared.id, title: 'Alpha shared', path: 'Ben B', href: `/c/${shared.id}` });
  assert.deepEqual(all.canvases.find(c => c.id === mine.id), { id: mine.id, title: 'Alpha mine', path: null, href: `/apps/${mine.name}` });
  assert.equal((await pick('q=zzz')).canvases.length, 0);
  assert.equal((await pick('q=100%25')).canvases.length, 0, 'LIKE wildcards are literal');
  const one = await pick('q=alpha&limit=1');
  assert.deepEqual([one.canvases.length, one.more], [1, true]);
  assert.doesNotMatch(JSON.stringify(await pick('q=')), /Alpha private|Alpha ann/, 'never another person\'s canvas without membership');
  assert.equal((await f.call('GET', '/api/learn/canvas-picker?q=a', {})).status, 401);
});

test('backlinks show only sources the viewer can read, and counts are of what is shown', async t => {
  const f = setup(t);
  const target = await f.canvas('ana', 'Shared target'), anaSource = await f.canvas('ana', 'Ana private notes'), benSource = await f.canvas('ben', 'Ben notes');
  f.member('ana', target, 'ben');
  await f.save('ana', anaSource, board(card('a1', [{ id: 'ra1', target: target.id }]), card('a2', [{ id: 'ra2', target: target.id }])), 0);
  await f.save('ben', benSource, board(card('b1', [{ id: 'rb1', target: target.id }], 'Ben card')), 0);
  assert.equal(f.indexed(benSource).length, 1, 'a member may reference a canvas they can read');
  const asBen = (await f.links('ben', target)).body.to;
  assert.deepEqual(asBen, [{ source: benSource.id, title: 'Ben notes', path: null, href: `/apps/${benSource.name}`, refs: [{ id: 'rb1', object: 'b1', objectTitle: 'Ben card', href: `/apps/${benSource.name}?card=b1` }] }]);
  const asAna = (await f.links('ana', target)).body.to;
  assert.deepEqual(asAna.map(g => [g.title, g.refs.length]), [['Ana private notes', 2]]);
  assert.doesNotMatch(JSON.stringify(asAna), /Ben notes/);
  // Membership ends: ben no longer reads the target at all.
  f.sqlite.prepare("UPDATE canvas_members SET status = 'ended'").run();
  assert.equal((await f.links('ben', target)).status, 404);
  // ana's view of ben's source: Unavailable, never its title.
  assert.equal((await f.links('ana', benSource)).status, 404);
});

test('trashing a source hides its backlinks and Restore brings them back; a trashed target is Unavailable', async t => {
  const f = setup(t);
  const src = await f.canvas('ana', 'Source'), dst = await f.canvas('ana', 'Dest');
  await f.save('ana', src, board(card('c1', [{ id: 'r1', target: dst.id }])), 0);
  await f.call('POST', `/api/apps/${src.name}/trash`, { as: 'ana', body: {} });
  assert.deepEqual((await f.links('ana', dst)).body.to, []);
  await f.call('POST', `/api/apps/${src.name}/untrash`, { as: 'ana', body: {} });
  assert.equal((await f.links('ana', dst)).body.to.length, 1);
  await f.call('POST', `/api/apps/${dst.name}/trash`, { as: 'ana', body: {} });
  assert.deepEqual((await f.links('ana', src)).body.from, [{ target: dst.id, unavailable: true, refs: [{ id: 'r1', object: 'c1', objectTitle: 'c1' }] }]);
});

test('duplicate and fork give the copy new reference ids and index it as the new source; the original keeps its own', async t => {
  const f = setup(t);
  const src = await f.canvas('ana', 'Trees'), dst = await f.canvas('ana', 'Recursion');
  await f.save('ana', src, board(card('c1', [{ id: 'r1', target: dst.id }], 'Traversal')), 0);
  const made = await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: src.name } } });
  assert.equal(made.status, 201);
  const copy = { name: made.body.name, id: (await f.call('GET', `/api/learn/boards/${made.body.name}/main`, { as: 'ana' })).body.board_id };
  const copied = (await f.call('GET', `/api/learn/boards/${copy.name}/main`, { as: 'ana' })).body.state.blocks[0].refs;
  assert.equal(copied.length, 1);
  assert.notEqual(copied[0].id, 'r1');
  assert.equal(copied[0].target, dst.id, 'the copy keeps its intended target');
  assert.deepEqual(f.indexed(copy), [{ ref_id: copied[0].id, source_object: 'c1', object_title: 'Traversal', target_board: dst.id }]);
  assert.deepEqual(f.indexed(src).map(r => r.ref_id), ['r1']);
  assert.deepEqual((await f.links('ana', dst)).body.to.map(g => g.source).sort(), [src.id, copy.id].sort());
  // ben forks ana's shared board: new ids, and he cannot read the target, so nothing is indexed and it is Unavailable to him.
  const view = (await f.call('POST', `/api/learn/boards/${src.name}/main/share`, { as: 'ana', body: { shared: true, view: true } })).body.sharing.view;
  const forked = await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: view } } });
  assert.equal(forked.status, 201);
  const fork = { name: forked.body.name, id: (await f.call('GET', `/api/learn/boards/${forked.body.name}/main`, { as: 'ben' })).body.board_id };
  const forkRefs = (await f.call('GET', `/api/learn/boards/${fork.name}/main`, { as: 'ben' })).body.state.blocks[0].refs;
  assert.notEqual(forkRefs[0].id, 'r1');
  assert.deepEqual(f.indexed(fork), [], 'copying grants no access');
  assert.equal((await f.links('ben', fork)).body.from[0].unavailable, true);
  assert.equal((await f.links('ana', dst)).body.to.length, 2, 'the fork adds no backlink');
  // reidRefs leaves blocks without refs as they are.
  const plain = { id: 'p' };
  assert.equal(reidRefs([plain])[0], plain);
});

test('deleting a canvas or a Rabbit Hole drops its index rows in the same batch', async t => {
  const f = setup(t);
  const dst = await f.canvas('ana', 'Dest'), root = await f.canvas('ana', 'Root'), doomed = await f.canvas('ana', 'Doomed');
  await f.save('ana', doomed, board(card('c1', [{ id: 'rd', target: dst.id }])), 0);
  assert.equal(f.indexed(doomed).length, 1);
  assert.equal((await f.call('DELETE', `/api/apps/${doomed.name}`, { as: 'ana' })).status, 200);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learn_canvas_refs WHERE source_board = ?').get(doomed.id).n, 0);
  const made = await f.call('POST', '/api/canvases/dives', { as: 'ana', body: { name: 'canvas-0000b0b0', title: 'Hole', parent: { app: root.name, board: 'main' }, origin_block_id: 'c1', dive: {} } });
  const hole = { name: made.body.name };
  assert.equal((await f.save('ana', hole, board(card('h1', [{ id: 'rh', target: dst.id }])), 0)).status, 200);
  const holeId = f.sqlite.prepare("SELECT id FROM learn_boards WHERE app = ? AND board = 'main'").get(hole.name).id;
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learn_canvas_refs WHERE source_board = ?').get(holeId).n, 1);
  assert.equal((await f.links('ana', dst)).body.to[0].title, 'Hole', 'the owner reads their own hole\'s backlink');
  assert.equal((await f.call('DELETE', `/api/canvases/dives/${hole.name}`, { as: 'ana' })).status, 200);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learn_canvas_refs WHERE source_board = ?').get(holeId).n, 0);
});

test('0021 is additive, re-runnable and exactly what repository-schema.sql applies', async t => {
  const { readFileSync } = await import('node:fs');
  const { DatabaseSync } = await import('node:sqlite');
  const migration = readFileSync(new URL('../learn-migrations/0021-canvas-refs.sql', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(learn_canvas_refs)').all().map(c => c.name), ['source_board', 'ref_id', 'source_object', 'object_title', 'target_board']);
  assert.deepEqual(sqlite.prepare('PRAGMA index_list(learn_canvas_refs)').all().map(i => i.name).sort(), ['learn_canvas_refs_target', 'sqlite_autoindex_learn_canvas_refs_1']);
  assert.ok(schema.replace(/\r/g, '').includes(`-- learn-migrations/0021-canvas-refs.sql\n${migration.replace(/\r/g, '').trim()}`));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
});
