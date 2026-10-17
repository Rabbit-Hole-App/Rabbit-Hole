// Imported file sources (learn-files.js; canvas-file-imports.md sections 4.1-4.2) on node:sqlite with the 0023 tables and an
// in-memory R2, behind the stub control plane learn-boards.test.js uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { filesFetch, filesRoute } from '../src/learn-files.js';

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
    // As R2: a stream is read whole, a declared sha256 is verified, and a failed put stores nothing.
    put: async (key, body, { httpMetadata, sha256 }) => { const bytes = new Uint8Array(body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body); if (sha256 && sha(bytes) !== sha256) throw new Error('put: The SHA-256 checksum you specified did not match what we received.'); objects.set(key, { bytes, httpMetadata }); },
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
  return { call, saveBoard, store, objects, sqlite, env };
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

test('canvas members: an active member reads through ?member=, a removed member gets 404, and no member adds files', async t => {
  const { call, store, sqlite } = setup(t);
  const CANVAS = 'canvas-0a1b2c3d', MAIN = `/api/learn/boards/${CANVAS}/main`;
  sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('team',?,'owner@test','Board')").run(CANVAS);
  await call('PUT', MAIN, { as: 'owner', body: { state: STATE } });
  const bytes = webm(700);
  const id = (await store(bytes, { app: CANVAS })).body.source.id;
  const boardId = sqlite.prepare("SELECT id FROM learn_boards WHERE app = ?").get(CANVAS).id;
  await call('PUT', MAIN, { as: 'owner', body: { state: { ...STATE, blocks: [card(id)] } } });
  sqlite.prepare("INSERT INTO canvas_members(id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES('m1', 'team', ?, 'member@test', 'u-member', 'member@test', 'active', 'sent', 'u-owner', 1, 9999999999999)").run(CANVAS);
  const read = await call('GET', `/api/learn/files/${id}?member=${boardId}`, { as: 'member' });
  assert.deepEqual([read.status, sha(read.body)], [200, sha(bytes)], 'an active member reads the original');
  assert.equal((await call('GET', `/api/learn/files/${id}?member=${boardId}`, { as: 'stranger' })).status, 404, 'not a member');
  assert.equal((await call('GET', `/api/learn/files/${id}`, { as: 'member' })).status, 404, 'a member by id alone');
  const declare = { app: CANVAS, board: 'main', name: 'b.webm', type: 'video/webm', size: 10, sha256: 'b'.repeat(64), family: 'video', member: boardId };
  const refused = await call('POST', '/api/learn/files', { as: 'member', body: declare });
  assert.equal(refused.status, 403, 'members view a canvas and never edit it, so they add no files');
  assert.equal((await call('POST', '/api/learn/files', { as: 'owner', body: declare })).status, 201, 'the owner may name their own member board');
  sqlite.prepare("UPDATE canvas_members SET status = 'removed', ended_at = 2 WHERE id = 'm1'").run();
  assert.equal((await call('GET', `/api/learn/files/${id}?member=${boardId}`, { as: 'member' })).status, 404, 'a removed member');
  assert.equal((await call('POST', '/api/learn/files', { as: 'member', body: declare })).status, 404);
});

test('a source upload does not stop its card indexing: saving the card after the upload authorizes the board', async t => {
  const { call, saveBoard, store, sqlite } = setup(t);
  await saveBoard(STATE);
  const id = (await store(webm(300))).body.source.id;
  await saveBoard({ ...STATE, blocks: [card(id)] });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM file_source_refs WHERE source_id = ?').get(id).n, 1);
});

test('a fileRef is not a board file: the browser never uploads it as one and a fork never copies its bytes', async () => {
  const { boardAssetKeys } = await import('../src/learn-boards.js');
  const { assetKeysOf } = await import('../../web/src/learn-board-assets.js');
  const state = { blocks: [card('fs_0123456789abcdef01234567'), { id: 'v', type: 'file', kind: 'clip', assetKey: 'drop:1' }] };
  assert.deepEqual(assetKeysOf(state), ['drop:1']);
  assert.deepEqual(boardAssetKeys(state), ['drop:1']);
});

