# R4 contract: roadmap API

Status: DRAFT CONTRACT. No route exists on main. Fixtures: `contracts/fixtures/*.json` (27 files, `index.json` lists them). Every request and response below has a fixture of the same name. The UI builds against the fixtures; State builds the routes to produce them. States and error codes come from `states.md` / `src/roadmap/states.js`.

## 1. Conventions copied from code that exists

| Convention | Source on main (`4102f8ea0`) |
|---|---|
| Owner-only today: board looked up with `SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?`; else 404 `Not available` | `explain-job.js:207` (`explainRoute`) |
| Identity = `repositoryIdentity(req, env)` (session, optional `x-small-workspace` must equal `user.org`) | `repositories.js:50-55` |
| Same-origin check on non-GET (`Origin` header must equal request origin, else 403 `Invalid origin`) | `explain-job.js:199`, `learn-artifact.js:171` |
| Flag off = 404 `{ error, code }` as if absent | `explain-job.js:196` (`explainEnabled`, `EXPLAIN_V2_ENABLED === 'true'`) |
| `Cache-Control: no-store` on every JSON reply | `explain-job.js:43` |
| Client action key regex `^[A-Za-z0-9_-]{8,128}$` | `learn-usage.js:78` (`CLIENT_KEY`), `explain-job.js:45` (`KEY`) |
| Spend refusal body `{ error, code: 'allowance_limited'\|'spend_limited', reason, period?, resetsAt? }`, 429 (503 when `reason = unavailable`) | `learn-spend-ledger.js:139-148` |
| One Durable Object per learner and board coordinates background stages | v1.4 4.1; precedent `ExplainJobs` (`idFromName(board.id)`, `explain-job.js`) |

Prefix: `/api/learn/roadmap`. All routes: JSON, `boardId` in the body (POST) or `?boardId=` (GET). IDs are server-minted: `rm_` roadmap, `iv_` invitation, `st_` step, `pr_` proposal, `rs_` result, `cd_` card (each prefix + 24 hex; card ids satisfy the existing `KEY` regex so board code accepts them). A client-supplied id is never proof of access: every id is re-resolved under `(org, owner_user_id, app, board)`.

## 2. The access object

Built once per request by the route, passed to every store, job and billing call. Never read from a body, header or query.

```js
access = {
  organization: user.org,                       // repositoryIdentity
  actingLearner: { userId: user.userId, email: user.email },
  board: { id, app, board, ownerEmail },        // the learn_boards row resolved above
  role: 'owner',                                // before R14 anything else is 404 Not available
  payer: { kind: 'learner' | 'platform', userId: string | null },  // per stage, see billing.md section 5
}
```

Re-checked (the board row and `role`) at accept, generation start, delivery, ack and resume. R14 later adds `board.ownerEmail !== actingLearner.email` with a membership check; code must not assume equality. Revoked access: the action returns 403 `forbidden`, no further call is admitted, the audit rows stay.

## 3. Common request and response shapes

Mutating request: `{ boardId, expectedRevision: int, actionKey: string, ...action fields }`. `expectedRevision` is mandatory on every mutation except create and invitation routes. Mutating response: `200` (applied or recorded replay) or `202` (work continues in the background) with a `RoadmapView`. Replays return the recorded status and body unchanged (fixture `accept-proposal-replay`).

`RoadmapView` (every status and mutating response; fixtures show it in each state):

```
roadmap   { id, boardId, state, revision, planVersion, acceptedPlanVersion|null, depth, practiceMode:'explanations', instruction, language,
            scope:{kind:'whole'|'passage', sourceId, revision, anchor?}, ceiling, deliveredCount, mode, modeRevision, createdAt, updatedAt }
question  null | { id, kind:'focus'|'conflict'|'language'|'scope', text, options? }       // at most one; roadmap.state = questioning
limitation null | { code, message, readChars, sourceChars, offers:[{kind,label}] }       // e.g. source_too_large
plan      null | { version, outcome, assumptions[], formats:['explanation','table'], steps[], stoppingPoint }
steps     [{ id, position, title, goal, sourceRef, state }]                              // step states from states.js
proposal  null | { id, stepId, version, state, title, description, format, sourceRelation, position:{index,total}, acceptable }
results   [{ id, stepId, proposalVersion, slot:{index,cardId}, generation, delivery, billing, held?, failure?, recovery? }]   // accepted work only; NO body
nextStepReady  boolean                                                                   // drives the Next step ready indicator
poll      { afterMs, etag }
```

`instruction` is the learner's original words, returned verbatim and never replaced by an inferred topic (v1.4 3.5, 4.2).

## 4. Routes

Every row has request/response fixtures. "G" = GET, "P" = POST. Guards listed are checked in this order: flag, method, origin, identity, board ownership, body validation, `resolveAction` (replay or 409), state/action rule (`actionStartsFrom`), then the transition.

