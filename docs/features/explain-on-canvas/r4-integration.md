# R4 integration: State, Tools and UI lanes as one branch, plus the glue

Branch `feat/tutor-r4-integration`, built on `feat/tutor-r4-state` (3bbbadf73) with `feat/tutor-r4-tools` (5462335fa) and `feat/tutor-r4-ui` (5b2c26525) merged, then the glue below. Flag OFF: `ROADMAP_ENABLED` is not set anywhere, every roadmap route answers 404 `roadmap_disabled`, nothing is mounted, no migration is applied, no model or provider is called by any test. Contracts: `contracts/` (api.md sections 11 and 12 are the source for the shapes below).

## 1. What the glue is

| File (packages/control-plane/src/roadmap/) | Role | Interface it satisfies |
|---|---|---|
| `roadmap-source-read.js` | request-bound `readSource(access, {sourceId, revision, scope})` over Tools' `readRoadmapSource` and the production reader; whole source or an R3 `sref_` passage (quote found once, or settled by its context); the oversize limitation with offers | State routes `deps.readSource` |
| `roadmap-planning.js` | the `plan_requested` outbox handler (Tools' draft/revise planners over an injected `callModel`, State's `recordPlan`), `answerQuestion`, `revisePlan` | State routes `deps.startPlanning`; routes 6 and 7 |
| `roadmap-invitations.js` | offer, get, dismiss (two choices; dismissal is that row; Auto-suggest off, Ask, an unfinished roadmap, an unsupported or foreign source suppress without a row) | routes 1 to 3 |
| `roadmap-compose.js` | `compose(roadmap, step)`: deterministic proposal from the validated plan step, no model call | State `proposeNextStep` / `replaceStep` |
| `roadmap-run.js` | the `step_accepted` handler: request-less source revalidation, `generateRoadmapCard`, `checkRoadmapCard`, `recordGenerated` / `failCard` (one automatic retry after the refund; everything else terminal and refunded) | Tools `loadAccepted` / `withProviderCall` / `callModel`; State `recordGenerated`, `failCard` |
| `roadmap-models.js` | per-role `callModel(role, body)`: `loggedModel(role, transport)` under `withSystemUsage`, State's stable operation id, a `learn_roadmap_calls` checkpoint around the call, a quota reservation before it; the safety classifier (`makeClassify`) and its JEV ask | Tools planners/checks `callModel`, `classify` |
| `roadmap-quota.js` | per-learner hour and day counters in `learn_roadmap_quota` | D14 / R4.06 |
| `roadmap-access.js` | the access object rebuilt from the stored identity, and `revalidateSourceAsJob` (the owner branch of `authorizeFileSource` from D1 only) | api.md 12.3 |
| `roadmap-source-refs.js` | plan-time minting of R3 references at Accept plan; default mint writes R3's `learn_source_refs` and is skipped where that table does not exist | api.md 12.2 |
| `roadmap-wire.js` | `roadmapDeps(env, ctx)`, `registerRoadmapHandlers()`, `scheduledRoadmapKick(env)`, the kick (the object, or inline in `waitUntil` where `ROADMAP_JOBS` is not bound) | Lead mounts |

