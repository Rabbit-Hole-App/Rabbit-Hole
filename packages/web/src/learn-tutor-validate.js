// Tutor v2 Stage F: the action validator / policy gate (docs/features/tutor-architecture-v2.md).
// Every proposed TutorAction passes, in order:
//   schema   -> a known type with the fields it needs
//   route    -> the router's allowed types (+ the explicit-request row), no_quiz, one question
//   resource -> the card, part, ladder step, practice task or source exists
//   consent  -> navigation only on the learner's own words, a slash or "Keep it on this canvas";
//               a Rabbit Hole is only ever suggested (the learner opens it: /dive, Ctrl+K, Go down)
// and gets one decision { type, accepted, stage, reason }. Accepted actions are capped at 3, and the
// words before a Rabbit Hole suggestion at two sentences (locked §4). The v1 rules (enforce) are
// kept as they were; the new checks are marked "v2".
import { CLAIMS, CONCEPTS, SLICE_CARDS, cardModule, conceptOf, ladderStep } from './learn-tutor-claims.js';
import { partIndex } from './nanogpt/depth/board.js';
import { ACTION_TYPES } from '../../control-plane/src/agents/learn-tutor.js';
const CARD_ACTIONS = ['show_authored_card', 'focus_part', 'suggest_depth', 'suggest_practice'];
const TEXT_ACTIONS = ['respond_text', 'ask_question'];

// Decision 1 (evaluation dependency): router rows whose move is chosen from evidence (a gap, a
// misconception, unsettled or uncertain evidence) and action types whose choice depends on it
// (a Rabbit Hole suggestion, practice, the next rung, a quiz question). While this turn's evaluation
// is still running these wait for it: an evidence row keeps evaluation on the critical path
// (criticalPath), and evidence actions are released only once the evaluation has landed.
export const EVIDENCE_ROWS = ['gap', 'gap_inline', 'misconception', 'misconception_explain', 'uncertain', 'uncertain_unsettled'];
export const EVIDENCE_ACTIONS = ['suggest_dive', 'suggest_practice', 'suggest_depth', 'ask_question'];

