// PDF highlights and excerpt crops (pdf-excerpts.js; C:/s/spec/pdf-excerpts/contract.md) on node:sqlite with the repository
// schema plus 0024, an in-memory R2 that verifies a declared sha256 as R2 does, and the stub control plane the file tests use.
// Access is the real chain: authorizedBoardApp -> canvasAccess, readOwnDocument / readUploadedPaper, boardOwner + ownerRow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { contextDocsFetch } from '../src/learn-context-docs.js';
import { paperIdentity, putUploadedPaper } from '../src/learn-paper.js';
import { CROP_LIMITS, NOT_AVAILABLE, highlightAnchor, pdfExcerptsFetch, pdfExcerptsRoute, pngSize } from '../src/pdf-excerpts.js';
import { fileContext } from '../src/file-context.js';
import { chatContext } from '../src/chat-modes.js';
import { fileChatRef } from '../../web/src/file-chat-ref.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PEOPLE = { owner: { email: 'owner@test', org: 'team', user_id: 'u-owner' }, friend: { email: 'friend@test', org: 'team', user_id: 'u-friend' } };
const MINE = 'canvas-0a1b2c3d', THEIRS = 'canvas-0f0f0f0f'; // THEIRS: the friend's fork of MINE
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');
const OTHER_PDF = new TextEncoder().encode('%PDF-1.4\n% another document\n%%EOF');
const XID = n => `pdfx_${String(n).padStart(24, '0')}`, HID = n => `pdfh_${String(n).padStart(24, '0')}`;
// A PNG: signature, IHDR (width, height), then filler bytes up to `size`.
function png(width, height, size = 64, fill = 7) {
  const bytes = new Uint8Array(size).fill(fill), view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13); bytes.set([73, 72, 68, 82], 12); view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

async function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(readFileSync(new URL('../learn-migrations/0003-canvas-context-documents.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../learn-migrations/0024-pdf-highlights.sql', import.meta.url), 'utf8'));
  sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('team','${MINE}','owner@test','Reading'),('team','${THEIRS}','friend@test','Reading (fork)')`);
  const CONTROL_PLANE = { fetch: async request => {
    const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
    if (!who) return new Response('sign in', { status: 401 });
    return new URL(request.url).pathname === '/api/me' ? Response.json(who) : new Response('no', { status: 404 });
  } };
  const objects = new Map();
  const LEARN_MEDIA = {
    put: async (key, body, { httpMetadata, customMetadata, sha256 } = {}) => { const bytes = new Uint8Array(body); if (sha256 && sha(bytes) !== sha256) throw new Error('put: The SHA-256 checksum you specified did not match'); objects.set(key, { bytes, httpMetadata, customMetadata }); },
    get: async key => { const o = objects.get(key); return o ? { body: o.bytes, size: o.bytes.length, customMetadata: o.customMetadata, httpMetadata: o.httpMetadata, arrayBuffer: async () => o.bytes.slice().buffer, text: async () => new TextDecoder().decode(o.bytes) } : null; },
    head: async key => (objects.has(key) ? { size: objects.get(key).bytes.length } : null),
    delete: async key => { objects.delete(key); },
    list: async () => ({ objects: [] }),
  };
  const env = { LEARN_DB, LEARN_MEDIA, CONTROL_PLANE, DB: { prepare() { throw Error('live D1 touched'); } } };
  const headers = as => (as ? { cookie: `small_session=${as}` } : {});
  const call = async (method, path, { as = 'owner', body, raw, extra = {} } = {}) => {
    const init = { method, headers: { ...headers(as), ...(raw === undefined && body ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) };
    const res = await pdfExcerptsFetch(new Request(`https://dev.test${path}`, init), env);
    return { status: res.status, body: await res.json() };
  };
  // The owner's context PDF (through its own route) and uploaded paper on MINE, and a saved main board there.
  const form = new FormData(); form.set('app', MINE); form.set('file', new File([PDF], 'Attention Is All You Need.pdf'));
  const doc = (await (await contextDocsFetch(new Request('https://dev.test/api/learn/context', { method: 'POST', body: form, headers: headers('owner') }), env)).json()).document;
  const paper = await putUploadedPaper(env, paperIdentity({ org: 'team', name: MINE, email: 'owner@test' }), new File([OTHER_PDF], 'Textbook.pdf'));
  const board = await learnBoardsRoute(`/api/learn/boards/${MINE}/main`, new Request(`https://dev.test/api/learn/boards/${MINE}/main`, { method: 'PUT', headers: { ...headers('owner'), 'Content-Type': 'application/json' }, body: JSON.stringify({ state: { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] } }) }), env);
  assert.equal(board.status, 200, 'the owner saved the board');
  return { env, sqlite, objects, call, headers, docKey: `doc:${doc.id}`, paperKey: `pdf:${paper.id}` };
}
const q = params => new URLSearchParams(params).toString();
const textHighlight = (key, sha256, over = {}) => ({ app: MINE, key, home: null, sha256, kind: 'text', page: { index: 3, label: 'iii' }, rects: [[72, 600, 540, 614], [72, 586, 300, 600]], rotate: 0, view: [0, 0, 612, 792], quote: { exact: 'Attention is all\n\nyou need', prefix: 'We show that ', suffix: '.' }, ...over });

