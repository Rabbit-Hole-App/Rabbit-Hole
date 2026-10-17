# CAD production activation proposal

Prepared 2026-10-17. **Not activated.** Latest remote main inspected: `d16c3a456b19ad1cb816c5470380e997e102e9a3`. This proposal is separate from PR #2's completed saved-card release. No new infrastructure, production configuration, migrations or model requests were executed during preparation.

## Current state and exact prerequisites

Production `rabbit-hole-app` serves https://digrabbithole.com. Its current configuration and live metadata lack CAD bindings and secrets. Saved-card interaction is shipped; fresh generation is not available.

| Requirement | Existing / missing | Prepared action after approval |
| --- | --- | --- |
| Worker export | `app-worker.js` did not export `CadJobs` | Export prepared in this PR; export alone creates no namespace |
| Durable jobs | No `CAD_JOBS` binding or `CadJobs` namespace | Append `CAD_JOBS` binding and `cad-jobs-1` SQLite DO migration |
| D1 | Existing `LEARN_DB` and CAD's reused file/board tables | No new D1 migration in CAD; confirm existing release schema preflight, never reapply 0023 |
| Artifacts | Existing `LEARN_MEDIA`, bucket `rabbit-hole-prod-learn-media` | Reuse authenticated, scoped immutable R2 artifacts; no new bucket |
| Executor | Temporary dev executor was destroyed | One new `rabbit-hole-cad-prod` Fly machine in `iad`, shared 2 CPU / 4 GiB |
| Admission ledger | Existing executor only had expired dev-term accounting | Explicit finite pilot ledger on a new 1 GiB `cad_budget` volume, separate from job scratch |
| Service credentials | No production CAD-specific secrets | Fresh `CAD_EXECUTOR_TOKEN` on app and executor; `CAD_JOB_SECRET` on app, at least 32 characters |
| Model route | No separately bounded CAD workspace | Dedicated Anthropic workspace/key: `CAD_MODEL_API_KEY`, `CAD_MODEL_WORKSPACE_ID`; verify workspace and spending limit before any call |
| Origin/config | No CAD URL or enable flag | `CAD_EXECUTOR_URL`, `CAD_JOB_ORIGIN`; executor allows only `https://digrabbithole.com`; enable last |

`CAD_MODEL_WORKSPACE_ID` avoids inheriting the general app workspace when supplying a CAD-only key. The pilot sets `CAD_MODEL_REQUIRE_DEDICATED=true` so absent CAD credentials cannot fall back to general credits. The shared platform spend gate (`USAGE_PLATFORM_DAY_USD`, existing D1 ledger) remains in force. It is not a CAD-only monthly allowance. Existing organisation provider preferences must be compatible; no silent provider fallback is authorized.

The inactive [activation manifest](cad-production-activation.json) records the exact binding, migration and initial limits. It is not consumed by a workflow. `wrangler.rabbit-hole-prod.jsonc` is intentionally unchanged. The [executor template](../../packages/cad-execute/fly.prod.toml) has admission disabled and lacks the approved term and credentials; it cannot accept builds as checked in.

## Smallest practical setup

Reuse the verified CPU-only sandbox, pinned CAD dependencies and artifact contract. One machine has one execution slot; other dispatches receive 429 and retry after ten seconds within their existing job deadline. There is no global fairness or high availability guarantee. Smaller machine sizes were not verified against the 2 GiB child memory budget plus server and scratch overhead.

