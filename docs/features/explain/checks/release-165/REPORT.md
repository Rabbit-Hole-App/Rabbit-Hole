# Release 165 (r2-checks): GEN-1 R2 + NUM-3a + NUM-3c + SAMP-1 + MAT-E: report

Release SHA (full): a42d5e0f1f01f337702101d96410b31073abeb23 (branch feat/release-165; main a88949c27 (release 164) is an ancestor: a fast-forward, checked on the remote).
Recovery branch: recovery/r2-checks-165, tip ac132475a62c5c901b21843ef0429a3e9ecc1df3 (one commit holding main's tree on top of the release SHA).
Clone: https://rabbit-hole-web-dev-r165-int.tryrabbithole.workers.dev (build fa21f845403d; MVP record 5612a32ed217e0fd; GET /library serves /static/app-DjBCJb-H.js; broad CI and the release gate recorded as bypassed; refs/notes/dev-deploys not pushed).
Launcher (not handed to the owner before the Reviewer's GO): C:\s\spec\release-queue\release-165-r2-checks.cmd (pins 165-r2-checks.pins; preview-165-r2-checks.mjs; worktree C:/s/r165-int, clean at the SHA).
Preview history: the first preview run passed every test and the build and then failed at the Cloudflare deploy with code 10067, "No more than 500 Durable Object namespaces are allowed": not the code. I deleted only my own four released-release preview clones (rabbit-hole-web-dev-r161-int to r164-int; not the other sessions' older clones) and the second run passed on attempt 2.

## Contents, by commit (branch order)
- 977638a4b: GEN-1 R2 merged with release 164 (merge a8a0683c1 kept both imports in roadmap-generate.js: archiveExplanation and referenceLibraryReady); `libraryRefs()` in explanation-library.js is now `referenceLibrary().diagramReferences`. R2 carries: G1 seeded examples (up to three examples from the reference library for the planned kind), G2 the examples heading with the inputs sentence, G6 the quote hold for the examples room (examples cap 4,500 characters x2 bytes + 26,000-byte plan delta) and the roadmap planner reading title and goal only; Codex's pool: 22 new reference diagrams (the library is 492 references; pool tests follow the full pool, every kind has 3 or more).
- 3269f7e81 (merge of feat/num-3c): NUM-3a 69e006eb5 (the softmax recompute also starts on the word on the before or after label and on 'exponential and normalize') and NUM-3c 397a45028 (softmax in a grouped bar chart with two series is recomputed). Report: checks/num-3/NUM-3C-REPORT.md.
- 6942cf9e1 (merge of feat/samp-1): SAMP-1 2a36bbd6e (rows named as repeating or omitted must be drawn so). Report: checks/num-3/LANE3-QUEUE-REPORT.md.
- a42d5e0f1 (merge of feat/mat-e): MAT-E cf5c0afb6 (a matrix column that is all empty or dashes is rejected) and d6e88dbd9 (the cell-padding correction that produced such a column is removed; equal-short rows go to repair; no saved card newly moves). Reports: LANE3-QUEUE-REPORT.md and LANE3-QUEUE-2-REPORT.md.
No flag, no migration, no UI change. Not in 165: BOX-1, NOVIS-1, NUM-3d, kinds-fit r4, LBL-1, FRAC-1, kindLimits.

## Cold-Worker tests, including the seeded typed and roadmap cards
No synchronous loader (`no-sync-loader.mjs`), cold module state, no /api/ request first. Release 164's five (a to e: roadmap step_accepted plus the advanceCourse quote, scheduled kick, code-explain, inline, typed) are in the preview's smoke. R2 adds, in 977638a4b: cold-worker-f-typed-seeded (a seeded typed card with a planned kind and no stored reference carries the seeded examples), cold-worker-g-roadmap-seeded (a seeded roadmap generation, the step_accepted path, carries them), cold-worker-h-examples-read (the accessor the seeded examples read the library through is START-3's synchronous reader: in a simulated Worker it throws before referenceLibraryReady() is awaited and works after). Because the seeded-examples path is reached only through generateArtifact, which awaits referenceLibraryReady() first (release 164's START-3b fix), the preload rule already covers it. I re-ran the six on the 165 tree: cold-worker a, b, e, f, g, h: 48 tests, 48 pass, 0 fail.

## Tests (the preview's own runs; one process per suite)
Affected-test runs 1295 of 1295 and 930 of 930 pass; the smoke (svg-snapshots, kind-gallery, kind-gallery-depths, reference-library-lazy, cold-Worker a to e, plan bundles, references, fast-chain, illustration bundles, planner, vary, learn-artifact, roadmap-course, explanation-validation, diagram-kinds, diagram-corrections, prose-numbers, derived, spec, ml-statistical) 519 of 519; 38 of 38 explain-program render checks; 0 fail anywhere. Not run: browser checks; the release-mvp.sh --check (the launcher runs it).

## Request hashes and replay
Against main a88949c27 (hashes.mjs): the 470 existing request hashes (Gemini schema, author body, Gemini request, Fireworks request per library reference): 0 moved; 22 new keys (the pool-* ids); whole library 492 keys; max Gemini properties 350. 474-row planner replay (int8-replay.mjs): identical (474 of 474 rows). svg-snapshots.json: the 22 pool entries are new, the existing ones unchanged (the R2 merge guards, Agent Z). The NUM, SAMP and MAT changes are validation-side and do not touch requests.

## Bundle (wrangler dry-run, prod config; Total Upload)
Main a88949c27: 9085.82 KiB / gzip 2300.21. This candidate: 9155.78 KiB / gzip 2319.41: +69.96 KiB (+19.20 gzip). Split (approximate; each part measured on its own tree): R2 code alone on release 163 (commit 804d0ff34, no pool): 9119.24 / 2309.54 against release 163's 9081.33 / 2299.30: +37.9 KiB (+10.2 gzip); the four checks alone on main a88949c27 (NUM-3c line, SAMP-1, MAT-E): 9092.24 / 2301.82: +6.4 KiB (+1.6 gzip); the rest, the 22 pool references and their interactions, about +25.6 KiB (+7.3 gzip).

## Startup (local profile; not a quiet machine)
Two alternating six-run sessions of the main bundle against the candidate, 'wrangler check startup', active ms = total minus idle; medians are the mean of the two middle runs: session 1 (CPU 52 to 55 %): main 188 ms, candidate 192 ms; session 2 in swapped order (CPU 37 to 55 %): candidate 264.5 ms, main 313.5 ms. Both sessions ran while other lanes were testing, so the machine was NOT quiet and no figure is reliable: the two orders disagree in sign (+4 and -49 ms), i.e. no measurable difference. I did not get a quiet window before this report; if wanted I measure once the lanes stop. (Release 164's report quoted upper-middle medians: its true medians were 206.5 ms for 163 and 150.5 ms for 164, i.e. -56 ms, not -61.)

## GEN-1 R2 bench, for the record (checks/gen-1/r2/bench-results/)
264 runs, US$0.778 settled: first attempt valid 90 % against 79 %, repairs 14 against 31, moved to the next provider 3 against 16, honest failures 0 against 2, cost per 120 questions -18 %; variety no better (distinct structures per prompt 3.00 against 2.93).

## After the release (production checks)
The owner's three production checks from release 164 (a typed card, a code-explain turn, a roadmap card) were not reported when this was written. For 165 add: one /explain card on a topic with a library reference (the seeded examples path) and one roadmap card.
