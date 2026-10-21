// packages/web/src/learn-progress-question.js
// Progress questions and feedback review in chat (C:/s/spec/tutor-workflow/draft.md Task 10, "Ask the tutor about a
// particular aspect"; acceptance scenarios 58-60). Pure enough for the Worker to import, like file-chat-ref.js:
//   progressScope(range)   the one validator of a progress chat ref's range (chat-modes.js, canvases.js): a
//                          ProgressQuestionScope plus an optional review target. Throws with the reason; returns a copy
//                          rebuilt from known keys.
//   progressRef(...)       the ContextRef "Ask tutor about this" and "Question this feedback" attach (kind 'progress').
//   askTutorAbout(chat, ref, suggestion)  attaches it and focuses the composer. It never sends, and it keeps the mode, the
//                          Tutor switch and a written draft exactly as they are.
//   fileReviews(refs, {app, post})  at Send only: each attached review files its dispute once through the attempt
//                          reassess route (Task 05), which keeps the original assessment.
// The ids a ref carries are the browser's view; the server resolves them again for the signed-in learner
// (control-plane learn-progress-context.js), so they are never authority.
import { DIMENSIONS, validateCoachingRecord } from './learn-coaching-contract.js';

// Small enough that a ref stays within chat-modes.js's 2 KB per ref.
export const PROGRESS_LIMITS = Object.freeze({ goals: 8, criteria: 20, observations: 24 });
const KEYS = ['goalRefs', 'criterionRefs', 'dimensions', 'observationIds', 'summaryRevision', 'timeRange', 'review'];
const RECORD_ID = /^[A-Za-z0-9_-]{1,100}$/; // an attempt or assessment id, as the attempt routes take it
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const iso = v => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

export function progressScope(range) {
  if (!isObj(range) || Object.keys(range).some(k => !KEYS.includes(k))) throw Error('a progress ref carries its question scope only');
  const { review, timeRange } = range;
  const checked = validateCoachingRecord('ProgressQuestionScope', range);
  if (!checked.ok) throw Error(`progress scope: ${checked.errors.slice(0, 2).join('; ')}`);
  if (!range.goalRefs.length || range.goalRefs.length > PROGRESS_LIMITS.goals) throw Error(`progress scope: 1-${PROGRESS_LIMITS.goals} goals`);
  if (range.criterionRefs.length > PROGRESS_LIMITS.criteria) throw Error(`progress scope: at most ${PROGRESS_LIMITS.criteria} criteria`);
  if (range.observationIds.length > PROGRESS_LIMITS.observations) throw Error(`progress scope: at most ${PROGRESS_LIMITS.observations} observations`);
  if (timeRange != null && (Object.keys(timeRange).some(k => k !== 'from' && k !== 'to') || Object.values(timeRange).some(v => !iso(v)))) throw Error('progress scope: timeRange is { from?, to? } dates');
  if (review != null && !(isObj(review) && Object.keys(review).sort().join() === 'assessmentId,attemptId,board' && RECORD_ID.test(review.attemptId) && RECORD_ID.test(review.assessmentId) && BOARD.test(review.board))) {
    throw Error('progress scope: review is { attemptId, assessmentId, board }');
  }
  return {
    goalRefs: range.goalRefs.map(g => ({ goalId: g.goalId, scopeVersion: g.scopeVersion })),
    criterionRefs: range.criterionRefs.map(c => ({ criterionId: c.criterionId, version: c.version })),
    dimensions: [...new Set(range.dimensions)], observationIds: [...new Set(range.observationIds)], summaryRevision: range.summaryRevision,
    ...(timeRange != null ? { timeRange: { ...(timeRange.from ? { from: timeRange.from } : {}), ...(timeRange.to ? { to: timeRange.to } : {}) } } : {}),
    ...(review != null ? { review: { attemptId: review.attemptId, assessmentId: review.assessmentId, board: review.board } } : {}),
  };
}

const day = at => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };

// The chip for a goal, one skill of it, or one judgment under review. view is the ProgressView on screen; its revision and
// the observation ids on screen go with the question, so the answer can say when newer evidence arrived (acceptance 59).
// The newest observations are kept when a skill holds more than the limit.
export function progressRef({ goal, view, criterion = null, evidence = null, dimensions = DIMENSIONS, board = null }) {
  const ids = (evidence ? [evidence] : criterion?.evidence ?? []).map(e => e.observationId).slice(-PROGRESS_LIMITS.observations);
  const range = progressScope({
    goalRefs: [{ goalId: goal.goalId, scopeVersion: view.goalRef.scopeVersion }],
    criterionRefs: criterion ? [{ criterionId: criterion.criterionId, version: criterion.version }] : [],
    dimensions, observationIds: ids, summaryRevision: view.summaryRevision,
    ...(evidence && board ? { review: { attemptId: evidence.attemptId, assessmentId: evidence.assessmentId, board } } : {}),
  });
  const name = evidence ? ['Review', criterion?.label, day(evidence.observedAt)] : [goal.label, criterion?.label];
  return { sourceId: `progress:${goal.goalId}`, kind: 'progress', name: name.filter(Boolean).join(' · ').slice(0, 120) || 'Progress', version: String(view.summaryRevision), range };
}

// Ask tutor about this / Question this feedback (draft "Progress UI and access"): the provider's composer.prepare opens Chat
// (below lg the companion steps aside and keeps its view), attaches and focuses. No mode is passed, so the selected mode and
// the Tutor switch stay; the suggestion fills only an empty composer, so a written draft is never changed. Nothing is sent.
export function askTutorAbout(chat, ref, suggestion = '') {
  if (!chat?.composer?.prepare) return false;
  chat.composer.prepare({ contextRefs: [ref], ...(suggestion && !String(chat.composer.text ?? '').trim() ? { text: suggestion } : {}) });
  return true;
}

// One dispute per questioned assessment: a resend, or a later message with the chip still attached, replays it.
export const reviewKey = assessmentId => `dispute-${assessmentId}`;
// At Send, before the message goes: each attached review files its dispute (draft Task 10: "file the dispute only when
// submitted"). post(path, body) -> parsed JSON or a thrown Error. A failure never blocks the message: the server reads the
// dispute's actual state from the records when it answers, so the reply cannot claim a review that was not filed.
export async function fileReviews(refs, { app, post }) {
  const reviews = (refs || []).filter(ref => ref?.kind === 'progress' && ref.range?.review);
  return Promise.all(reviews.map(async ({ range: { review } }) => {
    try {
      const body = await post(`/api/learn/tutor/attempts/${encodeURIComponent(review.attemptId)}/reassess`, { app, board: review.board, requestKey: reviewKey(review.assessmentId), dispute: true });
      return { assessmentId: review.assessmentId, ok: true, status: body?.assessment?.status ?? null };
    } catch (error) {
      return { assessmentId: review.assessmentId, ok: false, error: String(error?.message || error) };
    }
  }));
}
