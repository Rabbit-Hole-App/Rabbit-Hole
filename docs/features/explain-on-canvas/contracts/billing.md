# R4 contract: billing and durable recovery on the real transports

Status: DRAFT CONTRACT. Maps v1.4 section 5 onto code at `4102f8ea0`. Nothing here is applied; the "patch descriptions" are for the Lead (the files are Lead-only: `learn-usage.js`, `learn-models.js`, routes) or for State under the Lead's manifest. `file:line` = checked with `git grep -n` / `sed -n` on that commit.

## 1. The real transports (what exists)

| Piece | Where | What it does today |
|---|---|---|
| `spendTransport(env, body, model, org, transport, identity)` | `learn-spend.js:66` | The one admission for every paid provider call. Computes a conservative bound (`requestSpendBound`), generates `opId = operationId(identity.category \|\| 'provider')` (`learn-spend.js:78`; `operationId` is `${category}-${crypto.randomUUID()}`, `learn-spend-ledger.js:108`), calls `admitSpend`, runs the transport, settles `usage_operations` (`settleSpend`) and `usage_attempts` (`settleAttempt`). A private single-call token (`admission` Symbol) stops a wrapper and the real transport reserving twice. |
| `admitSpend` | `learn-spend-ledger.js:64-98` | One INSERT ... SELECT into `usage_operations` guarded by the platform daily operation and dollar caps (`PLATFORM_INSERT`, line 29) and, for chargeable work, the payer's monthly allowance (`allowanceClause`, line 35), batched with the `usage_attempts` reservation (`RESERVE`, line 38). Platform-funded work (no chargeable payer) takes the platform guard alone (lines 73-83). |
| Payer and action | `learn-usage.js` | `withUsage(env, {feature, req})` builds a per-request context (`:90`); the payer is the session user (`payerOf`, `:107`), never a body field. `X-RH-Action-Key` (regex `:78`) makes `usage_actions UNIQUE (user_id, client_key)` return the same action (`insertAction`, `:146-171`). `withSystemUsage(env, feature)` (`:117`) marks code-initiated platform work with no user (identity null, `system: true`); `admissionPayer` refuses any paid call with no context unless it is system work (`:195-208`). |
| Durable Object usage pattern | `explain-job.js:543-551` | `usageEnv(job, key)` = `withUsage(env, {feature:'artifact', req: new Request('https://explain/job', {headers:{'x-rh-action-key': key}})})` + `noteUsageIdentity(scoped, job.owner)`. The DO's transport calls `spendTransport(usageEnv, ..., {userId, category:'explain', provider, kind})`. This is the template for `RoadmapJobs`. |
| Balance | `learn-usage.js:447-465` | used = settled cost - refunded; held = `reserved` attempts inside `HOLD_SECONDS` (`artifact: 3600`, default 1800, backstop 24 h); available = allowance - used - held. An attempt that ends with unknown cost holds nothing and charges zero (`:453-458`). |
| Refunds | `learn-usage.js:409-419` `refundAttempt(db, attemptId, {reason, micros})` | One guarded UPDATE on `usage_attempt_detail.refunded_micros` (only when 0 and the attempt is `settled` with cost > 0), then an audit row in `usage_adjustments`. Replay-safe per attempt. `refundActionByKey(db, userId, clientKey, reason)` (`:425`) refunds every settled attempt of an action. |
| Platform guard | `learn-spend-ledger.js:9,29-33` | Global per day: `USAGE_PLATFORM_DAY` operations (default 2000) and `USAGE_PLATFORM_DAY_USD` (unset = every call refused, `cap_unset`). No per-learner term. |
| How `generateArtifact` is charged | `learn-artifact.js:77-135` | It never talks to the ledger. It calls the injected `callModel(env, body, model, org)` (default `loggedModel('artifact', planModel)`, `learn-artifact.js:77`); `planModel` -> `anthropic()` or OpenAI (`ask.js:271-285`); `anthropic()` ends in `spendTransport(env, boundedBody, pricedModel, org, ..., { provider })` (`ask.js:311`): the identity argument carries only `provider`. Each call (the first and the one allowed repair, `ARTIFACT_REPAIRS = 1`, `learn-models.js:242`) is its own admission with its own random op id, under whatever usage context `env` holds. On `/api/learn/artifact` that context is the request's (feature `artifact`, `dev-worker.js` boundary via `usageFeature`, `learn-usage.js:49`); the response boundary refunds a failed (non-2xx) route (`refundFailedAction`, `:391`). |

