# CAD constraint diagnosis: "executor storage budget 96% reserved" (2026-10-25, 9:55 PM PT)

Read-only. Evidence: stack-c13 at 29622d8e (CAD files identical to rabbit-hole/main 629251d4; main differs only in the Motion line of wrangler.rabbit-hole-prod.jsonc), live GET /health, `wrangler secret list` names only, the 10-21 receipts. No SSH, no DO read, no D1 read (CAD state is not in D1), no spend.

## Answer in one paragraph

The number is not storage and not a provider limit. It is OUR conservative monthly TRANSFER (egress) reservation ledger for the Fly executor, in bytes, per UTC month, with a 2 GiB cap that we chose and hard-coded. 97.2 percent of what is "reserved" (2,011,048,576 of 2,068,720,256 bytes) is one setup reservation made on 10-18 for image-build traffic, not job traffic. Real job attempts account for 55 MiB (5 x 11 MiB, 2.7 percent). The ledger has no release path by design. November 1 is therefore not physically required: the cause is a setup charge sitting in the October ledger. October still has room for 6 more executor attempts today; a reconcile (owner-authorised, manual) would restore about 181; a UTC rollover (Oct 31 5:00 PM PDT) restores 186 with no action.

## (1) Which resource, units, who sets it

| Item | Value | Evidence |
|---|---|---|
| What it measures | Bytes of artifact output the executor may send back, reserved BEFORE each execution attempt, per UTC calendar month. A proxy for Fly outbound transfer. | packages/cad-execute/production-budget.mjs:99-117 (`reserve`), server.mjs:164 `budget.reserve(key, effectiveLimits(job).total_artifact_bytes)` |
| Unit per attempt | `total_artifact_bytes` + 1 MiB. Production sets `total_artifact_bytes` = CAD_MAX_TOTAL_BYTES = 10,485,760, so 11,534,336 B (11 MiB) per attempt. | production-budget.mjs:104 (`allowance = bytes + 1024**2`); packages/web/wrangler.rabbit-hole-prod.jsonc:72-73; control-plane/src/cad-jobs.js:431 (limits.totalBytes -> total_artifact_bytes) |
| Cap 2,147,483,648 (2 GiB) | OUR policy, set in three places: `MAXIMUM = 2 * 1024 ** 3` (production-budget.mjs:6, `productionConfig` rejects any larger value, :16-18), `CAD_PRODUCTION_MAX_BYTES = "2147483648"` (packages/cad-execute/fly.prod.toml:20), and the ledger file's own `maximum` field (must equal the env value or the executor refuses to start, production-budget.mjs:60-66). Source of the policy: "2 GiB conservative executor transfer reservations per month" (docs/features/cad-production.md:60; owner-authorised $35 infra plus $10 model per UTC month). | cited |
| Not a provider limit | The doc itself: "These are operating limits, not a Fly billing hard cap" (cad-production.md:60-64). Fly egress is about $0.02/GiB (cad-production.md:45), so 2 GiB is about $0.04. | cited |
| Not disk | The Fly volume `cad_budget` (1 GiB, vol_rkgoplxl3pqj3dk4, /var/cad/budget) only holds the ledger JSON, a 192-byte file (day-1021/cad/ledger-before.txt). Job scratch is ephemeral. | fly.prod.toml:22-27 |
| Not R2 | R2 artifact storage is separate: `CAD_MAX_TOTAL_BYTES` is also a per-job lifetime retained-storage cap (`reserveCadLifetimeBytes`, control-plane/src/cad-production-budget.js:138-141), feeding a USD infra gate, not this ledger. | cited |
| Month key | `new Date(ts).toISOString().slice(0,7)` (UTC). An attempt within 640 s of a month boundary reserves in both months. | production-budget.mjs:8-9,105-108 |
| Related, different budgets (do not conflate) | Control-plane model ledger: per job reserves the whole `CAD_MAX_USD` against `CAD_PRODUCTION_MONTHLY_MODEL_USD` = 10 (cad-production-budget.js:56-72; max 10 enforced at :13). Infra USD gate: `CAD_PRODUCTION_FIXED_INFRA_USD`, `_STORAGE_USD_PER_GB_MONTH`, `_SETUP_INFRA_USD`, `_SETUP_INFRA_MONTH` (all secrets on rabbit-hole-app, names confirmed present; values unreadable), projected against 35 USD (cad-production-budget.js:12-17,29-36). Their current projected totals could NOT be read. | cited |

"October transfer budget" in the audit = this ledger's 2026-10 entry. "Storage budget" in the health wording is a misnomer from the owner-facing summary; /health returns `budget:{mode:production,month,reservedBytes,reservations,maximumBytes}` (server.mjs:146).

