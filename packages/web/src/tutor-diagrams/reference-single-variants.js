import { diagramReferences } from './reference-library.js';
import { singleSpecs as specsA } from './reference-single-specs-a.js';
import { singleSpecs as specsB } from './reference-single-specs-b.js';
import { architectureSingleSpecs } from './illustration-architecture-references.js';
import { transformerMultiheadReference, transformerMultiheadSingleSpec } from './transformer-multihead-reference.js';
import { figureChapterSingleSpecs } from './figure-chapter-single-specs.js';
import { softmaxSingleSpec } from './topic-logistic-regression-references.js';
import { regularizationSingleSpecs } from './composition-regularization-single-specs.js';
import { distributionShiftSingleSpecs } from './composition-distribution-shift-single-specs.js';
import { transformerSingleSpecs } from './composition-transformer-references.js';

const panelsById = new Map(diagramReferences.map(ref => [ref.id, ref]));

export const singleDiagramReferences = Object.freeze(
  // Keep variants for the panel references registered on this release.
  Object.entries({ ...specsA, ...specsB, ...architectureSingleSpecs,
    [transformerMultiheadReference.id]: transformerMultiheadSingleSpec,
    ...figureChapterSingleSpecs,
    'ml-logistic-regression-softmax': softmaxSingleSpec, // the panels reference's one-diagram variant, built from the topic's data module
    ...regularizationSingleSpecs,
    ...distributionShiftSingleSpecs,
    ...transformerSingleSpecs,
  }).filter(([panelReferenceId]) => panelsById.has(panelReferenceId)).map(([panelReferenceId, { spec, useWhen }]) => {
    const { id, keywords, prompts, lessons } = panelsById.get(panelReferenceId);
    return {
      id: `${id}-single`, variant: 'single', panelReferenceId,
      keywords, prompts, lessons, useWhen, spec,
    };
  }),
);
