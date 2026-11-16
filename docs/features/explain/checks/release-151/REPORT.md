# Release 151-explain: report

Release name: 151-explain
Release SHA (full): 2b91f167a8e7260b04a8b4b62b129079d3807314   (branch feat/release-151 = main 5f29c23a6 (release 150) + 9 commits)
Recovery branch: recovery/visual-sprint-151, tip 7f35b750ac3d848c86e7f8ac0ffbd04f87a27dbc (one commit, the tree of main 5f29c23a6 on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r151-int.tryrabbithole.workers.dev (worker rabbit-hole-web-dev-r151-int; build a278dadcfce3; MVP record dc0471cb92ca4ea7; refs/notes/dev-deploys NOT pushed)
Smoke: node packages/web/e2e/explain-program-render-check.mjs (passed; GET /library serves /static/app-Bm0kRSuK.js)
Pins and launcher: C:/s/spec/release-queue/151-explain.pins and release-151-explain.cmd (W = C:/s/r151-int, a clean worktree at the SHA)

## What is in it (9 commits on main 5f29c23a6)
| commit | item |
|---|---|
| c7af5aaa6 | motion-ownership test re-pinned (pin) |
| 6049cddb6 | render-freshness: 10 viz-benchmark static renders regenerated (real fix) |
| 53350e44c | figure-layout (TEST-1) re-pinned (pin) |
| f6e1618db | FLAG-1: keepExplicitPlotPoints handles {anyOf:[points, formula]} items; the flag stays off |
| 759790cdd | PLT-2B-n2: line and band labels on one line, above the plot and stacked when they do not fit |
| 3a3b3eb38 | PLT-2B-n2 test |
| b4e888d49 | TOK-W4: the wrapped tensor form keeps its mapped arrows and link labels, routed row to row |
| 70fcba649 | TOK-W4 test re-pins |
| 2b91f167a | svg-snapshots regenerated: 33 ids (29 PLT-2B-n2 in 11 references, 4 TOK-W4) |

## Tests
- Preview run, the fast path's own selection on the release SHA: web 50 tests, 0 fail; control plane 124 tests, 0 fail.
- Whole packages/web suite on the release tree: 7109 tests, 7081 pass, 0 fail (27 skipped and 1 todo, the same counts as in the release 150 run; the three tests that were red on main are green).
- FLAG-1 control-plane files that touch the changed source: 52 files, 561 tests, 0 fail (run on the branch).

## Evidence (film/evidence, docs/features/explain/checks/release-151/)
- audit-151/diff.md: 1090 ids at 408, before = main 5f29c23a6, after = the release SHA: 0 render errors, 0 ids wider than 720 (list empty); the only flags are 13 ids "badges-without-key (same before)", present in release 150 too.
- sheets/: the whole library at 408 and 720, 25 sheets.
- plt-2b-n2/ and tok-w4/: before and after at 408 and 720 (tok-w4 also 320, 482, 960), README, hunk.diff; snapshot-ids-moved.txt.
- red-motion-ownership/, red-render-freshness/, red-figure-layout/: before/after test output and hunks.
- preview-151.txt. FLAG-1 live check: docs/features/explain/checks/flag-1/ (already on film/evidence). AUD-1 and ONE-1 are on film/evidence under checks/aud-1 and checks/one-1.

## Fixed unattended
Nothing new outside the scope you gave. The three red tests:
1. motion-ownership (pin): the mutation target text was stale (strip cell now uses cellH and the ring initial={false}, from 3e564b028). The mutation proof was shown to still be able to fail: with the same mutation applied to AnimatedScene.jsx on disk the first test fails (mutated-source-on-disk.txt).
2. render-freshness (real fix, not a fingerprint refresh): 10 static renders (gradient-alignment case 01, illustrated-transformer cases 01-04 and 06-10) were stale because the renderer changed (cream ground and theme commits 44feb891d, 3e564b028, 90831156a, 939cd029b since the last refresh 79dde1da9); regenerated with the repo's own `node render/rerender-statics.mjs` (34 s, local Chromium, no network, no provider); the commit holds only the 10 PNGs and 10 fingerprint files.
3. figure-layout / TEST-1 (pin): the free-body arrows are drawn by connector() in primitives.js at 2 px (commit 69c3e8dab), not 1.5 and not the 2.5 px wire; the arrow is right, the test now expects stroke-width 2; geometry and the minimum-arrow-length note are still asserted.

## Decisions taken unattended
- PLT-2B-n2: above-plot labels are 11 px and stack upward 14 px per row, clamped inside the card; the plot's top margin grows only when such labels are drawn (the bell at 408 grows by 56 px for four rows; a plot without them is unchanged, which the snapshot count confirms: 29 ids in 11 references moved). A vertical line label stays beside its line when it fits whole and touches nothing, else it goes above the plot centred on the line; a band label stays inside when its text width plus 8 px fits the band, else above, centred on the band; a horizontal line label stays at its right end unless wider than the plot. At 720 the labels go above a little early (the layout's text-width estimate is wider than the real glyphs). Callout pills (rule unchanged) can still sit over a dashed reference line (the bell at 408 shows it). Shape labels (segment, rectangle, polygon, circle) are untouched and still wrap at 160 px. Alternative: wrap labels.
- TOK-W4: only ml-transformer-qkv-projections (spec and detailed) has links among the 33 tensor transformations; the others are unchanged. Each link is a 2.5 px wire with the 12 x 8 head from the source item's bottom edge, down the gap between rows, into the target item's top edge; labels sit above their lane at a free x; lanes are ordered to minimise crossings (up to 6, else link order, marked shortcut). Limits: the row-2 heading "Projected vectors" is off-centre in the wrapped form (left of the source stem at 408 and 482, left of the Query drop at 720) because a centred heading would be crossed by the Key drop; a link enters its target at the item's centre, so two links into one target share their last segment. Not fixed: the viz-benchmarks illustrated-transformer case 04 caption "value (V) - one number per token, for reference" overlaps its "river flows south" column labels (identical in the old and new PNG).
- FLAG-1 is in with the flag off. Cerebras accepted the formula schema (HTTP 200); the Gemini live verdict is open: the Gemini call returned HTTP 429 "monthly spending cap" (also refused the AUD-1 Gemini arm). Please check the Google AI Studio spend cap; I do not know whether production /explain uses the same Gemini project.
- svg-snapshots.json regenerated for 33 ids only (checked against the lanes' predicted lists).
- Names: release 151-explain, recovery cut once, preview clone named after its worktree.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-151-explain.cmd

## Next
REL-1 and the VAR-1 spec (yours) remain. Open: the Gemini spend cap; listen to the AUD-1 samples (Fish s1 against s2.1-pro, and Matilda) before choosing a voice vendor.