## (2) Usage vs reservations (the 6)

Live /health, fetched 9:5x PM PT: `month 2026-10, reservedBytes 2,068,720,256, reservations 6, maximumBytes 2,147,483,648, busy false, admission true, image 3134c69a, capabilities [parameters]`. Remaining 78,763,392 B = 75.11 MiB.

The ledger stores ONLY month aggregates (`{reservedBytes, reservations}`) and `lastReservationAt` (production-budget.mjs:104-116). Reservation ids (`job_id:attempt`) are passed to `reserve(key, bytes)` but never stored, so a per-reservation list (ids, ages, state) does not exist on the executor. What can be derived exactly from the numbers:

| Reservation | Bytes | Share | Basis |
|---|---|---|---|
| 1 setup reservation (10-18 image-build traffic) | 2,011,048,576 (= 2,010,000,000 + 1 MiB) | 97.2% | 10-21 ledger 2,057,185,920 minus 4 x 11,534,336 = exactly 2,011,048,576; also matches /cad-controls/C2-report.md:54 ("The 10-18 setup reserved its image build traffic inside that ledger (2,011,048,576 bytes)"). Inference: there is no source record of the call that made it; I did not see the command. |
| 5 job attempts | 5 x 11,534,336 = 57,671,680 (55 MiB) | 2.8% | 4 existed on 10-21 03:19Z (lastReservationAt 1792552744442 = 2026-10-21T03:19:04Z, Oct 20 8:19 PM PT); the 6th (+11,534,336 exactly) arrived between 10-21 8:30 AM PT and now. Who/which board: unknown (job state is in the CadJobs Durable Object per board, not D1; reading it needs the owner API or CAD_DIAGNOSTIC_READ_TOKEN, which I did not use). |

Active vs stale: nothing is active (`busy:false`); there is no in-flight state. "Stale" is not a concept in this ledger: every reservation is permanent for its month by design ("Charge every redispatch and both possible months; no refunds or rollover reset", production-budget.mjs:115; `expired()` returns false :157; cad-production.md:37 "no refunds", "do not restore an old ledger without accounting reconciliation"). There is NO release/expiry/reconcile function in code (grep release/refund/reconcile: none). So nothing "failed to run": completed or failed attempts never release, and the 2.01 GB setup line was never going to.

Contradiction worth recording: cad-production.md:60 says "Registry/build traffic is separate from that ledger and must be included in infrastructure accounting", yet the production ledger carries a 2.01 GB build-traffic reservation. Whether Fly bills image push to its registry as executor egress is NOT verified by me (no billing data); the machine pulls from Fly's registry internally.

## (3) Capacity for review-first

Executor side: one review-first job = one executor build attempt = 11 MiB, identical to single-shot. Brief, source and review are control-plane model calls; the executor is dispatched once (cad-jobs.js:425-431). Extra attempts: each Quick edit rebuild (`parameters`), each STL/export, each explicit Retry or interrupted-dispatch retry adds 11 MiB (busy 429 does not: the busy check precedes `reserve`, server.mjs:160-164).

| Scenario | Remaining | Attempts of 11 MiB |
|---|---|---|
| Today, October as is | 78,763,392 B | 6 (7th would need 77 MiB, only 75.1 left) |
| After removing the setup line (reservedBytes -> 57,671,680, 5 reservations) | 2,089,811,968 B | 181 |
| After UTC rollover (Nov 1 00:00Z = Oct 31 5:00 PM PDT) | 2,147,483,648 B | 186 |

Model side (control plane), 3 calls vs 2:
- Per-call reservation ceilings (cad-model.js:62-66): interpretation max_tokens 4000, source 6000, review 1200; price $2/M in, $10/M out; hard per-call cap $0.10. C2 measured (real model, local run, not production): reservations about $0.18 per three-call job, actual spend $0.04-0.06 per full job (interpretation $0.005-0.032, generation $0.016-0.023, review $0.010-0.016) (/cad-controls/C2-report.md:170-175; worst-case brief $0.051, with 4 KB prompt and 12 KB context $0.081, :208-209; approved-generation call reserves $0.092-0.097, :233).
- `CAD_MAX_USD` 0.20 vs about 0.18 reserved: fits only with small context. With heavy context the sum can exceed 0.20 and the review call is refused after the user paid for generation; with `CAD_MAX_REPAIRS=0` there is no repair either way (cad-jobs.js:376 check; C2 F5). Two-call single-shot today: about $0.022 measured.
- Monthly $10 model line: the global ledger reserves the whole `limitUsd` per job (cad-production-budget.js:56-72): 50 jobs/month at 0.20; 33 at 0.30. Actual spend at $0.05/job would be about $2.50 for 50 jobs. The $10 cap is also enforced as a maximum in code (:13), so it cannot be raised without a code change.

