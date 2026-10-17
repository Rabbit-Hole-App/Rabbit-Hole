// Owner acceptance point 1 across lanes (C:/s/spec/file-imports.md, 2026-10-16 ~7:00 PM PT): a board save cannot manufacture
// file access. A crafted save through the real board route names another user's private source id, with and without its sha,
// and its job; the original (Lane 1 learn-files.js), the job status, the derivative list, one derivative and the extracted
// text derivative (JOBS file-jobs.js) all stay 404 to the crafter, by board, by link signed in and signed out. The same
// reads through the owner's own shared board succeed, so the 404s are the rule and not a broken route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { filesFetch } from '../src/learn-files.js';
import { fileJobsRoute, optionsHash } from '../src/file-jobs.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team', user_id: 'u-owner' }, friend: { email: 'friend@elsewhere', org: 'elsewhere', user_id: 'u-friend' } };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE = 'fs_' + 'a'.repeat(24), JOB = 'fj_' + 'b'.repeat(24), PREVIEW = 'fd_' + 'c'.repeat(24), TEXT = 'fd_' + 'd'.repeat(24);
const ORIGINAL = new TextEncoder().encode('PK private deck'), PDF = new TextEncoder().encode('%PDF-1.7 preview');
const TEXT_BODY = new TextEncoder().encode(JSON.stringify({ v: 1, units: [{ loc: { slide: 1 }, text: 'private words' }], complete: true }));
const X = 'canvas-0a1b2c3d', CRAFT = 'canvas-0f0f0f0f';
const STATE = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('team',?,'owner@test','Owner deck')").run(X);
  sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('elsewhere',?,'friend@elsewhere','Crafted')").run(CRAFT);
  const CONTROL_PLANE = { fetch: async request => {
    const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
    if (!who) return new Response('sign in', { status: 401 });
    return new URL(request.url).pathname === '/api/me' ? Response.json(who) : new Response('no', { status: 404 });
  } };
  const objects = new Map([[`file-sources/${SOURCE}/original/x`, ORIGINAL], [`file-sources/${SOURCE}/d/${PREVIEW}`, PDF], [`file-sources/${SOURCE}/d/${TEXT}`, TEXT_BODY]]);
  const LEARN_MEDIA = { get: async key => (objects.has(key) ? { body: objects.get(key), size: objects.get(key).byteLength, httpMetadata: {} } : null), head: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ objects: [] }) };
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, FILE_JOBS: { idFromName: name => name, get: () => ({ fetch: async () => { throw Error('no dispatch in a read test'); } }) } };
  const rev = sha(ORIGINAL), now = Date.now();
  sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at, stored_at)
    VALUES (?, 'team', 'owner@test', ?, 'presentation', 'deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ?, ?, ?, 'stored', 1, 1)`).run(SOURCE, X, ORIGINAL.byteLength, rev, `file-sources/${SOURCE}/original/x`);
  const call = async (method, path, as, body) => {
    const request = new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = path.startsWith('/api/learn/boards/') ? await learnBoardsRoute(path, request, env) : (await fileJobsRoute(new URL(request.url).pathname, request, env)) || await filesFetch(request, env);
    return { status: response.status, body: (response.headers.get('content-type') || '').includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  };
  return { sqlite, env, call, rev, now };
}
const cardOn = fileRef => ({ id: 'deck', type: 'file', kind: 'presentation', fileRef: { v: 1, ...fileRef } });

test('a crafted save naming another user\u2019s source and job manufactures no access on any file route', async t => {
  const f = setup(t);
  // The owner's board: the real card, saved and shared, with its job and derivatives.
  await f.call('PUT', `/api/learn/boards/${X}/main`, 'owner', { state: STATE });
  const boardX = f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(X).id;
  f.sqlite.prepare(`INSERT INTO file_jobs (id, org, owner_email, app, board_id, card_id, source_id, source_sha256, converter, converter_version, options_json, idempotency_key, state, created_at, updated_at, finished_at)
    VALUES (?, 'team', 'owner@test', ?, ?, 'deck', ?, ?, 'slides', 'slides/1', '{}', 'import:deck:slides', 'ready', 1, 1, 1)`).run(JOB, X, boardX, SOURCE, f.rev);
  const hash = await optionsHash({});
  for (const [id, kind, name, type, bytes] of [[PREVIEW, 'preview', 'preview.pdf', 'application/pdf', PDF], [TEXT, 'text', 'text.json', 'application/json', TEXT_BODY]]) {
    f.sqlite.prepare(`INSERT INTO file_derivatives (id, source_id, source_sha256, kind, name, converter, converter_version, options_hash, status, media_type, bytes, sha256, r2_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'slides', 'slides/1', ?, 'ready', ?, ?, ?, ?, 1, 1)`).run(id, SOURCE, f.rev, kind, name, hash, type, bytes.byteLength, sha(bytes), `file-sources/${SOURCE}/d/${id}`);
  }
  const real = { source: { id: SOURCE, rev: f.rev }, job: JOB };
  await f.call('PUT', `/api/learn/boards/${X}/main`, 'owner', { state: { ...STATE, blocks: [cardOn(real)] }, version: 1 });
  const linkX = (await f.call('POST', `/api/learn/boards/${X}/main/share`, 'owner', { shared: true, view: true })).body.sharing.view;
  const reads = through => [
    ['original', `/api/learn/files/${SOURCE}?${through}`],
    ['job status', `/api/learn/files/jobs/${JOB}?${through}`],
    ['derivative list', `/api/learn/files/sources/${SOURCE}/derivatives?sha=${f.rev}&converter=slides&options=${hash}&${through}`],
    ['preview derivative', `/api/learn/files/${SOURCE}/d/${PREVIEW}?${through}`],
    ['text derivative', `/api/learn/files/${SOURCE}/d/${TEXT}?${through}`],
  ];
  // Control: the friend reads every one through the owner's real link.
  for (const [label, path] of reads(`share=${linkX}`)) assert.equal((await f.call('GET', path, 'friend')).status, 200, `control: ${label} through the owner's link`);
  assert.equal((await f.call('GET', reads(`share=${linkX}`)[2][1], 'friend')).body.derivatives.length, 2);
  await f.call('POST', `/api/learn/boards/${X}/main/share`, 'owner', { shared: false });

  // The crafter's own canvas names the source and the job, without and then with the sha.
  const craftPath = `/api/learn/boards/${CRAFT}/main`;
  const refsBefore = f.sqlite.prepare('SELECT COUNT(*) AS n FROM file_source_refs').get().n;
  let version = null;
  for (const fileRef of [{ source: { id: SOURCE }, job: JOB }, real]) {
    const label = fileRef.source.rev ? 'with the sha' : 'without the sha';
    const saved = await f.call('PUT', craftPath, 'friend', { state: { ...STATE, blocks: [cardOn(fileRef)] }, ...(version ? { version } : {}) });
    assert.equal(saved.status, 200, `the crafted save is an ordinary save (${label})`);
    version = saved.body.version;
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM file_source_refs').get().n, refsBefore, `no reference row (${label})`);
    const craftLink = (await f.call('POST', `${craftPath}/share`, 'friend', { shared: true, view: true, public_view: true })).body.sharing.view;
    for (const [through, who] of [[`app=${CRAFT}&board=main`, 'friend'], [`share=${craftLink}`, 'friend'], [`share=${craftLink}`, null], ['', 'friend']]) {
      for (const [what, path] of reads(through)) assert.equal((await f.call('GET', path, who)).status, 404, `${what} via ${through || 'id alone'} as ${who || 'signed out'} (${label})`);
    }
  }
});
