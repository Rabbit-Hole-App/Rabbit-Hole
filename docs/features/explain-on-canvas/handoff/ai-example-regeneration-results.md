# AI teaching examples regenerated through the real `/interactive` backend (2026-11-08)

Backend generation results only. Visual and browser acceptance of the generated cards is **pending** (Codex tests the committed outputs next); the hand-authored fixtures (`ai-*-fixture.js`) are the reference and were not used, copied or seeded.
Handoff: [ai-example-regeneration-handoff.md](./ai-example-regeneration-handoff.md). Branch `regen/ai-examples`.

## How the runs were made

- Environment: dev clone `rabbit-hole-web-dev-tc-s7d2`, deployed from commit `b19e8b18f` (the integrated `/interactive` line: heat grid SDK 3, Medium SDK 4, cyclic SDK 5, raster SDK 6, the AI teaching fixtures, and the author rule naming the Medium helpers).
- Path: the canvas composer's Send button with `/interactive <prompt>`, then the brief's **Generate**: the real brief, author, review and repair stages. Model on every call: `claude-opus-5-5`. No fixture was seeded, copied or edited into a result.
- Routing: an explicit `/interactive` resolves in the router as `via: command`, capability `explain` (no classifier call, no model cost). The browser made no `/api/learn/chat/route` request for it. The same router call replayed for plain words answers `via: fallback`, code `unavailable`: the dev clone has no router classifier key, so plain-words routing to `/interactive` could not be exercised. Both decisions are in each record.
- Budget: the existing approved pool (the $3.10 left of the $9.00 cap). Spent on these five generations: **$1.559** (limit guard $0.95 reserve per job).

## Results

| Case | Prompt (handoff, verbatim) | Job | Outcome | Cost | Calls | Review findings |
|---|---|---|---|---|---|---|
| Convolution | "Show a 3 × 3 kernel sliding across a synthetic 5 × 5 image. …" | `ej_fe8805dff2fe43e3a7480fa70925685e` | **card, accepted, first attempt** | $0.256 | brief, author, review | 1 minor (horizontal-edges kernel not shown in a sampled capture; source correct) |
| Attention | "Explain one scaled dot-product attention row for three synthetic tokens. …" | `ej_8a536a2c5188420bb3d394cd1e2fca70` | **card, accepted, first attempt** | $0.213 | brief, author, review | 2 minor |
| Gradient descent, run 1 | "Show gradient descent from w = 3 on L(w) = w²/2. …" | `ej_5c50212fc4e545f4b3912364e41caadd` | **failed**, `unsupported_repair` | $0.345 | brief, author, review, repair | 1 major visual (points hidden under the enlarged current-point marker at η = 1.2), 2 minor |
| Gradient descent, run 2 | same prompt | `ej_94a55d38f78144e1a27fafd0be66b0d2` | **failed**, `unsupported_repair` | $0.338 | brief, author, review, repair | 3 major visual (steps 4–8 overlap near the minimum, label collisions), 4 minor |
| Decision-tree split | "How does a decision tree choose where to split? …" | `ej_005698df108f46a4a90f40cb250dc7fa` | **failed**, `unsupported_repair` | $0.407 | brief, author, repair, review | 2 minor (entropy not sampled in the captures; a marker covers the y-axis "0") |

| Decision-tree split, **plain words through the router** | same prompt, no slash command | `ej_98db85deeebe4a1d95625808e741f276` | **card, accepted, round 3** (238 s) | $0.718 | brief, author, repair, repair, review, repair, review | rounds: invalid manifest (`targets` missing), frame over 60 objects, then 2 major visual (cutoff line through the point at x = 2.9) and minor findings, all repaired; the last review accepted |

Routing for the last row (recorded in the browser): `capability:explain`, `via: jev`, flow `direct`, confidence 0.84, probability 0.85, model `jev-1.13.0`, transport `direct`. That needed the router fix on branch `fix/chat-route-usage` (611e1e55c, deployed to the dev clone only): `/api/learn/chat/route` had no usage context, so the ledger refused its paid classifier call (`payer_unavailable`) and plain words fell back. The generation models were all `claude-opus-5-5`.

Failures are kept as failures. Nothing replaced them with a hand-authored card.

