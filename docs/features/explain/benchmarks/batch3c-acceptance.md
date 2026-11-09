# Batch 3C live acceptance (prepared, not run)

Run after the clean-up run is read, with the rest of the Codex integration (owner 2026-11-08). Balanced depth, each prompt once and each paraphrase once (10 cards), cap US$0.30. Reference registry on this branch: 173 live (164 before 3B and 3C, +4 anomaly detection, +5 ML system design). Fixture: `packages/control-plane/test/fixtures/explanation-reference-batch3c-cases.json`.

Offline checks already done on this branch (no model): the ten prompts select their intended reference (`explanation-reference-batch3c.test.js`, 5 pass); selector picks on the 252 labelled prompts of every bench set are unchanged against `explain/cleanup`; the five specs lint clean; the stated values recompute (`node scripts/explain-bench/batch3c-values.mjs`: 10 of 10).

## The ten cards

| # | Prompt (P) / paraphrase (V) | Reference expected in the request | Planned and drawn kind |
|---|---|---|---|
| 1 | P: How does a churn prediction turn into an action that helps reduce cancellations? | `ml-churn-goal-prediction-decision` | flow |
| 2 | V: How do I turn the goal of reducing churn into a prediction and a decision? | same | flow |
| 3 | P: How is predicting on a schedule different from predicting when a request comes in? | `ml-batch-vs-online-inference` | **sequence** (actors job, model, store, app) |
| 4 | V: What changes between batch inference and online inference? | same | sequence |
| 5 | P: How do I compare the latency and cost of batch and online predictions? | `ml-serving-latency-cost` | matrix (teaching layout, 2 columns x 5 rows) |
| 6 | V: How much does model serving cost for batch and real-time predictions on the same traffic? | same | matrix |
| 7 | P: When would I shadow a new model, canary it, or run an A/B test? | `ml-shadow-canary-ab-rollout` | comparison (3 columns) |
| 8 | V: What's the difference between shadow deployment, a canary rollout, and an A/B test for a model? | same | comparison |
| 9 | P: How should a churn system keep working if its nightly scoring job fails? | `ml-batch-score-fallback` | **flow with decisions** |
| 10 | V: When should we stop serving old scores after a batch scoring failure and switch to a rule? | same | flow with decisions |

## Per-card pass / fail (write each result, keep failures)

1. **Reference sent:** the log line or the request shows the reference id above (one example, the planned kind first).
2. **Kind:** the planner's kind and the card's drawn kind match the table. Report the planner kind for all ten (owner: batch vs online should be `sequence`, fallback a `flow` with decisions).
3. **Numbers on its own data:** every number on the card comes from the reference (labelled illustrative) or is computed from numbers the card states; none invented. Cards 5 and 6 (matrix): the card must label the serving numbers **illustrative** (N1: a worked example is allowed only from a selected reference and only if labelled). Recompute what the card states by hand against `batch3c-values.mjs` (50 offers; 25 h; 0.40 + 0.50 = 0.90 USD/day; 3 x 0.50 x 24 = 36 USD/day; 500 QPS needs 3 x 200-QPS replicas).
4. **Formula rendering:** any `$...$` in labels and prose renders (no raw dollar signs, no katex error).
5. **Narrow card:** at 320 px the card has no sideways scroll for the flow, sequence and comparison; the 5-row matrix (cards 5, 6) is checked especially (prices, QPS and latencies are dense): readable, no clipped cell.
6. **Save, reload, reopen:** save the card, reload the canvas, reopen: the same diagram and prose, no repair artefacts.

Pass = all six for a card; the batch passes when 9 of 10 cards pass and no card fails 3 or 6. Record planner kind, reference sent, drawn kind and pass or fail per card in the ledger row "batch 3c integration + live acceptance", with the registry count after (173).

## Stated-value defects (from `batch3c-values.mjs`)

None: 10 of 10 stated values recompute. Not a check the script makes: "idle at least 14 days" (fallback rule) and the 4 ms / 35 ms latencies are Codex's illustrative inputs.
