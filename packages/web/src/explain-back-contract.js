// packages/web/src/explain-back-contract.js
// Explain-back shared contract (EB-01, docs/superpowers/plans/2026-10-30-explain-back.md sections 6, 7 and 11C). Pure: no
// storage, network or model. The browser (U/M/R) builds these records, the attempt store (D) validates them, assessment (A)
// reads them. Field specs use learn-coaching-contract.js's engine; a learner answer is the submittedContent of a
// SubmitAttempt on an activity whose responseKind is 'explain_back'.
//
// ExplainBackAnswer: the one combined answer. Typed text is optional; every other medium is a bounded reference, never bytes.
// EvidenceRef: one piece of submitted evidence. Voice, sketch and recording name attempt-private assets (aa_ ids); a resource
//   names its canvas source at the revision it had when connected; a Group lists its members.
// Baseline: the parent attempt of a revision and the exact parent review the learner saw (null: the parent has none).
// ExplainBackReview: the stored review of one assessment operation (it rides learn_assessments.provenance_json.review).
// Rating: exactly rateAttempt's output (control-plane/src/learn-explain-rating.js, worker A): status rated|unrated, score
//   0-10 only when rated, reason (+ unknown criteria) only when unrated, per-criterion rows with weight/required/credit.
import { ASSESSMENT_STATUS, REASONING, validateShape } from './learn-coaching-contract.js';

export const EXPLAIN_BACK_KIND = 'explain_back';
export const ANSWER_VERSION = 1;
export const REVIEW_VERSION = 1;
export const RATING_OUT_OF = 10;
// Bounded like the attempt store (ATTEMPT_LIMITS: 4000 text units, 20 refs, 16 KiB content); members and voice notes are
// the contract's own bounds so one Group cannot fill the content budget.
export const ANSWER_LIMITS = Object.freeze({ textChars: 4000, evidence: 20, voiceNotes: 3, groupMembers: 30, citations: 12 });
// Teaching aids (plan section 9, "Open on canvas"; FX-EB-05): teaching cards that already exist on the learner's canvas.
// The browser sends a bounded candidate list with a submission (private canvas content stays browser-side until submitted);
// the review may name up to `picks` of them for "What to revisit". Nothing is generated. The block types: /explain's
// explanation, animation (an explain program) and scene cards, /motion's and other video cards, and notebooks.
export const TEACHING_KINDS = ['explanation', 'animation', 'scene', 'video', 'notebook'];
export const TEACHING_LIMITS = Object.freeze({ candidates: 12, picks: 2, title: 120 });
// [{id, title, kind}] -> the same, bounded: teaching kinds only, distinct ids, titles clipped, at most `candidates`. Applied
// by the browser before sending and again by the server to whatever arrived.
export function teachingCards(list) {
  const seen = new Set(), out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (out.length >= TEACHING_LIMITS.candidates) break;
    if (!isObj(c) || typeof c.id !== 'string' || !c.id || c.id.length > 200 || seen.has(c.id) || !TEACHING_KINDS.includes(c.kind)) continue;
    seen.add(c.id);
    out.push({ id: c.id, title: typeof c.title === 'string' ? c.title.slice(0, TEACHING_LIMITS.title) : '', kind: c.kind });
  }
  return out;
}