// ---- Owner acceptance points 1 and 2 (C:/s/spec/file-imports.md, 2026-10-16 ~7:00 PM PT; contract section 4.1) ----
const CANVAS_X = 'canvas-0a1b2c3d', MAIN_X = `/api/learn/boards/${CANVAS_X}/main`;
const refsOf = sqlite => sqlite.prepare('SELECT source_id, board_id FROM file_source_refs ORDER BY source_id, board_id').all().map(r => `${r.source_id}@${r.board_id}`);
const MEMBER_ROW = "INSERT INTO canvas_members(id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES('m1', 'team', ?, 'member@test', 'u-member', 'member@test', 'active', 'sent', 'u-owner', 1, 9999999999999)";
async function canvasWithFiles(f, sizes) {
  f.sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('team',?,'owner@test','Board X')").run(CANVAS_X);
  await f.call('PUT', MAIN_X, { as: 'owner', body: { state: STATE } });
  const ids = [];
  for (const size of sizes) ids.push((await f.store(webm(size), { app: CANVAS_X })).body.source.id);
  return { ids, boardId: f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(CANVAS_X).id };
}
const saveVersioned = async (f, path, as, state) => {
  const version = (await f.call('GET', path, { as })).body.version;
  return f.call('PUT', path, { as, body: { state, version } });
};

test('acceptance 1: a crafted save naming another user\u2019s private source, with or without its sha, creates no reference and no access', async t => {
  const f = setup(t);
  const { ids: [secret] } = await canvasWithFiles(f, [800]);
  const rev = f.sqlite.prepare('SELECT sha256 FROM file_sources WHERE id = ?').get(secret).sha256;
  const FRIEND = 'canvas-0f0f0f0f', path = `/api/learn/boards/${FRIEND}/main`;
  f.sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('elsewhere',?,'friend@elsewhere','Crafted')").run(FRIEND);
  const before = refsOf(f.sqlite);
  for (const fileRef of [{ v: 1, source: { id: secret } }, { v: 1, source: { id: secret, rev } }]) {
    const label = fileRef.source.rev ? 'with the sha' : 'without the sha';
    const saved = await f.call('PUT', path, { as: 'friend', body: { state: { ...STATE, blocks: [{ id: 'evil', type: 'file', kind: 'clip', fileRef }] } } });
    assert.equal(saved.status, 200, 'the save itself is an ordinary save');
    assert.deepEqual(refsOf(f.sqlite), before, `no reference row (${label})`);
    assert.equal((await f.call('GET', `/api/learn/files/${secret}?app=${FRIEND}&board=main`, { as: 'friend' })).status, 404, `the original through the crafted board (${label})`);
    const links = (await f.call('POST', `${path}/share`, { as: 'friend', body: { shared: true, view: true, public_view: true } })).body.sharing;
    assert.equal((await f.call('GET', `/api/learn/files/${secret}?share=${links.view}`, { as: 'stranger' })).status, 404, `nor through a link the crafter shares (${label})`);
    assert.equal((await f.call('GET', `/api/learn/files/${secret}?share=${links.view}`)).status, 404, `nor signed out on a public link (${label})`);
    assert.equal((await f.call('GET', `/api/learn/files/${secret}`, { as: 'friend' })).status, 404, `nor by id (${label})`);
  }
});

test('acceptance 1: a fork indexes only sources its source board held; a later save of the fork adds no foreign id', async t => {
  const f = setup(t);
  const { ids: [onX, offX, laterX], boardId } = await canvasWithFiles(f, [300, 400, 500]);
  await saveVersioned(f, MAIN_X, 'owner', { ...STATE, blocks: [card(onX), card(laterX)] });
  const links = (await f.call('POST', `${MAIN_X}/share`, { as: 'owner', body: { shared: true, view: true } })).body.sharing;
  f.sqlite.prepare(MEMBER_ROW).run(CANVAS_X);
  const forked = await f.call('POST', '/api/learn/boards/fork', { as: 'member', body: { source: { token: links.view } } });
  assert.equal(forked.status, 201, JSON.stringify(forked.body));
  const forkPath = `/api/learn/boards/${forked.body.name}/main`;
  const forkId = f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(forked.body.name).id;
  assert.deepEqual(refsOf(f.sqlite).filter(ref => ref.endsWith(`@${forkId}`)).sort(), [`${laterX}@${forkId}`, `${onX}@${forkId}`].sort(), 'inherited from X');
  // The member edits the fork: drops laterX, adds offX (X never showed it), then re-adds laterX.
  await saveVersioned(f, forkPath, 'member', { ...STATE, blocks: [card(onX), card(offX)] });
  await saveVersioned(f, forkPath, 'member', { ...STATE, blocks: [card(onX), card(offX), card(laterX)] });
  assert.deepEqual(refsOf(f.sqlite).filter(ref => ref.endsWith(`@${forkId}`)), [`${onX}@${forkId}`], 'no new foreign id, and a dropped one does not come back');
  for (const [id, status] of [[onX, 200], [offX, 404], [laterX, 404]]) assert.equal((await f.call('GET', `/api/learn/files/${id}?app=${forked.body.name}&board=main`, { as: 'member' })).status, status, id);
  assert.ok(refsOf(f.sqlite).includes(`${laterX}@${boardId}`), 'X keeps its own reference');
});

