// The Chat pane's thread helpers (chat-threads.js; chat-workspace-CONTRACT.md A2, A5, B1): the History URL, the
// late-response guard, and how answer_meta, done and the end of a turn change the streamed messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lateEvent, putState, restoredMode, settle, threadsUrl, withAnswerMeta, withDone } from './chat-threads.js';

test('History asks for this canvas only, with a trimmed search and a limit', () => {
  assert.equal(threadsUrl('canvas-0a1b2c3d'), '/api/ask/threads?scope=learn&ref=canvas-0a1b2c3d&limit=30');
  assert.equal(threadsUrl('canvas-0a1b2c3d', '  soft max & co ', 1), '/api/ask/threads?scope=learn&ref=canvas-0a1b2c3d&q=soft%20max%20%26%20co&limit=1');
});

test('an event of a turn sent under another thread key is late', () => {
  assert.equal(lateEvent('canvas-a:new:0', 'canvas-a:new:0'), false);
  assert.equal(lateEvent('canvas-a:new:0', 'canvas-a:new:1'), true); // New chat
  assert.equal(lateEvent('canvas-a:new:1', 'canvas-a:canvaschat-1:2'), true); // a thread opened from History
});

const turn = () => [
  { role: 'user', content: 'Why?', messageId: 'local-q-r1', status: 'done' },
  { role: 'assistant', content: 'Because', id: 'r1', messageId: 'local-r1', status: 'streaming' },
  { role: 'assistant', content: 'Older', id: 'r0', messageId: '7', status: 'done' },
];

test('answer_meta sets kind and meta on the reply only, exactly as received', () => {
  const syllabus = { journeyId: 'j1', topics: [] };
  const [user, reply, other] = withAnswerMeta(turn(), 'r1', { messageId: '9', kind: 'syllabus', actions: [], followUps: [{ id: 'f1', text: 'Next?', kind: 'next' }], alternatives: ['9'], syllabus });
  assert.deepEqual(reply.meta, { actions: [], followUps: [{ id: 'f1', text: 'Next?', kind: 'next' }], alternatives: ['9'], syllabus });
  assert.equal(reply.kind, 'syllabus');
  assert.equal(reply.messageId, 'local-r1'); // done names the ids
  assert.deepEqual([user, other], turn().filter((_, i) => i !== 1));
});

test('done swaps the local ids for the server ids and finishes the reply', () => {
  const [user, reply, other] = withDone(turn(), 'r1', { threadId: 'canvaschat-1', userMessageId: 8, messageId: '9' });
  assert.deepEqual([user.messageId, reply.messageId, reply.status, other.messageId], ['8', '9', 'done', '7']);
  const stopped = withDone(settle(turn(), 'r1', 'stopped'), 'r1', { messageId: 9 });
  assert.equal(stopped[1].status, 'stopped');
});

test('the end of a turn settles only a reply still streaming, and keeps its text', () => {
  const [, reply] = settle(turn(), 'r1', 'stopped');
  assert.deepEqual([reply.status, reply.content], ['stopped', 'Because']);
  assert.equal(settle(settle(turn(), 'r1', 'error'), 'r1', 'done')[1].status, 'error');
  assert.equal(settle(turn(), 'r1', 'done')[2].status, 'done');
});

// R4 A3: entering the Table of contents holds Tutor; a thread restored after that keeps it until the hold ends (a pick or leaving).
test('a restored thread shows the held mode over its saved one, and its saved mode once nothing is held', () => {
  assert.equal(restoredMode('tutor', 'ask'), 'tutor');
  assert.equal(restoredMode(null, 'ask'), 'ask');
  assert.equal(restoredMode(null, undefined), 'auto');
});

// Review 2026-10-20 (P2): a failed state save was dropped silently. Now it says why and stays pending under the next change.
test('a state save that fails says why and stays pending for the next change; a large state is not sent keepalive', async () => {
  const told = [];
  globalThis.window = Object.assign(new EventTarget(), { dispatchEvent: event => { told.push(event.detail.message); return true; } });
  const sent = [], ok = async (url, init) => { sent.push({ url, init }); return {}; };
  const pending = { current: null };
  assert.equal(await putState({ id: 'canvaschat-a', state: { mode: 'ask' } }, ok, pending), true);
  assert.deepEqual([sent[0].url, sent[0].init.method, sent[0].init.keepalive], ['/api/learn/chat/threads/canvaschat-a/state', 'PUT', true]);
  const big = { contextRefs: [{ sourceId: 'excerpt:pdfx_x', kind: 'excerpt', text: 'q'.repeat(70000) }] };
  await putState({ id: 'canvaschat-a', state: big }, ok, pending);
  assert.equal(sent[1].init.keepalive, false, 'keepalive is refused past 64 KB, so a long excerpt state goes as a plain PUT');
  const refuse = async () => { throw Object.assign(new Error('Invalid context: at most 20 sources, each a valid reference'), { status: 400 }); };
  pending.current = { id: 'canvaschat-a', state: { draft: { text: 'newer' } } }; // a change made while the save was in flight
  await assert.rejects(putState({ id: 'canvaschat-a', state: { contextRefs: big.contextRefs, draft: { text: 'older' } } }, refuse, pending));
  assert.deepEqual(pending.current, { id: 'canvaschat-a', state: { contextRefs: big.contextRefs, draft: { text: 'newer' } } }, 'kept, the newer change winning');
  assert.equal(told.at(-1), "✗ This chat's attachments or draft were not saved: Invalid context: at most 20 sources, each a valid reference. They are saved again with your next change.");
  pending.current = { id: 'canvaschat-b', state: { mode: 'tutor' } }; // another thread opened since: its own pending is untouched
  await assert.rejects(putState({ id: 'canvaschat-a', state: { mode: 'ask' } }, refuse, pending));
  assert.deepEqual(pending.current, { id: 'canvaschat-b', state: { mode: 'tutor' } });
  assert.doesNotMatch(told.at(-1), /saved again/, 'never a promise it cannot keep');
  delete globalThis.window;
});
