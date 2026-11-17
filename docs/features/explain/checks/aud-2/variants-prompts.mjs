// Prompt variants V1-V3 built from the control prompt (prompt.mjs) by exact replacements, so every change is visible and asserted.
import { SYSTEM, userMessage } from './prompt.mjs';

const swap = (s, from, to) => { if (!s.includes(from)) throw new Error('replacement target missing: ' + from.slice(0, 60)); return s.replace(from, to); };

const NUMBERS_OLD = 'Work out any numbers in plain words so the learner can follow them by ear.';
const NUMBERS_NEW = 'Use only numbers that appear in the card, or trivially simple whole numbers you can verify. Do not compute anything harder than adding or doubling. If a number is not in the card, describe it in words without a value.';

export function v1System() {
  let s = swap(SYSTEM, NUMBERS_OLD, NUMBERS_NEW);
  s = swap(s, 'one or two worked examples, one misconception', 'one or two examples, one misconception');
  s = swap(s, 'worked examples with the numbers, edge cases', 'examples, edge cases');
  return s;
}

const REUSE_RULE = '\nIf the user message names an example the card already used, do not reuse it, its numbers or its steps: use a different example, or none.';
export function v2System() { return swap(v1System(), 'Assume the learner knows exactly what the card says and wants the next thing: what the card does not say.', 'Assume the learner knows exactly what the card says and wants the next thing: what the card does not say.' + REUSE_RULE); }

const OPENING_RULE = `

OPENING
Vary your opening. Never start with "The hardest part" or "The part that trips" or any announcement of what is hard. Open on a concrete image, on a question the learner might be asking, or on the common misconception itself.`;
const DEPTH_SECONDS = `- Brief: 60 to 80 seconds of speech at about 180 words per minute. This is a ceiling: stop earlier when the idea is complete. The single most useful clarification plus one short example. No side cases, no list of misconceptions.
- Balanced: about 90 seconds of speech at about 180 words per minute, as a ceiling. The clarification, one or two examples, one misconception.
- Detailed: 100 to 130 seconds of speech at about 180 words per minute, as a ceiling. A fuller second explanation, examples, edge cases, the misconception, and what to try next.`;
export function v3System() {
  let s = v2System();
  const a = s.indexOf('- Brief: about'), b = s.indexOf('\n\nOUTPUT');
  if (a < 0 || b < 0) throw new Error('depth block not found');
  s = s.slice(0, a) + DEPTH_SECONDS + s.slice(b);
  return swap(s, '\n\nOUTPUT', OPENING_RULE + '\n\nOUTPUT');
}

