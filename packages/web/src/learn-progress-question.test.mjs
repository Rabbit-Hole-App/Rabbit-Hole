// Tutor Task 10 (C:/s/spec/tutor-workflow/draft.md), the browser half: the progress chip's scope, "Ask tutor about this" and
// "Question this feedback" as draft actions, and filing a review only at Send. The browser check
// (e2e/progress-chat-check.mjs) drives the same pieces in the real composer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS } from './learn-coaching-contract.js';
import { appendDraft, draftSlot } from './chat-draft.js';
import { attachedReducer } from './chat-context.js';
import { PROGRESS_LIMITS, askTutorAbout, fileReviews, progressRef, progressScope, reviewKey } from './learn-progress-question.js';

const GOAL = { goalId: 'lg_knn', label: 'Predict a class using KNN' };
const ev = (n, extra = {}) => ({ observationId: `ob_${n}`, attemptId: `at_${n}`, assessmentId: `as_${n}`, observedAt: `2026-10-${10 + n}T10:00:00.000Z`, ...extra });
const VIEW = { goalRef: { goalId: 'lg_knn', scopeVersion: 2 }, summaryRevision: 4242, criteria: [{ criterionId: 'vote', version: 1, label: 'Explain the majority vote', evidence: [ev(1), ev(2)] }] };
const VOTE = VIEW.criteria[0];

// A chat workspace double with the provider's real draft and attachment rules (chat-workspace.jsx prepare: open Chat,
// attach, draft rule, focus). It records every call, so anything that sends or changes the mode shows up.
function chatDouble(text = '') {
  const calls = [];
  const chat = {
    mode: 'tutor', draft: { text, command: '/explain', savedAt: 1 }, refs: [], sent: 0,
    thread: { setMode: mode => { calls.push(['setMode', mode]); chat.mode = mode; } },
    send: () => { chat.sent += 1; },
  };
  chat.composer = {
    get text() { return chat.draft.text; },
    prepare: (options = {}) => {
      calls.push(['prepare', Object.keys(options).sort()]);
      if (options.mode) chat.thread.setMode(options.mode);
      options.contextRefs?.forEach(ref => { chat.refs = attachedReducer(chat.refs, { type: 'attach', ref }); });
      chat.draft = draftSlot(chat.draft, { type: 'prepare', text: options.text, command: options.command });
      calls.push(['focus']);
    },
  };
  return { chat, calls };
}

test('progressRef: a skill chip names its goal and skill, the view revision and the evidence on screen, within the ref limits', () => {
  const ref = progressRef({ goal: GOAL, view: VIEW, criterion: VOTE });
  assert.deepEqual(ref, {
    sourceId: 'progress:lg_knn', kind: 'progress', name: 'Predict a class using KNN · Explain the majority vote', version: '4242',
    range: { goalRefs: [{ goalId: 'lg_knn', scopeVersion: 2 }], criterionRefs: [{ criterionId: 'vote', version: 1 }], dimensions: DIMENSIONS, observationIds: ['ob_1', 'ob_2'], summaryRevision: 4242 },
  });
  assert.equal(progressRef({ goal: GOAL, view: VIEW }).name, 'Predict a class using KNN');
  // The newest observations are kept past the limit, and the whole ref stays under chat-modes.js's 2 KB.
  const many = { ...VOTE, evidence: Array.from({ length: 40 }, (_, i) => ev(i, { observationId: `ob_${crypto.randomUUID()}` })) };
  const big = progressRef({ goal: GOAL, view: VIEW, criterion: many });
  assert.equal(big.range.observationIds.length, PROGRESS_LIMITS.observations);
  assert.equal(big.range.observationIds.at(-1), many.evidence.at(-1).observationId);
  assert.ok(new TextEncoder().encode(JSON.stringify(big)).length <= 2048);
  // A review chip names the judgment it questions and the board its attempt lives on.
  const review = progressRef({ goal: GOAL, view: VIEW, criterion: VOTE, evidence: ev(2), board: 'main' });
  assert.equal(review.name, 'Review · Explain the majority vote · 12 Oct');
  assert.deepEqual([review.range.observationIds, review.range.review], [['ob_2'], { attemptId: 'at_2', assessmentId: 'as_2', board: 'main' }]);
});