test('acceptance 2: a fork keeps its files after the link is revoked and after the original is deleted; a removed member keeps only the fork', async t => {
  const f = setup(t);
  const { ids: [shown], boardId } = await canvasWithFiles(f, [600]);
  await saveVersioned(f, MAIN_X, 'owner', { ...STATE, blocks: [card(shown)] });
  const links = (await f.call('POST', `${MAIN_X}/share`, { as: 'owner', body: { shared: true, view: true } })).body.sharing;
  f.sqlite.prepare(MEMBER_ROW).run(CANVAS_X);
  const forked = await f.call('POST', '/api/learn/boards/fork', { as: 'member', body: { source: { token: links.view } } });
  const viaFork = () => f.call('GET', `/api/learn/files/${shown}?app=${forked.body.name}&board=main`, { as: 'member' });
  const viaMember = () => f.call('GET', `/api/learn/files/${shown}?member=${boardId}`, { as: 'member' });
  assert.deepEqual([(await viaFork()).status, (await viaMember()).status], [200, 200]);
  await f.call('POST', `${MAIN_X}/share`, { as: 'owner', body: { shared: false } });
  assert.equal((await f.call('GET', `/api/learn/files/${shown}?share=${links.view}`, { as: 'member' })).status, 404, 'the revoked link reads nothing');
  assert.equal((await viaFork()).status, 200, 'the fork keeps its files after the link is revoked');
  f.sqlite.prepare("UPDATE canvas_members SET status = 'removed', ended_at = 2 WHERE id = 'm1'").run();
  assert.equal((await viaMember()).status, 404, 'removing the member blocks the member path');
  assert.equal((await viaFork()).status, 200, 'the same user\u2019s own fork still reads');
  // Permanent delete of the original (an untouched canvas, canvases.js DELETE): its rows go, the fork still reads.
  const { canvasesFetch } = await import('../src/canvases.js');
  const deleted = await canvasesFetch(new Request(`https://dev.test/api/apps/${CANVAS_X}`, { method: 'DELETE', headers: { cookie: 'small_session=owner' } }), f.env);
  assert.equal(deleted.status, 200, await deleted.clone().text());
  assert.ok(!refsOf(f.sqlite).some(ref => ref.endsWith(`@${boardId}`)), 'the original rows are gone');
  assert.equal((await viaFork()).status, 200, 'the fork still reads the immutable bytes');
});

test('on the Workers path the body streams to R2 with its length and R2 checks the sha256; nothing is hashed or held in JavaScript', async t => {
  const { call, saveBoard, objects } = setup(t);
  globalThis.FixedLengthStream = class extends TransformStream { constructor(length) { let seen = 0; super({ transform(chunk, controller) { seen += chunk.byteLength; if (seen > length) throw new TypeError('more bytes than the stream length'); controller.enqueue(chunk); }, flush() { if (seen !== length) throw new TypeError('fewer bytes than the stream length'); } }); } };
  t.after(() => { delete globalThis.FixedLengthStream; });
  await saveBoard(STATE);
  const bytes = webm(5 * MiB);
  const made = await call('POST', '/api/learn/files', { as: 'owner', body: { app: 'demo-app', name: 's.webm', type: 'video/webm', size: bytes.byteLength, sha256: sha(bytes), family: 'video' } });
  const url = made.body.upload.url, length = { 'Content-Length': String(bytes.byteLength) };
  const tampered = webm(5 * MiB); tampered[4 * MiB] ^= 1;
  assert.equal((await call('PUT', url, { as: 'owner', raw: tampered, headers: length })).status, 400, 'R2 refuses the wrong sha256');
  assert.equal((await call('PUT', url, { as: 'owner', raw: webm(5 * MiB + 1), headers: length })).status, 400, 'more bytes than declared');
  const short = await call('PUT', url, { as: 'owner', raw: webm(MiB), headers: length });
  assert.deepEqual([short.status, typeof short.body.error], [400, 'string'], 'a Content-Length larger than the body: a JSON 400, not a hang');
  assert.equal(objects.size, 0);
  const stored = await call('PUT', url, { as: 'owner', raw: bytes, headers: length });
  assert.deepEqual([stored.status, stored.body.source.status], [200, 'stored']);
  assert.equal(sha([...objects.values()][0].bytes), sha(bytes));
});
