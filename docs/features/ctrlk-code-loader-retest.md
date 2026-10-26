# Ctrl+K JavaScript execution: loader re-test, limits, validation package

Ledger ba6304f0-2cd5-4351-8677-076e4b9b5133. Written 2026-10-26 on main 7b105a4b. Code: `packages/control-plane/src/inline-code-route.js` (route, policy),
`inline-code-actor.js` (Durable Object protocol), `inline-code-job.js` (coordinator, budget), `inline-code-runtime.js` (loader adapter);
UI `packages/web/src/InlineCodeRunPreview.jsx`, `inline-code-client.js`. Shared plumbing: [file-jobs-production.md](file-jobs-production.md).

**State today: implemented, unit-tested with fixtures, local Miniflare 5/5, UI with intercepted jobs 6/6. NEVER executed on the deployed Dynamic Workers
loader. Deployed CPU termination, memory and billing are unproven. Off in production.**

## The blocker, stated exactly

- 2026-10-19: a dev-clone deploy that bound `worker_loaders` was rejected by Cloudflare: `In order to use Dynamic Workers, you must switch to a paid plan` (code 10195;
  `evidence/ctrlk-source-derivative-dev-2026-10-19.md`). The account is `rabbit-hole`.
- The account was probably upgraded to Workers Paid about 2026-10-22 (`webcard-blockers.md`). That is **unproven**: the deploy token has no billing scope, and no loader deploy has been tried since.
- Adding `worker_loaders` to a production config while the plan is Free would fail the whole production release, so it stays out of every committed config until the probe passes.

## The disposable re-test (prepared, NOT run)

`node scripts/ctrlk-loader-probe.mjs` (dry run by default). Files: `scripts/ctrlk-loader-probe.mjs`, `scripts/ctrlk-loader-probe-worker.js`, tests `scripts/ctrlk-loader-probe.test.mjs`
(7 tests on fakes: dry run cannot mutate, bad names and accounts refused, always torn down and confirmed gone, no token in files or output, 10195 reported as blocked).
It deploys ONE new Worker, `rabbit-hole-loader-probe-<yymmddhhmm>`, to the rabbit-hole account. It is not a clone of the app and touches no shared, dev-clone or production Worker, D1, R2,
Durable Object or secret. The only binding is `worker_loaders` (`INLINE_CODE_LOADER`), plus a random per-run bearer var so nobody else can call it.
`wrangler deploy --dry-run` of the generated config bundled cleanly (6.58 KiB) with the repo's wrangler 4.150.0, offline.

| Step | What happens | Stop condition |
|---|---|---|
| 1 | Credentials present by name, account equals the pinned one in `wrangler.dev.jsonc`, no Worker of that name exists (API GET must be 404) | any mismatch: nothing created |
| 2 | You type `DEPLOY LOADER PROBE` in a real terminal (the script refuses a pipe) | any other text: nothing created |
| 3 | `wrangler deploy`; state file written first so an interrupted run can be torn down | 10195: report **blocked: Workers Paid not active**, tear down, stop |
| 4 | 10 cases through the real runtime (finite, thrown, network denied, stdout limit, output limit, fresh globals x2, **CPU loop**, wall deadline, memory, recovers after abuse) | recorded per case |
| 5 | Always: `wrangler delete --name`, then API GET must be 404 | still exists: loud message and `--teardown` command |
| 6 | Receipt JSON (no token) in `C:/s/spec/fj-ctrlk/` | |

The case that matters: **`cpu_loop` (`for(;;){}`) passes only if the platform ends it with an error naming the limit in under 3 seconds** (the runtime sets `limits.cpuMs: 1000`).
If the answer is `timeout`, only the parent's 3 s wall clock fired and the loop is NOT shown to terminate: that is a FAIL and the feature must not be enabled.
`memory` is recorded, not gated: the runtime sets no memory limit (only `cpuMs` and `subRequests`). Timing is measured by the caller; Workers clocks do not advance during CPU work.

### Owner OK needed (exact), and cost

- Approval to run the probe once against the `rabbit-hole` Cloudflare account, using the credentials by name from `small-deploy/.env`.
- Cost: US$0 expected. Dynamic Workers include 1,000 unique workers, 10M requests and 30M CPU-ms per month on Workers Paid (docs read 2026-10-25); the probe creates about 10 distinct programs. Worst case beyond the inclusion: 10 x US$0.002 = US$0.02.
  The probe does **not** buy or change a plan; if the account is on Free it stops at 10195 having created nothing. Workers Paid itself ($5 a month, account-wide) is the owner's separate decision.
- Command (a normal terminal, not a pipe; the wrangler path is any installed 4.x, this one is from the credits-2500 worktree). Dry run first, same line without `--run`:

```
node C:/s/spec/day-1021/with-cf.mjs C:/Users/cyudhist/Desktop/workspace/fj-ctrlk node scripts/ctrlk-loader-probe.mjs --run --wrangler C:/Users/cyudhist/Desktop/workspace/credits-2500/node_modules/wrangler/bin/wrangler.js
```

- Success: exit 0, `outcome pass`, `deleted and confirmed gone (404)`. Exit 3 = blocked at 10195 (not paid). Exit 1 = a case failed or an error; read the receipt.
- Rollback: the Worker deletes itself in step 5; if it did not, `node ... scripts/ctrlk-loader-probe.mjs --teardown` (same wrapper) deletes the recorded name and refuses any other name.

## The limits (real names in code)

