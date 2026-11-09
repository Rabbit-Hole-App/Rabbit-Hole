# Phase 02 reference batch 3A implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent lanes or superpowers:executing-plans for inline execution. Check off the verified steps below.

Add four worked time-series references for written `/explain`. Register them in the existing version-1 JSON author library. Use `TutorDiagram.js`, the teaching palette and current plot, matrix and comparison layouts. Keep the existing author-context bounds.

Task `9ad36277-5341-48f0-8b96-6569f8e1c381`. [Coverage audit](../../features/explain-on-canvas/handoff/phase02-library/coverage-audit.md)

## Lanes

| Lane | Records | Files in `packages/web/src/tutor-diagrams/` |
| --- | --- | --- |
| Series | `ml-time-series-additive-residuals`, `ml-rolling-mean-feature` | `ml-batch3a-series-references.js`, `ml-batch3a-series.test.mjs` |
| Correlation | `ml-acf-vs-pacf` | `ml-batch3a-correlation-references.js`, `ml-batch3a-correlation.test.mjs` |
| Forecast and integration | `ml-recursive-vs-direct-forecast` | `ml-batch3a-forecast-references.js`, `ml-batch3a-forecast.test.mjs`, registry, author tests, exports and handoff |

- [x] Extend the eight-day trend and seasonal series from `time-series-components` with residuals (.25, −.25, 0, .5, −.5, 0, .25, −.25). Show observed plus trend, seasonal values and residuals in aligned panels. At Day 4, 3.5 − 1 + .5 = 3. Verify the observed sum on every day.
- [x] Show the prior-three-day rolling feature for Days 4–7 from observations 10, 13, 16, 19, 22, 25 on Days 1–6. Show input days and values and means 13, 16, 19, 22. The current prediction day stays outside its feature window.
- [x] Compare ACF and PACF of one stationary AR(1) process with coefficient 0.6 and white-noise innovations. Display theoretical ACF (.6, .36, .216, .1296) and PACF (.6, 0, 0, 0) on the same lag and correlation domains. Compute lag-2 PACF as (.36 − .6²)/(1 − .6²) = 0.
- [x] Compare forecast Days 5–7 from the same observed origin, Day 4 value 6. The recursive +0.5 rule uses inputs 6, 6.5, 7 for outputs 6.5, 7, 7.5. The three direct models use the same observed input 6 with offsets .5, 1.2, 1.8, giving 6.5, 7.2, 7.8. Verify each input's provenance and arithmetic.

## Integration and publication

- [x] Register all four. Correct the older ACF-only reference's prompt and PACF keyword. Check natural prompts, distinct paraphrases and a PACF-only request through actual author-message preparation.
- [x] Run the focused diagram and author tests and web build. Export the complete JSON/SVG gallery and inspect the four new examples.
- [x] Update the coverage tracker and Claude handoff. Record Lesson 15 reference coverage and leave the 11 other Batch 3 examples and live acceptance separately tracked.
- [x] Prepare the checked commit for `chatgpt/explain-phase02-library`. Record the published commit and tree verification in the delivery receipt.

## Review focus

Additive values reconstruct each observation. Rolling windows use earlier dates only. The correlation curves use population values for the same process. Recursive inputs include earlier predictions, while direct inputs stay at the observed forecast origin.

All 504 focused checks and the web build passed. The four SVGs were inspected. [Verification and dev acceptance](../../features/explain-on-canvas/handoff/phase02-library/batch-3a.md#local-verification)
