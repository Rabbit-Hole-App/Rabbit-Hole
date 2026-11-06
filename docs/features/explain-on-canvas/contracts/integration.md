# R4 contract: ordered integration plan

Status: DRAFT CONTRACT. Dependencies follow v1.4 3.1 and the manifest update of 2026-11-05: R4 depends on R1, R2, R3 and **the cleanup it actually uses, verified per release** (not a blanket M0/P7 gate; P7 is cleanup's closeout). Migration numbers 0036-0038 are provisional. No R4 migration number is allocated.

## 1. What R4 needs from R1, R2, R3 (interfaces; the lanes' own contracts are not in this lane's worktree, so each is a question to that lane)

| From | Needed by R4 | Interface R4 will call | Open question to the lane (unverified) |
|---|---|---|---|
| R1 card feedback (`CardFeedback.jsx`, `card-feedback.js`, `card-feedback-routes.js`, store, 0036) | Newly delivered cards show the feedback control; imported source cards and pending proposals do not | Feedback eligibility on the board card | How does R1 decide a card is "generated"? (a block marker, a type allowlist, or absence of a source flag?) R4 will set whatever marker R1 reads on delivered blocks, never on the overlay. |
| R2 Depth + settings (`learn-user-settings.js`, `chat-depth.js`, 0037) | Depth default and revision input; Auto-suggest for invitation suppression; the Depth reaches planner/proposal/card prompts | Server readers for Depth (learner, canvas) and Auto-suggest (learner) | Exported function names and signatures; whether Depth changes mid-roadmap raise a plan revision event R4 consumes. R4 assumes `readDepth(db, access)` and `readAutoSuggest(db, access)` and wraps them in one `roadmap-settings.js` seam so a rename touches one file. |
| R3 source refs (`source-ref.js`, `source-refs.js`, `SourceRefChip.jsx`, 0038) | The anchor shape for steps and delivered cards; "Visible section" scope capture; changed/missing/inaccessible source status; sharing/fork sanitizer of `sourceRef` | Pure anchor helpers (web) and the server resolver (cp) | Card field name and shape (`sourceRef` vs `source_ref`); the marker used for "source not available" in shared views; the resolver for status. R4 stores the anchor as `{ sourceId, revision, anchor }` (`fixtures/*`), conforming to whatever R3 commits. |

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
2. **Lead shared edits first** (one commit each, Lead-only files): `learn-models.js` rows + `learn-models.test.js` pins (`planning.md` 2); `learn-usage.js` `withOperationId` hook; migration file from `roadmap-r4.draft.sql` + `repository-schema.sql` mirror; `wrangler.dev.jsonc`/`wrangler.rabbit-hole-prod.jsonc`/`wrangler.rabbit-hole-dev.jsonc` binding `ROADMAP_JOBS` -> `RoadmapJobs` with a new DO migration tag (`explain-jobs-1` style, `wrangler.rabbit-hole-prod.jsonc:47`) and the var `ROADMAP_ENABLED` absent/false by default; `dev-worker.js` export of the DO class (next to `ExplainJobs`, `:23`) and the route mount (next to `:337`); `check-map.json` rows (section 7).
3. **State, Tools, UI in parallel against the contracts** (section 6 gives writers). Slices land in this order inside the lane branch: privacy sanitizer; store + replay; billing hold + op-id hook tests; adapter + escape tests; planner/validator + double; routes; DO jobs; UI reducer + fixtures; UI components; keyless checks.
4. **Integration branch:** Lead merges slices into one candidate; freezes the SHA; builds; runs unit tests of touched packages (`packages/control-plane` `node --test`, `packages/web` `npm run test:unit`), `scripts/schema-check.test.mjs`, `scripts/ci/check-map.test.mjs`, the web build (exit code), the production bundle check; then the named feature smoke (section 4) in the approved environment (not by Claude browser automation).
5. **Candidate evidence:** keyless checks in CI; the first real-model candidate only after the owner approves the cap (`decision-records.md` 3); model scoring by the rubric (`planning.md` 11).
6. **MVP preview and release** exactly per v1.4 8.2 and `docs/features/mvp-fast-path.md`: recovery branch pushed as strict descendant; `node scripts/mvp-fast-path.mjs preview --mvp ... --recovery <branch>`; owner sets `MVP_ALLOWED_SHA`; owner-controlled migration GO; `prepare --mvp`; production smoke; `ROADMAP_ENABLED` activation is part of the production GO (CLAUDE.md "Production GO means a usable feature"; the flag must not be left off after GO, nor turned on by a different release).

## 4. The focused smoke (v1.4 3.5 acceptance)

Real bounded Markdown source on an owned desktop canvas, in order, each step an assertion in `roadmap-mvp-check.mjs` (keyless, fixture server) and later once against the real dev stack:

1. Drop the source; one invitation appears when Chat is idle; dismiss it (only that invitation). 2. Start another invitation/explicit request; revise the plan in the ToC conversation; Accept plan. 3. One proposal; Tab accepts it (keyboard ownership correct); an actual explanation card appears. 4. Cancel the next proposal; Propose next step; navigate to an offscreen proposal via the indicator. 5. Change Depth, reload, open a second device, reach the stopping point. 6. Cases: duplicate acceptance (two devices/keys), failed-card refund, stale version 409, learner-instruction priority ("I already know X"), flag-off recovery, private share and fork. A planner-only pass does not satisfy R4.

Evidence kept separate (CLAUDE.md): unit/fixture; browser wiring and persistence; real-model; deployed user flow.

## 5. Migration list

Exactly one new Learn migration for R4: the 12 tables / 11 indexes of `roadmap-r4.draft.sql`, number allocated by the Lead from current main after R1 (0036), R2 (0037), R3 (0038) are known. It follows `records.md` section 6. Nothing alters existing tables (`schema-check.test.mjs` DDL-only rule). Applying to the shared dev D1 is announced first and needs owner authorization; production is the owner's `!` command; an agent applies none. No main-D1 (`migrations/`) change. Wrangler DO migration tag is a deploy-time config change, not a SQL migration.

## 6. Exact file writers for R4 (one writer per file at a time; manifest conventions)

| Role | Files |
|---|---|
| **State and money** | NEW `packages/control-plane/src/roadmap-routes.js`, `roadmap-store.js`, `roadmap-jobs.js` (the `RoadmapJobs` DO), `roadmap-publish.js` (checked publication and delivery), `roadmap-billing.js` (hold, quota, refunds), `roadmap-settings.js` (R2 seam); `roadmap/states.js` stays where the Lead places it; NEW `packages/web/src/roadmap-private.js` (`publicRoadmapCard`, pattern of `explain-back-private.js`); edits (small hunks): `shared-privacy.js` (EVERY_CARD or call the helper), `learn-boards.js` `forkState` blocks map, `learn-spend.js` (operation-id use, replay path), `learn-spend-ledger.js` (`admitStepHold`, `parentHold`); tests `roadmap-store.test.js`, `roadmap-billing.test.js`, `roadmap-privacy.test.js`, `roadmap-routes.test.js`, `roadmap-jobs.test.js` |
| **Tools and planning** | NEW `agents/roadmap-plan.js`, `agents/roadmap-propose.js`, `agents/roadmap-check.js`, `roadmap-policy.js`, `roadmap-plan.js`, `roadmap-propose.js`, `roadmap-check.js`, `roadmap-safety.js`, `roadmap-source.js`, `roadmap-generate.js` (adapter), `roadmap-model-stub.js`; edit `learn-artifact.js` (the two trusted options only, adapter.md 2); tests `roadmap-plan.test.js`, `roadmap-generate.test.js`, `roadmap-safety.test.js`, `roadmap-source.test.js`; prompt pins in `learn-prompts.test.js` rows |
| **UI** | NEW `use-roadmap.js`, `roadmap-client.js`, `NextStepPill.jsx`, `RoadmapInvitation.jsx`, `RoadmapPlan.jsx`, `roadmap-client.test.mjs`, `e2e/roadmap-command-check.mjs`, `e2e/roadmap-mvp-check.mjs`; edits `AdaptiveCanvas.jsx` (overlay, Tab, insertion), `ChatMessages.jsx`, `TableOfContents.jsx`, `TocConversation.jsx`, `usage-analytics.js` (EVENTS) |
| **Lead** | `learn-models.js`, `learn-models.test.js` rows, `learn-usage.js` (`withOperationId`), `dev-worker.js` (export + mount), `index.js` if a mount is needed, `wrangler*.jsonc`, `scripts/ci/check-map.json`, migration file + `repository-schema.sql` mirror, `LearnPage.jsx` (mount of `useRoadmap`), receipts, all pushes and `--mvp` previews |
| **Independent verifier** | NEW tests only: access matrix (owner, other learner, stranger; R14 extends), money races, entitlement predicate on every result route, flag-off recovery, replay/crash boundaries; no files in the lanes' source |

## 7. The flag `ROADMAP_ENABLED` (v1.4 4.1)

Unset or not `"true"`: every roadmap route answers 404 `roadmap_disabled` before anything else; the UI hides invitation, pill, indicator, ToC roadmap; Next Steps hooks (D1) resume; R1-R3 unaffected. Records and the DO binding remain. Introduced by the R4 integration commit (this lane introduces nothing).

**Flag off mid-generation (recovery contract).** (1) No new unsolicited work: invitation and proposal stages stop (the DO checks the flag at each alarm for those stages). (2) Already accepted work continues server-side: generation, checks and settlement run in the DO (the DO is not route-gated), but publication cannot bypass its checks and `deliver`/`ack` are unreachable (routes 404). (3) Bounded delivery deadline (proposed 24 hours from acceptance, versioned policy): if the result is still undelivered when the deadline passes with the flag off, the DO's alarm refunds the card's learner attempts (`refundAttempt`, replay-safe) and marks the result `failed` with reason `delivery_deadline`; if the flag is restored before the deadline, the next `deliver` call delivers the same result and the same minted card id. (4) Restoring the flag after settlement never double charges: charge identity is the stable operation ids and `billing` state, not delivery. Tests required by 4.1: flag off during generation; flag off after settlement; restore with no duplicate charge; deadline refund; restored `deliver` returns the same block.

## 8. Check-map rows (the Lead edits `scripts/ci/check-map.json`; this lane did not)

Proved on a scratch copy of the map with the repository's own `classify`/`select` (`scripts/ci/affected.mjs`):

- Needed now, for the files this lane adds: one `mapped` row

  `"packages/control-plane/src/roadmap/states.js": ["packages/control-plane/test/roadmap-states.test.js"]`

  Without it `classify` returns `unmapped` and `check-map.test.mjs` "every tracked executable file has a class" fails (`scripts/ci/check-map.test.mjs:13`). With it nothing is unmapped and `select` yields only that unit test (a CI-run unit test per `CI_UNIT`, so the "every mapped row names a Linux check or a CI-run unit test" rule holds). The test file itself classifies `none` (no row needed).
- Docs: `docs` globs are `docs/**` and `**/*.md` (check-map `docs`), so the contract `.md`, the `fixtures/*.json` and everything else under `docs/features/explain-on-canvas/` classify `docs`: no row needed and no check selected.
- **Warning:** `**/*.sql` is in `broad`, and `broad` is checked before `docs`, so `docs/features/explain-on-canvas/contracts/roadmap-r4.draft.sql` classifies `broad`. Pushing it makes `select` return `broad: true` (all 96 Linux checks selected in the scratch run). Fix before the first push if the broad run is unwanted: `git mv roadmap-r4.draft.sql roadmap-r4.draft.sql.txt` (classifies `docs`). This lane kept the instructed `*.draft.sql` name; see README Gap G11.
- At R4 integration (new source files in section 6): per the manifest rule, every new tracked source file gets its `mapped` row in the commit that creates it. Proposed rows (narrow): `packages/control-plane/src/roadmap-*.js` and `agents/roadmap-*.js` -> the matching `packages/control-plane/test/roadmap-*.test.js` entries plus the two new browser checks for the files the checks drive; `packages/web/src/use-roadmap.js`, `roadmap-client.js`, `NextStepPill.jsx`, `RoadmapInvitation.jsx`, `RoadmapPlan.jsx` -> `roadmap-command-check.mjs`, `roadmap-mvp-check.mjs`, `roadmap-client.test.mjs`; new `checks` entries `roadmap-command-check.mjs` and `roadmap-mvp-check.mjs` (runner `fork`, a measured `seconds`, per `check-map.test.mjs:20,24`). Their exact lists are decided when the files exist; the shape above is the rule.

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
| T3 | Which model writes cards: existing `artifact` (Opus 5, may route to OpenAI) or a new `roadmap_card` task? | New `roadmap_card` pinned to `claude-opus-5-5` (cheaper than Opus 5, registry-priced, no OpenAI path) |
| T4 | Card field names `stepId`/`sourceRef` (repo camelCase) vs `step_id`/`source_ref` (roadmap text) | camelCase on cards; snake_case in D1 columns |
| T5 | Is the outbox in R4 or minimal (proposal ready, delivery unacknowledged only)? | minimal in R4, full at R6 |
| T6 | Invitation title: deterministic file name or one Sonnet call? | deterministic |
| T7 | Per-learner quota numbers and delivery deadline hours | provisional defaults in `ROADMAP_POLICY`; measure in smoke |
| T8 | Release thresholds for the rubric | mean >= 1.6 per criterion, zero critical failures (planning.md 11) |
| T9 | Interface answers from R1/R2/R3 (section 1) | each lane commits its contract before R4 integration |
