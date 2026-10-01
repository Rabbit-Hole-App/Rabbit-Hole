// Tutor v1 for the NanoGPT Attention slice (docs/features/tutor-v1-locked-decisions.md,
// docs/features/tutor-v1-implementation-map.md). Per learner message:
//   LearnerTurn -> evaluator -> evidence store -> router -> planner -> TutorAction[] -> canvas
// Pure apart from what is injected: `post` (the two /api/learn/tutor routes) and, for actions,
// the canvas commands. The target identities come from the shared resolver (learn-target.js),
// which /dive uses too; frozen card modules are only read.
import { resolveTarget } from './learn-target.js';
import { cardBlock } from './nanogpt/board.js';
import { partIndex } from './nanogpt/depth/board.js';
import { describeAnimation } from './scene-describe.js';
import { checkStatus, enterPractice, isPracticing } from './scene-activity.js';
import { applyInputToBlock } from './scene-evaluate.js';
import { coerceInputs, validateInputDeclarations } from './scene-inputs.js';
import { CLAIMS, CONCEPTS, SLICE_CARDS, catalogue, cardModule, claimsOfConcept, conceptOf, ladderStep, partLabels, targetClaims } from './learn-tutor-claims.js';
import { appendEvents, conceptState, deriveClaimStates, practiceEvents } from './learn-tutor-evidence.js';

const SLASHES = ['deeper', 'simplify', 'dive'];
const canvasKey = canvas => `${canvas.app}|${canvas.board || 'main'}`;
const sameCanvas = (a, b) => !!a && !!b && canvasKey(a) === canvasKey(b);

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

// A hole's concept: its title ("Softmax"), else a registry concept among its origin concepts.
export function holeConcept(dive) {
  if (!dive) return null;
  return conceptOf(dive.title) || conceptOf(dive.concept) || (dive.origin?.origin_concept_ids || []).find(concept => CONCEPTS[concept]) || null;
}

// The claims this turn is about: the one an open question asks about, the blocked claim after a
// return, then the target card's (or part's, or selected object's), else the hole's concept.
export function turnClaims(turn, store) {
  const out = [];
  const add = id => { if (id && CLAIMS[id] && !out.includes(id)) out.push(id); };
  if (turn.answering) add(store.open?.claim);
  if (turn.returned_from) add(turn.returned_from.claim);
  const target = turn.target && { card_id: turn.target.card, part_id: turn.target.part_id, selected_object: turn.target.selected_object, concept_ids: turn.target.concepts };
  targetClaims(target).forEach(add);
  if (!out.length) claimsOfConcept(holeConcept(turn.canvas.dive?.record)).forEach(add);
  return out.slice(0, 4);
}

// The ClaimStates the turn carries: its claims and their prerequisites' claims (at most 10).
function turnEvidence(claims, states) {
  const ids = [...claims];
  for (const id of claims) for (const concept of CLAIMS[id].prerequisites) for (const other of claimsOfConcept(concept)) if (!ids.includes(other)) ids.push(other);
  return ids.slice(0, 10).map(id => states[id]);
}

