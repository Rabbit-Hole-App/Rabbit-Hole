// The journey TutorDomain (docs/features/adaptive-learning-path-v1-architecture.md §3, §3.2, §3.3; LP1 Task 6): Tutor v2
// on a canvas with a live learning journey runs the same runTurn, router, validator and planner as nanoGPT, over this.
//   registry  the journey's own (§4): concepts and claims of the nanoGPT shape, so the derivation runs unchanged
//   scope     an open question's claim, else the target block's stamped claims, else the current section's
//             expected_evidence (at most 4); nothing in setup (intake, diagnostic, path_review), so a free question
//             there routes off_slice and gets words only
//   cards     this journey's step blocks (learn-journey-materialize.js stamps) for its current and completed
//             sections - already on the canvas, so showCard reveals and never inserts; no depth ladder, no practice
//             registry (suggest_depth is rejected at the resource stage)
//   evidence  the server's (§5): runTurn sends the journey id and adopts the stored events /evaluate returns
// Pure: built per turn from the journey and path the journey route returns and the canvas blocks.
// dive (LP1 Task 14, §13): a Rabbit Hole opened from a journey section - the dive record's { journey_id, section_id,
// concept_ids, claim_ids } over the parent journey, read once (diveJourney). Scope defaults to the dive's claims, the
// cards are the hole's own blocks, journey_context.phase is 'dive' with the dive's section, concepts and claims, and the
// evidence is the hole's session store ({ mode: 'session' }): evaluations use the client-built spec from the parent
// registry, and the parent's path and evidence are never written (reconciliation on return is LP5).
import { JOURNEY_LIMITS } from './learn-journey.js';
import { blockModality } from './learn-tutor-actions.js';
const SETUP = ['intake', 'diagnostic', 'path_review'];
const cap = (text, max) => String(text ?? '').slice(0, max);

export function journeyDomain({ journey, path, blocks = [], dive = null }) {
  const { concepts = {}, claims = {} } = journey.registry || {};
  const sections = path?.sections || [];
  const setup = !dive && SETUP.includes(journey.state);
  const section = setup ? null : sections.find(s => s.id === (dive?.section_id ?? journey.active_section_id ?? path?.current_section_id)) || null;
  const shown = new Set([section?.id, ...sections.filter(s => s.status === 'completed').map(s => s.id)].filter(Boolean));
  // This journey's blocks only (LP1 Task 15 review round 3): section ids repeat across journeys, and an archived journey's
  // stamped blocks stay on the board after Start new.
  const byId = new Map((dive ? blocks : blocks.filter(block => shown.has(block.journey?.section_id) && block.journey.journey_id === journey.id)).map(block => [block.id, block]));
  const cards = [...byId.keys()];
  const known = ids => (ids || []).filter(id => claims[id]);
  // A card is its block: the module fields the validator, the catalogue and the planner context read.
  const cardModule = id => {
    const block = byId.get(id);
    return block ? { evidence: { card: id, depth: null, learningQuestion: block.title }, scene: { title: block.title, inputs: [] }, activity: block.activity ?? null, sources: [] } : null;
  };
  const slots = journey.intake?.slots || {};
  return {
    kind: 'journey', subject: journey.request?.topic,
    sectionId: section?.id ?? null, // decision telemetry only (learn-tutor-trace.js); never in the planner context
    concepts, claims,
    practice: () => null,
    // The target block (by block id; a journey card id is a block id too): the claims stamped at materialization, and only
    // this journey's (LP1 Task 15 re-review): a block an archived journey left on the board never scopes this Tutor.
    targetClaims: target => {
      const stamp = setup ? null : blocks.find(block => block.id === (target?.block_id ?? target?.card_id))?.journey;
      return stamp?.journey_id === journey.id ? known(stamp.claims) : [];
    },
    defaultClaims: () => (dive ? known(dive.claim_ids).slice(0, JOURNEY_LIMITS.expected_evidence) : section ? known((section.expected_evidence || []).map(entry => entry.claim)).slice(0, JOURNEY_LIMITS.expected_evidence) : []),
    conceptOf: text => {
      const words = String(text || '').toLowerCase();
      return Object.keys(concepts).sort((a, b) => b.length - a.length).find(id => (concepts[id].names || []).some(name => words.includes(String(name).toLowerCase()))) || null;
    },
    cards, cardModule,
    // The modality of a card it shows (learn-tutor-actions.js): its block's type, an Explain Back challenge explain_back.
    cardType: id => blockModality(byId.get(id)),
    catalogue: () => cards.map(id => {
      const card = cardModule(id);
      return { card: id, title: card.scene.title, depth: null, learning_question: card.evidence.learningQuestion, practice: !!card.activity };
    }),
    ladder: [], ladderStep: () => null,
    showCard: (canvas, id) => {
      if (!byId.has(id)) return false;
      canvas.revealBlock?.(id);
      return true;
    },
    // §3.3: bounded (about 1.5 KB) - never the whole path, the evidence history or raw intake answers. Goal at most 200
    // characters, at most 6 concept labels of 60, at most 6 upcoming titles of 80; title, purpose and the 4
    // expected_evidence ids are already capped by the path schema (§9.2) and are cut to it here too.
    // ponytail: a completed journey reads as 'active' (§3.3 names three phases); a 'completed' phase once LP2 says
    // what the Tutor does after the last section.
    context: {
      phase: dive ? 'dive' : setup ? 'setup' : journey.state === 'paused' ? 'paused' : 'active',
      goal: cap(path?.goal || journey.request?.topic, 200),
      section: section && {
        title: cap(section.title, 80), purpose: cap(section.purpose, 240),
        target_concepts: ((dive ? dive.concept_ids : section.target_concepts) || []).slice(0, 6).map(id => cap(concepts[id]?.label ?? id, 60)),
        expected_evidence: dive ? known(dive.claim_ids).slice(0, JOURNEY_LIMITS.expected_evidence) : (section.expected_evidence || []).slice(0, JOURNEY_LIMITS.expected_evidence).map(entry => entry.claim),
      },
      // A hole teaches its own topic: no later section defers it (review round 1, C-14a).
      upcoming: dive ? [] : sections.filter(s => s.status === 'upcoming').slice(0, 6).map(s => cap(s.title, 80)),
      constraints: { depth: slots.depth ?? null, minutes: slots.minutes ?? null, coding: slots.coding ?? null, math: slots.math ?? null },
    },
    evidence: dive ? { mode: 'session' } : { mode: 'journey', journey_id: journey.id },
  };
}

// LP1 Task 14 (§13): the parent journey a Rabbit Hole was opened from, read once and read-only - one GET of the parent
// board's journey, owner-scoped on the server. Only that same journey lends its registry; anything else (a refusal, no
// journey, a journey started there since) is null, and the hole's Tutor stays as it was. The hole never posts to it.
export async function diveJourney(record, getJson) {
  const parent = record?.origin?.parent;
  if (!record?.journey || !parent?.app) return null;
  try {
    const d = await getJson(`/api/learn/journey?app=${encodeURIComponent(parent.app)}&board=${encodeURIComponent(parent.board || 'main')}`);
    return d?.journey?.id === record.journey.journey_id ? { journey: d.journey, path: d.path ?? null } : null;
  } catch { return null; }
}
