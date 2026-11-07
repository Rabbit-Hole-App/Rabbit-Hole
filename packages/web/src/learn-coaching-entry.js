// Which Tutor entry a canvas shows, and what a learner's request is about (C:/s/spec/tutor-workflow/draft.md Task 04,
// "Choose the correct entry state", "Choose the current learning focus"; owner decisions 3a and 4a). Pure: the decisions
// read saved state and the learner's explicit input only, and neither calls a model or a route. The canvas title is never
// read: it cannot start, refuse or redirect anything.
import { canCoach } from './learn-coaching-contract.js';

const ref = (activity, goal) => ({
  activityId: activity.activityId, revision: activity.revision, goalRef: { goalId: goal.goalId, scopeVersion: goal.scopeVersion },
  criterionRefs: activity.criterionRefs || [], sourceRefs: activity.sourceRefs || [], prompt: activity.prompt,
  ...(activity.checkpoint ? { checkpoint: activity.checkpoint } : {}),
});
const decision = (kind, allowedActions = [], extra = {}) => ({ kind, sourceRefs: [], allowedActions, ...extra });

// The saved activity a return resumes: the active goal's current activity (CoachingState.activities), else none.
export function checkpointOf(state) {
  const goal = state?.goals?.find(g => g.goalId === state.activeGoalId && g.status === 'active') || null;
  const activity = goal && state.activities?.find(a => a.activityId === state.activeActivityId && a.goalId === goal.goalId) || null;
  return { goal, activity };
}

// resolveTutorEntry({ loadState, controls, checkpoint, workspace, interaction }) -> EntryDecision
//   loadState   'loading' | 'error' | 'ready': the learner's saved controls, conversation and canvas, all resolved first. A
//               blank-looking canvas while any of them loads or failed is never a new learner (draft "Choose the correct
//               entry state").
//   controls    TutorControls; only selected, enabled, unpaused Tutor shows an entry (owner 3a), always static.
//   checkpoint  checkpointOf(state): { goal, activity }.
//   workspace   { content: number of cards and objects, history: a conversation or goals exist }.
//   interaction { typing, uploading, busy }: the learner's own action wins; no generic welcome interrupts it.
export function resolveTutorEntry({ loadState, controls, checkpoint = {}, workspace = {}, interaction = {} }) {
  if (loadState === 'loading') return decision('loading');
  if (loadState !== 'ready') return decision('recovery', ['retry'], { messageKey: 'restore_failed' });
  if (!canCoach(controls, { chatOpen: true, ready: true })) return decision('quiet', [], { messageKey: controls?.mode !== 'tutor' ? 'mode' : controls.tutorEnabled ? 'paused' : 'off' });
  if (interaction.typing || interaction.uploading || interaction.busy) return decision('quiet', [], { messageKey: 'input' });
  const { goal = null, activity = null } = checkpoint;
  if (goal && activity && activity.status === 'completed') return decision('completed', ['review', 'next_goal'], { activityRef: ref(activity, goal), messageKey: 'completed' });
  if (goal && activity && activity.status !== 'skipped') {
    return decision('resume', ['continue', 'recap', 'quick_check'], { activityRef: ref(activity, goal), messageKey: activity.status === 'feedback_ready' ? 'feedback_ready' : activity.status === 'awaiting_feedback' ? 'awaiting_feedback' : 'not_submitted' });
  }
  // Drawings, notes and sources with no tutor task stay the learner's own work: help is offered, nothing is assigned.
  if ((workspace.content || 0) > 0) return decision('existing_work', ['explain', 'review', 'build_lesson'], { messageKey: 'existing_work' });
  return decision('welcome', ['set_goal'], { messageKey: workspace.history ? 'welcome_back' : 'welcome_new' });
}

