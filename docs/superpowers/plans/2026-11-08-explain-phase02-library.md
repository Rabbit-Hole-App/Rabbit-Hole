# Phase 02 Explanation Diagram Library Implementation Plan

> **For agentic workers:** Use native execution with independent domain lanes and one integration owner. Implement the checked tasks in order of dependency; the owner approved planning, building and pushing in this session, so no second approval pause is needed.

**Goal:** Give the written `/explain` author valid, relevant examples and deterministic SVG layouts covering all 21 Phase 02 lessons, preserving saved diagrams and the approved visual treatment.

**Architecture:** Keep the existing `TutorDiagram` JSON fence and renderer. Add four semantic kinds and extend nine existing kinds through small domain modules. A bounded reference selector supplies actual validated JSON examples to `prepareArtifactAuthorRequest`; generated SVG reference files come from the production renderer.

**Tech Stack:** JavaScript ES modules, React SVG, existing Zod schemas, Node test runner. No new dependencies or model calls in rendering.

**Spec:** Owner-approved 2026-11-08 Phase 02 audit in this conversation, recorded below. Source lessons pinned to `rohitg00/ai-engineering-from-scratch@e7db050e64bde3be17a9381476f748da26d85692`, `phases/02-ml-fundamentals/*/docs/en.md`. Implementation starts from `748e561eda37a269e277d913cdc1f9099fe9bf94`, which contains the binary-tree layout and the current written-Explanation author path.

## Global constraints

- Written `/explain`, static 2D SVG only. Existing `/interact` fixtures are references, not a runtime dependency.
- Preserve old version-1 JSON and old layouts unless an explicit new variant is requested.
- Reuse `TutorDiagram.js`, `primitives.js`, existing card shell, `math.js`, `UI.md`, and the approved treatment documented in `tutor-diagrams/README.md`. No new card UI, controls, font system or palette.
- The author owns semantic labels, values and relationships. The renderer owns positions, dimensions, fills, line styles and font sizes. Reject arbitrary SVG, HTML, URLs and CSS in structural fields.
- Small, bounded teaching examples. No training runtime, arbitrary expressions, code execution, nested recursive compositions or new provider.
- Do not change budgets, release workflows, router billing, unrelated cards or production settings.
- A fixture passing is not evidence of live author selection. Record deterministic, visual, live-generation and deployment evidence separately.
- Push completed work to `Rabbit-Hole-App/Rabbit-Hole` on `chatgpt/explain-phase02-library`; no production promotion in this task.

## Review focus

- Old persisted specs retain their appearance and remain readable, including outline trees and basic plots.
- New numeric marks map to declared scales; reject contradictory bins, heights, invalid intervals and unknown sample IDs.
- At narrow widths labels remain legible at native font size; large scenes use the existing horizontal scroll behavior.
- Ordinary folder/family hierarchies do not become binary trees. A tree operation reference shows the structure, not only a flow.
- References are supplied to the real author and repair requests; they cannot override user/source facts or leak into unrelated commands.

## Approved scope and ownership

All code paths below are under `packages/web/src/tutor-diagrams/` unless stated otherwise.

| Lane | Kinds | Files owned | Deliverable |
| --- | --- | --- | --- |
| Statistical | New `heatmap`, `sample-set`, `histogram`, `box-plot` | `ml-statistical-{spec,layouts,references}.js`, `ml-statistical.test.mjs` | Shape, domain checks, SVG, references and meaningful tests |
| Plot | Extend `coordinate-plot`, `bar-chart` | `ml-plot-{spec,layouts,references}.js`, `ml-plot.test.mjs` | Annotated geometry, uncertainty, step/log plots and grouped/stacked bars |
| Topology | Extend `tree`, `relationship`, `flow` | `ml-topology-{spec,layouts,references}.js`, `ml-topology.test.mjs` | Tree variants, graph variant, fork/merge semantics |
| Data/time | Extend `timeline`, `matrix` | `ml-data-{spec,layouts,references}.js`, `ml-data.test.mjs` | Scaled lane intervals/cutoffs and highlighted grids |
| Composition | Extend `comparison`, `transformation` | `ml-composition-{spec,layouts,references}.js`, `ml-composition.test.mjs` | Bounded child diagrams, shared axes, explicit correspondence |
| Integration (lead) | Shared schema/renderer and author path | `spec.js`, `layouts.js`, `TutorDiagram.js` if needed, reference registry, author selector, backend tests, docs/export script | Working end-to-end JSON→saved body→SVG path and bounded examples in author requests |

