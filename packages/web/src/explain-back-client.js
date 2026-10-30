// Explain-back's durable attempt transport (plan 2026-10-30-explain-back.md EB-04.3): bind the card to its private activity,
// submit one combined answer, read an attempt back and list the card's history. Every call goes to
// /api/learn/tutor/attempts (packages/control-plane/src/learn-attempt-routes.js); reading and listing never call a model.
// The assessment runs inside the submit request, so a lost response is recovered by replaying the same submissionKey.
import { wsHeaders } from './api.js';
import { submitEnvelope } from './explain-back-contract.js';

const BASE = '/api/learn/tutor/attempts';

export class AttemptRequestError extends Error {
  constructor(code, status, detail) { super(code); this.code = code; this.status = status; this.detail = detail ?? null; }
}

async function call(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...wsHeaders(), ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw new AttemptRequestError(data.error || `http_${response.status}`, response.status, data.detail);
  return data;
}

const query = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();

/** Bind an Explain-back card to its private activity: {goalId, activityId, activityRevision, criterionRefs, rubricVersion}. */
export const bindCard = ({ app, board, cardId, prompt, expects = [] }) =>
  call(`${BASE}/bind`, { method: 'POST', body: JSON.stringify({ app, board, cardId, prompt, expects }) });

/** Submit one combined answer. The same submissionKey replays the saved attempt instead of submitting twice. */
// snapshots: private copies of board-held inputs (explain-inputs.js snapshotOf); the server keeps only those the answer names.
// teachingCards: existing teaching cards on the canvas the review may point to (explain-back-contract.js teachingCards).
export const submitAnswer = ({ app, board, binding, submissionKey, answer, snapshots = [], teachingCards = [] }) =>
  call(BASE, { method: 'POST', body: JSON.stringify({ app, board, ...submitEnvelope({ activityId: binding.activityId, activityRevision: binding.activityRevision, submissionKey, answer }), ...(snapshots.length ? { snapshots } : {}), ...(teachingCards.length ? { teachingCards } : {}) }) });

/** Read one attempt with its assessment(s). Reconciles stale operations; no model call. */
export const readAttempt = ({ app, board, attemptId }) => call(`${BASE}/${encodeURIComponent(attemptId)}?${query({ app, board })}`);

/** The learner's own attempts at one card, newest first, each with its parent ids, latest status and stored rating. */
export const listAttempts = ({ app, board, cardId }) => call(`${BASE}?${query({ app, board, cardId })}`).then(data => data.attempts || []);

/** A deliberate re-review of an existing attempt (not a new learner revision). */
export const reassessAttempt = ({ app, board, attemptId, requestKey, teachingCards = [] }) =>
  call(`${BASE}/${encodeURIComponent(attemptId)}/reassess`, { method: 'POST', body: JSON.stringify({ app, board, requestKey, ...(teachingCards.length ? { teachingCards } : {}) }) });

/** A submitted Sketch's capture data ({marks, text}), owner only; restores an older attempt's drawing on Revise. */
export const readSketchMeta = ({ app, board, assetId }) => call(`${BASE}/assets/${encodeURIComponent(assetId)}/meta?${query({ app, board })}`);

export const newSubmissionKey = () => `eb_${crypto.randomUUID()}`;
