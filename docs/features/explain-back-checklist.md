# Explain-back update checklist (TUT-16, UI-29)

Plan and specification: [2026-10-30-explain-back.md](../superpowers/plans/2026-10-30-explain-back.md) (v1.6).
Blockers and fixes: [explain-back/fixes.md](explain-back/fixes.md).
The approved `explain-back-ui.html` reference was not available to the build; the owner chose to build from the written
specification (2026-10-29).

States: planned / implementing / pushed / tested / preview deployed / owner feedback addressed / production verified.
"Tested" names the check and run. Fixture checks prove wiring only; they are not provider quality or deployed behavior.

## Baseline

- Base: `main` at `05c1221fe98aba1625de5b7f9a3615d78c7b8e7b` (2026-10-29 11:42 PM PT). The plan was reviewed against
  `3591c49b`; the difference is release 21-ctx (Add context, FX-71 voice-token pause, RH navigation, migration 0033).
- Old `feature/explain-back-sketch` branch: already contained in `main`; nothing further to reuse.
- Integration branch: `feat/explain-back`. Worker branches: `feat/eb-ui` (U), `feat/eb-data` (D), `feat/eb-assess` (A),
  `feat/eb-canvas` (R), `feat/eb-media` (M).

## Owner decisions (2026-10-29)

- Spend: 10 USD total for Explain-back dev testing (assessment, transcription, other paid evidence processing), one
  shared ledger, combined cap. Fixtures for routine tests; real calls only for targeted acceptance.
- Transcription approved for dev and production (O-8 resolved), for retained voice notes only; the transcript stays
  separate from the typed answer. FX-71 still pauses live Voice Mode.
- Additive dev migration approved after announcement; production migration through the owner's release launcher.
- Usable milestones release after owner preview feedback and GO; unfinished controls stay hidden in production.
- Two-minute recording limit, visibly enforced with a clean stop.

## Spend

| Date (PT) | Agent | Call | Purpose | Recorded cost (USD) | Running total |
|---|---|---|---|---|---|
| 2026-10-30 1:37 AM | P | 10 x claude-opus-5-5 (tests/evals/explain-back, --live --max-usd 1) | targeted quality acceptance: 7/10 pass | 0.3186 | 0.3186 of 10.00 |

## Milestones

States are kept separate: implemented (pushed) / unit-tested / browser-checked in CI / preview deployed / owner feedback / production verified.

| Milestone | State | Evidence |
|---|---|---|
| M0 contract + card preview | implemented, unit-tested; CI browser check registered, first run pending; preview pending | contract c3b0a7283; card + panel feat/eb-ui 71910f9d7; Sketch host feat/eb-canvas aca5fca02 |
| M1 saved text attempts + revision review | implemented, unit + integration-tested (injected evaluator); real-provider eval 7/10 | D integration test (attempt 2 request carries attempt 1's exact answer and pinned review); A assessment 25 tests |
| M2 retained voice + static Sketch | implemented, unit-tested; dev migration 0034 applied; transcription priced and admitted | voice note feat/eb-media; assets feat/eb-data 86256f18e; transcription spend transport 021fc27d8 |
| M3 Notebook, Group, attachments | implemented, unit-tested; browser checks registered, not yet run | Input/Group ports 85f131c87; frozen resolver e029c1777; inputSubmission 01f0927c7 |
| M4 silent + narrated Sketch recording | implemented, unit-tested; live eval case failed (fix in progress) | sketch-recording a9145ca74, fd560c1d9; assessment adapter 7ba98bb3e |
| M5 complete mixed answer + release | not started (release prep) | |
| Supporting: shared-canvas check fix | pushed, verify + fast-e2e green; rides the next release gate | `54f3d3fe20457a4b006669d1552a254a0f7817fd` |

## Tasks

| Task | Owner | State | Latest |
|---|---|---|---|
| EB-01 contract and baseline | P + D | done (contract) | explain-back-contract.js; segments in ms |
| EB-02 durable submissions, private assets, drafts | D | implemented, tested | learn 0034 applied to dev rabbit-hole-learn-dev 2026-10-30 1:05 AM (verified 3 tables, 2 indexes); production migration is an owner launcher at release |
| EB-03 card, single Sketch panel, Input | U + R | implemented, unit-tested | browser checks pending CI |
| EB-04 history and revision wiring | D + U + P | implemented, tested | service in LearnPage (on in dev/CI builds; production off until release GO) |
| EB-05 resource Input, Notebook, Group | R | implemented, unit-tested | share/fork/paste privacy 87cf1b5c8 |
| EB-06 retained voice, then Sketch recording | M | implemented, unit-tested | server drafts d69789aaa; stop captures on canvas leave |
| EB-07 coordinated assessment and revision comparison | A | implemented, tested; live eval 7/10 | fixes for 3 live failures in progress |
| EB-08 blue rating, feedback, teaching links | A + U | rating + feedback implemented; teaching-aid links not built (no teaching card in the review yet) | |
| EB-09 integration and regression | P | in progress | two independent reviews done (server, client); findings dispatched |
| EB-10 push, preview, receipts, release prep | P | in progress | dev clone rabbit-hole-web-dev-explain-back exists with keys; first feature preview after CI |
| UI-29 generation-prompt visibility | U | implemented in the Explain-back card | other card types not audited |
