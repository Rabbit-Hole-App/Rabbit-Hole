# Phase 02 reference batch 3C · ML system design

## References

Task `41135289-8963-46a5-98c0-57209d04e559` on `chatgpt/explain-phase02-library`. The five Lesson 19 examples use the existing written `/explain` diagrams. The serving workload and prices are illustrative. [Coverage audit](coverage-audit.md#recommended-build-order) · [Lesson 19 at the audited revision](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/19-ml-system-design/docs/en.md)

| Learner question | Reference and expected evidence |
| --- | --- |
| How does a churn prediction turn into an action that helps reduce cancellations? | A flow connects the goal to a per-user 30-day cancellation probability and then to a nightly offer decision for the highest-risk 5%. At 1,000 eligible users that is 50 offers. A randomized holdout estimates the offer's effect. [SVG](references/ml-churn-goal-prediction-decision.svg) · [JSON](references/ml-churn-goal-prediction-decision.json) |
| How is predicting on a schedule different from predicting when a request comes in? | A sequence shows a scheduled job scoring a snapshot and writing the results before requests. Batch reads the stored score. Online sends current features to the model and waits for the fresh score. [SVG](references/ml-batch-vs-online-inference.svg) · [JSON](references/ml-batch-vs-online-inference.json) |
| How do I compare the latency and cost of batch and online predictions? | A matrix uses the same 1M entities, 2M daily requests, 500 peak requests per second and 40 ms request budget. Batch scores 1M every 24 hours in a one-hour job, so the maximum age is 25 hours. Scoring costs 0.40 USD/day and reads cost 0.50 USD/day, for 0.90 USD/day at 4 ms. Online needs three 200-QPS replicas at 0.50 USD/hour each, for 36 USD/day at 35 ms. [SVG](references/ml-serving-latency-cost.svg) · [JSON](references/ml-serving-latency-cost.json) |
| When would I shadow a new model, canary it, or run an A/B test? | Shadow copies requests and measures service behavior while the old model still decides. Canary serves 5% of traffic and reverts if a guardrail breaks. A/B holds a random assignment stable and compares the business outcome. [SVG](references/ml-shadow-canary-ab-rollout.svg) · [JSON](references/ml-shadow-canary-ab-rollout.json) |
| How should a churn system keep working if its nightly scoring job fails? | Use new scores after success. After failure, reuse the last good scores through 25 hours of age and apply the 14-day inactivity rule when scores are missing or older. Every route keeps the same 5% offer cap. [SVG](references/ml-batch-score-fallback.svg) · [JSON](references/ml-batch-score-fallback.json) |

## Implementation and checks

- [x] Record first picks for ten learner prompts and paraphrases on the baseline.
- [x] Add the two reference modules and register the five examples after Batch 3B. Verify the numeric results and flow routes.
- [x] Check the prepared author requests and replay the existing selector benchmark.
- [x] Export JSON and SVG previews, add snapshots at 320, 408 and 720 px, and verify the earlier fingerprints. Run the focused tests and web build.
- [x] Update the coverage audit and reference index.

## Baseline selector gaps

At `0170703e2`, the first pick missed the intended mechanism on all ten prompts and paraphrases. [Probe wording](../../../../../packages/control-plane/test/fixtures/explanation-reference-batch3c-cases.json)

| Mechanism | Original's first pick | Paraphrase's first pick |
| --- | --- | --- |
| Goal, prediction and decision | None | None |
| Batch and online inference | `learning-rate-schedules` | None |
| Serving latency and cost | None | `ml-feature-store-architecture` |
| Shadow, canary and A/B | None | None |
| Failure and fallback | None | `ml-feature-store-architecture` |

## Local verification

- The intended example was the first reference in **10/10** prepared author requests. All **252** earlier benchmark selections and **14** adjacent prompts matched their complete baseline selections. The prior 154 registry entries keep their relative order. [Set 3 benchmark replay](set3/README.md#paraphrase-benchmark)
- **917 focused tests** passed, including the route, cost, saved JSON, content-lint, and renderer checks. The web build passed. [Focused replay commands](README.md#focused-local-checks)
- SVG regression now covers **612 snapshots**. The 597 earlier fingerprints and dimensions match `0170703e2`, and the 15 additions cover the five examples at 320, 408 and 720 px requests. The existing sequence and comparison layouts have minimum widths of 440 and 356 px respectively. The app scrolls these diagrams horizontally when space is narrower.

The five linked JSON and SVG pairs are fixed references from the production renderer. Live `/explain` generation and browser acceptance remain pending. For dev acceptance, replay the learner questions above and inspect the model's own diagrams and arithmetic. [Full gallery export command](batch-3b.md#local-verification)

## Remaining Batch 3 work

Lesson 21 has two open references for historical feature backfills and training/serving skew. [Coverage audit](coverage-audit.md#recommended-build-order)
