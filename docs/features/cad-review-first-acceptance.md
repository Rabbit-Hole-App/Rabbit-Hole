# CAD review-first: budget account, pricing and production acceptance package

Prepared 2026-10-26 (lane `cad-review-first`, ledger f9f35fb7, d3a0e047). Nothing here was run in production. Status of the
feature: code and flag exist; production has `CAD_BRIEF_FIRST="false"`; the inert candidate raises `CAD_MAX_CALLS` to 3; the
flip is a separate HELD commit. See [cad.md](cad.md) and [cad-production.md](cad-production.md).

## 1. The "96% reserved" executor budget, exactly

Read live `GET https://rabbit-hole-cad-prod.fly.dev/health` (public, free, wakes the machine) on 2026-10-26 10:3x AM PT:
`month 2026-10, reservedBytes 2,068,720,256, reservations 6, maximumBytes 2,147,483,648, busy false, admission true, image 3134c69a`.

| Question | Answer | Source |
|---|---|---|
| What is it | Our own monthly TRANSFER reservation ledger for the Fly executor, bytes per UTC month. Not disk, not R2, not a provider limit. The only thing on the 1 GiB volume is a 192-byte JSON file. | `packages/cad-execute/production-budget.mjs` (`ProductionBudget.reserve`, `summary`), `fly.prod.toml` |
| Cap | 2 GiB, our policy, hard-coded three times: `MAXIMUM = 2 * 1024 ** 3` (line 6, `productionConfig` rejects more), `CAD_PRODUCTION_MAX_BYTES` in `fly.prod.toml`, and the ledger file's own `maximum` (must match or the executor refuses to start). Do not raise it. | same |
| What one attempt reserves | `total_artifact_bytes + 1 MiB` = 10,485,760 + 1,048,576 = 11,534,336 B (11 MiB), BEFORE execution, for the current month and also next month when the 640 s execution window crosses midnight UTC. | `reserve()` lines 93-113; `server.mjs` `budget.reserve(key, effectiveLimits(job).total_artifact_bytes)` |
| What is reserved now | 2,011,048,576 B (97.2%) is ONE setup reservation made 10-18 (2,010,000,000 + 1 MiB, image-build traffic; the 10-21 ledger 2,057,185,920 minus 4 x 11,534,336 leaves exactly this, and `C2-report.md` records it). The other 5 reservations are 5 job attempts = 57,671,680 B (55 MiB, 2.7%). The ledger stores month aggregates only, so per-reservation ids and ages do not exist. | arithmetic on health + `C:/s/spec/day-1021/cad/ledger-before.txt` |
| What a failed job charges | The same 11 MiB. The charge happens at admission; success, failure, cancel and crash never release it. A control-plane redispatch with a NEW attempt number charges again; a duplicate of the same `job_id:attempt` while the executor process remembers it charges nothing (`attempts.has(key)` answers 200 before `reserve`). `busy` 429 and `admission_disabled` 503 precede `reserve` and charge nothing. | `server.mjs` lines 158-164; `production-budget.mjs` line 115 comment "no refunds or rollover reset"; `expired()` returns false |
| Stale entries | None. "Stale" does not exist in this ledger; nothing is in flight (`busy:false`). | code |
| Room today | 78,763,392 B = 75.1 MiB = 6 more attempts (the 7th needs 77 MiB). | health |
| When it resets | Automatically at the UTC month boundary: 2026-11-01 00:00:00 UTC = **Saturday 2026-10-31 5:00:00 PM PDT** (DST ends Nov 1 at 2 AM, after the boundary, so Oct 31 is still PDT). It is NOT "Nov 1 5:00 PM". An attempt admitted at or after that instant reserves only November (186 attempts of room); one admitted between 4:49:20 PM and 5:00 PM PDT reserves BOTH months. | `month()` and `EXECUTION_WINDOW_MS = 640000` |
| Is Nov 1 required | No. October still has 6 attempts, enough for one review-first job plus one rebuild. The paid acceptance job waits for the rollover only to start from a clean ledger (exact +1 / +11,534,336 B receipt) and because the flag is global: until then real users draw on the same 6 attempts. | |

