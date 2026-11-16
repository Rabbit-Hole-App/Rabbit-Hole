# AUDIT-1: structural diff, every snapshot id at width 408

Before = main 18cf9fce8 (left on the sheets), after = 74c4f68ae (right). Set: the snapshot ids that have a 408 key in `svg-snapshots.json`: 221 reference ids (those not drawn as illustrations) + 22 `shape-*` kind-gallery ids + 844 illustration ids (the references drawn as illustrations, their depth variants `-brief`/`-detailed`/`-detail`, and the fixtures) = 1087 ids. Both trees render the same ids (no id appears on one side only). Rendered with each tree's own `renderTutorDiagram(spec, 408)`; figure widths can exceed 408 when the figure needs it (that is the `width-changed` flag).

## Summary: ids per flag

| flag | ids |
|---|---|
| render-error | 0 |
| only-before | 0 |
| only-after | 0 |
| smooth->straight | 142 |
| straight->smooth | 0 |
| closed-shapes-changed | 1 |
| markers-changed | 61 |
| badges-without-key | 0 |
| badges-without-key (same before) | 10 |
| text-overflow | 2 |
| elements>30% | 14 |
| width-changed | 286 |

Ids with at least one flag: 335 of 1087. Ids by number of flags: 0 flags: 752, 1 flags: 205, 2 flags: 80, 3 flags: 49, 4 flags: 1.

## Flag rules (SVG string of each tree, regex measurement; script `C:/s/audit1/audit-render.mjs` + `combine.mjs`)
- smooth->straight / straight->smooth: number of `<path>` elements whose d contains a cubic `C` command, before vs after (0 vs more than 0). Flow wires use `Q` corners and are not counted.
- closed-shapes-changed: count of closed shapes differs: polygons with 4+ points (not arrowheads) plus paths that end in Z or return to their first point using only L segments.
- markers-changed: small circles (r up to 8) + small squares (w = h up to 14) + 4-point polygons (diamonds) differ by more than 25 percent or one side is 0.
- badges-without-key: after has a numbered badge (a circle r 6-14 followed by a text of 1-2 digits centred on it) whose number has no text line starting "N. " / "N) " anywhere in the figure.
- text-overflow: an ESTIMATE, not a measurement: each `<text>` is measured with the renderer's own `textWidth(line, fontSize)` (it ignores font weight, so bold text is under-estimated) and compared with the smallest rect that contains its anchor point (flag when it protrudes more than 1 px) and with the figure's own width; flagged only when the after render has more overflows than the before render. HTML `foreignObject` text (legend pills) is not measured.
- elements>30%: SVG element count differs by more than 30 percent.
- width-changed: the figure width (rounded) differs.

## Per id (sorted by number of flags, then id; only flagged ids; full data in diff.json)

Counts are `elements / C commands / closed shapes / markers+squares+diamonds / badges:without key / overflows / width x height`.

