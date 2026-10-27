# Motion admission and recovery budgeting (HELD policy candidate)

Status: **implemented, not deployed, not approved.** Branch `feat/motion-policy-a` carries the code with the CURRENT approved numbers (platform stop US$3.50,
learner maximum 350 credits) and the new check switched OFF, so releasing it alone changes no admission. Branch `feat/motion-policy-a-values` is that branch
plus ONE commit holding every policy number. Approval of the policy is approval of that one commit. Public Motion stays paused; nothing here contains the
public flip (`MOTION_GENERATION_PAUSED` stays `1`, no `MOTION_RENDERER_CONFIG` is activated, the owner list is unchanged).

Evidence behind it: `C:/s/spec/motion-validation/second-failure-analysis.md` and `C:/s/spec/motion-admission/policy-map.md` (job 3c46c4d2: five calls
for US$1.540278, then a storyboard revision refused at call 6 on a US$3.50 ceiling; 17 + 3 characterisation tests). Credit disclosure: `motion-credit-disclosure.md`.

## The four numbers (never merged; each has one owner variable)

| Number | Meaning | Today | Policy candidate | Where |
|---|---|---|---|---|
| Platform stop per job | The most provider spend the guard lets one job reach. Hard, per call, before the call is sent. Unchanged in meaning. | US$3.50 | **US$5.00** | `MOTION_JOB_CEILING_USD`, `fly.orchestrator.toml` |
| Route budget | What that stop must carry for the routes the policy offers (below). A new job whose `min(grant, stop)` is below it is refused before any spend; the orchestrator refuses to START when the stop is below it. | not checked | **US$4.8111**, check on | `MOTION_ROUTE_BUDGET_CHECK = "1"`, `spend-bound.mjs routeBudget` |
| Learner maximum charge | The most one job can charge the person (signed into the quote; a changed value makes every card stale). | 350 credits | **500 credits** | `MOTION_MAX_CHARGE_USD`, `wrangler.rabbit-hole-prod.jsonc` |
| Temporary reservation | Held while a job runs; the unused part is released. | 896 credits | 896 credits (unchanged) | `MOTION_JOB_RESERVATION_USD` |

Ordering, pinned by tests: route budget (4.8111) <= stop (5.00) <= maximum (5.00) <= reservation (8.96). Provider cost lands once in
`usage_operations.cost_usd`; the learner is charged `min(cost, maximum)` and nothing when our own limit stops the job.

## What changed in the code

1. **Route budget preflight** (`spend-bound.mjs routeBudget`, `orchestrator.mjs preflight`). The guard admits a call iff `committed + its bound + the floor of
   the calls that must follow` fits the ceiling. `routeBudget` replays that guard over the four routes the pipeline can take (first pass; Author patch;
   Director revision before the Author; Director revision after a blocking review + whole Author + second review pair) with the request sizes of the largest
   supported job (`SUPPORTED_ENVELOPE`: 30 s, 8 beats, 18 review frames) and each finished call at the envelope's cost. Budgets: first pass 3.1911, Author
   patch 3.5111, pre-Author revision 3.7611, post-review revision 4.8111 (the maximum; set by the second reviewer of the last pair, which the guard prices at
   its bound while the first is in flight). A test replays the real guard on the recorded fixture routes and pins the simulator against it. At 3.50 the
   post-review revision route (and, under this envelope, the patch route by US$0.011) is not carried; at 5.00 all four are, with US$0.19 to spare.
   It applies to NEW jobs only and is OFF unless `MOTION_ROUTE_BUDGET_CHECK` is `1`. The refusal is the definite no-start the Worker already knows
   (`503 not_configured`, code `job_ceiling_insufficient`), before any hold, renderer check or model call, with the amounts only in the orchestrator log.
2. **Continue fixing** (`nextStage`). A blocking checkpoint with a storyboard-level finding is priced as the route that runs (Director revision + whole Author +
   two reviewers = US$4.2568 at the policy caps), not as an Author patch (US$2.8918, the old price that offered the button where the attempt could not fit). It
   is therefore offered only where that fits the ceiling: not at 3.50, yes at 5.00. This part is a correction, active in both branches.
3. **Startup refusal.** With the check on and a ceiling below the budget the orchestrator exits at start (a failed deploy, not a refused job). Its startup
   line states `job ceiling $X, route budget $Y REQUIRED|not enforced`, which the owner script verifies without a paid call.

Unchanged: the hard guard, reserve-ahead (floors), the call and timeout caps, zero-credit failures for our own limits, "one repair per stage", and every required
correction or failed review (nothing is skipped to fit a ceiling).

## What admission does NOT promise

Admission does not guarantee a video. The budget assumes the envelope (Director 0.07, storyboard 0.25, Author 1.2 each round, revision 0.25, a review pair
0.17, patch 0.15). A job whose Author runs at its 64000-token cap in both rounds (about 5.13) is still stopped by the guard, mid-job, at zero credits, with
its specific reason. The provable worst case of the whole policy is the 8.96 reservation; no ceiling below about 7.3 proves the revision route.

## What the owner approves

