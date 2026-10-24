// Comment anchor targets (docs/features/canvas-comments.md section 15, Comments v2 item 5): a thread on a card names a quoted text,
// a code range, a PDF page and region or a video time; the server fixes a fingerprint of the card when the thread starts and reports
// 'ok', 'outdated' or 'detached' on every read. Through the routes the app worker serves, on the shared-canvas fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';
import { fingerprint, holdsQuote, locate, stateOf, targetOf } from '../src/comment-anchors.js';

async function comments(f, method, path, { as, body } = {}) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const CODE = 'def scale(x):\n    return x * 2\n\nprint(scale(4))\n';
const STATE = { ...BOARD, blocks: [...BOARD.blocks,
  { id: 'c1', type: 'code', title: 'scale.py', code: CODE },
  { id: 'pdf1', type: 'paper', title: 'Attention Is All You Need', paper: { id: '1706.03762', page: 3 } },
  { id: 'vid1', type: 'video', videoId: 'kCc8FmEb1nY', title: "Let's build GPT", start: 10, end: 60 }] };

async function canvas(f) {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?)').run('ana@test', 'Ana Lima');
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run('ana@test', 'ana');
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Anchors' } })).body;
  const saved = await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state: STATE } });
  let version = saved.body.version;
  const edit = async change => {
    const state = structuredClone(STATE); change(state);
    const answer = await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state, version } });
    assert.equal(answer.status, 200, answer.text); version = answer.body.version;
  };
  return { base: `/api/learn/c/${saved.body.board_id}`, edit };
}
const on = (id, target, extra = {}) => ({ kind: 'object', object_id: id, object_kind: 'block', dx: 4, dy: 4, label: id, ...(target ? { target } : {}), ...extra });
const start = (f, base, anchor, body = 'A comment', id = crypto.randomUUID()) => comments(f, 'POST', `${base}/threads`, { as: 'ana', body: { id, anchor, body } });
const state = async (f, base, id) => (await comments(f, 'GET', `${base}/threads/${id}`, { as: 'ana' })).body.thread.anchor_state;

test('targets: a quote, a code quote, a PDF page with a region, a video time; anything else is refused', () => {
  assert.deepEqual(targetOf(undefined), undefined);
  assert.deepEqual(targetOf({ kind: 'text', quote: '  sqrt(d)\n  scaling ' }), { kind: 'text', quote: 'sqrt(d) scaling' }, 'whitespace is folded');
  assert.equal(targetOf({ kind: 'text', quote: 'x'.repeat(500) }).quote.length, 300);
  assert.deepEqual(targetOf({ kind: 'pdf', page: 3, region: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, quote: 'softmax' }), { kind: 'pdf', page: 3, quote: 'softmax', region: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
  assert.deepEqual(targetOf({ kind: 'video', t: 83.456 }), { kind: 'video', t: 83.5 });
  for (const bad of ['text', {}, { kind: 'text' }, { kind: 'text', quote: '   ' }, { kind: 'code', quote: 7 }, { kind: 'pdf', page: 0 }, { kind: 'pdf', page: 1.5 }, { kind: 'pdf', page: 2, region: { x: 2, y: 0, w: 1, h: 1 } },
    { kind: 'pdf', page: 2, region: 'all' }, { kind: 'video', t: -1 }, { kind: 'video', t: 1e9 }, { kind: 'video', t: '5' }, { kind: 'audio', t: 5 }]) assert.equal(targetOf(bad), null, JSON.stringify(bad));
});

test('fingerprint, quote and range are about a card\'s own words, not its identifiers', async () => {
  const card = { id: 'c1', type: 'code', code: CODE, title: 'scale.py' };
  assert.equal(await fingerprint(card), await fingerprint({ ...card, id: 'other', type: 'snippet' }), 'identifiers are not content');
  assert.notEqual(await fingerprint(card), await fingerprint({ ...card, code: CODE.replace('* 2', '* 3') }));
  assert.deepEqual(locate(card, 'return x * 2'), { line_from: 2, line_to: 2 });
  assert.deepEqual(locate(card, 'def scale(x):\n    return x * 2'), { line_from: 1, line_to: 2 });
  assert.equal(locate(card, 'nowhere'), null);
  assert.equal(holdsQuote(card, 'print(scale(4))'), true);
  assert.equal(await stateOf({ kind: 'text', quote: 'gone', hash: await fingerprint(card) }, card), 'detached');
  assert.equal(await stateOf({ kind: 'pdf', page: 1, hash: await fingerprint(card) }, card), 'ok');
});

test('a text target: recorded with the card\'s fingerprint; ok, then outdated when the card changes around the quote, detached when the quote goes, ok again when it returns', async t => {
  const f = setup(t);
  const { base, edit } = await canvas(f);
  const made = await start(f, base, on('b1', { kind: 'text', quote: 'Keeps the logits small.' }));
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.thread.anchor.v, made.body.thread.anchor.target.kind, made.body.thread.anchor.target.quote, made.body.thread.anchor_state], [2, 'text', 'Keeps the logits small.', 'ok']);
  assert.match(made.body.thread.anchor.target.hash, /^[0-9a-f]{64}$/);
  const id = made.body.thread.id, listed = async () => (await comments(f, 'GET', `${base}/threads`, { as: 'ana' })).body.threads.find(x => x.id === id).anchor_state;
  assert.deepEqual([await state(f, base, id), await listed()], ['ok', 'ok']);
  await edit(s => { s.blocks.find(b => b.id === 'b1').title = 'Why scale by sqrt(d_k)?'; });
  assert.deepEqual([await state(f, base, id), await listed()], ['outdated', 'outdated'], 'the card changed, the quote is still there');
  await edit(s => { s.blocks.find(b => b.id === 'b1').body = 'Something else entirely.'; });
  assert.deepEqual([await state(f, base, id), await listed()], ['detached', 'detached'], 'the quoted text is gone');
  await edit(() => {});
  assert.deepEqual([await state(f, base, id), await listed()], ['ok', 'ok'], 'the card as it was when the thread started');
  // A thread with no target has no state at all, and an old (v1) anchor reads as it always did.
  const plain = await start(f, base, on('b1'));
  assert.equal(plain.body.thread.anchor_state, undefined);
  assert.equal(plain.body.thread.anchor.v, undefined);
});

test('a code target records its lines; a quote the card does not hold, or a target on anything but a card, is refused and writes nothing', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const made = await start(f, base, on('c1', { kind: 'code', quote: 'return x * 2' }));
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.thread.anchor.target.line_from, made.body.thread.anchor.target.line_to], [2, 2]);
  const refused = [
    ['a quote the card lacks', await start(f, base, on('b1', { kind: 'text', quote: 'not on the card' })), 409, 'quote_not_on_card'],
    ['a target on a shape', await start(f, base, on('rect', { kind: 'text', quote: 'Softmax box' }, { object_kind: 'shape' })), 400, 'bad_anchor'],
    ['a bad page', await start(f, base, on('pdf1', { kind: 'pdf', page: 0 })), 400, 'bad_anchor'],
    ['a bad time', await start(f, base, on('vid1', { kind: 'video', t: -3 })), 400, 'bad_anchor'],
  ];
  for (const [label, got, status, code] of refused) assert.deepEqual([label, got.status, got.body.code], [label, status, code]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comment_threads').get().n, 1);
});

test('PDF and video targets: ok at the start, outdated when the card changes', async t => {
  const f = setup(t);
  const { base, edit } = await canvas(f);
  const pdf = await start(f, base, on('pdf1', { kind: 'pdf', page: 3, region: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 } }));
  const video = await start(f, base, on('vid1', { kind: 'video', t: 83 }));
  assert.deepEqual([pdf.body.thread.anchor.target.page, video.body.thread.anchor.target.t, pdf.body.thread.anchor_state, video.body.thread.anchor_state], [3, 83, 'ok', 'ok']);
  await edit(s => { s.blocks.find(b => b.id === 'vid1').end = 90; s.blocks.find(b => b.id === 'pdf1').paper.page = 5; });
  assert.deepEqual([await state(f, base, pdf.body.thread.id), await state(f, base, video.body.thread.id)], ['outdated', 'outdated']);
});

test('a retry of the same post after the card changed is the same post, not a conflict; deleting the card still hides the thread', async t => {
  const f = setup(t);
  const { base, edit } = await canvas(f);
  const id = crypto.randomUUID(), anchor = on('b1', { kind: 'text', quote: 'Keeps the logits small.' });
  assert.equal((await start(f, base, anchor, 'First', id)).status, 201);
  await edit(s => { s.blocks.find(b => b.id === 'b1').title = 'Changed title'; });
  const again = await start(f, base, anchor, 'First', id);
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.thread.anchor_state, 'outdated', 'a replay answers the thread as it now reads: the card has changed since it started');
  await edit(s => { s.blocks = s.blocks.filter(b => b.id !== 'b1'); });
  assert.deepEqual((await comments(f, 'GET', `${base}/threads`, { as: 'ana' })).body.threads.map(x => x.id), [], 'a deleted card hides its threads, targets or not');
  assert.equal((await comments(f, 'GET', `${base}/threads/${id}`, { as: 'ana' })).status, 404);
});
