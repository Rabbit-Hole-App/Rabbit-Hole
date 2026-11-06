// R4.12: private roadmap metadata on a delivered card (D9, D37). A card placed by a roadmap step carries `stepId`; that relationship is the
// learner's private roadmap state, so a shared view, a link, a publication and a fork or duplicate never carry it (records.md 5). Same shape as
// explain-back-private.js: a frozen key list, and the same object back when there is nothing to drop. `sourceRef` is R3's and is handled there.
export const PRIVATE_ROADMAP_CARD_KEYS = Object.freeze(['stepId', 'roadmapIndex', 'roadmapId', 'proposalId', 'resultId']);

export function publicRoadmapCard(block) {
  if (!block || typeof block !== 'object' || !PRIVATE_ROADMAP_CARD_KEYS.some(key => key in block)) return block;
  const copy = { ...block };
  for (const key of PRIVATE_ROADMAP_CARD_KEYS) delete copy[key];
  return copy;
}