| Name | Where read | Rule |
|---|---|---|
| `INLINE_CODE_ENABLED` | route, actor | exactly `true` |
| `INLINE_CODE_LOADER` | route, actor | binding from `worker_loaders`; `.load` must be a function |
| `INLINE_CODE_MAX_RUNS` | `inlineCodePolicy` | positive integer string, `^[1-9][0-9]*$`, safe integer |
| `INLINE_CODE_RESERVE_MICROS` | same | positive integer string, at most `MAX_MICROS` |
| `INLINE_CODE_MAX_MICROS` | same | positive integer string; 1 credit = 10,000 micros |

Anything missing, malformed or inconsistent disables execution (503, nothing stored); `test/inline-code-limits.test.js` asserts this for every variable and every malformed form.
Fixed in code, not variables: CPU 1000 ms, subrequests 0, empty env, no outbound (`globalOutbound: null`), wall deadline 3 s, source 32 KiB, input 16 KiB, result 32 KiB, stdout 16 KiB and 128 lines.

### Proposal (not applied anywhere)

| Window | `MAX_RUNS` | `RESERVE_MICROS` | `MAX_MICROS` | Credits |
|---|---|---|---|---|
| Dev-clone acceptance | `25` | `10000` | `250000` | 1 per run, 25 total |
| First production window | `200` | `10000` | `2000000` | 1 per run, 200 total |

Reasoning:
- **Reserve 10,000 micros (1 credit, US$0.01).** The only per-run marginal platform cost beyond the monthly inclusion is US$0.002 per unique Dynamic Worker per day plus about US$0.00002 of CPU (1,000 ms at US$0.02 per million ms): roughly US$0.002, so 1 credit is about 5x cover and a round number a person can read.
- **`MAX_MICROS` = `MAX_RUNS` x `RESERVE_MICROS`** so neither cap can be reached before the other (asserted). If `MAX_MICROS` were lower, the money cap would silently bind first.
- **25 on a dev clone:** about 10 acceptance cases plus room to re-run. **200 in production:** a deliberately small first window. Even if every one of the 200 were uniquely billed the cost is US$0.40, against a US$2.00 ceiling; in practice the first 1,000 unique workers a month are included.
- Chosen once: the policy is **frozen into the object's storage on first use** (`code:budget`). Changing a variable afterwards makes the actor answer 409 "admission paused" for that object.

## Findings that need an owner decision

1. **The budget is a lifetime ceiling, not a rolling one.** `reservedMicros` only grows; finishing a run never gives it back (asserted by `inline-code-limits.test.js`). After `MAX_RUNS` total runs across all users, execution is refused permanently for the object `inline-code:global-v1`;
   refilling needs a new object name (a code change) because a variable change is refused. Fine for an acceptance window; wrong for a product. Recommendation: ship the 200-run window to prove the feature, and schedule a periodic reset as a separate task.
2. **The reservation is not charged to the person.** The job reserves from one global platform budget in micros; the AI-credit ledger is not involved. The panel says "Maximum reservation: N credits ... Execution can incur cost", which a person can read as their own credits being held. Decision: reword the panel (platform-funded, no credits spent), or move the reservation onto the person's allowance. Not changed here.
3. **Memory is unlimited by this code.** Only the platform default applies; the probe records it.

## Deployed acceptance and activation (prepared, NOT run)

`scripts/ctrlk-code-acceptance.mjs` (tests: `ctrlk-code-acceptance.test.mjs`) is the instrument for the deployed path; run it only after the probe above passed and the JavaScript activation commit on `feat/ctrlk-activate` is live. `--dry-run` first.
Runs, stopping at the first failure: `refusals` (other language, no confirmation, over-size source and input, consent below the reservation, unknown field, a canvas that is not yours: all refused, no credits moved), `jobs` (nine programs:
finite with a duplicate submit and a clashing id, **isolation** probes for the Internet, this app, dynamic import, environment, process, document, storage and bindings, a thrown error, output over the limit, stdout over the limit, a **CPU loop that must end
with an error naming the platform limit** and not a bare timeout, memory exhaustion recorded only, the 3 s wall deadline reported as termination-not-confirmed, and a finite run afterwards to show the loader recovered), `cancel` (a cancel wins over a late result and never claims termination),
and the opt-in `disabled-check` for the OFF state ("Execution is not configured." and nothing created). One US$0.05 booking in the shared budget covers it; the command uses 10 of the lifetime runs (200 in the production window, 25 on a dev window).
The activation commit sets `INLINE_CODE_ENABLED` `true`, the `worker_loaders` binding `INLINE_CODE_LOADER` and the proposal's limits (`200` / `10000` / `2000000`). If the probe returns **10195, Workers Paid is not active on the account: JavaScript execution is blocked on that account decision**, the activation commit stays held, and the Run panel keeps saying it is not configured.
Supported and unsupported scope, the owner command order and what stays unproven: [ctrlk-completion.md](ctrlk-completion.md).

## Run affordance (checked)

The UI never shows a "Run" button for an unavailable feature. The Ctrl+K code panel shows "Review execution"; opening it asks `GET /api/learn/code-runs` and, when `available` is false, shows only "Execution is not configured." with no start control.
Gap found and fixed (2026-10-26): while `FILE_JOBS` was unbound the route answered 503 and the panel printed "Execution request was not confirmed (503). Do not automatically resubmit." (the image panel: "Image generation availability could not be loaded.").
Both clients now treat a 503 on the read-only availability check as "not available" (`inline-code-client.js`, `inline-image-job-client.js`, tests added with a negative control); a 503 on a real submission is still an unconfirmed submission and is never resubmitted.
The browser checks `ctrlk-code-run-check.mjs` and `ctrlk-background-removal-check.mjs` were not changed or run locally (browser checks run in CI only).
