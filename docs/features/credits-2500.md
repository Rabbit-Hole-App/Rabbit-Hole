# Monthly AI credits: 2,500 every month (owner brief 2026-10-23)

People see AI credits only. Accounting is integer micro-USD underneath: $1 = 100 credits, 1 credit = $0.01 = 10,000 micros.
The monthly allowance is 25,000,000 micros = 2,500 credits, one per account, shared by every canvas, device and feature.

## One entitlement

`packages/control-plane/src/learn-entitlement.js` `allowanceFor(db, env, userId, period, { create })` is the only place an
allowance is decided. `GET /api/learn/usage` reads it without writing; admission (`admissionPayer`, so `admitSpend`,
`allowanceFirst`, Explain generation) reads it and writes the grant. A grant is a row in `usage_grants` (migration 0027) made on
the first admission of a UTC month and never lowered: raising `AI_MONTHLY_ALLOWANCE_USD` raises it (the larger applies), lowering
never takes away what was granted. Renewal is computed from the month boundary on demand: no timer, no onboarding task.
Logging in again, another device or a linked sign-in provider reaches the same `users.id`, so the same row.

Settings (wrangler vars, `packages/web/wrangler.*.jsonc`, `scripts/ci/config/integ-local.jsonc`):

| var | value | meaning |
| --- | --- | --- |
| `AI_MONTHLY_ALLOWANCE_USD` | `25` | the default every account is granted each month (2,500 credits) |
| `AI_LEGACY_ALLOWANCE_USD` | `50` | what an account with earlier AI usage keeps for the months before the cutover |
| `AI_ALLOWANCE_CUTOVER_PERIOD` | `2026-11` | the first UTC month that gets the default for everyone |

Invalid values are never unlimited: an invalid default refuses chargeable AI; an invalid transition means no transition.
Existing accounts keep their current month (5,000 credits through October) and move to 2,500 on November 1. Limit: an
account that never used AI before the cutover has no history here and gets 2,500 for the cutover month's remainder (it loses no
usage). A new account always gets 2,500 at once.

## One price registry

`packages/control-plane/src/pricing-registry.js`, keyed by provider, exact model, billing category and tier, versioned by
`PRICE_VERSION`. Rows are `verified` (the owner's table, standard API rates read 2026-10-23), `approximate`, or `unverified`
(a value the repo carried before; kept, never invented). A category without a row prices as unknown (null), never zero.
Anthropic `output_tokens` includes thinking and `input_tokens` excludes cache tokens, so nothing is counted twice. Image models
are priced per modality; there is no per-image price. `learn-models.js` `MODEL_PRICES` and `costUsd`, `learn-spend.js`,
`learn-usage-estimates.js`, Fish, JEV and the Exa estimate read it.

## What is recorded per charge (stable interface for observers)

| what | where |
| --- | --- |
| action id, attempt id | `usage_actions.action_id`, `usage_attempts.attempt_id` (= `usage_operations.op_id` through the ledger) |
| accounting period, payer, charge class | `usage_actions.period` (`YYYY-MM`, UTC, fixed when admitted), `payer`, `charge_class` |
| served model, provider | `usage_attempts.model`, `usage_attempts.provider` |
| reserved maximum | `usage_attempts.reserved_micros` |
| measured cost / estimate / unknown | `usage_attempts.cost_micros` with `cost_state` (`settled` measured, `estimated`, `unknown` = NULL, `reserved` in flight) |
| settlement status | `usage_attempts.status`, `usage_actions.status`, `result` |
| price version, tier, billable quantities, unverified rates | `usage_attempt_detail.price_version`, `tier`, `quantities` (JSON by category), `unverified` (JSON) |
| refunded | `usage_attempt_detail.refunded_micros`, `refunded_at`, `refund_reason`; audit line in `usage_adjustments` (negative micros) |
| released | a reservation is released when its attempt leaves `reserved`/`unknown` (`reserved_micros` stays as the recorded maximum) |
| grants | `usage_grants (user_id, period, allowance_micros, source, granted_at)` |

Missing usage or cost stays missing: `cost_micros` NULL / absent `quantities` keys are never 0.

## Not covered

- Voice Scribe: the browser streams the microphone straight to the provider; the server sees only the token mint (15 minute
  token), so session duration is not observed and its cost is recorded `unknown`. Metering needs a server-observed duration.
- `refundAttempt` is the mechanism; no failure path calls it yet. Platform-funded work (practice grading, tutor evaluation,
  renderer compute, webpage screening) stays recorded apart and never in the user's balance.
