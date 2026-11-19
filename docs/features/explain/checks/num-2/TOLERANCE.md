# NUM-2 tolerance change (Reviewer: one full unit of the written decimals)

Branch feat/num-2, merged with main b3b54c3b3 (normal merge 2075169ec), then the tolerance commit (see the push). File: packages/control-plane/src/learn-primitives.js, the prose-equation rule (`proseArithmetic`, about :494-500); the distribution-bars rule has its own tolerance and is unchanged (it does not share the constant).

## Rule
The stated result of `a op b ... = c` may differ from the computed value by ONE FULL UNIT of the decimals c is written with when the computed value has more digits than that (a rounded or truncated result): 7/9 written 0.77 and 1/3 written 0.33 pass; 0.34 for 0.15 still fails. When the computed value fits the written digits exactly (2 + 2, 11.5 + 1.5 x 6 = 20.5) the tolerance stays half a unit: a literal full unit at 0 decimals would pass `2 + 2 = 5` (the existing tests and the box-plot card test pin that it fails). This guard is a deviation from the plain wording "one full unit", needed so integer arithmetic stays exact; say if the plain rule is wanted.

## Proof (offline, no network)
- Bench cards (var-1-bench/results-combined.jsonl): items 222 and 297 still FAIL explanation_bad_numbers ("0.5 x 0.8 + 0.5 x (-0.5) = 0.34 ... computes to 0.15"); item 280 passes, as decided.
- Corpus (1586 distinct delivered cards, the same as before): prose equation flags 5 on 4 cards, all real, 0 false positives (identical to the half-unit run: num2-proof-output.txt vs num2-proof-output-tolerance.txt have no diff); distribution-bar flags 1 on 1 card, real. So no flag is added or lost by the change on this corpus; the change only widens what passes for a truncated result.
- New test (explanation-prose-numbers.test.js, 9 tests, 0 fail): 7/9 = 0.77, 1/3 = 0.33, 2/3 = 0.66 and 0.755 = 0.76 pass; 7/9 = 0.75 (2.8 units), 0.755 = 0.77 (1.5 units), 0.34 for 0.15 and 2 + 2 = 5 fail. An exact one-unit difference is not reachable for a non-exact computed value (the value would then be a multiple of the unit), so the boundary is pinned by 1.5 units failing and 0.5 to 1 unit passing.
- Byte identity: 470 request hashes identical to main (h-start2.json vs h-num2tol.json), 474-row replay identical (replay-start2.json vs replay-num2tol.json).
- Tests: the 34 control-plane test files that import learn-primitives, 496 tests, 0 fail.
Not run: the whole control-plane suite, any web test, any provider. No release prep (after the kinds-fit release).
