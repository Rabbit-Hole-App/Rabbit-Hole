# Release 164 (release B), NEW CANDIDATE after START-3b: START-3 (fixed) and GEN-1 R1: report

This report REPLACES the one for 87339cd7e (NO-GO, see the banner kept at the top of that file, film/evidence checks/release-164/REPORT.md history). Release name: 164-start-3.
Release SHA (full): a88949c27578184b4e037d0ee2c4d7c7b3911ae3 (branch feat/release-164b = main a2736974f5b2f86df977dc189e42dd1632230684 (release 163) plus feat/start-3 a6843bf61 and feat/gen-1-r1 f874ac15f; main is an ancestor: a fast-forward; main was still a2736974f when this was written). One trivial merge conflict (the import line of learn-artifact.js: both sides' names kept: referenceLibraryReady from START-3 and plannedBundleKinds from R1), committed as the merge.
Recovery branch: recovery/start-3b-164, tip c515415b816af8ab06e2311406c28f446c04e9ad (one commit, the tree of main on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r164-int.tryrabbithole.workers.dev (build e71c814ccde5; MVP record 36a03e87c4b254ca; returns 200; first attempt passed; broad CI and the release gate recorded as bypassed; refs/notes/dev-deploys NOT pushed)
Launcher (NOT to be handed to the owner before the Reviewer's read): C:\s\spec\release-queue\release-164-start-3.cmd (CRLF 64 lines, pinned to a88949c27578). Pins: 164-start-3.pins; preview script preview-164-start-3.mjs; runner run-preview-164-start-3.sh; W = C:/s/r164-int (clean, at the SHA).

## The fault and the fix (START-3b)
Fault (Reviewer): `referenceLibraryReady()` was awaited only on /api/ paths (dev-worker.js:125, index.js:2548), while the roadmap alarm path `RoadmapJobs.alarm()` (roadmap-jobs.js:38) -> runDueRoadmapEvents -> the `step_accepted` handler (roadmap-wire.js:76) -> generationHandler -> generateRoadmapCard -> generateArtifact -> selectForAuthor -> selectWithSteer (default argument `referenceLibrary().diagramReferences`, explanation-references.js:104) throws in an isolate that served no /api/ request, and roadmap-events.js:74 would swallow it as a retry. The earlier report's sentence that Durable Objects, queue and scheduled handlers need no preload was wrong: a static import trace misses the roadmap handler registry; the check must follow call paths.
Fix (feat/start-3 a6843bf61): every async function that owns a library read awaits `referenceLibraryReady()` first: `generateArtifact` (learn-artifact.js; covers roadmap generation, the typed card and the inline card), `quoteRoadmapCard` (roadmap/roadmap-generate.js; covers the advanceCourse and step quotes), `runCodeExplain` (learn-code-explain.js). The two fetch-handler awaits stay. roadmap-events.js is untouched.

### Entry-point table (call paths)
| Worker entry | reaches a library read? | call path |
|---|---|---|
| web fetch (app-worker.js -> dev-worker.js) | yes | respond -> /api/learn/artifact -> artifactFetch -> generateArtifact; /api/learn/inline/generate -> inlineGenerateFetch -> generateArtifact; /api/learn/roadmap/* -> roadmapRoute -> quoteStepAcceptance / generationHandler -> quoteRoadmapCard / generateRoadmapCard -> generateArtifact; ask -> codeExplainTurn -> runCodeExplain |
| web scheduled | yes | scheduledRoadmapKick -> runDueRoadmapEvents (learner-scope events inline) -> registered handler -> generateRoadmapCard or the advanceCourse quote; board-scope events kick RoadmapJobs |
| web queue | no | moment-index consumer only |
| control-plane fetch (index.js) | yes | apiAsk -> codeExplainTurn -> runCodeExplain; chat capability route -> learn-inline -> generateArtifact |
| control-plane scheduled | no | no roadmap or generation imports |
| RoadmapJobs.alarm | yes | runDueRoadmapEvents -> registry handler step_accepted (roadmap-wire.js:76) -> generationHandler -> generateRoadmapCard -> generateArtifact; and advanceCourse -> quoteRoadmapCard |
| RoadmapJobs.fetch | no | stores scope, arms the alarm |
| ExplainJobs, LearnVideos, LearnScenes, RepositoryImports, CadJobs, ImageJobs, AnimationJobs, FileJobs, WhiteboardJobs, RepositoryRehearsals | no | no reader imported or called |

### The five cold-Worker tests (no synchronous loader: `no-sync-loader.mjs` deletes `process.getBuiltinModule`; cold module state; no /api/ request first; each asserts a delivered card, quote or figure)
| scenario | test file | fixed tree | old 87339cd7e |
|---|---|---|---|
| (a) step_accepted generation plus the advanceCourse quote | cold-worker-a-roadmap-step-accepted.test.js | 20 of 20 | RED: 15 of 20 fail |
| (b) cron scan kicks the object, alarm runs a due event, card generated and valid | cold-worker-b-scheduled-kick.test.js (new) | 1 of 1 | RED: "read before referenceLibraryReady() was awaited" |
| (c) code-explain turn | cold-worker-c-code-explain.test.js | 26 of 26 | 2 fail |
| (d) inline card | cold-worker-d-inline.test.js | 13 of 13 | green on old too: those tests inject the generator, so (d) does not prove the inline path; the path is covered by (e) through generateArtifact |
| (e) typed card | cold-worker-e-typed.test.js | 23 of 23 | 3 fail |
(a) and (b) were run RED on an archive of 87339cd7e in a scratch directory, so C:/s/r164-int was not edited. The five tests are in the preview's smoke.

## The two parts
Part 1: START-3 (+ the START-3b fix): the reference library is built on first use (about 116 ms of worker start spread over about 60 module bodies): reference-library-lazy.js with `referenceLibraryReady()` (async, once per isolate) and `referenceLibrary()` (sync; throws an explicit error in a Worker if not preloaded); checks/start-3/start-3-build.md has the mechanism (its 'no preload' statement is superseded by this report). Part 2: GEN-1 R1 (G5, unchanged and accepted: plan-narrowed one- or two-kind schema, planned kinds kept for Gemini, an over-limit log; R1 bench report checks/gen-1/r1/R1-BENCH-REPORT.md).

## Tests (one process per suite, 0 fail)
Fast path on a88949c2: affected tests control plane 1136 (the whole control-plane suite ran), smoke 364 (svg-snapshots, kind-gallery, kind-gallery-depths, reference-library-lazy, the five cold-Worker tests, explanation-gemini-plan-bundles, explanation-references, explanation-fast-chain, explanation-gemini-illustration-bundles, explanation-planner, explanation-vary, learn-artifact, roadmap-course), 38/38 explain-program render checks. START-3b alone: tutor-diagrams plus theme 1412 tests, 24 fast-path tests, the control-plane reader files 79 plus the lazy test, 970 tests. The 470 request hashes and the 474-row replay identical to main; svg-snapshots.json untouched. Not run: browser checks, release-mvp.sh --check (the launcher runs it), a Worker-runtime request against the clone (it refuses sign-in): after release the owner checks one /explain card, one code-explain turn and one roadmap card on production.

## Bundle and startup (quiet machine: CPU 13 % at the start of the first session; local profile, not Cloudflare's CPU)
Bundle: 163 Total Upload 9081.33 KiB / gzip 2299.30 KiB; this candidate 9085.82 KiB / 2300.21 KiB (+4.5 KiB). Active startup (total minus idle), six alternating runs, 163 bundle (A) vs candidate (B): A 194, 223, 194, 229, 195, 218 (median 218), B 144, 121, 171, 157, 175, 138 (median 157): **-61 ms**, every candidate run below every 163 run. Swapped order, candidate (A) vs 163 (B): A 188, 127, 156, 190, 149, 137 (median 156), B 197, 202, 269, 437, 217, 354 (median 269): -113 ms, with load rising to 34 % during the later 163 runs (not a clean figure). The earlier quiet START-3 measurement against 161 was -93 ms. So the lazy library still pays about 60 to 110 ms at worker start after the fix; the fix did not change the lazy structure.

## Decisions for the Reviewer
1. Read this report; the launcher then goes to the owner.
2. GEN-1 R2 (feat/gen-1-r2 7407494e9) merges this release before its own release: its `libraryRefs()` body becomes `referenceLibrary()` and the same preload rule applies to the seeded-examples path (it is reached through generateArtifact).
3. The inline path (d) has no cold-Worker test that exercises it end to end; (e) covers its shared generateArtifact.
