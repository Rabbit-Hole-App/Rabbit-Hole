// Task 04 (C:/s/spec/tutor-workflow/draft.md "Choose the correct entry state", "Choose the current learning focus",
// "Returning learner workflow"; owner 3a): which static entry a canvas shows, and what a request is about. Pure; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoachingRecord } from './learn-coaching-contract.js';
import { checkpointOf, entryAction, entryCopy, resolveLearningFocus, resolveTutorEntry, stillCurrent } from './learn-coaching-entry.js';

const ON = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 3 };
const criterion = { criterionId: 'c1', version: 1, label: 'Read a threshold', requirement: 'Explain what moving the threshold changes', requiresReasoning: true, rubricVersion: 'r1' };
const goal = { goalId: 'g1', label: 'Logistic regression thresholds', scopeVersion: 1, lifecycle: 'open', status: 'active', criteria: [criterion], revision: 1, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' };
const activity = { activityId: 'a1', goalId: 'g1', revision: 2, status: 'in_progress', objective: 'Threshold comparison', prompt: 'Which threshold catches more positives, and what does it cost?', responseKind: 'text', criterionRefs: [{ criterionId: 'c1', version: 1 }], sourceRefs: [], checkpoint: { blockIds: ['k-threshold'] }, updatedAt: '2026-10-20T00:00:00Z' };
const state = { controls: ON, goals: [goal], activeGoalId: 'g1', activeActivityId: 'a1', activities: [activity], revision: 3 };
const entry = over => resolveTutorEntry({ loadState: 'ready', controls: ON, checkpoint: {}, workspace: { content: 0, history: false }, interaction: {}, ...over });
const valid = decision => assert.deepEqual(validateCoachingRecord('EntryDecision', decision), { ok: true, errors: [] });

test('a true blank canvas in Tutor On: the static welcome, a goal choice, no activity', () => {
  const d = entry();
  valid(d);
  assert.deepEqual([d.kind, d.messageKey, d.allowedActions], ['welcome', 'welcome_new', ['set_goal']]);
  assert.match(entryCopy(d), /^What would you like to learn or work on here\?/);
});

test('failed_restore_is_not_new_learner: loading or a failed restore never reads a blank canvas as new', () => {
  for (const loadState of ['loading', 'error']) {
    const d = entry({ loadState });
    valid(d);
    assert.notEqual(d.kind, 'welcome');
    assert.equal(entryCopy(d), '', 'no welcome words');
  }
  assert.deepEqual([entry({ loadState: 'error' }).kind, entry({ loadState: 'error' }).allowedActions], ['recovery', ['retry']]);
});

test('an independent drawing or notes: help is offered, nothing is assigned or assessed; Auto, Ask, Off and paused stay quiet', () => {
  const d = entry({ workspace: { content: 3, history: true } });
  valid(d);
  assert.deepEqual([d.kind, d.allowedActions, d.activityRef], ['existing_work', ['explain', 'review', 'build_lesson'], undefined]);
  for (const controls of [{ ...ON, mode: 'auto' }, { ...ON, mode: 'ask' }, { ...ON, tutorEnabled: false }, { ...ON, suggestionsPaused: true }]) {
    assert.equal(entry({ controls, workspace: { content: 3 } }).kind, 'quiet', JSON.stringify(controls));
  }
  assert.equal(entryAction('review').event, 'check_review', 'Review my work is the learner\'s explicit check');
});

test('a cleared canvas with history is not a new learner: a neutral prompt, never the first-visit welcome', () => {
  const d = entry({ workspace: { content: 0, history: true } });
  assert.deepEqual([d.kind, d.messageKey], ['welcome', 'welcome_back']);
  assert.doesNotMatch(entryCopy(d), /here\? Tell me a topic/);
});

test('current_drawing_survives_resume: a saved task plus newer edits resumes the task by reference and never restores a snapshot', () => {
  const d = entry({ checkpoint: checkpointOf(state), workspace: { content: 5, history: true } });
  valid(d);
  assert.deepEqual([d.kind, d.allowedActions, d.messageKey], ['resume', ['continue', 'recap', 'quick_check'], 'not_submitted']);
  assert.deepEqual([d.activityRef.activityId, d.activityRef.revision, d.activityRef.goalRef], ['a1', 2, { goalId: 'g1', scopeVersion: 1 }]);
  assert.equal(Object.keys(d).some(key => /snapshot|board|restore/i.test(key)), false, 'nothing replaces the canvas');
  assert.deepEqual(entryAction('continue'), { label: 'Continue where I left off', focus: true }, 'Continue only brings the saved task into view');
  assert.match(entryCopy(d, checkpointOf(state)), /Logistic regression thresholds\. Threshold comparison: answer not submitted/);
});

test('the three return choices, and a finished activity offers a review or a next goal instead of Continue', () => {
  const checkpoint = checkpointOf(state);
  assert.deepEqual(['continue', 'recap', 'quick_check'].map(a => entryAction(a, checkpoint).label), ['Continue where I left off', 'Short recap', 'Quick check']);
  assert.equal(entryAction('recap', checkpoint).send, 'Give me a short recap of Logistic regression thresholds.', 'a recap is an explicit request, sent as the learner\'s own');
  const done = entry({ checkpoint: { goal, activity: { ...activity, status: 'completed' } } });
  assert.deepEqual([done.kind, done.allowedActions], ['completed', ['review', 'next_goal']]);
  assert.equal(entry({ checkpoint: { goal, activity: { ...activity, status: 'feedback_ready' } } }).messageKey, 'feedback_ready');
  // A goal paused by a topic switch is not the active one: no Continue onto it.
  assert.deepEqual(checkpointOf({ ...state, goals: [{ ...goal, status: 'paused' }] }), { goal: null, activity: null });
});

test('input wins: typing, an upload or a turn in flight hides the entry; the learner\'s own action is never interrupted', () => {
  for (const interaction of [{ typing: true }, { uploading: true }, { busy: true }]) assert.deepEqual([entry({ interaction }).kind, entry({ interaction }).messageKey], ['quiet', 'input']);
});

test('explicit_topic_beats_title: a KNN request on a Logistic Regression canvas is answered as asked, whatever the title', () => {
  const request = { text: 'Help me understand how KNN chooses a class.' };
  const decisions = ['Logistic Regression', 'Test Canvas', '', 'KNN'].map(title => resolveLearningFocus({ request, activeActivity: null, title }));
  for (const d of decisions) assert.equal(validateCoachingRecord('FocusDecision', d).ok, true);
  assert.deepEqual(new Set(decisions.map(d => JSON.stringify(d))).size, 1, 'the title changes nothing');
  assert.equal(decisions[0].kind, 'answer');
  assert.equal(resolveLearningFocus({ title: 'Logistic Regression' }).kind, 'clarify', 'no request: ask, never start the title as a lesson');
});

test('aside_does_not_replace_goal: a brief question answers and leaves the activity; "teach me KNN instead" is a new goal', () => {
  const active = entry({ checkpoint: checkpointOf(state) }).activityRef;
  const aside = resolveLearningFocus({ request: { text: 'Wait, what is a sigmoid again?' }, activeActivity: active });
  assert.deepEqual([aside.kind, aside.goalRef, aside.activityRef], ['answer', undefined, undefined], 'no goal change, no activity taken over');
  const switched = resolveLearningFocus({ request: { text: 'Teach me KNN instead', intent: 'new_goal' }, activeActivity: active });
  assert.equal(switched.kind, 'create_goal');
  const back = resolveLearningFocus({ request: { text: 'Back to my threshold exercise', intent: 'resume' }, activeActivity: active });
  assert.deepEqual([back.kind, back.activityRef.activityId], ['resume', 'a1']);
});

test('repository_does_not_gate_water_cycle: an attached repository is never pulled into an unrelated question', () => {
  const repo = { kind: 'repository', id: 'repo-taskboard', version: 'c0ffee1' };
  const d = resolveLearningFocus({ request: { text: 'Why do clouds form?' }, candidateSources: [repo], explicitRefs: [] });
  assert.deepEqual([d.kind, d.sourceRefs], ['answer', []]);
  const asked = resolveLearningFocus({ request: { text: 'How does this compute the percentage?' }, candidateSources: [repo], explicitRefs: [repo] });
  assert.deepEqual(asked.sourceRefs, [repo], 'only when the learner attaches it');
});

test('late_result_stays_with_origin: a result is current only for its own learner, canvas, goal and activity revision', () => {
  const origin = { userId: 'u1', app: 'canvas-0a1b2c3d', board: 'main', goalId: 'g1', activityId: 'a1', activityRevision: 2 };
  assert.equal(stillCurrent(origin, { ...origin }), true);
  for (const [key, value] of [['goalId', 'g2'], ['activityRevision', 3], ['app', 'canvas-ffffffff'], ['userId', 'u2'], ['board', 'review-main']]) {
    assert.equal(stillCurrent(origin, { ...origin, [key]: value }), false, key);
  }
  assert.equal(stillCurrent(null, origin), false);
});