Safe remedies, in order:
1. Wait for the rollover (Oct 31 5:00 PM PDT). Automatic, $0, no accounting edit. Recommended.
2. Manual reconcile of `months["2026-10"]` from `{2068720256, 6}` to `{57671680, 5}` (the setup line is build traffic that `cad-production.md` says is not part of this ledger). It edits an append-only accounting file, so it needs the owner's explicit sign-off and a before/after hash receipt; it needs Fly credentials and the machine stopped (the executor re-writes the file from memory on every reserve). The `cad-production.md` setup pattern (temporary `/bin/sleep` command, `fly ssh` as `cad-svc`) is the only documented way. Not run, not scripted here.
3. Raising the 2 GiB cap: not recommended (code change, new image, ledger edit; worse than 2).

Read-only commands the owner can run (both verified; no write):
- `curl -s https://rabbit-hole-cad-prod.fly.dev/health` : the month's `reservedBytes`, `reservations`, `maximumBytes`.
- `fly ssh console -a rabbit-hole-cad-prod -u cad-svc -C "cat /var/cad/budget/production.json"` : the whole ledger (flags checked against `fly ssh console --help`; the file is mode 0600 owned by `cad-svc`; the 10-21 receipt read it over Fly SSH the same way but its exact command was not recorded). Needs the machine running (the health call starts it).

There is no CLI or endpoint for the control-plane model ledger (the US$10 line); it lives in the `cad:production-budget` Durable Object and `cadProductionBudgetStatus` is reachable only by the object's own GET. Its current month total could not be read.

## 2. Pricing a 3-call review-first job

Prices come from the registry `packages/control-plane/src/pricing-registry.js` (`anthropic('claude-sonnet-5-5', 2, 10, 0.05)`: input $2 and output $10 per million tokens, status verified, official page retrieved 2026-10-23, `PRICE_VERSION 2026-10-23.1`). A call's admission reservation is `requestSpendBound` (input bytes + 1000 framing tokens at $2/M, plus the whole `max_tokens` at $10/M); `CAD_MODEL = claude-sonnet-5-5`. Measured with the real functions on the `plate-holes` fixture (test `CAD brief-first at the production limits`):

| Call | max_tokens | Reserved | C2 real-model actual (local run, not production) |
|---|---|---|---|
| 1 brief (interpretation) | 4000 | $0.0487 | $0.005 - $0.032 |
| 2 source from approved brief | 6000 | $0.0914 | $0.016 - $0.023 |
| 3 visual review (with thumbnail) | 1200 | $0.0372 | $0.010 - $0.016 |
| Job | | **$0.1773** of `CAD_MAX_USD` 0.20 | $0.031 - $0.071, typically $0.04 - $0.06 |

