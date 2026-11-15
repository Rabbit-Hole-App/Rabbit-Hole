# Tree and forest interactive reference mapping

Owner brief: 2026-11-15 11:40 PT, amended 11:45 PT. Task ID: `82ec0b34-828c-4e1d-8504-89c81c332582`.
Branch: `design/trees-references`, based on `design/fast-path` at `aedd55b01`.
This is the first push, before any card drawing.

## Design authority and scope

Design the best teaching experiment for each question and depth, as if the runtime pipeline did not exist.
The 11:45 amendment waives the guide's depth pattern and parameter budget; it also removes existing-family/template
fit as a design constraint. Reuse only the approved stepper card's Inter font, palette, card chrome and control styling.
Each scene is natively 640 px wide, with a reachable aha held until input changes and at most 130 drawable objects.
The table describes intended interactions, not claims of implemented runtime coverage. No stepper runtime file is edited.

There are 39 rows below. Files use `<overview|standard|deep>-<mechanism>-<prompt-id>.html`, with a matching
`.composition.json`. Each JSON carries the existing reference envelope (`family`, `canonical`, `story`, `aha`,
`parts`, `controls`, `data`), plus provenance, calculations and review evidence as data. Its family value describes
the freely designed mechanism; it is not a claim that the runtime family has been registered.

## Today's counterparts

Implemented parts are `step-rail`, `fixed-picture` (approved collection/protocol/cycle presets), `active-callout`,
`readouts`, `ghost-previous` and `status-line`. Curve templates have axes, plots, a probe and a tangent, but do not
supply general composable parts for tree topology, discrete score tables, replacement samples or forest voting.
The generic callout, readout and status concepts can be reused. A table row marked **needs-family** means the full
experiment has no current counterpart; it does not mean every primitive is new. Existing analogues never dictate
the design. All missing compound parts are listed explicitly per row.

## Prompt × depth mapping

