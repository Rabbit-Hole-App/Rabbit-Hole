# Beta spend caps: what warns, what enforces

**Owner:** Home (provider ceilings, alerts, the platform cap's configuration, the `usage_operations` schema). The
app-side limiter (`metered()`, concurrency, `op_id` replay, deadlines, paid-media admission) is the Spend lane's
(Parallel, branch `fix/beta-spend-admission`), reviewed by Home. Status 2026-10-09: prepared; three values wait for the
owner.

Two kinds of control, never confused:
- **Warnings** tell someone; nothing stops. A warning that fires does not mean spend stopped.
- **Enforced limits** refuse the next request. Only these bound the bill.

## Layers

| Layer | Kind | Where | Value | State |
|---|---|---|---|---|
| Anthropic workspace spend limit (the workspace in `ANTHROPIC_WORKSPACE_ID`, sent on every model call by `ask.js` and `review.js`) | **enforced** by Anthropic: calls fail once the month's limit is reached | Anthropic Console, Workspaces, Limits | **owner to choose** | unknown: Home has no Admin API key and asks for none |
| Anthropic spend notification | warning (email) | Anthropic Console, Limits, notifications | owner to choose, below the limit | unknown |
| Platform daily cost cap (`USAGE_PLATFORM_DAY_USD`) | **enforced** by the app: `metered()` refuses admission once the day's settled `cost_usd` reaches it; unset means paid admission is refused | Worker variable on `rabbit-hole-app` (production) and the preview | **owner to choose**, below the workspace limit / 30 | schema applied on learn-dev (0016, 2026-10-09); code in the Spend lane (r36) |
| Platform daily operation cap (`USAGE_PLATFORM_DAY`) | **enforced** by the app: a runaway guard on the number of operations, apart from cost | same | 2000 a day (placeholder for the owner-only beta) | Spend lane |
| Per-person caps | **enforced** by the app | `metered()`, one admission per operation | 60 an hour, 300 a day to start (the Next Steps values, `NEXT_STEPS_CAPS`); 3 in flight; paid media its own hour/day cap | Spend lane |
| Existing count caps | **enforced** by the app (`admitUsage`, `shared_ask_events`) | `SHARED_ASK_LIMITS` 20/60 per viewer, 60/300 per share; `NEXT_STEPS_CAPS` 60/300 | unchanged | live |
| Approved evaluation budgets | **enforced** by the harness (`createLedger`): a run stops at its ceiling | `tests/evals/tutor-session/run.mjs` | `RUN_USD = 4`, `SESSION_USD = 1.3` | **unchanged** (owner: keep the approved budgets) |
| Cloudflare billing | warning only (notifications); Workers Paid has no hard spend stop | Cloudflare dashboard, Notifications, Billing | owner to choose | unknown: the release token cannot read alert policies (403) |

## Order the values must keep

`USAGE_PLATFORM_DAY_USD × 30 < Anthropic workspace monthly limit`, so the app refuses before Anthropic does: a learner sees
the app's "the platform has reached today's limit" message, never a provider failure in the middle of an operation. The
Anthropic notification sits below the workspace limit so the owner hears before anything is refused.

## What the owner sets (Home cannot)

1. The Anthropic workspace monthly spend limit and its notification threshold, in the Anthropic Console.
2. The platform daily cost cap (`USAGE_PLATFORM_DAY_USD`): one number, in US dollars. Only priced models count toward it; an unpriced model's operations still count toward the operation cap. Home then sets it on the preview and prepares it for production
   with the release that carries `metered()`.
3. Optionally, Cloudflare billing notifications (a warning only).

Until the platform cap is set, `metered()` must refuse to admit a paid operation rather than admit without a cap
(the same fail-closed rule as `admitUsage`, where a missing cap throws). The Spend lane's review checks this.