- **Monthly US$10 line**: the global ledger reserves the job's whole `CAD_MAX_USD` ONCE per job (`reserveCadProductionModel` reuses an existing `jobId` entry), not per call. 3 calls vs 2 changes nothing there: 0.20 x 50 = $10, so 50 jobs a month (existing test `fifty .20 whole jobs`, and the new test asserts one 200,000-micro entry for a three-call job). Actual spend for 50 jobs is about $2-3.5.
- **Per-call cap**: each call must also be <= $0.10 (`cad-model.js`). The source call is the tight one: $0.0914 leaves about $0.009 (about 4.4 KB of context or brief growth) and a single reference picture ($0.0096) already breaches it, so a brief-first job can be refused AFTER the user paid for the brief (C2 finding F5, unchanged, owner's ceiling). With that cap binding first, the worst admissible sum is about $0.193 (arithmetic from the numbers above), so **`CAD_MAX_USD` 0.20 is just enough and is kept**. The margin is about $0.007; a review payload with many checks can eat it, and then the review is refused with 429 after generation.
- **Recommendation (owner decision D2, not applied)**: keep 0.20 for the first acceptance job (small prompt, empty context, no pictures: reserved $0.177). Raise `CAD_MAX_USD` to 0.25 only together with a decision on the per-call cap (F5); 0.25 gives 40 jobs a month. Changing it is NOT inert: it changes what every single-shot job reserves from the monthly line.
- **Retry budget**: with `CAD_MAX_CALLS` 3 and `CAD_MAX_REPAIRS` 0 a review-first job has no spare call. A failed review (provider error or rejection) cannot be retried; start a new job (another $0.20 reservation). Review rejection is terminal (repairs 0). Raising calls to 4 would add one review retry; not proposed.

## 3. The candidate: what changed and what it proves

- `packages/web/wrangler.rabbit-hole-prod.jsonc`: `CAD_MAX_CALLS` "2" -> "3". `CAD_BRIEF_FIRST` stays "false".
- Tests: `rabbit-hole-prod-config.test.js` pins calls 3 / usd 0.20 / repairs 0 and the invariant `CAD_BRIEF_FIRST == "true"` implies calls >= 3; `cad-controls.test.js` adds the three-call production-limits job (calls, per-call cap, sum, headroom >= $0.02, one global reservation), the inertness proof and the Retry delta; `cad-acceptance-stack.mjs` gives only the global budget object a state id so production enforcement can run in it.
- **Inertness, proven how**: with the flag false `cad-jobs.js` line 183 never sets `modelPhase:'brief'`, and `CAD_MAX_CALLS` is read only by `cadLimits()` as an upper bound. The test runs a whole single-shot job under production enforcement at calls 2 and at calls 3 and asserts the results deep-equal: model phases `['single','review']`, calls, repairs, reserved USD, phase USD, executor limits, the global model reservation and retained bytes.
- **The one reachable difference** (so "inert" is exact, not absolute): a single-shot job that spent both calls and then FAILED its review used to be refused by Retry ("reached its accepted budget"); at 3 calls Retry is accepted once and makes one more review call, still inside the same job's `CAD_MAX_USD` and the same monthly reservation. It is pinned by a test. It needs a provider or review failure to happen first.
- Negative control: with the committed value put back to "2" the config test fails (`actual ['2','0.20','0']`). The existing test `CAD brief-first needs three calls` (explicit `CAD_MAX_CALLS: '2'`) still shows the old behaviour fails before review.
- The HELD commit (separate, not in the candidate branch tip) changes only `"CAD_BRIEF_FIRST": "false"` to `"true"`.

## 4. Production acceptance package (first real review-first job). NOT RUN.

Owner decisions first: O-5 (enable review-first), GO for the paid job, and the exposure choice below.

**Preconditions**
1. Inert candidate released to production (normal release; owner's `main` push).
2. Time is after Sat 2026-10-31 5:00 PM PDT (clean November ledger), or the owner accepts October's 6-attempt room.
3. HELD flip released. The flag is global: every CAD user gets review-first from that release. Exposure options: (a) run the job immediately after the release and keep the flag if it passes (recommended while CAD has no public users beyond the owner, which this lane did not verify); (b) scope admission to one canvas with `CAD_VERIFICATION_BOARD_ID` plus `CAD_VERIFICATION_MAX_CALLS=3` / `_MAX_USD=0.20` (the code path exists; it blocks CAD on every other canvas, needs another deploy and was not tested for 3 calls here).
4. The integrator reserves the spend in `C:/s/spec/budget/budget.mjs` if CAD model spend counts against the shared validation cap (unknown; CAD has its own US$10 per month authorization).
5. `CAD_PRODUCTION_ENABLED` and `CAD_MODEL_ENABLED` are secrets whose values nobody can read; if either is not "true" the card says so and nothing is spent.

**Steps** (owner, browser, signed in as the org that owns CAD)
1. Baseline: `curl -s https://rabbit-hole-cad-prod.fly.dev/health`. Record `month`, `reservedBytes`, `reservations`, `image` (expect 3134c69a), `capabilities` (expect `["parameters"]`).
2. Create a new board named `CAD review-first acceptance 2026-MM-DD`. Select no other card (context above about 2 KB makes the source call exceed the per-call cap, F5) and attach no picture.
3. Run `/cad` with exactly: `Plate 80x50x6 mm, four 5 mm holes 8 mm in from the edges` (the C2 plate with units; no units would add a question and a call). Confirm the paid consent. Expect state `awaiting_approval` and the Review design panel (call 1).
4. Do NOT use Edit details (C2 finding F1: the review compares the build with the requirement TEXT, so an edited value can be rejected, and with repairs 0 that fails the job). Click Generate (the approval is a second paid confirmation). Expect building, then ready with STEP and GLB (calls 2 and 3 and the executor attempt).
5. Quick edit: change one value (hole diameter 5 to 6), Preview, Accept. No model call. Open Show dimensions and Focus.
6. Re-run the health curl.

**Expected spend** (nothing is invented: the model rows are the C2 measurements and section 2 reservations; Fly rows are `cad-production.md` rates)

| Item | Expected | Hard ceiling |
|---|---|---|
| Model, 3 calls | $0.031 - $0.071 (typically $0.04 - $0.06) | job reserves $0.20 (`CAD_MAX_USD`); this job's three-call reservation is about $0.18 |
| Executor transfer ledger | +2 attempts (build, rebuild) = +23,068,672 B, reservations +2 (from a clean Nov ledger: 23,068,672 / 2); real bytes sent are small (the Linux probe downloaded 145,329 B for all five artifacts of one build) | cap 2 GiB |
| Fly machine | cold start, build, 5 idle minutes: about 7 minutes at $0.0353/hour = about $0.004 | |
| Total | **about $0.04 - $0.08**; a failed first job and one new job double it | US$10 model month, US$35 infrastructure month (existing authorization) |
| Monthly model reservation | $0.20 per job (one entry) | $10 |

**Token match receipt** (what it means: the executor bearer token `CAD_EXECUTOR_TOKEN` held by the control plane is the one the executor holds, which the 10-21 rollout could not prove; and the per-attempt callback token derived from `CAD_JOB_SECRET` is accepted). Evidence: the executor accepted the dispatch (a mismatch is a 401 and the job fails at dispatch), the health `reservations` rose by exactly 1 per attempt and `reservedBytes` by 11,534,336, and the job reached `ready` with artifacts (callbacks authenticated). Record in `C:/s/spec/cad-review-first/acceptance-receipt.md`: health before/after (full JSON), job id, the three phase USD values (card / owner diagnostics), the card's revision id, PT times, and the dev/prod build SHA. Anything not observed stays "not verified".

**How to stop**
- Before step 3: do nothing; no paid call has happened.
- During a job: Cancel on the card (cancel spends nothing more; unit-tested "Cancel during review spends nothing more and contacts no executor").
- Hard stop, no release needed: `cd packages/web` then `npx wrangler secret put CAD_MODEL_ENABLED --config wrangler.rabbit-hole-prod.jsonc` and enter `false` (the documented failure step, `cad-production.md` item 7; flags checked against `wrangler secret put --help`). Executor: `fly machine stop 8e2570a74ed058 -a rabbit-hole-cad-prod`, and if spend or health requires, `fly machine update 8e2570a74ed058 -a rabbit-hole-cad-prod --autostart=false` (flags checked against `--help`; the 10-21 receipt gives the machine id). Retain the volume, Durable Objects and R2 artifacts.
- Turn review-first back off: revert the HELD commit and release. In-flight `awaiting_approval` jobs stay durable.

Not covered by any of this: Windows/Linux browser visuals of the Review design in production, the 3 Linux executor sandbox paths not exercised by the smoke, real-model quality beyond the three C2 shapes, and the Focus adapter on a real CAD model (ledger d3a0e047).
