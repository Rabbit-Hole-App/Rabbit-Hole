# C02 — distribution-shift tranche

Latest release133 correctness fix: [ten linked author variants, strict equality, green suites and replay](fix-133/REPORT.md). This supersedes the open assertions in the earlier rebase receipt.

Current rebase: `explain/composition-c02-r1` on release 133; [fresh checks and open assertions](rebase-133.md). Counts and previews below are the original pinned-1944 receipts.

Branch `explain/composition-c02`, stacked on approved C01 `767ba06c4`; schema remains `1944b48cf`. Content-first commit: **343d91f8a378c5b2200276624ffb8ec952be1e70**. One C02 data release covers the six approved ids; each keeps its subject/lesson metadata.

| Reference id | Overview | Standard | Deep / extra | Learner keywords |
|---|---:|---:|---:|---|
| `ml-attention-scaled-score-normalization` | 159 | 254 | 229 / 169 | attention score scaling; scaled match weights |
| `ml-model-evaluation-training-diagnostics` | 164 | 281 | 298 / 151 | dropout metrics; loss accuracy traces |
| `ml-model-evaluation-schedule-run-diagnostics` | 167 | 298 | 300 / 285 | fixed rate plateau; training heldout gap |
| `ml-time-series-recursive-rollout` | 185 | 293 | 295 / 268 | recursive rollout; forecast feedback |
| `ml-distribution-shift-input-distribution-shift` | 171 | 248 | 75 / 75 | input style shift; fixed class rule |
| `ml-distribution-shift-concept-shift` | 133 | 154 | 168 / 140 | conditional label change; changed naming rule |

All **24 visuals ≤ 300 compact cl100k_base tokens**, including their version wrappers; maximum **300**. Extras are separate budgets. [Token/hash receipts](../../../../../../packages/web/src/tutor-diagrams/topic-distribution-shift-token-budgets.json). The [content specs](content-specs.md) and [computed walkthrough](../../../../explain-on-canvas/handoff/phase02-library/topic-walkthroughs/distribution-shift.md) record raw inputs and the arithmetic; four data modules drive every result. Training histories are explicitly **Illustrative**, not optimizer guarantees.

**Replay:** [2,721 prior cases, zero moved](selector-replay.json); all **450 prior reference payloads unchanged**. Six canonical prompts plus the Figure 02 alias hit **21/21** at three depths; [paraphrases 90/90](paraphrase-replay.json). This is offline source-kind JEV-plan replay through the existing coverage/selector helper with planner/required kinds, not a live-planner gate. **Selected same-kind collisions: 0.**

**Checks:** **92/92 focused tests pass**, including independent arithmetic, schema/content, existing renderer suites and regenerated SVG snapshots (**18 added, zero prior fingerprints changed**). [Linter](linter-report.json): **0 applicable errors, 0 warnings**, wrapping included; four raw rule-11 findings are solely the authorized composition filenames. Claude Code adds their allowlist entries at release. No renderer/schema/tooling changes.

**Contact sheets:** [Overview — 6](contact-sheets/overview/contact-sheet.png) · [Standard — 6](contact-sheets/standard/contact-sheet.png) · [Deep — 12](contact-sheets/deep/contact-sheet.png). Every final view was inspected at 408 px. [Width receipts](width-receipts.json): every visual fits **680 px**, and Standard has at most **two plot panels**. Comparisons use existing vertical stacking; Deep input-shift statistics are two full-size figures. Attention display rounding and shorter epoch labels prevent split decimals and cramped bars.

**Expressibility:** no new-kind gap remains for this batch after those depth/figure splits. C01 is unchanged.

**Historical broad-suite failures:** **2,746 passed / 351 failed** in the sparse lane. The [complete file/assertion inventory](broad-suite-failures.md) reconciles every failure: **122 dependency loads** (one provisional), **228 source/fixture loads**, **0 timing failures**, **1 changed-data assertion**. The latter is `reference-single-variants.test.mjs:17`: 37 parents versus 33 singles in that lane; integrated C01+C02 has 43 parents and still 33 singles. The following variant-set equality also needs disposition. These failures are not all outside the reference directory. [Classification summary](broad-suite-summary.json).

**Release-133 rebase:** C01 and C02 are rebased onto **a8ef11d64**, without conflicts and with all authored specs/data unchanged. [Current checks and exact failures](rebase-133.md) supersede the original pinned-tip receipts above. Claude Code owns the release gate: suites, property count and replay zero; **no smoke**. C03 is not started.
