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

### 1a. Internal policy or provider restriction? (owner question 2026-10-26)

**Internal policy.** Evidence: the cap is a constant we wrote (`MAXIMUM = 2 * 1024 ** 3`, `production-budget.mjs` line 6; `CAD_PRODUCTION_MAX_BYTES` in `fly.prod.toml`; the ledger's own `maximum` field), the reservation is made by our executor before each attempt, and `cad-production.md` says "These are operating limits, not a Fly billing hard cap". The Fly pricing page (https://docs.fly.io/about/pricing, read 2026-10-26; `fly.io/docs/about/pricing` redirects to it) lists outbound data to the internet at **$0.02 per GB in North America and Europe** (inbound is free) and states no transfer quota or cap. The executor runs in `iad` (North America).
Unknown: whether the Fly organization has an account-level spend limit or quota that the pricing page does not mention; whether Fly bills image pushes to its registry as egress (the page is silent; so whether the 2.01 GB setup reservation of 10-18 was ever a real charge). The separate US$10 per month model line is also OUR ledger (`cad-production-budget.js`, UTC month, max 10 enforced in code); the provider-side workspace spend limit that `cad-production.md` asks for ($10) was not verified here.

**The first review-first job does not need an adjustment.** October has 75.1 MiB = 6 attempts left; the job needs 1 build attempt plus 1 per Quick edit rebuild (2 attempts, 22 MiB). `cad-acceptance.mjs pre` refuses to start with fewer than 3 attempts of room. The only reasons to wait for Oct 31 5:00 PM PDT are a clean receipt and not letting real users share the last 6 attempts (exhaustion returns 429 `budget_exhausted`, pauses new CAD work for the month and emails the owner).

**Priced options if the owner still wants headroom before the rollover** (none applied; the first one is the only one this lane would suggest):

| Option | New cap | Capacity after | Max extra provider cost | How made | Rollback |
|---|---|---|---|---|---|
| A. Reconcile October: remove the 10-18 setup line | 2 GiB (unchanged, 2,147,483,648) | ledger `{reservedBytes: 57,671,680, reservations: 5}`; room 2,089,811,968 B = 181 attempts | removed line 2,011,048,576 B = 2.011 GB x $0.02 = **$0.040** if all of it had really been transferred; expected about $0 (a job sends about 0.15 MB). Already inside the authorized $35 infrastructure line, which budgets $0.04 transfer. | Manual, owner sign-off: stop machine 8e2570a74ed058, start it with the temporary `/bin/sleep` command (the `cad-production.md` setup pattern), `fly ssh` as `cad-svc`, back up the file and record its sha256, write the edited JSON atomically, verify, restore `/app/entrypoint`, check `/health`. No code change, no image. Not scripted: it is a production mutation and needs Fly credentials. | Put the backed-up file back (same steps). Capacity returns to 6 attempts. A corrupt file fails closed: the executor refuses to start. |
| B. Raise the cap by 1 GiB | 3 GiB (3,221,225,472) | +93 attempts on top of today's 6 | +1.074 GB x $0.02 = **$0.0215** per month at most | A reviewed commit changing `MAXIMUM` and `fly.prod.toml`, a new executor image (build $0.07 - $0.19, C2 estimate, unverified billing), `fly machine update`, AND the same manual edit of the ledger's `maximum` field as in A | Revert commit, rebuild, update, edit `maximum` back. Strictly more work and risk than A for less capacity. |
| C. One-time allowance | none | none | none | No such concept exists in the code; it would be new code | n/a. Not offered. |

Recommendation: do not adjust anything for the first job (it fits; run it after the release, preflight enforces room). If the owner wants the flag open to real users before Oct 31 5:00 PM PDT with comfortable headroom, take **A** (max extra $0.04, no code, reversible). Never B or a permanent raise (also the earlier finding). Failed-job charges: an attempt reserves 11 MiB at admission and never gets it back, whether the job then succeeds, fails or is cancelled; an executor 401 (token mismatch) or busy 429 charges nothing there, but a token mismatch is only discovered at dispatch, after the brief and source calls were paid (about $0.02 - $0.05 actual, $0.140 reserved) and the job's $0.20 monthly model reservation was taken (never refunded).

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
- The HELD commit (separate, not in the candidate branch tip; current branch `feat/cad-review-first-held-flip-2` on top of batch B2) changes only `"CAD_BRIEF_FIRST": "false"` to `"true"`.

## 4. Production acceptance of review-first (first real job). NOT RUN.

Status vocabulary: the inert candidate (`CAD_MAX_CALLS` 3) is live on main (B1 d0e8b2b0, 2026-10-26 1:46 PM PT); `CAD_BRIEF_FIRST` is still `"false"`. Review-first is NOT enabled and NOT accepted until the order below has run and its receipt passes. Deployed but disabled is incomplete.

### 4.1 Owner order (one command per step; each needs the owner's go)

Held change: branch `feat/cad-review-first-held-flip-2`, one line `CAD_BRIEF_FIRST` "true" on top of the current batch.

1. Release the held flip (normal release of that one line; the owner's main push). From this moment the flag is open to everyone who can reach CAD (4.2).
2. `node C:/s/spec/cad-review-first/cad-acceptance.mjs pre --go "RUN CAD ACCEPTANCE"`: reads the executor `/health` ledger, REFUSES (exit 2, "Do not click Generate") with fewer than 2 attempts of capacity, checks image 3134c69a, the `parameters` capability and `busy`, writes the baseline, reserves US$0.50 in the shared validation budget (US$100 total), and prints the exact browser steps. Without `--go` it is a dry run that writes nothing.
3. Browser, one job (printed by `pre`): `/cad` the plate prompt, confirm consent, the Review design appears; double-click Generate once; wait for ready; reload; an out-of-range Quick edit (refused), then a valid one (Preview, Accept); read the amounts shown.
4. `node C:/s/spec/cad-review-first/cad-acceptance.mjs post --go "RUN CAD ACCEPTANCE" --actual-usd <total> --observed <what you saw>`: reads `/health` again and writes the receipt.
Run `pre` again if more than 30 minutes pass before the click (`post` warns when the baseline is over an hour old).

### 4.2 Who else can reach CAD while the flag is open

Verified from code (read 2026-10-26 at `rabbit-hole/main` d0e8b2b0): `cadRoute` serves any signed-in user for a board they own (`SELECT ... WHERE id AND org AND owner_email`); `/cad` is an ordinary Learn slash command offered on a canvas that provides `startCad`; there is no user allowlist, no per-account flag and no per-board scope in the route or in the production config (no `CAD_*ALLOW*` var). Nothing else gates a job except: the paid-consent body, `SUBSCRIPTION_ONLY` refusal, `CAD_MODEL_ENABLED` and `CAD_PRODUCTION_ENABLED` being "true" (secrets), the executor being configured, the global US$10 model line (50 jobs a month) and the US$35 infrastructure projection, the single executor slot (a second job gets 429 `busy`), and the executor transfer ledger (6 attempts left in October, 186 from Oct 31 5:00 PM PDT). Sharing: shared and forked cards expose saved artifacts only, never live job state.
Could not verify: who can currently sign in to digrabbithole.com (sign-up pages exist; I found no sign-in allowlist in the production config or auth source, but I did not read production data), how many people other than the owner are signed in, and whether the two CAD secrets are "true". If the owner wants only themselves, the only existing mechanism is `CAD_VERIFICATION_BOARD_ID` (one canvas; blocks CAD for everyone else, needs a var deploy, tested for 2-call jobs, not 3).

### 4.3 What the receipt proves, and what it cannot

| Owner requirement | Evidence | Source |
|---|---|---|
| Token match (executor accepts the control plane's bearer token) | reservations rose and bytes are a whole number of 11,534,336 B attempts | machine-verified by `post` from `/health` |
| Ledger and retained-bytes delta | exactly +2 attempts = +23,068,672 B (build plus rebuild) | machine-verified (executor ledger only; the control-plane retained-byte and model ledgers are Durable Object state with no read route: not verifiable here) |
| Duplicate-press protection (one job for a double click) | count is exactly 2, not 3 | inferred from the count by `post`; unit-tested: `a double click on Generate approves once` (the second approval is refused with 409 "This design brief changed", so a harmless notice may flash; one source call, one executor dispatch) and create/rebuild are deduplicated by `requestId` |
| Failure path (refused attempt charges as designed and is explained) | the out-of-range edit leaves the count at 2; the explanation is read in the browser | count machine-verified; explanation owner-observed |
| Brief approval, source generation, review, ready | Review design shown, ready with STEP and GLB | owner-observed (`--observed review-panel,ready`) |
| Reload recovery | the card and its state return after a reload | owner-observed (`reload`); unit-tested (job state is the durable job record) |
| Quick edit and deterministic rebuild | Preview, Accept; no model call | owner-observed (`quick-edit`); the count (+1 attempt, no extra model phase) supports it |
| Credits only | no dollar amount on the card, consent or usage meter | owner-observed (`credits-only`); the server strips dollars from the CAD job view (credits-2500.md) |
| Provider spend | the card diagnostics or the provider console | not machine-verifiable; passed as `--actual-usd` |
Anything not passed in `--observed` is written to the receipt as NOT VERIFIED.

### 4.4 Expected spend (model rows are the C2 measurements and the section 2 reservations; Fly rows are the `cad-production.md` rates)

| Item | Expected | Hard ceiling |
|---|---|---|
| Model, 3 calls | $0.031 - $0.071 (typically $0.04 - $0.06) | the job reserves $0.20 (`CAD_MAX_USD`); this job's three-call reservation is about $0.18 |
| Executor transfer ledger | +2 attempts = +23,068,672 B; real bytes sent are small (the Linux probe downloaded 145,329 B for all five artifacts of one build) | cap 2 GiB |
| Fly machine | cold start, build, 5 idle minutes: about 7 minutes at $0.0353/hour, about $0.004 | |
| Total | about $0.04 - $0.08; a failed first job and one new job double it | US$10 model month, US$35 infrastructure month, shared validation budget reserve US$0.50 |

### 4.5 Stop and rollback (if the job fails or anything looks wrong)

- Before the paid click: nothing has been spent; run `release` on the budget entry (`stop` prints the command).
- During a job: Cancel on the card (spends nothing more; unit-tested).
- Fastest, no release needed: `cd packages/web` then `npx wrangler secret put CAD_MODEL_ENABLED --config wrangler.rabbit-hole-prod.jsonc` and enter `false` (the documented failure step, `cad-production.md` item 7). New jobs then answer "unavailable"; saved cards and in-flight `awaiting_approval` jobs stay.
- Executor: `fly machine stop 8e2570a74ed058 -a rabbit-hole-cad-prod`, and if spend or health requires, `fly machine update 8e2570a74ed058 -a rabbit-hole-cad-prod --autostart=false`. Retain the volume, Durable Objects and R2 artifacts.
- Flip back: revert the held commit and release (the one-line inverse); this is the permanent way to turn review-first off, and `CAD_MODEL_ENABLED` false also turns off single-shot CAD until it is set back to "true".
`node C:/s/spec/cad-review-first/cad-acceptance.mjs stop` prints these.

Not covered by any of this: Windows/Linux browser visuals of the Review design in production, the Linux executor sandbox paths not exercised by the 10-21 smoke, real-model quality beyond the three C2 shapes, Focus on a real model, shared-card behaviour for other users.

## 5. Supported settings and limits (published; source in brackets)

| Setting or limit | Value | Source |
|---|---|---|
| `CAD_BRIEF_FIRST` | `"true"` enables review-first for every user; default and production today `"false"`; read only as the string `true` | `cad-jobs.js` line 183, `wrangler.rabbit-hole-prod.jsonc` |
| `CAD_MAX_CALLS` | 3 (brief, source, review); must be at least 3 whenever the flag is true (a config test pins it); can only be lowered by config, hard ceiling 6 | `cad-contract.js` `CAD_LIMITS`, `rabbit-hole-prod-config.test.js` |
| `CAD_MAX_REPAIRS` | 0: a rejected review fails the job, there is no automatic repair; hard ceiling 1 | same |
| `CAD_MAX_USD` | 0.20 per job (reserved about 0.18); also the amount reserved once per job against the monthly US$10 line (50 jobs a month) | `cad-production-budget.js`, section 2 |
| Per-call cap | US$0.10 per model call; the source call after approval has about $0.009 of headroom | `cad-model.js`, section 2 (C2 F5) |
| Prompt context | keep canvas context under about 2 KB and attach no reference picture on a review-first request, or the source call can be refused after the brief is paid | section 2 |
| Executor attempts | one at a time (a second job gets 429 busy); 11 MiB reserved per attempt; 2 GiB per UTC month (186 attempts; October has 6 left; resets Sat 2026-10-31 5:00 PM PDT) | `production-budget.mjs`, section 1 |
| Artifact size | 10 MiB per artifact and per job (`CAD_MAX_ARTIFACT_BYTES`, `CAD_MAX_TOTAL_BYTES`) | wrangler prod config |
| Time | 15 minutes per job (`elapsedMs` 900,000), 300 s per executor stage, 600 s total execution; model call timeout 120 s | `cad-contract.js`, `cad-model.js` |
| Quick edit | only the parameters the brief declared (at most 40: length, angle, number, count, choice, boolean; linear compare constraints); validated server side; a rebuild runs the saved source with new values and makes no model call; one proposed change at a time; Preview then Accept or Discard | `cad-parameters.js`, `cad-jobs.js` rebuild |
| Changing the brief | Edit details re-validates without a call; adding or removing parameters needs a new brief (a new call); the review compares the build with the requirement TEXT, so edit the sentence too (C2 F1) | `cad-controls.test.js` |
| Exports | STEP and GLB from the build; STL and 3MF on request (each is one more executor attempt) | `cad-jobs.js` exports |
| Retry | a failed job can be retried while calls remain; at 3 calls a review-first job that used all three cannot be retried (start a new one, another $0.20 reservation) | `cad-jobs.js` retry |
| What users see | credits only; dollars, provider names and the ledger are excluded server-side | `credits-2500.md` |
