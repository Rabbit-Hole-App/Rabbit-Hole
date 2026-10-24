// Comment attachments (docs/features/canvas-comments.md section 15, owner decision D3, 2026-10-23; migration 0031) through the
// routes the app worker serves, on the shared-canvas fixture with an in-memory LEARN_MEDIA bucket. ana owns the canvas, ben is an
// active member, cara is any other signed-in account. Images and PDFs only; 10 MB a file, 5 a comment, 200 MB a canvas, enforced on
// the server including parallel uploads; every download re-checks current access; deletion revokes at once and cleans the bucket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0031-canvas-comment-attachments.sql', import.meta.url), 'utf8');
const IDS = ['u-ana-5d1e', 'u-ben-9a2b', 'u-cara-71f0'];
const EMAILS = ['ana@test', 'ben@test', 'cara@test'];
const ON_CARD = { kind: 'object', object_id: 'b1', object_kind: 'block', dx: 12, dy: 8, label: 'Why scale by sqrt(d)?' };

// R2 as the routes use it: put (a Uint8Array here), get, delete, list. `failDelete` makes delete throw, as a bucket outage would.
function bucket() {
  const objects = new Map(), state = { failDelete: false };
  return { objects, state,
    put: async (key, body, options) => { objects.set(key, { bytes: new Uint8Array(body), type: options?.httpMetadata?.contentType }); },
    get: async key => { const o = objects.get(key); return o ? { body: o.bytes, size: o.bytes.length, httpMetadata: { contentType: o.type } } : null; },
    delete: async key => { if (state.failDelete) throw new Error('bucket down'); objects.delete(key); },
    list: async () => ({ objects: [], truncated: false }) };
}
const png = (n = 64, tag = 0) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); b[n - 1] = tag; return b; };
const pdf = (n = 64) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode('%PDF-1.7\n')); return b; };

async function comments(f, method, path, { as, body } = {}) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  assert.ok(response, `${method} ${path} was not routed`);
  const text = await response.text();
  for (const secret of [...IDS, ...EMAILS]) assert.equal(text.includes(secret), false, `${method} ${path} answered with ${secret}`);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
// The raw upload: the file as the body, its type and name in headers, its length declared as a client declares it.
async function upload(f, base, as, bytes, { type = 'image/png', name = 'plot.png', query = '', length = bytes.length } = {}) {
  const req = new Request(`https://app.test${base}/attachments${query}`, { method: 'POST', headers: { 'Content-Type': type, 'Content-Length': String(length), 'X-File-Name': encodeURIComponent(name), ...(as ? { cookie: `small_session=${as}` } : {}) }, body: bytes });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function download(f, base, as, id) {
  const req = new Request(`https://app.test${base}/attachments/${id}`, { headers: as ? { cookie: `small_session=${as}` } : {} });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) };
}
const handle = (f, email, h, name = null) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name').run(email, name);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};
async function canvas(f, { member = true } = {}) {
  f.bucket = bucket(); f.env.LEARN_MEDIA = f.bucket;
  handle(f, 'ana@test', 'ana', 'Ana Lima'); handle(f, 'ben@test', 'ben', 'Ben Ode'); handle(f, 'cara@test', 'cara');
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention notes' } })).body;
  const saved = await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state: BOARD } });
  if (member) f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m1', 'ana-ws', ?, 'ben@test', 'u-ben-9a2b', 'ben@test', 'active', 'sent', 'u-ana-5d1e', 0, 0)").run(made.name);
  return { name: made.name, boardId: saved.body.board_id, base: `/api/learn/c/${saved.body.board_id}` };
}
const start = (f, base, as, body, extra = {}) => comments(f, 'POST', `${base}/threads`, { as, body: { id: crypto.randomUUID(), anchor: ON_CARD, body, ...extra } });
const reply = (f, base, as, threadId, body, extra = {}) => comments(f, 'POST', `${base}/threads/${threadId}/comments`, { as, body: { id: crypto.randomUUID(), body, ...extra } });
const rows = f => f.sqlite.prepare('SELECT * FROM canvas_comment_attachments ORDER BY created_at, id').all();

test('0031 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name), ['canvas_comment_attachments']);
});

