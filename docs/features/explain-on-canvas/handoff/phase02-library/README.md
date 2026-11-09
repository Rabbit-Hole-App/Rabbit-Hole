# Phase 02 written Explanation library — Claude handoff

Task: `96d13bbb-6cd1-45be-b27a-95820d3495b0` · branch: `chatgpt/explain-phase02-library` · implementation base: `748e561eda37a269e277d913cdc1f9099fe9bf94`.

## Result

Four new diagram kinds and nine additive extensions are implemented in the **written `/explain`** path. The model receives relevant, valid JSON examples; Rabbit Hole renders the resulting semantic JSON using the existing SVG component. These are reusable layouts and reference data, not fixed lesson cards returned in place of generation. The `/interact` fixtures and `/animation` renderer are separate and unchanged.

The branch author registry has **391 references**. The offline catalogue has **415 references** and the kind gallery has 24 neutral shapes. The per-lesson audit tracks the open reference patterns. Reference datasets are illustrative. Generated cards use the learner's own source values when supplied. [Rebase verification](svg-offline.md#rebase-onto-correct-svg) · [Coverage audit](coverage-audit.md)

The batch handoffs record the prompts, expected math and dev acceptance steps. Batch 1 covers ten references for Lessons 04–07. Batch 2 covers all 16 planned references across Lessons 08–12, 17–18 and 20. Batches 3A, 3B and 3C cover time series, anomaly detection and ML system design. [Batch 1](batch-1.md) · [Batch 2A](batch-2a.md) · [Batch 2B](batch-2b.md) · [Batch 2C](batch-2c.md) · [Batch 3A](batch-3a.md) · [Batch 3B](batch-3b.md) · [Batch 3C](batch-3c.md)

Batch 4A covers classification versus regression and the logistic decision boundary in Lessons 01 and 03. [Batch 4A](batch-4a.md)

The static illustration pack adds seven transformer and architecture references. The previews use natural widths up to 960 px, with a 320 px minimized Gemma example. [Illustration primitives](illustration-primitives.md) · [Illustrated Transformer walkthrough](illustrated-transformer-walkthrough.md)

The batch 1 follow-ups add sequence self-messages, clearer flow arrivals, side-by-side attention heads, and three references for B-tree lookup, recursion and Big-O. [Batch 1 follow-up handoff](batch-1-followups.md)

The figure-brief pipeline adds 212 worked references across the illustrated articles, D2L, and the architecture gallery. The source index records figure briefs, chapter mappings and the remaining kind gaps. [Figure-brief pipeline handoff](figure-chapters/README.md)

The offline SVG handoff covers the 14 AI/ML additions, kind gallery, content contracts, standalone formula sampler, renderer diffs, correction corpus and SVG snapshots. It records the original selector benchmark and the additional paraphrase replay. [Offline SVG handoff](svg-offline.md)

## Implemented scope

| Kind | Built capability | Example |
| --- | --- | --- |
| **New: heatmap** | Signed numeric scale, exact cells, missing values, highlights | [Correlation](references/signed-feature-correlation.svg) |
| **New: sample-set** | Sample identity, repeats, weights, omissions and out-of-bag groups | [Bootstrap](references/bootstrap-replacement-oob.svg) |
| **New: histogram** | Numeric bin edges, count/proportion series, markers, unequal-bin density | [Unequal bins](references/unequal-bin-density.svg) |
| **New: box-plot** | Quartiles, median, observed whiskers, fences and labelled outliers | [IQR](references/iqr-fences-and-outliers.svg) |
| **New: tensor** | Numeric or shape-only cell strips, standalone or embedded | [QKV](illustrations/ml-transformer-qkv-projections/natural.svg) |
| **New: token-links** | Directed token-to-token weights, strongest arrow labelled | [Self-attention](illustrations/ml-self-attention-token-links/natural.svg) |
| **New: block-stack** | Nested blocks, residuals, repeat brackets, notes and detail markers | [Gemma](illustrations/ml-gemma-decoder-stack-detailed/natural.svg) |
| Tree | Binary/hierarchy/dendrogram, edge labels, metadata, pruning and a checked root-to-descendant path | [BST insertion](references/tree-bst-insertion.svg) · [Dendrogram](references/ml-clustering-dendrogram.svg) |
| Coordinate plot | Data-coordinate geometry/annotations, uncertainty, step/stem/log scales | [SVM](references/svm-margin-support-slack.svg) |
| Bar chart | Grouped and signed stacked series | [Votes](references/ensemble-votes.svg) |
| Timeline | Numeric lanes, intervals/events, cutoffs, TTL and availability | [As-of join](references/as-of-join-ttl-window.svg) |
| Matrix | Stable rows, selected/missing/changed cells, formula labels | [Imputation](references/median-imputation-indicator.svg) |
| Flow | Explicit concurrent fork/merge, existing routing | [Preprocessing](references/ml-parallel-preprocessing.svg) |
| Relationship | Connected graph with each node drawn once, directed and reciprocal links | [Feedback](references/ml-feedback-graph.svg) |
| Comparison | Two/three actual child diagrams, shared-domain validation, narrow-width stacking | [Fit quality](references/ml-fit-quality-comparison.svg) |
| Transformation | Before/after diagrams with preserved/mapped sample identity | [Scaling](references/ml-feature-scaling-transformation.svg) |

