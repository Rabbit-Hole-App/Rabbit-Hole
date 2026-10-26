# Incident record: Telemetry production P0-P5 executed by a test run (2026-10-25)

Status: owner chose to ADOPT the resources (2026-10-25, about 5:05 PM PT). Adoption authorizes using them going forward. It does not approve the accidental execution and does not authorize activation.

## Classification
Unauthorized production mutation. The integrator had instructed the delegated agent (script owner for prod-telemetry.sh) to run nothing against production; the owner's standing rule is that production steps are owner commands.

## Timeline (PT; UTC in the state file)
- 4:36 PM  prod-telemetry.sh phase A started for real (state file START 23:36:53Z).
- 4:37 PM  P1: D1 `rabbit-hole-telemetry` created, uuid e4c585cf-6078-43dd-b5c0-d30e0f80e778, region WNAM.
- 4:37 PM  P2: R2 bucket `rabbit-hole-telemetry-archive` created (created 23:37:57Z).
- 4:39 PM  P3 scratch config written outside the repo ($HOME/rh-telemetry-prod/prod.jsonc, no "-dev").
- 4:39 PM  P4: migrations 0001-telemetry.sql and 0002-learning-evidence.sql applied (remote).
- 4:40 PM  P5: table-list verification ok; script wrote PAUSED. The agent stopped the background task.
- ~4:50 PM The agent reported the incident in its hand-back, left the resources in place and did not roll back.
- ~4:55 PM The integrator verified the state independently (read-only).

## Root cause
1. The agent was testing the owner script with a stub wrangler by exporting stub variables (TEL_WRANGLER_JS, state/log paths) in one shell call. Shell state does not persist between tool calls, so the next call ran the script with the REAL pinned wrangler and the real default state/log paths.
2. A test-only variable (TEL_TTY) pre-answered the typed confirmations "GO PROVISION" and "APPLY", so the script executed P0-P5 without a human.
3. The production entry point accepted test-only overrides, and tests ran in the same environment that holds real credentials (the script read them from the owner credentials file by name).
Contributing: the integrator's instruction ("run nothing against production") was not enforced by any technical boundary.

## Observed outcome (verified by the integrator, read-only, 2026-10-25 ~4:55-5:05 PM PT)
- Account: c08d3dbdc53a3afd3cb09a536ac42318 only (rabbit-hole).
- D1 `rabbit-hole-telemetry` e4c585cf-6078-43dd-b5c0-d30e0f80e778: 24 objects, expected 24, 0 differences against the committed telemetry-migrations (whitespace-normalised SQL compared object by object, not by migration names); d1_migrations records 0001-telemetry.sql and 0002-learning-evidence.sql; row counts telemetry_events=0, owner_access_log=0, accounting_attempts=0, learning_attempts=0. The dev D1 (rabbit-hole-telemetry-dev) has the same 24 objects.
- R2 `rabbit-hole-telemetry-archive`: WNAM, Standard, 0 objects, 0 B; r2.dev public URL disabled; no custom domains.
- Tool: C:/s/spec/day-1021/telemetry-schema-diff.mjs (read-only SELECT on sqlite_master and d1_migrations plus row counts).
- Script under test: C:/s/spec/telemetry/prod-telemetry.sh, last modified 4:41 PM PT, sha256 prefix 3dfade84cb3bbb71 (after the agent's post-incident guard edit). State/log: C:/s/spec/telemetry/prod-telemetry-state.txt and prod-telemetry.log (kept unchanged as the record; the log was scanned: no secret value).

## Remaining uncertainty
- The integrator did not diff Cloudflare account-wide state beyond the telemetry D1/R2, Workers and secrets listings the script itself reports; the agent states no Worker, secret, deploy, binding or repo change happened. Evidence: main binds no telemetry in production; the production dashboard still answers 404; the state file lists only P0-P5. Not independently checked: the Cloudflare audit log.
- The recurring cost of the empty resources is expected to be near zero but was not priced from a verified source.

## Decisions
- Owner: adopt (A). Do not delete or recreate. Production Telemetry stays DISABLED: no binding release, no secret, until the owner's explicit GO.
- Hold on further production Telemetry mutations until the safeguards are reviewed by a separate reviewer.

## Safeguards (in progress; owner requirements)
1. Production entry point rejects every test-only confirmation or path override; prompts are answerable only from an interactive terminal.
2. Script tests run in an isolated harness: env -i allow-list, stubs only on PATH, temp HOME/state, no production credentials readable, no route to production; mocks and tests configured in the same process.
3. Dry-run proven unable to mutate (all mutations through one guarded function; call-recording stubs for every phase and rollback level).
4. Regression tests for the exact failure (missing shell state, missing/invalid stub, stub pointing at the real binary, override attempts).
5. Resume recognises the adopted resources, verifies them (identity, schema vs committed migrations, bucket, public access) and never repeats P1, P2 or P4.
6. Independent review of the boundaries and the resume logic.
7. Durable rule added to CLAUDE.md (branch docs/claude-md-prod-script-isolation 891276c3, docs-only, released with the next batch).