test('routes, source identity and the cached hash: both PDF origins, sha256 of the stored bytes', async t => {
  const f = await setup(t);
  for (const p of ['/api/learn/pdf-source', '/api/learn/pdf-highlights', `/api/learn/pdf-highlights/${HID(1)}`, `/api/learn/pdf-excerpts/${XID(1)}/crop`]) assert.equal(pdfExcerptsRoute(p), true, p);
  assert.equal(pdfExcerptsRoute('/api/learn/pdf-excerpts/x'), false);
  const doc = await f.call('GET', `/api/learn/pdf-source?${q({ app: MINE, key: f.docKey })}`);
  assert.deepEqual(doc, { status: 200, body: { key: f.docKey, sha256: sha(PDF), name: 'Attention Is All You Need.pdf', bytes: PDF.length } });
  const paper = await f.call('GET', `/api/learn/pdf-source?${q({ app: MINE, key: f.paperKey })}`);
  assert.deepEqual(paper.body, { key: f.paperKey, sha256: sha(OTHER_PDF), name: 'Textbook.pdf', bytes: OTHER_PDF.length });
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM pdf_source_hashes').get().n, 2, 'computed once per document and cached');
  // A copied card on the owner's other canvas reads the paper from its home, as /api/learn/paper does.
  f.sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0b0b0b0b','owner@test','Copy')");
  assert.equal((await f.call('GET', `/api/learn/pdf-source?${q({ app: 'canvas-0b0b0b0b', key: f.paperKey, home: MINE })}`)).body.sha256, sha(OTHER_PDF));
  assert.equal((await f.call('GET', `/api/learn/pdf-source?${q({ app: 'canvas-0b0b0b0b', key: f.paperKey })}`)).status, 404, 'without its home the paper is not on that canvas');
});

