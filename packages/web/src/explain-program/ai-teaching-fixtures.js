// Reusable teaching examples; hand-authored, not evidence of model generation.
import { convolutionFixture } from './ai-convolution-fixture.js';
import { attentionFixture } from './ai-attention-fixture.js';
import { gradientFixture } from './ai-gradient-fixture.js';
import { pointInTimeJoinFixture } from './ai-point-in-time-join-fixture.js';
import { featureScalingFixture } from './ai-feature-scaling-fixture.js';
import { forestVotingFixture } from './ai-forest-voting-fixture.js';
import { classImbalanceFixture } from './ai-class-imbalance-fixture.js';
import { stratifiedFoldsFixture } from './ai-stratified-folds-fixture.js';
import { pipelineLeakageFixture } from './ai-pipeline-leakage-fixture.js';
import { walkForwardFixture } from './ai-walk-forward-fixture.js';
import { dbscanFixture } from './ai-dbscan-fixture.js';
import { svmMarginFixture } from './ai-svm-margin-fixture.js';
import { overfittingFixture } from './ai-overfitting-fixture.js';
import { bayesSmoothingFixture } from './ai-bayes-smoothing-fixture.js';
import { dataConceptDriftFixture } from './ai-data-concept-drift-fixture.js';
import { hyperparameterSearchFixture } from './ai-hyperparameter-search-fixture.js';
import { featureEliminationFixture } from './ai-feature-elimination-fixture.js';
import { anomalyIsolationFixture } from './ai-anomaly-isolation-fixture.js';
import { boostingFixture } from './ai-boosting-fixture.js';

export const AI_TEACHING_FIXTURES = [
  convolutionFixture,
  attentionFixture,
  gradientFixture,
  pointInTimeJoinFixture,
  featureScalingFixture,
  forestVotingFixture,
  classImbalanceFixture,
  stratifiedFoldsFixture,
  pipelineLeakageFixture,
  walkForwardFixture,
  dbscanFixture,
  svmMarginFixture,
  overfittingFixture,
  bayesSmoothingFixture,
  dataConceptDriftFixture,
  hyperparameterSearchFixture,
  featureEliminationFixture,
  anomalyIsolationFixture,
  boostingFixture,
];
