// Imported file sources (learn-files.js; canvas-file-imports.md sections 4.1-4.2) on node:sqlite with the 0023 tables and an
// in-memory R2, behind the stub control plane learn-boards.test.js uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { filesFetch, filesRoute } from '../src/learn-files.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' }, stranger: { email: 'who@else', org: 'other' } };
const OWN = '/api/learn/boards/demo-app/main';
const MiB = 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const webm = size => { const bytes = new Uint8Array(size).map((_, i) => i % 251); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); return bytes; };
const STATE = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
const card = id => ({ id: `c-${id}`, type: 'file', kind: 'clip', fileRef: { v: 1, source: { id, rev: 'x' } } });

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
  const objects = new Map();
  const LEARN_MEDIA = {
    put: async (key, body, { httpMetadata }) => { objects.set(key, { bytes: new Uint8Array(body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body), httpMetadata }); },
    get: async (key, options) => {
      const object = objects.get(key);
      if (!object) return null;
      const { offset = 0, length = object.bytes.byteLength - offset } = options?.range || {};
      return { body: object.bytes.slice(offset, offset + length), size: object.bytes.byteLength, httpMetadata: object.httpMetadata };
    },
    head: async key => (objects.has(key) ? { size: objects.get(key).bytes.byteLength } : null),
    delete: async key => { objects.delete(key); },
    list: async () => ({ objects: [] }),
  };
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA };
  const call = async (method, path, { as, body, raw, headers = {} } = {}) => {
    const init = { method, headers: { ...(raw === undefined ? { 'Content-Type': 'application/json' } : {}), ...headers, ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) };
    const request = new Request(`https://dev.test${path}`, init);
    const response = path.startsWith('/api/learn/files') ? await filesFetch(request, env) : await learnBoardsRoute(path, request, env);
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  };
  const saveBoard = state => call('PUT', OWN, { as: 'owner', body: { state } });
  // A stored source: create, then upload.
  const store = async (bytes, extra = {}) => {
    const made = await call('POST', '/api/learn/files', { as: 'owner', body: { app: 'demo-app', board: 'main', name: 'clip.webm', type: 'video/webm', size: bytes.byteLength, sha256: sha(bytes), family: 'video', ...extra } });
    if (made.body.upload) assert.equal((await call('PUT', made.body.upload.url, { as: 'owner', raw: bytes, headers: { 'Content-Length': String(bytes.byteLength) } })).status, 200);
    return made;
  };
  return { call, saveBoard, store, objects, sqlite };
}

test('only /api/learn/files and /api/learn/files/fs_* are this module, so the JOBS routes sit beside it', () => {
  assert.ok(filesRoute('/api/learn/files') && filesRoute('/api/learn/files/fs_0123456789abcdef01234567'));
  for (const path of ['/api/learn/files/jobs/fj_1', '/api/learn/files/sources/fs_1/derivatives', '/api/learn/files/fs_1/extra']) assert.ok(!filesRoute(path), path);
});

test('the owner creates, uploads and downloads a source; identical bytes are reused, not uploaded again', async t => {
  const { call, saveBoard, store, objects } = setup(t);
  await saveBoard(STATE);
  const bytes = webm(3 * MiB);
  const made = await store(bytes);
  assert.equal(made.status, 201);
  assert.match(made.body.source.id, /^fs_[0-9a-f]{24}$/);
  assert.equal(made.body.source.rev, sha(bytes), 'the immutable revision is the sha256');
  const got = await call('GET', `/api/learn/files/${made.body.source.id}`, { as: 'owner' });
  assert.equal(got.status, 200);
  assert.equal(sha(got.body), sha(bytes), 'the original, byte for byte');
  assert.equal(got.headers.get('content-type'), 'video/webm');
  assert.match(got.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''clip\.webm$/);
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  const part = await call('GET', `/api/learn/files/${made.body.source.id}`, { as: 'owner', headers: { Range: 'bytes=10-19' } });
  assert.deepEqual([part.status, part.headers.get('content-range'), [...part.body]], [206, `bytes 10-19/${bytes.byteLength}`, [...bytes.slice(10, 20)]]);
  const again = await call('POST', '/api/learn/files', { as: 'owner', body: { app: 'demo-app', board: 'main', name: 'copy.webm', type: 'video/webm', size: bytes.byteLength, sha256: sha(bytes), family: 'video' } });
  assert.deepEqual([again.status, again.body.source.id, again.body.upload], [200, made.body.source.id, null], 'owner-scoped reuse');
  assert.equal(objects.size, 1);
});

