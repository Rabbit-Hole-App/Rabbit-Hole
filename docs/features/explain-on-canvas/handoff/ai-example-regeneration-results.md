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
