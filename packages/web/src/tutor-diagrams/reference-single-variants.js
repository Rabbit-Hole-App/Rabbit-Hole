import { diagramReferences } from './reference-library.js';
import { singleSpecs as specsA } from './reference-single-specs-a.js';
import { singleSpecs as specsB } from './reference-single-specs-b.js';
import { architectureSingleSpecs } from './illustration-architecture-references.js';
import { transformerMultiheadReference, transformerMultiheadSingleSpec } from './transformer-multihead-reference.js';
import { figureChapterSingleSpecs } from './figure-chapter-single-specs.js';
import { softmaxSingleSpec } from './topic-logistic-regression-references.js';

const panelsById = new Map(diagramReferences.map(ref => [ref.id, ref]));
const explicit = { ...specsA, ...specsB, ...architectureSingleSpecs,
  [transformerMultiheadReference.id]: transformerMultiheadSingleSpec,
  ...figureChapterSingleSpecs,
  'ml-logistic-regression-softmax': softmaxSingleSpec, // the panels reference's one-diagram variant, built from the topic's data module
};
// Every `panels` reference without an authored variant gets its answer panel (the last panel of its standard figure) as the one-diagram variant, so a panels
// reference is never sent to the author whole (the kind is not in the author's schema yet). A two-panel comparison without an authored variant gets the same.
const needsAnswerPanel = ({ kind, variant, panels }) => kind === 'panels' || (kind === 'comparison' && variant === 'panels' && panels.length === 2);
const answerPanels = Object.fromEntries(diagramReferences
  .filter(ref => needsAnswerPanel(ref.spec.diagram) && !explicit[ref.id])
  .map(ref => [ref.id, { useWhen: ref.useWhen, spec: { version: ref.spec.version, diagram: ref.spec.diagram.panels.at(-1).diagram } }]));

export const singleDiagramReferences = Object.freeze(
  // Keep variants for the panel references registered on this release.
  Object.entries({ ...explicit, ...answerPanels,
  }).filter(([panelReferenceId]) => panelsById.has(panelReferenceId)).map(([panelReferenceId, { spec, useWhen }]) => {
    const { id, keywords, prompts, lessons } = panelsById.get(panelReferenceId);
    return {
      id: `${id}-single`, variant: 'single', panelReferenceId,
      keywords, prompts, lessons, useWhen, spec,
    };
  }),
);