// inputModality: 'text' (typed) or 'voice' (Voice Mode, docs/features/voice-tutor-mvp.md §1);
// turnId: the voice trace id minted at the utterance commit, else a fresh one.
export function buildTurn({ raw, slash = null, opening = false, canvas, block, store, states, inputModality = 'text', turnId = null }) {
  const here = { app: canvas.app, board: canvas.board || 'main' };
  const open = store.open && sameCanvas(store.open.canvas, here) && !slash ? store.open : null;
  const keep = store.keep && sameCanvas(store.keep.canvas, here) ? store.keep : null;
  const back = store.returned && sameCanvas(store.returned.parent, here) ? store.returned : null;
  const turn = {
    turn_id: turnId || crypto.randomUUID(),
    raw_user_message: raw,
    input_modality: inputModality === 'voice' ? 'voice' : 'text',
    slash: SLASHES.includes(slash) ? slash : null,
    ...(open ? { answering: open.action_id } : {}),
    ...(keep ? { dive_choice: { concept: keep.concept, choice: 'inline' } } : {}),
    ...(opening ? { opening: true } : {}),
    canvas: { ...here, ...(canvas.dive ? { dive: { dive_id: canvas.dive.dive_id, parent: canvas.dive.origin?.parent, origin: canvas.dive.origin, record: canvas.dive } } : {}) },
    target: targetOf(block),
    card_state: cardState(block, store),
    evidence: [],
    constraints: [...store.constraints],
    ...(back ? { returned_from: { dive_id: back.dive_id, concept: back.concept, claim: back.claim, states: claimsOfConcept(back.concept).map(id => states[id]) } } : {}),
    recent_turns: store.turns.slice(-4),
    recent_actions: store.actions.slice(-3),
  };
  const claims = turnClaims(turn, store);
  turn.evidence = turnEvidence(claims, states);
  return { turn, claims };
}

// What /api/learn/tutor/evaluate checks: the turn's claims, and gap checks for their prerequisites.
export function evaluationSpec(turn, claims, store) {
  const gaps = [];
  for (const id of claims) for (const concept of CLAIMS[id].prerequisites) {
    let gap = gaps.find(entry => entry.concept === concept);
    if (!gap) gaps.push(gap = { concept, statement: claimsOfConcept(concept).map(other => CLAIMS[other].statement).join(' '), claims: [] });
    gap.claims.push(id);
  }
  return {
    answering: !!turn.answering,
    ...(turn.answering && store.open?.text ? { question: store.open.text } : {}),
    claims: claims.map(id => ({ id, concept: CLAIMS[id].concept, statement: CLAIMS[id].statement, ideas: CLAIMS[id].ideas, misconceptions: CLAIMS[id].misconceptions, drawn: CLAIMS[id].drawn })),
    gaps,
  };
}

// ---------- Router (§7) ----------