### What the failures show (reported precisely, nothing changed)

- **Gradient descent, both runs:** the reviewer's major finding is real (the request says "all points visible", and the points near the minimum overlap or sit under the current-point marker). The findings are marked `specRepairable: true`, yet the repair stage records **"The repair returned no program."** and the job stops with `unsupported_repair` ("the repair step cannot make this change"). This is the same repair dead end seen in the earlier SDK check. Not addressed here: the handoff excludes repair-budget and planner work.
- **Decision tree:** the author's first program was invalid (`manifest.targets: expected array, received undefined`). The repair fixed it and the second program rendered, but the reviewer still rejected it on two **minor** findings, and the job ended `unsupported_repair` with no repair round left. A job with only minor findings is accepted in the convolution case (`accepted: true` with one minor finding), so the rejection rule is not obvious from the records. Worth a look by whoever owns the review policy.
- **Decision tree, second run (plain words):** accepted in round 3 after three repairs; the same prompt that failed with the explicit command. Two runs of one prompt gave one failure and one accepted card, so the pipeline is not deterministic per prompt.
- **Helpers:** none of the five generated programs used a newer helper (`sdk.raster`, `sdk.trace` and so on). All use only `sdk-2` generic helpers (`box`, `text`, `circle`, `line`, `polyline`, `arrow`, `math`, `format`, `clamp`). The prompts did not need a raster. The author context does expose the helper signatures (authoring context only), so no missing connection was found for these prompts.

## Numerical acceptance (offline, free, from each program's own data)

`packages/web/src/explain-program/ai-generated.test.mjs` (10 tests, all pass):

- **Convolution:** from the generated card's own 5 × 5 image and three kernels, every window (row 0–2 × column 0–2) and kernel gives the cross-correlation sum, the nine pixel × weight products, the whole 3 × 3 output map and the box blur divided by 9; the corner window (2, 2) is checked explicitly. Stride 1, no padding, kernel not flipped.
- **Attention:** from the card's own Q, K, V and d_k = 2: scores equal q·k/√d_k, blocked keys (later tokens with the mask on) get weight exactly 0, allowed weights sum to 1, and the output is Σ w·v, for all three queries and both mask settings.
- **Decision tree (rejected candidate, its own data):** the card uses its own **12-point** dataset, not the 10-point reference, so the reference answers (Gini 9, entropy 15) do **not** apply. Computed from its own data: for every tested cutoff, both criteria, the left and right class counts, impurities, weighted impurity and gain match; both criteria pick cutoff **4.55** (gain 0.2222 Gini, 0.3500 entropy). **Reveal** adds the best-cutoff line, label and gain marker for the active criterion and keeps the learner's own cutoff line, label and gain marker; a second press hides the best split.
- **Decision tree (ACCEPTED card, plain words, its own data):** same 12-point dataset layout as above (6 A, 6 B). For every tested cutoff and both criteria the left and right class counts, weighted impurity and gain match, and the card's best cutoff equals the minimum weighted impurity over midpoints. Reveal draws the best marker (`bestline`, `bestlabel`, `bestpt`) and keeps the learner marker (`cut`, `cutlabel`, `youpt`); `hide` removes the best marker. Reference answers (Gini 9, entropy 15) do not apply to a 12-point set.
- **Gradient (rejected candidates):** w at step t equals 3(1 − rate)^t and the loss equals w²/2 for the four rates and steps 0–8 in both runs. The failure is visual, not numerical.
- Integrity: rebuilding each accepted artifact from its saved manifest and source reproduces the stored `bundleHash`.

## Committed artifacts

| Path | What |
|---|---|
| `packages/web/src/explain-program/testdata/generated-ai-convolution.json` | record + the accepted artifact exactly as the backend stored it |
| `…/generated-ai-attention.json` | same |
| `…/generated-ai-gradient-run1.json`, `…/generated-ai-gradient-run2.json` | failure records: prompt, routing, job, calls and cost, review findings, `rejectedCandidate` (the last generated program the reviewer rejected) |
| `…/generated-ai-tree-split.json` | failure record and `rejectedCandidate` (explicit-command run) |
| `…/generated-ai-tree-split-routed.json` | record + the accepted artifact from the plain-words routed run, with the recorded and replayed routing decisions |
| `packages/web/src/explain-program/ai-generated-fixtures.js` | the dev fixtures: `fixture-generated-ai-convolution`, `fixture-generated-ai-attention`, `fixture-generated-ai-tree-split` (accepted) and `fixture-generated-ai-gradient-run1-rejected`, `…-gradient-run2-rejected`, `…-tree-split-rejected` (NOT accepted results: the generated program a failed job produced, kept so it can be run and looked at without another model call) |
| `packages/web/src/explain-program/ai-generated.test.mjs` | the acceptance tests above |
| `packages/web/scripts/seed-dev-fixture.mjs` | seeds a dev canvas with one fixture card |