test('access: another account, a fork viewer, a signed-out caller and a revoked source all get the one 404, every call', async t => {
  const f = await setup(t);
  const sha256 = sha(PDF);
  assert.equal((await f.call('PUT', `/api/learn/pdf-highlights/${HID(1)}`, { body: textHighlight(f.docKey, sha256) })).status, 200);
  const refused = [
    ['friend on their fork', 'friend', THEIRS, f.docKey], ['friend on the owner canvas', 'friend', MINE, f.docKey],
    ['friend, the paper on their fork', 'friend', THEIRS, f.paperKey], ['friend, the paper with the owner home', 'friend', THEIRS, f.paperKey, MINE],
    ['signed out', null, MINE, f.docKey], ['malformed key', 'owner', MINE, 'doc:../x'], ['no canvas', 'owner', 'canvas-zz', f.docKey],
  ];
  for (const [name, as, app, key, home] of refused) {
    for (const path of ['/api/learn/pdf-source', '/api/learn/pdf-highlights']) {
      const res = await f.call('GET', `${path}?${q({ app, key, ...(home ? { home } : {}) })}`, { as });
      assert.deepEqual(res, { status: 404, body: { error: NOT_AVAILABLE } }, `${name}: ${path}`);
    }
  }
  // The friend knows the highlight id and the hash: neither reaches the owner's row.
  assert.equal((await f.call('PUT', `/api/learn/pdf-highlights/${HID(1)}`, { as: 'friend', body: { ...textHighlight(f.docKey, sha256), app: THEIRS } })).status, 404);
  assert.equal((await f.call('DELETE', `/api/learn/pdf-highlights/${HID(1)}?${q({ app: THEIRS, key: f.docKey })}`, { as: 'friend' })).status, 404);
  assert.equal((await f.call('PUT', `/api/learn/pdf-excerpts/${XID(1)}/crop?${q({ app: THEIRS, key: f.docKey, sha256, page: 3 })}`, { as: 'friend', raw: png(10, 10) })).status, 404);
  // Revoked: the bytes are gone. The cached hash and the stored highlight never stand in for the read.
  for (const key of [...f.objects.keys()].filter(k => k.startsWith('learn-context/'))) f.objects.delete(key);
  assert.deepEqual(await f.call('GET', `/api/learn/pdf-highlights?${q({ app: MINE, key: f.docKey })}`), { status: 404, body: { error: NOT_AVAILABLE } });
  assert.equal((await f.call('PUT', `/api/learn/pdf-highlights/${HID(1)}`, { body: textHighlight(f.docKey, sha256) })).status, 404);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM pdf_highlights').get().n, 1, 'the row stays; it is only unreachable');
});