export const EVIDENCE_ROLES = ['voice', 'sketch', 'recording', 'resource'];
// What the bytes are. A resource is any canvas source; 'group' is the only media with members.
// sketch_timeline: a Sketch recording as a JSON timeline of drawing events (worker M), an aa_ asset of application/json.
export const MEDIA_KINDS = ['audio', 'image', 'video', 'sketch_timeline', 'pdf', 'document', 'notebook', 'data', 'code', 'web', 'card', 'group'];
const ROLE_MEDIA = { voice: ['audio'], sketch: ['image'], recording: ['video', 'sketch_timeline'], resource: ['image', 'video', 'pdf', 'document', 'notebook', 'data', 'code', 'web', 'card', 'group'] };
// Asset state in the draft. Only 'ready' can be submitted; 'unsupported' is allowed for a Group member, reported in coverage.
export const EVIDENCE_STATES = ['uploading', 'ready', 'failed', 'unavailable', 'unsupported'];
// Review coverage of one input: what the evaluator actually read.
export const COVERAGE_STATES = ['read', 'partial', 'unavailable', 'unsupported', 'processing'];
export const ASSISTANCE_KINDS = ['hint', 'saw_prior_feedback', 'material', 'chat', 'other'];
// Criterion judgment -> the existing Observation fit (the rating's credit comes from fit + reasoning, learn-explain-rating.js).
// not_established: the evidence was read and the idea is absent (fit not_met, so a fully read answer can score 0);
// contradicted: specific evidence states the opposite (also not_met; the review keeps which one, so missing evidence is never
// shown as a misconception); unassessed: the evidence could not be read or is ambiguous (fit unclear, so a scored criterion
// makes the attempt Not rated, never 0).
export const JUDGMENTS = ['demonstrated', 'partly_demonstrated', 'contradicted', 'not_established', 'unassessed'];
export const JUDGMENT_FIT = Object.freeze({ demonstrated: 'met', partly_demonstrated: 'partial', contradicted: 'not_met', not_established: 'not_met', unassessed: 'unclear' });
// improved: better but not yet met (not_met -> partial); still_met: met before and now.
export const COMPARISON_CHANGES = ['resolved', 'improved', 'persisting', 'still_met', 'new', 'regressed', 'prior_feedback_corrected', 'not_comparable'];
// A stored transcript is ready (text from the audio) or failed (kept with its error; replaced only by an explicit retry).
export const TRANSCRIPT_STATUS = ['ready', 'failed'];
export const RATING_STATUS = ['rated', 'unrated'];
// Assessment operations: 'submit' is the learner's new answer (a new attempt); 'reassess' re-runs one attempt's assessment
// (same attempt, new operation, learn_assessments.request_key 'reassess:*'). A reassessment is never a new revision.
export const OPERATION_KINDS = ['submit', 'reassess'];
// What the card shows for an attempt; derived by attemptState, never stored.
export const ATTEMPT_STATES = ['draft', 'submitting', 'assessing', 'reviewed', 'not_rated', 'failed', 'unknown'];
// Every refusal code a client may receive (AttemptError.code, HTTP status in parentheses) or produce locally (readiness).
export const ERROR_CODES = Object.freeze({
  // readiness, local: Submit stays disabled
  empty_answer: 'local', recording_active: 'local', upload_in_progress: 'local', evidence_unavailable: 'local', text_too_long: 'local',
  // existing attempt store
  invalid_submission: 400, invalid_content: 400, submission_too_large: 413, submission_key_conflict: 409, unknown_activity: 404,
  goal_closed: 409, stale_activity: 409, criteria_unavailable: 409, unknown_source: 400, unknown_attempt: 404,
  assessment_in_progress: 409, invalid_request_key: 400,
  // Explain-back additions
  unknown_asset: 404, cross_scope_evidence: 403, self_reference: 400, baseline_not_found: 404, stale_baseline: 409,
  draft_conflict: 409, card_unbound: 409,
});

const SHA = /^[0-9a-f]{64}$/;
const ASSET = /^aa_[A-Za-z0-9_-]{8,80}$/; // an attempt-private asset (EB-02); never a board fileRef, media: or fs_ id
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const sha256 = v => typeof v === 'string' && SHA.test(v);
const attemptAsset = v => typeof v === 'string' && ASSET.test(v);
const shortText = v => typeof v === 'string' && v.length <= 1200;
const answerText = v => typeof v === 'string';
const credit = v => v === null || v === 0 || v === 0.5 || v === 1;
const weight = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100;
const ratingScore = v => Number.isInteger(v) && v >= 0 && v <= RATING_OUT_OF;
const outOf = v => v === RATING_OUT_OF;
const answerVersion = v => v === ANSWER_VERSION;
const explainBackKind = v => v === EXPLAIN_BACK_KIND;
const reviewVersion = v => v === REVIEW_VERSION;
const transcriptText = v => typeof v === 'string' && v.length <= 20000;
const uncertainty = v => (typeof v === 'number' && v >= 0 && v <= 1) || isObj(v);
const nullableId = v => v === null || (typeof v === 'string' && v.length > 0 && v.length <= 200);

