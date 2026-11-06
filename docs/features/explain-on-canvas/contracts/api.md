# R4 contract: roadmap API

Status: DRAFT CONTRACT. No route exists on main. Reconciled with the implementation checklist (`checklist-map.md`): wire field `revision` is the checklist's `revision` (the roadmap revision the client last saw; the first draft called it `expectedRevision`), and function names are in section 11. Fixtures: `contracts/fixtures/*.json` (27 API files including `index.json`, plus `planner-double.json`). Every request and response below has a fixture of the same name. The UI builds against the fixtures; State builds the routes to produce them. States and error codes come from `states.md` / `src/roadmap/roadmap-contract.js`.

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

## 2. The access object (`RoadmapAccess`, checklist 2.1 and R4.01)

Built once per request by the route from the authenticated session and policy, and passed to every store, job and billing call. Never read from a body, header or query. The roadmap Durable Object has no signed-in request: it rebuilds the same object from the identity stored on the roadmap row (`org`, `owner_user_id`, `owner_email`, `board_id`) and re-verifies it in D1 before every stage (section 12).

```js
access = {                                      // roadmap-contract.js ACCESS_FIELDS, validateAccess()
  org: user.org,                                // repositoryIdentity
  actorUserId: user.userId, actorEmail: user.email,
  boardId, boardOwnerEmail,                     // the learn_boards row resolved above (id, owner_email)
  role: 'owner',                                // before R14 anything else is 404 Not available
  payerUserId: user.userId,                     // the learner pays accepted generation; platform stages use withSystemUsage (billing.md 2)
}
```

Before R14 `validateAccess` requires `role = owner`, `actorEmail = boardOwnerEmail` and `payerUserId = actorUserId`. Re-checked (the board row and `role`) at accept, generation start, delivery, ack and resume. R14 later allows `boardOwnerEmail !== actorEmail` with a membership check; code must not assume equality. Revoked access: the action returns 403 `forbidden`, no further call is admitted, the audit rows stay.

## 3. Common request and response shapes

Mutating request: `{ boardId, revision: int, actionKey: string, ...action fields }`. `revision` is mandatory on every mutation except create and invitation routes. Mutating response: `200` (applied or recorded replay) or `202` (work continues in the background) with a `RoadmapView`. Replays return the recorded status and body unchanged (fixture `accept-proposal-replay`).

`RoadmapView` (every status and mutating response; fixtures show it in each state):

```
roadmap   { id, boardId, state, revision, planVersion, acceptedPlanVersion|null, depth, practiceMode:'explanations', instruction, language,
            scope:{kind:'whole'|'passage', source:{key,rev,name}, chars, fingerprint}, ceiling, deliveredCount, mode, modeRevision, createdAt, updatedAt }
question  null | { id, kind:'focus'|'conflict'|'language'|'scope', text, options? }       // at most one; roadmap.state = questioning
limitation null | { code, message, readChars, sourceChars, offers:[{kind,label}] }       // e.g. source_too_large
plan      null | { version, outcome, assumptions[], formats:['explanation','table'], steps[], stoppingPoint }
steps     [{ id, position, title, goal, format, passage:{start,end}, sourceRef|null, state }]   // sourceRef = R3 SourceRef, minted at Accept plan; passage = private offsets
proposal  null | { id, stepId, version, state, title, description, format, sourceRelation:{kind, sourceRef}, position:{index,total}, acceptable }
results   [{ id, stepId, proposalVersion, resultVersion, slot:{index,cardId}, generation, delivery, billing, held?, failure? }]   // accepted work only; NO body. No recovery set (owner 2026-11-06)
nextStepReady  boolean                                                                   // drives the Next step ready indicator
poll      { afterMs, etag }
```

`instruction` is the learner's original words, returned verbatim and never replaced by an inferred topic (v1.4 3.5, 4.2).

## 4. Routes

Every row has request/response fixtures. "G" = GET, "P" = POST. Guards listed are checked in this order: flag, method, origin, identity, board ownership, body validation, `resolveAction` (replay or 409), state/action rule (`actionStartsFrom`), then the transition.

