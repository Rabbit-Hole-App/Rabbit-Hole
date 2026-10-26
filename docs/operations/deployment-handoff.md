# Deployment handoff

Last updated: Monday 2026-10-26, 1:34 AM America/Los_Angeles (PDT). Updated after every lane handback, diagnosis, candidate freeze, gate, deployment and blocker (see the change log at the bottom). Any ETA older than its stamp is stale.

Authoritative inputs (repository-relative): the 60-row [feature inventory](evidence/feature-inventory.md), the [discrepancy table](evidence/completion-audit-discrepancies.md), the [validation budget ledger](evidence/validation-budget-ledger.md), the [flake list](evidence/flakes.md), the [FILE_JOBS contract](evidence/file-jobs-contract.md), feature docs under [`docs/features/`](../features/). The working task ledger and local receipts live on the integrator machine (`C:/s/spec/...`); important receipts are summarised under `docs/operations/evidence/`.

## 1. Where production is

- `main`: **629251d4** (Motion R1b), confirmed live at 8:50 PM PT: release run 40265877403, build `b9375cd27b266e37`, rabbit-hole-cp `b2235fca`, rabbit-hole-app `9d9cf478`, smoke passed, probes `200 200 401 401 405`.
- Motion renderer and orchestrator (Fly) run **32d86ee7** (renderer hash `02d5069eeb4d`), with a 1 GB durable job-store volume (`motion_jobs`, iad). Public Motion generation is **paused**; only the owner's account can start a job (owner-only path).
- Production Learn D1 has migrations 0027-0032 applied (215 objects, 0 differences against `main`). Production telemetry D1 `rabbit-hole-telemetry` (`e4c585cf-6078-43dd-b5c0-d30e0f80e778`) and R2 bucket `rabbit-hole-telemetry-archive` exist and are **adopted, empty and unbound**.
- Release order today (all live): Comments Stage 1 + Focus (889ed230), Credits (29070833), Telemetry dark (eac03b74), Stars inside Comments 2-4 (59bb544c), Weekly Top 5 (8bda70a2), CAD Focus (d31bab82), checks/docs (41aaaf43), Telemetry dev bindings (dc350796), Credits/Comments/Telemetry-acceptance batch C13 (29622d8e), Motion R1 (32d86ee7), Motion R1b (629251d4).

## 2. Features usable in production (with the evidence level)

Credits 2,500 AI credits a month; Comments (Stage 1, 2-4: replies, reactions, history, attachments, follows, nested access); Stars (Library Stars, Explore, profile); Weekly Top 5; Focus (notebook, PDF, image and other adapters) incl. CAD Focus adapter; Study slice; Explain/Tutor/Learn existing flows. Implemented, unit-tested and browser-tested **in CI**; **production acceptance** of the signed-in flows is pending the owner's checklist ([owner observations](evidence/owner-observations.md)). Credits CI browser checks (meter, renewal text, refusals) are live in `main`.

## 3. Deployed but disabled or not usable (do not count as complete)

| Feature | State |
|---|---|
| `/generate-image` | Substrate only. Three closed gates: web constant `IMAGE_GENERATION=false`, primitive `image_generate ready:false`, server `IMAGE_GENERATE_ENABLED="false"` with no OpenAI/Gemini keys and `IMAGE_GENERATE_RESERVED_USD` unset. |
| Motion public generation | Paused (`MOTION_GENERATION_PAUSED="1"`), owner-only path enabled. First owner job FAILED (see section 5). Expanded settings/22 measured pairs inactive; 45/60 s visible but unavailable. |
| Telemetry (production) | Resources adopted; binding candidate gated, NOT released; owner secret/identity pending. Dev is bound and live (dashboard inspection by the owner still pending). |
| Ctrl+K image edit / background removal, Ctrl+K JavaScript, file converter | Not available in production: `FILE_JOBS` not bound, `app-worker.js` does not export `FileJobs` (fix in candidate `infra/file-jobs-plumbing`), no conversion service in production. |
| `/video`, maths animation | Offered in the UI but fail at job time: no provider/FAL key, no production math renderer. |
| Recorded-answer transcription | `OPENAI_API_KEY` not installed in production (mic control returns 503 after recording). |
| CAD review-first | `CAD_BRIEF_FIRST=false`, `CAD_MAX_CALLS=2` (documented minimum 3); executor budget 96.3% reserved (diagnosis in progress). |
| Tutor general rubric / visual assessment | Not enabled in any config; only the codebase assessment is on. |

