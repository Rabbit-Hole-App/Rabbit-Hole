# Spoken-number index: offline matcher test (card audio, iteration 2 scripts)

Offline, no provider call, read-only on the repo. Data: the 72 saved first-answer scripts of the v2a measurement (results2.jsonl, raw2.jsonl; two interleaved runs of the 36-call plan) and the 12 bench cards. Code under test: explanation-audio-script.js on feat/audio-build-2 4aa8e447e (read only).

Method: the scored first answer is not always raw[0] (when Gemini's re-ask came back unreadable the chain went on to Fireworks, and the scored first answer is the Fireworks one). The two passes are joined on card, depth, run, call count and firstRawWords; re-running the shipped stripUnsafe and verdict on every joined answer reproduces firstRawWords, firstStrippedWords and firstFailed for 72 of 72 rows.

## Findings
1. Phrases the old index gets wrong: of 265 real spoken-number phrases in the 72 scripts it misses 2 and reads 1 with the wrong value, in 2 of 72 scripts. Missed: "point one" (no leading digit) and "a quarter". Wrong value: "minus one point five" (sign dropped, read as 1.5). Every other class is read correctly (digits 88, counting words two to ten 77, other number words 39, spoken decimals 41, percent 17). On 40 test phrases the old index is wrong on 16 and the prototype parser on 0 (see checks.md): "point five", "point zero five", "one percent", "two thirds", "a third of", "three quarters", "a half", "one half", "two and a half", "two thousand and twenty four", "minus two", "negative zero point five", "-2", "nineteen eighty four", "twenty twenty four", "1/2". These barely occur in the 72 scripts, so 3 of 265 is a floor for this sample, not a general rate.
2. The example rule does not fail because of the parser: the 43 as-measured failures are the same 43 with the new parser; 0 become passes. 42 of 43 are on cards whose only "data numbers" came from the title or the diagram JSON (for example "version":1), not from prose or the question.

| depth | as measured, old parser | as measured, new parser | tip rule (prose + question), old | tip rule, new | tip rule applies to |
|---|---|---|---|---|---|
| brief | 23/24 | 23/24 | 0/24 | 0/24 | 0 of 24 |
| balanced | 12/24 | 12/24 | 0/24 | 0/24 | 12 of 24 |
| detailed | 8/24 | 8/24 | 1/24 | 1/24 | 12 of 24 |

3. Safety: the new parser catches exactly 1 outside number the old strip let through: "a quarter" (0.25) on bst, in the script and the transcript; 1 of 72 scripts. A larger leak is not about the parser: the allowed set includes every number in the diagrams' JSON (coordinates, versions, ids); 20 mentions in 8 scripts pass only because of such a number, almost all "zero", "0", "1" (for example "approach zero" on softmax). Stripped == raw on the first answer in 53 of 72 rows; re-running the old strip on the others removes 42 sentences in 19 rows.
4. Identifier digits: with Q1 and w_0 dropped from the example set the tip rule fails 3 of 72 instead of 1 (two gradient-descent scripts say "zero" and pass today only because the card writes $w_0$).
5. False positives on the 12 cards' prose and question: 31 mentions, 25 genuine numbers, 6 identifier digits; the not-a-number tokens (lone "one", ordinals, "point", half/quarter, "hundreds") produced 0 false mentions.

Recommendation: replace the parser (small, closes real holes); do not expect it to change the example-rule rate.

Files in this folder: parser-prototype.mjs, retest.mjs, checks.mjs and checks.md (the 40-phrase table), fp.mjs, load.mjs, repro.mjs, dump.mjs, and the retest outputs and tsv lists.
