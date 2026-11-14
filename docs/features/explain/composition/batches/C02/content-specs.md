# C02 — content specifications before diagram code

Task `a97894d9-db7b-4af3-8a7d-35c2d0114221`. Approved queue: `9288dca9d`; frozen schema: `1944b48cf`; C01 data base: `767ba06c4`. The owner approved C02 on 2026-11-14. C02 is one data release merging four small subjects into the distribution-shift tranche; each figure keeps its own topic and lessons. These paragraphs precede authored data/reference code.

Every visual, including a separate deep check, stays at most **300 compact cl100k_base tokens**. Standard uses at most two coordinate-plot panels; shared-axis stems are reserved for a lesson about the axis itself. Every composition renders within **680 px** when given 680 px. Pure comparisons use `comparison` with the `panels` variant; an ordered operation uses `panels`. No renderer, schema, tooling or author-prompt changes. Existing comparison layouts may stack vertically to keep their plots readable. Preserve class names and the source prompt verbatim; use magnitudes for quantities, never number-filled boxes.

## ml-attention-scaled-score-normalization

Scaling and softmax convert raw matches into a comparable distribution over positions: show raw scores, the square-root scale from head width, normalized weights, and the weights summing to one. [Source: illustrated-transformer Figure 12](../../../../explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-12). Use query `(1,1)` and keys A `(2,0)`, B `(0,1)`, C `(1,2)`, with head width computed from the query. Their dot products are `(2,1,3)`; divide by `sqrt(2)` before stable softmax. The resulting weights are approximately `(0.283995,0.140029,0.575975)`. Overview connects raw matches to the resulting distribution with two magnitude panels; Standard adds the scaled-score intermediate and names both operations. Deep doubles the query with keys fixed: scores become `(4,2,6)` and weights approximately `(0.186694,0.045388,0.767918)`. A second figure compares the two distributions: order and normalization persist while concentration changes. Rounding is computed for display from full-precision results. Preserve lesson `03` and the queue's GPT-2 alias.

## ml-model-evaluation-training-diagnostics

