# Item 8: softmax rounding clause tightened (Reviewer decision)

Where: packages/web/src/tutor-diagrams/spec.js checkSoftmaxList (hunk.diff). The clause from item 6 passed any card whose written after values sum to exactly 1 (1e-9 slack) with every value within one full unit. Now it passes only when the sum is exactly 1 AND at most ONE value is past its own half-unit from the true softmax value AND that value is within one full unit; every other value must be within its half-unit. Otherwise the half-unit rule decides (fail, naming the correct values). Message text unchanged: build-renderer-constraints.mjs --check exits 0 (not regenerated).

Exact numbers, softmax(2, 1, 0) = 0.665241, 0.244728, 0.090031 vs 0.66/0.24/0.10 (sum 1.00):
- 0.66: off by 0.005241 > half-unit 0.005 (beyond)
- 0.24: off by 0.004728 <= 0.005 (inside)
- 0.10: off by 0.009969 > 0.005 (beyond)
Two values beyond half a unit, so it FAILS (message: softmax(2, 1, 0) = 0.67, 0.24, 0.09, not 0.66, 0.24, 0.10).
1/1/1 with 0.33/0.33/0.34: true 0.33333; 0.33 and 0.33 are 0.00333 off (inside 0.005); 0.34 is 0.00667 off (beyond half, inside full unit): one beyond, passes.

Test change (spec.test.mjs, same single rounding-clause test, renamed to describe the new rule): the assertion that 2/1/0 with 0.66/0.24/0.10 passes (item 6, recorded effect) now asserts it FAILS (one arithmetic issue). This is the Reviewer's intended change. Unchanged: 0.33/0.33/0.34 passes; 0.33/0.33/0.35 fails (sum 1.01); 0.70/0.26/0.04 fails; 0.66/0.24/0.04 fails (sum 0.94).

Sweep (node item3/sweep.mjs, output item8/after-sweep.txt): 12 flagged, 83 pass of 95 (was 11 after item 6, 13 before). Changed status vs item 6: run 2026-11-08T191125-arm-e-v2-planner-8e861fdb3, id softmax, 2/1/0 -> 0.66/0.24/0.10: pass -> flagged. The other flagged cards are the same 11; 1/1/1 -> 0.33/0.33/0.34 (184736 arm-e-planner) stays pass. Net vs the original 13: one card fixed (1/1/1).

Always-run set (runset.sh): all green; svg-snapshots 1/1 unchanged. spec 25/25, ml-statistical 25/25, content-contract 13/13, reference-content-contract 1/1, ml-reference-integration 473/473, geometry-lint 9/9, kind-gallery 28/28, kind-gallery-depths 126/126, stray-hex 2/2, palette-guard 1/1, learn-slash 39/39; control-plane: fast-chain 22, visual-fallback 5, learn-artifact 23, card-archive 3, references 11, prose-pass 9, all pass.
