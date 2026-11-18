# Release 154-card-numbers: report

Release name: 154-card-numbers (note: the release queue also holds `154-toc-chips`, which is already main f9b755e34; see "Decisions")
Release SHA (full): 9531b382f6d2735393a7f9b3c7d82988007d1327   (branch feat/release-154 = main f9b755e347b1d8338a24a942a4482fc5c369ca1d + a --no-ff merge of rabbit-hole/feat/card-numbers-b ba19c8387; clean merge, 16 files, +478/-36)
Recovery branch: recovery/card-numbers-154, tip 1b9a72cf24cc5f5a23a0c4e3a47625ce2e1d0470 (one commit, the tree of main f9b755e34 on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r154-int.tryrabbithole.workers.dev (build 3bbe9c1fa243; MVP record 07d1e2419c78dbbe; `mvp-fast-path.mjs verify --fetch` accepts it; refs/notes/dev-deploys NOT pushed)
Smoke: node --test of the card-number suites (fast-chain, visual-fallback, learn-artifact, spec, ml-statistical, learn-slash: 139 tests, 0 fail) and explain-program-render-check.mjs (passed; the clone serves /static/app-BiBheez5.js)
Pins and launcher: C:/s/spec/release-queue/154-card-numbers.pins and release-154-card-numbers.cmd (W = C:/s/r154-int, a clean worktree at the SHA)
Startup profile launcher (not run): C:\s\spec\startup\startup-profile-154.cmd

## What is in it
No flag changes (EXPLANATION_FORMULA_SAMPLER stays off). No migrations. No config change. No UI beyond one copy line in learn-slash.js and the renderer axis widening.
- Box plots (3ecab0496, 39a0c8d16): stated fences must equal Q1 - 1.5 x IQR and Q3 + 1.5 x IQR (half unit of the written decimals); the renderer widens the axis instead of rejecting a fence or outlier outside it; the summary and outlier axis rules stay.
- Repair and honest failure (e530c5207, 5c9da7620): a wrong number never drops or simplifies a diagram; one repair, a second same-model repair when the next provider cannot write the kind, then the step fails with explanation_bad_numbers; when every step fails the learner sees "Couldn't make a reliable card. Try again." and no card. The stale production-profile comments now say google-low.
- Archive and repair (9318325fb, e2f2e5fd3): every wrong diagram of a card goes into one repair message; the archive records failedOn per step and each step's issue text.
- New checks: softmax list rows recomputed within half a unit (9b9bb3c94; off for temperature, T =, scaled, scaling, masked, causal, log-softmax); a bootstrap sample draws exactly n members for n rows (698eb5951); a whisker beyond a stated fence is an arithmetic issue (b5fe0c4e7).
- Softmax rounding clause, tightened, and a fixture README (136d01d5d, 0359cf511, ba19c8387): pass when the written values sum to 1 and at most one value is past its half unit (within a full unit); the 09-bootstrap-roots fixture fails the bootstrap rule by design and says so.

## Tests
- Preview run (the fast path's own selection): web 1313, control plane 732, smoke 139, all 0 fail. The first attempt stopped on scripts/topic-pipeline reference-linter (cannot import js-tiktoken): the clean worktree lacked the scripts/topic-pipeline/node_modules junction, environment not product; after the junction the test passes 17/17 (log: preview-154-attempt1-failed.txt).
- Card-number run set (18 files, one per process): 816 tests, 0 fail (svg-snapshots 1/1, content-contract 13, reference-content-contract 1, ml-reference-integration 473, kind-gallery 28 and 126, geometry-lint 9, theme guards 3, learn-slash 39, fast-chain 22, visual-fallback 5, learn-artifact 23).
- Wide run: all 44 control-plane explanation-* files and all 93 web tutor-diagrams files, one per process: 1736 tests, 0 fail; no svg snapshot moved.
- Not run: the whole packages/web suite, browser checks, `release-mvp.sh --check` (denied to the agent; the owner's launcher runs it).

## Evidence (film/evidence, docs/features/explain/checks/card-numbers/)
Section 6 report 8f93287de (main d3857f783 vs 5c9da7620, 606 runs, about US$2.13); fallback trace b81108f3e; section 6b 3de8a1143 (0359cf511, 147 runs, US$0.54); items 1 to 8 under 154/ (c77ee6ffc, e1817365c); section-5 derived-fields list c8872669b; archive baseline (2 records) under archive-baseline/.

## Headline numbers (live providers)
- Fence arithmetic flags: 7, 0, 0 (BEFORE, AFTER, AFTER-2).
- Box-plot cards with any flag, of 54: 21, 15, 10; real-error cards (excluding the check's false positives): 15, 5, 3.
- First repair: 22 of 22 numbers failures fixed on the live arm (10 of 10 in section 6).
- Softmax recompute: 17 plain-number list diagrams in scope, 9 repairs triggered, all fixed by the first repair, 0 violating cards delivered.
- Bootstrap: 9 of 9 draws had n draws from n rows; the "6 from 8" error did not reproduce, so the rule's live value is unmeasured.
- Regression: 20 other numeric prompts, 0 errors. Latency median about 2.85 s unchanged; a run with a repair about 4.8 s.
- Second same-model repair and honest failure: not reached live (0 of 147 in 6b, 0 of 606 in section 6); covered by fake-provider tests in packages/control-plane/test/explanation-fast-chain.test.js, all passing: 411 (second repair, same model), 422 (first-repair success stops), 430 (next provider can write the kind: one repair, then it runs), 443 (every step fails: explanation_bad_numbers, nothing delivered, diagram never dropped), 467 (failedOn in order), 478 (failed card archived with steps, outcomes, repairs, issue text).

## NOT in the release
SIMP-1; GEM-S1; SOFT-T; WHISK-2 (whiskers beyond unstated fences: 5 two-class cards in section 6); SOFT-1 (cards whose title or operation lacks "softmax": 4 wrong of 23 plain-number softmax cards in AFTER-2 were not caught); BENCH-1 (bench harness only).

## Startup CPU and bundle size
Not measured: `wrangler deploy --dry-run` was denied to the agent. Baseline: 150 and 151 both 9642.64 and 9642.75 KiB total upload (gzip about 2449.7 KiB); local startup 431.7 ms (150) and 374.8 ms (151). 151's code 10021 refusal did not come from size (150 and 151 had the same bundle). Estimate: 154 adds about 140 non-test source lines across 9 files, with only functions, one small constant and two regexes at module scope and no top-level execution, so at most a few KiB. To measure: the owner runs C:\s\spec\startup\startup-profile-154.cmd (2 to 4 minutes, uploads nothing; dist-dev is already built in C:\s\r154-int\packages\web) and compares "Total Upload" to 9642.75 KiB and startup ms to 150 and 151.

## Decisions
- Main must still be f9b755e34 at release time: release-mvp.sh needs main to be an ancestor of the candidate. If another release lands first, 154 needs a re-merge, a new recovery branch, a new preview, and new SHAs in the pins and launcher.
- Release number: the queue holds `154-toc-chips` (pins SHA f9b755e34 = current main, MAIN_PREV d3857f783). That release is already main, so 154 is a used number; a clean name would be 155-card-numbers. Not changed without the Reviewer's word.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-154-card-numbers.cmd
