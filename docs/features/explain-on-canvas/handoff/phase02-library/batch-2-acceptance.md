# Phase 02 reference batches 2a, 2b and 2c · live `/explain` acceptance

Owner task 2026-11-08. Real written `/explain` generation on a local test stack, one card per prompt at Standard depth. Each failure is
recorded as a failure. No reference JSON was seeded or counted as a generated card.

## Setup

- **Stack:** local test stack (`C:/s/spec/latency-lab/explainbench/stack.sh`, persist `stack-refs`) from `C:/s/explain-refs`, app
  `http://127.0.0.1:8888`, `SMALL_ENV=dev`, `EXPLANATION_MODEL_PROFILE=fireworks-low` (Fireworks gpt-oss-120b, effort low,
  temperature 0, seed 7), `EXPLANATION_FALLBACK=off` and Recraft on (`addkey-fast.cjs`). No card requested a picture.
- **Build commits:** 2a/2b ran on `d29dcb291` (explain/refs-keywords). 2c ran on `cfcd64c3c`, which is `d29dcb291` plus the
  cherry-picked 2c delta `c679771ab`, rebuilt before the stack restarted. The bench recorded zero modified tracked files for both runs.
  Prompt hash `9c98f179f1caa2c4` and schema hash `201d929aa0b47712` were the same for both builds.
- **2b source identity:** `git diff --quiet 7988753b25 HEAD` passed for each `ml-batch2b-{fits,ensembles,tuning}-references.js`, so
  all three match `chatgpt/explain-phase02-library` @ `7988753b25`.
- **Generation:** `C:/s/explain-math/scripts/explain-bench/bench.mjs` (branch explain/quality-bench). The sets were written from the
  handoffs before any run: `sets/phase02-batch.json` (13 prompts, commit `3a5f2c0fa`) and `sets/phase02-batch2c.json` (5 prompts,
  commit `1b8d9cebc`). `--depth standard`, no judge. Each card has a fresh canvas and calls `POST /api/learn/artifact` (`command: explanation`).
- **References sent:** the dev-only log line `explanation_author_raw` (`references`, `kinds`). The bench copies it into each card's
  `row.raw` in `raw/<set>/cards/<id>.json`. Restarting the stack for 2c deleted the 2a/2b `app.log` (`stack.sh start` removes it),
  so the card files are the only remaining copy of the 2a/2b raw log lines. The 2c lines are still in `stack-refs/app.log`.
