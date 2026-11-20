# Same-JSON full build, step 1 (2026-11-20)

The lead wrote this from its own runs and the lane agents' text. Branch **feat/same-json** (off main aee3dba82), pushed. Tip at the time of writing: see the table. **Pass line not met on cards delivered: the fixed build delivered 71 of 75 against main's 75 (below by 4).** Nothing is merged, nothing released.

## Status table

| # | Item | Status | Branch, commit, evidence |
|---|---|---|---|
| 1 | Fix A and Fix B | DONE | feat/same-json e3b967d05 (squash of the four proving branches), gated by 6ebe5fff7: both apply only to a request that shows a declared reference; every other request keeps main's text. Evidence: guards.json |
| 2 | Example shown with its numbers removed | DONE | e3b967d05, 6ebe5fff7 (explanation-references.js). Examples blocks as sent: examples-block-*-{brief,balanced,detailed}.txt |
| 3 | Starting numbers from the request's seed | DONE | e3b967d05, 6ebe5fff7. In every examples block |
| 4 | `variables` on every kind, out of Gemini's schema except for a card whose reference has a function | DONE | e3b967d05 (spec.js); 1dae906e0 limits the names to the reference's own. dryrun.json: answer schema 36, 112, 31, 25 properties |
| 5 | Function on the reference; server step: read inputs, check, run, overwrite | DONE | 6ebe5fff7; fix 1dae906e0 (see "The fix"); 953a9ea55 and the commit after it (caption no longer counted as printed; computed results counted) |
| 6 | `{{v:name}}` filled in every text field | DONE | 6ebe5fff7 (calculation.js fillDiagramText; the examples carry placeholders in titles, captions and the series label) |
| 7 | New behaviour only for declared references | DONE | with a function: ml-sampling-top-k, softmax-probabilities, regression-mean-baseline; none needed: confusion-matrix-counts, ml-self-attention-token-links. 6ebe5fff7 |
| 8 | Correction 1: free raw inputs, code computes every drawn share | DONE | 6ebe5fff7: top-k takes raw weights and k and returns the first row, the second row and the kept share; no refusal for "does not add to 100" |
| 9 | Correction 2: printed numbers in prose and caption | DONE, one check to read | 6ebe5fff7; the count of rejections is below. The check ran with a bug during the measurement (see Findings) |
| 10 | Correction 3: no "?" for a number; placeholder wherever a variable stood | DONE | 6ebe5fff7. Rejections for a "?" in the measurement: 0 |
| 11 | Correction 4: "Do not mention these starting numbers in the card." | DONE | 6ebe5fff7. In every examples block; whether cards still mention them is for you to read in the per-ask lines |
| 12 | Correction 5: `value` typed number or list | DONE | already typed anyOf number / array of numbers (variablesJsonSchema); see "k in the MVP4 ask that made no card" |
| 13 | Correction 6: one more decimal place for equal inputs | DONE | 6ebe5fff7 (shares.js evenShares); test: [18,23,18] gives .305 / .39 / .305 |
| 14 | Merge check and frozen list | DONE | 3e251e918: calculation-declarations.test.mjs (7 tests) and packages/web/src/tutor-diagrams/calculation-undeclared.json: 307 ids frozen; 180 references have no numbers; 5 declare; 307 + 180 + 5 = 492 |
| 15 | Unit tests, no red tests | DONE | 3e251e918, ddb570e7f, 3d2a5c5dd: 17 + 13 + 3 + 7 web tests, 20 + 25 control-plane tests. Totals below. The only red control-plane tests are five that are red on main too (and a flake seen once) |
| 16 | Request guard | DONE | guards.json: 492 references, 742 prompts, 4 requests each (Gemini and fallback, no plan and planned with a seed): **737 of 737 undeclared prompts identical to main's**; the 5 prompts that differ belong to the 5 declared references |
| 17 | Parse, snapshots, 362 | DONE | 1323 stored specs in 492 references all parse (a test); svg-snapshots.json unchanged and its test passes (web suite below); maximum Gemini answer schema 112 properties (dryrun.json, 15 requests) |
| 18 | Measurement | DONE | main arm 75/75; build 1 (first build) 65/75; build 2 (fixed) 71/75; fallback model build 1 8/10, build 2 10/10; **money: US$0.921 settled in all** (first run of 160 runs US$0.604: main US$0.206, build 1 US$0.359, fallback US$0.039; re-run of 85 runs US$0.317: branch US$0.294, fallback US$0.023). Stop line US$1.50 not reached |
| 19 | Evidence under same-json/full/ | DONE | this folder; build-1/ keeps the first build's results under their own name |
| 20 | System text in one file per section | NOT STARTED | not ordered |
| 21 | Send only the chosen kind's text | NOT STARTED | not ordered |
| 22 | List of the other references that need a function | NOT STARTED | not ordered. The frozen list (307 ids) is the raw material, not that list |
| extra a | The server step takes a drawn input or result from the reference | DONE | 1dae906e0 (the fix); see below |
| extra b | The caption bug the tests found, and the computed results counted as printed | DONE | 953a9ea55 and the commit after it; the measurement ran before both |
| extra c | REL-1b, STK-1, UNIT-2, STACK-T (lane 2) | DONE, reported earlier | feat/rel-1 1b36e600c, feat/stk-1 3a3050ea3, feat/unit-2 b9ab321a4, feat/stack-t d0bbbc3a1; evidence at rel-1/v2/rel1b and renderer-1119 |
| extra d | Release 168 (renderer) | PARTLY | being assembled by an agent; reported separately |

## Result in one paragraph

Where the build delivers a card on the declared references the values differ on every ask (value sets equal the delivered cards in almost every row below; main gives 1 to 5 value sets of 5). It loses cards: build 1 lost 10 of 75 asks (top-k 7, regression 1, softmax 1, confusion 1; 6 of the top-k losses came from a missing `variables` entry), the fixed build lost 4 of 75, all top-k. Main lost none. The fallback model delivered 10 of 10 on the fixed build. No "?" was left in any attempt. The remaining top-k losses are Gemini's own choices (a k equal to the number of weights, which the function refuses; a visual tagged with a kind name instead of "diagram"; its own percentages in the prose that the picture does not print). I do not judge any number: you recompute them from the results files.

## The fix (build 1 to build 2)

- **What Gemini still has to write in `variables`:** for top-k the two undrawn inputs, `weights` (a list of raw weights) and `k`; for softmax `weightsA` and `weightsB`; for regression nothing is required (its inputs and result are drawn). The answer schema carries `variables` only for a reference with a function, names limited to that reference's own variables, at most as many entries as it declares.
- **What the server now takes from the reference:** where a figure draws an input or a result (top-k `full` and `renormalized` at series.0.values and series.1.values; softmax `probabilitiesA` and `probabilitiesB`; regression `targets` at series.0.points.*.y and `mean` at annotations.0.value) the server uses the reference's own place and limits, so a card that lists only its undrawn inputs still gets its results; an undrawn result (the top-k kept share) is computed whether or not the card lists it, so a {{v:keptShare}} still fills. **An input that is not drawn (k, the raw weights) and is missing or unreadable is still a card problem: the one repair, then no card. The server never fills in an input.**
- **top-k asks refused for a missing entry:** build 1: 6 of 15 (all 6 lost); fixed build: 0 of 15. All top-k asks lost for any cause: 7 on build 1, 4 on the fixed build. Asks refused because k was not below the number of weights: 4 on build 1, 2 on the fixed build.

## k in the MVP4 ask that made no card (correction 5)

In the MVP4 ask bench-2-2 both Gemini answers wrote `"k"` as a number, `"value": 3` (the schema types `value` as a number or a list of numbers already). The card was lost for other reasons: the Gemini answers tagged the visual `"k": "bar-chart"` instead of `"diagram"` (the diagram was dropped: "the card needs one to three visuals"), and the Fireworks fallback's answers then lacked the `full` input name and wrote a `k` that was not a number. The MVP4 harness recorded only Gemini's raw answers; this measurement records the Fireworks answers too (rawGoogle in the results files).

## Findings in the measurement (not fixed; for your decision)

1. **A visual tagged with a kind name.** Gemini writes `"k": "bar-chart"` for the visual (instead of `"diagram"`): main 1 ask of 75, build 1 5, fixed build 7. The diagram is dropped and the card is refused as having no visual. The server already reads `"k": "spec"` as a diagram (NOVIS-1); reading any other string as a diagram when the item carries a diagram spec would rescue these (a change to shared code, which could be confined to requests that show a declared reference). Not done.
2. **The caption bug.** The tests found that a diagram's description ends with its caption, so the caption's own numbers counted as printed. Fixed in 953a9ea55; the measurement ran before it. Replaying the measured branch cards through the corrected check offline (replay-checks-branch-cards.json): 3 of 154 delivered cards would now be refused (2 top-k, 1 regression "cannot be written").
3. **A choice I made: the computed results count as printed numbers** (the commit after 953a9ea55). The kept share of top-k is not drawn; it reaches the card through {{v:keptShare}} in the caption. Without counting the function's results, a prose "70%" for it was refused (corrected check, results not counted: 15 of 154 measured cards would be refused, 7 of 9 delivered top-k cards of build 1). An input does not count as printed. Say if you want the stricter reading.
4. **Prose numbers.** Rejections by correction 2 in the measurement: 9 asks on build 1 and 9 on the fixed build (columns rej-prose below), nearly all top-k: Gemini writes its own percentages in the prose and they do not match the computed rows. Offline replay of the check over the 124 delivered cards of MVP1 to MVP4: 8 refused (replay-checks-earlier-mvp.json): top-k bench-3-3 (MVP1) "0.7"; confusion bench-12-2 and bench-13-3 (MVP2) "0.78, 0.875" and "0.78, 0.88" and bench-11-1 (MVP4) "0.65, 0.76, 0.71" (rates computed from the counts: right numbers that the picture does not print; read these as possible false rejections); top-k bench-4-4 and bench-5-5 (MVP4) a "?" in the series label; softmax bench-19-4 "0.70, 0.33"; token-links bench-22-2 "0.21, 0.18".
5. **The first measurement could not be stopped.** After seeing build 1's failures I tried to stop the running measurement to avoid spending on a known-weak build; the auto-mode classifier denied listing processes and I did not work around it, so build 1 ran to the end (US$0.604) and is kept as build-1/.

## Tests and guards on the tip

- Web suite: 7682 tests, 7654 pass, 0 fail, 27 skipped (the pinned NanoGPT cache is absent), 1 todo (known).
- Control-plane suite: 5020 tests, 5005 pass, 7 fail, 8 skipped. Five are red on main (aee3dba82) too: the rabbit-hole-prod-config tests (app Worker, FILE_JOBS, /animation, /whiteboard, roadmap), first failing commit f0ae33c53. Two (BE.05 in roadmap-workflow.test.js) failed in this run under load and pass alone (72 of 72): a flake, seen once.
- The request guard, the dry run (all 15 requests ok; maximum 112 properties), the parse count and the frozen list are in the table above.

## Files here

REPORT.md (this); build-1/results.jsonl and run.log (the first run: main, build 1, fallback 1; 160 runs); build-2/results.jsonl and run.log (the re-run: 75 + 10); plan.json, mk-plan.mjs; guards.mjs, guards.json; dryrun.mjs, dryrun.json, examples-block-reference-depth.txt files (the examples blocks as sent); replay-checks.mjs and the two replay files; sheets/reference-depth.png (MAIN row, BUILD 1 row, BUILD 2 row, five asks each; html beside).