test('an unfinished upload resumes under its id; wrong bytes, a wrong count or a non-video are never stored', async t => {
  const { call, saveBoard, objects } = setup(t);
  await saveBoard(STATE);
  const bytes = webm(1000);
  const declare = () => call('POST', '/api/learn/files', { as: 'owner', body: { app: 'demo-app', name: 'a.webm', type: 'video/webm', size: 1000, sha256: sha(bytes), family: 'video' } });
  const first = await declare(), second = await declare();
  assert.equal(second.body.source.id, first.body.source.id, 'the same upload, resumed');
  const url = first.body.upload.url;
  const tampered = webm(1000); tampered[500] ^= 1;
  assert.equal((await call('PUT', url, { as: 'owner', raw: tampered })).status, 400, 'sha256 mismatch');
  assert.equal((await call('PUT', url, { as: 'owner', raw: webm(999) })).status, 400, 'too few bytes');
  assert.equal((await call('PUT', url, { as: 'owner', raw: webm(1001) })).status, 413, 'more bytes than declared, no Content-Length');
  assert.equal((await call('PUT', url, { as: 'owner', raw: webm(1001), headers: { 'Content-Length': '1001' } })).status, 413, 'declared too many');
  assert.equal(objects.size, 0);
  assert.equal((await call('GET', `/api/learn/files/${first.body.source.id}`, { as: 'owner' })).status, 404, 'not stored yet');
  assert.equal((await call('PUT', url, { as: 'friend', raw: bytes })).status, 404, 'only its owner uploads');
  assert.equal((await call('PUT', url, { as: 'owner', raw: bytes })).status, 200);
  assert.equal(objects.size, 1);
  const fake = new Uint8Array(1000);
  const notVideo = await call('POST', '/api/learn/files', { as: 'owner', body: { app: 'demo-app', name: 'b.webm', type: 'video/webm', size: 1000, sha256: sha(fake), family: 'video' } });
  assert.equal((await call('PUT', notVideo.body.upload.url, { as: 'owner', raw: fake })).status, 415);
});

test('create refuses what the registry refuses, and needs the board owner', async t => {
  const { call, saveBoard } = setup(t);
  const body = { app: 'demo-app', board: 'main', name: 'a.webm', type: 'video/webm', size: 10, sha256: 'a'.repeat(64), family: 'video' };
  assert.equal((await call('POST', '/api/learn/files', { as: 'owner', body })).status, 404, 'no board row yet');
  await saveBoard(STATE);
  assert.equal((await call('POST', '/api/learn/files', { as: 'owner', body: { ...body, size: 50 * MiB + 1 } })).status, 413);
  assert.equal((await call('POST', '/api/learn/files', { as: 'owner', body: { ...body, size: 50 * MiB } })).status, 201, 'exactly the video cap');
  assert.equal((await call('POST', '/api/learn/files', { as: 'owner', body: { ...body, family: 'nope' } })).status, 400);
  assert.equal((await call('POST', '/api/learn/files', { as: 'owner', body: { ...body, sha256: 'XYZ' } })).status, 400);
  assert.equal((await call('POST', '/api/learn/files', { as: 'owner', body: { ...body, family: 'workbook', size: 25 * MiB + 1 } })).status, 413, 'an unmeasured family keeps the 25 MiB board file cap');
  assert.equal((await call('POST', '/api/learn/files', { as: 'friend', body })).status, 404, 'not their app');
  assert.equal((await call('POST', '/api/learn/files', { body })).status, 401);
});

test('a stranger gets 404 by id; a link viewer reads only what the board shows, until the link is revoked', async t => {
  const { call, saveBoard, store } = setup(t);
  await saveBoard(STATE);
  const shown = (await store(webm(500))).body.source.id;
  const hidden = (await store(webm(600))).body.source.id;
  for (const as of ['stranger', 'friend']) assert.equal((await call('GET', `/api/learn/files/${shown}`, { as })).status, 404, `${as} by id alone`);
  assert.equal((await call('GET', `/api/learn/files/${shown}`)).status, 401);
  await saveBoard({ ...STATE, blocks: [card(shown)] });
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true } })).body.sharing;
  const viewed = await call('GET', `/api/learn/files/${shown}?share=${links.view}`, { as: 'friend' });
  assert.equal(viewed.status, 200, 'the whole original, through the board that shows it');
  assert.equal(viewed.body.byteLength, 500);
  assert.equal((await call('GET', `/api/learn/files/${shown}?share=${links.view}`, { as: 'friend', headers: { Range: 'bytes=0-9' } })).status, 206);
  assert.equal((await call('GET', `/api/learn/files/${hidden}?share=${links.view}`, { as: 'friend' })).status, 404, 'another file of the owner');
  assert.equal((await call('GET', `/api/learn/files/${shown}?share=bad-token-0000000000000`, { as: 'friend' })).status, 404);
  await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: false } });
  assert.equal((await call('GET', `/api/learn/files/${shown}?share=${links.view}`, { as: 'friend' })).status, 404, 'revoked with the link');
  assert.equal((await call('GET', `/api/learn/files/${shown}?app=demo-app&board=main`, { as: 'friend' })).status, 404, 'not their board');
});

test('the owner reads through their own board too, and only a source that board references', async t => {
  const { call, saveBoard, store } = setup(t);
  await saveBoard(STATE);
  const id = (await store(webm(400))).body.source.id;
  assert.equal((await call('GET', `/api/learn/files/${id}?app=demo-app&board=main`, { as: 'owner' })).status, 404, 'the board does not reference it');
  await saveBoard({ ...STATE, blocks: [card(id)] });
  assert.equal((await call('GET', `/api/learn/files/${id}?app=demo-app&board=main`, { as: 'owner' })).status, 200);
});