| # | Route | Purpose | Allowed from | Fixtures |
|---|---|---|---|---|
| 1 | `P /invitations` `{ boardId, sourceIds[], idleKey }` | Client reports a supported source finished importing and Chat idle (grouped by idle window). Server decides: offer, or suppress (Auto-suggest off, mode Ask, an unfinished roadmap exists, same source revision already offered/dismissed) | any | `invitation-offered`, `invitation-suppressed` |
| 2 | `G /invitations?boardId` | Pending invitation, if any (reload, second device) | any | `invitation-offered` |
| 3 | `P /invitations/:iv/dismiss` `{ boardId, actionKey }` | Dismisses that invitation only | offered | `invitation-dismiss` |
| 4 | `P /` create from invitation, source or passage: `{ boardId, invitationId?, source:{sourceId, revision, scope:{kind:'whole'\|'passage', anchor?}}, instruction, depth, actionKey }` | Creates the one unfinished roadmap (409 `roadmap_unfinished_exists` otherwise). Source read and revision recorded here. 202, state `draft`, planning in the background | none unfinished | `create-request`, `create-response-draft` |
| 5 | `G /?boardId` | Status/poll (section 6) | any | every `status-*` |
| 6 | `P /:rm/answer` `{ expectedRevision, actionKey, questionId, optionId?, text? }` | Answer the single focused question; planning resumes | questioning | `status-questioning` |
| 7 | `P /:rm/revise` `{ expectedRevision, actionKey, instruction?, settings?:{depth}, scope? }` | Draft or revise the plan. Instruction edits are appended as a new instruction version; the original instruction row is never overwritten. A material change returns a new plan version needing acceptance | questioning proposed active paused completed | `revise-request` |
| 8 | `P /:rm/accept-plan` `{ expectedRevision, actionKey, planVersion }` | Accept plan. Authorizes no generation and charges nothing. `proposed -> active` | proposed | `accept-plan-request` |
| 9 | `P /:rm/steps/propose` `{ expectedRevision, actionKey }` | Manual Propose next step (the only trigger in R4; auto = R6). One offered step at a time: 409 `proposal_not_pending` if one is `checking/held/pending` | active paused | `status-active-proposal-pending` |
| 10 | `P /:rm/proposals/:pr/accept` `{ expectedRevision, actionKey, proposalVersion }` | Tab/Accept. In one guarded batch: validate `canAcceptProposal`, aggregate allowance admit (D6, billing.md 4), consume acceptance, mint result rows and `cardId`s, enqueue generation. 202 | active | `accept-proposal-request`, `...-response-generating`, `-replay`, `error-stale-409`, `error-insufficient-allowance` |
| 11 | `P /:rm/proposals/:pr/cancel` `{ expectedRevision, actionKey, proposalVersion }` | Cancel: proposal `cancelled`, step `cancelled`, roadmap `paused` (progression stops) | active | `status-cancelled-paused` |
| 12 | `G /:rm/results/:rs?boardId` | Result body. Entitlement predicate (section 5). 404 `not_found` when not entitled | any | `result-deliver-response`, `error-forbidden-read` |
| 13 | `P /:rm/results/:rs/deliver` `{ boardId, expectedRevision, actionKey }` | Runs `canDeliver`; returns the authorized `cards[]` (idempotent: same blocks every call). Also the resume path after reload or a second device | active paused | `result-deliver-response` |
| 14 | `P /:rm/results/:rs/ack` `{ expectedRevision, actionKey, boardVersion, cardIds[] }` | Client inserted the cards and the board save succeeded. Sets delivery `delivered`, steps `delivered`, `deliveredCount`. Server verifies `cardIds` equal the minted slots (never accepts other ids) | active paused | `result-ack-request` |
| 15 | `P /:rm/results/:rs/removed` `{ expectedRevision, actionKey, cardId }` | Card deleted from the canvas (persisted). delivery `removed`; record kept; no refund (D7) | any unfinished or completed | none (trivial) |
| 16 | `P /:rm/steps/:st/retry` / `replace` / `omit` `{ expectedRevision, actionKey }` | Failed card: Retry = fresh operation identity and its own bounded authorization (billing.md 6); Replace = new proposal for the step; Omit = step `skipped`. Same endpoints from Chat and ToC (D36) | active paused | `status-failed-card` |
| 17 | `P /:rm/mode` `{ expectedRevision?, mode:'auto'\|'ask'\|'tutor' }` | Records the mode fact; server increments `modeRevision` per distinct change. Ask pauses new initiative (no invitation, no proposal); accepted work still finishes. Idempotent by value | any unfinished | none |
| 18 | `P /:rm/end` `{ expectedRevision, actionKey }` | End roadmap: `ended`; delivered cards and history kept | draft..completed | `end-request` |
| 19 | `G /?boardId&history=1` | Optional: ended/completed roadmaps for the ToC history | any | none |

Paths are relative to `/api/learn/roadmap`. `:rm`, `:pr`, `:st`, `:rs` must belong to the same `(org, owner_user_id, app, board)` as the access object.