export const EB_SHAPES = {
  DerivativeRef: { derivativeId: 'id', hash: sha256, converterVersion: 'id' },
  GroupMember: { sourceKind: 'id', sourceId: 'id', revision: 'ver', board: 'id?', hash: { opt: sha256 }, media: MEDIA_KINDS, scope: 'obj?', state: EVIDENCE_STATES },
  EvidenceRef: {
    evidenceId: 'id', role: EVIDENCE_ROLES, media: MEDIA_KINDS, state: EVIDENCE_STATES,
    assetId: 'id', revision: 'ver', hash: { opt: sha256 }, mime: 'id?', codec: 'id?', bytes: 'int?', durationMs: 'int?',
    // resources only: where it came from and what part was selected
    sourceKind: 'id?', board: 'id?', label: 'str?', scope: 'obj?', locators: 'obj?', derivative: { opt: 'DerivativeRef' },
    members: { opt: ['GroupMember'] }, connection: 'obj?',
    // recording only: its narration, a voice EvidenceRef (an aa_ audio asset) with its own evidenceId
    narration: { opt: 'EvidenceRef' },
  },
  AssistanceRef: { kind: ASSISTANCE_KINDS, id: 'id' },
  // A transcript derivative of one retained audio asset (worker M produces it; D stores it immutable, keyed by audio hash).
  // It is assessment and accessibility data only: never inserted into the typed answer.
  // milliseconds on the audio's clock (P ruling; learn-media.js transcriptParts converts the provider's seconds)
  TranscriptSegment: { startMs: 'int', endMs: 'int', text: shortText },
  Transcript: {
    transcriptId: 'id', assetId: attemptAsset, hash: sha256, text: transcriptText, segments: { opt: ['TranscriptSegment'] },
    provider: 'id', model: 'id', uncertainty: { opt: uncertainty }, version: 'ver', status: TRANSCRIPT_STATUS,
    converterVersion: 'id', derivativeHash: { opt: sha256 }, error: { opt: shortText }, createdAt: 'id?',
  },
  Baseline: { parentAttemptId: 'id', parentAssessmentId: nullableId },
  ExplainBackAnswer: {
    v: answerVersion, kind: explainBackKind, text: answerText,
    voice: ['EvidenceRef'], sketch: { opt: 'EvidenceRef' }, recording: { opt: 'EvidenceRef' }, resources: ['EvidenceRef'],
    assistance: ['AssistanceRef'], baseline: { opt: 'Baseline' },
  },
  // evidenceId 'text' cites the typed answer by UTF-16 offsets {start, end}; any other id must be in the answer.
  Citation: { evidenceId: 'id', memberId: 'id?', locator: 'obj' },
  CriterionJudgment: {
    criterionId: 'id', criterionVersion: 'int', judgment: JUDGMENTS, fit: ['met', 'partial', 'not_met', 'unclear'], reasoning: REASONING,
    citations: ['Citation'], question: { opt: shortText }, note: { opt: shortText },
  },
  CoverageEntry: { evidenceId: 'id', memberId: 'id?', status: COVERAGE_STATES, inspected: 'obj?', derivative: { opt: 'DerivativeRef' }, note: { opt: shortText } },
  FeedbackSection: { text: shortText, citations: ['Citation'] },
  Feedback: { strengths: 'FeedbackSection', revisit: 'FeedbackSection', next: 'FeedbackSection' },
  ComparisonItem: { criterionId: 'id', change: COMPARISON_CHANGES, baselineCitations: ['Citation'], currentCitations: ['Citation'], note: { opt: shortText } },
  // rating: ratingsComparable's verdict (learn-explain-rating.js) with both scores when shown as a numeric change
  ComparisonRating: { comparable: 'bool', reason: nullableId, previous: { opt: ratingScore }, current: { opt: ratingScore } },
  Comparison: { parentAttemptId: 'id', parentAssessmentId: nullableId, comparable: 'bool', reason: 'id?', items: ['ComparisonItem'], rating: { opt: 'ComparisonRating' } },
  RatingRow: { criterionId: 'id', version: 'int', weight, required: 'bool', credit, reason: 'id?' },
  Rating: {
    status: RATING_STATUS, score: { opt: ratingScore }, outOf, capped: 'bool?', reason: 'id?', unknown: { opt: ['obj'] },
    criteria: ['RatingRow'], rubricVersion: nullableId, calculationVersion: 'id',
  },
  // One existing teaching card the review names for "What to revisit", as it was when submitted (title and kind kept, so a
  // card removed later still reads as what it was, shown unavailable).
  TeachingAid: { cardId: 'id', title: 'str', kind: TEACHING_KINDS, reason: shortText },
  ExplainBackReview: {
    v: reviewVersion, attemptId: 'id', assessmentId: 'id', status: ASSESSMENT_STATUS, rubricVersion: 'id',
    judgments: ['CriterionJudgment'], coverage: ['CoverageEntry'], feedback: { opt: 'Feedback' }, comparison: { opt: 'Comparison' },
    rating: 'Rating', teachingAids: { opt: ['TeachingAid'] }, provenance: 'obj',
  },
  ExplainBackDraft: { draftId: 'id', cardId: 'id', activityId: 'id?', revision: 'int', answer: 'ExplainBackAnswer', updatedAt: 'id?' },
};

