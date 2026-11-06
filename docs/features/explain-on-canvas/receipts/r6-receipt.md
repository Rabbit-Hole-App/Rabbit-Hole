# R6 (automatic next proposals) receipt

Candidate `feat/tutor-r6`, based on the frozen R4 release tip `fe941068917184a183faa533344cde18524a0598` (`feat/tutor-r4-release-3`). MVP fast path (ladder label). R6 does not depend on R5.
**Everything is behind two flags, both unset everywhere: `ROADMAP_ENABLED` (R4) and the new `ROADMAP_AUTO_ENABLED`. A learner sees and gets nothing from this release until both are `'true'`.**

## What R6 is, and is not

- Is: after a delivered card, or when Ask/Tutor or the global Auto-suggest preference changes, the server offers the roadmap's next planned step by itself (one pending proposal in the single proposal position), with the existing UI showing it from the polled view.
- Composes metadata only. It reuses R4's deterministic composer (`roadmap-compose.js`) and R4's `proposeNextStep`. No model is called anywhere in R6, no card is generated, no authorization, hold, result slot or usage row is written, and nothing is charged.
- Is not R5 (proposal editing, drafts, linking) and not R11 (preparing results before acceptance): no unaccepted card generation exists in this branch.

## Checklist coverage

| Row | Covered | Where / evidence |
|---|---|---|
| R6.01 versioned trigger facts | Yes, except the coaching-store mode writer (see below) | `roadmap-settings-events.js`, `learn-user-settings.js` `saveAutoSuggest` (fact + event in one batch, flags on only), `roadmap-auto.js` `settingsFanoutHandler`, migration 0040; `roadmap-auto-events.test.js` (7 tests) |
| R6.02 compose and reveal | Yes, with two readings below | `roadmap-auto.js` `ensureNextProposal`, `autoProposalHandler`; `roadmap-auto-proposal.test.js` (13 tests) |
| R6.03 timing and current-UI behavior | Code and fakes yes; browser no | `roadmap-auto.js` (web), controller follow-up reads and meter, `roadmap-auto.test.mjs` (4 tests), `roadmap-auto-check.mjs` (4 steps, never executed) |

### R6.01 detail

- Event identity: org, learner, scope, board, roadmap, kind, fact id, monotonic fact revision (the outbox's existing unique key). Ask, Tutor, Ask is three events (`mode_changed`, revision `mode_revision`, already committed by R4's `setMode` in its batch). Off, on, off of Auto-suggest is three events (`settings_changed`, revision from `learn_roadmap_settings_facts`); a repeated write of the same value adds nothing.
- Global Auto-suggest: one learner-scoped event committed with the preference; expanded in bounded pages (25 per page, 8 pages per run, then yield and retry) into one `autosuggest_changed` per unfinished roadmap. The children are the cursor: a restart selects only roadmaps that lack a child, child inserts are idempotent by the unique key, and the parent is marked processed by the runner only after the last page. New roadmaps read the latest preference directly.
- Consumption through the R4 claim/commit runner; every handler re-reads the current roadmap row, mode, mode revision and preference before acting, and drops an event whose fact revision is older than the current one. Tested: crash after claim before effect, duplicate delivery, stale revision, two preference writes, lease lapse, crash mid fan-out.
- Delivery, ack and mode routes now call an optional `deps.onFact` (wired to the same kick as accept) so the new events run promptly instead of waiting for the scheduler; a replay does not kick.
- Not done: the checklist names `learn-coaching-store.js` `save_controls` as the mode writer. The roadmap's own mode already commits `mode_changed` through `POST /roadmap/:id/mode` (R4), which is what the UI sends on every mode change; the per-canvas coaching `mode` column is a different record and was not touched. Reconcile at integration if the coaching mode must also produce a roadmap event.

### R6.02 detail

- Eligible only when: roadmap `active` (so Cancel's `paused`, `completed`, `ended` and a not-yet-accepted plan never get unsolicited work), mode is not Ask, Auto-suggest is on, at least one step is `delivered` or `skipped` (so the FIRST proposal after Accept plan stays the learner's Propose next step), and the source still revalidates (`revalidateSourceAsJob`; a changed source skips and leaves the manual path).
- Then it calls R4's `proposeNextStep`: refuses while any step is proposed, generating or incomplete (so retrying or failed accepted work is not treated as finished), takes the next `planned` step by position (never a cancelled one), completes the roadmap at the stopping point or ceiling, and offers into the single proposal position (partial unique index). The offer is guarded by the roadmap revision, so a mode change, a manual Next or another device between the read and the reveal makes the automatic offer write nothing. Tested both orders of manual Next versus automatic, and Ask arriving during composition.
- Cancel, End, Ask and Auto-suggest off stop it; Cancel then the explicit Propose next step resumes (existing R4 behavior) and the next delivery triggers again. Resume from Ask to Tutor re-evaluates the durable state and offers once, or reuses the pending offer.
- Zero charge asserted on records: no new rows in `learn_step_authorizations`, `learn_step_results`, `learn_roadmap_calls`, `usage_attempts` across a successful automatic offer.

