# Monthly AI credits: 2,500 every month (owner brief 2026-10-23)

People see AI credits only. Accounting is integer micro-USD underneath: $1 = 100 credits, 1 credit = $0.01 = 10,000 micros.
The monthly allowance is 25,000,000 micros = 2,500 credits, one per account, shared by every canvas, device and feature.

## Product direction

This page describes what is implemented now: one flat monthly allowance of 2,500 credits per account, nothing else. It is not a permanent product rule. The decided direction is a Free and a Plus plan, Pro removed, Teams later; subscription prices and the billing implementation are undecided, so none is built or specified here, and this document states no price.

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

What each account is granted (six cases, each tested in `credits-2500.test.js`, "what each account is granted either side of the cutover"). Usage means chargeable AI work: a free action such as practice grading is recorded with the user id but does not count, so a new account that did one before its first AI request is still a new account. A grant already made and any recorded usage are never rewritten; the test snapshots them before the cutover and compares after.

| # | Account | Month | Grant | `usage_grants.source` |
| --- | --- | --- | --- | --- |
| 1 | New account | 2026-10 | 2,500 credits | `default` |
| 2 | Existing account with recorded usage | 2026-10 | 5,000 credits | `legacy_transition` |
| 3 | Existing account with no usage history | 2026-10 | 2,500 credits | `default` |
| 4 | New account | 2026-11 or later | 2,500 credits | `default` |
| 5 | Existing account with usage | 2026-11 or later | 2,500 credits | `default` |
| 6 | Existing account with no usage history | 2026-11 or later | 2,500 credits | `default` |

**Renewal time.** The reset instant is the start of a UTC month: 2026-11-01 00:00 UTC, which is October 31, 5:00 PM Pacific (PDT). Every surface words it the same way, "Renews on October 31, 5:00 PM PDT": the usage popover and Settings > AI usage (`UsageGauge.jsx`) and the refusal toast (`ai-refusal.js`) all use `formatReset` in `web/src/account-usage.js`, which shows the viewer's own time zone with the zone named. A server-composed message (`spendMessage`, `learn-spend-ledger.js`) does not know the viewer's zone, so it uses the same wording in UTC: "Renews on November 1, 12:00 AM UTC." Both are pinned by tests at the cutover and at a month and year boundary.

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
| released | a reservation is released when its attempt leaves `reserved` (settled, failed, cancelled, or sealed at its bound); `reserved_micros` stays as the recorded maximum |
| grants | `usage_grants (user_id, period, allowance_micros, source, granted_at)` |

Missing usage or cost stays missing: `cost_micros` NULL / absent `quantities` keys are never 0.

## Not covered

- Voice Scribe: the browser streams the microphone straight to the provider; the server sees only the token mint (15 minute
  token), so session duration is not observed and its cost is recorded `unknown`. Metering needs a server-observed duration.
- `refundAttempt` is the mechanism; no failure path calls it yet. Platform-funded work (practice grading, tutor evaluation,
  renderer compute, webpage screening) stays recorded apart and never in the user's balance.

## Browser checks (run by CI fast-e2e on the exact SHA)

Two Linux checks drive the real app on the keyless CI stack. That stack runs `SMALL_ENV=test`, which never meters, so both send the
header `x-e2e-enforce-spend: 1` on every `/api/` call; `e2e/tripwire-dev-worker.js` turns it into the environment of a deployment
(`SMALL_ENV=dev`, a platform daily limit, a placeholder provider key) for that request only. Every provider request is blocked and
counted by the tripwire, and both checks require zero.

- `credits-meter-check.mjs`: a new account is granted 2,500 credits (API before any canvas, gauge popover and Settings > AI usage);
  the renewal line in Los Angeles time, then pinned at the cutover (`2026-11-01T00:00:00Z` reads "Renews on October 31, 5:00 PM PDT",
  and "November 1, 9:00 AM GMT+9" in Tokyo); an account with a granted 5,000 month and recorded usage is shown 5,000, its usage and
  what is left; the transition rule on the live clock (before 2026-11 chargeable usage is 5,000, from 2026-11 everyone 2,500) and a
  free action not counting as usage; no dollar amount, "USD" or "cents" on those surfaces.
- `allowance-enforcement-check.mjs`: exhausted, insufficient, reserved and accounting-unavailable each refuse a chat Send before any
  provider call, with one toast ("Not enough AI credits. Renews on <Los Angeles time>."), View usage opening Settings, the prompt
  given back and the canvas still editable. The exhausted refusal charges and reserves nothing (used stays at the
  seeded allowance, reserved 0), and every refusal and the accounting outage leave the tripwire at zero requests.

