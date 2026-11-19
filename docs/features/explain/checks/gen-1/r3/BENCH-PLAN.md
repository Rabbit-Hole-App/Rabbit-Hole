# GEN-1 R3 bench plan (2026-11-19)

Written from the lane's draft; run by the lead under the Reviewer's advance approval (estimate plus 20 %).

**Arms.** BEFORE is the release 165 tree (feat/release-165, a42d5e0f1). AFTER is that plus R3 only (feat/gen-1-r3, 2957c9e3e: R3 commit 66f1bb57d plus the merge of a42d5e0f1). Profile google-low, balanced depth. Trees: C:/s/gen1-r3-trees/before and after.

**Sets.**
- 15 on-topic questions x 3 seeds x 2 arms = 90 runs.
- 7 numeric questions x 3 seeds x 2 arms = 42 runs.
- The 29 R3-pre cells, once, AFTER only = 29 runs.
- Total 161 runs.

**Estimate and stop line.** Estimate US$0.58 (161 runs x US$0.0036). Stop line US$0.70 settled (estimate + 20 %). Failed calls count at their settled cost. Three consecutive Gemini provider errors stop the run. Harness: C:/s/sprint2-evidence/gen1-r3-bench/run.mjs (copy in bench/); `--dry-run` first (no provider call), then `--real` by the lead. GEN-1 spend so far: R1 1.43, R3-pre 0.099, R2 0.778 = US$2.31; with the R3 stop line US$3.01, under the US$5 total.

**First lines of the report.**
1. For questions with a reference, how many give three visibly identical pictures (same kind, same labels, same values), BEFORE and AFTER; also same kind but other labels or values; two or more distinct kinds.
2. Wrong-number flags by rule (154 rules, NUM-2, NUM-3a, NUM-3c), BEFORE and AFTER.
3. Cards where the caption or prose names a value the picture does not show (the Reviewer recomputes these from the sheets: R3-pre showed wrong numbers that no rule flags).

**Then.** The kindSource mix (reference-exact, draw, none); the 29 R3-pre cells, AFTER kind against today's reference-steered kind; per-arm delivery, first-attempt validity, repairs, provider moves, latency, settled cost. 13 of the 15 on-topic questions have an exact reference (the non-exact ones: tree-bst-insertion, tree-folder-hierarchy), so those 13 should show one kind across all three seeds, with the labels and values free to differ.

**Sheets.** On-topic 15 and numeric 7: BEFORE row then AFTER row, three seeds side by side, kind and kindSource (with drawn kind, planner kind and "closest example shown") above each card; the 29 R3-pre cells once in AFTER; katex.min.css loaded.

**Pass reading.** On-topic exact-reference questions keep their kind in all seeds; pictures differ across seeds in labels and values more often than BEFORE; wrong-number flags and honest failures are not above BEFORE; settled cost under US$0.70. Note: R3 does not make `nextCanWrite` plan-aware (spec item left out of the order).

**Reporting rule (Reviewer 11-19):** a bench that changes two releases at once cannot tell them apart; BEFORE is exactly the tree 165 ships.
