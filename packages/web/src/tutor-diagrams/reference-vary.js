// VAR-1 step 4: the `vary` of the library's references, one entry per reference id (the format and rules are in vary.js; the lint is varyProblems). They live here, not in the
// ~40 reference files, so a round of step 4 is one reviewable diff. Bands are DISJOINT where an order is part of the lesson (a band's min is above the next band's max), so no order
// element is needed and a draw can never break the pattern the reference teaches. Every band contains the reference's value as written, so the written reference is one of the draws.
// Not varied on purpose: x grids (structure), fixed anchors (a perfect-calibration diagonal, lag 0, a declared grid), and any number the text types. The list of what was struck and
// why is checks/var-1/step-4-prep/LIST.md on film/evidence.
const at = (prefix, key, bands, first = 0) => Object.fromEntries(bands.map((band, i) => [`${prefix}.${i + first}.${key}`, band]));

// A bar series: `values.<i>` for each band, starting at value `first`.
const bars = (series, bands, first = 0) => Object.fromEntries(bands.map((band, i) => [`series.${series}.values.${i + first}`, band]));

export const referenceVary = Object.freeze({
  // Round 1 (references 1 to 6 of the step-4 list)
  'log-feature-scale': at('series.0.points', 'y', [[0.3, 0.9, 0.1], [1.0, 2.0, 0.1], [2.1, 3.0, 0.1], [3.1, 3.9, 0.1]]),
  'learning-curves': { // training rises, validation falls, validation stays above training at every size
    ...at('series.0.points', 'y', [[0.03, 0.08, 0.01], [0.09, 0.11, 0.01], [0.12, 0.15, 0.01], [0.16, 0.19, 0.01]]),
    ...at('series.1.points', 'y', [[0.40, 0.48, 0.01], [0.28, 0.36, 0.01], [0.22, 0.26, 0.01], [0.20, 0.21, 0.01]]),
  },
  'search-grid-and-random': at('series.1.points', 'x', [[0.02, 0.06, 0.01], [0.10, 0.30, 0.02], [0.5, 1.2, 0.1], [2, 4, 0.2], [6, 12, 1], [25, 60, 5]]), // the grid and every depth stay as written
  'probability-calibration': at('series.0.points', 'y', [[0.02, 0.08, 0.01], [0.12, 0.26, 0.01], [0.30, 0.46, 0.01], [0.50, 0.66, 0.01], [0.70, 0.86, 0.01]]), // the diagonal stays; bins stay below it
  'acf-pacf-stems': at('series.0.points', 'y', [[0.60, 0.80, 0.05], [0.35, 0.55, 0.05], [0.10, 0.30, 0.05], [-0.20, -0.05, 0.05], [-0.40, -0.25, 0.05], [-0.25, -0.05, 0.05]], 1), // lag 0 stays 1; lags 4 and 5 stay negative and apart (a zero stem is no sign change)
  'ml-stable-diffusion-encoder-evaluation': { // two step lines, each x non-decreasing by disjoint bands (the depth variants share these paths)
    ...Object.fromEntries([
      [0, [[0.25, 0.32], [0.42, 0.50], [0.52, 0.60], [0.60, 0.68]], [[0.45, 0.52], [0.28, 0.34], [0.27, 0.33], [0.31, 0.37]]],
      [1, [[0.33, 0.40], [0.52, 0.58], [0.63, 0.69], [0.71, 0.77]], [[0.40, 0.46], [0.21, 0.27], [0.17, 0.23], [0.23, 0.29]]],
    ].flatMap(([s, xs, ys]) => xs.flatMap(([min, max], i) => [[`series.${s}.points.${i}.x`, [min, max, 0.01]], [`series.${s}.points.${i}.y`, [ys[i][0], ys[i][1], 0.01]]]))),
  },
  // Round 2 (references 8, 10, 11, 18, 19, 20 of the step-4 list). The depth variants of the three d2l plots share these paths; each level draws its own values.
  'd2l-dropout-validation-metrics': { // loss falls by disjoint bands; accuracy rises to the two equal last values, which stay as written (an equality vary cannot hold)
    ...at('series.0.points', 'y', [[0.90, 1.00, 0.01], [0.66, 0.74, 0.01], [0.52, 0.60, 0.01], [0.45, 0.49, 0.01], [0.40, 0.44, 0.01]]),
    ...at('series.1.points', 'y', [[0.38, 0.46, 0.01], [0.60, 0.67, 0.01], [0.69, 0.75, 0.01]]),
  },
  'd2l-cnn-loss-and-accuracy': { // epochs 1 and 2 are the early plateau and stay; epochs 3 to 6 fall by disjoint bands and held-out stays above training at each epoch
    ...at('series.0.points', 'y', [[2.0, 2.3, 0.1], [1.3, 1.6, 0.1], [0.8, 1.0, 0.1], [0.5, 0.7, 0.1]], 2),
    ...at('series.1.points', 'y', [[2.4, 2.6, 0.1], [1.7, 1.9, 0.1], [1.1, 1.3, 0.1], [0.8, 1.0, 0.1]], 2),
  },
  'd2l-lag-regression-training-loss': { // training falls then levels; validation stays above training; the last two validation epochs overlap on purpose (leveling off)
    ...at('series.0.points', 'y', [[2.9, 3.3, 0.1], [1.5, 1.9, 0.1], [0.8, 1.1, 0.1], [0.62, 0.75, 0.01], [0.57, 0.61, 0.01], [0.50, 0.56, 0.01]]),
    ...at('series.1.points', 'y', [[3.4, 3.8, 0.1], [2.0, 2.4, 0.1], [1.25, 1.5, 0.05], [1.05, 1.2, 0.05], [1.05, 1.12, 0.01], [1.05, 1.12, 0.01]]),
  },
  'ensemble-votes': { // whole hard votes (class C stays 1); the winner stays class A in both series; weighted <= hard for all three classes (class B weighted 1.2 to 1.8 against 2 or 3 hard votes; the reference's written 1.5 is REF-1, 510ad71a4)
    ...bars(0, [[4, 5, 1], [2, 3, 1]]),
    ...bars(1, [[3.0, 3.6, 0.1], [1.2, 1.8, 0.1]]),
    ...bars(1, [[0.6, 1.0, 0.1]], 2),
  },
  'bias-variance-decomposition': { // noise stays constant; bias falls and variance rises by disjoint bands, so the total stays U-shaped (low >= 10, medium <= 8, high >= 9)
    ...bars(0, [[7, 9, 1], [2, 3, 1]]),
    ...bars(1, [[2, 3, 1], [6, 8, 1]], 1),
  },
  'boosting-signed-corrections': { // the initial prediction stays; each correction keeps its sign (the lesson is positive and negative stacks starting independently); the second correction is never larger in magnitude than the first, per sample (bands: A |first| >= 1 >= |second|, B |first| >= 1 > |second|, C |first| >= 0.5 = max |second|)
    ...bars(1, [[1, 3, 0.5], [-2, -1, 0.5], [0.5, 1, 0.25]]),
    ...bars(2, [[-1, -0.25, 0.25], [-0.75, -0.25, 0.25], [0.25, 0.5, 0.25]]),
  },
  // Round 3 (references 22 to 24 of the step-4 list)
  'class-weighted-loss': bars(1, [[2, 6, 1]], 1), // only the rare class's weighted loss (its weight times 1); the equal raw losses and the common class's weighted 1 stay
  'permutation-feature-importance': { // each shuffle scores A > B > C by disjoint bands; C stays near zero (one slightly negative is part of the lesson)
    ...bars(0, [[0.15, 0.22, 0.01], [0.05, 0.09, 0.01], [-0.02, 0.01, 0.01]]),
    ...bars(1, [[0.14, 0.20, 0.01], [0.03, 0.08, 0.01], [-0.01, 0.02, 0.01]]),
  },
  'feature-selection-stability': { // selection fractions stay in [0, 1] and ranked A > B > C under both selectors, by disjoint bands
    ...bars(0, [[0.85, 1.0, 0.05], [0.55, 0.75, 0.05], [0.10, 0.30, 0.05]]),
    ...bars(1, [[0.85, 1.0, 0.05], [0.55, 0.75, 0.05], [0.10, 0.30, 0.05]]),
  },
});