test('D3 types and sizes: images and PDFs by their bytes, 10 MB a file, never SVG or a page, nothing written on a refusal', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const ok = await upload(f, base, 'ana', png(), { name: '../../etc/pass wd.png' });
  assert.equal(ok.status, 201);
  assert.deepEqual(Object.keys(ok.body.attachment).sort(), ['bytes', 'id', 'mime', 'name']);
  assert.equal(ok.body.attachment.name, 'pass wd.png', 'a name is a name, never a path');
  assert.equal((await upload(f, base, 'ana', pdf(), { type: 'application/pdf', name: 'paper.pdf' })).status, 201);
  const before = [rows(f).length, f.bucket.objects.size];
  const refused = [
    ['svg', await upload(f, base, 'ana', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), { type: 'image/svg+xml' }), 'bad_type', 415],
    ['html', await upload(f, base, 'ana', new TextEncoder().encode('<html></html>'), { type: 'text/html' }), 'bad_type', 415],
    ['pdf bytes called png', await upload(f, base, 'ana', pdf(), { type: 'image/png' }), 'bad_file', 415],
    ['png bytes called pdf', await upload(f, base, 'ana', png(), { type: 'application/pdf' }), 'bad_file', 415],
    ['empty', await upload(f, base, 'ana', new Uint8Array(0)), 'empty', 400],
    ['one byte over 10 MB, declared', await upload(f, base, 'ana', png(), { length: 10 * 1024 * 1024 + 1 }), 'file_too_big', 413],
  ];
  for (const [label, got, code, status] of refused) assert.deepEqual([label, got.status, got.body.code], [label, status, code]);
  assert.deepEqual([rows(f).length, f.bucket.objects.size], before, 'a refusal reserves and stores nothing');
  assert.equal((await upload(f, base, 'cara', png())).status, 404, 'a stranger to the canvas');
  assert.equal((await upload(f, base, null, png())).status, 401);
});

test('D3 limits: five a comment, five waiting at a time, and the cap on a post counts what it names', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const ids = [];
  for (let i = 0; i < 5; i += 1) ids.push((await upload(f, base, 'ana', png(64, i))).body.attachment.id);
  const sixth = await upload(f, base, 'ana', png(64, 9));
  assert.deepEqual([sixth.status, sixth.body.code], [429, 'too_many_waiting']);
  assert.equal((await upload(f, base, 'ben', png(64, 9))).status, 201, 'the limit is per person');
  const six = [...ids, crypto.randomUUID()];
  assert.deepEqual([(await start(f, base, 'ana', 'too many', { attachments: six })).status, (await start(f, base, 'ana', 'too many', { attachments: six })).body.code], [413, 'too_many_attachments']);
  assert.equal((await start(f, base, 'ana', 'bad ids', { attachments: ['nope'] })).body.code, 'bad_attachment');
  assert.equal((await start(f, base, 'ana', 'not yours', { attachments: [(rows(f).find(r => r.uploader_id === 'u-ben-9a2b')).id] })).body.code, 'bad_attachment');
  const made = await start(f, base, 'ana', 'five files', { attachments: ids });
  assert.equal(made.status, 201);
  assert.equal(made.body.comment.attachments.length, 5);
  assert.equal((await upload(f, base, 'ana', png(64, 10))).status, 201, 'attached files no longer count as waiting');
});

test('D3 race: parallel uploads cannot pass the canvas cap or the waiting limit together', async t => {
  const f = setup(t, { vars: { COMMENT_ATTACH_CANVAS_BYTES: '100', COMMENT_ATTACH_COMMENT_MAX: '50' } });
  const { base } = await canvas(f);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => upload(f, base, i % 2 ? 'ana' : 'ben', png(40, i))));
  const won = results.filter(r => r.status === 201), lost = results.filter(r => r.status !== 201);
  assert.equal(won.length, 2, `100 bytes hold two 40-byte files: ${results.map(r => r.status)}`);
  assert.deepEqual([...new Set(lost.map(r => r.body.code))], ['canvas_full']);
  assert.ok(rows(f).reduce((sum, r) => sum + r.bytes, 0) <= 100);
  assert.equal(f.bucket.objects.size, 2, 'the refused uploads wrote nothing');
  // The same holds for one person's waiting uploads.
  const g = setup(t, { vars: { COMMENT_ATTACH_COMMENT_MAX: '3' } });
  const other = await canvas(g);
  const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => upload(g, other.base, 'ana', png(40, i))));
  assert.equal(burst.filter(r => r.status === 201).length, 3);
  assert.deepEqual([...new Set(burst.filter(r => r.status !== 201).map(r => r.body.code))], ['too_many_waiting']);
});

