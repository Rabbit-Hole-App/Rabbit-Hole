// Tutor v1 claim registry for the NanoGPT Attention slice (docs/features/tutor-v1-locked-decisions.md
// §2, §10; implementation map G4, G5). Tutor-owned data: the frozen card modules are read, never
// changed. Concepts are the cards' conceptId vocabulary; claims are Tutor ids, 2-3 per concept.
import { NANOGPT_FIRST_BATCH, NANOGPT_LATER_BATCHES, cardBlock } from './nanogpt/board.js';
import { DEPTH_LADDER } from './nanogpt/depth/board.js';

// The board the slice runs on (demo-scenes.js BOARDS) and the holes under it.
export const TUTOR_BOARD = 'nanogpt-attention-tutor';

export const CONCEPTS = {
  attention: { label: 'Attention', names: ['attention'] },
  'causal-mask': { label: 'The causal mask', names: ['causal mask', 'causal-mask', 'mask'] },
  'score-scaling': { label: 'Score scaling', names: ['score scaling', 'score-scaling', 'scaling', '1/√hs'] },
  softmax: { label: 'Softmax', names: ['softmax'] },
  'attention-output': { label: 'Weighted values', names: ['weighted values', 'weighted average', 'attention output', 'attention-output'] },
};

// statement: what the claim says. ideas: what an answer must state (one JEV check each).
// misconceptions: named wrong models (one JEV check each). prerequisites: concepts it rests on.
// drawn: the case the card draws - applying the idea to anything else counts as transfer.
export const CLAIMS = {
  'attention/looks-back-never-ahead': {
    concept: 'attention',
    statement: 'While reading one character, attention looks back at the earlier characters and the character itself, with different strengths, and never at characters that come later.',
    ideas: ['it looks back at earlier characters (and the character itself) with different strengths', 'it never looks at characters that come later'],
    misconceptions: [{ id: 'looks-ahead', check: 'says attention can look at characters that come later' }],
    prerequisites: [],
    drawn: 'the Overview card: one reader character in a short text and its bars over the earlier characters',
  },
  'attention/scores-from-dot-products': {
    concept: 'attention',
    statement: "Each key's score is the dot product of the query with that key, so the key the query points at scores highest.",
    ideas: ["a key's score is the dot product of the query with that key (q·k)"],
    misconceptions: [],
    prerequisites: [],
    drawn: 'the Guided card: reader 3 and its scores against the earlier keys, hs = 4',
  },
  'attention/weights-from-scores': {
    concept: 'attention',
    statement: 'Softmax turns the row of scores into attention weights that are positive and add up to one; the weights, not the raw scores, mix the values.',
    ideas: ['the scores are turned into weights by softmax', 'the weights add up to one'],
    misconceptions: [{ id: 'score-is-weight', check: 'says the raw score itself is the weight used to mix the values' }],
    prerequisites: ['softmax'],
    drawn: 'the Guided card: reader 3, its scores, the ÷ 2, the −∞ and the softmax row',
  },
  'causal-mask/reads-self-and-earlier': {
    concept: 'causal-mask',
    statement: 'Position i may read positions 0 to i - itself and every earlier position - and never i + 1, the character it is trained to predict, or anything later.',
    ideas: ['a position reads itself and every earlier position', 'it never reads the next position or any later one'],
    misconceptions: [
      { id: 'reads-next-target', check: 'says a position can read the next character, the one it is trained to predict' },
      { id: 'no-mask', check: 'says every position can read every position in the window' },
      { id: 'excludes-self', check: 'says a position cannot read itself' },
    ],
    prerequisites: [],
    drawn: 'the c11 card: the 6 × 6 mask table of a 6-character window',
  },
  'causal-mask/applied-before-softmax': {
    concept: 'causal-mask',
    statement: 'The mask sets every later score to −∞ before softmax, so those weights come out exactly 0.',
    ideas: ['the mask is applied to the scores before softmax', 'masked positions get a weight of exactly zero'],
    misconceptions: [{ id: 'mask-after-softmax', check: 'says the mask is applied after softmax, or zeroes the weights after softmax' }],
    prerequisites: ['softmax'],
    drawn: 'the c11 card: step ② "weights: 0 → score −∞ → weight 0" on the 6 × 6 table',
  },
  'score-scaling/multiplier-changes-sharpness': {
    concept: 'score-scaling',
    statement: 'Every score is multiplied by one positive number, 1/√hs, before the mask and softmax: a smaller multiplier gives flatter weights, a larger one sharper weights.',
    ideas: ['every score is multiplied by the same number (1/√hs) before softmax', 'a smaller multiplier gives flatter weights and a larger one sharper weights'],
    misconceptions: [
      { id: 'score-zero-weight-zero', check: 'says a score of 0 gives a weight of 0' },
      { id: 'mask-ignored', check: 'says the multiplier also changes the masked (later) positions' },
      { id: 'order-survives-zero', check: 'says the top key stays on top even when the multiplier is 0' },
    ],
    prerequisites: ['softmax'],
    drawn: 'the c12 card: one reader with the multiplier presets × 1/4, × 1/2 (the rule at hs = 4) and × 1',
  },
  'score-scaling/order-preserved': {
    concept: 'score-scaling',
    statement: 'A positive multiplier never changes which key scores highest; the mask still zeroes the later keys.',
    ideas: ['a positive multiplier keeps the order of the scores'],
    misconceptions: [],
    prerequisites: [],
    drawn: 'the c12 card: one reader with the multiplier presets × 1/4, × 1/2 (the rule at hs = 4) and × 1',
  },
  'softmax/normalizes-to-one': {
    concept: 'softmax',
    statement: 'Softmax exponentiates each score and divides by their sum, so every weight is positive and the weights add up to one.',
    ideas: ['each score is exponentiated', 'dividing by the sum makes the weights add up to one'],
    misconceptions: [{ id: 'divides-raw-scores', check: 'says softmax divides the raw scores by their sum without exponentiating' }],
    prerequisites: [],
    drawn: 'the c21 card: one set of last-position logits at the temperature presets',
  },
  'softmax/gaps-set-sharpness': {
    concept: 'softmax',
    statement: 'Only the gaps between scores matter: bigger gaps give sharper weights, and equal scores give equal weights.',
    ideas: ['larger gaps between scores give sharper (more uneven) weights', 'equal scores give equal weights'],
    misconceptions: [],
    prerequisites: [],
    drawn: 'the c21 card: one set of last-position logits at the temperature presets',
  },
  'attention-output/weighted-average': {
    concept: 'attention-output',
    statement: "A head's output for one query is the weighted average of the value vectors that query can see (Σ w·v), so it lands between those values.",
    ideas: ['the output is the values multiplied by their weights and summed', 'because the weights add up to one, the output lands between the values'],
    misconceptions: [
      { id: 'picks-top-value', check: 'says the output is the single value with the highest weight' },
      { id: 'sums-values', check: 'says the output is the plain sum of the values' },
      { id: 'own-value', check: "says the output is the query's own value" },
      { id: 'weights-ignored', check: 'says changing the weights leaves the output unchanged' },
    ],
    prerequisites: [],
    drawn: 'the c10 card: query 3 and its unequal weights over 4 visible values',
  },
};