// resolveLearningFocus({ request, explicitRefs, activeActivity, candidateSources, title }) -> FocusDecision
//   request          { text, intent? }: intent is the existing resolver's or an explicit control's - 'resume' (back to a
//                    paused goal, Continue), 'new_goal' ("Teach me KNN instead", Start this activity) - never a new
//                    per-keystroke classifier. Any other request is an answer: an aside keeps the current goal resumable.
//   explicitRefs     what the learner deliberately attached or selected for this request (SourceRef[]).
//   activeActivity   ActivityRef of the current activity, or null.
//   candidateSources other canvas material (an attached repository, older cards): never pulled into a request by itself.
//   title            accepted for the call shape and ignored: a title never sets, refuses or redirects a topic.
// eslint-disable-next-line no-unused-vars
export function resolveLearningFocus({ request = null, explicitRefs = [], activeActivity = null, candidateSources = [], title = '' }) {
  const text = String(request?.text ?? '').trim();
  if (request?.intent === 'resume' && activeActivity) return { kind: 'resume', goalRef: activeActivity.goalRef, activityRef: activeActivity, sourceRefs: activeActivity.sourceRefs || [] };
  if (request?.intent === 'new_goal') return { kind: 'create_goal', sourceRefs: explicitRefs };
  if (text || explicitRefs.length) return { kind: 'answer', sourceRefs: explicitRefs };
  return { kind: 'clarify', sourceRefs: [] };
}

// A result (a reply, feedback, a status card) belongs to the learner, canvas, goal and activity revision it was made for.
// It is shown or applied as current only while all of them still hold; otherwise it stays with its origin.
export const stillCurrent = (origin, now) => !!origin && !!now && ['userId', 'app', 'board', 'goalId', 'activityId', 'activityRevision'].every(key => (origin[key] ?? null) === (now[key] ?? null));

// What the static entry says (no model writes it). Neutral wording only from saved state that is this learner's.
export function entryCopy(entry, checkpoint = {}) {
  const goal = checkpoint.goal?.label, objective = checkpoint.activity?.objective;
  switch (entry.messageKey) {
    case 'welcome_new': return 'What would you like to learn or work on here? Tell me a topic, or bring something you want help understanding.';
    case 'welcome_back': return 'What would you like to learn or work on?';
    case 'existing_work': return 'Your work here has no active lesson. Want help with it?';
    case 'not_submitted': return `Welcome back. We last worked on ${goal}. ${objective ? `${objective}: answer not submitted. ` : ''}Would you like a quick check, a recap, or to continue?`;
    case 'awaiting_feedback': return `Welcome back. We last worked on ${goal}. Your answer is waiting for feedback.`;
    case 'feedback_ready': return `Welcome back. We last worked on ${goal}. Feedback on your answer is ready.`;
    case 'completed': return `You finished ${objective || goal}. Review it, or choose a next goal.`;
    default: return '';
  }
}

// Each entry choice: label, and what it does - `send` is the learner's explicit request (a normal chat turn, the one call
// it may make), `focus` only puts the learner back in their saved activity and the composer (no call).
export function entryAction(action, checkpoint = {}) {
  const goal = checkpoint.goal?.label || 'this';
  switch (action) {
    case 'set_goal': return { label: 'Help me choose a topic', send: 'Help me choose a topic to learn.' };
    case 'explain': return { label: 'Explain this', send: 'Explain my work on this canvas.' };
    case 'review': return { label: 'Review my work', send: 'Review my work on this canvas.', event: 'check_review' };
    case 'build_lesson': return { label: 'Build a lesson from this', send: 'Build a lesson from my work on this canvas.' };
    case 'continue': return { label: 'Continue where I left off', focus: true };
    case 'recap': return { label: 'Short recap', send: `Give me a short recap of ${goal}.` };
    case 'quick_check': return { label: 'Quick check', send: `Give me a quick check on ${goal}.` };
    case 'next_goal': return { label: 'Choose a next goal', send: 'Help me choose my next goal.' };
    case 'retry': return { label: 'Retry', retry: true };
    default: return null;
  }
}