| id | set | flags | before | after | overflow detail (after) |
|---|---|---|---|---|---|
| time-series-components | ref | smooth->straight, markers-changed, elements>30%, width-changed | 71/21/0/3+3+3/0:0/0/420x556 | 103/0/0/9+9+9/0:0/0/408x499 |  |
| bayes-class-conditional-densities | ref | smooth->straight, markers-changed, width-changed | 64/16/0/3+3+0/0:0/0/420x574 | 71/0/0/6+6+0/0:0/0/408x491 |  |
| big-o-growth-rates | illus | smooth->straight, markers-changed, width-changed | 234/36/0/6+3+3/0:0/0/420x601 | 254/0/0/12+6+6/0:0/0/408x486 |  |
| big-o-growth-rates-detailed | illus | smooth->straight, markers-changed, width-changed | 234/36/0/6+3+3/0:0/0/420x601 | 254/0/0/12+6+6/0:0/0/408x486 |  |
| big-o-growth-rates-detailed-detail | illus | smooth->straight, markers-changed, width-changed | 287/75/0/6+6+3/0:0/0/420x629 | 344/0/0/18+18+9/0:0/0/408x516 |  |
| binary-cross-entropy-loss | ref | smooth->straight, markers-changed, width-changed | 60/12/0/3+3+0/0:0/0/420x550 | 77/0/0/8+8+0/0:0/0/408x511 |  |
| contextual-time-anomaly | ref | smooth->straight, markers-changed, width-changed | 80/7/0/4+9+0/0:0/0/420x574 | 87/0/0/10+9+0/0:0/0/408x491 |  |
| d2l-cosine-warmup-schedules | illus | smooth->straight, markers-changed, width-changed | 60/6/0/3+3+0/0:0/0/420x550 | 76/0/0/8+8+0/0:0/0/408x491 |  |
| d2l-cosine-warmup-schedules-brief | illus | smooth->straight, markers-changed, width-changed | 60/6/0/3+3+0/0:0/0/420x550 | 76/0/0/8+8+0/0:0/0/408x491 |  |
| d2l-cosine-warmup-schedules-detailed | illus | smooth->straight, markers-changed, width-changed | 98/6/0/3+3+0/0:0/0/420x550 | 114/0/0/8+8+0/0:0/0/408x491 |  |
| d2l-gradient-descent-local-basin | illus | smooth->straight, markers-changed, width-changed | 75/7/0/5+4+0/0:0/0/420x576 | 80/0/0/11+4+0/0:0/0/408x491 |  |
| d2l-gradient-descent-local-basin-brief | illus | smooth->straight, markers-changed, width-changed | 76/7/0/5+4+0/0:0/0/420x598 | 80/0/0/11+4+0/0:0/0/408x491 |  |
| d2l-gradient-descent-local-basin-detailed | illus | smooth->straight, markers-changed, width-changed | 114/7/0/5+4+0/0:0/0/420x576 | 119/0/0/11+4+0/0:0/0/408x491 |  |
| d2l-inverse-root-factor-schedules | illus | smooth->straight, markers-changed, width-changed | 60/12/0/3+3+0/0:0/0/420x545 | 76/0/0/8+8+0/0:0/0/408x486 |  |
| d2l-inverse-root-factor-schedules-brief | illus | smooth->straight, markers-changed, width-changed | 60/12/0/3+3+0/0:0/0/420x545 | 76/0/0/8+8+0/0:0/0/408x486 |  |
| d2l-inverse-root-factor-schedules-detailed | illus | smooth->straight, markers-changed, width-changed | 122/12/0/3+3+0/0:0/0/420x528 | 138/0/0/8+8+0/0:0/0/408x469 |  |
| d2l-lag-regression-training-examples | illus | smooth->straight, markers-changed, width-changed | 60/9/0/4+0+0/0:0/0/420x524 | 60/0/0/7+0+0/0:0/0/408x469 |  |
| d2l-lag-regression-training-examples-detailed | illus | smooth->straight, markers-changed, width-changed | 60/9/0/4+0+0/0:0/0/420x524 | 60/0/0/7+0+0/0:0/0/408x469 |  |
| d2l-newton-convex-curvature-steps | illus | smooth->straight, markers-changed, width-changed | 67/8/0/3+5+0/0:0/0/420x550 | 69/0/0/6+5+0/0:0/0/408x491 |  |
| d2l-newton-convex-curvature-steps-brief | illus | smooth->straight, markers-changed, width-changed | 66/8/0/3+5+0/0:0/0/420x528 | 68/0/0/6+5+0/0:0/0/408x469 |  |
| d2l-newton-convex-curvature-steps-detailed | illus | smooth->straight, markers-changed, width-changed | 121/8/0/3+5+0/0:0/0/420x567 | 123/0/0/6+5+0/0:0/0/408x508 |  |
| d2l-newton-negative-curvature-safeguard | illus | smooth->straight, markers-changed, width-changed | 72/7/0/3+3+4/0:0/0/420x595 | 80/0/0/9+3+4/0:0/0/408x508 |  |
| d2l-newton-negative-curvature-safeguard-brief | illus | smooth->straight, markers-changed, width-changed | 71/7/0/3+3+4/0:0/0/420x573 | 79/0/0/9+3+4/0:0/0/408x486 |  |
| d2l-newton-negative-curvature-safeguard-detailed | illus | smooth->straight, markers-changed, width-changed | 108/7/0/3+3+4/0:0/0/420x578 | 116/0/0/9+3+4/0:0/0/408x491 |  |
| d2l-ordered-sequence-readings | illus | smooth->straight, markers-changed, width-changed | 61/9/0/4+0+0/0:0/0/420x546 | 61/0/0/7+0+0/0:0/0/408x491 |  |
| d2l-ordered-sequence-readings-detailed | illus | smooth->straight, markers-changed, width-changed | 62/9/0/4+0+0/0:0/0/420x563 | 62/0/0/7+0+0/0:0/0/408x508 |  |
| d2l-sigmoid-tanh-saturation-gradients | illus | smooth->straight, markers-changed, width-changed | 63/12/0/3+3+0/0:0/0/420x545 | 79/0/0/8+8+0/0:0/0/408x486 |  |
| d2l-sigmoid-tanh-saturation-gradients-brief | illus | smooth->straight, markers-changed, width-changed | 63/12/0/3+3+0/0:0/0/420x545 | 79/0/0/8+8+0/0:0/0/408x486 |  |
| d2l-sigmoid-tanh-saturation-gradients-detailed | illus | smooth->straight, markers-changed, width-changed | 118/12/0/3+3+0/0:0/0/420x528 | 135/0/0/8+8+0/0:0/0/408x486 |  |
| d2l-tanh-sigmoid-activation-ranges | illus | smooth->straight, markers-changed, width-changed | 63/12/0/3+3+0/0:0/0/420x550 | 79/0/0/8+8+0/0:0/0/408x491 |  |
| d2l-tanh-sigmoid-activation-ranges-brief | illus | smooth->straight, markers-changed, width-changed | 62/12/0/3+3+0/0:0/0/420x528 | 78/0/0/8+8+0/0:0/0/408x469 |  |
| d2l-tanh-sigmoid-activation-ranges-detailed | illus | smooth->straight, markers-changed, width-changed | 80/12/0/3+3+0/0:0/0/420x550 | 96/0/0/8+8+0/0:0/0/408x491 |  |
| d2l-translation-train-validation-loss | illus | smooth->straight, markers-changed, width-changed | 66/12/0/4+3+0/0:0/0/420x552 | 80/0/0/9+8+0/0:0/0/408x469 |  |
| d2l-translation-train-validation-loss-detailed | illus | smooth->straight, markers-changed, width-changed | 67/12/0/4+3+0/0:0/0/420x569 | 81/0/0/9+8+0/0:0/0/408x486 |  |
| double-descent-curve | ref | smooth->straight, markers-changed, width-changed | 60/9/0/3+0+0/0:0/0/420x524 | 60/0/0/6+0+0/0:0/0/408x469 |  |
| early-stopping-curves | ref | smooth->straight, markers-changed, width-changed | 70/14/0/3+3+0/0:0/0/420x574 | 88/0/0/9+9+0/0:0/0/408x491 |  |
| gradient-descent-contours | ref | smooth->straight, closed-shapes-changed, width-changed | 84/32/0/1+1+0/0:0/0/420x600 | 74/0/2/1+1+0/0:0/0/408x469 |  |
| learning-rate-schedules | ref | smooth->straight, markers-changed, width-changed | 58/6/0/5+3+0/0:0/0/420x550 | 65/0/0/5+8+0/0:0/0/408x491 |  |
| ml-collective-anomaly-run | ref | smooth->straight, markers-changed, width-changed | 62/11/0/4+0+0/0:0/0/420x565 | 62/0/0/8+0+0/0:0/0/408x512 |  |
| ml-linear-regression-ridge-shrinkage | ref | smooth->straight, elements>30%, width-changed | 190/3/0/6+0+0/0:0/0/420x683 | 93/0/0/6+0+0/0:0/0/408x534 |  |
| ml-mle-bernoulli-likelihood | illus | smooth->straight, markers-changed, width-changed | 65/10/0/5+0+0/0:0/0/420x565 | 64/0/0/9+0+0/0:0/0/408x512 |  |
| ml-mle-bernoulli-likelihood-brief | illus | smooth->straight, markers-changed, width-changed | 57/10/0/4+0+0/0:0/0/420x524 | 58/0/0/8+0+0/0:0/0/408x495 |  |
| ml-mle-bernoulli-likelihood-detailed | illus | smooth->straight, markers-changed, width-changed | 117/10/0/5+0+0/0:0/0/420x565 | 116/0/0/9+0+0/0:0/0/408x512 |  |
| ml-time-series-additive-residuals | ref | smooth->straight, markers-changed, width-changed | 267/21/0/15+3+0/0:0/0/444x1649 | 317/0/0/27+9+0/0:0/0/432x1455 |  |
| ml-time-series-recursive-rollout | ref | smooth->straight, markers-changed, width-changed | 156/13/0/3+5+5/0:0/0/444x880 | 160/0/0/9+5+5/0:0/0/432x745 |  |
| ml-zscore-distribution-tails | ref | smooth->straight, markers-changed, width-changed | 125/16/0/3+0+0/0:0/0/420x565 | 94/0/0/10+0+0/0:0/0/408x486 |  |
| persistent-drift-alerts | ref | smooth->straight, markers-changed, width-changed | 76/7/0/4+0+0/0:0/0/420x612 | 93/0/0/10+0+0/0:0/0/408x491 |  |
| rbf-kernel-similarity | ref | smooth->straight, markers-changed, width-changed | 59/12/0/3+3+0/0:0/0/420x528 | 76/0/0/8+8+0/0:0/0/408x469 |  |
| shape-coordinate-plot | shape | smooth->straight, markers-changed, width-changed | 100/8/0/4+0+0/0:0/0/420x476 | 76/0/0/6+0+0/0:0/0/408x421 |  |
| sigmoid-threshold | ref | smooth->straight, markers-changed, width-changed | 67/8/0/3+0+0/0:0/0/420x548 | 65/0/0/6+0+0/0:0/0/408x469 |  |
| bayesian-search-surrogate | ref | smooth->straight, width-changed | 78/4/1/7+4+0/0:0/0/420x586 | 73/0/1/7+4+0/0:0/0/408x535 |  |
| big-o-growth-rates-brief | illus | smooth->straight, markers-changed | 86/36/0/6+3+3/0:0/0/425x584 | 106/0/0/12+6+6/0:0/0/425x499 |  |
| clustering-elbow-silhouette | ref | smooth->straight, width-changed | 67/4/0/7+0+0/0:0/0/420x546 | 71/0/0/7+0+0/0:0/0/408x491 |  |
| clustering-inertia-elbow | ref | smooth->straight, width-changed | 63/5/0/8+0+0/0:0/0/420x546 | 69/0/0/8+0+0/0:0/0/408x517 |  |
| d2l-adam-yogi-loss-history | illus | smooth->straight, width-changed | 73/8/0/6+6+0/0:0/0/420x567 | 69/0/0/6+6+0/0:0/0/408x508 |  |
| d2l-adam-yogi-loss-history-brief | illus | smooth->straight, width-changed | 73/8/0/6+6+0/0:0/0/420x567 | 69/0/0/6+6+0/0:0/0/408x508 |  |
| d2l-adam-yogi-loss-history-detailed | illus | smooth->straight, width-changed | 103/8/0/6+6+0/0:0/0/420x567 | 99/0/0/6+6+0/0:0/0/408x508 |  |
| d2l-attention-distance-kernel-shapes | illus | smooth->straight, width-changed | 94/4/0/12+5+3/0:0/0/420x606 | 90/0/0/12+5+3/0:0/0/408x521 |  |
| d2l-attention-distance-kernel-shapes-brief | illus | smooth->straight, width-changed | 78/4/0/6+5+3/0:0/0/420x556 | 74/0/0/6+5+3/0:0/0/408x469 |  |
| d2l-attention-distance-kernel-shapes-detailed | illus | smooth->straight, width-changed | 131/4/0/12+5+3/0:0/0/420x623 | 127/0/0/12+5+3/0:0/0/408x538 |  |
| d2l-complexity-heldout-error | illus | smooth->straight, width-changed | 81/8/0/7+6+0/0:0/0/420x552 | 75/0/0/7+6+0/0:0/0/408x469 |  |
| d2l-complexity-heldout-error-brief | illus | smooth->straight, width-changed | 81/8/0/7+6+0/0:0/0/420x552 | 75/0/0/7+6+0/0:0/0/408x469 |  |
| d2l-complexity-heldout-error-detailed | illus | smooth->straight, width-changed | 82/8/0/7+6+0/0:0/0/420x569 | 76/0/0/7+6+0/0:0/0/408x486 |  |
| d2l-dropout-validation-metrics | illus | smooth->straight, width-changed | 72/8/0/6+6+0/0:0/0/420x545 | 69/0/0/6+6+0/0:0/0/408x486 |  |
| d2l-dropout-validation-metrics-brief | illus | smooth->straight, width-changed | 73/8/0/6+6+0/0:0/0/420x567 | 70/0/0/6+6+0/0:0/0/408x508 |  |
| d2l-dropout-validation-metrics-detailed | illus | smooth->straight, width-changed | 106/8/0/6+6+0/0:0/0/420x545 | 103/0/0/6+6+0/0:0/0/408x486 |  |
| d2l-gaussian-location-scale | illus | smooth->straight, width-changed | 86/12/0/6+6+6/0:0/0/420x556 | 82/0/0/6+6+6/0:0/0/408x469 |  |
| d2l-gaussian-location-scale-brief | illus | smooth->straight, width-changed | 87/12/0/6+6+6/0:0/0/420x578 | 83/0/0/6+6+6/0:0/0/408x491 |  |
| d2l-gaussian-location-scale-detailed | illus | smooth->straight, width-changed | 108/12/0/6+6+6/0:0/0/420x573 | 104/0/0/6+6+6/0:0/0/408x486 |  |
| d2l-minibatch-loss-by-wall-time | illus | smooth->straight, width-changed | 93/8/0/8+4+4/0:0/0/420x630 | 87/0/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-by-wall-time-brief | illus | smooth->straight, width-changed | 92/8/0/8+4+4/0:0/0/420x608 | 87/0/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-by-wall-time-detailed | illus | smooth->straight, width-changed | 113/8/0/8+4+4/0:0/0/420x613 | 107/0/0/8+4+4/0:0/0/408x504 |  |
| d2l-minibatch-loss-per-epoch | illus | smooth->straight, width-changed | 86/8/0/8+4+4/0:0/0/420x606 | 82/0/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-per-epoch-brief | illus | smooth->straight, width-changed | 86/8/0/8+4+4/0:0/0/420x606 | 82/0/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-per-epoch-detailed | illus | smooth->straight, width-changed | 107/8/0/8+4+4/0:0/0/420x606 | 103/0/0/8+4+4/0:0/0/408x521 |  |
| d2l-momentum-rate-loss-history | illus | smooth->straight, width-changed | 88/12/0/6+6+6/0:0/0/420x595 | 84/0/0/6+6+6/0:0/0/408x538 |  |
| d2l-momentum-rate-loss-history-brief | illus | smooth->straight, width-changed | 88/12/0/6+6+6/0:0/0/420x595 | 84/0/0/6+6+6/0:0/0/408x538 |  |
| d2l-momentum-rate-loss-history-detailed | illus | smooth->straight, width-changed | 88/12/0/6+6+6/0:0/0/420x595 | 84/0/0/6+6+6/0:0/0/408x538 |  |
| d2l-ordered-sequence-readings-brief | illus | smooth->straight, markers-changed | 67/18/0/3+0+0/0:0/0/408x414 | 55/0/0/6+0+0/0:0/0/408x469 |  |
| d2l-schedule-heldout-training-outcome | illus | smooth->straight, width-changed | 97/10/0/8+8+4/0:0/0/420x634 | 94/0/0/8+8+4/0:0/0/408x521 |  |
| d2l-schedule-heldout-training-outcome-brief | illus | smooth->straight, width-changed | 96/10/0/8+8+4/0:0/0/420x612 | 93/0/0/8+8+4/0:0/0/408x499 |  |
| d2l-schedule-heldout-training-outcome-detailed | illus | smooth->straight, width-changed | 98/10/0/8+8+4/0:0/0/420x651 | 95/0/0/8+8+4/0:0/0/408x538 |  |
| d2l-translation-train-validation-loss-brief | illus | smooth->straight, markers-changed | 73/24/0/3+3+0/0:0/0/408x462 | 76/0/0/8+8+0/0:0/0/408x491 |  |
| d2l-weight-decay-heldout-loss | illus | smooth->straight, width-changed | 86/8/0/8+4+4/0:0/0/420x606 | 83/0/0/8+4+4/0:0/0/408x551 |  |
| d2l-weight-decay-heldout-loss-brief | illus | smooth->straight, width-changed | 86/8/0/8+4+4/0:0/0/420x606 | 83/0/0/8+4+4/0:0/0/408x551 |  |
| d2l-weight-decay-heldout-loss-detailed | illus | smooth->straight, width-changed | 141/8/0/8+4+4/0:0/0/420x606 | 139/0/0/8+4+4/0:0/0/408x568 |  |
| figure-retro-neighbor-search | illus | elements>30%, width-changed | 93/0/0/2+3+3/0:0/0/420x676 | 63/0/0/2+3+3/0:0/0/408x491 |  |
| figure-retro-neighbor-search-brief | illus | elements>30%, width-changed | 93/0/0/2+3+3/0:0/0/420x676 | 62/0/0/2+3+3/0:0/0/408x469 |  |
| figure-retro-neighbor-search-detailed | illus | elements>30%, width-changed | 170/0/0/2+3+3/0:0/0/420x676 | 104/0/0/2+3+3/0:0/0/408x491 |  |
| forecast-horizon-uncertainty | ref | smooth->straight, width-changed | 78/7/1/5+6+0/0:0/0/420x574 | 72/0/1/5+6+0/0:0/0/408x521 |  |
| knn-k-validation | ref | smooth->straight, width-changed | 81/8/0/7+6+0/0:0/0/420x552 | 75/0/0/7+6+0/0:0/0/408x469 |  |
| learning-curves | ref | smooth->straight, width-changed | 68/6/0/5+5+0/0:0/0/420x550 | 64/0/0/5+5+0/0:0/0/408x491 |  |
| ml-boosting-correction-transformation | ref | smooth->straight, width-changed | 278/4/0/8+8+0/0:0/0/444x1434 | 237/0/0/8+8+0/0:0/0/432x1190 |  |
| ml-differencing-transformation | ref | smooth->straight, width-changed | 334/5/0/9+0+0/0:0/0/444x1574 | 300/0/0/9+0+0/0:0/0/432x1347 |  |
| ml-fit-quality-comparison | ref | smooth->straight, width-changed | 207/12/0/18+12+0/0:0/0/444x1723 | 204/0/0/18+15+0/0:0/0/432x1548 |  |
| ml-linear-regression-feature-scaling-overlay | ref | smooth->straight, width-changed | 120/2/0/4+0+0/0:0/0/420x567 | 115/0/0/4+0+0/0:0/0/408x478 |  |
| ml-linear-regression-line-meaning | ref | elements>30%, width-changed | 123/0/0/6+3+0/0:0/0/420x583 | 69/0/0/6+3+0/0:0/0/408x452 |  |
| ml-linear-regression-polynomial-overfit | ref | smooth->straight, width-changed | 78/10/0/8+3+3/0:0/0/420x606 | 85/0/0/8+3+7/0:0/0/408x551 |  |
| ml-local-outlier-factor | ref | elements>30%, width-changed | 215/0/0/8+8+0/0:0/0/420x660 | 129/0/0/8+8+0/0:0/0/408x469 |  |
| ml-logistic-regression-sigmoid-derivative | ref | markers-changed, width-changed | 88/12/0/4+3+0/0:0/0/420x574 | 91/12/0/9+8+0/0:0/0/408x517 |  |
| ml-logistic-regression-sigmoid-shape | ref | markers-changed, width-changed | 87/6/0/3+0+0/0:0/0/420x596 | 101/6/0/8+0+0/0:0/0/408x469 |  |
| ml-logistic-regression-threshold-tradeoff | ref | smooth->straight, width-changed | 74/4/0/5+4+0/0:0/0/420x569 | 68/0/0/5+4+0/0:0/0/408x486 |  |
| ml-model-evaluation-schedule-run-diagnostics | ref | smooth->straight, width-changed | 148/9/0/10+5+0/0:0/0/444x1101 | 148/0/0/10+5+0/0:0/0/432x986 |  |
| ml-model-evaluation-training-diagnostics | ref | smooth->straight, width-changed | 121/9/0/10+5+0/0:0/0/444x1077 | 123/0/0/10+5+0/0:0/0/432x986 |  |
| ml-regression-error-metrics | ref | elements>30%, width-changed | 495/0/0/3+5+0/0:0/0/444x1643 | 335/0/0/3+5+0/0:0/0/432x1395 |  |
| ml-repeated-sample-fits | ref | smooth->straight, width-changed | 237/2/1/7+3+3/0:0/0/444x1592 | 234/0/1/7+3+3/0:0/0/432x1464 |  |
| ml-transformer-token-embeddings-detailed-detail | illus | smooth->straight, width-changed | 183/10/0/7+7+0/0:0/0/420x569 | 178/0/0/7+7+0/0:0/0/408x486 |  |
| ml-trees-bootstrap-coverage | illus | markers-changed, width-changed | 133/19/0/3+0+0/0:0/0/420x563 | 120/19/0/1+0+0/0:0/0/408x534 |  |
| ml-trees-bootstrap-coverage-brief | illus | markers-changed, width-changed | 105/19/0/3+0+0/0:0/0/420x524 | 92/19/0/1+0+0/0:0/0/408x495 |  |
| ml-trees-bootstrap-coverage-detailed | illus | markers-changed, width-changed | 157/19/0/4+0+0/0:0/0/420x587 | 142/19/0/2+0+0/0:0/0/408x534 |  |
| ml-trees-depth-overfit | illus | markers-changed, width-changed | 75/0/0/4+3+0/0:0/0/420x552 | 90/0/0/10+9+0/0:0/0/408x469 |  |
| ml-trees-depth-overfit-brief | illus | markers-changed, width-changed | 75/0/0/4+3+0/0:0/0/420x552 | 90/0/0/10+9+0/0:0/0/408x469 |  |
| ml-trees-depth-overfit-detailed | illus | elements>30%, width-changed | 103/0/0/5+4+0/0:0/0/420x696 | 63/0/0/5+4+0/0:0/0/408x469 |  |
| ml-trees-forest-size-accuracy | illus | smooth->straight, width-changed | 85/4/0/6+0+0/0:0/0/420x603 | 64/0/0/6+0+0/0:0/0/408x452 |  |
| ml-trees-forest-size-accuracy-brief | illus | smooth->straight, width-changed | 85/4/0/6+0+0/0:0/0/420x603 | 64/0/0/6+0+0/0:0/0/408x452 |  |
| ml-trees-forest-size-accuracy-detailed | illus | smooth->straight, width-changed | 87/4/0/6+0+0/0:0/0/420x637 | 66/0/0/6+0+0/0:0/0/408x486 |  |
| ml-trees-gini-vs-entropy | illus | markers-changed, width-changed | 185/20/0/5+3+0/0:0/0/420x593 | 193/20/0/9+7+0/0:0/0/408x486 |  |
| ml-trees-gini-vs-entropy-brief | illus | markers-changed, width-changed | 184/20/0/5+3+0/0:0/0/420x593 | 192/20/0/9+7+0/0:0/0/408x486 |  |
| ml-trees-gini-vs-entropy-detailed | illus | markers-changed, width-changed | 187/20/0/5+3+0/0:0/0/420x610 | 195/20/0/9+7+0/0:0/0/408x503 |  |
| ml-what-is-machine-learning-bias-variance | ref | smooth->straight, width-changed | 92/8/0/9+4+4/0:0/0/420x608 | 85/0/0/9+4+4/0:0/0/408x525 |  |
| polynomial-regression-curve | ref | smooth->straight, width-changed | 64/8/0/3+6+0/0:0/0/420x550 | 67/0/0/6+6+0/0:0/0/408x491 |  |
| precision-recall-thresholds | ref | smooth->straight, width-changed | 66/4/0/6+0+0/0:0/0/420x524 | 70/0/0/6+0+0/0:0/0/408x469 |  |
| probability-calibration | ref | smooth->straight, width-changed | 69/4/0/6+3+0/0:0/0/420x550 | 65/0/0/6+3+0/0:0/0/408x491 |  |
| raschka-residual-gain-and-soft-logit-cap-brief-detail | illus | smooth->straight, width-changed | 59/4/0/6+0+0/0:0/0/420x500 | 65/0/0/6+0+0/0:0/0/408x469 |  |
| raschka-residual-gain-and-soft-logit-cap-detail | illus | smooth->straight, width-changed | 59/4/0/6+0+0/0:0/0/420x500 | 65/0/0/6+0+0/0:0/0/408x469 |  |
| raschka-residual-gain-and-soft-logit-cap-detailed-detail | illus | smooth->straight, width-changed | 92/4/0/6+0+0/0:0/0/420x500 | 98/0/0/6+0+0/0:0/0/408x469 |  |
| regularization-coefficient-path | ref | smooth->straight, width-changed | 79/8/0/6+6+0/0:0/0/420x574 | 73/0/0/6+6+0/0:0/0/408x491 |  |
| repeated-fit-uncertainty | ref | smooth->straight, width-changed | 58/4/1/6+0+0/0:0/0/420x512 | 65/0/1/6+0+0/0:0/0/408x505 |  |
| roc-threshold-curve | ref | smooth->straight, width-changed | 74/3/0/6+3+0/0:0/0/420x574 | 68/0/0/6+3+0/0:0/0/408x491 |  |
| svm-hinge-loss | ref | smooth->straight, width-changed | 65/3/0/5+0+0/0:0/0/420x546 | 67/0/0/5+0+0/0:0/0/408x491 |  |
| acf-pacf-stems | ref | width-changed | 73/0/0/8+0+0/0:0/0/420x524 | 82/0/0/8+0+0/0:0/0/408x469 |  |
| bayes-additive-log-scores | ref | width-changed | 42/0/0/1+1+1/0:0/0/420x411 | 47/0/0/1+1+1/0:0/0/408x423 |  |
| bayes-class-token-counts | ref | width-changed | 182/0/0/0+0+0/0:0/0/707x276 | 182/0/0/0+0+0/0:0/0/747x276 |  |
| bias-variance-decomposition | ref | width-changed | 53/0/0/1+1+1/0:0/0/420x507 | 57/0/0/1+1+1/0:0/0/408x473 |  |
| boosting-signed-corrections | ref | width-changed | 50/0/0/1+1+1/0:0/0/420x489 | 58/0/0/1+1+1/0:0/0/408x524 |  |
| class-imbalance-resampling | ref | elements>30% | 80/0/0/0+0+0/0:0/0/408x545 | 110/0/0/0+0+0/0:0/0/408x565 |  |
| class-weighted-loss | ref | width-changed | 39/0/0/1+1+0/0:0/0/420x351 | 41/0/0/1+1+0/0:0/0/408x335 |  |
| cosine-vector-directions | ref | width-changed | 74/0/0/2+0+0/0:0/0/420x590 | 68/0/0/2+0+0/0:0/0/408x491 |  |
| d2l-attention-bandwidth-changes-fit | illus | smooth->straight | 95/12/0/6+5+5/0:0/0/408x505 | 77/0/0/6+5+5/0:0/0/408x538 |  |
| d2l-attention-bandwidth-changes-fit-brief | illus | smooth->straight | 94/12/0/6+5+5/0:0/0/408x483 | 76/0/0/6+5+5/0:0/0/408x516 |  |
| d2l-attention-bandwidth-changes-fit-detailed | illus | smooth->straight | 164/12/0/6+5+5/0:0/0/408x488 | 146/0/0/6+5+5/0:0/0/408x521 |  |
| d2l-attention-pooling-local-prediction | illus | smooth->straight | 91/6/0/6+5+3/0:0/0/408x505 | 73/0/0/6+5+3/0:0/0/408x538 |  |
| d2l-attention-pooling-local-prediction-brief | illus | smooth->straight | 90/6/0/6+5+3/0:0/0/408x483 | 72/0/0/6+5+3/0:0/0/408x516 |  |
| d2l-attention-pooling-local-prediction-detailed | illus | smooth->straight | 168/6/0/6+5+3/0:0/0/408x505 | 150/0/0/6+5+3/0:0/0/408x538 |  |
| d2l-cnn-loss-and-accuracy | illus | smooth->straight | 88/20/0/7+7+0/0:0/0/408x440 | 69/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-cnn-loss-and-accuracy-brief | illus | smooth->straight | 88/20/0/7+7+0/0:0/0/408x440 | 69/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-cnn-loss-and-accuracy-detail | illus | smooth->straight | 63/10/0/7+0+0/0:0/0/408x414 | 67/0/0/7+0+0/0:0/0/408x469 |  |
| d2l-cnn-loss-and-accuracy-detailed | illus | smooth->straight | 88/20/0/7+7+0/0:0/0/408x440 | 69/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-cnn-loss-and-accuracy-detailed-detail | illus | smooth->straight | 63/10/0/7+0+0/0:0/0/408x414 | 67/0/0/7+0+0/0:0/0/408x469 |  |
| d2l-forecast-damping-by-horizon | illus | smooth->straight | 115/30/0/7+7+7/0:0/0/408x505 | 91/0/0/7+7+7/0:0/0/408x538 |  |
| d2l-forecast-damping-by-horizon-brief | illus | smooth->straight | 114/30/0/7+7+7/0:0/0/408x483 | 90/0/0/7+7+7/0:0/0/408x516 |  |
| d2l-forecast-damping-by-horizon-detailed | illus | smooth->straight | 146/30/0/7+7+7/0:0/0/408x488 | 122/0/0/7+7+7/0:0/0/408x521 |  |
| d2l-forecast-feedback-error | illus | smooth->straight | 113/30/0/7+7+7/0:0/0/408x466 | 89/0/0/7+7+7/0:0/0/408x499 |  |
| d2l-forecast-feedback-error-brief | illus | smooth->straight | 113/30/0/7+7+7/0:0/0/408x466 | 89/0/0/7+7+7/0:0/0/408x499 |  |
| d2l-forecast-feedback-error-detailed | illus | smooth->straight | 113/30/0/7+7+7/0:0/0/408x466 | 89/0/0/7+7+7/0:0/0/408x499 |  |
| d2l-forecast-one-step-refresh | illus | smooth->straight | 92/20/0/7+7+0/0:0/0/408x440 | 72/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-forecast-one-step-refresh-brief | illus | smooth->straight | 92/20/0/7+7+0/0:0/0/408x440 | 72/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-forecast-one-step-refresh-detailed | illus | smooth->straight | 152/20/0/7+7+0/0:0/0/408x440 | 132/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-gradient-descent-rate-regimes | illus | width-changed | 92/0/0/10+4+4/0:0/0/420x584 | 88/0/0/10+4+4/0:0/0/408x499 |  |
| d2l-gradient-descent-rate-regimes-brief | illus | width-changed | 93/0/0/10+4+4/0:0/0/420x606 | 89/0/0/10+4+4/0:0/0/408x521 |  |
| d2l-gradient-descent-rate-regimes-detailed | illus | width-changed | 128/0/0/10+4+4/0:0/0/420x584 | 124/0/0/10+4+4/0:0/0/408x499 |  |
| d2l-lag-regression-training-loss | illus | smooth->straight | 94/20/0/7+7+0/0:0/0/408x479 | 74/0/0/7+7+0/0:0/0/408x508 |  |
| d2l-lag-regression-training-loss-brief | illus | smooth->straight | 93/20/0/7+7+0/0:0/0/408x457 | 73/0/0/7+7+0/0:0/0/408x486 |  |
| d2l-lag-regression-training-loss-detailed | illus | smooth->straight | 94/20/0/7+7+0/0:0/0/408x479 | 74/0/0/7+7+0/0:0/0/408x508 |  |
| d2l-momentum-gradient-memory | illus | width-changed | 90/0/0/6+6+6/0:0/0/420x573 | 86/0/0/6+6+6/0:0/0/408x486 |  |
| d2l-momentum-gradient-memory-brief | illus | width-changed | 90/0/0/6+6+6/0:0/0/420x573 | 86/0/0/6+6+6/0:0/0/408x486 |  |
| d2l-momentum-gradient-memory-detailed | illus | width-changed | 120/0/0/6+6+6/0:0/0/420x573 | 116/0/0/6+6+6/0:0/0/408x486 |  |
| d2l-momentum-in-narrow-valley | illus | width-changed | 71/0/0/5+7+0/0:0/0/420x587 | 66/0/0/5+7+0/0:0/0/408x486 |  |
| d2l-momentum-in-narrow-valley-brief | illus | width-changed | 72/0/0/5+7+0/0:0/0/420x609 | 67/0/0/5+7+0/0:0/0/408x508 |  |
| d2l-momentum-in-narrow-valley-detailed | illus | width-changed | 200/0/0/5+7+0/0:0/0/420x570 | 195/0/0/5+7+0/0:0/0/408x469 |  |
| d2l-rectifier-activation-shape | illus | width-changed | 52/0/0/4+0+0/0:0/0/420x500 | 54/0/0/4+0+0/0:0/0/408x469 |  |
| d2l-rectifier-activation-shape-brief | illus | width-changed | 52/0/0/4+0+0/0:0/0/420x500 | 54/0/0/4+0+0/0:0/0/408x469 |  |
| d2l-rectifier-activation-shape-detailed | illus | width-changed | 81/0/0/4+0+0/0:0/0/420x500 | 83/0/0/4+0+0/0:0/0/408x469 |  |
| d2l-rectifier-local-gradient | illus | width-changed | 60/0/0/3+3+0/0:0/0/420x545 | 56/0/0/3+3+0/0:0/0/408x486 |  |
| d2l-rectifier-local-gradient-brief | illus | width-changed | 60/0/0/3+3+0/0:0/0/420x545 | 56/0/0/3+3+0/0:0/0/408x486 |  |
| d2l-rectifier-local-gradient-detailed | illus | width-changed | 103/0/0/3+3+0/0:0/0/420x528 | 99/0/0/3+3+0/0:0/0/408x469 |  |
| d2l-sgd-noise-and-decay | illus | width-changed | 87/0/0/6+6+6/0:0/0/420x578 | 84/0/0/6+6+6/0:0/0/408x521 |  |
| d2l-sgd-noise-and-decay-brief | illus | width-changed | 86/0/0/6+6+6/0:0/0/420x556 | 83/0/0/6+6+6/0:0/0/408x499 |  |
| d2l-sgd-noise-and-decay-detailed | illus | width-changed | 150/0/0/6+6+6/0:0/0/420x595 | 147/0/0/6+6+6/0:0/0/408x538 |  |
| d2l-transformer-position-signal-frequency | illus | smooth->straight | 84/20/0/7+7+0/0:0/0/408x440 | 72/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-brief | illus | smooth->straight | 84/20/0/7+7+0/0:0/0/408x440 | 72/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-brief-detail | illus | smooth->straight | 84/20/0/7+7+0/0:0/0/408x440 | 72/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-detail | illus | smooth->straight | 84/20/0/7+7+0/0:0/0/408x440 | 72/0/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-detailed | illus | smooth->straight | 113/20/0/7+7+0/0:0/0/408x423 | 101/0/0/7+7+0/0:0/0/408x452 |  |
| d2l-transformer-position-signal-frequency-detailed-detail | illus | smooth->straight | 112/20/0/7+7+0/0:0/0/408x440 | 100/0/0/7+7+0/0:0/0/408x469 |  |
| dbscan-density-neighbourhoods | ref | width-changed | 76/0/0/5+2+0/0:0/0/420x612 | 68/0/0/5+2+0/0:0/0/408x469 |  |
| distance-concentration | ref | width-changed | 50/0/0/1+1+0/0:0/0/420x423 | 51/0/0/1+1+0/0:0/0/408x407 |  |
| ensemble-votes | ref | width-changed | 47/0/0/1+1+0/0:0/0/420x423 | 48/0/0/1+1+0/0:0/0/408x407 |  |
| feature-selection-stability | ref | width-changed | 47/0/0/1+1+0/0:0/0/420x423 | 48/0/0/1+1+0/0:0/0/408x407 |  |
| figure-gallery-depth-attention | illus | width-changed | 117/0/0/0+0+0/0:0/0/685x579 | 123/0/0/0+0+0/0:0/0/721x647 |  |
| figure-gallery-depth-attention-brief | illus | width-changed | 117/0/0/0+0+0/0:0/0/661x571 | 123/0/0/0+0+0/0:0/0/697x639 |  |
| figure-gallery-depth-attention-detailed | illus | width-changed | 117/0/0/0+0+0/0:0/0/685x579 | 123/0/0/0+0+0/0:0/0/721x647 |  |
| figure-gallery-latent-query-and-kv | illus | width-changed | 56/0/0/0+0+0/0:0/0/439x337 | 54/0/0/0+0+0/0:0/0/580x333 |  |
| figure-gallery-latent-query-and-kv-detailed | illus | width-changed | 88/0/0/0+0+0/0:0/0/439x337 | 86/0/0/0+0+0/0:0/0/580x333 |  |
| figure-gallery-low-rank-adapter | illus | width-changed | 79/0/0/0+0+0/0:0/0/408x527 | 80/0/0/0+0+0/0:0/0/431x693 |  |
| figure-gallery-low-rank-adapter-brief | illus | width-changed | 62/0/0/0+0+0/0:0/0/408x517 | 62/0/0/0+0+0/0:0/0/431x671 |  |
| figure-gallery-low-rank-adapter-detailed | illus | width-changed | 158/0/0/0+0+0/0:0/0/408x532 | 161/0/0/0+0+0/0:0/0/431x710 |  |
| figure-grouped-query-heads | illus | width-changed | 73/0/0/0+0+0/0:0/0/506x417 | 67/0/0/0+0+0/0:0/0/802x450 |  |
| figure-grouped-query-heads-brief | illus | width-changed | 66/0/0/0+0+0/0:0/0/506x365 | 61/0/0/0+0+0/0:0/0/802x418 |  |
| figure-grouped-query-heads-detailed | illus | width-changed | 133/0/0/0+0+0/0:0/0/506x417 | 125/0/0/0+0+0/0:0/0/802x450 |  |
| figure-latent-expert-widths | illus | width-changed | 83/0/0/0+0+0/0:0/0/408x726 | 83/0/0/0+0+0/0:0/0/431x942 |  |
| figure-latent-expert-widths-brief | illus | width-changed | 83/0/0/0+0+0/0:0/0/408x726 | 83/0/0/0+0+0/0:0/0/431x942 |  |
| figure-latent-expert-widths-detailed | illus | width-changed | 81/0/0/0+0+0/0:0/0/408x702 | 81/0/0/0+0+0/0:0/0/431x910 |  |
| figure-modality-frontends-text-decoder | illus | width-changed | 65/0/0/0+0+0/0:0/0/408x586 | 68/0/0/0+0+0/0:0/0/431x774 |  |
| figure-modality-frontends-text-decoder-brief | illus | width-changed | 64/0/0/0+0+0/0:0/0/408x568 | 67/0/0/0+0+0/0:0/0/431x758 |  |
| figure-modality-frontends-text-decoder-detailed | illus | width-changed | 87/0/0/0+0+0/0:0/0/408x586 | 90/0/0/0+0+0/0:0/0/431x774 |  |
| figure-parallel-residual-sublayers | illus | width-changed | 78/0/0/0+0+0/0:0/0/408x592 | 79/0/0/0+0+0/0:0/0/431x744 |  |
| figure-parallel-residual-sublayers-brief | illus | width-changed | 77/0/0/0+0+0/0:0/0/408x592 | 78/0/0/0+0+0/0:0/0/431x744 |  |
| figure-parallel-residual-sublayers-detailed | illus | width-changed | 131/0/0/0+0+0/0:0/0/408x592 | 132/0/0/0+0+0/0:0/0/431x744 |  |
| figure-partial-rotary-head-width | illus | width-changed | 72/0/0/0+0+0/0:0/0/408x359 | 71/0/0/0+0+0/0:0/0/440x360 |  |
| figure-partial-rotary-head-width-detailed | illus | width-changed | 137/0/0/0+0+0/0:0/0/408x359 | 137/0/0/0+0+0/0:0/0/440x377 |  |
| figure-recurrent-channel-decay | illus | text-overflow | 202/0/0/0+0+0/0:0/1/491x281 | 202/0/0/0+0+0/0:0/2/491x285 | canvas:(0.62,-0.06) (109); canvas:(0.16,1.42) (99) |
| figure-recurrent-channel-decay-detailed | illus | text-overflow | 329/0/0/0+0+0/0:0/1/491x281 | 329/0/0/0+0+0/0:0/2/491x285 | canvas:(0.62,-0.06) (109); canvas:(0.16,1.42) (99) |
| figure-retro-encoded-neighbor-rows-detailed | illus | width-changed | 63/0/0/0+0+0/0:0/0/564x355 | 62/0/0/0+0+0/0:0/0/588x352 |  |
| flow-converging-arrivals | illus | width-changed | 110/0/4/0+0+0/0:0/0/408x628 | 104/0/4/0+0+0/0:0/0/1008x620 |  |
| general-figure-4 | ref | badges-without-key (same before) | 67/0/0/4+0+0/8:8/0/408x425 | 67/0/0/4+0+0/8:8/0/408x429 |  |
| general-figure-5 | ref | badges-without-key (same before) | 56/0/0/2+0+0/6:6/0/408x448 | 56/0/0/2+0+0/6:6/0/408x451 |  |
| general-figure-6 | ref | badges-without-key (same before) | 64/0/0/4+0+0/8:8/0/408x392 | 64/0/0/4+0+0/8:8/0/408x396 |  |
| general-number-line-8 | ref | badges-without-key (same before) | 40/0/0/2+0+0/4:4/0/408x236 | 40/0/0/2+0+0/4:4/0/408x237 |  |
| gmm-elliptical-components | ref | width-changed | 84/0/0/8+0+0/0:0/0/420x648 | 84/0/0/8+0+0/0:0/0/408x491 |  |
| kmeans-centroid-update | ref | width-changed | 75/0/0/6+0+0/0:0/0/420x594 | 72/0/0/6+0+0/0:0/0/408x491 |  |
| knn-l1-l2-distance | ref | width-changed | 65/0/1/2+0+0/0:0/0/420x584 | 58/0/1/2+0+0/0:0/0/408x469 |  |
| knn-neighbourhood | ref | width-changed | 87/0/0/5+4+0/0:0/0/420x618 | 78/0/0/5+4+0/0:0/0/408x469 |  |
| ks-empirical-cdfs | ref | width-changed | 84/0/0/7+7+0/0:0/0/420x570 | 77/0/0/7+7+0/0:0/0/408x495 |  |
| log-feature-scale | ref | width-changed | 52/0/0/5+0+0/0:0/0/420x500 | 58/0/0/5+0+0/0:0/0/408x469 |  |
| ml-acf-vs-pacf | ref | width-changed | 259/0/0/10+0+0/0:0/0/444x1197 | 271/0/0/10+0+0/0:0/0/432x1151 |  |
| ml-architecture-parallel-attention-experts | illus | width-changed | 70/0/0/0+0+0/0:0/0/408x499 | 67/0/0/0+0+0/0:0/0/604x582 |  |
| ml-architecture-parallel-attention-experts-brief | illus | width-changed | 69/0/0/0+0+0/0:0/0/408x477 | 67/0/0/0+0+0/0:0/0/604x582 |  |
| ml-architecture-parallel-attention-experts-detailed | illus | width-changed | 150/0/0/0+0+0/0:0/0/408x500 | 145/0/0/0+0+0/0:0/0/604x583 |  |
| ml-bagging-vote-flow | ref | width-changed | 82/0/0/0+0+0/0:0/0/408x517 | 78/0/0/0+0+0/0:0/0/604x596 |  |
| ml-batch-score-fallback | ref | width-changed | 71/0/2/0+0+0/0:0/0/408x557 | 69/0/2/0+0+0/0:0/0/552x611 |  |
| ml-beam-search | ref | width-changed | 181/0/0/0+0+0/0:0/0/542x368 | 181/0/0/0+0+0/0:0/0/552x371 |  |
| ml-clustering-comparison | ref | width-changed | 136/0/0/9+8+2/0:0/0/444x1210 | 133/0/0/9+8+2/0:0/0/432x1065 |  |
| ml-concept-drift-comparison | ref | width-changed | 196/0/0/8+0+0/0:0/0/444x1109 | 202/0/0/8+0+0/0:0/0/432x1100 |  |
| ml-covariate-drift-comparison | ref | width-changed | 104/0/0/4+4+0/0:0/0/420x528 | 102/0/0/4+4+0/0:0/0/408x495 |  |
| ml-feature-scaling-transformation | ref | width-changed | 317/0/0/8+0+0/0:0/0/444x1378 | 285/0/0/8+0+0/0:0/0/432x1225 |  |
| ml-gpt2-fused-qkv-slices | illus | width-changed | 87/0/0/0+0+0/0:0/0/776x267 | 86/0/0/0+0+0/0:0/0/884x264 |  |
| ml-gpt2-fused-qkv-slices-detailed | illus | width-changed | 120/0/0/0+0+0/0:0/0/776x284 | 116/0/0/0+0+0/0:0/0/884x264 |  |
| ml-gpt2-learned-position-lookup | illus | width-changed | 70/0/0/0+0+0/0:0/0/616x266 | 69/0/0/0+0+0/0:0/0/700x264 |  |
| ml-gpt2-learned-position-lookup-detailed | illus | width-changed | 139/0/0/0+0+0/0:0/0/616x266 | 139/0/0/0+0+0/0:0/0/700x281 |  |
| ml-gpt2-tied-output-weights-detailed-detail | illus | badges-without-key (same before) | 58/0/0/4+0+0/2:2/0/408x330 | 58/0/0/4+0+0/2:2/0/408x332 |  |
| ml-gpu-matmul | ref | width-changed | 483/0/0/0+0+0/0:0/0/506x597 | 463/0/0/0+0+0/0:0/0/802x639 |  |
| ml-label-prior-drift-comparison | ref | width-changed | 39/0/0/1+1+0/0:0/0/420x368 | 41/0/0/1+1+0/0:0/0/408x352 |  |
| ml-learning-taxonomy | ref | width-changed | 57/0/0/0+0+0/0:0/0/626x299 | 57/0/0/0+0+0/0:0/0/641x303 |  |
| ml-linear-regression-cost-bowl | ref | width-changed | 60/4/0/7+0+0/0:0/0/420x524 | 65/4/0/7+0+0/0:0/0/408x469 |  |
| ml-linear-regression-first-gradient-step | ref | width-changed | 119/0/0/4+0+0/0:0/0/420x596 | 86/0/0/4+0+0/0:0/0/408x495 |  |
| ml-linear-regression-rate-comparison | ref | width-changed | 158/0/0/3+3+0/0:0/0/420x600 | 116/0/0/3+3+0/0:0/0/408x469 |  |
| ml-linear-regression-residual-cost | ref | width-changed | 65/0/0/6+3+0/0:0/0/420x528 | 63/0/0/6+3+0/0:0/0/408x499 |  |
| ml-logistic-decision-boundary | ref | width-changed | 199/0/0/4+3+6/0:0/0/420x615 | 173/0/0/4+3+6/0:0/0/408x546 |  |
| ml-logistic-regression-accuracy-trap | ref | width-changed | 39/0/0/3+1+0/0:0/0/420x329 | 41/0/0/3+1+0/0:0/0/408x313 |  |
| ml-logistic-regression-linear-separator | ref | width-changed | 96/0/0/4+4+3/0:0/0/420x578 | 93/0/0/4+4+3/0:0/0/408x547 |  |
| ml-logistic-regression-linear-unbounded | ref | width-changed | 90/0/0/11+3+0/0:0/0/420x576 | 83/0/0/11+3+0/0:0/0/408x469 |  |
| ml-logistic-regression-log-loss | ref | width-changed | 107/8/0/6+6+0/0:0/0/420x528 | 103/8/0/6+6+0/0:0/0/408x469 |  |
| ml-logistic-regression-outlier-leverage | ref | width-changed | 88/0/0/15+3+3/0:0/0/420x584 | 87/0/0/15+3+3/0:0/0/408x499 |  |
| ml-parallel-trial-pruning | ref | width-changed | 83/0/0/0+0+0/0:0/0/408x536 | 79/0/0/0+0+0/0:0/0/604x622 |  |
| ml-stable-diffusion-clip-two-encoders | illus | width-changed | 52/0/0/0+0+0/0:0/0/543x284 | 53/0/0/0+0+0/0:0/0/570x300 |  |
| ml-stable-diffusion-clip-two-encoders-brief | illus | width-changed | 44/0/0/0+0+0/0:0/0/540x284 | 45/0/0/0+0+0/0:0/0/564x300 |  |
| ml-stable-diffusion-clip-two-encoders-detailed | illus | width-changed | 74/0/0/0+0+0/0:0/0/543x301 | 73/0/0/0+0+0/0:0/0/570x300 |  |
| ml-transformer-parallel-attention-heads-brief-detail | illus | width-changed | 74/0/0/0+0+0/0:0/0/752x249 | 74/0/0/0+0+0/0:0/0/848x264 |  |
| ml-transformer-parallel-attention-heads-detail | illus | width-changed | 74/0/0/0+0+0/0:0/0/752x249 | 74/0/0/0+0+0/0:0/0/848x264 |  |
| ml-transformer-parallel-attention-heads-detailed-detail | illus | width-changed | 164/0/0/0+0+0/0:0/0/752x249 | 164/0/0/0+0+0/0:0/0/848x264 |  |
| ml-transformer-qkv-projections | illus | width-changed | 79/0/0/0+0+0/0:0/0/686x282 | 79/0/0/0+0+0/0:0/0/770x297 |  |
| ml-transformer-qkv-projections-brief | illus | width-changed | 60/0/0/0+0+0/0:0/0/485x300 | 60/0/0/0+0+0/0:0/0/554x316 |  |
| ml-transformer-qkv-projections-detailed | illus | width-changed | 213/0/0/0+0+0/0:0/0/686x282 | 213/0/0/0+0+0/0:0/0/770x297 |  |
| ml-transformer-residual-arithmetic | illus | width-changed | 86/0/0/0+0+0/0:0/0/1028x249 | 86/0/0/0+0+0/0:0/0/1164x264 |  |
| ml-transformer-residual-arithmetic-brief | illus | width-changed | 86/0/0/0+0+0/0:0/0/1028x249 | 86/0/0/0+0+0/0:0/0/1164x264 |  |
| ml-transformer-residual-arithmetic-detailed | illus | width-changed | 140/0/0/0+0+0/0:0/0/1028x249 | 140/0/0/0+0+0/0:0/0/1164x264 |  |
| ml-transformer-token-embeddings | illus | width-changed | 74/0/0/0+0+0/0:0/0/822x196 | 74/0/0/0+0+0/0:0/0/942x208 |  |
| ml-transformer-token-embeddings-brief | illus | width-changed | 74/0/0/0+0+0/0:0/0/822x196 | 74/0/0/0+0+0/0:0/0/942x208 |  |
| ml-transformer-token-embeddings-detailed | illus | width-changed | 138/0/0/0+0+0/0:0/0/822x196 | 138/0/0/0+0+0/0:0/0/942x208 |  |
| ml-transformer-vocabulary-softmax-brief | illus | width-changed | 68/0/0/0+0+0/0:0/0/548x196 | 68/0/0/0+0+0/0:0/0/590x208 |  |
| ml-transformer-vocabulary-softmax-detail | illus | width-changed | 68/0/0/0+0+0/0:0/0/720x196 | 68/0/0/0+0+0/0:0/0/762x208 |  |
| ml-transformer-vocabulary-softmax-detailed-detail | illus | width-changed | 194/0/0/0+0+0/0:0/0/720x196 | 194/0/0/0+0+0/0:0/0/762x208 |  |
| ml-transformer-weighted-values | illus | width-changed | 85/0/0/0+0+0/0:0/0/786x183 | 84/0/0/0+0+0/0:0/0/874x177 |  |
| ml-transformer-weighted-values-brief | illus | width-changed | 85/0/0/0+0+0/0:0/0/786x183 | 84/0/0/0+0+0/0:0/0/874x177 |  |
| ml-transformer-weighted-values-detailed | illus | width-changed | 85/0/0/0+0+0/0:0/0/786x183 | 84/0/0/0+0+0/0:0/0/874x177 |  |
| ml-trees-bootstrap-roots | illus | elements>30% | 109/0/0/0+0+0/0:0/0/408x716 | 153/0/0/0+0+0/0:0/0/408x746 |  |
| ml-trees-bootstrap-roots-brief | illus | elements>30% | 101/0/0/0+0+0/0:0/0/408x680 | 137/0/0/0+0+0/0:0/0/408x695 |  |
| ml-trees-bootstrap-roots-detailed | illus | elements>30% | 116/0/0/0+0+0/0:0/0/408x802 | 160/0/0/0+0+0/0:0/0/408x838 |  |
| ml-trees-candidate-split | illus | width-changed | 74/0/0/6+4+0/0:0/0/420x569 | 70/0/0/6+4+0/0:0/0/408x486 |  |
| ml-trees-candidate-split-brief | illus | width-changed | 65/0/0/4+2+0/0:0/0/420x552 | 61/0/0/4+2+0/0:0/0/408x469 |  |
| ml-trees-candidate-split-detailed | illus | width-changed | 79/0/0/6+4+0/0:0/0/420x576 | 69/0/0/6+4+0/0:0/0/408x469 |  |
| ml-trees-cost-complexity-pruning | illus | width-changed | 81/0/0/6+6+0/0:0/0/420x552 | 74/0/0/6+6+0/0:0/0/457x495 |  |
| ml-trees-cost-complexity-pruning-brief | illus | width-changed | 81/0/0/6+6+0/0:0/0/420x552 | 73/0/0/6+6+0/0:0/0/457x478 |  |
| ml-trees-cost-complexity-pruning-detailed | illus | width-changed | 81/0/0/6+6+0/0:0/0/420x552 | 74/0/0/6+6+0/0:0/0/457x495 |  |
| ml-trees-decision-regions | illus | width-changed | 87/0/0/6+4+0/0:0/0/420x600 | 80/0/0/6+4+0/0:0/0/408x486 |  |
| ml-trees-decision-regions-brief | illus | width-changed | 79/0/0/4+2+0/0:0/0/420x600 | 71/0/0/4+2+0/0:0/0/408x469 |  |
| ml-trees-decision-regions-detailed | illus | width-changed | 98/0/0/6+4+2/0:0/0/420x652 | 85/0/0/6+4+2/0:0/0/408x469 |  |
| ml-trees-feature-importance | illus | width-changed | 47/0/0/1+1+0/0:0/0/420x418 | 48/0/0/1+1+0/0:0/0/408x402 |  |
| ml-trees-feature-importance-brief | illus | width-changed | 47/0/0/1+1+0/0:0/0/420x418 | 48/0/0/1+1+0/0:0/0/408x402 |  |
| ml-trees-feature-importance-detailed | illus | width-changed | 47/0/0/1+1+0/0:0/0/420x418 | 48/0/0/1+1+0/0:0/0/408x432 |  |
| ml-trees-majority-vote | illus | width-changed | 111/0/0/0+0+0/0:0/0/408x631 | 105/0/0/0+0+0/0:0/0/604x746 |  |
| ml-trees-majority-vote-detailed | illus | width-changed | 107/0/0/0+0+0/0:0/0/408x596 | 104/0/0/0+0+0/0:0/0/604x729 |  |
| ml-trees-regression-step-fit | illus | width-changed | 107/24/0/3+6+18/0:0/0/420x556 | 99/24/0/1+6+18/0:0/0/408x469 |  |
| ml-trees-regression-step-fit-brief | illus | width-changed | 106/24/0/3+6+18/0:0/0/420x539 | 98/24/0/1+6+18/0:0/0/408x452 |  |
| ml-trees-regression-step-fit-detailed | illus | width-changed | 106/24/0/3+6+18/0:0/0/420x539 | 98/24/0/1+6+18/0:0/0/408x452 |  |
| ml-trees-threshold-search | illus | width-changed | 64/0/0/5+0+0/0:0/0/420x524 | 64/0/0/5+0+0/0:0/0/408x469 |  |
| ml-trees-threshold-search-brief | illus | width-changed | 64/0/0/5+0+0/0:0/0/420x524 | 64/0/0/5+0+0/0:0/0/408x469 |  |
| ml-trees-threshold-search-detailed | illus | width-changed | 64/0/0/5+0+0/0:0/0/420x524 | 64/0/0/5+0+0/0:0/0/408x469 |  |
| ml-what-is-machine-learning-class-centroids | ref | width-changed | 129/0/0/7+5+0/0:0/0/420x559 | 122/0/0/7+5+0/0:0/0/408x478 |  |
| ml-what-is-machine-learning-fit-quality | ref | width-changed | 89/6/0/7+4+6/0:0/0/420x601 | 86/2/0/7+4+6/0:0/0/408x516 |  |
| ml-what-is-machine-learning-hidden-groups | ref | width-changed | 77/0/0/9+0+0/0:0/0/420x548 | 86/0/0/9+0+0/0:0/0/408x469 |  |
| ml-what-is-machine-learning-learning-families | ref | width-changed | 82/0/0/0+0+0/0:0/0/910x331 | 82/0/0/0+0+0/0:0/0/940x336 |  |
| ml-what-is-machine-learning-model-choice | ref | width-changed | 90/0/3/0+0+0/0:0/0/408x596 | 87/0/3/0+0+0/0:0/0/489x630 |  |
| ml-what-is-machine-learning-nearest-centroid-predict | ref | width-changed | 129/0/0/6+5+2/0:0/0/420x612 | 127/0/0/6+5+2/0:0/0/408x525 |  |
| ml-what-is-machine-learning-output-types | ref | width-changed | 85/0/0/8+5+3/0:0/0/420x601 | 82/0/0/8+5+3/0:0/0/408x542 |  |
| ml-word2vec-centre-and-context-tables | illus | width-changed | 168/0/0/0+0+0/0:0/0/608x276 | 168/0/0/0+0+0/0:0/0/644x276 |  |
| ml-word2vec-centre-and-context-tables-detailed | illus | width-changed | 225/0/0/0+0+0/0:0/0/608x276 | 225/0/0/0+0+0/0:0/0/644x276 |  |
| ml-word2vec-profile-directions | illus | width-changed | 79/0/0/2+0+0/0:0/0/420x572 | 72/0/0/2+0+0/0:0/0/408x469 |  |
| ml-word2vec-profile-directions-brief | illus | width-changed | 79/0/0/2+0+0/0:0/0/420x572 | 73/0/0/2+0+0/0:0/0/408x491 |  |
| ml-word2vec-profile-directions-detailed | illus | width-changed | 108/0/0/2+0+0/0:0/0/420x589 | 101/0/0/2+0+0/0:0/0/408x486 |  |
| ml-word2vec-trait-rescale | illus | badges-without-key (same before) | 38/0/0/0+0+0/4:4/0/408x255 | 38/0/0/0+0+0/4:4/0/408x255 |  |
| ml-word2vec-trait-rescale-brief | illus | badges-without-key (same before) | 37/0/0/0+0+0/4:4/0/408x233 | 37/0/0/0+0+0/4:4/0/408x233 |  |
| ml-word2vec-trait-rescale-detailed | illus | badges-without-key (same before) | 65/0/0/0+0+0/4:4/0/408x255 | 65/0/0/0+0+0/4:4/0/408x255 |  |
| ml-word2vec-word-lookup | illus | width-changed | 55/0/0/0+0+0/0:0/0/512x266 | 55/0/0/0+0+0/0:0/0/560x281 |  |
| ml-word2vec-word-lookup-brief | illus | width-changed | 43/0/0/0+0+0/0:0/0/408x266 | 43/0/0/0+0+0/0:0/0/482x281 |  |
| ml-word2vec-word-lookup-detailed | illus | width-changed | 90/0/0/0+0+0/0:0/0/512x266 | 88/0/0/0+0+0/0:0/0/560x264 |  |
| nearest-centroid-boundary | ref | width-changed | 80/0/0/6+4+0/0:0/0/420x600 | 72/0/0/6+4+0/0:0/0/408x469 |  |
| nonlinear-dependence | ref | width-changed | 58/0/0/6+0+0/0:0/0/420x522 | 65/0/0/6+0+0/0:0/0/408x491 |  |
| permutation-feature-importance | ref | width-changed | 47/0/0/1+1+0/0:0/0/420x423 | 49/0/0/1+1+0/0:0/0/408x407 |  |
| regression-mean-baseline | ref | width-changed | 61/0/0/6+0+0/0:0/0/420x524 | 66/0/0/6+0+0/0:0/0/408x469 |  |
| regression-residuals | ref | width-changed | 84/0/0/3+4+0/0:0/0/420x622 | 75/0/0/3+4+0/0:0/0/408x491 |  |
| regression-tree-steps | ref | width-changed | 69/0/0/5+0+0/0:0/0/420x570 | 69/0/0/5+0+0/0:0/0/408x491 |  |
| regularization-l1-l2-geometry | ref | width-changed | 71/0/1/3+0+0/0:0/0/420x590 | 63/0/1/3+0+0/0:0/0/408x469 |  |
| search-grid-and-random | ref | width-changed | 81/0/0/10+7+0/0:0/0/420x550 | 79/0/0/10+7+0/0:0/0/408x491 |  |
| shape-figure | shape | badges-without-key (same before) | 37/0/0/2+0+0/4:4/0/408x293 | 37/0/0/2+0+0/4:4/0/408x295 |  |
| shape-number-line | shape | badges-without-key (same before) | 45/0/0/2+0+0/2:2/0/408x209 | 45/0/0/2+0+0/2:2/0/408x210 |  |
| smote-interpolation | ref | width-changed | 64/0/0/4+0+0/0:0/0/420x570 | 61/0/0/4+0+0/0:0/0/408x491 |  |
| softmax-probabilities | ref | width-changed | 46/0/0/1+1+0/0:0/0/420x401 | 47/0/0/1+1+0/0:0/0/408x385 |  |
| svm-margin-support-slack | ref | width-changed | 106/0/0/6+4+0/0:0/0/420x694 | 92/0/0/6+4+0/0:0/0/408x491 |  |
| svr-epsilon-tube | ref | width-changed | 101/0/1/3+4+0/0:0/0/420x574 | 96/0/1/3+4+0/0:0/0/408x521 |  |
| tree-class-mixtures | ref | elements>30% | 80/0/0/0+0+0/0:0/0/408x530 | 110/0/0/0+0+0/0:0/0/408x552 |  |
| tree-folder-hierarchy | ref | width-changed | 40/0/0/0+0+0/0:0/0/423x225 | 40/0/0/0+0+0/0:0/0/428x228 |  |
| tree-impurity-mixtures | ref | width-changed | 41/0/0/2+1+0/0:0/0/420x420 | 47/0/0/2+1+0/0:0/0/408x449 |  |
| zscore-anomaly-band | ref | width-changed | 69/0/0/8+0+0/0:0/0/420x546 | 78/0/0/8+0+0/0:0/0/408x491 |  |