| # | Route | Purpose | Allowed from | Fixtures |
|---|---|---|---|---|
| 1 | `P /invitations` `{ boardId, sourceKeys[], idleKey }` | Client reports a supported source finished importing and Chat idle (grouped by idle window). Server decides: offer, or suppress (Auto-suggest off, mode Ask, an unfinished roadmap exists, same source revision already offered/dismissed) | any | `invitation-offered`, `invitation-suppressed` |
| 2 | `G /invitations?boardId` | Pending invitation, if any (reload, second device) | any | `invitation-offered` |
| 3 | `P /invitations/:iv/dismiss` `{ boardId, actionKey }` | Dismisses that invitation only | offered | `invitation-dismiss` |
| 4 | `P /` create from invitation, source or passage: `{ boardId, invitationId?, source:{key, rev, scope:{kind:'whole'} \| {kind:'passage', sourceRefId}}, instruction, depth, actionKey }` | Creates the one unfinished roadmap (409 `roadmap_unfinished_exists` otherwise). The source is R3's `key` (`file:fs_...`) and `rev` (the sha256 of its stored bytes). For a passage, `sourceRefId` is the `sref_` id R3 minted when the learner selected it; the server re-reads it under the session (R3 `trustedSourceRef`), finds its quote in the source text exactly once and derives the offsets (zero or several matches are `needs_clarification`). The scope text is snapshotted here (section 12). 202, state `draft`, planning in the background | none unfinished | `create-request`, `create-response-draft` |
| 5 | `G /?boardId` | Status/poll (section 6) | any | every `status-*` |
| 6 | `P /:rm/answer` `{ revision, actionKey, questionId, optionId?, text? }` | Answer the single focused question; planning resumes | questioning | `status-questioning` |
| 7 | `P /:rm/revise` `{ revision, actionKey, instruction?, settings?:{depth}, scope? }` | Draft or revise the plan. Instruction edits are appended as a new instruction version; the original instruction row is never overwritten. A material change returns a new plan version needing acceptance | questioning proposed active paused completed | `revise-request` |
| 8 | `P /:rm/accept-plan` `{ revision, actionKey, planVersion }` | Accept plan. Authorizes no generation and charges nothing. `proposed -> active`. This request has the signed-in session, so here the server mints each step's R3 `sourceRef` and stores `source_ref_id` on the step (section 12) | proposed | `accept-plan-request` |
| 9 | `P /:rm/steps/propose` `{ revision, actionKey }` | Manual Propose next step (the only trigger in R4; auto = R6). It selects the next independent `planned` step and never a `cancelled` one: revisiting a cancelled position needs an explicit request through Chat or plan revision and a fresh proposal version, and a step that depends on cancelled content needs a focused question or accepted revision first (checklist R4.12). One offered step at a time: 409 `proposal_not_pending` if one is `checking/held/pending` | active paused | `status-active-proposal-pending` |
| 10 | `P /:rm/proposals/:pr/accept` `{ revision, actionKey, proposalVersion }` | Tab/Accept. In one guarded batch: validate `canAcceptProposal`, aggregate allowance admit (D6, billing.md 4), consume acceptance, mint result rows and `cardId`s, enqueue generation. 202 | active | `accept-proposal-request`, `...-response-generating`, `-replay`, `error-stale-409`, `error-insufficient-allowance` |
| 11 | `P /:rm/proposals/:pr/cancel` `{ revision, actionKey, proposalVersion }` | Cancel: proposal `cancelled`, step `cancelled`, roadmap `paused` (progression stops) | active | `status-cancelled-paused` |
| 12 | `G /:rm/results/:rs?boardId` | Result body. Entitlement predicate (section 5). 404 `not_found` when not entitled | any | `result-deliver-response`, `error-forbidden-read` |
| 13 | `P /:rm/results/:rs/deliver` `{ boardId, revision, actionKey }` | Runs `canDeliver`; returns the authorized `cards[]` (idempotent: same blocks every call). Also the resume path after reload or a second device | active paused | `result-deliver-response` |
| 14 | `P /:rm/results/:rs/ack` `{ revision, actionKey, resultVersion, cardId, boardRevision }` | `acknowledgeRoadmapDelivery`: the client inserted the card and the board save succeeded. Sets delivery `delivered`, step `delivered`, `deliveredCount`. The server verifies `cardId` is the minted slot of that `resultVersion` and, where available, that it is in the saved board (never accepts another id) | active paused | `result-ack-request` |
| 15 | `P /:rm/results/:rs/removed` `{ revision, actionKey, cardId }` | Card deleted from the canvas (persisted). delivery `removed`; record kept; no refund (D7) | any unfinished or completed | none (trivial) |
| 16 | ~~`P /:rm/steps/:st/retry` / `replace` / `omit`~~ | **Removed (owner 2026-11-06: no Retry, Replace or Omit on explanation cards).** A failed card is refunded, its step is closed (`skipped`) and the roadmap moves on: `card_failed` triggers the R6 automatic next step, and Propose next step is available. The failure sentence is shown once through the existing error toast | - | `status-failed-card` |
| 17 | `P /:rm/mode` `{ revision?, mode:'auto'\|'ask'\|'tutor' }` | Records the mode fact; server increments `modeRevision` per distinct change. Ask pauses new initiative (no invitation, no proposal); accepted work still finishes. Idempotent by value | any unfinished | none |
| 18 | `P /:rm/end` `{ revision, actionKey }` | End roadmap: `ended`; delivered cards and history kept | draft..completed | `end-request` |
| 19 | `G /?boardId&history=1` | Optional: ended/completed roadmaps for the ToC history | any | none |

