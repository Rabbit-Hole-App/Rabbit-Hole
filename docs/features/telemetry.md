# Telemetry

Owner brief: `C:/s/spec/telemetry/brief.md` (Tasks 1-21). Binding decisions: `C:/s/spec/telemetry/owner-decisions-2026-10-23.md`.
Coverage inventory: [telemetry-inventory.md](telemetry-inventory.md). Credits field request: `C:/s/spec/telemetry/credits-interface-request.md`.

Status (increment 1, branch `feat/telemetry`): contract, storage design and migration, delivery (outbox and best-effort
emit), accounting projection, the model-logger repair, the owner guard and a minimal `/owner/telemetry` scaffold. Nothing is
provisioned: no telemetry database or bucket exists yet, so every producer is a no-op until the runbook below is run.

## Ownership

- **Credits** (`feat/credits-2500`) owns allowance, pricing, reservations, charges, refunds and settlement. Telemetry never
  computes a charge and has no price table. Financial figures on the dashboard are read from LEARN_DB or projected from it.
- **Telemetry** owns `telemetry-contract.js`, the telemetry migrations, delivery and the owner dashboard. Feature adapters
  (increment 4) add events to the contract's registry through this owner; they do not define their own envelopes.

## Contract (`packages/control-plane/src/telemetry-contract.js`)

A leaf module with no imports: the browser (`packages/web/src`), the Workers, Durable Object jobs and the Fly renderers
(`packages/learn-render`, which already import control-plane leaf modules) all validate against the same file.

- **Envelope** (schema_version 1): `event_id`, `event_name`, `schema_version`, `occurred_at` (producer ms), `ingested_at`
  (sink only), `environment` (production | dev | test | evaluation), `service` (web | app_worker | control_plane | job |
  renderer), `release_sha`, `service_version`, `trace_id`/`span_id`/`parent_span_id`, `action_id`, `attempt_id`, `job_id`,
  `turn_id`, `user_ref` (users.id, never an email), `feature`, `operation`, `stage`, `outcome`, `error_code`, `versions`
  (settings, model, prompt, rubric, pricing, renderer), `sample_rate` (only on a sampled event), `payload`.
- **Payloads** are per event, each an allowlist (`EVENTS`). Registered now: `model_call.started`, `model_call.finished`,
  `stage.finished`, `client.error`, `telemetry.delivery`.
- **No free text.** Field types are id, token, hex, route template, integers, booleans and a sampling rate. None accepts a
  space, `@`, `?` or `#`, so prompts, emails, comments, sources and URLs cannot be carried. `routeTemplate()` keeps only the
  app's static path words (a share token, board id, repository slug or handle becomes a placeholder).
- **Limits:** event 8 KB, payload 4 KB, browser batch 50 events / 64 KB. Unknown events, unknown fields, wrong shapes and
  oversize events are refused (`VALIDATION_ERRORS`), never trimmed. A batch keeps its valid events and counts the rest.
- **Errors:** one `ERROR_CODES` list, so failures group across features.
- **Usage:** `usageSnapshot()` keeps the provider's usage object as reported, flattened one level to allowlisted keys.
  Missing stays missing (never 0) and subcategories are never summed. Whether a provider's total includes its subcategories:
  Anthropic `input_tokens` excludes `cache_read_input_tokens` and `cache_creation_input_tokens` (the three are disjoint);
  `cache_creation.ephemeral_5m/1h_input_tokens` split `cache_creation_input_tokens`. OpenAI chat `prompt_tokens` includes
  `prompt_tokens_details.cached_tokens`; `completion_tokens` includes `completion_tokens_details.reasoning_tokens`;
  `total_tokens` = prompt + completion. OpenAI images `input_tokens` includes `input_tokens_details.text/image_tokens`.
- **Environment:** `telemetryEnvironment(env)` reads `TELEMETRY_ENVIRONMENT`; `SMALL_ENV=test` is always `test`. Unset means
  the worker writes nothing, and the sink overwrites a producer's claimed environment with the deployment's own.

## Storage map

| Data | Store | Binding | Notes |
|---|---|---|---|
| Actions, attempts, reservations, charges, refunds, grants | LEARN_DB (`rabbit-hole-learn-prod` / `-dev`) | `LEARN_DB` | Financial truth, Credits-owned. Never written by telemetry. |
| Operational events, delivery health, owner access log | Telemetry D1 | `TELEMETRY_DB` | `telemetry-migrations/0001-telemetry.sql` |
| Accounting projections (`accounting_actions`, `accounting_attempts`) | Telemetry D1 | `TELEMETRY_DB` | Rebuildable copies by id; not a ledger. |
| Hourly/daily aggregates | Telemetry D1 | `TELEMETRY_DB` | Increment 5. |
| Redacted diagnostic archives, imported billing evidence | Private R2 | `TELEMETRY_ARCHIVE` | No public access, no custom domain; owner-guarded retrieval only. |
| Job outboxes | Each Durable Object's own SQLite | (DO storage) | `telemetry_outbox`, created on first use. |
| Artifacts, assessments, Tutor state | Their product stores | unchanged | Referenced by id only. |
| Worker logs | Workers Logs (`observability.enabled`) | n/a | The `learn_model` line, refusals, drops; 7-day retention. |

