# Phase 02 reference batch 2B · Bias, ensembles and tuning

The six written `/explain` references for Lessons 10–12 continue the [coverage plan](coverage-audit.md). They use the existing semantic JSON, SVG components and approved teaching palette. The author receives a relevant subset of these illustrative examples and uses the learner's source values when supplied.

Branch `chatgpt/explain-phase02-library` · task `11ac0b40-c766-4fff-872d-def27fddc8af`.

## Prompts and acceptance criteria

| Lesson | Learner question | Reference and expected evidence |
| --- | --- | --- |
| 10 | Why does fitting the same model on different samples give different predictions? | [Repeated sample fits](references/ml-repeated-sample-fits.svg) · [JSON](references/ml-repeated-sample-fits.json). Show the fitted lines from the displayed training samples. Use matching axes for the individual fits and their mean and observed range. At x = 4, predictions 5, 5 and 8 give mean 6 and range 5–8. |
| 11 | How can soft voting pick a different class from the majority vote? | [Soft voting](references/ml-soft-vote-probabilities.svg) · [JSON](references/ml-soft-vote-probabilities.json). Normalize each model's class probabilities. For (55%, 45%), (55%, 45%) and (5%, 95%), A wins the hard vote 2–1, while averaging the probabilities selects B at 61.67%. |
| 11 | What happens to the training weights after AdaBoost gets one example wrong? | [AdaBoost weight update](references/ml-adaboost-weight-update.svg) · [JSON](references/ml-adaboost-weight-update.json). Keep the same rows before and after. One miss among four equally weighted examples gives weighted error 1/4 and binary coefficient ln(3)/2. The normalized weights are 1/2 for the miss and 1/6 for each correct prediction. |
| 11 | Where do the out-of-fold predictions for the stacking model come from? | [Out-of-fold stacking](references/ml-stacking-oof-predictions.svg) · [JSON](references/ml-stacking-oof-predictions.json). Show which rows train each pair of base models and which rows they predict. Join each held-out row's two predictions and its target into a single meta-training row. |
| 12 | How does Bayesian optimization decide which setting to try next? | [Acquisition choice](references/ml-bayesian-acquisition-choice.svg) · [JSON](references/ml-bayesian-acquisition-choice.json). Show the surrogate mean, uncertainty and stated acquisition calculation per candidate. With UCB = mean + standard deviation, the third candidate's 0.83 wins despite the second candidate's higher mean. |
| 12 | How does successive halving decide which trials get more training? | [Successive halving](references/ml-successive-halving-rounds.svg) · [JSON](references/ml-successive-halving-rounds.json). Rank four trials at one epoch, keep A and C at two cumulative epochs, then advance A to four. Identify stopped trials and distinguish the cumulative limits from the extra training in each round. The resumed trials use eight epochs in total. |

The numbers specify the reference examples. Check a generated card's calculations on its own data and verify that it teaches the same mechanism.

## Sources and integration

- Audited English curriculum at `e7db050e64bde3be17a9381476f748da26d85692`. [Bias and variance](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/10-bias-variance/docs/en.md) · [Ensembles](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/11-ensemble-methods/docs/en.md) · [Tuning](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/12-hyperparameter-tuning/docs/en.md)
- Source records in `packages/web/src/tutor-diagrams/ml-batch2b-{fits,ensembles,tuning}-references.js`. The registry lives in `reference-library.js`. It feeds the existing author selector and [renderer gallery](references/index.html).
- The integration check uses `prepareArtifactAuthorRequest` in `packages/control-plane/test/explanation-reference-batch2b.test.js`. The math and fold/stage checks live beside their corresponding records. [Implementation plan](../../../../superpowers/plans/2026-11-08-explain-phase02-reference-batch2b.md)

Bring the delta after batch 2A commit `c629726824f14d521c189e340ca64310cf00ec95` into the active release if the earlier library is already integrated. Reconcile shared files using the [library handoff](README.md#integration-with-your-active-release).

## Dev acceptance

On the authorized dev clone, submit the six prompts through written `/explain`. Capture selected references, actual generated cards and any rejected candidates. Verify the content against the criteria above, then inspect labels, math, narrow-card fit and save/reopen. Push the result and update the tracker with the build and job evidence.

## Local verification

- **472 focused tests passed**, covering the arithmetic, fold membership, trial budgets, documented prompts and distinct paraphrases in actual author-request preparation. The registry checks exercise saved JSON and SVG rendering at 320, 408 and 720 px.
- The web build passed. The exporter produced 152 JSON/SVG pairs. Static inspection covered the six new scenes. The repeated-fit example uses two plots on matching axes to work within the existing three-series limit.
- The AdaBoost SVG contains the rendered KaTeX markup. The raster converter omits formula foreignObjects, so inspect their appearance in the dev card. The larger diagrams use the existing horizontal scrolling at narrow widths.
- `ponytail:` Live generation, browser appearance and generated-card save/reopen remain pending for the dev acceptance run.

The library handoff has the replay commands. [Focused local checks](README.md#focused-local-checks)

## Four remaining Batch 2 references

| Lesson | Work |
| --- | --- |
| 17 · Imbalanced data | Minority-class accuracy trap and majority undersampling. |
| 18 · Feature selection | Recursive feature elimination stages and retained subsets. |
| 20 · Monitoring and drift | PSI contributions per bin and the total. |