Paths are relative to `/api/learn/roadmap`. `:rm`, `:pr`, `:st`, `:rs` must belong to the same `(org, owner_user_id, app, board)` as the access object.

## 5. Entitlement predicate (4.4) for every result and asset route

One server function `entitledRoadmapResult(access, result)` calls `resultReadable` from `roadmap-contract.js` with: `access` true only when `result.org/owner_user_id/app/board` equal the access object and the board still resolves; `decision = accepted`; `generation = generated`; `validation = passed` and not stale; `billing in {settled, zero_priced}`; reconciliation not `required`; or `delivery in {delivered, removed}` for an already-published result. It guards:

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

`{ error: <learner sentence>, code, current?: RoadmapView }`. Every 409 also carries the checklist's conflict reply `{ code, currentRevision, currentProposalVersion }` (`conflictReply()` in the contract module).

| Status | code | When |
|---|---|---|
| 404 | `roadmap_disabled` | `ROADMAP_ENABLED !== 'true'` (every route, before anything else) |
| 404 | `not_found` | unknown id, other learner's id, not entitled, unknown board |
| 403 | `forbidden` | origin mismatch (`Invalid origin`), revoked access (R14) |
| 400 | `invalid_request` | body/enum/length validation |
| 409 | `stale_revision`, `action_key_reused`, `invalid_transition`, `roadmap_unfinished_exists`, `proposal_not_pending`, `proposal_not_checked`, `roadmap_not_active`, `source_changed`, `held_for_checking`, `reconciliation_required` | per `roadmap-contract.js` `ERROR_CODES` |
| 422 | `source_unsupported`, `source_too_large`, `needs_clarification` | create/revise on an unsupported or oversize source, or a request needing a focused question (response also carries `question`/`limitation`) |
| 429 | `allowance_limited` / `spend_limited` | existing refusal body, from `refusalBody`; proposal stays pending |
| 503 | `allowance_limited` (reason `unavailable`) | credits cannot be checked |

## 9. Rate and size bounds proposed (versioned runtime policy, 5.5)

`instruction` <= 1000 chars (matches `args` cap at `learn-artifact.js:177`), body <= 20 KB (same file), `actionKey` regex above, `sourceIds` <= 8, plan steps <= ceiling (5/10/15 by depth), cards per step <= 3 (R4 ships 1 per step, D45). All are defaults in one `ROADMAP_POLICY` object with a `version` string; changing a security/billing/scope bound needs its focused check (v1.4 8.3).

## 10. Not in this contract

Feature flag wiring and routing mount (`dev-worker.js`, `index.js`) are Lead-only. The route table above fixes paths and shapes, not where they are mounted. The `RoadmapJobs` DO binding and its wrangler migration tag (`new_sqlite_classes`, as `explain-jobs-1` at `wrangler.rabbit-hole-prod.jsonc:47`) are Lead-owned config.

## 11. Names: checklist 2.1 identifiers and where they appear here

The implementation checklist (`tutor-implementation-checklist.md` 2.1) names the integration functions. They are the names in all of these documents; the HTTP routes above are the transport for them.

| Checklist identifier | Meaning here | Route / document |
|---|---|---|
| `RoadmapAccess` | section 2 | every route |
| `applyRoadmapAction(access, action)` | the guarded D1 batch that records the winning action receipt and applies a state transition (R4.02) | every mutating route; states.md 4 (`resolveAction`) |
| `acceptRoadmapStep(access, {roadmapId, revision, proposalId, proposalVersion, actionKey})` | validates the bound content and commits the accepted transition and the whole-step authorization in one batch | route 10 |
| `admitStepAuthorization` / `consumeStepAllocation` | aggregate learner hold, per-card allocation, per-call transfer | billing.md 4 |
| `withRoadmapProviderCall(env, {proposalId, proposalVersion, cardId, stage, call, retry, authorizationId})` | trusted provider-operation identity | billing.md 3 |
| `entitledRoadmapResult(access, result)` | the 4.4 predicate for every result and asset route | section 5; contract module |
| `acknowledgeRoadmapDelivery(access, {resultId, resultVersion, cardId, boardRevision})` | placement acknowledgement | route 14 |
| `generateRoadmapCard(env, access, {authorizationId, resultId, resultVersion})` | the trusted text/table adapter | adapter.md |
| `readRoadmapSource(access, {sourceId, sourceVersion, scope})` | bounded Markdown read | planning.md 4; section 12 |
| `runRoadmapTool(access, {name, args, purpose, contextVersion, budget})` | closed typed registry | `roadmap-tools.js` (the draft takes `(call, options)`; State adds the `access` argument when it wires handlers) |
| `appendRoadmapEventStatements(fact)` / `claimRoadmapEvent({eventId, leaseToken, leaseUntil})` / `commitRoadmapEventEffect(...)` | outbox | records.md 2 |

