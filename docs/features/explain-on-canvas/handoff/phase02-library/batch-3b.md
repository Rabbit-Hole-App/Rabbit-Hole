# Phase 02 reference batch 3B · Anomaly detection

Task `415593a1-ee54-4e1e-a7f3-2c6f02394ac1` on `chatgpt/explain-phase02-library`. This batch covers the four Lesson 16 gaps in the audit. The data in the worked examples are illustrative. [Lesson 16 at the audited revision](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/16-anomaly-detection/docs/en.md)

## References

| Learner question | Reference and expected evidence |
| --- | --- |
| Why do z scores in the tails get flagged as anomalies? | One standard-normal curve marks both tails. Flag when the absolute z-score exceeds 3. Under this distribution the two tails together hold about 0.27% of probability. [SVG](references/ml-zscore-distribution-tails.svg) · [JSON](references/ml-zscore-distribution-tails.json) |
| How does local outlier factor compare a point with its neighbours? | Two rows on the same horizontal scale show probes with the same nearest gap of 4. At two neighbours, the dense row's probe has reachability distances 4 and 5 and LOF 3. The sparse row's probe has distances 4 and 4 and LOF 1. [SVG](references/ml-local-outlier-factor.svg) · [JSON](references/ml-local-outlier-factor.json) |
| How can several normal readings in a row be a collective anomaly? | Counts of 0–5 are ordinary in isolation. Six consecutive counts of 5 at minutes 7–12 meet the sequence rule. The first alert occurs at minute 12. [SVG](references/ml-collective-anomaly-run.svg) · [JSON](references/ml-collective-anomaly-run.json) |
| How do I rank anomaly scores and decide which cases to review? | One ranked bar chart keeps the five scores fixed. At a minimum score of 0.75 review A and B. At 0.85 review A alone. [SVG](references/ml-ranked-anomaly-scores.svg) · [JSON](references/ml-ranked-anomaly-scores.json) |

The four single-diagram examples use the existing `coordinate-plot` and `bar-chart` renderers. They are registered after Batch 3A with the previous 150 entries in their original relative order. The separate offline catalogue now contains 178 worked references.

## Measured selector gaps

The table shows the first reference from the production selector on the rebased baseline. The observation band, isolation tree and Gaussian mixture reference teach related mechanisms. The Lesson 16 examples fill the specific gaps identified below. [Probe wording](../../../../../packages/control-plane/test/fixtures/explanation-reference-batch3b-cases.json)

| Learner intent | Original prompt's first pick | Paraphrase's first pick |
| --- | --- | --- |
| See how a z-score cutoff splits a normal distribution into tails | `zscore-anomaly-band` | None |
| Compare a point's local density with its neighbours | None | `gmm-elliptical-components` |
| Understand a run of individually ordinary readings | `ml-isolation-tree` | None |
| Rank scores and apply a review cutoff | `ml-isolation-tree` | `ml-isolation-tree` |

The intended new example was the first pick in **8/8** prepared author requests. On the first replay, “LOF” tied with “density” and the Gaussian-mixture example won the tie. The LOF reference now has a specific matching phrase. Full selections stayed identical on five nearby anomaly/clustering prompts and the **42 original and 210 paraphrased** benchmark prompts. [Set 3 benchmark replay](set3/README.md#paraphrase-benchmark)

## Local verification

- The focused web and control-plane suite passed **899 tests**, including independent numeric checks, parser round trips, the content linter and prepared author requests. The web build passed. [Focused replay commands](README.md#focused-local-checks)
- SVG regression captured **597 snapshots** at requested widths of 320, 408 and 720 px. All 585 earlier fingerprints and dimensions match `bfaeea141`. The 12 additions cover the four diagrams. The annotated plots use the existing 420 px minimum at the narrower requests.
- The committed JSON and SVG pairs use the production renderer. To view these four diagrams with the embedded fonts and KaTeX stylesheet, export a fresh gallery and open its `index.html`.

```bash
node packages/web/scripts/export-explanation-references.mjs /tmp/rabbit-hole-phase02-gallery
```

Live `/explain` generation and browser acceptance remain pending. For a dev pass, replay each learner question and check the rendered mechanism and arithmetic above. The learner's own data should take precedence when supplied.

## Remaining Batch 3 work

Batch 3C covers ML system design. The two remaining Batch 3 gaps are in feature stores. [Batch 3C](batch-3c.md) · [Coverage audit](coverage-audit.md#recommended-build-order)
