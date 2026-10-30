// The Explain-back card's view model (plan docs/superpowers/plans/2026-10-30-explain-back.md sections 3, 7H, 8, 9).
// Pure, so Node tests import it. Every read of stored attempt/review fields goes through legacyView (the card's own
// single-attempt block) or serviceView (the durable attempt store); the card renders only what these return, so a
// change in the shared contract is a change here.

import { ANSWER_LIMITS, answerReadiness, attemptState } from './explain-back-contract.js';

export const ANSWER_LABEL = 'Explain in your words';
export const ANSWER_PLACEHOLDER = 'Write an answer, or record a voice note below. You can also add a sketch.';
export const SKETCH_CONTENT_LABEL = 'Open sketch — contains content';
export const STOP_TO_SUBMIT = 'Stop recording to submit';
export const FEEDBACK_SECTIONS = [['well', 'What you explained well'], ['revisit', 'What to revisit'], ['next', 'Try this next']];

const STATUS_WORD = { reviewing: 'Reviewing', reviewed: 'Reviewed', failed: 'Review failed', interrupted: 'Review interrupted' };
const text = value => (typeof value === 'string' ? value : '');

// A stored rating is shown only when it is a whole number from 0 to 10; anything else is Not rated, never a guess.
export const validRating = value => Number.isInteger(value) && value >= 0 && value <= 10;

// The badge beside the selected attempt (7H). A draft has none; a review in progress is Assessing; a review without a
// valid stored rating (legacy, unreadable evidence, failed) is Not rated. Only a stored rating is the blue N/10.
export function ratingBadge(attempt) {
  if (!attempt || attempt.draft) return null;
  const n = attempt.number;
  if (attempt.status === 'reviewing') return { tone: 'neutral', text: 'Assessing', label: `Tutor rating for attempt ${n}: assessing` };
  const value = attempt.rating?.value;
  if (attempt.status === 'reviewed' && validRating(value)) return { tone: 'rated', text: `${value}/10`, label: `Tutor rating: ${value} out of 10 for attempt ${n}` };
  const reason = text(attempt.rating?.reason);
  return { tone: 'neutral', text: 'Not rated', label: `Tutor rating for attempt ${n}: not rated${reason ? `. ${reason}` : ''}` };
}

// The visible label beside the badge, and each native option's plain text (scores as text: no styled HTML in options).
export function attemptLabel(entry) {
  if (entry.draft) return entry.parentNumber ? `Draft · revising attempt ${entry.parentNumber}` : 'Draft';
  return `Attempt ${entry.number} · ${STATUS_WORD[entry.status] || 'Submitted'}`;
}
export function optionText(entry) {
  const badge = ratingBadge(entry);
  return badge?.tone === 'rated' ? `${attemptLabel(entry)} · ${badge.text}` : badge?.text === 'Not rated' && entry.status === 'reviewed' ? `${attemptLabel(entry)} · Not rated` : attemptLabel(entry);
}

// Submit readiness (sections 3 and 5) through the shared contract's answerReadiness: typed words, Sketch marks, a saved
// voice note or a ready input are each a complete answer. voice: voiceSubmitState's { ready, blocked } (explain-back-media.js),
// whose words are shown as they are; inputs: the connected pills ({ state }). reason: the words beside a disabled Submit.
const READINESS_WORDS = { recording_active: STOP_TO_SUBMIT, upload_in_progress: 'Saving voice note', evidence_unavailable: 'An input is not available. Remove it to submit.', text_too_long: `Shorten your answer to ${ANSWER_LIMITS.textChars.toLocaleString('en-US')} characters to submit.`, empty_answer: null };
export function submitState({ text: typed = '', sketched = false, voice = null, inputs = [] }) {
  const recording = voice?.blocked === STOP_TO_SUBMIT;
  const voiceState = voice?.ready ? 'ready' : voice?.blocked === 'Saving voice note' ? 'uploading' : voice?.blocked ? 'failed' : null;
  const answer = { text: String(typed), voice: voiceState ? [{ state: voiceState }] : [], sketch: sketched ? { state: 'ready' } : null, resources: inputs.map(input => ({ state: input.state || 'ready', members: input.members })) };
  const { ready, reason } = answerReadiness(answer, { recording });
  return { ready, code: reason, reason: ready ? null : voice?.blocked || READINESS_WORDS[reason] || null };
}

