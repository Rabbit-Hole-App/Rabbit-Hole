import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFTS_PATH, createDraftSync, emptyAnswer } from './explain-back-drafts.js';

// D's drafts route, in memory: a revision per card; a PUT names the revision it saw; a stale one is a 409 with the current draft.
function fakeServer() {
  const rows = new Map(), calls = [];
  let down = false;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url, 'https://app.test');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path: parsed.pathname, query: Object.fromEntries(parsed.searchParams), body });
    if (down) throw new TypeError('Failed to fetch');
    if (init.method === 'GET') return Response.json({ draft: rows.get(parsed.searchParams.get('cardId')) ?? null });
    const current = rows.get(body.cardId) ?? null;
    if ((current?.revision ?? 0) !== body.expectedRevision) return Response.json({ error: 'draft_conflict', detail: { draft: current } }, { status: 409 });
    if (body.answer === null) { rows.delete(body.cardId); return Response.json({ draft: null }); }
    const draft = { cardId: body.cardId, revision: (current?.revision ?? 0) + 1, answer: body.answer, updatedAt: 't' };
    rows.set(body.cardId, draft);
    return Response.json({ draft });
  };
  return { rows, calls, fetchImpl, setDown: value => { down = value; } };
}
function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return { pending, setTimeout: (fn, ms) => { pending.set(++id, fn); return id; }, clearTimeout: key => pending.delete(key), fire: () => { const fns = [...pending.values()]; pending.clear(); for (const fn of fns) fn(); } };
}
const settle = () => new Promise(r => setTimeout(r, 0));
const make = (server, timers, cardId = 'card-1') => createDraftSync({ app: 'canvas-0123abcd', board: 'main', cardId, fetchImpl: server.fetchImpl, timers });

test('load, a debounced save with the expected revision, and the next save building on it', async () => {
  const server = fakeServer(), timers = fakeTimers();
  const sync = make(server, timers);
  await sync.load();
  assert.deepEqual([sync.get().status, sync.get().revision, sync.get().answer], ['ready', 0, emptyAnswer()]);
  assert.deepEqual(server.calls[0].query, { app: 'canvas-0123abcd', board: 'main', cardId: 'card-1' });
  sync.patch({ text: 'f' }); sync.patch({ text: 'fo' }); sync.patch({ text: 'force' });
  assert.equal(server.calls.length, 1, 'nothing is sent while the learner is still typing');
  timers.fire(); await settle();
  assert.equal(server.calls.length, 2, 'one save for the burst');
  assert.deepEqual([server.calls[1].method, server.calls[1].path, server.calls[1].body.expectedRevision, server.calls[1].body.answer.text], ['PUT', DRAFTS_PATH, 0, 'force']);
  assert.deepEqual([sync.get().status, sync.get().revision], ['saved', 1]);
  const voice = { evidenceId: 'ev_voice_1', role: 'voice', media: 'audio', state: 'ready', assetId: 'aa_voice00000001', revision: 1, hash: 'a'.repeat(64), mime: 'audio/ogg', bytes: 10, durationMs: 1000 };
  sync.patch({ voice: [voice] }); timers.fire(); await settle();
  assert.equal(server.calls.at(-1).body.expectedRevision, 1);
  assert.deepEqual(server.rows.get('card-1').answer, { ...emptyAnswer(), text: 'force', voice: [voice] });
  sync.patch({ recording: undefined }); timers.fire(); await settle();
  assert.equal('recording' in server.rows.get('card-1').answer, false, 'an undefined field is dropped');
  // Another device loads the same draft.
  const other = make(server, timers);
  await other.load();
  assert.deepEqual(other.get().answer, server.rows.get('card-1').answer);
});

test('a conflict is shown and neither side is overwritten until the learner chooses', async () => {
  const server = fakeServer(), timers = fakeTimers();
  const tabA = make(server, timers), tabB = make(server, timers);
  await tabA.load(); await tabB.load();
  tabA.patch({ text: 'from tab A' }); timers.fire(); await settle();
  tabB.patch({ text: 'from tab B' }); timers.fire(); await settle();
  assert.equal(tabB.get().status, 'conflict');
  assert.equal(tabB.get().server.answer.text, 'from tab A');
  assert.equal(tabB.get().answer.text, 'from tab B', 'the local work is kept');
  assert.equal(server.rows.get('card-1').answer.text, 'from tab A', 'the other side is kept');
  tabB.patch({ text: 'from tab B, more' }); timers.fire(); await settle();
  assert.equal(server.rows.get('card-1').answer.text, 'from tab A', 'no save while the conflict is open');
  await tabB.resolve('mine');
  assert.deepEqual([tabB.get().status, server.rows.get('card-1').answer.text], ['saved', 'from tab B, more']);
  tabA.patch({ text: 'A again' }); timers.fire(); await settle();
  assert.equal(tabA.get().status, 'conflict');
  tabA.resolve('theirs');
  assert.deepEqual([tabA.get().status, tabA.get().answer.text, tabA.get().revision], ['saved', 'from tab B, more', 2]);
});

test('offline keeps local work and says so; Retry saves it', async () => {
  const server = fakeServer(), timers = fakeTimers();
  const sync = make(server, timers);
  await sync.load();
  server.setDown(true);
  sync.patch({ text: 'kept' }); timers.fire(); await settle();
  assert.equal(sync.get().status, 'offline');
  assert.match(sync.get().error.message, /kept here/);
  assert.equal(sync.get().answer.text, 'kept');
  server.setDown(false);
  await sync.retry();
  assert.deepEqual([sync.get().status, server.rows.get('card-1').answer.text], ['saved', 'kept']);
});

test('edits made before the load answered never silently replace a stored draft', async () => {
  const server = fakeServer(), timers = fakeTimers();
  server.rows.set('card-1', { cardId: 'card-1', revision: 3, answer: { ...emptyAnswer(), text: 'stored' }, updatedAt: 't' });
  const sync = make(server, timers);
  sync.patch({ text: 'typed early' });
  await sync.load();
  assert.deepEqual([sync.get().status, sync.get().server.answer.text, sync.get().answer.text], ['conflict', 'stored', 'typed early']);
});

test('clear after submit removes the draft; a newer draft from elsewhere is shown, not deleted', async () => {
  const server = fakeServer(), timers = fakeTimers();
  const sync = make(server, timers);
  await sync.load();
  sync.patch({ text: 'submitted' }); timers.fire(); await settle();
  assert.equal(await sync.clear(), true);
  assert.equal(server.rows.has('card-1'), false);
  assert.deepEqual([sync.get().revision, sync.get().answer], [0, emptyAnswer()]);
  sync.patch({ text: 'next draft' }); timers.fire(); await settle();
  const other = make(server, timers);
  await other.load();
  other.patch({ text: 'other tab kept working' }); timers.fire(); await settle();
  assert.equal(await sync.clear(), false);
  assert.equal(sync.get().status, 'conflict');
  assert.equal(server.rows.get('card-1').answer.text, 'other tab kept working');
});
