// UI-15 / MOT-20b: which capabilities are proposed before anything is generated, and the fields their shared proposal card
// shows. No imports, so the worker (generation-proposal.js) and the web (generation-proposal-chat.js, GenerationProposalCard)
// read one definition.
// shortcut: CR-1 owns the capability declaration (C:/s/spec/day-1021/chat-route-interface.md, not published at writing);
// this module is the one place to swap for it when it lands.

// 'always': every request is a proposal card first; 'direct': the command keeps its direct action (owner messages 40, 41).
// A command with no entry keeps its existing behaviour; another capability joins with its entry and its fields below.
export const PROPOSAL_RULES = Object.freeze({
  motion: 'always',
  search: 'direct',
  dive: 'direct',
  notebook: 'direct',
  whiteboard: 'direct',
});
export const reviewRequired = command => PROPOSAL_RULES[command] === 'always';
export const PROPOSED = Object.freeze(Object.keys(PROPOSAL_RULES).filter(reviewRequired));

// The card's settings fields per capability, in order. seconds: a choice of whole seconds from min to max in steps of step
// (plus the proposal's own value); toggle: Off and On, where `unavailable` says why On cannot be chosen yet. A capability
// without a field shows none: no duration or audio where it does not support them.
export const PROPOSAL_FIELDS = Object.freeze({
  motion: Object.freeze([
    Object.freeze({ key: 'duration_seconds', kind: 'seconds', label: 'Duration', min: 5, max: 30, step: 5 }),
    Object.freeze({ key: 'audio', kind: 'toggle', label: 'Audio', unavailable: 'Narration coming soon' }),
  ]),
});
export const proposalFields = command => PROPOSAL_FIELDS[command] || [];
