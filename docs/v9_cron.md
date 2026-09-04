# v9 — cron: jobs with a schedule run themselves (2026-09-04)

A job can now carry a 5-field cron expression and the control plane starts it
on time — no laptop, no external scheduler:

```toml
kind = "job"
schedule = "0 9 * * 1-5"      # standard 5-field cron, UTC
```

**Status: code complete and merged-ready, but scheduled runs do not fire in
production — Cloudflare is not delivering cron ticks to the worker. See
"Not working" below. Everything up to the tick is verified live.**

## How it runs

1. `small deploy` sends `schedule` with the deploy call. The control plane
   validates it (`packages/control-plane/src/cron.js` — parser supports `*`,
   lists, ranges, steps; no seconds, no `@daily`, UTC only) and rejects a bad
   expression at deploy time with a one-line fix. A syntactically valid
   expression that never fires ("0 0 30 2 *") is also rejected — `nextRun`
   scans 4 years ahead and throws. The deploy response carries the computed
   next run, and the CLI prints:

   ```
   ✓ schedule: 0 9 * * 1-5 (UTC) · next run 2026-09-08 09:00
   ```

2. `wrangler.jsonc` registers a Workers cron trigger firing every minute. The
   `scheduled()` handler in `src/index.js` queries D1 for due jobs
   (`kind = 'job'`, schedule set, not paused, image registered), floors
   `event.scheduledTime` to the minute, and matches it against each
   expression. `last_scheduled_at` on the app pins every fired minute, so a
   duplicate or late-delivered tick never double-fires.
3. Overlap protection: if a run for that job is still `running` when the tick
   matches, no machine starts — a run row is written with
   `status = 'skipped'`, `reason = 'previous run still active'`, and
   `started_by = 'cron'`. Cron never starts a second concurrent run.
4. Machine start is the same path as `small run`: manual and cron runs share
   `startRun()`. Cron runs get `SMALL_USER=cron` and `SMALL_TRIGGER=cron` in
   the machine env so the script can tell. `runner.py` unchanged — the child
   process inherits the env. The worker's own URL for `SMALL_API` comes from
   a new `BASE_URL` var (a scheduled event has no request URL to derive it
   from).
5. `small schedule pause [app]` / `small schedule resume [app]` flip
   `schedule_paused` via `POST /api/schedule`; the schedule field itself is
   kept. `small runs` shows cron runs with a `⏱ cron` marker and prints the
   skip reason on skipped rows.
6. Schema (migration `0002-cron.sql`, applied to the live D1):
   `apps.schedule`, `apps.schedule_paused`, `apps.last_scheduled_at`,
   `runs.reason`.

## Tests

- Unit (`tests/unit_tests/packages/control_plane/test_cron.py`): ten
  expressions with known next-run times (leap day, weekend rollover, the
  dom-OR-dow rule of standard cron) plus four rejects, running the real
  `cron.js` through node. 14 pass.
- Integration (`tests/.../s3-log-writer/test_cron.py`): deploys the example
  under its own app name (`s3-log-writer-cron`) with `schedule = "* * * * *"`,
  waits out a tick, asserts a finished cron run and the result JSON in S3
  with `user == "cron"`; then swaps the job for a 120-second sleep and
  asserts a skipped row appears. Teardown pauses the schedule.
- Suite state: 19 unit + 15 non-cron integration green. The two cron
  integration tests are written and correct but blocked on the platform
  issue below — they pass unchanged the day ticks flow.

## Bugs found while landing this (all fixed)

- `SMALL_BIN=$(which small)` under git-bash hands Python a bash shim, and
  `subprocess.CreateProcess` dies with `WinError 193` on every test. The pin
  must be the npm `.cmd` shim (`%APPDATA%\npm\small.cmd`).
- The integration test appended `schedule = ...` to the end of the copied
  `small.toml`. The file ends inside `[secrets]`, so the key landed in that
  section, the CLI saw no top-level schedule, and the worker stored NULL —
  deploy printed nothing and cron had nothing to fire. Keys added by tests
  must be prepended (fix in `7de2dc9`).
- Process note: piping the suite through `| tail` swallows pytest's
  per-test progress and the failure tracebacks; run it unpiped with `-v`
  when the run is long enough to want a heartbeat.

## Not working: Cloudflare does not deliver the cron ticks

The trigger deploys cleanly, and every layer on our side checks out:

- `wrangler deploy` registers it (`schedule: * * * * *` in the deploy
  output), and `wrangler versions view` confirms the upload exposes
  `Handlers: fetch, scheduled`.
- The dashboard (Workers → small-cp → Settings → Trigger events) shows the
  cron row with a populated "Next" time.
- The scheduled handler is correct — locally it parses, matches, and stamps.

And yet: zero scheduled invocations, ever. `wrangler tail` across minute
boundaries shows no events, `last_scheduled_at` never moves, the dashboard's
"Runs" stays empty, all while `fetch` traffic works normally. Registered,
queued, never dispatched — on the fourth re-registration as much as the
first.

This exact fingerprint is a documented, ongoing Cloudflare platform issue
with a stream of community reports from July–September 2026, several on new
accounts like this D1's (created 2026-09-04):

- https://community.cloudflare.com/t/cron-triggers-configured-and-listed-by-schedules-but-never-fire-new-account-2026/922869
- https://community.cloudflare.com/t/workers-cron-trigger-deployed-successfully-but-no-scheduled-events-are-delivered/954659
- https://community.cloudflare.com/t/cron-triggers-silently-stop-firing-no-error-no-log-redeploy-doesnt-restore/937267

Nothing in this repo can cause or fix it. Options:

1. Support ticket with the evidence above (account `70211afe…`, worker
   `small-cp`).
2. Interim workaround if waiting is not acceptable: an authenticated
   `/api/cron-tick` endpoint calling the same scheduler logic, pinged every
   minute by an external clock (GitHub Actions schedule, uptime monitor).
   ~10 lines; the Workers trigger stays registered for when Cloudflare
   heals.

Current live state: worker deployed with the cron code, D1 migrated, the
test app `s3-log-writer-cron` has `schedule = "* * * * *"` stored but
**paused**, so nothing fires behind anyone's back if Cloudflare silently
recovers. Resume with `small schedule resume s3-log-writer-cron`.

## Deliberately skipped (ponytail-marked)

- Timezones and `@daily`-style aliases (`cron.js`) — UTC and 5 fields only.
- Catch-up runs after control-plane downtime (`scheduled()`) — a missed
  minute is just missed.
- Stale-run detection (`scheduled()`) — a run whose machine died before
  posting an exit code stays `running` and blocks cron forever; add a
  max-age cutoff when it bites.
- Retries and jitter — not in the spec.
