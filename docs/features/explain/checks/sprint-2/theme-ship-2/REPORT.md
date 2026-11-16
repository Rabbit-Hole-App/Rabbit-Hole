# Release 150-explain: report

Release name: 150-explain
Release SHA (full): 5f29c23a6a3c5cc40b8bc813a53d517d854c3e79   (branch feat/visual-sprint-2, base = main 74c4f68aeba1384336418c5230528138ef8ec113, release 149)
Recovery branch: recovery/visual-sprint-150, tip 21f506ee06ebd8ced3b6a5feeb69713373b1f0af (one commit, the tree of main 74c4f68ae on top of the release SHA)
Clone: https://rabbit-hole-web-dev-s2-prev.tryrabbithole.workers.dev (worker rabbit-hole-web-dev-s2-prev; build f04724bb5253; MVP record ce564b4533e9d676, in the shared git dir rabbit-hole-dev-deploys.jsonl; refs/notes/dev-deploys NOT pushed)
Smoke: node packages/web/e2e/explain-program-render-check.mjs  (passed in the preview run; GET /library serves /static/app-g93KYENs.js)
Pins: C:/s/spec/release-queue/150-explain.pins and release-150-explain.cmd (W = C:/s/s2-prev, a clean worktree at the SHA)

## Affected tests (uncovered files included)
- Preview run, the fast path's own selection on the release SHA: web 1533 tests, 0 fail; control plane 624 tests, 0 fail.
- Whole packages/web suite (so the 2 uncovered files are in it) on the pins commit 69179904c: 7108 tests, 10 fail. 7 of them were the saved-SDK tests, fixed by fix 4 (514 of 514 pass in the SDK, runtime and scene files); 3 are still red and are red on main too (list below).
- Control plane: 57 tests naming the 4 changed sources plus a 333-file importer closure: 3671 tests, 1 fail (fix 5, now green).
- Still failing on released main 74c4f68ae AND on this tree, not in the selection, not edited: web motion-ownership.test.mjs, render-freshness.test.mjs, figure-layout.test.mjs (TEST-1, arrow stroke 1.5).

## Evidence (film/evidence, docs/features/explain/checks/sprint-2/theme-ship-2/ at ba5de9a52, republished with the final files below)
- repins.md (every pin with its moving commit; the fixes; what fails at main), repins-flow/plot/cp.md and .patch
- audit-2/diff.md and audit-2/wider-than-720.txt: 1090 ids at 408, before 74c4f68ae, after the tip's rendering source: 0 render errors, 0 ids wider than 720 (the over-720 list is empty), 240 ids carry at least one flag (142 straight->smooth, 52 markers-changed, 48 width-changed, 22 elements>30%, 2 text-overflow); 22 paired sheets
- sheets/: the whole library at 408 and 720 (25 sheets)
- theme-guard-tip.txt: stray-hex lint 0 files, index.css matches palette.js, palette-guard and stray-hex tests 3 of 3
- fixes/1..5 (hunk and before/after each), preview-150.txt, web-suite-final.txt

## Fixed unattended
1. fixes/1, 51226e544: flow labels beside the drops of one node stand at one height (geometry lint rule a failed for ml-batch-score-fallback; FLOW-X option B introduced it).
2. fixes/2 (in the pins commit 69179904c): a point callout is never dropped; with no free cell in the plot it takes the margin above the plot area at its point's x, leader to the ring. Bell at 408 re-shot (before/after).
3. fixes/3, 241bb3e51: the bench copy of the planner kind text carries the production flow and timeline lines (set3-bench.test.mjs asserts they are one text).
4. fixes/4, c24486f76: the eight explain-program/sdk-*.js sources embed SDK_ROLES (ROLES without 'operator') again, so the saved SDK fingerprints in stamps.js match. THE CAUSE IS IN RELEASE 149: its ROLES change (operator) moved the bytes of every saved SDK version; 7 tests ("saved SDK bytes remain unchanged") have been red on main since. I have not verified what production does with a saved program whose SDK hash no longer matches: please treat as a possible live defect until checked.
5. fixes/5, 5f29c23a6: the Gemini unsteered-bundle size pin 134 -> 136 properties and 9,832 -> 9,977 characters (stale since sprint 1's 7fcc07d0d; same value on main).

## Decisions taken unattended
- THEME-2 is in 150 (the cutoff was met: lint 0, 494 renders byte-identical; RASTER_SOURCE is byte-identical to main, sha256 668a28a10a8df8bb). Alternative: 151.
- IllustrationFigure.jsx colour #1f2937 became ink #32211C and the #FFFCF0 fallback was dropped. Alternative: keep #1f2937 as a listed exception.
- PLT-4 amendment: one optional boolean, markers, was added to the plot series schema (ml-plot-spec.js), the owner's amendment text. Alternative: keep the 0.5 px rule only.
- PLT-2(B): at 408 the bell's dense spec still has "One standard deviation above" standing low inside the band and the "Within one standard deviation" text touching the curve at the top; recorded as PLT-2B-n2, not built now.
- svg-snapshots.json regenerated wholesale: 534 of 3271 entries already differed at released main (release 149 did not re-pin them; before release 149, 0 differ). Alternative: only the sprint 2 ids, not possible to separate.
- illustration-token-budgets.json got an ml-mle-steps entry (122/126/128 tokens, js-tiktoken cl100k_base; the same method reproduces two existing entries exactly). Alternative: leave illustration-integration red.
- block-stack.test.mjs oversized fixture changed from 8 x 123456.789 (now only 936 wide) to 8 x -1.2345678901234567e21 (natural 2000 > 960): same intent, a fixture that is still oversized.
- Wrapped tensor transformations (below about 960) draw ONE wrap arrow and no per-link mapped arrows or link labels; pinned because commit 602043948 says so. If you want the link labels kept in the wrapped form it needs a source change. Cosmetic orphans: token embeddings at 960 wrap 5+1, vocabulary at 320 wrap 5+1.
- ILL control-plane pins import figurePrompt and RECRAFT_CONTROLS from the source, so the pins still fail on a changed prompt use but not on a changed preamble text; no literal pin of FIGURE_STYLE exists (add one on request).
- The affected-tests list file for the web did not exist; the web run was the whole suite (7108 tests), which is stronger.
- The release name is 150-explain; the recovery branch was cut four times (the SHA moved with fixes 3, 4, 5) and the three earlier recovery/visual-sprint-150 commits (mine, never released) were deleted from the remote before each re-cut. The preview clone is named after its worktree: rabbit-hole-web-dev-s2-prev.

## Recorded, not now
PLT-2B-n2 (after 150): a line or band label renders on one line; one that does not fit its band goes above the plot area at the band's centre, small; collisions stack. Then ONE-1, AUD-1 (spend OK first), FLAG-1, REL-1, VAR-1 spec.

## Owner commands (SHA filled)
1. gh variable set MVP_ALLOWED_SHA --body 5f29c23a6a3c5cc40b8bc813a53d517d854c3e79 -R Rabbit-Hole-App/Rabbit-Hole
2. bash C:/s/spec/release-queue/release-mvp.sh 150-explain --check
3. bash C:/s/spec/release-queue/release-mvp.sh 150-explain
4. gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole
(or the single launcher that runs 1 to 4 and stops at the first failure: C:\s\spec\release-queue\release-150-explain.cmd)
