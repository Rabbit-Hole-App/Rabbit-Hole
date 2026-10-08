// Canvas comments (docs/features/canvas-comments.md; migration 0011) through the routes the app worker serves, on the
// shared-canvas fixture (LEARN_DB as node:sqlite; live storage and the model record and throw). ana owns the canvas,
// ben is an active member (seeded: invitations are their own stage), cara is any other signed-in account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { canvasCommentsRoute, can, anchorOf, BODY_MAX } from '../src/canvas-comments.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0011-canvas-comments.sql', import.meta.url), 'utf8');
const IDS = ['u-ana-5d1e', 'u-ben-9a2b', 'u-cara-71f0'];
const EMAILS = ['ana@test', 'ben@test', 'cara@test'];
const handle = (f, email, h, name = null) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name').run(email, name);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};

// Every comment route answer is checked for account ids and emails: no response may carry either.
async function comments(f, method, path, { as, body, headers = {} } = {}) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  assert.ok(response, `${method} ${path} was not routed`);
  const text = await response.text();
  for (const secret of [...IDS, ...EMAILS]) assert.equal(text.includes(secret), false, `${method} ${path} answered with ${secret}`);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// ana's canvas with a saved board (BOARD has card b1), ben made a member, everyone with a handle.
async function canvas(f, { member = true } = {}) {
  handle(f, 'ana@test', 'ana', 'Ana Lima'); handle(f, 'ben@test', 'ben', 'Ben Ode'); handle(f, 'cara@test', 'cara');
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention notes' } })).body;
  const saved = await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state: BOARD } });
  const boardId = saved.body.board_id;
  assert.match(boardId, /^[0-9a-f-]{36}$/, 'the owner gets the board id');
  if (member) f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m1', 'ana-ws', ?, 'ben@test', 'u-ben-9a2b', 'ben@test', 'active', 'sent', 'u-ana-5d1e', 0, 0)").run(made.name);
  return { name: made.name, boardId, base: `/api/learn/c/${boardId}` };
}
const ON_CARD = { kind: 'object', object_id: 'b1', object_kind: 'block', dx: 12, dy: 8, label: 'Why scale by sqrt(d)?' };
const start = (f, base, as, body, extra = {}) => comments(f, 'POST', `${base}/threads`, { as, body: { id: crypto.randomUUID(), anchor: ON_CARD, body, ...extra } });

test('0011 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(tables, ['canvas_comment_blocks', 'canvas_comment_mentions', 'canvas_comment_reads', 'canvas_comment_settings', 'canvas_comment_threads', 'canvas_comments', 'canvas_invite_codes', 'canvas_invite_sends', 'canvas_members']);
});

test('can(): the section 3 tables, including Allow comments off and blocks', () => {
  const owner = { owner: true, signedIn: true }, member = { member: true, signedIn: true }, anyone = { signedIn: true }, out = {};
  const on = (audience, mode = 'open', enabled = true) => ({ audience, mode, enabled });
  assert.deepEqual(['read', 'post', 'resolve', 'delete_any'].map(a => can(member, a, on('members'))), [true, true, false, false]);
  assert.equal(can({ ...member, starter: true }, 'resolve', on('members')), true, 'a member resolves a thread they started');
  assert.equal(can(anyone, 'read', on('members')), false, 'members threads are the owner\'s and members\' only');
  assert.equal(can(member, 'post', on('members', 'open', false)), false, 'Allow comments off');
  assert.equal(can(owner, 'post', on('members', 'open', false)), true, 'the owner still posts');
  assert.equal(can(member, 'delete_own', on('members', 'open', false)), true, 'delete-own never depends on it');
  assert.deepEqual([can(out, 'read', on('public')), can(out, 'post', on('public')), can(out, 'mark_read', on('public'))], [true, false, false], 'signed out reads Open');
  assert.equal(can(anyone, 'read', on('public', 'off')), false, 'Off hides public threads from non-members');
  assert.equal(can(member, 'read', on('public', 'off')), true);
  assert.deepEqual([can(anyone, 'post', on('public', 'closed')), can(anyone, 'read', on('public', 'closed'))], [false, true], 'Closed reads, never posts');
  assert.deepEqual([can({ ...anyone, blocked: true }, 'post', on('public')), can({ ...anyone, blocked: true }, 'delete_own', on('public'))], [false, true], 'blocked: no posting, still deletes own');
  assert.deepEqual([can(owner, 'resolve', on('public', 'closed')), can(owner, 'post', on('public', 'closed'))], [true, false], 'owner resolves Closed, posts Open only');
  assert.equal(can({ ...member, blocked: true }, 'post', on('members')), true, 'a blocked member keeps members threads');
});

