# Phase 02 reference batch 2C implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent lanes or superpowers:executing-plans for inline execution. Track each verified step below.

Add the four approved written Explanation examples for Lessons 17, 18 and 20. Register their version-1 semantic JSON in the current author library and render with the existing `TutorDiagram.js` layouts and `teaching-theme.js` palette. Keep the two-reference and 14,000-character author-context limits.

Task `4141a2ad-5e5d-4275-a40c-d1a1592be356`. [Coverage audit](../../features/explain-on-canvas/handoff/phase02-library/coverage-audit.md)

## Independent reference lanes

| Lane | Record IDs | Owned files in `packages/web/src/tutor-diagrams/` |
| --- | --- | --- |
| Imbalanced data | `ml-minority-accuracy-trap`, `ml-majority-undersampling` | `ml-batch2c-imbalance-references.js`, `ml-batch2c-imbalance.test.mjs` |
| Feature elimination | `ml-recursive-feature-elimination` | `ml-batch2c-elimination-references.js`, `ml-batch2c-elimination.test.mjs` |
| Drift and integration | `ml-psi-bin-contributions` | `ml-batch2c-psi-references.js`, `ml-batch2c-psi.test.mjs`, registry, author tests, exports and handoff |

- [x] Show the accuracy trap with 95 actual majority cases and five actual minority cases, all predicted majority. Use the confusion counts to derive 95/100 accuracy and 0/5 minority recall. Label actual and predicted axes and highlight the five misses.
- [x] Show majority undersampling on six majority and two minority training rows. Keep two identified majority rows and both minority rows. Use the existing sample-set and exact omitted complement. The training set changes from 6:2 to 2:2.
- [x] Show recursive feature elimination with an illustrative linear-model importance trace on scaled features. At four features, scores A=.80, B=.60, C=.30, D=.10 remove D. After refitting, A=.75, B=.22, C=.40 remove B. Refit A and C at the target size two. The learner can trace the B/C ranking reversal and see removed features stay removed.
- [x] Show PSI on the shared bins of `aligned-distribution-drift`. Reference shares (.10,.40,.40,.10) and current shares (.05,.15,.40,.40) give contributions (.0347,.2452,.0000,.4159), rounded to four places. Use natural logs and sum the full-precision terms to display .6958. Retain exact interval boundaries and positive shares.
- [x] Verify the arithmetic, stable row IDs, refit order and exact bin alignment independently against the rendered specs.

## Integration and publication

- [x] Register all four and remove the undersampling keyword from the oversampling-only reference. In `explanation-reference-batch2c.test.js`, check natural prompts, distinct paraphrases and an undersampling-only query through actual author-message preparation.
- [x] Run focused diagram and author checks and the web build. Export the JSON/SVG gallery and inspect the four new scenes.
- [x] Update the coverage tracker and Claude handoff. Mark all 16 Batch 2 references built and keep live generation and browser acceptance separately tracked.
- [x] Prepare the checked commit for `chatgpt/explain-phase02-library`. Record remote commit and tree verification in the delivery receipt.

## Review focus

Accuracy and recall use different populations. Undersampling retains labels and uses the exact complement of removed rows. RFE ranks after each refit. PSI uses identical boundaries and shares summing to one, with the largest contribution visible.

The 488 focused checks and web build passed. The four SVGs were inspected. The composition schema's diagram-only links were added to the existing test inventory after a wider check flagged that file. The inventory and runtime checks passed in isolation. [Verification and dev acceptance](../../features/explain-on-canvas/handoff/phase02-library/batch-2c.md#local-verification)
