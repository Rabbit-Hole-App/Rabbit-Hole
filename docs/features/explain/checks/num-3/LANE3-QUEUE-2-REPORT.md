# Lane 3, second queue: MAT-E pad removal, NOVIS-1 (a) and (c), NUM-3b recompute (2026-11-19)

The lead wrote this from the lane agent's text. No harness refusals, no paid or provider calls; commits use `git commit --only` and plain messages.

## 1. MAT-E pad removal: feat/mat-e d6e88dbd9 (pushed; in release 165)
The pad branch in `correctedMatrix` is deleted with the code `matrix_cells_padded` and the comment that described padding; rows short by the same count now get no correction and go to repair; the trim branch is kept. The assertion changed earlier now asserts that equal-short and unequal-short rows get no correction. A new end-to-end test in explanation-validation.test.js sends an equal-short matrix through `generateArtifact` and checks it gets one repair and is delivered as repaired with no dash column (it would also pass on the old code with MAT-E, so it guards against reintroducing the pad).
How often the pad fired: saved records keep no correction log, so it was re-derived from saved raw author answers: 2718 records scanned (R1, R2, VAR-1, card-numbers, fallbacks, gem-s2, R3-pre), 1783 with raw answers. Literal `matrix_cells_padded`: 0 in records and 0 in 124 archive objects. Pad-eligible raw matrices: exactly 1, the R2 fraud card (2 cells for 3 columns), which already goes to repair under MAT-E, so no card newly moves to repair. About 935 records without raw answers could not be checked.
Guards: tutor-diagrams 1413/1413, control plane 132/132, 470 hashes and 474 replay identical, svg-snapshots untouched.

## 2. NOVIS-1: feat/novis-1 off main a88949c27
- (a) d87a1e398 (pushed): `explanationLayoutProblem` takes `{ diagram }`; new `plannedDiagram(input)` in learn-artifact.js is true when the plan (not the learner's named kinds) names a diagram; a card with only a picture then gets `explanation_missing_visual: ... a picture does not stand in for it` and the repair runs. Tests in the new explanation-novis.test.js.
- (c) 58da066fb (pushed): `visualFence` reads `{k:'spec', spec:{...}}` as a diagram; a `k:'spec'` with no spec object makes no fence. The thermostat raw answer (bench-66-2) is delivered with its cycle at attempt 0, 1 diagram.
- (b) NOT committed: the second layout check after `withoutIllustrations` strips an unmakeable picture breaks four existing tests that encode a policy ("a picture that cannot be made never fails the card"): explanation-layout.test.js 'after 3 failed attempts the fence is removed silently: the card is delivered with no figure and no error text', 'no RECRAFT_API_KEY ... the fence is removed and the card delivered', fix 5c; and the 700-character budget test in explanation-validation.test.js. (b) would fail every picture-only card whenever the image provider is down and no repair helps. With (a) in place the post-strip check can only fire for picture-only cards, which is exactly that policy reversal; (a) already covers the R2 text-to-image shape. The patch is saved at C:/s/gen1-prep/novis-b-blocked.patch. DECISION FOR THE REVIEWER: is (b) wanted (the lane rewrites those tests) or dropped?
- The plan in the archive trace is already stored: learn-artifact.js:203 writes `plan` (with `visuals`) into the trace and archive records carry it (70 of 124 sampled); the R2 bench rows omit it, so nothing was added. `plannedKindMissing` is a bench-harness field, not in the repo.
- The 14 zero-diagram R2 cards (offline replay, C:/s/gen1-prep/novis-replay.mjs; the plan is not saved in the bench rows, so it was rebuilt from `plannerKind` plus the raw answer's pictures: an assumption). The replay's repair call returns the same raw answer, so only the first-attempt verdict is meaningful.

| cards | what happens now |
|---|---|
| 6 text-to-image (3 seeds x 2 arms), picture-only raw answer | caught by (a) at attempt 0 |
| 1 thermostat AFTER bench-66-2 | read correctly by (c), 1 diagram |
| 3 no-plan roadmap cards (thermostat, overfitting, next-word) | author diagram invalid and dropped; not NOVIS |
| 1 vaccines (no plan, picture only) | not caught: no plan, nothing named a diagram |
| 1 AFTER bench-40-1 next-word (plan bar-chart) | invalid diagram (`series` too small); not NOVIS |
| 2 box-plot (bench-90-2, bench-116-3) | invalid diagram (axes); not NOVIS |

Request side: 470 hashes and 474 replay identical. Tests: control-plane explanation-*, learn-artifact*, roadmap-*, explain-* (117 files, 1225/1225); tutor-diagrams 1412/1412; svg-snapshots untouched; file list C:/s/gen1-prep/novis-testfiles.txt.

## 3. NUM-3b recompute (no build): C:/s/gen1-prep/num3b-recompute.mjs, output num3b-recompute.json
Of the 27 saved scale / transformation cards, 6 are wrong and 1 borderline. Mix: 13 softmax in substance (written 'exponential and divide by the sum' or as the sigma formula), 8 round or quantise, 5 divide by the square root of 4, 1 standardise.
- Wrong (raw scores 2.0, 1.0, 0.1 written 0.70, 0.26, 0.04; right 0.66, 0.24, 0.10), 5 cards: var-1 #11 BEFORE, var-1 #142 BEFORE, var-1 #142 AFTER (bench-142-3), card-numbers-6 #141 AFTER, card-numbers-6 #142 AFTER.
- Wrong, 1 card: card-numbers-6b #1054, logits -1.0, 0.5, 2.0 written 0.03, 0.15, 0.82 (right 0.04, 0.18, 0.79; the same card NUM-3c found).
- Borderline, 1 card: gen1-r1 #69 AFTER, subtract mean 4.0 and divide by std 1.63, writes -1.22 and 1.22; the stated std gives -1.23 and 1.23, the unrounded std 1.633 gives -1.22.
- Correct: the other 20, including all 5 divide-by-square-root-of-4 cards (4, 2, 1 to 2, 1, 0.5), all 8 round or quantise cards and the 7 right softmax cards; var-1 #33 AFTER (127 and 110) is consistent with one common scale of 40.425.
- Limit: the divide-by cards carry the factor in the operation text; card-numbers-6b #1051 says only 'divide by sqrt(d_k)', so d_k = 4 was taken from its sibling cards.
