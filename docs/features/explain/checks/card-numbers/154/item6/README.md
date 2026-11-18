# Item 6: softmax rounding clause (Reviewer decision)

Where: packages/web/src/tutor-diagrams/spec.js checkSoftmaxList. Same rule, one clause: a card passes when the written after values sum to exactly 1 (1e-9 slack) AND each value is within ONE FULL UNIT of its own written decimals of the true softmax value. Otherwise the half-unit rule decides as before. The message text is unchanged (renderer-constraints.md --check is current, not regenerated).

Before (item 3): 13 flagged of 95 softmax list transformations (86 numeric, 73 pass, 0 gated).
After: 11 flagged, 84 pass (sweep: node item3/sweep.mjs, output in ../after-sweep.txt).

Cards that changed status (flagged -> pass):
1. run 2026-11-08T184736-arm-e-planner-38db93c68, id softmax: 1/1/1 -> 0.33/0.33/0.34 (the rounding false positive the clause was written for).
2. run 191125 (the 2/1/0 card): 2/1/0 -> 0.66/0.24/0.10. HONEST EFFECT: sum is exactly 1.00 and each value is inside one unit (0.66 vs 0.6652, 0.24 vs 0.2447, 0.10 vs 0.09003: 0.00997 < 0.01), so the clause lets it through. Item 3 had called this a real error (0.10 against 0.090). The clause was not adjusted.

Still flagged (11): 2/1/0 0.659/0.242/0.099 (184736, sum 1.000 but 0.099 vs 0.090 = 0.009 is 9 units of 0.001); 3/-1/-2 0.880/0.058/0.062; -2/0/3 0.04/0.11/0.85; 2.0/1.0/0.1 with 0.70/0.26/0.04 (6 cards) and 0.69/0.25/0.06 (2 cards).
Check on the "0.66/0.24/0.04 still fails" case: sum 0.94, half-unit rule, fails. 0.70/0.26/0.04 sums to 1.00 but 0.04 is 0.059 from 0.099: more than one unit, fails and names 0.66/0.24/0.10.

Test (spec.test.mjs, 1 new): 1/1/1 with 0.33/0.33/0.34 passes; with 0.33/0.33/0.35 fails (sum 1.01); 0.70/0.26/0.04 and 0.66/0.24/0.04 still fail; 2/1/0 with 0.66/0.24/0.10 passes (recorded effect).
Always-run set: all green (runset.sh), svg-snapshots unchanged.
