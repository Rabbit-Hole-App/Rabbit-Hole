// The Progress pane's data (C:/s/spec/tutor-workflow/draft.md Task 09, "Progress UI and access"): a read of the learner's
// saved progress for one goal, and the plain view model the pane draws from it. Reading progress is read only: no model call,
// no assessment, no change to the active goal (viewing another goal is UI state; Resume is a separate coaching action).
import { CRITERION_STATUS, validateCoachingRecord } from './learn-coaching-contract.js';

export const progressUrl = ({ app, board, goalId }) => `/api/learn/progress?app=${encodeURIComponent(app)}&board=${encodeURIComponent(board)}${goalId ? `&goalId=${encodeURIComponent(goalId)}` : ''}`;

// GET /api/learn/progress (Task 08, control-plane learn-progress.js progressRoute) -> { progress: ProgressView }. A reply that
// is not a ProgressView is an error, never an empty history.
export async function fetchProgress(call, scope, goalId) {
  const out = await call(progressUrl({ ...scope, goalId }));
  const view = out?.progress;
  if (!validateCoachingRecord('ProgressView', view).ok) throw Object.assign(new Error('Progress could not be read.'), { code: 'invalid' });
  return view;
}

export const STATUS_LABEL = {
  demonstrated_independently: 'Demonstrated independently',
  demonstrated_with_help: 'Demonstrated with help',
  practising: 'Practising',
  needs_review: 'Needs review',
  not_checked: 'Not checked',
};
// Why this status, from the derivation's reason (deriveCriterionSummary), in the learner's words.
export const REASON_TEXT = {
  independent_support: 'You showed this in a saved answer without help.',
  assisted_support: 'Your answer met this with help. Try a fresh example on your own to show it independently.',
  help_not_recorded: 'Your answer met this, but whether you had help was not recorded, so it is not counted yet.',
  incomplete_support: 'Your answers so far are partly there.',
  transfer_not_shown: 'You met this on the example you practised; it counts once you apply it to a new case.',
  disputed: 'You questioned this feedback; it stays as it was until it is reviewed.',
  unresolved_conflict: 'Your answers point different ways, so this needs a review.',
  later_contradiction: 'A later answer did not hold up, so this needs a review.',
  not_interpretable: 'Your answers could not be assessed yet.',
  no_evidence: 'Nothing submitted for this yet.',
};

// progressModel({ goals, activeGoalId, viewedGoalId, load: { status, view, offline } }) -> what the pane shows.
//   state 'no_goal' | 'loading' | 'error' | 'ready'. A failed read is 'error' (with Retry), never empty progress; while a
//   newer read is on its way the last confirmed view stays (stale), so nothing flashes to zero.
//   The count is the skill rows' own: each criterion once, demonstrated independently out of all rows.
export function progressModel({ goals = [], activeGoalId = null, viewedGoalId = null, load = {} }) {
  const shown = goals.filter(goal => goal.lifecycle !== 'archived');
  if (!shown.length) return { state: 'no_goal', goals: [] };
  const viewed = shown.find(goal => goal.goalId === viewedGoalId) || shown.find(goal => goal.goalId === activeGoalId) || shown[0];
  const active = shown.find(goal => goal.goalId === activeGoalId) || null;
  const base = {
    goals: shown.map(goal => ({ goalId: goal.goalId, label: goal.label, active: goal.goalId === activeGoalId })),
    viewed, active, viewingOther: !!active && viewed.goalId !== active.goalId,
  };
  const view = load.view?.goalRef?.goalId === viewed.goalId ? load.view : null;
  if (!view) return { ...base, state: load.status === 'error' ? 'error' : 'loading' };
  const labels = new Map((viewed.criteria || []).map(c => [c.criterionId, c.label]));
  const rows = view.criteria.map(row => ({
    criterionId: row.criterionId,
    label: row.label || labels.get(row.criterionId) || row.criterionId,
    status: CRITERION_STATUS.includes(row.status) ? row.status : 'not_checked',
    reason: REASON_TEXT[row.reason] || '',
    evidence: Array.isArray(row.evidenceIds) ? row.evidenceIds.length : 0,
    // Dated history (learn-progress.js), newest first, for More about this skill; superseded results stay, labelled.
    history: (Array.isArray(row.evidence) ? row.evidence : []).slice().reverse(),
    application: row.application?.status === 'applied',
    retention: row.retention?.status === 'recalled',
  }));
  return {
    ...base, state: 'ready', rows,
    count: rows.filter(row => row.status === 'demonstrated_independently').length, total: rows.length,
    pending: view.pendingAssessments.length, unavailable: Array.isArray(view.unavailableAssessments) ? view.unavailableAssessments.length : 0, savedAt: view.savedAt || null, nextAction: view.nextAction || null,
    stale: load.status === 'loading' || load.status === 'error', failed: load.status === 'error', offline: !!load.offline,
  };
}