### Shared module interfaces

Each domain `ml-<domain>-spec.js` exports:

- `createShapes(h)` → Zod strict-object schemas, replacing the matching existing kinds. `h` contains `{ z, titled, text, id, numeric, unit, axes, node, itemList, leafDiagram? }` using the existing schema helpers. Composition receives a nonrecursive `leafDiagram` union assembled after all other shapes.
- `validate(diagram, issue)` → domain-specific checks, using `issue(pathArray, message)`; no-op for other kinds. Existing base topology/domain checks remain in `spec.js`; the lead adapts these only where a new variant deliberately changes shape.
- `describe(diagram)` → array of readable lines or `null` to use legacy description.
- `visibleText(diagram)` → array of rendered text (including title/caption) or `null` for legacy counting. Never omit new visible labels.

Each `ml-<domain>-layouts.js` exports `createLayouts({ legacy, renderChild })` → map of layout functions `(diagram, width) => { width, height, elements }`. Use `legacy[kind]` unchanged when no new fields/variant apply. `renderChild` is for bounded composition only and returns the existing layout result (without an outer SVG).

Each `ml-<domain>-references.js` exports `references`, an array of:

```js
{ id: 'stable-kebab-id', lessons: ['04'], prompts: ['How does a tree decide?'],
  keywords: ['decision tree', 'split'], useWhen: '...', spec: { version: 1, diagram: { /* valid actual schema */ } } }
```

Names are module-level design choices within the approved semantics. Each domain owns those exact fields, documents them in its reference JSON, and informs integration. No shared-file edits from lanes; isolated worktrees and commits. Run domain tests against direct exported shape/layout interfaces; integration reruns against `parseTutorDiagram` and `renderTutorDiagram`.

## Task 1: Statistical teaching visuals

- [x] Write tests for heatmap signed scale/masked cells, sample identity and replacement counts, histogram bin widths/aligned comparisons, box quartile/fence/outlier geometry, and invalid numeric inputs.
- [x] Build `heatmap`: numeric cells, row/column labels, explicit range, displayed exact values, optional masked/highlighted cells.
- [x] Build `sample-set`: stable sample IDs/classes, grouped memberships including repeats, weights and omitted/out-of-bag membership. Multiplicity must be visible.
- [x] Build `histogram`: explicit numeric bin edges, one to three aligned count/proportion series, threshold markers, correct bar areas for unequal bin widths (density when needed).
- [x] Build `box-plot`: ordered quartiles/median/whiskers, separately labelled fences and outliers on one shared scale.
- [x] Add runnable references for confusion/correlation, bootstrap/imbalance, transform/drift/null distributions and IQR.
- [x] Run `node --test packages/web/src/tutor-diagrams/ml-statistical.test.mjs` and commit.

## Task 2: Mathematical plot and bar variants

- [x] Write tests for value-to-coordinate mapping, log-domain validation, bounded annotations, step continuity, uncertainty ordering, grouped and signed stacked totals.
- [x] Extend plots with semantic data-coordinate annotations: labelled points, segments/vectors, reference lines, rectangles/polygons, circles/ellipses and bands. Include step/stem series and optional log axes. No authored pixel coordinates.
- [x] Cover regression residuals, classification regions, SVM margins, KNN geometry, centroid movement, GMM, SMOTE, regularisation geometry, contour polylines, uncertainty and ECDFs with fixed data.
- [x] Extend bars with labelled grouped/stacked series, preserving ordinary single-series bars. Compute signed stack baselines independently.
- [x] Add references for regression, sigmoid, SVM, KNN, clustering, loss/regularisation, ROC/PR, tuning, time-series components, votes/importance.
- [x] Run `node --test packages/web/src/tutor-diagrams/ml-plot.test.mjs` and commit.

## Task 3: Trees, connected graphs and parallel flows

