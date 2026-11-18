# Card audio iteration 2 (feat/audio-build-2)

Worktree C:/s/audio-build-2, branch `feat/audio-build-2` on `rabbit-hole`, based on feat/audio-build 5be5d3402. feat/audio-build and its worktree were not touched.

STATUS: code, tests and docs are done and pushed. The LIVE steps (the 36-call measurement on the 12 AUD-2 cards, and the one live script + one voice call with the full texts) are NOT run: the permission system denied the first paid measurement command ("Destructive or Unwanted Actions"), and I did not work around it. Harness is ready: `node run-length2.mjs v2a 3` in this folder (Gemini first, 36 calls plus any re-asks, about USD 0.06 to 0.12; writes results2.jsonl, raw2.jsonl). The live-check script is `../live-check.mjs` (needs its import paths pointed at audio-build-2 and a full-text output file).

| Item | Commit |
|---|---|
| A length rules (floors, one re-ask, card-number rule, counting words, Gemini asks, plain wording, no Greek letters) and the voice cost on the script answer | 302c574de (hunk.diffs/1-length-rules.diff) |
| D in-flight marker | 29c89e50a (hunk.diffs/2-voice-marker.diff) |
| B cost confirmation | a8673c797 (hunk.diffs/3-confirm-cost.diff) |
| Docs | a600bbc8c (hunk.diffs/4-docs.diff) |

Coordination primitive for D: no KV binding exists on the worker (wrangler.rabbit-hole-prod.jsonc has D1, R2, a service binding only). The paid routes coordinate through D1 (admitSpend stable operation ids, admitUsage rows), so the marker is one atomic INSERT ... WHERE NOT EXISTS row in `shared_ask_events` (no migration). B: the pill had no cost confirmation before (it sent confirmed:true at once); it now opens ConfirmDialog with the shared usageLine wording (GenerationProposalCard.jsx usageLine / UNKNOWN_PRICE) and the server's credit figure.
Counting words (A3): per the coordinator's measurement it saves only about 5 words per Gemini script (28 of 35 strips) and lets invented small example sizes ("ten emails") pass; kept as decided, and the prompt now says to use only the card's own numbers for examples.

Iteration 4 (reviewer, after the v3 measurement): the Detailed Gemini ask 400 to 460 overshot (median 341 words after strip, max 507 = about 170 s, over the owner's up to about 2 minutes). It is now 360 to 420 words with "never above 420 words" and "Do not stop before 360 words"; floor stays 300; Brief and Balanced unchanged. Commit below (hunk.diffs/7-detailed-ask-360-420.diff).

## Iteration 5: shared input helper, shared parser, two number sets (commits 44021a5fc, dec5b2a47, 232a16089)
Excluded from the allowed set (spec-internal, never shown): `version` on all 12 cards; illustration spec `id` (`pic-1`) on four-stroke and water-cycle; `links[].from/to` node indices (0,1,2) on softmax; `annotations[].from/to` arrow end points (2.5,1.4,0.6 / 2,1.1,0.5 / 1.4,0.6,0) on gradient-descent Detailed. Still counted (they render): axis min/max, plotted point values, box-plot values and fences, annotation values, every label, caption and item string. Not removed, listed (structural.mjs): none other seen in the 12 cards.
Offline re-score (rescore.mjs, rescore.out; 108 first answers = 72 v2a + 36 v3; old = commit 44021a5fc scripts, new = this parser and sets): example rule, applicable / failed: Brief 0 of 36 / 0 (old 0 / 0), Balanced 18 / 0 (old 18 / 0), Detailed 9 / 0 (old 18 / 1). Detailed applicability halves because gradient-descent Detailed's prose numbers are only w_0 and w_1 (names), so it asks for no example: the old 1 failure is gone, not a new failure.
Old strip kept, new removes (10 sentences, 6 scripts): 'two' on cards whose text has NO number (public-key 'the two roles', 'two large prime numbers', water-cycle 'two puddles'): since `version: 1` no longer counts, those cards have no numbers and the owner's "no numbers at all: counting words are data" rule now bites; 'the 0 to 1 range' (softmax: 0 and 1 were only in links[].from/to); 'a quarter' (bst, the matcher's case). New keeps, old removed (3): 'ten apples ... two' (precision-recall), 'one hundred percent' (softmax r3: the percent form of a card value now matches), 'five' as a bst insert (v3). First-pass status changed on 12 of 108 scripts; floor failures: Balanced 0 to 1, Detailed 15 to 18 (new strips), Brief 0 to 0.
DECISION FOR THE OWNER: the 'two' strips on no-number cards are the literal owner rule newly exposed. Counting words free always (even when the card has no number) would restore them; I did not change it.
Transcript tweak found by the re-score: the transcript writes 'zero' as `$0$`; a digit zero to ten in the TRANSCRIPT is now as free as the word in the script (otherwise 'toward zero' dropped its sentence from both).

## Iteration 6: counting words always free (reviewer decision)
The exception "a card with no numbers: counting words are data" is withdrawn: a lone spelled two to ten and a lone zero are free on every card ('two puddles', 'two roles' stay). Data values (digits, decimals, percents, fractions, anything over ten) are still outside. Re-score of the same 108 first answers (rescore.mjs, rescore.out), old = 44021a5fc parser:
- Example rule applicable / failed: Brief 0 / 0, Balanced 18 / 0, Detailed 9 / 0 (old 18 / 1; unchanged by this step).
- Outside numbers the old strip let through, now removed: 2 sentences (was 10): 'a quarter' on bst r2, and 'the 0 to 1 range' on softmax r2. Sentences the old strip removed that are now kept: 4.
- First-pass status changed: 7 of 108 (was 12). Detailed first-pass floor failures: 17 of 36 (was 18 with the exception; the old parser had 15). Balanced 0 (was 1), Brief 0.
- NOTE for the log: 'the 0 to 1 range' (softmax) is a true sentence the strip removes because the card's text never says 0: the card says 1 (its diagram item '1.0') and 0.1 but never 0. Lone zero and one being free covers the SPELLED words only; here they are the DIGITS '0' and '1', which are data, so the sentence is still removed (the 1 is allowed, the 0 is not). A known, accepted cost of 'only the card's numbers'. Letting a digit 0 to 10 count as free in the script as it already does in the transcript would keep it; not done, not decided.
