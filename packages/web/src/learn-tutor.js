// Tutor v1 for the NanoGPT Attention slice (docs/features/tutor-v1-locked-decisions.md,
// docs/features/tutor-v1-implementation-map.md). Per learner message:
//   LearnerTurn -> evaluator -> evidence store -> router -> planner -> TutorAction[] -> canvas
// Pure apart from what is injected: `post` (the three /api/learn/tutor routes: evaluate, plan and handoff) and, for actions,
// the canvas commands. The target identities come from the shared resolver (learn-target.js),
// which /dive uses too; frozen card modules are only read.
// TutorDomain (docs/features/adaptive-learning-path-v1-architecture.md §3): every slice-specific read goes through
// `domain`, the nanoGPT one (NANOGPT, learn-tutor-claims.js) by default, so nanoGPT callers are unchanged; a journey
// canvas passes journeyDomain (learn-journey-domain.js) to the same functions.
import { resolveTarget } from './learn-target.js';
import { cardBlock } from './nanogpt/board.js';
import { partIndex } from './nanogpt/depth/board.js';
import { describeAnimation } from './scene-describe.js';
import { checkStatus, enterPractice, isPracticing } from './scene-activity.js';
import { applyInputToBlock } from './scene-evaluate.js';
import { coerceInputs, validateInputDeclarations } from './scene-inputs.js';
import { NANOGPT, cardModule, claimsOfConceptIn, holeConcept, partLabels } from './learn-tutor-claims.js';
import { appendEvents, conceptState, deriveClaimStates, practiceEvents, reconcile } from './learn-tutor-evidence.js';
import { selectClaims } from './learn-tutor-select.js';
import { EVIDENCE_ACTIONS, EVIDENCE_ROWS, avatarMoments, speakable, statedConstraints, validateActions } from './learn-tutor-validate.js';
import { AVATAR_ACTION, HANDOFF_ACTION, MODE_SLASHES } from '../../control-plane/src/agents/learn-tutor.js';
import { decisionEvent, handoffUsage, safely, turnTrace } from './learn-tutor-trace.js';
import { validSources } from './card-sources.js';
import { actionContract, reasonCodes } from './learn-tutor-actions.js';

// The slashes the Tutor accepts (LearnTutor slash()). /deeper and /simplify fix the move (row slash, no words read) only on a
// domain with a depth ladder; elsewhere they are ordinary turns from the composer's words (Task 11b fix B5). /ask and /teach
// (owner thirteenth message) are a marker on an ordinary turn - its words keep their kind, claim selection, evaluation and
// tier (fix A3) - read as turn.mode and learner_intent.slash. /research and /do are not Canvas commands.
export const SLASHES = ['deeper', 'simplify', 'dive', ...MODE_SLASHES];
const fixedSlash = (slash, domain) => (slash === 'dive' || ((slash === 'deeper' || slash === 'simplify') && domain.ladder?.length) ? slash : null);
const canvasKey = canvas => `${canvas.app}|${canvas.board || 'main'}`;
export const sameCanvas = (a, b) => !!a && !!b && canvasKey(a) === canvasKey(b);

// ---------- LearnerTurn (§1) ----------

// The LearnerTurn target: the five identities stay separate (block, runtime scene, authored card,
// part, concepts); `card` is the authored evidence.card, never the block id or scene.id.
export function targetOf(block) {
  if (!block) return null;
  const target = resolveTarget(block);
  return { block_id: target.block_id, scene_id: target.scene_id, card: target.card_id, depth: target.depth, part_id: target.part_id, selected_object: target.selected_object, concepts: target.concept_ids };
}

// Inputs with their defaults (hidden activity latches left out), the practice attempts with the
// option labels the learner saw (G6), never the expected answer.
export function cardState(block, store) {
  if (!block?.scene) return null;
  let inputs = { ...(block.inputs || {}) };
  try {
    const declarations = validateInputDeclarations(block.scene.inputs || [], block.scene.exampleData, Object.keys(block.scene.derived || {}));
    const values = coerceInputs(declarations, block.inputs, block.scene.exampleData);
    inputs = Object.fromEntries(declarations.filter(entry => !entry.hidden).map(entry => [entry.name, values[entry.name]]));
  } catch { /* a scene that fails validation renders its error box; raw inputs are all there is */ }
  const activity = block.activity;
  const practice = activity ? {
    task_id: activity.id,
    status: checkStatus(block).state === 'submitted' ? 'submitted' : isPracticing(block) ? 'open' : 'none',
    attempts: (block.attemptLog || []).map((entry, index) => ({
      seq: store.events.find(event => event.ref?.block_id === block.id && event.ref.attempt === index)?.seq ?? null,
      answer_id: entry.answer,
      answer_label: activity.answer?.options?.find(option => option.id === entry.answer)?.label ?? String(entry.answer),
      result: entry.result,
    })),
  } : null;
  return { inputs, input_revision: block.inputRevision || 0, practice };
}

// A hole's concept: its title ("Softmax"), else a registry concept among its origin concepts. holeConcept(dive,
// domain) lives in learn-tutor-claims.js, where the nanoGPT domain's defaultClaims reads it too.
export { holeConcept };

// The claims this turn is about: the one an open question asks about, the blocked claim after a
// return, a clicked hook's claims, then the target card's (or part's, or selected object's), else the domain's default
// (nanoGPT: the hole's concept; a journey: its current section's expected evidence, nothing in setup).
export function turnClaims(turn, store, domain = NANOGPT) {
  const out = [];
  const add = id => { if (id && domain.claims[id] && !out.includes(id)) out.push(id); };
  if (turn.answering) add(store.open?.claim);
  if (turn.returned_from) add(turn.returned_from.claim);
  if (turn.next_step) turn.next_step.claim_ids.forEach(add);
  // block_id: a journey's cards are its blocks (their stamped claims); the nanoGPT registry reads the card.
  const target = turn.target && { block_id: turn.target.block_id, card_id: turn.target.card, part_id: turn.target.part_id, selected_object: turn.target.selected_object, concept_ids: turn.target.concepts };
  domain.targetClaims(target).forEach(add);
  if (!out.length) domain.defaultClaims(turn).forEach(add);
  return out.slice(0, 4);
}

// The turn's claims and their prerequisites' claims (at most 10): the ClaimStates the turn carries,
// and the selector's candidates.
function withPrerequisites(claims, domain = NANOGPT) {
  const ids = [...claims];
  for (const id of claims) for (const concept of domain.claims[id].prerequisites) for (const other of claimsOfConceptIn(domain.claims, concept)) if (!ids.includes(other)) ids.push(other);
  return ids.slice(0, 10);
}
const turnEvidence = (claims, states, domain) => withPrerequisites(claims, domain).map(id => states[id]);