## (4) Cheapest adequate remedy

Ranked. None changes a provider limit; the cap is ours.

1. Do nothing on the ledger and wait for rollover (cost: $0, risk: none, delay: until Oct 31 5:00 PM PDT, about 6 days). Automatic: new month key, fresh 2 GiB, 186 attempts. This is the only option with no production accounting edit.
2. Reconcile the October entry (cheapest way to unblock earlier). Prepared only, owner-authorised, not run:
   - What: set `months["2026-10"]` from `{reservedBytes: 2068720256, reservations: 6}` to `{reservedBytes: 57671680, reservations: 5}` in `/var/cad/budget/production.json` (and bump by 11,534,336 for any attempt that lands before the edit). Leave schema, identity, `maximum` and `lastReservationAt` untouched. Rationale: the 2,011,048,576 line is a build-traffic setup reservation that cad-production.md:60 says is not part of this ledger.
   - How (no existing function; uses the documented setup pattern, cad-production.md:86-87): the executor reads the file once at start (production-budget.mjs:47-56) and rewrites it from memory on each reserve, so the edit must happen while the server is NOT running: stop the machine (8e2570a74ed058, one machine, one volume), start it with the temporary `/bin/sleep` command as in setup step 3, `fly ssh` as cad-svc, back up the file (sha256 70869fa5... was the 10-21 value), write the edit atomically, verify JSON, restore the normal entrypoint, check /health shows 57,671,680 / 5. Needs Fly credentials and an owner decision; I cannot run it.
   - Spend: $0 incremental provider cost; the real exposure it re-opens is at most 2 GiB x $0.02/GiB = about $0.04 per month, already inside the authorised $35 infra line.
   - Downside: edits an append-only accounting ledger, against the doc's "no refunds" spirit; it needs an explicit owner reconciliation note and a receipt (before/after hash).
3. Raise our own cap: NOT cheap. 2 GiB is hard-coded (production-budget.mjs:6), the env value (fly.prod.toml:20) and the ledger `maximum` must all match, so it needs a code change, a new image build (cost $0.07-0.19, and the build itself was charged to the ledger last time), a machine update and a manual ledger `maximum` edit. Strictly worse than option 2. Not recommended; if ever wanted it is a priced owner decision (+1 GiB is about $0.02/month of real transfer).
4. Resize the executor / volume: irrelevant. Disk and volume are not the constraint (volume holds 192 bytes).

Verdict on November 1: not required. The cause is a configuration/accounting artifact (one 1.92 GiB setup reservation), not stale job reservations and not real traffic. October already has 6 attempts of room, enough for one bounded review-first acceptance job plus one rebuild, but flipping `CAD_BRIEF_FIRST` is global (no per-board scope today), so real users also draw on those 6 until Oct 31 5:00 PM PDT; exhaustion returns 429 `budget_exhausted`, pauses new CAD work and emails the owner (server.mjs:164; cad-production-budget.js:130-136). That is why option 2 or 1 is advisable before opening it to everyone.

## (5) What review-first needs beyond the budget

- Flag: `CAD_BRIEF_FIRST="true"` (packages/web/wrangler.rabbit-hole-prod.jsonc:76; read only as the string 'true', cad-jobs.js:183 sets `modelPhase:'brief'`). Plain vars; they ship with the next production release of rabbit-hole-app, so merging it to main and releasing flips it live for all users. `CAD_PRODUCTION_ENABLED` and `CAD_MODEL_ENABLED` are secrets (names present; values unreadable) and are not touched.
- Calls: `CAD_MAX_CALLS` "3" (wrangler.rabbit-hole-prod.jsonc:69); `CAD_MAX_REPAIRS` stays "0"; `CAD_MAX_USD` "0.20" works only for small context (priced owner decision: 0.30 raises the reserved ceiling per job, cuts monthly admissible jobs from 50 to 33, leaves real spend about $0.04-0.06/job and the $10 line unchanged; the $0.10 per-call cap in cad-model.js:66 is separate and also unchanged).
- Controls consumers: `brief.controls` only exists from the brief prompt (cad-model.js SYSTEM_BRIEF). Consumers: cad-jobs.js:31,197-199 (brief edits), :305-317 (rebuild), :430 (executor `parameters`), manifest `controls` bindings; UI: CadReview.jsx (+ask.jsx:1249, cad-review-view.js), cad-quick-edit.jsx / cad-quick-edit-model.js, cad-dimensions-overlay.jsx / cad-dimensions.js, cad-details.jsx, cad-parameters.js, cad-draft-store.js, focus-adapter-cad.js, generation-confirmation-schema.js:108. Executor already advertises `capabilities:["parameters"]` in production (image 3134c69a), so rebuilds are accepted.
- Browser coverage that exists: packages/web/e2e/cad-controls-check.mjs (scripted routes). Real production review-first behavior is unverified.
- Docs to update: docs/features/cad.md:95-96 ("Both are false"), cad-production.md (calls/usd), cad-production-activation.json ("CAD_MAX_CALLS": "2").

