// Professor Next Steps, browser side (docs/features/professor-next-steps.md §2.1, §2.3): the hook planner's input, built from
// structured state only (never a chat dump, never intake self-report), its staleness basis and the stopping points. Pure.
import { NEXT_STEPS_LIMITS as L, capText as cap, nextStepsScope } from '../../control-plane/src/agents/learn-next-steps.js';
import { deriveClaimStates } from './learn-tutor-evidence.js';
import { claimsOfConceptIn, holeConcept } from './learn-tutor-claims.js';
import { resolveTarget } from './learn-target.js';
import { sameCanvas } from './learn-tutor.js';

const REPAIR = ['misconception', 'prerequisite_gap', 'uncertain'];
const SETUP = ['intake', 'diagnostic', 'path_review'];
const claimIdsOf = section => (section?.expected_evidence || []).map(e => e?.claim).filter(id => typeof id === 'string');

// context: tutorContext's (or a hook turn's) { domain, source }, null where none resolves (a plain canvas: empty scope, block
// titles as grounding). store: the canvas's Tutor session store. journey: useJourney's view. record/parent: a hole's dive
// record and its parent journey (read only). previous: { hooks, goals } already shown and chosen. describe: LearningBlocks'
// describeBlock when the page passes it; only its title is read.
// Returns { input, trim } - trim is structured counts beside the input, never inside it (owner sixth message 4) - or
// { problem: 'input_too_large' } when the 9000-character cap would leave a registry canvas with no claim, or nothing fits.
export function nextStepsInput({ context = null, store = null, journey = null, blocks = [], record = null, parent = null, title = '', lastTurn = null, previous = {}, basis, describe = null }) {
  const domain = context?.domain ?? null, claims = domain?.claims || {}, concepts = domain?.concepts || {}, events = store?.events || [];
  const known = id => typeof id === 'string' && Object.hasOwn(claims, id);
  const states = domain ? deriveClaimStates(events, claims) : {};
  // kind is the block type, as TutorDecisionEvent's canvas_summary.kinds. A chat card ({ id, question, answer }, no type) is
  // kind chat titled by the learner's own question - grounding only: topicOf skips it - and never its answer.
  const shown = blocks.slice(-L.blocks).map(block => {
    const chat = !block.type;
    let named = null;
    try { named = chat ? null : describe?.(block) ?? null; } catch { /* the block's own title */ }
    const t = resolveTarget(block);
    return {
      id: block.id, kind: chat ? 'chat' : cap(block.type, 40), title: cap(chat ? block.question : named?.title ?? block.title ?? block.question ?? block.prompt ?? block.text, L.block_title),
      concept_ids: t.concept_ids.filter(c => Object.hasOwn(concepts, c)).slice(0, L.ids),
      claim_ids: (domain?.targetClaims?.({ block_id: block.id, card_id: t.card_id, part_id: t.part_id, selected_object: t.selected_object, concept_ids: t.concept_ids }) || []).filter(known).slice(0, L.ids),
      practice: block.activity ? block.attemptLog?.at(-1)?.result ?? 'open' : null,
    };
  });
  const mode = context?.source === 'journey' ? 'journey' : record ? 'dive' : 'canvas';
  const sections = journey?.path?.sections || [], completed = sections.filter(s => s.status === 'completed').slice(-6);
  const current = mode === 'journey' ? sections.find(s => s.id === domain.sectionId) : null;
  // Completed-section claims (owner sixth message 2): a claim only in path.completed takes a scope place only for repair - a
  // repair state, or the concept a prerequisite_gap names (a missing prerequisite). Understood or unseen ones stay out.
  const done = new Set(completed.flatMap(claimIdsOf)), now = new Set(claimIdsOf(current));
  const missing = new Set(Object.values(states).filter(s => s.state === 'prerequisite_gap' && s.prerequisite).map(s => s.prerequisite));
  const repairing = id => REPAIR.includes(states[id]?.state) || missing.has(claims[id]?.concept);
  const active = id => !done.has(id) || now.has(id) || repairing(id);
  // Scope priority (§2.1): the section's or hole's claims, the newest blocks' claims, claims with evidence (newest first),
  // the prerequisites of those, then completed-section claims that need repair.
  const first = (domain?.defaultClaims?.({ canvas: { dive: record ? { record } : null } }) || []).filter(known);
  const lead = [...first, ...[...shown.slice(-6).reverse().flatMap(b => b.claim_ids), ...events.map(e => e.claim).reverse().filter(known)].filter(active)];
  const prerequisites = lead.flatMap(id => [states[id]?.prerequisite, ...(claims[id].prerequisites || [])]).filter(Boolean).flatMap(c => claimsOfConceptIn(claims, c)).filter(active);
  const repair = [...done].filter(id => known(id) && !now.has(id) && repairing(id));
  const scope = nextStepsScope({ claims, concepts, order: [...lead, ...prerequisites, ...repair], states, events, presented: shown.flatMap(b => b.claim_ids) });

  // Ruling T7: structured sources only - the journey goal; a hole's hook goal, else its parent's goal (a journey's, or the
  // course subject) and its title; else the course subject or canvas title. The learner's words travel as recent.question.
  const parentGoal = !record ? null : context?.source === 'dive' ? domain.context?.goal : context?.source === 'registry' ? domain.subject : null;
  const goal = mode === 'journey' ? domain.context?.goal || title
    : record ? record.learning_goal || (parentGoal ? `${cap(parentGoal, 120)} - ${cap(record.title, 80)}` : record.title)
    : domain?.subject || title;
  const asked = ['question', 'request'].includes(lastTurn?.kind) && lastTurn.question ? cap(lastTurn.question, L.question) : null;
  const parentStates = record?.journey && parent?.journey ? deriveClaimStates(parent.journey.evidence?.events || [], parent.journey.registry?.claims || {}) : {};
  const input = {
    mode, basis, goal: cap(goal, L.goal_text),
    ...(mode === 'journey' ? { path: {
      current: current ? { id: current.id, title: cap(current.title, 80), purpose: cap(current.purpose, 240), claim_ids: claimIdsOf(current) } : null,
      completed: completed.map(s => ({ id: s.id, title: cap(s.title, 80), claim_ids: claimIdsOf(s) })),
      upcoming: sections.filter(s => s.status === 'upcoming').slice(0, 4).map(s => cap(s.title, 80)),
    } } : {}),
    canvas: { blocks: shown }, scope,
    recent: {
      intent: lastTurn?.kind ?? null, ...(asked ? { question: asked } : {}),
      transitions: (lastTurn?.transitions || []).slice(-L.transitions).map(({ claim, from, to }) => ({ claim, from, to })),
      modalities: (store?.modalities || []).slice(-L.modalities),
      practice: shown.filter(b => b.practice && b.practice !== 'open').slice(-L.practice).map(b => ({ block_id: b.id, result: b.practice })),
    },
    previous: { hooks: (previous?.hooks || []).slice(-L.previous_hooks), goals: (previous?.goals || []).slice(-L.previous_goals) },
    ...(record ? { dive: {
      title: cap(record.title, 80), concept: domain?.conceptOf ? holeConcept(record, domain) : null, claim_ids: first,
      parent_goal: parentGoal ? cap(parentGoal, 200) : null, parent_section: record.journey?.section_id ?? null,
      parent_states: Object.fromEntries((record.journey?.claim_ids || []).filter(id => parentStates[id]).map(id => [id, parentStates[id].state])),
    } } : {}),
    constraints: { learner: [...(store?.constraints || [])], ...(domain?.context?.constraints || {}) },
  };
  // The 9000-character cap (owner sixth message 1), by structured priority only, never titles or text: first the least relevant,
  // oldest cards down to the 6 that feed the scope (a card naming no kept claim, then one naming a kept claim, then one naming
  // the section's or hole's claims), then the lowest-priority claims, the section's or hole's claims only after every card.
  // Every card names only ids still in scope.
  const lead1 = new Set(first), count = () => ({ block_count: input.canvas.blocks.length, claim_count: Object.keys(input.scope.claims).length });
  const fits = () => {
    for (const b of input.canvas.blocks) {
      b.claim_ids = b.claim_ids.filter(id => Object.hasOwn(input.scope.claims, id));
      b.concept_ids = b.concept_ids.filter(c => Object.hasOwn(input.scope.concepts, c));
    }
    return JSON.stringify(input).length <= L.input_chars;
  };
  const rank = b => (b.claim_ids.some(id => lead1.has(id)) ? 2 : b.claim_ids.length ? 1 : 0);
  const dropBlock = () => { const list = input.canvas.blocks; list.splice(list.reduce((low, b, i) => (rank(b) < rank(list[low]) ? i : low), 0), 1); };
  const dropClaim = id => {
    const { concept } = input.scope.claims[id];
    delete input.scope.claims[id];
    if (!Object.values(input.scope.claims).some(c => c.concept === concept)) delete input.scope.concepts[concept];
  };
  const before = count(), had = Object.keys(input.scope.claims);
  while (!fits()) {
    const ids = Object.keys(input.scope.claims), optional = ids.filter(id => !lead1.has(id));
    if (input.canvas.blocks.length > 6) dropBlock();
    else if (optional.length) dropClaim(optional.at(-1));
    else if (input.canvas.blocks.length) dropBlock();
    else if (ids.length) dropClaim(ids.at(-1));
    else break;
  }
  const after = count();
  // Never a planner input with zero usable claims where the registry offered some, and never one over the cap.
  if (!fits() || (before.claim_count && !after.claim_count)) return { problem: 'input_too_large' };
  const kept = ids => (ids.length ? ids.every(id => Object.hasOwn(input.scope.claims, id)) : null);
  return { input, trim: {
    before, after, trimmed: { block_count: before.block_count - after.block_count, claim_count: before.claim_count - after.claim_count },
    current_section_claims_kept: kept(had.filter(id => lead1.has(id))), repair_claims_kept: kept(had.filter(repairing)),
  } };
}

