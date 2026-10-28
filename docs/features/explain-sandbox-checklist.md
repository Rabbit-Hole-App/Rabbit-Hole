# Generic /explain sandbox checklist

Plan: [docs/superpowers/plans/2026-10-28-explain-sandbox.md](../superpowers/plans/2026-10-28-explain-sandbox.md). Baseline main 1a4434cff466d0648dc274dbb56dc2481a64fbf4 (inspected 2026-10-28). Times are PT unless marked UTC. Nothing here is a claim that the sandbox, provider generation or a production deployment has passed.

Superseded: the earlier component-family plan (swinging-body, gear-train, dedicated pendulumPeriod/gearRate calculators; reports REPORT.md and REPORT-v2-tightened.md, kept only as historical evidence) and the proposal for a custom expression language.

Server flags: `EXPLAIN_PROGRAM_ENABLED=false` (generation default) and a separate server-controlled execution eligibility/kill policy; `EXPLAIN_V2_ENABLED` is not changed globally.

Paid validation budget: US$50 total for /explain sandbox validation (owner, 2026-10-27 about 10:45 PM PT); ledger C:/s/spec/budget/budget-explain-sandbox.json (reserve before each run, settle against measured spend, spent plus reservations within US$50; pause paid runs if the cap would be exceeded).

Owners: integrator = Parallel; Agent A runtime (Tasks 1, 3); Agent B card/renderer (Tasks 2, 4); Agent C generation (Tasks 5-7, 9, agent a7123b9a); independent reviewer at the Task 1/3 boundary and before activation.

| Task | Owner | Implemented | Checked (kind/run) | Main SHA/link | Deployed | Enabled audience | Accepted evidence | Next action/blocker |
|---|---|---|---|---|---|---|---|---|
| 0 Plan and baseline | integrator | plan + checklist committed on branch feat/explain-sandbox-task0-plan | docs only | not on main | no | none | none | owner launcher with the first milestone (Tasks 0-2) |
| 1 Interpreter boundary | A | not started | | | | | | runtime proof |
| 2 Artifact and render contract | B | not started | | | | | | |
| 3 Host and responsiveness | A | not started | | | | | | needs 1, 2 |
| 4 Program inside the card | B | not started | | | | | | needs 2, 3 |
| 5 Author and persist via V2 | C | not started | | | | | | needs 2 |
| 6 Review, repair, accounting | C | not started | | | | | | needs 3-5 |
| 7 Genuine MVP | integrator + C | not started | | | | | | needs 1-6; reprice first |
| 8 Interactions and time | B / A | not started | | | | | | needs 7 |
| 9 Context, Tutor, edits | C | not started | | | | | | needs 7 |
| 10 Quality and compatibility | A + B | not started | | | | | | needs 8, 9 |
| 11 Rollout and docs | integrator | not started | | | | | | needs 10 |
