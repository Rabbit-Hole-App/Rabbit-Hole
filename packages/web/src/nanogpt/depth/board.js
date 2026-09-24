// The nanogpt-depth-ladder review board: six concepts, each taught at three
// depths the learner picks for themselves from the table of contents (a
// section per concept, a sub-section per depth). The depth names describe the
// card, never the learner. The three cards of a concept share their source
// truth (the pinned nanoGPT revision and its fixtures) but differ in
// abstraction, visual, interaction, prerequisites and implementation detail.
import { cardBlock } from '../board.js';
import * as tokenizationOverview from './tokenization/overview.js';
import * as tokenizationGuided from './tokenization/guided.js';
import * as tokenizationDeep from './tokenization/deep.js';
import * as architectureOverview from './architecture/overview.js';
import * as architectureGuided from './architecture/guided.js';
import * as architectureDeep from './architecture/deep.js';
import * as attentionOverview from './attention/overview.js';
import * as attentionGuided from './attention/guided.js';
import * as attentionDeep from './attention/deep.js';
import * as residualOverview from './residual-layernorm/overview.js';
import * as residualGuided from './residual-layernorm/guided.js';
import * as residualDeep from './residual-layernorm/deep.js';
import * as trainingOverview from './training-loss/overview.js';
import * as trainingGuided from './training-loss/guided.js';
import * as trainingDeep from './training-loss/deep.js';
import * as generationOverview from './generation/overview.js';
import * as generationGuided from './generation/guided.js';
import * as generationDeep from './generation/deep.js';

export const DEPTHS = ['Overview', 'Guided', 'Deep dive'];

export const DEPTH_LADDER = [
  { id: 'tokenization', label: 'Tokenization', cards: [tokenizationOverview, tokenizationGuided, tokenizationDeep] },
  { id: 'architecture', label: 'The Transformer, end to end', cards: [architectureOverview, architectureGuided, architectureDeep] },
  { id: 'attention', label: 'Attention', cards: [attentionOverview, attentionGuided, attentionDeep] },
  { id: 'residual-layernorm', label: 'Residual stream and LayerNorm', cards: [residualOverview, residualGuided, residualDeep] },
  { id: 'training-loss', label: 'Training and loss', cards: [trainingOverview, trainingGuided, trainingDeep] },
  { id: 'generation', label: 'Generation and sampling', cards: [generationOverview, generationGuided, generationDeep] },
];

const heading = (level, text) => ({ id: crypto.randomUUID(), type: 'heading', dx: 0, dy: 0, level, text, done: false });

// The input states each card is reviewed in (every card module exports them).
export const DEPTH_REVIEW_STATES = Object.fromEntries(DEPTH_LADDER.flatMap(concept =>
  concept.cards.map(card => [card.scene.id, card.reviewStates])));

export const nanogptDepthLadderBlocks = () => DEPTH_LADDER.flatMap(concept => [
  heading(1, concept.label),
  ...concept.cards.flatMap((card, i) => [heading(2, DEPTHS[i]), cardBlock(card)]),
]);
