# AUDIT: structural diff, every snapshot id at width 408 (74c4f68ae against 3e37b6106)

Before = 74c4f68ae (left on the sheets), after = 3e37b6106 (right). Ids: the snapshot ids with a 408 key in `svg-snapshots.json` (221 reference, 847 illustration case, 22 kind-gallery shape) = 1090 ids. Rendered with each tree's own `renderTutorDiagram(spec, 408)`; a figure can be wider than 408 when it needs it (the `width-changed` flag; `wider-than-720` must be empty).

## Summary: ids per flag

| flag | ids |
|---|---|
| render-error | 0 |
| only-before | 0 |
| only-after | 3 |
| smooth->straight | 0 |
| straight->smooth | 142 |
| closed-shapes-changed | 1 |
| markers-changed | 52 |
| badges-without-key | 0 |
| badges-without-key (same before) | 10 |
| text-overflow | 2 |
| elements>30% | 22 |
| width-changed | 48 |
| wider-than-720 | 0 |

Ids with at least one flag: 240 of 1090. Ids by number of flags: 0 flags: 850, 1 flags: 200, 2 flags: 40.

Ids wider than 720 px at a 408 request: **0** (the list is empty).

## Flag rules (regex measurement of each tree's SVG string; `audit-render.mjs` + `audit-combine.mjs`)
- smooth->straight / straight->smooth: number of `<path>` elements whose d contains a cubic `C` command, before vs after (0 vs more than 0). Flow wires use `Q` corners and are not counted.
- closed-shapes-changed: count of closed shapes differs: polygons with 4+ points larger than a marker (not arrowheads) plus paths that end in Z or return to their first point using only L segments.
- markers-changed: small circles (r up to 8) + small squares (w = h up to 14) + diamond markers differ by more than 25 percent or one side is 0.
- badges-without-key: after has a numbered badge (a circle r 6-14 followed by a text of 1-2 digits centred on it) whose number has no text line starting "N. " / "N) "; "(same before)" when the before render has exactly as many.
- text-overflow: an ESTIMATE (the renderer's own `textWidth`, which ignores weight): a text wider than its `data-tutor-node` box or than the figure; flagged when the after render has more than the before render. HTML `foreignObject` text is not measured.
- elements>30%: SVG element count differs by more than 30 percent. width-changed: the figure width (rounded) differs. wider-than-720: the after figure is wider than 720 px.

## Per id (sorted by number of flags, then id; only flagged ids; all data in diff.json)

Counts are `elements / C commands / closed shapes / markers+squares+diamonds / badges:without key / overflows / width x height`.

| id | set | flags | before | after | overflow detail (after) |
|---|---|---|---|---|---|
| bayes-class-conditional-densities | ref | straight->smooth, markers-changed | 71/0/0/6+6+0/0:0/0/408x491 | 59/16/0/3+3+0/0:0/0/408x491 |  |
| bayesian-search-surrogate | ref | straight->smooth, markers-changed | 73/0/1/7+4+0/0:0/0/408x535 | 66/4/1/2+4+0/0:0/0/408x535 |  |
| big-o-growth-rates | illus | straight->smooth, markers-changed | 254/0/0/12+6+6/0:0/0/408x486 | 230/36/0/6+3+3/0:0/0/408x486 |  |
| big-o-growth-rates-brief | illus | straight->smooth, markers-changed | 106/0/0/12+6+6/0:0/0/425x499 | 82/36/0/6+3+3/0:0/0/425x499 |  |
| big-o-growth-rates-detailed | illus | straight->smooth, markers-changed | 254/0/0/12+6+6/0:0/0/408x486 | 230/36/0/6+3+3/0:0/0/408x486 |  |
| big-o-growth-rates-detailed-detail | illus | straight->smooth, markers-changed | 344/0/0/18+18+9/0:0/0/408x516 | 284/75/0/6+6+3/0:0/0/408x516 |  |
| contextual-time-anomaly | ref | straight->smooth, markers-changed | 87/0/0/10+9+0/0:0/0/408x491 | 75/7/0/2+9+0/0:0/0/408x491 |  |
| d2l-attention-bandwidth-changes-fit | illus | straight->smooth, markers-changed | 77/0/0/6+5+5/0:0/0/408x538 | 61/6/0/6+1+1/0:0/0/408x538 |  |
| d2l-attention-bandwidth-changes-fit-brief | illus | straight->smooth, markers-changed | 76/0/0/6+5+5/0:0/0/408x516 | 60/6/0/6+1+1/0:0/0/408x516 |  |
| d2l-attention-bandwidth-changes-fit-detailed | illus | straight->smooth, markers-changed | 146/0/0/6+5+5/0:0/0/408x521 | 130/6/0/6+1+1/0:0/0/408x521 |  |
| d2l-attention-pooling-local-prediction | illus | straight->smooth, markers-changed | 73/0/0/6+5+3/0:0/0/408x538 | 61/3/0/6+1+1/0:0/0/408x538 |  |
| d2l-attention-pooling-local-prediction-brief | illus | straight->smooth, markers-changed | 72/0/0/6+5+3/0:0/0/408x516 | 60/3/0/6+1+1/0:0/0/408x516 |  |
| d2l-attention-pooling-local-prediction-detailed | illus | straight->smooth, markers-changed | 150/0/0/6+5+3/0:0/0/408x538 | 138/3/0/6+1+1/0:0/0/408x538 |  |
| d2l-lag-regression-training-examples | illus | straight->smooth, markers-changed | 60/0/0/7+0+0/0:0/0/408x469 | 58/9/0/3+0+0/0:0/0/408x431 |  |
| d2l-lag-regression-training-examples-detailed | illus | straight->smooth, markers-changed | 60/0/0/7+0+0/0:0/0/408x469 | 58/9/0/3+0+0/0:0/0/408x431 |  |
| d2l-newton-convex-curvature-steps | illus | straight->smooth, markers-changed | 69/0/0/6+5+0/0:0/0/408x491 | 65/8/0/2+4+0/0:0/0/408x453 |  |
| d2l-newton-convex-curvature-steps-brief | illus | straight->smooth, markers-changed | 68/0/0/6+5+0/0:0/0/408x469 | 64/8/0/2+4+0/0:0/0/408x431 |  |
| d2l-newton-convex-curvature-steps-detailed | illus | straight->smooth, markers-changed | 123/0/0/6+5+0/0:0/0/408x508 | 119/8/0/2+4+0/0:0/0/408x470 |  |
| d2l-ordered-sequence-readings | illus | straight->smooth, markers-changed | 61/0/0/7+0+0/0:0/0/408x491 | 59/9/0/3+0+0/0:0/0/408x453 |  |
| d2l-ordered-sequence-readings-brief | illus | straight->smooth, markers-changed | 55/0/0/6+0+0/0:0/0/408x469 | 50/9/0/2+0+0/0:0/0/408x431 |  |
| d2l-ordered-sequence-readings-detailed | illus | straight->smooth, markers-changed | 62/0/0/7+0+0/0:0/0/408x508 | 60/9/0/3+0+0/0:0/0/408x470 |  |
| double-descent-curve | ref | straight->smooth, markers-changed | 60/0/0/6+0+0/0:0/0/408x469 | 49/9/0/2+0+0/0:0/0/408x431 |  |
| figure-recurrent-channel-decay | illus | elements>30%, width-changed | 202/0/0/0+0+0/0:0/2/491x285 | 68/0/0/0+0+0/0:0/0/515x263 |  |
| figure-recurrent-channel-decay-detailed | illus | elements>30%, width-changed | 329/0/0/0+0+0/0:0/2/491x285 | 195/0/0/0+0+0/0:0/0/515x263 |  |
| gradient-descent-contours | ref | straight->smooth, closed-shapes-changed | 74/0/2/1+1+0/0:0/0/408x469 | 71/32/0/1+1+0/0:0/0/408x469 |  |
| ml-boosting-correction-transformation | ref | straight->smooth, markers-changed | 237/0/0/8+8+0/0:0/0/432x1190 | 225/4/0/8+2+0/0:0/0/432x1190 |  |
| ml-collective-anomaly-run | ref | straight->smooth, markers-changed | 62/0/0/8+0+0/0:0/0/408x512 | 60/22/0/3+0+0/0:0/0/408x474 |  |
| ml-fit-quality-comparison | ref | straight->smooth, markers-changed | 204/0/0/18+15+0/0:0/0/432x1548 | 180/12/0/18+3+0/0:0/0/432x1548 |  |
| ml-linear-regression-polynomial-overfit | ref | straight->smooth, markers-changed | 85/0/0/8+3+7/0:0/0/408x551 | 69/10/0/8+1+1/0:0/0/408x551 |  |
| ml-mle-bernoulli-likelihood | illus | straight->smooth, markers-changed | 64/0/0/9+0+0/0:0/0/408x512 | 58/10/0/4+0+0/0:0/0/408x474 |  |
| ml-mle-bernoulli-likelihood-brief | illus | straight->smooth, markers-changed | 58/0/0/8+0+0/0:0/0/408x495 | 49/10/0/3+0+0/0:0/0/408x457 |  |
| ml-mle-bernoulli-likelihood-detailed | illus | straight->smooth, markers-changed | 116/0/0/9+0+0/0:0/0/408x512 | 110/10/0/4+0+0/0:0/0/408x474 |  |
| ml-stable-diffusion-conditional-training-rows | illus | elements>30%, width-changed | 160/0/0/0+0+0/0:0/2/412x341 | 73/0/0/0+0+0/0:0/0/432x357 |  |
| ml-stable-diffusion-conditional-training-rows-detailed | illus | elements>30%, width-changed | 265/0/0/0+0+0/0:0/2/412x339 | 124/0/0/0+0+0/0:0/0/432x395 |  |
| ml-word2vec-centre-and-context-tables | illus | elements>30%, width-changed | 168/0/0/0+0+0/0:0/0/644x276 | 51/0/0/0+0+0/0:0/0/408x379 |  |
| ml-word2vec-centre-and-context-tables-detailed | illus | elements>30%, width-changed | 225/0/0/0+0+0/0:0/0/644x276 | 110/0/0/0+0+0/0:0/0/408x379 |  |
| ml-zscore-distribution-tails | ref | straight->smooth, markers-changed | 94/0/0/10+0+0/0:0/0/408x486 | 113/32/0/2+0+0/0:0/0/408x448 |  |
| polynomial-regression-curve | ref | straight->smooth, markers-changed | 67/0/0/6+6+0/0:0/0/408x491 | 57/8/0/1+6+0/0:0/0/408x491 |  |
| shape-coordinate-plot | shape | straight->smooth, markers-changed | 76/0/0/6+0+0/0:0/0/408x421 | 73/8/0/3+0+0/0:0/0/408x383 |  |
| sigmoid-threshold | ref | straight->smooth, markers-changed | 65/0/0/6+0+0/0:0/0/408x469 | 54/8/0/2+0+0/0:0/0/408x431 |  |
| bayes-class-token-counts | ref | width-changed | 182/0/0/0+0+0/0:0/0/747x276 | 182/0/0/0+0+0/0:0/0/697x276 |  |
| binary-cross-entropy-loss | ref | straight->smooth | 77/0/0/8+8+0/0:0/0/408x511 | 77/12/0/8+8+0/0:0/0/408x511 |  |
| clustering-elbow-silhouette | ref | straight->smooth | 71/0/0/7+0+0/0:0/0/408x491 | 71/4/0/6+0+0/0:0/0/408x453 |  |
| clustering-inertia-elbow | ref | straight->smooth | 69/0/0/8+0+0/0:0/0/408x517 | 73/5/0/7+0+0/0:0/0/408x479 |  |
| cosine-vector-directions | ref | markers-changed | 68/0/0/2+0+0/0:0/0/408x491 | 63/0/0/1+0+0/0:0/0/408x453 |  |
| d2l-adam-yogi-loss-history | illus | straight->smooth | 69/0/0/6+6+0/0:0/0/408x508 | 71/8/0/5+5+0/0:0/0/408x470 |  |
| d2l-adam-yogi-loss-history-brief | illus | straight->smooth | 69/0/0/6+6+0/0:0/0/408x508 | 71/8/0/5+5+0/0:0/0/408x470 |  |
| d2l-adam-yogi-loss-history-detailed | illus | straight->smooth | 99/0/0/6+6+0/0:0/0/408x508 | 101/8/0/5+5+0/0:0/0/408x470 |  |
| d2l-attention-distance-kernel-shapes | illus | straight->smooth | 90/0/0/12+5+3/0:0/0/408x521 | 90/4/0/12+5+3/0:0/0/408x521 |  |
| d2l-attention-distance-kernel-shapes-brief | illus | straight->smooth | 74/0/0/6+5+3/0:0/0/408x469 | 74/4/0/6+5+3/0:0/0/408x469 |  |
| d2l-attention-distance-kernel-shapes-detailed | illus | straight->smooth | 127/0/0/12+5+3/0:0/0/408x538 | 127/4/0/12+5+3/0:0/0/408x538 |  |
| d2l-cnn-loss-and-accuracy | illus | straight->smooth | 69/0/0/7+7+0/0:0/0/408x469 | 69/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-cnn-loss-and-accuracy-brief | illus | straight->smooth | 69/0/0/7+7+0/0:0/0/408x469 | 69/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-cnn-loss-and-accuracy-detail | illus | straight->smooth | 67/0/0/7+0+0/0:0/0/408x469 | 68/5/0/6+0+0/0:0/0/408x431 |  |
| d2l-cnn-loss-and-accuracy-detailed | illus | straight->smooth | 69/0/0/7+7+0/0:0/0/408x469 | 69/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-cnn-loss-and-accuracy-detailed-detail | illus | straight->smooth | 67/0/0/7+0+0/0:0/0/408x469 | 68/5/0/6+0+0/0:0/0/408x431 |  |
| d2l-complexity-heldout-error | illus | straight->smooth | 75/0/0/7+6+0/0:0/0/408x469 | 80/8/0/6+5+0/0:0/0/408x431 |  |
| d2l-complexity-heldout-error-brief | illus | straight->smooth | 75/0/0/7+6+0/0:0/0/408x469 | 80/8/0/6+5+0/0:0/0/408x431 |  |
| d2l-complexity-heldout-error-detailed | illus | straight->smooth | 76/0/0/7+6+0/0:0/0/408x486 | 81/8/0/6+5+0/0:0/0/408x448 |  |
| d2l-cosine-warmup-schedules | illus | straight->smooth | 76/0/0/8+8+0/0:0/0/408x491 | 76/6/0/8+8+0/0:0/0/408x491 |  |
| d2l-cosine-warmup-schedules-brief | illus | straight->smooth | 76/0/0/8+8+0/0:0/0/408x491 | 76/6/0/8+8+0/0:0/0/408x491 |  |
| d2l-cosine-warmup-schedules-detailed | illus | straight->smooth | 114/0/0/8+8+0/0:0/0/408x491 | 114/6/0/8+8+0/0:0/0/408x491 |  |
| d2l-dropout-validation-metrics | illus | straight->smooth | 69/0/0/6+6+0/0:0/0/408x486 | 71/8/0/5+5+0/0:0/0/408x448 |  |
| d2l-dropout-validation-metrics-brief | illus | straight->smooth | 70/0/0/6+6+0/0:0/0/408x508 | 72/8/0/5+5+0/0:0/0/408x470 |  |
| d2l-dropout-validation-metrics-detailed | illus | straight->smooth | 103/0/0/6+6+0/0:0/0/408x486 | 105/8/0/5+5+0/0:0/0/408x448 |  |
| d2l-forecast-damping-by-horizon | illus | straight->smooth | 91/0/0/7+7+7/0:0/0/408x538 | 91/15/0/7+7+7/0:0/0/408x538 |  |
| d2l-forecast-damping-by-horizon-brief | illus | straight->smooth | 90/0/0/7+7+7/0:0/0/408x516 | 90/15/0/7+7+7/0:0/0/408x516 |  |
| d2l-forecast-damping-by-horizon-detailed | illus | straight->smooth | 122/0/0/7+7+7/0:0/0/408x521 | 122/15/0/7+7+7/0:0/0/408x521 |  |
| d2l-forecast-feedback-error | illus | straight->smooth | 89/0/0/7+7+7/0:0/0/408x499 | 89/15/0/7+7+7/0:0/0/408x499 |  |
| d2l-forecast-feedback-error-brief | illus | straight->smooth | 89/0/0/7+7+7/0:0/0/408x499 | 89/15/0/7+7+7/0:0/0/408x499 |  |
| d2l-forecast-feedback-error-detailed | illus | straight->smooth | 89/0/0/7+7+7/0:0/0/408x499 | 89/15/0/7+7+7/0:0/0/408x499 |  |
| d2l-forecast-feedback-error-detailed-detail | illus | text-overflow | 63/0/0/0+0+0/0:0/0/408x340 | 62/0/0/0+0+0/0:0/1/408x340 | canvas:Recursive forecast (175) |
| d2l-forecast-one-step-refresh | illus | straight->smooth | 72/0/0/7+7+0/0:0/0/408x469 | 72/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-forecast-one-step-refresh-brief | illus | straight->smooth | 72/0/0/7+7+0/0:0/0/408x469 | 72/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-forecast-one-step-refresh-detailed | illus | straight->smooth | 132/0/0/7+7+0/0:0/0/408x469 | 132/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-gaussian-location-scale | illus | straight->smooth | 82/0/0/6+6+6/0:0/0/408x469 | 82/12/0/6+6+6/0:0/0/408x469 |  |
| d2l-gaussian-location-scale-brief | illus | straight->smooth | 83/0/0/6+6+6/0:0/0/408x491 | 83/12/0/6+6+6/0:0/0/408x491 |  |
| d2l-gaussian-location-scale-detailed | illus | straight->smooth | 104/0/0/6+6+6/0:0/0/408x486 | 104/12/0/6+6+6/0:0/0/408x486 |  |
| d2l-gradient-descent-local-basin | illus | straight->smooth | 80/0/0/11+4+0/0:0/0/408x491 | 88/7/0/10+3+0/0:0/0/408x453 |  |
| d2l-gradient-descent-local-basin-brief | illus | straight->smooth | 80/0/0/11+4+0/0:0/0/408x491 | 88/7/0/10+3+0/0:0/0/408x453 |  |
| d2l-gradient-descent-local-basin-detailed | illus | straight->smooth | 119/0/0/11+4+0/0:0/0/408x491 | 127/7/0/10+3+0/0:0/0/408x453 |  |
| d2l-inverse-root-factor-schedules | illus | straight->smooth | 76/0/0/8+8+0/0:0/0/408x486 | 76/12/0/8+8+0/0:0/0/408x486 |  |
| d2l-inverse-root-factor-schedules-brief | illus | straight->smooth | 76/0/0/8+8+0/0:0/0/408x486 | 76/12/0/8+8+0/0:0/0/408x486 |  |
| d2l-inverse-root-factor-schedules-detailed | illus | straight->smooth | 138/0/0/8+8+0/0:0/0/408x469 | 138/12/0/8+8+0/0:0/0/408x469 |  |
| d2l-lag-regression-training-loss | illus | straight->smooth | 74/0/0/7+7+0/0:0/0/408x508 | 76/10/0/6+6+0/0:0/0/408x470 |  |
| d2l-lag-regression-training-loss-brief | illus | straight->smooth | 73/0/0/7+7+0/0:0/0/408x486 | 75/10/0/6+6+0/0:0/0/408x448 |  |
| d2l-lag-regression-training-loss-detailed | illus | straight->smooth | 74/0/0/7+7+0/0:0/0/408x508 | 76/10/0/6+6+0/0:0/0/408x470 |  |
| d2l-minibatch-loss-by-wall-time | illus | straight->smooth | 87/0/0/8+4+4/0:0/0/408x521 | 86/8/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-by-wall-time-brief | illus | straight->smooth | 87/0/0/8+4+4/0:0/0/408x521 | 86/8/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-by-wall-time-detailed | illus | straight->smooth | 107/0/0/8+4+4/0:0/0/408x504 | 106/8/0/8+4+4/0:0/0/408x504 |  |
| d2l-minibatch-loss-per-epoch | illus | straight->smooth | 82/0/0/8+4+4/0:0/0/408x521 | 82/8/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-per-epoch-brief | illus | straight->smooth | 82/0/0/8+4+4/0:0/0/408x521 | 82/8/0/8+4+4/0:0/0/408x521 |  |
| d2l-minibatch-loss-per-epoch-detailed | illus | straight->smooth | 103/0/0/8+4+4/0:0/0/408x521 | 103/8/0/8+4+4/0:0/0/408x521 |  |
| d2l-momentum-rate-loss-history | illus | straight->smooth | 84/0/0/6+6+6/0:0/0/408x538 | 84/12/0/6+6+6/0:0/0/408x538 |  |
| d2l-momentum-rate-loss-history-brief | illus | straight->smooth | 84/0/0/6+6+6/0:0/0/408x538 | 84/12/0/6+6+6/0:0/0/408x538 |  |
| d2l-momentum-rate-loss-history-detailed | illus | straight->smooth | 84/0/0/6+6+6/0:0/0/408x538 | 84/12/0/6+6+6/0:0/0/408x538 |  |
| d2l-newton-negative-curvature-safeguard | illus | straight->smooth | 80/0/0/9+3+4/0:0/0/408x508 | 80/7/0/9+3+4/0:0/0/408x508 |  |
| d2l-newton-negative-curvature-safeguard-brief | illus | straight->smooth | 79/0/0/9+3+4/0:0/0/408x486 | 79/7/0/9+3+4/0:0/0/408x486 |  |
| d2l-newton-negative-curvature-safeguard-detailed | illus | straight->smooth | 116/0/0/9+3+4/0:0/0/408x491 | 116/7/0/9+3+4/0:0/0/408x491 |  |
| d2l-schedule-heldout-training-outcome | illus | straight->smooth | 94/0/0/8+8+4/0:0/0/408x521 | 94/10/0/8+8+4/0:0/0/408x521 |  |
| d2l-schedule-heldout-training-outcome-brief | illus | straight->smooth | 93/0/0/8+8+4/0:0/0/408x499 | 93/10/0/8+8+4/0:0/0/408x499 |  |
| d2l-schedule-heldout-training-outcome-detailed | illus | straight->smooth | 95/0/0/8+8+4/0:0/0/408x538 | 95/10/0/8+8+4/0:0/0/408x538 |  |
| d2l-sigmoid-tanh-saturation-gradients | illus | straight->smooth | 79/0/0/8+8+0/0:0/0/408x486 | 79/12/0/8+8+0/0:0/0/408x486 |  |
| d2l-sigmoid-tanh-saturation-gradients-brief | illus | straight->smooth | 79/0/0/8+8+0/0:0/0/408x486 | 79/12/0/8+8+0/0:0/0/408x486 |  |
| d2l-sigmoid-tanh-saturation-gradients-detailed | illus | straight->smooth | 135/0/0/8+8+0/0:0/0/408x486 | 135/12/0/8+8+0/0:0/0/408x486 |  |
| d2l-tanh-sigmoid-activation-ranges | illus | straight->smooth | 79/0/0/8+8+0/0:0/0/408x491 | 79/12/0/8+8+0/0:0/0/408x491 |  |
| d2l-tanh-sigmoid-activation-ranges-brief | illus | straight->smooth | 78/0/0/8+8+0/0:0/0/408x469 | 78/12/0/8+8+0/0:0/0/408x469 |  |
| d2l-tanh-sigmoid-activation-ranges-detailed | illus | straight->smooth | 96/0/0/8+8+0/0:0/0/408x491 | 96/12/0/8+8+0/0:0/0/408x491 |  |
| d2l-transformer-position-signal-frequency | illus | straight->smooth | 72/0/0/7+7+0/0:0/0/408x469 | 72/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-brief | illus | straight->smooth | 72/0/0/7+7+0/0:0/0/408x469 | 72/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-brief-detail | illus | straight->smooth | 72/0/0/7+7+0/0:0/0/408x469 | 72/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-detail | illus | straight->smooth | 72/0/0/7+7+0/0:0/0/408x469 | 72/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-transformer-position-signal-frequency-detailed | illus | straight->smooth | 101/0/0/7+7+0/0:0/0/408x452 | 101/10/0/7+7+0/0:0/0/408x452 |  |
| d2l-transformer-position-signal-frequency-detailed-detail | illus | straight->smooth | 100/0/0/7+7+0/0:0/0/408x469 | 100/10/0/7+7+0/0:0/0/408x469 |  |
| d2l-translation-train-validation-loss | illus | straight->smooth | 80/0/0/9+8+0/0:0/0/408x469 | 83/12/0/9+8+0/0:0/0/408x469 |  |
| d2l-translation-train-validation-loss-brief | illus | straight->smooth | 76/0/0/8+8+0/0:0/0/408x491 | 78/12/0/7+7+0/0:0/0/408x453 |  |
| d2l-translation-train-validation-loss-detailed | illus | straight->smooth | 81/0/0/9+8+0/0:0/0/408x486 | 84/12/0/9+8+0/0:0/0/408x486 |  |
| d2l-weight-decay-heldout-loss | illus | straight->smooth | 83/0/0/8+4+4/0:0/0/408x551 | 83/8/0/8+4+4/0:0/0/408x551 |  |
| d2l-weight-decay-heldout-loss-brief | illus | straight->smooth | 83/0/0/8+4+4/0:0/0/408x551 | 83/8/0/8+4+4/0:0/0/408x551 |  |
| d2l-weight-decay-heldout-loss-detailed | illus | straight->smooth | 139/0/0/8+4+4/0:0/0/408x568 | 139/8/0/8+4+4/0:0/0/408x568 |  |
| early-stopping-curves | ref | straight->smooth | 88/0/0/9+9+0/0:0/0/408x491 | 89/14/0/8+8+0/0:0/0/408x453 |  |
| figure-attention-output-gate-detailed-detail | illus | elements>30% | 177/0/0/0+0+0/0:0/0/408x361 | 73/0/0/0+0+0/0:0/0/408x361 |  |
| figure-gallery-convolution-relative-bias-detailed-detail | illus | text-overflow | 105/0/0/0+0+0/0:0/0/563x340 | 102/0/0/0+0+0/0:0/1/563x340 | canvas:Attention score (144) |
| figure-gallery-depth-attention | illus | width-changed | 123/0/0/0+0+0/0:0/0/721x647 | 123/0/0/0+0+0/0:0/0/534x825 |  |
| figure-gallery-depth-attention-detailed | illus | width-changed | 123/0/0/0+0+0/0:0/0/721x647 | 123/0/0/0+0+0/0:0/0/534x825 |  |
| figure-gallery-latent-query-and-kv | illus | width-changed | 54/0/0/0+0+0/0:0/0/580x333 | 53/0/0/0+0+0/0:0/0/616x314 |  |
| figure-gallery-latent-query-and-kv-detailed | illus | width-changed | 86/0/0/0+0+0/0:0/0/580x333 | 85/0/0/0+0+0/0:0/0/616x314 |  |
| figure-gpt2-learned-position-decoder | illus | width-changed | 55/0/0/0+0+0/0:0/0/408x341 | 52/0/0/0+0+0/0:0/0/486x281 |  |
| figure-gpt2-learned-position-decoder-detailed | illus | width-changed | 141/0/0/0+0+0/0:0/0/408x358 | 136/0/0/0+0+0/0:0/0/486x281 |  |
| figure-grouped-query-heads | illus | width-changed | 67/0/0/0+0+0/0:0/0/802x450 | 67/0/0/0+0+0/0:0/0/702x450 |  |
| figure-grouped-query-heads-brief | illus | width-changed | 61/0/0/0+0+0/0:0/0/802x418 | 65/0/0/0+0+0/0:0/0/702x434 |  |
| figure-grouped-query-heads-detailed | illus | width-changed | 125/0/0/0+0+0/0:0/0/802x450 | 125/0/0/0+0+0/0:0/0/702x450 |  |
| figure-latent-expert-output-normalization-detailed-detail | illus | elements>30% | 188/0/0/0+0+0/0:0/0/408x319 | 85/0/0/0+0+0/0:0/0/408x319 |  |
| figure-partial-rotary-head-width | illus | width-changed | 71/0/0/0+0+0/0:0/0/440x360 | 67/0/0/0+0+0/0:0/0/536x300 |  |
| figure-partial-rotary-head-width-detailed | illus | width-changed | 137/0/0/0+0+0/0:0/0/440x377 | 131/0/0/0+0+0/0:0/0/536x300 |  |
| figure-retro-chunk-attention | illus | width-changed | 126/0/0/0+0+0/0:0/0/960x424 | 121/0/0/0+0+0/0:0/0/616x463 |  |
| figure-retro-chunk-attention-brief | illus | width-changed | 126/0/0/0+0+0/0:0/0/960x424 | 121/0/0/0+0+0/0:0/0/616x463 |  |
| figure-retro-chunk-attention-detailed | illus | width-changed | 175/0/0/0+0+0/0:0/0/960x407 | 173/0/0/0+0+0/0:0/0/616x463 |  |
| figure-retro-chunk-embedding | illus | width-changed | 60/0/0/0+0+0/0:0/0/408x350 | 56/0/0/0+0+0/0:0/0/487x295 |  |
| figure-retro-chunk-embedding-detailed | illus | width-changed | 125/0/0/0+0+0/0:0/0/408x333 | 122/0/0/0+0+0/0:0/0/487x295 |  |
| figure-retro-encoded-neighbor-rows-detailed | illus | width-changed | 62/0/0/0+0+0/0:0/0/588x352 | 61/0/0/0+0+0/0:0/0/654x333 |  |
| flow-converging-arrivals | illus | width-changed | 104/0/4/0+0+0/0:0/0/1008x620 | 107/0/4/0+0+0/0:0/0/697x598 |  |
| forecast-horizon-uncertainty | ref | straight->smooth | 72/0/1/5+6+0/0:0/0/408x521 | 71/7/1/5+6+0/0:0/0/408x521 |  |
| general-figure-4 | ref | badges-without-key (same before) | 67/0/0/4+0+0/8:8/0/408x429 | 67/0/0/4+0+0/8:8/0/408x429 |  |
| general-figure-5 | ref | badges-without-key (same before) | 56/0/0/2+0+0/6:6/0/408x451 | 56/0/0/2+0+0/6:6/0/408x451 |  |
| general-figure-6 | ref | badges-without-key (same before) | 64/0/0/4+0+0/8:8/0/408x396 | 64/0/0/4+0+0/8:8/0/408x396 |  |
| general-number-line-8 | ref | badges-without-key (same before) | 40/0/0/2+0+0/4:4/0/408x237 | 40/0/0/2+0+0/4:4/0/408x237 |  |
| knn-k-validation | ref | straight->smooth | 75/0/0/7+6+0/0:0/0/408x469 | 78/8/0/7+6+0/0:0/0/408x469 |  |
| knn-l1-l2-distance | ref | markers-changed | 58/0/1/2+0+0/0:0/0/408x469 | 52/0/1/1+0+0/0:0/0/408x431 |  |
| learning-curves | ref | straight->smooth | 64/0/0/5+5+0/0:0/0/408x491 | 64/6/0/5+5+0/0:0/0/408x491 |  |
| learning-rate-schedules | ref | straight->smooth | 65/0/0/5+8+0/0:0/0/408x491 | 65/6/0/5+8+0/0:0/0/408x491 |  |
| ml-differencing-transformation | ref | straight->smooth | 300/0/0/9+0+0/0:0/0/432x1347 | 302/5/0/7+0+0/0:0/0/432x1271 |  |
| ml-gpt2-fused-qkv-slices | illus | width-changed | 86/0/0/0+0+0/0:0/0/884x264 | 86/0/0/0+0+0/0:0/0/676x427 |  |
| ml-gpt2-fused-qkv-slices-detailed | illus | width-changed | 116/0/0/0+0+0/0:0/0/884x264 | 119/0/0/0+0+0/0:0/0/676x444 |  |
| ml-gpt2-tied-output-weights-detailed-detail | illus | badges-without-key (same before) | 58/0/0/4+0+0/2:2/0/408x332 | 58/0/0/4+0+0/2:2/0/408x332 |  |
| ml-gpu-matmul | ref | width-changed | 463/0/0/0+0+0/0:0/0/802x639 | 478/0/0/0+0+0/0:0/0/702x672 |  |
| ml-linear-regression-feature-scaling-overlay | ref | straight->smooth | 115/0/0/4+0+0/0:0/0/408x478 | 114/2/0/3+0+0/0:0/0/408x440 |  |
| ml-linear-regression-ridge-shrinkage | ref | straight->smooth | 93/0/0/6+0+0/0:0/0/408x534 | 91/3/0/5+0+0/0:0/0/408x496 |  |
| ml-local-outlier-factor | ref | elements>30% | 129/0/0/8+8+0/0:0/0/408x469 | 213/0/0/8+8+0/0:0/0/408x469 |  |
| ml-logistic-decision-boundary | ref | markers-changed | 173/0/0/4+3+6/0:0/0/408x546 | 189/0/0/2+1+6/0:0/0/408x546 |  |
| ml-logistic-regression-accuracy-trap | ref | markers-changed | 41/0/0/3+1+0/0:0/0/408x313 | 50/0/0/1+1+0/0:0/0/408x414 |  |
| ml-logistic-regression-threshold-tradeoff | ref | straight->smooth | 68/0/0/5+4+0/0:0/0/408x486 | 71/4/0/5+4+0/0:0/0/408x486 |  |
| ml-mle-steps | illus | only-after | - | 42/0/0/0+0+0/4:4/0/408x393 |  |
| ml-mle-steps-brief | illus | only-after | - | 42/0/0/0+0+0/4:4/0/408x393 |  |
| ml-mle-steps-detailed | illus | only-after | - | 42/0/0/0+0+0/4:4/0/408x393 |  |
| ml-model-evaluation-schedule-run-diagnostics | ref | straight->smooth | 148/0/0/10+5+0/0:0/0/432x986 | 148/9/0/9+5+0/0:0/0/432x948 |  |
| ml-model-evaluation-training-diagnostics | ref | straight->smooth | 123/0/0/10+5+0/0:0/0/432x986 | 121/9/0/8+4+0/0:0/0/432x910 |  |
| ml-moe-top-two-experts | illus | width-changed | 115/0/0/0+0+0/0:0/0/955x559 | 115/0/0/0+0+0/0:0/0/559x653 |  |
| ml-ranked-anomaly-scores | ref | elements>30% | 38/0/0/0+0+0/0:0/0/408x330 | 52/0/0/0+0+0/0:0/0/408x397 |  |
| ml-regression-error-metrics | ref | elements>30% | 335/0/0/3+5+0/0:0/0/432x1395 | 452/0/0/1+5+0/0:0/0/432x1395 |  |
| ml-regularization-dropout-mask | ref | markers-changed | 179/0/0/9+0+0/0:0/0/602x297 | 167/0/0/6+0+0/0:0/0/602x283 |  |
| ml-repeated-sample-fits | ref | straight->smooth | 234/0/1/7+3+3/0:0/0/432x1464 | 230/2/1/6+3+3/0:0/0/432x1426 |  |
| ml-stable-diffusion-noise-target-table | illus | elements>30% | 209/0/0/0+0+0/0:0/3/408x398 | 80/0/0/0+0+0/0:0/0/408x493 |  |
| ml-stable-diffusion-noise-target-table-detailed | illus | elements>30% | 244/0/0/0+0+0/0:0/3/408x398 | 115/0/0/0+0+0/0:0/0/408x493 |  |
| ml-time-series-additive-residuals | ref | straight->smooth | 317/0/0/27+9+0/0:0/0/432x1455 | 309/21/0/25+9+0/0:0/0/432x1379 |  |
| ml-time-series-recursive-rollout | ref | straight->smooth | 160/0/0/9+5+5/0:0/0/432x745 | 158/13/0/9+5+5/0:0/0/432x745 |  |
| ml-transformer-parallel-attention-heads-brief-detail | illus | width-changed | 74/0/0/0+0+0/0:0/0/848x264 | 75/0/0/0+0+0/0:0/0/572x444 |  |
| ml-transformer-parallel-attention-heads-detail | illus | width-changed | 74/0/0/0+0+0/0:0/0/848x264 | 75/0/0/0+0+0/0:0/0/572x444 |  |
| ml-transformer-parallel-attention-heads-detailed-detail | illus | width-changed | 164/0/0/0+0+0/0:0/0/848x264 | 167/0/0/0+0+0/0:0/0/572x444 |  |
| ml-transformer-qkv-projections | illus | width-changed | 79/0/0/0+0+0/0:0/0/770x297 | 69/0/0/0+0+0/0:0/0/482x444 |  |
| ml-transformer-qkv-projections-brief | illus | width-changed | 60/0/0/0+0+0/0:0/0/554x316 | 58/0/0/0+0+0/0:0/0/605x280 |  |
| ml-transformer-qkv-projections-detailed | illus | width-changed | 213/0/0/0+0+0/0:0/0/770x297 | 203/0/0/0+0+0/0:0/0/482x444 |  |
| ml-transformer-residual-arithmetic | illus | width-changed | 86/0/0/0+0+0/0:0/0/1164x264 | 87/0/0/0+0+0/0:0/0/612x444 |  |
| ml-transformer-residual-arithmetic-brief | illus | width-changed | 86/0/0/0+0+0/0:0/0/1164x264 | 87/0/0/0+0+0/0:0/0/612x444 |  |
| ml-transformer-residual-arithmetic-detailed | illus | width-changed | 140/0/0/0+0+0/0:0/0/1164x264 | 143/0/0/0+0+0/0:0/0/612x444 |  |
| ml-transformer-token-embeddings | illus | width-changed | 74/0/0/0+0+0/0:0/0/942x208 | 75/0/0/0+0+0/0:0/0/564x351 |  |
| ml-transformer-token-embeddings-brief | illus | width-changed | 74/0/0/0+0+0/0:0/0/942x208 | 75/0/0/0+0+0/0:0/0/564x351 |  |
| ml-transformer-token-embeddings-detailed | illus | width-changed | 138/0/0/0+0+0/0:0/0/942x208 | 138/0/0/0+0+0/0:0/0/564x334 |  |
| ml-transformer-token-embeddings-detailed-detail | illus | straight->smooth | 178/0/0/7+7+0/0:0/0/408x486 | 179/10/0/6+6+0/0:0/0/408x448 |  |
| ml-transformer-vocabulary-cross-entropy | illus | elements>30% | 26/0/0/0+0+0/0:0/0/408x268 | 38/0/0/0+0+0/0:0/0/408x419 |  |
| ml-transformer-vocabulary-cross-entropy-brief | illus | elements>30% | 25/0/0/0+0+0/0:0/0/408x246 | 37/0/0/0+0+0/0:0/0/408x397 |  |
| ml-transformer-vocabulary-softmax-detail | illus | width-changed | 68/0/0/0+0+0/0:0/0/762x208 | 68/0/0/0+0+0/0:0/0/638x334 |  |
| ml-transformer-vocabulary-softmax-detailed-detail | illus | width-changed | 194/0/0/0+0+0/0:0/0/762x208 | 194/0/0/0+0+0/0:0/0/638x334 |  |
| ml-transformer-weighted-values | illus | width-changed | 84/0/0/0+0+0/0:0/0/874x177 | 84/0/0/0+0+0/0:0/0/562x303 |  |
| ml-transformer-weighted-values-brief | illus | width-changed | 84/0/0/0+0+0/0:0/0/874x177 | 84/0/0/0+0+0/0:0/0/562x303 |  |
| ml-transformer-weighted-values-detailed | illus | width-changed | 84/0/0/0+0+0/0:0/0/874x177 | 84/0/0/0+0+0/0:0/0/562x303 |  |
| ml-trees-bootstrap-coverage | illus | markers-changed | 120/19/0/1+0+0/0:0/0/408x534 | 119/19/0/2+0+0/0:0/0/408x496 |  |
| ml-trees-bootstrap-coverage-brief | illus | markers-changed | 92/19/0/1+0+0/0:0/0/408x495 | 91/19/0/2+0+0/0:0/0/408x457 |  |
| ml-trees-bootstrap-coverage-detailed | illus | markers-changed | 142/19/0/2+0+0/0:0/0/408x534 | 144/19/0/3+0+0/0:0/0/408x496 |  |
| ml-trees-forest-size-accuracy | illus | straight->smooth | 64/0/0/6+0+0/0:0/0/408x452 | 60/4/0/5+0+0/0:0/0/408x414 |  |
| ml-trees-forest-size-accuracy-brief | illus | straight->smooth | 64/0/0/6+0+0/0:0/0/408x452 | 60/4/0/5+0+0/0:0/0/408x414 |  |
| ml-trees-forest-size-accuracy-detailed | illus | straight->smooth | 66/0/0/6+0+0/0:0/0/408x486 | 62/4/0/5+0+0/0:0/0/408x448 |  |
| ml-trees-gini-vs-entropy | illus | markers-changed | 193/20/0/9+7+0/0:0/0/408x486 | 183/20/0/5+3+0/0:0/0/408x486 |  |
| ml-trees-gini-vs-entropy-brief | illus | markers-changed | 192/20/0/9+7+0/0:0/0/408x486 | 182/20/0/5+3+0/0:0/0/408x486 |  |
| ml-trees-gini-vs-entropy-detailed | illus | markers-changed | 195/20/0/9+7+0/0:0/0/408x503 | 185/20/0/5+3+0/0:0/0/408x503 |  |
| ml-trees-majority-vote-brief | illus | elements>30% | 22/0/0/0+0+0/0:0/0/408x200 | 35/0/0/0+0+0/0:0/0/408x363 |  |
| ml-what-is-machine-learning-bias-variance | ref | straight->smooth | 85/0/0/9+4+4/0:0/0/408x525 | 88/8/0/9+4+4/0:0/0/408x525 |  |
| ml-what-is-machine-learning-centroid-baseline | ref | elements>30% | 26/0/0/0+0+0/0:0/0/408x265 | 38/0/0/0+0+0/0:0/0/408x414 |  |
| ml-what-is-machine-learning-dataset-split | ref | width-changed | 42/0/0/0+0+0/0:0/0/408x269 | 33/0/0/0+0+0/0:0/0/671x253 |  |
| ml-what-is-machine-learning-fit-quality | ref | markers-changed | 86/2/0/7+4+6/0:0/0/408x516 | 66/6/0/5+1+1/0:0/0/408x516 |  |
| ml-what-is-machine-learning-learning-families | ref | width-changed | 82/0/0/0+0+0/0:0/0/940x336 | 87/0/0/0+0+0/0:0/0/714x336 |  |
| ml-what-is-machine-learning-nearest-centroid-predict | ref | markers-changed | 127/0/0/6+5+2/0:0/0/408x525 | 117/0/0/3+3+2/0:0/0/408x525 |  |
| ml-word2vec-embedding-row-update | illus | elements>30% | 274/0/0/0+0+0/0:0/4/408x457 | 80/0/0/0+0+0/0:0/0/408x533 |  |
| ml-word2vec-embedding-row-update-detailed | illus | elements>30% | 370/0/0/0+0+0/0:0/4/408x440 | 176/0/0/0+0+0/0:0/0/408x516 |  |
| ml-word2vec-prefix-guesses | illus | elements>30% | 29/0/0/0+0+0/0:0/0/408x280 | 43/0/0/0+0+0/0:0/0/408x419 |  |
| ml-word2vec-prefix-guesses-brief | illus | elements>30% | 29/0/0/0+0+0/0:0/0/408x280 | 43/0/0/0+0+0/0:0/0/408x419 |  |
| ml-word2vec-profile-directions | illus | markers-changed | 72/0/0/2+0+0/0:0/0/408x469 | 65/0/0/1+0+0/0:0/0/408x431 |  |
| ml-word2vec-profile-directions-brief | illus | markers-changed | 73/0/0/2+0+0/0:0/0/408x491 | 66/0/0/1+0+0/0:0/0/408x453 |  |
| ml-word2vec-profile-directions-detailed | illus | markers-changed | 101/0/0/2+0+0/0:0/0/408x486 | 94/0/0/1+0+0/0:0/0/408x448 |  |
| ml-word2vec-trait-rescale | illus | badges-without-key (same before) | 38/0/0/0+0+0/4:4/0/408x255 | 38/0/0/0+0+0/4:4/0/408x255 |  |
| ml-word2vec-trait-rescale-brief | illus | badges-without-key (same before) | 37/0/0/0+0+0/4:4/0/408x233 | 37/0/0/0+0+0/4:4/0/408x233 |  |
| ml-word2vec-trait-rescale-detailed | illus | badges-without-key (same before) | 65/0/0/0+0+0/4:4/0/408x255 | 65/0/0/0+0+0/4:4/0/408x255 |  |
| persistent-drift-alerts | ref | straight->smooth | 93/0/0/10+0+0/0:0/0/408x491 | 101/14/0/9+0+0/0:0/0/408x453 |  |
| precision-recall-thresholds | ref | straight->smooth | 70/0/0/6+0+0/0:0/0/408x469 | 66/4/0/5+0+0/0:0/0/408x431 |  |
| probability-calibration | ref | straight->smooth | 65/0/0/6+3+0/0:0/0/408x491 | 65/4/0/6+3+0/0:0/0/408x491 |  |
| raschka-residual-gain-and-soft-logit-cap-brief-detail | illus | straight->smooth | 65/0/0/6+0+0/0:0/0/408x469 | 61/4/0/5+0+0/0:0/0/408x431 |  |
| raschka-residual-gain-and-soft-logit-cap-detail | illus | straight->smooth | 65/0/0/6+0+0/0:0/0/408x469 | 61/4/0/5+0+0/0:0/0/408x431 |  |
| raschka-residual-gain-and-soft-logit-cap-detailed-detail | illus | straight->smooth | 98/0/0/6+0+0/0:0/0/408x469 | 94/4/0/5+0+0/0:0/0/408x431 |  |
| rbf-kernel-similarity | ref | straight->smooth | 76/0/0/8+8+0/0:0/0/408x469 | 76/12/0/8+8+0/0:0/0/408x469 |  |
| regression-residuals | ref | markers-changed | 75/0/0/3+4+0/0:0/0/408x491 | 68/0/0/1+4+0/0:0/0/408x491 |  |
| regularization-coefficient-path | ref | straight->smooth | 73/0/0/6+6+0/0:0/0/408x491 | 72/8/0/6+6+0/0:0/0/408x491 |  |
| regularization-l1-l2-geometry | ref | markers-changed | 63/0/1/3+0+0/0:0/0/408x469 | 61/0/1/2+0+0/0:0/0/408x431 |  |
| repeated-fit-uncertainty | ref | straight->smooth | 65/0/1/6+0+0/0:0/0/408x505 | 60/4/1/5+0+0/0:0/0/408x453 |  |
| roc-threshold-curve | ref | straight->smooth | 68/0/0/6+3+0/0:0/0/408x491 | 71/3/0/6+3+0/0:0/0/408x491 |  |
| shape-bar-chart | shape | elements>30% | 19/0/0/0+0+0/0:0/0/408x157 | 33/0/0/0+0+0/0:0/0/408x332 |  |
| shape-figure | shape | badges-without-key (same before) | 37/0/0/2+0+0/4:4/0/408x295 | 37/0/0/2+0+0/4:4/0/408x295 |  |
| shape-number-line | shape | badges-without-key (same before) | 45/0/0/2+0+0/2:2/0/408x210 | 45/0/0/2+0+0/2:2/0/408x210 |  |
| svm-hinge-loss | ref | straight->smooth | 67/0/0/5+0+0/0:0/0/408x491 | 67/3/0/4+0+0/0:0/0/408x453 |  |
| svr-epsilon-tube | ref | markers-changed | 96/0/1/3+4+0/0:0/0/408x521 | 92/0/1/1+4+0/0:0/0/408x521 |  |
| time-series-components | ref | straight->smooth | 103/0/0/9+9+9/0:0/0/408x499 | 103/21/0/9+9+9/0:0/0/408x499 |  |
