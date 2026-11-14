# Release 145 report: RD-2 + RD-2b + RD-2c (flow decision branches) + RD-3 (geometry lint)

Candidate: explain/rd-23 at 71415b6b8f30c687e8fa28b83a103fb0d775f495 (release/explain-145, rollback release/explain-145-rollback-71415b6b). Base: release 144's final candidate 5fd37acaa12a23abf19f41f083024066ca7d395c; MAIN_PREV in the pins is that SHA. No control-plane file, no migration, no config change.

## Register ids, commits, evidence
| id | commit(s) | evidence |
|---|---|---|
| RD-2 | c59e7e3b6 (literal spec), merged onto the 144 candidate in 597d05cd5 | film/evidence 1fb4bda5d5870b73ca9dde975602ec7b98287ddc, checks/rd-2/ (16 before/after PNGs, README, snapshot-diff.txt) |
| RD-2b | b10cbef77 | same |
| RD-2c | 8a7c41de7 (found by the RD-3 geometry lint: ml-what-is-machine-learning-workflow deep detail, rule e) | flow.test.mjs (2 tests), the baseline entry deleted in the same commit |
| RD-3 | f0459165c, b90a34b9f, merged in 5aa7057a3 and dfdb8a345 (the composition fork) | film/evidence 26963179f831517cb8ccb4a4acffda0ce659d3e2, checks/rd-3/ (report, two byte-identical lint runs, 24 lines each) |
| snapshots | 71415b6b8 | 6 entries vs the 144 base: ml-logistic-regression-model-pipeline 320: 555->503, 408: 533->481, 720: 516->464; ml-what-is-machine-learning-model-choice 320: 753->701, 408: 644->592, 720: 644->592 |

## DECISION NEEDED (reviewer): RD-2 rule 4 as written vs RD-2b
- Rule 4 as written falls back to the lane routing whenever a branch's horizontal run is shorter than its label. In the owner's swallow card the targets sit under the diamond's side vertices, so the literal rule only changes the card from about 560 px wide; at real card widths (320 to 440 px) it is unchanged.
- RD-2b (b10cbef77) also takes the side vertices there: the wire drops straight from the vertex onto its target and the label stands outside the drop. It changes the swallow card from 320 px up (433 -> 381 px tall at 408 to 720 px); 300 px and below, including the 283 px natural width, stays byte-identical to before.
- Snapshot ids that differ between the two tips (measured on the RD-2 branch before the merge): the literal tip changes 2 entries, ml-logistic-regression-model-pipeline and ml-what-is-machine-learning-model-choice at 720; RD-2b adds 6 more (ml-batch-score-fallback 320/408, the two others at 320/408). On this candidate (after RD-2c) ml-batch-score-fallback keeps the lane routing, so 6 entries differ from the 144 base.
- To drop RD-2b alone: revert b10cbef77 and its follow-ups (8a7c41de7 depends on it) and re-snapshot. The commits are kept separate for that. The decision was recorded by the coordinator as KEEP RD-2b; it remains open for the reviewer.

## RD-3 baseline: the references that still break a rule (10 after RD-2 and RD-2c; 12 before RD-2)
- figure-parallel-residual-sublayers (rule b)
- ml-bagging-vote-flow (rule a)
- ml-batch-score-fallback (rules a, d)
- ml-gpu-matmul (rule a)
- ml-logistic-regression-linear-unbounded (rule d)
- ml-logistic-regression-log-loss (rule a)
- ml-robot-arm-pickup (rule d)
- ml-what-is-machine-learning-dataset-split (rules a, d)
- ml-what-is-machine-learning-model-choice (rules a, d)
- ml-word2vec-neural-predictor (rule d)
RD-2 removed ml-logistic-regression-linear-separator and ml-logistic-regression-model-pipeline (class a); RD-2c removed ml-what-is-machine-learning-workflow (class e, which RD-2b had introduced). Totals now: 24 violations in 10 references (a 14, b 2, d 8, e 0). The baseline only shrinks; the lint blocks NEW references in the pipeline's author check and never runs on card generation.

## Gate
See 145-suites-report.txt and 145-gate-report.txt in this folder. Full web gate green; the first tier-1 smoke FAILED one hard line (delivery 64/66, two transport failures, infrastructure); the one authorised rerun PASSED 66/66. Spend: first run US$0.7816, rerun US$0.7787, total US$1.5603.

## Owner commands (after release 144 is on main)
    gh variable set MVP_ALLOWED_SHA --body 71415b6b8f30c687e8fa28b83a103fb0d775f495 -R Rabbit-Hole-App/Rabbit-Hole
    C:/s/spec/release-queue/release-mvp.cmd 145-explain --check
    C:/s/spec/release-queue/release-mvp.cmd 145-explain
    gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole
