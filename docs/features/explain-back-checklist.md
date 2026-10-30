# Explain-back update checklist (TUT-16, UI-29)

Plan and specification: [2026-10-30-explain-back.md](../superpowers/plans/2026-10-30-explain-back.md) (v1.6).
Blockers and fixes: [explain-back/fixes.md](explain-back/fixes.md). Morning handoff:
[explain-back/handoff-2026-10-30.md](explain-back/handoff-2026-10-30.md).
The approved `explain-back-ui.html` reference was not available to the build; the owner chose to build from the written
specification (2026-10-29).

States: planned / implementing / pushed / tested / preview deployed / owner feedback addressed / production verified.
"Tested" names the check and run. Fixture checks prove wiring only; they are not provider quality or deployed behavior.

## Baseline

- Base: `main` at `05c1221fe98aba1625de5b7f9a3615d78c7b8e7b` (2026-10-29 11:42 PM PT).
- Old `feature/explain-back-sketch` branch: already contained in `main`; nothing further to reuse.
- Integration branch: `feat/explain-back`; release candidate `408f4cc5f3b800fea79fb2022a0718e23b4c39cf`. Worker
  branches: `feat/eb-ui` (U), `feat/eb-data` (D), `feat/eb-assess` (A), `feat/eb-canvas` (R), `feat/eb-media` (M).

## Owner decisions (2026-10-29)

- Spend: 10 USD total for Explain-back dev testing, one shared ledger, combined cap. Fixtures for routine tests; real
  calls only for targeted acceptance.
- Transcription approved for dev and production (O-8 resolved), for retained voice notes only; the transcript stays
  separate from the typed answer. FX-71 still pauses live Voice Mode.
- Additive dev migration approved after announcement; production migration through the owner's release launcher.
- Usable milestones release after owner preview feedback and GO.
- Two-minute recording limit, visibly enforced with a clean stop.

## Spend

All paid calls were made by the coordinator; workers made none. Only Opus 5.5 assessment calls; no transcription call
has run.

| Date (PT) | Calls | Purpose | Recorded cost (USD) | Running total |
|---|---|---|---|---|
| 2026-10-30 1:37 AM | 10, tests/evals/explain-back (in-process) | quality eval run 1: 7/10 | 0.3186 | 0.3186 |
| 2026-10-30 1:57 AM | 4, targeted | run 2 after fixes: 4/4 | 0.1283 | 0.4469 |
| 2026-10-30 2:51 AM | 10, full, final assessment code | run 3: 8/10 | 0.3030 | 0.7499 |
| 2026-10-30 2:59 AM | 2, targeted | run 4 after the reply-format fix: 2/2 | 0.0709 | 0.8208 |
| 2026-10-30 5:40 AM | 3, deployed preview through its real routes | real-flow acceptance | about 0.105 (at most 0.48; the dev ledger read failed) | about 0.93, at most 1.30, of 10.00 |
| 2026-10-30 10:30 AM | 4, deployed preview: 1 transcription (gpt-4o-transcribe) + 3 reviews | real speech voice-only, resource-only, all formats | 0.1031 (dev ledger, settled) | about 1.03, at most 1.40, of 10.00 |

## Milestones

| Milestone | State | Evidence |
|---|---|---|
| M0 contract + card preview | implemented, tested, browser-checked in CI, preview deployed | candidate `408f4cc5f`: fast-e2e 41054370885 (85 checks pass, including explain-back-sketch, -layout and -media, canvas-forking, notebook-run-all), verify 41054370899 |
| M1 saved text attempts + revision review | implemented, tested, preview deployed, real flow verified on the preview | attempt 1 5/10; revision 10/10 with comparison "force: resolved, velocity: still met" |
| M2 retained voice + static Sketch | implemented, tested, preview deployed; Sketch-only real flow verified (5/10, visual review); real speech transcribed on the preview | 10:30 AM PT voice-only (Windows speech, Ogg/Opus): transcript read, typed text left empty; the review was Not rated because the evaluator dropped a criterion (FX-EB-09, fix in progress) |
| M3 Notebook, Group, attachments | implemented, tested, browser-checked (EB-05 steps, notebook-run-all step 4); real resource review on the preview | 10:30 AM PT resource-only (a connected explanation card, empty text): 5/10, force met from the card, velocity correctly not established, card read |
| M4 silent + narrated Sketch recording | implemented, tested, browser-checked (silent recording without a microphone) | eval self-correction case passes (runs 3-4) |
| M5 complete mixed answer + release | released to production; production user-flow verification pending (the owner signs in) | 10:30 AM PT all formats (text + real voice + Sketch + card + two-note Group): 10/10, all 7 inputs read. Production migration 0034 applied and verified 5/5; release 22-eb: `a3376817f003a9c41824fc5b76b644778bc9c6e3` on main 9:55 AM PT, release run 41094209867 success 9:57 AM PT, app and control plane serve `a3376817f003` |
| Supporting: shared-canvas check fix | merged into the candidate | `54f3d3fe20457a4b006669d1552a254a0f7817fd` |

## Tasks

| Task | Owner | State |
|---|---|---|
| EB-01 contract and baseline | P + D | done |
| EB-02 durable submissions, private assets, drafts | D | implemented, tested; dev migration 0034 applied 2026-10-30 1:05 AM; production migration 0034 applied and verified by the owner's launcher 2026-10-30 (5/5) |
| EB-03 card, single Sketch panel, Input | U + R | implemented, tested, browser-checked |
| EB-04 history and revision wiring | D + U + P | implemented, tested, real flow verified on the preview |
| EB-05 resource Input, Notebook, Group | R | implemented, tested, browser-checked |
| EB-06 retained voice, then Sketch recording | M | implemented, tested, browser-checked with fake audio; real speech transcribed on the preview 2026-10-30. Ordinary Challenge's Speak answer microphone removed (FX-EB-04, branch `fix/challenge-mic-removal`, not yet released) |
| EB-07 coordinated assessment and revision comparison | A | implemented, tested; every live eval case has passed on the final code (runs 3-4) |
| EB-08 blue rating, feedback, teaching links | A + U | rating and feedback done; teaching-aid links to existing cards built (FX-EB-05, c4a950cae), awaiting CI and the live eval case |
| EB-09 integration and regression | P | done for the candidate; independent server and client reviews, every finding fixed or recorded |
| EB-10 push, preview, receipts, release prep | P | released 2026-10-30 9:57 AM PT (`a3376817f`); production user-flow verification pending |
| UI-29 generation-prompt visibility | U | in the Explain-back card; other card types not audited |
| P2 one Practice card (f3500c94, owner 2026-10-30 ~11:10 AM PT: "Explain-back = Challenge = Practice") | P2 | implemented and unit-tested on `feat/practice-one-card`, browser checks updated but not yet run in CI. Every `type: 'challenge'` block renders the Explain-back card under the kicker Practice (the one-line Challenge card is removed); one predicate (`explain-back-private.js isExplainBackCard`: type `challenge`) for ports, Sketch, binding, privacy and modality; the Insert menu has one Practice entry; /practice no longer offers the challenge primitive; an old Challenge's saved guess, verdict and reveal show as attempt 1 (Not rated) ahead of durable attempts; the control plane binds an old Challenge from the board |
