// The owner's browser-extracted text of an imported file (learn-file-text.js; canvas-file-imports.md section 10): stored as
// the source's `text` derivative, owner only, shape-checked, capped at 2 MiB, one row per extraction. The setup is
// learn-files.test.js's (node:sqlite with the 0023 tables, an in-memory R2, the stub control plane).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { filesFetch } from '../src/learn-files.js';
import { fileTextFetch, fileTextRoute, textBody } from '../src/learn-file-text.js';
import { unitsOf } from '../src/file-context.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team', user_id: 'u-owner' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' }, stranger: { email: 'who@else', org: 'other' }, member: { email: 'member@test', org: 'members', user_id: 'u-member' } };
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
    const response = path.split('?')[0].endsWith('/text') ? await fileTextFetch(request, env) : path.startsWith('/api/learn/files') ? await filesFetch(request, env) : await learnBoardsRoute(path, request, env);
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

const BODY = { v: 1, units: [{ loc: { start: 1, end: 2 }, text: 'line one\nline two' }, { loc: { sheet: 'Q1', cells: 'A1:E4' }, text: 'a\tb' }, { loc: { slide: 2 }, text: 'Slide 2' }, { loc: { rows: [1, 4] }, text: 'id' }, { loc: { cell: 'c1' }, text: '[code cell]' }, { loc: null, text: 'all' }], complete: false, limited: 'rows 1-4 of 9' };
const text = id => `/api/learn/files/${id}/text`;

test('the route is /api/learn/files/<source>/text only', () => {
  assert.ok(fileTextRoute('/api/learn/files/fs_0123456789abcdef01234567/text'));
  for (const path of ['/api/learn/files/fs_0123456789abcdef01234567', '/api/learn/files/jobs/fj_1/text', '/api/learn/files/fs_1/text']) assert.ok(!fileTextRoute(path), path);
});

test('the owner stores the extracted text as a ready text derivative; the same body again is one row', async t => {
  const { call, saveBoard, store, objects, sqlite } = setup(t);
  await saveBoard(STATE);
  const id = (await store(webm(500))).body.source.id;
  const first = await call('PUT', text(id), { as: 'owner', body: { ...BODY, extractor: 'lane2-1', options: { maxRows: 10000 } } });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body.derivative.coverage, { text: 'partial', units: 6, limited: 'rows 1-4 of 9' });
  const row = sqlite.prepare("SELECT * FROM file_derivatives WHERE source_id = ?").get(id);
  assert.deepEqual([row.kind, row.converter, row.converter_version, row.status, row.media_type, row.name], ['text', 'browser-extract', 'browser-extract/lane2-1', 'ready', 'application/json', 'text.json']);
  assert.equal(row.r2_key, `file-sources/${id}/d/${row.id}`);
  const stored = new TextDecoder().decode(objects.get(row.r2_key).bytes);
  assert.equal(row.sha256, sha(stored), 'the sha256 of the stored body');
  assert.deepEqual(JSON.parse(stored), { v: 1, units: BODY.units, complete: false, limited: 'rows 1-4 of 9' }, 'stored as the contract shape, nothing else');
  assert.deepEqual(unitsOf(stored, 'application/json', null).units.length, 6, 'chat reads it (file-context.js unitsOf)');
  const again = await call('PUT', text(id), { as: 'owner', body: { ...BODY, extractor: 'lane2-1', options: { maxRows: 10000 } } });
  assert.deepEqual([again.status, again.body.unchanged, again.body.derivative.id], [200, true, row.id]);
  const changed = await call('PUT', text(id), { as: 'owner', body: { ...BODY, complete: true, limited: undefined, extractor: 'lane2-1', options: { maxRows: 10000 } } });
  assert.deepEqual([changed.status, changed.body.derivative.id, changed.body.derivative.coverage.text], [200, row.id, 'extracted'], 'the same extraction, a new body: the same row');
  const other = await call('PUT', text(id), { as: 'owner', body: { ...BODY, extractor: 'lane2-1', options: { maxRows: 50 } } });
  assert.equal(other.status, 201, 'other options are another extraction');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM file_derivatives WHERE source_id = ?').get(id).n, 2);
});

test('members, link viewers and strangers get 404; signed out 401', async t => {
  const { call, saveBoard, store, sqlite } = setup(t);
  await saveBoard(STATE);
  const id = (await store(webm(500))).body.source.id;
  await saveBoard({ ...STATE, blocks: [card(id)] });
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true } })).body.sharing;
  assert.equal((await call('GET', `/api/learn/files/${id}?share=${links.view}`, { as: 'friend' })).status, 200, 'the link reads the original');
  assert.equal((await call('PUT', `${text(id)}?share=${links.view}`, { as: 'friend', body: BODY })).status, 404, 'a link viewer');
  const boardId = sqlite.prepare("SELECT id FROM learn_boards WHERE app = 'demo-app'").get().id;
  assert.equal((await call('PUT', `${text(id)}?member=${boardId}`, { as: 'member', body: BODY })).status, 404, 'a member');
  assert.equal((await call('PUT', `${text(id)}?app=demo-app&board=main`, { as: 'stranger', body: BODY })).status, 404, 'a stranger');
  assert.equal((await call('PUT', text('fs_0123456789abcdef01234567'), { as: 'owner', body: BODY })).status, 404, 'no such source');
  assert.equal((await call('PUT', text(id), { body: BODY })).status, 401);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM file_derivatives').get().n, 0);
});

test('a bad shape is 400 and an oversized body 413; nothing is stored', async t => {
  const { call, saveBoard, store, sqlite } = setup(t);
  await saveBoard(STATE);
  const id = (await store(webm(500))).body.source.id;
  for (const bad of [{ ...BODY, v: 2 }, { ...BODY, units: 'x' }, { ...BODY, complete: 'yes' }, { ...BODY, units: [{ loc: { line: 3 }, text: 'x' }] }, { ...BODY, units: [{ loc: { start: 5, end: 2 }, text: 'x' }] },
    { ...BODY, units: [{ loc: { sheet: 'Q1', cells: 'not a range' }, text: 'x' }] }, { ...BODY, units: [{ loc: null }] }, { ...BODY, extractor: 'Bad Name!' }]) {
    assert.equal((await call('PUT', text(id), { as: 'owner', body: bad })).status, 400, JSON.stringify(bad).slice(0, 80));
  }
  assert.equal((await call('PUT', text(id), { as: 'owner', raw: 'not json' })).status, 400);
  const big = { v: 1, units: [{ loc: null, text: 'x'.repeat(2 * MiB) }], complete: true };
  assert.equal((await call('PUT', text(id), { as: 'owner', body: big })).status, 413);
  assert.equal((await call('PUT', text(id), { as: 'owner', raw: JSON.stringify(big), headers: { 'Content-Length': String(3 * MiB) } })).status, 413, 'a declared length over the cap');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM file_derivatives').get().n, 0);
  assert.equal(typeof textBody({ v: 1, units: [], complete: true }), 'object', 'an empty extraction is a valid body');
});
