# GEN-1 R1 (G5) bench plan: NOT RUN, waits for the owner's OK

Arms: BEFORE = main c56e4fcc8 (release 160), AFTER = feat/gen-1-r1 19cc38d31 (rebased on main if main moves). Harness: the VAR-1 bench harness (C:/s/sprint2-evidence/var-1-bench/run2.mjs: in-process generateArtifact + the fast chain, planner jev, sampler off, no pictures, settled-cost stop line, exit after three consecutive Gemini provider errors), adapted to the two trees (git archive into C:/s/gen1-r1-trees/{before,after}). No code change to the harness except the arm trees and the item list.

## What G5 can and cannot change (from the saved VAR-1 bench, BEFORE arm, 300 delivered cards)
83 of 300 delivered cards had a planned kind that was not delivered (PLAN-K). By planned kind: token-links 27, transformation 17, flow 15, comparison 7, tree 6, cycle 3, tensor 3, sample-set 3, bar-chart 2. Only 3 of the 83 are planned as one of the four kinds dropped for Gemini (sample-set 3). So re-keeping the planned kind for Gemini can fix at most those 3; any larger effect on PLAN-K has to come from the plan-narrowed (one- or two-kind) schema itself, which the bench measures. They sit in 29 distinct prompt x depth cells. 73 of the 83 were written by Gemini, 10 by gpt-oss.

## Sets (google-low in full, fireworks-low on a third, as the GEN-1 spec says)
- Set A, the PLAN-K cells: the 29 prompt x depth cells above, 3 repetitions, both arms, google-low: 29 x 3 x 2 = 174 runs.
- Set B, the usual rates: the 101 numeric prompt x depth cells of the VAR-1 bench (items 0 to 100 of its plan, one repetition), both arms, google-low: 202 runs. This shows the rates and that nothing else moves.
- Set C, the Gemini-dropped kinds: the four dropped kinds are heatmap, sample-set, histogram and box-plot; the box-plot and histogram numeric cells of set B (18 box cells) plus the 3 sample-set runs' cell are the test for "the planned kind joins Gemini's keep set": already inside sets A and B, listed separately in the report.
- Set D, fireworks-low: the 29 PLAN-K cells x 1 repetition x both arms: 58 runs.
Total 434 runs.

## Cost (estimate before running, from the VAR-1 bench settled cost)
Settled cost per run in the VAR-1 bench: US$0.00326 (BEFORE 83 missing-kind runs), US$0.0031 over all 626 runs. 434 runs x US$0.0033 = about US$1.45; with the planner (US$0.0002 a card) and a 20 % margin about US$1.75. Stop line US$3.00 settled (counting failed calls at their settled cost and earlier runs of this bench); hard cap the owner's US$5. Three consecutive Gemini provider errors stop the run. Time about 3.2 s a run one at a time: about 25 minutes.

## What the report shows (first line = the question the Reviewer asked)
For the prompts where BEFORE delivered another kind than planned (set A, BEFORE arm): what AFTER delivered, per prompt: planned kind delivered yes/no in BEFORE and AFTER over the 3 repetitions, the kind delivered when not planned, and, on exactly these prompts, honest failures, repairs (first attempt valid, number of repairs), and runs moved to the next provider. Then, per arm: delivery, honest failures, first-attempt-valid, planned kind missing (all sets), 154-rule and old-classifier flags (classified as in the VAR-1 report), settled cost, p50/p90 latency, provider calls per run; for the four dropped kinds: how often Gemini now delivers a planned heatmap, sample-set, histogram or box-plot. The no-plan mixed bundle (365 properties, logged) is counted as the explanation_gemini_schema_over_limit events seen in the run.

## Preconditions
- The 470 request hashes and the 474-row replay identical to main on the AFTER tree (done by Lane 3, re-run after any rebase).
- No paid call before the owner's OK. This plan is the estimate the Reviewer asked for.
