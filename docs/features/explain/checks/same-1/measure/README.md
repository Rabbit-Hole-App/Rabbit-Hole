# SAME-1 d: measurement harness (prepared, NOT run; no provider call made)

Files: `plan.mjs` (builds `plan.json`, offline), `plan.json`, `run.mjs` (derived from `C:/s/sprint2-evidence/var-1-bench/run.mjs`; in-process `generateArtifact` + the fast chain, planner jev, sampler off, no pictures).

- Questions (26): the three SAME-1 questions as archived (A and C bare, B with its wrapper; exact texts read from `../records.md`, 2 reps each), 10 softmax / top-k / temperature / normalise questions, and 10 existing transformation prompts of the VAR-1 bench set (audit items whose `numericKinds` include `transformation`; 12 were allowed, 10 exist).
- Profiles, a property of each item: `google-low` (Gemini flash-lite, then Fireworks gpt-oss-120b) and `fireworks-low` (Fireworks gpt-oss-120b at low effort, then Gemini): `EXPLANATION_MODEL_PROFILE`, see `explanation-models.js` and the `explanation-fast-chain.js` header. 26 x 2 = 52 items.
- Arms (git archive trees in `C:/s/same1-measure-trees`): `before` main 2aeca536d, `after` feat/same-1 a1452a98c (planner text), `afterb` feat/same-1-validator bcf038ac1 (planner text + the 2-items-per-side rule). 52 x 3 = 156 runs. Without `afterb` (`--arms before,after`): 104 runs.
- Record per run: plannedKind, plannerKind, kindSource, references, shapeId, deliveredKinds, deliveredAsPlanned, pictureKey (the first diagram's JSON without title and caption: equal keys across the A/B/C cards = they share a picture), transformationSizes, honestFailure/errorCode, repairs and their error texts, authoring model, cost.
- Context is null: the archive kept only `hasContext`, so the parent card's text is not reproduced; B keeps its wrapper in the args.
- Cost: about US$0.0034 a run (section 6 / VAR-1 bench upper bound), so about US$0.53 for 156 runs, US$0.35 for 104; the stop line is US$0.90 (`--cap`), the owner's cap US$1. Time: about 3 s a run, one at a time: about 8 minutes.
- Commands (the lead runs): `node run.mjs --dry-run` (done, passes: no call, the three trees import, the planner text and rule markers are in the right trees); `node run.mjs --out results.jsonl --cap 0.90`; `--cap 0` was run and stops before any call.
- A report script is not written (it depends on the results).
