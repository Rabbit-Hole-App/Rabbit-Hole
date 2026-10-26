// What kind of response an assistant message is (chat generation UX, bugs 1 and 3): ONE pure classification, read by the Chat
// transcript (ChatMessages.jsx) to decide whether the generic answer extras belong under it.
//   'artifact' - the response makes, or is about to make, something on the canvas: it carries a generation proposal (pending,
//                refined or generated), or its turn already made cards (active job or completed output).
//   'command'  - the turn was a slash command (a non-generating one, or one whose output is not recorded yet).
//   'ordinary' - an explanatory answer to a plain question: keeps Explore next, Add as card and Regenerate.
// Persisted metadata comes first (the answer's meta.proposal, the turn's saved outputs and command); an older turn with no saved
// command falls back to the existing command parser (command-token.js sentCommand: a registered /name at the very start of the
// turn's text). The answer's own prose is never read, so an explanation that mentions /motion stays ordinary, and a card selected
// as context is not an input here at all.
import { sentCommand } from './command-token.js';

// The turns an answer can answer: what the learner typed, or a next step they chose.
const TURNS = new Set(['user', 'step']);

// The turn that asked message i: the nearest earlier learner message. -1 when there is none.
export function turnIndex(msgs, i) {
  for (let j = i - 1; j >= 0; j--) if (TURNS.has(msgs[j]?.role)) return j;
  return -1;
}

// -> { kind, ordinary, command, reason }. message: the assistant message; turn: the learner message it answers (or null).
export function responseKind(message, turn = null) {
  const done = (kind, reason = null, command = null) => ({ kind, ordinary: kind === 'ordinary', command, reason });
  if (message?.meta?.proposal?.proposal_id || message?.meta?.proposalConflict) return done('artifact', 'proposal');
  if (turn?.outputs?.length) return done('artifact', 'outputs');
  const { command } = sentCommand(turn?.role === 'user' ? turn : {});
  return command ? done('command', 'command', command) : done('ordinary');
}