test('progressScope: only the contract\'s fields, bounded, rebuilt from known keys', () => {
  const ok = progressRef({ goal: GOAL, view: VIEW, criterion: VOTE }).range;
  assert.deepEqual(progressScope({ ...ok, timeRange: { from: '2026-10-01T00:00:00.000Z' } }).timeRange, { from: '2026-10-01T00:00:00.000Z' });
  for (const [bad, why] of [
    [{ ...ok, ownerUserId: 'u-1' }, /question scope only/],
    [{ ...ok, goalRefs: [] }, /1-8 goals/],
    [{ ...ok, dimensions: ['mastery'] }, /dimensions/],
    [{ ...ok, summaryRevision: -1 }, /summaryRevision/],
    [{ ...ok, timeRange: { since: 'yesterday' } }, /timeRange/],
    [{ ...ok, review: { attemptId: 'at_1', assessmentId: 'as_1' } }, /review is/],
    [{ ...ok, review: { attemptId: '../x', assessmentId: 'as_1', board: 'main' } }, /review is/],
    [null, /question scope only/],
  ]) assert.throws(() => progressScope(bad), why);
});

test('attach_context_does_not_send: Ask tutor about this attaches, keeps the mode, the Tutor switch and a written draft, and waits for Send', () => {
  const ref = progressRef({ goal: GOAL, view: VIEW, criterion: VOTE });
  // A written draft is kept exactly; the suggestion is not appended to it.
  const written = chatDouble('my half-written answer');
  assert.equal(askTutorAbout(written.chat, ref, 'Why does this still say with help?'), true);
  assert.deepEqual(written.calls, [['prepare', ['contextRefs']], ['focus']], 'no mode, no text: only the ref');
  assert.deepEqual([written.chat.mode, written.chat.draft.text, written.chat.draft.command, written.chat.sent], ['tutor', 'my half-written answer', '/explain', 0]);
  assert.deepEqual(written.chat.refs, [ref]);
  // An empty composer gets the suggestion, as a draft only.
  const empty = chatDouble('');
  askTutorAbout(empty.chat, ref, 'Why does this still say with help?');
  assert.deepEqual([empty.chat.mode, empty.chat.draft.text, empty.chat.sent], ['tutor', 'Why does this still say with help?', 0]);
  assert.ok(!empty.calls.some(([name]) => name === 'setMode'));
  // Asking again about the same skill does not attach it twice (attachedReducer de-duplicates by scope).
  askTutorAbout(empty.chat, ref, 'again');
  assert.deepEqual([empty.chat.refs.length, empty.chat.draft.text], [1, 'Why does this still say with help?']);
  assert.equal(askTutorAbout(null, ref), false, 'no chat workspace: nothing happens');
  // The house draft rule this relies on: prepare without text leaves the draft as it was.
  assert.equal(appendDraft('kept', undefined), 'kept');
});

test('fileReviews: only at Send, only for review chips, one stable key per questioned assessment, never blocking the message', async () => {
  const skill = progressRef({ goal: GOAL, view: VIEW, criterion: VOTE });
  const review = progressRef({ goal: GOAL, view: VIEW, criterion: VOTE, evidence: ev(2), board: 'main' });
  const posts = [];
  const post = async (path, body) => { posts.push([path, body]); return { assessment: { status: 'completed' } }; };
  assert.deepEqual(await fileReviews([skill], { app: 'canvas-0a1b2c3d', post }), []);
  assert.deepEqual(posts, [], 'a question files nothing');
  assert.deepEqual(await fileReviews([skill, review, { kind: 'doc', sourceId: 'doc:1' }], { app: 'canvas-0a1b2c3d', post }), [{ assessmentId: 'as_2', ok: true, status: 'completed' }]);
  assert.deepEqual(posts, [['/api/learn/tutor/attempts/at_2/reassess', { app: 'canvas-0a1b2c3d', board: 'main', requestKey: 'dispute-as_2', dispute: true }]]);
  assert.match(reviewKey('as_0b6f1e2a-1c1d-4c3b-9f0e-7d1c2b3a4f5e'), /^[A-Za-z0-9_-]{8,128}$/, 'the attempt route takes the key');
  const failed = await fileReviews([review], { app: 'canvas-0a1b2c3d', post: async () => { throw new Error('assessment_in_progress'); } });
  assert.deepEqual(failed, [{ assessmentId: 'as_2', ok: false, error: 'assessment_in_progress' }]);
});
