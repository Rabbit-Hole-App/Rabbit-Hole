# SAME-1: three /explain cards with the same transformation picture (8878, canvas-482ab33b)

Read-only. Source: the local card archive on 8878 (R2 `rabbit-hole-dev-learn-media`, keys `explain-archive/2026-11-18/<id>.json`, 96 records; 7 of them name canvas-482ab33b). Copied to a scratch directory first; nothing written to the persist stack. Ids, kinds, models and numbers only; no card prose, no user ids. Code under test for the offline run: main 1cffe2ef8 (release 157), a `git archive` copy.

## Per card

| | A: "Getting a token's probability after generation" | B: "Softmax turns logits into token probabilities" | C: "Top-k Filtering and Token Probability" |
| --- | --- | --- | --- |
| archive id | b2cc91ad-8180-4b78-bb5c-612f42bb4d04 | 8af839b7-6e79-4f77-ac69-78bd48d181ef | 84cbde00-e993-4947-8c66-30aaefc0f8f1 |
| time (UTC; PT = UTC-8) | 2026-11-18 20:39:01 (12:39 PM PT) | 20:39:30 | 20:39:40 |
| board | main | main | main |
| command, depth | explanation, balanced | explanation, balanced | explanation, balanced |
| request args as the author route got them | the learner's question alone, 69 characters, no wrapper | the learner's question wrapped by the "ask about this" flow (`In the context of "<card title>": ...`), 113 characters | the learner's question alone, 73 characters, no wrapper |
| selection | kind card, id 40589747-2855-4d38-aac4-84a4ad2bf3d1 (title length 28) | kind card, id b8682aae-9598-4624-8e4d-001fbfeaa479 (title length 46) | kind card, id b8682aae-9598-4624-8e4d-001fbfeaa479 (title length 46) |
| hasContext | true | true | true |
| plan.kind / plannerKind | transformation / transformation | transformation / transformation | transformation / transformation |
| plan.fixed, planner | true, jev | true, jev | true, jev |
| planner probability (transformation) | 0.63 (flow 0.17) | 0.98 | 0.81 (flow 0.10) |
| kindSource | absent (no reference steered the kind) | absent | absent |
| references (topical ids in the prompt) | none | none | none |
| shapeId | shape-transformation | shape-transformation | shape-transformation |
| model that authored | fireworks gpt-oss-120b (profile fireworks-low) | same | same |
| answers, repairs, steps | 1 answer, 0 repairs, 1 step | same | same |
| requestSeed | absent (release 157 has no seed on main) | absent | absent |
| diagram delivered | one transformation (list form), 1 item before, 1 item after | same | same |
| planner ms / author ms | 191 / 3238 | 262 / 2834 | 228 / 2626 |

Card A's selection title is the title of the parent card made at 20:30:41 (archive id dae9ce07-76b8-4089-9849-b2568f26f9ff, args 516 characters, no selection, planned choose [transformation, flow] 0.49/0.43, not fixed, one answer, gpt-oss). B and C were both asked from card A (selection id b8682aae-..., title length 46). The record carries no block id of the new card; the selection id above is the card they were asked from.

## What the records show

All three had a fixed transformation plan, no topical reference in the prompt (`references: []`), and only the planner's gallery shape example (`shape-transformation`) as the diagram example, so gpt-oss drew the same one-item-to-one-item transformation each time.

## Offline selectForAuthor on the three questions (main 1cffe2ef8, selection as archived, no card text context: the archive records only `hasContext`)

Questions (the learner's own words):
- A: `Can we retrieve the probability of a specific token after generation?`
- B: `In the context of "Getting a token's probability after generation": what is "softmax", and how does it work here?` (wrapped)
- C: `Does top‑k filtering affect the reported probability of the chosen token?`

Direct keyword score, ranked, topical references only (shape-* and general-* excluded; steering needs >= 12):

| | first | top 5 (id kind score) |
| --- | --- | --- |
| A | softmax-probabilities, bar-chart, 4 | softmax-probabilities 4, probability-calibration 4, tree-inorder-traversal 0, tree-bst-insertion 0, tree-folder-hierarchy 0 |
| B | softmax-probabilities, bar-chart, 8 | softmax-probabilities 8, probability-calibration 4, then three tree references at 0 |
| C | softmax-probabilities, bar-chart, 4 | softmax-probabilities 4, knn-k-validation 4, probability-calibration 4, ks-empirical-cdfs 4, tree-inorder-traversal 0 |
| B, wrapper removed (`what is "softmax", and how does it work here?`) | softmax-probabilities | not ranked further; same first |

- `ml-transformer-vocabulary-softmax` (bar-chart) scores 0 for A, B and C; `ml-logistic-regression-softmax` (panels) scores 0 for A, B and C. Neither is reachable on its keywords for any of the three questions, with or without the wrapper.
- No reference reaches the steer threshold (12), so no reference sets the plan's kind (no kindSource).
- `selectForAuthor` with the archived plan (planned kind transformation) returns `[]` for all three, the same as the archive: the candidates are filtered to references of the planned kind before keyword scoring (`wanted.has(kind)`), and `softmax-probabilities` is a bar-chart, so it is removed. This reproduces the archive.
- Without a plan (or with no kind filter) the same call returns `softmax-probabilities` then `probability-calibration` for A, B, C (B wrapper-stripped: `softmax-probabilities` only).
- The wrapper in B changes the score (4 to 8) but not the first reference or the result.
- Library ids with softmax, top-k, sampling, logit or probability in the id: class-imbalance-resampling, softmax-probabilities, probability-calibration, ml-soft-vote-probabilities, ml-majority-undersampling, ml-transformer-attention-softmax, ml-transformer-vocabulary-softmax, ml-word2vec-full-softmax-training-loop, d2l-softmax-affine-class-scores, d2l-softmax-shift-for-stability, raschka-residual-gain-and-soft-logit-cap, ml-logistic-regression-softmax.

Not covered: the card-text context (`hasContext: true`; its text is not in the archive), so keyword hits that came only from that text are not reproduced here.
