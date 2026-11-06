// Image context through the Tutor (beta hardening item 1, owner 2026-10-09; written test-first by the evaluation lane on
// main 431f0124, where every case below fails). The Tutor's plan route takes one image reference per turn and puts the
// authorized image's bytes in front of the planner: a selected image card by its block id (read by the block's assetKey
// under the caller's own board row, so a fork's copied file resolves there), or a capture or attachment the caller
// uploaded (a media: id, read under the board owner's identity). Off the caller's board: refused before any read.
// Unavailable: the text answer still comes, with an explicit notice, never a 502. A shared viewer's question (the
// shared-canvas ask) sees only that shared board's images, and a lost file is a notice under the answer.
// Routes as the app worker serves them, on node:sqlite, the model scripted at fetch (shared-canvas-fixture.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, scriptModel, events, lastUserText } from './shared-canvas-fixture.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { mediaFetch } from '../src/learn-board.js';
import { sha256Hex } from '../src/learn-grade-jev.js';
import { MEDIA_UPLOAD_LIMIT } from '../src/learn-media.js';

// A 1x1 PNG; the bytes the planner must receive, not a label.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.1 not an image');
const IMAGE = { id: 'img1', type: 'file', kind: 'image', dx: 0, dy: 0, assetKey: 'drop:e2e-image', label: 'diagram.png' };
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'h1', type: 'heading', text: 'Diagrams' }, IMAGE, { id: 'b1', type: 'explanation', title: 'Why scale?', body: 'Keeps the logits small.' }] };
const CONTEXT = { learner_intent: { kind: 'question', raw_user_message: 'What is in this diagram?' }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text', 'ask_question'] };
const TURN = { model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 2 }, content: [{ type: 'tool_use', name: 'tutor_response', input: { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'A sigmoid curve.' }] } }], stop_reason: 'tool_use' };
const turns = n => Array.from({ length: n }, () => structuredClone(TURN));

// An R2 bucket in memory, as the board files and uploaded media code use it, with every read recorded.
function bucket() {
  const store = new Map(), reads = [];
  const bytesOf = value => (value instanceof ArrayBuffer ? new Uint8Array(value) : value instanceof Uint8Array ? value : new Uint8Array(Buffer.from(value)));
  return {
    store, reads,
    put: async (key, value, options = {}) => { store.set(key, { bytes: bytesOf(value), ...options }); },
    get: async key => {
      reads.push(key);
      const hit = store.get(key);
      if (!hit) return null;
      const copy = hit.bytes.slice();
      return { key, size: copy.length, body: copy, arrayBuffer: async () => copy.buffer, httpMetadata: hit.httpMetadata, customMetadata: hit.customMetadata };
    },
    list: async ({ prefix }) => ({ objects: [...store].filter(([key]) => key.startsWith(prefix)).map(([key, hit]) => ({ key, customMetadata: hit.customMetadata })), truncated: false }),
  };
}
const imageBlocks = request => { const content = request.messages.at(-1).content; return Array.isArray(content) ? content.filter(block => block.type === 'image') : []; };
const sameBytes = (block, bytes) => Buffer.from(block.source.data, 'base64').equals(bytes);
const fileKey = async (rowId, key) => `learn-boards/${rowId}/${await sha256Hex(key)}`;

async function world(t) {
  const f = setup(t, { vars: { TUTOR_PLANNER_FAST_MODEL: 'off', TUTOR_PLANNER_CACHE: 'off' } });
  const media = bucket();
  f.env.LEARN_MEDIA = media;
  // ana's canvas with its board saved (the row the Tutor authorizes against) and the image card's file under that row.
  const canvas = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Diagrams' } })).body;
  const saved = await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: STATE } });
  assert.equal(saved.status, 200, saved.text);
  const rowOf = app => f.sqlite.prepare("SELECT id FROM learn_boards WHERE app = ? AND board = 'main'").get(app);
  const file = async (rowId, key, bytes, contentType = 'image/png') => media.put(await fileKey(rowId, key), bytes, { httpMetadata: { contentType }, customMetadata: { key, kind: 'blob' } });
  const row = rowOf(canvas.name);
  await file(row.id, IMAGE.assetKey, PNG);
  const plan = async (as, body) => {
    const response = await tutorRoute('/api/learn/tutor/plan', new Request('https://app.test/api/learn/tutor/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `small_session=${as}` }, body: JSON.stringify(body) }), f.env);
    return { status: response.status, body: await response.json() };
  };
  // The reads of board files and uploaded media (context documents may read elsewhere).
  const fileReads = () => media.reads.filter(key => /^learn-(boards|media)\//.test(key));
  const share = async () => (await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: STATE } })).body.sharing.view;
  return { f, media, canvas, row, rowOf, file, plan, fileReads, share };
}

