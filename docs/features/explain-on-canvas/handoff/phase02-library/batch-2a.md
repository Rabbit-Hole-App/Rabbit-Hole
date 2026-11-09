# Phase 02 reference batch 2A — feature engineering and evaluation

Branch: `chatgpt/explain-phase02-library`. Task: `a56efb9e-e063-469a-b6e7-f68e7b828350`. This is the first **six of the sixteen** references in batch 2: four for lesson 08 and two for lesson 09.

These written `/explain` author references reuse the existing semantic JSON, SVG components and approved teaching palette. They add no renderer kind or card controls. The reference data is illustrative; generated cards must use their own source values correctly.

## Learner requests and visible evidence

| Lesson | Natural request | Reference and acceptance target |
| --- | --- | --- |
| 08 | How can ordered categories be represented by numbers? | [Ordinal encoding](references/ml-ordinal-encoding.svg) · [JSON](references/ml-ordinal-encoding.json). A declared meaningful order, its numeric codebook and consistent encoded observations. Rank codes do not prove equal measured gaps between categories. |
| 08 | Which bucket does a number on a bin edge belong to? | [Value binning](references/ml-value-binning.svg) · [JSON](references/ml-value-binning.json). Every raw value has an explicit bin, including internal and final boundary cases. Counts agree with memberships; the interval convention is stated. |
| 08 | Why add a feature that multiplies two inputs? | [Feature interaction](references/ml-feature-interaction.svg) · [JSON](references/ml-feature-interaction.json). Both original inputs remain visible, the product is computed per row, and the example explains why one feature changes the effect of another. |
| 08 | What happens to a skewed distribution when we take logs? | [Raw and log distributions](references/ml-raw-log-distributions.svg) · [JSON](references/ml-raw-log-distributions.json). Matched histograms and paired raw/transformed values for the same eight observations. The transform, valid domain and each histogram's bins are explicit. |
| 09 | Why do precision and recall divide by different totals? | [Confusion-matrix denominators](references/ml-confusion-denominators.svg) · [JSON](references/ml-confusion-denominators.json). Existing actual/predicted counts give precision 80/90, recall 80/100 and specificity 90/100. The explanation identifies each denominator's population. |
| 09 | Why is RMSE bigger than MAE when one prediction is far off? | [Regression error metrics](references/ml-regression-error-metrics.svg) · [JSON](references/ml-regression-error-metrics.json). One shared residual set is 1, −1, 1, 3. Absolute errors total 6; squares total 12; MAE is 1.5, MSE is 3 and RMSE is approximately 1.732. |

These are actual renderer exports, not live-model outputs. The generated card may choose different example values. Evaluate its calculations and teaching mechanism rather than requiring these particular numbers.

## Exact sources and integration

- [Phase 02 English lessons at the audited revision](https://github.com/rohitg00/ai-engineering-from-scratch/tree/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals), especially lessons 08–09.
- [Coverage audit](coverage-audit.md) and [batch plan](../../../../superpowers/plans/2026-11-09-explain-phase02-reference-batch2a.md).
- Records: `packages/web/src/tutor-diagrams/ml-batch2a-{encoding,transform,evaluation}-references.js`; independent checks: the corresponding `ml-batch2a-*.test.mjs` files.
- Registry: `packages/web/src/tutor-diagrams/reference-library.js`. It supplies both the author selector and exported gallery.
- Existing selector: `packages/control-plane/src/explanation-references.js`; actual author-message tests: `packages/control-plane/test/explanation-reference-batch2a.test.js`. Documented prompts and distinct paraphrases are checked separately.
- Existing schema, renderer and palette: `packages/web/src/tutor-diagrams/spec.js`, `TutorDiagram.js`, `teaching-theme.js`.

Integrate using [the library handoff](README.md#integration-with-your-active-release). Preserve Claude's newer binary-tree rules and three-visual work; bring over only the new delta if the previous library and batch 1 are already integrated. Author examples guide the model; they are not hardcoded cards substituted for generation.

### Required-kind selection correction

The real author-message check exposed a pre-existing mismatch: asking explicitly for histograms filtered out `ml-raw-log-distributions` because its outer kind is `comparison`. Selection now supplies its two matching histogram panels as standalone, schema-valid examples, with distinct part IDs and the parent reference ID retained in selection diagnostics. The same rule supports matching leaves in existing visual transformations. Ordinary conceptual requests still receive the complete composition; the two-example/14,000-character limit and strict server kind validation are unchanged. No router, model, budget, schema or renderer change was needed.

## Focused checks and Claude's dev acceptance

```sh
node --test packages/web/src/tutor-diagrams/*.test.mjs packages/control-plane/test/explanation-reference-batch*.test.js packages/control-plane/test/explanation-references.test.js packages/control-plane/test/explanation-diagram-kinds.test.js packages/control-plane/test/explanation-visuals.test.js packages/control-plane/test/explanation-validation.test.js packages/control-plane/test/learn-artifact.test.js
npm run build --workspace=packages/web
node packages/web/scripts/export-explanation-references.mjs
```

Deploy the matching backend and reader to the authorized dev clone. Run the six questions above through actual written `/explain`, preserving request context and generated JSON. Check source fidelity, chosen visual, arithmetic, boundary conventions, labels, formula appearance, narrow-card scrolling and save/reopen. Keep rejected outputs separate. Do not seed the reference JSON and count that as a live generation pass.

Also run: **Show two histograms comparing raw and log-transformed values.** Confirm the author receives the relevant histogram leaf specs and the saved response satisfies the unchanged required-kind check. Retain the existing binary-operation and ordinary-hierarchy negative controls when reconciling the selector with the active release.

Local arithmetic/schema/render tests and scripted author preparation do not establish live model selection or generated-card browser acceptance. No broad CI or production release is needed for this reference-content handoff.

## Local execution receipt — 2026-11-09

- **452/452 focused tests passed**, zero failed or skipped. This includes all registered references through the real SVG renderer at 320, 408 and 720 px, independent arithmetic for these six datasets, documented prompts and distinct paraphrases through actual author-message preparation, and strict-kind excerpt regressions.
- Web build passed, with its existing bundle-size warning. No broad CI was run.
- Exported all **146 JSON/SVG pairs** and refreshed the self-contained gallery. Statically inspected all six new scenes: table values, histogram bins and plot geometry remain readable in the established palette. The raster converter omits KaTeX foreignObjects; these images do not establish browser formula appearance. The SVGs retain the actual KaTeX markup and existing renderer behavior.
- Independent review found no critical or important defects. Its additional 124 whole/excerpt selections passed schema, kind, uniqueness and context-bound checks; folder and binary-tree controls retained the expected references.
- No model call or deployment was performed. Live generation, browser formula rendering and generated-card save/reopen remain pending in Claude's authorized dev environment.

## Remaining batch-2 work

After this six-reference delivery, ten remain: repeated fits with mean/spread (lesson 10); soft voting, AdaBoost updates and OOF stacking (11); acquisition/next trial and successive halving (12); minority-error accuracy trap and undersampling (17); recursive feature elimination (18); PSI contributions and total (20). Other curriculum gaps remain in the coverage audit.