The reference index lists all JSON/SVG pairs and their lesson mapping. The archived self-contained gallery shows the earlier examples with formula styling. The export command in the Batch 3B handoff generates a fresh gallery from the current catalogue. [Reference index](references/README.md) · [Archived gallery](references/index.html) · [Gallery export](batch-3b.md#local-verification)

## Where the implementation lives

| Responsibility | Source |
| --- | --- |
| Strict public schema, version-1 parser, recursive child validation | `packages/web/src/tutor-diagrams/spec.js` |
| Domain schemas, numeric checks and readable text | `packages/web/src/tutor-diagrams/ml-{statistical,plot,topology,data,composition}-spec.js` |
| Layout dispatch / existing SVG component | `packages/web/src/tutor-diagrams/layouts.js`, `TutorDiagram.js` |
| Domain geometry | `packages/web/src/tutor-diagrams/ml-*-layouts.js` |
| Exact approved palette | `packages/web/src/tutor-diagrams/teaching-theme.js` |
| Actual author examples and all lesson mappings | `packages/web/src/tutor-diagrams/reference-library.js`, `ml-*-references.js` |
| Neutral spec for each diagram kind | `packages/web/src/tutor-diagrams/kind-gallery.json` |
| Bounded selection and author instructions | `packages/control-plane/src/explanation-references.js` |
| Real author / repair context integration | `packages/control-plane/src/learn-artifact.js` |
| Server requirement recognition and traced tree validation | `packages/control-plane/src/explanation-visuals.js`, `learn-primitives.js` |
| Reproducible actual-renderer SVGs and gallery | `packages/web/scripts/export-explanation-references.mjs` |
| Extension instructions / constraints | `packages/web/src/tutor-diagrams/README.md` |

The selector adds **at most two** complete JSON examples and at most 14,000 characters of example context. It uses learner words before source context and filters explicit required kinds. When a required kind matches a leaf inside a composition, it can supply that valid leaf as a standalone example. If no topic matches and a kind is known, it supplies the neutral gallery shape for that kind. An unfamiliar ordinary hierarchy can use `shape-tree`, which uses the hierarchy layout. Repairs retain the same references. Other commands receive none. It makes no extra model call.

The JSON Schema is nonrecursive and serializable; its size is recorded in the execution receipt below. Runtime checks enforce additional invariants that JSON Schema cannot express. The schema still uses `version: 1` and retains the existing 16,384-character whole-diagram limit. Old specs preserve their existing render treatment; unknown new kinds need the coordinated new reader.

### Worked estimation and validation

The likelihood plot holds the observed count at seven heads in ten flips. The likelihood is 0.1172 at a fair coin and peaks at 0.2668 when the chance of heads is 0.7, with both likelihood values rounded.

The validation matrix holds out two rows per round and fits 1-NN on the other eight. It uses ten ordered feature values from 0 to 9 and labels 0, 0, 0, 0, 1, 1, 1, 1, 1, 1. A tie selects the lower feature value. The five held-out scores average 80%.

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| `ml-mle-bernoulli-likelihood` | [408 px SVG](illustrations/ml-mle-bernoulli-likelihood-brief/408.svg) | [408 px SVG](illustrations/ml-mle-bernoulli-likelihood/408.svg) | [408 px SVG](illustrations/ml-mle-bernoulli-likelihood-detailed/408.svg) |
| `ml-kfold-validation` | [408 px SVG](illustrations/ml-kfold-validation-brief/408.svg) | [408 px SVG](illustrations/ml-kfold-validation/408.svg) | [408 px SVG](illustrations/ml-kfold-validation-detailed/408.svg) |

## Integration with your active release

1. Fetch `chatgpt/explain-phase02-library` from `rabbit-hole`. Integrate its delta from base `748e561eda37a269e277d913cdc1f9099fe9bf94` onto the active release. Do not reset the release branch to this older base.
2. Preserve your binary-tree rule at `69b3e71d2`, the negative controls for ordinary hierarchies, and items 45–48 / the three-visual release. Shared backend files must be reconciled, not replaced wholesale. This branch intentionally keeps its base's visual count, author/review budgets and routing unchanged.
3. An operation on a data structure should show the structure itself. For inorder/BST insertion, the binary structure is the primary visual; steps can be a second useful visual. A three-visual allowance is a maximum, not a target. Keep kind-selection failures distinct from renderer/layout failures.
4. The new tree `highlightPath` is a root-to-descendant route, not a general visitation sequence. Inorder examples mark visit order on real nodes; insertion highlights its actual search path. Do not invent traversal fields or send arbitrary SVG.
5. Deploy the matching control plane and web reader to your existing isolated dev clone using the repository's established procedure. No production release was performed for this branch.

## Focused local checks

From the repository root:

```sh
node --test packages/web/src/tutor-diagrams/*.test.mjs packages/control-plane/test/explanation-reference-batch*.test.js packages/control-plane/test/explanation-references.test.js packages/control-plane/test/explanation-diagram-kinds.test.js packages/control-plane/test/explanation-visuals.test.js packages/control-plane/test/explanation-validation.test.js packages/control-plane/test/learn-artifact.test.js
npm run build --workspace=packages/web
node packages/web/scripts/export-explanation-references.mjs
```

The pre-existing `math.test.mjs` needs `linkedom`. In the Codex host it was available in an isolated test-dependency directory rather than the shared worktree dependencies, so the focused invocation used a Node import hook to resolve that package. No production dependency or package manifest was changed for this environment issue.

Checks include all references through parse → saved JSON → parse → actual renderer at 320/408/720 px, compatibility with legacy fixtures, numerical coordinate mappings, invalid data, bounded composition, model-request references and repair retention. Scripted provider tests are not live model evidence.

## Live dev acceptance — still to perform

Run these as **normal learner prompts through written `/explain`**, retaining the actual model-produced card and request context. Use source data where supplied, or label toy data as illustrative. Do not seed a reference card as the purported generated result.

| Prompt | What to inspect |
| --- | --- |
| How is a binary tree traversed in order? | Actual binary tree; correct visit order. A flow alone fails. |
| Show me inserting 7 into a BST. | Actual tree and new child slot, comparisons and search path agree. |
| Explain a family tree. / Show a folder hierarchy. | Ordinary hierarchy, not binary by default. |
| How can a confusion matrix tell me what my classifier gets wrong? | Labelled actual/predicted axes; counts and interpretation agree. |
| Why does a bootstrap sample repeat some rows and leave others out? | Stable IDs, multiplicities and exact out-of-bag complement. |
| Why can a histogram with wider bins be misleading? | Bin widths, counts and density/area are consistent. |
| What does a box plot call an outlier? | Quartiles, fences and observed whiskers are distinguished. |
| How does an SVM separate the classes? | Data, separator, margins and support/slack labels agree. |
| How do the trees in a forest vote? | Votes and majority computed from the card's own example. |
| Which feature value was available when this prediction was made? | Event/creation/label time and TTL/cutoff are distinguished. |
| How do we fill missing values without forgetting they were missing? | Stable rows, correct fitted imputation and missing indicator. |
| What happens when a pipeline processes numeric and categorical columns? | Concurrent fork, separate transformations, explicit merge. |
| Why can user feedback change the data a model learns from? | Real directed loop; no duplicated nodes standing in for links. |
| What is the difference between underfitting and overfitting? | Comparable actual plots sharing the observations and scales. |
| Why does feature scaling change nearest-neighbour distances? | Same sample identities, stated transformation, correct coordinates/distances. |

First confirm that the configured provider accepts the expanded tool schema and that selected references are actually present. Then record kind choice, layout/labels, calculations, narrow-card fit, formula appearance, and saved/reopened generated JSON. Keep accepted jobs separate from rejected candidates. Repeat the two historical binary-operation misses and the ordinary-hierarchy controls, rather than claiming reliability from one successful request.

## Sources and evidence

- All 21 English lessons: [Phase 02 at the audited source commit](https://github.com/rohitg00/ai-engineering-from-scratch/tree/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals). The source commit and paths are stored in `references/manifest.json`.
- Approved palette reference: [tree-splits-and-impurity.svg](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/012d4ae3dfd9b20ef14156bea89c2632b844cc46/docs/features/explain-on-canvas/handoff/examples/decision-trees-random-forests/tree-splits-and-impurity.svg).
- [Saved plan and implementation checklist](../../../../superpowers/plans/2026-11-08-explain-phase02-library.md).
- [Main Claude note](../../../explain-program-support.md#note-for-claude-code).

### Execution receipt

- Implementation pushed and branch head verified: `e1627df972cc4c581d4f360cbe992a1dde318038`. Remote tree `ac45762efa9a8a1900e0c8cfaf723f1f1f6b13fe` equals the tested local implementation tree. This receipt update changes documentation only.

- Final integrated check: **373 tests passed, zero failed or skipped**. The serialized provider JSON Schema is **86,419 bytes**. All 130 references passed parse/save/read/render checks at 320, 408 and 720 px. Independent review findings were fixed and covered by failing-before/passing-after regressions.
- Web build passed. The existing bundle-size warning remains; no broad CI was run.
- Generated all 130 reference SVG/JSON pairs from the actual renderer. Inspected 16 representative static SVG rasters covering the four new kinds and nine extensions. CSS variables were resolved only in disposable raster-inspection copies; repository SVGs retain the real output. This converter does not render KaTeX foreignObjects; formula/browser appearance is not claimed from those images.
- Local Chromium capture was attempted and failed at launch with `socket() failed: Operation not permitted`. No browser capture or generated-card persistence claim follows from the static inspection.
- The designated Windows credential file is not present in this Linux host. No provider call, dev deployment or production promotion was attempted with substitute credentials.
- `ponytail:` Live provider schema acceptance, stochastic kind selection, full browser/formula acceptance and saved generated-card reopen remain pending in Claude's authorized dev environment.
