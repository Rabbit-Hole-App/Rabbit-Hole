# R4 contract: records, retention and sharing sanitizers

Status: DRAFT CONTRACT. SQL: `roadmap-r4.draft.sql` in this directory (12 tables, 11 indexes, 23 statements). No migration number: the Lead allocates one at R4 (v1.4 4.2: old numbers are not reservations). The file is not in any migrations directory and is not referenced by any test or script.

## 1. Checked against the repository's rules

| Rule | Where it is enforced | Result for the draft |
|---|---|---|
| A learn migration is DDL only: every statement, after comments are stripped and the text split on `;`, matches `/^CREATE (TABLE\|(UNIQUE )?INDEX) IF NOT EXISTS /i` | `scripts/schema-check.test.mjs`, test "learn migrations are DDL only" (reads `SOURCES.learn()` = `repository-schema.sql` + `learn-migrations/` from 0004) | 23 of 23 statements pass (run with the same regex on the draft). No `;` inside a comment or string. |
| Schema identity: live LEARN_DB must equal `repository-schema.sql` + migrations, object by object, normalized SQL (`schema-check.mjs normalizeSql`: comments, `IF NOT EXISTS`, quoting, whitespace ignored; column order matters) | `scripts/schema-check.mjs` `expectedSchema('learn')`, release preflight `scripts/prod-release.mjs` | The Lead mirrors the migration into `repository-schema.sql` with the same header comment (see 6). Column order in the mirror must equal the migration. |
| Re-runnable | same convention (`usage-operations.test.js:12` runs a migration twice) | The draft was executed twice on `repository-schema.sql` in `node:sqlite`: no error, no name collision with an existing object. |
| No ALTER, no change to existing CHECK constraints | v1.4 4.2 | Satisfied: only new objects, no existing table touched. Settings that R2 adds (Depth, Auto-suggest) are R2 sidecars, not columns here. |
| Partial unique index | allowed (`CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE`) | Verified on `node:sqlite`; D1 is SQLite and supports it. Not previously used in `repository-schema.sql` (unverified on D1 itself: Lead to confirm on a dev D1 clone with the migration announce step). |

## 2. Tables

Every table has `org, owner_user_id, app, board` (the scope of `learn_boards`: `repository-schema.sql:70-88`, plus `owner_user_id` as `learn_attempt_assets`/`learn_explain_drafts` in 0034). All ids are server-minted; the client never supplies a primary key. All times are INTEGER unix seconds.