## Measurement

Profile google-low (the fallback set: fireworks-low), planner on, a different seed for every ask (bench-<idx>-<ask>), each reference by its own first prompt, at Brief, Balanced and Detailed, five asks each. MAIN = main aee3dba82 (tree main167), BRANCH = feat/same-json. 225 main-set runs (75 main, 75 branch) and 20 fallback-model runs (branch only). Settled cost (planner estimate US$0.0002 a run included): main set US$0.858, fallback US$0.062, total US$0.920; stop line US$1.50.

Columns, out of 5 asks: **delivered**; **valid first time**; **repairs** (summed); **value sets** (the numbers of every diagram in spec order, the variables list apart), **label sets**, **whole cards** (title, diagrams, body) among the delivered cards; **lost** = asks with no card; **rej-prose** = asks where an attempt was refused by correction 2 (a number with a decimal point or percent sign the picture does not print), **rej-?** = by correction 3 (a "?" for a number left in a diagram), **rej-calc** = by the function step (an input outside its limits or refused, no variables list, an unknown placeholder). An ask counts once per kind of refusal whatever the number of attempts.

| reference | depth | arm | delivered | valid first time | repairs | value sets | label sets | whole cards | lost | rej-prose | rej-? | rej-calc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| top-k | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| top-k | brief | BUILD 1 | 2/5 | 0/5 | 8 | 2 | 2 | 2 | 3 | 0 | 0 | 4 |
| top-k | brief | BUILD 2 (fixed) | 5/5 | 4/5 | 1 | 5 | 3 | 5 | 0 | 0 | 0 | 1 |
| top-k | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| top-k | balanced | BUILD 1 | 4/5 | 2/5 | 4 | 4 | 4 | 4 | 1 | 1 | 0 | 3 |
| top-k | balanced | BUILD 2 (fixed) | 3/5 | 3/5 | 4 | 3 | 3 | 3 | 2 | 2 | 0 | 2 |
| top-k | detailed | MAIN | 5/5 | 4/5 | 1 | 1 | 2 | 5 | 0 | 0 | 0 | 0 |
| top-k | detailed | BUILD 1 | 2/5 | 1/5 | 8 | 2 | 2 | 2 | 3 | 4 | 0 | 3 |
| top-k | detailed | BUILD 2 (fixed) | 3/5 | 1/4 | 6 | 3 | 3 | 3 | 2 | 3 | 0 | 1 |
| softmax-probabilities | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| softmax-probabilities | brief | BUILD 1 | 5/5 | 5/5 | 0 | 5 | 2 | 5 | 0 | 0 | 0 | 0 |
| softmax-probabilities | brief | BUILD 2 (fixed) | 5/5 | 5/5 | 0 | 5 | 1 | 5 | 0 | 0 | 0 | 0 |
| softmax-probabilities | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| softmax-probabilities | balanced | BUILD 1 | 4/5 | 4/5 | 2 | 4 | 1 | 4 | 1 | 1 | 0 | 1 |
| softmax-probabilities | balanced | BUILD 2 (fixed) | 5/5 | 5/5 | 0 | 5 | 1 | 5 | 0 | 0 | 0 | 0 |
| softmax-probabilities | detailed | MAIN | 5/5 | 5/5 | 0 | 1 | 4 | 5 | 0 | 0 | 0 | 0 |
| softmax-probabilities | detailed | BUILD 1 | 5/5 | 3/5 | 3 | 5 | 4 | 5 | 0 | 1 | 0 | 0 |
| softmax-probabilities | detailed | BUILD 2 (fixed) | 5/5 | 5/5 | 0 | 5 | 1 | 5 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | brief | BUILD 1 | 5/5 | 2/5 | 4 | 5 | 5 | 5 | 0 | 0 | 0 | 2 |
| regression-mean-baseline | brief | BUILD 2 (fixed) | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | balanced | BUILD 1 | 5/5 | 2/5 | 4 | 5 | 5 | 5 | 0 | 0 | 0 | 2 |
| regression-mean-baseline | balanced | BUILD 2 (fixed) | 5/5 | 4/5 | 1 | 5 | 5 | 5 | 0 | 0 | 0 | 1 |
| regression-mean-baseline | detailed | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | detailed | BUILD 1 | 4/5 | 1/5 | 6 | 4 | 4 | 4 | 1 | 0 | 0 | 3 |
| regression-mean-baseline | detailed | BUILD 2 (fixed) | 5/5 | 3/5 | 2 | 5 | 5 | 5 | 0 | 0 | 0 | 1 |
| confusion-matrix-counts | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 3 | 5 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | brief | BUILD 1 | 5/5 | 3/5 | 3 | 5 | 5 | 5 | 0 | 1 | 0 | 0 |
| confusion-matrix-counts | brief | BUILD 2 (fixed) | 5/5 | 2/5 | 3 | 5 | 5 | 5 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | balanced | BUILD 1 | 5/5 | 5/5 | 0 | 5 | 2 | 5 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | balanced | BUILD 2 (fixed) | 5/5 | 5/5 | 0 | 5 | 3 | 5 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | detailed | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | detailed | BUILD 1 | 4/5 | 4/5 | 2 | 4 | 4 | 4 | 1 | 1 | 0 | 0 |
| confusion-matrix-counts | detailed | BUILD 2 (fixed) | 5/5 | 2/5 | 6 | 5 | 5 | 5 | 0 | 3 | 0 | 0 |
| ml-self-attention-token-links | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 4 | 5 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | brief | BUILD 1 | 5/5 | 3/5 | 2 | 4 | 4 | 5 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | brief | BUILD 2 (fixed) | 5/5 | 5/5 | 0 | 5 | 4 | 5 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 2 | 5 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | balanced | BUILD 1 | 5/5 | 5/5 | 0 | 5 | 3 | 5 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | balanced | BUILD 2 (fixed) | 5/5 | 4/5 | 1 | 5 | 4 | 5 | 0 | 1 | 0 | 0 |
| ml-self-attention-token-links | detailed | MAIN | 5/5 | 4/5 | 1 | 1 | 4 | 5 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | detailed | BUILD 1 | 5/5 | 5/5 | 0 | 5 | 4 | 5 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | detailed | BUILD 2 (fixed) | 5/5 | 4/5 | 1 | 5 | 3 | 5 | 0 | 0 | 0 | 0 |

**Totals** (of 75 asks per arm):

| arm | delivered | lost | valid first time | repairs | rej-prose | rej-? | rej-calc |
|---|---|---|---|---|---|---|---|
| MAIN | 75/75 | 0 | 73/75 | 2 | 0 | 0 | 0 |
| BUILD 1 | 65/75 | 10 | 45/75 | 46 | 9 | 0 | 18 |
| BUILD 2 (fixed) | 71/75 | 4 | 57/74 | 25 | 9 | 0 | 6 |

Pass line, cards delivered: build 1 delivered 65, the fixed build (build 2) 71, against main's 75 (**below main by 4: more than one**).

Value sets per reference over all three depths (main / branch), counted per depth above; a reference at one depth is the unit.

## top-k asks refused for a missing entry of the variables list

An ask counts when an attempt was refused with "variables has no input/result named ..." or "the diagram has no variables list" (explanation_bad_calculation). Lost = no card at all.

| build | top-k asks | asks with a refusal for a missing entry | of them lost | all top-k asks lost (any cause) | asks refused because k was not below the number of weights |
|---|---|---|---|---|---|
| BUILD 1 | 15 | 6 | 6 | 7 | 4 |
| BUILD 2 (fixed) | 15 | 0 | 0 | 4 | 2 |

## The fallback model (branch only, two asks per reference, profile fireworks-low)

| build | reference | ask | seed | delivered | valid first time | server step | refused by |
|---|---|---|---|---|---|---|---|
| BUILD 1 | top-k | 1 | bench-76-1 | no card | false | none recorded | explanation_bad_prose_number, explanation_bad_calculation |
| BUILD 2 (fixed) | top-k | 1 | bench-76-1 | yes | false | overwrote full, renormalized, keptShare | explanation_bad_prose_number |
| BUILD 1 | top-k | 2 | bench-77-2 | yes | false | overwrote full, renormalized, keptShare | explanation_bad_prose_number |
| BUILD 2 (fixed) | top-k | 2 | bench-77-2 | yes | false | overwrote full, renormalized, keptShare | explanation_bad_prose_number |
| BUILD 1 | softmax-probabilities | 1 | bench-78-1 | no card | false | none recorded | explanation_bad_calculation |
| BUILD 2 (fixed) | softmax-probabilities | 1 | bench-78-1 | yes | true | overwrote probabilitiesA, probabilitiesB | - |
| BUILD 1 | softmax-probabilities | 2 | bench-79-2 | yes | false | overwrote nothing | explanation_bad_calculation |
| BUILD 2 (fixed) | softmax-probabilities | 2 | bench-79-2 | yes | true | overwrote probabilitiesA, probabilitiesB | - |
| BUILD 1 | regression-mean-baseline | 1 | bench-80-1 | yes | false | overwrote nothing | explanation_bad_diagram |
| BUILD 2 (fixed) | regression-mean-baseline | 1 | bench-80-1 | yes | true | overwrote nothing | - |
| BUILD 1 | regression-mean-baseline | 2 | bench-81-2 | yes | true | overwrote nothing | - |
| BUILD 2 (fixed) | regression-mean-baseline | 2 | bench-81-2 | yes | false | overwrote nothing | explanation_bad_diagram |
| BUILD 1 | confusion-matrix-counts | 1 | bench-82-1 | yes | false | none recorded | explanation_bad_prose_number, explanation_missing_visual |
| BUILD 2 (fixed) | confusion-matrix-counts | 1 | bench-82-1 | yes | false | none recorded | explanation_bad_prose_number, explanation_missing_visual |
| BUILD 1 | confusion-matrix-counts | 2 | bench-83-2 | yes | false | none recorded | explanation_bad_prose_number |
| BUILD 2 (fixed) | confusion-matrix-counts | 2 | bench-83-2 | yes | false | none recorded | explanation_bad_prose_number |
| BUILD 1 | ml-self-attention-token-links | 1 | bench-84-1 | yes | true | none recorded | - |
| BUILD 2 (fixed) | ml-self-attention-token-links | 1 | bench-84-1 | yes | true | none recorded | - |
| BUILD 1 | ml-self-attention-token-links | 2 | bench-85-2 | yes | true | none recorded | - |
| BUILD 2 (fixed) | ml-self-attention-token-links | 2 | bench-85-2 | yes | true | none recorded | - |

Fallback: delivered 18/20, lost 2, rej-prose 8, rej-? 0, rej-calc 3.

## Corrections 2 and 3 over earlier cards (offline replay, no provider call)

The two checks (prose and caption numbers the picture does not print; a "?" for a number) run alone over the 154 delivered cards of the five declared references in the MVP1 to MVP4 measurements: **3 rejected**. Each rejection, with the card:

| arm (MVP) | reference | seed | what the check said |
|---|---|---|---|
| full | regression-mean-baseline | bench-32-2 | explanation_bad_calculation: result mean cannot be written at annotations.0.value |
| full2 | ml-sampling-top-k | bench-10-5 | explanation_bad_prose_number: the text writes 68.0, which the picture does not print; write only numbers the picture prints (or {{v:name}} for a number of the variables), and never a starting number |
| full2 | ml-sampling-top-k | bench-11-1 | explanation_bad_prose_number: the text writes 59.6, which the picture does not print; write only numbers the picture prints (or {{v:name}} for a number of the variables), and never a starting number |

