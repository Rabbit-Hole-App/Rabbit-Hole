# Phase 02 reference batch 2A — Lessons 08 and 09

**Goal:** Build the first six references from the approved 16-item batch-2 list, verify them, update the coverage tracker and push.

**Architecture:** Extend the existing written `/explain` reference registry. Reuse its teaching matrices, histograms, plots, comparison panels and identity-preserving transformations, public schema, actual SVG renderer and exact `teaching-theme.js` palette. This changes author examples, not renderer kinds or card controls.

**Spec:** [Remaining Phase 02 coverage](../../features/explain-on-canvas/handoff/phase02-library/coverage-audit.md), lesson rows 08–09. The owner approved starting with these four feature-engineering and two evaluation references.

## Ownership and interfaces

Every module exports `references` using the existing `{id, lessons, prompts, keywords, useWhen, spec}` contract. Agents work in isolated worktrees; integration owns shared files.

| Lane | IDs | Owned files in `packages/web/src/tutor-diagrams/` |
| --- | --- | --- |
| Encoding | `ml-ordinal-encoding`, `ml-value-binning` | `ml-batch2a-encoding-references.js`, `ml-batch2a-encoding.test.mjs` |
| Transforms | `ml-feature-interaction`, `ml-raw-log-distributions` | `ml-batch2a-transform-references.js`, `ml-batch2a-transform.test.mjs` |
| Integration | `ml-confusion-denominators`, `ml-regression-error-metrics` | `ml-batch2a-evaluation-references.js`, `ml-batch2a-evaluation.test.mjs`; registry, backend selection tests, gallery, docs and publication |

## Teaching and mathematical contract

- Ordinal encoding states a meaningful order and maps each observed category consistently. Codes express rank, not measured equal distances; nominal categories must not acquire a fabricated order.
- Binning states its boundary convention and shows exact membership and conserved counts, including a value on an internal edge and the final edge.
- Feature interaction shows an actual product feature with its input rows, derived values and a meaningful effect. Sample identities remain visible.
- Raw/log distribution panels use exactly the same observations. State the log transform and legal domain, compute the bin counts independently, and do not imply that logs always create normal data.
- Confusion metrics reuse the existing `confusion-matrix-counts` data: actual rows, predicted columns; precision uses predicted positives, recall actual positives, specificity actual negatives. Show the correct numerator and denominator for each.
- Regression metrics use one shared set of residuals with an actual larger miss. Extend the existing three-point residual example by a fourth point; compute absolute and squared errors, sums, MAE, MSE and RMSE, preserving the distinction between signed residuals and error magnitudes.

## Verification and delivery

- [x] Add the six records with focused independent numeric checks, valid saved JSON, actual SVG rendering, and readable compact tables. Mathematical expressions use existing KaTeX support; no custom UI or palette.
- [x] Register all six. Check documented normal prompts and genuinely different paraphrases through actual author-message preparation, within the existing reference-context limit.
- [x] Export JSON/SVGs and inspect all six rendered scenes. Static conversion does not establish browser/KaTeX glyph acceptance.
- [x] Run affected diagram/reference/author checks and the web build; no broad CI or model calls in this content batch.
- [x] Update coverage, counts and Claude's dev handoff. Keep live generated-card acceptance pending.
- [x] Commit and push `chatgpt/explain-phase02-library`; verify the published tree matches the checked local tree.

## Review focus

Check ordinal meaning, bin-edge inclusion, row identity, original/log bin counts and domains, confusion-axis orientation and denominators, residual sign versus magnitude, rounding and metric units, distinct paraphrase selection and legibility without broken digits. The remaining ten items in batch 2 stay open after this six-reference delivery.

## Implementation adjustment and local receipt

The actual author-message test showed that explicitly requiring a histogram excluded the matching raw/log comparison. The bounded selector now excerpts matching leaf diagrams from comparisons and visual transformations as standalone valid examples. This preserves strict required-kind validation and leaves renderer/schema/routing/budgets unchanged. A failing-before/passing-after test covers the two raw/log histogram leaves, and another covers transformation matrix leaves. A distinct feature-interaction paraphrase also exposed a missing keyword phrase, now included.

Final local verification: 452/452 focused tests and the web build pass; all 146 references exported; all six new scenes statically inspected. Independent review reported no critical or important findings and checked an additional 124 whole/excerpt selections. See [the batch handoff receipt](../../features/explain-on-canvas/handoff/phase02-library/batch-2a.md#local-execution-receipt--2026-11-09) for the browser/formula and live-generation limitations.

Implementation published as `086cf065709248e2eb6c7a45abc748da65bae3ba`. The remote branch head and tree were read back: tree `fd646483a2646f202f83efebf83161bc1d09bcc2` exactly matches the checked local implementation tree. This completion receipt changes documentation only.
