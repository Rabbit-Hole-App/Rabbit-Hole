# Approval package: Motion per-job ceiling and validation budget (PROPOSALS, nothing here is approved)

Prepared 2026-10-26 about 11:10 AM America/Los_Angeles by the integrator. Evidence: [Motion ceiling evidence](ceiling-evidence.md), [infrastructure and provider package](infra-package.md), [validation budget ledger](validation-budget-ledger.md), [failed job diagnosis](failed-job-61f70171-diagnosis.md).

What is approved today: a shared validation cap of **US$20** (unchanged; the owner's willingness to go to US$100 is not an approval), and the configured Motion acceptance ceiling of **US$2.00** per job in `fly.orchestrator.toml`. These proposals are separate from learners' monthly AI credits (2,500) and from recurring infrastructure cost.

## A. Motion per-job ceiling: US$2.00 -> US$3.50 (recommended)

| Question | Answer (evidence) |
|---|---|
| Current ceiling | US$2.00: `MOTION_JOB_CEILING_USD` at `packages/learn-render/motion/service/fly.orchestrator.toml:21`, parsed at `orchestrator-main.mjs:43-45`, applied as min(Worker grant US$8.96, ceiling) at `orchestrator.mjs:295`. The live orchestrator is 32d86ee7 and still enforces 2.00. |
| Why job 61f70171 could not continue | FACT: 3 model calls and 1 render cost US$1.278157 (bound equal to cost, nothing unknown), leaving 2.00 - 1.278157 = US$0.721843 of the job's ceiling. The orchestrator refuses a call when its conservative bound `need` exceeds what is left (`orchestrator.mjs:321-322`), and any refusal ends the job as `cause: limit` (`:412-413`). Not the 3,300 s timeout (635 s), not the call cap (3 of 9), not the account allowance (the US$8.96 hold fit and was released). |
| Required next-call bound | INFERENCE, medium confidence (no log holds the refusal text or stage): the refused call was the first reviewer in `review_and_render`, with a bound of about **US$0.745 to 0.81** (16 or more frames; each frame adds about 0.0245), against US$0.7218 left. CORRECTION: my first diagnosis said the Author call (about 1.3) was the refused step; it was not, the Author had already run. |
| Why 2.00 was structurally too small | Peak committed money is the Director, storyboard and Author actuals plus both review bounds. At 2.00 any job whose Director + storyboard + Author spend exceeds about **0.54** cannot hold both reviews, so the measured M1 (0.82) and M6 (1.298) jobs would have failed the same way. |
| Evidence that 3.50 fits | Peak, no repair / one repair: 15 s M1 type 2.28 / 2.53; 30 s M6 type 2.76 / **3.05**; the failed job's own numbers 2.78 / about 3.06. Margin at 3.50 is about 0.44 in the 30 s repair case; 3.00 fails that case by 0.05. Floor (five required calls at output caps) is 2.56; the script refuses any value outside 2.56 to 5.00. Measured completed jobs settled at US$0.71 to 1.76. |
| Not covered by 3.50 | An Author at its 64,000-token cap (peak 3.18, about 3.9 with a repair). Measured Authors at 15 to 30 s reached about 47,000 tokens, so that case is not expected but is not excluded. |
| Does a ceiling raise alone fix a refusal or timeout? | No. It fixes this money refusal only after the orchestrator is redeployed. These limits still stop a job: 9-call cap (a storyboard revision plus a repair is exactly 9), per-kind policy caps, the 3,300 s timeout (production renderer wall time is unmeasured), the Worker hold of US$8.96 and the account allowance at admission, the 2.56 floor, 45 s and 60 s unavailable, the paused flag (owner emails excepted), policy-class refusals, renderer limits, content failures after the one repair, the Anthropic workspace limit and the shared validation cap. |
| Does it change the learner's quote or maximum credit reservation? | **No change to the quote or the hold.** The quote comes from `MOTION_ESTIMATE_USD` "1.00" (about 100 credits) and the hold from `MOTION_JOB_RESERVATION_USD` "8.96"; no code outside the orchestrator reads the ceiling, and the signed binding (inputs, price version, estimate, policy version, renderer config) does not contain it. So no stale-quote reconfirmation is triggered. **What does change:** the largest actual charge for a completed job rises from about 200 to about 310 credits (hard stop 350), while the card still says "about 100 credits". **Decision for the owner (see D1b below).** |
| Zero-credit treatment of refusals | In the released code (f8ed2f93, inside main 7b105a4b, release run 40367315136): ceiling, policy, call-limit, unknown-bound and timeout refusals charge the learner nothing and release the hold; the learner sees that it is a limit on our side. Job 61f70171 stays charged 127.8157 credits until the owner runs the refund (dry run first). Content and model failures still charge. Not verified: the live Worker version, and no negative-control run of the zero-credit tests on old code is recorded. |

Proposed decisions:
- **D1a (approve):** set the Motion acceptance-window per-job ceiling to **US$3.50** (replaces the earlier proposal of US$3.00 and the older US$3.00 per-job validation bound for Motion; the script refuses values above US$5.00). The US$3.00 bound is NOT silently removed: approving this line explicitly supersedes it for Motion.
- **D1b (choose):** (a) accept that a completed job can charge up to about 310 credits against a card estimate of about 100, which is the measured reality at about 1 to 1.8 USD (100 to 180 credits) for completed jobs and only the repair worst case reaches 310; or (b) require a quote/estimate change before public activation (a separate Worker change, not part of this ceiling release). Recommendation: (a) for the owner-only acceptance window; decide (b) before R2 unpauses public generation.

## B. Shared validation budget: US$20 -> US$100 total (proposal; cap stays US$20 until approved)

| Figure | US$ |
|---|---|
| Spent (ledger, 2026-10-26 10:13 AM PT) | 17.9994 |
| Reserved (dev volume) | 0.25 |
| Spent + reserved | 18.2494 |
| Remaining under the current US$20 cap | **1.7506** |
| Remaining under the proposed US$100 cap (inclusive of the above) | **81.7506** |

Consequence of the current cap: the second Motion acceptance job reserves its hard stop (up to US$3.50) before it runs, which does not fit in US$1.7506; the expected spend (about 0.7 to 1.3) would. So the second job and the 9:16 R2 job, and every paid image acceptance, wait on this decision.

Planned remaining paid runs, conservative maxima (from the [infrastructure and provider package](infra-package.md) section 11; calculated maxima, expected in brackets):

| Item | Max (US$) | Expected | Notes |
|---|---|---|---|
| Motion (second job, 9:16 job, 45/60 s validation, fixtures) | 18.35 | about 7.0 | optional +19.00 for extra coverage |
| Image generation and editing, four models | 0.96 | 0.55 | optional +10.58 |
| /video (FAL) | 0.84 | 0.25 | price conflict on the Lite endpoint to verify first |
| Maths animation | 0.51 | - | |
| File converter acceptance | 0.30 | - | |
| Ctrl+K image edit and background removal | 0.45 | - | needs the OpenAI key |
| Recorded-answer transcription | 0.11 | - | |
| CAD review-first (inside CAD's own US$10 monthly line) | 0.60 | - | job only after Nov 1 |
| Ctrl+K JavaScript, Telemetry | 0 | 0 | |
| **Required total** | **22.12** | about 8.8 | |
| **Required + optional** | **51.70** | | |
| Spent + reserved + required maximum | 40.37 | | |
| Spent + reserved + required + optional | 69.95 | | leaves 30.05 under US$100 |

Proposed allocation inside the US$100 (from the package): Motion 40, Image 30, other acceptance 20, reserve 10. Check: Motion spent 17.40 + required 18.35 = 35.75 fits in 40; the optional +19 would exceed the Motion bucket and would need the reserve. Image 0.60 + 0.96 + 10.58 fits in 30.

Related but separate: the Anthropic workspace monthly limit must be raised for the Motion tests (required maximum US$18.35) before those runs can succeed; that is a provider-console action, not a cap decision. Provider prepaid credit proposals (Gemini +US$5 only if optional coverage is run, fal US$1, OpenAI none if the project balance is at least US$10) and the expected new recurring infrastructure cost (about US$2.6 to 4.6 a month, ceiling about US$15) are in section 9.1 of the infrastructure package and are separate approvals.

Unknowns kept visible: the exact refused stage and need of job 61f70171; production renderer wall time against 3,300 s; whether the live Worker is on 7b105a4b (release run succeeded, not re-read); Workers Paid status (likely upgraded 2026-10-22, billing API returned 403); FAL Seedance Lite deprecation status.
