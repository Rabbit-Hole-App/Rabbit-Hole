# R4 contract: records, retention and sharing sanitizers

Status: DRAFT CONTRACT, reconciled with the implementation checklist (R4.02, R4.07; `checklist-map.md`). SQL: two drafts in this directory, `roadmap-r4-core.draft.sql.txt` (core, 11 tables and 11 indexes) and `roadmap-r4-authorizations.draft.sql.txt` (R4.07, 3 tables and 2 indexes); 27 statements in all. They carry a `.txt` suffix on purpose: any `*.sql` path is `broad` in `scripts/ci/check-map.json`. No migration number: the Lead allocates them at R4 integration, against current main and the active R1-R3 branches (the checklist treats the reported 0036-0038 as those lanes' work). The files are not in any migrations directory and no test or script references them.

## 1. Checked against the repository's rules

| Rule | Where it is enforced | Result for the drafts |
|---|---|---|
| A learn migration is DDL only: every statement, after comments are stripped and the text split on `;`, matches `/^CREATE (TABLE\|(UNIQUE )?INDEX) IF NOT EXISTS /i` | `scripts/schema-check.test.mjs`, "learn migrations are DDL only" | 27 of 27 statements pass (the same regex run on both drafts). No `;` inside a comment or string. |
| Schema identity: the live LEARN_DB must equal `repository-schema.sql` + migrations, object by object, normalized SQL (`schema-check.mjs normalizeSql`; column order matters) | `scripts/schema-check.mjs`, release preflight | The Lead mirrors each migration into `repository-schema.sql` verbatim (section 6). |
| Re-runnable | convention (`usage-operations.test.js:12`) | Both drafts executed twice on `repository-schema.sql` in `node:sqlite`: no error, no name collision with an existing object. |
| No ALTER, no change to existing CHECK constraints | v1.4 4.2 | Satisfied: new objects only. R2's Depth and Auto-suggest sidecars are not columns here. |
| Partial unique indexes | allowed (`CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE`) | Behavior verified on `node:sqlite` (second unfinished roadmap and second offered step refused). Not previously used in `repository-schema.sql`; unverified on D1 itself: confirm on a dev D1 clone at the announced migration step. |

## 2. Tables (checklist names; the first draft's `roadmap_*` names are retired)

Scope on every row: `org`, `owner_user_id`, `board_id` (`learn_boards.id`), and `app` where the source/board lookups need it. `learn_roadmaps` also holds `owner_email` because the request-less re-verification (api.md 12) queries `learn_boards` and `file_sources`, which are keyed on `owner_email`. All ids are server-minted; all times are INTEGER unix seconds.

| Table (draft) | Purpose | Key / unique | Notes |
|---|---|---|---|
| `learn_roadmaps` (core) | Roadmap, settings snapshot (depth, practice mode, R3 `source_key` + `source_rev`, `scope_json`, `scope_fingerprint`, `scope_snapshot_key`, language, ceiling, mode + `mode_revision`, `revision`, `plan_version`) | PK `id`; partial unique `learn_roadmaps_one_unfinished (org, owner_user_id, board_id) WHERE state IN draft/questioning/proposed/active/paused` | The index is the database form of "one unfinished roadmap per learner and board, paused and questioning included". A concurrent second create fails with UNIQUE, mapped to 409 `roadmap_unfinished_exists`. The scope snapshot text lives in `LEARN_MEDIA`, not in D1 (api.md 12). |
| `learn_roadmap_instructions` (core, extra) | Learner instruction, versioned; version 1 is the original words | PK `(roadmap_id, version)` | Never updated. Latest wins for scope/format; the original still overrides an inferred topic (planning.md 5). |
| `learn_roadmap_plan_versions` (core, extra) | Draft and each revision (`plan_json`, `plan_hash`, `prompt_version`, `instruction_version`) | PK `(roadmap_id, version)` | `accepted_at` set by Accept plan; accepted rows immutable. A revision is a plan version, not a roadmap state. |
| `learn_roadmap_invitations` (core) | Offered / dismissed / accepted / suppressed per source set | unique `(org, owner_user_id, board_id, source_set_key)` | `source_set_key = sha256(sorted "key@rev")`; dismissal is by invitation id; a new revision is a new key. |
| `learn_roadmap_steps` (core) | Private step: `position`, `format`, `passage_start/end` (offsets into the snapshot), `source_ref_id` (R3 `sref_` id, minted at Accept plan), `answered`, `card_removed`, `omitted_at`, `removed_at` | unique `(roadmap_id, plan_version, position)` | Omission/removal metadata is separate from delivery status (R4.02). |
| `learn_step_proposals` (core) | Versioned offers (`format` CHECK explanation/table) | unique `(step_id, version)`; partial unique `(roadmap_id) WHERE state IN checking/held/pending` | The second index is "one current offered position; a held offer does not free it". Never in board state (D8). |
| `learn_step_results` (core) | One row per card slot, created with its minted `card_id` before any generator can write | unique `(proposal_id, proposal_version, slot_index, result_version)`; unique `(org, owner_user_id, board_id, card_id, result_version)` | Separate columns for generation, validation + `stale`, decision, delivery, billing, reconciliation, `failure_class` (the contract's FAILURE_CLASSES). `body_json` is NULL until generated and never in a poll. `primitive` CHECK limits to explanation/table. |
| `learn_roadmap_actions` (core) | Winning action receipts: operation, fingerprint, expected versions, recorded outcome | PK `(org, owner_user_id, action_key)` | `applyRoadmapAction` (R4.02): subordinate writes are guarded by this receipt; identical replay returns `outcome_json`; a changed payload under the same key or a stale action is 409 with no effects. |
| `learn_roadmap_calls` (core) | One row per provider call: `op_id` (the ledger `usage_operations.op_id` = `usage_attempts.attempt_id`), `operation_key` (canonical `withRoadmapProviderCall` identity), `checkpoint` (planned, admitted, dispatched, response_recorded, settled, unknown, reconciling, failed, released), payer, task, request fingerprint, reserved and settled micros, quota scope/window, `output_ref` | PK `op_id`; unique `operation_key` | `unknown`/`reconciling` block a blind retry (contract `mayRetryCall`). A replay of a settled call reads `output_ref` instead of calling the provider. |
| `learn_roadmap_quota` (core, extra) | Per-learner platform-work counters by scope and window (D14) | PK `(org, owner_user_id, scope, window_start)` | Incremented in the batch that reserves the call. |
| `learn_roadmap_outbox` (core) | Durable events (R4.05) | PK `event_id`; unique `(org, owner_user_id, scope, board_id, roadmap_id, kind, fact_id, fact_revision)` | `scope` is `learner`, `board` or `roadmap` so R6's learner-global settings events fit; empty ids are `''` (not NULL) so the unique key dedupes. A claim is a lease (`lease_token`, `lease_until`), replayable after expiry; `processed_at` set with or after the durable effect. Ask -> Tutor -> Ask = three events because `fact_revision` is `mode_revision`. Payload: ids and enums only. |
| `learn_step_authorizations` (authorizations) | The whole accepted step's learner hold: aggregate, per-card bound, remaining, payer, period, usage client key, content fingerprint | unique `(proposal_id, proposal_version)`; unique `(payer_user_id, usage_client_key)` | Included in the shared balance SQL (billing.md 4). |
| `learn_step_allocations` (authorizations) | Per-card allocation (`bound`, `remaining`, `version`, state held/in_use/released) | unique `(authorization_id, result_id)` | |
| `learn_step_allocation_transfers` (authorizations) | One row per per-call transfer from an allocation to the call's own reservation | PK `transfer_id`; unique `op_id` | A replayed call cannot transfer twice. |

`learn_roadmap_outbox` rows R4 writes: step delivered, mode change, proposal ready, delivery unacknowledged, card failed. R6's fan-out and R9's assessment events plug into the same table later.

## 3. Indexes the access paths need

Status poll: `learn_roadmaps_board`. Step list: `learn_roadmap_steps_roadmap`. Work finder for the DO alarm: `learn_step_results_work (generation, validation, updated_at)`. Open calls to reconcile: `learn_roadmap_calls_open (checkpoint, created_at)`. Replay: the action PK. Events: `learn_roadmap_outbox_due (processed_at, next_at)`.

## 4. Retention

| Data | Rule (proposed; versioned in `ROADMAP_LIMITS.retention`) |
|---|---|
| Delivered result `body_json` | Kept with the roadmap; the delivered card on the board is the learner's content. |
| Cancelled / superseded / failed result bodies | `body_json` cleared 30 days after the decision, lazily on read of an old row (the daily cron is R11's); ids, hashes, billing and delivery columns stay. |
| Scope snapshot (`LEARN_MEDIA`) | Deleted with the roadmap's board data; never copied to shares or forks. |
| `learn_roadmap_actions` | 30 days from `created_at`; an older replay is a fresh action. |
| `learn_roadmap_outbox` | Processed rows 30 days; unprocessed rows never deleted by age. |
| `learn_roadmap_calls`, authorization tables | Kept (cost and refund audit; small). |
| Ended roadmap | Row kept; delivered cards stay on the board. |
| Board deletion | Roadmap rows and snapshots for the board are deleted by the same cleanup that deletes `learn_boards`; the function that does it was not located (unverified). |

## 5. Sharing and fork sanitizer rules per new card field

Two sanitizer paths exist and both change in the release that introduces a field (v1.4 4.2): `sharedState()` / `sharedBlock()` (`shared-privacy.js:24-40`; used by shared views, links, publications, a non-owner's board view `canvas-comments.js:971`, shared ask `learn-shared-ask.js:347`, analytics, and `forkable()` for a link visitor's fork `learn-boards.js:498`) and `forkState()` (`learn-boards.js:474-493`, also the owner's duplicate).

R3 has already changed `sharedBlock` in its lane: `block = withSharedSourceRef(publicExplainBack(block))` (R3 commit 82988427d, `shared-privacy.js`): a shared reader's `sourceRef` is reduced to `{ v, kind, source: { name }, anchor?: { page: { label } } }` with no id, key, revision or quote (`sharedSourceRef`, `web/src/source-ref.js`). R4 adds only the step field.

| Card field | Meaning | Shared view / link / publication | Fork or duplicate |
|---|---|---|---|
| `stepId` | Private relationship to a roadmap step (D9). Camel case like every card field (`attemptId`, `confirmedStart`, `sourceRef`); the roadmap and checklist text say `step_id` | removed | removed |
| any roadmap index or hover label source (D37) | Private position | never stored on the card (derived from the actor's roadmap) | n/a |
| `sourceRef` (R3 `{ v, id, kind, source:{key,rev,name,home}, anchor }`) | Link to a source passage | R3's `withSharedSourceRef`: label only | R3 owns re-pointing: kept and repointed only where the fork may access the source; private source bodies are never copied |
| pending proposal | Overlay, not a block (D8) | not in `blocks` | not in `blocks` |
| roadmap rows, snapshots, feedback, assessment, charges | Learner-scoped tables and R2 storage | never in board state | never |

Implementation contract: one pure helper `publicRoadmapCard(block)` placed beside `publicExplainBack` (the pattern at `explain-back-private.js:35-50`: a frozen list of private keys, returns the same object when nothing to drop) imported by both sanitizers; its failing-on-old test asserts a card with `stepId` loses it through `sharedState` and `forkState` while R3's `sourceRef` rule is untouched, and that no other key changes. This is R4.12's `packages/control-plane/test/shared-privacy.test.js` (new). The ToC stays ordinary: `sharedState` already strips `done` from entries (`shared-privacy.js:40`), and roadmap entries are rendered from the private API, never written into `toc`.

## 6. How the Lead turns the drafts into migrations

1. Allocate numbers from current main and the active branches after the R1/R2/R3 numbers are known (BASE.01). At the checklist baseline the last committed Learn migration is `0035-publication-analytics.sql`; R3's lane has authored `0038-source-refs.sql`.
2. For each draft: copy to `learn-migrations/<NNNN>-roadmap-core.sql` and `<NNNN>-roadmap-authorizations.sql` (R4.07 comes after core), add the repository's header comment (what, owner scope, "Additive and re-runnable; LEARN_DB only", the "production migrations are an owner command" sentence).
3. Append each verbatim under `-- learn-migrations/<NNNN>-....sql` at the end of `repository-schema.sql` (the convention at `repository-schema.sql:1150`).
4. Run `node --test scripts/schema-check.test.mjs` and the new store tests (`learnDb()` from `test/learn-grade-fixture.js` builds the DB from `repository-schema.sql`; the checklist also asks to update relevant `learnDb()` fixtures in the same change).
5. `.sql` files under `learn-migrations/` are `broad` by design (README G11). The shared dev D1 needs an announcement and owner authorization; this lane applies nothing.

## 7. Open points for State

- `body_json` stays in D1 for R4 (explanation body <= 2000 characters, table <= 20 rows x 8 columns x 200 characters, `learn-primitives.js:43-55`); R12 media uses R2.
- `owner_user_id` is the actor key; `owner_email` appears only where an existing table is queried by email.