## Reading the flags (measured causes)
- smooth->straight (142 ids: 39 reference ids, 102 illustration ids, 1 shape): the plot default changed. Before, `ml-plot-layouts.js` l.189: `const smooth = series.smooth !== false` (smooth unless the author says no). After, l.275-276: `const smooth = series.smooth ?? series.points.length >= 20` (straight unless dense or asked). Nothing went the other way (straight->smooth: 0). This is the sprint plot-lines default (comment at l.275), which is why the same ids also show markers-changed.
- closed-shapes-changed (1 id): `gradient-descent-contours`: its two loss contours are closed circle-sample series of 16 points. With the new rule (16 < 20, no `smooth` set) they are drawn as straight 16-sided polygons (closed paths of L segments) instead of smooth closed curves (0 closed line paths before, 2 after). The same default as above; a closed series is not exempted.
- markers-changed (61 ids): 58 have MORE small markers after (circles, squares and diamonds drawn on every point of short series: the sprint marker rule), 3 have fewer; none drops to or rises from 0.
- width-changed (286 ids): 201 are 420 -> 408 (the plot minimum width, commit 4269465a4) and 13 are 444 -> 432. 214 ids are narrower, 72 wider; the largest growth is `flow-converging-arrivals` 408 -> 1008 (the FLOW-W case: one-line decision diamonds), `figure-grouped-query-heads` (+ brief, detailed) and `ml-gpu-matmul` 506 -> 802, `ml-architecture-parallel-attention-experts` (+ brief, detailed) 408 -> 604. These growths come from the 180 px flow node minimum and the 36 px tensor cells.
- text-overflow (2 ids): `figure-recurrent-channel-decay` and its detailed variant: two point labels such as `(0.62,-0.06)` run past the figure edge (1 such label existed before in each). No node-box overflow was found with the estimate; plot tick labels and rotated axis titles are excluded.
- badges-without-key: 0 new. 10 ids have numbered badges with no line starting "N. " in both renders (identical before and after: `general-figure-4/5/6`, `general-number-line-8`, `shape-figure`, `shape-number-line`, `ml-word2vec-trait-rescale` (+ brief, detailed), `ml-gpt2-tied-output-weights-detailed-detail`); in these the key is HTML pill text without the number prefix, so this is the detector's limit, not a regression.
- elements>30% (14 ids): 8 gain elements (time-series-components 71 -> 103, class-imbalance-resampling, tree-class-mixtures, ml-trees-bootstrap-roots x3 ...), 6 lose (ml-linear-regression-ridge-shrinkage 190 -> 93, ml-regression-error-metrics 495 -> 335, figure-retro-neighbor-search x3, ml-linear-regression-line-meaning, ml-local-outlier-factor, ml-trees-depth-overfit-detailed).

