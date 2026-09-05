# v14 — Watch: the nightly pass (2026-09-05)

Notices what a person wouldn't: stale apps, silent schedules, drifting
secrets. SQL plus a few model calls, not an agent loop.

Every night at 03:00 UTC a Worker cron writes one **baselines** row per app
per day — median run duration (last 20 runs), request rate, last
request/run/deploy, consecutive failures — then runs a fixed list of checks
against it. request_logs only keeps 7 days, so baselines carry the long
memory forward.

| check | fires when |
|---|---|
| schedule_missed | job has a schedule, no run in 2× the expected interval |
| run_slow | last run > 3× median (guarded to ≥5 finished runs) |
| run_failing | 3 consecutive non-zero exits |
| server_silent | zero requests in 14 days, previously > 1/day |
| never_opened | deployed 7+ days ago, zero requests ever |
| secret_drift | review lists an undeclared secret |
| stale_deploy | public repo HEAD 20+ commits ahead of the deployed SHA |
| access_unused | a shared member with no requests in 60 days |

Each finding is one **observation** — evidence JSON (run ids, names,
counts), first/last seen, and a single model-written sentence for *new*
observations only (refires bump `last_seen`, never re-charge the model; a
check that stops firing resolves the row). The first live pass immediately
caught a real one: yolo-lambda's review lists `WEIGHTS_BUCKET`/`WEIGHTS_KEY`
as undeclared.

Surfaces: a 🔔 Notifications bell in the sidebar (badge clears on open, rows
click through to the app, Dismiss ▾ 30 days / forever), quiet warn rows on
the app page, a Watch count column on /apps, `small watch [app]` in the CLI,
and a Monday 08:00 UTC plain-text email per owner via Resend
(`org_settings.notify_weekly`, default on). Dismissed observations vanish
from every surface until they expire.

- ponytail: checks.enabled is global — an org column when per-org config ships.
- ponytail: `stale_deploy` uses GitHub's unauthenticated compare API and
  skips silently on rate limit.
- ponytail: no Slack-only delivery here — see v15; no anomaly detection
  beyond the fixed list.

Details: `docs/features/web.md` §v14, unit tests in
`packages/control-plane/test/watch.test.js`.
