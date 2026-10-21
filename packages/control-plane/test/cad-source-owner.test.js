// Saved CAD Python is owner-only at the file endpoint (CAD decision 9): share links, forks and other board references
// still reach the geometry derivatives, never the source. Real SQLite routes; in-memory R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { filesFetch } from '../src/learn-files.js';
import { fileJobsRoute } from '../src/file-jobs.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' } };
const OWN = '/api/learn/boards/demo-app/main';
const CAD = 'fs_0123456789abcdef01234567', CLIP = 'fs_89abcdef0123456789abcdef', STEP = 'fd_0123456789abcdef01234567';
const state = blocks => ({ blocks, shapes: [], items: [], links: [], strokes: [], exchanges: [] });

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS canvases (id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, device_id TEXT, UNIQUE(org,name))`);
  const CONTROL_PLANE = { fetch: async request => {
    const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
    if (!who) return new Response('sign in', { status: 401 });
    const path = new URL(request.url).pathname;
    if (path === '/api/me') return Response.json(who);
    if (path === '/api/apps/demo-app' && who === PEOPLE.owner) return Response.json({ name: 'demo-app', ...who });
    return new Response('no', { status: 404 });
  } };
  const objects = new Map([[`file-sources/${CAD}/original`, new TextEncoder().encode('from cad_params import value\n# private source\n')], [`file-sources/${CLIP}/original`, new Uint8Array(10)], [`file-sources/${CAD}/d/${STEP}`, new TextEncoder().encode('ISO-10303-21;')]]);
  const LEARN_MEDIA = { get: async key => objects.has(key) ? { body: objects.get(key), size: objects.get(key).byteLength } : null, put: async () => {}, head: async () => null, delete: async () => {}, list: async () => ({ objects: [] }) };
  const insert = (id, family, name, type, bytes) => sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, 'team', 'owner@test', 'demo-app', ?, ?, ?, ?, ?, ?, 'stored', 1)`).run(id, family, name, type, bytes, family.padEnd(64, '0').slice(0, 64), `file-sources/${id}/original`);
  insert(CAD, 'cad', 'model.py', 'text/plain', objects.get(`file-sources/${CAD}/original`).byteLength);
  insert(CLIP, 'video', 'clip.mp4', 'video/mp4', 10);
  sqlite.prepare(`INSERT INTO file_derivatives (id, source_id, source_sha256, kind, name, converter, converter_version, options_hash, status, media_type, bytes, sha256, r2_key, coverage_json, created_at, updated_at)
    VALUES (?, ?, ?, 'step', 'model.step', 'cad-execute', '0.7.21', 'cr_1', 'ready', 'model/step', 13, ?, ?, '{}', 1, 1)`).run(STEP, CAD, 'cad'.padEnd(64, '0'), 'a'.repeat(64), `file-sources/${CAD}/d/${STEP}`);
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, FILE_JOBS: {} };
  const call = async (method, path, as, body) => {
    const request = new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = /\/d\/fd_/.test(path) ? await fileJobsRoute(new URL(request.url).pathname, request, env) : path.startsWith('/api/learn/files') ? await filesFetch(request, env) : await learnBoardsRoute(path, request, env);
    return { status: response.status, body: (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text() };
  };
  const rowOf = (org, email, app) => sqlite.prepare("SELECT * FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").get(org, email, app);
  return { call, rowOf };
}
const cadCard = { id: 'cad-card', type: 'cad', jobId: 'private-job', modelId: 'm', revisionId: 'cr_1', status: 'ready', fileRef: { source: { id: CAD } },
  manifest: { schema: 'cad-model/1', revisionId: 'cr_1', sourceId: CAD, artifacts: [{ kind: 'source', url: `/api/learn/files/${CAD}` }, { kind: 'step', url: `/api/learn/files/${CAD}/d/${STEP}` }] } };
const clipCard = { id: 'clip', type: 'file', kind: 'clip', fileRef: { v: 1, source: { id: CLIP, rev: 'x' } } };

test('CAD source: owner reads it; a share-link viewer gets 404 for the source but keeps the geometry', async t => {
  const f = setup(t);
  assert.equal((await f.call('PUT', OWN, 'owner', { state: state([cadCard, clipCard]) })).status, 200);
  const owner = await f.call('GET', `/api/learn/files/${CAD}`, 'owner');
  assert.equal(owner.status, 200); assert.match(owner.body, /private source/);
  assert.equal((await f.call('GET', `/api/learn/files/${CAD}?app=demo-app&board=main`, 'owner')).status, 200, 'the owner through their own board');
  const links = (await f.call('POST', `${OWN}/share`, 'owner', { shared: true, view: true })).body.sharing;
  const viewer = await f.call('GET', `/api/learn/files/${CAD}?share=${links.view}`, 'friend');
  assert.equal(viewer.status, 404); assert.doesNotMatch(JSON.stringify(viewer.body), /private source/);
  assert.equal((await f.call('GET', `/api/learn/files/${CAD}?share=${links.view}`)).status, 401, 'signed out: sign in, then still owner-only');
  assert.equal((await f.call('GET', `/api/learn/files/${CAD}/d/${STEP}?share=${links.view}`, 'friend')).status, 200, 'shared geometry still downloads');
  assert.equal((await f.call('GET', `/api/learn/files/${CLIP}?share=${links.view}`, 'friend')).status, 200, 'other file families unchanged');
});

test('CAD source: a fork inherits geometry references but never the original owner\'s Python', async t => {
  const f = setup(t);
  await f.call('PUT', OWN, 'owner', { state: state([cadCard]) });
  const links = (await f.call('POST', `${OWN}/share`, 'owner', { shared: true, view: true })).body.sharing;
  const forked = await f.call('POST', '/api/learn/boards/fork', 'friend', { source: { token: links.view }, request_id: 'cad-src-fork' });
  assert.equal(forked.status, 201, JSON.stringify(forked.body));
  const fork = f.rowOf('elsewhere', 'friend@elsewhere', forked.body.name);
  assert.ok(fork, 'fork board exists');
  const through = `app=${encodeURIComponent(forked.body.name)}&board=main`;
  assert.equal((await f.call('GET', `/api/learn/files/${CAD}/d/${STEP}?${through}`, 'friend')).status, 200, 'the fork keeps its geometry');
  assert.equal((await f.call('GET', `/api/learn/files/${CAD}?${through}`, 'friend')).status, 404, 'but not the source');
});
