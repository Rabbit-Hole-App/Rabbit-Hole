RED, DO NOT RELEASE: the parked PL-1 content-contract branches failed their gate and are not in the release queue.

# What is parked

The PL-1 renderer commit ships alone as release 135 (branch `explain/plot-point-notes-r2`, 75a6376330b9b05bda4096a119431c3be38b156d). Everything below is the part that was trimmed out of PL-1 (owner/reviewer scope trim 2026-11-14 00:06). Nothing here is deleted; none of it is on main.

| Branch | Tip | What it holds |
|---|---|---|
| `explain/plot-point-notes-contract` | dd3cb3948 | the content-contract rule + test + regenerated constraints sheet, on the renderer commit 8941863fa. No data fix, so it fails the two "validates" tests below on the unmodified references. |
| `explain/plot-point-notes-contract-2` | 352e398f5 | renderer commit 8941863fa + the rule + the two reference corrections, in one commit, on main 05d5f02f6. Never gated as such. |
| `explain/plot-point-notes-contract-3` | a3d7d4a85 | contract-2 rebased on main 581844afd (a6233c7d1 renderer, 6b7b5d88f rule + data fixes, a3d7d4a85 snapshots of the two figures). This is the branch the red gate below ran on. |

# What the rule and the corrections do

- Rule 1, `plot-point-label-coordinates` (content-contract.js): a plot point label that only restates the point (its own x or y, alone or as "(x, y)", with or without the series label) is flagged. `samples.showValues` prints each point's own y, so it is flagged once at the samples.
- Rule 2, `plot-point-label-count`: a plot with more than six labelled points is flagged.
- The constraints sheet (`scripts/topic-pipeline/agents/inputs/renderer-constraints.md`) is generated from the contract's own messages, so regenerating it on main added the two rules (2 lines).
- Data corrections, because the rule flags exactly two shipped references (both only in their deep-depth spec, 4 findings): `ml-trees-threshold-search` no longer prints each stem's own y (0.375, 0.1875, 0.2083) as a label (`lesson-decision-trees-references.js`, `thresholdPlot`; the caption still lists the exact scores), and `ml-trees-regression-step-fit` no longer sets `showValues: true` on the Depth 2 series (`lesson-decision-trees-regression-demo.js`). The picture is pixel-identical (natural-width PNGs compared, 0 differing bytes); only the marker `<title>` text and the svg root `aria-label` lost the repeated values.

# The gate on contract-3 (a3d7d4a85, base tree main 581844afd): RED

| Step | Result |
|---|---|
| tutor-diagrams | 1168 tests, 1164 pass, **4 fail** |
| pipeline (author-prevalidate test, checks the sheet is current) | 11/11 |
| figure-briefs | 7/7 |
| web unit | 6795 tests, 6763 pass, **4 fail**, 27 skipped (the same four tests) |
| web build | exit 0 |
| property count | max 358 <= 362 |
| planner-kind replay vs main | 0 first picks moved |

The four failing tests (all in packages/web/src/tutor-diagrams; the data corrections break them, the rule itself is not the cause):

1. `ml-trees-threshold-search validates, meets the budget and is picked first at all depths` (lesson-decision-trees-references.test.mjs:22): it pins the sha256 of each reference's spec JSON in `lesson-decision-trees-token-budgets.json`; the corrected detailed spec hashes differently.
2. `ml-trees-regression-step-fit validates, meets the budget and is picked first at all depths` (same test, same file): same pinned hash, changed by removing `showValues`.
3. `scatter and threshold plots use fixture coordinates and recomputed split scores` (lesson-decision-trees-references.test.mjs:67): asserts the detailed threshold stems carry the labels ['0.375', '0.1875', '0.2083']; they are now undefined.
4. `the sine series has 25 equally spaced samples and both step fits predict the displayed leaf means` (lesson-decision-trees-regression-demo.test.mjs:33, assertion at line 64): asserts `shallow.samples.showValues === true` exactly at the deep depth; it is now undefined.

The rule branch alone (dd3cb3948, no data fix) fails tests 1 and 2 for a different reason: the references themselves are flagged by the rule.

# Where the logs are

`C:/s/spec/release-queue/PL1-contract-3-parked/`: `PL1-gate-run.log` (one line per step), `PL1-step-<name>.out` (each step's own output: tutor, pipeline, figbriefs, webunit, build, props, replay), plus the gate and release scripts as they were for contract-3 (`gate-PL1.contract-3.sh`, `prep-PL1.contract-3.sh`). The renderer-only gate on 8941863fa (green) is in `PL1-renderer-only/`.

# What would be needed to unpark them

1. Update the four tests above to the corrected data: re-pin the two sha256 values in `lesson-decision-trees-token-budgets.json` for the two corrected references, drop the label assertion in test 3 (the stems carry no labels now), and change test 4's `showValues` assertion to `undefined` at every depth.
2. Rebase onto the main of the day, regenerate `svg-snapshots.json` for the two figures (6 entries), and re-run the tier-1 gate with the contract tests included: tutor-diagrams, pipeline test, figure-briefs, web unit, build, property count <= 362, replay 0.
3. After the contract lands on main, rebuild the pipeline constraints sheet on `topic-pipeline-fixes` (`node scripts/topic-pipeline/build-renderer-constraints.mjs`; it reads content-contract.js and adds the two rules). That rebuild belongs to the pipeline owner; the branches there were not touched.
4. A fresh reviewer decision to release it (it is out of the queue now).
