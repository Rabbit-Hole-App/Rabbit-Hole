# Explain benchmark report: 20261108T082419Z-50f6889-e64c58dd

> FIXTURE RUN. Every model reply was a scripted offline provider double. No model generated any card and no provider was contacted. This proves the harness wiring, the production validator path and the evaluator only. It is NOT live evidence and must never be compared with, or presented as, live generation.

- Run type: **fixture**; status: complete; code SHA: `50f6889`
- Corpus: explain-written-v1 v1, hash `5d571ba4abf82d7e`; expected facts hash `107c047268bce205`
- Evaluator: deterministic-offline-v1 (deterministic); authorized paid cap: none (no paid call is possible)

## Factuality versus speed (all cases)

Failures, invalid output and timeouts stay in every denominator. Latency covers delivered cards only and shows its sample count.

| Profile | Attempts | Delivered | Factual pass | Required output pass | Major errors | Usable ms median | p95 | n | Repairs | Known cost USD | Unknown-cost attempts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fixture-mixed | 8 | 8 | 1 | 1 | 0 | 1500 | 3600 | 8 | 1 | 0.04736 | 0 |
| fixture-flaky | 8 | 5 | 0.625 | 0.625 | 0 | 1200 | 2400 | 5 | 1 | 0 | 8 |
| fixture-fast | 8 | 8 | 0.875 | 1 | 4 | 900 | 900 | 8 | 0 | 0.03104 | 0 |
| plan-default | 8 | 8 | 1 | 1 | 0 | 4200 | 4200 | 8 | 0 | 0 | 8 |

## Recommendation

**No winner.** A fixture run cannot select a model: its replies are scripted. No winner.

Promotion to a production profile is an explicit reviewed configuration change with a rollback profile, never a benchmark side effect.

## Evaluator checks (seeded defects)

Seeded defects flagged: 4 of 4. Clean controls flagged: 0 of 1.

| Calibration case | Expected | Flags | Result |
| --- | --- | --- | --- |
| cal-control-clean | clean | none | ok |
| cal-dropped-table | flagged | no_card, required_visual_missing | ok |
| cal-malformed-diagram | flagged | no_card, explanation_bad_diagram, required_visual_invalid | ok |
| cal-over-cap | flagged | no_card, explanation_over_budget | ok |
| cal-wrong-fact | flagged | fact_missing:chooses-a, fact_missing:a-purer, forbidden:b-purer, calc_failed:gini-a | ok |

## Attempts that failed or did not pass the checks

| Attempt | Case | Profile | Status | Stage | Reason / flags | Artifacts |
| --- | --- | --- | --- | --- | --- | --- |
| fixture-flaky--ex01-coffee-deep--t1 | ex01-coffee-deep | fixture-flaky | failed | timeout | call exceeded 60000 ms | [attempt](attempts/fixture-flaky--ex01-coffee-deep--t1/) |
| fixture-flaky--ex07-decision-tree--t1 | ex07-decision-tree | fixture-flaky | failed | refusal | The model returned no artifact. | [attempt](attempts/fixture-flaky--ex07-decision-tree--t1/) |
| fixture-flaky--heldout-tides-standard--t1 | heldout-tides-standard | fixture-flaky | failed | provider_error | Artifact generation unavailable (model HTTP 500). Try again. | [attempt](attempts/fixture-flaky--heldout-tides-standard--t1/) |
| fixture-fast--ex02p-gini-standard--t1 | ex02p-gini-standard | fixture-fast | success | none | fact_missing:chooses-a, fact_missing:a-purer, forbidden:b-purer, calc_failed:gini-a | [attempt](attempts/fixture-fast--ex02p-gini-standard--t1/) |

## All attempts (source rows)

One row per attempt in `results.jsonl`; open the linked directory for the request snapshot, outputs, validation and `evaluation.json`.