Approve exactly these three values together (one commit, `feat/motion-policy-a-values`):

1. platform stop per job **US$5.00** (was 3.50): the platform pays up to US$1.50 more on a job that reaches it;
2. learner maximum **500 AI credits** (was 350): every Motion card made earlier is stale and is reconfirmed at 500;
3. the route budget check **on** (a ceiling below US$4.8111 cannot be deployed).

Consent line the person sees (credits only, from the existing card; nothing in the UI changes):

```
Estimated cost: 100 AI credits
Most it can cost: 500 AI credits. You are never charged more.
896 AI credits are held while it runs; whatever is not used is released.
```

The analyst's longer wording ("...If the video's plan needs a correction it can use about 300 ... If we stop it because of our own limits you are not
charged.") needs a UI change to the card and a dev deployment; it is NOT built. Recommendation: ship the three lines above (they already state the maximum and
the hold) and decide the longer line separately.

Not approved here, and not in the candidate: the public flip, any stop above 5.00, any maximum above 500, a platform-funded excess (stop 5.00 with maximum 350,
which would also break the pin test `maximum >= stop`), expanded settings.

## The owner path

All commands are in `C:/s/spec/motion-validation/motion-deploy.sh` (modes `policy`, `policy-accept`; `status` lists them; every mode takes `--dry-run`).
Run each with `MOTION_REL=<values commit SHA>`, `MOTION_POLICY_A=<its parent SHA>`, `MOTION_JOB_CEILING_USD_APPROVED=5.00`.

1. `... bash motion-deploy.sh policy --dry-run` (read-only; proves the candidate: values only in the last commit, no public flip, no renderer activation, owner
   list unchanged, the orchestrator STARTS at 5.00 and refuses to start at 3.50, renderer code hash unchanged).
2. `... MOTION_WORKER_RELEASE=yes MOTION_GATE_RUN=<integrator's gate run for MOTION_REL> bash motion-deploy.sh policy`: you TYPE `APPLY MOTION POLICY`
   (read from the terminal only). PO1 releases the Worker (maximum 500 credits), PO2 waits for an idle orchestrator and redeploys ONLY the orchestrator, PO3
   verifies with no paid call (machine env, route check, calls/timeout, health, the startup line, renderer machine/instance/image/code unchanged), PO4 reads the
   Worker's variables back (GET only). No paid call.
3. `... bash motion-deploy.sh policy-accept`: reserves US$5.00 in the shared budget first, then prints the instructions for ONE fresh owner-only 16:9 15 s
   job. In the browser: make a NEW card, READ the three lines above (it must say 500), press Generate once. Then
   `... MOTION_POLICY_ACCEPT_DONE=yes bash motion-deploy.sh policy-accept`: the cost is read from production D1 by SELECT only
   (`usage_operations.cost_usd` joined to the owner's `usage_attempts` in the window), the budget entry is settled at that measured amount (never a typed
   number), and the job is accepted or not. Records `post:accept2` so R2a/R2b accept it as the 16:9 job.

Automatic: the budget reservation and settlement, the cost collection, all verification, the previous-image record for rollback. Owner-only: the typed
approval, the main release (inside `policy`), and the two Generate presses in the browser (spend).

Rollback: `MOTION_ROLLBACK_CONFIRM=yes bash motion-deploy.sh rollback-orchestrator` returns the orchestrator to the previous image and config (3.50, no check);
the Worker maximum goes back with a normal release of the previous config (cards made at 500 become stale again).

## Activation after acceptance (described, not built)

R2a (`stack/c22-motion-r2a`, measured renderer policy on, public still paused), the 9:16 job (`accept916`, which now also reserves the shared budget and
collects its cost automatically) and R2b (`stack/c23-motion-r2b`, the public flip) are re-cut on the final base: `git cherry-pick ac0892bf3` then
`7a97e1d3f` onto main after the policy release. Expect conflicts in `fly.orchestrator.toml`, `wrangler.rabbit-hole-prod.jsonc` and
`motion-ready-policy.test.js` (their 3.50/350 pins): resolve to ceiling 5.00, maximum 5.00, check on, and keep each commit config/doc/test only and one commit
on `MOTION_BASE`. `activate-owner`, `accept916` and `activate-public` take the policy release as the released candidate once `pol:rel` is recorded, and
the disclosure gate requires the maximum to cover the stop (500 >= 500).

## Verification status

- Unit (local): control-plane 2924 tests, learn-render motion 408 tests (one machine-local ledger test excluded, pre-existing); the characterisation tests
  were updated where the policy changes behaviour and the old fit price is kept as a negative control.
- CI: `verify` and `fast-e2e` on the pushed SHAs (see the hand-back for run ids). `fast-e2e` selects no browser check for this diff (no UI change).
- Script: tested only in the enforced-isolation harness `C:/s/spec/motion-policy/harness/run-harness.sh` (stubs on PATH, sandbox clone, no credentials).
- NOT tested: any real Fly/Cloudflare/GitHub call, the real `rel-main.sh`, the Worker read-back endpoint, the typed prompt on a real terminal, `accept916`
  end to end, and any real model call. No paid call was made.