test('highlights: changed source 409, retry-safe PUT, different body 409, author-only list and delete, changed count', async t => {
  const f = await setup(t);
  const sha256 = sha(PDF), put = (id, body, as) => f.call('PUT', `/api/learn/pdf-highlights/${id}`, { as, body });
  const stale = await put(HID(1), textHighlight(f.docKey, 'e'.repeat(64)));
  assert.deepEqual(stale, { status: 409, body: { error: 'This document changed since you selected this.', sha256 } });
  const first = await put(HID(1), textHighlight(f.docKey, sha256));
  assert.equal(first.status, 200);
  assert.deepEqual({ ...first.body.highlight, created_at: 0 }, { id: HID(1), kind: 'text', page: { index: 3, label: 'iii' }, rects: [[72, 600, 540, 614], [72, 586, 300, 600]], rotate: 0, view: [0, 0, 612, 792], quote: { exact: 'Attention is all\n\nyou need', prefix: 'We show that ', suffix: '.' }, created_at: 0 });
  assert.deepEqual(await put(HID(1), textHighlight(f.docKey, sha256)), first, 'a retry is the same answer');
  assert.equal((await put(HID(1), textHighlight(f.docKey, sha256, { rects: [[1, 1, 2, 2]] }))).status, 409, 'same id, other body');
  const region = await put(HID(2), textHighlight(f.paperKey, sha(OTHER_PDF), { kind: 'region', quote: null, rects: [[100, 200, 400, 500]], rotate: 90 }));
  assert.equal(region.status, 200);
  // Validation at the boundary.
  const bad = [{ rects: Array.from({ length: 65 }, () => [0, 0, 1, 1]) }, { rects: [[0, 0, NaN, 1]] }, { rects: [[5, 0, 1, 1]] }, { page: { index: 0, label: null } }, { page: { index: 1.5, label: null } },
    { quote: { exact: 'x'.repeat(8001), prefix: '', suffix: '' } }, { quote: null }, { kind: 'note' }, { rotate: 45 }, { kind: 'region', quote: null, rects: [[0, 0, 1, 1], [1, 1, 2, 2]] }];
  for (const over of bad) assert.equal((await put(HID(9), textHighlight(f.docKey, sha256, over))).status, 400, JSON.stringify(over).slice(0, 80));
  assert.equal(typeof highlightAnchor(textHighlight(f.docKey, sha256, { quote: { exact: 'x'.repeat(8000) } })), 'object', '8,000 characters is allowed');
  // Another version of the same key (a row from before a replacement) is counted, never shown.
  f.sqlite.prepare("INSERT INTO pdf_highlights VALUES (?, 'team', 'owner@test', ?, ?, 'text', 1, '{}', 1, 1)").run(HID(3), f.docKey, 'f'.repeat(64));
  f.sqlite.prepare("INSERT INTO pdf_highlights VALUES (?, 'team', 'friend@test', ?, ?, 'text', 1, '{}', 1, 1)").run(HID(4), f.docKey, sha256);
  const list = await f.call('GET', `/api/learn/pdf-highlights?${q({ app: MINE, key: f.docKey })}`);
  assert.deepEqual({ sha256: list.body.sha256, ids: list.body.highlights.map(h => h.id), changed: list.body.changed }, { sha256, ids: [HID(1)], changed: 1 });
  assert.deepEqual((await f.call('GET', `/api/learn/pdf-highlights?${q({ app: MINE, key: f.paperKey })}`)).body.highlights.map(h => [h.id, h.kind, h.quote]), [[HID(2), 'region', null]]);
  assert.equal((await put(HID(4), textHighlight(f.docKey, sha256))).status, 404, "another author's id");
  assert.equal((await f.call('DELETE', `/api/learn/pdf-highlights/${HID(4)}?${q({ app: MINE, key: f.docKey })}`)).status, 404, "another author's id");
  assert.deepEqual(await f.call('DELETE', `/api/learn/pdf-highlights/${HID(1)}?${q({ app: MINE, key: f.docKey })}`), { status: 200, body: { deleted: true } });
  assert.deepEqual(await f.call('DELETE', `/api/learn/pdf-highlights/${HID(1)}?${q({ app: MINE, key: f.docKey })}`), { status: 200, body: { deleted: true } }, 'deleting again is a no-op');
  assert.equal((await f.call('GET', `/api/learn/pdf-highlights?${q({ app: MINE, key: f.docKey })}`)).body.highlights.length, 0);
  assert.equal((await f.call('DELETE', `/api/learn/pdf-highlights/${HID(2)}?${q({ app: MINE, key: f.paperKey })}`, { extra: { origin: 'https://evil.test' } })).status, 403, 'cross-origin writes are refused');
});

