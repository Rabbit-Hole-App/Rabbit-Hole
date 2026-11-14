# C04 — BERT and transfer learning

Branch `explain/composition-c04`, based on C03 `b6346aacfa85dc789f1e31f3ecc4336d892791b9`. Seven approved families: **3 NEW + 4 REUSE**, preserving **8 source headings**, verbatim prompts, aliases and per-source lessons in [the manifest](../../../../../../packages/web/src/tutor-diagrams/topic-bert-sources.json). [Content specifications](content-specs.md) and the connected-graph correction precede code. No old lesson/visual/data payload changes.

| Queue family | Registered reference | Mode | Tokens Overview / Standard / Deep (+ extra) | Added learner keywords |
|---|---|---|---|---|
| modality-feature-classifier | `ml-transfer-learning-modality-feature-classifier` | NEW | 82 / 97 / 102 (+102) | modality classifier pattern; feature extractor analogy |
| pretraining-lineage | `ml-bert-pretraining-families` | REUSE | 135 / 127 / 134 | pretraining encoder lineage; architecture objective lineage |
| supervised-class-pairs | `ml-bert-supervised-class-pairs` | NEW | 79 / 108 / 112 (+147) | adaptation message pairs; text class supervision |
| summary-token-readout | `ml-bert-summary-token-readout` | NEW | 128 / 164 / 95 (+149) | summary row projection; contextual readout scores |
| masked-token-objective | `ml-bert-masked-token` | REUSE | 147 / 152 / 154 (+90) | missing token supervision; bidirectional recovery target |
| next-sentence-objective | `ml-bert-next-sentence` | REUSE | 93 / 92 / 105 | supplied passage adjacency; original pair objective |
| task-head-positions | `ml-bert-task-heads` | REUSE | 125 / 135 / 143 | encoder readout positions; summary token span |

The modality comparison retains separate extractors, feature spaces and classifiers. Message/class pairs retain supplied targets under reordering. CLS grids retain all ordinary/special token rows; numeric bars derive raw logits from the selected contextual row and declared linear head. The probe changes only already-encoded non-CLS rows, keeping CLS/head fixed; changing input words is not claimed to preserve CLS. Figure 09 retains source lesson 01; Figure 10 retains alias lesson 03. Four supported REUSE overlays add only exact prompts and narrow keywords.

[Full affected suites](full-tests.txt): **1,371 passed, 0 failed/skipped**. [Actual prepared schemas](actual-author-schemas.json): **324 primary + 84 detail validations**, normal/fast and no-plan/source-kind JEV paths. [Replay](selector-replay.json): **3,135 exact prior cases, 0 moved**, **24/24 source/depth hits**, **0 same-kind collisions**; [paraphrases](paraphrase-replay.json) **45/45**. All 471 old reference payloads and 44 singles remain unchanged except the four additive prompt/keyword overlays. Strict parent/single equality remains **44/44**; all 54 prior pair receipts are unchanged. [Independent review](review.md): no unresolved Important/Critical findings.

[Token/hash receipts](token-budgets.json): **25 visuals, maximum 164**. Native Standard views need no new author single/pair. [Linter](linter-report.json): **0 applicable errors/warnings**, wrapping 0, two authorized composition-filename findings preserved verbatim. [Widths](width-receipts.json): all fit 680 px; Standard plot panels 0. [Snapshots](snapshot-refresh.json): **9 added, 0 changed, 0 removed**, limited to three NEW ids at 320/408/720. Inspected 408 px sheets: [Overview 7](contact-sheets/overview/contact-sheet.png), [Standard 7](contact-sheets/standard/contact-sheet.png), [Deep 11](contact-sheets/deep/contact-sheet.png).

Expressibility limits: native relationship graphs require one connected component, and panels cannot contain relationship children, so two independent modality paths cannot be shown together in that graph layout. The native matrix preserves the complete comparison; separate Deep block-stacks show each path without a false fusion edge. Symbolic feature slots do not reproduce an actual image backbone or encoder. Arbitrary tensor-row selection and readable dense half-width heatmaps remain unavailable; full-width highlighted grids and a separate score chart preserve the supported point. No schema/renderer/tool/prompt change or numeric text-box workaround.

Historical unrelated dependency/fixture loads remain [documented under C02](../C02/broad-suite-failures.md). No whole-application green claim, provider call, smoke, build or deployment. Claude Code owns release gating.