(arm names: before and after are MVP1, after2 MVP2, after3 MVP3, after4 MVP4.)

## Every ask

One line per ask. BRANCH lines: the starting numbers sent (recomputed from the seed with the same draw as the code), what the server step did (the inputs the author chose, what it wrote for the results, what the function overwrote), a refusal and repair if any, then the card's title, labels and values. MAIN lines: title, labels and values.

### top-k: Does top-k filtering affect the reported probability of the chosen token?

**MAIN, brief**

- ask 1 (seed bench-1-1): **Top-K Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / grouped / Fu... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-2-2): **Top-k Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / grouped / Fu... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-3-3): **Top-k Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / grouped / Fu... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-4-4): **Top-K Filtering and Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / grouped / Fu... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-5-5): **Top-k filtering and token probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / grouped / Fu... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**BUILD 1, brief**

- ask 1 (seed bench-1-1): starting numbers 39, 53, 24, 51, 40, 6, 17, 41 | inputs weights=[39,53,24,51,40] k=3; server overwrote full, renormalized, keptShare (author wrote full=[39,53,24,51,40]; renormalized=[48,65,30,63,49]; keptShare=78); refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variant: A bar variant requires categories and series) | **Top-K Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 3 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / grouped / Full s... | values 19, 26, 11, 25, 19, 0, 37, 0, 35, 28
- ask 2 (seed bench-2-2): starting numbers 6, 57, 41, 48, 43, 34, 37, 47 | refused: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 weights // explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 3, below the 4 weights // explanation_bad_calculation: variables has no input named weights // explanation_bad_calculation: variables has no result named keptShare; NO CARD | **no card: validation_error**
- ask 3 (seed bench-3-3): starting numbers 31, 42, 47, 55, 20, 36, 37, 15 | inputs weights=[31,42,47,55,20] k=4; server overwrote full, renormalized, keptShare (author wrote full=[31,42,47,55,20]; renormalized=[20.7,28,31.3,36.7,0]; keptShare=175); refused: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 weights | **Top-k Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 4 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / grouped / Full s... | values 16, 22, 24, 28, 10, 18, 24, 27, 31, 0
- ask 4 (seed bench-4-4): starting numbers 38, 56, 51, 17, 39, 60, 10, 25 | refused: explanation_bad_calculation: variables has no result named full // explanation_bad_calculation: variables has no result named keptShare // explanation_bad_calculation: variables has no input named weights; NO CARD | **no card: validation_error**
- ask 5 (seed bench-5-5): starting numbers 53, 5, 16, 9, 58, 57, 6, 13 | refused: explanation_bad_calculation: variables has no result named keptShare // explanation_bad_calculation: variables has no input named weights; NO CARD | **no card: validation_error**

**BUILD 2 (fixed), brief**

- ask 1 (seed bench-1-1): starting numbers 39, 53, 24, 51, 40, 6, 17, 41 | inputs weights=[39,53,24,51,40] k=3; server overwrote full, renormalized, keptShare (author wrote full=[39,53,24,51,40]; renormalized=[25,34,0,33,0]; keptShare=92) | **Top-k filtering and token probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 3 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / grouped / Full s... | values 19, 26, 11, 25, 19, 0, 37, 0, 35, 28
- ask 2 (seed bench-2-2): starting numbers 6, 57, 41, 48, 43, 34, 37, 47 | inputs weights=[6,57,41,48,43] k=2; server overwrote full, renormalized, keptShare (author wrote full=[6,57,41,48,43]; renormalized=[10,0,68,22,0]; keptShare=78) | **Top-k filtering and token probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / grouped / Full s... | values 3, 29, 21, 25, 22, 0, 54, 0, 46, 0
- ask 3 (seed bench-3-3): starting numbers 31, 42, 47, 55, 20, 36, 37, 15 | inputs weights=[31,42,47,55,20] k=4; server overwrote full, renormalized, keptShare (author wrote full=[31,42,47,55,20]; renormalized=[16.1,21.8,24.4,28.5,10.4]; keptShare=100); refused: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 weights | **Top-k Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 4 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / grouped / Full s... | values 16, 22, 24, 28, 10, 18, 24, 27, 31, 0
- ask 4 (seed bench-4-4): starting numbers 38, 56, 51, 17, 39, 60, 10, 25 | inputs weights=[38,56,51,17,39] k=4; server overwrote full, renormalized, keptShare (author wrote full=[38,56,51,17,39]; renormalized=[25,37,33,0,25]; keptShare=80) | **Top-k filtering and probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 4 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / grouped / Full s... | values 19, 28, 25, 9, 19, 21, 30, 28, 0, 21
- ask 5 (seed bench-5-5): starting numbers 53, 5, 16, 9, 58, 57, 6, 13 | inputs weights=[53,5,16,9,17] k=2; server overwrote renormalized, keptShare (author wrote renormalized=[76.81,0,23.19,0,0]; keptShare=69) | **Top-k Filtering and Token Probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / grouped / Full s... | values 53, 5, 16, 9, 17, 76, 0, 0, 0, 24

**MAIN, balanced**

- ask 1 (seed bench-6-1): **Top-K Filtering and Token Probability** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped /... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-7-2): **Top-k filtering and token probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped /... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-8-3): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped /... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-9-4): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped /... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-10-5): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped /... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**BUILD 1, balanced**

