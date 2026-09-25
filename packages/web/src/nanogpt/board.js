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

export const NANOGPT_FIRST_BATCH = [
  forwardPass, tokenizer, residual, multiHead, layerNorm,
  crossEntropy, trainVal, lrSchedule, optimizer, temperature,
];

// Cards authored after Phase 1 of card composition (docs/features/learn-card-
// composition.md), in review batches: each exports a reviewed plan, checked by
// board.test.mjs. The first batch above was approved before Phase 1 and is not
// reopened. Cards of one sequence sit next to each other, in path order.
export const NANOGPT_LATER_BATCHES = [];

// One card module as a board block, shown at its end state.
export const cardBlock = card => ({
  id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0,
  title: card.scene.title, scene: card.scene, time: card.scene.duration,
  selectedObject: null, marked: null,
  ...(card.activity ? { activity: card.activity } : {}),
  ...(card.sources ? { sources: card.sources } : {}),
});

export const nanogptDeepDiveBlocks = () => [...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat()].map(cardBlock);