| Table | Purpose | Key / unique | Notes |
|---|---|---|---|
| `roadmap_roadmaps` | The roadmap and its settings snapshot (depth, practice mode, source id + immutable revision + hash, scope, language, ceiling, mode + `mode_revision`, `revision` guard, `plan_version`) | PK `id`; unique partial index `roadmap_roadmaps_one_unfinished (org, owner_user_id, app, board) WHERE state IN draft/questioning/proposed/active/paused` | The index is the database-level form of "one unfinished roadmap per learner and board, paused and questioning included". A concurrent second create fails with a UNIQUE error mapped to 409 `roadmap_unfinished_exists`. |
| `roadmap_instructions` | Learner instruction, versioned. Version 1 = the original words | PK `(roadmap_id, version)` | Never updated. `origin` create/revise/answer. The planner and scorer read the latest version, but version 1 is always sent as the original. |
| `roadmap_plan_versions` | Draft and each revision, `plan_json`, `plan_hash`, `prompt_version`, `instruction_version` used | PK `(roadmap_id, version)` | `accepted_at` set by Accept plan. Accepted plan rows are immutable. |
| `roadmap_invitations` | Offered / dismissed / accepted / suppressed per source set + revision | unique `(org, owner_user_id, app, board, source_key)` | Dismiss scopes to the row (2.1). `source_key = sha256(sorted sourceId:revision)`. A new source revision is a new key, so a changed source may be offered again. |
| `roadmap_steps` | Private step with position and `source_ref_json` | unique `(roadmap_id, plan_version, position)` | `answered`, `card_removed` are the metadata flags from 4.3, not states. |
| `roadmap_proposals` | Versioned offers (`format` is `explanation` or `table` by CHECK) | unique `(step_id, version)`; partial unique `(roadmap_id) WHERE state IN checking/held/pending` | Second index = "one offered step occupies the proposal position; a held proposal must not produce a second competing offer". Not stored in board state (D8). |
| `roadmap_results` | One row per card slot, created with its minted `card_id` before generation writes | unique `(proposal_id, proposal_version, slot_index, attempt)`; unique `(org, owner_user_id, app, board, card_id)` | State dimensions as separate columns (generation, validation+stale, decision, delivery, billing, reconciliation). `body_json` NULL until generated and never in a poll. `primitive` CHECK limits to explanation/table. |
| `roadmap_authorizations` | The aggregate allowance admission for an accepted proposal version: `usage_client_key`, `hold_attempt_id`, `aggregate_micros`, per-card `allocation_json` | PK `(proposal_id, proposal_version)` | Billing 4. `released` when unused allocation returns. |
| `roadmap_actions` | Action replay records: `(org, owner_user_id, action_key)` -> fingerprint, status, body | PK as stated | The replay boundary of states.md 4. |
| `roadmap_calls` | One row per provider call: `op_id` (= ledger `usage_operations.op_id` = `usage_attempts.attempt_id`), stage, call_no, retry_no, payer, task, model, state, reserved/cost micros, quota scope+window | PK `op_id`; unique `(roadmap_id, stage, call_no, retry_no, result_id)` | The stable identity (5.1). `state = unknown` blocks a retry until reconciled. |
| `roadmap_quota` | Per-learner platform-work counters (D14): calls and micros per scope and time window | PK `(org, owner_user_id, scope, window_start)` | Incremented in the same D1 batch as the reservation (billing 5). |
| `roadmap_events` | Durable outbox (5.4) | PK `event_id`; unique `(org, owner_user_id, roadmap_id, kind, fact_id, fact_revision)` | Payload ids and enums only. `next_at`, `attempts`, `deadline_at`, `claimed_until` (lease), `processed_at`. A mode string is not a revision: `fact_revision` = `roadmap.mode_revision`. Index `(processed_at, next_at)` is the dispatcher's scan. |

R4 writes `roadmap_events` rows for: step delivered, mode change, proposal ready, card failed (the first consumers are the status poll and the DO alarm; R6 adds notifications). If State judges the outbox premature for R4, keep the table (the v1.4 4.2 list names it for R4) and write only `proposal ready` and `delivery unacknowledged` kinds.

## 3. Indexes the access paths need

Status poll: `roadmap_roadmaps_board`. Step list: `roadmap_steps_roadmap`. Work finder for the DO alarm: `roadmap_results_work (generation, validation, updated_at)`. Open calls to reconcile: `roadmap_calls_open (state, created_at)`. Replay: PK. Events: `roadmap_events_due`.

## 4. Retention