First candidate step for the integrator (two commits, so the flag flip is separable):
1. Commit A (inert, safe to release any time): `CAD_MAX_CALLS` "2" -> "3" in packages/web/wrangler.rabbit-hole-prod.jsonc. With `CAD_BRIEF_FIRST=false` and repairs 0 the third call is never used.
2. Commit B (the flip, held until O-5 GO and the capacity decision): `CAD_BRIEF_FIRST` "false" -> "true" in the same file.
3. Tests that pin them: add to packages/control-plane/test/rabbit-hole-prod-config.test.js (next to the CAD asserts at :72-79) `app.vars.CAD_MAX_CALLS === '3'`, `CAD_MAX_REPAIRS === '0'`, `CAD_MAX_USD` (the chosen value), `CAD_BRIEF_FIRST` (whatever the commit sets), and `CAD_MAX_CALLS >= 3 whenever CAD_BRIEF_FIRST === 'true'` as an invariant so the two can never diverge again; and in cad-controls.test.js a happy-path test with prod-like env `{CAD_MAX_CALLS:'3', CAD_MAX_USD:'0.20', CAD_MAX_REPAIRS:'0'}` asserting calls `['brief','source','review']` and state ready (the existing :296 test already pins the failing 2-call case and sets its own env, so it stays valid). Existing tests at cad-security-acceptance.test.js:52 pin the 2-call verification-scope pilot with explicit env, unaffected.
4. Update the three docs above. Run `npm test` in packages/control-plane once, singly (rule), push to rabbit-hole, read CI.
5. The one real production review-first job (about $0.04-0.06 actual, $0.18 reserved, 11 MiB) is a paid owner-GO step.

## Priced owner decisions (none made or run)

| Decision | Change | Price / effect |
|---|---|---|
| D1 Enable review-first (O-5 A) | `CAD_MAX_CALLS` 3, `CAD_BRIEF_FIRST` true | Per job actual +$0.00-0.03 vs single-shot (third call); reserve $0.18 of $0.20 |
| D2 Re-price per job | `CAD_MAX_USD` 0.20 -> 0.30 (optional) | No extra provider spend by itself; admissible jobs/month 50 -> 33 inside the unchanged $10 line |
| D3 Capacity | (a) wait for Oct 31 5 PM PDT, or (b) approve manual October ledger reconcile to 57,671,680 B / 5 reservations | (a) $0, (b) $0 plus owner sign-off on editing an append-only ledger; neither raises the 2 GiB policy |
| D4 Raising the 2 GiB cap | code + image + ledger edit | about $0.07-0.19 build, +$0.02/GiB-month transfer; not recommended |

## Could not verify

- How the 2,011,048,576 line was written and by whom (inferred from arithmetic and C2-report.md:54; no command record seen).
- Who made the 6th reservation (and any per-reservation ids/ages): not stored by the ledger; job state lives in the CadJobs DO.
- Whether Fly bills registry push as machine egress (no billing data), so whether the setup line was ever a real transfer.
- Values of CAD_PRODUCTION_ENABLED, CAD_MODEL_ENABLED, CAD_PRODUCTION_FIXED_INFRA_USD, STORAGE rate, SETUP amounts (secrets), hence current projected infra USD vs 35 and current month model reservation vs 10; a pause flag in the control-plane ledger could exist independently of the executor ledger.
- Whether any CAD_VERIFICATION_* scope vars are set in the deployed production Worker (not in the committed config; deployed vars not read).
- Production review-first behavior end to end (C2 numbers are from a LOCAL real-model run, not production).
- D1 has no CAD reservation/job table (grep of migrations: only 0024-learn-courses mentions cad), so no D1 SELECT was run.

## ETA (Pacific) for "CAD review-first ready for owner GO"

Definition: commit A and B prepared on a branch, tests pinned and green locally and in CI, docs updated, reconcile commands prepared, decisions D1-D3 listed. About 2 hours from start: 45 min edit and single local control-plane test run, 10 min push, 30-45 min CI (verify plus fast-e2e), 15 min receipts. If started at 10:00 PM PT Oct 25, ready by about 12:15 AM PT Oct 26 (assumes machine memory pressure does not stall the single test run; unknown CI queue). Production activation itself is not in that ETA: it follows GO, then either the reconcile (about 30 min, owner Fly credentials) or the rollover at 5:00 PM PDT Oct 31, then one paid production job.