Hunks in lane files (kept small): `roadmap-store.js` (create commits a `plan_requested` event; `recordPlan` accepts a question or a limitation with no steps and fixes the language once; `acceptPlan` refuses a plan with no steps), `roadmap-routes.js` (invitations, answer, revise, history; the new routes' wiring; `source.key/rev` accepted as the contract says; `ack` accepts `cardId` and `boardRevision`; the mode fact needs no client key), `roadmap-view.js` (source name, `sourceRelation`, history), `roadmap-events.js` and `roadmap-jobs.js` (`runDueRoadmapEvents` shared by the object and tests), `roadmap-generate.js` (awaits State's async `withRoadmapProviderCall`; a call that may have reached the provider is `unknown_provider_outcome`, never a blind retry), the UI mount in `LearnPage.jsx` and `ask.jsx` (the UI lane's script, every anchor matched on this base).

## 2. Readings and decisions made

- **Proposal composition (R4.04 / R4.10 / R4.12).** R4.04 and R4.12 list a Sonnet proposal role; Tools shipped no proposal prompt, and the proposal is the plan step the learner already accepted with the plan. R4 composes it deterministically (title, description, format, content hash) and registers no `roadmap_proposal` row. A model-written proposal and a safety screen of the proposal's own words are the later R5/R6 change.
- **No separate scope snapshot in object storage.** The source revision is the sha256 of the stored bytes, so equal revision is the same text. Planning, generation and minting reread the owner's stored file request-less and check the revision and the scope fingerprint.
- **Planning is event-driven.** Create, answer and revise commit `plan_requested` with the fact; the handler is idempotent (action key derived from the instruction version; a superseded version is dropped). With the flag off it waits.
- **Revision of an accepted plan.** Depth alone applies at once (ceiling follows). An instruction edit before acceptance (questioning, proposed) makes a new plan version that needs acceptance. An instruction edit on an accepted roadmap, and any Scope change, are refused (409 `invalid_transition`, 400): the transition table has no `active -> proposed`. See the open decision in the hand-back.
- **A held card is refunded, not regenerated.** `ponytail:` in `roadmap-run.js`.
- **Brownfield safety.** Where R3's table is absent the default mint is skipped, a passage scope is unsupported, and cards carry no `sourceRef`.

## 3. Lead patches (not applied; `lead-patches/`)

Apply in this order after the chain below is in place. Each file was produced by actually editing the tree, so `git apply --check` is the proof.

1. `learn-models-roadmap-roles.patch` (six roles + registry test)
2. `wrangler-roadmap-jobs.patch` (dev, parallel, prod bindings, tag `roadmap-jobs-1`, and `rabbit-hole-prod-config.test.js`)
3. `dev-worker-app-worker.patch` (export, handler registration, route mount, scheduler hook; `app-worker.js` export)
4. `analytics-rh-roadmap-step.patch` (`EVENTS` entry and test)
5. `node docs/features/explain-on-canvas/lead-patches/apply-r4-check-map.mjs` (41 rows, 2 checks, 3 appended rows; textual because the file has duplicate keys)

`previewWriteAllowed` needs no patch: `/api/learn/roadmap...` already matches `^/api/(repositories|learn|byoc)(/|$)` (checked for create, accept, dismiss and history paths).

## 4. Stacking onto the release chain (P2, R1, R3, P3, P4, R2, P5)

Do not merge R1, R2 or R3 here. `git merge-tree` against each candidate shows where this branch collides:

| File | Collides with | Lines | Resolution |
|---|---|---|---|
| `LearnPage.jsx`, `ask.jsx` | P2, R1, R3 (and R2 in `ask.jsx`) | the UI mount (commit "mount the roadmap UI"): the import line after `useNextSteps`, the hook after `useCanvasComments`, `<NextStepsHost on=`, the `<RoadmapCanvas>` after `<ChatHandle>`, the ToC and Chat strip insertions, `hideConversation = false` and the start of `send` | drop that commit's two files (`git checkout <chain> -- packages/web/src/LearnPage.jsx packages/web/src/ask.jsx`) and rerun `apply-r4-ui-mount.mjs` on the chain tip; it refuses loudly if an anchor moved |
| `shared-privacy.js` | R3 | `sharedBlock`: both lanes wrap `publicExplainBack(block)` | `block = publicRoadmapCard(withSharedSourceRef(publicExplainBack(block)));` and keep both imports |
| `learn-boards.js` | R3 (auto-merges) | R4: import line 26 and `forkState` line 487; R3: import 27, `saveOwn` 247-265, `fork` 655 | confirm `forkState` keeps R3's source-ref handling after `publicRoadmapCard(...)` |
| `learn-artifact.js` | R2, R3 (auto-merge) | R4: `artifactPlan` args, `generateArtifact` signature and first lines (64-82); R2: 26 and 88-96 (inside `generateArtifact`); R3: `artifactFetch` 168-227 | disjoint; rerun `roadmap-generate.test.js` after both |
| `explain-job.js` | R2, R3 | R4 touches none | none |
| `repository-schema.sql` | R1, R2, R3 | each appends its migration mirror at the file tail | concatenate in migration order 0036 (R1), 0037 (R2), 0038 (R3), then this branch's 0039 |
| `publication-analytics.test.js` | R1, R2, R3 | the single assertion they all changed | Lead resolves once (manifest); this branch does not touch it |
| `scripts/ci/check-map.json` | P2, R1, R3 | rows appended near the same keys | apply the script last, it is a textual insert in front of `runbook-schema.js` |
| `learn-models.js`, `dev-worker.js`, `app-worker.js`, `wrangler*.jsonc`, `usage-analytics.js` | P3, P4 (models, dev-worker) | the Lead patches above | apply after P3 and P4: `learn-models.js` loses `tutor`, `tutor_evaluator` and `journey_*` there, so the registry-order test line moves; the roadmap rows sit before the `artifact` entry |

Migration `0039-roadmap-core.sql` (State) is the only migration; the authorizations tables are inside it. Re-verify the number against the chain at integration. Nothing was applied to any database.

Auto-suggest and mode come from R2 (`learn-user-settings.js`): `roadmapDeps(env, ctx, { settings })` takes its reader as `settings(db, access) -> { autoSuggest, mode }`. Without it the default is on and Tutor.

## 5. Not covered here

The Durable Object (`RoadmapJobs`) and its alarm are exercised only through fakes of its storage; nothing was run under workerd. No browser check was run (owner rule): the UI lane's keyless checks are registered in the check-map patch for CI. No real model, JEV or paid call was made, so planner quality, grounding and safety thresholds are unmeasured.
