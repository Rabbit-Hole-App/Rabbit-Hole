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
| | | | | | 0.00 of 10.00 |

## Milestones

| Milestone | State | Pushed SHA | Preview / served SHA | Evidence |
|---|---|---|---|---|
| M0 contract + card preview | implementing | | | |
| M1 saved text attempts + revision review | planned | | | |
| M2 retained voice + static Sketch | planned | | | |
| M3 Notebook, Group, attachments | planned | | | |
| M4 silent + narrated Sketch recording | planned | | | |
| M5 complete mixed answer + release | planned | | | |
| Supporting: shared-canvas check fix `54f3d3fe2` | pushed | `54f3d3fe20457a4b006669d1552a254a0f7817fd` | n/a | rides the next release gate |

## Tasks

| Task | Owner | State | Latest |
|---|---|---|---|
| EB-01 contract and baseline | P + D | implementing | |
| EB-02 durable submissions, private assets, drafts | D | implementing | |
| EB-03 card, single Sketch panel, Input | U + R | implementing | |
| EB-04 history and revision wiring | D + U + P | planned | |
| EB-05 resource Input, Notebook, Group | R | implementing | |
| EB-06 retained voice, then Sketch recording | M | implementing | |
| EB-07 coordinated assessment and revision comparison | A | implementing | |
| EB-08 blue rating, feedback, teaching links | A + U | implementing | |
| EB-09 integration and regression | P | planned | |
| EB-10 push, preview, receipts, release prep | P | planned | |
| UI-29 generation-prompt visibility | U | planned | |
