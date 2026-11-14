# C02 — distribution-shift tranche

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

**Integration limitation:** a separate sparse-lane broad web run had **2,746 pass / 351 fail**, including missing dependencies/fixtures; not every failure was classified. [Verification record](verification.json). **ponytail:** full web build/release validation remains with Claude Code after both **133 and 134** are on main: suites, property count, replay zero; **no smoke**. No live provider or stack run was performed. C03 is not started.