- [x] Write tests for child ordering, labels/path/pruned marks, numeric dendrogram heights/cutoffs, unique graph nodes with reciprocal links, and fork/merge edges.
- [x] Extend trees with edge labels, count/detail metadata, path highlighting, pruning marks, a top-down ordinary hierarchy and a dendrogram variant with merge-height scale. Preserve binary left/right slots and legacy outline.
- [x] Add an explicitly selected connected `relationship` layout with each node drawn once; label directions and route reciprocal links distinctly.
- [x] Add `fork` and `merge` flow roles. Fork means simultaneous routes and must not be drawn as a decision diamond. Reuse existing graph routing/layout through legacy functions where possible.
- [x] Add references for tree decisions/operations, ordinary hierarchy, dendrogram, isolation/KD trees, preprocessing, bagging/stacking, store architecture and feedback/lineage.
- [x] Run `node --test packages/web/src/tutor-diagrams/ml-topology.test.mjs` and commit.

## Task 4: Quantitative timelines and teaching matrices

- [x] Write tests for proportional positions, multiple intervals, cutoff and TTL ranges, missing/changed/selected cell styles, row lengths and invalid references.
- [x] Add an explicit scaled-lanes timeline variant: numeric domain and unit, labelled lanes, intervals/events and cutoff markers. Avoid overlap by allocating rows without moving time values.
- [x] Extend matrices with explicit semantic cell/row/column emphasis, missing/changed states and stable row labels. Keep values literal and deterministic.
- [x] Add references for splits/folds, walk-forward, label delays, as-of/TTL/late arrival, encoding/imputation, TF-IDF/Bayes, lag features and permutations.
- [x] Run `node --test packages/web/src/tutor-diagrams/ml-data.test.mjs` and commit.

## Task 5: Composed comparisons and transformations

- [x] Write tests for shared-domain enforcement, no recursive child compositions, unequal widths/heights, and preserved row/sample identity.
- [x] Add visual-panel comparisons, maximum three panels, each with a supported child visual. Shared plot axes must match exactly when declared shared.
- [x] Add before/after visual transformations with an operation and explicit identity/correspondence notes. Retain existing text/list transformations.
- [x] Reuse `renderChild` supplied by the lead; compose real layout output, do not draw alternative look-alike charts.
- [x] Add references for fit comparison, scaling, clustering comparison, drift types, encodings and boosting/differencing snapshots.
- [x] Run `node --test packages/web/src/tutor-diagrams/ml-composition.test.mjs` and commit.

## Task 6: Author integration, reference coverage, verification and push

- [x] Wire all shapes, runtime validators, visible text, descriptions and layout dispatch through the existing reader/writer.
- [x] Create one registry of valid references plus all 21 lesson coverage mappings and natural acceptance prompts. Include the existing non-ML examples for supported unchanged kinds.
- [x] Add a deterministic selector that supplies at most two relevant compact JSON examples to `prepareArtifactAuthorRequest`, respects explicit required kinds, and uses bounded request/context text. No extra model call, no forced response template, no examples in unrelated commands. Reference numeric data is explicitly illustrative, never source evidence.
- [x] Keep examples present on repair calls through the same prepared request. Add offline backend tests asserting the actual request contains the expected examples for binary operations, ordinary hierarchy, and representative Phase 02 prompts.
- [x] Export actual-renderer SVGs and an index from the same reference objects. Record narrow-width checks and inspect representative renders; fix geometry defects before claiming visual acceptance.
- [x] Run the diagram suite, affected explanation/backend tests, schema serialization check, and web build. Do not run broad unrelated CI.
- [x] Update `docs/features/explain-program-support.md`, the diagram README, this checklist and a Claude handoff with implemented versus pending live evidence.
- [x] Check deployment/model access without printing secrets. If unavailable, record the exact blocker and provide ready-to-run reference/acceptance inputs for Claude; do not claim provider acceptance or deployment.
- [x] Review the integrated diff and prepare the verified code and Claude handoff for publication.
- [x] Push and verify remote head: implementation `e1627df972cc4c581d4f360cbe992a1dde318038` on `chatgpt/explain-phase02-library`. Remote tree `ac45762efa9a8a1900e0c8cfaf723f1f1f6b13fe` exactly matches the locally tested implementation tree.