test('anchors: a card-relative object or a canvas point, nothing else', () => {
  assert.deepEqual(anchorOf(ON_CARD), ON_CARD);
  assert.deepEqual(anchorOf({ kind: 'point', x: 10.04, y: -3 }), { kind: 'point', x: 10, y: -3 });
  for (const bad of [null, {}, { kind: 'point', x: 'a', y: 1 }, { kind: 'object', object_id: 'b1', object_kind: 'html', dx: 0, dy: 0 }, { kind: 'point', x: Infinity, y: 0 }]) assert.equal(anchorOf(bad), null);
  assert.equal(anchorOf({ ...ON_CARD, label: 'x'.repeat(300) }).label.length, 120);
});

test('owner and member: start, reply, resolve; stored apart from the board, which keeps its version and Library order', async t => {
  const f = setup(t);
  const { name, boardId, base } = await canvas(f);
  const before = f.sqlite.prepare('SELECT version, state_json FROM learn_boards WHERE id = ?').get(boardId);
  const meta = f.sqlite.prepare('SELECT updated_at FROM canvas_metadata WHERE canvas = ?').get(name);
  const made = await start(f, base, 'ana', 'Is this the right scale?');
  assert.equal(made.status, 201);
  assert.deepEqual([made.body.thread.audience, made.body.thread.status, made.body.thread.anchor, made.body.thread.author], ['members', 'open', ON_CARD, { name: 'Ana Lima', handle: 'ana' }]);
  assert.deepEqual(made.body.comment.segments, [{ text: 'Is this the right scale?' }]);
  const replied = await comments(f, 'POST', `${base}/threads/${made.body.thread.id}/comments`, { as: 'ben', body: { id: crypto.randomUUID(), body: 'Yes - sqrt(d_k).' } });
  assert.equal(replied.status, 201);
  assert.deepEqual([replied.body.comment.author, replied.body.comment.mine], [{ name: 'Ben Ode', handle: 'ben' }, true]);
  const thread = await comments(f, 'GET', `${base}/threads/${made.body.thread.id}`, { as: 'ana' });
  assert.deepEqual(thread.body.messages.map(m => [m.author.handle, m.segments[0].text, m.mine]), [['ana', 'Is this the right scale?', true], ['ben', 'Yes - sqrt(d_k).', false]], 'oldest first');
  assert.equal(thread.body.thread.replies, 1);
  // ben did not start it: he cannot resolve; ana (owner) can, and reopen.
  assert.equal((await comments(f, 'POST', `${base}/threads/${made.body.thread.id}/resolve`, { as: 'ben' })).status, 403);
  assert.equal((await comments(f, 'POST', `${base}/threads/${made.body.thread.id}/resolve`, { as: 'ana' })).body.thread.status, 'resolved');
  assert.deepEqual((await comments(f, 'GET', `${base}/threads`, { as: 'ben' })).body.threads, [], 'resolved threads leave the open list');
  assert.equal((await comments(f, 'GET', `${base}/threads?status=resolved`, { as: 'ben' })).body.threads.length, 1);
  assert.equal((await comments(f, 'POST', `${base}/threads/${made.body.thread.id}/reopen`, { as: 'ana' })).body.thread.status, 'open');
  const after = f.sqlite.prepare('SELECT version, state_json FROM learn_boards WHERE id = ?').get(boardId);
  assert.deepEqual(after, before, 'no comment wrote the board');
  assert.deepEqual(f.sqlite.prepare('SELECT updated_at FROM canvas_metadata WHERE canvas = ?').get(name), meta, 'nor its Library order');
});