- ask 1 (seed bench-6-1): starting numbers 25, 45, 39, 42, 35, 23, 43, 32 | inputs weights=[25,45,39,42,35] k=4; server overwrote full, renormalized, keptShare (author wrote full=[25,45,39,42,35]; renormalized=[13.9,25,21.7,23.3,19.4]; keptShare=180); refused: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 weights | **Top-k filtering and probabilities** | bar-chart: Full softmax and top-4 sampling / The kept tokens originally hold 87% of the probability. Divide each kept probability by that total. / grouped / Ful... | values 13, 24, 21, 23, 19, 0, 28, 24, 26, 22
- ask 2 (seed bench-7-2): starting numbers 31, 32, 45, 51, 40, 29, 15, 19 | refused: explanation_bad_prose_number: the text writes 76%, which the picture does not print; write only numbers the picture prints (or {{v // explanation_bad_calculation: variables has no input named weights // explanation_bad_calculation: variables has no result named full; NO CARD | **no card: validation_error**
- ask 3 (seed bench-8-3): starting numbers 23, 17, 20, 11, 31, 32, 60, 47 | inputs weights=[23,17,20,11,29] k=4; server overwrote renormalized, keptShare (author wrote renormalized=[33.3,24.6,29,0,13]; keptShare=69) | **Top-k Renormalization** | bar-chart: Full softmax and top-4 sampling / The kept tokens originally hold 89% of the probability. Divide each kept probability by that total. / % / grouped /... | values 23, 17, 20, 11, 29, 26, 19, 22, 0, 33
- ask 4 (seed bench-9-4): starting numbers 53, 30, 13, 44, 31, 11, 58, 22 | inputs weights=[53,30,13,4,1] k=2; server overwrote full, renormalized, keptShare (author wrote full=[53,30,13,4,1]; renormalized=[63.86,36.14,0,0,0]; keptShare=83); refused: explanation_bad_calculation: input weights must be from 1 to 1000 (got 0) | **Top-k Filtering and Token Probability** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 82% of the probability. Divide each kept probability by that total. / grouped / Ful... | values 52, 30, 13, 4, 1, 64, 36, 0, 0, 0
- ask 5 (seed bench-10-5): starting numbers 43, 45, 17, 56, 10, 27, 46, 14 | inputs weights=[43,45,17,56,10] k=3; server overwrote full, renormalized, keptShare (author wrote full=[43,45,17,56,10]; renormalized=[25.9,27.1,10.2,33.7,6]; keptShare=65.4) | **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-k sampling / The kept tokens originally hold 84% of the probability. Divide each kept probability by that total. / grouped / Ful... | values 25, 26, 10, 33, 6, 30, 31, 0, 39, 0

**BUILD 2 (fixed), balanced**

- ask 1 (seed bench-6-1): starting numbers 25, 45, 39, 42, 35, 23, 43, 32 | refused: explanation_bad_prose_number: the text writes 82%, which the picture does not print; write only numbers the picture prints (or {{v // explanation_bad_prose_number: the text writes 87%, which the picture does not print; write only numbers the picture prints (or {{v // explanation_bad_prose_number: the text writes 100 %, which the picture does not print; write only numbers the picture prints (or { // explanation_bad_calculation: {{v:weights}} does not name a number of variables (it is a list: write {{v:name.0}} for an item); NO CARD | **no card: validation_error**
- ask 2 (seed bench-7-2): starting numbers 31, 32, 45, 51, 40, 29, 15, 19 | refused: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 weights // explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 3, below the 4 weights // explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 2, below the 3 weights // explanation_bad_prose_number: the text writes 37.5, 33.1, 29.4, 70.6, which the picture does not print; write only numbers the pic; NO CARD | **no card: validation_error**
- ask 3 (seed bench-8-3): starting numbers 23, 17, 20, 11, 31, 32, 60, 47 | inputs weights=[23,17,20,11,31] k=4; server overwrote full, renormalized, keptShare (author wrote full=[23,17,20,11,31]; renormalized=[23,22.1,26,0,28.9]; keptShare=77) | **Top-k filtering and reported probabilities** | bar-chart: Full softmax and top-4 sampling / The kept tokens originally hold 89% of the probability. Divide each kept probability by that total. / grouped / Ful... | values 22, 17, 20, 11, 30, 25, 19, 22, 0, 34
- ask 4 (seed bench-9-4): starting numbers 53, 30, 13, 44, 31, 11, 58, 22 | inputs weights=[53,30,13,44,31] k=3; server overwrote full, renormalized, keptShare (author wrote full=[53,30,13,44,31]; renormalized=[31.18,17.65,7.65,25.88,18.24]; keptShare=85) | **Top-k filtering and token probability** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 75% of the probability. Divide each kept probability by that total. / grouped / Ful... | values 31, 17, 8, 26, 18, 42, 0, 0, 34, 24
- ask 5 (seed bench-10-5): starting numbers 43, 45, 17, 56, 10, 27, 46, 14 | inputs weights=[43,25,17,10,5] k=3; server overwrote renormalized, keptShare (author wrote renormalized=[63.2,36.8,0,0,0]; keptShare=68) | **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 68.0% of the probability. Divide each kept probability by that total. / grouped / F... | values 43, 25, 17, 10, 5, 51, 29, 20, 0, 0

**MAIN, detailed**

- ask 1 (seed bench-11-1): **Top-k Renormalization Effect** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / grouped / Full softmax / Top-2 ren... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-12-2): **Top-k Renormalization in Language Models** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / grouped / Full softmax / Top-2 ren... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-13-3): **Effect of Top‑k Filtering on Token Probability** | bar-chart: Top‑2 renormalizes kept mass / For a kept token, $p'_i = p_i / \sum_{j\in K} p_j$. "on" goes from 42% to 60% after renormalisation. / % / grouped / F... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-14-4): **Top-k Renormalization on Probabilities** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / grouped / Full softmax / Top-2 ren... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-15-5): **Top-k Renormalization in Sampling** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / grouped / Full softmax / Top-2 ren... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**BUILD 1, detailed**

- ask 1 (seed bench-11-1): starting numbers 29, 28, 55, 5, 46, 19, 11, 35 | refused: explanation_bad_prose_number: the text writes 90%, which the picture does not print; write only numbers the picture prints (or {{v // explanation_bad_prose_number: the text writes 59.65, 100 %, which the picture does not print; write only numbers the picture print // explanation_bad_prose_number: the text writes 60 %, which the picture does not print; write only numbers the picture prints (or {{; NO CARD | **no card: validation_error**
- ask 2 (seed bench-12-2): starting numbers 29, 10, 27, 19, 36, 5, 14, 58 | refused: explanation_bad_prose_number: the text writes 90%, which the picture does not print; write only numbers the picture prints (or {{v // explanation_bad_calculation: variables has no input named weights // explanation_bad_calculation: variables has no input named k; NO CARD | **no card: validation_error**
- ask 3 (seed bench-13-3): starting numbers 26, 15, 42, 46, 12, 54, 48, 39 | inputs weights=[46,26,15,8,5] k=4; server overwrote renormalized, keptShare (author wrote renormalized=[51.1,28.9,16.7,3.3,0]; keptShare=90) | **Top-k Renormalization and Token Probabilities** | bar-chart: Top-4 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 46% / 95% = 48%. / grouped / Full softmax / Top-4 renorma... | values 46, 26, 15, 8, 5, 48, 27, 16, 9, 0
- ask 4 (seed bench-14-4): starting numbers 23, 7, 17, 39, 42, 38, 28, 51 | refused: explanation_bad_prose_number: the text writes 93%, which the picture does not print; write only numbers the picture prints (or {{v // explanation_bad_calculation: variables has no input named weights // explanation_bad_calculation: variables has no input named k; NO CARD | **no card: validation_error**
- ask 5 (seed bench-15-5): starting numbers 46, 23, 28, 45, 9, 10, 34, 25 | inputs weights=[46,23,28,45,9] k=3; server overwrote full, renormalized, keptShare (author wrote full=[30.46,15.23,18.54,29.8,5.96]; renormalized=[38.66,0,23.53,37.82,0]; keptShare=78.81); refused: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 weights // explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 3, below the 4 weights // explanation_bad_prose_number: the text writes 30.5, 38.7, which the picture does not print; write only numbers the picture prints  | **Effect of Top‑k Filtering on Token Probability** | bar-chart: grouped / Top‑3 renormalizes the kept mass / Full softmax vs Top‑3 renormalized probabilities (kept share ≈ 79 %). / % / Full softmax / Top‑3 renorma... | values 30, 15, 19, 30, 6, 39, 0, 23, 38, 0

**BUILD 2 (fixed), detailed**

- ask 1 (seed bench-11-1): starting numbers 29, 28, 55, 5, 46, 19, 11, 35 | inputs weights=[29,28,55,5,46,19,11,35] k=3; server overwrote full, renormalized, keptShare (author wrote full=[12.72,12.28,24.12,2.19,20.18,8.33,4.82,15.35]; renormalized=[0,0,40.44,0,33.84,0,0,25.73]; keptShare=59.6); refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before // explanation_bad_prose_number: the text writes 100 %, which the picture does not print; write only numbers the picture prints (or { | **Top‑k filtering changes token probabilities** | bar-chart: grouped / Full vs Top‑3 renormalized probabilities / Top‑3 tokens keep 59.6% of mass; their percentages are scaled up. / % / Full / Top‑3 renorm | values 13, 12, 24, 2, 20, 8, 5, 16, 0, 0, 40, 0, 34, 0, 0, 26
- ask 2 (seed bench-12-2): starting numbers 29, 10, 27, 19, 36, 5, 14, 58 | refused: explanation_bad_calculation: result full cannot be written at series.0.values // explanation_bad_prose_number: the text writes 86%, which the picture does not print; write only numbers the picture prints (or {{v; NO CARD | **no card: validation_error**
- ask 3 (seed bench-13-3): starting numbers 26, 15, 42, 46, 12, 54, 48, 39 | inputs weights=[26,15,42,46,12] k=3; server overwrote full, renormalized, keptShare (author wrote full=[18.44,10.64,29.79,32.62,8.51]; renormalized=[22.81,0,36.84,40.35,0]; keptShare=80.85) | **Effect of Top‑k Filtering on Token Probability** | bar-chart: grouped / Top‑3 renormalizes the kept mass / For a kept token, $p'_i=p_i/\sum_{j\in K}p_j$. Kept mass = 81 %. / % / Full softmax / Top‑3 renormalized | values 18, 11, 30, 33, 8, 23, 0, 37, 40, 0
- ask 4 (seed bench-14-4): starting numbers 23, 7, 17, 39, 42, 38, 28, 51 | inputs weights=[39,23,17,11,10] k=3; server overwrote renormalized, keptShare (author wrote renormalized=[51,30,22,0,0]; keptShare=76) | **Top-k Renormalization and Probabilities** | bar-chart: Top-3 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 39% / 79% = 49%. / grouped / Full softmax / Top-3 renorma... | values 39, 23, 17, 11, 10, 49, 29, 22, 0, 0
- ask 5 (seed bench-15-5): starting numbers 46, 23, 28, 45, 9, 10, 34, 25 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before // explanation_bad_prose_number: the text writes 20.9, 38.7, 54.1, which the picture does not print; write only numbers the picture p // explanation_bad_prose_number: the text writes 30.5, 38.6, 78.8, which the picture does not print; write only numbers the picture p; NO CARD | **no card: validation_error**

Pictures: `sheets/top-k-brief.png`, `-balanced.png`, `-detailed.png` (MAIN row above, BRANCH row below, five asks side by side, 408 px).

### softmax-probabilities: How do softmax probabilities compare two multiclass predictions?

**MAIN, brief**

- ask 1 (seed bench-16-1): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-17-2): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-18-3): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-19-4): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-20-5): **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**BUILD 1, brief**

- ask 1 (seed bench-16-1): starting numbers 54, 5, 29, 39, 50, 20, 55, 26 | inputs weightsA=[54,5,29] weightsB=[39,50,20]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[54,5,29]; probabilitiesB=[39,50,20]) | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.61, 0.06, 0.33, 0.36, 0.46, 0.18
- ask 2 (seed bench-17-2): starting numbers 58, 21, 13, 17, 40, 49, 41, 45 | inputs weightsA=[58,21,13] weightsB=[17,40,49]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.72,0.21,0.07]; probabilitiesB=[0.15,0.58,0.27]) | **Comparing multiclass predictions with softmax** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.63, 0.23, 0.14, 0.16, 0.38, 0.46
- ask 3 (seed bench-18-3): starting numbers 55, 7, 22, 54, 46, 6, 31, 10 | inputs weightsA=[55,22,54] weightsB=[46,6,31]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.4,0.4,0.2]) | **Comparing multiclass predictions with softmax probabilities** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.42, 0.17, 0.41, 0.56, 0.07, 0.37
- ask 4 (seed bench-19-4): starting numbers 39, 44, 30, 18, 23, 8, 58, 25 | inputs weightsA=[39,44,30] weightsB=[18,23,58]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[39,44,30]; probabilitiesB=[18,23,58]) | **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / grouped / Model 1 / Model 2 | values 0.34, 0.39, 0.27, 0.18, 0.23, 0.59
- ask 5 (seed bench-20-5): starting numbers 6, 35, 32, 7, 45, 29, 51, 60 | inputs weightsA=[6,35,32] weightsB=[7,45,29]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[6,35,32]; probabilitiesB=[7,45,29]) | **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.08, 0.48, 0.44, 0.09, 0.55, 0.36

**BUILD 2 (fixed), brief**

- ask 1 (seed bench-16-1): starting numbers 54, 5, 29, 39, 50, 20, 55, 26 | inputs weightsA=[54,5,29] weightsB=[39,50,20]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.7,0.2,0.1]; probabilitiesB=[0.1,0.3,0.6]) | **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.61, 0.06, 0.33, 0.36, 0.46, 0.18
- ask 2 (seed bench-17-2): starting numbers 58, 21, 13, 17, 40, 49, 41, 45 | inputs weightsA=[58,21,21] weightsB=[17,40,43]; server overwrote nothing | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.58, 0.21, 0.21, 0.17, 0.4, 0.43
- ask 3 (seed bench-18-3): starting numbers 55, 7, 22, 54, 46, 6, 31, 10 | inputs weightsA=[55,310,40] weightsB=[180,180,40]; server overwrote probabilitiesA (author wrote probabilitiesA=[0.12,0.78,0.1]) | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.14, 0.76, 0.1, 0.45, 0.45, 0.1
- ask 4 (seed bench-19-4): starting numbers 39, 44, 30, 18, 23, 8, 58, 25 | inputs weightsA=[39,44,30] weightsB=[18,23,8]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.7,0.2,0.1]; probabilitiesB=[0.3,0.5,0.2]) | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.34, 0.39, 0.27, 0.37, 0.47, 0.16
- ask 5 (seed bench-20-5): starting numbers 6, 35, 32, 7, 45, 29, 51, 60 | inputs weightsA=[6,35,32] weightsB=[7,45,29]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.05,0.7,0.25]; probabilitiesB=[0.1,0.2,0.7]) | **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.08, 0.48, 0.44, 0.09, 0.55, 0.36

**MAIN, balanced**

- ask 1 (seed bench-21-1): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-22-2): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-23-3): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-24-4): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-25-5): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**BUILD 1, balanced**

- ask 1 (seed bench-21-1): starting numbers 49, 31, 60, 22, 53, 12, 54, 15 | inputs weightsA=[49,31,60] weightsB=[22,53,12]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.6,0.3,0.1]) | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.35, 0.22, 0.43, 0.25, 0.61, 0.14
- ask 2 (seed bench-22-2): starting numbers 51, 13, 39, 44, 60, 34, 43, 11 | inputs weightsA=[7,2,1] weightsB=[3,5,2]; server overwrote nothing | **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.3, 0.5, 0.2
- ask 3 (seed bench-23-3): starting numbers 23, 25, 38, 15, 59, 60, 35, 43 | inputs weightsA=[23,125,24] weightsB=[40,45,15]; server overwrote probabilitiesA (author wrote probabilitiesA=[0.12,0.75,0.13]) | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.13, 0.73, 0.14, 0.4, 0.45, 0.15
- ask 4 (seed bench-24-4): starting numbers 9, 7, 59, 38, 25, 56, 16, 28 | inputs weightsA=[9,73,18] weightsB=[55,35,10]; server overwrote nothing | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.09, 0.73, 0.18, 0.55, 0.35, 0.1
- ask 5 (seed bench-25-5): starting numbers 24, 19, 26, 30, 34, 51, 47, 56 | inputs weightsA=[24,19,57] weightsB=[30,34,36]; server overwrote nothing; refused: explanation_bad_calculation: variables has no result named probabilitiesA // explanation_missing_visual: the card must keep one to three visuals; every diagram was invalid and none could be rebuilt in its ow // explanation_bad_prose_number: the text writes 88 %, 100 %, which the picture does not print; write only numbers the picture prints // explanation_bad_prose_number: the text writes 0.119, 0.001, 0.88, 0.99999996, which the picture does not print; write only numbers; NO CARD | **no card: validation_error**