Explicitly deferred or paused (not reactivated): 3D assemblies (brief not handed over), later Explain Back improvements (brief not handed over), Voice Mode listening (paused by the owner 2026-10-12), avatar teacher (parked).

## 4. Budget

- Approved shared validation cap: **US$20.00** (unchanged). Live ledger (2026-10-25 9:55 PM PT): spent 17.9994, reserved 0.25 (dev volume), **remaining 1.7506**. The owner's willingness to go to **US$100** (Motion 40, Image 30, other acceptance 20, reserve 10) is a PROPOSAL; it is NOT approved and the ledger cap has not changed. The consolidated priced package is ready: [infra-package](evidence/infra-package.md) (expected new recurring about US$2.6-4.6/month, ceiling about US$15, within the US$30 target; one-time test budget required tests about US$22 maximum / US$9 expected; proposed per-job acceptance ceiling US$3.00 instead of US$2.00; cap proposal US$100). Image lane needs only about US$0.70 more to run its acceptance plan.
- Per-job Motion protection: validation bound US$3.00 (separate from the cap); the production acceptance window used a US$2.00 per-job ceiling, which caused the failed job below.
- New recurring costs ALREADY approved: Motion 1 GB volume US$0.15/month. PROPOSED, not approved: converter production app (about US$9/month estimated, to be verified), math renderer, others (infra-package pending).

## 5. Failed production Motion job (investigated, no new generation submitted)

Summary: job `61f701710ba30bfa591a992844509c0d` (owner, "15s explain photosynthesis", 16:9) failed after 3 model calls at a cost of US$1.278157 with the orchestrator's per-job ceiling at US$2.00; message "This video reached its AI spending limit" is a misclassification of a ceiling refusal (`cause: 'limit'`); the learner was charged 127.8 credits on the failed attempt (`would_charge`, settled) although the cause was our configuration; "reservation released" refers only to the US$8.96 hold. **Do not click "Generate again".** Full facts and evidence: [diagnosis](evidence/motion-failed-job-61f70171-diagnosis.md). Fix lane: `fix/motion-failure-handling` (specific failure codes and messages, preflight, refusal logging, zero-credit treatment, recovery eligibility, idempotent refund script).

## 6. Task board

Legend: To Do / Doing / Blocked / Done (a task is Done only with production evidence, or an explicit dated owner decision). Implemented / Verified / Deployed / Availability / Acceptance are separate. ETA in PT with assumptions; `-` means not estimable yet.