test('an image card on the caller\'s own board: its bytes reach the planner as an image block, named by its label; no reference, no block', async t => {
  const w = await world(t), sent = scriptModel(t, turns(2));
  const plain = await w.plan('ana', { app: w.canvas.name, context: CONTEXT });
  assert.equal(plain.status, 200, JSON.stringify(plain.body));
  assert.deepEqual(imageBlocks(sent[0]), [], 'no image reference, no image block');
  w.media.reads.length = 0;
  const seen = await w.plan('ana', { app: w.canvas.name, context: CONTEXT, image_context: { block_id: 'img1' } });
  assert.equal(seen.status, 200, JSON.stringify(seen.body));
  assert.equal(seen.body.actions?.[0]?.text, 'A sigmoid curve.');
  assert.equal(seen.body.notice, undefined, 'nothing to notice');
  const images = imageBlocks(sent[1]);
  assert.equal(images.length, 1, 'one image block');
  assert.equal(images[0].source.media_type, 'image/png');
  assert.ok(sameBytes(images[0], PNG), 'the planner gets the file\'s bytes, not a label');
  assert.match(lastUserText(sent[1]), /Compose this turn/);
  assert.ok(JSON.stringify(sent[1]).includes('diagram.png'), 'the planner is told which image it is looking at');
  assert.deepEqual(w.fileReads(), [await fileKey(w.row.id, IMAGE.assetKey)], 'read under the caller\'s own board row');
});

test('an image not on the caller\'s board is refused before any read, and so is someone else\'s board: no file read, no model call', async t => {
  const w = await world(t), sent = scriptModel(t, turns(3));
  for (const image_context of [{ block_id: 'nope' }, { block_id: 'b1' }, { block_id: 'h1' }]) {
    w.media.reads.length = 0;
    const refused = await w.plan('ana', { app: w.canvas.name, context: CONTEXT, image_context });
    assert.equal(refused.status, 403, `${JSON.stringify(image_context)}: ${JSON.stringify(refused.body)}`);
    assert.deepEqual(w.fileReads(), [], `${JSON.stringify(image_context)}: nothing read`);
  }
  w.media.reads.length = 0;
  const viewer = await w.plan('ben', { app: w.canvas.name, context: CONTEXT, image_context: { block_id: 'img1' } });
  assert.ok(viewer.status === 403 || viewer.status === 404, `a viewer's turn on another person's canvas: ${viewer.status}`);
  assert.deepEqual(w.fileReads(), []);
  for (const image_context of [{}, 'img1', { block_id: 7 }, { block_id: 'img1', id: 'media:0123456789ab' }, { id: 'not-an-upload' }]) {
    assert.equal((await w.plan('ana', { app: w.canvas.name, context: CONTEXT, image_context })).status, 400, JSON.stringify(image_context));
  }
  assert.equal(sent.length, 0, 'no model call');
});

test('an image that cannot be read - gone from storage, not an image, over 5 MB - still gets the text answer, with an explicit notice and no 502', async t => {
  const w = await world(t), sent = scriptModel(t, turns(3));
  const cases = [
    ['gone', async () => { w.media.store.clear(); }],
    ['not an image', async () => w.file(w.row.id, IMAGE.assetKey, PDF, 'application/pdf')],
    ['over the limit', async () => w.file(w.row.id, IMAGE.assetKey, Buffer.concat([PNG, Buffer.alloc(MEDIA_UPLOAD_LIMIT)]))],
  ];
  for (const [name, arrange] of cases) {
    await arrange();
    const answered = await w.plan('ana', { app: w.canvas.name, context: CONTEXT, image_context: { block_id: 'img1' } });
    assert.equal(answered.status, 200, `${name}: ${JSON.stringify(answered.body)}`);
    assert.equal(answered.body.actions?.[0]?.text, 'A sigmoid curve.', `${name}: the text answer stands`);
    assert.equal(typeof answered.body.notice, 'string', `${name}: an explicit notice`);
    assert.match(answered.body.notice, /image/i, name);
    assert.deepEqual(imageBlocks(sent.at(-1)), [], `${name}: no image block`);
  }
  assert.equal(sent.length, 3);
});