// The Explain-back card's own block (the legacy single-attempt path, before the durable store is wired): earlier
// attempts kept by Revise answer in block.history, then the one on the block. `strip` turns a stored verdict into the words
// the learner reads; `inPage(attemptId)` says whether its grade request still runs in this page (otherwise a saved
// grading state reads as interrupted).
export function legacyView(block, { strip = value => text(value), inPage = () => false } = {}) {
  const attempts = (Array.isArray(block.history) ? block.history : []).map((entry, index) => legacyAttempt(entry, strip(entry.verdict), index + 1, () => false));
  if (block.answer != null || block.sketchSubmitted) attempts.push(legacyAttempt(block, strip(block.verdict), attempts.length + 1, inPage));
  return { attempts, draft: null, loading: false };
}
function legacyAttempt(entry, verdictText, number, inPage) {
  const status = entry.reviewFailed ? 'failed' : verdictText ? 'reviewed' : entry.grading ? (inPage(entry.attemptId) ? 'reviewing' : 'interrupted') : 'submitted';
  return {
    id: entry.attemptId || `legacy-${number}`, number, status,
    answer: { text: text(entry.answer), sketched: !!entry.sketchSubmitted, voice: [], inputs: [] },
    // A legacy review is the Tutor's own words, shown as they came; it has no sections and no stored rating.
    feedback: status === 'reviewed' ? { text: verdictText, sections: null, comparison: '', citations: [] } : null,
    rating: null,
    error: status === 'failed' ? verdictText || 'The review could not be completed.' : null,
  };
}

// Revise answer on the legacy path keeps the submitted answer and its review on the block, newest last, so the selector
// can still show them; the durable store replaces this once wired. ponytail: no more than HISTORY_KEPT are kept here.
export const HISTORY_KEPT = 10;
export const pastAttempt = block => ({ attemptId: block.attemptId || null, answer: block.answer ?? '', verdict: block.verdict || '', sketchSubmitted: !!block.sketchSubmitted, reviewFailed: !!block.reviewFailed });

// The durable store's state for one card (EB-02/04/07/08), in the EB-01 contract's names (explain-back-contract.js):
//   { attempts: [{ attemptId, submittedContent: ExplainBackAnswer, assessment: readAttempt's latest operation | null }],
//     draft: ExplainBackDraft | null }   oldest attempt first; undefined while it loads.
// This function is the one place the card reads those names.
const CHANGE_WORDS = { resolved: 'Resolved', persisting: 'Still to work on', new: 'New', regressed: 'Slipped back', prior_feedback_corrected: 'Earlier feedback corrected', not_comparable: 'Not comparable' };
const EVIDENCE_NAMES = { voice: 'Voice note', sketch: 'Sketch', recording: 'Sketch recording' };
export function serviceView(raw) {
  if (!raw) return { attempts: [], draft: null, loading: true };
  const numbers = new Map((raw.attempts || []).map((entry, index) => [entry.attemptId, index + 1]));
  const attempts = (raw.attempts || []).map((entry, index) => {
    const content = entry.submittedContent || {};
    const state = attemptState(entry.assessment || null);
    const review = entry.assessment?.provenance?.review || null;
    const status = state === 'reviewed' || state === 'not_rated' ? 'reviewed' : state === 'failed' || state === 'unknown' ? 'failed' : 'reviewing';
    const evidence = new Map([...(content.voice || []), ...(content.sketch ? [content.sketch] : []), ...(content.recording ? [content.recording] : []), ...(content.resources || [])].map(item => [item.evidenceId, item]));
    const typed = text(content.text);
    const citation = (cite, at) => {
      if (cite.evidenceId === 'text') {
        const { start, end } = cite.locator || {};
        const ok = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= typed.length;
        return { id: `${at}:text:${start}-${end}`, attemptId: entry.attemptId, label: ok ? typed.slice(start, end) : 'Your answer', quote: ok ? typed.slice(start, end) : '', available: ok };
      }
      const item = evidence.get(cite.evidenceId);
      return { id: `${at}:${cite.evidenceId}`, attemptId: entry.attemptId, label: item ? text(item.label) || EVIDENCE_NAMES[item.role] || 'Your answer' : 'Your answer', quote: '', available: !!item };
    };
    const feedback = review && status === 'reviewed' ? {
      text: '',
      sections: review.feedback ? { well: text(review.feedback.strengths?.text), revisit: text(review.feedback.revisit?.text), next: text(review.feedback.next?.text) } : null,
      comparison: comparisonText(review.comparison, numbers),
      citations: review.feedback ? ['strengths', 'revisit', 'next'].flatMap(key => (review.feedback[key]?.citations || []).map((cite, i) => citation(cite, `${key}${i}`))) : [],
    } : null;
    if (feedback && !feedback.sections) feedback.text = 'The Tutor has no written feedback for this attempt.';
    const rating = review?.rating || null;
    return {
      id: entry.attemptId, number: index + 1, parentId: content.baseline?.parentAttemptId || null, status,
      answer: {
        text: typed, sketched: !!content.sketch, sketchImage: text(entry.sketchUrl) || null, voice: content.voice || [],
        inputs: (content.resources || []).map(item => ({ id: item.evidenceId, kind: item.media, name: text(item.label) || item.sourceKind || 'Input', count: item.members?.length, scope: '' })),
      },
      feedback,
      rating: rating ? { value: rating.status === 'rated' ? rating.score : null, reason: rating.status === 'rated' ? '' : text(rating.reason) } : null,
      error: state === 'unknown' ? 'The review did not finish. Try again to assess this attempt again.' : status === 'failed' ? 'The review could not be completed. Your answer is saved.' : null,
    };
  });
  const draft = raw.draft ? { id: raw.draft.draftId, parentId: raw.draft.answer?.baseline?.parentAttemptId || null, text: text(raw.draft.answer?.text) } : null;
  return { attempts, draft, loading: false };
}
function comparisonText(comparison, numbers) {
  if (!comparison) return '';
  const earlier = numbers.get(comparison.parentAttemptId);
  const named = earlier ? `attempt ${earlier}` : 'the earlier attempt';
  if (!comparison.comparable) return `A comparison with ${named} is not available${comparison.reason ? ` (${comparison.reason.replace(/_/g, ' ')})` : ''}.`;
  return comparison.items.map(item => `${CHANGE_WORDS[item.change] || item.change}: ${item.note || item.criterionId}`).join('\n\n');
}