// inputModality: 'text' (typed) or 'voice' (Voice Mode, docs/features/voice-tutor-mvp.md §1);
// turnId: the voice trace id minted at the utterance commit, else a fresh one.
// nextStep (Professor Next Steps §2.5): a clicked hook's selected_next_step. The turn carries it as structured data with
// no learner words, answers no open question and consumes no dive choice or return. materials: the Learn commands the turn may
// run as create_material (learn-slash.js materialCommands) - on any turn since Task 11b (owner ninth message), typed, voice or
// hook. research (Task 11b): the page can open its Research workflow, so the turn may offer suggest_research (research_offer).
// journeyOffer (fix B1): a journey can start here (no journey yet or a live one, fix round 2; not in a hole, not in setup), so
// the turn may offer suggest_journey (journey_offer). repository (Task 11c-B): the canvas reads a repository (structured page
// state, LearnTutor.jsx canvasRepository), so the turn may hand off to repository_context (handoff_offer); words never set it.
// canvas.liveTitle: a hole's live title (Task 10 fix round 3).
export function buildTurn({ raw, slash = null, opening = false, canvas, block, store, states, inputModality = 'text', turnId = null, domain = NANOGPT, nextStep = null, materials = [], research = false, journeyOffer = false, repository = false }) {
  // A typed slash is a command, never an answer to the Tutor's open question (fix round 2), wherever it fixes the move or not.
  const typed = !!slash, mode = MODE_SLASHES.includes(slash) ? slash : null;
  slash = fixedSlash(slash, domain);
  const here = { app: canvas.app, board: canvas.board || 'main' };
  const open = store.open && sameCanvas(store.open.canvas, here) && !typed && !nextStep ? store.open : null;
  const keep = store.keep && sameCanvas(store.keep.canvas, here) && !nextStep ? store.keep : null;
  const back = store.returned && sameCanvas(store.returned.parent, here) && !nextStep ? store.returned : null;
  if (nextStep) raw = '';
  const turn = {
    turn_id: turnId || crypto.randomUUID(),
    raw_user_message: raw,
    input_modality: inputModality === 'voice' ? 'voice' : 'text',
    slash,
    ...(mode ? { mode } : {}),
    ...(open ? { answering: open.action_id } : {}),
    ...(keep ? { dive_choice: { concept: keep.concept, choice: 'inline' } } : {}),
    ...(opening ? { opening: true } : {}),
    canvas: { ...here, ...(canvas.dive ? { dive: { dive_id: canvas.dive.dive_id, parent: canvas.dive.origin?.parent, origin: canvas.dive.origin, record: canvas.dive, ...(canvas.liveTitle ? { title: canvas.liveTitle } : {}) } } : {}) },
    target: targetOf(block),
    card_state: cardState(block, store),
    evidence: [],
    constraints: [...store.constraints],
    ...(back ? { returned_from: { dive_id: back.dive_id, concept: back.concept, claim: back.claim, states: claimsOfConceptIn(domain.claims, back.concept).map(id => states[id]) } } : {}),
    recent_turns: store.turns.slice(-4),
    recent_actions: store.actions.slice(-3),
    ...(nextStep ? { next_step: { suggestion_id: nextStep.suggestion_id, hook: nextStep.hook, learning_goal: nextStep.learning_goal, concept_ids: [...(nextStep.concept_ids || [])], claim_ids: [...(nextStep.claim_ids || [])] } } : {}),
    ...(nextStep || materials.length ? { available_materials: materials } : {}),
    ...(research ? { research_offer: true } : {}),
    ...(journeyOffer ? { journey_offer: true } : {}),
    ...(repository ? { handoff_offer: true } : {}),
  };
  const claims = turnClaims(turn, store, domain);
  turn.evidence = turnEvidence(claims, states, domain);
  // Stage B: the claims the learner's words touch, out of the turn's claims and their prerequisites'.
  const selection = raw.trim() && !turn.slash && !opening ? selectClaims(raw, {
    candidates: withPrerequisites(claims, domain), fallback: claims,
    forced: [turn.answering ? store.open?.claim : null, turn.returned_from?.claim].filter(Boolean),
  }, domain) : null;
  return { turn, claims, selection };
}

// What /api/learn/tutor/evaluate checks: the turn's claims, and gap checks for their prerequisites.
// Gaps are bounded as validateEvaluateBody bounds them (and the server's journeySpec builds them): at most 4, each
// statement at most 600 characters, so a journey registry's longer prerequisite claims never 400 a hole's evaluation.
// The nanoGPT registry is under both (one prerequisite concept, 225 characters), so its specs are unchanged.
export function evaluationSpec(turn, claims, store, domain = NANOGPT) {
  const gaps = [];
  for (const id of claims) for (const concept of domain.claims[id].prerequisites) {
    let gap = gaps.find(entry => entry.concept === concept);
    if (!gap) gaps.push(gap = { concept, statement: claimsOfConceptIn(domain.claims, concept).map(other => domain.claims[other].statement).join(' ').slice(0, 600), claims: [] });
    gap.claims.push(id);
  }
  return {
    answering: !!turn.answering,
    ...(turn.answering && store.open?.text ? { question: store.open.text } : {}),
    claims: claims.map(id => {
      // The named misconceptions this claim already has a settled event for: one more settled one
      // makes the claim `misconception`, so the escalation policy treats that check as important.
      const prior = [...new Set(store.events.filter(event => event.claim === id && event.settled && event.misconception_id).map(event => event.misconception_id))];
      const claim = domain.claims[id];
      return { id, concept: claim.concept, statement: claim.statement, ideas: claim.ideas, misconceptions: claim.misconceptions, drawn: claim.drawn, ...(prior.length ? { prior_misconceptions: prior } : {}) };
    }),
    gaps: gaps.slice(0, 4),
  };
}

// ---------- Router (§7) ----------