test('crops: stored as an image file source, idempotent, limits enforced; the fileRef reads back as an image for chat', async t => {
  const f = await setup(t);
  const sha256 = sha(PDF), crop = (id, raw, over = {}, as) => f.call('PUT', `/api/learn/pdf-excerpts/${id}/crop?${q({ app: MINE, board: 'main', key: f.docKey, sha256, page: 3, ...over })}`, { as, raw });
  const bytes = png(800, 600, 2048);
  const made = await crop(XID(1), bytes);
  assert.equal(made.status, 200);
  const id = `fs_${sha(`pdf-excerpt:teamowner@test${XID(1)}`).slice(0, 24)}`;
  assert.deepEqual({ source: made.body.source, width: made.body.width, height: made.body.height, bytes: made.body.bytes }, { source: { id, rev: sha(bytes) }, width: 800, height: 600, bytes: 2048 });
  assert.deepEqual(made.body.fileRef, { v: 1, source: { id, rev: sha(bytes) }, family: 'image', meta: { name: 'Attention Is All You Need.pdf, page 3 excerpt.png', type: 'image/png', size: 2048, title: 'Attention Is All You Need.pdf, page 3 excerpt' },
    view: {}, derivatives: {}, job: null, doc: null, status: { preview: 'pending', context: 'none' } });
  const row = f.sqlite.prepare('SELECT * FROM file_sources WHERE id = ?').get(id);
  assert.deepEqual([row.family, row.media_type, row.status, row.app, row.r2_key, row.org, row.owner_email], ['image', 'image/png', 'stored', MINE, `file-sources/${id}/original/${sha(bytes)}`, 'team', 'owner@test']);
  assert.ok(row.board_id, 'tied to the board, as POST /api/learn/files is');
  assert.deepEqual(await crop(XID(1), bytes), made, 'a retry with the same bytes is the same source');
  assert.equal((await crop(XID(1), png(800, 600, 2048, 9))).status, 409, 'same excerpt, other bytes');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM file_sources').get().n, 1);
  assert.equal([...f.objects.keys()].filter(k => k.startsWith('file-sources/')).length, 1, 'nothing stored for a refused crop');
  // Limits: PNG only, 4 MiB, 4096 px a side, the current document version, a page.
  assert.equal((await crop(XID(2), new TextEncoder().encode('GIF89a not a png at all, padded out'))).status, 415);
  assert.equal((await crop(XID(2), png(4097, 10))).status, 413);
  assert.equal((await crop(XID(2), png(10, 4097))).status, 413);
  assert.equal((await crop(XID(2), png(10, 10, CROP_LIMITS.bytes + 1))).status, 413);
  assert.equal((await crop(XID(2), png(4096, 4096, 128))).status, 200, 'the limits themselves pass');
  assert.equal((await crop(XID(3), png(10, 10), { sha256: 'e'.repeat(64) })).status, 409);
  assert.equal((await crop(XID(3), png(10, 10), { page: 0 })).status, 400);
  assert.equal((await crop('pdfx_nope', png(10, 10))).status, 404);
  // Board ownership: a canvas without a saved board refuses, as POST /api/learn/files does.
  f.sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0c0c0c0c','owner@test','Unsaved')");
  assert.equal((await f.call('PUT', `/api/learn/pdf-excerpts/${XID(4)}/crop?${q({ app: 'canvas-0c0c0c0c', key: f.docKey, sha256, page: 1 })}`, { raw: png(10, 10) })).body.error, 'Save this board first.');
  // The paper origin crops the same way.
  assert.equal((await crop(XID(5), png(20, 20), { key: f.paperKey, sha256: sha(OTHER_PDF) })).status, 200);
  // Chat: the crop's file ref resolves to an image block for its owner (payload only; no model reads it here).
  const card = { id: 'b1', type: 'file', kind: 'image', fileRef: made.body.fileRef };
  const ref = fileChatRef(card);
  const req = new Request('https://dev.test/api/learn/ask', { headers: f.headers('owner') });
  const files = await fileContext(req, f.env, [ref], { user: PEOPLE.owner, app: MINE });
  assert.equal(files.coverage.get(`${ref.sourceId}|null`), 'image included');
  assert.deepEqual(files.images[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(bytes).toString('base64') } });
  assert.match(chatContext('', [ref], null, 10000, null, files), /image included: the image itself is attached to this turn/);
  // Another account gets nothing; a page range is not the whole image; a second picture past the budget is omitted.
  const friend = await fileContext(new Request('https://dev.test/api/learn/ask', { headers: f.headers('friend') }), f.env, [ref], { user: PEOPLE.friend, app: THEIRS });
  assert.deepEqual([friend.coverage.get(`${ref.sourceId}|null`), friend.images.length], ['unavailable', 0]);
  assert.equal((await fileContext(req, f.env, [ref], { user: PEOPLE.owner, app: MINE, limits: { perRef: 4000, perTurn: 12000, imageBytes: 100 } })).coverage.get(`${ref.sourceId}|null`), 'omitted');
  assert.equal(pngSize(new Uint8Array(8)), null);
});
