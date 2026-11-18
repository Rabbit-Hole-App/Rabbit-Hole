# NUM-2 (Lane 6): report

Branch feat/num-2, commit 975c997ad62b84be20834046716be508535d27e6, cut from main c56e4fcc8 (release 160), so there was nothing to rebase. Evidence scripts and outputs: this folder (film/evidence 9210d90eb).

## What changed
`packages/control-plane/src/learn-primitives.js` (+80/-6) and the new `packages/control-plane/test/explanation-prose-numbers.test.js`. Both rules sit in `numbersIssue`, so they take the 154 arithmetic route: the problem starts `explanation_bad_numbers`, the card is never dropped or simplified, it gets one repair, then the step fails.

- Rule 1, prose equation: `a op b ... = c` is recomputed when the whole left side is only numbers and operators (+ - x /, chains), in `$...$` or plain text. The stated result must match within half a unit of the decimals written (the 154 convention). A left side with a name, a power or a function is skipped, as are thousands commas and a right side that is itself an expression.
- Rule 2, distribution bars: a plain or grouped bar-chart whose own title, caption or unit says probability, distribution, softmax or normalised must have its 0..1 values sum to 1 within half a unit per value.

## The three bench cards (results-combined.jsonl)
- Items 222 and 297 (diffusion forward noise): both fail with "0.5 x 0.8 + 0.5 x (-0.5) = 0.34 ... computes to 0.15".
- Item 280 (attention heads): does NOT fail, on purpose. Its own text only says "Attention weights across different heads"; two heads' weights are not one distribution across heads, so the evidence checker's flag was a false positive and the rule is not widened to "attention weights".

## False-positive counts over 1586 distinct saved delivered cards (var-1 bench, section-6, section-6b, fallbacks-batch, gem-s2)
- Prose equations: 5 flags on 4 cards, all real, 0 false positives. Three of the four cards are IQR-fence prose that the 154 diagram rule cannot see. The evidence checker finds the same 5.
- Distribution bars: the first draft flagged 2 cards, one a false positive (a per-bar "proportion" of resamples); proportion, share and fraction-of were dropped, keeping probability, distribution, softmax and normalised. Final: 1 flag, real (softmax bars 0.63, 0.23, 0.09 sum to 0.95; bench item 1032).
- Caveat: the corpus is the bench's prompt set, not production traffic.

## Tests and guards (0 fail)
The 8 new tests pass, including an end-to-end repair-then-fail and a right card that delivers. All 34 control-plane test files that import learn-primitives pass (495 tests). Byte identity against main c56e4fcc8: the Gemini request hashes show 470 references, 0 differ; the replay shows 474 rows, identical. Not run: the whole control-plane suite, web tests (no web file changed), any provider.

## Decisions for the Reviewer
1. Item 280 stays unflagged (recommended), or widen to "attention weights" and accept 2 false positives per 54 hits?
2. Truncated results: 1/3 written as 0.33 passes, 7/9 written as 0.77 fails; no truncation was flagged on the corpus.
3. Prose-only issues get no second same-model repair (the kinds list is empty). Say if you want one.
Own small release later; no release prep done.
