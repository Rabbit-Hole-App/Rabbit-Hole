# Geometry lint (RD-3): first run and after RD-2

Two runs of the same lint over every reference at natural width: **before RD-2** (the first run on main `65164f686`, kept in full below) and **after RD-2** (RD-2 + RD-2b: `597d05cd5 RD-2, RD-2b: merge explain/rd-2 (flow decision branches) onto the 144 candidate 5fd37acaa`, merged with the lint at `5aa7057a3`). Nothing in the renderers or references was changed by RD-3.

## After RD-2

Violations: **29** in **11** references (before: 31 in 12).

| Rule | Before RD-2 (violations / references) | After RD-2 (violations / references) |
|---|---|---|
| a | 21 / 8 | 14 / 6 |
| b | 2 / 1 | 2 / 1 |
| c | 0 / 0 | 0 / 0 |
| d | 8 / 6 | 8 / 6 |
| e | 0 / 0 | 5 / 1 |

**Baseline entries RD-2 removed (2):** `ml-logistic-regression-linear-separator rule a`, `ml-logistic-regression-model-pipeline rule a`.

**Entries that remain or are new (1 new):** `ml-what-is-machine-learning-workflow rule e`.

| Reference | Rule | Count | Example |
|---|---|---:|---|
| `figure-parallel-residual-sublayers` | b | 2 | overview: edge n:f and edge s:j: parallel wires 4 px apart over 12 px near (220, 222.5); the minimum is 6 px |
| `ml-bagging-vote-flow` | a | 1 | spec: node boot: labels of the 3 branches from boot stand at different heights: y = 87, 113, 139 (52 px apart) |
| `ml-batch-score-fallback` | a | 1 | spec: node usable: labels of the 2 branches from usable stand at different heights: y = 410, 454 (44 px apart) |
| `ml-batch-score-fallback` | d | 1 | spec: node rule: a line of its text (149.7, 495, 82.6 x 14) leaves the capsule (138, 486, 106 x 104) |
| `ml-gpu-matmul` | a | 1 | spec: node split: labels of the 3 branches from split stand at different heights: y = 87, 113, 165 (78 px apart) |
| `ml-logistic-regression-linear-unbounded` | d | 1 | overview: node c: a line of its text (29.2, 187, 100.5 x 14) leaves the capsule (14, 178, 131 x 86) |
| `ml-logistic-regression-log-loss` | a | 1 | overview: node q: labels of the 2 branches from q stand at different heights: y = 122, 148 (26 px apart) |
| `ml-robot-arm-pickup` | d | 1 | spec: node verify: a line of its text (28.9, 649, 76.2 x 14) leaves the capsule (14, 568, 106 x 104) |
| `ml-what-is-machine-learning-dataset-split` | a | 2 | standard detail: node split: labels of the 3 branches from split stand at different heights: y = 75, 101, 127 (52 px apart) |
| `ml-what-is-machine-learning-dataset-split` | d | 1 | overview: node reserve: a line of its text (28.9, 177, 76.2 x 14) leaves the capsule (14, 114, 106 x 86) |
| `ml-what-is-machine-learning-model-choice` | a | 8 | overview: node a: labels of the 2 branches from a stand at different heights: y = 111, 137 (26 px apart) |
| `ml-what-is-machine-learning-model-choice` | d | 2 | standard detail: node f: a line of its text (292, 417, 91 x 14) leaves the capsule (272, 336, 131 x 104) |
| `ml-what-is-machine-learning-workflow` | e | 5 | deep detail: labels of edge r:e and edge r:m: the two edge labels overlap (14, 32.5) and (94, 32.5) |
| `ml-word2vec-neural-predictor` | d | 2 | overview: node s3: a line of its text (26.3, 377, 81.5 x 14) leaves the capsule (14, 368, 106 x 86) |

**RD-2 side effect (a regression the lint found).** `ml-what-is-machine-learning-workflow` was clean before RD-2 (it is not in the first-run list) and now has 5 rule-e violations in its deep detail: side-branch labels of the same decision overlap (for example the labels of edge r:e and edge r:m, both at y 32.5, x 14 and x 94). It is the one baseline entry RD-2 created rather than left behind; it needs a renderer fix (labels of two side branches of one vertex must not share a span), and its baseline entry goes away with that fix.

**What RD-2 fixed.** Rule a: 21 to 14 violations (`ml-logistic-regression-linear-separator` and `ml-logistic-regression-model-pipeline` leave the baseline). Rules b and d are unchanged, as expected: RD-2 does not touch wire spacing or capsule text.