| Attempt | Case | Depth | Profile | Status | Delivered ms | Link |
| --- | --- | --- | --- | --- | --- | --- |
| fixture-mixed--ex01-coffee-deep--t1 | ex01-coffee-deep | deep | fixture-mixed | success | 1500 | [attempt](attempts/fixture-mixed--ex01-coffee-deep--t1/) |
| fixture-flaky--ex01-coffee-deep--t1 | ex01-coffee-deep | deep | fixture-flaky | failed | n/a | [attempt](attempts/fixture-flaky--ex01-coffee-deep--t1/) |
| fixture-fast--ex01-coffee-deep--t1 | ex01-coffee-deep | deep | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--ex01-coffee-deep--t1/) |
| plan-default--ex01-coffee-deep--t1 | ex01-coffee-deep | deep | plan-default | success | 4200 | [attempt](attempts/plan-default--ex01-coffee-deep--t1/) |
| fixture-mixed--ex02p-gini-overview--t1 | ex02p-gini-overview | overview | fixture-mixed | success | 1500 | [attempt](attempts/fixture-mixed--ex02p-gini-overview--t1/) |
| plan-default--ex02p-gini-overview--t1 | ex02p-gini-overview | overview | plan-default | success | 4200 | [attempt](attempts/plan-default--ex02p-gini-overview--t1/) |
| fixture-fast--ex02p-gini-overview--t1 | ex02p-gini-overview | overview | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--ex02p-gini-overview--t1/) |
| fixture-flaky--ex02p-gini-overview--t1 | ex02p-gini-overview | overview | fixture-flaky | success | 1200 | [attempt](attempts/fixture-flaky--ex02p-gini-overview--t1/) |
| fixture-fast--ex01-coffee-overview--t1 | ex01-coffee-overview | overview | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--ex01-coffee-overview--t1/) |
| fixture-mixed--ex01-coffee-overview--t1 | ex01-coffee-overview | overview | fixture-mixed | success | 1500 | [attempt](attempts/fixture-mixed--ex01-coffee-overview--t1/) |
| fixture-flaky--ex01-coffee-overview--t1 | ex01-coffee-overview | overview | fixture-flaky | success | 1200 | [attempt](attempts/fixture-flaky--ex01-coffee-overview--t1/) |
| plan-default--ex01-coffee-overview--t1 | ex01-coffee-overview | overview | plan-default | success | 4200 | [attempt](attempts/plan-default--ex01-coffee-overview--t1/) |
| fixture-flaky--ex07-decision-tree--t1 | ex07-decision-tree | standard | fixture-flaky | failed | n/a | [attempt](attempts/fixture-flaky--ex07-decision-tree--t1/) |
| fixture-fast--ex07-decision-tree--t1 | ex07-decision-tree | standard | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--ex07-decision-tree--t1/) |
| fixture-mixed--ex07-decision-tree--t1 | ex07-decision-tree | standard | fixture-mixed | success | 1500 | [attempt](attempts/fixture-mixed--ex07-decision-tree--t1/) |
| plan-default--ex07-decision-tree--t1 | ex07-decision-tree | standard | plan-default | success | 4200 | [attempt](attempts/plan-default--ex07-decision-tree--t1/) |
| fixture-flaky--ex01-coffee-standard--t1 | ex01-coffee-standard | standard | fixture-flaky | success | 1200 | [attempt](attempts/fixture-flaky--ex01-coffee-standard--t1/) |
| fixture-mixed--ex01-coffee-standard--t1 | ex01-coffee-standard | standard | fixture-mixed | success | 3600 | [attempt](attempts/fixture-mixed--ex01-coffee-standard--t1/) |
| fixture-fast--ex01-coffee-standard--t1 | ex01-coffee-standard | standard | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--ex01-coffee-standard--t1/) |
| plan-default--ex01-coffee-standard--t1 | ex01-coffee-standard | standard | plan-default | success | 4200 | [attempt](attempts/plan-default--ex01-coffee-standard--t1/) |
| plan-default--heldout-tides-standard--t1 | heldout-tides-standard | standard | plan-default | success | 4200 | [attempt](attempts/plan-default--heldout-tides-standard--t1/) |
| fixture-fast--heldout-tides-standard--t1 | heldout-tides-standard | standard | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--heldout-tides-standard--t1/) |
| fixture-flaky--heldout-tides-standard--t1 | heldout-tides-standard | standard | fixture-flaky | failed | n/a | [attempt](attempts/fixture-flaky--heldout-tides-standard--t1/) |
| fixture-mixed--heldout-tides-standard--t1 | heldout-tides-standard | standard | fixture-mixed | success | 1500 | [attempt](attempts/fixture-mixed--heldout-tides-standard--t1/) |
| plan-default--ex02p-gini-deep--t1 | ex02p-gini-deep | deep | plan-default | success | 4200 | [attempt](attempts/plan-default--ex02p-gini-deep--t1/) |
| fixture-flaky--ex02p-gini-deep--t1 | ex02p-gini-deep | deep | fixture-flaky | success | 2400 | [attempt](attempts/fixture-flaky--ex02p-gini-deep--t1/) |
| fixture-mixed--ex02p-gini-deep--t1 | ex02p-gini-deep | deep | fixture-mixed | success | 1500 | [attempt](attempts/fixture-mixed--ex02p-gini-deep--t1/) |
| fixture-fast--ex02p-gini-deep--t1 | ex02p-gini-deep | deep | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--ex02p-gini-deep--t1/) |
| fixture-fast--ex02p-gini-standard--t1 | ex02p-gini-standard | standard | fixture-fast | success | 900 | [attempt](attempts/fixture-fast--ex02p-gini-standard--t1/) |
| fixture-flaky--ex02p-gini-standard--t1 | ex02p-gini-standard | standard | fixture-flaky | success | 1200 | [attempt](attempts/fixture-flaky--ex02p-gini-standard--t1/) |
| plan-default--ex02p-gini-standard--t1 | ex02p-gini-standard | standard | plan-default | success | 4200 | [attempt](attempts/plan-default--ex02p-gini-standard--t1/) |
| fixture-mixed--ex02p-gini-standard--t1 | ex02p-gini-standard | standard | fixture-mixed | success | 1500 | [attempt](attempts/fixture-mixed--ex02p-gini-standard--t1/) |
| calibration--cal-control-clean--t1 | cal-control-clean | standard | plan-default | success | 4200 | [attempt](attempts/calibration--cal-control-clean--t1/) |
| calibration--cal-dropped-table--t1 | cal-dropped-table | standard | plan-default | failed | n/a | [attempt](attempts/calibration--cal-dropped-table--t1/) |
| calibration--cal-malformed-diagram--t1 | cal-malformed-diagram | standard | plan-default | failed | n/a | [attempt](attempts/calibration--cal-malformed-diagram--t1/) |
| calibration--cal-over-cap--t1 | cal-over-cap | overview | plan-default | failed | n/a | [attempt](attempts/calibration--cal-over-cap--t1/) |
| calibration--cal-wrong-fact--t1 | cal-wrong-fact | standard | plan-default | success | 4200 | [attempt](attempts/calibration--cal-wrong-fact--t1/) |

## Limitations

- Latency is measured from the constructed author request to the validated card; client save, render and first-output times are not measured.
- The deterministic evaluator checks card text against frozen patterns. It catches the seeded defects but cannot establish truth for open-ended prose; disputed facts need independent or human review.
- Corpus v1 has direct-entry cases only: accepted-Tutor entry and image-attachment cases are not included.
- Cache hit/miss separation is recorded as a policy (every fixture call is an uncached scripted reply) but not exercised.
- Durations and stage times come from an injected clock (virtual in fixture runs); startedAt and endedAt fields are real wall time, so they do not add up to the durations in a fixture run.
- Every reply was a scripted provider double. Quality, latency and cost numbers describe the scripts, not any model.
- Prices in the fixture config are SYNTHETIC; the registry carries no real pricing.
