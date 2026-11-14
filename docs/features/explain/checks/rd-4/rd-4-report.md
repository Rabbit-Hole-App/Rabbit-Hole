# RD-4: renderer fixes for the geometry lint's remaining classes

Branch `explain/rd-4`, three commits on the release 145 candidate `71415b6b8` (RD-2 + RD-2b + RD-2c + RD-3). Renderer only: `flow.js` (and the lint reads one new field), no reference or content change. Status when this report was written: the SVG snapshot rows are NOT regenerated yet (the snapshot step waits for the heavy lock), so `svg-snapshots.test.mjs` is red on this branch until the next commit.

## The three commits (each its own commit; drop one and the others stand, except the shared snapshot commit that follows)

| Commit | Class | Change | Lint violations cleared |
|---|---|---|---|
| RD-4c | D, text outside a capsule | `capsuleRadius`: an outcome capsule keeps the full pill (radius = half the shorter side) while every text line lies inside its rounded ends, else the largest smaller radius that does. The lint reads the node's `radius`. | rule d: 8 in 6 references |
| RD-4b | B, near-aligned verticals | A port whose vertical leg runs closer than 6 px to another edge's vertical moves along its node edge to 8 px from it (the later edge first). Middle legs (lanes) and side branches are never moved. | rule b: 2 in 1 reference (`figure-parallel-residual-sublayers`: `s:j` leg moved from x=224 to x=228) |
| RD-4a | A2, sibling labels at different heights | Branches whose runs and labels sit side by side share one lane (opposite directions, contiguous lanes). Otherwise the wires keep their own 12 px lanes and the labels of the node's branches share one more lane below them, each on its wire's last vertical leg; the labels must fit side by side (default wrap, else a narrower one). | rule a: 14 in 6 references |

Red tests first: `flow-capsule.test.mjs`, `flow-wire-gap.test.mjs`, `flow-lanes.test.mjs` each failed on the 145 candidate and pass with their fix.

## The lint after RD-4: 0 violations, baseline empty

Release 145 candidate: 24 violations in 10 references (a 14, b 2, c 0, d 8, e 0). After RD-4: **0 violations**, `geometry-lint-baseline.json` is `{}`. Two runs of the lint over every reference are byte-identical (`after-run1.txt` and `after-run2.txt`, both empty, `cmp` identical).

**One fallback to know about.** If a node's labels cannot share a height (they are too wide to stand side by side even with a narrower wrap, or one would touch a wire that passes through the shared lane), the node is laid out again with its own lanes and labels exactly as in release 145. The lint still reports rule a for such a node, so a NEW reference cannot ship with it (the author shortens the labels). No existing reference falls back. In `convergingFlow` (the three-approval fixture in `flow.test.mjs`) the senate node falls back, and its Yes and No labels stay inline at different heights as before.

## What changed in the flow-test fixtures whose pinned digests moved (looked at as PNG, before = 145 candidate)

Files: `fixtures/<name>.before|after.png|svg`.

**Swallow card (the owner's card), natural width 283 px.** Height 469 to 443 (-26). The Yes and No labels moved from different heights (y 291 and y 317) to one height (y 291); the Yes and No wires are the same routes. The two outcome capsules were circles at 104 px high whose text corners cut the curve; their radius is now 50 and 48 instead of 52 and 52, so the text sits inside the shape. At 320 px and 408 px the rendered SVG is byte for byte unchanged (checked with cmp on the two files): only the natural width changed. Looks better, not worse: the labels are aligned and no text touches the capsule outline.

**Triage (3-branch decision), 408 px.** Height 332 to 320 (-12); 720 px: 320 to 308 (-12). The labels Bug, Question and Feature stood at y 182, 208 and 234 (Question floated alone in the middle of the fork); they now stand at one height y 220, each centred on its wire just above its target. Looks better: one row of labels, a cleaner fork.

**Same-side decision (the Yes/No pair whose two targets are on one side), 408 px.** Height 340 to 342 (+2); 720 px: 312 to 314 (+2). The Yes and No labels stood on the wire runs at y 228 and 254; they now stand at one height (y 254), each on its wire's last vertical leg above the arrow. Two pixels taller, labels aligned. Neutral to better: the label now sits next to the arrowhead instead of on the horizontal run.

## The 10 worst offenders at the lint's natural width (before = 145 candidate, after = RD-4)

Files: `renders/<id>.before|after.svg` (and `.png` for six of them). Sizes are natural layout width x height.

| Reference (depth) | Before | After |
|---|---|---|
| ml-bagging-vote-flow (spec) | 382 x 420 | 382 x 408 |
| ml-gpu-matmul (spec) | 506 x 552 | 506 x 488 |
| ml-batch-score-fallback (spec) | 258 x 678 | 258 x 644 |
| ml-what-is-machine-learning-model-choice (overview) | 258 x 459 | 258 x 435 |
| ml-what-is-machine-learning-dataset-split (standard detail) | 456 x 232 | 456 x 220 |
| ml-logistic-regression-log-loss (overview) | 268 x 271 | 268 x 245 |
| figure-parallel-residual-sublayers (overview) | 327 x 520 | 327 x 520 (one wire moved 4 px) |
| ml-robot-arm-pickup (spec) | 134 x 686 | 134 x 686 (capsule radius only) |
| ml-word2vec-neural-predictor (overview) | 134 x 468 | 134 x 468 (capsule radius only) |
| ml-logistic-regression-linear-unbounded (overview) | 159 x 278 | 159 x 278 (capsule radius only) |

Note: the lint measures the narrowest layout (`layoutFlow(diagram, 0)`). Which of the SVG snapshot rows (320, 408, 720) change is not known until the snapshot step runs; the changed ids with before/after sizes will be listed with that commit.

## Tests (each run singly)

`geometry-lint.test.mjs` 9/9, `flow.test.mjs` 21/21, `flow-capsule.test.mjs` 2/2, `flow-wire-gap.test.mjs` 2/2, `flow-lanes.test.mjs` 4/4, pipeline `geometry-lint.test.mjs` 3/3 (rewritten: the baseline is empty, so it now proves the lint on a synthetic fork whose labels cannot share a height), `check-map.test.mjs` 22/22. `flow.test.mjs` had three pinned digests re-pinned (swallow at natural width, triage, same-side), each after the before/after look above.