The baseline (`geometry-lint-baseline.json`) now lists only these ids and rules: the renderer work queue after RD-2.

---

# Before RD-2 (the first run)

Build: `explain/rd-3` commit `f0459165c` (the lint) on main `65164f686`. Lint: `packages/web/src/tutor-diagrams/geometry-lint.js` (pure, from the layout output), run over every reference by `geometry-lint.test.mjs`. Nothing was fixed in this release: the renderers and the references are untouched; the violations below are the baseline (`geometry-lint-baseline.json`), the renderer work queue.

### What was linted

- 468 references from `diagramReferences`, every depth (overview, standard, deep) and every detail figure, each flow at its natural width (`layoutFlow(diagram, 0)`); 63 flow diagrams (top-level, inside panels and in two-panel comparisons / visual transformations).
- Only the **flow renderer** exposes a layout object today (`layoutFlow(...).geometry`, additive: nothing in the drawn SVG changed, the SVG snapshot test passes unchanged). The other renderers are NOT covered yet; honest list of what each needs:
  - `relationship` (graph layout): wires and numbered badges are drawn in `ml-topology-layouts.js` `graph()`, labels live in a ledger below the graph, so rules (a), (c), (e) do not apply; (b) and (d) need the routes and the node cards exposed.
  - `sequence`, `cycle`, `tree`, `block-stack`, `transformation` arrows: each draws wires and labels inline without a layout object; each needs an equivalent `geometry` (nodes with text boxes, wires, label boxes).
  - Coordinate plots, matrices, heatmaps, bar charts and the rest have no wires between boxes; the rules do not apply.

### Violations per rule

| Rule | What it checks | Violations | References |
|---|---|---:|---:|
| a | edge labels of sibling branches from one node at the same y (1 px) | 21 | 8 |
| b | no two parallel wires closer than 6 px (over a shared run) | 2 | 1 |
| c | no edge-label box on a wire other than its own | 0 | 0 |
| d | no text outside its node's shape (diamond slopes, capsule ends) | 8 | 6 |
| e | no two labels intersecting (edge labels with each other and with node text) | 0 | 0 |
| | **total** | **31** | **12** |

### Per reference id and rule

