// Every learner-visible string the roadmap UI shows (decision-records.md section 4, S-numbers in the comments). One file so the
// owner approval list is this file. No ellipsis, no price, no model name. ponytail: S3, S11-S25 and S29 are NEW, pending approval.
export const STRINGS = Object.freeze({
  explain: 'Explain on canvas', // S1 approved
  keepHere: 'Just keep it here', // S2 approved
  invite: title => `I can explain "${title}" on the canvas, step by step.`, // S3 NEW
  accept: 'Accept', cancel: 'Cancel', tab: 'Tab', // S4 approved (Accept [Tab] | Cancel)
  nextReady: 'Next step ready', // S5 approved
  proposeNext: 'Propose next step', // S6 approved
  end: 'End roadmap', // S7 approved
  acceptPlan: 'Accept plan', // S8 approved
  editPlan: 'Edit plan', // S9 approved
  retry: 'Retry', replace: 'Replace', omit: 'Omit', // S10 approved
  roadmap: 'Roadmap', assumptions: 'Assumptions', steps: 'Steps', stoppingPoint: 'Stopping point', // S11 NEW
  explanationsOnly: 'Explanations', // S12 NEW
  planning: 'Planning your roadmap', // S13 NEW
  planReady: 'Your plan is ready to review.', // S14 NEW
  questionLabel: 'Question about your plan', // S17 NEW
  cancelled: 'Proposal cancelled', // S31 NEW (named in v1.4 2.3 / R4.12; missing from ui.md)
  paused: 'Paused. Propose the next step when you are ready.', // S18 NEW
  completed: 'You reached the stopping point of this roadmap. Ask for more or revise the plan to continue.', // S19 NEW
  failed: 'This explanation could not be made. You were not charged.', // S20 NEW
  // DRAFT for owner approval (S26, S27; receipts/r4-safety-strings.md). Short, no diagnosis, no model or price. The owner replaces or approves the exact text.
  safetyLimit: "I can't make this explanation. It is outside what I can create here. You were not charged.", // S26 DRAFT
  personalRisk: 'I did not make this explanation, and you were not charged. If you are in danger or thinking about hurting yourself, please call your local emergency number or a crisis line in your area. You do not have to deal with this alone.', // S27 DRAFT
  checking: 'Checking this explanation before it is added.', // S21 NEW
  stale: 'This roadmap changed. Showing the latest.', // S22 NEW
  sourceChanged: 'The source changed since this plan was made. Update the plan to continue.', // S23 NEW
  stepLabel: (n, total) => `Step ${n} of ${total}`, // S24 NEW (D37)
  fromSource: title => `From ${title}`, // S25 NEW
  // R5 (proposal editing, existing card). All NEW, pending approval. The two refusals are the server's StateError sentences (roadmap-proposal-drafts.js).
  edit: 'Edit', editPlaceholder: 'What should change?', apply: 'Apply', discard: 'Discard', existingCard: 'Existing card', // R5-S1..S5
  editUnavailable: 'Editing is not available right now.', editRejected: 'That change could not be made.', // R5-S7, S8 (server text)
  ended: 'Roadmap ended. Your cards stay on the canvas.', // S29 NEW
  // Step status words in the ToC. NEW (not numbered in decision-records.md): approval needed with S11-S25.
  stepState: { planned: 'Planned', proposed: 'Proposed', generating: 'Being made', delivered: 'Delivered', incomplete: 'Incomplete', cancelled: 'Cancelled', skipped: 'Omitted', already_understood: 'Already understood' },
  cardRemoved: 'Card removed',
  planPrefix: 'Plan', depth: 'Depth', depthName: { overview: 'Overview', standard: 'Standard', deep: 'Deep' },
});