test('unread: someone else posted after my last read; marking read clears it', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const made = await start(f, base, 'ben', 'A question for Ana');
  const list = async as => (await comments(f, 'GET', `${base}/threads`, { as })).body.threads[0];
  assert.deepEqual([(await list('ana')).unread, (await list('ben')).unread], [true, false], 'my own post is never unread to me');
  assert.equal((await comments(f, 'POST', `${base}/threads/${made.body.thread.id}/read`, { as: 'ana' })).body.read, true);
  assert.equal((await list('ana')).unread, false);
  assert.equal((await list('ana')).preview, 'A question for Ana');
});

test('who may see the member family: owner and active members; anyone else 404, signed out 401, every route', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const made = await start(f, base, 'ana', 'Private to members');
  const tid = made.body.thread.id, cid = made.body.comment.id;
  const routes = [['GET', ''], ['GET', '/threads'], ['POST', '/threads'], ['GET', `/threads/${tid}`], ['POST', `/threads/${tid}/comments`], ['POST', `/threads/${tid}/read`], ['POST', `/threads/${tid}/resolve`], ['PATCH', `/comments/${cid}`], ['DELETE', `/comments/${cid}`], ['PUT', '/comment-settings'], ['GET', '/blocks']];
  for (const [method, sub] of routes) {
    const body = method === 'GET' || method === 'DELETE' ? undefined : { id: crypto.randomUUID(), anchor: ON_CARD, body: 'x' };
    const seen = await comments(f, method, `${base}${sub}`, { as: 'cara', body });
    assert.equal(seen.status, 404, `cara ${method} ${sub}`);
    assert.doesNotMatch(JSON.stringify(seen.body), /Private to members|Attention notes/);
    assert.equal((await comments(f, method, `${base}${sub}`, { body })).status, 401, `signed out ${method} ${sub}`);
  }
  // A removed member is anyone else.
  f.sqlite.prepare("UPDATE canvas_members SET status = 'removed' WHERE id = 'm1'").run();
  assert.equal((await comments(f, 'GET', `${base}/threads`, { as: 'ben' })).status, 404);
  assert.equal((await comments(f, 'GET', '/api/learn/c/not-a-board/threads', { as: 'ana' })).status, 404);
  assert.equal(await canvasCommentsRoute(`${base}/members`, new Request(`https://app.test${base}/members`), f.env), null, 'the members subtree falls through to the control plane');
});

test('mismatched ids answer 404, never another object\'s data', async t => {
  const f = setup(t);
  const a = await canvas(f);
  const otherName = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Other' } })).body.name;
  const b = { base: `/api/learn/c/${(await f.call('PUT', `/api/learn/boards/${otherName}/main`, { as: 'ana', body: { state: BOARD } })).body.board_id}` };
  const inA = await start(f, a.base, 'ana', 'thread in A');
  const inB = await start(f, b.base, 'ana', 'thread in B');
  const tid = inA.body.thread.id, cid = inA.body.comment.id;
  for (const [method, sub, body] of [['GET', `/threads/${tid}`], ['POST', `/threads/${tid}/comments`, { id: crypto.randomUUID(), body: 'x' }], ['POST', `/threads/${tid}/resolve`], ['POST', `/threads/${tid}/read`], ['PATCH', `/comments/${cid}`, { body: 'y' }], ['DELETE', `/comments/${cid}`]]) {
    const seen = await comments(f, method, `${b.base}${sub}`, { as: 'ana', body });
    assert.equal(seen.status, 404, `${method} ${sub} through board B`);
    assert.doesNotMatch(JSON.stringify(seen.body), /thread in A/);
  }
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comments WHERE thread_id = ?').get(tid).n, 1, 'nothing landed in A');
  assert.equal(inB.status, 201);
});

