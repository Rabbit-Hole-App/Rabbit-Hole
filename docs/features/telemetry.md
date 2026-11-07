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
  `stage.finished`, `client.error`, `telemetry.delivery`, `star.added`, `star.removed`, `star.opened` (Stars, `telemetry-events/stars.js`), `weekly_top.viewed`,
  `weekly_top.opened`, `weekly_top.request_failed` (Weekly Top 5 in Explore, `telemetry-events/weekly.js`, a browser-ingest namespace beside `client`).
  Stars delivers from `canvas_star_events` inside the owner `POST /project` pass; both are inert where no sink is bound.
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
| Learning evidence projections (`learning_attempts`, `learning_assessments`, `learning_observations`, `learning_criteria`) and Tutor events | Telemetry D1 | `TELEMETRY_DB` | Ids, enums and counts only; rebuildable copies of the Tutor's records (migration 0002). |
| Accounting projections (`accounting_actions`, `accounting_attempts` with Credits' price detail and refunds, `accounting_grants`) | Telemetry D1 | `TELEMETRY_DB` | Rebuildable copies by id of Credits' interface (`docs/features/credits-2500.md`); not a ledger. |
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

## Adding an event (adapter lanes)

The contract owner (the telemetry lane) owns `telemetry-contract.js`. An adapter never edits it; it adds one registration file
and one line to a list, and the contract owner reviews the pull request.

1. Create `packages/control-plane/src/telemetry-events/<feature>.js`: a plain object with **no imports**.
   ```js
   export default {
     namespace: 'cad',                       // lower case, unique; core namespaces (model_call, stage, telemetry) are reserved
     ingest: undefined,                      // 'client' or 'tutor' only if a browser route may accept the namespace (see Browser errors, Tutor evidence)
     errorCodes: ['cad_parse_failed'],       // optional: extra error_code tokens, unique across features
     events: {
       'cad.build': {                        // every name is <namespace>.<name>, lower case
         duration_ms: { type: 'ms', required: true },
         stage: { enum: ['parse', 'build'] },
       },
     },
   };
   ```
   A field rule is `{ type }` with a type from the contract (`id`, `token`, `hex`, `route`, `int`, `ms`, `bool`, `rate`, `usage`,
   `ids`) or `{ enum: [tokens] }`, plus `required: true`. There is no free-text type: a prompt, message, URL or email cannot be a
   field. If a feature needs a new type, ask the contract owner.
2. Add `import cad from './cad.js';` and `  cad,` to `telemetry-events/index.js`. That file is merged with git's union driver
   (`.gitattributes`), so two adapters adding a line each do not conflict. A test fails if a file is not listed.
3. Emit with `emitTelemetry(env, makeEvent('cad.build', { feature, action_id, attempt_id, job_id, outcome, payload }, { service }))`
   from a request, or `telemetryOutbox(...).append(...)` from a Durable Object job (see Delivery). Add the ids you have so the
   dashboard can join: `action_id`, `attempt_id`, `job_id`, and `user_ref` (users.id) where the server knows the account.
4. Add unit tests with a success and a failed or cancelled example, and a test that no private text reaches the event.
5. A bad registration (wrong name, duplicate, unknown type) throws when the contract loads, so every test run catches it.

## Browser errors (Task 11)

`packages/web/src/client-telemetry.js`, installed once in `main.jsx` for Rabbit Hole builds (never inside an embedding site).

- **What is reported** (`client.error`, kind): `uncaught` and `unhandled_rejection` (window); `boundary` (the root's uncaught
  React error); `render_failed` (a card's own boundary: the graph card and the chat answer today, with the artifact name);
  `save_failed` and `load_failed` (a 5xx or a thrown request to a saved resource such as boards, canvases, files, progress or
  library; also a code chunk that failed to load); `network` (any other failed API request); `long_task` (500 ms or more) and
  `slow_interaction` (an event of 500 ms or more) where the browser reports them.
- **What leaves the page:** the kind, a 16-hex fingerprint, a route template, the error's constructor name, browser and device
  class, a status code or duration, a repeat count, and the page's drop count. The fingerprint hashes the error name and its
  top stack frame with URLs, line numbers and the bundler's content hash removed. Never a message, a stack, a URL, a query string,
  a share token, a request body or any page content. `/b/<token>`, `/apps/<slug>` and handles become `/b/:token`, `/apps/:id`
  and `/:handle` (`routeTemplate`). 4xx answers are not reported (sign-in, validation and refusals are the product speaking), nor
  aborted requests, nor requests to the telemetry route itself.
- **Limits in the browser:** the same failure inside 60 seconds is counted, not sent (folded into one event when its window ends
  or the page is hidden); a burst of 10 distinct events, then one every 6 seconds; 50 events a page load; a batch is at most 50
  events and 64 KB; a 429 silences the page for a minute. Delivery is `sendBeacon` when the page is hidden, else `fetch` with
  `keepalive`, and it is never retried. What the page dropped is reported on its next event (`payload.dropped`), so incomplete
  delivery is measured.
- **Server (`POST /api/telemetry/client`, `telemetry-client-route.js`):** same-origin only; 64 KB; the browser is untrusted. Of
  each event only the name (client namespace only, `BROWSER_NAMESPACES`), the trace id, a release hash and the validated payload
  are kept; the environment, service, time, account (from the session, anonymous allowed) and event id are the server's. Dedup:
  the stored id is derived from the payload (without its counters), the account or a hashed network address, and a 10-minute
  bucket, so the same failure from the same account in the same bucket is one row. A per-isolate token bucket (60 events burst,
  2 a second) per account or address answers 429. `TELEMETRY_CLIENT_DISABLED=true` is a kill switch. Where telemetry is not
  provisioned it answers 204. The network address is only hashed in memory, never stored.
- **Linking a failure to its action:** the browser adds a random `x-rh-trace` header (16 hex) to each same-origin API request;
  the app worker keeps it on the request's env (`withTrace`), the model logger puts it on `model_call.*`, and a failed request's
  `client.error` carries the same trace id. The action explorer shows an action's events and the browser failures sharing its
  traces. Accounting is untouched: no `X-RH-Action-Key` or ledger change. An uncaught error with no request has no trace; it is
  linked only through a support report.
- **Support references:** `POST /api/learn/feedback` now returns `{ id, ref }` with `ref` like `RH-7QK2-M9XD` (40 random bits,
  Crockford base 32), stores it in the report, and writes a `support.report` event with the ref, the kind, the page's route
  template and the page's latest fingerprints and trace ids (hex only, at most five each). The report text never reaches
  telemetry. The feedback button's confirmation reads "Sent, thank you. Your reference is RH-...". The owner enters the reference
  (or an `act-` id) in the action explorer, which shows the report, the browser failures it saw, the server events on the same
  traces and buttons to open their actions. `GET /api/owner/telemetry/support/<ref>` and `/client-errors?days=` serve it.
- **Dashboard:** a Browser errors table (kind, route, release, occurrences, accounts, last seen) on `/owner/telemetry`.
- **Known limits.** Repeats after the first in a 10-minute bucket are counted only by the page's own fold. Anonymous callers can
  send arbitrary fingerprints, so the real bound on rows is the per-isolate bucket: add a Cloudflare rate limiting rule on
  `POST /api/telemetry/client` (owner action; see the runbook). The release is empty until a deploy sets `RELEASE_SHA` on the
  worker and `VITE_RELEASE_SHA` at build time (neither is set today). The reference appears on the confirmation button's tooltip,
  which keeps the owner's "confirmation stays on the button" pattern; a visible reference is an owner design decision. Offline
  and reconnect behavior appears only as `online` on other failures; there is no dedicated offline event yet.

## Tutor evidence (Task 12)

Plan and decisions: `C:/s/spec/telemetry/task12-tutor-evidence-plan.md`; owner decisions A to F, 2026-10-23. Evidence class for everything
below: **fixture-tested**. No real Tutor model turn, no real learner records and no deployed environment have exercised it.

**Two sources, kept apart.**

1. *Decisions* come from the browser. `web/src/tutor-telemetry.js` maps the finished TutorDecisionEvent v1 events
   (`learn-tutor-trace.js`: `tutor_decision`, `next_steps_computed`, `next_steps_shown`) into `tutor.decision`,
   `tutor.hooks_computed` and `tutor.hooks_shown` (`telemetry-events/tutor.js`, `ingest: 'tutor'`) and posts them to
   `POST /api/telemetry/tutor` (`telemetry-tutor-route.js`). The sink is registered in `learn-tutor-trace.js` for Rabbit Hole builds in a
   browser; it is built from finished results only, after them, and every failure is swallowed.
2. *Learning evidence* is projected from LEARN_DB by `telemetry-learning-projection.js` into `learning_attempts`,
   `learning_assessments`, `learning_observations` and `learning_criteria` (migration `0002-learning-evidence.sql`): read-only, cursor
   based, rebuildable, run beside the accounting projection by the owner dashboard's `POST /project`.

**What is carried, and what is not.** Ids, enums, counts, versions and timings, assembled field by field: no goal text, hook text,
rationale, canvas summary, modality text, question, plan text, answer, excerpt, title or public identifier. The attempt's answer
(`content_json`), its source and assistance references, goal and criterion text, an activity's objective and prompt, an
assessment's free reason and the raw provenance are never selected. A test builds real v1 events from fixture text and asserts none
of it reaches the output. The contract has no text type, so a text field cannot be registered by mistake.

**Server rules (`POST /api/telemetry/tutor`).** Signed-in learners only (401 otherwise, whether or not storage is provisioned).
Same-origin, 64 KB, at most 20 events, a per-account bucket (40 burst, 2 a second), the `tutor` namespace only (the anonymous error
route can never accept it, and this route refuses everything else). Identity, time, environment and event id are the server's; the
stored id is derived from the account and the browser's event id, so a retry or replay is one row; the events of a batch are spaced
one millisecond apart in batch order. The learner's goal, activity, activity type and criteria are read from the server's own
coaching records (`learn_coaching_state`, `learn_activities`), never from the browser. A canvas reference (decision D) is kept only for
a canvas the account owns (a `learn_boards` or coaching row for that account, app and board) and never for a shared scope, which
carries only its one-way share key.

**Assistance (decision B).** Offered, displayed and used help are different things and are kept apart:

- *Offered*: `tutor.decision.assistance_offered`, derived from the accepted actions by `assistance-map-v1`
  (`tutor-telemetry.js`; the version is on the event as `versions.mapping`). explanation: `respond_text`, `handoff`, `suggest_depth`,
  `suggest_avatar_clip`. material: a card shown, focused or made that is read or watched. scaffold: such a card that the learner acts on
  (the INTERACTIVE modalities, kept equal to `learn-tutor-actions.js` by a test). none: `ask_question`, `suggest_practice`,
  `suggest_dive`, `open_dive`, `return_from_dive`, `suggest_journey`, `suggest_research`, `next_section`, `no_action`. unknown: any other
  type, or a card with no known modality. A turn takes its strongest action (explanation, material, scaffold, none). Reviewed
  against `ACTION_TYPES` and the handoff, avatar and next-section actions in `learn-tutor.js`, and what each does in
  `learn-tutor-actions.js`; a test fails if a Tutor action type is unmapped.
- *Displayed*: for hooks, `tutor.hooks_shown` (sets first on screen, cached or not). The Tutor does not record that an offered
  action was displayed, so there is no displayed field for decisions; it is not inferred.
- *Used*: `learning_attempts.assistance` (none, assisted, unknown) and the observation's `assistance`: the help the server resolved at
  submission. For hooks, a turn that names a hook (`selected_hook`).

**Hook outcomes (decision C).** Computed (`hooks_computed`: also cached and discarded), shown, and selected are recorded.
*Superseded* is derived, never captured: a set is superseded only when a later set was shown on the same surface (account, session,
canvas or share key). A shown set that was neither selected nor superseded is **unknown**; the absence of a selection is not read as
rejection or dismissal. There is no `hook_outcome` event, and completion beyond the turn that selected a hook is not measured.

**Metrics (`GET /api/owner/telemetry/learning`, the dashboard's Tutor and learning view; `telemetry-learning-metrics.js`).** Every
metric returns its numerator, denominator, basis and definition:

| Metric | Numerator over denominator |
|---|---|
| Independent success; assisted success | valid observations with fit met and no help (or recorded help), over valid observations scored met, partly met or not met; the first scored observation of each criterion version per account and goal; grouped by route and evaluator version; help not recorded is its own bucket |
| Retention | valid retests (`retention_of`) with fit met over scored ones, bucketed by time since the original |
| Transfer | applied and met over scored valid observations, on criteria that require transfer |
| Milestones | first moment a criterion version is `demonstrated_independently` under the product's own `deriveCriterionSummary`; median elapsed time and observations; Tutor-feature AI cost of the account in the span, measured and estimated apart |
| Stalls | runs of 3 consecutive decisions in a session on the same target claims with no evidence change |
| Explanation loops | 2 consecutive text replies on the same claims with no attempt between |
| Repeated misconceptions | claims with 2 or more single-claim turns that moved them into misconception, over claims with any |
| Premature progression candidates | advance-goal decisions made while the claims held a misconception or gap, over all advance-goal decisions (a candidate, not a confirmed error) |
| Adaptation after failure | the next decision after a valid not-met observation (or a misconception turn) carries a repair reason, over all such next decisions |
| Hook funnel | generated, cached, discarded, shown, selected (by position), superseded, unknown |

"Valid": assessment completed, validity valid, no conflict, not superseded by a later completed assessment. AI-assessed (route `jev`
or `larger`) is not verified: outcomes are always grouped by how they were produced. Declared unavailable, not estimated: difficulty
(the product has none; decision A), human-reviewed grading quality (decision E: reviewer, sampling rule and permitted evidence are
undefined, so nothing is collected and no review table exists; learner conversations are never collected for review), hook
completion, and displayed help.

**Learner notice (decision F).** Settings, Privacy & security, "Learning analytics" (`RabbitHoleSettings.jsx`,
`data-learning-analytics-notice`): what is recorded, scoped to analytics ("These analytics events do not include the text of your
messages, questions or answers ... That statement is about analytics only"), without claiming conversations are not stored, and who can
see it. A source test ties its claims to the registered fields. **Release dependency:** the notice describes collection, so it should
ship with the provisioned telemetry; it is not conditional on a server flag.

**Limits.** An observation's later validity change is picked up for the newest 500 observations of the last 7 days; an older change waits
for a full rebuild (`from: 0`). The canvas reference needs a saved board or a coaching row. The metrics read the newest 20000 Tutor
events in the window and report `truncated`. Shared-canvas viewers who are signed in send events under their own account; anonymous
viewers send none.

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
- The owner is `Yudhisteer.chin@gmail.com` (owner clarification, 2026-10-23). `yudhisteer.chin01@gmail.com` is a different
  identity and never matches.
- Guard (`owner-guard.js`, owner decision 4): a valid session from the trusted auth path (`devIdentity`, the control plane's
  `/api/me`), a configured `SUBSCRIPTION_OWNER_EMAIL` that is a valid address or, on production, the exact application principal of the owner's Google sign-in (`user@<32 hex>.rabbithole.invalid`, the `/api/me` email of a Google or GitHub session; the match is whole-string and no other `.invalid` shape is accepted), and a match after the application's own
  normalization (`loginEmail` in `auth.js`: trimmed, lowercased; only strings are accepted). The secret may therefore be typed in
  any case. No dot, plus-tag or domain-alias folding is applied. Anything else is a plain 404, so the route's existence is not
  disclosed. Independent of `SUBSCRIPTION_ONLY` and never uses `subscriptionOwnerRefusal`; no body, query, header or cookie
  other than the session can supply the identity. The nav entry appears only after the same API answers 200; it is a
  convenience, never the protection.
- One entry: every owner route is an entry of `ROUTES` in `owner-telemetry-routes.js` and is reachable only through
  `ownerTelemetryRoute`, whose first step is the guard. `OWNER_ROUTES` lists them (access, overview, actions, health, project,
  client-errors, support). No export, diagnostic download, reconciliation upload or archive retrieval exists yet; each will be added
  to the same table, and `test/owner-guard.test.js` enumerates the table and fails if a route is reachable unguarded, if a
  handler is run from anywhere but the dispatcher, or if another module serves `/api/owner`.
- **Provider cost versus learner charge (two figures, two sets of cost states).** "Paid attempts by cost state" is
  `accounting_attempts`, the projection of `usage_attempts`: what the learner was charged or holds. It is 0 (`settled`) for a
  failure of ours, which `learn-video.js` settles at zero for the learner. "Provider spend by cost state" (`providerSpend` in
  `/overview`) is the platform ledger, `usage_operations` (0016), where `settleSpend` records the provider's actual cost. Example, failed
  Motion operation `motion-ce19016b-090f-4860-ae20-ee571e12dc52` (production, read before this change): `usage_operations.cost_usd`
  1.540278, 5 calls, `failed`; `usage_attempts.cost_micros` 0. Before: the dashboard showed Measured $0.0000 and no provider figure. After: the
  attempts table still shows $0.0000, and the provider table shows Provider cost measured $1.5403, learner-side attempt $0.0000.
  `telemetry-provider-spend.js` reads the ledger live, read-only, in the request (no migration, no copy, so nothing is projected
  twice and the projection stays idempotent). One operation is one row (`op_id` is the primary key and the attempt id), so spend is
  counted once and is never added to the attempt cost. States, from `usage_operations` joined to its attempt: *measured* (`settled`),
  *estimated* (error `cost_estimated_upper_bound`), *unknown* and *reserved*. `cost_usd` is not proof of a measurement: admission
  writes the reservation there and `settleSpend` keeps it when the provider reports no cost, so an operation whose `cost_usd` still equals its
  attempt's `reserved_micros`, that timed out, or that has no attempt, is *unknown* and its amount is shown only as a **bound**, never as a
  cost; an operation still `admitted` is *reserved*. A cancelled operation made no call and is left out. Limits: a measured cost exactly equal
  to the reservation reads as unknown (the conservative side); calls that bypass the ledger (`estimated` media) appear only in the attempts
  table; history ends where `usage_operations` is pruned (never today). Evidence class: fixture-tested (`test/telemetry-provider-spend.test.js`,
  `packages/web/src/owner-telemetry-view.test.mjs`); the projection and this route have never run in production, and the page has not been
  deployed or looked at in a browser.
- Every owner API response is `Cache-Control: no-store` and each authorized read is written to `owner_access_log`.
- Ordinary user APIs carry no dollar amounts from telemetry: the owner API is the only reader of `cost_micros` and
  `reserved_micros` outside Credits' own routes.

## Retention (Task 19, starting settings)

`retentionConfig(env)`: events 30 days (`TELEMETRY_EVENTS_RETENTION_DAYS`), archives 90 (`TELEMETRY_ARCHIVE_RETENTION_DAYS`),
aggregates 395 (`TELEMETRY_AGGREGATES_RETENTION_DAYS`). The pruning jobs are increment 5. They delete only from
`telemetry_events`, `telemetry_delivery_health` and archive prefixes; the projections are rebuilt from LEARN_DB, and LEARN_DB is
never pruned by telemetry. Financial records follow Credits' accounting policy.

## Provisioning and configuration runbook (NOT RUN; every step is the owner's or the coordinator's, each needs its GO)

Nothing below has been run. No session has touched a remote resource. Syntax was checked against the installed wrangler 4.150.0's own
`--help`, and the config edits were dry-run locally (`wrangler deploy --dry-run` for both configs, plus the two config unit tests).
A compact copy is `C:/s/spec/telemetry/provisioning-commands.md`.

**Names, exactly**

| | Dev (worker `small-cp-dev` and every `rabbit-hole-web-dev-<session>` clone) | Production (worker `rabbit-hole-app`, digrabbithole.com) |
|---|---|---|
| D1 database | `rabbit-hole-telemetry-dev` | `rabbit-hole-telemetry` |
| D1 binding | `TELEMETRY_DB` | `TELEMETRY_DB` |
| R2 bucket (private) | `rabbit-hole-telemetry-archive-dev` | `rabbit-hole-telemetry-archive` |
| R2 binding | `TELEMETRY_ARCHIVE` | `TELEMETRY_ARCHIVE` |
| Environment label (var) | `TELEMETRY_ENVIRONMENT = "dev"` | `TELEMETRY_ENVIRONMENT = "production"` |
| Owner identity | var `SUBSCRIPTION_OWNER_EMAIL` already in `wrangler.dev.jsonc` (`yudhisteer.chin@gmail.com`) | **secret** `SUBSCRIPTION_OWNER_EMAIL` on `rabbit-hole-app`, value typed by the owner |
| Cloudflare account | `c08d3dbdc53a3afd3cb09a536ac42318` (both configs pin it) | same account |

Dev and production live in the same Cloudflare account, so isolation is by separate databases, buckets and bindings: each
deployment binds only its own pair and labels its own events, and the production config test refuses any `-dev` name.

**Owner identity.** The owner is `Yudhisteer.chin@gmail.com`. `yudhisteer.chin01@gmail.com` is a different account and never matches.
The guard compares both the configured value and the signed-in account through `loginEmail` (`auth.js`: trimmed, lowercased,
validated), so the secret may be typed in any case. Nothing else is folded: no dot, plus-tag or domain-alias folding.

**Files that change, and the ones that do not.** Only these two worker configs get bindings, because only the app worker serves
`/api/learn/*`, `/api/telemetry/client`, `/api/owner/telemetry/*` and the Durable Object jobs:

- `packages/web/wrangler.dev.jsonc`
- `packages/web/wrangler.rabbit-hole-prod.jsonc`

Not edited: `packages/control-plane/wrangler.*.jsonc` (no producer runs there), `packages/web/wrangler.parallel.jsonc` and the notebook
configs (a clone without the binding records nothing and shows "not configured"), `scripts/ci/config/integ-local.jsonc` (the local
CI stack must stay without telemetry storage; `client-telemetry-check.mjs` relies on that). The two config tests
(`rabbit-hole-dev-config.test.js`, `rabbit-hole-prod-config.test.js`) already accept exactly these bindings and refuse any other
name, any control-plane binding and a mismatched environment label, so the config edit needs only the database id.

**Conventions.** Git Bash, `packages/web` as the working directory, the rabbit-hole `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
loaded for the session (from `small-deploy/.env`, by name; never printed, never sourced into the transcript). The owner runs each
command as a `!` command. The commands that create or read a resource are given WITHOUT `--config`: the account comes from
`CLOUDFLARE_ACCOUNT_ID`, and a create command that is given a JSONC `--config` asks "Would you like Wrangler to add it on your behalf?"
with the default yes.

**Dark deploy and order (tested).** The Worker runs without `TELEMETRY_DB`, `TELEMETRY_ARCHIVE` and `TELEMETRY_ENVIRONMENT`;
`test/telemetry-dark-deploy.test.js` calls every handler with those absent: browser and Tutor ingestion answer 204 to a signed-in
caller (Tutor still 401 to a signed-out one), server events and `loggedModel` are no-ops that return the provider response
untouched, the owner API stays 404 to everyone but the owner and answers the owner `configured: false` on every storage route,
and no source reads `env.TELEMETRY_ARCHIVE` (the bucket is not yet a runtime dependency; nothing here archives). So the
candidate may deploy before provisioning. Provisioning has an order, because wrangler does not apply migrations on deploy.

**What wrangler 4.150.0 does, which fixes the order** (read from the pinned wrangler's `--help` and source):

- `d1 migrations apply <db> --remote` needs the database as an entry of a config file, matched by `database_name` or `binding`. It
  does not need `database_id` there: with none, wrangler looks the id up by name through the API. `migrations_dir` comes from the entry
  (relative to the config file's folder; an absolute path works). So the migration runs BEFORE the repo config has any binding, with
  a scratch config outside the repo, and the repo config edit needs no migration to exist first.
- `d1 execute <name> --remote --command ...` needs no config entry at all: an unknown name is resolved through the API. Every
  read-only check below works from the database name alone.
- `d1 create` and `r2 bucket create` with no `--config` just print the result. Never pass them `--config` or `--update-config`.
  `packages/web` has no default `wrangler.jsonc`, so nothing is auto-discovered there.
- `secret put` and `secret list` accept `--name <worker>`; no config is loaded.
- Both migration files are `CREATE TABLE IF NOT EXISTS`, so they are re-runnable.
- Checked locally: a scratch config with only `{binding, database_name, migrations_dir}` (no id) was accepted by
  `d1 migrations apply --local` and resolved as `rabbit-hole-telemetry-dev (TELEMETRY_DB)`. The local workerd D1 then fails with
  "internal error" on the development machine (the known environment limit, even `SELECT 1`), so the apply itself is proven only by
  the node:sqlite tests of the SQL; the remote apply is unproven until it runs. The config edit below was dry-run with a fake uuid:
  both config tests pass and `wrangler deploy --dry-run` lists the three telemetry entries for each config.

**Sequence.**

1. Owner: create the D1 database and the R2 bucket (no config), then run `migrations apply` against a scratch config (below).
2. Integrator: read the new uuid read-only (`d1 list --json`), then make ONE config-edit candidate that adds the bindings (edit
   below). Dev and production ride the same candidate when the owner ran both blocks in the same sitting; otherwise one candidate
   each. The candidate takes CI and the full gate (a config change keeps the gate), then dev deploy; production follows the normal
   `RELEASE <sha> <build>` path.
3. Production only: the owner secret is independent of the candidate and can be set at any time before the dashboard is wanted.

A binding deployed before its migration degrades (writes fail and are counted as losses, ingestion answers 503; no user request
fails), but the dashboard would show errors, so migrate first. `d1 execute --file` would also work from the name, but it bypasses
wrangler's `d1_migrations` table, so it is not used.

### 0. Check the account first (read-only)

```bash
npx wrangler whoami
```

Expected: the account listed is `c08d3dbdc53a3afd3cb09a536ac42318` (rabbit-hole), and the token's permissions include D1 and R2 edit.
Stop if it is any other account.

### Shared setup (once per Git Bash window; reads two values by name and prints nothing)

`RH` is any checkout of the candidate whose `packages/control-plane/telemetry-migrations` holds the two migration files.

```bash
export RH=C:/Users/cyudhist/Desktop/workspace/telemetry-r2
export CLOUDFLARE_API_TOKEN="$(grep -m1 '^CLOUDFLARE_API_TOKEN=' C:/Users/cyudhist/Desktop/workspace/small-deploy/.env | cut -d= -f2-)"
export CLOUDFLARE_ACCOUNT_ID="$(grep -m1 '^CLOUDFLARE_ACCOUNT_ID=' C:/Users/cyudhist/Desktop/workspace/small-deploy/.env | cut -d= -f2-)"
cd "$RH/packages/web" && ls ../control-plane/telemetry-migrations      # expected: 0001-telemetry.sql  0002-learning-evidence.sql
```

### Dev (owner block)

**D1. Create the dev database**

```bash
npx wrangler d1 create rabbit-hole-telemetry-dev
```

Effect: one empty D1 database in the rabbit-hole account. Expected output: `Successfully created DB 'rabbit-hole-telemetry-dev'`, then a
snippet whose `"database_id"` is a UUID. Send that UUID to the integrator. No prompt appears; if one offers to add it to a config,
answer no. `A database with that name already exists` means this step is already done. Verify: `npx wrangler d1 list` shows the name.

**D2. Create the dev archive bucket**

```bash
npx wrangler r2 bucket create rabbit-hole-telemetry-archive-dev
```

Effect: one empty private R2 bucket (private unless a public URL or custom domain is added; neither is). Nothing writes to it yet.
Expected output: `Created bucket 'rabbit-hole-telemetry-archive-dev' with default storage class of Standard.` Verify:

```bash
npx wrangler r2 bucket list | grep rabbit-hole-telemetry-archive-dev          # the bucket exists
npx wrangler r2 bucket dev-url get rabbit-hole-telemetry-archive-dev           # expected: the public r2.dev URL is disabled
npx wrangler r2 bucket domain list rabbit-hole-telemetry-archive-dev           # expected: no custom domain
```

**D3. Write the scratch migration config** (outside the repo; it only points `migrations apply` at the database by name, is never
committed and deploys nothing; delete it afterwards with `rm -r ~/rh-telemetry-migrate`)

```bash
mkdir -p ~/rh-telemetry-migrate && cat > ~/rh-telemetry-migrate/wrangler.jsonc <<EOF
{
  "name": "telemetry-migrate-only",
  "account_id": "c08d3dbdc53a3afd3cb09a536ac42318",
  "d1_databases": [
    { "binding": "TELEMETRY_DB", "database_name": "rabbit-hole-telemetry-dev", "migrations_dir": "$RH/packages/control-plane/telemetry-migrations" }
  ]
}
EOF
```

**D4. Apply the schema to the dev database**

```bash
npx wrangler d1 migrations apply rabbit-hole-telemetry-dev --remote --config ~/rh-telemetry-migrate/wrangler.jsonc
```

Effect: wrangler lists `0001-telemetry.sql` and `0002-learning-evidence.sql` and asks to confirm (answer `y`); it creates the
telemetry tables in the dev telemetry database only (plus wrangler's `d1_migrations` table). No other database is touched. Verify:

```bash
npx wrangler d1 migrations list rabbit-hole-telemetry-dev --remote --config ~/rh-telemetry-migrate/wrangler.jsonc    # expected: No migrations to apply!
npx wrangler d1 execute rabbit-hole-telemetry-dev --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# expected, at least: accounting_actions, accounting_attempts, accounting_grants, d1_migrations, learning_assessments, learning_attempts, learning_criteria, learning_observations, owner_access_log, projection_cursors, telemetry_delivery_health, telemetry_events
```

The owner stops here and tells the integrator the dev uuid. Nothing collects yet.

### Dev (integrator)

**D5. Config-edit candidate, `packages/web/wrangler.dev.jsonc` (three places).** Mechanical form, from the root of a checkout rebased
on current main (the script is at `C:/s/spec/telemetry/apply-telemetry-bindings.mjs`; it edits only the two worker configs, keeps CRLF,
refuses to run twice and calls no wrangler command):

```bash
node C:/s/spec/telemetry/apply-telemetry-bindings.mjs dev <dev uuid from d1 list --json>
```

The edit it makes: in `d1_databases`, after the `LEARN_DB` entry,

```jsonc
    {
      "binding": "TELEMETRY_DB",
      "database_name": "rabbit-hole-telemetry-dev",
      "database_id": "<DATABASE_ID PRINTED IN D1>",
      "migrations_dir": "../control-plane/telemetry-migrations"
    }
```

in `r2_buckets`, after the `LEARN_MEDIA` entry, `{ "binding": "TELEMETRY_ARCHIVE", "bucket_name": "rabbit-hole-telemetry-archive-dev" }`,
and in `vars`, `"TELEMETRY_ENVIRONMENT": "dev",`. Verify (both local, nothing uploaded):

```bash
(cd ../control-plane && node --test test/rabbit-hole-dev-config.test.js test/rabbit-hole-prod-config.test.js)   # expected: 14 pass
npx wrangler deploy --dry-run --config wrangler.dev.jsonc | grep TELEMETRY
# expected lines: env.TELEMETRY_DB (rabbit-hole-telemetry-dev) D1 Database; env.TELEMETRY_ARCHIVE (rabbit-hole-telemetry-archive-dev) R2 Bucket;
#                 env.TELEMETRY_ENVIRONMENT ("dev") Environment Variable
```

**D6. Deploy** by the repo's own path (the dev auto-deploy pipeline, or a clone; never a bare `wrangler deploy`):

```bash
npm run build -- --outDir dist-dev      # with the env flags of docs/features/parallel-dev-deploys.md
npx wrangler deploy --config wrangler.dev.jsonc --name rabbit-hole-web-dev-telemetry
```

**D7. Dev owner check.** No dev secret is needed: `wrangler.dev.jsonc` already sets the owner var.
`grep -n SUBSCRIPTION_OWNER_EMAIL wrangler.dev.jsonc` should show `yudhisteer.chin@gmail.com`. Signed in as
`Yudhisteer.chin@gmail.com`, `https://rabbit-hole-web-dev-telemetry.tryrabbithole.workers.dev/owner/telemetry` loads and
`GET /api/owner/telemetry/access` answers `200 {"owner":true,"configured":true,"environment":"dev"}`. Signed out, as
`yudhisteer.chin01@gmail.com`, or as any other account, the same URL answers `404 Not found`.

### Production (owner block; each step needs its own GO; D1 and the migration are production changes)

Repeat the shared setup. P3 is the same heredoc as D3, written to `~/rh-telemetry-migrate/prod.jsonc` with
`"database_name": "rabbit-hole-telemetry"` (check with `cat` that it does not say `-dev`).

**P1. Create the production database**

```bash
npx wrangler d1 create rabbit-hole-telemetry
```

Effect and verification as D1, with the name column exactly `rabbit-hole-telemetry` (the dev database `rabbit-hole-telemetry-dev`
also matches the prefix). Send the uuid to the integrator.

**P2. Create the production archive bucket**

```bash
npx wrangler r2 bucket create rabbit-hole-telemetry-archive
```

Verify as D2 with the bucket name `rabbit-hole-telemetry-archive` (`bucket info`, `dev-url get` disabled, `domain list` empty).

**P3. Scratch config for production.** As D3, written to `~/rh-telemetry-migrate/prod.jsonc` with
`"database_name": "rabbit-hole-telemetry"`.

**P4. Apply the schema to the production telemetry database** (a production migration: the owner's explicit approval)

```bash
npx wrangler d1 migrations apply rabbit-hole-telemetry --remote --config ~/rh-telemetry-migrate/prod.jsonc
npx wrangler d1 migrations list rabbit-hole-telemetry --remote --config ~/rh-telemetry-migrate/prod.jsonc     # expected: No migrations to apply!
npx wrangler d1 execute rabbit-hole-telemetry --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Effect and expected tables as D4. It touches only `rabbit-hole-telemetry`; `rabbit-hole-prod` and `rabbit-hole-learn-prod` are not named.

**P5. Set the owner identity as a secret on `rabbit-hole-app`**

```bash
read -r -p 'Owner sign-in email: ' OWNER_EMAIL && printf '%s' "$OWNER_EMAIL" | npx wrangler secret put SUBSCRIPTION_OWNER_EMAIL --name rabbit-hole-app; unset OWNER_EMAIL
```

The owner types `Yudhisteer.chin@gmail.com` at the prompt (any case works; the value never appears in a file, the transcript or
shell history, and is not `yudhisteer.chin01@gmail.com`). Effect: the secret exists on `rabbit-hole-app`; wrangler deploys the
Worker's current code again with the secret added, so no new code ships. It does not enable subscription mode: `SUBSCRIPTION_ONLY` is
unset in production and the owner guard never reads it. Verify (names only, values are never shown):

```bash
npx wrangler secret list --name rabbit-hole-app      # expected: SUBSCRIPTION_OWNER_EMAIL is listed
```

Until it exists the production dashboard answers 404 to everyone, including the owner (the intended dark state).

### Production (integrator)

**P6. Config-edit candidate, `packages/web/wrangler.rabbit-hole-prod.jsonc`.** The same candidate as D5 when both blocks were run:

```bash
node C:/s/spec/telemetry/apply-telemetry-bindings.mjs prod <prod uuid from d1 list --json>
```

It adds, in `d1_databases` after `LEARN_DB`, `{ "binding": "TELEMETRY_DB", "database_name": "rabbit-hole-telemetry", "database_id": "<DATABASE_ID PRINTED IN P1>", "migrations_dir": "../control-plane/telemetry-migrations" }`;
in `r2_buckets` after `REPOSITORY_SNAPSHOTS`, `{ "binding": "TELEMETRY_ARCHIVE", "bucket_name": "rabbit-hole-telemetry-archive" }`; and in `vars`,
`"TELEMETRY_ENVIRONMENT": "production",`. Do **not** put `SUBSCRIPTION_OWNER_EMAIL` in `vars`: the production config test refuses any
var containing `SUBSCRIPTION`, which is why the owner is a secret here. Verify as D5
(`wrangler deploy --dry-run --config wrangler.rabbit-hole-prod.jsonc | grep TELEMETRY` should show `rabbit-hole-telemetry`,
`rabbit-hole-telemetry-archive` and `"production"`). This is a config change: it rides a normal candidate and needs the full gate.

**P7. Release** through the normal path (`RELEASE <sha> <build>`, the owner's command, after the candidate has passed its checks).
Telemetry code paths do nothing until the bindings are deployed, so P1 to P5 before the release is safe.

**P8. Production owner check, after the release.** Signed in as `Yudhisteer.chin@gmail.com`:
`https://digrabbithole.com/owner/telemetry` loads; `GET /api/owner/telemetry/access` answers
`200 {"owner":true,"configured":true,"environment":"production"}`. Signed out, as `yudhisteer.chin01@gmail.com` and as any other
account: `404 Not found` on that URL and on `/api/owner/telemetry/overview`. Ingestion is reachable and bounded:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://digrabbithole.com/api/telemetry/client -H 'content-type: application/json' -d '{"events":[]}'   # expected: 202
```

### Cloudflare rate limit on browser error ingestion (owner action, dashboard)

Zone `digrabbithole.com`, Security, WAF, Rate limiting rules: match `POST` on path `/api/telemetry/client`, for example 60 requests a
minute per IP, action Block. Without it the only bound is the per-isolate bucket. Verify: 70 quick requests from one address end in `429`.

### Read-only checks for the integrator (change nothing)

```bash
npx wrangler whoami --json                                         # the rabbit-hole account; permissions include D1 and R2 edit
npx wrangler d1 list --json                                        # both telemetry databases exist; the uuids to use in the candidate
npx wrangler d1 execute rabbit-hole-telemetry-dev --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"   # SELECT only; works from the name
npx wrangler r2 bucket list                                        # both archive buckets exist
npx wrangler r2 bucket dev-url get rabbit-hole-telemetry-archive   # disabled (also the -dev bucket)
npx wrangler secret list --name rabbit-hole-app                    # SUBSCRIPTION_OWNER_EMAIL listed
grep -n "TELEMETRY\|SUBSCRIPTION_OWNER_EMAIL" wrangler.dev.jsonc wrangler.rabbit-hole-prod.jsonc
```

### Rollback

Producers do nothing without `TELEMETRY_DB`, so removing the binding (or setting `TELEMETRY_CLIENT_DISABLED` to `true` for browser
ingestion) stops collection at once and loses nothing the product needs. The schema is additive. Deleting a telemetry database is
destructive (it holds only telemetry and rebuildable projections) and is the owner's decision:
`npx wrangler d1 delete rabbit-hole-telemetry-dev` (or `rabbit-hole-telemetry`).

### Browser errors: optional release stamping

The release path (`scripts/prod-release.mjs`, `scripts/dev-deploy.mjs`) would need to set a `RELEASE_SHA` var on the app worker and
`VITE_RELEASE_SHA=<sha>` for the web build. Neither is wired (the release owner decides how; deploys are never run by hand). Events
carry no release until they are.

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