The generated fixtures are separate from `AI_TEACHING_FIXTURES` (the hand-authored reference). `program-card.js` resolves both lists; a generated entry may carry its own `stamps` so the card is sealed exactly as the backend sealed it (`sdk-2` here).

## Replay (no model call)

```
node --test packages/web/src/explain-program/ai-generated.test.mjs
node --test packages/web/src/explain-program/ai-*.test.mjs packages/web/src/explain-program/state-contract.test.mjs
RABBIT_HOLE_DEV_TEST_BYPASS=<dev bypass> node packages/web/scripts/seed-dev-fixture.mjs fixture-generated-ai-convolution https://rabbit-hole-web-dev-<worktree>.tryrabbithole.workers.dev
```

Deploy the branch to your own dev clone first (the dev build admits fixture cards). Open the printed URL signed in with a dev test session (`packages/web/e2e/dev-cp.mjs`). Replace the fixture id with any id above.

## Status

- Backend generation: convolution, attention and the plain-words decision tree generated and accepted; gradient descent (twice) and the explicit-command decision tree run failed in the pipeline.
- Numerical acceptance of the generated programs: passes (offline tests above).
- **Visual, interaction and saved-state acceptance of the generated cards: pending** (not done here; Codex tests the committed outputs). Not evidence of generated-card quality beyond what is stated.

## Phase 02 generation cases (2026-11-08)

Reference fixtures: `chatgpt/phase-02-ml-examples` at `679cd64c`. Prompts verbatim from the handoff table "Phase 02 generation cases", sent as **plain words** from the composer of the dev clone `rabbit-hole-web-dev-tc-s7d2` (build of `fix/chat-route-usage` 611e1e55c, which adds the router usage context), so each went through the chat router and then the normal brief, author, review and repair pipeline. Nothing was seeded or copied from the reference fixtures; they are separate artifacts.

| Case | Routing (recorded in browser) | Job | Outcome | Cost | Calls |
|---|---|---|---|---|---|
| Classifier Threshold Explorer | `capability:explain` via `jev`, flow `direct`, 0.89 / 0.90 | `ej_c1f8049d258747e2b726d4c1b47657ec` | **card, accepted at round 0**, no review findings (92 s) | $0.244 | brief, author, review |
| Regression Fit Explorer | `capability:explain` via `jev`, flow `direct`, 0.81 | `ej_86503b55d3834ad1b1d38545cd1ce8f7` | **failed**, `unsupported_repair` after round 3 (266 s) | $0.717 | brief, author, repair, review, repair, review, repair |
| K-means Stepper | not run | none | **blocked: generation budget** | $0 | none |

Models: `claude-opus-5-5` for every call. SDK line of the accepted card: `sdk-2`.

**Regression failure.** The first program was invalid (`manifest.actions` missing); after repair the reviewer rejected it twice on **major** visual findings: the off-scale squared-error labels over P5 and P6 overlap, the squares stack and overlap with large slope or intercept, and the "P4" square label sits on point 4 and runs into it. The last repair returned no program, so the job stopped with `unsupported_repair`. The last generated program is kept as the rejected candidate `fixture-generated-ai-regression-fit-rejected` (not an accepted result). Offline it is also not drawable at two input extremes: slope 1.5 with intercept 5, and slope 0 with intercept -2, produce 62 and 61 objects, over the 60-object frame limit, so the frame is refused.

