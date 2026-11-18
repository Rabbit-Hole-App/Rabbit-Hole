# Release 161-heat-1: report

Release name: 161-heat-1
Release SHA (full): 1ad846a684632be8829a14a5e222cd16d89fbb56 (branch feat/release-161 = tip of feat/heat-1 = main c56e4fcc8de12ab2fc114fc15c8bb1cbc0858993 merged into e5c1edae2; main is an ancestor: a fast-forward; main was still c56e4fcc8 when this was written)
IMPORTANT: main is already c56e4fcc8 (release 160's commit) but production still runs release 159: the 160 production upload was refused twice by Cloudflare with code 10021 "Script startup exceeded CPU time limit" (run 44421043879). Release 161 contains 160's commits (it fast-forwards from main). If 161 is released before 160 succeeds, 161 ships both and carries the same 10021 risk; the 160 launcher is the one to run (again) first.
Recovery branch: recovery/heat-1-161, tip 13dd1e89297fa0a576ec3e9c7a688f0bab0971ce (one commit, the tree of main on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r161-int.tryrabbithole.workers.dev (build ce456fb51c1e; MVP record c39fb2da2f73ce66; returns 200; first attempt passed; broad CI and the release gate recorded as bypassed; refs/notes/dev-deploys NOT pushed)
Launcher: C:\s\spec\release-queue\release-161-heat-1.cmd (a mirror of 160's: number, pin name and SHA changed; CRLF). Pins: C:/s/spec/release-queue/161-heat-1.pins; preview script preview-161-heat-1.mjs; runner run-preview-161-heat-1.sh; W = C:/s/r161-int (clean, at the SHA).

## What is in it (4 files beyond main; no flag, no migration, no UI change)
- `ml-statistical-spec.js`: new `checkHeatmapDrawn`, called from `checkHeatmap`; two rules, both `code: 'arithmetic'` like the bootstrap precedent, so a card that breaks them gets one repair (a second same-model repair for the heatmap kind) and then the step fails with `explanation_bad_numbers`; it is never delivered wrong and never dropped or simplified. Kind-only wording (no topic words); a `shortcut:` comment marks the mirror pattern as not built.
  - Contrast (rule D): every numeric cell has one value AND that value is the one drawn with no fill (range min, 0 for a signed range, range max when the range is at or below 0). Null cells are ignored.
  - Diagonal: a square grid (n >= 2) with every cell above the diagonal null and at least one numeric cell must have a numeric diagonal.
- Tests: ml-statistical.test.mjs 3 new (28 total), explanation-fast-chain.test.js 3 new (27 total: second same-model repair, then explanation_bad_numbers with nothing delivered), explanation-visual-fallback.test.js 1 new (10 total).
- Not in it: the mirror pattern (decided), NUM-2, GEN-1, kinds-fit.

## Proof (rebuilt 155 card and the library)
- All 110 library and gallery heatmap specs (39 ids) parse with the repo's own `parseTutorDiagram` after the merge with main c56e4fcc8: 0 fail. `ml-transformer-causal-mask`: 6 of 6 pass.
- The rebuilt 155 card (heat-1/prep/causal-mask-card.json) fails both rules with the arithmetic code; the idx-56 shape (diagonal allowed, every cell 0) fails rule D only.
- Survey the Reviewer asked for: 453 saved records with a heatmap (37 distinct grids): 0 half correlation matrices with the diagonal omitted. The one grid with a blocked diagonal under a blocked upper triangle is the failing causal-mask card itself.
- The evidence checker (C:/s/sprint2-evidence/card-errors/checks.mjs, outside the repo) now skips constant grids and blocked-triangle grids in heatmap-weights-should-sum-to-1; the old copy is checks.mjs.before-heat1 (4 added lines).

## Tests (one process per suite, 0 fail)
Fast path on 1ad846a6: affected tests web 28 (ml-statistical, 1 file), control plane 37 (explanation-fast-chain, explanation-visual-fallback), smoke 247 (svg-snapshots, kind-gallery, kind-gallery-depths, derived, ml-statistical, explanation-visual-fallback, explanation-fast-chain, explanation-validation), 38/38 explain-program render checks, 0 fail. The affected selection is small because only the validator and the tests changed; the library crawl above stands in for the library-wide check. Not run: the whole suites, browser checks, release-mvp.sh --check (the launcher runs it).

## Startup CPU and bundle size
- Bundle: 160 = Total Upload 10149.83 KiB / gzip 2573.73 KiB; 161 = 10151.17 KiB / 2574.09 KiB (+1.3 KiB, +0.4 KiB gzip).
- `wrangler check startup`: NOT reportable. Six local profiles were taken while five build lanes were running on the machine: 160 bundle 557, 802, 1022 ms; 161 bundle 749, 690, 772 ms. These are loaded-machine numbers (160 alone measured 451 to 509 ms an hour earlier), so I do not report them as a comparison; re-measure when the lanes are paused.
- Context for the 10021 refusal of 160 in production: a local profile of the 160 bundle (C:/s/gen1-prep/startup-by-module.mjs) shows about 370 ms of active startup, of which reference-library construction about 80 ms, zod schema construction about 65 ms, nanogpt cards about 20 ms. Local CPU is not Cloudflare's, so how close production is to the limit is not known.

## Decisions for the Reviewer
1. Run order: 160 again first (one retry), then 161; do not release 161 first.
2. A start-up reduction ticket (START-2: build the reference library and zod schemas on first use) if 160 is refused a third time.
3. The learner-visible effect of 161: a card that keeps writing a blank or diagonal-blocked heatmap now fails the step ("try again") instead of being delivered wrong; the delivered-card rate for that kind of prompt can fall until the author stops writing the shape.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-161-heat-1.cmd   (only after 160 is on production and the Reviewer has read this report)