const allEvidence = a => [...(a.voice ?? []), ...(a.sketch ? [a.sketch] : []), ...(a.recording ? [a.recording] : []), ...(a.recording?.narration ? [a.recording.narration] : []), ...(a.resources ?? [])];
export const answerEvidence = a => (isObj(a) ? allEvidence(a) : []);

// Worker M's stopped voice note {v, asset, type, ext, codec, durationMs, size, sha256} as a ready voice EvidenceRef.
// asset is the aa_ id the attempt-asset upload returned; ext is not kept (the server names the container from the bytes).
export const voiceEvidence = (note, evidenceId) => ({
  evidenceId, role: 'voice', media: 'audio', state: 'ready', assetId: note.asset, revision: 1, hash: note.sha256,
  mime: note.type, ...(note.codec ? { codec: note.codec } : {}), bytes: note.size, durationMs: note.durationMs,
});
export function validateTranscript(t) {
  const errors = validateShape(EB_SHAPES, 'Transcript', t);
  if (!errors.length && t.status === 'ready' && !t.derivativeHash) errors.push('derivativeHash: a ready transcript names its derivative');
  if (!errors.length && t.status === 'failed' && !t.error) errors.push('error: a failed transcript says why');
  return { ok: !errors.length, errors };
}

// Rules the field specs cannot say. ctx (all optional): board, the canvas the attempt is on; cardId, the Explain-back card
// itself (it may not be its own input). The server repeats every authorization check; these are shape and scope only.
function answerRules(a, { board, cardId } = {}) {
  const errors = [];
  const ev = allEvidence(a);
  if (a.text.length > ANSWER_LIMITS.textChars) errors.push('text: text_too_long');
  if (ev.length > ANSWER_LIMITS.evidence) errors.push(`evidence: at most ${ANSWER_LIMITS.evidence}`);
  if (a.voice.length > ANSWER_LIMITS.voiceNotes) errors.push(`voice: at most ${ANSWER_LIMITS.voiceNotes}`);
  const ids = new Set();
  const slot = { voice: a.voice, sketch: a.sketch ? [a.sketch] : [], recording: a.recording ? [a.recording] : [], resource: a.resources };
  for (const [role, list] of Object.entries(slot)) for (const e of list) if (e.role !== role) errors.push(`${e.evidenceId}: role ${e.role} in ${role}`);
  for (const e of ev) if (e.narration != null && (e !== a.recording || e.narration.role !== 'voice' || e.narration.narration != null)) errors.push(`${e.evidenceId}: narration is one voice ref on the recording`);
  for (const e of ev) {
    const at = e.evidenceId;
    if (at === 'text' || ids.has(at)) errors.push(`${at}: duplicate or reserved evidenceId`);
    ids.add(at);
    if (!ROLE_MEDIA[e.role].includes(e.media)) errors.push(`${at}: media ${e.media} is not ${e.role}`);
    if (e.state === 'ready' && !e.hash && e.media !== 'group') errors.push(`${at}: ready evidence needs its hash`);
    if (e.role !== 'resource') {
      // private answer media are attempt assets, never a shared board file or another learner's media
      if (!attemptAsset(e.assetId)) errors.push(`${at}: asset_not_private`);
      if (e.sourceKind != null || e.members != null || e.board != null) errors.push(`${at}: resource fields on ${e.role}`);
      continue;
    }
    if (!e.sourceKind) errors.push(`${at}: resource needs sourceKind`);
    if (cardId != null && e.assetId === cardId) errors.push(`${at}: self_reference`);
    if (board != null && e.board != null && e.board !== board) errors.push(`${at}: cross_scope_evidence`);
    if ((e.media === 'group') !== (e.members != null)) errors.push(`${at}: members only and always on a group`);
    if (e.members) {
      if (e.members.length > ANSWER_LIMITS.groupMembers) errors.push(`${at}: at most ${ANSWER_LIMITS.groupMembers} members`);
      const seen = new Set();
      for (const m of e.members) {
        const key = `${m.sourceKind}:${m.sourceId}`;
        if (seen.has(key)) errors.push(`${at}: duplicate member ${key}`);
        seen.add(key);
        if (m.media === 'group') errors.push(`${at}: nested group ${m.sourceId}`);
        if (cardId != null && m.sourceId === cardId) errors.push(`${at}: self_reference`);
        if (board != null && m.board != null && m.board !== board) errors.push(`${at}: cross_scope_evidence`);
      }
    }
  }
  // The same source connected twice (another port, or directly and in a Group as the same scope) is one input.
  const direct = a.resources.filter(e => e.media !== 'group').map(e => `${e.sourceKind}:${e.assetId}:${JSON.stringify(e.scope ?? null)}`);
  if (new Set(direct).size !== direct.length) errors.push('resources: duplicate source and scope');
  if (a.assistance.length > ANSWER_LIMITS.evidence) errors.push(`assistance: at most ${ANSWER_LIMITS.evidence}`);
  return errors;
}

