// What of an Explain-back card is the learner's own (plan 2026-10-30-explain-back.md section 9, EB-02.4): their answer,
// drafts, Sketch, attempts, reviews and the Sketch panel's state. A share link, a member's view, a fork, a duplicate and a
// paste receive the public exercise only: the question, its hint and expected ideas, and the Input's connections to
// sources on the canvas. The durable attempts, voice notes and recordings live in the attempt store, owner-only (D). Pure:
// the canvas and the control plane (shared-privacy.js, learn-boards.js forkState) share this one list.
export const EXPLAIN_BACK_PRIVATE = Object.freeze([
  // the answer on the card (legacy single attempt) and its review
  'answer', 'attemptId', 'verdict', 'grading', 'reviewFailed', 'history',
  // a draft, its voice or recording references (aa_ assets) and the durable store's card binding
  'draft', 'voice', 'recording', 'activityId', 'activityRevision', 'goalId',
  // the Sketch: its marks (with sketch.draftId) and the panel's own state
  'sketch', 'sketchOpen', 'sketchSubmitted', 'sketchPinned', 'sketchWidth',
]);

// The one test for a Practice card (owner 2026-10-30: Explain-back = Challenge = Practice): every challenge block, an old one
// without mode 'explain_back' included. The canvas, its inputs, Sketch host and the control plane all ask this.
export const isExplainBackCard = block => block?.type === 'challenge';

// The card as anyone but its learner receives it; any other card unchanged (the same object).
export function publicExplainBack(block) {
  if (!isExplainBackCard(block) || !EXPLAIN_BACK_PRIVATE.some(key => key in block)) return block;
  const copy = { ...block };
  for (const key of EXPLAIN_BACK_PRIVATE) delete copy[key];
  return copy;
}