One row per reference and rule: the number of violations over its depths and detail figures, and the first one with its coordinates (px, in the flow's own layout).

| Reference | Rule | Count | Example |
|---|---|---:|---|
| `figure-parallel-residual-sublayers` | b | 2 | overview: edge n:f and edge s:j: parallel wires 4 px apart over 12 px near (220, 222.5); the minimum is 6 px |
| `ml-bagging-vote-flow` | a | 1 | spec: node boot: labels of the 3 branches from boot stand at different heights: y = 87, 113, 139 (52 px apart) |
| `ml-batch-score-fallback` | a | 1 | spec: node usable: labels of the 2 branches from usable stand at different heights: y = 410, 454 (44 px apart) |
| `ml-batch-score-fallback` | d | 1 | spec: node rule: a line of its text (149.7, 495, 82.6 x 14) leaves the capsule (138, 486, 106 x 104) |
| `ml-gpu-matmul` | a | 1 | spec: node split: labels of the 3 branches from split stand at different heights: y = 87, 113, 165 (78 px apart) |
| `ml-logistic-regression-linear-separator` | a | 1 | overview: node q: labels of the 2 branches from q stand at different heights: y = 111, 137 (26 px apart) |
| `ml-logistic-regression-linear-unbounded` | d | 1 | overview: node c: a line of its text (29.2, 187, 100.5 x 14) leaves the capsule (14, 178, 131 x 86) |
| `ml-logistic-regression-log-loss` | a | 1 | overview: node q: labels of the 2 branches from q stand at different heights: y = 122, 148 (26 px apart) |
| `ml-logistic-regression-model-pipeline` | a | 2 | standard: node q: labels of the 2 branches from q stand at different heights: y = 345, 371 (26 px apart) |
| `ml-robot-arm-pickup` | d | 1 | spec: node verify: a line of its text (28.9, 649, 76.2 x 14) leaves the capsule (14, 568, 106 x 104) |
| `ml-what-is-machine-learning-dataset-split` | a | 2 | standard detail: node split: labels of the 3 branches from split stand at different heights: y = 75, 101, 127 (52 px apart) |
| `ml-what-is-machine-learning-dataset-split` | d | 1 | overview: node reserve: a line of its text (28.9, 177, 76.2 x 14) leaves the capsule (14, 114, 106 x 86) |
| `ml-what-is-machine-learning-model-choice` | a | 12 | overview: node a: labels of the 2 branches from a stand at different heights: y = 111, 137 (26 px apart) |
| `ml-what-is-machine-learning-model-choice` | d | 2 | standard detail: node f: a line of its text (292, 469, 91 x 14) leaves the capsule (272, 388, 131 x 104) |
| `ml-word2vec-neural-predictor` | d | 2 | overview: node s3: a line of its text (26.3, 377, 81.5 x 14) leaves the capsule (14, 368, 106 x 86) |

### Classes: which renderer rule causes each

### A. Branch labels of one node at different heights (rule a: 21 violations; 15 two-way branches, 6 three-way)

This is RD-2's class (flow decision branches) and it is also the fork case. In `flow.js`, `layoutFlow` gives **every outgoing edge its own horizontal lane** (`gaps[from].push(depart)`, lane height = label lines x line height + 8) and draws the edge label at that lane's y (`labelBounds`: `[to, y]` is the lane's y). Two branches of a decision therefore stand one lane apart (26 px for a one-line label), three branches two lanes apart (52 px). It affects decisions and forks alike (the `boot`, `split`, `q`, `a`/`b`/`c` nodes above); it is the largest class (8 references).

### B. Near-aligned vertical wires of different nodes (rule b: 2 violations, 1 reference at two depths)

`figure-parallel-residual-sublayers`: the wire `n:f` drops at x = 220 while `s:j` leaves its source at x = 224, 4 px apart over 12 px. Ports sit at node centres (`port()` / `portOffset()`), and nodes of adjacent tiers can have centres a few px apart (`ideal = parent.cx`, clamped), so two unrelated verticals run almost on top of each other. No minimum separation exists between wires of different edges.

### C. Text outside a capsule (rule d: 8 violations, 6 references)

Outcome nodes are drawn with `radius = height / 2` (`box(..., { radius: height / 2 })`). An outcome with four lines of text is about as tall as it is wide (106 x 104), so the "capsule" is a circle and the corners of the text block lie outside it (e.g. `ml-robot-arm-pickup` node `verify`: a 76 px line at y = 649 leaves the 106 x 104 shape). The node height is measured from the text (`lines x line height + 14`) with no allowance for the rounded ends, unlike decisions, which are measured against their slopes.

### D. Label on another wire (rule c) and labels intersecting (rule e): none today

`labelBounds` already tries eight candidate positions and refuses any that touches another wire (2 px margin), and ledger-style labels fall to a key below the graph, so no flow in the library breaks (c) or (e). The rules stay in the suite for the renderer fixes below.

### Proposed fix list (renderer tasks; not part of this release)

1. **Shared label lane for sibling branches (class A, RD-2).** Give the outgoing edges of one node the same `depart` lane when their horizontal runs go in opposite directions (the usual decision), so the labels share one y; keep separate lanes only when the two labels would overlap horizontally. Removes all 21 violations; check the snapshot rows of the 8 affected references and the 6 three-way cases.
2. **Minimum wire separation (class B).** When two vertical runs of different edges overlap in y and their x differ by less than 6 px, offset the later port or its lane by the difference (or snap both ports when they belong to one fan). Add the check to `layoutFlow` so it holds for every flow, not only this reference.
3. **Capsule text allowance (class C).** Either cap the outcome radius (for example `min(height / 2, 19)`) so tall outcomes are rounded rectangles, or measure the outcome height against the capsule ends the way decisions are measured against their slopes. Fixes all 8 violations (6 references).
4. **Expose layout objects for the other renderers** (relationship graph, sequence, cycle, tree, block-stack) and extend `geometry-lint-references.js`, then re-run: new baseline entries are not allowed, so what the extension finds must be fixed or recorded here first.

### Determinism

The lint was run twice over every reference and the outputs compared: identical (31 lines, sha256 prefix `0111788b82992d60`). The test `geometry-lint.test.mjs` asserts the same on every run.

### Baseline and how it shrinks

`geometry-lint-baseline.json` lists the 12 reference ids with their rules. The suite fails on any violation not in it (a new reference or a new figure), and also fails when a listed entry no longer occurs (fix landed: delete the entry). The pipeline linter (`scripts/topic-pipeline/checks/geometry-lint.mjs`, applied in `author-runtime.mjs` next to the content contract) reports a new reference's violations as errors in the round feedback; only these ids are tolerated, for their listed rules.
