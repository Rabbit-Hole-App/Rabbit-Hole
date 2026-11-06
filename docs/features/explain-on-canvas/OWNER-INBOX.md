# Tutor ladder and cleanup: owner inbox

Current state as of 2026-11-06 11:20 PT. Older per-release notes and the decision history are in `OWNER-INBOX-archive-2026-11-06.md` (same folder). Claude never sets `MVP_ALLOWED_SHA`, pushes `main`, deploys production, applies a production migration, or spends beyond an approved cap. GO always means production. Real-browser proof and manual tests are owner-run, later, and never block a release.

Three states are kept apart: **Deployed** (the production deploy run for that SHA succeeded), **Flag** (switched on in production), **Accepted** (focused functional checks passed). Main is `a305a83f5`.

## SPRINT TARGET: the working Tutor core

**Drop Markdown -> Tutor invitation -> accept roadmap -> accept proposal -> generate explanation -> save -> reload -> suggest the next step.** Nothing in this flow has been proven end to end yet.

| Step | Needs | Status |
|---|---|---|
| Model calls work on real D1 | pin 71 hotfix | DEPLOYED (run 42275190805, 10:58 PT, `a305a83f5`); real-D1 evidence collected |
| Quota not burned by pre-dispatch failures | pin 73 | READY, previewed (exit 0), not released |
| Invitation after Markdown import; selected Depth; typing/answering timing; save-before-acknowledge | pin 74 (`feat/tutor-r4-integration-2` `025876d00`, stacked by the core-chain agent) | built and unit-tested; chain agent stacking and previewing |
| Accepting a roadmap produces its FIRST proposal once (owner-found gap: the real server only activates the roadmap, R6 waits for a delivered step, and the web test fake wrongly supplied the first proposal) | added to pin 74/75: offer the first proposal on accept via the existing composition, once, no card generated and no charge; fake server and tests aligned to the real behaviour | sent to the core-chain agent 11:30 PT |
| Suggest the next step | pin 75 = R6 (tip `c4ea99743`, atomic Auto-suggest write, no-op unless `ROADMAP_AUTO_ENABLED`) | built; chain agent stacking; the next-step suggestion needs no migration, the preference-change trigger needs 0040 |
| Turn the automatic suggestion on in production | pin 76 (one line, `ROADMAP_AUTO_ENABLED` true in the prod config) | being built |
| Proof with real browser, Worker, model | dev clone + your browser tests + the approved $25 model run | clone launcher written after pin 75 |

## 1. Where everything is

| Item | Deployed to prod | Flag in prod | Functional acceptance |
|---|---|---|---|
| Cleanup P1-P5 | yes (P2 run 42247063137; P3 and P4 inside R2 run 42250400898; P5 run 42253670464) | no flag (removals) | tests/preview only |
| R1 card feedback, R3 source refs, R2 Depth/Auto-suggest | yes (R1 and R3 went out with R2, run 42250400898, `d2428e357`) | no flag | tests/preview only |
| R4 roadmap loop (63), wiring + S26/S27 drafts (64), flag-on (65) | yes (runs 42257418795, 42262160608, 42265221173) | `ROADMAP_ENABLED` **true** | not done. Durable Object alarm, retry and one-object-per-board verified on a dev clone (no spend); a real model run has not been done |
| Hotfix for the D1 LIKE bug (71) | yes (`a305a83f5`, run 42275190805) | n/a | real-D1 evidence: the range form returns exactly the same-identity keys; the old 70-byte LIKE is rejected by real D1 |
| Quota fix (73, `a28ed8f86202cc28ed885863f37910e597fe4419`) | no: ready | n/a | tests and preview only |
| Integration (74), R6 (75), auto-suggest flag (76) | no: being stacked and previewed | `ROADMAP_AUTO_ENABLED` unset | not started |
| Cleanup P6a (68, `84d94faab`), P6b, P7 | no: P6a ready but must be re-stacked; the window goes LAST | n/a | backfill gates passed on dev and prod (0 goals to archive) |
| R5, R7a/R7b, R8b/R8a, R9 | no: deferred (work pushed to `feat/tutor-*` branches or kept in worktrees) | false (own switches unset) | not started |