| Feature (UUID) | Owner / branch | Status | Built and remaining | Verified | Deployed | Availability / acceptance | Next action | Blocker | ETA (ready / live) |
|---|---|---|---|---|---|---|---|---|---|
| Motion (`733e996d-40b7-4f59-9463-4154d33ca278`) | integrator; `fix/motion-deploy-r4b` 618bcb8f (R2, gate 40264822245 passed) | Blocked | Infra live, canaries and restart check passed; owner-only path live (R1b); R2 activation prepared; first production job failed | verify/fast-e2e green on R1b and R2; motion-command-check 48/48 | R1b live (629251d4); R2 not released | Public paused; acceptance NOT passed | failure-handling fix, then ceiling decision, refund, one new confirmed job | per-job ceiling (US$2.00 too tight), budget (remaining 1.75), owner confirmation | ready: after fix + budget; live: -; |
| Motion failure handling (new, under 733e996d) | agent a261c920; `fix/motion-failure-handling` | Doing | classification codes, preflight, refusal logging, zero-credit rule, recovery eligibility, refund script | pending | no | - | candidate + CI | none | ready ~Mon 1-3 AM (provisional) |
| Telemetry (`6c3f8d59-c864-4a96-9a99-7b54c2561e21`) | agent a44172a3 (safeguards); candidate `feat/telemetry-bindings-prod2` 8d476050 | Doing | dev bound/live; prod resources adopted; safeguards F1-F7 fixes + harness rerun in progress; prod binding candidate gated | binding candidate: verify/fast-e2e/gate 40257810296 passed; harness previous run 186 scenarios/653 pass; rerun pending | dev yes; prod no | dev dashboard inspection by owner pending; prod disabled | finish fixes, re-review, owner GO | independent re-review, owner GO and identity (principal `user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid`) | ready ~Mon 12-1 AM; live after GO |
| Telemetry later increments (children) | unassigned | To Do | per-feature coverage, billing reconciliation, exports, archives, retention (no code exists) | - | - | - | assign owner | production activation first | - |
| /generate-image (`125bbcae-8d5c-443b-89d7-bc774395c9d4`) | agent ad5f8e55 | Doing | 5 real provider-adapter runs exist (local harness, 2026-10-23); frontend/server gates, owner-only path, secrets command (ready), 4-model pricing and validation plan | unit/CI fixtures only for the deployed flow | substrate only | disabled | evidence reconciliation, candidate, owner-only acceptance | provider keys not installed, reserve var, price evidence for OpenAI models, validation budget | -; provisional |
| Image activation candidate (under 125bbcae) | `feat/image-activation` ebea37b8, inside batch `stack/c14-batch` b0f5a6ad | Doing | owner-only path (IMAGE_ACCEPTANCE_EMAILS), server-derived command visibility, 8 priced rows (Nano Banana 2.1/Pro, flare, sunburst generate; sunburst edit greyed), hold 0.20 USD; public branch config/image-public-activation prepared, NOT pushed | image-owner-only 17 + image-capability 8 pass; verify 40272692101, fast-e2e 40272692089 green; no browser check of the flow | no | disabled | batch gate, release, secrets script, owner-only click-through | paid acceptance needs about US$0.44 reserve (ledger remaining 1.75 is below the Motion reserve); OPENAI_API_KEY also turns on /api/learn/transcribe (decision) | gate overnight; acceptance after release |
| Image command rename (child of 125bbcae) | unassigned | To Do | `/image` generate, `/photos` search, `/generate-image` alias | - | - | - | assign one owner, implement | owner go (given 9:3x PM) | - |
| Chat UX bugs (`b43b5a55-e9fa-444e-96d1-93510bc9faea`: `2a9f8ec0-0be6-4063-b8f2-ba989a9ca586`, `e80a2b45-dfbc-4916-951d-da69a9d3c39c`, `746c9e52-07fe-4269-8e1e-84454472f1b5`) | agent a0260024; `feat/chat-generation-ux` | Doing | shared response classification, job-bound generation status, remove Add as card | pending | no | - | helper + states + fork check | none | -; |
| Credits (`dd97625a-c3df-43af-a042-85ac0dc4310a`) | `fix/credits-finish` 1058a8dd | Doing (built, unreleased) | /api/learn/usage is credits-only (no USD/micros) and 5 other money leaks fixed (Motion list, image inspect, inline code/image quotes, CAD job view); ImageJobs sealing (late result cannot be delivered); Jev 429 known zero; route-failure refund (refundAttempt had no caller); telemetry labels. NOT done: Tutor/Next Steps model cost_usd telemetry, Motion-specific sealing test, Explain refund-on-terminal-failure policy (product decision) | verify 40275335149, fast-e2e 40275334969 green; control-plane 2841/0 fail, web 4242 (4215 pass, 27 skip); credits-meter 6/6, allowance 6/6, owner-telemetry 4/4, motion-command 48/48; ctrlk-* fixtures edited but not CI-run | no | wire-visible change: web and server must ship together | successor candidate C15 after the C14 gate (full gate) | none | ready ~Mon 2-3 AM; live after owner release |
| FILE_JOBS contract (`6570266e-f94c-4d55-9ee8-f3197f1339b4`) | agent a98015e5 (done); `infra/file-jobs-plumbing` 4735839f | Doing | binding + `file-jobs-1` migration + `FileJobs` export, features disabled | verify 40266606040, fast-e2e 40266606045 green; 165/165 + 52/52 local | no | disabled | gate (full gate needed) and owner release | none | ready: gate ~40 min |
| File converter, Ctrl+K image edit, Ctrl+K JavaScript | unassigned feature owners | To Do | adapters/config/acceptance against the FILE_JOBS contract | - | - | disabled | assign owners | FILE_JOBS release; infra approvals (converter prod app) | - |
| CAD review-first (executor budget) | diagnosis done (agent a64d0580); candidate not started | To Do | "96% reserved" is OUR monthly egress ledger (2 GiB policy cap, not a provider limit, not disk): 97% of it is one 10-18 image-build setup charge; 5 real attempts = 55 MiB; nothing is stale and no release path exists in code. October has room for 6 attempts; the UTC rollover (Oct 31 5:00 PM PDT) frees it; a manual October reconcile (set months[2026-10] to 57,671,680 bytes, 5 reservations, server stopped) needs owner sign-off. Candidate step: CAD_MAX_CALLS 2->3 (inert) then CAD_BRIEF_FIRST (held for owner GO) | diagnosis only; see [report](evidence/cad-constraint.md) | no | disabled | build commit A + config pins + docs | owner GO (D1), reconcile or wait (D3) | ready ~12:15 AM Mon if started; live after GO |
| Infra + provider package | agent a294f2e4 | Doing | priced package (converter, math, JS loader, Motion, Telemetry), provider access table | - | - | - | package | - | provisional |
| learn-tutor timing flake | `fix/learn-tutor-timing` c0bde839 | Done (fix), ships with next batch | deterministic timers | 20/20 idle, 20/20 under load; verify 40265441780 | no | - | batch | - | with successor |
| card-size teardown | `fix/card-size-teardown2` 397ef351 | Done (fix), ships with next batch | | fast-e2e card-size 24/24 | no | - | batch | - | with successor |
| Study resize persistence (`5b60a856-d5b4-4fc3-b6a1-3bc969113de0`) | agent acd2da33; old `fix/resize-persist` 59509345 (never green: own fast-e2e failed 2026-10-24; study-resize-persist-check 2/4 on the combined tree) | Doing | owner-reported bug still live in production; root cause being established; new branch `fix/study-resize-persist-2` | old branch not green; new: pending | no | broken | root cause + fix + CI | none | -; |
| Chat restore follow-up (`7959cd39`) | agent acd2da33; old `fix/chat-restore-context` 4549cf57 (never green: chat-outputs 15/16, step 16 chip and mode not saved to the restored thread) | Doing | new branch `fix/chat-restore-context-2` | pending | no | - | root cause + fix + CI | none | -; |
| File-drop check fix (`29a46467`) | `fix/filedrop-check` 22529b60, inside batch C15 | Doing | test-only | passed in the combined C14 CI | no | - | ships with C15 | none | with C15 |
| Stars follow-ups (`18ac55d1-1da7-4d80-9bed-09535681a293`) | unassigned | To Do | analytics wiring, star events to telemetry, `star.opened` | - | - | partial | assign | telemetry sink | - |
| Comments leftovers (`4c0f5e09-1105-4d5c-b272-afc866850e28`) | unassigned | To Do | enumerate defects/requirements | - | - | partial | enumerate | - | - |
| tldraw removal, shared review-card adoption, /video, maths animation, transcription, Tutor rubric/visual | see [inventory](evidence/feature-inventory.md) section 5 | To Do | proposed ledger tasks created from the audit | - | - | - | assign | owner decisions in the inventory (O-1..O-16) | - |
| Worktree cleanup | integrator | Done | 99 worktrees removed, free disk 6.4 -> 61.9 GB; 10 dangling junctions repaired | - | - | - | repeat after releases | - | - |

