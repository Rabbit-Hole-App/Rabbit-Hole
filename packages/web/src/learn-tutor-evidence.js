// Tutor v1 evidence store (docs/features/tutor-v1-locked-decisions.md §2): an append-only list of
// evidence events with a monotonic seq (G3), claim states derived from them on every append, and
// the small session record the Tutor needs between turns. Session-scoped browser storage: the
// caller passes sessionStorage, so it survives a reload and a same-tab /dive, and nothing else.
// Pure apart from the injected storage.
// Registry-scoped (TutorDomain, architecture §3.1): `claims` defaults to the nanoGPT CLAIMS, practice tasks come from
// the domain; a journey derives over its own registry, with the same locked rules.
import { CLAIMS, NANOGPT, claimsOfConceptIn } from './learn-tutor-claims.js';

export const STATES = ['understood', 'uncertain', 'misconception', 'prerequisite_gap', 'not_yet_observed'];

export const emptyStore = () => ({
  seq: 0, events: [],
  cursors: {},        // block id -> attemptLog entries already turned into events
  open: null,         // the Tutor's open ask_question: { action_id, claim, text, canvas }
  constraints: [],    // explicit, session-scoped (§7)
  turns: [],          // { learner, next_step? (a clicked hook's suggestion_id), tutor }, newest last
  actions: [],        // { type, strategy, claim }, newest last
  socratic: {},       // claim -> Socratic turns spent on its misconception
  suggested: null,    // the last suggest_dive: { concept, title, block_id, question, claim, canvas }
  keep: null,         // "Keep it on this canvas": { concept, canvas }, read by the next turn there
  dive: null,         // the hole this tab was last in: { dive_id, parent, concept, claim }
  returned: null,     // returned_from, waiting for the parent's next turn
  opened: [],         // holes whose opening turn already ran
  modalities: [],     // the modalities of recent Tutor actions, oldest first (at most 8; contract §2.6)
});

export const storeKey = app => `small.tutor:${app.org}:${app.email || app.owner_email}`;
export function loadStore(storage, key) {
  try { return { ...emptyStore(), ...JSON.parse(storage.getItem(key) || '{}') }; } catch { return emptyStore(); }
}
export function saveStore(storage, key, store) {
  try { storage.setItem(key, JSON.stringify(store)); } catch { /* blocked storage: this page only */ }
}

// Assigns the next seq values, in the order given.
export function appendEvents(store, events) {
  let seq = store.seq;
  const stamped = events.map(event => ({ ...event, seq: ++seq }));
  return { store: { ...store, seq, events: [...store.events, ...stamped] }, events: stamped };
}

// Deterministic evaluator (§3.1): the attemptLog entries this store has not seen yet, mapped
// through the practice-task registry. The grade is already in the log; nothing is re-graded.
// A pass is transfer only on the FIRST attempt of a transfer task: a later pass follows the card's
// answer-revealing feedback, so it counts as demonstrated_here.
// Completeness exception (Decision 7): practice events are claim-level (no `idea`). The task grades
// the whole answer, so an incomplete enumeration (c11 "0 to Q-1", leaving out the position itself)
// is a fail. Conversational explanations never fail an idea they leave out (evaluationFrom).
export function practiceEvents(store, block, target, canvas, domain = NANOGPT) {
  const log = block?.attemptLog || [];
  const seen = store.cursors[block?.id] || 0;
  if (!block?.activity || log.length <= seen) return { store, events: [] };
  const events = [];
  log.slice(seen).forEach((entry, offset) => {
    const index = seen + offset;
    const task = domain.practice(target.card_id, block.activity.id, entry.taskVersion ?? 1);
    if (!task) return;
    const first = log.findIndex(other => (other.taskVersion ?? 1) === (entry.taskVersion ?? 1)) === index;
    const passed = entry.result === 'passed';
    const misconception = passed ? null : task.wrong[entry.answer] || null;
    events.push({
      concept: domain.claims[task.claim].concept, claim: task.claim,
      result: passed ? 'pass' : 'fail',
      ...(misconception ? { misconception_id: misconception } : {}),
      kind: passed ? (task.transfer && first ? 'demonstrated_in_transfer' : 'demonstrated_here') : null,
      settled: true, evaluator: 'deterministic', source: 'card_practice',
      ref: { card: target.card_id, scene_id: target.scene_id, part_id: target.part_id, task_id: block.activity.id, answer_id: entry.answer, attempt: index, canvas },
    });
  });
  return { store: { ...store, cursors: { ...store.cursors, [block.id]: log.length } }, events };
}