**BUILD 2 (fixed), balanced**

- ask 1 (seed bench-21-1): starting numbers 49, 31, 60, 22, 53, 12, 54, 15 | inputs weightsA=[49,31,60] weightsB=[22,53,12]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.12,0.75,0.13]; probabilitiesB=[0.6,0.22,0.18]) | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.35, 0.22, 0.43, 0.25, 0.61, 0.14
- ask 2 (seed bench-22-2): starting numbers 51, 13, 39, 44, 60, 34, 43, 11 | inputs weightsA=[51,13,39] weightsB=[44,60,34]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.51,0.13,0.36]; probabilitiesB=[0.44,0.6,0.34]) | **Comparing Multiclass Softmax Probabilities** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.49, 0.13, 0.38, 0.32, 0.43, 0.25
- ask 3 (seed bench-23-3): starting numbers 23, 25, 38, 15, 59, 60, 35, 43 | inputs weightsA=[23,25,38] weightsB=[15,59,60]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.4,0.45,0.15]) | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.27, 0.29, 0.44, 0.11, 0.44, 0.45
- ask 4 (seed bench-24-4): starting numbers 9, 7, 59, 38, 25, 56, 16, 28 | inputs weightsA=[9,7,59] weightsB=[38,25,56]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.6,0.3,0.1]) | **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.12, 0.09, 0.79, 0.32, 0.21, 0.47
- ask 5 (seed bench-25-5): starting numbers 24, 19, 26, 30, 34, 51, 47, 56 | inputs weightsA=[24,19,26] weightsB=[30,34,51]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.4,0.45,0.15]) | **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.35, 0.27, 0.38, 0.26, 0.3, 0.44

**MAIN, detailed**

- ask 1 (seed bench-26-1): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Input A favors Cat at 0.7, while Input B favors Dog at 0.6. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-27-2): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-28-3): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Input A favors Cat ($0.7$), while Input B favors Dog ($0.6$). / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-29-4): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Compare categories on the shared scale of probability. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-30-5): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Input A favors Cat ($0.7$), while Input B favors Dog ($0.6$). / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**BUILD 1, detailed**

- ask 1 (seed bench-26-1): starting numbers 38, 47, 13, 58, 39, 46, 11, 21 | inputs weightsA=[38,47,13] weightsB=[58,39,46]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.1,0.7,0.2]; probabilitiesB=[0.4,0.4,0.2]) | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.39, 0.48, 0.13, 0.41, 0.27, 0.32
- ask 2 (seed bench-27-2): starting numbers 37, 5, 42, 59, 11, 34, 38, 57 | inputs weightsA=[37,5,42] weightsB=[59,11,34]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.4,0.4,0.2]) | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / prob / grouped / Input A / Input B | values 0.44, 0.06, 0.5, 0.57, 0.1, 0.33
- ask 3 (seed bench-28-3): starting numbers 41, 48, 45, 32, 43, 31, 19, 7 | inputs weightsA=[41,48,45] weightsB=[32,43,31]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.306,0.358,0.336]; probabilitiesB=[0.302,0.406,0.293]); refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before | **Softmax Comparison of Two Multiclass Predictions** | bar-chart: Illustrative Softmax Probabilities / Probabilities for three classes from two prediction vectors. / probability / grouped / Prediction A / Prediction... | values 0.31, 0.36, 0.33, 0.3, 0.41, 0.29
- ask 4 (seed bench-29-4): starting numbers 22, 20, 36, 39, 15, 58, 31, 57 | inputs weightsA=[22,20,36] weightsB=[39,15,58]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.7,0.2,0.1]; probabilitiesB=[0.2,0.5,0.3]) | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.28, 0.26, 0.46, 0.35, 0.13, 0.52
- ask 5 (seed bench-30-5): starting numbers 54, 22, 42, 44, 12, 27, 39, 13 | inputs weightsA=[5.4,2.2,4.2] weightsB=[4.4,1.2,2.7]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.747,0.03,0.223]; probabilitiesB=[0.817,0.033,0.15]); refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before // explanation_bad_prose_number: the text writes 0.75, 0.82, which the picture does not print; write only numbers the picture prints  | **Softmax Comparison of Two Multiclass Predictions** | bar-chart: Illustrative softmax probabilities for two predictions / Each bar shows the probability assigned to a class; higher bars mean the model is more confi... | values 0.46, 0.19, 0.35, 0.53, 0.14, 0.33

**BUILD 2 (fixed), detailed**

- ask 1 (seed bench-26-1): starting numbers 38, 47, 13, 58, 39, 46, 11, 21 | inputs weightsA=[38,47,13] weightsB=[58,39,46]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.4,0.45,0.15]) | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.39, 0.48, 0.13, 0.41, 0.27, 0.32
- ask 2 (seed bench-27-2): starting numbers 37, 5, 42, 59, 11, 34, 38, 57 | inputs weightsA=[37,42,59] weightsB=[34,38,57]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.1,0.7,0.2]; probabilitiesB=[0.4,0.4,0.2]) | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.27, 0.3, 0.43, 0.26, 0.3, 0.44
- ask 3 (seed bench-28-3): starting numbers 41, 48, 45, 32, 43, 31, 19, 7 | inputs weightsA=[41,48,45] weightsB=[32,43,31]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.1,0.8,0.1]; probabilitiesB=[0.3,0.4,0.3]) | **Comparing multiclass predictions via softmax probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.31, 0.36, 0.33, 0.3, 0.41, 0.29
- ask 4 (seed bench-29-4): starting numbers 22, 20, 36, 39, 15, 58, 31, 57 | inputs weightsA=[22,36,15] weightsB=[39,58,31]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.45,0.45,0.1]) | **Comparing Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.3, 0.49, 0.21, 0.31, 0.45, 0.24
- ask 5 (seed bench-30-5): starting numbers 54, 22, 42, 44, 12, 27, 39, 13 | inputs weightsA=[54,22,42] weightsB=[44,12,27]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.15,0.75,0.1]; probabilitiesB=[0.4,0.4,0.2]) | **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.46, 0.19, 0.35, 0.53, 0.14, 0.33

Pictures: `sheets/softmax-probabilities-brief.png`, `-balanced.png`, `-detailed.png` (MAIN row above, BRANCH row below, five asks side by side, 408 px).

### regression-mean-baseline: What does predicting the mean give as a regression baseline?

**MAIN, brief**

- ask 1 (seed bench-31-1): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-32-2): **Predicting the mean baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-33-3): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-34-4): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-35-5): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**BUILD 1, brief**

- ask 1 (seed bench-31-1): starting numbers 43, 60, 23, 54, 10, 5, 46, 50 | inputs targets=[10,23,43,54,60]; server overwrote nothing | **Predicting the mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 38 | values 1, 5, 0, 70, 1, 10, 2, 23, 3, 43, 4, 54, 5, 60, 38
- ask 2 (seed bench-32-2): starting numbers 54, 47, 16, 46, 23, 59, 9, 48 | inputs targets=[54,47,16,46,23]; server overwrote mean (author wrote mean=undefined); refused: explanation_bad_calculation: variables has no input named targets | **Predicting the Mean as a Baseline** | coordinate-plot: Illustrative constant mean baseline / Sample / Target / Targets / Mean prediction of 37.2 | values 0, 6, 0, 70, 1, 54, 2, 47, 3, 16, 4, 46, 5, 23
- ask 3 (seed bench-33-3): starting numbers 52, 33, 34, 27, 54, 43, 25, 59 | inputs targets=[52,33,34,27,54,43,25,59]; server overwrote mean (author wrote mean=40.875); refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.1: Give exactly one of at or value) | **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 40.88 | values 1, 8, 0, 70, 1, 52, 2, 33, 3, 34, 4, 27, 5, 54, 6, 43, 7, 25, 8, 59, 40.88
- ask 4 (seed bench-34-4): starting numbers 20, 19, 30, 7, 37, 32, 18, 38 | inputs targets=[20,19,30,7,37,32,18,38]; server overwrote mean (author wrote mean=25.125); refused: explanation_bad_calculation: result mean cannot be written at annotations.0.value // explanation_bad_calculation: variables has no result named mean // explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.1: Give exactly one of at or value) | **Mean prediction as a regression baseline** | coordinate-plot: Illustrative mean baseline / Sample index / Target value / Targets / Mean prediction / Mean = 25.13 | values 0, 9, 0, 50, 1, 20, 2, 19, 3, 30, 4, 7, 5, 37, 6, 32, 7, 18, 8, 38, 0, 25.125, 9, 25.125, 25.125
- ask 5 (seed bench-35-5): starting numbers 20, 44, 18, 25, 16, 42, 32, 21 | inputs targets=[20,44,18,25,16]; server overwrote nothing | **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 24.6 | values 1, 5, 0, 50, 1, 20, 2, 44, 3, 18, 4, 25, 5, 16, 24.6

**BUILD 2 (fixed), brief**

- ask 1 (seed bench-31-1): starting numbers 43, 60, 23, 54, 10, 5, 46, 50 | inputs targets=[43,60,23,54,10]; server overwrote nothing | **A constant mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 38 | values 1, 5, 0, 70, 1, 43, 2, 60, 3, 23, 4, 54, 5, 10, 38
- ask 2 (seed bench-32-2): starting numbers 54, 47, 16, 46, 23, 59, 9, 48 | inputs targets=[54,47,16,46,23]; server overwrote nothing | **A constant mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 37.2 | values 1, 5, 0, 60, 1, 54, 2, 47, 3, 16, 4, 46, 5, 23, 37.2
- ask 3 (seed bench-33-3): starting numbers 52, 33, 34, 27, 54, 43, 25, 59 | inputs targets=[27,34,43,52,59]; server overwrote nothing | **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 43 | values 1, 5, 20, 65, 1, 27, 2, 34, 3, 43, 4, 52, 5, 59, 43
- ask 4 (seed bench-34-4): starting numbers 20, 19, 30, 7, 37, 32, 18, 38 | inputs targets=[20,19,30,7,37]; server overwrote nothing | **Predicting the mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 22.6 | values 1, 5, 0, 40, 1, 20, 2, 19, 3, 30, 4, 7, 5, 37, 22.6
- ask 5 (seed bench-35-5): starting numbers 20, 44, 18, 25, 16, 42, 32, 21 | inputs targets=[20,44,18,25,16]; server overwrote nothing | **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 24.6 | values 1, 5, 0, 50, 1, 20, 2, 44, 3, 18, 4, 25, 5, 16, 24.6

**MAIN, balanced**

- ask 1 (seed bench-36-1): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-37-2): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-38-3): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-39-4): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-40-5): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**BUILD 1, balanced**

