import { diagramReferences } from './offline-reference-library.js';
import { singleSpecs as specsA } from './reference-single-specs-a.js';
import { singleSpecs as specsB } from './reference-single-specs-b.js';
import { architectureSingleSpecs } from './illustration-architecture-references.js';
import { transformerMultiheadReference, transformerMultiheadSingleSpec } from './transformer-multihead-reference.js';

const panelsById = new Map(diagramReferences.map(ref => [ref.id, ref]));

export const singleDiagramReferences = Object.freeze(
  Object.entries({ ...specsA, ...specsB, ...architectureSingleSpecs,
    [transformerMultiheadReference.id]: transformerMultiheadSingleSpec,
  }).map(([panelReferenceId, { spec, useWhen }]) => {
    const { id, keywords, prompts, lessons } = panelsById.get(panelReferenceId);
    return {
      id: `${id}-single`, variant: 'single', panelReferenceId,
      keywords, prompts, lessons, useWhen, spec,
    };
  }),
);
