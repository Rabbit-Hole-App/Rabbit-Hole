// Every learner-visible string the roadmap UI shows (decision-records.md section 4, S-numbers in the comments). One file so the
// owner approval list is this file. No ellipsis, no price, no model name. ponytail: S3, S11-S25 and S29 are NEW, pending approval.
export const STRINGS = Object.freeze({
  explain: 'Explain on canvas', // S1 approved
  chooseDepth: title => `Choose a depth for ${title}.`, startPlanning: 'Start planning', // Fix B, approved by the owner 2026-11-06
  keepHere: 'Just keep it here', // S2 approved
  invite: title => `I can explain "${title}" on the canvas, step by step.`, // S3 NEW
  excerptUnavailable: 'The passage is not available right now.', stageChecking: 'Checking', stageSaving: 'Saving', formatName: { explanation: 'Explanation', table: 'Table' }, // canvas lane: slot and bottom pill vocabulary (checklist 4.1)
  accept: 'Accept', cancel: 'Cancel', tab: 'Tab', // S4 approved (Accept [Tab] | Cancel)
  nextReady: 'Next step ready', // S5 approved
  accepting: 'Accepting', // Fix A: the click was received (button label while the request is in flight)
  generating: 'Generating', // NEW (owner spec 2026-11-06): the non-interactive status that takes the Accept | Cancel pill's place on the canvas slot after acceptance
  making: 'Making this explanation.', // Fix A: result generation pending/generating, from the server view
  proposeNext: 'Propose next step', // S6 approved
  end: 'End roadmap', // S7 approved
  acceptPlan: 'Accept plan', // S8 approved
  editPlan: 'Edit plan', // S9 approved
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
  // DRAFT for owner approval (Fix A): a withheld card says why. A source problem and an unfinished check are not a refusal, so Retry stays offered.
  notInSource: 'This explanation quoted words that are not in your source, so I did not add it. You were not charged.',
  contradictsSource: 'This explanation disagreed with your source, so I did not add it. You were not charged.',
  notMatchedToSource: 'Some of this explanation could not be matched to your source, so I did not add it. You were not charged.',
  checkUnavailable: 'The check could not finish, so I did not add this explanation. You were not charged.',
  checking: 'Checking this explanation before it is added.', // S21 NEW
  stale: 'This roadmap changed. Showing the latest.', // S22 NEW
  sourceChanged: 'The source changed since this plan was made. Update the plan to continue.', // S23 NEW
  stepLabel: (n, total) => `Step ${n} of ${total}`, // S24 NEW (D37)
  fromSource: title => `From ${title}`, // S25 NEW
  // R5 (proposal editing, existing card). All NEW, pending approval. The two refusals are the server's StateError sentences (roadmap-proposal-drafts.js).
  edit: 'Edit', editPlaceholder: 'What should change?', apply: 'Apply', discard: 'Discard', existingCard: 'Existing card', // R5-S1..S5
  editUnavailable: 'Editing is not available right now.', editRejected: 'That change could not be made.', // R5-S7, S8 (server text)
  editLimitStep: 'You have reached the edit limit for this step.', editLimitDay: "You have reached today's edit limit.", // M1, owner-approved 2026-11-06 (server text, 429 edit_limit)
  ended: 'Roadmap ended. Your cards stay on the canvas.', // S29 NEW
  // Step status words in the ToC. NEW (not numbered in decision-records.md): approval needed with S11-S25.
  stepState: { planned: 'Planned', proposed: 'Proposed', generating: 'Being made', delivered: 'Delivered', incomplete: 'Incomplete', cancelled: 'Cancelled', skipped: 'Omitted', already_understood: 'Already understood' },
  cardRemoved: 'Card removed',
  planPrefix: 'Plan', depth: 'Depth', depthName: { overview: 'Overview', standard: 'Standard', deep: 'Deep' },
  // Tutor core MVP (checklist 4.1 vocabulary; roadmap 3.1-3.12). Exact labels from the approved action list; sentences per roadmap 3.2/3.3/3.5/3.7.
  startNewChat: 'Start new chat', stayHere: 'Stay here',
  recoveryDone: 'Resolved', routedNew: 'Started a new chat', routedStay: 'Stayed in this chat', draftAccepted: 'Roadmap accepted', draftReplaced: 'Replaced by a newer draft',
  routeChoice: name => `You’ve added **${name}**. Start a new chat for this document or stay here?`,
  inviteDrop: name => `You’ve added **${name}**. Would you like me to explain it on the canvas?`,
  boundary: name => `You’ve added **${name}**. This canvas already has a roadmap in progress, so I’ll keep it here. To start a separate roadmap for it, use End roadmap on the current one first.`,
  generatingRoadmap: 'Generating roadmap', roadmapPrepared: name => `I’ve prepared a roadmap for **${name}**.`,
  roadmapParameters: 'Roadmap parameters', roadmapDraft: 'Roadmap draft', scope: 'Scope', fullContent: name => `Full content · ${name}`, selectedPassage: 'Selected passage',
  roadmapMode: 'Roadmap', modeExplanations: 'Explanations only', modePractice: 'Explanations + practice', practiceUnavailable: 'Practice is not available yet',
  acceptRoadmap: 'Accept roadmap', editRoadmap: 'Edit roadmap', openToc: 'Open table of contents', superseded: 'Replaced by a newer draft',
  roadmapReady: first => (first ? `Your roadmap is ready. We’ll start with “${first}”.` : 'Your roadmap is ready.'),
  nextCard: 'Next card', editCard: 'Edit card', goToCard: 'Go to card', goToText: 'Go to highlighted text',
  stage: { proposed: 'Proposed card', accepting: 'Accepting', generating: 'Generating', checking: 'Checking', saving: 'Saving', ready: 'Ready on the canvas', failed: 'Not made', skipped: 'Skipped', cancelled: 'Cancelled' },
  formatName: { explanation: 'Explanation', table: 'Table' },
});
