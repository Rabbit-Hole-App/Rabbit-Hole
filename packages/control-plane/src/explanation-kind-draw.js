// GEN-1 G4 (R3, not wired in yet): the card's diagram kind is drawn, weighted by the planner's kind probabilities. A pure function of its inputs: no I/O, nothing imported by production
// code until R3 wires it. Same seed, same draw, on every runtime (seededRandom is integer arithmetic).
//   1. start from the planner's kind probabilities (Brief drops BRIEF_NO_KINDS, as the planner's own rule does);
//   2. an on-topic reference adds 0.5 to its kind, 1.0 more when the prompt is one of its documented prompts verbatim (selectWithSteer's steer.exact);
//   3. renormalise; drop kinds under the 0.2 floor (none left: keep the top one); draw one with seededRandom(seed + ':kind'), weights as they stand.
// null (today's planning, no draw) when there is no seed, no usable probabilities, a learner-named kind (requiredKinds), or a plan that is not exactly one diagram (a picture plan or two visuals).
import { seededRandom } from '../../web/src/tutor-diagrams/random.js';
import { BRIEF_NO_KINDS } from './explanation-planner.js';

export const KIND_FLOOR = 0.2, ON_TOPIC_BONUS = 0.5, EXACT_BONUS = 1.0;

export function drawKind(probabilities, { seed, onTopicKind = null, exact = false, depth = null, requiredKinds = [], visuals = null } = {}) {
  if (!seed || requiredKinds?.length || (visuals && (visuals.length !== 1 || visuals[0]?.type !== 'diagram'))) return null;
  const weights = {};
  for (const [kind, p] of Object.entries(probabilities ?? {})) if (Number.isFinite(p) && p > 0 && !(depth === 'brief' && BRIEF_NO_KINDS.includes(kind))) weights[kind] = p;
  if (onTopicKind && !(depth === 'brief' && BRIEF_NO_KINDS.includes(onTopicKind))) weights[onTopicKind] = (weights[onTopicKind] ?? 0) + ON_TOPIC_BONUS + (exact ? EXACT_BONUS : 0);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const ranked = Object.entries(weights).map(([kind, w]) => [kind, w / sum]).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  const kept = ranked.filter(([, w]) => w >= KIND_FLOOR), final = kept.length ? kept : [ranked[0]];
  const total = final.reduce((a, [, w]) => a + w, 0);
  let r = seededRandom(`${seed}:kind`)() * total, drawn = final[final.length - 1][0];
  for (const [kind, w] of final) { if (r < w) { drawn = kind; break; } r -= w; }
  return { weights: Object.fromEntries(final), drawn };
}
