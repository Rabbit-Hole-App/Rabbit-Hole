# C05 — recurrent models and training

Branch `explain/composition-c05`, based on C04 `744d3103f20f2871539d228b0fb3d213fc82cf36`. **4 NEW families / 5 source headings**, with exact aliases and per-source lessons in [the manifest](../../../../../../packages/web/src/tutor-diagrams/topic-recurrent-networks-sources.json). [Content specifications](content-specs.md), including visual corrections, precede code. The four old partial examples retain all payloads, data and lessons.

| Registered id | Overview | Standard | Deep (+ detail) | Learner keywords |
|---|---:|---:|---:|---|
| `ml-recurrent-training-gradient-horizons` | 94 | 266 | 165 (+249) | gradient segment horizons; forward versus detach |
| `ml-recurrent-training-shared-parameter-gradients` | 186 | 295 | 125 (+100) | loss state dependencies; shared gradient uses |
| `ml-recurrent-networks-recurrent-update` | 103 (+110) | 259 (+110) | 174 (+81) | activated recurrent update; fresh input readout |
| `ml-recurrent-networks-recurrent-next-token-training` | 98 | 283 | 120 (+99) | recurrent prefix supervision; teacher forced states |

[Compact token/hash receipts](token-budgets.json): **17 explicit visuals / 18 resolved depth views, maximum 295**. The 110-token Standard cell companion also reaches Overview through the existing production depth merge; both appearances are shown and counted. No resolver change. All Standard views are native; strict parent/single coverage remains **44/44**, all 54 prior pair receipts unchanged.

The continuous forward timeline remains unchanged across full/fixed/sampled gradient cutoffs. The explicit detach graph receives backward signal and terminates it before h4 while h4→h5 still passes forward state. Shared-parameter unrolls show one parameter feeding both updates; sensitivities and per-use contributions are computed from the declared losses. Independent central differences confirm their sum. The activation plot and readout bars expose negative preactivation→zero. Next-token comparisons use observed inputs; a computed wrong-guess counterfactual changes the next state, while teacher forcing retains the observed token. Training can change the hidden representation; downstream quality is not guaranteed.

[Full affected suites](full-tests.txt): **1,390 passed, 0 failed/skipped**. [Actual author schemas](actual-author-schemas.json): **300 primary + 148 detail validations**, normal/fast and planned/unplanned paths. [Replay](selector-replay.json): **3,204 exact prior cases, 0 moved**, **15/15 source/depth hits**, **0 same-kind collisions**; [paraphrases](paraphrase-replay.json) **60/60**. All **474 old reference payloads / 44 singles** remain byte-identical. [Independent review](review.md) includes numerical finite differences, identities, provenance, receipts and final mask orientation.

[Linter](linter-report.json): **0 applicable errors/warnings**, wrapping 0; two authorized composition-filename findings preserved. [Widths](width-receipts.json): all fit 680 px. The sampled mask now fits native 408 px; the existing coordinate-plot minimum is 420 px and remains readable at the sheet's 408 px scale. Standard plot panels 0. [Snapshots](snapshot-refresh.json): **12 added, 0 changed, 0 removed**, four NEW ids ×320/408/720. Inspected sheets: [Overview 5](contact-sheets/overview/contact-sheet.png), [Standard 5](contact-sheets/standard/contact-sheet.png), [Deep 8](contact-sheets/deep/contact-sheet.png).

Visual regressions were observed RED→GREEN: legacy pair rows duplicated graph identities until explicit graph layout was selected; rendered nodes now appear once. The six-column sampled mask forced 604 px at a 408 px request; transposing the same 12 cells into six state rows/two sample columns restored readability without omitting data.

Expressibility limits: no crossed-out gradient-edge style or arbitrary graph inset. Detach is an explicit terminating operation, and the cell mechanism is a separate full-width block-stack companion. Independent observed streams cannot be forced through a flow's one-root/process branching constraints; native connected relationship graphs preserve their semantics. Intervals encode segment length, not gradient direction. No renderer/schema/tooling/author-prompt change or numeric text-box workaround.

Historical unrelated dependency/fixture loads remain [documented under C02](../C02/broad-suite-failures.md). No whole-application green claim, provider call, smoke, build or deployment. Claude Code owns release gating.