Keep Fly proxy autostop **off**: `/jobs` returns 202 before background execution, so request idleness does not mean the machine is idle. Keep automatic startup on and minimum running machines zero. The application exits after five minutes with no active build. Requests wake the stopped machine. This is supported by [Fly's self-shutdown guidance](https://docs.fly.io/launch/autostop-autostart#apps-that-shut-down-when-idle).

Cold-start latency is not measured for the new production image. The dispatch timeout is 20 seconds; a timeout is an interrupted attempt requiring explicit Retry, not an automatic second paid generation. Test wake-up before opening admission. Do not promise a cold-start SLA until that measurement exists.

Limits remain 300 seconds per phase, 600 seconds per execution attempt, 15 minutes per job, 2 GiB child RAM, one child CPU and 512 PIDs. The initial pilot lowers artifact output to 10 MiB per file and aggregate, two model requests / $0.20 per job and zero automatic repairs. Larger jobs may fail with an explicit limit; these are intentional pilot restrictions.

Jobs and revision manifests remain durable in the existing control plane; artifacts remain in R2 across executor shutdown. Heartbeats renew a 90-second lease. Process loss becomes an explicit recoverable failure; uncertainty does not automatically reissue model requests. Missing previews can retry from saved STEP. Saved cards remain viewable even if generation admission is disabled.

Keep the executor and volume after verification. The proposed first term lasts at most 30 days and requires explicit renewal before its deadline. The new ledger never resets automatically, reserves transfers before each attempt and rejects missing/corrupt/mismatched state. The dedicated volume is required across machine replacement; rootfs persistence alone is insufficient. Disable automatic volume snapshots, do not restore an old ledger without accounting reconciliation, and preserve old term ledgers on renewal. One volume is not a high-availability design; loss fails closed.

At term expiry disable generation and Fly autostart, stop the machine, preserve R2 artifacts and ledger. Do not delete the executor merely because verification passed. Renewal is a separate approved term, not a silent extension of this budget.

## Costs and operating limits

Sources checked 2026-10-17: [Fly pricing](https://docs.fly.io/about/pricing), [Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview), [workspace spend limits](https://platform.claude.com/docs/en/api/rate-limits#setting-lower-limits-for-workspaces), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

- Fly `iad`: 2 CPU / 4 GiB approximately **$25.39 per 720 active hours**, or **$0.0353/hour**. Stopped rootfs costs **$0.15/GiB-month**; use the actual uncompressed allocation, not the 996 MB compressed image. A conservative illustration assumes 4 GiB rootfs: $0.60/month while stopped. Ledger volume: $0.15/month for 1 GiB. North America egress: approximately $0.02/GiB. No dedicated IPv4 or extra machine.
- Prior image build: 223.554 seconds, approximately $0.19 estimated build service cost. New image is required for the budget change; proposed build/setup allowance is $1 within infrastructure budget. Actual invoice is unavailable.
- Prior simple plate: **$0.022130** settled usage-ledger cost; edit: **$0.037780**. These are measured application accounting, not a provider invoice. Sonnet pricing is $2/million input and $10/million output tokens. Estimate **$0.02–$0.05** for a successful simple generation/review pair; failures consume budget too. Two per-call reservations cap the proposed job at $0.20, not a promise every requested shape succeeds.
- Prior six deterministic phases took **85.474 seconds**; build/check/GLB/thumbnail subset took **65.474 seconds**. Assuming two active minutes plus five idle minutes, compute is approximately **$0.0041/generation**. Actual cold start and model waiting can increase that. Reuse of warm machines lowers idle overhead.
- R2 Standard storage is $0.015/GB-month; 100 jobs retaining 10 MiB each are approximately $0.016/month before shared allowances and operations. DO/Worker requests, duration and storage use the existing account and shared allowances; do not claim zero incremental cost. Reserve $2 within infrastructure budget for incremental Cloudflare usage and reconcile actual usage.

Illustrative monthly totals below assume each job wakes separately, seven billed machine minutes, $0.02–$0.05 model cost, 10 MiB retained artifacts, 4 GiB stopped rootfs plus 1 GiB volume, no failed jobs, and exclude one-time build cost and uncertain Cloudflare operation overages:

| Successful jobs | Model estimate | Compute estimate | Approximate total with idle storage, artifact storage and transfer |
| --- | --- | --- | --- |
| 0 | $0 | $0 | $0.75 |
| 10 | $0.20–$0.50 | $0.04 | $0.99–$1.30 |
| 100 | $2–$5 | $0.41 | $3.20–$6.20 |
| 1,000 | $20–$50 | $4.12 | $25.23–$55.23; outside the proposed pilot limits |

Proposed authorization: **first 30-day term, $45 total: $35 infrastructure and $10 CAD model usage**, including setup and verification. One machine only, no scaling, no additional providers; 2 GiB conservative executor transfer reservations. At 10 MiB outputs plus 1 MiB reservation overhead this allows at most 186 execution attempts, potentially fewer with lower remaining allowance. Registry/build traffic is separate from that ledger and must be included in infrastructure accounting.

These are operating limits, not a Fly billing hard cap. Configure the dedicated provider workspace's monthly spend limit at $10 and verify it. Its calendar-month reset is not a new authorization: across a reset, lower the next month's allowance to the unused portion of this first term's $10; do not open generation after that reset until reconciled. The provider cap, per-job reservations and shared daily platform gate complement one another; none alone establishes the whole pilot total. Stop admission before a known or uncertain limit would be exceeded. If billing/workspace administration is inaccessible, activation remains blocked. Do not repurpose the shared app workspace or change unrelated users' limits.

## Minimal production verification after approval

Total verification allocation **$1**, included within the pilot: maximum **two model requests / $0.20** and **$0.80 infrastructure** (image build is separately included in setup allowance). Exactly one fresh request on a dedicated owner canvas: `/cad Create a solid rectangular plate, 40 mm x 20 mm x 5 mm, no holes or fillets. Use millimetres.` No automatic retry, repair, fallback or extra model scenario.

Initially scope admission with `CAD_VERIFICATION_BOARD_ID`, `CAD_VERIFICATION_MAX_CALLS=2`, `CAD_VERIFICATION_MAX_USD=0.20`, and the per-job limits in the manifest. Keep counters across restarts. Two calls are expected: source generation and visual review. Clarification/failure consumes this allowance and leaves verification incomplete; it does not authorize another request.

Record exact app SHA, executor image digest, provisioned sizes, UTC/Pacific start/end, request IDs/count, settled costs and unknown costs separately. Start the browser timer immediately before submitting `/cad`; stop only when the saved card is ready and its interactive GLB accepts input. Separately capture queue, cold start, build, validation, publication and review timings where available.

Assertions: fresh durable job and immutable revision; trusted STEP bounds 40/20/5 mm, one solid and 4,000 mm3 volume; nonempty checksummed STEP/GLB/thumbnail; rotate/pan/zoom; reload retains the same revision and interactive card with no additional model request; owner artifact access succeeds and unauthorized access fails. Existing 5 production smoke checks must still pass. Report passed/failed/skipped/interrupted counts separately. Historical fixture, Linux sandbox, real-model and shared-card evidence retain their original SHAs.

Before those two calls, run deterministic checks on the new image: actual volume mounting/init, idle shutdown and automatic wake, restart persistence without budget reset, one execution slot, trusted fixture output checksums and cleanup. Use the existing direct Linux probe for these runtime outputs. Production callback/publication is verified in the subsequent two-call scenario; do not add a production fixture bypass. No paid model call is needed for the runtime probes, but the provisioned runtime is billable and therefore still approval-gated.

## Activation sequence and rollback

1. Review this preparation PR. Freeze the resulting candidate, complete normal local/CI/preview release requirements. No main merge is authorized by this preparation request.
2. After explicit consolidated GO, verify model workspace administrative access and its cap. Create fresh CAD-only secrets; no values in logs or git. Confirm existing D1 schema through the established release preflight; do not apply a D1 migration.
3. Build one new pinned executor image, create exactly one 1 GiB ledger volume and one 2 CPU / 4 GiB machine, admission disabled. For first initialization only, run that machine with temporary entrypoint `/bin/sleep` and command `600`: the normal server correctly refuses a missing ledger and would exit before it could be initialized. Do not create a second bootstrap machine. Verify actual machine count and volume size. Do not use `fly launch` defaults or a release command to initialize a volume.
4. Set one approved pilot ID/start/deadline (no more than 30 days), 2 GiB transfer cap and the new image identity. On the actual attached volume, verify the mount, set owner UID 10021/GID 10020 and mode 0700, then run `/usr/local/bin/node /app/pilot-budget.mjs init` as that service identity. It refuses an existing ledger. Update the SAME machine to `/app/entrypoint`, clearing the temporary command; subsequent Fly deployments use `--ha=false`. Run deterministic runtime checks and record the digest. Renewal uses a new approved ledger filename under the same mount and preserves `usage.json` as historical accounting.
5. Apply the reviewed binding/migration delta through the normal approved production deployment. Preserve all newer main changes, existing migrations and deployment safeguards. Add secrets and vars through their existing secure mechanisms, initially `CAD_MODEL_ENABLED=false`.
6. Enable executor admission and only the verification canvas. Run the one bounded real-model scenario and production smoke. If successful, remove only the verification-canvas restriction/caps and open generation under the same per-job and provider limits. Keep the machine provisioned and auto-starting.
7. On failure, set `CAD_MODEL_ENABLED=false` and `CAD_ADMISSION_ENABLED=false`; stop the machine and disable autostart if spending or health requires it. Retain the volume, DO state and R2 artifacts. Do not delete the new DO migration or revert past a populated namespace casually.

## Evidence, limits and timeline

Preparation checks and final commit are recorded in the PR. The combined focused run passed **62 tests, zero failed, skipped or interrupted**; provider requests were intercepted locally. Fly CLI configuration validation passed. Local dry-run bundles the production worker and confirms `CadJobs` is exported without adding a production binding. Focused deterministic checks cover budget persistence, malformed/missing state, fixed term and compatibility with dev accounting. They do not prove the new Fly image or production model route. The first sandboxed dry-run invocation was blocked by Windows process-spawn permissions; the authorized local-only rerun passed. No test assertion was weakened.

Reused evidence: [runtime receipt](cad-evidence/runtime-receipt-2026-10-17.md), [usage ledger at 2ff803e8](cad-evidence/usage-ledger.json), [shared interaction at 08becb70](cad-evidence/shared-interaction-final.md), [dev handoff](cad-evidence/dev-handoff-2026-10-17.md). Main release `d16c3a45` passed [production deployment/smoke](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39071589614). These do not establish fresh production generation.

Remaining limitations: single machine/volume, no queue fairness, 100 retained CAD jobs per canvas, unverified hostile fork/resource-exhaustion behavior, unknown new-image cold-start latency, unsupported fine topology/manufacturing requirements, and historical unexplained first publication failure. Pilot artifacts are limited to 10 MiB. Do not reopen the historical Undo investigation as part of this work.

Provisional activation range: **45–90 minutes after approval and verified account/workspace access**, assuming no runtime failure or release-gate regression. Measured components: previous image build 3m44s, deterministic six-phase execution 85.474s, previous full Windows gate approximately 10–22m. Provisioning, cold start, production model latency and account setup remain unmeasured; this range is not a confirmed completion promise. Critical path: final candidate gates and model cap access → image/volume + deterministic wake/persistence → normal production deployment → two-request browser verification. Refine after the new image's first measured cold build.

## Preparation task receipt

- [x] Inspect remote main, runtime, production metadata and existing evidence.
- [x] Prepare inactive configuration and missing worker export.
- [x] Prepare durable finite executor admission, independently tested.
- [x] Integrate and verify CAD-only credential/workspace routing.
- [x] Prepare separate branch and PR description with focused results; PR is the publication receipt.
- [ ] Owner activation and spending GO; all billable/deployment actions remain pending.

Ctrl+K expansion uses its separate `feature/ctrlk-tools-wave1` worktree and capability contract. Local checkpoint `68b06320` has 39 passing deterministic checks (zero failed/skipped); Preview/Accept product integration is still pending and it is not deployed. It does not inherit CAD model or production approvals.
