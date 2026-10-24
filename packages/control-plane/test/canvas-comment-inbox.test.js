// The comments inbox, follow and mute (docs/features/canvas-comments.md section 15, owner decision D4, 2026-10-23: in-app first, no
// email; migration 0032), through the routes the app worker serves, on the shared-canvas fixture. ana owns the canvas, ben is an
// active member, cara is any other signed-in account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0032-canvas-comment-follows.sql', import.meta.url), 'utf8');
const IDS = ['u-ana-5d1e', 'u-ben-9a2b', 'u-cara-71f0'];
const EMAILS = ['ana@test', 'ben@test', 'cara@test'];
const ON_CARD = { kind: 'object', object_id: 'b1', object_kind: 'block', dx: 12, dy: 8, label: 'Why scale by sqrt(d)?' };
async function comments(f, method, path, { as, body } = {}) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  assert.ok(response, `${method} ${path} was not routed`);
  const text = await response.text();
  for (const secret of [...IDS, ...EMAILS]) assert.equal(text.includes(secret), false, `${method} ${path} answered with ${secret}`);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const who = (f, email, handle, name) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name').run(email, name);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, handle);
};
async function world(f, { publish = false } = {}) {
  who(f, 'ana@test', 'ana', 'Ana Lima'); who(f, 'ben@test', 'ben', 'Ben Ode'); who(f, 'cara@test', 'cara', 'Cara Ray');
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention notes' } })).body;
  const saved = await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state: BOARD } });
  f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m1', 'ana-ws', ?, 'ben@test', 'u-ben-9a2b', 'ben@test', 'active', 'sent', 'u-ana-5d1e', 0, 0)").run(made.name);
  const base = `/api/learn/c/${saved.body.board_id}`;
  let pub = null;
  if (publish) {
    await f.call('POST', `/api/learn/boards/${made.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } });
    pub = `/api/learn/boards/shared/${(await f.call('POST', `/api/apps/${made.name}/publish`, { as: 'ana' })).body.publication_token}/comments`;
    await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  }
  return { base, pub, name: made.name, boardId: saved.body.board_id };
}
const startThread = (f, base, as, body, extra = {}) => comments(f, 'POST', `${base}/threads`, { as, body: { id: crypto.randomUUID(), anchor: ON_CARD, body, ...extra } });
const replyTo = (f, base, as, tid, body, extra = {}) => comments(f, 'POST', `${base}/threads/${tid}/comments`, { as, body: { id: crypto.randomUUID(), body, ...extra } });
const inbox = async (f, as) => (await comments(f, 'GET', '/api/learn/comments/inbox', { as })).body;
const read = (f, base, as, tid) => comments(f, 'POST', `${base}/threads/${tid}/read`, { as });

test('0032 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name), ['canvas_comment_follows']);
  assert.throws(() => sqlite.prepare("INSERT INTO canvas_comment_follows VALUES ('t', 'u', 'loud', 'now')").run(), /CHECK/);
});

test('inbox: news for the owner on their canvas, for a member who took part or was mentioned, never for a member who only has access; reading clears it', async t => {
  const f = setup(t);
  const { base } = await world(f);
  assert.deepEqual((await comments(f, 'GET', '/api/learn/comments/inbox')).status, 401);
  const made = await startThread(f, base, 'ana', 'Which scale?');
  const tid = made.body.thread.id;
  assert.deepEqual((await inbox(f, 'ana')).items, [], 'her own post is not news to her');
  assert.deepEqual((await inbox(f, 'ben')).items, [], 'ben has access, but has not taken part, been mentioned or followed');
  await replyTo(f, base, 'ben', tid, 'sqrt(d_k), I think');
  const owner = await inbox(f, 'ana');
  assert.deepEqual(owner.items.map(i => [i.thread_id, i.reason, i.news, i.canvas, i.audience, i.preview]), [[tid, 'reply', 1, 'Attention notes', 'members', 'Which scale?']], 'she started it, so it is a reply to her');
  assert.equal(owner.items[0].link, `/c/${base.split('/').pop()}?thread=${tid}`);
  assert.doesNotMatch(JSON.stringify(owner), /ben@|u-ben|object_key|owner_email/);
  assert.equal((await read(f, base, 'ana', tid)).status, 200);
  assert.deepEqual((await inbox(f, 'ana')).items, [], 'reading clears it');
  // A thread of someone else's on the owner's canvas is "your canvas" news.
  const theirs = await startThread(f, base, 'ben', 'A question from ben');
  assert.deepEqual((await inbox(f, 'ana')).items.map(i => [i.thread_id, i.reason]), [[theirs.body.thread.id, 'canvas']]);
  // ben is mentioned in it: mention outranks everything. Ana's thread above stays hers.
  await replyTo(f, base, 'ana', theirs.body.thread.id, 'Answer for @ben', { mentions: [{ pos: 11, len: 4, handle: 'ben' }] });
  assert.deepEqual((await inbox(f, 'ben')).items.map(i => [i.thread_id, i.reason, i.news]), [[theirs.body.thread.id, 'mention', 1], [tid, 'reply', 1]], 'ben started the second and was mentioned in it: a mention is the stronger reason; the first he replied to and has not opened since');
});

test('inbox: a mention is the reason for someone who only reads; follow adds a thread, mute removes it for good', async t => {
  const f = setup(t);
  const { base } = await world(f);
  const made = await startThread(f, base, 'ana', 'For the group');
  const tid = made.body.thread.id;
  await replyTo(f, base, 'ana', tid, 'Look @ben', { mentions: [{ pos: 5, len: 4, handle: 'ben' }] });
  assert.deepEqual((await inbox(f, 'ben')).items.map(i => [i.reason, i.news]), [['mention', 2]], 'ben only reads this thread, and he was mentioned');
  await read(f, base, 'ben', tid);
  // Follow: news arrives although he did not post or get mentioned again.
  assert.deepEqual((await comments(f, 'PUT', `${base}/threads/${tid}/follow`, { as: 'ben', body: { state: 'follow' } })).body, { follow: 'follow' });
  f.sqlite.prepare("UPDATE canvas_comment_reads SET read_at = '2000-01-01T00:00:00.000Z'").run(); // everything counts as unread again
  await replyTo(f, base, 'ana', tid, 'Another note');
  assert.deepEqual((await inbox(f, 'ben')).items.map(i => i.reason), ['mention'], 'the mention is still unread, and outranks following');
  f.sqlite.prepare("UPDATE canvas_comment_mentions SET user_id = 'nobody', user_email = 'nobody@x'").run();
  assert.deepEqual((await inbox(f, 'ben')).items.map(i => i.reason), ['follow']);
  // Mute removes it, whatever else is true: the owner's own canvas, a mention, a post of her own.
  assert.deepEqual((await comments(f, 'PUT', `${base}/threads/${tid}/follow`, { as: 'ana', body: { state: 'mute' } })).body, { follow: 'mute' });
  f.sqlite.prepare("UPDATE canvas_comment_reads SET read_at = '2000-01-01T00:00:00.000Z'").run();
  await replyTo(f, base, 'ben', tid, 'ben posts again');
  assert.deepEqual((await inbox(f, 'ana')).items, [], 'muted for ana');
  assert.equal((await comments(f, 'GET', `${base}/threads/${tid}`, { as: 'ana' })).body.follow, 'mute', 'the thread read carries my choice');
  assert.equal((await comments(f, 'GET', `${base}/threads/${tid}`, { as: 'ben' })).body.follow, 'follow');
  assert.deepEqual((await comments(f, 'PUT', `${base}/threads/${tid}/follow`, { as: 'ana', body: { state: 'default' } })).body, { follow: null });
  assert.equal((await comments(f, 'GET', `${base}/threads/${tid}`, { as: 'ana' })).body.follow, null);
  assert.equal((await inbox(f, 'ana')).items.length, 1, 'back to the default');
  // Refusals: a bad state, a stranger, signed out; and my choice is mine alone.
  assert.equal((await comments(f, 'PUT', `${base}/threads/${tid}/follow`, { as: 'ben', body: { state: 'loud' } })).body.code, 'bad_state');
  assert.equal((await comments(f, 'PUT', `${base}/threads/${tid}/follow`, { as: 'cara', body: { state: 'follow' } })).status, 404);
  assert.equal((await comments(f, 'PUT', `${base}/threads/${tid}/follow`, { body: { state: 'follow' } })).status, 401);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM canvas_comment_follows WHERE user_id = 'u-ben-9a2b'").get().n, 1);
});

test('inbox access: it follows the reader\'s CURRENT access - a removed member, a deleted comment, a deleted card, Trash, a deleted thread', async t => {
  const f = setup(t);
  const { base, name } = await world(f);
  const made = await startThread(f, base, 'ben', 'Ben\'s thread');
  const tid = made.body.thread.id;
  await replyTo(f, base, 'ana', tid, 'ana answers');
  const after = async who => (await inbox(f, who)).items.length;
  assert.equal(await after('ben'), 1);
  // Trash takes the member's entry (the owner keeps hers).
  f.sqlite.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES ('ana-ws', ?, '2026-10-07')").run(name);
  assert.deepEqual([await after('ben'), await after('ana')], [0, 1]);
  f.sqlite.prepare('DELETE FROM library_trash').run();
  assert.equal(await after('ben'), 1);
  // A removed member's inbox is empty at once.
  f.sqlite.prepare("UPDATE canvas_members SET status = 'removed'").run();
  assert.equal(await after('ben'), 0);
  f.sqlite.prepare("UPDATE canvas_members SET status = 'active'").run();
  // The comment that was the news is deleted: no news left.
  const answer = f.sqlite.prepare("SELECT id FROM canvas_comments WHERE author_id = 'u-ana-5d1e'").get().id;
  assert.equal((await comments(f, 'DELETE', `${base}/comments/${answer}`, { as: 'ana' })).status, 200);
  assert.equal(await after('ben'), 0);
  // A card's threads are hidden with the card (the saved board lacks it).
  await replyTo(f, base, 'ana', tid, 'one more');
  assert.equal(await after('ben'), 1);
  const saved = (await f.call('GET', `/api/learn/boards/${name}/main`, { as: 'ana' })).body;
  const state = { ...saved.state, blocks: saved.state.blocks.filter(block => block.id !== 'b1') };
  assert.equal((await f.call('PUT', `/api/learn/boards/${name}/main`, { as: 'ana', body: { state, version: saved.version } })).status, 200);
  assert.deepEqual([await after('ben'), await after('ana')], [0, 0]);
  // A deleted thread is gone, with its follows.
  const point = await startThread(f, base, 'ben', 'On the canvas', { anchor: { kind: 'point', x: 5, y: 5 } });
  await comments(f, 'PUT', `${base}/threads/${point.body.thread.id}/follow`, { as: 'ana', body: { state: 'follow' } });
  await replyTo(f, base, 'ben', point.body.thread.id, 'more');
  assert.equal(await after('ana'), 1);
  assert.equal((await comments(f, 'DELETE', `${base}/threads/${point.body.thread.id}`, { as: 'ana' })).status, 200);
  assert.equal(await after('ana'), 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comment_follows').get().n, 0);
});

test('inbox: a public thread elsewhere reaches a participant only while it is public and they are not blocked; a mention in it counts', async t => {
  const f = setup(t);
  const { base, pub } = await world(f, { publish: true });
  const opened = await startThread(f, base, 'ana', 'A public question', { audience: 'public' });
  const tid = opened.body.thread.id;
  // cara opens it and answers publicly (a participant), then ana replies: news for cara, who has no membership.
  await comments(f, 'POST', `${pub}/threads/${tid}/read`, { as: 'cara' });
  await replyTo(f, pub, 'cara', tid, 'cara answers').then(r => assert.equal(r.status, 201, JSON.stringify(r.body)));
  assert.deepEqual((await inbox(f, 'cara')).items, [], 'her own post is not news');
  await replyTo(f, base, 'ana', tid, 'ana replies');
  const first = (await inbox(f, 'cara')).items;
  assert.deepEqual(first.map(i => [i.thread_id, i.reason, i.news, i.audience]), [[tid, 'reply', 1, 'public']]);
  assert.match(first[0].link, /^\/e\/[A-Za-z0-9_-]{20,}\?thread=/, 'a public thread opens on the published page');
  // A members thread on the same canvas never reaches her, whatever it says.
  const hidden = await startThread(f, base, 'ana', 'Private to members', { mentions: [] });
  await replyTo(f, base, 'ana', hidden.body.thread.id, 'also private');
  assert.equal((await inbox(f, 'cara')).items.length, 1);
  // Mentioned in a public thread she never opened (a public account can be mentioned, D5): a mention, found by her address, and no access beyond the thread.
  f.sqlite.prepare("INSERT INTO user_profile_descriptions (email, description) VALUES ('cara@test', 'I write about attention.')").run();
  const named = await startThread(f, base, 'ana', 'Over to @cara', { audience: 'public', mentions: [{ pos: 8, len: 5, handle: 'cara' }] });
  assert.deepEqual(named.body.accepted_mentions.map(m => m.handle), ['cara']);
  assert.deepEqual((await inbox(f, 'cara')).items.filter(i => i.thread_id === named.body.thread.id).map(i => i.reason), ['mention']);
  assert.equal((await comments(f, 'GET', `${base}/threads/${hidden.body.thread.id}`, { as: 'cara' })).status, 404, 'a mention opened nothing else');
  // Turn public comments off, or block her: it goes at once.
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'off' } });
  assert.deepEqual((await inbox(f, 'cara')).items, []);
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'closed' } });
  assert.equal((await inbox(f, 'cara')).items.length, 2, 'Closed still reads');
  const caraComment = f.sqlite.prepare("SELECT id FROM canvas_comments WHERE author_id = 'u-cara-71f0'").get().id;
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  assert.equal((await comments(f, 'POST', `${base}/blocks`, { as: 'ana', body: { comment_id: caraComment } })).status, 200);
  assert.deepEqual((await inbox(f, 'cara')).items, [], 'blocked');
});

// The tests above call canvasCommentsRoute directly, which skips the worker's route gate. fast-e2e step 14 of comments-delete caught
// the inbox answering nothing in the browser because dev-worker.js only let /api/learn/comments/unread through. dev-worker.js imports
// .html and .py, so node reads its source (as canvases.test.js does).
test('the app worker hands every /api/learn/comments/ route of canvas-comments.js to canvasCommentsRoute', () => {
  const comments = readFileSync(new URL('../src/canvas-comments.js', import.meta.url), 'utf8');
  const gate = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8').split('\n').find(line => line.includes('canvasCommentsRoute(path'));
  assert.ok(gate, 'dev-worker.js calls canvasCommentsRoute');
  const routes = [...comments.matchAll(/path === '(\/api\/learn\/comments\/[^']+)'/g)].map(match => match[1]);
  assert.ok(routes.includes('/api/learn/comments/inbox') && routes.includes('/api/learn/comments/unread'), 'both flat routes are found');
  for (const route of routes) assert.ok(gate.includes(`'${route}'`) || gate.includes("startsWith('/api/learn/comments/')"), `${route} is not routed by dev-worker.js`);
});