// FNV-1a over the trigger state: a short opaque key (the server caps a basis at 400 characters).
// ponytail: 32 bits, so one change in about 4e9 could keep a stale set; widen the hash if that ever matters.
const fnv = text => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
// §2.3: a finished Tutor turn, an evidence event (the session store's or the journey's, so an option answer outside a turn
// counts), a path version, section change or section materialized, a card added or removed (ids only, order ignored: never
// moved, selected or zoomed), a practice attempt, a graded answer, entering or leaving a hole. Nothing else is read.
export function nextStepsBasis({ lastTurn = null, store = null, journey = null, canvasState = null, graded = 0, record = null }) {
  const j = journey?.journey;
  return `nb_${fnv(JSON.stringify([lastTurn?.turn_id ?? null, store?.seq ?? 0, j?.evidence?.seq ?? null, journey?.path?.version ?? null, j?.active_section_id ?? null,
    j?.section_plan?.heading_block_id ?? null, (canvasState?.cards || []).map(entry => entry[0]).sort(), canvasState?.attempts ?? 0, graded, record?.dive_id ?? null, !!store?.returned]))}`;
}

// Not a stopping point (contract §1.2): the Tutor answering, journey work (a pending action, a section being built) or
// setup, an open tray, an open Tutor question or a pending return on this canvas, or nothing to suggest from. Voice Mode is
// deliberately not an input: hooks stay visible and clickable while it is on.
export function stoppingPoint({ busy = false, journey = null, store = null, here = null, blocks = [], goal = '' }) {
  const j = journey?.journey;
  if (busy || journey?.busy || j?.pending || (j && SETUP.includes(j.state)) || journey?.trayProps) return 'not_now';
  if ((store?.open && sameCanvas(store.open.canvas, here)) || (store?.returned && sameCanvas(store.returned.parent, here))) return 'not_now';
  if (!blocks.length && !String(goal || '').trim()) return 'not_now';
  return null;
}
