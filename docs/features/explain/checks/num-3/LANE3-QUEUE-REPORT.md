# Lane 3 queue after NUM-3c: BOX-1 addendum, NOVIS-1 trace, SAMP-1, MAT-E (2026-11-19)

The lead wrote this from the lane agent's text. No harness refusals, no paid or provider calls. Commits use `git commit --only` with plain messages.

## 2.1 BOX-1 addendum (R2 bench, no code)
The R2 bench has 22 box-plot boxes (10 BEFORE, 12 AFTER). Only one question gives a single dataset in the prompt (3, 5, 6, 7, 8, 9, 11, 12, 40), so 12 cards can be checked (6 per arm); the other 10 are the multi-box "Explain quartiles, IQR fences..." question, whose data is not in the prompt. True values: median 8, exclusive Q1/Q3 5.5 / 11.5, inclusive 6 / 11. Every card drew Q1 = 5.5.

| measure, 12 cards | all | BEFORE | AFTER |
|---|---|---|---|
| median wrong (8.5) | 2 | 0 | 2 |
| Q1/Q3 match exclusive | 6 | 4 | 2 |
| Q1/Q3 match inclusive or linear | 0 | 0 | 0 |
| Q1/Q3 match no method | 6 | 2 | 4 |
| inconsistent with both methods | 8 | 2 | 6 |

Q3 drawn: BEFORE 11.5 four times, 10.5 once, 10 once; AFTER 10 four times (the Reviewer said three), plus 11.5 twice with median 8.5. Q3 = 10 and 10.5 match neither method. The repo's fence rule assumes no quartile method, so none of these is caught today. Script: C:/s/gen1-prep/box1-r2.mjs.

## 2.2 NOVIS-1 trace (read-only)
- Text-to-image question: 6 of 6 cards (3 seeds x 2 arms) have plannerKind flow, 0 diagrams, no events or flags, authored by Gemini. The saved raw answer (`rawGoogle`) in all 6 has `visuals` = one `{k:'picture'}` and no diagram. The plan's own visual list is not stored in the record, only plannerKind and `plannedKindMissing: true`.
- Thermostat AFTER bench-66-2 (planner cycle): raw visuals were a picture plus `{k:'spec', spec:{kind:'cycle',...}}`. `k:'spec'` is not `diagram`, so `visualFence` returns null at learn-primitives.js:90 and `composeVisuals` (:115-124) silently drops it. Only the picture was left.
- Why `explanation_missing_visual` did not fire:
  1. The check runs before the picture is made. `explanationProblem` (learn-artifact.js ~329) calls `explanationLayoutProblem` (learn-primitives.js:1267-1273) while the body still holds the picture fence; re-derived from the raw answer it returns null there.
  2. `illustrateExplanation` (learn-artifact.js:343, explanation-figures.js:125-129) then fails to make the picture and `withoutIllustrations` (learn-primitives.js:571) removes the fence. Nothing re-checks afterwards. Re-running the layout check on the stripped body gives exactly `explanation_missing_visual`.
  3. The other guard, learn-artifact.js:315, only runs when diagrams were dropped and no picture is left; never entered here.
- Not verified: why the picture could not be made in the bench (the records show no fence and no `figures` saved).
- Across the R2 bench, 14 of 264 cards were delivered with 0 diagrams, 7 of them flagged `plannedKindMissing`. Script: C:/s/gen1-prep/novis-trace.mjs.

## 2.3 SAMP-1: feat/samp-1, commit 2a36bbd6e (pushed)
Rule: new `checkSampleWords` in ml-statistical-spec.js, called from `checkSamples`, arithmetic-tagged. It reads title and caption only for plain "ids + repeat" or "ids + omitted" wording (by id or label, optionally after "row(s)"). A repeated id must be drawn at least twice in at least one group; an omitted id must be absent from at least one group. Not read: negations, and "A row can repeat" / "other rows are omitted" (they name no row).
Bench cards now rejected (AFTER, Gemini): bench-80-2 (members A,A,C,D) and bench-120-3 (A,A,C,D,E): "The text says C repeats, but C is drawn 1 time in "Sample Draw" (A, A, C, D); a repeated sample appears at least twice." The third AFTER card (bench-28-1, C drawn twice) and the BEFORE cards pass.
False positives: 27 distinct sample-set diagrams scanned (library 11, gallery 3, saved cards, 124 archive objects); 14 have a repeat or omit word; only the 2 bench cards changed from accept to reject; library and gallery 0 rejected.
Tests: 3 new in ml-statistical.test.mjs. Guards (baseline on main a88949c27): ml-statistical 31/31, tutor-diagrams directory 1415/1415, control plane 118/118, 470 request hashes identical, 474-row replay identical, svg-snapshots untouched. Script: samp1-scan.mjs in C:/s/gen1-prep/.

## 2.4 MAT-E: feat/mat-e, commit cf5c0afb6 (pushed)
Rule: in the `matrix` case of spec.js, a column where every cell is empty or a dash (-, en or em dash, minus) is rejected; skipped when `states` marks cells missing; "n/a" counts as a value.
Bench card (R2 bench-12-1, AFTER, Gemini; fraud question, columns Class / Count / Proportion) rejected: `Column "Proportion" has no value in any row (every cell is empty or a dash); the values may be one column off...`.
Scan of 252 distinct matrices (library 124, gallery 3, saved cards, archive): library and gallery 0 fail (none, as expected). Two saved cards newly rejected: the fraud card, and a card-numbers teaching matrix "Scaled Attention Scores" whose "Scaled Score" column is all em dashes (a real defect).
SIDE EFFECT for the Reviewer: `correctedMatrix` (learn-primitives.js:897) pads every row with an em dash when all rows are short by the same count; that pad is always an all-dash column, so the correction no longer lands. One assertion in explanation-diagram-corrections.test.js was changed to expect no correction for that case. The pad branch is now dead code and was left in place; delete it or keep it is the Reviewer's call.
Tests: 1 new in spec.test.mjs. Guards: tutor-diagrams 1413/1413, control plane 118/118, hashes 470 identical, replay 474 identical, svg-snapshots untouched. Script: mate-scan.mjs in C:/s/gen1-prep/.
Worktree C:/s/num3a is now on feat/mat-e.
