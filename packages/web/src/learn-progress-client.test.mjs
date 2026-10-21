// Task 09 (C:/s/spec/tutor-workflow/draft.md "Progress UI and access", "Other interface states"): the Progress pane's read and
// view model. Pure; no network beyond the fake call, no model. The rendered pane, both columns, resize, focus and the kept
// draft are e2e/tutor-progress-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveGoalCounts } from './learn-coaching-contract.js';
import { fetchProgress, progressModel, progressUrl } from './learn-progress-client.js';

const crit = (id, label) => ({ criterionId: id, version: 1, label, requirement: `Show ${label}`, requiresReasoning: false, rubricVersion: 'r1' });
const knn = { goalId: 'g-knn', label: 'Predict a class using KNN', scopeVersion: 1, lifecycle: 'open', status: 'active', criteria: [crit('c1', 'Identify nearest neighbours'), crit('c2', 'Explain the majority vote'), crit('c3', 'Explain what changes with k')], revision: 1, createdAt: 'x', updatedAt: 'x' };
const reg = { ...knn, goalId: 'g-reg', label: 'Logistic regression thresholds', status: 'paused', criteria: [crit('r1', 'Read a threshold')] };
const obs = (id, criterionId, over = {}) => ({ observationId: id, attemptId: `at-${id}`, assessmentId: `as-${id}`, assessmentStatus: 'completed', criterionId, criterionVersion: 1, fit: 'met', reasoning: 'not_required', assistance: 'none', validity: 'valid', observedAt: '2026-10-20T10:00:00Z', ...over });
// A ProgressView as Task 08 derives it (deriveGoalCounts' summaries are the criteria rows).
const viewOf = (goal, observations, over = {}) => {
  const { total, counts, summaries } = deriveGoalCounts({ criteria: goal.criteria, observations });
  return { goalRef: { goalId: goal.goalId, scopeVersion: goal.scopeVersion }, summaryRevision: 3, derivationVersion: 1, criteria: summaries, counts: { total, ...counts }, pendingAssessments: [], savedAt: '2026-10-20T10:05:00Z', ...over };
};
const knnView = viewOf(knn, [obs('o1', 'c1'), obs('o2', 'c2', { assistance: 'assisted' })], { nextAction: { label: 'Explain the vote in a new neighbour arrangement, without a hint.', prompt: 'Give me a fresh KNN example to explain without a hint.', actionLabel: 'Try a fresh example' } });

test('counts_match_skill_rows: the count is the rows demonstrated independently, out of every row, each skill once', () => {
  const m = progressModel({ goals: [knn, reg], activeGoalId: 'g-knn', load: { status: 'ready', view: knnView } });
  assert.equal(m.state, 'ready');
  assert.deepEqual(m.rows.map(r => [r.label, r.status]), [['Identify nearest neighbours', 'demonstrated_independently'], ['Explain the majority vote', 'demonstrated_with_help'], ['Explain what changes with k', 'not_checked']]);
  assert.deepEqual([m.count, m.total], [1, 3]);
  assert.equal(m.count, m.rows.filter(r => r.status === 'demonstrated_independently').length);
  assert.match(m.rows[1].reason, /with help/);
  // Two observations of one skill are still one row and one count.
  const twice = viewOf(knn, [obs('o1', 'c1'), obs('o3', 'c1')]);
  assert.deepEqual(progressModel({ goals: [knn], activeGoalId: 'g-knn', load: { status: 'ready', view: twice } }).count, 1);
});

