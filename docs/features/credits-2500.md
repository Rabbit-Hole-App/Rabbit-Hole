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
**Cutover boundary** (the same in dev, prod and integ-local: 25 / 50 / `2026-11`). A month before `AI_ALLOWANCE_CUTOVER_PERIOD`
is granted `AI_LEGACY_ALLOWANCE_USD` to an account with recorded usage, so **2026-10 is the last 5,000-credit month** and
**2,500-credit grants start with 2026-11, at 2026-11-01 00:00 UTC**. An account with no recorded usage, and every new account,
gets 2,500 in every month (owner 2026-10-23: no account-creation plumbing; missing history is not proof that nothing happened,
so usage and grants already made are never changed). Rows in `usage_grants` made before the cutover keep their amount.

## One price registry

`packages/control-plane/src/pricing-registry.js`, keyed by provider, exact model, billing category and tier, versioned by
`PRICE_VERSION`. Every row carries its `source` and, for an official page, the `retrieved` date. Status: `verified` (an official
provider page or the owner's table), `estimate` (a published approximation, basis in `note`) or `unverified` (kept, no official
figure retrievable). A category without a row prices as unknown (null), never zero.

Official sources read 2026-10-23: Anthropic pricing (`platform.claude.com/docs/en/about-claude/pricing`) for input, output,
5-minute and 1-hour cache writes and cache reads of Opus 5.5, Opus 5, Sonnet 5.5, Sonnet 5 and Haiku 4.5 (Opus 5.5 and Sonnet
5.5 reads are 0.05x input; Sonnet 5.5 was $0.20 until 2026-10-07); Anthropic fast mode (`.../build-with-claude/fast-mode`): Opus
5.5 $8/$40, Opus 5 $10/$50, caching multipliers applied on top; OpenAI pricing (`developers.openai.com/api/docs/pricing`):
GPT-4.1 mini cached input $0.10, gpt-4o-transcribe "estimated $0.006 / minute" (billed $2.50 / $10 per million tokens),
gpt-image-1 not listed; Exa (`exa.ai/pricing`): `auto` search $7 per 1,000 requests up to 10 results. Still not verified:
Bedrock Opus 5.5 (AWS publishes no retrievable table; reached only by an organisation's own AI, never a person's credits).
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

## What fixtures cannot prove (verify on the dev D1, read-only)

Every test is deterministic and runs on in-memory SQLite behind a D1-shaped wrapper (`credits-2500.test.js`): concurrent first
admissions making one grant, the UTC month boundary, usage retained across the transition, cross-month jobs, refunds and duplicate
settlement are all fixture-only until observed on the real D1. Read-only queries:

```sql
SELECT name FROM sqlite_master WHERE name IN ('usage_grants', 'usage_attempt_detail') ORDER BY name;
SELECT user_id, period, COUNT(*) AS n FROM usage_grants GROUP BY user_id, period HAVING n > 1;  -- expect no rows
SELECT period, source, allowance_micros, COUNT(*) AS accounts FROM usage_grants GROUP BY 1, 2, 3 ORDER BY 1, 2;
SELECT g.user_id FROM usage_grants g WHERE g.source = 'legacy_transition'
  AND NOT EXISTS (SELECT 1 FROM usage_actions a WHERE a.user_id = g.user_id);  -- expect no rows
SELECT a.period, COUNT(*) AS attempts, SUM(CASE WHEN t.cost_state = 'settled' THEN t.cost_micros END) AS settled_micros
  FROM usage_actions a JOIN usage_attempts t ON t.action_id = a.action_id GROUP BY a.period ORDER BY a.period;  -- unchanged by the release
SELECT price_version, tier, COUNT(*) AS attempts FROM usage_attempt_detail GROUP BY 1, 2;
SELECT COUNT(*) AS cross_month_jobs FROM usage_attempts t JOIN usage_actions a ON a.action_id = t.action_id
  WHERE strftime('%Y-%m', t.started_at, 'unixepoch') <> a.period;
```