// First match wins; one strategy and one move per turn. The planner composes inside `allowed`.
// avatar (TUTOR_AVATAR, Avatar Teacher §3/§4.1): { ready, on_canvas } (Sets of avatarSlotId) adds
// suggest_avatar_clip on the rows that allow a moment, in Chat and Voice alike. Off (null, the default) the
// route is exactly as before.
// ponytail: runTurn never passes avatar yet; AV6 wires the knob, the ready-clip lookup (LearnAvatarClips
// ?ready), the canvas's clips and the session's avatar_seen record.
// domain: accepted for parity with the other stages; route reads nothing domain-specific (claims and states arrive scoped).
// MATERIAL_FIXED (Task 11b): rows whose existing rule fixes the move, so they never make material (nor hand off: Task 11c-B) - a return from a hole
// re-asks its question, an explanation JEV could not settle gets one clarifying question, /deeper and /simplify navigate
// authored cards. None of them is reachable on a hook click (no slash, no return, no evaluation), so hook turns are unchanged.
const MATERIAL_FIXED = ['returned', 'uncertain_unsettled', 'slash'];
export function route({ turn, claims, states, evaluation, store, avatar = null, domain = NANOGPT }) {
  const noQuiz = turn.constraints.includes('no_quiz') || turn.constraints.includes('just_answer');
  const inHole = !!turn.canvas.dive;
  const finish = (row, strategy, allowed, claim = null) => {
    let list = noQuiz ? allowed.filter(type => type !== 'ask_question') : allowed;
    if (!list.some(type => type === 'respond_text' || type === 'ask_question')) list = ['respond_text', ...list];
    if (inHole && !list.includes('return_from_dive')) list = [...list, 'return_from_dive'];
    // Professor Next Steps (contract §2.5) and Task 11b (owner ninth message): any turn offered materials - a hook click, a
    // typed or a voice turn - may make material through the existing Learn commands, except on a row whose rule fixes the
    // move (MATERIAL_FIXED). suggest_research (owner nineteenth message) is an offer on every row where the page can open
    // Research. Nothing here reads the learner's words.
    if (turn.available_materials?.length && !MATERIAL_FIXED.includes(row) && !list.includes('create_material')) list = [...list, 'create_material'];
    if (turn.research_offer && !list.includes('suggest_research')) list = [...list, 'suggest_research'];
    // Fix B1: a learning path is an offer the learner starts (suggest_journey), on every row where a journey can start.
    if (turn.journey_offer && !list.includes('suggest_journey')) list = [...list, 'suggest_journey'];
    // Task 11c-B: the repository_context handoff, where the canvas reads a repository (turn.handoff_offer, structural), on typed,
    // voice and hook turns alike, except on a row whose rule fixes the move (MATERIAL_FIXED). Never from the learner's words.
    if (turn.handoff_offer && !MATERIAL_FIXED.includes(row) && !list.includes(HANDOFF_ACTION)) list = [...list, HANDOFF_ACTION];
    const moments = avatar ? avatarMoments(row, turn) : [];
    if (moments.length) return { row, strategy, allowed: [...list, AVATAR_ACTION], claim, avatar: { moments, seen: store?.avatar_seen || [], ready: avatar.ready || new Set(), on_canvas: avatar.on_canvas || new Set() } };
    return { row, strategy, allowed: list, claim };
  };
  if (turn.slash === 'deeper' || turn.slash === 'simplify') return finish('slash', 'none', ['respond_text', 'show_authored_card', 'focus_part'], claims[0] || null);
  if (turn.returned_from) return finish('returned', noQuiz ? 'feynman' : 'socrates', ['ask_question'], turn.returned_from.claim || claims[0] || null);
  if (!claims.length) return finish('off_slice', 'none', ['respond_text']);
  const pick = test => claims.find(id => test(states[id]));
  const gap = pick(state => state.state === 'prerequisite_gap');
  if (gap) {
    const concept = states[gap].prerequisite;
    if (turn.dive_choice?.choice === 'inline' && turn.dive_choice.concept === concept) return finish('gap_inline', 'feynman', ['respond_text', 'show_authored_card', 'focus_part'], gap);
    return finish('gap', 'none', ['respond_text', 'suggest_dive'], gap);
  }
  const wrong = pick(state => state.state === 'misconception');
  if (wrong) {
    if ((store.socratic[wrong] || 0) < 2 && !noQuiz) return finish('misconception', 'socrates', ['ask_question', 'focus_part'], wrong);
    return finish('misconception_explain', 'feynman', ['respond_text', 'ask_question', 'focus_part'], wrong);
  }
  const unsure = pick(state => state.state === 'uncertain');
  // An explanation whose content JEV could not settle and the policy did not escalate (Stage C):
  // one clarifying question, never a fail.
  const unclear = evaluation?.status === 'uncertain' && (evaluation.escalation?.uncertain || []).some(key => /^c\d+_(idea|mis|contra)/.test(key));
  if ((unsure || unclear) && evaluation?.status === 'uncertain') return finish('uncertain_unsettled', 'feynman', ['ask_question'], unsure || claims[0]);
  if (unsure) return finish('uncertain', 'feynman', ['respond_text', 'focus_part', 'show_authored_card', 'suggest_depth', 'suggest_practice', 'ask_question'], unsure);
  const unseen = pick(state => state.state === 'not_yet_observed');
  if (unseen) return finish('not_yet_observed', 'feynman', ['respond_text', 'ask_question', 'show_authored_card', 'suggest_depth'], unseen);
  return finish('understood', 'none', ['respond_text', 'suggest_depth', 'ask_question'], claims[0]);
}

// ---------- Compact Teaching State (§9, v2 Stage E) ----------