/** @returns {{ok: boolean, errors: string[]}} */
export function validateExplainBackAnswer(answer, ctx) {
  const errors = validateShape(EB_SHAPES, 'ExplainBackAnswer', answer);
  if (!errors.length) errors.push(...answerRules(answer, ctx));
  return { ok: errors.length === 0, errors };
}

/**
 * Can this draft be submitted? capture: the client's live recorder state {recording, paused}. Empty typed text is valid
 * whenever other ready evidence exists; voice alone, Sketch alone and a resource alone are each complete answers.
 * @returns {{ready: boolean, reason: string|null}} reason is an ERROR_CODES key
 */
export function answerReadiness(answer, { recording = false, paused = false } = {}) {
  if (recording || paused) return { ready: false, reason: 'recording_active' };
  if (!isObj(answer)) return { ready: false, reason: 'empty_answer' };
  const ev = allEvidence(answer);
  if (typeof answer.text === 'string' && answer.text.length > ANSWER_LIMITS.textChars) return { ready: false, reason: 'text_too_long' };
  if (ev.some(e => e.state === 'uploading')) return { ready: false, reason: 'upload_in_progress' };
  const blocked = e => e.state !== 'ready' || (e.members ?? []).some(m => m.state !== 'ready' && m.state !== 'unsupported');
  if (ev.some(blocked)) return { ready: false, reason: 'evidence_unavailable' };
  const hasText = typeof answer.text === 'string' && answer.text.trim().length > 0;
  if (!hasText && !ev.length) return { ready: false, reason: 'empty_answer' };
  return { ready: true, reason: null };
}

// The SubmitAttempt envelope for an answer: assistance ids derive from the answer's own provenance list, so the two never
// drift. A revision of a reviewed parent was made after seeing that feedback (P ruling, plan 7F): saw_prior_feedback is
// always recorded. The server repeats that rule, adds help its checkpoint records and freezes everything at submission.
export const priorFeedbackRefs = answer => (answer?.baseline?.parentAssessmentId ? [`saw_prior_feedback:${answer.baseline.parentAssessmentId}`] : []);
export const submitEnvelope = ({ activityId, activityRevision, submissionKey, answer }) => ({
  activityId, activityRevision, submissionKey, submittedContent: answer, sourceRefs: [],
  assistanceRefs: [...new Set([...answer.assistance.map(r => `${r.kind}:${r.id}`), ...priorFeedbackRefs(answer)])],
});

