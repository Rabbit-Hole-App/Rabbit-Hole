# C03 — Transformer

Branch `explain/composition-c03`, based on fixed C02 `f9634af3c` and release133 `a8ef11d64`. Six approved families: **3 NEW + 3 REUSE**, with **17 source headings / 14 unique prompts** traced in [the source manifest](../../../../../../packages/web/src/tutor-diagrams/topic-transformer-sources.json). The [content specification](content-specs.md) precedes implementation. Source lessons remain local to each association; only the explicitly authorized memory catalog lesson `01` is added.

| Queue family | Registered reference | Result | Tokens: Overview / Standard / Deep (+ extra) |
|---|---|---|---|
| cross-attention-alignment | same id | NEW | 101 / 136 / 96 (+130) |
| context-rules | same id | NEW | 93 / 225 / 234 (+116) |
| encoder-decoder-memory | same id | REUSE | 181 / 181 / 184 |
| contextual-layer-states | same id | NEW | 120 / 173 / 179 (+126) |
| cross-position-and-positionwise | `ml-transformer-positionwise-feedforward` | REUSE | 219 / 218 / 225 |
| decoder-sublayers | `ml-transformer-original-decoder-sublayers` | REUSE | 200 / 211 / 217 |

NEW ids above have prefix `ml-transformer-`. Full-width alignment grids distinguish target queries from source keys, exclude padding and derive normalized weights and context from the shared toy data. Deep's feature bars expose the computed weighted sum; its extra changes only query scale. Context grids show permissions rather than probabilities. Slot diagrams preserve order/width and distinguish lookup from contextual states and separate learned parameter sets. REUSE visual/data payloads remain unchanged. Keywords and exact aliases are recorded in the source modules; no generic keyword expansion or old-pick movement.

[Full affected suites](full-tests.txt): **1,361 passed, 0 failed/skipped**. [Actual author schemas](actual-author-schemas.json): **192 primary + 30 detail checks**, plus **51 planned source checks**. [Replay](selector-replay.json): **3,048 exact prior cases, 0 moved**, **51/51 source/depth hits**, **0 same-kind collisions**. [Paraphrases](paraphrase-replay.json): **45/45**. [Token/hash receipts](token-budgets.json): **21 visuals, maximum 234**, plus the **93-token context-rules single**; strict parent/single equality **44/44**, all 53 prior pair receipts unchanged. [Linter](linter-report.json): **0 applicable errors/warnings**, with the single authorized composition filename exception retained verbatim; wrapping 0. [Widths](width-receipts.json): all fit 680 px; Standard plot panels 0.

[Snapshots](snapshot-refresh.json): **9 added** for the 3 NEW ids at 320/408/720, **0 changed, 0 removed**. Three inspected 408 px sheets: [Overview](contact-sheets/overview/contact-sheet.png), [Standard](contact-sheets/standard/contact-sheet.png), [Deep](contact-sheets/deep/contact-sheet.png), containing 6/6/9 views. Initial visual QA found reversed fixed token-link roles and unreadable half-width grids; content-first revisions replaced them with native full-width views and meaningful SVG regressions. [Independent review](review.md) and subsequent targeted review cover the final correction.

Expressibility limits: the detailed d2l Transformer Figure 01 alias requires several existing supporting views; the memory overview alone is not a complete rendering. Linear block-stacks cannot show arbitrary routed joins/all tokenwise edges. Fixed token-link source/target labels cannot express the translation roles faithfully. Dense ordered heatmap children lose readability at 408 px; these views therefore use a depth split. Larger hidden vectors remain outside the bounded eight-cell tensor view. No new renderer/schema/tool/prompt or numeric text-box workaround was introduced.

Historical unrelated dependency/fixture-load failures remain [documented under C02](../C02/broad-suite-failures.md). This report covers the full affected diagram/reference-author suites; no provider call, build, browser smoke or deployment. Claude Code owns the release gate.