// v2 checkpoint I: may the plan's first sentence (firstSentence) be spoken before the plan is complete?
// Only when the final gate cannot drop it: respond_text is allowed by the route itself (not only by an
// explicit request, which arrives later in the plan), and it is speakable prose - 2 to 300
// characters, no code. Otherwise the Tutor waits for the validated plan.
// Decision 1: while this turn's evaluation is pending only an evidence-independent sentence may be
// spoken; criticalPath already keeps every evidence row blocking, so a pending turn is never on one.
export function speakable(sentence, routed, pending = false) {
  const text = String(sentence || '').trim();
  if (pending && EVIDENCE_ROWS.includes(routed.row)) return false;
  return routed.allowed.includes('respond_text') && text.length >= 2 && text.length <= 300 && !/[`{}<>]|=>/.test(text);
}

function schema(action) {
  if (!action || typeof action !== 'object' || !ACTION_TYPES.includes(action.type)) return `unknown action type ${action?.type}`;
  if (TEXT_ACTIONS.includes(action.type) && !String(action.text || '').trim()) return `empty ${action.type}`;
  if (CARD_ACTIONS.includes(action.type) && typeof action.card !== 'string') return `${action.type} without a card`;
  if (action.type === 'focus_part' && typeof action.part_id !== 'string') return 'focus_part without a part';
  if (action.type === 'suggest_dive' && !action.title && !action.concept) return 'suggest_dive: no topic';
  return null;
}

export function validateActions(response, routed, turn) {
  const log = [], decisions = [];
  const quoted = typeof response.explicit_request === 'string' ? response.explicit_request.trim() : '';
  const explicit = !!quoted && turn.raw_user_message.toLowerCase().includes(quoted.toLowerCase());
  if (quoted && !explicit) log.push(`explicit_request not in the learner's words: "${quoted}"`);
  const navigate = explicit || routed.row === 'slash' || routed.row === 'gap_inline';
  const allowed = new Set([...routed.allowed, ...(explicit ? ['respond_text', 'show_authored_card', 'focus_part'] : [])]);
  // v2: a constraint the learner states in this very message ("Don't quiz me") already binds this turn.
  const constraints = [...turn.constraints, ...(response.constraints_add || [])].filter(item => !(response.constraints_remove || []).includes(item));
  const noQuiz = constraints.includes('no_quiz') || constraints.includes('just_answer');
  const actions = [];
  const reject = (action, stage, reason) => { decisions.push({ type: action?.type ?? null, accepted: false, stage, reason }); log.push(`dropped ${action?.type}: ${reason}`); };
  for (const action of Array.isArray(response.actions) ? response.actions : []) {
    const bad = schema(action);
    if (bad) { reject(action, 'schema', bad); continue; }
    if (action.type === 'no_action') continue;
    if (action.type === 'open_dive') { reject(action, 'consent', 'only the learner opens a hole (/dive, Ctrl+K, Go down)'); continue; }
    if (!allowed.has(action.type)) { reject(action, 'route', `not allowed in row ${routed.row}`); continue; }
    if (action.type === 'ask_question' && noQuiz) { reject(action, 'route', 'no_quiz'); continue; }
    if (action.type === 'ask_question' && actions.some(other => other.type === 'ask_question')) { reject(action, 'route', 'a second ask_question'); continue; }
    if (CARD_ACTIONS.includes(action.type) && !SLICE_CARDS.includes(action.card)) { reject(action, 'resource', `unknown card ${action.card}`); continue; }
    if (action.type === 'focus_part' && partIndex(cardModule(action.card), action.part_id) == null) { reject(action, 'resource', `${action.card} has no part ${action.part_id}`); continue; }
    if (action.type === 'suggest_depth' && !ladderStep(action.card, action.direction || 'deeper')) { reject(action, 'resource', `no ${action.direction || 'deeper'} card after ${action.card}`); continue; } // v2
    if (action.type === 'suggest_practice' && !cardModule(action.card).activity) { reject(action, 'resource', `${action.card} has no practice`); continue; } // v2
    if (action.type === 'return_from_dive' && !turn.canvas.dive) { reject(action, 'resource', 'return_from_dive outside a hole'); continue; }
    let next = { ...action };
    if ((next.type === 'show_authored_card' || next.type === 'focus_part') && next.mode === 'navigate' && !navigate) { next.mode = 'suggest'; log.push(`downgraded ${next.type} to a chip: no explicit request`); }
    if ((next.type === 'show_authored_card' || next.type === 'focus_part') && !next.mode) next.mode = 'suggest';
    if (Array.isArray(next.cites)) { // v2: a citation must point at a real source of a slice card
      const cites = next.cites.filter(cite => SLICE_CARDS.includes(cite?.card) && Number.isInteger(cite.source_index) && cite.source_index >= 0 && cite.source_index < (cardModule(cite.card).sources || []).length);
      if (cites.length < next.cites.length) log.push(`removed ${next.cites.length - cites.length} citation(s) to no source`);
      next.cites = cites;
    }
    if (next.type === 'ask_question') next = { ...next, action_id: crypto.randomUUID(), claim: CLAIMS[next.claim] ? next.claim : routed.claim };
    if (next.type === 'suggest_dive') {
      // Exactly one originating card (R-10): the target card, else a topic anchor made on Go down.
      const concept = CONCEPTS[next.concept] ? next.concept : conceptOf(next.title) || conceptOf(next.concept) || null;
      const title = String(next.title || CONCEPTS[concept]?.label || next.concept || '').slice(0, 80);
      next = { type: 'suggest_dive', concept, title, from: turn.target?.block_id ? { block_id: turn.target.block_id } : { anchor: { topic: title } } };
    }
    if (actions.length === 3) { reject(action, 'route', 'more than 3 actions'); continue; }
    actions.push(next);
    decisions.push({ type: next.type, accepted: true, stage: 'accepted', reason: next.mode === 'suggest' && action.mode === 'navigate' ? 'downgraded to a suggestion' : null });
  }
  // The words before a Rabbit Hole suggestion are at most two sentences (locked §4, gap row). A
  // sentence ends at . ! or ? followed by a space, so decimals (0.904) and code (F.softmax) stay whole.
  if (actions.some(action => action.type === 'suggest_dive')) {
    let budget = 2;
    const capped = [];
    for (const action of actions) {
      if (action.type !== 'respond_text') { capped.push(action); continue; }
      const sentences = action.text.trim().split(/(?<=[.!?])\s+/);
      if (!budget) { log.push('dropped respond_text: over two sentences before a dive suggestion'); decisions.push({ type: 'respond_text', accepted: false, stage: 'route', reason: 'over two sentences before a dive suggestion' }); continue; }
      if (sentences.length > budget) log.push(`shortened respond_text to ${budget} sentence(s) before a dive suggestion`);
      capped.push({ ...action, text: sentences.slice(0, budget).join(' ') });
      budget -= Math.min(budget, sentences.length);
    }
    return { actions: capped, log, decisions };
  }
  if (!actions.length) actions.push({ type: 'no_action' });
  return { actions, log, decisions };
}