test('idempotent creates: a retry returns the same row; a reused id with another payload or author is 409 with no content', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const id = crypto.randomUUID();
  const body = { id, anchor: ON_CARD, body: 'Once only' };
  const first = await comments(f, 'POST', `${base}/threads`, { as: 'ana', body });
  const again = await comments(f, 'POST', `${base}/threads`, { as: 'ana', body });
  assert.deepEqual([first.status, again.status, again.body.thread.id, again.body.comment.id], [201, 200, id, first.body.comment.id]);
  for (const [as, changed] of [['ana', { ...body, body: 'Different' }], ['ben', body]]) {
    const clash = await comments(f, 'POST', `${base}/threads`, { as, body: changed });
    assert.deepEqual([clash.status, clash.body.code, clash.body.thread, clash.body.comment], [409, 'id_conflict', undefined, undefined]);
  }
  const rid = crypto.randomUUID();
  const replies = await Promise.all([1, 2].map(() => comments(f, 'POST', `${base}/threads/${id}/comments`, { as: 'ben', body: { id: rid, body: 'reply' } })));
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 201]);
  assert.equal(f.sqlite.prepare('SELECT message_count FROM canvas_comment_threads WHERE id = ?').get(id).message_count, 2, 'counted once');
  assert.equal((await comments(f, 'POST', `${base}/threads/${id}/comments`, { as: 'ana', body: { id: rid, body: 'reply' } })).body.code, 'id_conflict', 'another author');
  assert.equal((await comments(f, 'POST', `${base}/threads`, { as: 'ana', body: { ...body, id: 'nope' } })).status, 400);
});

test('limits: 5,000 characters, per-person rate, the thread cap; a refusal writes nothing', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  assert.equal((await start(f, base, 'ana', 'x'.repeat(BODY_MAX + 1))).status, 413);
  assert.equal((await start(f, base, 'ana', '   ')).status, 400);
  assert.equal((await start(f, base, 'ana', 'x'.repeat(BODY_MAX))).status, 201);
  Object.assign(f.env, { COMMENT_CANVAS_10MIN: '2', COMMENT_THREAD_MAX: '2' });
  const second = await start(f, base, 'ben', 'one');
  assert.equal((await start(f, base, 'ben', 'two')).status, 201);
  const third = await start(f, base, 'ben', 'three');
  assert.deepEqual([third.status, third.body.limited], [429, true]);
  const tid = second.body.thread.id;
  assert.equal((await comments(f, 'POST', `${base}/threads/${tid}/comments`, { as: 'ana', body: { id: crypto.randomUUID(), body: 'r1' } })).status, 201);
  assert.equal((await comments(f, 'POST', `${base}/threads/${tid}/comments`, { as: 'ana', body: { id: crypto.randomUUID(), body: 'r2' } })).status, 409, 'the thread is full: the cap is checked before the rate');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comment_threads').get().n, 3, 'the refused thread was never written');
});

test('edit and delete: authors edit their own; delete-own always; the owner removes others; deleted text is gone', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const made = await start(f, base, 'ben', 'typo hree');
  const cid = made.body.comment.id, tid = made.body.thread.id;
  assert.equal((await comments(f, 'PATCH', `${base}/comments/${cid}`, { as: 'ana', body: { body: 'hijack' } })).status, 403);
  const edited = await comments(f, 'PATCH', `${base}/comments/${cid}`, { as: 'ben', body: { body: 'typo here' } });
  assert.deepEqual([edited.body.comment.segments[0].text, edited.body.comment.edited], ['typo here', true]);
  const reply = await comments(f, 'POST', `${base}/threads/${tid}/comments`, { as: 'ben', body: { id: crypto.randomUUID(), body: 'spam' } });
  assert.equal((await comments(f, 'DELETE', `${base}/comments/${reply.body.comment.id}`, { as: 'ana' })).body.comment.deleted, 'owner');
  assert.equal((await comments(f, 'DELETE', `${base}/comments/${cid}`, { as: 'ben' })).body.comment.deleted, 'author');
  const thread = await comments(f, 'GET', `${base}/threads/${tid}`, { as: 'ana' });
  assert.deepEqual(thread.body.messages.map(m => [m.deleted, m.segments]), [['author', []], ['owner', []]]);
  assert.doesNotMatch(JSON.stringify(thread.body), /typo here|spam/);
  assert.equal((await comments(f, 'GET', `${base}/threads`, { as: 'ana' })).body.threads[0].preview, null);
});