**K-means blocker.** The generation spend for this task was drawn from the earlier $3.10 pool. After the decision-tree run ($2.277 in total) the classifier cost $0.244 and the regression job $0.717, which brings the total to **$3.238, $0.138 over the $3.10 pool**; a running job cannot be capped, and the regression job needed three repairs. K-means was therefore not started. It needs a fresh budget decision (a typical accepted card here costs $0.21 to $0.26; a card needing repairs about $0.72).

### Numerical acceptance (offline, from each card's own data)

`ai-generated.test.mjs` (13 tests, all pass):

- **Classifier (accepted card):** from the card's own ten scores (two positives): for every score, every score plus 0.001, and the cutoffs 0, 0.1, 0.5, 0.7 and 1, the four counts, recall and accuracy match; a score equal to the cutoff counts as positive; with no positive predictions precision is absent and the card's text says undefined. Lowering the cutoff across the second positive catches it and does not reduce false alarms. The card uses its own scores, so the reference numbers (0.70 to 0.50 adds two false alarms) do not apply.
- **Regression (rejected candidate):** at four slope and intercept settings, each residual segment is at the x of its point and ends at the prediction for that x; the six squared residuals, their sum and MSE (sum divided by six) match; each bar value equals its squared residual; selecting a point reports its own error and selecting it again clears it.

Visual, interaction and saved-state acceptance of both cards is **pending** (Codex tests the committed outputs).

### Phase 02 artifacts and replay

| Path | What |
|---|---|
| `packages/web/src/explain-program/testdata/generated-ai-classifier-threshold.json` | record + accepted artifact exactly as stored |
| `…/generated-ai-regression-fit.json` | failure record + `rejectedCandidate` |
| `ai-generated-fixtures.js` | `fixture-generated-ai-classifier-threshold` (accepted), `fixture-generated-ai-regression-fit-rejected` |

```
node --test packages/web/src/explain-program/ai-generated.test.mjs
RABBIT_HOLE_DEV_TEST_BYPASS=<dev bypass> node packages/web/scripts/seed-dev-fixture.mjs fixture-generated-ai-classifier-threshold https://rabbit-hole-web-dev-<worktree>.tryrabbithole.workers.dev
```

## Retry batch (2026-11-08)

Dev clone `rabbit-hole-web-dev-tc-s7d2`, router usage fix included, `claude-opus-5-5`. Plain words through the router. Spend for the batch **$1.519** (K-means $0.614, gradient $0.362, regression $0.543); the running total since the $3.10 pool is $4.757. The originals above are untouched; each retry has its own record.

| Case | Routing (recorded in browser) | Job | Outcome | Cost | Calls |
|---|---|---|---|---|---|
| K-means Stepper | `explain` via `jev`, 0.78 | `ej_f70edc57de6d4bfd9005b69c073ee162` | **card, accepted at round 2** | $0.614 | brief, author, repair, review, repair, review |
| Gradient descent, retry | `explain` via `jev`, 0.57 | `ej_a0f0cafe9a8b4c83a99ffe2d49b7fa33` | **card, accepted at round 1** | $0.362 | brief, author, review, repair, review |
| Regression fit, retry | `explain` via `jev`, 0.81 | `ej_bc9696da910345359e60afecb7586c65` | **failed**, `incomplete_review` (stage reviewing, round 2, retryable) | $0.543 | brief, author, repair, review, repair, review |

The gradient prompt sits at the router's threshold: 0.57 when generated, a `clarify` at 0.56 when the same words were replayed later.

### Why the repair returned no program

`explain_repair` had `maxTokens: 6000` (`learn-models.js`). The stored call diagnostics of the three jobs that ended "The repair returned no program" (gradient run 1, gradient run 2, regression) show the repair call with **exactly 6000 output tokens**, the cap. Repairs that finished under it (3098, 3450, 4036, 4241 and 5122 tokens) returned programs. A program repair returns the whole program and the model thinks inside the cap, so the tool call was cut off and `programRepairStage` rejected it (`input.program` missing, `explain-repair.js`). Fix (commit 6a0e43cfd): `explain_repair.maxTokens` 6000 to 10000, the same room as the author. Test: the repair cap is at least the author's.

**Cost consequence, for review:** the policy's worst-case bound for one repair rises from $0.368 to $0.448 and the generation reservation from $3.313 to $3.553. The consent number a learner sees (`reserve_credits`) rises from 332 to 356 credits. Actual spend only rises for a repair that needs the room. The pinned budget and credit tests were updated for these numbers; reverting the one line in `learn-models.js` undoes it.