// Card practice tasks (G4): card × task × version → claim. All three ask about a case the card
// does not draw, so a first-attempt pass is transfer evidence (§2 "Card practice mapping").
export const PRACTICE = {
  'c11-causal-mask:c11-practice:1': { claim: 'causal-mask/reads-self-and-earlier', transfer: true, wrong: { target: 'reads-next-target', all: 'no-mask', before: 'excludes-self' } },
  'c12-score-scaling:c12-practice:1': { claim: 'score-scaling/multiplier-changes-sharpness', transfer: true, wrong: { zero: 'score-zero-weight-zero', ninth: 'mask-ignored', top: 'order-survives-zero' } },
  'c10-weighted-values:c10-practice:1': { claim: 'attention-output/weighted-average', transfer: true, wrong: { top: 'picks-top-value', sum: 'sums-values', own: 'own-value', unchanged: 'weights-ignored' } },
};
export const practiceTask = (card, taskId, version = 1) => PRACTICE[`${card}:${taskId}:${version}`] || null;

// Which claims a message on a card is about. Deep dive: by part; others: the whole card.
const CARD_CLAIMS = {
  'depth-attention-overview': ['attention/looks-back-never-ahead'],
  'depth-attention-guided': ['attention/scores-from-dot-products', 'attention/weights-from-scores'],
  'depth-attention-deep': ['attention/scores-from-dot-products', 'attention/weights-from-scores'],
  'c11-causal-mask': ['causal-mask/reads-self-and-earlier', 'causal-mask/applied-before-softmax'],
  'c12-score-scaling': ['score-scaling/multiplier-changes-sharpness', 'score-scaling/order-preserved'],
  'c10-weighted-values': ['attention-output/weighted-average'],
  'c21-temperature': ['softmax/normalizes-to-one', 'softmax/gaps-set-sharpness'],
};
const PART_CLAIMS = {
  'depth-attention-deep': {
    shapes: ['attention/scores-from-dot-products'],
    'causal-mask': ['causal-mask/applied-before-softmax'],
    memory: ['attention/weights-from-scores'],
    scaling: ['score-scaling/multiplier-changes-sharpness'],
  },
};
export const claimsOfConcept = concept => Object.keys(CLAIMS).filter(id => CLAIMS[id].concept === concept);
// The same over any registry's claims (a TutorDomain's, learn-tutor-evidence.js).
export const claimsOfConceptIn = (claims, concept) => Object.keys(claims).filter(id => claims[id].concept === concept);