## Method notes
- Sets and trees: ids = the snapshot ids with a 408 key (1087). Trees: `git archive` of packages/web/src, packages/web/scripts and packages/web/package.json at each commit into C:/s/audit1/old and C:/s/audit1/new, root node_modules by junction. Each tree's own renderer, own primitives.js textWidth. No source changed, no tests run.
- Sheets: 24 PNGs (sheet-01 .. sheet-24), each 3748 px wide and about 4200 px tall, 6 pairs per row, ids in alphabetical order, the id above each pair (with [n] = number of flags when flagged), BEFORE (18cf9fce8) left and AFTER (74c4f68ae) right. Scale: each figure is shrunk to fit a 300 px cell: 0.735 (300/408) for figures up to 408 px wide, 300/width for wider ones. CSS variables (`--viz-*`, `--color-*`) come from each tree's own index.css, scoped on the figure wrapper only (nothing is injected into the page root). Row order and first/last id per sheet: C:/s/audit1/sheets-index.txt (copied below).

```
sheet-01 3748 4177 acf-pacf-stems d2l-attention-pooling-local-prediction-brief
sheet-02 3748 4047 d2l-attention-pooling-local-prediction-detailed d2l-convolution-window-reuse
sheet-03 3748 4209 d2l-convolution-window-reuse-brief d2l-max-pooling-windows
sheet-04 3748 3883 d2l-max-pooling-windows-brief d2l-recurrent-state-handoff-detailed
sheet-05 3748 3958 d2l-recurrent-state-handoff-detailed-detail d2l-transformer-position-signal-frequency-detailed-detail
sheet-06 3748 3921 d2l-translation-train-validation-loss figure-gallery-convolution-layer-schedule
sheet-07 3748 3894 figure-gallery-convolution-layer-schedule-brief figure-gallery-multistream-residual-brief
sheet-08 3748 3776 figure-gallery-multistream-residual-detailed figure-learned-and-identity-shortcut
sheet-09 3748 4107 figure-learned-and-identity-shortcut-brief figure-routed-vs-shared-experts
sheet-10 3748 4186 figure-routed-vs-shared-experts-brief ml-architecture-hybrid-routing
sheet-11 3748 3906 ml-architecture-hybrid-routing-brief ml-bert-frozen-features-detailed-detail
sheet-12 3748 3503 ml-bert-gpt-task-inputs ml-dense-vs-moe-architecture-brief
sheet-13 3748 3919 ml-dense-vs-moe-architecture-detailed ml-gpt2-feedforward-expansion-detailed
sheet-14 3748 3731 ml-gpt2-fused-qkv-slices ml-llama-decoder-block-brief
sheet-15 3748 3280 ml-llama-decoder-block-detailed ml-psi-bin-contributions
sheet-16 3748 4062 ml-rag-retrieval ml-stable-diffusion-forward-noise
sheet-17 3748 4072 ml-stable-diffusion-forward-noise-brief ml-transformer-attention-across-distance-detailed
sheet-18 3748 4114 ml-transformer-attention-softmax ml-transformer-qkv-projections-detailed
sheet-19 3748 3843 ml-transformer-residual-arithmetic ml-trees-feature-subsets
sheet-20 3748 4046 ml-trees-feature-subsets-brief ml-word2vec-context-both-sides-brief
sheet-21 3748 4149 ml-word2vec-context-both-sides-detailed ml-word2vec-vocabulary-versus-pair
sheet-22 3748 3934 ml-word2vec-vocabulary-versus-pair-brief regression-residuals
sheet-23 3748 3807 regression-tree-steps tree-family-hierarchy
sheet-24 3748 1076 tree-folder-hierarchy zscore-anomaly-band
```
