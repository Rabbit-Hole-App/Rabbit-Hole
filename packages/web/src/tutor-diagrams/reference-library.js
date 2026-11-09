import originalExamples from './examples.json' with { type: 'json' };
import { references as statistical } from './ml-statistical-references.js';
import { references as plot } from './ml-plot-references.js';
import { references as topology } from './ml-topology-references.js';
import { references as data } from './ml-data-references.js';
import { references as composition } from './ml-composition-references.js';
import { references as batch2aEvaluation } from './ml-batch2a-evaluation-references.js';
import { references as batch2aEncoding } from './ml-batch2a-encoding-references.js';
import { references as batch2aTransform } from './ml-batch2a-transform-references.js';
import { references as batch2bFits } from './ml-batch2b-fits-references.js';
import { references as batch2bEnsembles } from './ml-batch2b-ensembles-references.js';
import { references as batch2bTuning } from './ml-batch2b-tuning-references.js';
import { references as batch2cPsi } from './ml-batch2c-psi-references.js';
import { references as batch2cElimination } from './ml-batch2c-elimination-references.js';
import { references as batch2cImbalance } from './ml-batch2c-imbalance-references.js';
import { references as batch3aForecast } from './ml-batch3a-forecast-references.js';
import { references as batch3aCorrelation } from './ml-batch3a-correlation-references.js';
import { references as batch3aSeries } from './ml-batch3a-series-references.js';
import { references as batch3Topology } from './ml-batch3-topology-references.js';
import { references as batch3Teaching } from './ml-batch3-teaching-references.js';
import { references as batch3bDensity } from './ml-batch3b-anomaly-density-references.js';
import { references as batch3bDecisions } from './ml-batch3b-anomaly-decisions-references.js';
import { references as batch3cFlow } from './ml-batch3c-system-flow-references.js';
import { references as batch3cServing } from './ml-batch3c-system-serving-references.js';
import { references as batch4aPrediction } from './ml-batch4a-prediction-references.js';
import { references as batch4aLogistic } from './ml-batch4a-logistic-references.js';
import { tensorReferences } from './illustration-tensor-reference.js';
import { tokenLinksReferences } from './illustration-token-links-reference.js';
import { architectureReferences } from './illustration-architecture-references.js';
import { moeReferences } from './illustration-moe-reference.js';

export const illustrationReferences = Object.freeze([
  ...tensorReferences, ...tokenLinksReferences, ...architectureReferences, ...moeReferences,
]);

// Shared by the author, deterministic tests and the generated SVG catalogue.
// No renderer/React import: the worker can load this data without browser code.
const unchanged = new Set(['cycle', 'sequence', 'layers', 'number-line', 'argument', 'figure', 't-account', 'waterfall']);
const generic = originalExamples.filter(spec => unchanged.has(spec.diagram.kind)).map((spec, index) => ({
  id: `general-${spec.diagram.kind}-${index + 1}`, lessons: [],
  prompts: [`Explain ${spec.diagram.title.toLowerCase()}`],
  keywords: [spec.diagram.kind, spec.diagram.title.toLowerCase()],
  useWhen: `The question calls for ${spec.diagram.kind}; use this semantic structure with the learner's facts.`, spec,
}));
export const diagramReferences = Object.freeze([
  ...topology, ...statistical, ...plot, ...data, ...composition,
  ...batch2aEncoding, ...batch2aTransform, ...batch2aEvaluation,
  ...batch2bFits, ...batch2bEnsembles, ...batch2bTuning,
  ...batch2cImbalance, ...batch2cElimination, ...batch2cPsi,
  ...batch3aSeries, ...batch3aCorrelation, ...batch3aForecast,
  ...batch3Topology, ...batch3Teaching,
  ...batch3bDensity, ...batch3bDecisions,
  ...batch3cFlow, ...batch3cServing,
  ...batch4aPrediction, ...batch4aLogistic, ...illustrationReferences, ...generic,
]);

export const PHASE02_SOURCE = Object.freeze({
  repository: 'rohitg00/ai-engineering-from-scratch',
  revision: 'e7db050e64bde3be17a9381476f748da26d85692',
  directory: 'phases/02-ml-fundamentals',
});

export const phase02LessonCoverage = Object.freeze(Array.from({ length: 21 }, (_, i) => {
  const lesson = String(i + 1).padStart(2, '0');
  return { lesson, referenceIds: diagramReferences.filter(ref => ref.lessons.includes(lesson)).map(ref => ref.id) };
}));