## 7. Blockers and owner decisions (summary)

1. Motion: per-job ceiling for the acceptance window and the budget to rerun (cap increase not approved yet). Refund of 127.8 credits (owner command after the fix).
2. Telemetry production GO (after re-review); the secret to type is NOT needed if the existing `SUBSCRIPTION_OWNER_EMAIL` secret already matches (verified by behaviour).
3. Image: provider keys installation command (ready), reserve variable derivation, price evidence.
4. Workers Paid on the production Cloudflare account (probably active since 2026-10-22, unverified); converter production app and other recurring costs: pending the priced package.
5. 16 scope decisions in the inventory ([section 4](evidence/feature-inventory.md)); the rename of `/image` and `/photos` is approved.

## 8. Rules that bind every lane tonight

Production mutations are owner commands; one gate and one release at a time; no paid call outside the shared ledger; script tests for production-affecting scripts run in an isolated harness (`CLAUDE.md`); users see AI credits only (no dollars) and no ellipsis in UI labels; no 3D assemblies, Explain Back or Voice Mode work without authorization.

## 9. Morning action queue (owner)

Dependency order. Commands marked READY were dry-run verified at the stamp above; the rest name their preparer and status. Nothing in this document authorises any action.

### Deadline outcome (the 12-hour target ended Mon 1:33 AM PT)

