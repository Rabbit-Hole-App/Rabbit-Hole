# SIMP-1: last-resort simplification stays in the failed diagram's family

Branch `feat/simp-1` on `rabbit-hole`, base release 154 tip 9531b382f. Commit 2a47b4a36. Code diff: `hunk.diff` (src only). No provider call, no deploy.

## Rule as built
- `packages/control-plane/src/learn-primitives.js`: `SIMPLIFIABLE = ['flow','cycle','sequence','tree']` and `kindOf` before `dropFrom`; `dropFrom` calls `simplifiedDiagram` only when the FAILED diagram's own `kind` is in that list. Any other kind is dropped (never a flow, never a comparison).
- `simplifiedTree(d)` (new, before `simplifiedDiagram`): a binary tree the schema rejects is rebuilt as the ordinary tree: same ids, parents, labels; layout, side, role, fill removed. Not rebuilt (null) if any node has no label, or the layout is not binary, or the result still fails the schema.
- `learn-artifact.js` unchanged in logic. The existing branch "invalid diagram that leaves no visual and nothing could be rebuilt, with a plan" already throws `explanation_missing_visual`; only its message now says "in its own kind". `explanation_bad_numbers` route untouched.
- Flow, cycle, sequence keep today's behaviour (prefer cycle/sequence from the learner's words still applies: a flow may still become a cycle on repeat words).

## Before / after
| case | before | after |
|--|--|--|
| transformer decoder, prose says "the masked cells in the heatmap", author matrix invalid after repair | 6-node flow of token labels "the 1 -> cat 2 -> ..." delivered | step fails explanation_missing_visual, next provider runs (gpt-oss wrote a valid heatmap 4/4 in BEFORE) |
| gini impurity brief, dot tree invalid | 3-node chain All -> Pure -> Mix | ordinary tree All / Pure / Mix (same provider, no extra call) |
| forward diffusion (matrix or transformation) | flow Clean -> Sampled noise -> Noisy result | step fails, next provider runs |
| gradient descent / learning-rate schedule (flow) | smaller flow | unchanged |

## Offline would-have-moved (from section-6 data, 18 fallback cards)
The author's last invalid spec was not saved. Class of each card is inferred from the saved planner kind plus the saved attempt-0 issue ("columns.N: expected string, received object" = a matrix/heatmap-type spec) and from the simplified flow's labels, which can only come from a rows/columns list for token-links and transformation prompts (neither kind is in the simplifier's label lists). Assumption: attempt-0 and final-attempt kind are the same.

| arm | fallbacks | go to next provider | stay on the provider | of which |
|--|--|--|--|--|
| AFTER (card-numbers) | 12 | 9 (6 transformer-decoder, 3 forward-diffusion) | 3 | gini rebuilt as a tree 1, flow 2 |
| BEFORE (main) | 6 | 5 (2 transformer-decoder, 3 forward-diffusion) | 1 | flow 1 |

In BEFORE, 4 more transformer-decoder runs (idx 56, 194, 269, 278) already went to gpt-oss on validation_error (not simplified) and gpt-oss wrote a `heatmap` each time (4 of 4). gpt-oss never wrote a forward-diffusion card in this data (0 runs reached it), so its success on that prompt is untested.

Cost of the 9 AFTER moves (per 303 runs, 3.0 percent): one extra Fireworks call each (up to two with a repair). Observed Fireworks-authored card ledger: mean 1,759 micro-USD (range 1,329 to 3,955; the 4 transformer-decoder ones 1,628 to 1,662) = about US$0.016 for 9 calls (US$0.032 if every one needed a repair). Latency: runs that reached gpt-oss took a median 7.5 s against 4.5 s for the simplified-fallback runs and 2.9 s overall (about +3 s on those cards). Gemini's two calls (call and repair) are already spent in both arms.

Scripts: `analyze.mjs` (this analysis), data: `/c/s/sprint2-evidence/card-numbers/section-6/results.jsonl`, `fallback-trace/fallback-cards.json`.

## Tests
control-plane `explanation-visual-fallback` 9 (was 5): SIMP-1 (a) flow stays simplified, (b) transformer decoder cards 194 and 203 fail with missing_visual, (c) gini rebuilt as a tree, unlabelled or broken tree fails, (d) forward diffusion matrix and transformation fail; plus the old stack-vs-queue matrix end-to-end test, rewritten (it asserted matrices become flows). `explanation-fast-chain` 24 (was 22): next provider called and its matrix delivered; every provider failing gives explanation_missing_visual with each step's issue. web `learn-slash` 40 (was 39): the failure line. Verified the new tests fail on the base source. Fixture: `explanation-simp1-cards.fixture.json`.
