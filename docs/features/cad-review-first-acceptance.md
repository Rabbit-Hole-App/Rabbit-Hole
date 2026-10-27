# CAD review-first: budget account, pricing and production acceptance package

Prepared 2026-10-26 (lane `cad-review-first`, ledger f9f35fb7, d3a0e047). Nothing here was run in production. Status of the
feature: code and flag exist; production has `CAD_BRIEF_FIRST="false"`; the inert candidate raises `CAD_MAX_CALLS` to 3; the
flip is a separate one-line commit (`stack/c31-cad-flip`). **Owner decision O-5, 2026-10-26 about 5:00 PM PT: APPROVED. Enable review-first for signed-in users after the required checks and the production acceptance below; keep the paid-consent confirmation and the credit checks.** See [cad.md](cad.md) and [cad-production.md](cad-production.md).

## 1. The "96% reserved" executor budget, exactly

Read live `GET https://rabbit-hole-cad-prod.fly.dev/health` (public, free, wakes the machine) on 2026-10-26 10:3x AM PT:
`month 2026-10, reservedBytes 2,068,720,256, reservations 6, maximumBytes 2,147,483,648, busy false, admission true, image 3134c69a`. After the 2026-10-26 acceptance run the same read gives `2,103,323,264` and `9` reservations (room 44,160,384 B = 3 attempts, verified 2026-10-26 evening).

| Question | Answer | Source |
|---|---|---|
| What is it | Our own monthly TRANSFER reservation ledger for the Fly executor, bytes per UTC month. Not disk, not R2, not a provider limit. The only thing on the 1 GiB volume is a 192-byte JSON file. | `packages/cad-execute/production-budget.mjs` (`ProductionBudget.reserve`, `summary`), `fly.prod.toml` |
| Cap | 2 GiB, our policy, hard-coded three times: `MAXIMUM = 2 * 1024 ** 3` (line 6, `productionConfig` rejects more), `CAD_PRODUCTION_MAX_BYTES` in `fly.prod.toml`, and the ledger file's own `maximum` (must match or the executor refuses to start). Do not raise it. | same |
| What one attempt reserves | `total_artifact_bytes + 1 MiB` = 10,485,760 + 1,048,576 = 11,534,336 B (11 MiB), BEFORE execution, for the current month and also next month when the 640 s execution window crosses midnight UTC. | `reserve()` lines 93-113; `server.mjs` `budget.reserve(key, effectiveLimits(job).total_artifact_bytes)` |
| What is reserved now | 2,011,048,576 B (97.2%) is ONE setup reservation made 10-18 (2,010,000,000 + 1 MiB, image-build traffic; the 10-21 ledger 2,057,185,920 minus 4 x 11,534,336 leaves exactly this, and `C2-report.md` records it). The other 5 reservations are 5 job attempts = 57,671,680 B (55 MiB, 2.7%). The ledger stores month aggregates only, so per-reservation ids and ages do not exist. | arithmetic on health + `C:/s/spec/day-1021/cad/ledger-before.txt` |
| What a failed job charges | The same 11 MiB. The charge happens at admission; success, failure, cancel and crash never release it. A control-plane redispatch with a NEW attempt number charges again; a duplicate of the same `job_id:attempt` while the executor process remembers it charges nothing (`attempts.has(key)` answers 200 before `reserve`). `busy` 429 and `admission_disabled` 503 precede `reserve` and charge nothing. | `server.mjs` lines 158-164; `production-budget.mjs` line 115 comment "no refunds or rollover reset"; `expired()` returns false |
| Stale entries | None. "Stale" does not exist in this ledger; nothing is in flight (`busy:false`). | code |
| Room today | 44,160,384 B = 42.1 MiB = 3 more attempts after the acceptance run (it was 78,763,392 B = 6 attempts before; the 4th needs 44 MiB). | health |
| When it resets | Automatically at the UTC month boundary: 2026-11-01 00:00:00 UTC = **Saturday 2026-10-31 5:00:00 PM PDT** (DST ends Nov 1 at 2 AM, after the boundary, so Oct 31 is still PDT). It is NOT "Nov 1 5:00 PM". An attempt admitted at or after that instant reserves only November (186 attempts of room); one admitted between 4:49:20 PM and 5:00 PM PDT reserves BOTH months. | `month()` and `EXECUTION_WINDOW_MS = 640000` |
| Is Nov 1 required | No. October had 6 attempts before the acceptance run and has 3 after it. The paid acceptance job waits for the rollover only to start from a clean ledger (exact +1 / +11,534,336 B receipt) and because the flag is global: until then real users draw on the same remaining attempts. | |

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

