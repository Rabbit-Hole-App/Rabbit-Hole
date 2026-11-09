# Phase 02 reference batch 3A · Time series

The four written `/explain` examples fill the Lesson 15 gaps in the reference audit. They use the existing semantic JSON, SVG components and teaching palette. Recompute the worked examples from the learner's data when it is supplied.

Branch `chatgpt/explain-phase02-library` · task `9ad36277-5341-48f0-8b96-6569f8e1c381`.

## Prompts and acceptance criteria

| Learner question | Reference and expected evidence |
| --- | --- |
| How do trend, seasonality and residuals add up to the original time series? | [Additive components and residuals](references/ml-time-series-additive-residuals.svg) · [JSON](references/ml-time-series-additive-residuals.json). Show observed values and all three aligned components. Reconstruct every observation from its own date, including Day 4 with 3.5 − 1 + 0.5 = 3. |
| What is the difference between ACF and PACF for the same series? | [ACF versus PACF](references/ml-acf-vs-pacf.svg) · [JSON](references/ml-acf-vs-pacf.json). Use matched axes and the same AR(1) process. Show the theoretical autocorrelations .6, .36, .216 and .1296. PACF is .6 at lag one and zero at subsequent lags. Work through lag two using (.36 − .6²)/(1 − .6²) = 0. |
| Which past values go into a three-day rolling average before a prediction? | [Rolling mean feature](references/ml-rolling-mean-feature.svg) · [JSON](references/ml-rolling-mean-feature.json). Match each target date to the preceding three observations and show the mean. In this example, Days 4–7 use means 13, 16, 19 and 22. The input dates all precede their prediction dates. |
| How are recursive and direct multi-step forecasts different? | [Recursive versus direct forecasting](references/ml-recursive-vs-direct-forecast.svg) · [JSON](references/ml-recursive-vs-direct-forecast.json). Start both methods at Day 4 with observed value 6. The recursive rule produces 6.5, 7 and 7.5 by feeding each forecast into the next step. The direct models each use the observed 6 and produce 6.5, 7.2 and 7.8. |

## Sources and integration

- Lesson 15 anchors the time-series topics. The examples use illustrative data. [English curriculum at the audited revision](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/15-time-series/docs/en.md)
- The records are in `packages/web/src/tutor-diagrams/ml-batch3a-{series,correlation,forecast}-references.js`. The author and exporter share `reference-library.js`. The old `acf-pacf-stems` ID is retained with an ACF-only prompt and keywords. The worked ACF/PACF comparison serves PACF questions. [SVG gallery](references/index.html) · [Implementation plan](../../../../superpowers/plans/2026-11-08-explain-phase02-reference-batch3a.md)

Bring over the delta after Batch 2C commit `f906dc29d924b9db97a3b7ddb369f54a4c271e9e` if the earlier library is already integrated. Reconcile shared files using the library handoff. [Integration notes](README.md#integration-with-your-active-release)

## Dev acceptance

Submit the four prompts through written `/explain` on the authorized dev clone. Also try `Explain PACF.` Check that the author receives the comparison reference with actual partial autocorrelations. Inspect the generated date and lag alignment, residual reconstruction, rolling input windows and forecast dependencies. Check formulas, narrow-card appearance and save/reopen. Record accepted and rejected results with build and job evidence, then push the tracker update.

## Local verification

- **504 focused tests passed**, covering all four examples, their natural prompts and distinct paraphrases, the PACF selection regression, and saved JSON and real SVG rendering at 320, 408 and 720 px.
- The web build passed. The gallery exported **160 JSON/SVG pairs**. Static inspection covered the four new references, including the aligned Day 4 guides and visible PACF zero markers. The plot comparisons use the existing horizontal scroll below their 444 px intrinsic width.
- The correlation SVG contains the worked KaTeX formula. Formula appearance, live generation and generated-card save/reopen remain pending in dev. `ponytail:` Capture those results in the live acceptance tracker.

The library handoff has the replay commands. [Focused local checks](README.md#focused-local-checks)

## Next reference work

Batch 3B covers anomaly detection. The remaining Batch 3 gaps are in ML system design and feature stores. [Batch 3B](batch-3b.md) · [Coverage audit](coverage-audit.md#recommended-build-order)