## Lesson coverage checklist

Every row must have registered reference IDs; it is not enough to list a kind.

| Lesson | Reference families to cover |
| --- | --- |
| 01 | learning taxonomy, labelled samples, splits, centroid boundary, workflow |
| 02 | fit/residuals, mean baseline, gradient path, polynomial fit, regularisation |
| 03 | sigmoid/threshold, cross-entropy, boundary, softmax, confusion/ROC |
| 04 | split/path/counts, impurity mixtures, pruning, regression steps, bootstrap/votes |
| 05 | margins/support vectors/slack, hinge, kernel similarity, SVR band |
| 06 | neighbours/weights, L1/L2/cosine, scaling/K, KD partitions, concentration |
| 07 | K-means stages, elbow/silhouette, DBSCAN, dendrogram, GMM/EM |
| 08 | scaling/log/binning, encoding, imputation, TF-IDF, interactions/correlation |
| 09 | split/stratified/nested folds, confusion/ROC/PR, residuals, learning curves/null |
| 10 | under/good/overfit, repeated fit spread, decomposition, early stop/double descent |
| 11 | bootstrap/OOB, bagging/voting, weighted examples, residual corrections, stacking |
| 12 | grid/random, score grid, surrogate/uncertainty, pruning, schedules, nested CV |
| 13 | parallel pipeline, fit/transform leakage, lifecycle and version lineage |
| 14 | Bayes counts/probabilities, smoothing, densities, log scores, calibration |
| 15 | components/differencing, lags, ACF/PACF, validation windows, forecast strategies |
| 16 | z-score/IQR, isolation, local density, anomaly types and ranking |
| 17 | prevalence, resampling/SMOTE, class weights, threshold/PR, cost matrix |
| 18 | nonlinear dependence, ranks/RFE, permutation, L1/L2 paths, stability |
| 19 | goal/task/decision, baselines/budgets, serving/deployment/fallback, feedback |
| 20 | three drift types, distributions/PSI/KS, windows/delays/persistent alerts |
| 21 | online/offline, event/created/label time, as-of/TTL, late arrival, skew |

## Execution record

- 2026-11-08: Plan saved before implementation. Prior binary-tree base has 162 focused tests plus a successful web build. Native-domain lanes will run isolated focused checks; the final combined candidate will be checked again.
- 2026-11-08 integrated verification: 373 focused tests passed, zero failed/skipped; final web build passed. Schema: 86,419 bytes; 130 complete registered references across 21 kinds and all 21 lessons; every reference parsed, round-tripped and rendered at 320/408/720 px.
- Generated all 130 SVG/JSON pairs plus a self-contained gallery. Inspected 16 static SVG rasters covering all 13 additions/extensions. Formula foreignObjects are excluded from static raster claims.
- Independent review fixed incorrect centroid example means, unrelated binary examples selected for a generic hierarchy, and a mixed-transformation validation exception. Each reproduction failed before its fix and passed after it.
- Live model/dev: designated Windows credential file absent in this Linux host. Local Chromium screenshot launch failed with socket permission error. `ponytail:` Live provider schema/selection, browser/formula and generated-card save/reopen acceptance remain pending; no deployment or broad CI was run.


## Reference-pack completion correction — 2026-11-08

The completed implementation checkboxes above cover the 13 renderer additions/extensions and an initial reference pack. They do **not** mark every scene in the owner's longer per-lesson table complete. The registry contains 116 Phase 02-tagged examples plus 14 general examples; one or more references per lesson is an inventory check, not a completeness check.

See [the complete 21-lesson audit](../../features/explain-on-canvas/handoff/phase02-library/coverage-audit.md) for actual present IDs, partial/missing mechanisms and build order. Finish that content backlog before moving to the next phase. The expected next work reuses the implemented kinds rather than adding kinds merely because an example is absent.

- [x] Audit actual reference JSON against every row of the owner's table.
- [ ] Complete the missing/partial reference content in the audit.
- [ ] Verify real author selection and generated-card visual/persistence behavior.
