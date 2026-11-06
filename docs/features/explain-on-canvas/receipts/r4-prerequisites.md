# R4 (complete bounded Markdown explanation loop) prerequisites receipt

Stacked release candidate `feat/tutor-r4-release` (MVP fast path, owner label 2026-11-05). **`ROADMAP_ENABLED` is unset in every config: a learner sees nothing after this release.**

- Stacked on: R2 release tip `e44aa04f00147d58e578e4d890dd1738b8e9e6ca` (`feat/tutor-r2-release`), on cleanup P4 `cdac8cfc534614d98388695e8a2ff8e9a4138e31`, P3 `0c322bd50eed1bed9bef09cb5826f51ff565ced4`, R3 `4b754b6c2b36a41dc651ed4c2608ca239668d656`, R1 `15141c05a931e082aaa2e59693d288a421d73938`, cleanup P2 `409f4e8f3e4638bcc4b0477a2d2a26041ab40ec3`, main `9b798f7760b7af5aa2446d281a07eebfc4e10b84`. **P2, R1, R3, P3, P4, then R2, must be released to main first**; this branch then fast-forwards from the released R2 tip.
- R4 came in as one merge of `feat/tutor-r4-integration` (tip `f8a0f8c11`: State, Tools and UI lanes plus the glue). A merge was chosen over 44 cherry-picks because only six files conflicted; main stays an ancestor of the release SHA.

## What R4 depends on (verified by `git grep` on this base)

- **R1 (card eligibility).** The loop delivers only `explanation` and `table` cards (`roadmap-tools.js` format registry). Both are in R1's generated-card allowlist (`card-feedback.js` `GENERATED`), so delivered cards get the thumbs control with no R4 code. R4 imports nothing from R1.
- **R2 (Depth, settings).** Depth is a field of the roadmap record (`roadmap-store.js` `createRoadmap`, `ceilingFor(depth)`; `roadmap-generate.js` input `depth`), read from the request, not from R2's module. The mode and Auto-suggest reader is an injected seam (`roadmapDeps(env, ctx, { settings })`); **the dev-worker mount does not pass R2's reader, so the default (Auto-suggest on, Tutor) applies. Wire `learn-user-settings` into the mount before activation.** The UI host passes `depth: () => 'standard'`.
- **R3 (source references).** Plan-time minting writes R3's `learn_source_refs` by SQL in R3's shape (`roadmap-source-refs.js`, `roadmap-source-read.js`: `sref_` ids, `{v,id,kind,source{key,rev,name,home},anchor{quote}}`) and reads passage scopes through it; a database without the table skips minting and cards carry no `sourceRef`. `LearnPage.jsx` already imports R3's `source-ref.js`. Shared/forked boards: `shared-privacy.js` `sharedBlock` is `publicRoadmapCard(withSharedSourceRef(publicExplainBack(block)))`; `learn-boards.js` `forkState` strips the roadmap step relationship (`publicRoadmapCard`), and R3's source-ref index hunks in `saveOwn` and `fork` are intact.
- **P2/P4 (hot files).** `ask.jsx`: the Table of contents' Edit plan diverts to the roadmap revision (`divert`), the hook click stays P4's plain turn (`sendStep` -> `send`); `LearnPage.jsx`: `useRoadmap`, `<RoadmapCanvas>`, `<RoadmapToc>`, `<RoadmapChat>` mounted by `ui-patches/apply-r4-ui-mount.mjs` on this chain (every anchor matched once). `<NextStepsHost on={nextStepsHere && !roadmap.active}>`: hooks stand down only while a roadmap is active; `roadmap.active` is false whenever there is no view or the flag answered `roadmap_disabled`. The two web tests that pinned the old text changed with it.

## Stack-time changes

- `shared-privacy.js`, `repository-schema.sql` (0039 mirror moved to the tail after 0038; `schema-check` passes), `scripts/ci/check-map.json` (textual insert) resolved; `LearnPage.jsx` and `ask.jsx` kept the chain's version and the mount re-applied.
- Lead patches, each its own commit: six `roadmap_*` model roles (registry-order test line adapted to P3/P4's `learn-models.js`), `ROADMAP_JOBS` binding and tag `roadmap-jobs-1` (dev, parallel, production; pinned production config test), dev-worker route mount + `export { RoadmapJobs }` + `registerRoadmapHandlers()` + scheduled kick, `rh_roadmap_step` analytics event, check-map rows.
- One stack fix found by the full-loop test: with R3's table present, a plan step's `sourceRef.anchor.quote` in the polled view was source text ("polling never carries the text"). `roadmap-view.js` now keeps only `{v,id,kind,source}` in the view; the delivered card still carries the full reference. The UI reads only `source.name` and `source.key`.

## Migrations and bindings

- `learn-migrations/0039-roadmap-core.sql`: **not applied anywhere** (not dev, not production). Required on production `LEARN_DB` before `ROADMAP_ENABLED` is ever set. With the flag off no route or UI reads it; the scheduled kick queries the roadmap tables each cron tick and swallows the error while the tables are absent.
- Durable Object migration tag `roadmap-jobs-1` (`new_sqlite_classes: ["RoadmapJobs"]`) in the dev, parallel and production wrangler configs. The class is created at the production deploy; additive, cannot be cheaply undone.
- Flag state: `git grep -n ROADMAP_ENABLED -- 'packages/*/wrangler*.jsonc'` matches only comments in the three configs; `rabbit-hole-prod-config.test.js` asserts `vars.ROADMAP_ENABLED` is undefined in app, dev, parallel and control-plane configs. `roadmap-routes.test.js` asserts every `/api/learn/roadmap*` path answers 404 `roadmap_disabled` before identity or the database are read for unset, empty, `false`, `1` and `TRUE`.

## Owner records still required before activation

D2 (routing exception), D43 (safety policy), the $25 paid-test cap (D-R4-3), approval of learner strings S1-S34, and owner text for S26 and S27. None is needed for this flag-off release.

## Not verified

The `RoadmapJobs` Durable Object and its alarm under workerd (storage fakes only); any browser check (owner rule, none run); any real model, classifier (JEV) or paid call, so planner quality, grounding and safety thresholds are unmeasured; migration 0039 against a real D1; the R2 settings reader wiring.

## Recovery

`feat/tutor-r4-release-recovery`: one forward commit removes the mounts only (dev-worker route, `LearnPage.jsx`/`ask.jsx` UI mount, scheduled kick). The inert tables, the `RoadmapJobs` class export and the binding stay (a deployed Durable Object class cannot be un-migrated cheaply).