## 5. Entitlement predicate (4.4) for every result and asset route

One server function `entitled(access, result)` calls `resultReadable` from `states.js` with: `access` true only when `result.org/owner_user_id/app/board` equal the access object and the board still resolves; `decision = accepted`; `generation = generated`; `validation = passed` and not stale; `billing in {settled, zero_priced}`; reconciliation not `required`; or `delivery in {delivered, removed}` for an already-published result. It guards:

- `G /:rm/results/:rs` and `P .../deliver` (above);
- any generated asset under R2 (R4 has none: text/table only; the rule is fixed now so R12 cannot forget it);
- **the legacy job endpoints**: the roadmap adapter must not create `ExplainJobs` rows or any `/api/learn/artifact` response a client can poll, so no legacy route can ever return roadmap output. Test: `GET /api/learn/explain/jobs/...` and `POST /api/learn/artifact` never see a roadmap result id.
- shared views and forks: results are never in board state until delivered; delivered cards are ordinary cards (sanitizers: `records.md` section 5).

Not entitled = `404 { code: 'not_found' }`, identical to an unknown id.

## 6. What polling may return before acceptance

`G /?boardId` returns `RoadmapView`. Before the proposal is accepted it contains: roadmap fields, plan, steps, and **proposal metadata only** (title, description, format, source relationship, position). It must not contain generated text, table cells, answer keys, R2 keys, result ids, card ids, price, cost, token counts, safety category scores, model names or internal error text. After acceptance `results[]` appears with ids, slots, state dimensions and `failure.message` (a learner sentence); still no body: the body comes only from the entitled routes 12-13. Fixtures `status-active-proposal-pending` and `status-held-for-checking` are the negative examples a UI test asserts on.

Poll cadence: `poll.afterMs` (server-chosen: 1500 while generating/draft, 2000-5000 when idle, longer when only `proposed`/`paused`); `etag` equals `rv-<revision>`; client may send `If-None-Match` and receive 304. Second device and reload read the same state from D1 (v1.4 4.4). A tab never trusts its own optimistic state over the poll.

## 7. Idempotency keys and action identity

- Client key: `actionKey`, one per user gesture, reused by automatic retries (same rule as `X-RH-Action-Key`, `learn-usage.js:77`). Not an operation id: the server never uses it as a provider operation id.
- The learner's usage action for an accepted proposal version: `client_key = rmact_<proposalId>_<version>` (matches `CLIENT_KEY`), so `usage_actions UNIQUE (user_id, client_key)` (`learn-migrations/0022`) makes the learner's action single. This is server-derived, not client-supplied.
- Provider operation id: `rm.<resultId>.<stage>.<callNo>.<retryNo>` hashed to the ledger `op_id` shape. Server only. See billing.md 3.
- Action fingerprint: `sha256(actor | action | roadmapId | targetId | proposalVersion | planVersion | resultFingerprint)`.

## 8. Error codes

`{ error: <learner sentence>, code, current?: RoadmapView }`.

| Status | code | When |
|---|---|---|
| 404 | `roadmap_disabled` | `ROADMAP_ENABLED !== 'true'` (every route, before anything else) |
| 404 | `not_found` | unknown id, other learner's id, not entitled, unknown board |
| 403 | `forbidden` | origin mismatch (`Invalid origin`), revoked access (R14) |
| 400 | `invalid_request` | body/enum/length validation |
| 409 | `stale_revision`, `action_key_reused`, `invalid_transition`, `roadmap_unfinished_exists`, `proposal_not_pending`, `proposal_not_checked`, `roadmap_not_active`, `source_changed`, `held_for_checking`, `reconciliation_required` | per `states.js` `ERROR_CODES` |
| 422 | `source_unsupported`, `source_too_large`, `needs_clarification` | create/revise on an unsupported or oversize source, or a request needing a focused question (response also carries `question`/`limitation`) |
| 429 | `allowance_limited` / `spend_limited` | existing refusal body, from `refusalBody`; proposal stays pending |
| 503 | `allowance_limited` (reason `unavailable`) | credits cannot be checked |

## 9. Rate and size bounds proposed (versioned runtime policy, 5.5)

`instruction` <= 1000 chars (matches `args` cap at `learn-artifact.js:177`), body <= 20 KB (same file), `actionKey` regex above, `sourceIds` <= 8, plan steps <= ceiling (5/10/15 by depth), cards per step <= 3 (R4 ships 1 per step, D45). All are defaults in one `ROADMAP_POLICY` object with a `version` string; changing a security/billing/scope bound needs its focused check (v1.4 8.3).

## 10. Not in this contract

Feature flag wiring and routing mount (`dev-worker.js`, `index.js`) are Lead-only. The route table above fixes paths and shapes, not where they are mounted. The `RoadmapJobs` DO binding and its wrangler migration tag (`new_sqlite_classes`, as `explain-jobs-1` at `wrangler.rabbit-hole-prod.jsonc:47`) are Lead-owned config.