- **Browser:** `C:/s/spec/benchmarks/phase02-batch/browser-check.mjs` (Playwright, headless, 1440 x 2400, the stack's
  `/test/session` for the bench's own user). `/api/learn/artifact` returns the block but does not place it on a canvas; the client
  does that (`learn-slash.js` → `AdaptiveCanvas.insertBlock` with `fit`). The script places that **generated** block on the bench's
  canvas with the same fields (`withPrompt`, new id, `dx/dy 0`, `fullLength(block, 440)`) through `PUT /api/learn/boards/<canvas>/main`,
  then opens `/apps/<canvas>` and expands the folded sections.
  - **Formulas:** no `.katex-error`, and no visible `$`, `\(`, `\)`, `\[`, `\]` or `\command` in the card's visible text
    (KaTeX MathML removed first). The check includes the suggested questions.
  - **Fit:** card `offsetWidth` 440. No text element clipped by `overflow: hidden`, and nothing drawn past the card's right edge
    outside a scroll container. A horizontal scroll is reported with what it holds. The card header's single-line ellipsis title is
    existing card chrome; it is reported separately (`titleCut`) and does not fail fit.
  - **Save/reload/reopen:** reload the page and the same block id renders, open the canvas again in a fresh browser context (no local
    storage) and it renders, and `GET /api/learn/boards/<canvas>/main` still holds the block.
  - Screenshots: `<shots>/<id>.png` (first open) and `<shots>/<id>-reopened.png`.
- **Arithmetic:** `card-arithmetic.mjs` and `card-arithmetic-2c.mjs` recompute the numbers each card states from its own saved
  diagram data. Logs: `card-arithmetic.log`, `card-arithmetic-2c.log` (all in `C:/s/spec/benchmarks/phase02-batch`).

## Harness defect found: canvas creation fails on titles over 46 characters (product, not card)

In the first 2a/2b run, five prompts got **no card because `POST /api/canvases` returned 400**:
`D1_ERROR: LIKE or GLOB pattern too complex`. No model call was made, and the stack ledger shows 8 usage actions for 13 sends. The cause
is `freeTitle` (`packages/control-plane/src/canvases.js:135`). It binds `"<title> (%)"` as a `LIKE` pattern. SQLite evaluates the
pattern only when the owner already has a canvas, and the D1 pattern limit is 50 bytes, so a second canvas whose title is over 46
characters is refused. Reproduced with `probe-canvas.mjs`: the first canvas succeeded, then the 51-byte pattern failed and the
47-byte pattern succeeded. This probably affects production, which uses the same D1 limit. It is outside this task, is reported
here, and was not fixed. The five prompts were sent again, one bench invocation each (a new user, so the first canvas always
succeeds). Those are the only generations of those prompts.

## Batch 2a + 2b results (build `d29dcb291`)

Run folders under `C:/s/spec/benchmarks/explain-bench/`: main `2026-11-08T182946-phase02-batch2-acceptance` (8 cards). The other
five each have one folder, `2026-11-08T1832xx-phase02-batch2-rerun-<id>`: feature-interaction 183203, confusion-denominators 183218,
regression-errors 183226, bayes-acquisition 183235, successive-halving 183246. Screenshots: `C:/s/spec/benchmarks/phase02-batch/shots/`.

| # | Prompt (id) | References sent (`explanation_author_raw`) | Refs | Kind (composed?) | Kind | ms | Arithmetic | Formulas | Fit | Save/reload |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ordinal-encoding | ml-ordinal-encoding | PASS | comparison[matrix, matrix] (2 panels) | PASS | 5411 | PASS | PASS | PASS | PASS |
| 2 | value-binning | ml-value-binning | PASS | comparison[matrix, histogram] (2 panels) | PASS | 5274 | PASS | PASS | PASS | PASS |
| 3 | feature-interaction | ml-feature-interaction (x2, repaired) | PASS | transformation[matrix → matrix] | PASS | 11721 | PASS | PASS | PASS | PASS |
| 4 | raw-log | ml-raw-log-distributions, log-feature-scale | PASS | transformation (item lists, no histogram) | **FAIL** | 4616 | PASS | PASS | PASS | PASS |
| 5 | confusion-denominators | ml-confusion-denominators | PASS | comparison[heatmap, matrix] (2 panels) | PASS | 4440 | PASS | PASS | PASS | PASS |
| 6 | regression-errors | ml-regression-error-metrics | PASS | comparison[coordinate-plot, matrix] (2 panels) | PASS | 6245 | PASS | PASS | **FAIL** | PASS |
| 7 | two-histograms (required kind) | ml-raw-log-distributions--part-1, --part-2 | PASS | histogram + histogram (two diagrams) | PASS | 3312 | PASS | PASS | PASS | PASS |
| 8 | repeated-fits | ml-repeated-sample-fits (x2, repaired) | PASS | comparison[coordinate-plot, coordinate-plot] (2 panels) | PASS | 9378 | PASS | PASS | **FAIL** | PASS |
| 9 | soft-vote | ml-soft-vote-probabilities, ensemble-votes | PASS | comparison[matrix, matrix] (2 panels) | PASS | 5650 | PASS | PASS | PASS | PASS |
| 10 | adaboost | ml-adaboost-weight-update, ml-feature-store-architecture | PASS | transformation[matrix → matrix] | PASS | 6124 | PASS | **FAIL** | PASS | PASS |
| 11 | stacking-oof | ml-stacking-oof-predictions, ml-stacking-flow | PASS | comparison[matrix, matrix] (2 panels) | PASS | 5617 | PASS | PASS | PASS | PASS |
| 12 | bayes-acquisition | ml-bayesian-acquisition-choice, bayesian-search-surrogate (x2, repaired) | PASS | matrix | PASS | 8351 | PASS | **FAIL** | PASS | PASS |
| 13 | successive-halving | ml-successive-halving-rounds, ml-parallel-trial-pruning | PASS | matrix | PASS | 4591 | PASS | PASS | PASS | PASS |

Prompts (the handoff tables): 1 How can ordered categories be represented by numbers? · 2 Which bucket does a number on a bin edge
belong to? · 3 Why add a feature that multiplies two inputs? · 4 What happens to a skewed distribution when we take logs? · 5 Why do
precision and recall divide by different totals? · 6 Why is RMSE bigger than MAE when one prediction is far off? · 7 Show two
histograms comparing raw and log-transformed values. · 8 Why does fitting the same model on different samples give different
predictions? · 9 How can soft voting pick a different class from the majority vote? · 10 What happens to the training weights after
AdaBoost gets one example wrong? · 11 Where do the out-of-fold predictions for the stacking model come from? · 12 How does Bayesian
optimization decide which setting to try next? · 13 How does successive halving decide which trials get more training?

Whole-card time (request to response, ms): p50 5617, max 11721 (feature-interaction, one repair). Not gated. Three of 13 cards were repaired once:

- feature-interaction: `Use a plot, matrix or sample set with a stable ID on every point, row or sample`.
- repeated-fits: `Shared axes require coordinate plots in every panel`.
- bayes-acquisition: `Teaching rows need stable IDs`.

### Failures and findings

- **References:** every card received the reference the handoff names. Two-histograms received exactly the two histogram leaf panels
  (`ml-raw-log-distributions--part-1`, `--part-2`), drew two `histogram` diagrams, and was saved without a repair. That satisfies the
  required-kind check. One wrong-ish second pick: adaboost also received `ml-feature-store-architecture`. The card did not use it.
- **4 raw-log, kind FAIL:** the card has a `transformation` with item lists (0, 1, 3, 7, 15 → 0, 1, 2, 3, 4), not the matched
  histograms the handoff asks for. The Core sketch is missing (no histogram, no bins). Its numbers are right (log2(1+x)). The caption names eight values but the diagram shows five.
- **8 repeated-fits, content FAIL (Core):** only two fits are drawn. The prose describes "the final panel as a mean line and a
  shaded range" and the caption says "These three fits", but neither the third fit nor the mean/range panel exists. The card states no
  mean or range. Both panels' numbers are consistent: predictions at x = 4 are 5 and 5.
- **10 adaboost, formulas FAIL:** the card body and the diagram render KaTeX (10 formulas). The suggested question "What determines the
  size of the coefficient `$\alpha$`?" shows raw `$\alpha$`, because suggestions are not rendered as math. Content: the prose says
  α "grows larger for higher error". That is wrong: α = ½ ln((1−ε)/ε) falls as ε rises. Its numbers (ε = 1/4, α = ln 3 / 2, weights
  1/2 and 1/6) are right.
- **12 bayes-acquisition, formulas FAIL:** the body renders 7 KaTeX formulas (the model wrote `\(...\)` delimiters, and they render).
  The suggested question shows raw `\(\kappa\)`. This is the same suggestion-rendering gap as adaboost.
- **6 regression-errors and 8 repeated-fits, fit FAIL:** at 440 px the two-panel comparison with a coordinate plot overflows 38 px into a
  horizontal scroll. The right end of each plot (x = 4, the S4 point and its label) is hidden until scrolled. Nothing is clipped and no
  other card scrolls. These are simple two-panel plots, not dense diagrams, so this is reported as a fit failure. Reclassify it as
  acceptable scroll if the renderer's comparison minimum width is intended.
- regression-errors states the totals (6 and 12) and RMSE > MAE but does not print MAE = 1.5 or RMSE = 1.732. Its arithmetic is
  correct, and the Core sketch is only partly met.
- **Card title chrome:** the title is cut with an ellipsis on 11 of 13 cards (for example "Effect of a Mis-classified Example...").
  This is existing header behavior and was not counted as a fit failure.

### Each card's own arithmetic (`card-arithmetic.log`)

These are recomputed from each card's own data, not the reference values. 33 checks passed. Two failed on statements, not
arithmetic, and are counted under content above: the repeated-fits third fit and mean/range panel are missing, and the adaboost
α-direction claim is wrong.

- ordinal codebook used by every row.
- binning [a, b) with closed last bin: 5→0, 12→1, 19→1, 20→2, 26→2, 39→3, 40→3; counts 1, 2, 2, 2 = histogram.
- interaction product column x1·x2 per row.
- raw-log log2(1+x) items.
- precision 80/90 = 88.89%, recall 80/100, specificity 90/100 from the card's heatmap.
- regression line y = x + 1, residuals 1, −1, 1, 3, |e| total 6, e² total 12.
- two-histograms counts 6, 1, 0, 1 and 2, 2, 2, 2 recomputed from the stated values.
- soft vote 2–1 hard, 38.33% / 61.67%.
- adaboost ε 1/4, α ln 3 / 2, weights 1/2, 1/6.
- stacking folds partition the rows.
- UCB = μ + σ, C 0.83 wins, B best mean.
- halving top-half picks and 4 + 2 + 2 = 8 trial-epochs.

## Handoff stated values (`stated-values.mjs`)

All 18 match:

- 2b soft vote: 61.67% (hard vote A 2–1).
- AdaBoost: error 1/4, coefficient ln(3)/2, weights 1/2 and 1/6.
- UCB: third candidate 0.83, and it is the argmax.
- Repeated fits: predictions 5, 5, 8, mean 6, range 5–8.
- 2a confusion matrix: precision 80/90, recall 80/100, specificity 90/100.
- 2a regression errors: MAE 1.5, MSE 3, RMSE 1.732.

No reference defect.

## Spend

2a/2b: US$0.0396 settled on the stack ledger for 13 cards (8 + 5 reruns; the five no-canvas sends made no call). The bench's own
total for the first run (US$0.0622) counts a US$0.008 estimate for each no-canvas send, but no call was made. Cap US$0.50.

## Batch 2c results (build `cfcd64c3c` = `d29dcb291` + cherry-pick of `c679771ab`)

The 2c delta applied cleanly. The focused 2c tests passed 12/12 (`explanation-reference-batch2c.test.js` and
`ml-batch2c-{elimination,imbalance,psi}.test.mjs`); no other suite was run. The stack was rebuilt and restarted on this head, and each
prompt ran in its own bench invocation. Run folders: `C:/s/spec/benchmarks/explain-bench/2026-11-08T1850xx-phase02-2c-<id>`
(accuracy-trap 185008, undersampling-removes 185015, rfe-refit 185020, psi-bins 185027, undersampling 185035). Screenshots:
`C:/s/spec/benchmarks/phase02-batch/shots-2c/`. The raw lines are in `stack-refs/app.log` and in each card's `row.raw`.

| # | Prompt (id) | References sent | Refs vs expected | Kind (composed?) | Kind | ms | Arithmetic | Formulas | Fit | Save/reload |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | How can a classifier get 95% accuracy and still miss every minority case? (accuracy-trap) | ml-minority-accuracy-trap | PASS | comparison[heatmap, matrix] (2 panels) | PASS | 4023 | PASS | PASS | PASS | PASS |
| 2 | What does majority undersampling actually remove from the training set? (undersampling-removes) | ml-majority-undersampling, ml-feature-store-architecture | PASS (as predicted; 2nd pick wrong-ish) | sample-set | PASS | 2925 | PASS | PASS | PASS | PASS |
| 3 | Why does recursive feature elimination refit after each drop? (rfe-refit) | ml-recursive-feature-elimination | PASS | matrix | PASS | 3376 | PASS | PASS | PASS | PASS |
| 4 | How do I calculate the population stability index one bin at a time? (psi-bins) | ml-psi-bin-contributions, aligned-distribution-drift | PASS | comparison[histogram, matrix] (2 panels) | PASS | 5949 | PASS (numbers); prose **FAIL** | **FAIL** | PASS | PASS |
| 5 | Explain undersampling. (undersampling) | ml-majority-undersampling | PASS | sample-set | PASS | 3078 | PASS | PASS | PASS | PASS |

No repairs and no pictures. Whole-card time: p50 3376 ms, max 5949 ms. Not gated.

### Findings

- **References:** all five match the coordinator's offline selector result. `ml-feature-store-architecture` was again sent as a
  second pick for a "training set" question (as it was for AdaBoost's "training weights"). The card did not use it.
- **Arithmetic** (`card-arithmetic-2c.log`, from each card's own data, 17/19 checks passed):
  - accuracy-trap: accuracy 95/100 = 95% and minority recall 0/5 = 0% from its heatmap (95, 0 / 5, 0).
  - Both undersampling cards: 6 majority and 2 minority before, both minority rows and A2, A5 kept, omitted A1, A3, A4, A6 (disjoint, all majority), and the prose names the same rows.
  - rfe-refit: drops the lowest each time (D, then B), each refit holds exactly the survivors, C (0.30) is below B (0.60) before the
    refit and above it after (0.40 vs 0.22), and it stops at A, C.
  - psi-bins: table shares equal the histogram shares and each set sums to 1. Its terms and total equal the owner-verified 0.0347,
    0.2452, 0, 0.4159 and 0.6958; per the owner, these were not recomputed here.
- **psi-bins, two prose errors:**
  - "Positive values mean the current share exceeds the reference, negative values mean it is lower" is wrong: every term
    (q−p) ln(q/p) is ≥ 0. Its own [0, 1) and [1, 2) bins fall yet contribute +0.0347 and +0.2452.
  - "PSI of 0.70 suggests moderate shift" contradicts the usual reading that PSI > 0.25 is a significant shift.
- **psi-bins, formulas FAIL:** the prose formula is written `$ (q-p)\ln\frac{q}{p}$`, with a space after the opening `$`, so the card
  shows it as raw text. The diagram's formulas render (9 KaTeX elements).
- **Undersampling rendering note (reference design, not a card failure):** the sample-set "After" group reads "4 draws · 4 unique" and
  "A2 × 1", which is resampling wording for a plain subset. The omitted IDs line is correct.
- Card title ellipsis on 3 of 5 cards, as in 2a/2b (header chrome, not counted).

### Spend

2c: US$0.0098 settled on the stack ledger for 5 cards (cap US$0.30). Total for 2a, 2b and 2c: US$0.0494.