## 2. Payers (v1.4 5.1) mapped to contexts

| Stage | Payer | Usage context in `RoadmapJobs` | Notes |
|---|---|---|---|
| Subject / invitation | Rabbit Hole | `withSystemUsage(env, 'roadmap')` | platform guard + roadmap quota |
| Plan draft, plan revision | Rabbit Hole | same | Opus 5.5; the largest platform stage |
| Proposal composition (and R5 Quick Edit) | Rabbit Hole | same | |
| Checking (support check, escalation, safety) | Rabbit Hole | same | JEV is platform-funded in the price registry (`pricing-registry.js:62-64`, note "platform-funded") |
| Text/table generation of an accepted step | Learner (the acting learner, `access.payer`) | `usageEnv`-style: `withUsage(env, {feature:'artifact', req: Request(headers {'x-rh-action-key': 'rmact_<proposalId>_<version>'})})` + `noteUsageIdentity(scoped, {userId, email})` | `feature:'artifact'` is reused on purpose: existing label in Settings usage, existing `HOLD_SECONDS`, no change to Lead-only `learn-usage.js`. A new feature string is the alternative (Lead decision). |
| Assessment | Free (R9) | n/a | `FREE_FEATURES` (`learn-usage.js:29`) |
| Link to existing card | zero-priced | none | record `billing = zero_priced`, no admission (R5) |

A provider label such as `provider:platform` alone selects nothing: `identity.userId` only labels a ledger row (`learn-spend.js:82-83`, comment at the `admitSpend` call). The payer comes from the context only. Before R14 the acting learner is the board owner; R14 must make `access.payer` the editor.

## 3. Trusted server-only operation-ID hook (patch DESCRIPTION, not applied)

Gap: `spendTransport` always generates a fresh random `opId` (`learn-spend.js:78`) and `anthropic()` passes it no identity beyond `provider` (`ask.js:311`). v1.4 5.1 requires a stable ID that reaches the transport that performs admission, not an unused `attemptId` argument, and that caller input cannot choose.

Patch (Lead-only files `learn-usage.js`, `learn-spend.js`; a Symbol-on-env carrier is how `withAttemptKind` already travels through `generateArtifact` without changing any `callModel` signature, `learn-usage.js:97`):

1. `learn-usage.js`: add `const OPERATION = Symbol('server operation id')`, `export const withOperationId = (env, id) => ({ ...env, [OPERATION]: id })`, `export const operationIdOf = env => env?.[OPERATION] ?? null`. A Symbol cannot be set from JSON, a header or a query; only code that holds the export can set it.
2. `learn-spend.js` `spendTransport`: replace `const opId = operationId(identity.category || 'provider')` with `const opId = operationIdOf(env) ?? operationId(...)`, validated against `^[a-z0-9._-]{16,120}$`; the Symbol is consumed once (delete from the per-call env copy handed to `transport`) so a retry inside the same wrapper cannot reuse it.
3. **Replay handling** (not optional): `admitSpend`'s two `catch` blocks turn a primary-key violation on `usage_operations.op_id` into `spend_schema_unavailable` / `allowance_unavailable` (`learn-spend-ledger.js:78-80,94-96`). With stable IDs a duplicate must instead be detected first: look up `usage_operations`/`usage_attempts` by `op_id`. If `settled`: return a typed "already settled" refusal so the caller reads its stored result from `roadmap_calls`/`roadmap_results` and does not call the provider. If `admitted`/`running` (unknown): return "in flight" and let reconciliation run (section 6). Never silently re-send.
4. Tests (failing on old code): same id twice -> one `usage_operations` row, one provider call, second returns the recorded outcome; an id from a request header/body is ignored; an id outside the pattern is refused; two different ids in one action are two attempts.

