# GEN-1 R2: merge with main and Codex's pool, sheets fix, bench harness (Agent Z; feat/gen-1-r2 7407494e9)

The lead wrote this from Agent Z's text; no provider call, nothing refused.

## Merges and conflicts
Main a2736974f (release 163) merged cleanly (804d0ff34). Codex's rebased pool tip 293511c1b merged (c57cab4f8): conflicts in reference-library.js (2 hunks) and svg-snapshots.json (6 hunks); in every hunk our side was empty and theirs only appended, so the union is Codex's lines (10 imports and entries, 180 snapshot lines; the JSON validates). The library is now 492 references (470 + 22 pool references); every kind has at least 3 examples (pool table 426 / 407 / 407), so the gallery fill is unreachable with this library. The two pool tests that went red were updated.

## Guards (main a2736974f tree against the merged tip)
470 request hashes: 0 of the existing changed, 22 new keys (the pool-* ids); whole-request check: 0 changed, 22 new; 474-row replay identical. Web: svg-snapshots, kind-gallery 28, kind-gallery-depths 126, set3 token budgets, reference-content-contract, ml-reference-integration 496, the tensor / layers / figure / argument / transformation pool tests, kinds-fit 41: all pass. Control plane: the broad run had 3 failures: two stale pool tests (fixed) and a workerd D1 concurrency test that passes alone (flake under load); the whole broad suite was not re-run after the pool-test fix.

## Pool sheet and the sheets.mjs fix
checks/gen-1/r2/pool-sheet.png (12 new references at 408 px, read by the Reviewer: accepted for R2). `C:/s/gen1-r3pre/sheets.mjs` now scales a tile wider than its 408 px column to fit and notes the scale in the tile's kind line (cell 5 at 79 %, cell 9 at 70 %, cell 12 at 79 % fit; cell 13's regenerated sheet not opened); the A/B key regenerates identical, salt.json stays local, the old script is sheets.mjs.bak-before-fit; sheets in C:/s/gen1-r3pre/sheets-fixed/. The KaTeX stylesheet for formula captions (Lane 3's note) is not yet loaded by the sheet generator.

## R2 bench harness (C:/s/sprint2-evidence/gen1-r2-bench/, copies in checks/gen-1/r2/bench/; trees C:/s/gen1-r2-trees/{before,after})
Run: `cd C:/s/sprint2-evidence/gen1-r2-bench; node run.mjs --out results.jsonl` (resumable; default stop line US$1.20 settled; stop after 3 consecutive Gemini errors). Report: `node report.mjs results.jsonl > report.md` (first: planner-kind and effective-plan-kind rates; roadmap path separate; tested on the R1 results: effective-kind rate 96 %, matching the spec's figure). Sheets: `node sheets.mjs results.jsonl sheets/` (AFTER cards for the no-match, numeric and SAME-1 questions, three seeds side by side, kind above each card; tested on R1 data). Plan: 132 items, 264 runs: 180 google-low (30 questions x 3 seeds x 2 arms), 60 fireworks-low (10 questions), 24 roadmap runs (12 cards x 2 arms). Offline checks: all 15 no-match questions match no library reference, all 5 on-topic ones do. Dry-run: estimate US$1.0, stop line US$1.20; roadmap quote (hold) of the first card BEFORE 21,782 micros against AFTER 32,282 (+48 %: the 4,500-character examples room plus the plan delta).

## What the lead must know
- Roadmap cards run in process: each tree's own `authorInput` and `quoteRoadmapCard`, repairs 0, one call: not the full roadmap workflow with its money rows; the AFTER arm gets the bench seed (production makes its own at dispatch).
- Budget: US$3.57 left for R2 and R3 together still holds (R2 about US$1.0). The bench has not been run.
- START-3: the seeded examples read the library only through `libraryRefs()` in explanation-library.js; after release 164 that one body becomes `referenceLibrary()`.
Not checked: cell 13's regenerated sheet; a live roadmap request with a seed; any provider call.
