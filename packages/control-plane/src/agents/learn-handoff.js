// The Tutor handoff contract (task-11c-brief.md): the action type, the capabilities it may name and the one request bound. Pure
// and import-free, so the browser validator and the server both read it (learn-tutor-handoff.js re-exports it for the route).
// handoff { capability, request }, the handoff route's body (learn-tutor-handoff.js) without what the browser adds from
// structured state (app, selection, context). HANDOFF_CAPABILITY_NAMES is that route's dispatch table (a test keeps them
// equal): a future capability adds a name there and here, never a new action. Like the avatar action, the tool carries it only
// on a turn whose route allows it (plannerRequest), so every other request stays byte-identical; a handoff-allowed turn caches
// under its own tool schema (the tool renders before the cached system block), a separate cache entry.
export const HANDOFF_ACTION = 'handoff';
export const HANDOFF_CAPABILITY_NAMES = ['repository_context'];
// The one rule for a valid handoff (fix round 1, A-I1 and B-I4), shared by the browser validator and fastPlanProblem: a known
// capability and a non-blank request of at most 1000 characters (the route's bound). The request is a question for the source
// reader, so backticks, code, identifiers, file names and => are allowed. The problem, or null.
// HANDOFF_REQUEST_MAX (fix round 2): the one request bound - handoffProblem here and the route (learn-tutor-handoff.js) both read it.
export const HANDOFF_REQUEST_MAX = 1000;
export const handoffProblem = action => (!HANDOFF_CAPABILITY_NAMES.includes(action?.capability) ? 'handoff: an unknown capability'
  : typeof action.request !== 'string' || !action.request.trim() || action.request.length > HANDOFF_REQUEST_MAX ? `handoff: a 1-${HANDOFF_REQUEST_MAX} character request` : null);
