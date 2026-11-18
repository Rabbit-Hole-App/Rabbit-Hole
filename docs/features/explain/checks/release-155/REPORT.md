# Release 155-fallbacks: report

Release name: 155-fallbacks
Release SHA (full): 5d13f435fe75e590b16b51bf4081a9dbe1d7d745 (branch feat/release-155 = tip of feat/fallbacks-batch = main 9531b382f6d2735393a7f9b3c7d82988007d1327 (release 154) + merges of feat/simp-1 (2a47b4a36) and feat/gem-s1 (643e6807d); no conflicts; main was still 9531b382f)
Recovery branch: recovery/fallbacks-155, tip 6b74a9d04ab532dd106d20e28a433c50c0bee0bf (one commit, the tree of main on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r155-int.tryrabbithole.workers.dev (build 3bbe9c1fa243, same web build as 154: no web source changed; MVP record 9642a78e04c75c65; `verify --fetch` accepts it; refs/notes/dev-deploys NOT pushed)
Smoke: fast path exit 0: affected tests web learn-slash 40, control plane 702; smoke set 159 tests (fast-chain, visual-fallback, matrix-coerce, learn-artifact, spec, ml-statistical, learn-slash); explain-program-render-check.mjs 38/38.
Pins and launcher: C:/s/spec/release-queue/155-fallbacks.pins and release-155-fallbacks.cmd (a mirror of 154's: N=155, PIN=155-fallbacks); W = C:/s/r155-int (clean, at the SHA)
Startup profile launcher (not run): C:\s\spec\startup\startup-profile-155.cmd

## What is in it (8 files, +239/-13; no flags, no migrations, no config, no UI)
- SIMP-1: the last-resort simplify step rebuilds a failed diagram only within its own kind family (flow, cycle, sequence, tree). Any other kind (matrix, heatmap, token-links, transformation, plots) fails the step with explanation_missing_visual, so the next provider runs; if none can, the learner sees the existing retry line. A binary tree the schema rejects is rebuilt as the ordinary tree. With no plan the prose card is delivered as before.
- GEM-S1: the matrix/heatmap column coercion (Q0) also reads the `name` key.
- Source: packages/control-plane/src/learn-primitives.js (+17/-5) and learn-artifact.js (message text only); tests (fast-chain, visual-fallback, matrix-coerce, a new fixture) and packages/web/src/learn-slash.test.mjs (one test); docs/features/explain.md. learn-slash.js itself is untouched.

## Tests (one per process, 0 fail)
Control plane: fast-chain 24, visual-fallback 9, matrix-coerce 13, learn-artifact 23, card-archive 3, references 11, prose-pass 9, diagram-corrections 20, sequence-selfstep 10, visuals 17. Web: learn-slash 40, spec 25, content-contract 13, svg-snapshots 1 (no snapshot moved), ml-reference-integration 473. Wide run: 44 control-plane explanation-* files and 93 web tutor-diagrams files, 1745 tests, 0 fail. Not run: the whole packages/web suite, browser checks, release-mvp.sh --check (the owner's launcher runs it).

## Evidence (film/evidence, docs/features/explain/checks/)
fallbacks-batch (bench, commit 331625746), simp-1 and gem-s1 (0ad06c659), plus the GEM-S2 correction below.

## Bench headline (66 real runs, about US$0.34, settled US$0.326; BEFORE main 9531b382f, AFTER this release)
- Mismatched flows 17 of 33 -> 0 of 33. AFTER runs on the failure line 0 of 33; all 33 delivered in both arms.
- 18 of 33 AFTER runs moved to gpt-oss. Model calls per run 1.79 -> 2.36; median latency 4121 -> 8113 ms (paired about +3.5 s median, +2.7 s mean); settled cost per 33 runs US$0.145 -> US$0.181.
- Caveat: AFTER still delivered 19 of 33 cards without the planned kind (BEFORE 20): 15 of the 18 gpt-oss cards and 4 of 15 Gemini cards. The release removes the mismatched flow, not the missing planned kind: gpt-oss often writes a different valid kind (a heatmap for a token-links plan).

## GEM-S1 and the correction (read this)
First-attempt-valid is 1 of 12 BEFORE and 1 of 12 AFTER in the GEM-S1 cells: the `name` key changed nothing measurable. The fallbacks bench report said the attempt-0 "columns received object" error occurred 0 of 12 times: that was a harness bug (run.mjs regex `columns.d+` lost its backslashes). Recomputed from the saved events: 11 of 12 BEFORE and 8 of 12 AFTER runs of the GEM-S1 cells (17 of 33 and 14 of 33 over all cells). Gemini does send object columns at attempt 0; Q0 cannot coerce them because the shape is {heading, items} with no rows, and inventing row labels has been forbidden since release 126 (GEM-S2 branch feat/gem-s2 c9c96ba97 pins this with one test and builds no mapping: a matrix needs row headings, a heatmap unique row labels; {heading, items} supplies neither). GEM-S1 is harmless but not a fix for that shape. A 12-run capture on the batch arm (US$0.066): first attempt valid 3 of 12; 8 attempt-0 columns-object errors; 11 Q0 'left: no labels' events plus 4 'different lengths'; 11 of 12 delivered (one run ended without a card); 9 moved to the next provider; final kinds heatmap 8, matrix 3 (gpt-oss wrote 8, Gemini 3); the saved attempt-0 answers carried no rh-diagram fences, so the raw shapes are still not visible.

## The 3 gpt-oss cards with a card-errors flag
Results idx 2, 13, 24 (cell 2, reps 1 to 3; decoder prompt, detailed; planned token-links; the same card each time). The flag (heatmap-weights-should-sum-to-1, "row sums 0") is the KNOWN FALSE POSITIVE: the card is a 6x6 causal mask (allowed cells 0, blocked cells null), range 0..1, not attention weights. But the card is also really wrong in a way no check sees: the drawn mask is strictly lower-triangular (row 1 all blocked, the diagonal blocked) while its own prose says (i,j) is 0 (allowed) when j <= i; every allowed cell is 0 so the heatmap has no contrast; the prose claims a softmax distribution per row. A content error by gpt-oss, not caused by this release; it appears where BEFORE would have shown a chain diagram instead.

## NOT in the release
VAR-1, the UI bundle, card audio, VOICE-1, GEM-S2 (nothing to build), the remaining {heading, items} shape.

## Startup CPU and bundle size
Not measured (wrangler deploy --dry-run is not available to the agent). Baseline 150/151: about 9642 KiB total upload; local startup 431.7 ms (150), 374.8 ms (151). Estimate: +17/-5 source lines in one file (two functions and one constant at module scope, no top-level execution): well under 1 KiB. The startup profile launcher is the owner's optional step (2 to 4 minutes, uploads nothing).

## Decisions
1. Value of the release: SIMP-1 removes mismatched flows (the card's prose points at a picture that is not there) at about +24% cost and +3.5 s on affected cards; GEM-S1 is a no-op. Cards that fall to gpt-oss are sometimes wrong in content (the causal-mask card).
2. Is a planned-vs-delivered kind mismatch (19 of 33) acceptable for MVP?
3. Main must stay at 9531b382f until release: if another release lands first, 155 needs a re-merge, a new recovery branch, a new preview and new SHAs in the pins and launcher.
4. Housekeeping: r154-int's scripts/topic-pipeline/node_modules junction points to the removed C:/s/r151-int.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-155-fallbacks.cmd