test('D3 race: two parallel edits cannot take a comment past its cap', async t => {
  const f = setup(t, { vars: { COMMENT_ATTACH_COMMENT_MAX: '2' } });
  const { base } = await canvas(f);
  const a = (await upload(f, base, 'ana', png(40, 1))).body.attachment.id;
  const made = await start(f, base, 'ana', 'one file', { attachments: [a] });
  const c = (await upload(f, base, 'ana', png(40, 2))).body.attachment.id, d = (await upload(f, base, 'ana', png(40, 3))).body.attachment.id;
  const cid = made.body.comment.id;
  const edits = await Promise.all([[a, c], [a, d]].map(list => comments(f, 'PATCH', `${base}/comments/${cid}`, { as: 'ana', body: { body: 'two files', mentions: [], attachments: list } })));
  assert.deepEqual(edits.map(e => e.status), [200, 200]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comment_attachments WHERE comment_id = ? AND purged_at IS NULL').get(cid).n, 2, 'never more than the cap');
});

test('downloads re-check current access every time: member, stranger, signed out, wrong canvas, a removed member, Allow comments off', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const second = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Another canvas' } })).body;
  const other = { base: `/api/learn/c/${(await f.call('PUT', `/api/learn/boards/${second.name}/main`, { as: 'ana', body: { state: BOARD } })).body.board_id}` };
  const file = (await upload(f, base, 'ana', png(80, 7), { name: 'curve.png' })).body.attachment;
  const thread = await start(f, base, 'ana', 'See the plot', { attachments: [file.id] });
  const tid = thread.body.thread.id;
  assert.deepEqual(thread.body.comment.attachments, [{ id: file.id, name: 'curve.png', mime: 'image/png', bytes: 80 }]);
  assert.doesNotMatch(JSON.stringify(thread.body), /comment-attachments|object_key|uploader/);
  const seen = await download(f, base, 'ben', file.id);
  assert.equal(seen.status, 200);
  assert.deepEqual([seen.headers.get('content-type'), seen.headers.get('x-content-type-options'), seen.headers.get('cache-control'), seen.bytes.length], ['image/png', 'nosniff', 'private, no-store', 80]);
  assert.match(seen.headers.get('content-security-policy'), /sandbox/);
  assert.match(seen.headers.get('content-disposition'), /^inline; filename\*=UTF-8''curve\.png$/);
  assert.equal((await download(f, base, 'cara', file.id)).status, 404, 'a stranger');
  assert.equal((await download(f, base, null, file.id)).status, 401, 'signed out');
  assert.equal((await download(f, base, 'ana', crypto.randomUUID())).status, 404);
  assert.equal((await download(f, base, 'ana', 'not-an-id')).status, 404);
  // The file is the thread's: another canvas's base never serves it.
  assert.equal((await download(f, other.base, 'ana', file.id)).status, 404, 'wrong canvas');
  // Allow comments off still reads (reading never depends on it); ending membership ends access at once.
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { comments_enabled: false } });
  assert.equal((await download(f, base, 'ben', file.id)).status, 200);
  f.sqlite.prepare("UPDATE canvas_members SET status = 'removed'").run();
  assert.equal((await download(f, base, 'ben', file.id)).status, 404, 'a removed member, the next request');
  assert.equal((await comments(f, 'GET', `${base}/threads/${tid}`, { as: 'ben' })).status, 404);
  // A PDF is offered as a download, not shown inside this origin.
  const doc = (await upload(f, base, 'ana', pdf(), { type: 'application/pdf', name: 'paper.pdf' })).body.attachment;
  await reply(f, base, 'ana', tid, 'And the paper', { attachments: [doc.id] });
  assert.match((await download(f, base, 'ana', doc.id)).headers.get('content-disposition'), /^attachment; /);
});

