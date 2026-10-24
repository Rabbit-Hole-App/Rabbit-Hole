// A new public thread from a members thread (docs/features/canvas-comments.md section 15, owner decision D6, 2026-10-23): the
// author of a comment offers some of their own words publicly. Nothing else of the private thread is copied or linked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const IDS = ['u-ana-5d1e', 'u-ben-9a2b', 'u-cara-71f0'];
const EMAILS = ['ana@test', 'ben@test', 'cara@test'];
const ON_CARD = { kind: 'object', object_id: 'b1', object_kind: 'block', dx: 12, dy: 8, label: 'Why scale by sqrt(d)?' };
async function comments(f, method, path, { as, body } = {}) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  const text = await response.text();
  for (const secret of [...IDS, ...EMAILS]) assert.equal(text.includes(secret), false, `${method} ${path} answered with ${secret}`);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const handle = (f, email, h, name = null) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name').run(email, name);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};
async function canvas(f) {
  handle(f, 'ana@test', 'ana', 'Ana Lima'); handle(f, 'ben@test', 'ben', 'Ben Ode'); handle(f, 'cara@test', 'cara');
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention notes' } })).body;
  const saved = await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state: BOARD } });
  f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m1', 'ana-ws', ?, 'ben@test', 'u-ben-9a2b', 'ben@test', 'active', 'sent', 'u-ana-5d1e', 0, 0)").run(made.name);
  await f.call('POST', `/api/learn/boards/${made.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } });
  const token = (await f.call('POST', `/api/apps/${made.name}/publish`, { as: 'ana' })).body.publication_token;
  return { name: made.name, base: `/api/learn/c/${saved.body.board_id}`, pub: `/api/learn/boards/shared/${token}/comments` };
}
const startMembers = (f, base, as, body, extra = {}) => comments(f, 'POST', `${base}/threads`, { as, body: { id: crypto.randomUUID(), anchor: ON_CARD, body, ...extra } });
const copy = (f, base, as, threadId, body) => comments(f, 'POST', `${base}/threads/${threadId}/public-copy`, { as, body: { id: crypto.randomUUID(), ...body } });
const count = (f, table) => f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

test('D6: the author offers their own words in a new public thread; no other reply, mention, reaction, person or history goes with it, and nothing links the two', async t => {
  const f = setup(t);
  const { base, pub } = await canvas(f);
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  const made = await startMembers(f, base, 'ana', 'Private plan: ask @ben about the scale.', { mentions: [{ pos: 18, len: 4, handle: 'ben' }] });
  const tid = made.body.thread.id;
  const mine = (await comments(f, 'POST', `${base}/threads/${tid}/comments`, { as: 'ana', body: { id: crypto.randomUUID(), body: 'The scale keeps the logits small. The budget is a secret.' } })).body.comment.id;
  await comments(f, 'POST', `${base}/threads/${tid}/comments`, { as: 'ben', body: { id: crypto.randomUUID(), body: 'A private reply from ben' } });
  await comments(f, 'PUT', `${base}/comments/${mine}/reactions`, { as: 'ben', body: { emoji: '\u{1F44D}', on: true } });
  const before = ['canvas_comment_threads', 'canvas_comments', 'canvas_comment_mentions', 'canvas_comment_reactions', 'canvas_comment_attachments'].map(table => count(f, table));
  const shared = await copy(f, base, 'ana', tid, { comment_id: mine, text: 'The scale keeps the logits small.' });
  assert.equal(shared.status, 201, JSON.stringify(shared.body));
  const fresh = shared.body.thread.id;
  assert.notEqual(fresh, tid);
  assert.deepEqual([shared.body.thread.audience, shared.body.thread.anchor, shared.body.thread.replies, shared.body.thread.author.handle], ['public', ON_CARD, 0, 'ana']);
  assert.deepEqual(shared.body.comment.segments, [{ text: 'The scale keeps the logits small.' }]);
  assert.deepEqual(shared.body.comment.reactions, []);
  assert.deepEqual(shared.body.comment.attachments, []);
  // One thread and one comment added, and nothing else: no mention, reaction, file, link or participant row.
  const after = ['canvas_comment_threads', 'canvas_comments', 'canvas_comment_mentions', 'canvas_comment_reactions', 'canvas_comment_attachments'].map(table => count(f, table));
  assert.deepEqual(after.map((n, i) => n - before[i]), [1, 1, 0, 0, 0]);
  assert.equal(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%link%' OR name LIKE '%copy%')").all().filter(r => r.name.startsWith('canvas_comment')).length, 0, 'no table links the threads');
  // The private thread is as it was; the public one shows a visitor only the chosen words.
  const old = (await comments(f, 'GET', `${base}/threads/${tid}`, { as: 'ana' })).body;
  assert.deepEqual(old.messages.map(m => m.segments.map(s => s.text || `@${s.mention.handle}`).join('')), ['Private plan: ask @ben about the scale.', 'The scale keeps the logits small. The budget is a secret.', 'A private reply from ben']);
  const visitor = await comments(f, 'GET', `${pub}/threads/${fresh}`, { as: 'cara' });
  assert.deepEqual(visitor.body.messages.map(m => m.segments), [[{ text: 'The scale keeps the logits small.' }]]);
  assert.equal(JSON.stringify(visitor.body).includes('budget'), false);
  assert.equal(JSON.stringify(visitor.body).includes(tid), false, 'nothing names the private thread');
  assert.equal((await comments(f, 'GET', `${pub}/threads/${tid}`, { as: 'cara' })).status, 404, 'the private thread stays private');
  // Without `text` the whole comment is offered.
  const whole = await copy(f, base, 'ana', tid, { comment_id: mine });
  assert.equal(whole.status, 201);
  assert.equal(whole.body.comment.segments[0].text, 'The scale keeps the logits small. The budget is a secret.');
});

test('D6: only the author, only their own words, only from a members thread, under the public rules; a retry is the same post', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const made = await startMembers(f, base, 'ana', 'Ana says one thing');
  const tid = made.body.thread.id, anaComment = made.body.comment.id;
  const benComment = (await comments(f, 'POST', `${base}/threads/${tid}/comments`, { as: 'ben', body: { id: crypto.randomUUID(), body: 'Ben says another' } })).body.comment.id;
  // The public setting is off: no public thread, whoever asks.
  assert.equal((await copy(f, base, 'ana', tid, { comment_id: anaComment })).body.code, 'public_off');
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  const refused = [
    ['the owner offering a member\'s words', await copy(f, base, 'ana', tid, { comment_id: benComment }), 403, 'forbidden'],
    ['words that are not in the comment', await copy(f, base, 'ana', tid, { comment_id: anaComment, text: 'Ben says another' }), 400, 'bad_text'],
    ['empty words', await copy(f, base, 'ana', tid, { comment_id: anaComment, text: '   ' }), 400, 'bad_text'],
    ['words that are not text', await copy(f, base, 'ana', tid, { comment_id: anaComment, text: 5 }), 400, 'bad_text'],
    ['no comment named', await copy(f, base, 'ana', tid, {}), 400, 'bad_id'],
    ['a comment of another thread', await copy(f, base, 'ana', tid, { comment_id: crypto.randomUUID() }), 404, 'comment_gone'],
  ];
  for (const [label, got, status, code] of refused) assert.deepEqual([label, got.status, got.body.code], [label, status, code]);
  assert.equal((await comments(f, 'POST', `${base}/threads/${tid}/public-copy`, { as: 'cara', body: { id: crypto.randomUUID(), comment_id: anaComment } })).status, 404, 'a stranger to the canvas');
  assert.equal((await comments(f, 'POST', `${base}/threads/${tid}/public-copy`, { body: { id: crypto.randomUUID(), comment_id: anaComment } })).status, 401);
  assert.equal(count(f, 'canvas_comment_threads'), 1, 'every refusal wrote nothing');
  // A deleted comment, a thread that is already public.
  const gone = (await comments(f, 'POST', `${base}/threads/${tid}/comments`, { as: 'ben', body: { id: crypto.randomUUID(), body: 'Deleted soon' } })).body.comment.id;
  await comments(f, 'DELETE', `${base}/comments/${gone}`, { as: 'ben' });
  assert.equal((await copy(f, base, 'ben', tid, { comment_id: gone })).body.code, 'comment_gone');
  const open = (await startMembers(f, base, 'ana', 'Already public', { audience: 'public' })).body;
  assert.equal((await copy(f, base, 'ana', open.thread.id, { comment_id: open.comment.id })).body.code, 'already_public');
  // Blocked from public comments, or Allow comments off: the public rules decide, not this route.
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { comments_enabled: false } });
  assert.equal((await copy(f, base, 'ben', tid, { comment_id: benComment })).body.code, 'comments_off');
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { comments_enabled: true } });
  // The same post twice is one thread; the same id with other words is a conflict with no content.
  const id = crypto.randomUUID(), body = { id, comment_id: benComment, text: 'Ben says' };
  const first = await comments(f, 'POST', `${base}/threads/${tid}/public-copy`, { as: 'ben', body });
  const again = await comments(f, 'POST', `${base}/threads/${tid}/public-copy`, { as: 'ben', body });
  assert.deepEqual([first.status, again.status, again.body.thread.id], [201, 200, id]);
  const clash = await comments(f, 'POST', `${base}/threads/${tid}/public-copy`, { as: 'ben', body: { ...body, text: 'another' } });
  assert.deepEqual([clash.status, clash.body.code], [409, 'id_conflict']);
  assert.equal(JSON.stringify(clash.body).includes('Ben says'), false);
  // The public family has no such route: the private thread is not addressable from it.
  assert.equal((await comments(f, 'POST', `/api/learn/boards/shared/${'x'.repeat(24)}/comments/threads/${tid}/public-copy`, { as: 'ben', body })).status, 404);
});