Production Learn D1 has migrations 0036-0039. Dev Learn D1 has 0036-0040 (0040 applied 11:15 PT on the owner's "GO 0040", dev only). The production release preflight requires the prod schema to equal the candidate's schema exactly, so each migration is applied immediately before the release that includes it, never earlier.

## 2. Commands for you, in this order (each asks you to type RELEASE <n>)

Bash path used below, call it `RUN`: `"C:\Users\cyudhist\AppData\Local\Programs\Git\usr\bin\bash.exe" C:/s/spec/release-queue/morning-release.sh`

1. **Pin 73** (quota fix; no migration; main must be `a305a83f5`): `RUN 73-tutor-r4-quota-mvp`. Recovery branch `feat/tutor-r4-quota-release-recovery` `88516fa2d`. Hardening only: production has 0 affected rows (your check at 10:59 PT), so the stalled-roadmap repair is NOT needed in production.
2. **Pin 74 then pin 75 then pin 76:** commands are added here as each preview exits 0. Prod migration 0040 (`C:\s\spec\release-queue\apply-prod-migration-0040.cmd`, launcher being written; table `learn_roadmap_settings_facts`) is applied immediately before the release that carries R6's schema (pin 75), not before.
3. **Dev clone** for your browser tests and the paid qualification: `C:\s\spec\r4-qual\core-clone.cmd deploy`, then `secrets`, then `delete` (written after pin 75).
4. **P6a/P6b window:** last, after the core chain (after the P6b drop every later release must descend from P6b). Command sheet: `C:\s\spec\release-queue\p6-owner-commands.md`.
5. Obsolete pins, do not run: 57, 58, 60, 61, 66, 67, 68 (until re-stacked), 69, 70. Pin 72 (roadmap OFF, `92ba70062`) is the containment command if you ever want the roadmap off; it is stale now that main moved and would be re-stacked first.

## 3. Browser tests I need from you (owner-run, when free; not blocking)

On the dev clone, one Markdown file with a few headings, Depth set to Deep:
1. Drop the Markdown on a Learn canvas: does the Tutor invitation appear, and not while you are typing in Chat?
2. Accept the roadmap: does a plan appear in the contents, and a step proposal?
3. Accept the proposal: does an explanation card appear matching the selected Depth (try Overview vs Deep)?
4. Reload: is the card there exactly once, and is the step shown as delivered?
5. After delivery: exactly one next-step proposal (needs pin 75 and the auto-suggest flag on the clone). Turn Auto-suggest off and deliver another: no proposal.
6. Failed save: block the network during the save; the card stays retryable, and after reconnecting there is one card and one charge.
7. A refused request (type a first-person danger statement as the instruction): you see the S27 support text, no card, no charge.
Send pass/fail plus a screenshot or the text for each.

## 4. R4 qualification and activation

Decided: D2 routing exception adopted, D43 safety policy adopted, $25 real-model cap approved (hard stop $25; ledger `C:\s\spec\logs\r4-qual-ledger.md`, $0.00 spent), dev 0039 and 0040 applied, strings S1-S10, S28, S11-S25, S29 approved; defaults applied for D-R4-5..10. You released the flag-on (65) before qualification finished.
Phase 1 (no spend, dev clone at `fe941068`): roadmap create 202 and `draft`; `plan_requested` outbox event committed with the create; the `RoadmapJobs` Durable Object alarm fires with the 5, 10, 20, 40 s backoff; one object per learner and board; a second unfinished roadmap on one board returns 409; a 38,799-character source accepted, a 58,280-character source returns 422 `source_too_large`. It also found the D1 LIKE bug (now fixed and deployed). Open: once `deadline_at` passes, `next_at` jumps to now + 3600 (a pending plan waits an hour; the quota fix plus repair address this); redeploy-restart and the 24 h delivery deadline are untested. The paid phase (planned $4-6) runs on the integrated clone after you deploy it and run `secrets`.
Production impact of the bug: your read-only check (10:59 PT) found 0 quota rows and 0 outbox rows affected.
Dev test rows left by phase 1: five draft roadmaps, quota rows for four throwaway learners; the prepared dev repair returns 46 units. Optional.
S26 DRAFT (refusal, live): "I can't make this explanation. It is outside what I can create here. You were not charged." S27 DRAFT (personal risk, live): "I did not make this explanation, and you were not charged. If you are in danger or thinking about hurting yourself, please call your local emergency number or a crisis line in your area. You do not have to deal with this alone." Approve or replace.
Still unmeasured: planner quality, grounding and safety thresholds, roadmap check seconds (placeholders 10/15 s), browser behavior.

## 5. Lanes and bases

| Lane | Work | Base | Branch | State |
|---|---|---|---|---|
| Core chain | 73 quota, 74 integration, 75 R6, 76 auto-flag, clone and 0040 launchers | main `a305a83f5` | feat/tutor-r4-quota-release, feat/tutor-r4-core-74/75/76 | running |
| Cleanup | P6a `84d94faab`, P6b release `7794fa0a0` (recovery `e8ba8487b`), P7 doc `03c0af583` | main `3b9348449` (P6a) | feat/tutor-cleanup-p6a-release, -p6b-release, -p6-docs | built; re-stack once after the core chain |
| D1 audit | guard commit `04b5b3aa2` (rejects over-50-byte LIKE patterns, more than 100 parameters, over-100 KB statements) | main `3b9348449` | feat/tutor-d1-audit | done; merge after pin 73 and a canvas-fork title fix |
| Deferred | R5, R7a/R7b (+ fixes, flows), R8b/R8a, R9 | various | feat/tutor-r5, -r7a, -r7b, -r7-fixes, -r7-flows, -r8b, -r8a, -r9 | stopped on the owner's sprint directive; partial work may be only in the kept worktrees |

Migration numbers (central): 0040 R6, 0041 R5, 0042 R7a, 0043 R7b (if needed), 0044 R9, 0045 R8a (if needed). Lead-only files (single writer): learn-models.js, route mounts, wrangler*.jsonc, check-map.json, LearnPage.jsx, learn-usage.js, repository-schema.sql, roadmap-models.js. Release order: one chain; each candidate is re-stacked once, onto the actually released main.

## 6. Findings that are not on the critical path

- **D1 limits live in production, not core flow:** forking or duplicating a canvas with a title over about 46 bytes returns 500 (`canvases.js:138`); Explore, creators and Stars search error for terms over 48 bytes (`learn-boards.js:992-1015`, `creators.js`, `canvas-stars-list.js`, `canvas-refs.js`); a public comment thread with 99 or more distinct commenters fails (`canvas-comments.js:415`).
- **R7 (both inert-releasable, defects before switches turn on):** R7a duplicate summary spending and a per-run (not per-index) budget; R7b PDF text can change under an unchanged revision; plus smaller items. Unfinished capabilities: R7a has no whole-long-document planning through its index; R7b has no PDF invitation or UI entry and no card reference that navigates to the PDF.
- **R5:** its route gate regex can be bypassed with percent-encoded paths (a paid model call without the switch); its model, ask-route and LearnPage patches are unapplied; the `proposal` ContextRef kind breaks the generation-review contract test (fix at `generation-review.js` REFERENCE_KINDS and `canvases.js` REF_PREFIXES, do not weaken the test).
- **Quota follow-up (logged, no redesign this sprint):** a window remains between reserving a quota unit and recording the reservation on the call row; a crash or write failure inside it can leave a reserved unit with no row proving what happened. The pin 73 release path covers proven pre-dispatch failures only; unknown outcomes keep their unit by design.
- **Integration CI failures (owner-reported):** the e2e harness clicks beneath the canvas header, and one assertion is too strict about whitespace; both being fixed narrowly in pin 74.
- **R6 follow-ups:** `omitStep` writes no outbox event (a skipped step does not trigger the next automatic proposal); the learner-scope fan-out retry is recovered only by cron; `readAutoSuggest` fails open on a read error; two extra GET reads after each delivery.
- **Process:** lane A committed R6/R5 early with git hooks disabled; the R6 diff was regex-scanned clean (a real GitDefender scan was not run) and later commits ran the hooks. The permission classifier denied an agent's `wrangler deploy` (not worked around). Cloudflare's D1 time-travel API returned one 500 and GitHub one TLS timeout during releases (both retried).

## 7. Open decisions (none stops other work)

- S26/S27 final wording (live drafts); R1/R2/R3 and P4 strings never signed off (texts in the archive file, section 2; recommended approve); R5's eight strings if R5 resumes.
- D-P2-1: keep the static Tutor entry card until the roadmap is fully on (recommended) or remove it. D-R2-1: one control bound to the per-learner Auto-suggest. D-N3: the `fast-e2e.yml` `only` input needs your `!` command, prepared when that phase is ready. N6 (decided by default): the P6b drop deletes a placeholder goal only if still `open` with `revision = 0`.
- D-DB: the P6b window needs your GO at the moment of the step (`learn-retire-tutor.cmd dev|prod window-check`, then `retire` with typed phrases, then the P6b release immediately). Not pre-approvable.
- Whether to resume the deferred lanes (R5, R7, R8, R9) after the core flow is accepted.
