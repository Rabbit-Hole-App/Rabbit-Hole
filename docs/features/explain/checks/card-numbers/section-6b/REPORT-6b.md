# Section 6b: feat/card-numbers-b tip (AFTER-2) on numeric errors, vs the section-6 arms

Read this first.

- AFTER-2 = rabbit-hole/feat/card-numbers-b tip 0359cf511ea353c899690d345030b7d08d38a707, `git archive` into C:/s/sec6b-tree/after (no worktree touched). Section-6 arms are NOT re-run: BEFORE = main d3857f783 and AFTER = 5c9da7620 come from `../section-6/results.jsonl`.
- Same harness as section 6 (`run6b.mjs` is `run.mjs` with the tree path, one arm, the extended checks and four record fields changed): in-process `generateArtifact` -> fast chain, real providers (Gemini 3.5 flash-lite, then Fireworks gpt-oss-120b), profile google-low, EXPLANATION_PLANNER=jev, formula sampler off, no pictures. Keys read by name from small-deploy/.env, never printed. No deploy, no D1/R2/Worker, no repo edit, no commit.
- Checks: the section-6 card-errors checks are called unmodified (old classifiers, `flags`), plus the three 154 rules as independent re-implementations of the branch's validator code (`checks6b.mjs`, `flags154`): softmax list recompute (half-unit, gated off for temperature/scaled/masked/causal/log-softmax/"T =", with the one-unit rounding clause of 136d01d5d), bootstrap draw count (n draws from n rows), whisker inside a STATED fence (half-unit). `checks154.mjs` is the same three rules without the old-checks import; the report uses it to apply the 154 rules to the stored section-6 BEFORE/AFTER bodies (so all three arms are scored by the same rules).
- Plan (147 runs, one at a time): (1) the 6 box-plot prompts x 3 depths x 3 repeats = 54, same idx as section 6; (2) softmax: the audit softmax prompts ("what does softmax do?" x brief/balanced/detailed, "How do attention scores turn into weights?" balanced = the four prompt x depth pairs that held the audit's flagged softmax cards) x 4 runs = 16, plus 4 prompts I wrote, marked `new` (softmax on 3.0/1.0/0.2; temperature 0.5 and 2 on 2.0/1.0/0.1; scaled dot-product attention with d_k = 4; softmax of logits -1.0/0.5/2.0) x 3 depths x 4 runs = 48; (3) the bootstrap prompt "what does a bootstrap sample of the training rows look like, and which rows repeat?" (ml-trees-bootstrap-roots, demo lesson 04) x 3 depths x 3 = 9; (4) 20 other numeric prompts from the section-6 audit cells (stratified over kinds, no softmax/attention/bootstrap/box prompts) x 1 run. I read "the 6+2 cards" as the audit's flagged softmax/transformation prompts; flags.csv holds 9 softmax/attention rows on those 4 pairs, so the 6+2 count is my interpretation.
- Old-arm rows are the section-6 runs of the SAME prompt x depth cells (box 54 each; softmax audit cells 12 each vs 16; bootstrap balanced only, 3 each vs 9; regression the one matching run per prompt, 20 each). The old arms ran earlier, not interleaved with AFTER-2, so provider drift is not paired out. The new softmax prompts have no old-arm runs.
- Spend: US$0.5442 upper bound (settled ledger US$0.5148 + planner estimate US$0.0002/run), 147 runs, under the US$3.00 cap and the US$2.70 stop line (`cost.txt`).

## Summary (counts, not hedged)

| set | arm | runs | delivered | honest failures ("Couldn't make a reliable card") | delivered with an old-check error | delivered violating a 154 rule |
| --- | --- | --- | --- | --- | --- | --- |
| box plots | BEFORE | 54 | 54 | 0 | 21 | 0 |
| box plots | AFTER | 54 | 54 | 0 | 15 | 0 |
| box plots | AFTER-2 | 54 | 54 | 0 | 10 | 0 |
| softmax, audit prompts | BEFORE / AFTER / AFTER-2 | 12 / 12 / 16 | all | 0 | 1 / 1 / 1 | 1 / 1 / 0 |
| softmax, new prompts | AFTER-2 | 48 | 48 | 0 | 3 | 0 |
| bootstrap | BEFORE / AFTER / AFTER-2 | 3 / 3 / 9 | all | 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| regression (20 prompts x 1) | BEFORE / AFTER / AFTER-2 | 20 each | all | 0 | 0 / 0 / 0 | 0 |
| all shared prompts | BEFORE / AFTER / AFTER-2 | 89 / 89 / 99 | all | 0 | 22 / 16 / 11 | 1 / 1 / 0 |

Repair path, AFTER-2 (all 147 runs):

| | count |
| --- | --- |
| runs whose first answer carried bad numbers (explanation_bad_numbers) | 22 (13 box fence arithmetic, 9 softmax recompute: the new rule) |
| fixed by the first repair (first-repair success) | 22 of 22; Gemini 21/21, gpt-oss 1/1 |
| runs that reached a second same-model repair | 0 (steps with repairs >= 2: 0; repairedAt 2: 0) |
| honest failures (explanation_bad_numbers or any other) | 0 of 147 |
| fallbacks to the next provider | 13 runs (9 bootstrap, 4 new-softmax), every one `validation_error` on Gemini twice (invalid diagram), none for numbers; all 13 delivered by gpt-oss. Section 6 shared prompts: BEFORE 6, AFTER 5 of 89 (the 3+3 bootstrap runs included) |
| settled step outcomes | artifact 147, validation_error 13 |
| `failedOn` | first answer arithmetic 22, first answer validation_error 22 (the 9 other first-answer validation failures were fixed by the repair, 13 were not and fell back), first repair validation_error 13, first repair arithmetic 0 |
| latency | median 2,843 ms all runs; runs with a repair about 4.8 s (as in section 6); bootstrap about 7 s because Gemini fails twice and gpt-oss writes the card |

Second same-model repair: reached by 0 runs, so its success rate is still unmeasured (0 of 0). It is only asked when the failing step's next provider cannot write the kind, or on the last step (gpt-oss). The one gpt-oss step with bad first numbers (a new softmax prompt) was exposed to it and was fixed by the FIRST repair. Every first repair succeeded, so the path never opened; an honest failure ("Couldn't make a reliable card") has never been seen on live providers, in section 6 or 6b.

## Findings

1. Box plots: cards with any flag 21 -> 15 -> 10 of 54 (BEFORE, AFTER, AFTER-2). Taking out `label-value-vs-prose` (all of which I read by hand and found false positives, see the residual section) the real-error cards are 15 -> 5 -> 3 of 54; AFTER to AFTER-2 (5 to 3) is within noise, BEFORE to either is not (box-fence-arithmetic 7 flags -> 0 -> 0). The new whisker-inside-stated-fence rule never fired live: 45 AFTER-2 box diagrams had stated fences and none had a whisker outside them, so its repair path is untested on live providers (unit tests only).
2. Softmax: the new recompute rule did real work. It was ON for 17 plain-number softmax list diagrams and triggered 9 repairs (3 on the audit prompts, 6 on my new prompts), all fixed by the first repair; 0 delivered cards violate it (BEFORE 1 and AFTER 1 of 12 did, the audit's `0.7, 0.26, 0.04` card).
3. Softmax gap in the gate (not fixed by the tip). Recomputing softmax ungated (scripts `ungated.mjs`) over every plain-number list transformation whose after-values sum to about 1, AFTER-2 delivered 4 wrong cards of 23 and the tip's rule caught none:
   - idx 1003 (audit prompt "what does softmax do?", brief): `2.0, 1.0, 0.1 -> 0.70, 0.26, 0.04`, true 0.659, 0.242, 0.099 (the audit's exact error). Title "Turning raw scores into percentages", operation "Apply exponential function and divide by the sum": neither contains the word softmax, and the rule gates on `${title} ${operation}`, so it is off. The old check (which also reads after.label and caption) flagged it.
   - idx 1054 (new prompt): `-1.0, 0.5, 2.0 -> 0.03, 0.15, 0.82`, true 0.039, 0.175, 0.786; title "How logits become probabilities": same gate miss. BOTH the old check and the tip missed it (found only by the ungated recompute).
   - idx 1029 and 1031 (new prompt, temperature): `-> 0.73, 0.26, 0.01` and `0.98, 0.02, 0.00` stated "at temperature 0.5"; true softmax(2, 1, 0.1 / 0.5) = 0.864, 0.117, 0.019. The rule is off for temperature cards by design (only the sum check runs, and both sum to 1). The old check flagged them for the wrong reason (it recomputes at T = 1), but the cards are wrong.
   - idx 1032 (new prompt, balanced): a grouped bar chart with a `T = 1.0` series 0.63, 0.23, 0.09 (sums 0.95; true 0.659, 0.242, 0.099); a bar chart, outside the three rules; flagged by the old `bars-should-sum-to-1`.
   In section 6 the same ungated recompute finds 3 wrong cards in AFTER (24, 141, 142; the old check saw only 24) and 1 in BEFORE (142), so section 6's "AFTER 1 error on softmax" was a floor: two more `0.70, 0.26, 0.04` cards passed the old check for the same title-gate reason. All softmax error counts above (old-check) are therefore lower bounds; the true AFTER-2 count on softmax prompts is 5 wrong cards of 64 (1003, 1029, 1031, 1032, 1054), 1 on the audit prompts (1/16) and 4 on the new ones (4/48).
4. Bootstrap: 9 of 9 cards deliver a bootstrap draw with n draws from n rows (5/5 and 8/8; the section-6 arms 3 of 3 too), all written by gpt-oss after Gemini fails the sample-set diagram twice. The draw-count rule was in scope for all 9 diagrams and never triggered, so the "6 draws from 8 rows" error of the demo lesson was not reproduced in 9 + 3 + 3 runs; the rule's live value is unmeasured (the demo-lesson card it targets is a recorded run, documented in item 7 of the 154 pack).
5. Regression: 20 other numeric prompts, 0 errors, 0 failures in all three arms, 1 first-answer repair in AFTER-2 (any cause), no new failures.
6. Honest-failure path: still never exercised (0 of 147; section 6: 0 of 606). 22 of 22 numbers failures were repaired once. A first-repair success rate of 22/22 on this sample does not bound the true rate tightly (one-sided 95% lower bound about 87%: 0.05^(1/22)), and the second repair has no data.

## Box-plot residuals: label-value-vs-prose (14 cards) and whisker beyond fence (5 cards) of section 6 AFTER

Hand-read: all 14 `label-value-vs-prose` cards and all 5 whisker cards of section 6 AFTER (boxes and the sentence around the flagged number), plus AFTER-2 cards 85, 86, 88, 113, 114, 116. Bench prompts only. `ctx6.mjs`, `dump6.mjs`, `lvp.mjs` reproduce the listings.

label-value-vs-prose: 23 flags on 14 cards, ALL 23 are false positives of the check; every number in those cards is right.

| class | cards (section 6 idx) | flags | what happens | example |
| --- | --- | --- | --- | --- |
| formula start | 87, 90, 91, 95, 125, 134 (6) | 7 | prose is `the upper fence is $Q3 + step = fence$`; the check reads the number after "is $", the first term of the formula, as the fence | 87: "upper fence is $11.5 + 9 = 20.5$" flagged as 11.5 vs 20.5 (Q3 11.5, IQR 6, 1.5 x 6 = 9, fence 20.5: correct) |
| formula chain (gpt-oss) | 98, 99 (2) | 6 | `IQR = Q3 - Q1 = 14` read as "Q1 = 14"; `Q1 - 1.5xIQR = 40` read as "IQR = 40"; `Q3 + 1.5xIQR = 96` read as "IQR = 96" | 98: Q1 61, Q3 75, IQR 14, fences 40 / 96, outlier 98: all correct |
| two-group | 110, 113, 114, 115, 117, 118 (6) | 10 | the label "median" is registered once per box (Class A 75, Class B 74); a correct sentence "median of 75" for A is compared with B's 74 and flagged, and the sentence for B with A's | 113: A median 75, B median 74; prose "A ... median of 75", "B ... median of 74": both right, 2 flags |

That is the guess in section 6 finding 4, now verified: on two-group box plots with different medians the check flags a correct card whenever the prose states both medians (6 of the 9 prompt-4 AFTER cards, and prompt 4 has the 7/9 "error" rate in all arms because of it). In AFTER-2 the same classes: 9 flagged cards, 15 flags, 2 formula-start (86, 88), 2 half-median ("the lower half has a median of 6", 85: a quartile named median), 11 two-group (113 to 118): all false positives. BEFORE has 20 flags of the same classes (two of them "upper fence at 97.5" in card 96, whose diagram fences also fail the fence arithmetic, a real error flagged by another check).

box-whisker-beyond-correct-fence: 10 flags on 5 cards (110, 112, 113, 114, 115), real in the Tukey convention. All five are prompt 4 (two classes), Class B drawn with `whiskerLow 40, whiskerHigh 100` and NO stated fences; the data 40, 70, 72, 74, 76, 78, 100 with Q1 70 to 71 and Q3 77 to 78 puts 40 and 100 outside 1.5 x IQR (62 / 86 or 58 / 90), so they belong in `outliers`, not on the whiskers. In 110, 113 and 115 the prose itself calls 40 and 100 "outliers" or "extreme scores" while the diagram draws them as whiskers; 112 says "extreme low and high scores"; card 114 of section 6 shows the same drawing. Whiskers to the min and max is a legitimate convention only if the card says so; these cards say outlier. The other cards of the same data (Class B in AFTER-2 cards 114, 116 to 118, and section 6 cards 117, 118) draw it correctly: fences 62 / 86, whiskers 70 / 78, outliers 40 and 100.

What the tip does to them: nothing, by design. The label-value check is not part of the validator (a measurement check only), so those 23 (AFTER) and 15 (AFTER-2) flags stay and should be fixed in the check (skip "is $", skip the first term of a formula, compare a label with the prose value for the SAME box, ignore "half has a median"), not in the cards. The whisker-beyond-fence rule fires only when a box states `fences`; the 5 section-6 cards and the 3 AFTER-2 cards (112, 113, 115, all Class B of prompt 4) have no stated fences, so the rule does not apply: AFTER-2 prompt 4 draws the stated-fence form in 6 of 9 Class B boxes (4 of 9 in AFTER) with 0 whisker flags among them, the 3 without fences are the 3 flagged. So the tip removes the whisker error when the author states fences and leaves it when the author draws a whisker to an unstated fence; a rule "whiskers must not exceed Q1 - 1.5 IQR / Q3 + 1.5 IQR when the prose or caption calls the extremes outliers" would be needed, which I did not build or test.

## What I could not do or did not check

- The second same-model repair and the honest-failure path were not exercised (0 of 147 runs reached them): the first repair always worked and the path is only open on the last step or when the next provider cannot write the kind. Forcing it needs an injected bad model call (the chain's offline test harness), which is a different test; not done.
- The whisker-inside-stated-fence and bootstrap draw-count rules never triggered a live repair; only the softmax recompute did (9 repairs). Their live effect on a card is unmeasured.
- The new softmax prompts have no BEFORE / AFTER comparison (not asked); old-arm cells for the bootstrap prompt exist at balanced depth only (3 runs).
- The old checks import compileFormula from C:/s/explain-layout-web/scripts/explain-bench/score.mjs. After the run, that worktree changed (its HEAD is now a merge of card-numbers-b) and the old checks no longer import (`zod` missing); the run results are unaffected (flags were computed at run time), and the report uses `checks154.mjs` for the 154 rules, which has no such import. Do not rerun `run6b.mjs` without fixing that import.
- The old arms are from an earlier time window; there is no interleaved AFTER-2 vs BEFORE pair. Provider drift between the two windows is not controlled.
- No pictures (no Recraft), n small: 54 box runs per arm, 12-16 per softmax set. The 154-rule ungated recompute and the false-positive classes are my own heuristics (`ungated.mjs`, `lvp.mjs`); I hand-read the 14 + 5 cards and 6 more, not every flagged card of BEFORE.
- Nothing about learner data: all prompts are bench prompts or written by me.

Files: `run6b.mjs` (runner as run), `plan6b.mjs`, `plan.json`, `checks6b.mjs` (old checks + 154 rules, as run), `checks154.mjs` (154 rules only), `report6b.mjs`, `results.jsonl` / `results.json` (every run: attempts with repairs, repairedAt, failedOn, events, ledger, flags, flags154, card body; no keys), `run.log`, `cost.txt`, helpers `extra6b.mjs` (repair triggers and rule scope), `ungated.mjs`, `lvp.mjs`, `ctx6.mjs`, `dump6.mjs`, `REPORT-tables-6b.md` (all tables, below).

---

# Tables

## 1. Headline per prompt set: BEFORE vs AFTER vs AFTER-2 on the same prompt x depth cells

"error" = a delivered card with at least one flag of the section-6 checks (old classifiers, unmodified). "154 rule" = at least one flag of the three new rules (softmax half-unit gated, bootstrap draw count, whisker inside a stated fence), computed on every arm from the stored body. "honest failure" = the run ended without a card (the learner would see "Couldn't make a reliable card").

### box-plot prompts (6 prompts x 3 depths x 3 repeats)

| arm | runs | delivered | honest failures | of those on bad numbers | delivered with an error (old checks) | per 100 delivered | delivered violating a 154 rule | old-check flags | median ms | cost US$ settled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main d3857f783 | 54 | 54 | 0 | 0 | 21 | 38.9 | 0 | 42 | 4514 | 0.2478 |
| AFTER 5c9da7620 | 54 | 54 | 0 | 0 | 15 | 27.8 | 0 | 33 | 2861 | 0.1960 |
| AFTER-2 0359cf511 | 54 | 54 | 0 | 0 | 10 | 18.5 | 0 | 21 | 2844 | 0.1965 |

### softmax prompts from the audit (what does softmax do? x3 depths, attention scores x1 depth; 4 runs each in AFTER-2, 3 in the old arms)

| arm | runs | delivered | honest failures | of those on bad numbers | delivered with an error (old checks) | per 100 delivered | delivered violating a 154 rule | old-check flags | median ms | cost US$ settled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main d3857f783 | 12 | 12 | 0 | 0 | 1 | 8.3 | 1 | 1 | 2329 | 0.0276 |
| AFTER 5c9da7620 | 12 | 12 | 0 | 0 | 1 | 8.3 | 1 | 1 | 2465 | 0.0272 |
| AFTER-2 0359cf511 | 16 | 16 | 0 | 0 | 1 | 6.3 | 0 | 1 | 2323 | 0.0429 |

### softmax / temperature / scaled-attention prompts written for 6b (marked new; AFTER-2 only, 4 new prompts x 3 depths x 4 runs)

| arm | runs | delivered | honest failures | of those on bad numbers | delivered with an error (old checks) | per 100 delivered | delivered violating a 154 rule | old-check flags | median ms | cost US$ settled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AFTER-2 0359cf511 | 48 | 48 | 0 | 0 | 3 | 6.3 | 0 | 3 | 2760 | 0.1638 |

### bootstrap prompt (ml-trees-bootstrap-roots) x 3 depths x 3 repeats (old arms ran the balanced depth only, 3 runs each)

| arm | runs | delivered | honest failures | of those on bad numbers | delivered with an error (old checks) | per 100 delivered | delivered violating a 154 rule | old-check flags | median ms | cost US$ settled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main d3857f783 | 3 | 3 | 0 | 0 | 0 | 0.0 | 0 | 0 | 6904 | 0.0176 |
| AFTER 5c9da7620 | 3 | 3 | 0 | 0 | 0 | 0.0 | 0 | 0 | 7519 | 0.0177 |
| AFTER-2 0359cf511 | 9 | 9 | 0 | 0 | 0 | 0.0 | 0 | 0 | 7000 | 0.0555 |

### regression: 20 other numeric prompts x 1 run

| arm | runs | delivered | honest failures | of those on bad numbers | delivered with an error (old checks) | per 100 delivered | delivered violating a 154 rule | old-check flags | median ms | cost US$ settled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main d3857f783 | 20 | 20 | 0 | 0 | 0 | 0.0 | 0 | 0 | 2928 | 0.0595 |
| AFTER 5c9da7620 | 20 | 20 | 0 | 0 | 0 | 0.0 | 0 | 0 | 2962 | 0.0567 |
| AFTER-2 0359cf511 | 20 | 20 | 0 | 0 | 0 | 0.0 | 0 | 0 | 2874 | 0.0562 |

### All prompts both old arms also ran (new softmax prompts excluded)

| arm | runs | delivered | honest failures | of those on bad numbers | delivered with an error (old checks) | per 100 delivered | delivered violating a 154 rule | old-check flags | median ms | cost US$ settled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main d3857f783 | 89 | 89 | 0 | 0 | 22 | 24.7 | 1 | 43 | 3182 | 0.3525 |
| AFTER 5c9da7620 | 89 | 89 | 0 | 0 | 16 | 18.0 | 1 | 34 | 2846 | 0.2976 |
| AFTER-2 0359cf511 | 99 | 99 | 0 | 0 | 11 | 11.1 | 0 | 22 | 2845 | 0.3510 |

## 2. Repair path per prompt set (first repair, second same-model repair, fallbacks)

"first answer carried bad numbers" counts runs whose first author answer logged explanation_bad_numbers (learn_artifact_invalid, attempt 0), the same count for every arm. "second same-model repair reached" = the first repair also came back with bad numbers (attempt 1 logged bad numbers), so a second repair (ARITHMETIC_REPAIRS_SAME_MODEL; AFTER and AFTER-2 only) was asked or the step failed. BEFORE has no repair trigger on numbers.

| set | arm | runs whose first answer carried bad numbers | fixed by the first repair | second repair reached | steps delivered at repairedAt 1 (any cause) | steps delivered at repairedAt 2 | steps ending in arithmetic | runs that went to the next provider | of those delivered | honest failures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| box-plot prompts | BEFORE main d3857f783 | 0 | 0 (0 delivered) | 0 | 0 | 0 | 0 | 3 | 3/3 | 0 |
| box-plot prompts | AFTER 5c9da7620 | 10 | 10 (10 delivered) | 0 | 10 | 0 | 0 | 2 | 2/2 | 0 |
| box-plot prompts | AFTER-2 0359cf511 | 13 | 13 (13 delivered) | 0 | 13 | 0 | 0 | 0 | 0/0 | 0 |
| softmax prompts from the audit | BEFORE main d3857f783 | 0 | 0 (0 delivered) | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 |
| softmax prompts from the audit | AFTER 5c9da7620 | 0 | 0 (0 delivered) | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 |
| softmax prompts from the audit | AFTER-2 0359cf511 | 3 | 3 (3 delivered) | 0 | 4 | 0 | 0 | 0 | 0/0 | 0 |
| softmax / temperature / scaled-attention pro | AFTER-2 0359cf511 | 6 | 6 (6 delivered) | 0 | 10 | 0 | 0 | 4 | 4/4 | 0 |
| bootstrap prompt | BEFORE main d3857f783 | 0 | 0 (0 delivered) | 0 | 0 | 0 | 0 | 3 | 3/3 | 0 |
| bootstrap prompt | AFTER 5c9da7620 | 0 | 0 (0 delivered) | 0 | 0 | 0 | 0 | 3 | 3/3 | 0 |
| bootstrap prompt | AFTER-2 0359cf511 | 0 | 0 (0 delivered) | 0 | 3 | 0 | 0 | 9 | 9/9 | 0 |
| regression | BEFORE main d3857f783 | 0 | 0 (0 delivered) | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 |
| regression | AFTER 5c9da7620 | 0 | 0 (0 delivered) | 0 | 2 | 0 | 0 | 0 | 0/0 | 0 |
| regression | AFTER-2 0359cf511 | 0 | 0 (0 delivered) | 0 | 1 | 0 | 0 | 0 | 0/0 | 0 |
| all 6b runs | BEFORE main d3857f783 | 0 | 0 (0 delivered) | 0 | 0 | 0 | 0 | 6 | 6/6 | 0 |
| all 6b runs | AFTER 5c9da7620 | 10 | 10 (10 delivered) | 0 | 12 | 0 | 0 | 5 | 5/5 | 0 |
| all 6b runs | AFTER-2 0359cf511 | 22 | 22 (22 delivered) | 0 | 31 | 0 | 0 | 13 | 13/13 | 0 |

AFTER-2 `failedOn` (the failure outcome of each failed answer of a step), counted over all steps:

| position: outcome | steps |
| --- | --- |
| 1 first answer: arithmetic | 22 |
| 1 first answer: validation_error | 22 |
| 2 first repair: validation_error | 13 |

AFTER-2 step outcomes: artifact 147, validation_error 13; steps with repairs >= 2: 0; steps whose first answer failed on numbers: 22, of which ended in a card 22.

AFTER-2 steps that ended in a failure outcome (fallback reasons): run 1021 validation_error (validation_error>validation_error); run 1051 validation_error (validation_error>validation_error); run 1052 validation_error (validation_error>validation_error); run 1061 validation_error (validation_error>validation_error); run 1064 validation_error (validation_error>validation_error); run 1065 validation_error (validation_error>validation_error); run 1066 validation_error (validation_error>validation_error); run 1067 validation_error (validation_error>validation_error); run 1068 validation_error (validation_error>validation_error); run 1069 validation_error (validation_error>validation_error); run 1070 validation_error (validation_error>validation_error); run 1071 validation_error (validation_error>validation_error); run 1072 validation_error (validation_error>validation_error).

## 3. Per authoring model (model that wrote the delivered card)

| model | arm | delivered | with an error (old checks) | per 100 | violating a 154 rule | median ms |
| --- | --- | --- | --- | --- | --- | --- |
| gemini-flash-lite | BEFORE main d3857f783 | 83 | 21 | 25.3 | 1 | 3037 |
| gemini-flash-lite | AFTER 5c9da7620 | 84 | 14 | 16.7 | 1 | 2808 |
| gemini-flash-lite | AFTER-2 0359cf511 | 90 | 11 | 12.2 | 0 | 2763 |
| gpt-oss-120b | BEFORE main d3857f783 | 6 | 1 | 16.7 | 0 | 7822 |
| gpt-oss-120b | AFTER 5c9da7620 | 5 | 2 | 40.0 | 0 | 7663 |
| gpt-oss-120b | AFTER-2 0359cf511 | 9 | 0 | 0.0 | 0 | 7000 |
| failed (no card) | AFTER-2 0359cf511 | 0 | - | - | - | - |

Runs of the prompt x depth cells shared by all arms (new softmax prompts excluded).

New softmax prompts (AFTER-2 only): gemini-flash-lite 44 delivered, gpt-oss-120b 4 delivered; cards with an old-check flag 3, with a 154 flag 0.

## 4. Per diagram kind (delivered cards holding a numeric diagram of that kind; a card counts once per kind)

| kind | BEFORE cards | flagged | 154 | AFTER cards | flagged | 154 | AFTER-2 cards | flagged | 154 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bar-chart | 3 | 0 | 0 | 3 | 0 | 0 | 2 | 0 | 0 |
| box-plot | 54 | 21 | 0 | 54 | 15 | 0 | 54 | 10 | 0 |
| coordinate-plot | 6 | 0 | 0 | 6 | 0 | 0 | 7 | 0 | 0 |
| heatmap | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 |
| matrix | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 |
| number-line | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 |
| sample-set | 3 | 0 | 0 | 3 | 0 | 0 | 9 | 0 | 0 |
| token-links | 6 | 0 | 0 | 6 | 0 | 0 | 7 | 0 | 0 |
| transformation | 9 | 1 | 1 | 9 | 1 | 1 | 12 | 1 | 0 |

Same prompt x depth cells for all three arms (new softmax prompts excluded). "flagged" = old checks on that kind; "154" = the new rules on that kind. Box-plot prompts that the planner turned into another kind are counted under that kind.

AFTER-2 including the new softmax prompts:

| kind | cards | flagged (old) | flagged (154) |
| --- | --- | --- | --- |
| transformation | 29 | 3 | 0 |
| sample-set | 9 | 0 | 0 |
| box-plot | 54 | 10 | 0 |

## 5. Remaining errors by class (flags in delivered cards; a card can carry several)

| check | BEFORE | AFTER | AFTER-2 |
| --- | --- | --- | --- |
| arithmetic-statement | 4 | 0 | 0 |
| box-fence-arithmetic | 7 | 0 | 0 |
| box-whisker-beyond-correct-fence | 11 | 10 | 6 |
| label-value-vs-prose | 20 | 23 | 15 |
| softmax-recompute | 1 | 1 | 1 |
| softmax-recompute-154 | 1 | 1 | 0 |

New softmax prompts (AFTER-2 only): softmax-recompute 2, bars-should-sum-to-1 1.

## 6. Cost and latency

| set | runs | settled cost US$ | upper bound US$ (incl. planner est.) | median ms | mean ms |
| --- | --- | --- | --- | --- | --- |
| AFTER-2 all | 147 | 0.5148 | 0.5442 | 2843 | 3429 |
| box-plot prompts | 54 | 0.1965 | 0.2073 | 2844 | 3160 |
| softmax prompts from the audit | 16 | 0.0429 | 0.0461 | 2323 | 2517 |
| softmax / temperature / scaled-attention prompts w | 48 | 0.1638 | 0.1734 | 2760 | 3516 |
| bootstrap prompt | 9 | 0.0555 | 0.0573 | 7000 | 7223 |
| regression: 20 other numeric prompts x 1 run | 20 | 0.0562 | 0.0602 | 2874 | 2970 |

## 7. Every flagged AFTER-2 delivered card and every AFTER-2 failure

| idx | set | depth | prompt | author | checks | first detail |
| --- | --- | --- | --- | --- | --- | --- |
| 85 | box | brief | "How do IQR fences flag outliers in a box plot | gemini-flash-lite | label-value-vs-prose; label-value-vs-prose | median: diagram 8, prose "median of 6," |
| 86 | box | balanced | "How do IQR fences flag outliers in a box plot | gemini-flash-lite | label-value-vs-prose | upper fence: diagram 13.5, prose "upper fence is $9" |
| 88 | box | balanced | "How do IQR fences flag outliers in a box plot | gemini-flash-lite | label-value-vs-prose | upper fence: diagram 20.5, prose "upper fence is $11.5" |
| 112 | box | brief | "Compare the spread of two classes with box pl | gemini-flash-lite | box-whisker-beyond-correct-fence; box-whisker-beyond-correct-fence | whiskerLow 40 beyond the correct fence 58 / 90 |
| 113 | box | balanced | "Compare the spread of two classes with box pl | gemini-flash-lite | label-value-vs-prose; label-value-vs-prose; box-whisker-beyond-correct-fence; box-whisker- | median: diagram 75, prose "median of 74," |
| 114 | box | balanced | "Compare the spread of two classes with box pl | gemini-flash-lite | label-value-vs-prose; label-value-vs-prose | median: diagram 75, prose "median of 74," |
| 115 | box | balanced | "Compare the spread of two classes with box pl | gemini-flash-lite | label-value-vs-prose; box-whisker-beyond-correct-fence; box-whisker-beyond-correct-fence | median: diagram 74, prose "median of 75" |
| 116 | box | detailed | "Compare the spread of two classes with box pl | gemini-flash-lite | label-value-vs-prose; label-value-vs-prose | median: diagram 75, prose "median of 74," |
| 117 | box | detailed | "Compare the spread of two classes with box pl | gemini-flash-lite | label-value-vs-prose; label-value-vs-prose | median: diagram 75, prose "median is 74" |
| 118 | box | detailed | "Compare the spread of two classes with box pl | gemini-flash-lite | label-value-vs-prose; label-value-vs-prose | median: diagram 75, prose "median is 74," |
| 1003 | softmax/audit | brief | "what does softmax do?" | gemini-flash-lite | softmax-recompute | softmax(2, 1, 0.1) = 0.659, 0.242, 0.099, card states 0.7, 0.26, 0.04 |
| 1029 | softmax/new | brief | "What does the temperature do in softmax? Show | gemini-flash-lite | softmax-recompute | softmax(2, 1, 0.1) = 0.659, 0.242, 0.099, card states 0.73, 0.26, 0.01 |
| 1031 | softmax/new | brief | "What does the temperature do in softmax? Show | gemini-flash-lite | softmax-recompute | softmax(2, 1, 0.1) = 0.659, 0.242, 0.099, card states 0.98, 0.02, 0 |
| 1032 | softmax/new | balanced | "What does the temperature do in softmax? Show | gemini-flash-lite | bars-should-sum-to-1 | series T = 1.0: 0.63, 0.23, 0.09 sum to 0.95, text says a distribution |