const WORST = ['misconception', 'prerequisite_gap', 'uncertain', 'not_yet_observed'];
const negative = event => event.result === 'fail' || event.result === 'misconception';

function claimState(events, id, conceptOf, claims = CLAIMS) {
  const own = events.filter(event => event.claim === id).sort((a, b) => a.seq - b.seq);
  if (!own.length) return { concept: claims[id].concept, claim: id, state: 'not_yet_observed', basis: [] };
  const settled = own.filter(event => event.settled);
  const base = { concept: claims[id].concept, claim: id };
  // understood: a settled transfer pass with no later settled fail or misconception, and coverage
  // (Decision 7): every idea has a settled pass, or a settled claim-level pass (no `idea`: practice).
  const transfer = settled.filter(event => event.result === 'pass' && event.kind === 'demonstrated_in_transfer').at(-1);
  const passes = settled.filter(event => event.result === 'pass');
  const covered = passes.some(event => event.idea == null) || claims[id].ideas.every((_, i) => passes.some(event => event.idea === i));
  if (transfer && covered && !settled.some(event => event.seq > transfer.seq && negative(event))) return { ...base, state: 'understood', basis: [transfer.seq] };
  // misconception: at least 2 settled events naming the same misconception, no later transfer pass.
  const named = {};
  for (const event of settled) if (event.misconception_id && negative(event)) (named[event.misconception_id] ||= []).push(event.seq);
  const repeated = Object.entries(named).filter(([, seqs]) => seqs.length >= 2).sort((a, b) => b[1].at(-1) - a[1].at(-1))[0];
  if (repeated && !settled.some(event => event.seq > repeated[1].at(-1) && event.result === 'pass' && event.kind === 'demonstrated_in_transfer')) {
    return { ...base, state: 'misconception', misconception_id: repeated[0], basis: repeated[1] };
  }
  // prerequisite_gap: a settled gap naming a prerequisite concept that is not itself understood.
  const gap = settled.filter(event => event.result === 'gap' && event.prerequisite && conceptOf(event.prerequisite) !== 'understood').at(-1);
  if (gap) return { ...base, state: 'prerequisite_gap', prerequisite: gap.prerequisite, basis: [gap.seq] };
  // uncertain: any other evidence - conflicting, only demonstrated_here, or only unsettled.
  return { ...base, state: 'uncertain', basis: own.map(event => event.seq) };
}

// Every registry claim's state, recomputed from all events (§2 "Derivation").
export function deriveClaimStates(events, claims = CLAIMS) {
  const states = {};
  const concept = name => conceptFrom(states, name, events, claims);
  for (const id of Object.keys(claims)) states[id] = claimState(events, id, concept, claims);
  return states;
}
function conceptFrom(states, name, events, registry = CLAIMS) {
  const claims = claimsOfConceptIn(registry, name);
  // A prerequisite's claims have no prerequisites of their own in the slice, so no recursion loop.
  const list = claims.map(id => states[id] || claimState(events, id, () => 'not_yet_observed', registry));
  return conceptStateOf(list);
}
// understood only if every claim is; otherwise the worst claim state.
export function conceptStateOf(claimStates) {
  if (claimStates.length && claimStates.every(state => state.state === 'understood')) return 'understood';
  return WORST.find(state => claimStates.some(entry => entry.state === state)) || 'not_yet_observed';
}
export const conceptState = (states, concept, claims = CLAIMS) => conceptStateOf(claimsOfConceptIn(claims, concept).map(id => states[id]));

// Stage D, the evidence reconciler (docs/features/tutor-architecture-v2.md): evaluators return
// observations; this is the only place they become store events, and the locked states come from
// all events (deriveClaimStates: one fail is never a misconception, a later settled transfer pass
// supersedes, conflicting evidence is uncertain). A failed evaluation (error, timeout) adds nothing.
// Returns the claims whose state changed, for the turn trace.
export function reconcile(store, evaluation, ref, claims = CLAIMS) {
  const before = deriveClaimStates(store.events, claims);
  const observations = !evaluation || evaluation.status === 'error' ? [] : evaluation.events || [];
  const { store: next } = appendEvents(store, observations.map(event => ({ ...event, ref })));
  const states = deriveClaimStates(next.events, claims);
  const transitions = Object.keys(states).filter(id => states[id].state !== before[id].state).map(id => ({ claim: id, from: before[id].state, to: states[id].state }));
  return { store: next, states, transitions, added: observations.length };
}