// The target's claims: a selected object's registry concept wins, then the part, then the card.
export function targetClaims(target) {
  if (!target?.card_id) return [];
  if (target.selected_object) {
    const registered = (target.concept_ids || []).filter(concept => CONCEPTS[concept]);
    if (registered.length) return registered.flatMap(claimsOfConcept);
  }
  return PART_CLAIMS[target.card_id]?.[target.part_id] || CARD_CLAIMS[target.card_id] || [];
}

// A hole's concept from its title or origin concepts ("Softmax" -> softmax), or null.
export function conceptOf(text) {
  const words = String(text || '').toLowerCase();
  return Object.keys(CONCEPTS).sort((a, b) => b.length - a.length).find(id => CONCEPTS[id].names.some(name => words.includes(name))) || null;
}

// The slice's authored cards, by evidence.card: what the planner may show, focus or suggest.
const MODULES = [...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat(), ...DEPTH_LADDER.flatMap(concept => concept.cards)];
export const SLICE_CARDS = ['depth-attention-overview', 'depth-attention-guided', 'depth-attention-deep', 'c11-causal-mask', 'c12-score-scaling', 'c10-weighted-values', 'c21-temperature'];
const BY_CARD = new Map(MODULES.filter(card => SLICE_CARDS.includes(card.evidence?.card)).map(card => [card.evidence.card, card]));
export const cardModule = cardId => BY_CARD.get(cardId) || null;
export const moduleOfScene = sceneId => MODULES.find(card => card.scene.id === sceneId) || null;

// The part labels of a paged card, in pager order.
export function partLabels(card) {
  const pager = card?.scene?.inputs?.find(input => input.presentation === 'pager');
  return pager ? card.scene.exampleData?.[pager.of] || [] : [];
}

// The planner's catalogue: every slice card with its depth, parts and question (§9 budget).
export const catalogue = () => SLICE_CARDS.map(id => {
  const card = cardModule(id);
  return {
    card: id, title: card.scene.title, depth: card.evidence.depth ?? null,
    learning_question: card.evidence.learningQuestion,
    ...(card.partIds ? { parts: card.partIds.map((part, index) => ({ part_id: part, label: partLabels(card)[index] })) } : {}),
    practice: !!card.activity,
  };
});

// The depth ladder for the attention concept: Overview -> Guided -> Deep dive.
export const ATTENTION_LADDER = DEPTH_LADDER.find(concept => concept.id === 'attention').cards.map(card => card.evidence.card);
export function ladderStep(cardId, direction) {
  const at = ATTENTION_LADDER.indexOf(cardId);
  if (at < 0) return direction === 'shallower' ? null : ATTENTION_LADDER[0];
  return ATTENTION_LADDER[at + (direction === 'deeper' ? 1 : -1)] || null;
}

// A hole's concept in a domain: its title ("Softmax"), else a registry concept among its origin concepts.
export function holeConcept(dive, domain = NANOGPT) {
  if (!dive) return null;
  return domain.conceptOf(dive.title) || domain.conceptOf(dive.concept) || (dive.origin?.origin_concept_ids || []).find(concept => domain.concepts[concept]) || null;
}

