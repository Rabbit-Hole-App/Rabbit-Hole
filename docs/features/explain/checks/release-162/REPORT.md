# Release 162-start-2: report

Release name: 162-start-2
Release SHA (full): b3b54c3b3ef5a0dd8ff4564c00151c365c45a63b (branch feat/release-162 = tip of feat/start-2, two commits on main c56e4fcc8de12ab2fc114fc15c8bb1cbc0858993 = release 160, which is in production since 3:47 PM PT; main is an ancestor: a fast-forward; main was still c56e4fcc8 when this was written)
Recovery branch: recovery/start-2-162, tip 7af4b4c1ccf72c9ab78a6467e8d2b2887fcbc4a9 (one commit, the tree of main on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r162-int.tryrabbithole.workers.dev (build 6be3da9518f6; MVP record f22277ce1204293f; returns 200; first attempt passed; broad CI and the release gate recorded as bypassed; refs/notes/dev-deploys NOT pushed)
Launcher: C:\s\spec\release-queue\release-162-start-2.cmd (a mirror of 161's, CRLF 64 lines). Pins: C:/s/spec/release-queue/162-start-2.pins; preview script preview-162-start-2.mjs; runner run-preview-162-start-2.sh; W = C:/s/r162-int (clean, at the SHA).

## What is in it (5 files, +35/-17; no behaviour change, no flag, no migration, no UI change)
- ddbc2e1c7: two unused `resolveTarget` imports removed (`learn-next-steps-routes.js`, `web/src/learn-next-steps.js`). They pulled `learn-target.js` and with it every nanogpt card (src/nanogpt/cards/*, depth/*) into the worker at start. The worker bundle is 1 MB smaller.
- b3b54c3b3: `tutor-diagrams/spec.js` builds its zod schemas and JSON schemas on first use, not at import. The old exports stay as lazy read-only views; `authorJsonSchema()` is the value for code that embeds the author schema; `learn-primitives.js` reads it through a getter (and `explain-celeris-dev.js` follows). `directions` and `figureAnchors` stay at module level because code outside the builder uses them.
- Not done (named in the Reviewer's order): the reference library (about 80 ms: `reference-library.js` and the reference data modules still build at import).

## Startup CPU and bundle size (the mandatory section; same machine, local profile, not Cloudflare's CPU)
- Bundle: before (main c56e4fcc8, the 160 bundle) Total Upload 10149.83 KiB / gzip 2573.73 KiB; after 9073.82 KiB / 2297.14 KiB (-1076.0 KiB, -10.6 %; gzip -276.6 KiB).
- `wrangler check startup` ACTIVE ms (total minus the (idle) self time), six alternating runs each, quiet machine (no lane running; the preview had finished; two peer sessions idle):
  - before: 377, 407, 433, 376, 291, 386 -> median 381.5, mean 378
  - after: 362, 268, 263, 302, 252, 216 -> median 265.5, mean 277
  - difference: median -116 ms, mean -101 ms (first-run pair: 377 vs 362 only -15: the first runs of each batch are the slowest, cache cold). Total (incl. idle ~120 to 150 ms): before about 500 to 580 ms, after about 330 to 500 ms.
- The Reviewer's target was at least 120 ms off; the median difference is 116 ms and the mean 101 ms: just under, not over. Honest reading: about 100 to 115 ms active startup removed, from two changes (the two imports about 70 ms; spec.js about 45 ms).
- Per-module self time before (160 bundle, run 3) vs after (162 bundle, run 3), ms: zod core.js 20.4 -> 6.4; zod schemas.js 18.7 -> 18.1; zod util.js 17.2 -> 11.4; zod classic schemas 15.7 -> 4.7; nanogpt c18-train-val.js 16.5 -> gone; zod to-json-schema 10.6 -> 4.0; tutor-diagrams spec.js 7.7 -> gone from the top; 'unknown' (module-init glue) 107.7 -> 69.5; garbage collector 21.2 -> 6.5. Full tables: C:/s/spec/startup/lead-A3 / lead-B3 profiles through startup-by-module.mjs.
- What is left (after, top self time): zod schemas.js 18 ms (other schema modules still built at import), native 22 ms, reference-data modules (topic-what-is-machine-learning-data 5.5 ms, d2l-figure-references 3.6), katex 3.5, raster-pixels 3.5.
- Production upload attempts of release 160 (the refusal rate at about 370 ms of local active startup): workflow run 44421043879, build cba43b3d4779372b, the same bundle all three times: attempt 1 started 3:28 PM PT, refused 3:30 with Cloudflare 10021 (startup CPU limit); attempt 2 started 3:36 PM, refused 3:38 with 10021; attempt 3 started 3:45 PM, passed 3:47 PM PT. Two refusals in three uploads. The 162 bundle's local active startup is about 100 to 115 ms lower than that bundle's; Cloudflare's own CPU is not known, so how much margin that buys is not known.

## Tests and guards (one process per suite, 0 fail)
- 470 request hashes (C:/s/var-1-tools/hashes.mjs) identical to main (cmp of h-main160.json and h-start2.json); 474-row planner replay identical (replay-main160.json vs replay-start2.json); svg-snapshots.test.mjs passes with svg-snapshots.json untouched; the whole tutor-diagrams test directory 1,368 tests passed on the branch.
- Fast path on b3b54c3b: affected tests web 1150, control plane 481, smoke 293, 38/38 explain-program render checks, 0 fail. The first version of the spec.js change broke 17 tests (`figureAnchors` was needed outside the builder); fixed by leaving `directions` and `figureAnchors` at module level, the 17 tests pass.

## Decisions for the Reviewer
1. The reference library lazy-build (about 80 ms) is not in 162; it is the next biggest item. A second pass could take it, or leave 162 as is.
2. 161 (HEAT-1 + the ILL-2 fix) rebases onto this release when it lands.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-162-start-2.cmd   (only after the Reviewer has read this report)