| Environment | D1 database | R2 bucket |
|---|---|---|
| Production | `rabbit-hole-telemetry` | `rabbit-hole-telemetry-archive` |
| Dev | `rabbit-hole-telemetry-dev` | `rabbit-hole-telemetry-archive-dev` |

**Which worker gets the bindings.** Only the app Worker, which serves every `/api/learn/*` route, the Durable Object jobs
(their env is the app Worker's), the model logger and `/api/owner/telemetry/*`:

- production `rabbit-hole-app` (`packages/web/wrangler.rabbit-hole-prod.jsonc`, `app-worker.js` -> `dev-worker.js`);
- dev `small-cp-dev` and every `rabbit-hole-web-dev-<session>` clone (`packages/web/wrangler.dev.jsonc`; clones share the
  dev telemetry database, like the dev LEARN_DB).

Not the control planes (`rabbit-hole-cp`, `rabbit-hole-cp-dev`) yet: they serve sign-in, `/api/me` and email, which no
increment-1 producer instruments. Auth-failure events (Task 16) add their bindings then.

**Isolation.** Each deployment binds only its own environment's database and bucket and stamps its own
`TELEMETRY_ENVIRONMENT`, so the production dashboard cannot query dev data and the reverse. Acceptance and evaluation runs on
dev record `environment: 'evaluation'` or `'test'` and are excluded from production views by construction (a different
database). LEARN_DB rows carry no test marker yet; see the Credits request.

## Delivery

No transaction spans two services; each path says what it guarantees.

1. **Accounting: projection, not delivery.** LEARN_DB rows are the durable record. `projectAccounting()`
   (`telemetry-projection.js`) copies `usage_actions`/`usage_attempts` changed since its cursor into the projection tables,
   upserting by id. Re-running, replaying from cursor 0 or a full rebuild changes nothing in LEARN_DB and double-counts
   nothing. Product accounting does not depend on it: a telemetry outage only delays the projection.
2. **Durable Object jobs: outbox.** `telemetryOutbox(doSql(ctx.storage))` is synchronous, so `append()` can sit inside the
   `transactionSync` that changes the job's state: both commit or neither. `drain()` sends due rows to `writeEvents()`
   (INSERT OR IGNORE by `event_id`), deletes them on success, backs off 30 s doubling to an hour on failure and marks a row dead
   after 8 tries (kept and counted). `health()` reports pending, dead and oldest age. Drains run from the job's own alarm or
   next request; wiring each job is increment 4. The renderers on Fly do not write telemetry: they report through the job's
   callbacks, and the job's outbox records it.
3. **Request events: one best-effort write.** `emitTelemetry(env, event)` validates, stamps the environment and writes once.
   It never throws; a refusal or a failed write is counted (`deliveryCounts`) and logged as `telemetry_rejected` /
   `telemetry_dropped` without field values. Browser batches (increment 4) take this path with rate limits; their
   incompleteness is measured by comparing client and server counts, not assumed zero.

There are no cron triggers on any Rabbit Hole worker, so nothing drains on a schedule: the owner dashboard runs a bounded
projection catch-up when opened, and jobs drain themselves.

## Model logger (`learn-models.js` `loggedModel`)

Wraps every Learn model transport. It no longer reads the response body before returning it: a JSON reply is read from a
clone as before; an event stream is passed through chunk by chunk while the same incremental SSE parse that settlement uses
picks out the model, usage and stop reason. It records `model_call.started` at the call and one terminal `learn_model` log
line plus `model_call.finished` with outcome completed / failed (non-2xx) / cancelled (the reader cancelled) / unknown
(thrown transport, a stream that failed or ended without `message_stop`), `response_ms`, `first_chunk_ms`, `duration_ms`
(process-local clock), the provider `request-id` and the allowlisted usage. A logging failure never affects the response.
No response content is ever logged.

## Owner dashboard and access

- Page: `/owner/telemetry` (production `https://digrabbithole.com/owner/telemetry`). API: `/api/owner/telemetry/*`.
- Guard (`owner-guard.js`, owner decision 4): a valid session from the trusted auth path (`devIdentity`, the control plane's
  `/api/me`), a nonempty configured `SUBSCRIPTION_OWNER_EMAIL`, and an exact match. Anything else is a plain 404, so the
  route's existence is not disclosed. Independent of `SUBSCRIPTION_ONLY`; no body, query or header can supply the identity.
  The nav entry appears only after the same API answers 200; it is a convenience, never the protection.
- Every owner API response is `Cache-Control: no-store` and each authorized read is written to `owner_access_log`.
- Ordinary user APIs carry no dollar amounts from telemetry: the owner API is the only reader of `cost_micros` and
  `reserved_micros` outside Credits' own routes.

## Retention (Task 19, starting settings)

`retentionConfig(env)`: events 30 days (`TELEMETRY_EVENTS_RETENTION_DAYS`), archives 90 (`TELEMETRY_ARCHIVE_RETENTION_DAYS`),
aggregates 395 (`TELEMETRY_AGGREGATES_RETENTION_DAYS`). The pruning jobs are increment 5. They delete only from
`telemetry_events`, `telemetry_delivery_health` and archive prefixes; the projections are rebuilt from LEARN_DB, and LEARN_DB is
never pruned by telemetry. Financial records follow Credits' accounting policy.

## Deployment runbook (not run; each step needs the owner's GO)

Run from `packages/web`. Creating resources and production migrations need explicit approval (CLAUDE.md).

1. Create the databases and buckets (rabbit-hole account `c08d3dbdc53a3afd3cb09a536ac42318`):
   ```bash
   npx wrangler d1 create rabbit-hole-telemetry-dev
   npx wrangler d1 create rabbit-hole-telemetry
   npx wrangler r2 bucket create rabbit-hole-telemetry-archive-dev
   npx wrangler r2 bucket create rabbit-hole-telemetry-archive
   ```
   Effect: two empty D1 databases (ids printed) and two private buckets. Verify: `npx wrangler d1 list | grep telemetry`,
   `npx wrangler r2 bucket list | grep telemetry`. Do not enable public access or a custom domain on either bucket.
2. Add the bindings, with the printed ids, to `wrangler.dev.jsonc` (dev) and `wrangler.rabbit-hole-prod.jsonc` (production):
   ```jsonc
   // d1_databases:
   { "binding": "TELEMETRY_DB", "database_name": "rabbit-hole-telemetry-dev", "database_id": "<id>", "migrations_dir": "../control-plane/telemetry-migrations" },
   // r2_buckets:
   { "binding": "TELEMETRY_ARCHIVE", "bucket_name": "rabbit-hole-telemetry-archive-dev" },
   // vars:
   "TELEMETRY_ENVIRONMENT": "dev"
   ```
   Production: `rabbit-hole-telemetry`, `rabbit-hole-telemetry-archive`, `"TELEMETRY_ENVIRONMENT": "production"`. A binding
   with no real id breaks the deploy, which is why the branch does not carry them before step 1.
3. Apply the migration: `npx wrangler d1 migrations apply rabbit-hole-telemetry-dev --remote --config wrangler.dev.jsonc`
   (production: `rabbit-hole-telemetry --remote --config wrangler.rabbit-hole-prod.jsonc`, after its own GO). Effect: the
   tables in `0001-telemetry.sql`; no other database is touched. Verify:
   `npx wrangler d1 execute rabbit-hole-telemetry-dev --remote --config wrangler.dev.jsonc --command "SELECT name FROM sqlite_master WHERE type='table'"`.
4. Owner identity on the serving worker: dev `wrangler.dev.jsonc` sets `SUBSCRIPTION_OWNER_EMAIL`; production sets none in
   config. Verify with `npx wrangler secret list --config wrangler.rabbit-hole-prod.jsonc` (names only); if absent,
   `npx wrangler secret put SUBSCRIPTION_OWNER_EMAIL --config wrangler.rabbit-hole-prod.jsonc` with the owner's sign-in
   email. Setting it there does not turn on subscription mode (`SUBSCRIPTION_ONLY` stays unset).
5. Deploy through the normal release path. Verify: signed in as the owner, `/owner/telemetry` loads and Health shows the
   database as configured; signed out and as another account, `/api/owner/telemetry/overview` is 404.

## Ongoing cost (bounded estimate, not measured)

Rates from Cloudflare's pricing pages (read 2026-10-23): D1 $1.00 per million rows written and $0.75 per GB-month beyond the
Workers Paid inclusions (50 M rows written, 25 B rows read, 5 GB per account, shared with the product databases); R2 $0.015
per GB-month, $4.50 per million Class A operations, 10 GB and 1 M Class A free. The estimate prices every row at the
overage rate, as if the product databases had already used the inclusions.

- Each event writes one row plus one per matching index (at most 4): about 4 rows written and about 1.5 KB stored.
- 10,000 events a day: 1.2 M rows written a month, about $1.20; 30-day retention holds about 0.45 GB, about $0.34. About
  $1.55 a month.
- 100,000 events a day: about $12 in writes and $3.40 in storage, about $15.50 a month.
- Projections add two rows per paid attempt, plus index rows, about 6 rows written per attempt.
- R2 archives at 90 days: a few GB at most, under $0.10 a month at these volumes.
- Unknown: actual event volume (nothing is collected yet), and the account's current use of the inclusions. Until the
  increment-5 per-day event cap exists, the bound is the request volume itself: at most two model-call events per model call.