Not covered by a browser check: `settings-check.mjs` stays windows-only (it is the general Settings check, not the credits meter); a
provider failure after admission is unit-tested only (next section).

## A provider failure after admission (unit-tested, `test/credits-provider-failure.test.js`; no browser check)

**Two ledgers (owner decision 2026-10-25, replacing "an unknown cost stays held, never zero").** The learner's reservation and the
provider's cost are separate.

- The learner's balance sets credits aside only for a call that is still running (`cost_state = 'reserved'`), and only within that
  operation's bound (`HOLD_SECONDS` in `learn-usage.js`: 30 minutes for a chat-style call, 1 hour for Explain, board and course
  work, 2 hours for video, 4 hours for an image job; never more than `HOLD_BACKSTOP_SECONDS`, 24 hours). A call that ended, however
  it ended, holds nothing, and a failed call with no usable result is charged zero.
- A call that outlives its bound is sealed once (`releaseStaleHolds`, one guarded UPDATE run at admission and before any settle):
  failed, cost unknown, released. A late result is then ignored by `settleAttempt`, so it can neither charge the learner nor settle
  twice; its provider cost stays unknown.
- The provider cost keeps its three states in `usage_attempts`: measured (`settled` with `cost_micros`), a known zero (`settled`,
  cost 0, status `failed`), and unknown (`cost_micros` NULL, `cost_state = 'unknown'`; never recorded as 0). The platform's daily
  guard (`usage_operations`, `USAGE_PLATFORM_DAY_USD`) is a third, separate ledger: it keeps an unresolved call at its bound for 24
  hours whatever the learner's balance says.

| Outcome | Provider cost | Learner charged | Learner holds |
| --- | --- | --- | --- |
| Complete answer or stream with usage | measured | the measure | nothing (the rest is released) |
| Capacity refusal: HTTP 429, 529, or 400 "usage limits" (`providerUnavailable`; ImageJobs reads a 429 the same way) | known zero | 0 | nothing |
| Any other HTTP error (400, 401, 5xx including 502, 503, 504), a thrown timeout or abort, a 200 without usable usage, a stream that ends early or errors | unknown | 0 | nothing |
| Still running | not yet known | 0 | its reservation, until the bound |
| Running past its bound | unknown (sealed) | 0 | nothing, from the bound |

An HTTP status alone does not prove the provider did no billable work, so only the provider's own capacity refusals are a known zero.

**What the browser is told (owner 2026-10-25: credits only, never dollars, micros or a currency).** `GET /api/learn/usage` answers
`{ enforced, period, resetsAt, allowanceCredits, usedCredits, reservedCredits, estimatedCredits, remainingCredits, unknownAttempts,
byFeature: [{ feature, usedCredits, reservedCredits, unknownAttempts }] }` (the conversion, 1 credit = 10,000 micros, is on the server). The web store
(`account-usage.js` `readUsage`) turns it into its own units at the boundary. The same rule holds for the Motion list (`usage.usedCredits`,
`hold.state` only; the reservation amount is no longer sent), the requester's image-job inspect view, the inline code quote, consent and
job view (`maximumReservedCredits`, `maxReservedCredits`, `reservedCredits`), the inline image quote and consent (`maximumReservedCredits`,
`maxReservedCredits`) and the CAD job view (no `phaseUsd`). The dollar accounting stays in the ledger and behind the owner telemetry
routes (`/api/owner/telemetry`, `ownerOnly`). `test/no-money.js` (`moneyLeaks`) is the scanner the tests use. Not yet converted: the model
`telemetry.cost_usd` that Tutor and Next Steps responses carry for the web's Tutor trace.

**Failed work refunds.** A route that answers with an error delivered nothing usable: `finishWithResponse` refunds every already settled
attempt of that action in full, once each (`refundFailedAction`, reason `route_failed_no_result`). The attempt keeps its recorded provider cost.
Not refunded: a still-streaming answer (its error arrives inside a 200), free or platform work, and an Explain job's earlier answered calls
when the job fails later (Explain charges answered calls; Retry resumes).

**Sealing.** ImageJobs ends a job whose reservation was sealed (stage `failed`, reason `expired`): it sends nothing, stores nothing, shows
no artifact and charges nothing, even if the provider answers late. ExplainJobs already ends an interrupted call as failed on reconcile and its
calls (2 minutes) and job (10 minutes) are far inside the 1 hour bound; Motion waits at most 60 minutes inside its 2 hour bound. The Jev
direct path reads a 429 or 529 as a known zero, like spendTransport and ImageJobs.
Remaining work: an operator-visible report of unknown provider cost, and sealing the job object itself (ExplainJobs, ImageJobs,
Motion) when its reservation is sealed.

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
