# C01 — regularization tranche

Branch: `explain/composition-c01`. Schema base: **1944b48cf**; queue approved at **9288dca9d**. The content-first commit is **2409cff028b1f96ecd57603e769b13e1e2e788d8**. This batch is one data release, with each reference's subject and lesson metadata preserved.

| Reference id | Overview | Standard | Deep / extra | Learner keywords |
|---|---:|---:|---:|---|
| `ml-linear-regression-linear-unit` | 132 | 199 | 198 / 109 | affine unit; weighted feature sum |
| `ml-neural-networks-hidden-layer` | 131 | 226 | 232 / 212 | hidden feature layer; nonlinear hidden features |
| `ml-regularization-regularized-objective` | 143 | 206 | 207 / 163 | penalized objective; regularization cost |
| `ml-regularization-dropout-mask` | 135 | 297 | 298 / 150 | temporary dropout mask; inverted dropout |

Numbers are compact **cl100k_base** tokens per visual, including the version wrapper; extras are counted separately. All **16 visuals ≤ 300**, largest **298**. [Token/hash receipts](../../../../../../packages/web/src/tutor-diagrams/topic-regularization-token-budgets.json).

The four [content specifications](content-specs.md) preceded code. One [shared data module](../../../../../../packages/web/src/tutor-diagrams/topic-regularization-data.js) computes every result from four two-feature rows; the [walkthrough](../../../../explain-on-canvas/handoff/phase02-library/topic-walkthroughs/regularization.md) records inputs and parameters. Five new tests independently recompute predictions, hidden activations, penalties, and all dropout masks. The expectation check applies to the stated **linear readout**.

**Replay:** [2,649 prior cases, zero moved](selector-replay.json), across all three depths and 446 prior reference payloads. All prior payloads remain byte-identical after JSON serialization. The four source prompts select their intended reference **12/12**; the supplied [paraphrases pass 60/60](paraphrase-replay.json). This is offline replay with deterministic source-kind JEV plans through the shared coverage/selector path, with `plannedKinds` and `requiredKinds`; no live planner calls. **Selected same-kind collisions: 0.**

**Checks:** **68 passed, 0 failed, 0 skipped**, including composition/plot suites, linear-regression tests, content contract and regenerated SVG snapshots. [Linter receipt](linter-report.json): **0 content/security errors, 0 warnings; rule 12: 0 errors**. The raw rule-11 output also contains **two stage-05 path-gate findings** for the explicitly authorized `composition-neural-networks-references.js` and `composition-regularization-references.js` names. These filename exceptions are recorded, not hidden; the pipeline allowlist is unchanged.

**Contact sheets:** [Overview — 4](contact-sheets/overview/contact-sheet.png) · [Standard — 4](contact-sheets/standard/contact-sheet.png) · [Deep — 8](contact-sheets/deep/contact-sheet.png). Every figure was inspected at the exporter's 408 px contact size. [Previews](previews/manifest.json) include requested 408, natural and 960 px exports; wide compositions retain the renderer's native scrolling width.

**Expressibility:** per-neuron wiring and greying inside panels remain unavailable; C01 uses symbolic block stacks and numeric zeroing. Basic bars cannot declare a shared numeric axis, so ReLU and dropout magnitude checks use supported stems on matching axes. The objective's deep comparison uses equal-scale bars to keep its unchanged data loss visually invariant. No renderer/schema/tooling or author-prompt changes.

**Release base:** release 133 was not yet on main at the final check (`2dcffe58`). The authorized rebase remains due when it lands. C02 is not started. Flow-return audit recorded in the vocabulary study: **1 of 22**, low priority.
