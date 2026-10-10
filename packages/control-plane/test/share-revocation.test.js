// Share revocation (beta hardening, owner 2026-10-09): a hole's link dies with the hole, and sleeps while any ancestor
// (hole, canvas or project) is in Trash. Through the routes the app worker serves, on LEARN_DB as node:sqlite built
// from repository-schema.sql. ana owns everything here; ben is a viewer with a fork of his own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { libraryTrashFetch, libraryTrashRoute } from '../src/library-trash.js';

const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' } };
const STATE = { blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax' }] };

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
    const response = libraryTrashRoute(path) ? await libraryTrashFetch(req, env) : canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const canvas = async title => (await call('POST', '/api/canvases', { as: 'ana', body: { title } })).body.name;
  let n = 0;
  // A hole as /dive persists it (dives.js): its canvas row and its link together, under a canvas or a project board.
  const hole = async parent => (await call('POST', '/api/canvases/dives', { as: 'ana', body: { name: `canvas-${(++n).toString(16).padStart(8, '0')}`, title: `Hole ${n}`, parent: { app: parent, board: 'main' }, origin_block_id: `card-${n}`, dive: {} } })).body.name;
  const share = async (name, as = 'ana') => (await call('POST', `/api/learn/boards/${name}/main/share`, { as, body: { shared: true, view: true, state: STATE } })).body.sharing.view;
  const open = async (token, as = 'ben') => (await call('GET', `/api/learn/boards/shared/${token}`, { as })).status;
  const trash = (name, action) => call('POST', `/api/apps/${name}/${action}`, { as: 'ana', body: {} });
  return { sqlite, call, canvas, hole, share, open, trash };
}

test('deleting a hole revokes its link: its board rows go with it, and a link whose canvas is gone is dead', async t => {
  const f = setup(t);
  const root = await f.canvas('Attention');
  const a = await f.hole(root), b = await f.hole(a);
  const rootToken = await f.share(root), tokens = [await f.share(a), await f.share(b)];
  for (const token of [rootToken, ...tokens]) assert.equal(await f.open(token), 200);
  const gone = await f.call('DELETE', `/api/canvases/dives/${a}?subtree=1`, { as: 'ana' });
  assert.deepEqual(gone.body.deleted, [a, b]);
  for (const token of tokens) assert.equal(await f.open(token), 404, 'the link died with its hole');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learn_boards WHERE app IN (?, ?)').get(a, b).n, 0, 'no board row left behind');
  assert.equal(await f.open(rootToken), 200, 'the canvas above keeps its link');
  // A row an earlier delete left behind (production has these): dead too, without a data migration.
  f.sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at, shared, view_token) VALUES ('orphan', 'ana-ws', 'ana@test', 'canvas-0000dead', 'main', '{}', '2026-10-09', 1, 'orphan-token-00000000000000')").run();
  assert.equal(await f.open('orphan-token-00000000000000'), 404);
});

test('a trashed ancestor suspends a nested hole\'s link, under a canvas or a project; Restore reactivates the same token; a fork is nobody\'s child', async t => {
  const f = setup(t);
  const root = await f.canvas('Attention');
  const a = await f.hole(root), b = await f.hole(a);
  const rootToken = await f.share(root), token = await f.share(b);
  // ben's fork of the root, with a link of his own: a fork is linked by canvas_forks, never canvas_dives.
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: rootToken }, key: 'revocation-fork-1' } })).body;
  const forkToken = await f.share(fork.name, 'ben');
  assert.equal(await f.open(token), 200);
  await f.trash(root, 'trash');
  assert.equal(await f.open(token), 404, 'the grandparent is in Trash');
  assert.equal(await f.open(forkToken, 'ana'), 200, 'the fork keeps its own link');
  await f.trash(root, 'untrash');
  assert.equal(await f.open(token), 200, 'Restore brings the same link back');
  // A hole under a project board: the project's Trash counts the same way.
  f.sqlite.exec("INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES('ana-ws','repo-example','ana@test','example/project','main')");
  const under = await f.share(await f.hole('repo-example'));
  assert.equal(await f.open(under), 200);
  await f.trash('repo-example', 'trash');
  assert.equal(await f.open(under), 404, 'the project is in Trash');
  await f.trash('repo-example', 'untrash');
  assert.equal(await f.open(under), 200);
});
