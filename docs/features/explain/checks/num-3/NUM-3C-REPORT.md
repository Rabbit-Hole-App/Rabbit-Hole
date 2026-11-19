# NUM-3c: softmax in a grouped bar chart (feat/num-3c 397a45028, branched from feat/num-3a 69e006eb5, so it contains NUM-3a and NUM-3c; pushed normally)

The lead wrote this from the lane agent's text. Files: derived.js, ml-plot-spec.js, derived.test.mjs, spec.test.mjs. Release 165 carries NUM-3a and NUM-3c as separate commits.

## The rule
A grouped bar chart with exactly two series, one labelled logit or score and one labelled probability, where the title, caption or a series label says softmax or "exponential and normalize", is recomputed like the transformation rule: it calls NUM-3a's `softmaxInstance` on the two series (same word test, same switch-off words: temperature, scaled, masked, log; half a unit of the written decimals; the rounding clause), arithmetic-tagged on the probability series, which is only checked, never rewritten. Series order does not matter. One new `DERIVED_ROWS` entry; `ml-plot-spec.js` now calls `checkDerived` for bar charts. A series is read at the most decimals any of its values shows (JSON turns 0.10 into 0.1). Switched-off wordings stay with NUM-2's distribution rule.

## Bench card
"Scores to probabilities via Softmax" (GEN-1 R2 bench, AFTER arm, seed 2; series 'Raw score' [3, 1, 0.5] and 'Probability' [0.79, 0.11, 0.1]) is accepted on main and rejected on this branch: "softmax(3, 1, 0.5) = 0.82, 0.11, 0.07, not 0.79, 0.11, 0.10", tagged arithmetic. The true values 0.82 / 0.11 / 0.07 pass.

## False positives: 0
Corpus: 75 distinct grouped bar charts (library, gallery, VAR-1, R1 and R2 benches, section-6 and 6b, the R3-pre PLAN arm); 74 have two series, 21 of those mention softmax; the rule applies to 2, both saved cards, both with the real softmax shape, both rejected, both real errors (the second: a section-6b card with logits [-1, 0.5, 2] and probabilities [0.03, 0.15, 0.82], true about 0.04 / 0.18 / 0.79). No other diagram's parse result changed between main and the branch.

## References pass
All softmax references parse: softmax-probabilities (grouped bars, 'Input A / Input B', the rule does not apply), ml-transformer-vocabulary-softmax, ml-logistic-regression-softmax (panels), ml-transformer-attention-softmax, ml-word2vec-full-softmax-training-loop, d2l-softmax-affine-class-scores, d2l-softmax-shift-for-stability. `ml-logistic-regression-softmax-single` (a grouped single-diagram variant) passes with all 43 single variants. The library on this base is 470 references (Codex's pool is not on main yet); all 10 grouped bar variants parse.

## Tests, 0 fail
tutor-diagrams directory 1414 of 1414 (a new test with 10 assertions; the table-closed test now lists `bar-chart`); control plane: explanation-validation, explanation-diagram-kinds, explanation-diagram-corrections, explanation-prose-numbers, explanation-fast-chain, learn-artifact. svg-snapshots.json untouched; the 470 request hashes and the 474-row replay identical to the baselines. Not checked: the full web and control-plane suites beyond these files; any live card. Scan script: C:/s/gen1-prep/num3c-scan.mjs.