ID scheme (server-built, in `roadmap_calls.op_id`): `rm.<resultId or roadmapId>.<stage>.<callNo>.<retryNo>`, hashed (sha256 hex, 32 chars) and prefixed with the stage so the existing `usage_operations.category` index stays meaningful. It distinguishes proposal, version, card, stage, call and retry (5.1). `generateArtifact` makes up to two calls per card (first + repair): the adapter wraps `callModel` to set `withOperationId(env, op)` per call from a counter it owns (no change to `generateArtifact` needed for this part).

## 4. Aggregate allowance admission (D6, 5.2): what must exist

Requirement: before consuming acceptance or dispatching any card, atomically admit/reserve the whole step under one authorization; insufficient allowance leaves the proposal `pending` and nothing consumed; per-card allocation recorded; per-call admission consumes or transfers the allocation instead of reserving twice; unused allocation released at completion or terminal failure.

What exists: only a read-and-compare. `ExplainJobs.admitGeneration` (`explain-job.js:391`) checks `allowance - used` against the worst case, and its header says "that is a check, not a hold (a hold plus per-call admission would count twice in HELD_SUM)... Upgrade when the ledger can admit calls against a parent hold" (`explain-job.js:11-14`). So the parent hold is **not supported by current code**.

Specified change (Lead/State, `learn-spend-ledger.js`):

