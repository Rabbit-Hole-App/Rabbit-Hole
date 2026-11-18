# Card audio: script length measurement (2026-11-17)

Real path: `writeScript` and `stripUnsafe` imported from the worktree C:/s/audio-build (tip 5be5d3402), no reimplementation. Gemini-first arm = production (both keys); Fireworks-first arm = only the Fireworks key present, so the chain's fallback step is the only one (every call returned from the intended provider: 72 google, 72 fireworks). 12 trial cards of AUD-2 (4 Brief=overview, 4 Balanced, 4 Detailed=deep; the original bench JSON with diagrams, as live-check.mjs does), 3 runs x 2 passes = 6 samples per card and arm, 144 calls, no voice. Per-call rows: results.jsonl (pass 1 has no raw text; pass 2 raw text is in raw.jsonl). Spend about USD 0.155 (cost.txt).
All 144 calls parsed, finish=stop, none under 40 words (no `too_short`).

## Words per script (median / min / max), n = 24 per cell
Targets in the prompt: owner/standard Brief 180-240, Balanced 240-300, Detailed 300-360 words; Gemini block asks higher (190-240, 260-320, 320-380). Seconds = the code's estimate (words / 3).

| Model | Depth | Raw (before strip) | After strip | Est. seconds (after) | Scripts with a strip | Sentences stripped | Raw >= owner low end | After >= owner low end |
|---|---|---|---|---|---|---|---|---|
| Gemini | Brief | 129 / 69 / 176 | 114 / 69 / 176 | 38 (target 60-80) | 8/24 | 17/194 (8.8%) | 0/24 | 0/24 |
| Gemini | Balanced | 205 / 131 / 300 | 194 / 102 / 300 | 65 (target ~90) | 11/24 | 13/296 (4.4%) | 7/24 | 7/24 |
| Gemini | Detailed | 318 / 172 / 441 | 318 / 172 / 422 | 106 (target <=120) | 4/24 | 5/405 (1.2%) | 13/24 | 13/24 |
| Fireworks | Brief | 160 / 116 / 200 | 151 / 91 / 200 | 50 | 8/24 | 15/210 (7.1%) | 8/24 | 7/24 |
| Fireworks | Balanced | 246 / 196 / 311 | 237 / 154 / 302 | 79 | 12/24 | 23/286 (8.0%) | 14/24 | 10/24 |
| Fireworks | Detailed | 331 / 211 / 363 | 268 / 138 / 363 | 89 | 18/24 | 61/376 (16.2%) | 19/24 | 8/24 |

Gemini overall: 35 of 895 sentences stripped (3.9%), Fireworks 99 of 872 (11.4%).
The builder's live sample (79 words after, Balanced, bootstrap card) is in the tail: that card gives Gemini after-strip 102 to 294 here (median 214); the lowest Gemini Balanced scripts anywhere are 102-131 words.

## Why sentences get stripped (all 134)
| Reason | Gemini | Fireworks |
|---|---|---|
| Number outside the card, spelled in words | 35 | 71 |
| Number outside the card, in digits | 0 | 3 |
| Symbol in the spoken script (LaTeX `$E$`, a Greek letter, `=`) | 0 | 25 |

Numbers in the stripped sentences (quoted; bench cards only):
- Gemini (all 35 are small counts or a derived value): `two` or `three` (22 sentences, as in "two people" or "the other three strokes"), `ten` and `eight` (an invented apples example), `37` percent (card says 63), `zero`.
- Fireworks: the same `two`/`three` counts (about 30), plus values the model computed or invented: `1000` (a thousand marbles or rows, 9 sentences), `37`, `62.3`, `368` and `632` thousandths, `300|68|600|32`, `50`, `17`, `5|11`, `9`, `2|4|9|12`, `2.01`. The 25 symbol sentences are all on the two math-heavy Detailed cards (water cycle `$E$`, gradient descent eta): Fireworks puts LaTeX in the spoken script, which the prompt forbids.

## Is the shortfall the model or the strip?
Counting scripts below the owner's low end:

| Model | Depth | Raw below | After below | Caused by the strip (raw ok, after short) |
|---|---|---|---|---|
| Gemini | Brief | 24/24 | 24/24 | 0 |
| Gemini | Balanced | 17/24 | 17/24 | 0 |
| Gemini | Detailed | 11/24 | 11/24 | 0 |
| Fireworks | Brief | 16/24 | 17/24 | 1 |
| Fireworks | Balanced | 10/24 | 14/24 | 4 |
| Fireworks | Detailed | 5/24 | 16/24 | 11 |

Gemini: the shortfall is entirely the model undershooting. Its raw median is 129 / 205 / 318 words against asks of 190 / 260 / 320; the strip removes only 0 to 11 words a script on average (Detailed: nothing at all in pass 2). Brief is short on every one of 24 samples (a short card such as the Roman empire gives 69 to 88 words). The 79-word live sample is a low raw script plus a strip, not a strip problem.
Fireworks: raw is close to target, and the strip is what hurts it, mostly at Detailed (331 raw to 268 after; 11 of the 16 short results are the strip's doing).

## Options, with measured effect
(a) Allow spelled-out whole numbers one to ten. Upper bound from the data: saves 28 of Gemini's 35 stripped sentences (about 4 per 10 scripts), but only about 5 words a script on average: Gemini median after-strip Brief 114 to 129, Balanced 194 to 196, Detailed unchanged at 318; share reaching the owner's low end does not move (0/24, 7/24, 13/24). For Fireworks it saves 46 of 99 and lifts Detailed 268 to 307 (>= 300 in 13/24 instead of 8/24), Balanced 237 to 238. It cannot tell "two people" from a quantity claim: it would also pass invented example sizes ("three positive guesses", "ten actual apples", "eight apples", the last one computed), which the owner's NUMBERS rule says to keep out. It does not fix Gemini. Needs an owner decision on the rule.
(b) Fireworks first. Better on Brief (median after 151 vs 114) and Balanced (237 vs 194), worse on Detailed (268 vs 318, because 16% of its sentences are stripped), 33% slower (median 2.7 s vs 2.0 s), cheaper per call (about USD 0.0006 vs 0.0016), but it speaks math symbols and computes or invents numbers (3x the stripped-sentence rate). Not a clean win: only better on the two shorter depths, and neither arm reaches the Brief target (best Brief median 151 words, about 50 s, vs 180 to 240).
(c) Raise the Gemini word target. The data say this is the real lever (the shortfall is raw). `writeScript` accepts no prompt override, so I did NOT run it; the variant is in variant-prompt.txt (Gemini block only: Brief 300-360, Balanced 360-420, Detailed 340-400, an extra "second angle" item and "do not stop before N words"). Prediction, unmeasured: Brief median about 180-200 words, Balanced about 255-270, Detailed unchanged.

## Recommendation
1. Do (c) first (Gemini block only), and measure it on these 12 cards (36 calls, about USD 0.06) before shipping; the dominant cause is the model undershooting, not the number check.
2. Keep Gemini first; do not switch to Fireworks first (it trades Detailed length and number safety for Brief/Balanced length). Optionally keep Fireworks as the fallback only.
3. Leave the number rule as the owner wrote it; (a) buys about nothing for Gemini and loosens a rule the owner set. If the owner still wants shorter-sentence loss reduced, (a) is only worth it on a Fireworks path.
4. Separately, the Fireworks fallback should be told once more not to write LaTeX or symbols in the spoken script (25 sentences lost to that), but that touches the prompt shared with the standard family, so note it, not part of this measurement.
5. Brief cards with a very short body (Roman empire: 69 to 88 words) will always run short; accept it or lower MIN_WORDS expectations per card length.
Limits: 6 samples per card, model output varies run to run (pass 1 and 2 agreed within a few percent); "seconds" is the code's words/3 estimate, not audio; the (a) counts are an upper bound by number value, not a judgement of each sentence; spend computed from usage x registry rates, not an invoice.