**The first review-first job does not need an adjustment.** October had 75.1 MiB = 6 attempts left before the acceptance run (3 after it); the job needs 1 build attempt plus 1 per Quick edit rebuild (2 attempts, 22 MiB). `cad-acceptance.mjs pre` refuses to start with fewer than 3 attempts of room. The only reasons to wait for Oct 31 5:00 PM PDT are a clean receipt and not letting real users share the last attempts (exhaustion returns 429 `budget_exhausted`, pauses new CAD work for the month and emails the owner).

**Priced options if the owner still wants headroom before the rollover** (none applied; the first one is the only one this lane would suggest):

| Option | New cap | Capacity after | Max extra provider cost | How made | Rollback |
|---|---|---|---|---|---|
| A. Reconcile October: remove the 10-18 setup line | 2 GiB (unchanged, 2,147,483,648) | ledger `{reservedBytes: 57,671,680, reservations: 5}`; room 2,089,811,968 B = 181 attempts | removed line 2,011,048,576 B = 2.011 GB x $0.02 = **$0.040** if all of it had really been transferred; expected about $0 (a job sends about 0.15 MB). Already inside the authorized $35 infrastructure line, which budgets $0.04 transfer. | Manual, owner sign-off: stop machine 8e2570a74ed058, start it with the temporary `/bin/sleep` command (the `cad-production.md` setup pattern), `fly ssh` as `cad-svc`, back up the file and record its sha256, write the edited JSON atomically, verify, restore `/app/entrypoint`, check `/health`. No code change, no image. Not scripted: it is a production mutation and needs Fly credentials. | Put the backed-up file back (same steps). Capacity returns to 6 attempts. A corrupt file fails closed: the executor refuses to start. |
| B. Raise the cap by 1 GiB | 3 GiB (3,221,225,472) | +93 attempts on top of today's 6 | +1.074 GB x $0.02 = **$0.0215** per month at most | A reviewed commit changing `MAXIMUM` and `fly.prod.toml`, a new executor image (build $0.07 - $0.19, C2 estimate, unverified billing), `fly machine update`, AND the same manual edit of the ledger's `maximum` field as in A | Revert commit, rebuild, update, edit `maximum` back. Strictly more work and risk than A for less capacity. |
| C. One-time allowance | none | none | none | No such concept exists in the code; it would be new code | n/a. Not offered. |

Recommendation: do not adjust anything for the first job (it fits; run it after the release, preflight enforces room). If the owner wants the flag open to real users before Oct 31 5:00 PM PDT with comfortable headroom, take **A** (max extra $0.04, no code, reversible). Never B or a permanent raise (also the earlier finding). Failed-job charges: an attempt reserves 11 MiB at admission and never gets it back, whether the job then succeeds, fails or is cancelled; an executor 401 (token mismatch) or busy 429 charges nothing there, but a token mismatch is only discovered at dispatch, after the brief and source calls were paid (about $0.02 - $0.05 actual, $0.140 reserved) and the job's $0.20 monthly model reservation was taken (never refunded).

### 1b. The 2,011,048,576 B setup line: proposed reconciliation (NOT executed; 2026-10-26 evening)

Evidence: the October line is 2,011,048,576 B = 2,010,000,000 + 1 MiB, exactly what `reserve(key, 2,010,000,000)` writes (`allowance = bytes + 1 MiB`, production-budget.mjs). A job reserves at most 10 MiB + 1 MiB (`total_artifact_bytes` is capped at 10 MiB), so this was one direct reservation, not a job. `C2-report.md` and the 10-21 ledger read (2,057,185,920 B / 5 reservations minus 4 attempts) fix it as the 10-18 setup reservation for image-build traffic. No command or log of the call that made it exists, so the intent is an inference. `cad-production.md` says registry and build traffic is separate from this ledger. Fly lists outbound data to the internet at US$0.02 per GB and inbound as free; a registry push is inbound, so the line was probably never billable transfer, and at most 2.011 GB x US$0.02 = US$0.04.

State after the acceptance run: `reservedBytes 2,103,323,264`, 9 reservations, of which 8 are attempts (8 x 11,534,336 = 92,274,688 B) and one is the setup line.

