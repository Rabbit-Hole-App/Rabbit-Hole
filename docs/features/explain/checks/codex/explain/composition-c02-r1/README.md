# C02 — release 148 rebase

Branch `explain/composition-c02-r1`, original `10cab31e70ac1db654ab197e89ed6ef2dc48778e`, rebased parent `eb29478ee4875c5e62dcee5c360f37aa419dc8ae`. Reference content is frozen; exact original own-reference and own-single payloads match, and current parent entries survive. Renderer/schema/tooling unchanged.

Reference ids: `ml-attention-scaled-score-normalization`, `ml-model-evaluation-training-diagnostics`, `ml-model-evaluation-schedule-run-diagnostics`, `ml-time-series-recursive-rollout`, `ml-distribution-shift-input-distribution-shift`, `ml-distribution-shift-concept-shift`.

Snapshots regenerated from code, never conflict-merged: **3271 changed / 0 added / 0 removed**, compared with this branch's original snapshot file. Added/removed keys and all changed keys are in the evidence snapshot-diff.json. C01's18additions are the six C02 ids already on main at320/408/720.

Affected tests: **1395 total / 1394 passed / 1 failed / 0 skipped**. The sole failure reproduces on pristine main148: `packages/web/src/tutor-diagrams/figure-layout.test.mjs:70`, expected arrow stroke1.5 versus theme148 actual2. Snapshot check passes after regeneration. This is not a new reference-data failure; no test was weakened or skipped.

```bash
node --test packages/web/src/tutor-diagrams/*.test.mjs packages/control-plane/test/explanation-reference*.test.js packages/control-plane/test/explanation-plan-kind-from-reference.test.js packages/control-plane/test/explanation-composition-author-variants.test.js packages/control-plane/test/explanation-learner-keywords.test.js packages/control-plane/test/explanation-fast-chain.test.js
```

Fresh source-prompt and paraphrase replay with source-kind JEV plans: **3048 prior cases,0 moved identities,0 required-kind changes,13 planner-kind differences,0 new collisions**. Classification of all 13 planner-kind differences: **"authored single restored over main's matrix fallback"** — this is authored content coming back, not a regression. The 13 corresponding emitted-kind differences restore the exact originally authored own-single payloads; every case is listed separately in `selector-replay.json`. Fresh actual request/schema probes through `prepareArtifactAuthorRequest` and Google `stepRequest`: **216**, maximum Gemini-reduced properties **307/362**. No live providers.

Evidence on `film/evidence`: [`docs/features/explain/checks/codex/explain/composition-c02-r1/`](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/film/evidence/docs/features/explain/checks/codex/explain/composition-c02-r1), including `contact-sheet.svg`, `index.html`, all 408/720 raw SVG/spec assets, hashes, source-preservation, replay, test output and snapshot diffs. The sheet keeps the accepted C01 layout: 1210 px wide, 408/720 px columns, embedded Inter/KaTeX fonts, and complete native SVG viewports scaled without cropping. All **30 views / 60 renders** include Overview, Standard, Deep main/detail and the six authored singles. The owner rasterises the SVG sheet; this receipt claims deterministic vector evidence, not browser or raster visual acceptance.

C01 caption audit (owner follow-up, 2026-11-16): the Deep linear-unit caption is dollar-delimited TeX, `$\Delta\hat y=w_A\Delta a$`, and goes through the product KaTeX path. The malformed `Deltaŷ` appearance comes from the native SVG caption fallback in `primitives.js`, where replacing `\hat y` first makes the preceding `\Delta` command absorb the `y`. The reference is not plain text, so the conditional reference-only correction does not apply. Keep the chain content frozen; any fallback/display correction is a separate follow-up after C13. Details are in the evidence `c01-caption-audit.json`.

`ponytail:` no smoke, live calls, stack runs, CI dispatch, deploy or release. Owner reads every sheet before release; releases remain in chain order through the MVP path. Historical reports are retained below this newer receipt.

Published branch tip: `16718410f212ab664a3948ea047fda615f43e424`; tree: `2b6fc8e422cec26e94ab484f4ace5a7860f79104`.

Fresh tests ran on this exact tip. Replay and source-preservation ran on `7a9dd67a4098e3f82bb2a8dd89f622c14da31951`; `git diff --quiet` verifies that the published update changes the receipt only, with no package source changes.

The [SVG sheet](contact-sheet.svg) and [HTML gallery](index.html) use the accepted C01 layout. Reproduction scripts are under `tooling/`; the render script takes the C01 evidence directory as its final argument to reuse the approved shell and embedded fonts.

All raw asset hashes and viewports were checked; `render-verification.json` records the deterministic geometry checks. Test output is in `tests.txt`; each of the 13 restored planner-kind cases is classified in `selector-replay.json`.
