# Tutor ladder and cleanup: owner inbox

Current state as of 2026-11-06 10:10 PT. Older per-release notes, superseded plans and the full decision history are in `OWNER-INBOX-archive-2026-11-06.md` (same folder). Claude never sets `MVP_ALLOWED_SHA`, pushes `main`, deploys production, applies a migration (dev needs your GO announced first; prod is always yours), or spends beyond an approved cap.

Three states are kept apart everywhere below: **Deployed** (the production deploy run for that SHA succeeded), **Flag** (is the feature switched on in production), **Accepted** (focused functional checks passed). "Deployed" never means a browser check on digrabbithole.com: none has been done. Main is `3b9348449` (release 65).

## SPRINT TARGET (owner, 11:05 PT): the working Tutor core

**Drop Markdown -> Tutor invitation -> accept roadmap -> accept proposal -> generate explanation -> save -> reload -> suggest the next step**, proven with a real browser, Worker and model run. Everything else is a follow-up and does not compete for integration or verification time. Progress against that flow (nothing proven end to end yet):

| Step | Needs | Status |
|---|---|---|
| Model calls work on real D1 | pin 71 hotfix (D1 LIKE) | in build, being verified against real dev D1 |
| Planning does not burn quota on failures; stalled roadmaps recover | quota fix + scoped repair | in build |
| Invitation after Markdown import | `sourceReady()` wiring | in build (`feat/tutor-r4-integration-2`) |
| Selected Depth used | Depth wiring | in build (same branch) |
| Typing/answering respected | invitation timing | in build (same branch) |
| Save before acknowledge, retry without duplicate card or charge, reload shows card once | delivery fix | in build (same branch) |
| Suggest the next step | R6 minimum | R6 tip `c4ea99743` pushed (atomic Auto-suggest write; the delivery/mode wake is a no-op unless `ROADMAP_AUTO_ENABLED`); next-step suggestion needs no 0040, the preference-change trigger needs migration 0040. Needs restack onto the released main |
| Integrated proof: real browser, Worker, model | one candidate = main + hotfix + quota + integration + R6, deployed as the dev clone, run within the approved $25 | not started; starts when the pieces land |

