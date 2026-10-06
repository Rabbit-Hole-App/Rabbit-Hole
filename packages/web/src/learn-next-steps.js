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
export function nextStepsInput({ context = null, store = null, journey = null, blocks = [], record = null, parent = null, title = '', lastTurn = null, previous = {}, basis, describe = null }) {
  const domain = context?.domain ?? null, claims = domain?.claims || {}, concepts = domain?.concepts || {}, events = store?.events || [];
  const known = id => typeof id === 'string' && Object.hasOwn(claims, id);
  const states = domain ? deriveClaimStates(events, claims) : {};
  // kind is the block type, as TutorDecisionEvent's canvas_summary.kinds.
  const shown = blocks.slice(-L.blocks).map(block => {
    let named = null;
    try { named = describe?.(block) ?? null; } catch { /* the block's own title */ }
    const t = resolveTarget(block);
    return {
      id: block.id, kind: cap(block.type, 40), title: cap(named?.title ?? block.title ?? block.question ?? block.prompt ?? block.text, L.block_title),
      concept_ids: t.concept_ids.filter(c => Object.hasOwn(concepts, c)).slice(0, L.ids),
      claim_ids: (domain?.targetClaims?.({ block_id: block.id, card_id: t.card_id, part_id: t.part_id, selected_object: t.selected_object, concept_ids: t.concept_ids }) || []).filter(known).slice(0, L.ids),
      practice: block.activity ? block.attemptLog?.at(-1)?.result ?? 'open' : null,
    };
  });
  // Scope priority (§2.1): the section's or hole's claims, the newest blocks' claims, claims with evidence (newest first),
  // the prerequisites of those, then completed-section claims in a repair state.
  const first = (domain?.defaultClaims?.({ canvas: { dive: record ? { record } : null } }) || []).filter(known);
  const lead = [...first, ...shown.slice(-6).reverse().flatMap(b => b.claim_ids), ...events.map(e => e.claim).reverse().filter(known)];
  const prerequisites = lead.flatMap(id => [states[id]?.prerequisite, ...(claims[id].prerequisites || [])]).filter(Boolean).flatMap(c => claimsOfConceptIn(claims, c));
  const sections = journey?.path?.sections || [], completed = sections.filter(s => s.status === 'completed').slice(-6);
  const repair = completed.flatMap(claimIdsOf).filter(id => known(id) && REPAIR.includes(states[id]?.state));
  const scope = nextStepsScope({ claims, concepts, order: [...lead, ...prerequisites, ...repair], states, events, presented: shown.flatMap(b => b.claim_ids) });

  const mode = context?.source === 'journey' ? 'journey' : record ? 'dive' : 'canvas';
  // Ruling T7: structured sources only - the journey goal; a hole's hook goal, else its parent's goal (a journey's, or the
  // course subject) and its title; else the course subject or canvas title. The learner's words travel as recent.question.
  const parentGoal = !record ? null : context?.source === 'dive' ? domain.context?.goal : context?.source === 'registry' ? domain.subject : null;
  const goal = mode === 'journey' ? domain.context?.goal || title
    : record ? record.learning_goal || (parentGoal ? `${cap(parentGoal, 120)} - ${cap(record.title, 80)}` : record.title)
    : domain?.subject || title;
  const asked = ['question', 'request'].includes(lastTurn?.kind) && lastTurn.question ? cap(lastTurn.question, L.question) : null;
  const current = mode === 'journey' ? sections.find(s => s.id === domain.sectionId) : null;
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
  // The 9000-character cap: drop the lowest-priority claim, then the oldest block, until it fits.
  while (JSON.stringify(input).length > L.input_chars) {
    const last = Object.keys(input.scope.claims).at(-1);
    if (last) {
      const { concept } = input.scope.claims[last];
      delete input.scope.claims[last];
      if (!Object.values(input.scope.claims).some(c => c.concept === concept)) delete input.scope.concepts[concept];
    } else if (input.canvas.blocks.length) input.canvas.blocks.shift();
    else break;
  }
  return input;
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
