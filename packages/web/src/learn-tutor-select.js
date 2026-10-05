// Tutor v2 Stage B: the claim candidate selector (docs/features/tutor-architecture-v2.md). Before JEV,
// keep only the claims the learner's message actually touches, out of the turn's candidates (the
// target's claims, the open question's, the returned-from claim, and their prerequisite concepts'
// claims). Deterministic: cue phrases per claim, then concept names. Locked semantic rule: evaluate
// ideas the learner actually attempted; untouched claims never get evidence. JEV still decides
// whether a touched claim was attempted (a question is not a failed explanation).
// ponytail: substring cues over the 10 slice claims; a learned or JEV-side selector when the registry
// grows past what hand-written cues can cover.
import { NANOGPT } from './learn-tutor-claims.js';

// Claim-specific cues, lowercase. A claim with a cue match is selected; a concept name ("softmax")
// only selects that concept's candidates when none of its claims matched a specific cue.
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

// A cue matches at the start of a word ("read" never matches "already"; "multipl" matches "multiplier").
function hit(text, cue) {
  const word = /[a-z0-9]/;
  for (let at = text.indexOf(cue); at >= 0; at = text.indexOf(cue, at + 1)) if (!at || !word.test(text[at - 1]) || !word.test(cue[0])) return true;
  return false;
}

// candidates: claim ids, in priority order. forced: ids kept whatever the words (the open question's
// claim when answering, the returned-from claim). fallback: the target's claims, kept when no cue at
// all matched, so an explanation in unusual words is still evaluated (JEV's engaged check guards it).
// domain (TutorDomain): a journey claim's cues are its registry `cues` only (never CUES, even for an id that matches a
// slice claim's); concept names are the domain's.
export function selectClaims(raw, { candidates, forced = [], fallback = [] }, domain = NANOGPT) {
  const started = performance.now();
  const text = String(raw || '').toLowerCase();
  const pool = [...new Set(candidates)].filter(id => domain.claims[id]);
  const matched = {};
  for (const id of pool) {
    const cues = ((domain.kind === 'nanogpt' ? CUES[id] : domain.claims[id]?.cues) ?? []).filter(cue => hit(text, cue.toLowerCase()));
    if (cues.length) matched[id] = cues;
  }
  const concepts = new Set(Object.keys(matched).map(id => domain.claims[id].concept));
  // A concept name inside a matched cue ("after softmax") is that cue's, not a mention of the concept.
  const rest = Object.values(matched).flat().reduce((left, cue) => left.split(cue.toLowerCase()).join(' '), text);
  for (const id of pool) {
    const concept = domain.claims[id].concept;
    if (matched[id] || concepts.has(concept)) continue;
    const name = (domain.concepts[concept]?.names || []).find(entry => hit(rest, entry.toLowerCase()));
    if (name) matched[id] = [`concept:${name}`];
  }
  let selected = pool.filter(id => forced.includes(id) || matched[id]);
  const usedFallback = !Object.keys(matched).length;
  if (usedFallback) selected = [...new Set([...forced, ...fallback])].filter(id => pool.includes(id));
  return { selected: selected.slice(0, 6), available: pool.length, matched, fallback: usedFallback, ms: +(performance.now() - started).toFixed(3) };
}