// First match wins; one strategy and one move per turn. The planner composes inside `allowed`.
export function route({ turn, claims, states, evaluation, store }) {
  const noQuiz = turn.constraints.includes('no_quiz') || turn.constraints.includes('just_answer');
  const inHole = !!turn.canvas.dive;
  const finish = (row, strategy, allowed, claim = null) => {
    let list = noQuiz ? allowed.filter(type => type !== 'ask_question') : allowed;
    if (!list.some(type => type === 'respond_text' || type === 'ask_question')) list = ['respond_text', ...list];
    if (inHole && !list.includes('return_from_dive')) list = [...list, 'return_from_dive'];
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
  if (unsure && evaluation?.status === 'uncertain') return finish('uncertain_unsettled', 'feynman', ['ask_question'], unsure);
  if (unsure) return finish('uncertain', 'feynman', ['respond_text', 'focus_part', 'show_authored_card', 'suggest_depth', 'suggest_practice', 'ask_question'], unsure);
  const unseen = pick(state => state.state === 'not_yet_observed');
  if (unseen) return finish('not_yet_observed', 'feynman', ['respond_text', 'ask_question', 'show_authored_card', 'suggest_depth'], unseen);
  return finish('understood', 'none', ['respond_text', 'suggest_depth', 'ask_question'], claims[0]);
}

// ---------- Planner context (§9) ----------

export function plannerContext({ turn, routed, block, states }) {
  const card = cardModule(turn.target?.card);
  const labels = partLabels(card);
  const index = turn.target?.part_id ? partIndex(card, turn.target.part_id) : null;
  const sources = (block?.sources || card?.sources || []).slice(0, 3).map((source, i) => ({ source_index: i, path: source.path || source.url || null, lines: source.lines || null, note: String(source.note || '').slice(0, 400) }));
  const described = block?.type === 'animation' ? describeAnimation(block).text : block ? [block.title, block.body].filter(Boolean).join('\n') : null;
  const ids = [...new Set([...turnClaims(turn, { open: null }), routed.claim].filter(Boolean))];
  const { record, ...dive } = turn.canvas.dive || {};
  // The planner reads input_modality only on voice turns, so a typed turn's context is unchanged.
  const { input_modality, ...typed } = turn;
  return {
    turn: { ...(input_modality === 'voice' ? turn : typed), canvas: { ...turn.canvas, ...(turn.canvas.dive ? { dive } : {}) } },
    route: routed,
    target: card ? {
      card: card.evidence.card, title: card.scene.title, depth: card.evidence.depth ?? null,
      learning_question: card.evidence.learningQuestion, concept: card.evidence.concept,
      part_label: index != null ? labels[index] : null, description: described, sources,
    } : described ? { description: described } : null,
    claims: ids.map(id => ({ id, statement: CLAIMS[id].statement, prerequisites: CLAIMS[id].prerequisites, misconceptions: CLAIMS[id].misconceptions.map(wrong => wrong.id) })),
    states: turn.evidence.filter(Boolean),
    concept_states: Object.fromEntries(Object.keys(CONCEPTS).map(concept => [concept, conceptState(states, concept)])),
    catalogue: catalogue(),
    ...(record ? { dive: { title: record.title, concept: holeConcept(record), created_by: record.created_by, origin_card: record.origin?.origin_card_id ?? null, origin_part: record.origin?.origin_part_id ?? null, pending_question: record.return_point?.pending_question ?? null } } : {}),
  };
}

// ---------- Enforcement (§5) ----------

// The router's allowed types are binding; navigate needs an explicit request (quoted from the
// learner's own words), a slash, or the learner's "Keep it on this canvas". Anything else is
// dropped or downgraded to a suggestion chip, and logged.
export function enforce(response, routed, turn) {
  const log = [];
  const quoted = typeof response.explicit_request === 'string' ? response.explicit_request.trim() : '';
  const explicit = !!quoted && turn.raw_user_message.toLowerCase().includes(quoted.toLowerCase());
  // The quote is the learner's words: the log (console, the bench's `rejected`) never carries it.
  if (quoted && !explicit) log.push('explicit_request not in the learner\'s words');
  const navigate = explicit || routed.row === 'slash' || routed.row === 'gap_inline';
  const allowed = new Set([...routed.allowed, ...(explicit ? ['respond_text', 'show_authored_card', 'focus_part'] : [])]);
  const noQuiz = turn.constraints.includes('no_quiz') || turn.constraints.includes('just_answer');
  const actions = [];
  for (const action of Array.isArray(response.actions) ? response.actions : []) {
    if (!action || !allowed.has(action.type)) { log.push(`dropped ${action?.type}: not allowed in row ${routed.row}`); continue; }
    if (action.type === 'ask_question' && noQuiz) { log.push('dropped ask_question: no_quiz'); continue; }
    if (action.type === 'ask_question' && actions.some(other => other.type === 'ask_question')) { log.push('dropped a second ask_question'); continue; }
    if ((action.type === 'respond_text' || action.type === 'ask_question') && !String(action.text || '').trim()) { log.push(`dropped empty ${action.type}`); continue; }
    if (['show_authored_card', 'focus_part', 'suggest_depth', 'suggest_practice'].includes(action.type) && !SLICE_CARDS.includes(action.card)) { log.push(`dropped ${action.type}: unknown card ${action.card}`); continue; }
    if (action.type === 'focus_part' && partIndex(cardModule(action.card), action.part_id) == null) { log.push(`dropped focus_part: ${action.card} has no part ${action.part_id}`); continue; }
    if (action.type === 'return_from_dive' && !turn.canvas.dive) { log.push('dropped return_from_dive outside a hole'); continue; }
    if (action.type === 'open_dive') { log.push('dropped open_dive: only the learner opens a hole (/dive, Ctrl+K, Go down)'); continue; }
    let next = { ...action };
    if ((next.type === 'show_authored_card' || next.type === 'focus_part') && next.mode === 'navigate' && !navigate) { next.mode = 'suggest'; log.push(`downgraded ${next.type} to a chip: no explicit request`); }
    if ((next.type === 'show_authored_card' || next.type === 'focus_part') && !next.mode) next.mode = 'suggest';
    if (next.type === 'ask_question') next = { ...next, action_id: crypto.randomUUID(), claim: CLAIMS[next.claim] ? next.claim : routed.claim };
    if (next.type === 'suggest_dive') {
      // Exactly one originating card (R-10): the target card, else a topic anchor made on Go down.
      const concept = CONCEPTS[next.concept] ? next.concept : conceptOf(next.title) || conceptOf(next.concept) || null;
      const title = String(next.title || CONCEPTS[concept]?.label || next.concept || '').slice(0, 80);
      if (!title) { log.push('dropped suggest_dive: no topic'); continue; }
      next = { type: 'suggest_dive', concept, title, from: turn.target?.block_id ? { block_id: turn.target.block_id } : { anchor: { topic: title } } };
    }
    actions.push(next);
    if (actions.length === 3) break;
  }
  // The words before a Rabbit Hole suggestion are at most two sentences (locked §4, gap row): the
  // planner is asked for it, and this keeps it when the planner writes more. A sentence ends at . ! or ?
  // followed by a space, so decimals (0.904) and code (F.softmax) stay whole.
  if (actions.some(action => action.type === 'suggest_dive')) {
    let budget = 2;
    const capped = [];
    for (const action of actions) {
      if (action.type !== 'respond_text') { capped.push(action); continue; }
      const sentences = action.text.trim().split(/(?<=[.!?])\s+/);
      if (!budget) { log.push('dropped respond_text: over two sentences before a dive suggestion'); continue; }
      if (sentences.length > budget) log.push(`shortened respond_text to ${budget} sentence(s) before a dive suggestion`);
      capped.push({ ...action, text: sentences.slice(0, budget).join(' ') });
      budget -= Math.min(budget, sentences.length);
    }
    return { actions: capped, log };
  }
  if (!actions.length) actions.push({ type: 'no_action' });
  return { actions, log };
}

// ---------- One turn ----------

// Runs the turn up to the enforced actions and the updated store. `post(path, body)` resolves the
// route's JSON or throws; the canvas is not touched here (see executeActions).
export async function runTurn({ raw, slash = null, opening = false, canvas, access, block, store, post, inputModality = 'text', turnId = null }) {
  const t = [now()];
  const id = turnId || crypto.randomUUID(); // one id for both buildTurn calls
  let current = store;
  const here = { app: canvas.app, board: canvas.board || 'main' };
  const target = targetOf(block);
  t.push(now());
  // 1. Deterministic rung: new attemptLog entries on the target card.
  if (block && target?.card) {
    const practiced = practiceEvents(current, block, { card_id: target.card, scene_id: target.scene_id, part_id: target.part_id }, here);
    current = appendEvents(practiced.store, practiced.events.map(event => ({ ...event, ref: { ...event.ref, block_id: block.id } }))).store;
  }
  t.push(now());
  let states = deriveClaimStates(current.events);
  const built = buildTurn({ raw, slash, opening, canvas, block, store: current, states, inputModality, turnId: id });
  const { turn, claims } = built;
  // 2. JEV, then the larger evaluator on uncertain - free text on slice claims only.
  let evaluation = null, evidence = null;
  if (raw.trim() && !turn.slash && !opening && claims.length) {
    const sent = now();
    try { evaluation = await post('/api/learn/tutor/evaluate', { ...access, message: raw, spec: evaluationSpec(turn, claims, current) }); }
    catch (error) { evaluation = { status: 'error', evaluator: 'jev', events: [], error: error.message }; }
    evidence = [sent, now()];
    const ref = { card: target?.card ?? null, scene_id: target?.scene_id ?? null, part_id: target?.part_id ?? null, turn_id: turn.turn_id, canvas: here };
    current = appendEvents(current, (evaluation.events || []).map(event => ({ ...event, ref }))).store;
    states = deriveClaimStates(current.events);
    turn.evidence = buildTurn({ raw, slash, opening, canvas, block, store: current, states, inputModality, turnId: id }).turn.evidence;
  }
  // 3. Router, planner, enforcement.
  const routed = route({ turn, claims, states, evaluation, store: current });
  const context = plannerContext({ turn, routed, block, states });
  const planned = now();
  const response = await post('/api/learn/tutor/plan', { ...access, context });
  const ready = now();
  const { actions, log } = enforce(response, routed, turn);
  const enforced = now();
  // 4. The session record.
  const constraints = [...new Set([...current.constraints, ...(response.constraints_add || [])])].filter(item => !(response.constraints_remove || []).includes(item));
  const asked = actions.find(action => action.type === 'ask_question');
  const socratic = routed.row === 'misconception' ? { ...current.socratic, [routed.claim]: (current.socratic[routed.claim] || 0) + 1 } : current.socratic;
  const text = actions.filter(action => action.type === 'respond_text' || action.type === 'ask_question').map(action => action.text.trim()).join('\n\n');
  const dive = actions.find(action => action.type === 'suggest_dive');
  // A spoken question never becomes the hole's typed opening (openingQuestion): the dock would show it
  // as a user bubble, and Voice Mode never shows the learner's words.
  current = {
    ...current, constraints, socratic,
    open: asked ? { action_id: asked.action_id, claim: asked.claim, text: asked.text, canvas: here } : turn.answering ? null : current.open,
    keep: turn.dive_choice ? null : current.keep,
    returned: turn.returned_from ? null : current.returned,
    suggested: dive ? { concept: dive.concept, title: dive.title, block_id: dive.from.block_id ?? null, question: turn.input_modality === 'voice' ? null : raw, claim: routed.claim, canvas: here } : current.suggested,
    turns: [...current.turns, { learner: raw, tutor: text }].slice(-8),
    actions: [...current.actions, ...actions.map(action => ({ type: action.type, strategy: response.strategy, claim: action.claim ?? routed.claim }))].slice(-6),
  };
  // The benchmark record: ids, types and timings only - never the learner's words or card content.
  const ms = (from, to) => Math.round((to - from) * 10) / 10;
  const bench = {
    turn_id: turn.turn_id, input_modality: turn.input_modality, route: routed.row, strategy: response.strategy ?? null, claims, evaluated: !!evidence,
    evaluation: evaluation && { status: evaluation.status, evaluator: evaluation.evaluator, events: (evaluation.events || []).length, telemetry: evaluation.telemetry ?? null },
    planner: { telemetry: response.telemetry ?? null },
    requested_actions: (Array.isArray(response.actions) ? response.actions : []).map(action => action?.type),
    accepted_actions: actions.map(action => action.type),
    rejected: log,
    ms: {
      target: ms(t[0], t[1]), practice: ms(t[1], t[2]), evidence: evidence && ms(...evidence), planner: ms(planned, ready), enforce: ms(ready, enforced),
      to_evidence_ready: evidence && ms(t[0], evidence[1]), to_planner_ready: ms(t[0], ready),
    },
  };
  return { store: current, turn, evaluation, routed, response, actions, log, text, states: deriveClaimStates(current.events), bench };
}
const now = () => (globalThis.performance ?? Date).now();

// ---------- /dive session record (§6.3, §6.4) ----------

// "Keep it on this canvas": the next turn here carries dive_choice { concept, choice: 'inline' }.
export function keepHere(store, here) {
  const suggested = store.suggested;
  return suggested && sameCanvas(suggested.canvas, here) ? { ...store, keep: { concept: suggested.concept, canvas: here } } : store;
}

// Inside a hole: remember it, so the parent's next turn after climbing back carries returned_from.
// The blocked claim is the one the Tutor's suggestion came from, when this hole answers it.
export function enterHole(store, record) {
  if (!record?.dive_id) return store;
  const concept = holeConcept(record);
  const suggested = store.suggested && store.suggested.concept && store.suggested.concept === concept ? store.suggested : null;
  if (store.dive?.dive_id === record.dive_id) return store;
  return { ...store, dive: { dive_id: record.dive_id, parent: record.origin?.parent || null, concept, claim: suggested?.claim ?? null, question: suggested?.question ?? null } };
}
// The hole's opening turn runs once per hole; its question is the learner's pending question, or
// the one that led to the Tutor's suggestion.
export function openingQuestion(store, record) {
  if (!record?.dive_id || store.opened.includes(record.dive_id)) return null;
  return String(record.return_point?.pending_question || store.dive?.question || `Take me into ${record.title}.`);
}
export const markOpened = (store, record) => ({ ...store, opened: [...store.opened, record.dive_id].slice(-20) });

// Back on the parent after a hole: its next turn gets returned_from, once.
export function arriveAt(store, here) {
  if (!store.dive?.parent || !sameCanvas(store.dive.parent, here)) return store;
  return { ...store, returned: { ...store.dive, parent: here }, dive: null };
}

// ---------- Actions on the canvas ----------

const findCard = (canvas, cardId) => (canvas.blocks?.() || []).find(block => resolveTarget(block).card_id === cardId) || null;

// Shows an authored card (added with cardBlock when it is not on the canvas) at a part.
function showCard(canvas, cardId, partId = null) {
  const module = cardModule(cardId);
  if (!module) return false;
  let block = findCard(canvas, cardId);
  const id = block?.id || canvas.insertBlock?.(cardBlock(module));
  if (!id) return false;
  const pager = module.scene.inputs?.find(input => input.presentation === 'pager');
  const index = partId ? partIndex(module, partId) : null;
  // A part that does not exist opens the whole card at its default part: a fallback, never an error.
  if (pager && index != null) canvas.updateBlock?.(id, current => applyInputToBlock(current, pager.name, index));
  canvas.focusBlock?.(id);
  return true;
}

const partName = (cardId, partId) => {
  const module = cardModule(cardId), index = partIndex(module, partId);
  return index == null ? '' : ` · ${partLabels(module)[index]}`;
};
const titleOf = cardId => cardModule(cardId)?.scene.title || cardId;

// Runs the enforced actions: navigations now, suggestions as chips the learner clicks.
// deps: { canvas, suggestDive({ blockId, topic }), climb() }
export function executeActions(actions, { canvas, suggestDive, climb }) {
  const chips = [];
  for (const action of actions) {
    if ((action.type === 'show_authored_card' || action.type === 'focus_part') && action.mode === 'navigate') showCard(canvas, action.card, action.part_id);
    else if (action.type === 'show_authored_card' || action.type === 'focus_part') chips.push({ label: `Show ${titleOf(action.card)}${partName(action.card, action.part_id)}`, run: () => showCard(canvas, action.card, action.part_id) });
    else if (action.type === 'suggest_depth') {
      const next = ladderStep(action.card, action.direction || 'deeper');
      if (next) chips.push({ label: `${action.direction === 'shallower' ? 'Step back' : 'Go deeper'}: ${titleOf(next)}`, run: () => showCard(canvas, next) });
    } else if (action.type === 'suggest_practice') {
      chips.push({ label: `Practise on ${titleOf(action.card)}`, run: () => {
        const block = findCard(canvas, action.card);
        if (!block) return showCard(canvas, action.card);
        canvas.updateBlock?.(block.id, enterPractice);
        canvas.focusBlock?.(block.id);
        return true;
      } });
    } else if (action.type === 'suggest_dive') suggestDive({ blockId: action.from.block_id ?? null, topic: action.title });
    else if (action.type === 'return_from_dive') chips.push({ label: 'Back up the Rabbit Hole', run: () => climb?.() });
  }
  return chips;
}