// Claim-specific cues, lowercase (learn-tutor-select.js selectClaims, through NANOGPT.cues). A claim with a cue match is
// selected; a concept name ("softmax") only selects that concept's candidates when none of its claims matched a specific cue.
export const CUES = {
  'attention/looks-back-never-ahead': ['look back', 'looks back', 'looking back', 'look ahead', 'looks ahead', 'ahead', 'future', 'come later', 'comes later', 'later character', 'earlier character', 'previous character', 'itself'],
  'attention/scores-from-dot-products': ['dot product', 'dot-product', 'q·k', 'q.k', 'q · k', 'qk', 'query', 'queries', 'key', 'scores highest', 'highest score'],
  'attention/weights-from-scores': ['weight', 'add up to one', 'adds up to one', 'add to one', 'sum to one', 'sums to one', 'sum to 1', 'add up to 1', 'score is the weight', 'score just the weight'],
  'causal-mask/reads-self-and-earlier': ['itself', 'earlier position', 'every earlier', 'next character', 'next position', 'next token', 'read', 'row', 'column', 'predict', 'cheat', 'see the future', 'every position'],
  'causal-mask/applied-before-softmax': ['before softmax', 'after softmax', 'before the softmax', 'after the softmax', '-inf', '−∞', '-∞', 'infinity', 'zero', 'weight 0', 'weight of 0', 'masked_fill'],
  'score-scaling/multiplier-changes-sharpness': ['multipl', 'scale', 'scaling', '√', 'sqrt', 'square root', 'sharp', 'flat', 'peak', '1/4', '1/2', 'hs'],
  'score-scaling/order-preserved': ['order', 'highest', 'top key', 'stays on top', 'rank', 'biggest'],
  'softmax/normalizes-to-one': ['exponent', 'exp(', 'e^', 'e²', 'sum to one', 'sums to one', 'add up to one', 'adds up to one', 'add to one', 'sum to 1', 'add up to 1', 'normali', 'divide', 'dividing', 'divided', 'positive'],
  'softmax/gaps-set-sharpness': ['gap', 'sharp', 'equal score', 'same score', 'temperature', 'flatter', 'uneven', 'uniform'],
  'attention-output/weighted-average': ['average', 'weighted sum', 'weighted values', 'middle', 'between', 'value', 'Σ', 'mix', 'output'],
};

// The TutorDomain (docs/features/adaptive-learning-path-v1-architecture.md §3): every slice-specific read of the
// Tutor modules goes through one object. This one is the existing constants, unchanged, and is every Tutor
// function's default, so nanoGPT callers change nothing; a journey canvas passes journeyDomain
// (learn-journey-domain.js). ladder: the cards ladderStep walks (a target's ladder neighbours are relevant only on
// it). cues: the hand-written cue map selectClaims reads before a claim's own `cues`. No showCard here: the nanoGPT one
// inserts the authored module (learn-tutor.js) and is used when a domain brings none.
export const NANOGPT = {
  kind: 'nanogpt', subject: 'nanoGPT attention',
  concepts: CONCEPTS, claims: CLAIMS, cues: CUES,
  practice: practiceTask,
  targetClaims,
  defaultClaims: turn => claimsOfConcept(holeConcept(turn.canvas.dive?.record)),
  conceptOf,
  cards: SLICE_CARDS, cardModule, catalogue, ladder: ATTENTION_LADDER, ladderStep,
  evidence: { mode: 'session' },
};

// The slice board (demo-scenes.js BOARDS[TUTOR_BOARD]): the Attention depth ladder, then the
// "Self-attention" sequence, as unmodified card blocks. c21 is not seeded: the Tutor may show it
// inside a softmax hole when it answers the learner's question (locked decisions §6.4, §10).
const heading = (level, text) => ({ id: crypto.randomUUID(), type: 'heading', dx: 0, dy: 0, level, text, done: false });
export const tutorSliceBlocks = () => [
  heading(1, 'Attention'),
  ...ATTENTION_LADDER.map(id => cardBlock(cardModule(id))),
  heading(1, 'Self-attention, step by step'),
  ...['c11-causal-mask', 'c12-score-scaling', 'c10-weighted-values'].map(id => cardBlock(cardModule(id))),
];
