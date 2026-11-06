# Tutor ladder and cleanup: owner inbox

Current state as of 2026-11-06 09:05 PT. Older per-release notes, superseded plans and the full decision history are in `OWNER-INBOX-archive-2026-11-06.md` (same folder). Claude never sets `MVP_ALLOWED_SHA`, pushes `main`, deploys production, applies a migration (dev needs your GO announced first; prod is always yours), or spends beyond an approved cap.

Three states are kept apart everywhere below: **Deployed** (the production deploy run for that SHA succeeded), **Flag** (is the feature switched on in production), **Accepted** (focused functional checks passed). "Deployed" never means a browser check on digrabbithole.com: none has been done.

## 1. Where everything is

| Item | Deployed to prod | Flag in prod | Functional acceptance |
|---|---|---|---|
| Cleanup P1 | yes | no flag (removal) | tests/preview only |
| Cleanup P2 Browser Tutor off | yes (run 42247063137) | no flag | tests/preview only |
| R1 Card feedback | yes (with R2) | no flag | tests/preview only |
| R3 Source refs | yes (with R2) | no flag | tests/preview only |
| Cleanup P3 Server Tutor off | yes (with R2) | no flag | tests/preview only |
| Cleanup P4 Journeys/syllabus off | yes (with R2) | no flag | tests/preview only |
| R2 Depth, Auto-suggest | yes (run 42250400898, SHA d2428e357) | no flag | tests/preview only |
| Cleanup P5 Duplicate grading off | yes (run 42253670464, SHA d870aef1f) | no flag | tests/preview only |
| R4 Roadmap loop | yes (run 42257418795, SHA fe9410689; Durable Object class created in prod) | `ROADMAP_ENABLED` **false** (unset everywhere) | fakes only; real-model and Durable Object run in progress (section 3) |
| R6 Automatic next proposals | no, in build (lane A) | false | not started |
| R5 Proposal editing | no, queued behind R6 in lane A | false | not started |
| R7a Long Markdown | no, in build (lane B) | false | not started |
| R7b PDF text | no, queued behind R7a in lane B | false | not started |
| Cleanup P6a join removal, P6b drop scripts, P7 docs | no, in build (lane C); DB steps need your GO | n/a | not started |
| R8-R16 | no | false | not started; each follows its own dependencies, not a blanket R7 |

Production Learn D1 has migrations 0036-0039 (you applied them; 0039 went in right before release 63, because the release preflight requires the prod schema to equal the candidate's schema exactly). Dev Learn D1 has 0036-0039.

## 2. Commands for you now

1. None right now. Release 63 (R4, flag off) is live.
2. Obsolete pins, do not run: 57, 58, 60, 61.

Pins 64 (settings wiring and safety responses, flag off) and 65 (turns the roadmap ON in production) are being built; commands come only after the qualification run is reviewed.

## 3. R4 activation path (priority lane)

Order: 63 deployed (done), then 64 wiring plus safety responses, then qualification reviewed, then 65 flag-on.
Decided: D2 routing exception adopted, D43 safety policy adopted, $25 real-model cap approved (hard stop $25; inbox worst case $24.72), dev 0039 applied, strings S1-S10, S28, S11-S25, S29 approved. Defaults applied for D-R4-5..10 (active-to-proposed edits, deterministic proposals, empty click allowed, held card refunded, Durable Object alarm for the 24 h deadline).
In progress: one agent builds 64/65 (settings reader wiring, S26/S27 safety responses as DRAFT text, one-line prod flag); another runs the real-model and Worker/Durable Object qualification in a dev clone (not production) with a spend ledger at `C:\s\spec\logs\r4-qual-ledger.md`.
Still unmeasured: planner quality, grounding and safety thresholds, roadmap check seconds (placeholders 10/15 s because the CI split is saturated).

## 4. Lanes, bases and migration numbers

| Lane | Work | Base (frozen) | Branch |
|---|---|---|---|
| A | R6, then R5 (R6 does not wait for R5; R11 speculative generation is not in scope) | R4 release tip `fe941068917184a183faa533344cde18524a0598` | feat/tutor-r6, feat/tutor-r5 |
| B | R7a, then R7b (incremental; no silent truncation) | same R4 tip | feat/tutor-r7a, feat/tutor-r7b |
| C | P6a, P6b scripts, P7 docs (journey writers retired, backfill verified per environment, join removal verified, controlled drop) | main `d870aef1f9511c54f8cab2ba13b92dfbe79542d1` | feat/tutor-cleanup-p6a, -p6b, -p7 |
| R4 | 63 release, 64 wiring, 65 flag-on, qualification | 63: `fe941068`; 64 from 63 | feat/tutor-r4-release-3, -wire, -flagon, -qual |
| Verifier | independent review of committed candidates as they become ready | n/a | starts when the first lane candidate is committed |

Migration numbers (allocated centrally; none beyond 0039 is authorised on any database): 0040 R6 (only if needed), 0041 R5 drafts, 0042 R7a source index, 0043 R7b (only if needed).
R9 assessment: `learn-assessment.js` (rubric and Explain-back assessment) is retained after P5, so deferring R9 is a prioritisation choice, not a missing grader. R7 is not a blanket prerequisite for R8-R16.
Lead-only files (single writer): learn-models.js, route mounts, wrangler*.jsonc, check-map.json, LearnPage.jsx, learn-usage.js, repository-schema.sql. Lanes A and B hand these over as lead patches; lane C edits them only on its own cleanup branches.

## 5. Open decisions (none stops other work)

- **S26/S27 final wording (R4 safety refusal and personal-risk support).** Drafts arrive with candidate 64 and are replaceable. Needed: approve or replace.
- **Strings of live releases, never signed off:** R1 (D-R1-S), R2 (D-R2-S), R3 (D-R3-S) and the P4 mode-line strings. Texts are in the archive file, section 2. Recommended: approve.
- **D-P2-1:** keep the static Tutor entry card until R4 is on (recommended) or remove it.
- **D-R2-1:** the per-canvas "Proactive Tutor suggestions" and the per-learner Auto-suggest coexist; recommended one control bound to the per-learner setting.
- **D-N3:** the `fast-e2e.yml` `only` input needs your `!` command; prepared when that phase is ready.
- **D-DB (P6a/P6b):** backfill per environment, join-removal release verification, the schema-source commit and the table drop each need your GO at the moment of the step. Not pre-approvable.
- **D-FLAG-ON (pin 65):** I will recommend running 65 only after the qualification report shows the Durable Object and the end-to-end flow working, S26/S27 are approved or accepted as drafted, and releases 63 and 64 are live.
- Not verified anywhere: browser behavior of any release, workerd for R4 (in progress), real classifier and safety thresholds (in progress).

## 6. Decided (2026-11-06)

R4: D2 and D43 adopted, $25 cap, dev 0039, strings as recommended. Landing order of releases: P2, then R1 and R3 (their deploys were blocked by the exact-schema preflight and went out with R2), P3 and P4 (inside the R2 fast-forward), R2, P5 (re-stacked without R4). Dev migrations 0036-0039 applied. P6 DB steps, prod migrations and every push to main remain owner actions.