// The canvas's input pills (sketchHost.inputs, explain-inputs.js inputPills) as the card shows them: one per link, a Group
// as one pill with its member count, a problem in the learner's words (sketchHost.inputMessage).
export function inputPillsOf(pills = [], message = () => null) {
  return pills.map(pill => ({
    id: pill.linkId, kind: pill.kind === 'group' || pill.kind === 'missing' ? pill.kind : pill.media, name: text(pill.label) || 'Input',
    scope: text(pill.scopeLabel), count: pill.count, members: (pill.members || []).map(member => text(member.label) || text(member.name)).filter(Boolean),
    problem: pill.problem ? message(pill.problem) || 'This input is not available.' : '',
  }));
}

// The Sketch panel's size in its workspace (section 3, responsive table). Side by side it keeps 16 px from the right edge,
// 20 px from the question, about 326 px for the question and 44 px for its Input; below 720 px it stacks under the card.
export const PANEL = Object.freeze({ edge: 16, between: 20, question: 326, input: 44, min: 296, max: 700, initial: 460, stack: 720, step: 24 });
export function panelLayout(workspace, wanted = PANEL.initial) {
  if (workspace < PANEL.stack) return { mode: 'stack', width: Math.max(0, workspace - 2 * PANEL.edge), min: 0, max: 0 };
  const room = workspace - PANEL.edge - PANEL.between - PANEL.question - PANEL.input;
  const max = Math.max(1, Math.min(PANEL.max, room));
  const min = Math.min(PANEL.min, max);
  return { mode: 'side', width: Math.round(Math.max(min, Math.min(Number(wanted) || PANEL.initial, max))), min, max };
}

// What Ask Tutor puts in the Chat composer (section 8): the exercise, the selected attempt and its feedback, as data the
// learner can read before sending. Nothing is sent.
export function askTutorText(question, attempt) {
  const lines = [`Explain-back question: ${question}`, `My attempt ${attempt.number}: ${attempt.answer.text || '(no written text)'}`];
  const sections = attempt.feedback?.sections;
  if (sections) {
    for (const [key, title] of FEEDBACK_SECTIONS) if (sections[key]) lines.push(`${title}: ${sections[key]}`);
  } else if (attempt.feedback?.text) lines.push(`Tutor feedback: ${attempt.feedback.text}`);
  return lines.join('\n');
}
