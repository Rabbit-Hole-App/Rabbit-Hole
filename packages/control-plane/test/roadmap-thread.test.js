// The roadmap's one Tutor Chat thread (owner 2026-11-06): stored on the roadmap (scope_json.tutorThreadId, no migration) and returned in the view, so
// every device shows the roadmap in the same thread. Set once (first writer wins), idempotent, owner only, a saved thread of this canvas only; a
// deleted thread may be replaced. Real store and routes on the in-memory schema; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTutorThread } from '../src/roadmap/roadmap-lifecycle.js';
import { currentView } from '../src/roadmap/roadmap-view.js';
import { accessFor, offered, rows, world } from './roadmap-fixture.js';
import { BOARD, ID_B, KEY, loop } from './roadmap-loop-fixture.js';

const T1 = 'canvaschat-11111111-1111-4111-8111-111111111111', T2 = 'canvaschat-22222222-2222-4222-8222-222222222222';
const saveThread = (sqlite, id, { user = 'u-alice@example.test', app = 'learn' } = {}) => sqlite.prepare("INSERT INTO threads (id, org, user, scope_ref, commit_sha, title) VALUES (?, 'team', ?, ?, '', 'Tutor')").run(id, user, app);
const rejects = (promise, status) => assert.rejects(promise, e => e.status === status);

test('the view has no thread until one is bound; binding is first writer wins, a repeat changes nothing, and the poll etag follows it', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const before = await currentView(w.LEARN_DB, w.access, o.roadmapId);
  assert.equal(before.roadmap.threadId, null);
  saveThread(w.sqlite, T1); saveThread(w.sqlite, T2);
  assert.deepEqual((await bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T1 })).body, { roadmapId: o.roadmapId, threadId: T1 });
  const after = await currentView(w.LEARN_DB, w.access, o.roadmapId);
  assert.equal(after.roadmap.threadId, T1);
  assert.notEqual(after.poll.etag, before.poll.etag, 'a device polling with the old etag sees the binding');
  assert.equal(after.roadmap.revision, before.roadmap.revision, 'binding is not a roadmap change: no other device action goes stale');
  assert.equal((await bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T2 })).body.threadId, T1, 'a second device adopts the first binding');
  assert.equal((await bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T1 })).body.threadId, T1, 'idempotent');
  assert.equal(JSON.parse(rows(w.sqlite, 'SELECT scope_json FROM learn_roadmaps')[0].scope_json).kind, 'whole', 'the scope itself is untouched');
});

test('a deleted Tutor thread is reported as none, and a fresh one may then be bound', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  saveThread(w.sqlite, T1); saveThread(w.sqlite, T2);
  await bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T1 });
  w.sqlite.prepare('DELETE FROM threads WHERE id = ?').run(T1);
  assert.equal((await currentView(w.LEARN_DB, w.access, o.roadmapId)).roadmap.threadId, null);
  assert.equal((await bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T2 })).body.threadId, T2);
  assert.equal((await currentView(w.LEARN_DB, w.access, o.roadmapId)).roadmap.threadId, T2);
});

test('only the owner binds, and only a saved Chat thread of theirs on this canvas', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  saveThread(w.sqlite, T1, { user: 'u-bob@example.test' });
  saveThread(w.sqlite, T2, { app: 'canvas-0000aaaa' });
  for (const threadId of [undefined, 'not-a-thread', 'repochat-11111111-1111-4111-8111-111111111111']) await rejects(bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId }), 400);
  await rejects(bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: 'canvaschat-33333333-3333-4333-8333-333333333333' }), 404); // not saved yet
  await rejects(bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T1 }), 404); // another person's thread
  await rejects(bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T2 }), 404); // this person's thread on another canvas
  await rejects(bindTutorThread(w.LEARN_DB, accessFor('u-bob', 'lb_board00000000000003'), { roadmapId: o.roadmapId, threadId: T1 }), 404); // another person's roadmap
  assert.equal((await currentView(w.LEARN_DB, w.access, o.roadmapId)).roadmap.threadId, null);
});

test('route: POST /:rm/thread answers the view with the bound thread', async t => {
  const h = await loop(t);
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: 'Teach me', depth: 'balanced', actionKey: KEY('create') });
  saveThread(h.w.sqlite, T1);
  const bound = await h.json('POST', `/api/learn/roadmap/${created.body.roadmapId}/thread`, { boardId: BOARD, threadId: T1 });
  assert.equal(bound.status, 200);
  assert.equal(bound.body.roadmap.threadId, T1);
  assert.equal((await h.status()).roadmap.threadId, T1, 'every device reads it from the status poll');
  assert.equal((await h.json('POST', `/api/learn/roadmap/${created.body.roadmapId}/thread`, { boardId: BOARD, threadId: 'bad' })).status, 400);
});

test('the view names the invitation the roadmap was made from (null without one), so a device binds that invitation\'s thread only', async t => {
  const h = await loop(t);
  const invitation = (await h.json('POST', '/api/learn/roadmap/invitations', { boardId: BOARD, sourceKeys: [`file:${ID_B}`], idleKey: 'idle-1-aaaaaaaa' })).body.invitation;
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, invitationId: invitation.id, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: '', depth: 'balanced', actionKey: KEY('create') });
  assert.equal(created.body.roadmap.invitationId, invitation.id);
  const w = world(t);
  const o = await offered(w, w.access);
  assert.equal((await currentView(w.LEARN_DB, w.access, o.roadmapId)).roadmap.invitationId, null);
});