The checklist's `sourceId` / `sourceVersion` arguments are R3's `key` / `rev`: `readRoadmapSource`'s `sourceId` is the `file:fs_...` key and `sourceVersion` the sha256 revision.

## 12. Source references and the request-less Durable Object (R3's gap)

R3 (lane `tutor-r3`, `source-ref.js`, `source-refs.js`) mints and re-reads a `SourceRef` `{ v: 1, id: 'sref_<24 hex>', kind: 'markdown'|'pdf', source: { key, rev, name, home }, anchor }` where a Markdown anchor is a text quote `{ quote: { exact, prefix, suffix } }`. Its reads are request-bound: `readSource(req, env, ...)` calls `authorizedBoardApp(req, ...)` and `authorizeFileSource(req, ...)`, which resolve the signed-in session (`pdf-excerpts.js`). `RoadmapJobs` runs in an alarm with no signed-in `Request`. The contract:

1. **Everything that needs the session happens in a request handler, once.** On create (and on a scope revision) the handler reads the declared Markdown scope with the learner's session, checks it against `ROADMAP_LIMITS.source.chars`, and writes a **scope snapshot**: the exact text (hash-bound, `scope_fingerprint`) to `LEARN_MEDIA` under `roadmap-scope/<roadmapId>/<fingerprint>` (`learn_roadmaps.scope_snapshot_key`). The snapshot is private roadmap data, deleted with the roadmap, never in board state, shares or forks. Planning, proposals, grounding checks and the adapter's `context` all read the snapshot, never the live source.
2. **Plan-time minting.** At Accept plan (route 8, session present) the handler mints one R3 `sourceRef` per step: the step's quote anchor is `{ exact: <the step passage, <= 8000 chars>, prefix, suffix }` taken from the snapshot, minted through R3's create logic (`sref_` id, revision = the source's sha256). The ids are stored on `learn_roadmap_steps.source_ref_id` and `learn_step_proposals.source_ref_id`. If a mint is refused (`source_changed`, `source_unavailable`) the plan stays `proposed` with `source_changed` and nothing is accepted.
3. **Request-less revalidation in the DO** (`roadmap-source.js`, `revalidateSourceAsJob`): before every provider call that uses the source and at delivery, with no `Request`: (a) the board row `learn_boards WHERE id = ? AND org = ? AND owner_email = ?` still exists for the stored actor; (b) the source row `file_sources WHERE id = ? AND org = ? AND owner_email = ? AND status = 'stored'` exists and its `sha256` equals the snapshot's `source_rev` (this is the owner branch of `authorizeFileSource`, `file-access.js:25-40`, evaluated against the stored identity); (c) otherwise the result is `source_changed` or `source_unavailable`, the stage stops **before** admission and nothing is spent. This is the only place a stored identity stands in for a session, and only for the owner of the board: R14 must replace it with a membership check.
4. **Delivered card.** The adapter attaches `sourceRef` (R3's `publicRef(row)` read by id from `learn_source_refs` with `org` + `owner_email`, no session needed) as metadata exactly as R3's `artifactFetch` does (`{ ...out.block, sourceRef: passage }`); the model never sees or writes it. R3's `learn_source_ref_cards` index is written by the board save, which is the learner's request, so the ack path needs nothing more.
5. **Shape mapping.** The checklist's `SourceRef` `{ source_key, source_rev, kind, anchor }` is the locator view of R3's shape: `source_key = source.key`, `source_rev = source.rev`, `kind` and `anchor` equal (`sourceLocator()` in the contract module). R3's `current/changed/missing/unavailable` map to the checklist's `resolved/changed/missing/inaccessible` (`SOURCE_STATUS_MAP`); `unsupported` has no R3 status and is refused before minting (any key that is not a `file:fs_...` Markdown source in R4). Requests carry `sourceRefId` (R3), never a client-built anchor.
6. **Two anchors, on purpose.** `steps[].passage = { start, end }` are character offsets into the snapshot: private, server-only, used by the validator and for coverage. `sourceRef.anchor.quote` is R3's durable, navigable anchor. They are linked at mint time and never compared at read time.