- ask 1 (seed bench-36-1): starting numbers 47, 5, 27, 16, 26, 9, 53, 50 | inputs targets=[3,7,5,9,2]; server overwrote nothing; refused: explanation_bad_calculation: variables has no result named mean // explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.1: Give exactly one of at or value) | **Mean prediction as regression baseline** | coordinate-plot: Mean baseline illustration / Sample / Target value / Targets / Mean prediction / Mean = 5.2 | values 0, 5, 0, 10, 1, 3, 2, 7, 3, 5, 4, 9, 5, 2, 0, 5.2, 5, 5.2, 5.2
- ask 2 (seed bench-37-2): starting numbers 37, 35, 54, 39, 24, 34, 30, 8 | inputs targets=[37,35,54,39,34]; server overwrote nothing; refused: explanation_bad_calculation: variables has no input named targets | **Regression baseline using the mean** | coordinate-plot: Constant mean prediction / Sample / Target / Targets / Mean prediction of 39.8 | values 1, 5, 20, 60, 1, 37, 2, 35, 3, 54, 4, 39, 5, 34, 39.8
- ask 3 (seed bench-38-3): starting numbers 54, 31, 11, 10, 35, 30, 56, 25 | inputs targets=[11,25,30,35,56]; server overwrote nothing | **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 31.4 | values 1, 5, 0, 60, 1, 11, 2, 25, 3, 30, 4, 35, 5, 56, 31.4
- ask 4 (seed bench-39-4): starting numbers 57, 41, 16, 35, 60, 36, 17, 43 | inputs targets=[35,41,57,60,80]; server overwrote nothing | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 54.6 | values 1, 5, 0, 100, 1, 35, 2, 41, 3, 57, 4, 60, 5, 80, 54.6
- ask 5 (seed bench-40-5): starting numbers 43, 54, 22, 15, 8, 25, 50, 51 | inputs targets=[15,25,50,51,43]; server overwrote nothing; refused: explanation_bad_token: {{d:0.annotations.0.value}} names diagram 0, but the card has 1. A number the figure computes is written as | **A constant mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 36.8 | values 1, 5, 0, 60, 1, 15, 2, 25, 3, 50, 4, 51, 5, 43, 36.8

**BUILD 2 (fixed), balanced**

- ask 1 (seed bench-36-1): starting numbers 47, 5, 27, 16, 26, 9, 53, 50 | inputs targets=[47,5,27,16,26]; server overwrote nothing; refused: explanation_bad_calculation: result mean cannot be written at annotations.0.value | **Regression baseline using the mean** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 24.2 | values 1, 5, 0, 60, 1, 47, 2, 5, 3, 27, 4, 16, 5, 26, 24.2
- ask 2 (seed bench-37-2): starting numbers 37, 35, 54, 39, 24, 34, 30, 8 | inputs targets=[37,35,54,39,24]; server overwrote nothing | **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 37.8 | values 1, 5, 20, 60, 1, 37, 2, 35, 3, 54, 4, 39, 5, 24, 37.8
- ask 3 (seed bench-38-3): starting numbers 54, 31, 11, 10, 35, 30, 56, 25 | inputs targets=[10,20,30,40,50]; server overwrote nothing | **A constant mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 30 | values 1, 5, 0, 60, 1, 10, 2, 20, 3, 30, 4, 40, 5, 50, 30
- ask 4 (seed bench-39-4): starting numbers 57, 41, 16, 35, 60, 36, 17, 43 | inputs targets=[16,35,41,57,60]; server overwrote nothing | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 41.8 | values 1, 5, 0, 70, 1, 16, 2, 35, 3, 41, 4, 57, 5, 60, 41.8
- ask 5 (seed bench-40-5): starting numbers 43, 54, 22, 15, 8, 25, 50, 51 | inputs targets=[15,25,43,50,54]; server overwrote nothing | **Predicting the Mean Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 37.4 | values 1, 5, 0, 60, 1, 15, 2, 25, 3, 43, 4, 50, 5, 54, 37.4

**MAIN, detailed**

- ask 1 (seed bench-41-1): **Mean Prediction as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-42-2): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-43-3): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-44-4): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-45-5): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**BUILD 1, detailed**

- ask 1 (seed bench-41-1): starting numbers 13, 15, 21, 57, 5, 19, 12, 26 | inputs targets=[5,13,15,19,26]; server overwrote nothing; refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.1: Give exactly one of at or value) | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the constant mean prediction of 15.6. / Sample / Target / Targets / Mean predictio... | values 0, 6, 0, 30, 1, 5, 2, 13, 3, 15, 4, 19, 5, 26, 15.6
- ask 2 (seed bench-42-2): starting numbers 40, 55, 6, 53, 9, 16, 22, 57 | inputs targets=[40,55,6,53,9]; server overwrote nothing; refused: explanation_bad_calculation: variables has no input named targets | **Predicting the Mean as a Regression Baseline** | coordinate-plot: Illustrative mean baseline prediction / The constant mean prediction of 32.6 minimises squared error. / Sample index / Target value / Targets / Mean ... | values 1, 5, 0, 60, 1, 40, 2, 55, 3, 6, 4, 53, 5, 9, 32.6
- ask 3 (seed bench-43-3): starting numbers 37, 28, 5, 43, 38, 23, 27, 9 | inputs targets=[37,28,5,43,38]; server overwrote nothing | **Regression Baseline Using the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 30.2 | values 1, 5, 0, 50, 1, 37, 2, 28, 3, 5, 4, 43, 5, 38, 30.2
- ask 4 (seed bench-44-4): starting numbers 22, 55, 46, 49, 60, 48, 18, 54 | inputs targets=[10,20,30,40,50]; server overwrote nothing; refused: explanation_bad_calculation: variables has no input named targets // explanation_bad_token: {{d:0.annotations.0.value}} names diagram 0, but the card has 1. A number the figure computes is written as // explanation_missing_visual: the card must keep one to three visuals; every diagram was invalid and none could be rebuilt in its ow; NO CARD | **no card: validation_error**
- ask 5 (seed bench-45-5): starting numbers 28, 12, 47, 49, 56, 19, 50, 26 | inputs targets=[3,7,5,9,11]; server overwrote nothing; refused: explanation_bad_calculation: variables has no input named targets // explanation_bad_calculation: result mean cannot be written at annotations.0.value | **Mean prediction as a regression baseline** | coordinate-plot: Mean baseline regression / Horizontal line shows constant prediction equal to the mean of targets (7). / Sample index / Target value / Targets / Mean... | values 0, 6, 0, 12, 1, 3, 2, 7, 3, 5, 4, 9, 5, 11, 0, 7, 6, 7, 7

**BUILD 2 (fixed), detailed**

- ask 1 (seed bench-41-1): starting numbers 13, 15, 21, 57, 5, 19, 12, 26 | inputs targets=[5,13,15,19,26]; server overwrote nothing | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 15.6 | values 1, 5, 0, 30, 1, 5, 2, 13, 3, 15, 4, 19, 5, 26, 15.6
- ask 2 (seed bench-42-2): starting numbers 40, 55, 6, 53, 9, 16, 22, 57 | inputs targets=[40,55,6,53,9]; server overwrote nothing | **A Constant Mean Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 32.6 | values 1, 5, 0, 60, 1, 40, 2, 55, 3, 6, 4, 53, 5, 9, 32.6
- ask 3 (seed bench-43-3): starting numbers 37, 28, 5, 43, 38, 23, 27, 9 | inputs targets=[37,28,5,43,38]; server overwrote nothing | **A Constant Mean Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 30.2 | values 1, 5, 0, 50, 1, 37, 2, 28, 3, 5, 4, 43, 5, 38, 30.2
- ask 4 (seed bench-44-4): starting numbers 22, 55, 46, 49, 60, 48, 18, 54 | inputs targets=[22,55,46,49,60]; server overwrote nothing; refused: explanation_bad_calculation: variables names mean as something other than a result | **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 46.4 | values 1, 5, 0, 100, 1, 22, 2, 55, 3, 46, 4, 49, 5, 60, 46.4
- ask 5 (seed bench-45-5): starting numbers 28, 12, 47, 49, 56, 19, 50, 26 | inputs targets=[28,12,47,49,56]; server overwrote nothing; refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.0: Give exactly one of at or value; diagram.variables | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 38.4 | values 1, 5, 0, 60, 1, 28, 2, 12, 3, 47, 4, 49, 5, 56, 38.4

Pictures: `sheets/regression-mean-baseline-brief.png`, `-balanced.png`, `-detailed.png` (MAIN row above, BRANCH row below, five asks side by side, 408 px).

### confusion-matrix-counts: Explain a confusion matrix with exact counts.

**MAIN, brief**

- ask 1 (seed bench-46-1): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The grid shows counts of correct and incorrect predictions. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-47-2): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-48-3): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The grid shows counts of correct and incorrect predictions made by a model. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-49-4): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The grid shows counts of correct and incorrect predictions. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-50-5): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**BUILD 1, brief**

- ask 1 (seed bench-46-1): starting numbers 20, 59, 42, 6, 53, 22, 18, 31 |  | **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted cells show counts for each actual and predicted pair. / Negative / Positive | values 20, 59, 42, 6, 6, 59, 1, 0
- ask 2 (seed bench-47-2): starting numbers 34, 9, 54, 28, 17, 44, 18, 21 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 34, 9, 54, 28, 9, 54, 1, 0
- ask 3 (seed bench-48-3): starting numbers 36, 29, 43, 25, 16, 27, 22, 20 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before | **Confusion matrix with exact counts** | heatmap: Confusion matrix with exact counts / Numbers show how predictions match reality. / Negative / Positive | values 25, 43, 29, 36, 25, 43
- ask 4 (seed bench-49-4): starting numbers 44, 50, 12, 20, 36, 26, 54, 24 | refused: explanation_visual_unrelated: the diagram "Actual and predicted classes" names nothing from the question or the text around it; ma // explanation_bad_prose_number: the text writes 0.75, which the picture does not print; write only numbers the picture prints (or {{ | **Understanding a Confusion Matrix with Exact Numbers** | heatmap: Confusion matrix with counts / Numbers show how predictions match actual classes. / Negative / Positive | values 44, 12, 20, 36, 0, 50
- ask 5 (seed bench-50-5): starting numbers 26, 42, 52, 12, 18, 46, 20, 59 |  | **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 42, 26, 12, 52, 12, 52, 1, 0

**BUILD 2 (fixed), brief**

- ask 1 (seed bench-46-1): starting numbers 20, 59, 42, 6, 53, 22, 18, 31 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before | **Understanding a Confusion Matrix** | heatmap: Actual vs. Predicted counts / Numbers show how many items fall into each category. / Negative / Positive | values 30, 5, 10, 55, 0, 60, 1, 1
- ask 2 (seed bench-47-2): starting numbers 34, 9, 54, 28, 17, 44, 18, 21 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 34, 9, 54, 28, 9, 54, 1, 0
- ask 3 (seed bench-48-3): starting numbers 36, 29, 43, 25, 16, 27, 22, 20 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before | **Confusion matrix with exact counts** | heatmap: Confusion matrix with exact counts / Numbers show correct and incorrect predictions. / Actual Negative / Actual Positive | values 25, 43, 29, 36, 25, 43
- ask 4 (seed bench-49-4): starting numbers 44, 50, 12, 20, 36, 26, 54, 24 | refused: explanation_bad_token: {{d:0}} is not a token: write {{d:N.path}} or {{d:N.path/decimals}} with decimals 0 to 3. A number the figu | **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted 12 are actual positives predicted negative. / Negative / Positives | values 44, 50, 12, 20, 12, 50, 1, 0
- ask 5 (seed bench-50-5): starting numbers 26, 42, 52, 12, 18, 46, 20, 59 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Super | values 26, 42, 52, 12, 12, 52, 1, 0

**MAIN, balanced**

- ask 1 (seed bench-51-1): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-52-2): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-53-3): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-54-4): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-55-5): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**BUILD 1, balanced**