/** A stored review, checked against the answer it reviews. @returns {{ok: boolean, errors: string[]}} */
export function validateExplainBackReview(review, answer) {
  const errors = validateShape(EB_SHAPES, 'ExplainBackReview', review);
  if (errors.length) return { ok: false, errors };
  const ev = new Map(answerEvidence(answer).map(e => [e.evidenceId, e]));
  const textLen = typeof answer?.text === 'string' ? answer.text.length : 0;
  const citationOk = c => {
    if (c.evidenceId === 'text') return Number.isInteger(c.locator.start) && Number.isInteger(c.locator.end) && c.locator.start >= 0 && c.locator.start < c.locator.end && c.locator.end <= textLen;
    const e = ev.get(c.evidenceId);
    return !!e && (c.memberId == null || (e.members ?? []).some(m => m.sourceId === c.memberId));
  };
  const cite = (list, where) => {
    if (list.length > ANSWER_LIMITS.citations) errors.push(`${where}: at most ${ANSWER_LIMITS.citations} citations`);
    for (const c of list) if (!citationOk(c)) errors.push(`${where}: citation ${c.evidenceId} is not in the answer`);
  };
  for (const j of review.judgments) {
    if (JUDGMENT_FIT[j.judgment] !== j.fit) errors.push(`${j.criterionId}: ${j.judgment} stores fit ${JUDGMENT_FIT[j.judgment]}`);
    cite(j.citations, j.criterionId);
  }
  if (new Set(review.judgments.map(j => j.criterionId)).size !== review.judgments.length) errors.push('judgments: duplicate criterionId');
  // every submitted input has a coverage entry: nothing silently drops out of a review
  const covered = new Set(review.coverage.map(c => c.evidenceId));
  if (typeof answer?.text === 'string' && answer.text.trim()) ev.set('text', null);
  for (const id of ev.keys()) if (!covered.has(id)) errors.push(`coverage: missing ${id}`);
  if (review.feedback) for (const k of ['strengths', 'revisit', 'next']) cite(review.feedback[k].citations, `feedback.${k}`);
  if (review.comparison) for (const i of review.comparison.items) cite(i.currentCitations, `comparison.${i.criterionId}`);
  // comparison belongs to the baseline the answer named
  const b = answer?.baseline;
  if ((review.teachingAids?.length ?? 0) > TEACHING_LIMITS.picks) errors.push(`teachingAids: at most ${TEACHING_LIMITS.picks}`);
  if (review.comparison && (!b || b.parentAttemptId !== review.comparison.parentAttemptId || b.parentAssessmentId !== review.comparison.parentAssessmentId)) errors.push('comparison: not the answer baseline');
  const r = review.rating;
  const rated = r.status === 'rated';
  if (r.rubricVersion != null && r.rubricVersion !== review.rubricVersion) errors.push('rating: another rubric version');
  if (rated !== (r.score != null) || rated === (r.reason != null)) errors.push('rating: rated has a score and no reason; unrated has a reason and no score');
  if (rated && review.status !== 'completed') errors.push('rating: only a completed review is rated');
  // every rated row is one of this review's judgments, at its version; an unassessed judgment can never be rated
  const judged = new Map(review.judgments.map(j => [`${j.criterionId}@${j.criterionVersion}`, j]));
  for (const row of r.criteria) {
    const j = judged.get(`${row.criterionId}@${row.version}`);
    if (!j) errors.push(`rating: ${row.criterionId} is not a judged criterion`);
    else if (rated && (row.credit === null || j.judgment === 'unassessed')) errors.push(`rating: ${row.criterionId} unassessed, so Not rated`);
  }
  return { ok: errors.length === 0, errors };
}

// The card state of a stored attempt from its latest assessment operation (readAttempt's `assessment`).
export function attemptState(assessment) {
  if (!assessment) return 'draft';
  if (assessment.status === 'pending') return 'assessing';
  if (assessment.status === 'unknown') return 'unknown';
  if (assessment.status !== 'completed') return 'failed';
  return assessment.provenance?.review?.rating?.status === 'rated' ? 'reviewed' : 'not_rated';
}

// A legacy Explain-back answer ({text} or {text, sketch} from the single-line card) read as a combined answer, so history
// shows it; nothing is invented (no rating, no evidence that was not stored).
export function fromLegacyAnswer(content) {
  if (isObj(content) && content.kind === EXPLAIN_BACK_KIND) return content;
  const text = typeof content === 'string' ? content : typeof content?.text === 'string' ? content.text : '';
  return { v: ANSWER_VERSION, kind: EXPLAIN_BACK_KIND, text, voice: [], resources: [], assistance: [], legacy: true };
}