test('a capture or attachment the caller uploaded (an area or group shot, a dropped file) rides by its media id; one that is not there is a notice', async t => {
  const w = await world(t), sent = scriptModel(t, turns(2));
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'selected-area.png');
  const upload = await mediaFetch(new Request(`https://app.test/api/learn/media?app=${w.canvas.name}`, { method: 'POST', headers: { cookie: 'small_session=ana' }, body: form }), w.f.env);
  const { id } = await upload.json();
  assert.match(id ?? '', /^media:[0-9a-f]{12}$/);
  w.media.reads.length = 0;
  const seen = await w.plan('ana', { app: w.canvas.name, context: CONTEXT, image_context: { id } });
  assert.equal(seen.status, 200, JSON.stringify(seen.body));
  const images = imageBlocks(sent[0]);
  assert.equal(images.length, 1, 'one image block');
  assert.ok(sameBytes(images[0], PNG));
  assert.equal(w.fileReads().length, 1);
  assert.match(w.fileReads()[0], /^learn-media\//, 'read as the uploaded media it is, under the board owner\'s identity');
  const missing = await w.plan('ana', { app: w.canvas.name, context: CONTEXT, image_context: { id: 'media:ffffffffffff' } });
  assert.equal(missing.status, 200, JSON.stringify(missing.body));
  assert.match(missing.body.notice ?? '', /image/i);
  assert.deepEqual(imageBlocks(sent[1]), []);
});

test('a fork of a shared canvas: the image card\'s copied file resolves under the fork owner\'s own row, by the same block id', async t => {
  const w = await world(t), sent = scriptModel(t, turns(1));
  const token = await w.share();
  const forked = await w.f.call('POST', `/api/learn/boards/shared/${token}/fork`, { as: 'ben', body: { title: 'My copy' } });
  assert.equal(forked.status, 201, JSON.stringify(forked.body));
  assert.equal(forked.body.files, 1, 'the image file was copied with the fork');
  const fork = w.rowOf(forked.body.name);
  w.media.reads.length = 0;
  const seen = await w.plan('ben', { app: forked.body.name, context: CONTEXT, image_context: { block_id: 'img1' } });
  assert.equal(seen.status, 200, JSON.stringify(seen.body));
  assert.equal(seen.body.notice, undefined);
  const images = imageBlocks(sent[0]);
  assert.equal(images.length, 1);
  assert.ok(sameBytes(images[0], PNG));
  assert.deepEqual(w.fileReads(), [await fileKey(fork.id, IMAGE.assetKey)], 'the fork\'s own copy, never the source row');
});

test('a shared viewer\'s question about the selected image card sees that board\'s image; an id not on the board is ignored unread; a lost file is a notice under the answer', async t => {
  const w = await world(t), sent = scriptModel(t);
  const token = await w.share(), shared = w.rowOf(w.canvas.name);
  w.media.reads.length = 0;
  const answered = await w.f.ask(token, 'ben', { message: 'What is in this diagram?', selected: 'img1' });
  assert.equal(answered.status, 200, answered.text);
  assert.deepEqual(events(answered.text).at(-1), { type: 'done', data: { ok: true } });
  const images = imageBlocks(sent[0]);
  assert.equal(images.length, 1, 'the shared board\'s image reaches the model');
  assert.ok(sameBytes(images[0], PNG));
  assert.match(lastUserText(sent[0]), /diagram\.png/);
  assert.deepEqual(w.fileReads(), [await fileKey(shared.id, IMAGE.assetKey)], 'read from the shared board\'s own row');
  // An id from somewhere else is not on this board: ignored, nothing read.
  w.media.reads.length = 0;
  const elsewhere = await w.f.ask(token, 'ben', { message: 'And this one?', selected: 'img-elsewhere' });
  assert.equal(elsewhere.status, 200);
  assert.deepEqual([imageBlocks(sent[1]), w.fileReads()], [[], []]);
  // The file is gone: the answer still streams, and says so.
  w.media.store.clear();
  const lost = await w.f.ask(token, 'ben', { message: 'Describe the diagram', selected: 'img1' });
  assert.equal(lost.status, 200, lost.text);
  const done = events(lost.text).at(-1);
  assert.equal(done.type, 'done');
  assert.match(done.data.notice ?? '', /image/i, JSON.stringify(done));
  assert.deepEqual(imageBlocks(sent[2]), []);
});