Not met for the three headline releases. Motion is deployed, but public generation is paused and the first owner job failed (fix delivered, not released). Production Telemetry is adopted but not bound or activated (safeguards finished, final review confirmation pending, GO needed). /generate-image is built and gated inside C16, but disabled for everyone and not accepted. What is live is listed in section 1.

1. **READY: release the batch C16** (gate run 40287871324 passed about 1:00 AM PT; main 629251d4 is its ancestor). Command: `cd /c/s/spec/day-1021 && bash train6.sh`. Environment: production (pushes main 629251d4 to 7b105a4b, runs the production release, probes). Contents: tutor timing, card-size and file-drop test fixes; weekly-top clock fix; FILE_JOBS plumbing (binding plus the file-jobs-1 Durable Object migration applied by the deploy; every FILE_JOBS feature stays disabled); Image activation (owner-only path for the principal and Gmail; public generation OFF); Credits finish (credits-only usage API: web and server ship together); Motion failure handling (Worker side; the orchestrator is unchanged until the redeploy step); Chat UX. No D1 migration and no cost. About 6-8 minutes. Success: a LIVE line and probes 200 200 401 401 405. Recovery: the script stops on its first mismatch and a rerun skips finished steps; a rollback is a new release of the previous SHA. Fallback candidate: C15 stack/c15-batch 675d3792 (gate 40284732780 passed; the same content without Chat UX).
2. **Decision: Motion per-job ceiling** (proposal US$3.50; the floor is 2.56). It is needed before the orchestrator redeploy. The ceiling-config candidate, the orchestrator-only redeploy, the guarded refund of the 127.8 credits (dry run first) and a second confirmed acceptance job are sequenced by the Motion post-fix owner in motion-deploy.sh; the commands are added here when verified.
3. **Decision: validation budget cap** (US$100 proposed; the ledger shows US$1.7506 remaining of the approved US$20): see [infra-package](evidence/infra-package.md) section 9.1. It unblocks paid image and Motion acceptance.
4. **Image secrets**, after step 1: `node C:/s/spec/image-activation/prod-image-secrets.mjs --dry-run`, then without the flag (type PUT IMAGE SECRETS). It installs OPENAI_API_KEY and GEMINI_API_KEY on rabbit-hole-app (names only; values never printed; SUBSCRIPTION_OWNER_EMAIL preserved). SIDE EFFECT: installing the OpenAI key also switches on /api/learn/transcribe for signed-in canvas members (about US$0.006 a call, metered only by the platform cap). Decide before running.
5. **Telemetry GO**, after the reviewer confirms the final script revision 09fe1c93: the owner's own terminal sequence is `--dry-run`, then `--preflight`, then phase A/B per the activation package. The candidate release 8d476050 switches collection on.
6. Walk the production checklist in [owner observations](evidence/owner-observations.md). Do NOT click Generate again on the failed Motion job.
7. Publish this document to main: after step 1 the integrator merges main into the docs branch and prepares `bash /c/s/spec/day-1021/release-docs.sh` (dry-run verified; docs-only; gate-reuse path).

