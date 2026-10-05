// The journey TutorDomain (docs/features/adaptive-learning-path-v1-architecture.md §3, §3.2, §3.3; LP1 Task 6): Tutor v2
// on a canvas with a live learning journey runs the same runTurn, router, validator and planner as nanoGPT, over this.
//   registry  the journey's own (§4): concepts and claims of the nanoGPT shape, so the derivation runs unchanged
//   scope     an open question's claim, else the target block's stamped claims, else the current section's
//             expected_evidence (at most 4); nothing in setup (intake, diagnostic, path_review), so a free question
//             there routes off_slice and gets words only
//   cards     the step blocks the materializer stamped (learn-journey-materialize.js) for the current and completed
//             sections - already on the canvas, so showCard reveals and never inserts; no depth ladder, no practice
//             registry (suggest_depth is rejected at the resource stage)
//   evidence  the server's (§5): runTurn sends the journey id and adopts the stored events /evaluate returns
// Pure: built per turn from the journey and path the journey route returns and the canvas blocks.
const SETUP = ['intake', 'diagnostic', 'path_review'];
const cap = (text, max) => String(text ?? '').slice(0, max);

export function journeyDomain({ journey, path, blocks = [] }) {
  const { concepts = {}, claims = {} } = journey.registry || {};
  const sections = path?.sections || [];
  const setup = SETUP.includes(journey.state);
  const section = setup ? null : sections.find(s => s.id === (journey.active_section_id ?? path?.current_section_id)) || null;
  const shown = new Set([section?.id, ...sections.filter(s => s.status === 'completed').map(s => s.id)].filter(Boolean));
  const byId = new Map(blocks.filter(block => shown.has(block.journey?.section_id)).map(block => [block.id, block]));
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
    concepts, claims,
    practice: () => null,
    // The target block (by block id; a journey card id is a block id too): the claims stamped at materialization.
    targetClaims: target => (setup ? [] : known(blocks.find(block => block.id === (target?.block_id ?? target?.card_id))?.journey?.claims)),
    defaultClaims: () => (section ? known((section.expected_evidence || []).map(entry => entry.claim)).slice(0, 4) : []),
    conceptOf: text => {
      const words = String(text || '').toLowerCase();
      return Object.keys(concepts).sort((a, b) => b.length - a.length).find(id => (concepts[id].names || []).some(name => words.includes(String(name).toLowerCase()))) || null;
    },
    cards, cardModule,
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
      phase: setup ? 'setup' : journey.state === 'paused' ? 'paused' : 'active',
      goal: cap(path?.goal || journey.request?.topic, 200),
      section: section && {
        title: cap(section.title, 80), purpose: cap(section.purpose, 240),
        target_concepts: (section.target_concepts || []).slice(0, 6).map(id => cap(concepts[id]?.label ?? id, 60)),
        expected_evidence: (section.expected_evidence || []).slice(0, 4).map(entry => entry.claim),
      },
      upcoming: sections.filter(s => s.status === 'upcoming').slice(0, 6).map(s => cap(s.title, 80)),
      constraints: { depth: slots.depth ?? null, minutes: slots.minutes ?? null, coding: slots.coding ?? null, math: slots.math ?? null },
    },
    evidence: { mode: 'journey', journey_id: journey.id },
  };
}