| Prompt | Depth | Family / freely chosen mechanism | Parts used | Controls and changed evidence | Missing counterparts today | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 05 · grown-tree | Overview | new — `graph-active-path` | Tree picture, active route, point probe, prediction | Point preset changes route and leaf. Reset restores the initial experiment. | tree picture; predicate-bound route; point probe | needs-family |
| 05 · grown-tree | Standard | new — `graph-active-path` | Feature plane, tree picture, active route, prediction | x/y coordinates change both plane position and tree route. Reset restores the initial experiment. | linked plane/tree; predicate-bound route | needs-family |
| 05 · grown-tree | Deep | new — `graph-active-path` | Plane, tree, predicate ledger, leaf counts | x/y coordinates change branch truth; trace cursor reveals each decision. Reset restores the initial experiment. | predicate ledger; route cursor; leaf-count binding | needs-family |
| 04 · threshold-search | Overview | new — `split-sandbox` | Ordered row strip, movable cut, child class buckets | Threshold selects a candidate and repartitions the rows. Reset restores the initial experiment. | movable split boundary; class buckets | needs-family |
| 04 · threshold-search | Standard | new — `split-sandbox` | Row strip, child buckets, candidate-score plot | Threshold changes buckets and plot marker. Reset restores the initial experiment. | candidate-score plot linked to the partition | needs-family |
| 04 · threshold-search | Deep | new — `split-sandbox` | Partition, exact score ledger, feature switch | Feature changes the candidate set; threshold recomputes weights and gain. Reset restores the initial experiment. | feature-dependent candidate domain; exact impurity ledger | needs-family |
| 11 · majority-vote | Overview | new — `vote-board` | Tree vote tiles, tally bars, majority result | Reveal votes changes the tally and majority evidence. Reset restores the initial experiment. | vote tiles; incremental vote tally | needs-family |
| 11 · majority-vote | Standard | new — `vote-board` | Held-out row selector, tree votes, tally | Row I/J changes the actual predictions; reveal count changes tally. Reset restores the initial experiment. | row-bound forest predictions; vote tally | needs-family |
| 11 · majority-vote | Deep | new — `vote-board` | Tree inspection, selected path, all votes, tally | Row changes predictions; inspected tree changes path and bootstrap evidence. Reset restores the initial experiment. | forest/tree linked inspection; bootstrap provenance | needs-family |
| 03 · gini-split | Overview | new — `split-accounting` | Class-token partition, child impurity meters | Cut changes child membership and purity. Reset restores the initial experiment. | class-token partition; impurity meter | needs-family |
| 03 · gini-split | Standard | new — `split-accounting` | Parent and child counts, weighted impurity bars | Cut changes both child scores and their weighted contributions. Reset restores the initial experiment. | weighted contribution bars; impurity calculation | needs-family |
| 03 · gini-split | Deep | new — `split-accounting` | Partition, exact arithmetic ledger, gain decomposition | Feature and cut change counts, weights, weighted score and gain. Reset restores the initial experiment. | exact arithmetic ledger; coupled feature/cut controls | needs-family |
| 01 · decision-regions | Overview | new — `partition-map` | Feature plane, leaf rectangles, movable probe | x/y move the probe across actual decision boundaries. Reset restores the initial experiment. | leaf-region plane; direct point probe | needs-family |
| 01 · decision-regions | Standard | new — `partition-map` | Plane, split-stage reveal, rule callout | Split stage reveals the root then the right-child cut; x/y change region. Reset restores the initial experiment. | branch-local split reveal; plane probe | needs-family |
| 01 · decision-regions | Deep | new — `partition-map` | Plane, rule path, training rows, held-out check | Point coordinates or I/J selection change region and correctness evidence. Reset restores the initial experiment. | region/path linkage; ground-truth comparison | needs-family |
| 02 · gini-vs-entropy | Overview | new — `impurity-probe` | Mixture strip, two curves, linked markers | Class fraction changes mixture and both impurity values. Reset restores the initial experiment. | mixture strip; two analytic curves with endpoint handling | needs-family |
| 02 · gini-vs-entropy | Standard | new — `impurity-probe` | Two curves, mixture, normalized comparison | Class fraction changes values; score scale changes the visible comparison. Reset restores the initial experiment. | normalization-aware dual curve/probe | needs-family |
| 02 · gini-vs-entropy | Deep | new — `impurity-probe` | Curves, endpoint definitions, formula substitution | Class fraction changes exact substitutions and both outputs. Reset restores the initial experiment. | endpoint-safe entropy; formula substitution ledger | needs-family |
| 06 · depth-overfit | Overview | new — `error-inspector` | Training/held-out curves, selected-depth markers | Depth changes the two errors on the illustrative run. Reset restores the initial experiment. | discrete error-curve probe | needs-family |
| 06 · depth-overfit | Standard | new — `error-inspector` | Error curves, selected-depth vs best-depth comparison | Depth changes the comparison with the best held-out setting. Reset restores the initial experiment. | best-setting ghost; linked error comparison | needs-family |
| 06 · depth-overfit | Deep | new — `error-inspector` | Toy depth errors, selected tree, misclassified rows | Depth changes the fitted tree and actual training/held-out mistakes. Reset restores the initial experiment. | model-depth tree switch; error membership tiles | needs-family |
| 12 · forest-size-accuracy | Overview | new — `forest-size-inspector` | Log-scaled curve, selected-size marker | Tree count changes the selected accuracy and position. Reset restores the initial experiment. | log-axis discrete observation probe | needs-family |
| 12 · forest-size-accuracy | Standard | new — `forest-size-inspector` | Curve, previous-size comparison, gain bar | Tree count changes accuracy and gain since the previous measured size. Reset restores the initial experiment. | adjacent-observation gain comparison | needs-family |
| 12 · forest-size-accuracy | Deep | new — `forest-size-inspector` | Curve, interval ledger, gain-per-added-tree readout | Tree count changes the observed interval and its computed marginal gain. Reset restores the initial experiment. | per-added-tree calculation; discrete log-axis ledger | needs-family |
| 10 · bootstrap-coverage | Overview | new — `sampling-coverage` | Omission curve, unique-versus-omitted share bar | n changes the finite-sample omission and expected coverage. Reset restores the initial experiment. | finite-n omission probe; complementary share bar | needs-family |
| 10 · bootstrap-coverage | Standard | new — `sampling-coverage` | Coverage/omission comparison, asymptotic reference | n changes expected unique coverage and distance from the limit. Reset restores the initial experiment. | finite-sample/asymptotic comparison | needs-family |
| 10 · bootstrap-coverage | Deep | new — `sampling-coverage` | Probability chain, omission curve, expected unique count | n changes the per-draw probability, n-fold product and expected unique rows. Reset restores the initial experiment. | probability-product ledger; expected-count binding | needs-family |
| 09 · bootstrap-roots | Overview | new — `sample-draw` | Original row bank, replacement draw strip | Draw selector changes which rows repeat. Reset restores the initial experiment. | replacement draw strip; repeat emphasis | needs-family |
| 09 · bootstrap-roots | Standard | new — `sample-draw` | Row bank, draw, omitted-row tray, root test | Draw selector changes repetitions, omissions and fitted root. Reset restores the initial experiment. | omitted-row tray; sample/root linkage | needs-family |
| 09 · bootstrap-roots | Deep | new — `sample-draw` | Replacement draw, multiplicity counts, root score evidence | Draw changes sample counts and candidate-root evidence; feature inspection changes the trials. Reset restores the initial experiment. | sample-weighted split ledger; node feature-draw provenance | needs-family |
| 07 · cost-complexity-pruning | Overview | new — `pruning-inspector` | Leaf-count silhouette, selected alpha, accuracy | Alpha changes leaves and held-out accuracy on the illustrative run. Reset restores the initial experiment. | pruning silhouette; linked alpha/accuracy | needs-family |
| 07 · cost-complexity-pruning | Standard | new — `pruning-inspector` | Unpruned/pruned leaf comparison, accuracy curve | Alpha changes retained leaves and held-out result against the starting tree. Reset restores the initial experiment. | tree-size before/after; alpha-linked curve | needs-family |
| 07 · cost-complexity-pruning | Deep | new — `pruning-inspector` | Leaves, accuracy and alpha ledger, objective explanation | Alpha changes selected row and the smallest equally accurate tree. Reset restores the initial experiment. | smallest-best selection; pruning ledger | needs-family |
| 13 · feature-importance | Overview | new — `importance-comparison` | Paired feature bars, selected feature emphasis | Feature selection changes the highlighted MDI/permutation pair. Reset restores the initial experiment. | paired feature bars; category selection | needs-family |
| 13 · feature-importance | Standard | new — `importance-comparison` | Full paired bars, method ranking, selected feature | Feature changes comparison; ranking method changes order of evidence. Reset restores the initial experiment. | method-dependent ranked bars | needs-family |
| 13 · feature-importance | Deep | new — `importance-comparison` | Paired bars, normalized-share ledger, noise contrast | Feature or method changes rank and share; noise emphasis compares its conflicting scores. Reset restores the initial experiment. | normalized-share ledger; explicit method-unit distinction | needs-family |
| 08 · regression-step-fit | Overview | new — `regression-fit-probe` | Sine target, selected-depth step fit | Depth 2/4 changes the fitted function and number of leaves. Reset restores the initial experiment. | switchable step fit; leaf-boundary plot | needs-family |
| 08 · regression-step-fit | Standard | new — `regression-fit-probe` | Sine, shallow/deep overlay, angle probe | Angle changes the selected leaf and both predictions; depth focus changes emphasis. Reset restores the initial experiment. | linked angle-to-leaf probe; two step-fit overlay | needs-family |
| 08 · regression-step-fit | Deep | new — `regression-fit-probe` | Sine, both fits, selected leaf samples and mean | Angle and depth change leaf membership, prediction, mean and residual. Reset restores the initial experiment. | leaf-membership highlight; mean/residual ledger | needs-family |