## 10. Change log (PT)

- 2026-10-26 1:34 AM: C16 stack/c16-batch 7b105a4b gate PASSED (run 40287871324); train6.sh dry-run verified; Telemetry round-3 fixes done (script 09fe1c93, harness 283 scenarios, 1110 checks, 0 failed, 1 skipped), reviewer confirming; the 12-hour target ended without the three headline releases usable (section 9).

- 2026-10-26 12:12 AM: Telemetry safeguards harness clean (271 scenarios, 1070 checks, 0 failed, 1 skipped), independent diff re-review started. C15 `stack/c15-batch` 675d3792 pushed (main 629251d4 + tutor timing, card-size teardown, file-drop check, FILE_JOBS plumbing, Image activation owner-only, credits-finish, motion-failure-handling, tutor-session ordering; chat-restore and resize-persist merges reverted); CI and gate chain started. weekly-top.test.js clock time bomb (fails every verify after the Monday rollover) fixed inside C15; main itself carries the failing test until C15 releases.

- 2026-10-25 11:48 PM: batch C14 (b0f5a6ad) FAILED its fast-e2e on two unfinished stale fixes (chat-outputs 15/16, study-resize-persist 2/4); both old branches were never green. C15 (stack/c15-batch) is being integrated WITHOUT them (adds credits-finish 1058a8dd, motion-failure-handling f8ed2f93, tutor-session-order 423fe035; two text conflicts being resolved; junk file packages/control-plane/test/.wrangler/cache/cf.json removed). Motion failure-handling delivered (f8ed2f93): needs MOTION_JOB_CEILING_USD >= 2.56 (proposal 3.50) before it deploys; refund script prepared for action act-c0f759ed-5ce7-4b65-bce0-028745e2c5c1.

- 2026-10-25 10:55 PM: `fix/credits-finish` 1058a8dd delivered (credits-only usage API, sealing, Jev 429, refund path, labels); queued as successor C15 after the C14 gate.

- 2026-10-25 10:45 PM: batch candidate `stack/c14-batch` b0f5a6ad built from main 629251d4 (tutor timing fix, card-size teardown, Study resize, Chat restore, file-drop check, FILE_JOBS plumbing, Image activation with owner-only path, public OFF); config tests 27/27; CI and sharded gate chain started; infra/provider package delivered; image candidate `feat/image-activation` ebea37b8 CI green.

- 2026-10-25 10:20 PM: CAD constraint diagnosed (our egress ledger, not stale, not a provider limit); handoff docs release script prepared (docs-only, gate-reuse path, dry-run verified).

- 2026-10-25 10:05 PM: document created from the integrator state; evidence copied under `docs/operations/evidence/`.
- 2026-10-25 9:55 PM: failed Motion job diagnosed; real model spend recorded in the shared ledger (remaining 1.7506).
- 2026-10-25 9:10 PM: Chat UX bugs added (parent b43b5a55); completion audit stages 1-2 delivered; 27 ledger tasks created.
- 2026-10-25 8:50 PM: Motion R1b live (629251d4).
- 2026-10-25 6:44 PM: C13 live (29622d8e); 5:40 PM Motion R1 live (32d86ee7).
- 2026-10-25 1:31 PM to 4:07 PM: C1-C3, C6, C7, C9, C10, C11 released.
