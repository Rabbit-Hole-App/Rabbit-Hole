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

// The card's settings per capability, in CR-1's declaration shape (chat-route-interface.md section 6, CHAT_CAPABILITIES[id].settings):
// { key: { type: 'integer', min, max, step, unit, label } | { type: 'boolean', available, unavailable, label } }, in order.
// integer: a choice of min..max in steps (plus the proposal's own value); boolean: Off and On, never editable while
// available is false (unavailable says why). A capability without settings shows none: no duration or audio where unsupported.
export const PROPOSAL_SETTINGS = Object.freeze({
  motion: Object.freeze({
    duration_seconds: Object.freeze({ type: 'integer', min: 5, max: 30, step: 5, unit: 's', label: 'Duration' }),
    audio: Object.freeze({ type: 'boolean', available: false, unavailable: 'Narration coming soon', label: 'Audio' }),
  }),
});
// -> [{ key, ...field }] in declaration order; [] for a capability without settings.
export const proposalFields = command => Object.entries(PROPOSAL_SETTINGS[command] || {}).map(([key, field]) => ({ key, ...field }));