- `admitStepHold(db, env, { opId, clientKey, aggregateMicros, allocation })`: one D1 batch = (a) `INSERT INTO usage_attempts` a hold row (`kind 'tool'`, `cost_state 'reserved'`, `status 'running'`, `reserved_micros = aggregate`) guarded by the same `allowanceClause` used at `learn-spend-ledger.js:35`; (b) `INSERT INTO roadmap_authorizations`; (c) the proposal accept transition and result rows (these are roadmap tables, same LEARN_DB, so one batch). If (a) inserts nothing the batch inserts nothing and the route answers the existing refusal body (`allowance_limited`, 429), proposal still `pending`.
- Per-call `admitSpend(..., { parentHold })`: the allowance clause subtracts the named hold's current `reserved_micros` from `heldSum` and, in the same batch, decrements the hold by the call's reservation (`UPDATE usage_attempts SET reserved_micros = reserved_micros - ? WHERE attempt_id = ? AND reserved_micros >= ?`). Refuse if the hold has less than the call needs (then the card's bounded retry authorization fails closed).
- Completion/terminal failure: `releaseStepHold` sets the hold row `status 'settled', cost_state 'settled', cost_micros 0` and `roadmap_authorizations.state = 'released'`.
- Step deadline must be shorter than the hold window: `releaseStaleHolds` seals running attempts after `HOLD_SECONDS` (`artifact` 3600 s) as failed/unknown (`learn-usage.js:286-296`), which would silently drop the step hold. Contract: overall step generation deadline <= 15 minutes (versioned policy).
- Worst-case number: sum of `requestSpendBound` for the (at most 2) calls per card (`learn-spend.js:14`); for R4's one-card step that is the artifact task bound (`maxTokens` 4000 at `learn-models.js:113`).
- Platform side is separate: every per-call admission still passes the platform guard (`PLATFORM_INSERT`); the learner hold does not replace it.

If State prefers not to touch `admitSpend` in R4, the safe fallback is to keep the existing per-call admission, add the aggregate **check** (not hold) as `ExplainJobs` does, and accept that a concurrent spend elsewhere can refuse the card's call after Tab consumed acceptance. That fallback breaks the roadmap's "insufficient allowance consumes nothing" for the narrow race only; it must be named in the R4 receipt if chosen. (Recommended: build the hold; it is the main money guarantee of R4.)

## 5. Quota reservation counters (D14)

Existing guard is global (`platformCaps`: operations per day default 2000, USD per day, `learn-spend-ledger.js:9`). Per-learner work quotas do not exist. Contract: table `roadmap_quota (org, owner_user_id, scope, window_start, calls, micros)`; before each platform call run `INSERT ... ON CONFLICT DO UPDATE SET calls = calls + 1 WHERE calls < ?` and refuse (typed `quota_exhausted`, learner sentence in `ui.md`) when it changes nothing; after the call settle or release (`calls - 1` only when the provider was not reached). Scopes in R4: `plan` (drafts+revisions), `propose`, `check`, `invite`; windows hour and day; limits live in `ROADMAP_POLICY` (proposed numbers are provisional and not budget approval, D14). A crash between reservation and call leaves the counter incremented until the window ends: conservative, acceptable. Not atomic with `admitSpend` (separate batches): the order is quota reserve -> `admitSpend` -> call -> settle -> quota settle.

## 6. Failure classes, refunds, unknown outcomes (5.2)

| Event | Action | Existing support |
|---|---|---|
| Clarification, unsupported/disabled format, authorization or policy refusal | No retry, no charge; step -> `incomplete` (Replace/Omit) | none needed |
| Eligible transient failure (provider 5xx/timeout with settled cost, malformed output after the one repair) | Refund the card's learner attempts (`refundAttempt` per op in `roadmap_calls` where `result_id = ? AND payer = 'learner'`), then ONE automatic retry with a new op id (`retryNo + 1`) inside the same hold; its provider expense stays recorded | `refundAttempt` exists and is replay-safe; the mapping op -> card is new (`roadmap_calls`) |
| Retry fails | Card `failed`, refund affected attempts, step `incomplete`; delivered siblings keep their charges | same |
| Explicit later Retry (Chat/ToC) | Fresh op ids and its own bounded authorization (new `roadmap_authorizations` row with `attempt + 1`) | new |
| Provider outcome unknown (stream incomplete, connection dropped, DO evicted) | `spendTransport` already leaves the attempt `cost_state = unknown`, cost NULL, charge zero, platform bound kept (`learn-usage.js:453-458`, `learn-spend.js` `finish`). Roadmap sets `roadmap_calls.state = 'unknown'`, `result.reconciliation = 'required'`. The same op is **never resent** (stable id + section 3.3). Reconciliation = mark `complete` after the platform bound is accepted as spent and decide: retry with a fresh op or Replace/Omit. No provider lookup exists in the repo (unverified that the provider offers one) | partial: `ExplainJobs.reconcile` (`explain-job.js:616`) marks the call unknown and fails the job retryably; same behavior |
| Generated but checking unavailable | Result `validation = held`; bounded check retry/adjudication; on terminal inability refund the card and keep the unavailable result for diagnosis (retention: records.md 4). Never leave a charge on a held card | refund primitive exists; held state new |
| Charge succeeded, placement ack lost | Not a new purchase: `deliver` is idempotent; server reads saved board state (`learn_boards.state_json`) for the minted `card_id` to distinguish unacknowledged from lost before any refund | read exists (`explain-job.js:360` reads `state_json`); the probe is new |
| Recovery after refund | A refunded result is never silently charged or published: `billing refunded -> pending` only with a new authorized recovery action (`states.js` `RECOVERY_ONLY`) | state rule in module |

`usage_attempts.kind` has a CHECK list (`routing generation repair retry evaluation escalation tool media`, `learn-migrations/0022`): use `generation` (first), `repair` (artifact repair), `retry` (automatic retry), `evaluation` (support check), `escalation` (one Opus escalation), `tool` (hold row). No new kind and no schema change.

## 7. What the ledger records versus what the learner is charged

R4 learner charge = the settled provider cost of the learner-payer attempts (`USED_SUM`, `learn-usage.js:451`), identical to every other chargeable feature today (price version in `usage_attempt_detail`, `notePrice`). There is no separate learner price, no result-to-operation mapping and no `admitLearnerCharge`; those are R11 (v1.4 5.3). Do not build them in R4. Users see AI credits only (CLAUDE.md standing rule): nothing in `RoadmapView` carries dollars, micros, models or prices (api.md 6).

## 8. Where existing code does NOT yet support the contract (State's plan list)

1. No caller-supplied operation id; `opId` is random per call (`learn-spend.js:78`). Needs section 3.
2. A duplicate `op_id` is reported as an unrelated refusal (`learn-spend-ledger.js:78-80,94-96`). Needs section 3.3.
3. No parent hold / transfer; the explain job documents it as a known shortcut (`explain-job.js:11-14`). Needs section 4.
4. No per-learner platform quota; only global caps (`learn-spend-ledger.js:9`). Needs section 5 and `roadmap_quota`.
5. `anthropic()` passes only `{ provider }` to `spendTransport` (`ask.js:311`); category/kind/userId are not carried through `callModel`. The env-Symbol carrier avoids changing the signature; alternatively extend `callModel`'s identity argument (more edits).
6. `withSystemUsage` records platform work with `user_id` NULL (`learn-usage.js:117-121`): per-learner attribution of platform spend exists only in `roadmap_calls`, so an owner report by learner must join that table. The owner telemetry for platform spend by learner (D15) is R11.
7. Refunds are per attempt; there is no attempt -> card mapping outside the new `roadmap_calls`. The route-level `refundFailedAction` (`learn-usage.js:391`) works on HTTP failure of a request and does not apply to DO work.
8. `generateArtifact` may route to OpenAI when `OPENAI_API_KEY` and `LEARN_PLAN_MODEL` are both set (`ask.js:271`, `learn-models.js:121`): the provider, price table and admission identity change, and the learner could be charged an OpenAI-priced call. Contract: the adapter forces the `anthropic` path, or Lead pins a `roadmap_card` task (adapter.md 6). Whether the dev worker has those variables set is unverified.
9. The `artifact` task model is `ASK_MODELS.auto = 'claude-opus-5'` (`learn-models.js:14,113`), i.e. $5/$25 per MTok (`pricing-registry.js:42`), not Opus 5.5 ($4/$20, line 43) and not Sonnet. Cost estimate in `decision-records.md` uses it as the conservative bound.
10. `HOLD_SECONDS.artifact = 3600` (`learn-usage.js:461`): step deadline must stay below it (section 4).
11. `spendTransport` returns early with no admission when `SMALL_ENV === 'test'` or `SUBSCRIPTION_ONLY === 'true'` (`learn-spend.js:67,69`). Tests of money paths must set the enforcement on, as `learn-usage.test.js` does.
12. The roadmap DO runs outside a request: it needs the payer forwarded the way `forwardUsagePayer`/`usageFromForwarded` do (`learn-usage.js:254-267`, header `x-rh-usage-payer`), or the `job.owner` pattern in `ExplainJobs`; the owner identity is stored on the roadmap row at creation.

13. JEV does not go through `spendTransport`: `askJev` admits each POST itself with `operationId('jev')` (`learn-grade-jev.js:150`), so the operation-id hook (section 3) must also be applied there for the safety screen, or the screen stays unkeyed (its cost is negligible, $0.042/MTok input; the risk is only duplicate admission on a replayed stage).

## 9. Tests State must write (money)

Two concurrent accepts (one hold, one card, one charge); accept with insufficient allowance (proposal `pending`, zero rows consumed); crash at each write boundary of the accept batch (nothing half-applied: single batch); hold released on completion and on terminal failure; replay of the same op id (no second provider call); unknown outcome never resent; refund-then-retry order; refund replay (second refund is 0); held card refunded on terminal check failure; ack lost then reload (one card, one charge); Ask mode with accepted work in flight (finishes and delivers); flag off during generation and after settlement (v1.4 4.1), restored with no duplicate charge.
