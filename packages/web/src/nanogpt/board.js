// The nanogpt-deep-dive board, first batch (docs/nanogpt-deep-dive-board-plan.md).
// Ten cards from the 26-card inventory, in teaching order. Each card module
// exports its scene, an optional practice activity (only where the task
// needs reasoning), its sources (shown collapsed under the card, see
// ../card-sources.js), and an evidence record (concept, source revision, data
// provenance, control, consequence, capability exercised).
import * as forwardPass from './cards/c01-forward-pass.js';
import * as residual from './cards/c03-residual.js';
import * as tokenizer from './cards/c06-tokenizer.js';
import * as multiHead from './cards/c13-multi-head.js';
import * as layerNorm from './cards/c15-layernorm.js';
import * as crossEntropy from './cards/c16-cross-entropy.js';
import * as lrSchedule from './cards/c17-lr-schedule.js';
import * as trainVal from './cards/c18-train-val.js';
import * as optimizer from './cards/c20-optimizer.js';
import * as temperature from './cards/c21-temperature.js';
import * as embeddingLookup from './cards/c07-embedding-lookup.js';
import * as tokenPlusPosition from './cards/c09-token-plus-position.js';
import * as blockAnatomy from './cards/c02-block-anatomy.js';
import * as blockStack from './cards/c04-block-stack.js';
import * as causalMask from './cards/c11-causal-mask.js';
import * as scoreScaling from './cards/c12-score-scaling.js';
import * as weightedValues from './cards/c10-weighted-values.js';
import * as positionMixing from './cards/c05-position-mixing.js';
import * as mlp from './cards/c14-mlp.js';
import * as trainingObjective from './cards/c26-training-objective.js';
import * as gradientStep from './cards/c19-gradient-step.js';

export const NANOGPT_FIRST_BATCH = [
  forwardPass, tokenizer, residual, multiHead, layerNorm,
  crossEntropy, trainVal, lrSchedule, optimizer, temperature,
];

// Cards authored after Phase 1 of card composition (docs/features/learn-card-
// composition.md), in review batches: each exports a reviewed plan, checked by
// board.test.mjs. The first batch above was approved before Phase 1 and is not
// reopened. Cards of one sequence sit next to each other, in path order.
export const NANOGPT_LATER_BATCHES = [
  // Batch 2 (docs/nanogpt-deep-dive-board-plan.md section 10): sequence
  // "Embeddings" (c07 is a prerequisite of c09), then "The block and the stack"
  // (c04 deepens c02).
  [embeddingLookup, tokenPlusPosition, blockAnatomy, blockStack],
  // Batch 3 (section 11): sequence "Self-attention" - c11 -> c12 -> c10, each
  // a prerequisite of the next (c13 in batch 1 deepens it) - then c05, the
  // prerequisite of c14 (batch 4).
  [causalMask, scoreScaling, weightedValues, positionMixing],
  // Batch 4 (section 12): c14 closes "The MLP" (c05 -> c14, c05 is the last
  // card of batch 3, so the pair sits together); then "Training fundamentals"
  // (c26 -> c19), linked to the frozen c16, c18, c17 and c20 by relationships.
  [mlp, trainingObjective, gradientStep],
];

// The input states each later card is reviewed in (every card exports them).
export const NANOGPT_REVIEW_STATES = Object.fromEntries(NANOGPT_LATER_BATCHES.flat().map(card => [card.scene.id, card.reviewStates]));

// One card module as a board block, shown at its end state.
export const cardBlock = card => ({
  id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0,
  title: card.scene.title, scene: card.scene, time: card.scene.duration,
  selectedObject: null, marked: null,
  ...(card.activity ? { activity: card.activity } : {}),
  ...(card.sources ? { sources: card.sources } : {}),
  // The sequence a card's plan places it in (card-composition Phase 1): the
  // card header names it, e.g. "Self-attention · 2 of 3".
  ...(card.plan?.boundary?.sequence ? { sequence: (({ name, position, of }) => ({ name, position, of }))(card.plan.boundary.sequence) } : {}),
});

export const nanogptDeepDiveBlocks = () => [...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat()].map(cardBlock);