- ask 1 (seed bench-51-1): starting numbers 11, 13, 23, 18, 35, 21, 22, 57 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 11, 13, 23, 18, 11, 23, 1, 0
- ask 2 (seed bench-52-2): starting numbers 42, 34, 13, 53, 19, 8, 10, 20 |  | **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 42, 34, 13, 53, 8, 53, 1, 0
- ask 3 (seed bench-53-3): starting numbers 7, 57, 36, 33, 24, 50, 48, 32 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 57, 7, 33, 36, 7, 57, 1, 0
- ask 4 (seed bench-54-4): starting numbers 14, 6, 42, 27, 37, 24, 56, 29 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 42, 6, 14, 27, 6, 42, 1, 0
- ask 5 (seed bench-55-5): starting numbers 60, 41, 18, 8, 15, 16, 42, 32 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 60, 41, 18, 8, 8, 60, 1, 0

**BUILD 2 (fixed), balanced**

- ask 1 (seed bench-51-1): starting numbers 11, 13, 23, 18, 35, 21, 22, 57 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 57, 11, 13, 23, 11, 57, 1, 0
- ask 2 (seed bench-52-2): starting numbers 42, 34, 13, 53, 19, 8, 10, 20 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted count shows false negatives. / Negative / Positive | values 42, 34, 13, 53, 8, 53, 1, 0
- ask 3 (seed bench-53-3): starting numbers 7, 57, 36, 33, 24, 50, 48, 32 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cells show actual positives predicted as negative. / Negative / Positive | values 57, 7, 36, 33, 7, 57, 1, 0
- ask 4 (seed bench-54-4): starting numbers 14, 6, 42, 27, 37, 24, 56, 29 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 42, 14, 6, 37, 6, 42, 1, 0
- ask 5 (seed bench-55-5): starting numbers 60, 41, 18, 8, 15, 16, 42, 32 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 60, 41, 18, 8, 8, 60, 1, 0

**MAIN, detailed**

- ask 1 (seed bench-56-1): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-57-2): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-58-3): **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-59-4): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-60-5): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**BUILD 1, detailed**

- ask 1 (seed bench-56-1): starting numbers 30, 54, 55, 24, 49, 31, 52, 35 |  | **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The highlighted entry shows actual positives predicted as negative. / Negative / Positive | values 30, 54, 55, 24, 24, 55, 1, 0
- ask 2 (seed bench-57-2): starting numbers 32, 15, 23, 21, 9, 44, 49, 12 |  | **Confusion matrix with exact counts** | heatmap: Actual and predicted counts / The matrix displays true negatives 32, false positives 15, false negatives 23, and true positives 21. / Negative / Posi... | values 32, 15, 23, 21, 15, 32
- ask 3 (seed bench-58-3): starting numbers 33, 41, 32, 53, 48, 57, 45, 42 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before // explanation_bad_prose_number: the text writes 0.56, 0.62, which the picture does not print; write only numbers the picture prints  // explanation_missing_visual: the card must keep one to three visuals; every diagram was invalid and none could be rebuilt in its ow; NO CARD | **no card: validation_error**
- ask 4 (seed bench-59-4): starting numbers 20, 37, 13, 35, 45, 52, 32, 14 |  | **Confusion matrix counts** | heatmap: Actual and predicted classes / The highlighted cells are actual positives predicted negative. / Negative / Positive | values 50, 10, 5, 35, 5, 50, 1, 0
- ask 5 (seed bench-60-5): starting numbers 24, 50, 34, 58, 33, 18, 36, 37 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Super | values 50, 34, 58, 33, 33, 58, 1, 0

**BUILD 2 (fixed), detailed**

- ask 1 (seed bench-56-1): starting numbers 30, 54, 55, 24, 49, 31, 52, 35 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positives | values 30, 54, 55, 24, 24, 55, 1, 0
- ask 2 (seed bench-57-2): starting numbers 32, 15, 23, 21, 9, 44, 49, 12 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before // explanation_bad_prose_number: the text writes 0.58, 0.48, which the picture does not print; write only numbers the picture prints  | **Confusion matrix with exact counts** | heatmap: Confusion matrix with exact counts / True positives (21) highlighted. / Negative / Positive | values 32, 15, 23, 21, 15, 32, 1, 1
- ask 3 (seed bench-58-3): starting numbers 33, 41, 32, 53, 48, 57, 45, 42 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before // explanation_bad_prose_number: the text writes 0.54, 0.51, 0.45, which the picture does not print; write only numbers the picture p | **Confusion Matrix with Exact Counts** | heatmap: Actual vs Predicted Counts / True negatives = 53, false positives = 32, false negatives = 41, true positives = 33. / Negative / Positive | values 53, 32, 41, 33, 32, 53
- ask 4 (seed bench-59-4): starting numbers 20, 37, 13, 35, 45, 52, 32, 14 |  | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows 13 actual positives predicted negative. / Negative / Positive | values 52, 20, 13, 35, 13, 52, 1, 0
- ask 5 (seed bench-60-5): starting numbers 24, 50, 34, 58, 33, 18, 36, 37 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before // explanation_bad_prose_number: the text writes 0.65, 0.59, 0.69, which the picture does not print; write only numbers the picture p | **Confusion Matrix with Exact Counts** | heatmap: Actual vs Predicted Class Counts / True negatives (58) and false positives (18) in the negative row; false negatives (24) and true positives (34) in ... | values 58, 18, 24, 34, 18, 58

Pictures: `sheets/confusion-matrix-counts-brief.png`, `-balanced.png`, `-detailed.png` (MAIN row above, BRANCH row below, five asks side by side, 408 px).

### ml-self-attention-token-links: When the word sat attends to the sentence the cat sat on the mat, which words matter most?

**MAIN, brief**

- ask 1 (seed bench-61-1): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-62-2): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-63-3): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight, and these six weights sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-64-4): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-65-5): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**BUILD 1, brief**

- ask 1 (seed bench-61-1): starting numbers 22, 32, 52, 60, 10, 40, 24, 16 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.1, 0.4, 0.24, 0.16, 0.05, 0.05
- ask 2 (seed bench-62-2): starting numbers 43, 40, 9, 53, 37, 29, 42, 24 | refused: explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is wr | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1
- ask 3 (seed bench-63-3): starting numbers 47, 22, 58, 5, 60, 21, 53, 13 | refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence | values 2, 0.05, 0.1, 0.05, 0.2, 0.1, 0.5
- ask 4 (seed bench-64-4): starting numbers 52, 5, 40, 57, 34, 27, 24, 28 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.52, 0.05, 0.05, 0.05, 0.28
- ask 5 (seed bench-65-5): starting numbers 20, 45, 14, 5, 51, 46, 6, 27 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. These six weights sum to 1.0. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1

**BUILD 2 (fixed), brief**

- ask 1 (seed bench-61-1): starting numbers 22, 32, 52, 60, 10, 40, 24, 16 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this example, the six weights from sat sum to 1. | values 2, 0.1, 0.4, 0.24, 0.06, 0.05, 0.15
- ask 2 (seed bench-62-2): starting numbers 43, 40, 9, 53, 37, 29, 42, 24 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this example, the six weights from sat sum to 1. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1
- ask 3 (seed bench-63-3): starting numbers 47, 22, 58, 5, 60, 21, 53, 13 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.00. | values 2, 0.1, 0.4, 0.3, 0.05, 0.05, 0.1
- ask 4 (seed bench-64-4): starting numbers 52, 5, 40, 57, 34, 27, 24, 28 |  | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.4, 0.25, 0.1, 0.05, 0.15
- ask 5 (seed bench-65-5): starting numbers 20, 45, 14, 5, 51, 46, 6, 27 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.14, 0.45, 0.2, 0.05, 0.08, 0.08

**MAIN, balanced**

- ask 1 (seed bench-66-1): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-67-2): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-68-3): **Attention Weights for Sat** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to one. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-69-4): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-70-5): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**BUILD 1, balanced**

- ask 1 (seed bench-66-1): starting numbers 59, 57, 37, 56, 25, 51, 42, 34 |  | **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1
- ask 2 (seed bench-67-2): starting numbers 9, 5, 34, 40, 13, 50, 23, 53 |  | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.00. | values 2, 0.09, 0.5, 0.23, 0.05, 0.04, 0.09
- ask 3 (seed bench-68-3): starting numbers 32, 19, 51, 50, 39, 43, 9, 35 |  | **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.05, 0.51, 0.19, 0.09, 0.1, 0.06
- ask 4 (seed bench-69-4): starting numbers 13, 54, 10, 51, 20, 5, 60, 14 |  | **Self-Attention on sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.1, 0.51, 0.2, 0.05, 0.05, 0.09
- ask 5 (seed bench-70-5): starting numbers 32, 12, 28, 39, 18, 38, 59, 34 |  | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.12, 0.28, 0.39, 0.05, 0.06, 0.1

**BUILD 2 (fixed), balanced**

- ask 1 (seed bench-66-1): starting numbers 59, 57, 37, 56, 25, 51, 42, 34 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.05, 0.55, 0.2, 0.05, 0.05, 0.1
- ask 2 (seed bench-67-2): starting numbers 9, 5, 34, 40, 13, 50, 23, 53 |  | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.09, 0.53, 0.23, 0.05, 0.03, 0.07
- ask 3 (seed bench-68-3): starting numbers 32, 19, 51, 50, 39, 43, 9, 35 |  | **How sat attends to the sentence** | token-links: Attention weights from sat / Thicker, darker arrows carry more weight. The six weights from sat sum to 1.00. | values 2, 0.05, 0.51, 0.15, 0.09, 0.05, 0.15
- ask 4 (seed bench-69-4): starting numbers 13, 54, 10, 51, 20, 5, 60, 14 | refused: explanation_bad_prose_number: the text writes 0.54, which the picture does not print; write only numbers the picture prints (or {{ | **Self-Attention Weights for “sat”** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights sum to 1. | values 2, 0.13, 0.54, 0.1, 0.51, 0.2, 0.05
- ask 5 (seed bench-70-5): starting numbers 32, 12, 28, 39, 18, 38, 59, 34 |  | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.12, 0.39, 0.18, 0.05, 0.06, 0.2

**MAIN, detailed**

- ask 1 (seed bench-71-1): **Self-Attention Weights for Sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights sum to one, and cat receives th... | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-72-2): **Self-Attention for “sat”** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-73-3): **Self-Attention for sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. The six weights sum to 1, with cat receiving the largest weight of 0.45. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-74-4): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the weights sum to 0.45 + 0.05 + 0.15 + 0.1 + 0... | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-75-5): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**BUILD 1, detailed**

- ask 1 (seed bench-71-1): starting numbers 33, 16, 54, 55, 58, 40, 44, 17 |  | **Self-Attention Query for Sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.1, 0.33, 0.16, 0.1, 0.1, 0.21
- ask 2 (seed bench-72-2): starting numbers 32, 8, 41, 21, 30, 36, 59, 46 |  | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.1, 0.32, 0.25, 0.08, 0.05, 0.2
- ask 3 (seed bench-73-3): starting numbers 43, 34, 20, 60, 11, 9, 31, 59 |  | **Self-attention weights for sat** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights sum to 1. | values 2, 0.1, 0.43, 0.2, 0.09, 0.08, 0.1
- ask 4 (seed bench-74-4): starting numbers 38, 42, 21, 13, 54, 58, 39, 14 |  | **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1
- ask 5 (seed bench-75-5): starting numbers 19, 26, 28, 59, 36, 8, 55, 25 |  | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.19, 0.26, 0.28, 0.08, 0.11, 0.08