The gradient retry's repair used 4241 tokens, below the old cap too, so its success does not by itself show that the raised cap mattered. The earlier failures do.

### New finding: the review has the same cap problem

The regression retry ended because its last review call returned **exactly 3000 output tokens**, the `explain_review` cap, so the verdicts were cut off and the review was refused as `incomplete_review`. The program before that review had passed validation. I did not change the review cap: it needs a decision (cost and the pinned consent numbers) and another retry.

### Author rule added (same commit)

One bullet in the program authoring rules: explanatory sentences belong in `manifest.summary` and `manifest.description` (shown above the scene); the frame holds the picture, short labels and numbers, with no explanatory sentence below or beside it; count frame objects at the extreme of every control and stay under `program.limits.objects`. The K-means card was generated before this rule. The gradient and regression retries came after it and have no explanatory sentences in the frame.

### Numerical acceptance (offline)

`ai-generated.test.mjs` (16 tests, all pass):

- **K-means (accepted):** from its own 12 points in four clumps and two start layouts (top/bottom and left/right): Assign colours each point by its nearest centroid (ties to A) and moves no centroid; Update moves each centroid to the mean of its group; the total squared distance after each step equals the independent computation; both runs reach convergence; the two layouts end in different groups, and the top/bottom groups have the larger total (as the card says); Reset restores the start and clears the assignment lines.
- **Gradient retry (accepted by the pipeline):** w and the loss equal 3(1 - rate)^k and its half square for the four rates and steps 0 to 8. **It fails the owner criterion:** at rate 1.2, step 8, the markers of steps 4 to 8 are less than 1 px apart (w is 0.0048 at step 4, on a parabola drawn at 91 px per unit); the reviewer called this a minor crowding finding. The card is kept as found.
- **Regression retry (failed):** on its own six points, residual segments end at the prediction for the same x, MSE is the mean of the six squares, the focus share is right, and the object count stays within 60 at all twelve slope and intercept corners tested (it is nearly constant, 51 objects).

### Live acceptance on the dev clone (owner-authorised, 2026-11-08)

Playwright against `rabbit-hole-web-dev-tc-s7d2`, seeded canvases with one fixture card each, no model call: change controls, reload, a brand-new browser context, Reset, reload. Build 6a0e43cfd.

| Card | Result |
|---|---|
| Convolution | 10/10: kernel, window row and column changes redraw; saved values and drawing survive reload and a new context; Reset restores the opening state and survives reload; the equation O[i,j] = sum sum I[i+m, j+n] K[m,n] renders cleanly |
| Attention | 9/9: query and mask changes, same checks |
| Tree split | 9/9: Entropy, cutoff 2.9, Reveal; reload and a fresh context keep cutoff, measure and the revealed drawing; Reset hides the reveal and restores 2.5 and Gini. The formulas (I, I_L, I_R, W) render without overlap |
| Classifier threshold | 8/8: cutoffs 1 and 0.85; the saved value survives; Reset restores 0.5 (a first run ended on the default value, so no Reset control existed; the steps were corrected and rerun) |

**Tree, cutoff 2.9:** confirmed. The cutoff line is drawn at x = 216.6, exactly the centre of the circle for the point at 2.9, so the line runs through that B label. The card is kept as generated.

The K-means, gradient retry and regression retry fixtures are not in that build and were not driven in a browser.

### Retry artifacts and replay

| Path (`packages/web/src/explain-program/testdata/`) | What |
|---|---|
| `generated-ai-kmeans.json` | record + accepted artifact |
| `generated-ai-gradient-retry.json` | record + accepted artifact |
| `generated-ai-regression-fit-retry.json` | failure record + `rejectedCandidate` |

Fixture ids: `fixture-generated-ai-kmeans` and `fixture-generated-ai-gradient-retry` (accepted), `fixture-generated-ai-regression-fit-retry-rejected`.

```
node --test packages/web/src/explain-program/ai-generated.test.mjs
cd packages/control-plane && node --test test/explain-policy.test.js test/explain-program-budget.test.js test/explain-brief.test.js test/explain-proposal.test.js
```
