# AI teaching examples: generation and dev acceptance handoff

Fetch `chatgpt/ai-learning-examples` from `Rabbit-Hole-App/Rabbit-Hole`. This extends the earlier `chatgpt/ai-teaching-examples` implementation at `f6fb7bc12778c9fa14118639fb06f3f6804132d7` and includes the individually assessed curriculum audit. The separate heat-grid branch still needs its own integration.

## Purpose

The hand-authored fixtures establish reference calculations and scene behavior. They do **not** establish that the actual `/interact` author/reviewer/reviser/card workflow can produce these examples. Regenerate the first three through that workflow and compare to the reference, preserving the existing card UI. Do not seed the fixture and call it a generation pass.

Reuse authorized dev access and the current approved generation budget only. This handoff creates no additional paid allowance. Record a budget/access blocker without silently changing provider or spending beyond an existing approval.

## First generation cases

| Case | Prompt to send through the normal Tutor `/interact` path | Numerical acceptance |
| --- | --- | --- |
| Convolution | Show a 3 × 3 kernel sliding across a synthetic 5 × 5 image. Let me move the window and choose vertical edges, horizontal edges or box blur. Show the input patch, elementwise products and output. Use CNN cross-correlation, stride 1, no padding or bias; divide the blur sum by nine. | Cross-check the generated card's own explicit input/kernel, including a corner window and blur normalization. Do not require its pixels to match the fixture if it uses a different clearly stated example. |
| Attention | Explain one scaled dot-product attention row for three synthetic tokens. Let me select the query and toggle causal masking. Show Q, K, V, scaled scores, normalized weights and weighted output. | Verify score scaling by square root of key dimension; blocked keys get zero weight, allowed weights sum to one, output is the weighted sum of V. |
| Gradient descent | Show gradient descent from w = 3 on L(w) = w²/2. Let me choose learning rates 0.2, 0.8, 1.2 and 2.1 and inspect steps 0 through 8. Show convergence, shrinking overshoots and divergence with all points visible. | w at step t equals 3(1−rate)^t; loss equals w²/2. Changing step must not hide divergent points or mislabel the axis. |

Reference sources: `packages/web/src/explain-program/ai-convolution-fixture.js`, `ai-attention-fixture.js`, `ai-gradient-fixture.js` and their numerical tests. Generated code may differ; teaching mechanism and numbers must agree with its stated assumptions.

## Newly added fixtures: dev checks

| Fixture | Interaction to check |
| --- | --- |
| `fixture-ai-backprop` | Change input and weight; inspect forward/backward/update modes. Compare the analytic weight gradient with a finite difference and the proposed update with the displayed loss. |
| `fixture-ai-boundary` | Drag a training point and query. Switch 1/3 neighbors. Confirm region, query prediction and leave-one-out error all use the moved coordinates; reopen and Reset. |
| `fixture-ai-qlearning` | Move to a wall, pit and goal. Verify reward and Q update; terminal actions stop. New episode retains learned Q values; changing parameters starts a fresh run. Reopen and Reset. |

These use the same `AI_TEACHING_FIXTURES` registry and dev fixture admission gate. They are not a new automatic lesson-routing library.

## Phase 02 generation cases

Use the pushed `chatgpt/phase-02-ml-examples` branch for the reference fixtures. Send each prompt through the normal Tutor router and /interact workflow. Keep the generated result and the reference fixture as separate artifacts. Commit the generated source, manifest, replay inputs and state alongside the routing and job evidence so it can be tested without another model call. Record the actual outcome for a case that delivers no card.

| Reference | Learner request | Check on the generated card |
| --- | --- | --- |
| `fixture-ai-classifier-threshold` | Show me how moving a classifier's cutoff changes false alarms and missed positives. Use ten labeled scores with two actual positives. Let me change the cutoff and see the confusion matrix, precision, recall and accuracy. | Recompute the four counts and metrics from the card's displayed scores. At a score equal to the cutoff, count it as positive. Show precision as undefined if there are no positive predictions. |
| `fixture-ai-regression-fit` | Let me change a line's slope and intercept and see how far six points are from its predictions. Show how each error contributes to the mean squared error. | Confirm each residual ends at the prediction for the same x value. Verify the six squared residuals and their average at two settings. |
| `fixture-ai-kmeans` | Let me move two starting centroids and step through assigning points and updating the centroids. Use a small example where different starts can lead to different groups. | Check nearest-center assignments, centroid means, and the sum of squared point-to-center distances for the displayed assignments. Try two starts, reopen, and Reset. |

## Common acceptance and report

- Keep `/interact` strictly 2D. Use the existing title, a concise description above the scene, existing controls and Reset. Do not add explanatory text below the scene or controls.
- Confirm the active generation context exposes the required existing helpers. Report a missing connection precisely; do not change unrelated planner mapping or repair budgets.
- After a card is genuinely generated, change a control, save/reopen and inspect the resulting values. Check one boundary case and Reset. For draggable scenes inspect before/after geometry, not only the saved input values.
- Record request/job identity, branch/commit, dev build, whether generation actually ran, numerical result, visual/interaction result, saved-state result, cost under the existing allowance, and any blocker.
- Update `curriculum-scene-analysis.md` and `explain-program-support.md`. Keep generated-card acceptance separate from fixture tests. Push resulting changes and report the SHA.
- Keep checks focused. Broad CI, unrelated browser assertions, new runtime infrastructure and the owner-deferred capabilities are outside this batch.
