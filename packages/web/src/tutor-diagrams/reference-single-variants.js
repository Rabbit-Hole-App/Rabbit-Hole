import { diagramReferences } from './reference-library.js';
import { singleSpecs as specsA } from './reference-single-specs-a.js';
import { singleSpecs as specsB } from './reference-single-specs-b.js';
import { architectureSingleSpecs } from './illustration-architecture-references.js';
import { transformerMultiheadReference, transformerMultiheadSingleSpec } from './transformer-multihead-reference.js';

const panelsById = new Map(diagramReferences.map(ref => [ref.id, ref]));

export const singleDiagramReferences = Object.freeze(
  // ponytail: a variant whose panel reference is not registered is skipped (ten of the 30 belong to Phase 02 batch 1, which is not on this tree); they register when batch 1 lands.
  Object.entries({ ...specsA, ...specsB, ...architectureSingleSpecs, [transformerMultiheadReference.id]: transformerMultiheadSingleSpec }).filter(([panelReferenceId]) => panelsById.has(panelReferenceId)).map(([panelReferenceId, { spec, useWhen }]) => {
    const { id, keywords, prompts, lessons } = panelsById.get(panelReferenceId);
    return {
      id: `${id}-single`, variant: 'single', panelReferenceId,
      keywords, prompts, lessons, useWhen, spec,
    };
  }),
);