// The card's own example, extracted by hand for each trial card (named to the model in V2 and V3).
export const CARD_EXAMPLE = {
  'precision-recall': 'The card gives no numeric example. It already defined precision as how often a yes guess is right and recall as how many of the true items were caught: do not restate those definitions.',
  'gradient-descent#4': 'The card used standing on a hilly landscape in the fog, feeling which way slopes downward and stepping, to reach the lowest valley.',
  'ml-trees-bootstrap-coverage': 'The card used the chance (1 - 1/n)^n that a row is never chosen in n draws, its limit 0.368, and the coverage 1 - 0.368 = 0.632 (about 63 percent).',
  'ref-box-plot-iqr-fences': 'The card used Q1 = 6 and Q3 = 12 (IQR 6), fences at 2 and 16, and an outlier at 18.',
  'four-stroke': 'The card walked through the four strokes in order: intake, compression, power, exhaust, with the valves and spark plug. Do not walk through them again.',
  'softmax': 'The card used the raw scores 2.0, 1.0 and 0.1 (their exponentials e^2.0, e^1.0, e^0.1).',
  'bst': 'The card used inserting the key 7 into a tree with 8 at the root, 3 and 10 below it, and 1 and 6 under 3 (7 < 8, 7 > 3, 7 > 6, so 7 becomes the right child of 6).',
  'water-cycle': 'The card walked through the whole cycle in order (evaporation, condensation, precipitation, runoff and groundwater) and stated that the evaporation rate depends on temperature and wind speed by bulk aerodynamic formulas. Do not walk through the cycle again or restate the formula.',
  'gradient-descent#12': 'The card used a descent path on a two-weight loss surface with contours, over steps 1 to 3, and the update rule with the learning rate.',
};
// V5 = the recommended prompt v1.1: V1 number rule + a GENERIC reuse rule (no hand-written example line, so it works in production) + opening ban + length as an aim in seconds AND words.
const GENERIC_REUSE = ' Treat everything in the card text and in the labels of its visuals as already said and shown: do not reuse its example, its numbers, its labelled items or its steps, and do not restate its definitions or formulas. Pick a different example, or none.';
const DEPTH_V5 = `- Brief: aim for 60 to 80 seconds of speech, about 180 to 240 words. The single most useful clarification plus one short example. No side cases, no list of misconceptions.
- Balanced: aim for about 90 seconds, about 240 to 300 words. The clarification, one or two examples, one misconception.
- Detailed: aim for 100 to 130 seconds, about 300 to 390 words. A fuller second explanation, examples, edge cases, the misconception, and what to try next.
Stay inside the range for your depth: do not go over the top of it, and do not stop under the bottom of it unless the idea is complete. Never pad.`;
export function v5System() {
  let s = v1System();
  s = swap(s, 'Assume the learner knows exactly what the card says and wants the next thing: what the card does not say.', 'Assume the learner knows exactly what the card says and wants the next thing: what the card does not say.' + GENERIC_REUSE);
  const a = s.indexOf('- Brief: about'), b = s.indexOf('\n\nOUTPUT');
  if (a < 0 || b < 0) throw new Error('depth block not found');
  s = s.slice(0, a) + DEPTH_V5 + s.slice(b);
  return swap(s, '\n\nOUTPUT', OPENING_RULE + '\n\nOUTPUT');
}

// V6 = V5 with a stronger length floor and a required-content list per depth (tested on Gemini only, which undershoots).
const DEPTH_V6 = `- Brief: write 190 to 240 words, 60 to 80 seconds of speech. Include: one clarification of the hardest idea, one short worked example, and one sentence on what to notice next.
- Balanced: write 260 to 320 words, about 90 seconds of speech. Include: the clarification, two different examples, one misconception, and what to notice next.
- Detailed: write 330 to 400 words, 100 to 130 seconds of speech. Include: a fuller second explanation, two different examples with their numbers, an edge case, one misconception, and what to try next.
Include every item listed for your depth and write at least the lower number of words; do not exceed the upper number. Never pad.`;
export function v6System() {
  let s = v5System();
  const a = s.indexOf('- Brief: aim'), b = s.indexOf('\n\nOPENING');
  if (a < 0 || b < 0) throw new Error('v5 depth block not found');
  return s.slice(0, a) + DEPTH_V6 + s.slice(b);
}

export const exampleKey = c => (c.id === 'gradient-descent' ? `gradient-descent#${c.n}` : c.id);

export function variantMessages(variant, card) {
  if (variant === 'V6') return [{ role: 'system', content: v6System() }, { role: 'user', content: userMessage(card) }];
  if (variant === 'V5') return [{ role: 'system', content: v5System() }, { role: 'user', content: userMessage(card) }];
  if (variant === 'V1') return [{ role: 'system', content: v1System() }, { role: 'user', content: userMessage(card) }];
  const sys = variant === 'V2' ? v2System() : v3System();
  const user = userMessage(card).replace('\n\nLabels of the card\'s visuals:', `\n\nThe card already used this example: ${CARD_EXAMPLE[exampleKey(card)]} Use a different example, or none.\n\nLabels of the card's visuals:`);
  if (user === userMessage(card)) throw new Error('example line not inserted');
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}