| Data | Rule (proposed; versioned in `ROADMAP_POLICY`, v1.4 5.5) |
|---|---|
| Delivered result `body_json` | Kept with the roadmap. The delivered card on the board is the learner's content; the row is the audit/replay source. |
| Cancelled / superseded / failed result bodies | `body_json` cleared 30 days after the decision (carried default from D16; R4 has no cron consumer: the clear is done lazily on read of an old row. The daily cron is R11's) while ids, hashes, billing and delivery columns stay. |
| `roadmap_actions` | 30 days after `created_at`; a replay older than that is a fresh action. Lazily pruned on the same board's next write. |
| `roadmap_events` | Processed rows 30 days; unprocessed never deleted by age. |
| `roadmap_calls`, `roadmap_authorizations` | Kept (cost and refund audit; small). |
| Ended roadmap | Row kept; delivered cards stay on the board; ending is not immediate expiry. |
| Account/board deletion | Rows for the board are deleted in the same cleanup that deletes `learn_boards` (State to wire into the existing board deletion path; not located here: unverified which function performs it). |

## 5. Sharing and fork sanitizer rules per new card field

Today there are two sanitizers and both must change in the release that introduces a field (v1.4 4.2: "Sharing and fork sanitizers ship with every new card field"):

| Path | Code | What to add |
|---|---|---|
| Shared view, link, publication, member's non-owner view, shared ask, analytics | `sharedState()` / `sharedBlock()` in `shared-privacy.js:24-40`, called from `learn-boards.js:901,929`, `canvas-comments.js:971`, `learn-shared-ask.js:347`, `publication-analytics.js:92,134,361`, and `forkable()` at `learn-boards.js:498` | Drop the private step fields from every card (`EVERY_CARD` list, `shared-privacy.js:22`). |
| Fork / duplicate | `forkState()` blocks map, `learn-boards.js:474-493` (note: the owner's own duplicate also uses it) | Same drop in the blocks map next to `publicExplainBack`. |

Rule table (card JSON field names follow the repository's camelCase for card state, e.g. `attemptId`, `confirmedStart`; the roadmap text says `step_id`/`source_ref`, see README Gap G6):

| Card field | Meaning | Shared view / link / publication | Fork or duplicate |
|---|---|---|---|
| `stepId` | Private relationship to a roadmap step (D9) | removed | removed |
| `roadmapIndex` / any hover label source (D37) | Private position | never stored on the card (derived server-side from the actor's roadmap) | n/a |
| `sourceRef` (R3 owns shape: source id, immutable revision, anchor, status) | Link to a source passage | kept only where the viewer may access the source; otherwise replaced by the generic "source not available" marker (R3 decides the exact marker) | kept and repointed only where the fork may access the source; private source bodies are never copied by inference (3.4) |
| the pending proposal | Overlay, not a block (D8) | not in `blocks` at all | not in `blocks` at all |
| roadmap rows, feedback, assessment, charges | Learner-scoped tables | never in board state | never |

Implementation contract: one pure helper `publicRoadmapCard(block)` placed beside `publicExplainBack` (same pattern as `explain-back-private.js:35-50`: a frozen list of private keys, returns the same object when nothing to drop) imported by both sanitizers; its failing-on-old test (the R4 first slice for State) asserts a card with `stepId` loses it through `sharedState` and `forkState` and keeps `sourceRef` rules. Removing those fields must not alter any other key (existing tests in `shared-privacy` and `canvas-forking` stay green). The ToC entries stay ordinary `toc` items; `sharedState` already strips `done` from them (`shared-privacy.js:40`). Roadmap entries in the ToC are rendered from the private API, never written into `toc`.

## 6. How the Lead turns the draft into a migration

1. Allocate the number from current main (`ls packages/control-plane/learn-migrations`; at the baseline the last file is `0035-publication-analytics.sql`; the manifest's provisional 0036-0038 belong to R1-R3 and must be re-checked at integration).
2. Copy the SQL to `learn-migrations/00NN-roadmap-r4.sql` with a header comment like 0034's (what, owner scope, "Additive and re-runnable; LEARN_DB only", and the "production migrations are an owner command, never applied by a lane" sentence).
3. Append the same text, verbatim, under `-- learn-migrations/00NN-roadmap-r4.sql` at the end of `repository-schema.sql` (the convention at `repository-schema.sql:1150`; the release preflight and tests compare it).
4. Run `node --test scripts/schema-check.test.mjs` and the new tables' unit tests (`learnDb()` from `test/learn-grade-fixture.js` builds the DB from `repository-schema.sql`).
5. Check-map: `.sql` files under `learn-migrations/` are `broad` by design (see README Gap G11). Dev D1 is shared: announce before any apply; the owner authorizes it; this lane applies nothing.

## 7. Open points for State

- Whether `roadmap_results` splits `body_json` into R2 for large cards: R4 cards are bounded by the primitive schemas (explanation body 2000 chars, table at most 20 rows x 8 columns x 200 chars, `learn-primitives.js:43-55`), so D1 text is fine; R12 media uses R2.
- `owner_user_id` vs email: 0034 uses `owner_user_id`; `learn_boards` uses `owner_email`. The access object carries both; every query binds `owner_user_id`.
