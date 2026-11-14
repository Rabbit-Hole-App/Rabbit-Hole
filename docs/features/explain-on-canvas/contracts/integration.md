# R4 contract: ordered integration plan

Status: DRAFT CONTRACT. Dependencies follow v1.4 3.1 and the manifest update of 2026-11-05: R4 depends on R1, R2, R3 and **the cleanup it actually uses, verified per release** (not a blanket M0/P7 gate; P7 is cleanup's closeout). Migration numbers 0036-0038 are provisional. No R4 migration number is allocated.

## 1. What R4 needs from R1, R2, R3 (interfaces; R3's landed code was read in its lane worktree `tutor-r3`, read only; R1 and R2 are still questions to those lanes)

| From | Needed by R4 | Interface R4 will call | Open question to the lane (unverified) |
|---|---|---|---|
| R1 card feedback (`CardFeedback.jsx`, `card-feedback.js`, `card-feedback-routes.js`, store, 0036) | Newly delivered cards show the feedback control; imported source cards and pending proposals do not | Feedback eligibility on the board card | How does R1 decide a card is "generated"? (a block marker, a type allowlist, or absence of a source flag?) R4 will set whatever marker R1 reads on delivered blocks, never on the overlay. |
| R2 Depth + settings (`learn-user-settings.js`, `chat-depth.js`, 0037) | Depth default and revision input; Auto-suggest for invitation suppression; the Depth reaches planner/proposal/card prompts | Server readers for Depth (learner, canvas) and Auto-suggest (learner) | Exported function names and signatures; whether Depth changes mid-roadmap raise a plan revision event R4 consumes. R4 assumes `readDepth(db, access)` and `readAutoSuggest(db, access)` and wraps them in one `roadmap-settings.js` seam so a rename touches one file. |
| R3 source refs (`source-ref.js`, `source-refs.js`, `SourceRefChip.jsx`, 0038) | The reference shape for steps and delivered cards; changed/missing/inaccessible status; sharing/fork sanitizer of `sourceRef` | **Read in R3's lane (commits 82988427d, 50aac9c91):** card field `sourceRef = { v: 1, id: 'sref_<24 hex>', kind: 'markdown'\|'pdf', source: { key, rev, name, home }, anchor }` (Markdown anchor `{ quote: { exact, prefix, suffix } }`), request field `sourceRefId`, server `trustedSourceRef(req, env, user, app, id)` and `POST /api/learn/source-refs`, statuses `current/changed/missing/unavailable`, shared-reader reduction `withSharedSourceRef`. All of it is request-bound (`readSource(req, ...)`): the roadmap Durable Object has no `Request`, so R4 snapshots the scope and mints refs at request time and revalidates by owner-scoped D1 query (`api.md` 12). | Whether R3 will expose a mint helper callable with a stored session-equivalent, or R4 calls the route logic from its own request handlers (recommended: the latter, no change to R3). R4's own "Visible section" capture is the quote anchor R3 already mints on selection; R4 consumes the `sourceRefId`. |

R4 does not edit R1-R3 files except through the Lead's patch list (manifest: R3 must not edit `AdaptiveCanvas.jsx`; R1 writes it first).

## 2. What R4 uses from the cleanup, per phase (verify each; do not assume a removal)

| Phase | R4 depends on | Why | Verification (named command, run at integration; record in `receipts/R4-prerequisites.md`) |
|---|---|---|---|
| P1 relocate | Next Steps decoupled from the old Tutor state (`learn-next-steps.js`, `LearnNextSteps.jsx`) so D1 suppression has a stable hook; `spendCallModel` moved to `learn-spend.js` (R4 calls `spendTransport` directly and does not need `spendCallModel`) | D1; R4 touches `learn-spend.js` | `git grep -nE "from '\./learn-tutor-routes\.js'" -- packages/control-plane/src` empty; `git grep -n "spendCallModel" -- packages/control-plane/src` shows its definition only in `learn-spend.js` |
| P2 browser Tutor off | `LearnPage.jsx` without `useTutor`; `ask.jsx` `sendStep` = plain Chat turn; `use-learn-coaching.jsx` relabelled Auto-suggest; `chat-route.js` | R4 mounts into the same files; D34 | the P2 grep template in cleanup section 9 returns nothing; `git grep -n "useTutor" -- packages/web/src` empty |
| P3 server Tutor off | `learn-models.js` without `tutor`/`tutor_evaluator`; `learn-usage.js` rename of `tutor_evaluate`; `dev-worker.js` `/api/learn/tutor/` mount removed, Next Steps re-mounted | R4 adds model tasks and a usage hook in the same hunks | `git grep -nE "tutor/handoff" -- packages` only history comments; `node --test` in `packages/control-plane` exit 0 on the integrated tree |
| P4 journeys/syllabus off | ToC without `plan`/`planRevision`/`evidence` props; `ModeSelector`/`chat-threads` copy; `chat-modes.js` `resolveMode`; `index.js` ToC conversation outline branch | R4 renders in the ToC and keeps the Chat modes | `git grep -n "api/learn/journey" -- packages` outside comments empty; the ToC conversation still edits the outline (`toc-tutor-check.mjs` assertions) |
| P5 grading off | none for R4 (R9 uses assessment) | | not required |
| P6a/P6b | none (database operations; R4 adds only new tables) | | not required; R4 must not read `learning_journeys` |
| P7 | not a blocker | | not required |

Integrator reads the actual merge commits; if a phase is not merged, R4 either waits for the specific item above or uses the retained interface that exists now (all hunks are small; the manifest calls the hot files `LearnPage.jsx`, `ask.jsx`, `ModeSelector.jsx`, `chat-modes.js`, `use-learn-coaching.jsx`, `learn-usage.js`, `dev-worker.js`).

## 3. Ordered integration steps

1. **Resolve main**; write `receipts/R4-prerequisites.md` (v1.4 3.1): main SHA, cleanup phases depended on and their merge commits, the commands above and their output, migration number check against cleanup and every active branch, recovery branch.
2. **Lead shared edits first** (one commit each, Lead-only files): `learn-models.js` rows + `learn-models.test.js` pins (`planning.md` 2); `learn-usage.js` `withRoadmapProviderCall` hook; migration file from `roadmap-r4.draft.sql.txt` + `repository-schema.sql` mirror; `wrangler.dev.jsonc`/`wrangler.rabbit-hole-prod.jsonc`/`wrangler.rabbit-hole-dev.jsonc` binding `ROADMAP_JOBS` -> `RoadmapJobs` with a new DO migration tag (`explain-jobs-1` style, `wrangler.rabbit-hole-prod.jsonc:47`) and the var `ROADMAP_ENABLED` absent/false by default; `dev-worker.js` export of the DO class (next to `ExplainJobs`, `:23`) and the route mount (next to `:337`); `check-map.json` rows (section 7).
3. **State, Tools, UI in parallel against the contracts** (section 6 gives writers). Slices land in this order inside the lane branch: privacy sanitizer; store + replay; billing hold + op-id hook tests; adapter + escape tests; planner/validator + double; routes; DO jobs; UI reducer + fixtures; UI components; keyless checks.
4. **Integration branch:** Lead merges slices into one candidate; freezes the SHA; builds; runs unit tests of touched packages (`packages/control-plane` `node --test`, `packages/web` `npm run test:unit`), `scripts/schema-check.test.mjs`, `scripts/ci/check-map.test.mjs`, the web build (exit code), the production bundle check; then the named feature smoke (section 4) in the approved environment (not by Claude browser automation).
5. **Candidate evidence:** keyless checks in CI; the first real-model candidate only after the owner approves the cap (`decision-records.md` 3); model scoring by the rubric (`planning.md` 11).
6. **MVP preview and release** exactly per v1.4 8.2 and `docs/features/mvp-fast-path.md`: recovery branch pushed as strict descendant; `node scripts/mvp-fast-path.mjs preview --mvp ... --recovery <branch>`; owner sets `MVP_ALLOWED_SHA`; owner-controlled migration GO; `prepare --mvp`; production smoke; `ROADMAP_ENABLED` activation is part of the production GO (CLAUDE.md "Production GO means a usable feature"; the flag must not be left off after GO, nor turned on by a different release).

## 4. The focused smoke (v1.4 3.5 acceptance)

Real bounded Markdown source on an owned desktop canvas, in order, each step an assertion in `roadmap-mvp-check.mjs` (keyless, fixture server) and later once against the real dev stack:

1. Drop the source; one invitation appears when Chat is idle; dismiss it (only that invitation). 2. Start another invitation/explicit request; revise the plan in the ToC conversation; Accept plan. 3. One proposal; Tab accepts it (keyboard ownership correct); an actual explanation card appears. 4. Cancel the next proposal; Propose next step; navigate to an offscreen proposal via the indicator. 5. Change Depth, reload, open a second device, reach the stopping point. 6. Cases: duplicate acceptance (two devices/keys), failed-card refund, stale version 409, learner-instruction priority ("I already know X"), flag-off recovery, private share and fork. A planner-only pass does not satisfy R4.

Evidence kept separate (CLAUDE.md): unit/fixture; browser wiring and persistence; real-model; deployed user flow.

## 5. Migration list

Two new Learn migrations for R4 (checklist R4.02 and R4.07): the core one, 11 tables and 11 indexes of `roadmap-r4-core.draft.sql.txt`, and the authorizations one, 3 tables and 2 indexes of `roadmap-r4-authorizations.draft.sql.txt`; numbers allocated by the Lead from current main and the active branches after R1/R2/R3 numbers are known (the checklist treats the reported 0036-0038 as those lanes' reservations to verify). They follow `records.md` section 6. Nothing alters existing tables (`schema-check.test.mjs` DDL-only rule). Applying to the shared dev D1 is announced first and needs owner authorization; production is the owner's `!` command; an agent applies none. No main-D1 (`migrations/`) change. The Wrangler DO migration tag is a deploy-time config change, not a SQL migration.

## 6. Exact file writers for R4 (one writer per file at a time; manifest conventions)

| Role | Files |
|---|---|
| **State and money** | NEW `packages/control-plane/src/roadmap-routes.js`, `roadmap-store.js`, `roadmap-jobs.js` (the `RoadmapJobs` DO), `roadmap-events.js`, `roadmap-money.js` (identity, quota, hold, refund), `roadmap-publish.js`, `roadmap-generate.js` (with Tools); NEW `packages/web/src/roadmap-private.js` (`publicRoadmapCard`, pattern of `explain-back-private.js`); edits (small hunks): `shared-privacy.js`, `learn-boards.js` `forkState` blocks map, `learn-spend.js` (operation identity, replay path), `learn-spend-ledger.js` (`admitSpend` step-allocation transfer), the shared balance SQL in `learn-usage.js` via Lead; migrations (Lead numbers); tests `roadmap-store.test.js`, `roadmap-events.test.js`, `roadmap-jobs.test.js`, `roadmap-routes.test.js`, `roadmap-provider-identity.test.js`, `roadmap-quotas.test.js`, `roadmap-money.test.js`, `roadmap-recovery.test.js`, `roadmap-lifecycle.test.js`, `shared-privacy.test.js` |
| **Tools and planning** | NEW `agents/roadmap-draft.js`, `agents/roadmap-revise.js`, `agents/roadmap-proposal.js`, the grounding/safety prompt modules, `roadmap-validate.js`, `roadmap-source.js`, `roadmap-proposal.js`, `roadmap-grounding.js`, `roadmap-safety.js`, `roadmap-generate.js` (adapter, with State), `roadmap-model-stub.js`; the drafts `roadmap/roadmap-contract.js`, `roadmap-policy.js`, `roadmap-tools.js` are shared contract (Lead places them; Lead + State/Money + Tools own BASE.02); edit `learn-artifact.js` (the trusted options only, adapter.md 2); tests `roadmap-planners.test.js`, `roadmap-source.test.js`, `roadmap-tools.test.js`, `roadmap-generate.test.js`, `roadmap-grounding.test.js`, `roadmap-safety.test.js`, `roadmap-publish.test.js`; prompt pins in `learn-prompts.test.js` rows |
| **UI** | NEW `use-roadmap.js`, `roadmap-client.js`, `NextStepPill.jsx`, `StepProposal.jsx`, `RoadmapInvitation.jsx`, `RoadmapView.jsx`, `roadmap-placement.js`, their unit tests, `e2e/roadmap-command-check.mjs`, `e2e/roadmap-mvp-check.mjs`; edits `AdaptiveCanvas.jsx` (overlay, Tab, insertion), `ChatMessages.jsx`, `TableOfContents.jsx`, `TocConversation.jsx`, `usage-analytics.js` (EVENTS) |
| **Lead** | `learn-models.js`, `learn-models.test.js` rows, `learn-usage.js` (operation identity carrier, shared balance SQL), `dev-worker.js` (export + mount), `index.js` if a mount is needed, `wrangler*.jsonc`, `scripts/ci/check-map.json`, the two migration files + `repository-schema.sql` mirrors, `LearnPage.jsx` (mount of `useRoadmap`), receipts, all pushes and `--mvp` previews |
| **Independent verifier** | NEW tests only: access matrix (owner, other learner, stranger; R14 extends), money races, entitlement predicate on every result route, flag-off recovery, replay/crash boundaries; no files in the lanes' source |

## 7. The flag `ROADMAP_ENABLED` (v1.4 4.1)

Unset or not `"true"`: every roadmap route answers 404 `roadmap_disabled` before anything else; the UI hides invitation, pill, indicator, ToC roadmap; Next Steps hooks (D1) resume; R1-R3 unaffected. Records and the DO binding remain. Introduced by the R4 integration commit (this lane introduces nothing).

**Flag off mid-generation (recovery contract).** (1) No new unsolicited work: invitation and proposal stages stop (the DO checks the flag at each alarm for those stages). (2) Already accepted work continues server-side: generation, checks and settlement run in the DO (the DO is not route-gated), but publication cannot bypass its checks and `deliver`/`ack` are unreachable (routes 404). (3) Bounded delivery deadline (proposed 24 hours from acceptance, versioned policy): if the result is still undelivered when the deadline passes with the flag off, the DO's alarm refunds the card's learner attempts (`refundAttempt`, replay-safe) and marks the result `failed` with reason `delivery_deadline`; if the flag is restored before the deadline, the next `deliver` call delivers the same result and the same minted card id. (4) Restoring the flag after settlement never double charges: charge identity is the stable operation ids and `billing` state, not delivery. Tests required by 4.1: flag off during generation; flag off after settlement; restore with no duplicate charge; deadline refund; restored `deliver` returns the same block.

## 8. Check-map rows (the Lead edits `scripts/ci/check-map.json`; this lane did not)

Proved on a scratch copy of the map with the repository's own `classify`/`select` (`scripts/ci/affected.mjs`), rerun after the rename and the added modules:

- **State of the branch.** The Lead's commit `2a127941d` already added `"packages/control-plane/src/roadmap/states.js": ["packages/control-plane/test/roadmap-states.test.js"]` and moved the SQL draft to a `.txt` name. This lane then renamed the module to the checklist's `roadmap-contract.js` and added `roadmap-policy.js` and `roadmap-tools.js` (BASE.02). Until the row is replaced, `check-map.test.mjs` "every tracked executable file has a class" fails for the three new source files and "every mapped glob names checks that exist" fails for the stale `states.js` row.
- **Exact patch (replace the one row by three).**

  ```
  "packages/control-plane/src/roadmap/roadmap-contract.js": ["packages/control-plane/test/roadmap-contract.test.js"],
  "packages/control-plane/src/roadmap/roadmap-policy.js": ["packages/control-plane/test/roadmap-policy.test.js", "packages/control-plane/test/roadmap-contract.test.js"],
  "packages/control-plane/src/roadmap/roadmap-tools.js": ["packages/control-plane/test/roadmap-tools.test.js", "packages/control-plane/test/roadmap-policy.test.js", "packages/control-plane/test/roadmap-contract.test.js"]
  ```

  Each unit test matches the `CI_UNIT` rule (`packages/control-plane/test/...js`, tracked), so the "every mapped row names a Linux check or a CI-run unit test" rule holds; the test files classify `none` and need no row. With the three rows nothing is unmapped.
- Docs: `docs` globs are `docs/**` and `**/*.md`; the contract `.md`, `fixtures/*.json` and the `*.draft.sql.txt` files classify `docs`: no row, no check selected. A literal `*.sql` path anywhere would be `broad` (`**/*.sql`, checked before `docs`), which is why the drafts keep `.txt`; the real migration files under `learn-migrations/` are `broad` by design.
- At R4 integration (new source files in section 6): per the manifest rule every new tracked source file gets its `mapped` row in the commit that creates it. Proposed shape (narrow): `packages/control-plane/src/roadmap-*.js` and `agents/roadmap-*.js` -> the matching `packages/control-plane/test/roadmap-*.test.js`; the web files `use-roadmap.js`, `roadmap-client.js`, `NextStepPill.jsx`, `StepProposal.jsx`, `RoadmapInvitation.jsx`, `RoadmapView.jsx`, `roadmap-placement.js` -> `roadmap-command-check.mjs`, `roadmap-mvp-check.mjs` and their unit tests; new `checks` entries for the two checks (runner `fork`, a measured `seconds`, `check-map.test.mjs:20,24`). Exact lists are decided when the files exist.

## 9. Open decisions that block R4 (v1.4 9.2), specific questions with a recommendation

Owner records (separate; they must not delay R1-R3):

| # | Question | Recommendation |
|---|---|---|
| O1 | Adopt the D2(a) routing exception text in `decision-records.md` 1? (A: adopt; B: no, use the v2 job and accept a slower, Generate-gated R4.) | A |
| O2 | Adopt the D43 policy text in `decision-records.md` 2 as the Tutor safety policy for R4? (A: adopt; B: adopt with edits; C: no, R4 ships without screening, which the roadmap lists as a critical failure.) | A |
| O3 | Approve a paid-testing cap for R4's first real-model candidate? (A: 25 USD; B: 12 USD with 6 scenarios; C: none, fixtures only until later.) | A |
| O4 | Approve the learner strings S1-S30 (`decision-records.md` 4), and write S26-S27 (safety wording)? (A: approve S1-S25, S28-S29 now; B: all later.) | A, with S26-S27 owner-written |
| O5 | MVP label for the ladder and cleanup: recorded in the manifest (ladder 2026-11-05, cleanup update item 3); confirm R14's wording is covered. | confirm only |
| O6 | Production migration GO and `MVP_ALLOWED_SHA` | at release time, owner command |

Technical decisions the lanes need answered (Lead decides; not owner scope):

| # | Question | Recommendation |
|---|---|---|
| T1 | Build the parent step hold in `learn-spend-ledger.js` (billing.md 4) or ship the aggregate check only? | Build the hold; it is R4's core money guarantee. |
| T2 | Source bound number (`ROADMAP_SOURCE_CHARS`) | 40,000 characters, measured in the smoke |
| T3 | Which model writes cards: the retained `artifact` task (Opus 5, may route to OpenAI) or a new pinned `roadmap_card`? | Retained `artifact` for R4 (checklist 2.2 and R4.08 win; record the served provider and model); a pinned task only as a later measured change |
| T4 | Card field names `stepId`/`sourceRef` (repo camelCase) vs `step_id`/`source_ref` (roadmap text) | camelCase on cards; snake_case in D1 columns |
| T5 | Is the outbox in R4 or minimal (proposal ready, delivery unacknowledged only)? | minimal in R4, full at R6 |
| T6 | Invitation title: deterministic file name or one Sonnet call? | deterministic |
| T7 | Per-learner quota numbers and delivery deadline hours | provisional defaults in `ROADMAP_POLICY`; measure in smoke |
| T8 | Release thresholds for the rubric | mean >= 1.6 per criterion, zero critical failures (planning.md 11) |
| T9 | Interface answers from R1/R2/R3 (section 1) | each lane commits its contract before R4 integration |
