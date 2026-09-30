// What a canvas block IS, semantically: the identities the locked Tutor decisions keep apart
// (docs/features/tutor-v1-locked-decisions.md §1, "Deterministic sources"). Generic and pure, so
// /dive uses it now and the Tutor can later; it reads the existing card modules and never changes
// them.
//   block_id     the canvas block's own id (a UUID on seeded boards)
//   scene_id     the runtime scene.id, e.g. nanogpt-c11-causal-mask
//   card_id      the authored evidence.card, e.g. c11-causal-mask (deliberately a different string)
//   part_id      partIds[pager value] on a paged card, else null
//   concept_ids  the selected object's conceptId, else the shown part's, else the card's objects'
import { NANOGPT_FIRST_BATCH, NANOGPT_LATER_BATCHES } from './nanogpt/board.js';
import { DEPTH_LADDER } from './nanogpt/depth/board.js';

// The card registry keyed by scene.id, built from the existing module lists.
const REGISTRY = new Map([
  ...[...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat(), ...DEPTH_LADDER.flatMap(concept => concept.cards)]
    .map(card => [card.scene.id, { card: card.evidence?.card ?? null, partIds: card.partIds ?? null, depth: card.evidence?.depth ?? null }]),
]);

const distinct = values => [...new Set(values.filter(Boolean))];

export function resolveTarget(block) {
  const scene = block?.scene || null, spec = block?.spec || null;
  const scene_id = scene?.id ?? spec?.id ?? null;
  const entry = scene_id ? REGISTRY.get(scene_id) : null;
  const pager = scene?.inputs?.find(input => input.presentation === 'pager');
  const index = pager ? Number(block.inputs?.[pager.name] ?? pager.default ?? 0) : null;
  const part_id = pager && entry?.partIds ? entry.partIds[index] ?? null : null;
  const objects = scene?.objects || [];
  const selected = block?.selectedObject ? objects.find(object => (object.semanticId || object.id) === block.selectedObject) : null;
  const partConcepts = part_id && objects.some(object => object.conceptId === part_id) ? [part_id] : [];
  const concept_ids = selected?.conceptId ? [selected.conceptId]
    : partConcepts.length ? partConcepts
    : distinct([...objects.map(object => object.conceptId), ...(spec?.conceptIds || [])]);
  return {
    block_id: block?.id ?? null, scene_id, card_id: entry?.card ?? null, part_id,
    selected_object: block?.selectedObject ?? null, concept_ids, depth: entry?.depth ?? null,
    ...(block?.anchor ? { anchor_request: block.anchor.request } : {}),
  };
}
