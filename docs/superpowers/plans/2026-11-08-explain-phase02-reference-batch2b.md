# Phase 02 reference batch 2B implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent lanes or superpowers:executing-plans for inline execution. Steps use checkboxes for tracking.

**Goal:** Add the six approved worked Explanation references for Lessons 10–12 and publish them on the existing Phase 02 library branch.

**Architecture:** Register illustrative semantic JSON in the existing written Explanation author library. Render it with the existing `TutorDiagram.js` layouts and `teaching-theme.js` palette. The shared reference selector and SVG renderer already support this work.

**Tech stack:** Existing JavaScript reference registry, Node test runner, React SVG and KaTeX.

**Spec:** [Per-lesson coverage audit](../../features/explain-on-canvas/handoff/phase02-library/coverage-audit.md), rows 10–12 and the approved six-scene brief.

## Constraints

- Use the existing version-1 `{id, lessons, prompts, keywords, useWhen, spec}` record contract, comparison panels, visual transformation, teaching matrix, coordinate plot and bar chart where applicable.
- Guide the actual author with checked illustrative data and natural prompts. Keep the existing two-reference and 14,000-character limits.
- The integration lane owns the registry, author-request tests, exports, docs and feature-branch publication. Each independent lane owns its two files.

## Lanes and teaching contracts

### Lesson 10 · Repeated fits

Files: `packages/web/src/tutor-diagrams/ml-batch2b-fits-references.js` and `ml-batch2b-fits.test.mjs`.

- [x] Add `ml-repeated-sample-fits`. Three two-point training samples A = (0,1),(4,5), B = (0,3),(4,5), C = (0,2),(4,8) give three fitted lines. Show the samples and lines, their pointwise mean and their min–max envelope. At x = 4 the predictions are 5, 5, 8, mean 6, range 5–8. Identify the band as the observed range of these three fits.
- [x] Recompute the predictions from the sample coordinates, check the mean and envelope at every displayed x, and render compact and wide versions.

### Lesson 11 · Ensembles

Files: `packages/web/src/tutor-diagrams/ml-batch2b-ensembles-references.js` and `ml-batch2b-ensembles.test.mjs`.

- [x] Add `ml-soft-vote-probabilities`. Three models give (55%,45%), (55%,45%), (5%,95%) for classes A and B. A wins the hard vote 2–1, B wins the soft vote with 61.67% versus 38.33%. Show the equal-weight averages and decisions.
- [x] Add `ml-adaboost-weight-update`. Four initially equal weights, exactly one error, weighted error 1/4, binary AdaBoost coefficient ln(3)/2. After exponential reweighting and normalization, the missed example has weight 1/2 and each correct example 1/6. Preserve row identities and state the rounding if decimals appear.
- [x] Add `ml-stacking-oof-predictions`. Four rows, two held-out folds, two base learners. Show which rows fit each pair of models, which rows they predict, and the resulting meta-training matrix including targets. Every meta row appears once, and its prediction provenance excludes that row from the fit.
- [x] Independently check probabilities and decisions, weight normalization and OOF membership, then render the three specs at narrow and wide widths.

### Lesson 12 · Hyperparameter tuning

Files: `packages/web/src/tutor-diagrams/ml-batch2b-tuning-references.js` and `ml-batch2b-tuning.test.mjs`.

- [x] Add `ml-bayesian-acquisition-choice`. Use illustrative means (.70,.76,.73,.68), uncertainty (.02,.02,.10,.08) and UCB = mean + uncertainty. Scores (.72,.78,.83,.76) select the third candidate even though the second has the highest mean. Show the candidate identity and score comparison.
- [x] Add `ml-successive-halving-rounds`. Track A, B, C, D at cumulative budgets 1, 2, 4 epochs. First scores (.72,.69,.75,.60) advance C and A. At 2 epochs A=.80 and C=.78 advance A. At 4 epochs A=.85. Use a common validation metric, mark eliminated trials and distinguish cumulative from additional budget.
- [x] Recompute acquisition scores, stage survivors and incremental spend from the data, then render both specs at narrow and wide widths.

## Integration and verification

- [x] Register all six. In `packages/control-plane/test/explanation-reference-batch2b.test.js`, run the documented prompts and distinct paraphrases through `prepareArtifactAuthorRequest`. Confirm relevant specs, valid existing layouts and bounded reference context.
- [x] Run the affected diagram and author tests and the web build. Export the actual JSON/SVG gallery and inspect the six new scenes. Review math, readable labels and held-out provenance.
- [x] Update the coverage audit and Claude note, and add the batch handoff with the six live prompts and acceptance criteria. Keep the four other Batch 2 references and live generation acceptance pending.
- [x] Prepare the checked batch for publication on `chatgpt/explain-phase02-library`. The published commit and tree verification go in the delivery receipt.

## Review focus

The repeated-fit range comes from the displayed fits. Soft votes normalize per model. AdaBoost preserves total weight. Each OOF prediction comes from the correct held-out fit. UCB uses the stated uncertainty multiplier. Eliminated configurations receive no later scores or budget.

All 472 focused checks and the web build passed. The six new SVGs were statically inspected in the established teaching palette. [Verification and dev acceptance](../../features/explain-on-canvas/handoff/phase02-library/batch-2b.md)
