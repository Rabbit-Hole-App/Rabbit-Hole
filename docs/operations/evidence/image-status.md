# IMAGE ACTIVATION status (ledger task 125bbcae-8d5c-443b-89d7-bc774395c9d4), 2026-10-25 10:30 PM PT

## Candidate
- Branch `feat/image-activation` on remote `rabbit-hole`, SHA **ebea37b80ad477f537003faba194e3ed97972c77** (one commit on main 629251d4, Motion R1b). Worktree C:/Users/cyudhist/Desktop/workspace/image-activation.
- CI on that exact SHA: verify run 40272692101 success (job 121408743920); fast-e2e run 40272692089 success (plan + 6 e2e shards + verdict job 121412457105), 70 checks selected. Not covered by fast-e2e (gate only): slash-cleanup-check,
  composer-plus-check, chat-workspace-shell-check and the rest of `notCovered` in the plan job. No browser check exists for the new /generate-image flow itself: it is unit/integration tested and its click-through is the owner-only acceptance.
- Unit results (local): control-plane full run 2847 tests, 2843 pass; the 3 failures were (1) image-flag-worker prod config (fixed in the candidate: the not_configured check now follows the allowed check) and (2) two `deadline launcher` tests in subscription.test.js,
  which also fail on pristine main 629251d4/29622d8e on this Windows machine (unrelated, pre-existing). Web unit 4249 tests, 4222 pass, 0 fail, 27 skipped (before the last small test additions, which were run singly and pass). Web build exit 0.
- Public activation candidate (config only, NOT pushed, NOT to run before acceptance + owner GO): local branch `config/image-public-activation` head 746efe5b (53b4a0ab is the config commit; 746efe5b adds two docs).

## What the candidate does
Server: owner-only path from the verified session principal (IMAGE_ACCEPTANCE_EMAILS = user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid + yudhisteer.chin@gmail.com, whole-address match) across GET capability, POST image-proposals, POST image-jobs, the DO
(alarm/submit re-check per job requester), the chat router; inspect operator-only; operator-only deterministic fault injection (provider_400/429/network/invalid_output); prices and policy (8 enabled rows); hold US$0.20; user messages saved with the plan.
Web: no build switch; GET /api/learn/image-jobs per caller turns /generate-image on; typed /generate-image (or router-read plain words) creates the plan on the server and shows the card; Generate -> job -> image card; after a reload the card follows the existing job.
Tests: image-owner-only.test.js (17: both owner identities, 11 look-alikes incl. yudhisteer.chin01@gmail.com, no session, forged headers/body/query, other operator, public flag, router, faults, switch-off) with a negative control (a prefix matcher fails 4); image-capability.test.mjs (8); updated image-*.test.js.

## Verified / unverified
VERIFIED: official prices and ids (price-verification.md); evidence record and adapter diff (validation-plan.md); the secrets command (11 harness tests, dry-run under node --permission); ledger arithmetic; owner-only enforcement by tests on the real identity path; candidate CI.
UNVERIFIED: anything on the deployed Worker; the browser flow (plan card, Generate, reload follow, image placement); real secrets on production; the click-through; Telemetry (not in production); OpenAI edit price; Google 2K/4K; transcription behaviour (below).

## Money
Mine this session: US$0. Image lane total spent US$0.123142 (earlier lane, 4 calls, imgact-*; verified in budget.json). Allocation left 0.676858 of 0.80.
BLOCKER (owner decision): the shared ledger is now spent 17.9994, reserved 0.25, remaining **1.7506**, i.e. BELOW the US$2.00 Motion acceptance reserve (motion-prod-accept-1 settled 1.278157 at 9:50 PM PT). I may not reserve any paid image acceptance run
while that reserve is preserved. The production acceptance needs at most 0.44 reserved (expected 0.28). Options (raise needed = 0.2494 + the maxima reserved): all five runs 0.44 -> raise 0.69; without Pro 0.24 -> raise 0.49; flare + sunburst + Nano Banana generate 0.16 -> raise 0.41; or reallocate from Motion. Recommendation: raise by 0.70 (cap 20.70).
Fault-injection and every other step cost 0 and are not blocked.

## Owner decisions / commands (details: activation-package.md)
1. Transcription goes live with the OpenAI key (A accept, B gate it). 2. Cap decision above. 3. Hold US$0.20 and the Nano Banana charge-versus-estimate gap (accept). 4. Commands in order: gate+release; `prod-image-secrets.mjs --dry-run` then real; open /api/learn/image-jobs as yourself and as the chin01 account; tell me to start; click-through; GO for public.

## Provisional ETA (PT, from 10:30 PM Oct 25; the gate/release queue is shared: Motion R1b/R2 and Telemetry also need gates, one at a time)
Preparation: done. Gate dispatch by the integrator then ~10 to 15 min wall: if image is third in the queue, 11:15 PM to 12:15 AM. Owner release (main push + deploy ~5 min): live with public OFF at ~12:00 to 12:45 AM.
Owner commands: secrets 2 min after release. Acceptance: 45 to 60 min owner click-through plus 15 min for me to write the receipt (needs the cap decision before the paid runs): receipt ~1:15 to 2:30 AM. Public activation: owner GO, a second gate (config keeps the gate) and main push: ~30 to 45 min after GO.