test('a waiting upload is its uploader\'s alone; a thread\'s files follow its audience through the public family', async t => {
  const f = setup(t);
  const { name, base } = await canvas(f);
  const waiting = (await upload(f, base, 'ben', png(50, 1))).body.attachment;
  assert.equal((await download(f, base, 'ben', waiting.id)).status, 200, 'the uploader previews it');
  assert.equal((await download(f, base, 'ana', waiting.id)).status, 404, 'not even the owner before it is posted');
  // Publish, then a members thread's file and a public thread's file.
  await f.call('POST', `/api/learn/boards/${name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } });
  const token = (await f.call('POST', `/api/apps/${name}/publish`, { as: 'ana' })).body.publication_token;
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  const pub = `/api/learn/boards/shared/${token}/comments`;
  const membersFile = (await upload(f, base, 'ana', png(50, 2))).body.attachment;
  await start(f, base, 'ana', 'Members only', { attachments: [membersFile.id] });
  const publicFile = (await upload(f, base, 'ana', png(50, 3), { query: '?audience=public' })).body.attachment;
  await start(f, base, 'ana', 'In public', { audience: 'public', attachments: [publicFile.id] });
  assert.equal((await download(f, pub, 'cara', publicFile.id)).status, 200, 'a signed-in visitor reads a public thread\'s file');
  assert.equal((await download(f, pub, null, publicFile.id)).status, 200, 'and so does a signed-out one on an open publication');
  assert.equal((await download(f, pub, 'cara', membersFile.id)).status, 404, 'a members thread\'s file never crosses to the public family');
  // Posting publicly needs a sign-in, so does uploading a file for it.
  assert.equal((await upload(f, pub, null, png(50, 4))).status, 401);
  assert.equal((await upload(f, pub, 'cara', png(50, 5))).status, 201);
  assert.equal((await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'off' } })).status, 200);
  assert.equal((await download(f, pub, 'cara', publicFile.id)).status, 404, 'a public file after the publication is turned off');
});

test('deleting a comment, an edit that drops a file and deleting a thread revoke at once and clean the bucket; a shared object stays until its last reference', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const objects = () => f.bucket.objects.size;
  const pick = async tag => (await upload(f, base, 'ben', png(64, tag))).body.attachment;
  const [a, b, c] = [await pick(1), await pick(2), await pick(3)];
  const thread = await start(f, base, 'ben', 'three files', { attachments: [a.id, b.id] });
  const tid = thread.body.thread.id, first = thread.body.comment.id;
  const second = (await reply(f, base, 'ben', tid, 'one more', { attachments: [c.id] })).body.comment.id;
  assert.equal(objects(), 3);
  // An edit that leaves b out removes it: access ends at the answer, the object leaves the bucket, the row goes.
  const edited = await comments(f, 'PATCH', `${base}/comments/${first}`, { as: 'ben', body: { body: 'two files, then one', mentions: [], attachments: [a.id] } });
  assert.deepEqual(edited.body.comment.attachments.map(x => x.id), [a.id]);
  assert.equal((await download(f, base, 'ben', b.id)).status, 404);
  assert.deepEqual([objects(), rows(f).length], [2, 2]);
  assert.equal((await comments(f, 'PATCH', `${base}/comments/${first}`, { as: 'ben', body: { body: 'unchanged files', mentions: [] } })).body.comment.attachments.length, 1, 'an edit without a list keeps the files');
  // Deleting the comment revokes and cleans the same way.
  assert.equal((await comments(f, 'DELETE', `${base}/comments/${second}`, { as: 'ben' })).status, 200);
  assert.equal((await download(f, base, 'ana', c.id)).status, 404, 'even the owner, once the comment is deleted');
  assert.deepEqual([objects(), rows(f).length], [1, 1]);
  // A second row naming the same object (a copy) keeps it in the bucket until the last live reference goes.
  const key = rows(f)[0].object_key;
  f.sqlite.prepare("INSERT INTO canvas_comment_attachments (id, org, canvas, uploader_id, object_key, name, mime, bytes, created_at) SELECT 'copy-1', org, canvas, uploader_id, object_key, name, mime, bytes, created_at FROM canvas_comment_attachments LIMIT 1").run();
  assert.equal((await comments(f, 'DELETE', `${base}/threads/${tid}`, { as: 'ana' })).status, 200);
  assert.equal(f.bucket.objects.has(key), true, 'the waiting copy still names the object');
  assert.deepEqual(rows(f).map(r => r.id), ['copy-1']);
  f.sqlite.prepare("UPDATE canvas_comment_attachments SET purged_at = '2026-01-01T00:00:00.000Z'").run();
  await upload(f, base, 'ana', png(64, 20)); // the sweep that follows an upload
  assert.equal(f.bucket.objects.has(key), false, 'gone with the last reference');
  assert.equal(rows(f).filter(r => r.id === 'copy-1').length, 0);
});

test('a bucket outage during cleanup never brings a file back: access is already gone, and the next sweep finishes the job', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const file = (await upload(f, base, 'ben', png(64, 1))).body.attachment;
  const made = await start(f, base, 'ben', 'with a file', { attachments: [file.id] });
  f.bucket.state.failDelete = true;
  const errors = []; t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  assert.equal((await comments(f, 'DELETE', `${base}/comments/${made.body.comment.id}`, { as: 'ben' })).status, 200);
  assert.equal((await download(f, base, 'ben', file.id)).status, 404);
  assert.deepEqual([rows(f).length, f.bucket.objects.size], [1, 1], 'the purged row and its object wait for the sweep');
  assert.match(errors.join('\n'), /comment attachment release failed/);
  f.bucket.state.failDelete = false;
  await upload(f, base, 'ben', png(64, 2));
  assert.deepEqual([rows(f).length, f.bucket.objects.size], [1, 1], 'only the new upload remains');
});

test('uploads nobody attached within the hour are swept and stop counting against the caps', async t => {
  const f = setup(t, { vars: { COMMENT_ATTACH_CANVAS_BYTES: '100' } });
  const { base } = await canvas(f);
  assert.equal((await upload(f, base, 'ben', png(80, 1))).status, 201);
  assert.equal((await upload(f, base, 'ben', png(80, 2))).body.code, 'canvas_full');
  f.sqlite.prepare("UPDATE canvas_comment_attachments SET created_at = ?").run(new Date(Date.now() - 2 * 3600_000).toISOString());
  assert.equal((await upload(f, base, 'ben', png(80, 3))).status, 201);
  assert.equal(rows(f).length, 1);
  assert.equal(f.bucket.objects.size, 1, 'the abandoned object left the bucket');
});

test('deleting a hole or a canvas for good takes its comment files out of the bucket, and only its own', async t => {
  const f = setup(t);
  const parent = await canvas(f);
  const hole = `canvas-${(4660).toString(16).padStart(8, '0')}`;
  assert.equal((await f.call('POST', '/api/canvases/dives', { as: 'ana', body: { name: hole, title: 'Inside', parent: { app: parent.name, board: 'main' }, origin_block_id: 'b1', dive: { concept: 'x' } } })).status, 201);
  const holeBoard = (await f.call('PUT', `/api/learn/boards/${hole}/main`, { as: 'ana', body: { state: BOARD } })).body.board_id, holeBase = `/api/learn/c/${holeBoard}`;
  const keep = (await upload(f, parent.base, 'ana', png(64, 1))).body.attachment, lose = (await upload(f, holeBase, 'ana', png(64, 2))).body.attachment;
  await start(f, parent.base, 'ana', 'parent file', { attachments: [keep.id] });
  await start(f, holeBase, 'ana', 'hole file', { attachments: [lose.id] });
  assert.equal(f.bucket.objects.size, 2);
  assert.equal((await f.call('DELETE', `/api/canvases/dives/${hole}`, { as: 'ana' })).status, 200);
  assert.deepEqual([...f.bucket.objects.keys()].map(k => k.split('/')[1]), [parent.boardId], 'only the parent\'s object remains');
  assert.deepEqual(rows(f).map(r => r.id), [keep.id]);
  assert.equal((await download(f, parent.base, 'ana', keep.id)).status, 200);
  // The canvas itself, deleted while untouched by chat: its files go with it.
  assert.equal((await f.call('DELETE', `/api/apps/${parent.name}`, { as: 'ana' })).status, 200);
  assert.deepEqual([f.bucket.objects.size, rows(f).length], [0, 0]);
});
