# Review of demo-lesson04

## Reviewer audit (owner's reviewer, 2026-11-09)

Audit of the first pack on the 118 merge stack 98e3d9726 (13 bare Balanced cards). Recorded as given.

- **SHIP:** 01, 02, 03, 04, 06, 07, 10, 11, 12, 13.
- **REGENERATE 05** (ml-trees-grown-tree): the author drew `ml-tree-split-path` as an outline instead of `ml-trees-grown-tree`.
- **REGENERATE 09** (ml-trees-bootstrap-roots): label-rebuilt card, 6-draw sample.
- **08** (ml-trees-regression-step-fit): the card is the reference copied, but the reference labels 16 leaves as depth 5 (that is depth 4). Codex is relabelling: pull his commit and redeploy the preview when it lands, no other change.

Findings for the ledger, no action today:

- (a) When two topical references of the same kind are sent (05: `ml-trees-grown-tree` and `ml-tree-split-path`) the author can take the wrong one. On an exact-prompt steer, consider sending only the steered reference plus the shape example (to be measured later, NOT in 118).
- (b) A reference's label defects propagate verbatim (11 inherited "Parallel:" / "Merge:").

The skeleton below is for the lead to fill.

To be filled by the lead after reading every card.md and visual. Columns: **kind** = the drawn kind against the expected one; **complete** = what the reference shows is on the visual; **labels** = placeholders, duplicates, maths outside `$...$`; **numbers** = values on the visual against the prose; **points** = the prose tells the reader what to look for.

| # | Card | Kind | Complete | Labels | Numbers | Points at visual |
|---|---|---|---|---|---|---|
| 01 | [ml-trees-decision-regions](01-decision-regions/card.md) | | | | | |
| 02 | [ml-trees-gini-vs-entropy](02-gini-vs-entropy/card.md) | | | | | |
| 03 | [ml-trees-gini-split](03-gini-split/card.md) | | | | | |
| 04 | [ml-trees-threshold-search](04-threshold-search/card.md) | | | | | |
| 05 | [ml-trees-grown-tree](05-grown-tree/card.md) | | | | | |
| 06 | [ml-trees-depth-overfit](06-depth-overfit/card.md) | | | | | |
| 07 | [ml-trees-cost-complexity-pruning](07-cost-complexity-pruning/card.md) | | | | | |
| 08 | [ml-trees-regression-step-fit](08-regression-step-fit/card.md) | | | | | |
| 09 | [ml-trees-bootstrap-roots](09-bootstrap-roots/card.md) | | | | | |
| 10 | [ml-trees-bootstrap-coverage](10-bootstrap-coverage/card.md) | | | | | |
| 11 | [ml-trees-majority-vote](11-majority-vote/card.md) | | | | | |
| 12 | [ml-trees-forest-size-accuracy](12-forest-size-accuracy/card.md) | | | | | |
| 13 | [ml-trees-feature-importance](13-feature-importance/card.md) | | | | | |

## Notes under the body (not the visual)

- 09 bootstrap-roots: body contradicts the visual the model had just written: prose says 6 rows and names C, E, G, H as omitted while the diagram shows them drawn; same defect class as batch-02 card 06; author-prompt rule #8c, separate measured run.