test('viewing_goal_is_read_only: another goal is shown without switching; Resume is offered for the still-active goal', () => {
  const regView = viewOf(reg, []);
  const m = progressModel({ goals: [knn, reg], activeGoalId: 'g-knn', viewedGoalId: 'g-reg', load: { status: 'ready', view: regView } });
  assert.deepEqual([m.viewed.goalId, m.active.goalId, m.viewingOther], ['g-reg', 'g-knn', true]);
  assert.deepEqual(m.goals.map(g => [g.goalId, g.active]), [['g-knn', true], ['g-reg', false]]);
  // The pane changes the active goal only through Resume this goal (coaching activate_goal), never by viewing.
  const pane = readFileSync(new URL('./LearnProgress.jsx', import.meta.url), 'utf8');
  assert.equal((pane.match(/coaching\.act\(/g) || []).length, 1, 'one coaching write in the pane');
  assert.match(pane, /const resume = async \(\) => \{\n\s+setResuming\(true\);\n\s+try \{ await coaching\.act\('activate_goal', \{ goalId \}\);/);
  assert.match(pane, /onChange=\{event => \{ setViewedGoalId\(event\.target\.value\); setExpanded\(null\); \}\}/, 'the selector sets view state only');
  assert.doesNotMatch(pane, /api\/learn\/(ask|tutor)|\/attempts|reassess/, 'no model, attempt or reassessment route from here');
});

test('error_is_not_empty_progress: a failed read says so with Retry; a failed refresh keeps the last confirmed view, marked', () => {
  const failed = progressModel({ goals: [knn], activeGoalId: 'g-knn', load: { status: 'error', view: null } });
  assert.deepEqual([failed.state, failed.rows, failed.count], ['error', undefined, undefined]);
  const kept = progressModel({ goals: [knn], activeGoalId: 'g-knn', load: { status: 'error', view: knnView } });
  assert.deepEqual([kept.state, kept.count, kept.failed, kept.stale], ['ready', 1, true, true]);
  const none = progressModel({ goals: [], load: { status: 'ready' } });
  assert.equal(none.state, 'no_goal', 'no goal is its own state, never 0%');
});

test('pending_does_not_flash_zero: loading keeps the last confirmed counts; pending feedback is named beside them', () => {
  const loading = progressModel({ goals: [knn], activeGoalId: 'g-knn', load: { status: 'loading', view: knnView } });
  assert.deepEqual([loading.state, loading.count, loading.stale], ['ready', 1, true]);
  const first = progressModel({ goals: [knn], activeGoalId: 'g-knn', load: { status: 'loading', view: null } });
  assert.deepEqual([first.state, first.count], ['loading', undefined], 'nothing yet is loading, never zero');
  const pending = progressModel({ goals: [knn], activeGoalId: 'g-knn', load: { status: 'ready', view: { ...knnView, pendingAssessments: ['as-9'] } } });
  assert.deepEqual([pending.pending, pending.count], [1, 1]);
  // Another goal's view never shows under this goal's name while its own read is on its way.
  const switched = progressModel({ goals: [knn, reg], activeGoalId: 'g-knn', viewedGoalId: 'g-reg', load: { status: 'loading', view: knnView } });
  assert.equal(switched.state, 'loading');
});

test('fetchProgress: one GET for the goal; anything but a ProgressView is an error', async () => {
  const calls = [];
  const view = await fetchProgress(async path => { calls.push(path); return { view: knnView }; }, { app: 'canvas-0a1b2c3d', board: 'main' }, 'g-knn');
  assert.deepEqual([calls, view.goalRef.goalId], [[progressUrl({ app: 'canvas-0a1b2c3d', board: 'main', goalId: 'g-knn' })], 'g-knn']);
  assert.equal(calls[0], '/api/learn/progress?app=canvas-0a1b2c3d&board=main&goalId=g-knn');
  assert.equal((await fetchProgress(async () => knnView, { app: 'a', board: 'main' }, 'g-knn')).goalRef.goalId, 'g-knn', 'a bare ProgressView too');
  // The real route (learn-progress.js progressRoute) answers { progress }.
  assert.equal((await fetchProgress(async () => ({ progress: knnView }), { app: 'a', board: 'main' }, 'g-knn')).goalRef.goalId, 'g-knn', 'the route envelope');
  await assert.rejects(fetchProgress(async () => ({ view: { criteria: [] } }), { app: 'a', board: 'main' }, 'g'), /could not be read/);
});