test('Allow comments off: only the owner posts; members still read, mark read and delete their own', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const mine = await start(f, base, 'ben', 'before off');
  assert.equal((await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ben', body: { comments_enabled: false } })).status, 403);
  assert.deepEqual((await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { comments_enabled: false } })).body, { comments_enabled: false, public_mode: 'off', published: false });
  const about = (await comments(f, 'GET', base, { as: 'ben' })).body;
  assert.deepEqual([about.role, about.comments_enabled, about.can.post], ['member', false, false]);
  assert.equal((await start(f, base, 'ben', 'after off')).body.code, 'comments_off');
  assert.equal((await comments(f, 'POST', `${base}/threads/${mine.body.thread.id}/comments`, { as: 'ben', body: { id: crypto.randomUUID(), body: 'r' } })).body.code, 'comments_off');
  assert.equal((await start(f, base, 'ana', 'owner still posts')).status, 201);
  assert.equal((await comments(f, 'GET', `${base}/threads/${mine.body.thread.id}`, { as: 'ben' })).status, 200);
  assert.equal((await comments(f, 'DELETE', `${base}/comments/${mine.body.comment.id}`, { as: 'ben' })).status, 200);
  assert.equal((await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } })).body.code, 'not_published', 'the public setting needs a publication');
});

