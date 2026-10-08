// Tutor v2 Stage F: the action validator / policy gate (docs/features/tutor-architecture-v2.md).
// Every proposed TutorAction passes, in order:
//   schema   -> a known type with the fields it needs
//   route    -> the router's allowed types (+ the explicit-request row), no_quiz, one question
//   resource -> the card, part, ladder step, practice task, source or offered material command exists
//   consent  -> navigation only on the learner's own words, a slash or "Keep it on this canvas";
//               a Rabbit Hole is only ever suggested (the learner opens it: /dive, Ctrl+K, Go down)
// and gets one decision { type, accepted, stage, reason }. Accepted actions are capped at 3, and the
// words before a Rabbit Hole suggestion at two sentences (locked §4). The v1 rules (enforce) are
// kept as they were; the new checks are marked "v2".
// domain (TutorDomain, architecture §3.1): the cards, parts, ladder, claims and concepts the resource checks read;
// nanoGPT by default. A journey's cards are its section blocks on the canvas, and it has no ladder.
import { NANOGPT } from './learn-tutor-claims.js';
import { partIndex } from './nanogpt/depth/board.js';
import { ACTION_TYPES, AVATAR_ACTION, AVATAR_MOMENTS, GROUNDING_STATUSES, HANDOFF_ACTION, NEXT_SECTION_ACTION, INTENTS, MODALITY_OVERRIDES, PERSONALIZABLE_MOMENTS, SOURCE_TYPES, VISUAL_VALUE_MAX, avatarSlotId, handoffProblem, learningGoalProblem } from '../../control-plane/src/agents/learn-tutor.js';
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
// Decision 4: a question (sentence.action ask_question, from firstSentence) is spoken early only when
// nothing that could cancel it is left: questionBlocked returns null.
// sentence: firstSentence's { text, action, constraints_add, explicit_request } (or a plain string, a
// statement). options: { pending (this turn's evaluation has not landed), turn, intent (learnerIntent) }.
export function speakable(sentence, routed, { pending = false, turn = null, intent = null } = {}) {
  const { text: raw = '', action = 'respond_text' } = typeof sentence === 'string' ? { text: sentence } : sentence || {};
  const text = String(raw).trim();
  if (text.length < 2 || text.length > 300 || /[`{}<>]|=>/.test(text)) return false;
  if (action === 'ask_question') return !questionBlocked(sentence, routed, { pending, turn, intent });
  if (pending && EVIDENCE_ROWS.includes(routed.row)) return false;
  return routed.allowed.includes('respond_text');
}

// Decision 4: the deterministic constraints that can cancel a question, checked BEFORE it is spoken.
// The first reason found, or null when the question may stream. Each is at least as strict as the
// final gate (validateActions), so a question spoken early is never dropped afterwards.
//   evidence_pending    this turn's evaluation has not landed (quiz selection depends on it, D1)
//   route               the route itself does not allow ask_question
//   constraints_unknown constraints_add was not written before the actions
//   no_quiz             no_quiz / just_answer in the session, in constraints_add, or in the learner's words
//   socratic_limit      two Socratic turns are spent (misconception_explain): explain first, then ask
//   explicit_request    the learner asked to be shown, told or given something (or typed a slash)
//   question_budget     not the plan's first question within the first three actions (enforced in
//                       firstSentence: only the first text action of the first three is ever offered)
export function questionBlocked(sentence, routed, { pending = false, turn = null, intent = null } = {}) {
  if (pending) return 'evidence_pending';
  if (!routed.allowed.includes('ask_question')) return 'route';
  if (!Array.isArray(sentence?.constraints_add)) return 'constraints_unknown';
  const constraints = [...(turn?.constraints || []), ...statedConstraints(turn?.raw_user_message), ...sentence.constraints_add];
  if (constraints.includes('no_quiz') || constraints.includes('just_answer')) return 'no_quiz';
  if (routed.row === 'misconception_explain') return 'socratic_limit';
  if (intent?.kind === 'request' || intent?.kind === 'slash' || turn?.slash || sentence.explicit_request) return 'explicit_request';
  return null;
}

// "Don't quiz me" in the learner's own words binds this turn deterministically, whatever the planner
// reports (locked: no_quiz removes every ask_question for the session).
const STATED_NO_QUIZ = /\b(don'?t|do not|no more|stop)\s+(quiz|test)(z?ing)?\b|\bno (more )?(quiz|quizzes)\b/i;
export const statedConstraints = raw => (STATED_NO_QUIZ.test(String(raw || '')) ? ['no_quiz'] : []);

// ---------- Avatar Teacher V1 (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §3, §4.1) ----------
// suggest_avatar_clip exists only when the router allowed it (route({ avatar }) behind TUTOR_AVATAR, off by
// default); otherwise it stays an unknown type, exactly as before. Voice and Chat are communication modes and
// a clip is learning material, so input_modality never matters here. The moments each router row allows:
const AVATAR_BLOCKED_ROWS = ['gap', 'gap_inline', 'misconception', 'misconception_explain', 'uncertain', 'uncertain_unsettled', 'slash', 'off_slice'];
const AVATAR_ROW_MOMENTS = { returned: ['rabbit_hole_return', 'reflection'], not_yet_observed: ['orientation', 'human_explanation', 'demonstration'], understood: ['transition', 'takeaway', 'reflection'] };
// ponytail: a word match stands for "the learner explicitly asked for the teacher"; it only widens the moments,
// and a clip still needs a stated visual value and a ready canonical clip. Tighten if the benchmark shows misfires.
const ASKS_FOR_TEACHER = /\b(avatar|teacher|professor)\b/i;
export function avatarMoments(row, turn) {
  if (AVATAR_BLOCKED_ROWS.includes(row)) return [];
  if (ASKS_FOR_TEACHER.test(turn.raw_user_message || '')) return [...AVATAR_MOMENTS];
  return [...new Set([...(turn.opening ? ['rabbit_hole_intro', 'orientation'] : []), ...(AVATAR_ROW_MOMENTS[row] || [])])];
}
// One suggestion per (canvas or hole, concept) per session: the key the session store counts.
export const avatarSeenKey = (turn, concept) => `${turn.canvas?.app}|${turn.canvas?.board || 'main'}|${turn.canvas?.dive?.dive_id || ''}|${concept}`;

function avatarSchema(action, domain) {
  if (!AVATAR_MOMENTS.includes(action.moment)) return `${AVATAR_ACTION}: unknown moment ${action.moment}`;
  if (!domain.concepts[action.concept] || (action.to_concept != null && !domain.concepts[action.to_concept])) return `${AVATAR_ACTION}: unknown concept`;
  if (action.max_duration_seconds != null && !(Number.isInteger(action.max_duration_seconds) && action.max_duration_seconds >= 3 && action.max_duration_seconds <= 30)) return `${AVATAR_ACTION}: max_duration_seconds outside 3..30`;
  if (action.visual_value != null && (typeof action.visual_value !== 'string' || action.visual_value.length > VISUAL_VALUE_MAX)) return `${AVATAR_ACTION}: visual_value over ${VISUAL_VALUE_MAX} characters`;
  if (action.learning_goal != null && typeof action.learning_goal !== 'string') return `${AVATAR_ACTION}: learning_goal is not text`;
  return null;
}
// The six trigger questions (§4.1), in order; no value means no suggestion. Returns [stage, reason] to refuse,
// or { offer } to surface: 'play' a ready clip (free), or 'generate' (the deferred learner-paid path).
// routed.avatar = { moments, seen: [avatarSeenKey], ready: Set<avatarSlotId>, on_canvas: Set<avatarSlotId> }.
// navigated: the plan shows or focuses a card because the learner explicitly asked to see it.
function avatarTrigger(action, routed, turn, accepted, navigated, domain) {
  const info = routed.avatar, slot = avatarSlotId(action);
  if (!info?.moments.includes(action.moment)) return ['route', `${action.moment} is not an approved moment in row ${routed.row}`]; // 1
  if (!String(action.visual_value || '').trim()) return ['route', 'no stated visual value']; // 2
  if (navigated) return ['route', 'the learner asked to see a card']; // 3 (the rest is the planner's routing, §4.2)
  if (accepted.some(other => other.type === AVATAR_ACTION)) return ['route', `a second ${AVATAR_ACTION}`]; // 4
  if (info.on_canvas?.has(slot)) return ['route', 'this clip is already on the canvas'];
  if (info.seen.includes(avatarSeenKey(turn, action.concept))) return ['route', 'already suggested for this concept here'];
  if (action.moment === 'transition' && !domain.ladderStep(turn.target?.card, 'deeper')) return ['resource', 'no next ladder card'];
  if (info.ready?.has(slot)) return { offer: 'play' }; // 5
  if (PERSONALIZABLE_MOMENTS.includes(action.moment)) return { offer: 'generate' }; // 6: needs the learner's Generate
  return ['resource', 'no ready canonical clip']; // canonical clips are never learner-paid
}

function schema(action, extra = [], domain = NANOGPT) {
  if (!action || typeof action !== 'object' || ![...ACTION_TYPES, ...extra].includes(action.type)) return `unknown action type ${action?.type}`;
  if (action.type === AVATAR_ACTION) return avatarSchema(action, domain);
  if (TEXT_ACTIONS.includes(action.type) && !String(action.text || '').trim()) return `empty ${action.type}`;
  if (CARD_ACTIONS.includes(action.type) && typeof action.card !== 'string') return `${action.type} without a card`;
  if (action.type === 'focus_part' && typeof action.part_id !== 'string') return 'focus_part without a part';
  if (action.type === 'suggest_dive' && !action.title && !action.concept) return 'suggest_dive: no topic';
  if (action.type === 'create_material' && (typeof action.command !== 'string' || !plainRequest(action.request))) return 'create_material: command and a 1-1000 character request';
  if (action.type === 'suggest_research' && !plainRequest(action.request)) return 'suggest_research: a 1-1000 character request';
  if (action.type === 'suggest_journey' && !plainRequest(action.request)) return 'suggest_journey: a 1-1000 character request';
  if (action.type === HANDOFF_ACTION) return handoffProblem(action); // the shared rule (fix round 1): fastPlanProblem uses it too
  return null;
}
// A create_material, suggest_research or suggest_journey request: plain words, 1-1000 characters, no backticks or arrows (maths is fine).
const plainRequest = request => typeof request === 'string' && !!request.trim() && request.length <= 1000 && !/`|=>/.test(request);

// Task 11b: the planner's reading fields (inferred_intent, modality_override, clarification_requested, grounding_status,
// source_types_used), bounded. A value outside its enum or type becomes null (a list keeps its known entries) and logs the
// field's name, never its value; the turn itself never fails or changes. Telemetry only: no code chooses anything from them.
function readingOf(response, log) {
  const pick = (field, ok) => {
    const value = response[field] ?? null;
    if (value === null || ok(value)) return value;
    log.push(`dropped reading field ${field}`);
    return null;
  };
  const reading = {
    inferred_intent: pick('inferred_intent', value => INTENTS.includes(value)),
    modality_override: pick('modality_override', value => MODALITY_OVERRIDES.includes(value)),
    clarification_requested: pick('clarification_requested', value => typeof value === 'boolean'),
    grounding_status: pick('grounding_status', value => GROUNDING_STATUSES.includes(value)),
    source_types_used: pick('source_types_used', Array.isArray),
  };
  const used = reading.source_types_used;
  if (used) {
    reading.source_types_used = [...new Set(used.filter(type => SOURCE_TYPES.includes(type)))];
    if (reading.source_types_used.length !== used.length) log.push('dropped reading field source_types_used');
  }
  return reading;
}

export function validateActions(response, routed, turn, domain = NANOGPT) {
  const log = [], decisions = [];
  const quoted = typeof response.explicit_request === 'string' ? response.explicit_request.trim() : '';
  const explicit = !!quoted && turn.raw_user_message.toLowerCase().includes(quoted.toLowerCase());
  // The quote is the learner's words: the log (console, the bench's `rejected`) never carries them (Voice privacy).
  if (quoted && !explicit) log.push("explicit_request not in the learner's words");
  // A hook click is the learner's consent for the direction it chose (Professor Next Steps §2.5); never true on a typed turn.
  const navigate = explicit || routed.row === 'slash' || routed.row === 'gap_inline' || !!turn.next_step;
  const allowed = new Set([...routed.allowed, ...(explicit ? ['respond_text', 'show_authored_card', 'focus_part'] : [])]);
  // v2: a constraint the learner states in this very message ("Don't quiz me") already binds this turn.
  const constraints = [...turn.constraints, ...(response.constraints_add || [])].filter(item => !(response.constraints_remove || []).includes(item)).concat(statedConstraints(turn.raw_user_message));
  const noQuiz = constraints.includes('no_quiz') || constraints.includes('just_answer');
  const actions = [];
  const reject = (action, stage, reason) => { decisions.push({ type: action?.type ?? null, accepted: false, stage, reason }); log.push(`dropped ${action?.type}: ${reason}`); };
  const reading = readingOf(response, log); // Task 11b: telemetry, never read by the checks below
  // The avatar action, the handoff (Task 11c-B) and next_section (r29) are known types only on a turn whose route allows them.
  const extra = [AVATAR_ACTION, HANDOFF_ACTION, NEXT_SECTION_ACTION].filter(type => routed.allowed.includes(type));
  for (const action of Array.isArray(response.actions) ? response.actions : []) {
    const bad = schema(action, extra, domain);
    if (bad) { reject(action, 'schema', bad); continue; }
    if (action.type === 'no_action') continue;
    if (action.type === 'open_dive') { reject(action, 'consent', 'only the learner opens a hole (/dive, Ctrl+K, Go down)'); continue; }
    if (!allowed.has(action.type)) { reject(action, 'route', `not allowed in row ${routed.row}`); continue; }
    if (action.type === 'ask_question' && noQuiz) { reject(action, 'route', 'no_quiz'); continue; }
    if (action.type === 'ask_question' && actions.some(other => other.type === 'ask_question')) { reject(action, 'route', 'a second ask_question'); continue; }
    if (CARD_ACTIONS.includes(action.type) && !domain.cards.includes(action.card)) { reject(action, 'resource', `unknown card ${action.card}`); continue; }
    if (action.type === 'focus_part' && partIndex(domain.cardModule(action.card), action.part_id) == null) { reject(action, 'resource', `${action.card} has no part ${action.part_id}`); continue; }
    if (action.type === 'suggest_depth' && !domain.ladderStep(action.card, action.direction || 'deeper')) { reject(action, 'resource', `no ${action.direction || 'deeper'} card after ${action.card}`); continue; } // v2
    if (action.type === 'suggest_practice' && !domain.cardModule(action.card).activity) { reject(action, 'resource', `${action.card} has no practice`); continue; } // v2
    if (action.type === 'return_from_dive' && !turn.canvas.dive) { reject(action, 'resource', 'return_from_dive outside a hole'); continue; }
    // Professor Next Steps §2.5: a command the turn offered (context.available_materials); several materials per turn
    // (owner 2026-10-06), each command once, inside the 3-action cap below.
    if (action.type === 'create_material' && !(turn.available_materials || []).some(m => m.command === action.command)) { reject(action, 'resource', `no material command ${action.command}`); continue; }
    if (action.type === 'create_material' && actions.some(other => other.type === 'create_material' && other.command === action.command)) { reject(action, 'route', `a second create_material for ${action.command}`); continue; }
    if (action.type === 'suggest_research' && actions.some(other => other.type === 'suggest_research')) { reject(action, 'route', 'a second suggest_research'); continue; }
    if (action.type === 'suggest_journey' && actions.some(other => other.type === 'suggest_journey')) { reject(action, 'route', 'a second suggest_journey'); continue; }
    if (action.type === HANDOFF_ACTION && actions.some(other => other.type === HANDOFF_ACTION)) { reject(action, 'route', 'a second handoff'); continue; } // Task 11c-B: at most one per turn
    // r29 (owner 2026-10-08): moving on is the learner's own explicit request, quoted from this message; once per turn.
    if (action.type === NEXT_SECTION_ACTION && !explicit) { reject(action, 'consent', 'next_section without the learner explicitly asking to move on'); continue; }
    if (action.type === NEXT_SECTION_ACTION && actions.some(other => other.type === NEXT_SECTION_ACTION)) { reject(action, 'route', 'a second next_section'); continue; }
    if (action.type === AVATAR_ACTION) { // Avatar Teacher §4.1: a suggestion of learning material, never more
      const navigated = navigate && response.actions.some(other => (other?.type === 'show_authored_card' || other?.type === 'focus_part') && other.mode === 'navigate');
      const trigger = avatarTrigger(action, routed, turn, actions, navigated, domain);
      if (Array.isArray(trigger)) { reject(action, ...trigger); continue; }
      if (actions.length === 3) { reject(action, 'route', 'more than 3 actions'); continue; }
      // visual_value is consumed here and never passed on (§4.1); learning_goal goes on only when clean.
      const { moment, concept, to_concept, learning_goal, max_duration_seconds } = action;
      const problem = learning_goal == null ? null : learningGoalProblem(learning_goal, turn.raw_user_message);
      if (problem) log.push(`dropped ${AVATAR_ACTION} learning_goal: ${problem}`); // the reason, never the text
      actions.push({ type: AVATAR_ACTION, moment, concept, ...(to_concept ? { to_concept } : {}), ...(learning_goal != null && !problem ? { learning_goal } : {}), ...(max_duration_seconds ? { max_duration_seconds } : {}), offer: trigger.offer });
      decisions.push({ type: AVATAR_ACTION, accepted: true, stage: 'accepted', reason: null });
      continue;
    }
    let next = { ...action };
    if ((next.type === 'show_authored_card' || next.type === 'focus_part') && next.mode === 'navigate' && !navigate) { next.mode = 'suggest'; log.push(`downgraded ${next.type} to a chip: no explicit request`); }
    if ((next.type === 'show_authored_card' || next.type === 'focus_part') && !next.mode) next.mode = 'suggest';
    if (Array.isArray(next.cites)) { // v2: a citation must point at a real source of a slice card
      const cites = next.cites.filter(cite => domain.cards.includes(cite?.card) && Number.isInteger(cite.source_index) && cite.source_index >= 0 && cite.source_index < (domain.cardModule(cite.card).sources || []).length);
      if (cites.length < next.cites.length) log.push(`removed ${next.cites.length - cites.length} citation(s) to no source`);
      next.cites = cites;
    }
    if (next.type === 'ask_question') next = { ...next, action_id: crypto.randomUUID(), claim: domain.claims[next.claim] ? next.claim : routed.claim };
    if (next.type === 'create_material') next = { type: 'create_material', command: next.command, request: next.request.trim() };
    if (next.type === 'suggest_research' || next.type === 'suggest_journey') next = { type: next.type, request: next.request.trim() };
    if (next.type === HANDOFF_ACTION) next = { type: HANDOFF_ACTION, capability: next.capability, request: next.request.trim() };
    if (next.type === NEXT_SECTION_ACTION) next = { type: NEXT_SECTION_ACTION };
    if (next.type === 'suggest_dive') {
      // Exactly one originating card (R-10): the target card, else a topic anchor made on Go down.
      const concept = domain.concepts[next.concept] ? next.concept : domain.conceptOf(next.title) || domain.conceptOf(next.concept) || null;
      const title = String(next.title || domain.concepts[concept]?.label || next.concept || '').slice(0, 80);
      next = { type: 'suggest_dive', concept, title, from: turn.target?.block_id ? { block_id: turn.target.block_id } : { anchor: { topic: title } } };
    }
    if (actions.length === 3) {
      // Fix round 1 (A-I1, B-I4): the cap never drops the handoff; the last accepted non-text action (the plan's lowest priority)
      // makes room. With only words accepted there is nothing to drop, and runTurn records the dropped handoff as invalid_action.
      const room = next.type === HANDOFF_ACTION ? actions.findLastIndex(other => !TEXT_ACTIONS.includes(other.type)) : -1;
      if (room < 0) { reject(action, 'route', 'more than 3 actions'); continue; }
      const [out] = actions.splice(room, 1);
      decisions[decisions.findLastIndex(d => d.accepted && d.type === out.type)] = { type: out.type, accepted: false, stage: 'route', reason: 'more than 3 actions: the handoff is kept' };
      log.push(`dropped ${out.type}: more than 3 actions, the handoff is kept`);
    }
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
    return { actions: capped, log, decisions, reading };
  }
  if (!actions.length) actions.push({ type: 'no_action' });
  return { actions, log, decisions, reading };
}
