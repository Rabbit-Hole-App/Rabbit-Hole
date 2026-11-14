import { diagramReferences } from './reference-library.js';
import { singleSpecs as specsA } from './reference-single-specs-a.js';
import { singleSpecs as specsB } from './reference-single-specs-b.js';
import { architectureSingleSpecs } from './illustration-architecture-references.js';
import { transformerMultiheadReference, transformerMultiheadSingleSpec } from './transformer-multihead-reference.js';
import { figureChapterSingleSpecs } from './figure-chapter-single-specs.js';

const panelsById = new Map(diagramReferences.map(ref => [ref.id, ref]));

export const singleDiagramReferences = Object.freeze(
  // Keep variants for the panel references registered on this release.
  Object.entries({ ...specsA, ...specsB, ...architectureSingleSpecs,
    [transformerMultiheadReference.id]: transformerMultiheadSingleSpec,
    ...figureChapterSingleSpecs,
  }).filter(([panelReferenceId]) => panelsById.has(panelReferenceId)).map(([panelReferenceId, { spec, useWhen }]) => {
    const { id, keywords, prompts, lessons } = panelsById.get(panelReferenceId);
    return {
      id: `${id}-single`, variant: 'single', panelReferenceId,
      keywords, prompts, lessons, useWhen, spec,
    };
  }),
);