test('public family: a publication only; Open, Closed, Off; signed out reads; members threads never cross; blocks', async t => {
  const f = setup(t);
  const { name, base } = await canvas(f);
  const members = await start(f, base, 'ana', 'MEMBERS-ONLY-TEXT');
  const shared = await f.call('POST', `/api/learn/boards/${name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } });
  assert.equal((await comments(f, 'GET', `/api/learn/boards/shared/${shared.body.sharing.view}/comments/threads`, { as: 'cara' })).status, 404, 'a share link has no public family');
  const token = (await f.call('POST', `/api/apps/${name}/publish`, { as: 'ana' })).body.publication_token;
  assert.ok(token);
  const pub = `/api/learn/boards/shared/${token}/comments`;
  assert.equal((await comments(f, 'GET', `${pub}/threads`, { as: 'cara' })).status, 404, 'Off: no public comments for non-members');
  assert.equal((await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } })).body.public_mode, 'open');
  const signedOut = await comments(f, 'GET', pub);
  assert.deepEqual([signedOut.status, signedOut.body.can.post, signedOut.body.role], [200, false, 'viewer']);
  assert.equal((await comments(f, 'POST', `${pub}/threads`, { body: { id: crypto.randomUUID(), anchor: ON_CARD, body: 'hi' } })).status, 401);
  const posted = await comments(f, 'POST', `${pub}/threads`, { as: 'cara', body: { id: crypto.randomUUID(), anchor: ON_CARD, body: 'Public hello', audience: 'members' } });
  assert.deepEqual([posted.status, posted.body.thread.audience], [201, 'public'], 'the public family only makes public threads');
  const list = await comments(f, 'GET', `${pub}/threads`);
  assert.deepEqual(list.body.threads.map(x => x.preview), ['Public hello']);
  assert.doesNotMatch(JSON.stringify(list.body), /MEMBERS-ONLY-TEXT/);
  assert.equal((await comments(f, 'GET', `${pub}/threads/${members.body.thread.id}`, { as: 'ana' })).status, 404, 'a members thread through the public family');
  // ana and ben see both audiences through the member family; ben can start a public one while Open.
  assert.deepEqual((await comments(f, 'GET', `${base}/threads?audience=public`, { as: 'ben' })).body.threads.map(x => x.preview), ['Public hello']);
  assert.equal((await start(f, base, 'ben', 'member, public', { audience: 'public' })).body.thread.audience, 'public');
  // Closed: read, never post. Off: hidden from the published page, marked for the owner.
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'closed' } });
  assert.equal((await comments(f, 'POST', `${pub}/threads/${posted.body.thread.id}/comments`, { as: 'cara', body: { id: crypto.randomUUID(), body: 'r' } })).body.code, 'closed');
  assert.equal((await comments(f, 'GET', `${pub}/threads`)).status, 200);
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'off' } });
  assert.equal((await comments(f, 'GET', `${pub}/threads`)).status, 404);
  assert.equal((await comments(f, 'GET', `${base}/threads?audience=public`, { as: 'ana' })).body.threads.every(x => x.hidden_from_public), true);
  // Block cara by her comment: she reads, deletes her own, posts nothing; unblock restores.
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  const blocked = await comments(f, 'POST', `${base}/blocks`, { as: 'ana', body: { comment_id: posted.body.comment.id } });
  assert.deepEqual(blocked.body.blocks.map(b => b.person), [{ name: null, handle: 'cara' }]);
  assert.equal((await comments(f, 'POST', `${pub}/threads`, { as: 'cara', body: { id: crypto.randomUUID(), anchor: ON_CARD, body: 'again' } })).body.code, 'blocked');
  assert.equal((await comments(f, 'GET', `${pub}/threads/${posted.body.thread.id}`, { as: 'cara' })).status, 200);
  assert.equal((await comments(f, 'POST', `${base}/blocks`, { as: 'ana', body: { comment_id: members.body.comment.id } })).status, 404, 'only a public comment\'s author');
  assert.equal((await comments(f, 'DELETE', `${base}/blocks/${blocked.body.blocks[0].block_id}`, { as: 'ana' })).body.blocks.length, 0);
  assert.equal((await comments(f, 'POST', `${pub}/threads`, { as: 'cara', body: { id: crypto.randomUUID(), anchor: ON_CARD, body: 'back' } })).status, 201);
});

test('Trash suspends the member family for everyone but the owner; nested Rabbit Holes have no comments', async t => {
  const f = setup(t);
  const { name, base } = await canvas(f);
  f.sqlite.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES ('ana-ws', ?, '2026-10-07')").run(name);
  assert.equal((await comments(f, 'GET', `${base}/threads`, { as: 'ben' })).status, 404);
  assert.equal((await comments(f, 'GET', `${base}/threads`, { as: 'ana' })).status, 200);
  f.sqlite.prepare("DELETE FROM library_trash").run();
  f.sqlite.prepare("INSERT INTO canvas_dives (org, owner_email, child, parent_app, origin_block_id, dive_json) VALUES ('ana-ws', 'ana@test', ?, 'canvas-00000001', 'b1', '{}')").run(name);
  assert.equal((await comments(f, 'GET', `${base}/threads`, { as: 'ana' })).status, 404);
});

test('mutations check Origin', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const cross = await comments(f, 'POST', `${base}/threads`, { as: 'ana', body: { id: crypto.randomUUID(), anchor: ON_CARD, body: 'x' }, headers: { origin: 'https://evil.test' } });
  assert.equal(cross.status, 403);
});

test('mentions: kept only inside the audience\'s set and at their exact range; rendered by reference; never an email', async t => {
  const f = setup(t);
  const { base } = await canvas(f);
  const at = (body, handle) => ({ pos: body.indexOf(`@${handle}`), len: handle.length + 1, handle });
  const body = 'Thanks @Ana, and @cara - see option B';
  const made = await start(f, base, 'ben', body, { mentions: [at(body, 'Ana'), at(body, 'cara'), { pos: 0, len: 4, handle: 'ana' }] });
  assert.deepEqual(made.body.accepted_mentions, [{ pos: 7, len: 4, handle: 'ana' }], 'cara is not a member; a range that is not @handle is dropped');
  assert.deepEqual(made.body.comment.segments, [{ text: 'Thanks ' }, { mention: { name: 'Ana Lima', handle: 'ana' } }, { text: ', and @cara - see option B' }]);
  f.sqlite.prepare("UPDATE user_handles SET handle = 'ana_l' WHERE email = 'ana@test'").run();
  const reread = await comments(f, 'GET', `${base}/threads/${made.body.thread.id}`, { as: 'ana' });
  assert.deepEqual(reread.body.messages[0].segments[1], { mention: { name: 'Ana Lima', handle: 'ana_l' } }, 'a renamed handle shows its new value');
  // People: by audience before a thread exists, by thread for replies; never yourself.
  const people = await comments(f, 'GET', `${base}/people?audience=members&q=an`, { as: 'ben' });
  assert.deepEqual(people.body.people, [{ name: 'Ana Lima', handle: 'ana_l' }]);
  assert.deepEqual((await comments(f, 'GET', `${base}/people?thread=${made.body.thread.id}&q=`, { as: 'ana' })).body.people, [{ name: 'Ben Ode', handle: 'ben' }]);
  // An edit replaces the mentions.
  const cid = made.body.comment.id;
  const edited = await comments(f, 'PATCH', `${base}/comments/${cid}`, { as: 'ben', body: { body: 'No mention now', mentions: [] } });
  assert.deepEqual([edited.body.comment.segments, edited.body.accepted_mentions], [[{ text: 'No mention now' }], []]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_comment_mentions').get().n, 0);
});

test('public mentions: the owner and public participants only; a mention makes a participant whose thread can go unread', async t => {
  const f = setup(t);
  const { name, base } = await canvas(f);
  const token = (await f.call('POST', `/api/apps/${name}/publish`, { as: 'ana' })).body.publication_token;
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  const pub = `/api/learn/boards/shared/${token}/comments`;
  const caraPost = await comments(f, 'POST', `${pub}/threads`, { as: 'cara', body: { id: crypto.randomUUID(), anchor: ON_CARD, body: 'first public' } });
  const text = '@cara and @ben, look';
  const owner = await comments(f, 'POST', `${pub}/threads`, { as: 'ana', body: { id: crypto.randomUUID(), anchor: ON_CARD, body: text, mentions: [{ pos: 0, len: 5, handle: 'cara' }, { pos: 10, len: 4, handle: 'ben' }] } });
  assert.deepEqual(owner.body.accepted_mentions.map(m => m.handle), ['cara'], 'ben is a member but has not posted publicly');
  assert.deepEqual((await comments(f, 'GET', `${pub}/people?q=`, { as: 'ana' })).body.people.map(p => p.handle), ['cara']);
  const caraList = (await comments(f, 'GET', `${pub}/threads`, { as: 'cara' })).body.threads;
  assert.equal(caraList.find(x => x.id === owner.body.thread.id).unread, true, 'mentioned: a participant');
  assert.equal(caraList.find(x => x.id === caraPost.body.thread.id).unread, false);
});

test('unread counts for the Library: my canvases by name, canvases shared with me by board id; open threads only', async t => {
  const f = setup(t);
  const { name, boardId, base } = await canvas(f);
  const one = await start(f, base, 'ben', 'news for ana');
  await start(f, base, 'ana', 'ana wrote this');
  const counts = async as => (await comments(f, 'GET', '/api/learn/comments/unread', { as })).body;
  assert.deepEqual(await counts('ana'), { owned: { [name]: 1 }, shared: {} });
  assert.deepEqual(await counts('ben'), { owned: {}, shared: { [boardId]: 1 } });
  await comments(f, 'POST', `${base}/threads/${one.body.thread.id}/read`, { as: 'ana' });
  assert.deepEqual((await counts('ana')).owned, {});
  assert.deepEqual(await counts('cara'), { owned: {}, shared: {} });
  assert.equal((await comments(f, 'GET', '/api/learn/comments/unread')).status, 401);
});
