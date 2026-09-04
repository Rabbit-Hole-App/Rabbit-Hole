# v5 — jobs: `small run` (2026-09-03)

Apps can now be one-shot scripts instead of servers: `kind = "job"` in
`small.toml`. `small deploy` builds and registers the image but starts
nothing; `small run` starts a machine per run, streams its logs live to the
terminal, and exits with the job's exit code. Every run is attributed to the
person who started it.

## How it runs

1. `small.toml` gains `kind = "job"` (default `"server"`). Job entries are
   plain scripts (`framework = "script"`), no port, no login wall.
2. `small deploy` on a job builds the image via the normal Fly remote build
   and registers it on the app row (`apps.image`), then prints
   `✓ built <name> — start it with: small run <name>`. No machine starts at
   deploy time.
3. Job images wrap the entry in `runner.py` instead of `guard.py`
   (`packages/runtime/runner.py`, stdlib only). It runs the command with
   stderr merged into stdout (one ordered stream), buffers lines, flushes a
   batch every second to `POST /api/runs/<run_id>/log`, then POSTs the exit
   code and exits with it. Log POSTs authenticate with a per-run bearer token
   and retry 3× (0/1/5 s) before dropping the batch — a log hiccup never
   kills the job.
4. `small run <app>`: CLI POSTs `/api/runs`. The worker inserts a `runs` row
   (`run_id`, `started_by` = the caller's email), then starts a Fly machine
   from the registered image using `FLY_ORG_TOKEN`, injecting `SMALL_API`,
   `SMALL_RUN_ID`, `SMALL_RUN_TOKEN`, and `SMALL_USER` (the starter's email —
   the job can attribute its own output). If the machine start fails the run
   is marked `failed` immediately.
5. The CLI polls `GET /api/runs/<run_id>?after=<cursor>`, printing new lines
   by `seq` until `status != running`, then prints
   `✓ finished (exit 0)` / `✗ failed (exit N)` and mirrors the exit code.
6. D1 migration `0001-jobs.sql`: `apps.kind`, `apps.image`, plus `runs`
   (status, exit_code, started_by, started_at, finished_at) and `run_logs`
   (run_id, seq, line) tables.

## Output surfaces

- `small run <app>` — live log stream, exit code mirrored to the shell.
- `small runs <app>` — history: `run_id  status  duration  started_by  started_at`.
- `small logs r-<id>` — full replay of one run (the `r-` prefix routes
  `small logs` to run logs instead of app logs).

## Example

`examples/s3-log-writer` — `pipeline.py` prints 5 steps and writes
`runs/<run_id>.json` (including `user` from `SMALL_USER`) to S3. Declares
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` as required secrets.

## Tests

- `tests/unit_tests/packages/runtime/test_runner.py` — batching, exit-code
  POST, retry/drop behavior.
- `packages/cli/test/cli.test.js` — job deploy path, run/runs/logs commands.
- `tests/integration_tests/examples/s3-log-writer/test_app.py` — full live
  run; module-skips unless the repo `.env` has the AWS keys + `S3_BUCKET`.
  Pins the worktree CLI via `SMALL_BIN` (the global `small` may be older).

## Issues hit

1. **Cloudflare bot block 1010 on log POSTs.** The default `Python-urllib/3.x`
   User-Agent is rejected by Cloudflare in front of the worker — every log
   batch 403'd silently. Fix: `User-Agent: small-runner` on every request,
   and dropped batches now surface on the runner's own stderr (platform
   console), never into the captured child stream. Rule captured in memory:
   any stdlib-Python caller of small-cp needs a custom UA.
2. Windows Makefile leak: `2>NUL` inside a bash-run Makefile creates a file
   named `NUL`; use `2>/dev/null`.
3. Machine starts use the stored `FLY_ORG_TOKEN` (merged from main's
   stored-fly-tokens work) — the CLI never sees a Fly token, unchanged.

## Ceilings (ponytail)

- Log shipping: 3 retries then the batch drops (stderr-visible); no durable
  spool. Add a disk spool if jobs ever emit must-not-lose audit lines.
- One machine per run, no concurrency cap, no timeout kill — a hung job runs
  until Fly reaps it. Add a max-runtime guard when someone ships one.
- No scheduling — `small run` is manual. Cron is its own future feature.

## Current state

- Merged to main (merge `3adafff`, fixes `7f9f105`), live worker deployed,
  D1 migrated (`runs`/`run_logs` present on remote).
- **Verified live end to end:** `small run s3-log-writer` streamed run
  `r-4ec8aacee66c` (5 steps, exit 0); boto3 confirmed
  `s3://…/runs/r-4ec8aacee66c.json` contains
  `{"run_id": "r-4ec8aacee66c", "user": "yudhisteer.chin@gmail.com"}` —
  attribution wired through.
- npm publish still pending (main is 0.0.7, unpublished); global `small`
  reinstalled from local merged main.
