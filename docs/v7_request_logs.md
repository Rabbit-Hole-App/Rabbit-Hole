# v7 — request logs: `small logs` shows traffic, not just machine state (2026-09-04)

Every request through the guard is now logged: one JSON line on stdout, batched
to the control plane, stored 7 days in D1, and read back by `small logs` as
`09:41:02 GET /click 302 14ms alice@acme.com`. Requests the guard rejected with
403 appear as their own lines with no user — direct fly.dev hits are visible.
Paths only; query strings and bodies are never logged.

## How it runs

1. **Guard** (`packages/runtime/guard.py`): after each proxied request
   completes, `_log()` prints one JSON object per line to stdout — ISO `ts`,
   `method`, `path` (query string stripped), upstream `status`, `ms`, and
   `user` from the `X-Small-User` header the wall injects. Rejected requests
   log `"rejected": true` and no user instead. SSE streams log when the stream
   ends; websockets when the tunnel closes.
2. A daemon thread batches the same lines to the control plane — every 2
   seconds or 50 lines, whichever comes first (an `Event` wakes the loop
   early). Auth is the proxy secret the guard already holds, as the bearer
   token. `User-Agent: small-guard` — the default Python UA trips Cloudflare
   bot blocking (error 1010). A failed POST drops the batch with a note on
   stderr; the queue never grows unbounded.
3. **Control plane**: `request_logs` table (`org, slug, ts, method, path,
   status, ms, user` + `id` for cursor ordering) in `schema.sql` and
   `migrations/0002-request-logs.sql` (additive, safe on the live DB).
   - `POST /api/apps/<slug>/request-log` — guard auth by proxy secret; the
     slug in the URL must match the app the secret resolves to. Batch insert,
     capped at 500 lines per call.
   - `GET /api/request-logs` — CLI auth + `canView`. Without `after`: last
     100 rows, newest first. With `after=<id>`: ascending, up to 1000 — the
     `--follow` cursor. Filters: `user=` exact, `status=` either `5xx`-style
     class or an exact number, both applied in SQL.
   - A Worker cron (`triggers.crons`, daily 03:00) deletes rows older than 7
     days. The cutoff is formatted with a `T` (`strftime('%Y-%m-%dT%H:%M:%S')`)
     so it string-compares correctly against the guard's ISO timestamps.
4. **CLI** (`packages/cli/bin/small.js`):
   - `small logs [app]` — last 100 request lines, newest first. Rejected
     lines end at `ms` with no email.
   - `--follow` — prints the last 100 oldest-first, then polls every second
     with the id cursor.
   - `--machine` — the old `flyctl logs` machine-state output.
   - `--user alice@acme.com`, `--status 5xx` (or `--status 404`).
   - Run-id form (`small logs r-…`) unchanged — job logs are separate.
5. **Deploy plumbing** (the one line outside the feature's files): deploy now
   sets a `SMALL_LOG_URL` secret — `<api>/api/apps/<name>/request-log` — so
   the guard knows where to POST. `SMALL_CP_URL` semantics are untouched; it
   still gates only the AWS-creds bootstrap. Old images without
   `SMALL_LOG_URL` keep logging to stdout and skip the POST loop.

## Tests

- `tests/unit_tests/packages/runtime/test_guard_logs.py` — guard + stdlib
  echo server: asserts the JSON line shape, query-string stripping, user
  passthrough, and the rejected-403 line. Passes (unit suite 6/6).
- `tests/integration_tests/examples/counter/test_app.py::test_request_logs` —
  two clicks as user A, one as user B (nonce-unique emails so the run's lines
  are unambiguous), one direct fly.dev origin hit; polls `small logs` until
  the three `POST /inc 303` lines with the right users and one 403 line with
  no user appear, then checks the `--user` filter returns exactly A's two.
- CLI node tests 18/18 and control-plane tests 6/6 still green.

## Issues hit

1. **Windows file-handle lock in the unit test:** the guard's echo child is
   orphaned by `guard.terminate()` and inherits the redirected-stdout handle,
   so deleting the capture file raised `PermissionError` (WinError 32).
   Rewrote the test to read exactly three lines from a stdout pipe instead of
   a temp file — deterministic because each request flushes one line.

## Ceilings (ponytail)

- Websocket lines assume status 101 — the guard tunnels raw bytes and never
  parses the app's reply (marked in `guard.py`).
- A failed log POST drops the batch (stderr note); no retry/spool.
- Retention fixed at 7 days — per-app column when someone needs it (marked in
  `index.js`).
- No log search — `user`/`status` filters only (marked in `index.js`).
- No export — pipe stdout to a file until a `--json` flag is asked for
  (marked in `small.js`).
- `--follow` polls at 1s; no streaming.

## Current state

- Implemented on `feature/request-logs`; unit + node suites green.
- **Integration not yet run** — it needs the D1 migration applied and the
  live worker redeployed with the new routes, and the one live `small-cp`
  serves all four worktrees, so deploying from this branch alone risks
  regressing in-flight features from the others. Merge/deploy is the gate;
  run `make test-integration` after.
- Not merged, not published.
