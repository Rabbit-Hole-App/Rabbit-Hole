// Goal management (/goal and Progress's Set a goal; owner, 2026-10-21): the saved-goal operations GoalManager.jsx runs, through
// the coaching store's own actions (control-plane learn-coaching-store.js create_goal, edit_goal, delete_goal, activate_goal).
// Pure: the caller passes act (the coaching sync's act, which POSTs /api/learn/coaching), so node tests drive it with a fake.
// Nothing here can reach a model: the coaching route is the only call.
//   createGoalOps({ act, newId }).run(key, action, payload) -> { ok, state } | { ok: false, code, message, state? }
//     key names one control (add, edit:<id>, delete:<id>, switch:<id>): a second press while it is saving does nothing. A retry
//     of the same write keeps its action id, so a save that reached the server before the connection dropped is replayed once,
//     never made twice. A write refused because the canvas revision moved on (another tab changed something else) is sent
//     again once on the newer revision; a goal changed elsewhere (goal_changed) is not: the caller shows the newer goal and
//     keeps the learner's words.

export const LABEL_MAX = 200, OUTCOME_MAX = 1000;
// The goals the learner manages: every goal not deleted (archived), in the order they were made.
export const listedGoals = state => (state?.goals || []).filter(goal => goal.lifecycle !== 'archived');

const MESSAGES = {
  goal_changed: 'This goal was changed in another tab or device. Its saved version is shown; your edit is kept here.',
  goal_closed: 'This goal was deleted or finished elsewhere.',
  unknown_goal: 'This goal was deleted elsewhere.',
  goal_limit: 'A canvas holds at most 50 goals. Delete one first.',
  revision: 'Your goals changed in another tab. Try again.',
};
export function failure(error) {
  const code = error?.data?.error || error?.code || null;
  const message = MESSAGES[code] || (error?.status === 400 ? `Not saved: ${String(error?.data?.error || error.message).slice(0, 160)}` : error?.code === 'local' || error?.code === 'unsaved' ? error.message
    : 'Not saved. Check your connection and try again; your words are kept.');
  return { ok: false, code, message, ...(error?.data?.state ? { state: error.data.state } : {}) };
}

export function createGoalOps({ act, newId = () => crypto.randomUUID() }) {
  const flying = new Set(), held = new Map(); // key -> { body, actionId } of the last unconfirmed write
  async function run(key, action, payload) {
    if (flying.has(key)) return { ok: false, code: 'busy', skipped: true };
    const body = JSON.stringify([action, payload]);
    if (held.get(key)?.body !== body) held.set(key, { body, actionId: newId() });
    const { actionId } = held.get(key);
    flying.add(key);
    try {
      for (let tries = 0; ; tries += 1) {
        try { const state = await act(action, payload, { actionId }); held.delete(key); return { ok: true, state }; }
        catch (error) { if (tries || error?.status !== 409 || error?.data?.error !== 'revision') return failure(error); }
      }
    } finally { flying.delete(key); }
  }
  return { run, busy: key => flying.has(key) };
}

// A goal's words as the store takes them, or the reason they cannot be saved.
export function goalWords({ label = '', outcome = '' }) {
  const words = { label: String(label).trim(), outcome: String(outcome).trim() };
  if (!words.label) return { error: 'Write what you want to learn.' };
  if (words.label.length > LABEL_MAX) return { error: `Keep the goal under ${LABEL_MAX} characters.` };
  if (words.outcome.length > OUTCOME_MAX) return { error: `Keep the outcome under ${OUTCOME_MAX} characters.` };
  return { words };
}

// After a delete: the chat attachments that name the deleted goal (Ask tutor about this chips, kind 'progress'), to detach.
export const refsToGoal = (refs, goalId) => (refs || []).filter(ref => ref?.kind === 'progress' && ref.range?.goalRefs?.some(goal => goal.goalId === goalId));