Proposal for the owner (needs an explicit GO; nothing is reset by this document): set `months["2026-10"]` from `{reservedBytes: 2103323264, reservations: 9}` to `{reservedBytes: 92274688, reservations: 8}` (plus 11,534,336 B and one reservation for each attempt that lands before the edit), leaving schema, identity, `maximum` and `lastReservationAt` untouched. Capacity after: 2,055,208,960 B = 178 attempts. Procedure: the documented setup pattern (machine 8e2570a74ed058 stopped, started with the temporary `/bin/sleep` command, `fly ssh` as `cad-svc`, back up the file with its sha256, write the edited JSON atomically, restore `/app/entrypoint`, check `/health`); the executor rewrites the file from memory on every reserve, so it must be edited while the server is not running. Rollback: put the backed-up file back. Not needed before Sat 2026-10-31 5:00 PM PDT unless real users use up the 3 remaining attempts; the November ledger starts empty either way. Risk: it edits an append-only accounting file, so it needs the before and after hashes in the receipt.

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
- The flip commit (separate, never in the candidate; current branch `stack/c31-cad-flip` 6247d1c9 on main 8244c327) changes only `"CAD_BRIEF_FIRST": "false"` to `"true"`.

## 4. Production acceptance of review-first (first real job). NOT RUN.

Status vocabulary: the inert candidate (`CAD_MAX_CALLS` 3) is live on main (B1 d0e8b2b0, 2026-10-26 1:46 PM PT); `CAD_BRIEF_FIRST` is still `"false"`. The owner approved enabling it (O-5, 2026-10-26 about 5:00 PM PT), but it is NOT enabled and NOT accepted until the order below has run and its receipt passes. Approval does not waive the acceptance job. Deployed but disabled is incomplete.

### 4.1 Owner order (one command per step; each needs the owner's go)

