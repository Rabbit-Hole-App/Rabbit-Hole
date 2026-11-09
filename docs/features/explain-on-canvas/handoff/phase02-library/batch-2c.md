# Phase 02 reference batch 2C · Imbalance, feature selection and drift

The four written `/explain` references complete the 16-example Batch 2 queue. They use the existing semantic JSON, SVG components and teaching palette. Use the example values for a toy demonstration or recompute from the learner's source data.

Branch `chatgpt/explain-phase02-library` · task `4141a2ad-5e5d-4275-a40c-d1a1592be356`.

## Prompts and acceptance criteria

| Lesson | Learner question | Reference and expected evidence |
| --- | --- | --- |
| 17 | How can a classifier get 95% accuracy and still miss every minority case? | [Accuracy trap](references/ml-minority-accuracy-trap.svg) · [JSON](references/ml-minority-accuracy-trap.json). Label actual and predicted classes. All 100 predictions choose the majority class, so 95/100 are correct overall and 0/5 minority cases are found. Highlight the five misses. |
| 17 | What does majority undersampling actually remove from the training set? | [Majority undersampling](references/ml-majority-undersampling.svg) · [JSON](references/ml-majority-undersampling.json). Show the six majority and two minority rows before sampling. Keep two identified majority rows and both minority rows. List the four omitted IDs, with each kept row retaining its label. |
| 18 | Why does recursive feature elimination refit after each drop? | [Recursive feature elimination](references/ml-recursive-feature-elimination.svg) · [JSON](references/ml-recursive-feature-elimination.json). Rank scaled features by absolute fitted coefficients, remove D, refit on A/B/C, and show C overtaking B. Remove B and refit A/C at the target size of two. |
| 20 | How do I calculate the population stability index one bin at a time? | [PSI contributions](references/ml-psi-bin-contributions.svg) · [JSON](references/ml-psi-bin-contributions.json). Match reference and current shares to the same bin boundaries. Compute one natural-log term per bin and sum full-precision terms. The unchanged bin contributes zero and the last bin contributes the most, 0.4159 of the 0.6958 total. |

## Sources and integration

- The English curriculum at `e7db050e64bde3be17a9381476f748da26d85692` supplies the three topics. [Imbalanced data](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/17-imbalanced-data/docs/en.md) · [Feature selection](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/18-feature-selection/docs/en.md) · [Monitoring and drift](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/20-model-monitoring-and-drift/docs/en.md)
- The records live in `packages/web/src/tutor-diagrams/ml-batch2c-{imbalance,elimination,psi}-references.js`. `reference-library.js` feeds the author selector and the gallery. [SVG gallery](references/index.html)
- The PSI example extends the existing shared bins and shares in `aligned-distribution-drift`. The undersampling keyword moved from the oversampling-only record to the new majority-removal example. Author-request checks cover that query as well as the four prompts and distinct paraphrases. [Implementation plan](../../../../superpowers/plans/2026-11-08-explain-phase02-reference-batch2c.md)

Bring over the delta after Batch 2B commit `7988753b25ea0714dfe50766e42634d4950660bc` if the earlier library is already integrated. Reconcile shared files using the library handoff. [Integration notes](README.md#integration-with-your-active-release)

## Dev acceptance

Submit the four prompts through written `/explain` on the authorized dev clone. Also try `Explain undersampling.` Confirm that the author gets the majority-removal example. Inspect the generated diagrams and verify the card's own numbers, row memberships, refit order and bin boundaries. Check formulas, narrow-card appearance and save/reopen. Record accepted and rejected results with the build and job evidence, then push the tracker update.

## Local verification

- **488 focused tests passed**, including actual author-request preparation, the undersampling selection regression, the worked calculations, sample membership and refit order. The reference registry passed saved-JSON and SVG checks at 320, 408 and 720 px.
- The web build passed and the gallery exported all **156 JSON/SVG pairs**. Static inspection covered all four new references. The PSI SVG contains KaTeX markup, and its formula appearance is part of dev browser acceptance.
- An optional package-wide unit run was interrupted after dependency and test failures. The runtime check passed in isolation. The board-link inventory check passed after adding the existing composition schema's diagram-only transformation fields to the exact-file inventory.
- `ponytail:` Live generation, browser appearance and generated-card save/reopen remain pending.

The library handoff has the replay commands. [Focused local checks](README.md#focused-local-checks)

## Next reference work

Batch 3A covers the four time-series references. The coverage audit tracks the remaining anomaly detection, ML system design and feature-store examples. [Batch 3A](batch-3a.md) · [Coverage audit](coverage-audit.md#recommended-build-order)
