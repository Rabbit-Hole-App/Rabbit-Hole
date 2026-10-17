// Who may read an imported file (file-access.js; canvas-file-imports.md section 4.1, owner decision D) against the 0023
// tables on node:sqlite (repository-schema.sql mirrors the migration), with the stub control plane learn-boards.test.js uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { authorizeFileSource, fileRefSources } from '../src/file-access.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' } };
const OWN = '/api/learn/boards/demo-app/main';

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS canvases (id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, device_id TEXT, UNIQUE(org,name))`);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      const path = new URL(request.url).pathname;
      if (path === '/api/me') return Response.json(who);
      if (path === '/api/apps/demo-app' && who === PEOPLE.owner) return Response.json({ name: 'demo-app', ...who });
      return new Response('no', { status: 404 });
    },
  };
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA: { put: async () => {}, get: async () => null, list: async () => ({ objects: [] }) } };
  const request = (as, init = {}) => new Request('https://dev.test/x', { ...init, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) } });
  const call = async (method, path, as, body) => (await learnBoardsRoute(path, new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json', cookie: `small_session=${as}` }, body: JSON.stringify(body) }), env)).json();
  const source = (id, status = 'stored') => sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, 'team', 'owner@test', 'demo-app', 'video', 'clip.mp4', 'video/mp4', 10, 'abc', ?, ?, 1)`).run(id, `file-sources/${id}/original`, status);
  return { env, request, call, source, sqlite };
}
const card = id => ({ id: `c-${id}`, type: 'file', kind: 'clip', fileRef: { v: 1, source: { id, rev: 'abc' } } });
const STATE = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };

test('fileRefSources lists each referenced source once', () => {
  assert.deepEqual(fileRefSources({ blocks: [card('fs_a'), card('fs_a'), card('fs_b'), { id: 'x', type: 'file', assetKey: 'drop:1' }, { fileRef: { source: { id: 7 } } }] }), ['fs_a', 'fs_b']);
  assert.deepEqual(fileRefSources(null), []);
});

test('the owner reads their source; an id alone gives nobody else anything', async t => {
  const { env, request, source } = setup(t);
  source('fs_mine');
  assert.equal((await authorizeFileSource(request('owner'), env, 'fs_mine')).via, 'owner');
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_mine')).status, 404, 'another account, by id');
  assert.equal((await authorizeFileSource(request(null), env, 'fs_mine')).status, 401, 'signed out: sign in');
  assert.equal((await authorizeFileSource(request('owner'), env, 'fs_none')).status, 404);
  source('fs_gone', 'deleted');
  assert.equal((await authorizeFileSource(request('owner'), env, 'fs_gone')).status, 404, 'a deleted source is not served');
});

test('a link viewer reads a source its board references, not any other; revoking the link revokes it', async t => {
  const { env, request, call, source } = setup(t);
  source('fs_shown'); source('fs_private');
  const links = (await call('POST', `${OWN}/share`, 'owner', { shared: true, view: true, state: { ...STATE, blocks: [card('fs_shown')] } })).sharing;
  const viaLink = await authorizeFileSource(request('friend'), env, 'fs_shown', { token: links.view });
  assert.equal(viaLink.via, 'link', 'the complete original is readable through the board that shows it');
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_private', { token: links.view })).status, 404, 'another file of the same owner');
  assert.equal((await authorizeFileSource(request(null), env, 'fs_shown', { token: links.view })).status, 401, 'not public: sign in');
  await call('POST', `${OWN}/share`, 'owner', { shared: false });
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_shown', { token: links.view })).status, 404, 'sharing off');
});

test('through an authorized board row (a fork, a member board): only sources its saved state references', async t => {
  const { env, request, source } = setup(t);
  source('fs_forked');
  const fork = { id: 'b2', state_json: JSON.stringify({ ...STATE, blocks: [card('fs_forked')] }) };
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_forked', { row: fork })).via, 'board', 'a fork reuses the immutable bytes by its own reference');
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_forked', { row: { id: 'b3', state_json: '{"blocks":[]}' } })).status, 404, 'the reference removed');
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_forked', { row: { id: 'b4', state_json: 'not json' } })).status, 404);
});
