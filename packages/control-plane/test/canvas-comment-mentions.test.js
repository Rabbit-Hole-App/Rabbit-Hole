// Mentions with a public lookup (docs/features/canvas-comments.md section 15, owner decision D5, 2026-10-23): in a public thread an
// account that made itself public (a profile description, or a live Explore publication) can also be mentioned; everyone else
// only through authorized participation; and a mention never grants access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const IDS = ['u-ana-5d1e', 'u-ben-9a2b', 'u-cara-71f0'];
const EMAILS = ['ana@test', 'ben@test', 'cara@test', 'zoe@test', 'yan@test', 'dan@test', 'xia@test'];
const ON_CARD = { kind: 'object', object_id: 'b1', object_kind: 'block', dx: 12, dy: 8, label: 'Why scale by sqrt(d)?' };
async function comments(f, method, path, { as, body } = {}) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const response = await canvasCommentsRoute(new URL(req.url).pathname, req, f.env);
  const text = await response.text();
  for (const secret of [...IDS, ...EMAILS]) assert.equal(text.includes(secret), false, `${method} ${path} answered with ${secret}`);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const who = (f, email, handle, name, { description = null } = {}) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name').run(email, name);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, handle);
  if (description) f.sqlite.prepare('INSERT INTO user_profile_descriptions (email, description) VALUES (?, ?)').run(email, description);
};
// zoe: a profile description. yan: a live publication (a canvas of hers on Explore). dan: a handle and nothing public. xia: a publication in Trash.
async function world(f) {
  who(f, 'ana@test', 'ana', 'Ana Lima'); who(f, 'ben@test', 'ben', 'Ben Ode'); who(f, 'cara@test', 'cara', null);
  who(f, 'zoe@test', 'zoe', 'Zoe Public', { description: 'I write about attention.' });
  who(f, 'yan@test', 'yan_p', 'Yan Publisher'); who(f, 'dan@test', 'dan', 'Dan Private'); who(f, 'xia@test', 'xia', 'Xia Trashed');
  f.sqlite.exec(`INSERT INTO canvases (org, name, owner_email, title) VALUES ('y-ws', 'canvas-0000aaaa', 'yan@test', 'Yan explains'), ('x-ws', 'canvas-0000bbbb', 'xia@test', 'Xia explains');
    INSERT INTO canvas_publications (org, canvas, token) VALUES ('y-ws', 'canvas-0000aaaa', 'tokenyan'), ('x-ws', 'canvas-0000bbbb', 'tokenxia');
    INSERT INTO library_trash (org, name, trashed_at) VALUES ('x-ws', 'canvas-0000bbbb', '2026-10-01');`);
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention notes' } })).body;
  const saved = await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state: BOARD } });
  f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m1', 'ana-ws', ?, 'ben@test', 'u-ben-9a2b', 'ben@test', 'active', 'sent', 'u-ana-5d1e', 0, 0)").run(made.name);
  await f.call('POST', `/api/learn/boards/${made.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } });
  const token = (await f.call('POST', `/api/apps/${made.name}/publish`, { as: 'ana' })).body.publication_token;
  const base = `/api/learn/c/${saved.body.board_id}`;
  await comments(f, 'PUT', `${base}/comment-settings`, { as: 'ana', body: { public_mode: 'open' } });
  return { base, pub: `/api/learn/boards/shared/${token}/comments`, canvas: made.name };
}
const post = (f, base, as, body, audience, mentions) => comments(f, 'POST', `${base}/threads`, { as, body: { id: crypto.randomUUID(), anchor: ON_CARD, body, audience, mentions } });
const people = async (f, path, as, q) => (await comments(f, 'GET', `${path}/people?${q}`, { as })).body.people.map(p => p.handle);

test('D5 suggestions: public threads also offer accounts that made themselves public, from two typed characters; members threads never do', async t => {
  const f = setup(t);
  const { base, pub } = await world(f);
  assert.deepEqual(await people(f, base, 'ana', 'audience=public&q=zo'), ['zoe'], 'a profile description makes an account public');
  assert.deepEqual(await people(f, base, 'ana', 'audience=public&q=ya'), ['yan_p'], 'so does a live Explore publication');
  assert.deepEqual(await people(f, base, 'ana', 'audience=public&q=da'), [], 'a handle alone is not public');
  assert.deepEqual(await people(f, base, 'ana', 'audience=public&q=xi'), [], 'a trashed publication is not public');
  assert.deepEqual(await people(f, base, 'ana', 'audience=public&q=z'), [], 'one character is not a lookup');
  assert.deepEqual(await people(f, base, 'ana', 'audience=public&q='), [], 'nor is none');
  assert.deepEqual(await people(f, base, 'ana', 'audience=members&q=zo'), [], 'a members thread offers only its own people');
  assert.deepEqual(await people(f, base, 'ana', 'audience=members&q=be'), ['ben']);
  assert.deepEqual(await people(f, pub, 'cara', 'q=zo'), ['zoe'], 'the published page offers the same');
  assert.deepEqual(await people(f, pub, 'cara', 'q=ca'), [], 'and never the asker');
  // A public participant is offered by the old rule, once, even when also public.
  await post(f, base, 'ana', 'a public thread', 'public');
  const zoeThread = await comments(f, 'GET', `${pub}/threads`, { as: 'cara' });
  await comments(f, 'POST', `${pub}/threads/${zoeThread.body.threads[0].id}/comments`, { as: 'cara', body: { id: crypto.randomUUID(), body: 'cara joins' } });
  assert.deepEqual(await people(f, pub, 'ana', 'q=ca'), ['cara']);
  // A blocked account is not offered.
  const zoeId = crypto.randomUUID();
  f.sqlite.prepare("INSERT INTO canvas_comment_blocks (id, org, canvas, user_id, user_email, blocked_by, blocked_at) SELECT ?, org, canvas, 'u-zoe', 'zoe@test', 'u-ana-5d1e', '2026-10-01' FROM canvas_comment_threads LIMIT 1").run(zoeId);
  assert.deepEqual(await people(f, base, 'ana', 'audience=public&q=zo'), []);
});

test('D5 mentions: kept in a public thread for a public account, plain text for anyone else, plain text in a members thread; a mention never grants access', async t => {
  const f = setup(t);
  const { base, pub } = await world(f);
  const text = 'Thanks @zoe and @yan_p, not @dan or @xia';
  const at = handle => text.indexOf(`@${handle}`);
  const mentions = ['zoe', 'yan_p', 'dan', 'xia'].map(handle => ({ pos: at(handle), len: handle.length + 1, handle }));
  const open = await post(f, base, 'ana', text, 'public', mentions);
  assert.equal(open.status, 201, JSON.stringify(open.body));
  assert.deepEqual(open.body.accepted_mentions.map(m => m.handle), ['zoe', 'yan_p']);
  assert.deepEqual(open.body.comment.segments.filter(s => s.mention).map(s => s.mention.handle), ['zoe', 'yan_p']);
  assert.equal(open.body.comment.segments.some(s => s.text?.includes('@dan')), true, 'a handle that is not public stays text');
  // The same words in a members thread: only members can be mentioned there, so none of these are.
  const closed = await post(f, base, 'ana', text, 'members', mentions);
  assert.deepEqual(closed.body.accepted_mentions, []);
  // Access is untouched: zoe reads the public thread as any signed-in person may, and nothing of the members family.
  assert.equal((await comments(f, 'GET', `${pub}/threads/${open.body.thread.id}`, { as: 'cara' })).status, 200);
  assert.equal((await comments(f, 'GET', `${base}/threads/${closed.body.thread.id}`, { as: 'ben' })).status, 200, 'the members thread is still for its members');
  assert.equal((await comments(f, 'GET', `${base}/threads/${closed.body.thread.id}`, { as: 'cara' })).status, 404, 'and nobody mentioned or not gains it');
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM canvas_members WHERE member_email IN ('zoe@test', 'yan@test')").get().n, 0, 'a mention adds no membership');
  // Editing in a mention to a members comment drops it as well; the owner's own public comment can keep one.
  const reply = (await comments(f, 'POST', `${base}/threads/${closed.body.thread.id}/comments`, { as: 'ana', body: { id: crypto.randomUUID(), body: 'hello' } })).body.comment.id;
  const edited = await comments(f, 'PATCH', `${base}/comments/${reply}`, { as: 'ana', body: { body: 'hello @zoe', mentions: [{ pos: 6, len: 4, handle: 'zoe' }] } });
  assert.deepEqual(edited.body.accepted_mentions, []);
});

test('D5 mentions: a comment keeps at most ten, and the cap is configurable', async t => {
  const f = setup(t);
  const { base } = await world(f);
  const body = Array.from({ length: 14 }, () => '@ben').join(' ');
  const mentions = Array.from({ length: 14 }, (_, i) => ({ pos: i * 5, len: 4, handle: 'ben' }));
  assert.equal((await post(f, base, 'ana', body, 'members', mentions)).body.accepted_mentions.length, 10);
  f.env.COMMENT_MENTIONS_MAX = '3';
  assert.equal((await post(f, base, 'ana', body, 'members', mentions)).body.accepted_mentions.length, 3);
});
