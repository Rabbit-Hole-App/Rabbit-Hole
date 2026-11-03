# /animation checklist

Plan: [2026-10-30-animation.md](../../superpowers/plans/2026-10-30-animation.md) (owner decisions: section 17; kickoff
inventory: section 18). Blockers and fixes: [fix.md](fix.md). Spend: [spend.md](spend.md). MVP receipt:
[receipts/M3-8ed7e52ed.md](receipts/M3-8ed7e52ed.md). Ledger parent task `8b56bdab`. Times are PT (2026-10-30 to 2026-11-01).

States: `not_started`, `in_progress`, `blocked`, `pushed`, `tested`, `preview_ready`, `ready_for_owner_review`,
`owner_approved`, `deployed`, `enabled`, `production_verified`, `deferred`.

Kickoff base: main `a3376817f003a9c41824fc5b76b644778bc9c6e3`; main `ff0fff36ad919785d1924a2f5780b2f5838e7fa8`
(release 24-eb) merged in. Integration branch `feat/animation` (worktree `animation`), MVP candidate `c9d0c5509126b277603a778fbcdc2b376a08ab42`.
Preview: https://rabbit-hole-web-dev-animation.tryrabbithole.workers.dev, built from `c9d0c5509126b277603a778fbcdc2b376a08ab42`, with
`ANIMATION_ENABLED=true` and `ANIMATION_DIAGNOSTICS=true` set on this clone only (deploy flags; no config file sets
them) and `ANTHROPIC_API_KEY` installed on this clone only. Production: see [Production activation](#production-activation)
(config prepared on `release/animation-prod`; not released).

## Lanes

| Agent | Owns | Branch | Last merged SHA |
|---|---|---|---|
| P (Parallel) | shared registries, canvas, routes, packages, docs, candidates | `feat/animation` | `c9d0c5509126b277603a778fbcdc2b376a08ab42` |
| R runtime/renderer | `animation3d/{contract,capabilities,fixtures,runtime,renderer,scene,state,review}.js`, review page | `feat/animation-r` | `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8` |
| G generation | server `animation-*.js`, `agents/animation-*.js`, acceptance runner | `feat/animation-g` | `c7c24b9d0f5ab14682da0cc6c490c220a5aea084` |
| U UI/interaction | `Animation3DCard.jsx`, `animation3d/{Controls.jsx,interaction.js,client.js,session.js}`, M2 wiring | `feat/animation-u` | `8ebfeef330a68cc95baffd7f4aabcb62a2006fde` |
| A assets/context | `animation3d/{storage,assets,context}.js` | `feat/animation-a` | `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf` |
| V verification | `e2e/animation-mvp-check.mjs`, `e2e/animation-oracle.mjs`, races, receipt template | `feat/animation-v` | `5a9d096558a821e584f5fe65474a944436f1233d` |

## Tasks

| Task/subtask | Phase | Owner | Branch | Implemented SHA (latest) | Focused test / CI | Preview | Status | Next action |
|---|---|---|---|---|---|---|---|---|
| AN-01 plan, checklist, fix log, spend ledger | MVP | P | feat/animation | `28c34c57f6a6cf8c99f64bce85e41085e0ac915f` | n/a (docs) | n/a | pushed | — |
| AN-01 contract, capabilities, fixtures | MVP | R | feat/animation-r | `9a4d1f796cc31ad1c47e54ab7f4bb0e7a3751d98` (+ label placement `c0d450915`) | animation3d unit suites; oracle sweeps | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | preview_ready | owner review |
| AN-02 renderer, scene, review capture page | MVP | R | feat/animation-r | `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8` | unit; fast-e2e animation-mvp; Browser Rendering probe (18 images inspected) | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | preview_ready | owner review |
| AN-03 card, /animation command, proposal, controls | MVP | U (+P) | feat/animation-u | `8ebfeef330a68cc95baffd7f4aabcb62a2006fde`; orbit/press fix `ef73e0e90` | unit; fast-e2e animation-mvp, slash-sheet, motion-command, inline-ai | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | preview_ready | owner review |
| AN-04 runtime and atomic state | MVP | R + U | feat/animation-r | `169c6b54a3fd2e321f4a3ae70e6e74103e6c8530`; session race `8ebfeef33` | real QuickJS runtime tests; fast-e2e reload steps | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | preview_ready | owner review |
| AN-05 planner, author, review, repair, job | MVP | G (+P) | feat/animation-g | `c7c24b9d0f5ab14682da0cc6c490c220a5aea084` | control-plane animation tests; 4 real accepted builds (receipt) | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | preview_ready | owner review |
| AN-06 persistence, cancel, hydration | MVP | A (+P) | feat/animation-a | `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf`; canvas flush on feat/animation | unit; fast-e2e reload with zero job/model requests (mocked job server); start-board save-race regression (FX-AN-017, `622d17501`) | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | preview_ready | owner review |
| AN-07 MVP qualification | MVP | V + P | feat/animation-v | `5a9d096558a821e584f5fe65474a944436f1233d` | receipt M3 | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | ready_for_owner_review | owner decision |
| AN-08..AN-16 | post-MVP | — | — | — | — | — | blocked: owner MVP approval | none until approval |

## Milestones

| Milestone | Status | SHA | Preview | Receipt |
|---|---|---|---|---|
| M0 kickoff contract | done | `28c34c57f6a6cf8c99f64bce85e41085e0ac915f` | n/a | — |
| M1 first visible slice (fixtures) | done | `38918a481358517ae0708ebabcc6c709ab188c9b` | deployed 2026-10-30 | — |
| M2 generated slice | done | first accepted real build on `a006319c994a0981b487169b49231a120b2839cf` (game) | deployed | M3 receipt covers it |
| M3 MVP ready for decision | ready_for_owner_review | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | deployed, enabled on the clone | [M3-8ed7e52ed](receipts/M3-8ed7e52ed.md) |
| APPROVAL GATE | not reached | | | |

## Owner approval record

- 2026-11-02 (as relayed in the production release brief): production GO for the Animation MVP once technical acceptance
  and release checks pass, with the additive production config below. It does not authorize unrelated schema changes,
  AN-08 onward, /whiteboard or Creator Analytics.

AN-08 onward stays `blocked: owner MVP approval` until the owner's explicit approval of them is recorded here verbatim
with date, time and scope.

## Production activation

Config (`packages/web/wrangler.rabbit-hole-prod.jsonc`, pinned by `control-plane/test/rabbit-hole-prod-config.test.js`):
`ANIMATION_JOBS` -> `AnimationJobs`; migration `animation-jobs-1` (new_sqlite_classes `AnimationJobs`) after `file-jobs-1`,
the last tag production has applied (release `2de55d520c46`, run 41560098167); `ANIMATION_ENABLED` "true";
`ANIMATION_EXECUTION_KILL` "false". `ANIMATION_DIAGNOSTICS` is never set in production. No build flag: the command ships in
every build and the server decides. No D1 migration.

Already in production and used as is: `LEARN_DB` (job board and thread checks, proposals, usage ledger), `LEARN_MEDIA`
(review captures), `BROWSER` (render), `ASSETS` (the `/render/animation3d.html` review page), secrets
`ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` and `USAGE_PLATFORM_DAY_USD` (required by `scripts/prod-release.mjs`).

Rollback (each is one line in the prod config plus its pin in the test, released like any change; never remove the
binding or the tag, which would delete saved results):
- Off: `ANIMATION_ENABLED` "false". Every `/api/learn/animation` route answers 404, so no plan, Generate or retry starts.
  Jobs already running finish in their object and settle in the usage ledger. Saved results stay; cards cannot load them
  until it is on again.
- Kill: `ANIMATION_EXECUTION_KILL` "true". Plans and builds continue; every card's results read says execution is off and
  the card does not run its scene.

Smoke after release (owner, signed in on https://digrabbithole.com): `/animation` with a request in Chat gives one plan
card (title, experience, what can change and where it starts, Generate, Edit plan); Generate once gives one card that
moves through its stages to a live scene within the 10-minute job limit; its controls (Play/Pause, Restart where it can
rewind, Speed, Reset view, Labels, Interact, the parameter) change the scene; a reload restores the card and its state
with no new job; Usage shows the credits used.

## Rulings (P)

- 2026-10-30: no separate scene hash for MVP (lane A gap). Stored artifacts are immutable by id + revision and the scene
  is fully revalidated on load; plan and program hashes are pinned.
- 2026-10-30: wheel/drag over a scene go to the outer canvas until the learner enters scene interaction; then wheel
  zooms within scene bounds and left-drag orbits; Escape/blur release (plan sections 3.7 and 4).
- 2026-10-30: animation program Workers keep their own budget of 2, separate from /explain's private pool (2 + 2 per
  board) for the MVP; sharing needs an explain-program change.
- 2026-10-30: ANTHROPIC_API_KEY installed on the preview clone only, under decision A (FX-AN-002).
- 2026-10-30: output ceilings raised within the cap after real stops: author 16,000, repair 12,000, review 6,000
  (FX-AN-010); one bounded planner correction turn (FX-AN-011).