Release order: main (inert candidate, `CAD_MAX_CALLS` 3, live) -> `stack/c31-cad-flip` (the one line `CAD_BRIEF_FIRST` "true", 6247d1c9 on main 8244c327; the integrator's gate and release train) -> converter activation `stack/c32-converter-activate` (stacked on c31, so it releases after it; it does not touch CAD) -> later batches. The acceptance job runs after the flip is live; until its receipt passes, review-first is enabled but not accepted, and a later batch should not touch CAD files in between.

1. Release the flip (c31: the integrator's train, then the owner's normal release of that one line). From this moment the flag is open to every signed-in user on a board they own (4.2). The confirmation and credit checks stay.
2. `node C:/s/spec/cad-review-first/cad-acceptance.mjs pre --go "RUN CAD ACCEPTANCE"`: reads the executor `/health` ledger, REFUSES (exit 2, "Do not click Generate") with fewer than 2 attempts of capacity, checks image 3134c69a, the `parameters` capability and `busy`, writes the baseline, reserves US$0.50 in the shared validation budget (US$100 total), and prints the exact browser steps. Without `--go` it is a dry run that writes nothing.
3. Browser, one job (printed by `pre`): `/cad` the plate prompt, confirm consent, the Review design appears; double-click Generate once; wait for ready; reload; an out-of-range Quick edit (refused), then a valid one (Preview, Accept); read the amounts shown.
4. `node C:/s/spec/cad-review-first/cad-acceptance.mjs post --go "RUN CAD ACCEPTANCE" --observed <what you saw>`: reads `/health` again, collects the cost by itself (SELECT-only reads of the learn D1 by the baseline window and the owner's principal, `fly machine status`), writes the receipt in four groups (MEASURED, ESTIMATED, UNKNOWN, RESERVED) and settles the validation budget entry with measured plus the labelled estimate. No dollar amount is typed; while anything is unresolved the entry stays at its US$0.50 maximum. A manual figure exists only as `--override-usd N --evidence <file> --reason "<why>"`, written to the receipt and the budget ledger note. The maintained script is `scripts/cad-acceptance.mjs` (tests: `scripts/cad-acceptance.test.mjs`).
Run `pre` again if more than 30 minutes pass before the click (`post` warns when the baseline is over an hour old).

### 4.2 Exposure: who can reach CAD once the flag is on (approved scope: signed-in users)

Approved exposure: any signed-in user on a board they own. It is bounded by (a) the paid-consent body and credit checks, (b) the `CAD_MODEL_ENABLED` and `CAD_PRODUCTION_ENABLED` secrets, (c) the global US$10 monthly model line (50 jobs a month at the 0.20 reservation), (d) one executor slot (a second job gets 429 `busy`), and (e) the executor transfer ledger: 3 attempts left in October (6 before the acceptance run; read 2026-10-26 evening), 186 from Sat Oct 31 5:00 PM PDT. This limit is OUR internal transfer-reservation policy (a 2 GiB cap in `production-budget.mjs`), not exhausted provider funds. Real users share those attempts with any acceptance rerun (it needs 2, a third when the refused edit reaches the executor); exhaustion returns 429 `budget_exhausted`, pauses new CAD work for the month and emails the owner, a fail-closed stop and not a spend overrun.

Verified from code (read 2026-10-26 at `rabbit-hole/main` d0e8b2b0; no CAD source file changed through 8244c327): `cadRoute` serves any signed-in user for a board they own (`SELECT ... WHERE id AND org AND owner_email`); `/cad` is an ordinary Learn slash command offered on a canvas that provides `startCad`; there is no user allowlist, no per-account flag and no per-board scope in the route or in the production config (no `CAD_*ALLOW*` var). Nothing else gates a job except: the paid-consent body, `SUBSCRIPTION_ONLY` refusal, `CAD_MODEL_ENABLED` and `CAD_PRODUCTION_ENABLED` being "true" (secrets), the executor being configured, the global US$10 model line (50 jobs a month) and the US$35 infrastructure projection, the single executor slot (a second job gets 429 `busy`), and the executor transfer ledger (6 attempts left in October, 186 from Oct 31 5:00 PM PDT). Sharing: shared and forked cards expose saved artifacts only, never live job state.
Could not verify: who can currently sign in to digrabbithole.com (sign-up pages exist; I found no sign-in allowlist in the production config or auth source, but I did not read production data), how many people other than the owner are signed in, and whether the two CAD secrets are "true". If the owner wants only themselves, the only existing mechanism is `CAD_VERIFICATION_BOARD_ID` (one canvas; blocks CAD for everyone else, needs a var deploy, tested for 2-call jobs, not 3).

### 4.3 What the receipt proves, and what it cannot

| Owner requirement | Evidence | Source |
|---|---|---|
| Token match (executor accepts the control plane's bearer token) | reservations rose and bytes are a whole number of 11,534,336 B attempts | machine-verified by `post` from `/health` |
| Ledger and retained-bytes delta | +2 attempts = +23,068,672 B (build plus accepted rebuild) when the out-of-range edit is stopped before dispatch; +3 = +34,603,008 B when it is dispatched and refused by the executor (reserved at admission, never refunded), accepted as CONSISTENT only with the published-build count of 2 | machine-verified (executor ledger only; the control-plane retained-byte and model ledgers are Durable Object state with no read route: not verifiable here) |
| Duplicate-press protection (one job for a double click) | count is exactly 2, not 3 | inferred from the count by `post`; unit-tested: `a double click on Generate approves once` (the second approval is refused with 409 "This design brief changed", so a harmless notice may flash; one source call, one executor dispatch) and create/rebuild are deduplicated by `requestId` |
| Failure path (refused attempt charges as designed and is explained) | the out-of-range edit leaves the count at 2; the explanation is read in the browser | count machine-verified; explanation owner-observed |
| Brief approval, source generation, review, ready | Review design shown, ready with STEP and GLB | owner-observed (`--observed review-panel,ready`) |
| Reload recovery | the card and its state return after a reload | owner-observed (`reload`); unit-tested (job state is the durable job record) |
| Quick edit and deterministic rebuild | Preview, Accept; no model call | owner-observed (`quick-edit`); the count (+1 attempt, no extra model phase) supports it |
| Credits only | no dollar amount on the card, consent or usage meter | owner-observed (`credits-only`); the server strips dollars from the CAD job view (credits-2500.md) |
| Provider spend | `usage_operations` / `usage_attempts` rows of the principal in the window (cost, model, tokens and price version where recorded) | MEASURED by `post`; executor machine time is a labelled ESTIMATE from `fly machine status`; per-job Cloudflare cost and the Fly invoice are UNKNOWN (no per-job billing) |
Anything not passed in `--observed` is written to the receipt as NOT VERIFIED.

### 4.4 Expected spend (model rows are the C2 measurements and the section 2 reservations; Fly rows are the `cad-production.md` rates)

| Item | Expected | Hard ceiling |
|---|---|---|
| Model, 3 calls | $0.031 - $0.071 (typically $0.04 - $0.06) | the job reserves $0.20 (`CAD_MAX_USD`); this job's three-call reservation is about $0.18 |
| Executor transfer ledger | +2 attempts = +23,068,672 B (+3 = +34,603,008 B if the refused edit reaches the executor); real bytes sent are small (the Linux probe downloaded 145,329 B for all five artifacts of one build) | cap 2 GiB |
| Fly machine | cold start, build, 5 idle minutes: about 7 minutes at $0.0353/hour, about $0.004 | |
| Total | about $0.04 - $0.08; a failed first job and one new job double it | US$10 model month, US$35 infrastructure month, shared validation budget reserve US$0.50 |

### 4.5 Stop and rollback (if the job fails or anything looks wrong)

- Before the paid click: nothing has been spent; run `release` on the budget entry (`stop` prints the command).
- During a job: Cancel on the card (spends nothing more; unit-tested).
- Fastest, no release needed: `cd packages/web` then `npx wrangler secret put CAD_MODEL_ENABLED --config wrangler.rabbit-hole-prod.jsonc` and enter `false` (the documented failure step, `cad-production.md` item 7). New jobs then answer "unavailable"; saved cards and in-flight `awaiting_approval` jobs stay.
- Executor: `fly machine stop 8e2570a74ed058 -a rabbit-hole-cad-prod`, and if spend or health requires, `fly machine update 8e2570a74ed058 -a rabbit-hole-cad-prod --autostart=false`. Retain the volume, Durable Objects and R2 artifacts.
- Flip back: revert the flip commit and release (the one-line inverse); this is the permanent way to turn review-first off, and `CAD_MODEL_ENABLED` false also turns off single-shot CAD until it is set back to "true".
`node C:/s/spec/cad-review-first/cad-acceptance.mjs stop` prints these.

### 4.6 First production acceptance (2026-10-26, owner run; receipt `C:/s/spec/cad-review-first/acceptance-receipt.md`)

Owner-observed: all seven items passed (Review design, ready with STEP and GLB, reload recovery, one job for the double click, an out-of-range Quick edit refused with an explanation, a valid Quick edit Previewed and Accepted, credits only). Machine-verified: the executor accepted 3 authenticated attempts (token match shown).

Measured from the usage rows (owner principal, window 5:48-5:56 PM PT, all three CAD model operations of the window): 0.026500 + 0.020674 + 0.013698 = US$0.060872 platform provider cost, 6.09 credits to the learner. Executor machine run 5:48:48-5:59:20 PM PT (632 s, one run, no restart) = US$0.0062 at the section 4.4 rate, an ESTIMATE. The validation budget entry was settled by the integrator at US$0.064872; with the Fly run read from `fly machine status` the rule gives about US$0.067, a difference inside the estimate that is recorded and not re-settled. The three action rows stay `running` because the CAD model path never closes its usage action (`cad-model.js` uses `withUsage` and no `finishActionOf`); the learner balance is unaffected because it sums settled attempts (`learn-usage.js` BALANCE_SCOPE). Not fixed here.

The ledger moved by 3 attempts, not 2 (2,068,720,256 B / 6 to 2,103,323,264 B / 9). Code trace: build 1, accepted Quick edit rebuild 1, Accept and Show dimensions 0, reload 0, double click 0, a refused edit 0 only when it is stopped on the card or by the server. The brief's `min` and `max` are optional, so a huge value for a parameter without a declared maximum is dispatched and refused by the executor, which costs one attempt by design; that fits the timeline (one machine run, last executor job about 5:54:15 PM PT) but is not proven. The expectation in this document and in the helper now allows +2 or +3 and calls +3 CONSISTENT only when `post` reads exactly 2 published builds (`file_derivatives`) and the owner reports the refused edit; otherwise it stays UNEXPLAINED.

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
| Executor attempts | one at a time (a second job gets 429 busy); 11 MiB reserved per attempt; 2 GiB per UTC month (186 attempts; October has 3 left after the acceptance run; resets Sat 2026-10-31 5:00 PM PDT) | `production-budget.mjs`, section 1 |
| Artifact size | 10 MiB per artifact and per job (`CAD_MAX_ARTIFACT_BYTES`, `CAD_MAX_TOTAL_BYTES`) | wrangler prod config |
| Time | 15 minutes per job (`elapsedMs` 900,000), 300 s per executor stage, 600 s total execution; model call timeout 120 s | `cad-contract.js`, `cad-model.js` |
| Quick edit | only the parameters the brief declared (at most 40: length, angle, number, count, choice, boolean; linear compare constraints); validated server side; a rebuild runs the saved source with new values and makes no model call; one proposed change at a time; Preview then Accept or Discard | `cad-parameters.js`, `cad-jobs.js` rebuild |
| Changing the brief | Edit details re-validates without a call; adding or removing parameters needs a new brief (a new call); the review compares the build with the requirement TEXT, so edit the sentence too (C2 F1) | `cad-controls.test.js` |
| Exports | STEP and GLB from the build; STL and 3MF on request (each is one more executor attempt) | `cad-jobs.js` exports |
| Retry | a failed job can be retried while calls remain; at 3 calls a review-first job that used all three cannot be retried (start a new one, another $0.20 reservation) | `cad-jobs.js` retry |
| What users see | credits only; dollars, provider names and the ledger are excluded server-side | `credits-2500.md` |
