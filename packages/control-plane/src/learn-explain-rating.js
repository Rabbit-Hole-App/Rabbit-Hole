// packages/control-plane/src/learn-explain-rating.js
// The Explain-back rating out of 10 (plan 2026-10-30-explain-back.md sections 7H and EB-08.1). Pure: no store, no model.
//   rateAttempt({criteria, observations, rubricVersion}) -> Rating
//   ratingsComparable(a, b) -> {comparable, reason}
//
// The rating summarizes one assessment's validated criterion judgements; it is never a model's own number.
//   * Credit per criterion: met = 1, partial = 0.5, not_met = 0. A criterion that requires reasoning earns at most its
//     reasoning credit (supported = 1, partial = 0.5, missing = 0).
//   * Weights: equal (1) unless the versioned rubric defines one on the criterion. A weight must be a finite number > 0.
//   * score = round(10 x sum(weight x credit) / sum(weight)) over the scored criteria.
//   * Any required criterion below full credit caps the score at 9: 10/10 needs every required criterion met.
//   * A scored criterion that could not be judged (unclear, an unresolved conflict, not returned, a reasoning value that
//     contradicts the criterion) makes the attempt unrated, with the reason and the criteria. Unknown is never 0.
//   * Unscored criteria (scored: false) are reported but never enter the denominator, and their state never unrates.
// Criterion fields read: criterionId, version, weight?, required? (default true), scored? (default true), requiresReasoning?.

export const RATING_CALCULATION = 'eb-rating-v1';
export const RATING_OUT_OF = 10;
const FIT_CREDIT = { met: 1, partial: 0.5, not_met: 0 };
const REASONING_CREDIT = { supported: 1, partial: 0.5, missing: 0 };

const keyOf = (id, version) => `${id}@${version}`;

// One criterion's credit, or a reason it has none.
function creditOf(criterion, observation) {
  if (!observation) return { reason: 'not_assessed' };
  if (observation.conflict === true) return { reason: 'conflict' };
  if (!Object.hasOwn(FIT_CREDIT, observation.fit)) return { reason: 'fit_unclear' };
  const fit = FIT_CREDIT[observation.fit];
  if (!criterion.requiresReasoning) return { credit: fit };
  if (!Object.hasOwn(REASONING_CREDIT, observation.reasoning)) return { reason: 'reasoning_unclear' };
  return { credit: Math.min(fit, REASONING_CREDIT[observation.reasoning]) };
}

/**
 * Rate one assessed attempt. observations are that assessment's own (one per criterion version).
 * @returns {{status: 'rated', score: number, outOf: 10, capped: boolean, calculationVersion: string, rubricVersion: string|null, criteria: object[]}
 *   | {status: 'unrated', reason: string, outOf: 10, calculationVersion: string, rubricVersion: string|null, criteria: object[], unknown?: object[]}}
 */
export function rateAttempt({ criteria, observations = [], rubricVersion = null }) {
  const base = { outOf: RATING_OUT_OF, calculationVersion: RATING_CALCULATION, rubricVersion: rubricVersion ?? null };
  const unrated = (reason, extra = {}) => ({ status: 'unrated', reason, ...base, criteria: [], ...extra });
  if (!Array.isArray(criteria)) return unrated('no_scored_criteria');
  const scored = criteria.filter(c => c?.scored !== false);
  if (!scored.length) return unrated('no_scored_criteria');
  for (const c of scored) {
    if (c.weight !== undefined && !(typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight > 0)) return unrated('invalid_weight', { criterion: { criterionId: c.criterionId, version: c.version } });
  }
  const byKey = new Map();
  for (const o of observations) {
    const key = keyOf(o?.criterionId, o?.criterionVersion);
    if (byKey.has(key)) return unrated('duplicate_judgement', { criterion: { criterionId: o.criterionId, version: o.criterionVersion } });
    byKey.set(key, o);
  }
  const rows = scored.map(c => {
    const got = creditOf(c, byKey.get(keyOf(c.criterionId, c.version)));
    return { criterionId: c.criterionId, version: c.version, weight: c.weight ?? 1, required: c.required !== false, credit: got.credit ?? null, ...(got.reason ? { reason: got.reason } : {}) };
  });
  const unknown = rows.filter(r => r.credit == null).map(({ criterionId, version, reason }) => ({ criterionId, version, reason }));
  if (unknown.length) return unrated('criteria_unassessed', { criteria: rows, unknown });
  const total = rows.reduce((s, r) => s + r.weight, 0);
  const earned = rows.reduce((s, r) => s + r.weight * r.credit, 0);
  const raw = Math.round((RATING_OUT_OF * earned) / total);
  const short = rows.some(r => r.required && r.credit < 1);
  const score = short ? Math.min(raw, RATING_OUT_OF - 1) : raw;
  if (!Number.isSafeInteger(score) || score < 0 || score > RATING_OUT_OF) return unrated('invalid_score');
  return { status: 'rated', score, ...base, capped: short && raw > score, criteria: rows };
}

// The comparable identity of a rating: calculation, rubric and the scored criterion set with their weights and roles.
const signature = r => JSON.stringify([r.calculationVersion, r.rubricVersion ?? null,
  (r.criteria || []).map(c => [c.criterionId, c.version, c.weight, c.required]).sort((x, y) => String(x[0]).localeCompare(String(y[0])))]);

/** Whether two ratings can be shown as a numeric change. Both must be rated under the same calculation, rubric and criteria. */
export function ratingsComparable(previous, current) {
  if (previous?.status !== 'rated' || current?.status !== 'rated') return { comparable: false, reason: 'not_rated' };
  if (previous.calculationVersion !== current.calculationVersion) return { comparable: false, reason: 'calculation_changed' };
  if ((previous.rubricVersion ?? null) !== (current.rubricVersion ?? null)) return { comparable: false, reason: 'rubric_changed' };
  if (signature(previous) !== signature(current)) return { comparable: false, reason: 'criteria_changed' };
  return { comparable: true, reason: null };
}