## What each new mechanism shows

- `graph-active-path`: A movable point follows predicate tests to a leaf, with the route and prediction linked.
- `split-sandbox`: A cut partitions the actual rows and changes the candidate score.
- `vote-board`: Individual tree predictions accumulate into a class tally for the same held-out row.
- `split-accounting`: Class counts flow through child impurity and sample weights into gain.
- `partition-map`: A point and the fitted cuts expose which axis-aligned leaf supplies its prediction.
- `impurity-probe`: A class mixture and a shared probability probe compare the two impurity measures.
- `error-inspector`: Selecting model depth links fit error and held-out error without inventing a new run.
- `forest-size-inspector`: A discrete forest-size probe exposes diminishing gains on the supplied illustrative run.
- `sampling-coverage`: Replacement draws and an analytic omission probability explain unique-row coverage.
- `sample-draw`: Replacement draws expose repeats, omitted rows and the fitted root they support.
- `pruning-inspector`: Alpha selects a smaller tree while the accuracy comparison reveals the best retained setting.
- `importance-comparison`: Method and feature selection expose how noise can look important without helping held-out prediction.
- `regression-fit-probe`: A regression-tree step function and its leaf means are inspected against the same sine samples.

## Source and arithmetic rules

Read the matching depth's `ml-trees-*/spec.json` under
`docs/features/explain-on-canvas/handoff/phase02-library/illustrations/` and the exact prompts in
`docs/features/explain/topics/decision-trees/fixture/prompts.human.json`.
Use the 8-row worked split, exact Gini fractions, entropy endpoint convention, omission `(1−1/n)^n`, fixed
bootstrap draws and supplied sine fit. The source's illustrative accuracy, pruning and importance values remain
labelled illustrative. Recompute added values and store the calculation in the composition; do not present a
normalized permutation-importance share as an unprovided accuracy drop. Deep overfit uses its worked 8-row/2-row
toy, not the illustrative Overview/Standard curve. Bootstrap omission is distinct from unique-row coverage.

## Delivery and verification sequence

Push this mapping alone first. Then draw and push exactly one prompt's three HTML cards plus companions at a time,
in table order: 05, 04, 11, 03, 01, 02, 06, 12, 10, 09, 07, 13, 08. Record the revision, parts, every control's effect,
reachable aha, state bounds, maximum drawable-object count and new-number arithmetic for each card.

Review with `scene-composition-scorecard.md`, applying the owner's explicit 11:45 replacement for line 7 and the
old parameter budget. Checks 1–4, 6, 8 and 10 can be inspected against executable state data and code; rendered fit,
contrast and legibility require rendered evidence. Under CLAUDE.md's Browser verification rule the owner performs
browser acceptance. Deterministic geometry/count and Node interaction checks are reported separately and never
labelled a visual pass. No deployments or provider calls are part of this task.
