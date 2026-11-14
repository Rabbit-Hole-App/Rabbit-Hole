# Release 136 build-phase notes (composition fork, 2026-11-14)

Branch `explain/composition-136` (pushed), head `3f6de6e41` = a8ef11d64 + Codex C01 (ed586cbce, 11adf988a = `explain/composition-c01-r1`) + two commits of mine. Waiting for `BASE = <135 candidate sha>`; nothing heavy has run.

## What C01 changes (Codex, 107 files, all additions except 4 small edits)
- tutor-diagrams: `composition-regularization-references.js`, `composition-neural-networks-references.js`, `topic-regularization-data.js`, `-replay-cases.json`, `-token-budgets.json`, `topic-regularization-composition.test.mjs`; edits to `reference-library.js` (+3), `reference-learner-keywords.json` (+16), `svg-snapshots.json` (+60), `topic-linear-regression-references.js` (+24: the linear-unit panels reference).
- docs only: `docs/features/explain/composition/**` (queue, vocabulary study, C01 REPORT, content specs, linter and replay reports, 81 preview files, three contact sheets) and the `regularization.md` walkthrough.
- No control-plane, no web app, no config, no migration, no phase02 illustration folders. Scope = data + references + tests + docs: inside the approved scope. Nothing needs a decision on scope.
- `explain/composition-c01` (767ba06c4, on 1944b48cf) and `explain/composition-c01-r1` (11adf988a, Codex's own rebase onto a8ef11d64) carry the same 107 file list; I built on the r1 line (no conflicts).

## Primitives
Four panels references (linear-unit, hidden-layer, regularized-objective, dropout-mask) use panels, block-stack panels, plain and stacked bar charts and coordinate plots: all on main since 133. No new primitive.

## Findings that changed the plan (all fixed in my two commits)
1. `git ls-files` is now 1,052,020 bytes; `scripts/ci/check-map.test.mjs` line 14 reads it with the default 1 MiB buffer (`ENOBUFS`), so the ci step fails with C01's files (base: 1,041,892 bytes). One-line fix (`maxBuffer: 1 << 26`, as line 48 already does). THE SAME WILL HAPPEN TO ANY LATER RELEASE THAT ADDS ~6 KB of paths if 136 is not first: 134 and 135 are small, but 137+ should rebase onto this fix.
2. C01's four panels references had no one-diagram variant, so `preferSingleVariants` would have sent the panels kind to the author. `reference-single-variants.js` now derives, for every panels reference without an authored variant, its answer panel (the last panel of the standard figure) as the variant; the parents-count test goes 33 -> 37; set3 token pairs added (linear-unit 199/36, hidden-layer 226/36, regularized-objective 206/56, dropout-mask 297/77 tokens panel/single).
3. The `regularized-objective` snapshot rows (320/408/720) and its 12 preview SVGs (base, balanced, detailed, detailed-detail) were rendered before release 133's two-place value formatting (VC-1); regenerated. No other C01 row or preview changed. The three PNG contact sheets in `C01/contact-sheets` also predate VC-1 for that figure and were NOT regenerated (Codex's tooling).

## Pipeline plumbing (rule 11)
`scripts/topic-pipeline/checks/reference-linter.mjs`, function `isAllowedAuthoredPath` (line 351 on main; the line sits right after the `topic-<topic>-...` regex at line 357 of main). Added: `composition-<subject>-references.js` in the diagrams folder (any subject, `.js` only). Test: `scripts/topic-pipeline/test/reference-linter.test.mjs` (rule 11 allowlist test, 17/17). `topic-pipeline-fixes` has the same function at line 380 (its regex line 386): it needs the same added line after line 386; I did not touch that branch. Related but NOT changed: stage 05's own `allowed()` in `stages/05-integrate.mjs` (line 27) is a per-topic list for topic commits; a composition lane does not run stage 05.

## Rebase plan onto BASE (the 135 candidate)
- My branch = a8ef11d64 + 4 commits. 134 (canvas-cards, 16 files own changes) has no overlap with my files. 135 (PL-1, 1 commit, 4 files) overlaps only `svg-snapshots.json` (and changes `ml-plot-layouts.js` / `ml-plot-spec.js`, which my coordinate-plot panels use).
- Steps: `git rebase --onto BASE a8ef11d64` on a new branch (`explain/composition-136r`, not Codex's names); resolve `svg-snapshots.json` by taking BASE's file and re-running `UPDATE_TUTOR_SVG_SNAPSHOTS=1` (that keeps both sides' rows by construction), then diff against BASE and list every changed row (expected: only C01 plot rows PL-1 intends to move); regenerate previews of any C01 reference whose rows changed; `check-map.json` rows are additive.
- Gate: `BASE_SHA=<sha> BASE_TREE=<worktree of BASE> bash gate136.sh` (stacked, data-only, heavy lock around each step), then `MAINWANT=<sha> bash prep136.sh finish`, MVP record via `make-preview-136.cjs`.

## C02 (136b)
`explain/composition-c02-r1` (5b5f54a6e) HAS landed: C01-r1 + C02 (1c357f824 spec, f5d6d7c74 data, 5b5f54a6e docs), 162 files over c01-r1: four more composition reference files (attention, distribution-shift, model-evaluation, time-series), their data, tests, receipts, replay cases, docs; walkthrough `distribution-shift.md`. Plan: 136b = cherry-pick those three commits onto 136's SHA, then the same fixes (singles + receipts + parents count, snapshot rows, VC-1 previews), data-only gate stacked on 136, MAINWANT = 136's SHA. Codex's `broad-suite-failures.md` is a sandbox inventory (missing packages), not a finding about the data; its one real assertion (parents count 33 vs 37) is the one fixed here.

## Decisions needed (design choices on Codex's data: the reviewer's; none blocks)
1. Which leaf is each reference's one-diagram variant: I chose the answer panel (last panel of the standard figure): regularized-objective -> the stacked "Objective parts" bar; dropout-mask -> the "Training output" plot; hidden-layer -> the "Output" bar; linear-unit -> the "Output" bar. Their titles are terse ("Output").
2. The C01 contact-sheet PNGs predate VC-1 for the regularized-objective figure.
3. `git ls-files` size: consider a permanent fix elsewhere (the check-map test now has a 64 MiB buffer).