During dropout training the held-out loss can track the training loss while held-out accuracy improves. [Source: d2l-dropout Figure 02](../../../../explain-on-canvas/handoff/figure-briefs/d2l-dropout/briefs.md#figure-02). Show one **Illustrative** prediction history; do not present it as a dropout or optimizer guarantee. Training and held-out loss share one vertical loss scale; held-out accuracy has its own scale and the same epochs. Overview summarizes the first and last results with fewer marks. Standard has exactly two comparison panels: both loss traces, then held-out accuracy. Deep retains the mechanism and adds a per-example check: H2 is already correct at the third epoch, but its probability of the wrong class falls from `0.40` to `0.32`, reducing its individual binary cross entropy while accuracy stays unchanged. Compute every loss and count from the recorded probabilities below. Preserve lessons `09,10` and the queue's framework/LeNet aliases.

## ml-model-evaluation-schedule-run-diagnostics

A fixed learning rate can keep improving the training metric after held-out accuracy levels off. [Source: d2l-lr-scheduler Figure 01](../../../../explain-on-canvas/handoff/figure-briefs/d2l-lr-scheduler/briefs.md#figure-01). Hold the stated learning rate at `0.1` across all four recorded epochs; the history is **Illustrative**, not a claim that this optimizer must produce these predictions. Overview contrasts the second and final training loss and correct counts. Standard uses two comparison panels: aligned training/held-out accuracy traces with the growing-gap region, and training loss on its own vertical scale. From the second to third epoch training accuracy rises from `75%` to `100%`, held-out accuracy stays `75%`, and the gap becomes `25` percentage points. Deep checks T2 against H2: the training probability crosses the decision threshold in the correct direction while the held-out case stays wrong, explaining the aggregate gap. Preserve lessons `09,10,12`; retain policy variants as aliases without claiming identical curves or guaranteed gains.

## ml-time-series-recursive-rollout

Rolling a predictor forward on its own outputs can amplify errors as measured inputs stop arriving. [Source: d2l-sequence Figure 15](../../../../explain-on-canvas/handoff/figure-briefs/d2l-sequence/briefs.md#figure-15). Use the new eight-reading series `(4,6,8,6,8,10,8,10)` at times `1` through `8`, the one-lag predictor `f(x)=x/2+1`, and forecast origin `4`. Compute the baseline mean `7.5`. At future times `(5,6,7,8)`, refreshed one-step inputs `(6,8,10,8)` produce `(4,5,6,5)`; feeding predictions back gives `(4,3,2.5,2.25)`, tending toward fixed point `2`, below the baseline. Overview shows the observed series and recursive result; Standard adds the matched one-step trace, marked origin, and a short categorical provenance panel: first/next inputs are measured/measured for refreshed forecasts and measured/predicted for recursion. No numeric table cells. Deep moves the origin to `5`: seed `8` yields `(5,3.5,2.75)` at times `(6,7,8)`, exposing the same fixed point with a changed seed. Preserve lesson `15` and framework aliases.

## ml-distribution-shift-input-distribution-shift

A training sample can teach a model a narrow version of the input domain even when both target classes are represented. Deployment inputs can look unlike training inputs while the task still uses the same class definitions. [Sources: d2l-environment-and-distribution-shift Figures 01–02](../../../../explain-on-canvas/handoff/figure-briefs/d2l-environment-and-distribution-shift/briefs.md#figure-01). Use the eight independently drawn cards below: tone is dark/light and shape is round/square; the known toy rule is A for round and B for square in both domains. Training has dark/light counts `3/1`; deployment has `1/3`, while class counts remain A/B `2/2` in each. Overview shows one example per class per domain with minimal trait text. Standard shows all four per domain, full trait names and the unchanged rule, as a pure comparison. Deep derives style counts from the two sample groups with a genuine count operation, then checks the unchanged class totals in a second comparison. Do not imply that deployment cards are transformed or paired training identities. Preserve lessons `19,20` and Figure 02's prompt verbatim.

## ml-distribution-shift-concept-shift

The same input can acquire different labels across settings when the labeling rule itself changes. [Source: d2l-environment-and-distribution-shift Figure 03](../../../../explain-on-canvas/handoff/figure-briefs/d2l-environment-and-distribution-shift/briefs.md#figure-03). Reuse the identical eight cards in invented studios Elm and Ash; Elm calls round cards A and square cards B, while Ash reverses those labels. Hold the input meaning and frequency fixed. The dark-round slice has three cards: Elm's A/B counts are `3/0`, Ash's `0/3`. Overview shows those output magnitudes; Standard states and applies the full naming rules with the operation label. Deep checks the light-square slice, whose counts reverse in the other direction, and the whole-input invariant: all eight input cards are identical, global class totals are `4/4` in both settings, but every card's label changes. These are invented naming settings, not observations about real regions. Preserve lesson `20`; keep A/B category names/order and shared class declarations wherever the schema supports them.

## Recorded toy inputs

Model evaluation has eight one-feature observations: training `(-2,0),(-1,0),(1,1),(2,1)` and held-out `(-1.5,0),(-0.5,0),(0.5,1),(1.5,1)`, written as `(feature,target)`. Predict class one exactly when its probability is at least `0.5`; derive mean binary cross entropy, correct counts, accuracy and percentage-point gaps from these probability histories, not from typed metric results:

| History | Epoch 1 | Epoch 2 | Epoch 3 | Epoch 4 |
|---|---|---|---|---|
| Dropout training | .4,.6,.4,.6 | .3,.45,.6,.7 | .25,.35,.65,.75 | .2,.3,.7,.8 |
| Dropout held-out | .4,.6,.4,.6 | .3,.55,.6,.7 | .25,.4,.6,.75 | .22,.32,.68,.78 |
| Fixed-rate training | .4,.6,.4,.6 | .35,.55,.6,.65 | .25,.45,.7,.75 | .15,.3,.8,.85 |
| Fixed-rate held-out | .4,.6,.4,.6 | .35,.55,.6,.65 | .3,.6,.65,.7 | .25,.65,.7,.75 |

Distribution-shift cards have two features, tone and shape; the domain is group metadata. The concept-shift check reuses these inputs and changes only the naming rule:

| Id | Domain | Tone | Shape |
|---|---|---|---|
| t1 | Training | Dark | Round |
| t2 | Training | Dark | Round |
| t3 | Training | Dark | Square |
| t4 | Training | Light | Square |
| d1 | Deployment | Dark | Round |
| d2 | Deployment | Light | Round |
| d3 | Deployment | Light | Square |
| d4 | Deployment | Light | Square |

## Implementation and verification

Each subject has one `topic-<subject>-data.js`, one `composition-<subject>-references.js`, and one focused arithmetic/reference test. First write and run the independent numeric tests, then implement `derived()` and the three depth specs. The coordinator adds registry/audit entries, generates previews and token/hash receipts with existing tooling, checks contracts, widths and wrapping, replays the unchanged library with planner kinds, and pushes one combined C02 data commit with a one-page batch report. Content specs are committed first. Claude Code owns integration gating (suites, property count, replay zero; no smoke), the authorized filename allowlist update, and release after both 133 and 134 are on main.
