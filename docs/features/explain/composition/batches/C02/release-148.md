# C02 — release 148 rebase

Branch `explain/composition-c02-r1`, original `10cab31e70ac1db654ab197e89ed6ef2dc48778e`, rebased parent `eb29478ee4875c5e62dcee5c360f37aa419dc8ae`. Reference content is frozen; exact original own-reference and own-single payloads match, and current parent entries survive. Renderer/schema/tooling unchanged.

Reference ids: `ml-attention-scaled-score-normalization`, `ml-model-evaluation-training-diagnostics`, `ml-model-evaluation-schedule-run-diagnostics`, `ml-time-series-recursive-rollout`, `ml-distribution-shift-input-distribution-shift`, `ml-distribution-shift-concept-shift`.

Snapshots regenerated from code, never conflict-merged: **3271 changed / 0 added / 0 removed**, compared with this branch's original snapshot file. Added/removed keys and all changed keys are in the evidence snapshot-diff.json. C01's18additions are the six C02 ids already on main at320/408/720.

Affected tests: **1395 total / 1394 passed / 1 failed / 0 skipped**. The sole failure reproduces on pristine main148: `packages/web/src/tutor-diagrams/figure-layout.test.mjs:70`, expected arrow stroke1.5 versus theme148 actual2. Snapshot check passes after regeneration. This is not a new reference-data failure; no test was weakened or skipped.

```bash
node --test packages/web/src/tutor-diagrams/*.test.mjs packages/control-plane/test/explanation-reference*.test.js packages/control-plane/test/explanation-plan-kind-from-reference.test.js packages/control-plane/test/explanation-composition-author-variants.test.js packages/control-plane/test/explanation-learner-keywords.test.js packages/control-plane/test/explanation-fast-chain.test.js
```

Fresh source-prompt and paraphrase replay with source-kind JEV plans: **3048 prior cases,0 moved identities,0 required-kind changes,13 planner-kind changes (only exact original own-single restoration),0 new collisions**. 13 emitted-kind changes restore exact originally authored own-single payloads; all are listed separately. Actual request/schema probes: **216**, maximum Gemini-reduced properties **319/362**. No live providers.

Evidence on `film/evidence`: [`docs/features/explain/checks/codex/explain/composition-c02-r1/`](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/film/evidence/docs/features/explain/checks/codex/explain/composition-c02-r1), including `contact-sheet.svg`, `index.html`, all408/720 raw SVG/spec assets, hashes, source-preservation, replay, test output and snapshot diffs. The sheet is actual production-renderer vector output with embedded Inter/KaTeX fonts; exact full native SVGs scale to the two requested widths without cropping. **Browser visual verification and PNG capture remain unavailable**: Chromium IPC denied; local-file preview rejected by browser policy. No raster/math substitution is represented as visual acceptance.

`ponytail:` no smoke, live calls, stack runs, CI dispatch, deploy or release. Owner reads every sheet before release; releases remain in chain order through the MVP path. Historical reports are retained below this newer receipt.