// What the learner is doing this turn, deterministically: a clicked hook (next_step), a slash, a hole's opening, an answer
// to the Tutor's open question, a request ("show me", "explain", "don't quiz me"), a question, else an
// explanation. The planner reads it; JEV still decides whether words were an attempt.
export function learnerIntent(turn) {
  const raw = turn.raw_user_message.trim();
  const kind = turn.next_step ? 'next_step' : turn.slash ? 'slash' : turn.opening ? 'opening' : turn.returned_from ? 'returned' : turn.answering ? 'answer'
    : /^(please |can you |could you |just )?(show|take|give|explain|tell|walk|go|simplify|don'?t|do not|no more|stop)\b/i.test(raw) ? 'request'
    : /\?\s*$/.test(raw) || /^(why|how|what|when|where|which|who|is|are|does|do|can|could|should|would)\b/i.test(raw) ? 'question' : 'explanation';
  // input_modality only on voice turns, so a typed turn's planner context is unchanged. slash: a fixed slash (kind slash), or
  // the /ask or /teach marker beside the kind the words gave (Task 11b fix A3).
  // A hook click: the hook the learner saw and the goal and claims behind it, never as learner words (contract §2.5).
  return {
    kind, raw_user_message: turn.raw_user_message, ...(turn.input_modality === 'voice' ? { input_modality: 'voice' } : {}),
    ...(turn.next_step ? { selected_next_step: { hook: turn.next_step.hook, learning_goal: turn.next_step.learning_goal, concept_ids: turn.next_step.concept_ids, claim_ids: turn.next_step.claim_ids } } : {}),
    ...(turn.slash || turn.mode ? { slash: turn.slash || turn.mode } : {}), ...(turn.dive_choice ? { dive_choice: turn.dive_choice } : {}),
  };
}

// Does the learner clearly ask to see a card (docs/features/canvas-skeleton-cards.md)? Then its place on the
// canvas is held while the plan comes. Decided before any model call, on learnerIntent: /deeper or
// /simplify; or a request ("show me…", "explain this on the canvas"), or words that open with making or
// showing ("make a card for this", "can you draw it?", which learnerIntent reads as an explanation or a
// question), that name something to see. An ordinary question, an answer, a hole's opening or a
// "don't…" gets no speculative skeleton.
const SEE = /\b(show|visual\w*|card|canvas|draw|diagram|picture|animat\w*|mechanism)\b/i;
const MAKE = /^(please |can you |could you |would you |will you )?(make|draw|create|put|show)\b/i;
const NOT = /^(please |just )?(don'?t|do not|no more|stop)\b/i;
export function wantsCard(turn) {
  const { kind } = learnerIntent(turn), raw = turn.raw_user_message.trim();
  if (kind === 'slash') return turn.slash === 'deeper' || turn.slash === 'simplify';
  if (!['request', 'question', 'explanation'].includes(kind) || NOT.test(raw)) return false;
  return (kind === 'request' || MAKE.test(raw)) && SEE.test(raw);
}
// The cards a turn can put on the canvas (the validator accepts no other): what its held place is sized from.
// A journey's cards are blocks already on the canvas (its showCard reveals, never inserts): their stand-ins have no
// scene to size, so a place held there takes the plain card size (slotSize) and is only ever released.
export const showableCards = (domain = NANOGPT) => domain.cards.map(id => cardBlock(domain.cardModule(id)));

// ---------- Critical-path evaluation policy (v2 Stage C) ----------

// Must evaluation finish before the Tutor answers? Decided before any model call:
//   an answer to the Tutor's question or an explanation -> yes: the evidence decides the move
//   a question or request whose claims carry a prerequisite check -> yes: a gap turns the reply
//     into a Rabbit Hole suggestion (GT-06)
//   a request, a question that ends in "?", and a turn back from a hole (its route ignores
//     evidence) -> no: evaluation runs beside the planner and its evidence is stored when it lands.
//     A question is never a failed explanation, so only JEV's attempt check can still find evidence.
//   anything else -> yes ("When it reads a character it looks back..." starts like a question but
//     explains; an unpunctuated question only waits for JEV).
//   Decision 1: a request or question that the prior evidence routes to an evidence row (a gap,
//     misconception or uncertain move: EVIDENCE_ROWS) -> yes: that intervention depends on what this
//     turn's evaluation says (priorRow is route() on the prior evidence).
// ponytail: a stated belief phrased as a question ("Isn't the mask after softmax?") is routed on the
// prior evidence and counted as a critical-path miss in the trace; tighten if the paid run shows misses.
export function criticalPath(intent, spec, priorRow = null) {
  if (intent.kind === 'answer') return { blocking: true, reason: 'answer' };
  if (intent.kind === 'returned') return { blocking: false, reason: 'returned' };
  if (!(intent.kind === 'request' || (intent.kind === 'question' && /\?\s*$/.test(intent.raw_user_message)))) return { blocking: true, reason: 'explanation' };
  if (EVIDENCE_ROWS.includes(priorRow)) return { blocking: true, reason: 'evidence_row' };
  if (spec.gaps.length) return { blocking: true, reason: 'gap_check' };
  return { blocking: false, reason: intent.kind };
}

// The cards that bear on this turn: the target, its ladder neighbours, and the cards that teach the
// route's claim, the turn's claims or their prerequisite concepts.
function relevantCards(target, concepts, domain) {
  const ids = new Set([target, ...(domain.ladder.includes(target) ? [domain.ladderStep(target, 'deeper'), domain.ladderStep(target, 'shallower')] : [])].filter(id => id && domain.cards.includes(id)));
  for (const id of domain.cards) if (domain.targetClaims({ card_id: id }).some(claim => concepts.has(domain.claims[claim].concept))) ids.add(id);
  return domain.catalogue().filter(card => ids.has(card.card));
}

// The planner's whole input: the turn's intent, target, relevant evidence, route and allowed actions,
// the authored content that bears on it, constraints, recent context and the hole - nothing else
// (no unrelated cards, concepts or transcript). On a journey turn, journey_context (architecture §3.3) is the tenth
// key, after dive_context; a nanoGPT turn never has it. A domain naming its contextKey sends its context under that key
// instead (Task 10: the canvas domain's canvas_context, which picks the canvas planner prompt). A hole opened from a
// journey section (LP1 Task 14, §13): its dive_context names the section, claims and concepts that caused the dive; a
// record without `journey` adds nothing. dive_context.title is the hole's live title when the page passes one (Task 10 fix
// round 3: canvas.liveTitle; record.title is the creation title); its concept still comes from the record.
// Professor Next Steps (§2.5, §2.6): recent_relevant_context.recent_modalities is the store's last 8 modalities, evidence
// for the planner only (nothing here or in route() reads it); a turn whose route allows create_material (Task 11b: typed and
// voice turns too) adds available_materials as the last key.
// A selected block as text: an animation's description, else its title and body (the planner's target and the handoff's card).
const cardText = block => (block?.type === 'animation' ? describeAnimation(block).text : block ? [block.title, block.body].filter(Boolean).join('\n') : null);
export function plannerContext({ turn, routed, block, states, claims = [], store = null, domain = NANOGPT }) {
  const card = domain.cardModule(turn.target?.card);
  const labels = partLabels(card);
  const index = card && turn.target?.part_id ? partIndex(card, turn.target.part_id) : null;
  const sources = (block?.sources || card?.sources || []).slice(0, 3).map((source, i) => ({ source_index: i, path: source.path || source.url || null, lines: source.lines || null, note: String(source.note || '').slice(0, 400) }));
  const described = cardText(block);
  const ids = [...new Set([routed.claim, ...claims].filter(Boolean))].slice(0, 4);
  const concepts = new Set(ids.flatMap(id => [domain.claims[id].concept, ...domain.claims[id].prerequisites]));
  const record = turn.canvas.dive?.record;
  const evidence = id => { const { concept, claim, state, misconception_id, prerequisite } = states[id]; return { claim, concept, statement: domain.claims[id].statement, state, ...(misconception_id ? { misconception_id } : {}), ...(prerequisite ? { prerequisite } : {}), misconceptions: domain.claims[id].misconceptions.map(wrong => wrong.id) }; };
  return {
    learner_intent: learnerIntent(turn),
    target: card ? {
      card: card.evidence.card, title: card.scene.title, depth: card.evidence.depth ?? null,
      learning_question: card.evidence.learningQuestion, concepts: turn.target.concepts, selected_object: turn.target.selected_object ?? null,
      part_id: turn.target.part_id ?? null, part_label: index != null ? labels[index] : null, description: described, sources,
    } : described ? { description: described } : null,
    relevant_evidence: { claims: ids.map(evidence), concepts: Object.fromEntries([...concepts].map(concept => [concept, conceptState(states, concept, domain.claims)])) },
    route: { row: routed.row, strategy: routed.strategy, claim: routed.claim },
    allowed_actions: routed.allowed,
    ...(routed.avatar ? { avatar_moments: routed.avatar.moments } : {}),
    relevant_authored_content: { cards: relevantCards(turn.target?.card, concepts, domain), ...(turn.card_state ? { card_state: turn.card_state } : {}) },
    learner_constraints: turn.constraints,
    recent_relevant_context: {
      turns: turn.recent_turns.slice(-2), actions: turn.recent_actions.slice(-2),
      ...(turn.answering && store?.open?.text ? { open_question: store.open.text } : {}),
      recent_modalities: (store?.modalities || []).slice(-8),
    },
    dive_context: record || turn.returned_from ? {
      ...(record ? { dive_id: record.dive_id, title: turn.canvas.dive.title ?? record.title, concept: holeConcept(record, domain), created_by: record.created_by, origin_card: record.origin?.origin_card_id ?? null, origin_part: record.origin?.origin_part_id ?? null, pending_question: record.return_point?.pending_question ?? null } : {}),
      ...(record?.journey ? { journey: { section_id: record.journey.section_id, claim_ids: record.journey.claim_ids, concept_ids: record.journey.concept_ids } } : {}),
      ...(turn.returned_from ? { returned_from: { dive_id: turn.returned_from.dive_id, concept: turn.returned_from.concept, claim: turn.returned_from.claim } } : {}),
    } : null,
    ...(domain.context ? { [domain.contextKey ?? 'journey_context']: domain.context } : {}),
    ...(routed.allowed.includes('create_material') && turn.available_materials?.length ? { available_materials: turn.available_materials } : {}),
  };
}

// ---------- Enforcement (§5) ----------

// The action validator / policy gate (v2 Stage F, learn-tutor-validate.js): schema -> route ->
// resource -> consent, one decision per proposed action.
export const enforce = validateActions;

// ---------- One turn ----------

// Runs the turn up to the enforced actions and the updated store. `post(path, body)` resolves the
// route's JSON or throws; the canvas is not touched here (see executeActions).
// onSpeakable(sentence) (v2 checkpoint I, for voice): the planner is asked to stream ({ stream: true },
// and post gets a third argument { onSentence }, see readPlanStream); the plan's first sentence is
// handed over before the plan is complete, only if speakable() passes for this turn's route.
// turnId: one canonical id for the learner turn - the turn's turn_id and the trace's trace_id - that Voice
// also uses for its telemetry and speech (LearnVoice, voice-session).
// onTurn(turn): the built LearnerTurn, handed over before any model call (the canvas holds a card's place
// for a turn that wantsCard).
// domain: the TutorDomain (NANOGPT by default). A journey domain's evidence is the server's (architecture §5):
// /evaluate gets the journey id and claim ids, and the stored events it returns replace the store's.
// plan: false (a diagnostic turn, §6.3) stops after the evidence - no router, planner or actions.
// nextStep, materials (Professor Next Steps §2.5): a hook click - one structured next_step turn with no learner words, so
// nothing is evaluated and no evidence is written; the planner may answer with create_material among materials. Task 11b:
// typed and voice turns take materials too, and research (the page can open Research) lets the plan offer suggest_research.
// The result carries `reading`, the validator's bounded copy of the planner's reading fields: telemetry for the trace only.
// The result also carries `contracts` (one actionContract per accepted action, learn-tutor-actions.js) and the turn's
// `reason_codes`; the store keeps the contracted modalities of the last 8 actions (contract §2.6).
// trace (contract §3.3): true, or { identity, blocks, next_step_options, selected_at }, adds `trace` - a TutorDecisionEvent built from the
// finished result (learn-tutor-trace.js), or null when building failed; false (the default) leaves the result as it was.
// repository (Task 11c-B): the canvas reads a repository, so the plan may hand off to repository_context; an accepted handoff
// runs after the plan through the handoff route (runHandoff), its answer follows the plan's own words in `text`, a failure
// says the source context could not be retrieved, and bench.handoff / bench.ms.handoff / bench.ms.to_answer time it.
export async function runTurn({ raw, slash = null, opening = false, canvas, access, block, store, post, onSpeakable = null, inputModality = 'text', turnId = null, onTurn = null, domain = NANOGPT, plan = true, nextStep = null, materials = [], research = false, journeyOffer = false, repository = false, trace = false }) {
  if (nextStep) raw = '';
  const t = [now()];
  // The hook click's time for the event (selected_at): the page's click time when it passes one, else this turn's start.
  const clickedAt = trace && nextStep ? new Date().toISOString() : null;
  // After the result is final; the event never changes it, and any telemetry error only leaves trace null (counted).
  const traced = result => (!trace ? result : { ...result, trace: safely(() => {
    const { identity, blocks, next_step_options, selected_at } = trace === true ? {} : trace;
    return decisionEvent({ result, domain, identity, blocks, options: next_step_options, seen: store.modalities || [], intent: learnerIntent(result.turn).kind, totalMs: Math.round((now() - t[0]) * 10) / 10, selectedAt: selected_at ?? clickedAt });
  }) });
  const id = turnId || crypto.randomUUID();
  const tracer = turnTrace(now, id); // v2: the turn trace (learn-tutor-trace.js), returned in bench.trace
  let current = store;
  const here = { app: canvas.app, board: canvas.board || 'main' };
  const target = tracer.step('target_resolution', () => targetOf(block), found => found?.card ?? 'none');
  t.push(now());
  // 1. Deterministic rung: new attemptLog entries on the target card.
  if (block && target?.card) {
    const practiced = tracer.step('practice_evaluation', () => practiceEvents(current, block, { card_id: target.card, scene_id: target.scene_id, part_id: target.part_id }, here, domain), out => `${out.events.length} events`);
    current = appendEvents(practiced.store, practiced.events.map(event => ({ ...event, ref: { ...event.ref, block_id: block.id } }))).store;
  }
  t.push(now());
  let states = deriveClaimStates(current.events, domain.claims);
  const built = tracer.step('claim_selection', () => buildTurn({ raw, slash, opening, canvas, block, store: current, states, inputModality, turnId: id, domain, nextStep, materials, research, journeyOffer, repository }),
    out => out.selection ? `${out.selection.selected.length}/${out.selection.available}${out.selection.fallback ? ' fallback' : ''}` : 'none');
  const { turn, selection } = built;
  onTurn?.(turn);
  // Evaluation and routing work on the claims the learner touched (Stage B); a turn without words
  // (a slash, a hole's opening) keeps the turn's claims.
  const claims = selection ? selection.selected : built.claims;
  // 2. JEV, then the larger evaluator when the escalation policy says so - free text on slice claims
  // only. Stage C: off the critical path (criticalPath) it runs beside the planner.
  let evaluation = null, evidence = null, transitions = [], critical = null, pending = null;
  const settle = result => {
    evaluation = result;
    for (const rung of ['jev', 'larger']) {
      const telemetry = evaluation.telemetry?.[rung];
      if (telemetry?.called) tracer.add(rung, telemetry.ms, telemetry.outcome === 'timeout' || telemetry.outcome === 'error' ? telemetry.outcome : 'ok', telemetry.reason ? `${telemetry.outcome} (${telemetry.reason})` : telemetry.outcome);
    }
    const ref = { card: target?.card ?? null, scene_id: target?.scene_id ?? null, part_id: target?.part_id ?? null, turn_id: turn.turn_id, canvas: here };
    // A journey turn never reconciles locally (§5): without the server's stored events it adds nothing.
    const journeyTurn = domain.evidence.mode === 'journey';
    const reconciled = () => (!journeyTurn ? reconcile(current, evaluation, ref, domain.claims)
      : result.journey?.events ? adoptJourney(current, result, states, domain.claims) : { store: current, states, transitions: [], added: 0 });
    ({ store: current, states, transitions } = tracer.step('evidence_reconciliation', reconciled, out => `${out.added} observations, ${out.transitions.length} state changes`));
    turn.evidence = buildTurn({ raw, slash, opening, canvas, block, store: current, states, inputModality, turnId: id, domain, nextStep, materials, research, journeyOffer, repository }).turn.evidence;
  };
  if (raw.trim() && !turn.slash && !opening && claims.length) {
    const spec = evaluationSpec(turn, claims, current, domain);
    critical = criticalPath(learnerIntent(turn), spec, route({ turn, claims, states, evaluation: null, store: current }).row);
    const sent = now();
    // A journey turn sends ids only: the worker rebuilds the spec from the journey registry and ignores claim content.
    // The board is the canvas's (access is { app }); turn_id ties the stored evidence to this turn's trace. A plan:false
    // turn answers a diagnostic probe (§6.3), whose id is the open question's: probe_id lets the route store that
    // probe's evidence once (a repeat answer is `duplicate`, its stored evidence adopted below like any other).
    const body = domain.evidence.mode === 'journey'
      ? { ...access, board: here.board, journey_id: domain.evidence.journey_id, message: raw, claims: spec.claims.map(claim => claim.id), answering: spec.answering, question: spec.question, ...(!plan && turn.answering ? { probe_id: turn.answering } : {}), turn_id: turn.turn_id }
      : { ...access, message: raw, spec };
    const evaluating = (async () => tracer.step('evaluate', () => post('/api/learn/tutor/evaluate', body), out => out.status))()
      .catch(error => ({ status: 'error', evaluator: 'jev', events: [], error: error.message }))
      .then(result => { evidence = [sent, now()]; return result; });
    if (critical.blocking) settle(await evaluating);
    else pending = evaluating;
  }
  if (!plan) {
    if (pending) settle(await pending);
    const bench = {
      trace: tracer.trace, turn_id: turn.turn_id, input_modality: turn.input_modality, claims, evaluated: !!evidence,
      evaluation: evaluation && { status: evaluation.status, evaluator: evaluation.evaluator, events: (evaluation.events || []).length, telemetry: evaluation.telemetry ?? null },
      transitions: transitions.map(({ claim, from, to }) => `${claim}: ${from} -> ${to}`),
    };
    // The probe this turn answered is closed, so the next free-text turn is not read as answering it again.
    return traced({ store: turn.answering ? { ...current, open: null } : current, turn, evaluation, transitions, states, actions: [], text: '', bench });
  }
  // 3. Router, planner, enforcement.
  const routed = tracer.step('router', () => route({ turn, claims, states, evaluation, store: current }), out => out.row);
  const context = plannerContext({ turn, routed, block, states, claims, store: current, domain });
  const planned = now();
  let response;
  let spoken = null, spokenAction = null;
  const intent = learnerIntent(turn);
  // sentence: firstSentence's { text, action, constraints_add, explicit_request } (see readPlanStream).
  const onSentence = sentence => {
    // A turn back from a hole routes on returned_from alone (route ignores evidence), so its re-check
    // question does not wait for this turn's evaluation.
    if (spoken != null || !speakable(sentence, routed, { pending: !!pending && !evidence && routed.row !== 'returned', turn, intent })) return;
    spoken = sentence.text.trim();
    spokenAction = sentence.action;
    tracer.mark('first_sentence');
    onSpeakable(spoken);
  };
  try { response = await tracer.step('planner', () => (onSpeakable ? post('/api/learn/tutor/plan', { ...access, context, stream: true }, { onSentence }) : post('/api/learn/tutor/plan', { ...access, context })), out => out.telemetry?.outcome ?? 'ok'); }
  catch (error) { throw Object.assign(error, { trace: tracer.trace }); } // the failed turn's trace travels with its error
  const ready = now();
  let { actions, log, decisions, reading } = tracer.step('action_validation', () => enforce(response, routed, turn, domain),
    out => `${out.decisions.filter(decision => decision.accepted).length} accepted, ${out.decisions.filter(decision => !decision.accepted).length} rejected`);
  const enforced = now();
  // 3b. The handoff (Task 11c-B): the accepted one starts now, through the route, without waiting for an evaluation running
  // beside the planner (fix round 1: it never depends on evidence, and a routing miss never drops it). Its answer is the
  // learner-facing result after the plan's own words; a failure keeps only those words and says the source context could not
  // be retrieved, never an answer of its own.
  const handoff = actions.find(action => action.type === HANDOFF_ACTION);
  // A stopped handoff rejects inside the stage, so the turn trace reads handoff:stopped (fix round 2, R1-M3), and is rethrown below.
  const handing = handoff ? tracer.step('handoff', () => runHandoff(handoff, { post, access, block }).then(out => {
    if (out.record.failure === 'stopped') throw Object.assign(out.error, { handoff: out.record });
    return out;
  // Round 3: a timed-out handoff (the route's timeout or the browser's) is stage status timeout, as the planner's is; any other
  // route failure keeps status ok with its category as the result.
  }), out => out.record.failure ?? out.record.outcome, out => (out.record.failure === 'timeout' ? 'timeout' : 'ok')) : null;
  handing?.catch(() => {}); // awaited below, after any pending evaluation; never an unhandled rejection meanwhile
  // Off the critical path: the evaluation lands now. Its evidence is stored like any other; a route it
  // would have changed is a critical-path miss (the reply was planned on the prior evidence).
  // Decision 1: evidence actions (EVIDENCE_ACTIONS) are released only now; after a miss they were chosen
  // on evidence this turn changed, so they are dropped (stage 'evidence'). The words stay: an off-path
  // turn is never on an evidence row, so its reply is evidence-independent.
  // ponytail: dropped, not re-planned; re-plan on the new route if the paid run shows misses.
  let miss = null;
  if (pending) {
    settle(await pending);
    const after = route({ turn, claims, states, evaluation, store: current }).row;
    if (after !== routed.row) {
      miss = { planned: routed.row, after };
      for (const action of actions.filter(entry => EVIDENCE_ACTIONS.includes(entry.type))) {
        decisions.push({ type: action.type, accepted: false, stage: 'evidence', reason: `planned on ${routed.row}, evidence says ${after}` });
        log.push(`dropped ${action.type}: planned on evidence this turn changed`);
      }
      actions = actions.filter(entry => !EVIDENCE_ACTIONS.includes(entry.type));
      if (!actions.length) actions = [{ type: 'no_action' }];
    }
  }
  const released = now();
  // Fix round 1 (A-I1, B-I4): a handoff the turn offered and the plan proposed, but the validator dropped, is a failed handoff
  // (invalid_action): the reply says the source context could not be retrieved and the trace records retrieval_failed.
  const dropped = !handoff && routed.allowed.includes(HANDOFF_ACTION) && (Array.isArray(response.actions) ? response.actions : []).some(action => action?.type === HANDOFF_ACTION);
  // Fix round 1 (B-I1, B-I2): a Stop or Voice barge-in during the handoff ends the turn exactly as one during the planner does -
  // the AbortError rejects the turn with its trace (the page then saves nothing, runs no canvas action or material and emits no
  // decision event), and the stopped handoff record rides on the error.
  const handed = handing ? await handing.catch(error => { throw Object.assign(error, { trace: tracer.trace }); }) : dropped ? invalidHandoff() : null;
  // Task 14 B-I2: a handoff that gave no answer (failed, refused or invalid_action; a Stop already rejected above) drops the
  // material planned beside it, so a reply saying the source could not be retrieved never comes with a card made from the
  // request alone. Recorded as the other drops are (stage 'handoff'); actions, contracts, the trace and runMaterials agree.
  if (handed && !handed.answer) {
    for (const action of actions.filter(entry => entry.type === 'create_material')) {
      decisions.push({ type: action.type, accepted: false, stage: 'handoff', reason: 'the handoff returned no source' });
      log.push(`dropped ${action.type}: the handoff returned no source`);
    }
    actions = actions.filter(entry => entry.type !== 'create_material');
    if (!actions.length) actions = [{ type: 'no_action' }];
  }
  // 4. The session record.
  const constraints = [...new Set([...current.constraints, ...(response.constraints_add || [])].filter(item => !(response.constraints_remove || []).includes(item)).concat(statedConstraints(raw)))];
  const asked = actions.find(action => action.type === 'ask_question');
  const socratic = routed.row === 'misconception' ? { ...current.socratic, [routed.claim]: (current.socratic[routed.claim] || 0) + 1 } : current.socratic;
  const words = actions.filter(action => action.type === 'respond_text' || action.type === 'ask_question').map(action => action.text.trim()).join('\n\n');
  const text = handed ? [words, handed.answer ?? HANDOFF_FAILED].filter(Boolean).join('\n\n') : words;
  const dive = actions.find(action => action.type === 'suggest_dive');
  const contracts = actions.filter(action => action.type !== 'no_action').map(action => actionContract(action, { domain, materials, claims }));
  // A spoken question never becomes the hole's typed opening (openingQuestion): the dock would show it
  // as a user bubble, and Voice Mode never shows the learner's words.
  current = {
    ...current, constraints, socratic,
    open: asked ? { action_id: asked.action_id, claim: asked.claim, text: asked.text, canvas: here } : turn.answering ? null : current.open,
    keep: turn.dive_choice ? null : current.keep,
    returned: turn.returned_from ? null : current.returned,
    suggested: dive ? { concept: dive.concept, title: dive.title, block_id: dive.from.block_id ?? null, question: turn.input_modality === 'voice' ? null : raw, claim: routed.claim, canvas: here } : current.suggested,
    turns: [...current.turns, { learner: raw, ...(turn.next_step ? { next_step: turn.next_step.suggestion_id } : {}), tutor: text }].slice(-8),
    actions: [...current.actions, ...actions.map(action => ({ type: action.type, strategy: response.strategy, claim: action.claim ?? routed.claim }))].slice(-6),
    // What the learner got, oldest first: planner evidence next turn (contract §2.6), never a sequencing rule.
    modalities: [...(current.modalities || []), ...contracts.map(contract => contract.modality)].filter(Boolean).slice(-8),
  };
  // The benchmark record: ids, types and timings only - never the learner's words or card content.
  const ms = (from, to) => Math.round((to - from) * 10) / 10;
  const end = now(); // round 3: the one answer-moment read (first_text_ms and blocking_wait_ms both use it)
  const firstText = spoken ? tracer.trace.marks.first_sentence : text ? ms(t[0], end) : null;
  const bench = {
    trace: tracer.trace, turn_id: turn.turn_id, input_modality: turn.input_modality, route: routed.row, strategy: response.strategy ?? null, claims, evaluated: !!evidence,
    ...(turn.next_step ? { next_step: { suggestion_id: turn.next_step.suggestion_id, set_id: nextStep.set_id ?? null } } : {}),
    critical_path: critical && { ...critical, miss },
    // The spoken first sentence must open the validated reply (respond_text and ask_question texts in
    // order); a mismatch would mean speech the final plan contradicts, and is recorded, never hidden.
    spoken: spoken && { chars: spoken.length, action: spokenAction, tier: response.telemetry?.tier ?? null, consistent: text.startsWith(spoken) },
    selection: selection && { available: selection.available, selected: selection.selected.length, fallback: selection.fallback, ms: selection.ms },
    evaluation: evaluation && { status: evaluation.status, evaluator: evaluation.evaluator, events: (evaluation.events || []).length, telemetry: evaluation.telemetry ?? null },
    transitions: transitions.map(({ claim, from, to }) => `${claim}: ${from} -> ${to}`),
    planner: { telemetry: response.telemetry ?? null, context_chars: JSON.stringify(context).length },
    requested_actions: (Array.isArray(response.actions) ? response.actions : []).map(action => action?.type),
    accepted_actions: actions.map(action => action.type),
    rejected: log,
    rejections: decisions.filter(decision => !decision.accepted).map(({ type, stage, reason }) => ({ type, stage, reason })),
    handoff: handed?.record ?? null,
    ms: {
      target: ms(t[0], t[1]), practice: ms(t[1], t[2]), evidence: evidence && ms(...evidence), planner: ms(planned, ready), enforce: ms(ready, enforced),
      to_evidence_ready: evidence && ms(t[0], evidence[1]), to_planner_ready: ms(t[0], ready),
      // Decision 1, measured separately: the first safe sentence (spoken early, else the validated reply
      // when the turn returns), evidence ready (above), and the first evidence-dependent action.
      to_first_safe_sentence: firstText,
      to_first_evidence_action: actions.some(action => EVIDENCE_ACTIONS.includes(action.type)) ? ms(t[0], released) : null,
      // Task 11c-B, apart from the planner: the handoff round trip, and the learner's blocking wait - turn start to the answer
      // they wait for (the handoff's, when one ran; else the first safe sentence).
      handoff: handed ? handed.record.ms : null,
      // Fix round 2 (R1-I1) and round 3 (R2-M1): the handoff answer appears when the turn returns - after any pending evaluation
      // has landed - so it is the one answer-moment read (end) that first_text_ms uses too: never below first_text_ms, and equal to
      // it where they are the same moment (a typed reply).
      to_answer: handed ? ms(t[0], end) : firstText,
    },
  };
  return traced({ store: current, turn, selection, evaluation, transitions, routed, response, actions, contracts, reason_codes: reasonCodes(response), reading, decisions, log, text, states: deriveClaimStates(current.events, domain.claims), bench, mark: tracer.mark });
}
const now = () => (globalThis.performance ?? Date).now();

// ---------- The handoff (Task 11c-B) ----------

// The reply when a handoff fails (owner thirteenth and nineteenth messages): never a code-grounded answer, never a claim that
// code was read.
export const HANDOFF_FAILED = 'The source context could not be retrieved, so I cannot answer this from the code right now.';
const HANDOFF_ROUTE = '/api/learn/tutor/handoff'; // learn-tutor-handoff.js HANDOFF_PATH
// What the route takes besides the action (owner sixteenth message: grounding, never intent), from the selected block's
// structured data only: its first well-formed code source (card-sources.js) as the selection in the route's own form, and its
// text as context.card, bounded as the route bounds a card (title 300, text 8000: CANVAS_TARGET_LIMIT). Never from the
// learner's words; no block, no grounding.
// A code or snippet card's own text rides too (fix round 1: brief and code, not only its title); the planner's cardText is unchanged.
// Fix round 2 (R1-M2): a code exercise sends its title, brief, setup and starter - never draft, the learner's own work.
// Task 14 B-I1: the same card text grounds Tutor-made material (LearnTutor.jsx runMaterials target), as a typed command's card.
export const cardContext = block => {
  const parts = block.type === 'code' ? [block.title, block.brief, block.setup, block.starter] : [block.title, block.body, block.brief, block.code];
  return (block.type === 'animation' ? cardText(block) : parts.filter(Boolean).join('\n')).slice(0, 8000);
};
function handoffGrounding(block) {
  if (!block) return {};
  const code = validSources(block.sources).find(source => source.kind === 'code');
  const text = cardContext(block);
  return {
    ...(code ? { selection: { repository: code.repo, revision: code.revision, file: code.path, line_range: { start: code.lines[0], end: code.lines[1] } } } : {}),
    ...(text.trim() ? { context: { card: { id: block.id, ...(block.title ? { title: String(block.title).slice(0, 300) } : {}), text } } } : {}),
  };
}
// The record of a handoff the validator dropped on a turn that offered it (fix round 1): no route call, no answer.
const invalidHandoff = () => {
  const at = new Date().toISOString();
  return { answer: null, record: { started_at: at, completed_at: at, ms: 0, outcome: 'failed', failure: 'invalid_action', model_id: null, usage: null, tool_errors: null, prompt_version: null } };
};
// One handoff through the route: { answer (null unless ok), record } - record is the decision event's runtime.handoff: the
// learner's wait on the turn clock, outcome ok | failed | refused, the route's failure category, served model, usage and the
// route's tool_errors (failed source reads inside the reader loop; null when unreported: coordinator ruling) and its prompt_version; never
// the request or the answer. It never throws: a 429 (limited), an HTTP error, a network error (request_error) or the
// browser's timeout (TimeoutError: timeout) is a failed or refused record, so the reply can say so; a Stop or barge-in
// (AbortError) is failure stopped, and runTurn then rethrows its error (fix round 1).
async function runHandoff(action, { post, access, block }) {
  const started = now(), startedAt = new Date().toISOString();
  let reply = null, error = null;
  try { reply = await post(HANDOFF_ROUTE, { ...access, capability: action.capability, request: action.request, ...handoffGrounding(block) }); } catch (thrown) { error = thrown ?? new Error('handoff failed'); }
  const telemetry = reply?.telemetry ?? error?.data?.telemetry ?? null;
  const answer = telemetry?.outcome === 'ok' && typeof reply?.answer === 'string' && reply.answer.trim() ? reply.answer.trim() : null;
  const failure = answer ? null : telemetry?.failure ?? error?.data?.failure ?? (!error ? 'model_error' : error.name === 'AbortError' ? 'stopped' : error.name === 'TimeoutError' ? 'timeout' : 'request_error');
  return { answer, error, record: {
    started_at: startedAt, completed_at: new Date().toISOString(), ms: Math.round((now() - started) * 10) / 10,
    outcome: answer ? 'ok' : telemetry?.outcome === 'refused' ? 'refused' : 'failed', failure, model_id: telemetry?.served_model ?? null, usage: handoffUsage(telemetry), tool_errors: telemetry?.tool_errors ?? null,
    prompt_version: telemetry?.prompt_version ?? null, // Task 14 A-M4: the reader prompt version the route reports
  } };
}

// A journey's evidence (architecture §5): /evaluate reconciled this turn's observations into the journey with its
// registry and returned the stored events and seq, which replace the store's - never a second, local reconcile.
// before: the states the turn started from, for the transitions.
function adoptJourney(store, result, before, claims) {
  const next = { ...store, events: result.journey.events, seq: result.journey.seq };
  const states = deriveClaimStates(next.events, claims);
  const transitions = Object.keys(states).filter(id => states[id].state !== before[id]?.state).map(id => ({ claim: id, from: before[id]?.state, to: states[id].state }));
  return { store: next, states, transitions, added: (result.events || []).length };
}

// The browser side of a streamed plan (v2 checkpoint I): reads the NDJSON reply of
// /api/learn/tutor/plan with { stream: true }, hands each sentence event ({ text, action,
// constraints_add, explicit_request }) to onSentence, and resolves the final TutorResponse (or throws
// the route's error, with its telemetry).
export async function readPlanStream(response, onSentence) {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw Object.assign(new Error(data?.error || `The tutor is unavailable (${response.status})`), { status: response.status, data });
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? '' : decoder.decode(value, { stream: true });
    const lines = done ? [buffer] : buffer.split('\n');
    if (!done) buffer = lines.pop();
    for (const line of lines.filter(entry => entry.trim())) {
      const { type, ...event } = JSON.parse(line);
      if (type === 'sentence') onSentence?.(event);
      else if (type === 'plan') return event;
      else if (type === 'error') throw Object.assign(new Error(event.error), { telemetry: event.telemetry });
    }
    if (done) throw new Error('The tutor returned no turn');
  }
}

// ---------- /dive session record (§6.3, §6.4) ----------

// "Keep it on this canvas": the next turn here carries dive_choice { concept, choice: 'inline' }.
export function keepHere(store, here) {
  const suggested = store.suggested;
  return suggested && sameCanvas(suggested.canvas, here) ? { ...store, keep: { concept: suggested.concept, canvas: here } } : store;
}

// Inside a hole: remember it, so the parent's next turn after climbing back carries returned_from.
// The blocked claim is the one the Tutor's suggestion came from, when this hole answers it.
// domain: the hole's TutorDomain (NANOGPT by default); a hole opened from a journey section reads its concept from the
// journey registry, never the nanoGPT one.
export function enterHole(store, record, domain = NANOGPT) {
  if (!record?.dive_id) return store;
  const concept = holeConcept(record, domain);
  const suggested = store.suggested && store.suggested.concept && store.suggested.concept === concept ? store.suggested : null;
  if (store.dive?.dive_id === record.dive_id) return store;
  return { ...store, dive: { dive_id: record.dive_id, parent: record.origin?.parent || null, concept, claim: suggested?.claim ?? null, question: suggested?.question ?? null } };
}
// The hole's opening turn runs once per hole; its question is the learner's pending question, or
// the one that led to the Tutor's suggestion. title: the hole's live title (Task 10 fix round 4), else its record title.
export function openingQuestion(store, record, title = null) {
  if (!record?.dive_id || store.opened.includes(record.dive_id)) return null;
  return String(record.return_point?.pending_question || store.dive?.question || `Take me into ${title || record.title}.`);
}
export const markOpened = (store, record) => ({ ...store, opened: [...store.opened, record.dive_id].slice(-20) });

// Back on the parent after a hole: its next turn gets returned_from, once.
export function arriveAt(store, here) {
  if (!store.dive?.parent || !sameCanvas(store.dive.parent, here)) return store;
  return { ...store, returned: { ...store.dive, parent: here }, dive: null };
}

// ---------- Actions on the canvas ----------

// A journey's card id is its block id; an authored card is found by its evidence.card.
const findCard = (canvas, cardId) => (canvas.blocks?.() || []).find(block => block.id === cardId || resolveTarget(block).card_id === cardId) || null;

// Shows an authored card (added with cardBlock when it is not on the canvas) at a part. A new card takes
// the slot `take()` hands it (the one held while the plan came), and comes with its part already set: an
// update right after the insert would read the canvas before the card is in it. The canvas brings it into
// the visible area at the learner's zoom once it is laid out (revealBlock).
function showCard(canvas, cardId, partId = null, take = () => null) {
  const module = cardModule(cardId);
  if (!module) return false;
  const block = findCard(canvas, cardId);
  const pager = module.scene.inputs?.find(input => input.presentation === 'pager');
  const index = partId ? partIndex(module, partId) : null;
  // A part that does not exist opens the whole card at its default part: a fallback, never an error.
  const atPart = current => (pager && index != null ? applyInputToBlock(current, pager.name, index) : current);
  if (block && pager && index != null) canvas.updateBlock?.(block.id, atPart);
  const id = block?.id || canvas.insertBlock?.(atPart(cardBlock(module)), { into: take() });
  if (!id) return false;
  // A card already there answers the held slot: once the learner has moved the camera since, it is only selected.
  canvas.revealBlock?.(id, block ? take.held?.() : null);
  return true;
}

const partName = (cardId, partId, domain) => {
  const module = domain.cardModule(cardId), index = partIndex(module, partId);
  return index == null ? '' : ` · ${partLabels(module)[index]}`;
};
const titleOf = (cardId, domain) => domain.cardModule(cardId)?.scene.title || cardId;

// Runs the enforced actions: navigations now, suggestions as chips the learner clicks.
// deps: { canvas, suggestDive({ blockId, topic }), climb(), slot, openResearch(request) } - slot: the place held for a card
// while the plan came (wantsCard); the first card this turn adds takes it, and the caller releases it otherwise. openResearch
// (Task 11b): the page's way into its Home/Library Research workflow; suggest_research becomes a Research this chip that
// calls it, and nothing is researched inside the turn. startJourney (fix B1): the existing journey start; suggest_journey
// becomes a Start a learning path chip that calls it with the request, and nothing starts until the learner clicks.
// domain: whose cards these are (NANOGPT by default); a domain's own showCard (a journey's reveals its block, never
// inserts) replaces the authored-module one.
export function executeActions(actions, { canvas, suggestDive, climb, slot = null, domain = NANOGPT, openResearch = null, startJourney = null }) {
  const chips = [];
  let held = slot;
  const take = () => { const id = held; held = null; return id; };
  take.held = () => held;
  const show = domain.showCard ?? showCard;
  for (const action of actions) {
    if ((action.type === 'show_authored_card' || action.type === 'focus_part') && action.mode === 'navigate') show(canvas, action.card, action.part_id, take);
    else if (action.type === 'show_authored_card' || action.type === 'focus_part') chips.push({ label: `Show ${titleOf(action.card, domain)}${partName(action.card, action.part_id, domain)}`, run: () => show(canvas, action.card, action.part_id) });
    else if (action.type === 'suggest_depth') {
      const next = domain.ladderStep(action.card, action.direction || 'deeper');
      if (next) chips.push({ label: `${action.direction === 'shallower' ? 'Step back' : 'Go deeper'}: ${titleOf(next, domain)}`, run: () => show(canvas, next) });
    } else if (action.type === 'suggest_practice') {
      chips.push({ label: `Practise on ${titleOf(action.card, domain)}`, run: () => {
        const block = findCard(canvas, action.card);
        if (!block) return show(canvas, action.card);
        canvas.updateBlock?.(block.id, enterPractice);
        canvas.revealBlock?.(block.id);
        return true;
      } });
    } else if (action.type === 'suggest_dive') suggestDive({ blockId: action.from.block_id ?? null, topic: action.title });
    else if (action.type === 'return_from_dive') chips.push({ label: 'Back up the Rabbit Hole', run: () => climb?.() });
    else if (action.type === 'suggest_research' && openResearch) chips.push({ label: 'Research this', run: () => openResearch(action.request) });
    else if (action.type === 'suggest_journey' && startJourney) chips.push({ label: 'Start a learning path', run: () => startJourney(action.request) });
  }
  return chips;
}
