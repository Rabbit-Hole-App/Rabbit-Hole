// VAR-1 step 4: the `vary` of the library's references, one entry per reference id (the format and rules are in vary.js; the lint is varyProblems). They live here, not in the
// ~40 reference files, so a round of step 4 is one reviewable diff. Bands are DISJOINT where an order is part of the lesson (a band's min is above the next band's max), so no order
// element is needed and a draw can never break the pattern the reference teaches. Every band contains the reference's value as written, so the written reference is one of the draws.
// Not varied on purpose: x grids (structure), fixed anchors (a perfect-calibration diagonal, lag 0, a declared grid), and any number the text types. The list of what was struck and
// why is checks/var-1/step-4-prep/LIST.md on film/evidence.
const at = (prefix, key, bands, first = 0) => Object.fromEntries(bands.map((band, i) => [`${prefix}.${i + first}.${key}`, band]));

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
});