**BUILD 2 (fixed), detailed**

- ask 1 (seed bench-71-1): starting numbers 33, 16, 54, 55, 58, 40, 44, 17 |  | **Self-Attention Weights for Sat** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.1, 0.33, 0.25, 0.05, 0.02, 0.25
- ask 2 (seed bench-72-2): starting numbers 32, 8, 41, 21, 30, 36, 59, 46 |  | **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.1, 0.3, 0.4, 0.1, 0.05, 0.05
- ask 3 (seed bench-73-3): starting numbers 43, 34, 20, 60, 11, 9, 31, 59 |  | **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.00. | values 2, 0.09, 0.43, 0.34, 0.06, 0.05, 0.03
- ask 4 (seed bench-74-4): starting numbers 38, 42, 21, 13, 54, 58, 39, 14 | refused: explanation_bad_token: a {{d:...}} token was left in the card (its diagram is not valid, or it sits inside a diagram or a question | **Self-Attention Weights for Sat** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.00. | values 2, 0.05, 0.38, 0.42, 0.05, 0.02, 0.08
- ask 5 (seed bench-75-5): starting numbers 19, 26, 28, 59, 36, 8, 55, 25 |  | **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.00. | values 2, 0.19, 0.26, 0.28, 0.08, 0.11, 0.08

Pictures: `sheets/ml-self-attention-token-links-brief.png`, `-balanced.png`, `-detailed.png` (MAIN row above, BRANCH row below, five asks side by side, 408 px).

### The fallback asks

- top-k ask 1 (seed bench-76-1): starting numbers 55, 29, 44, 57, 12, 54, 8, 20 | refused: explanation_bad_prose_number: the text writes 100%, 0.75, 33.33, 26.67, which the picture does not print; write only numbers the p // explanation_bad_prose_number: the text writes 100%, which the picture does not print; write only numbers the picture prints (or {{ // explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 weights // explanation_bad_calculation: variables has no result named full; NO CARD | **no card: validation_error**
- top-k ask 1 (seed bench-76-1): starting numbers 55, 29, 44, 57, 12, 54, 8, 20 | inputs weights=[55,29,44,57,12] k=3; server overwrote full, renormalized, keptShare (author wrote full=[27.92,14.72,22.34,28.93,6.09]; renormalized=[35.26,0,28.21,36.54,0]; keptShare=79.2); refused: explanation_bad_prose_number: the text writes 100 %, which the picture does not print; write only numbers the picture prints (or { | **Effect of top‑k filtering on token probability** | bar-chart: grouped / Full softmax vs top-3 renormalized / Top‑3 tokens keep 79% of the original probability. / % / Full softmax / Top-3 renormalized | values 28, 15, 22, 29, 6, 35, 0, 28, 37, 0
- top-k ask 2 (seed bench-77-2): starting numbers 18, 6, 46, 5, 26, 22, 33, 54 | inputs weights=[18,6,46,5,26] k=3; server overwrote full, renormalized, keptShare (author wrote full=[17.82,5.94,45.54,4.95,25.74]; renormalized=[20,0,51.11,0,28.89]; keptShare=89.11); refused: explanation_bad_prose_number: the text writes 100 %, which the picture does not print; write only numbers the picture prints (or { | **Effect of top‑k filtering on token probability** | bar-chart: grouped / Full softmax vs top‑3 renormalized / Top‑3 tokens retain 89% of total probability; their probabilities are renormalized. / % / Full softmax... | values 18, 6, 45, 5, 26, 20, 0, 51, 0, 29
- top-k ask 2 (seed bench-77-2): starting numbers 18, 6, 46, 5, 26, 22, 33, 54 | inputs weights=[18,6,46,5,26] k=3; server overwrote full, renormalized, keptShare (author wrote full=[17.82,5.94,45.54,4.95,25.74]; renormalized=[20,0,51.11,0,28.89]; keptShare=89.1); refused: explanation_bad_prose_number: the text writes 9 %, which the picture does not print; write only numbers the picture prints (or {{v | **Top‑k filtering reshapes token probabilities** | bar-chart: grouped / Full softmax vs top‑3 renormalised / Top‑3 tokens keep 89 % of the original probability mass. / % / Full softmax / Top‑3 renormalised | values 18, 6, 45, 5, 26, 20, 0, 51, 0, 29
- softmax-probabilities ask 1 (seed bench-78-1): starting numbers 45, 46, 18, 15, 34, 28, 19, 50 | refused: explanation_bad_calculation: input weightsA must be from 1 to 1000 (got 0.5) // explanation_bad_calculation: input weightsB must be from 1 to 1000 (got 0) // explanation_bad_calculation: input weightsA must be from 1 to 1000 (got 0.7) // explanation_bad_calculation: variables has no result named probabilitiesA; NO CARD | **no card: validation_error**
- softmax-probabilities ask 1 (seed bench-78-1): starting numbers 45, 46, 18, 15, 34, 28, 19, 50 | inputs weightsA=[45,46,18] weightsB=[15,34,28]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.413,0.422,0.165]; probabilitiesB=[0.195,0.442,0.364]) | **Softmax Comparison of Two Multiclass Predictions** | bar-chart: Illustrative softmax probabilities / grouped / Prediction A / Prediction B / Notice how each class’s probability shifts between the two predictions. | values 0.41, 0.42, 0.17, 0.2, 0.44, 0.36
- softmax-probabilities ask 2 (seed bench-79-2): starting numbers 44, 34, 9, 11, 42, 15, 19, 17 | inputs weightsA=[7,2,1] weightsB=[3,5,2]; server overwrote nothing; refused: explanation_bad_calculation: variables has no input named weightsA // explanation_bad_calculation: variables has no result named probabilitiesA | **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.3, 0.5, 0.2
- softmax-probabilities ask 2 (seed bench-79-2): starting numbers 44, 34, 9, 11, 42, 15, 19, 17 | inputs weightsA=[44,34,9] weightsB=[11,42,15]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.506,0.391,0.103]; probabilitiesB=[0.162,0.618,0.221]) | **Softmax probabilities compare two predictions** | bar-chart: Illustrative softmax probabilities / grouped / Input A / Input B / Notice how each input distributes its confidence across the three classes. | values 0.51, 0.39, 0.1, 0.16, 0.62, 0.22
- regression-mean-baseline ask 1 (seed bench-80-1): starting numbers 23, 8, 41, 13, 50, 46, 59, 6 | inputs targets=[5,8,2,7,10]; server overwrote nothing; refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.1: Give exactly one of at or value) | **Mean prediction as regression baseline** | coordinate-plot: Mean baseline illustration / Sample / Target / Targets / Mean = 6.4 | values 0, 6, 0, 12, 1, 5, 2, 8, 3, 2, 4, 7, 5, 10, 6.4
- regression-mean-baseline ask 1 (seed bench-80-1): starting numbers 23, 8, 41, 13, 50, 46, 59, 6 | inputs targets=[23,8,41,13,50]; server overwrote nothing | **Mean prediction as a regression baseline** | coordinate-plot: Mean baseline on sample targets / Sample / Target / Targets / Mean prediction of 27 | values 1, 5, 0, 60, 1, 23, 2, 8, 3, 41, 4, 13, 5, 50, 27
- regression-mean-baseline ask 2 (seed bench-81-2): starting numbers 33, 8, 57, 38, 49, 36, 20, 26 | inputs targets=[33,8,57,38,49]; server overwrote nothing | **Mean as a regression baseline** | coordinate-plot: Mean regression baseline / Sample / Target / Targets / Mean prediction = 37 | values 0, 6, 0, 70, 1, 33, 2, 8, 3, 57, 4, 38, 5, 49, 37
- regression-mean-baseline ask 2 (seed bench-81-2): starting numbers 33, 8, 57, 38, 49, 36, 20, 26 | inputs targets=[33,8,57,38]; server overwrote nothing; refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.1: Give exactly one of at or value) | **Mean prediction as a regression baseline** | coordinate-plot: Illustrative mean baseline / Sample / Target / Targets / Mean prediction = 34 | values 0, 5, 0, 70, 1, 33, 2, 8, 3, 57, 4, 38, 34
- confusion-matrix-counts ask 1 (seed bench-82-1): starting numbers 36, 8, 45, 60, 22, 43, 21, 24 | refused: explanation_bad_prose_number: the text writes 0.88, 0.57, which the picture does not print; write only numbers the picture prints  // explanation_missing_visual: the card must keep one to three visuals; every diagram was invalid and none could be rebuilt in its ow | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 36, 8, 45, 60, 8, 60, 1, 0
- confusion-matrix-counts ask 1 (seed bench-82-1): starting numbers 36, 8, 45, 60, 22, 43, 21, 24 | refused: explanation_bad_prose_number: the text writes 0.88, 0.57, which the picture does not print; write only numbers the picture prints  // explanation_missing_visual: the card must keep one to three visuals; every diagram was invalid and none could be rebuilt in its ow | **Confusion matrix counts** | heatmap: Actual and predicted classes / The highlighted cells are actual positives predicted negative. / Negative / Positive | values 36, 8, 45, 60, 8, 60, 1, 0
- confusion-matrix-counts ask 2 (seed bench-83-2): starting numbers 45, 60, 8, 6, 14, 49, 58, 27 | refused: explanation_bad_prose_number: the text writes 0.76, 76 %, 0.85, 85 %, which the picture does not print; write only numbers the pic | **Confusion matrix with exact counts** | heatmap: Confusion matrix with counts / Negative / Positive | values 60, 14, 8, 45, 8, 60
- confusion-matrix-counts ask 2 (seed bench-83-2): starting numbers 45, 60, 8, 6, 14, 49, 58, 27 | refused: explanation_bad_prose_number: the text writes 0.09, 0.43, which the picture does not print; write only numbers the picture prints  | **Confusion matrix with exact counts** | heatmap: Confusion matrix with counts / True/false predictions for a binary classifier / Negative / Positive | values 45, 60, 8, 6, 6, 60
- ml-self-attention-token-links ask 1 (seed bench-84-1): starting numbers 38, 49, 9, 44, 17, 30, 33, 23 |  | **How “sat” attends to the sentence** | token-links: Token‑links for “sat” / Arrows show attention weights from the query “sat” to each token; thicker arrows mean larger weight. | values 2, 0.05, 0.1, 0.05, 0.2, 0.05, 0.55
- ml-self-attention-token-links ask 1 (seed bench-84-1): starting numbers 38, 49, 9, 44, 17, 30, 33, 23 |  | **How “sat” attends to the sentence** | token-links: Attention from “sat” to each token / Thicker arrows show larger weights; the sum is 1.0. | values 2, 0.05, 0.1, 0, 0.15, 0.2, 0.5
- ml-self-attention-token-links ask 2 (seed bench-85-2): starting numbers 46, 40, 11, 59, 57, 7, 42, 35 |  | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. The six weights from “sat” sum to 1. | values 2, 0.05, 0.1, 0, 0.05, 0.1, 0.7
- ml-self-attention-token-links ask 2 (seed bench-85-2): starting numbers 46, 40, 11, 59, 57, 7, 42, 35 |  | **Attention of “sat” in “the cat sat on the mat”** | token-links: How “sat” attends to the sentence / Thicker arrows show larger attention weights from the query “sat”. | values 2, 0.05, 0.1, 0, 0.05, 0.05, 0.75