Stopped or deferred to follow-ups (work pushed, nothing lost): R5 (editing, reuse, safety on edits; its route-gate bypass with percent-encoded paths must be fixed before its switch is ever on), R7 flows and fixes, R8 research/calculator, R9 practice. Cleanup P6a stays ready (pin 68) off the critical path. D1 audit is narrowed to the core flow.
**Real-browser authorization:** the repo CLAUDE.md says Claude does not run local browser automation unless the owner explicitly authorizes it. Your sprint message asks to prove the core flow with a real browser run; I am treating that as the explicit authorization for THIS core flow only (the repo's own Playwright checks against the dev clone/local stack, no production browsing). Tell me if you did not mean that.
**Needs from you:** "GO 0040" = apply migration 0040 (R6 settings events table) to the dev Learn D1 now and to prod immediately before the R6 release (launcher comes with the R6 candidate). Not needed for the next-step suggestion itself.

## 0. URGENT: production bug in the live roadmap (hotfix in progress)

- **What:** `platformCallModel` and `platformJevAsk` (`packages/control-plane/src/roadmap/roadmap-models.js`) look up earlier calls with `operation_key LIKE '<~70-byte prefix>%'`. Cloudflare D1 rejects a LIKE/GLOB pattern over 50 bytes once the table has a row (`SQLITE_ERROR 7500, LIKE or GLOB pattern too complex`). Only the first model call ever succeeds; every later plan draft/revise, grounding, safety and JEV call fails as "model unavailable", is retried, and burns the learner's plan quota (6 per hour). No card is generated or charged. Found on the dev clone by the qualification run; production D1 has the same limit. Local tests missed it because `node:sqlite` has no such limit.
- **Now live:** the roadmap is ON in production (release 65), so users who click Explain on canvas can hit this.
- **Fix:** range query `operation_key >= prefix AND operation_key < prefix || '~'`, plus a stricter D1 stand-in in the test fixture (4 roadmap tests fail on the old code). Commit `46367522d` on `feat/tutor-r4-qual`; the hotfix candidate is being built on main as pin 71 (`feat/tutor-r4-hotfix`), with a review of other D1-only limits (LIKE over 50 bytes, more than 100 bound parameters). Its release command is sent the moment it is previewed.
- **Containment (owner directive):** a feature that repeatedly fails and consumes planning quota should not stay enabled just because it charges no credits. A flag-OFF release is being prepared as pin 72 (`feat/tutor-r4-flagon-recovery` or `feat/tutor-r4-flagoff`: removes `ROADMAP_ENABLED` from the prod config only, no migration, previewed). Its exact command is sent as soon as its preview exits 0; running it is your decision. If pin 71 lands first, 72 is re-stacked on the new main.
- **Pin 71 scope:** only the D1 LIKE defect. Before it is called verified it must be exercised against REAL dev D1 with existing rows: both the model-call and the JEV lookup, realistic operation keys, repeated calls, neighbouring prefixes (shared long prefix, strict prefix of another key, keys near the upper bound), and the unknown-provider-outcome protection; the new test fixture is being refined to reject only an over-50-byte PATTERN parameter, not any long parameter in a LIKE query. A broad D1-limit audit runs in parallel (`feat/tutor-d1-audit`) and does not block 71.
- **Quota fix (separate, immediate, `feat/tutor-r4-quota`):** the learner's plan quota is reserved before the failing lookup, so each retry burned a unit though no provider call was dispatched. Fix: local validation and prior-call checks before consuming quota where possible; proven pre-dispatch failures must not consume the allowance repeatedly (idempotent compensation); unknown provider outcomes keep their safeguards; no reset of all counters and no erasure of call evidence. Already-stalled roadmaps (outbox pushed to now+3600 after the 300 s deadline) must recover: a scoped, reviewed repair script with an owner-run launcher and a read-only `--check` is being prepared (the production count of affected rows is an owner-run read-only step; dev rows left by the qualification run are the test case).

## 0b. R4 integration gaps on main (assigned: `feat/tutor-r4-integration-2`)

Reviewed main still has: Markdown import never calls `roadmap.sourceReady()`; roadmap Depth is hardcoded to Standard; typing/answering state is not connected to invitation timing; delivery is acknowledged after `persist()` without checking its `{ok:false}` result and sends a null board revision. Required: a card is present in the successfully saved board before delivery is acknowledged; failed saves stay retryable with no duplicate card and no duplicate charge. LearnPage changes stay under the Lead's single-writer ownership. Status: in build, not previewed.

## 1. Where everything is

| Item | Deployed to prod | Flag in prod | Functional acceptance |
|---|---|---|---|
| Cleanup P1 | yes | no flag (removal) | tests/preview only |
| Cleanup P2 Browser Tutor off | yes (run 42247063137) | no flag | tests/preview only |
| R1 Card feedback | yes (with R2) | no flag | tests/preview only |
| R3 Source refs | yes (with R2) | no flag | tests/preview only |
| Cleanup P3 Server Tutor off | yes (with R2) | no flag | tests/preview only |
| Cleanup P4 Journeys/syllabus off | yes (with R2) | no flag | tests/preview only |
| R2 Depth, Auto-suggest | yes (run 42250400898, d2428e357) | no flag | tests/preview only |
| Cleanup P5 Duplicate grading off | yes (run 42253670464, d870aef1f) | no flag | tests/preview only |
| R4 Roadmap loop (63 loop, 64 wiring + S26/S27 drafts, 65 flag-on) | yes: runs 42257418795, 42262160608, 42265221173 (3b9348449, 09:57 PT) | `ROADMAP_ENABLED` **true** in prod | NOT done. Durable Object alarm, retry, one-object-per-board verified on a dev clone (phase 1, no spend); the D1 LIKE bug above found; real-model phase not run |
| Hotfix for the D1 LIKE bug (pin 71) | no, in build | n/a | n/a |
| Roadmap flag-OFF containment (pin 72) | no, in build; command sent when previewed | would set `ROADMAP_ENABLED` unset | n/a |
| Quota reservation fix + stalled-roadmap repair | no, in build (`feat/tutor-r4-quota`) | n/a | n/a |
| R4 integration gaps (sourceReady, Depth, typing timing, delivery ack) | no, in build (`feat/tutor-r4-integration-2`) | n/a | n/a |
| Cleanup P6a join removal (pin 68, SHA `84d94faab`) | no: ready, previewed (exit 0), held behind the hotfix | n/a | backfill gates PASSED on dev and prod (0 goals to archive; receipts under `C:\s\spec\release-queue\tutor-cleanup\receipts`) |
| Cleanup P6b drop, P7 docs | no: built, wait for P6a live; DB window needs your GO | n/a | not started |
| R7a Long Markdown, R7b PDF text (pins 69, 70) | no, re-stacking onto main | false (own switches `ROADMAP_LONG_MARKDOWN_ENABLED`, `ROADMAP_PDF_ENABLED` unset) | verifier: releasable as flag-off support code. UNFINISHED capabilities (do not claim the learner flow works): R7a has no whole-long-document planning through its index and evidence retrieval (the learner narrows to a part); R7b has no PDF invitation or UI entry and delivered cards carry no PDF reference that navigates to the PDF |
| R6 Automatic next proposals | no: built, verifier reviewing | false (`ROADMAP_AUTO_ENABLED` unset) | not started |
| R5 Proposal editing | no: built, verifier reviewing | false (`ROADMAP_EDIT_ENABLED` unset) | not started |
| R8b Calculator, R8a Research | no, in build (lane D) | false | not started |
| R9 Practice and assessed Progress | no, in build (lane E) | false (`ROADMAP_PRACTICE_ENABLED`) | not started |
| R10-R16 | no | false | not started |

Production Learn D1 has migrations 0036-0039 (applied by you). Dev Learn D1 has 0036-0039. The release preflight requires the prod schema to equal the candidate's schema exactly, so each migration is applied immediately before the release that includes it, never earlier.

## 2. Commands for you now and next

Nothing is runnable on prod this minute. In order, as each becomes ready (each message will carry the exact command):
1. **Hotfix, pin 71** (no migration), first. Command follows as soon as its preview exits 0.
2. **P6a, pin 68** (`84d94faab`, no migration): needs re-stacking onto the hotfix tip, then its command. The backfill gates already passed.
3. **R7a, pin 69**: needs prod migration `0042` first (`C:\s\spec\release-queue\apply-prod-migration-0042.cmd`, expects 2/2 tables), then the release. **R7b, pin 70** after it, no migration.
4. **R6** (prod migration 0040) and **R5** (prod migration 0041), each migration immediately before its release, after their independent verification.
5. **Qualification, paid phase** ($25 cap, planned $4-6): after the hotfix is deployed, the clone is redeployed from the hotfix tip with `C:\s\spec\r4-qual\r4-qual-clone.cmd deploy`, then `... secrets` (puts the model keys on the dev clone only), then the agent runs the cases, then `... delete`.
6. Obsolete pins, do not run: 57, 58, 60, 61, 66, 67.

## 3. R4 activation and qualification

Decided: D2 routing exception adopted, D43 safety policy adopted, $25 real-model cap approved (hard stop $25; ledger `C:\s\spec\logs\r4-qual-ledger.md`, $0.00 spent), dev 0039 applied, strings S1-S10, S28, S11-S25, S29 approved; defaults applied for D-R4-5..10. You chose to release the flag-on (65) before qualification finished.
Phase 1 (no spend) results on the dev clone at `fe941068`: flag on, roadmap create 202 and `draft`; `plan_requested` outbox event committed with the create; the `RoadmapJobs` Durable Object alarm fires (`outcome: ok`, 0 exceptions) with the 5, 10, 20, 40 s backoff; one object per learner and board (three boards, three ids); second unfinished roadmap on the same board returns 409; a 38,799-character source accepted, a 58,280-character source returns 422 `source_too_large`. Findings: the D1 LIKE bug (section 0); once `deadline_at` (300 s) passes, `next_at` jumps to now + 3600 (a pending plan waits an hour; phase 2 must create fresh roadmaps); the redeploy-restart and the 24 h delivery deadline are untested.
Test rows left in the dev D1 by phase 1: five draft roadmaps with outbox rows, quota rows for four throwaway learners, canvases/boards/files for them. They spend nothing. Cleanup is optional.
S26 DRAFT (refusal): "I can't make this explanation. It is outside what I can create here. You were not charged." S27 DRAFT (personal risk): "I did not make this explanation, and you were not charged. If you are in danger or thinking about hurting yourself, please call your local emergency number or a crisis line in your area. You do not have to deal with this alone." Both are live in production as drafts (release 64); approve or replace.
Qualification plan (within the approved $25 cap): after the hotfix and integration branch are merged into one candidate, deploy it as the dev clone and run the integrated flow: drop a Markdown file, invitation, selected Depth, plan, accept, generated card, successful save, reload; plus a failed save and a second generation with existing database rows (using the repo's Playwright check harness against the clone, not an interactive browser). Launcher commands (`r4-qual-clone.cmd deploy`, `secrets`, `delete`) are sent as soon as the candidate SHA exists.
Still unmeasured: planner quality, grounding and safety thresholds (`MAX_UNCERTAINTY` 0.4 etc.), roadmap check seconds (placeholders 10/15 s because the CI split is saturated), browser behavior.

## 4. Lanes, bases and migration numbers

| Lane | Work | Base | Branch |
|---|---|---|---|
| Hotfix | D1 LIKE fix + D1-limit review (pin 71) | main `3b9348449` | feat/tutor-r4-hotfix |
| A (finished) | R6, then R5 (R6 independent of R5; R11 speculative generation not in scope) | R4 tip `fe941068` | feat/tutor-r6 `2119107c0`, feat/tutor-r5 `46bcd9401` |
| A verifier | independent review of R6 and R5 incl. flag-off with `ROADMAP_ENABLED` true, D1 limits, and a secret scan (lane A committed with hooks disabled) | n/a | running |
| B (finished) + re-stack | R7a (pin 69), R7b (pin 70) | main `3b9348449` | feat/tutor-r7a-release-2, feat/tutor-r7b-release-2 |
| B fix lane | the R7 verifier's defects, one commit each | R7b lane tip | feat/tutor-r7-fixes |
| C (finished) | P6a (pin 68), P6b scripts, P7 skeleton | main `3b9348449` (P6a) | feat/tutor-cleanup-p6a-release `84d94faab`, -p6b, -p7 |
| D | R8b calculator, then R8a research | main `3b9348449` | feat/tutor-r8b, feat/tutor-r8a |
| E | R9 practice and assessed Progress | main `3b9348449` | feat/tutor-r9 |
| Qualification | dev clone, real model and Durable Object | `fe941068` + fix | feat/tutor-r4-qual `46367522d` |

Migration numbers (central; none beyond 0039 authorised on any database): 0040 R6, 0041 R5, 0042 R7a, 0043 R7b (only if needed), 0044 R9, 0045 R8a (only if needed).
Release order: hotfix, then P6a, R7a, R7b, then R6, R5 as verified; every later candidate is re-stacked by merging the new main (new SHA, new preview, ~10-15 min). R9 assessment: `learn-assessment.js` is retained after P5, so R9 does not wait on a missing grader; R7 is not a blanket prerequisite for R8-R16.
Lead-only files (single writer): learn-models.js, route mounts, wrangler*.jsonc, check-map.json, LearnPage.jsx, learn-usage.js, repository-schema.sql, roadmap-models.js. Lanes hand these over as lead patches.

## 4b. Lane work order after the owner's A/B/C direction (10:40 PT); one landing order, each lane restacked ONCE at release time

- **Lane A2 (R6/R5 completion), running:** R6 settings/outbox atomicity (enabled-mode batch failure must not save the preference without its event); R5 model registration, Chat resolver and page patches as lead patches for the Lead to apply; proposal safety check wired; reachable existing-card reuse controls; `proposal` ContextRef contract mismatch fixed at the consumers; interactions verified (automatic next proposal, Auto-suggest off, Ask/pause, Quick Edit Apply/Cancel, existing-card reuse, no duplicate generation or charge); hook/secret scan completed. Both switches (`ROADMAP_AUTO_ENABLED`, `ROADMAP_EDIT_ENABLED`) stay off until focused acceptance passes. Next dependency: independent verifier report, then migrations 0040 and 0041 before their releases.
- **Lane B (R7), running in two parts:** fix lane (`feat/tutor-r7-fixes`: duplicate summary spending, per-index budget, PDF text under an unchanged revision, and the rest of the verifier list) and B3 (`feat/tutor-r7-flows`: whole-document Markdown planning through the index and evidence retrieval; a reachable PDF invitation/entry; delivered-card references that navigate to the PDF page). Acceptance cases: late section of long Markdown, source replacement, mixed readable/scanned PDF pages, source navigation. R7a/R7b infrastructure can ship with switches off (pins 69/70); the learner flows are NOT accepted until B3 lands.
- **Lane C2 (cleanup), running:** exact owner command sheet per environment and recovery procedure (`C:\s\specelease-queue\p6-owner-commands.md`), P6b rebuilt on the P6a-release line, P7 doc with real status. Sequence fixed: backfill verified (done) -> P6a live (pin 68, restacked once onto the released hotfix main) -> approved P6b drop window and matching release. P7 is marked complete only after the actual DB steps and post-release verification have evidence. No agent runs anything against a database.
- **R4 integration gaps (sourceReady, Depth, typing timing, save-before-acknowledge)** are assigned separately (section 0b) and stay visible here; they are not behind later-feature work.

## 5. Findings still open

- **R7 verifier (both inert-releasable):** R7a medium: concurrent summary runs pay twice and can overwrite a done batch; the summary budget is per run, not per index; the trigger is unmounted. R7a low: CRLF fences, empty-choices message for over-2-MiB sources, surrogate cut, DOMException misclassified, guard gaps. R7b medium: PDF page text can change under an unchanged revision. R7b low: tiny text layer counts as readable, cut-page disclosure, no-match limitation, page-count check, page-range cap, two unflagged shared-file branches. Fixes are in progress on `feat/tutor-r7-fixes`; fix before turning any R7 switch on.
- **R6/R5 verifier extra checks (in progress):** R6's catch-all fallback can save Auto-suggest without its outbox event (atomicity must hold when enabled; a batch failure must be tested); R5 still needs its model, ask-route and LearnPage patches applied, a wired proposal safety screen and reachable existing-card reuse controls; adding `proposal` to the ContextRef contract fails the generation-review contract test, to be fixed at the contract consumers, not by weakening the test.
- **R6/R5 lane notes:** the CI time budget test (`a broad selection splits into six parts`) has no headroom (915 s per part with their rows); default fix is folding their new steps into the existing roadmap check unless you prefer a seventh part. R5 adds eight learner strings needing your approval: Edit, What should change?, Apply, Discard, Add to chat, Existing card, Editing is not available right now., That change could not be made. R6 adds none. Not built: R6 first proposal after Accept plan stays manual; no `roadmap_proposal` model role in R6; R5 link-card menu row, Ctrl/Cmd+L chord, drag handoff, safety screen on proposal text.
- **Process:** lane A committed R6/R5 with `-c core.hooksPath=/dev/null`, bypassing the machine's GitDefender hooks; no later agent did. Default: the verifier scans the diff and the commits are re-created with hooks active before release; tell me if you want otherwise. The permission classifier denied an agent's `wrangler deploy` of a dev clone (not worked around; you ran the launcher). Cloudflare's D1 time-travel API returned a 500 once during release 65 (retried green).

## 6. Open decisions (none stops other work)

- **S26/S27 final wording** (live as drafts) and the **R5 strings** above. Needed: approve or replace.
- **Strings of live releases, never signed off:** R1 (D-R1-S), R2 (D-R2-S), R3 (D-R3-S) and the P4 mode-line strings (texts in the archive file, section 2). Recommended: approve.
- **D-P2-1:** keep the static Tutor entry card until R4 is on (recommended) or remove it. **D-R2-1:** one control bound to the per-learner Auto-suggest instead of two. **D-N3:** `fast-e2e.yml` `only` input needs your `!` command, prepared when that phase is ready.
- **N6 (decided by default, shout if wrong):** the P6b drop deletes a placeholder goal only if it is still `open` with `revision = 0`.
- **D-DB:** the P6b window (backfill done) needs your GO at the moment of the step: `learn-retire-tutor.cmd prod window-check`, then `retire` with typed `RETIRE PROD` and `P6A SERVED`, then the P6b release immediately.
- **D-CI-BUDGET:** fold R6/R5 e2e steps into the existing roadmap check (default) or add a seventh part.
- Not verified anywhere: browser behavior of any release, real-model behavior, real classifier and safety thresholds.

## 7. Decided (2026-11-06)

R4: D2 and D43 adopted, $25 cap, dev 0039, strings as recommended; flag-on released before qualification (owner choice). GO always means production. Landing order so far: P2, then R1 and R3 (blocked by the exact-schema preflight, went out with R2), P3 and P4 (inside the R2 fast-forward), R2, P5 (re-stacked without R4), R4 63, 64, 65. Dev migrations 0036-0039 applied; prod 0036-0039 applied by the owner. Cleanup archive backfill gate passed on dev and prod. P6 drop, prod migrations and every push to main remain owner actions.