### Readings and deviations to approve

1. **No `roadmap_proposal` model role.** R6.02 lists a Sonnet proposal role. R4 shipped none (the proposal is the validated plan step). R6 keeps composition deterministic, so there is no model call, no `learn-models.js` patch, and no provider-spy distinction needed: the test asserts zero calls because there is no model path. Pre-composition of the successor's metadata "while the accepted step finishes" is skipped (composition is instant and deterministic; `ponytail:` in spirit). A model-written proposal is the R5/later change.
2. **First proposal stays manual** (see eligibility). Spec says "complete a step, see one next proposal"; the plan-accept to step-one hop is unchanged.
3. **Fan-out pages** use the children as the cursor rather than a stored cursor field (equivalent for recovery, fewer columns).
4. **Learner events run inline** from the preference write (`runLearnerEvents`) and from the scheduled scan, because a learner-scoped event names no board and so no `RoadmapJobs` object.

## Strings

No learner-facing string is added or changed in R6. (`roadmap-strings.js` untouched.) Internal reason codes (`ask`, `auto_suggest_off`, `not_active`, ...) appear only in tests and the optional `timing` callback, never in a response.

## Migration

`learn-migrations/0040-roadmap-settings-facts.sql` (R6's reserved number): one additive `CREATE TABLE IF NOT EXISTS learn_roadmap_settings_facts`. **Not applied to any database.** Dev needs the owner's GO, announced first. Tested only on the in-memory schema (0040 executed on top of `repository-schema.sql` in the tests; the `repository-schema.sql` mirror is a Lead patch, `r6-repository-schema.patch`). Without 0040 and with the flags on, the preference write falls back to the plain write (tested) and delivery/mode triggers still work.

## Flag-off proof

- `ROADMAP_ENABLED` unset: every roadmap route 404s before identity or the database are read (route test asserts the new mode route too); handlers return before reading (flag matrix test).
- `ROADMAP_AUTO_ENABLED` unset or not `'true'`: handlers do nothing, `saveAutoSuggest` is exactly the old single statement and writes no fact or event (tested, including a database without the table), pending learner events are consumed without fan-out (tested). The scheduled scan changes only for learner-scope rows, which cannot exist with the flags off.
- Billing: no usage statement from proposal composition (asserted).

## Tests run (this tip)

- `packages/control-plane`: `node --test test/roadmap-auto-proposal.test.js test/roadmap-auto-events.test.js` 20 pass / 0 fail; all `test/roadmap-*.test.js` plus `learn-user-settings`, `explain-depth`: 224 pass / 0 fail.
- `packages/web`: `node --test src/roadmap-auto.test.mjs` 4 pass; with `roadmap-*`, `learn-settings`, `next-steps-wiring-ui`: 79 pass / 0 fail. `no-ellipsis`, `no-sparkles`, `matrix-kind-declared`: pass.
- `scripts/schema-check.test.mjs` 7 pass with the 0040 mirror applied. `scripts/ci/check-map.test.mjs`: see `r6-lead-patches.md` (one budget failure that any added check causes).
- `node --check` on `roadmap-auto-check.mjs` and the fake server only. No browser, workerd or CI run.

## Not verified

- Any browser behavior: `roadmap-auto-check.mjs` was written, never run (browser rule). Its selectors (`[data-roadmap-chat]`, mode menu) are copied from the R4 checks.
- The delivery-to-visible 1-2 second goal: only the meter and a fake-clock test exist; the server-side `timing` callback is a hook, not stored. No p50/p95 measured. Event timestamps are whole seconds.
- `RoadmapJobs` alarm and `runLearnerEvents` under workerd; migration 0040 against real D1; that the settings route's `users.id` equals the roadmap owner id (both are described as the account id; unchecked end to end).
- The hook mapping from R2's settings reader into `roadmapDeps` is another lane's work; R6 reads Auto-suggest by `readAutoSuggest` directly in its handlers.
- No real model, JEV or paid call (none is in the path).

## Recovery

`feat/tutor-r6-recovery`: one commit reverting R6's changes (tree equal to the R4 release tip).
