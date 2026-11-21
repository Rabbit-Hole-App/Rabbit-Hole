# /animation checklist

[Implementation plan](../../superpowers/plans/2026-10-30-animation.md) · [Fix log](fix.md) · [Spend](spend.md) · [Billing escrow](billing-escrow.md) · [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)

Status reconciled 7 November 2026 against `main` at `19f933c2`. Times are PT.

States: `not_started`, `in_progress`, `blocked`, `pushed`, `tested`, `preview_ready`, `ready_for_owner_review`,
`owner_approved`, `deployed`, `enabled`, `production_verified`, `deferred`, `parked`.

**Latest recorded ladder release:** C14b `18d92571`, 4 November 2026 at 12:08 PM PT. Verify, fast-e2e and the production release passed. The read-only checks confirmed the deployed build and activation. SGD qualification is parked under Decision 38. [Production run 41903737638](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41903737638) · [Verify](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41902324893) · [Fast-e2e](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41902325006) · [Decision 38](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/superpowers/plans/2026-10-30-animation.md#L1122)

**Earlier MVP1 release:** `caf7ee9bc`, 3 November 2026 at 3:09 PM PT. AN-01 through AN-07 shipped with limited acceptance on a generated grid game. [MVP1 receipt](receipts/M3-8ed7e52ed.md)

**Rendering:** `/animation` draws a live 3D scene in a Three.js WebGL canvas. The review pipeline captures PNG stills. `/explain` diagrams and `/interactive` scenes use SVG. [Three.js renderer](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/19f933c286bdf118f3dc9a6e20c712509174e92d/packages/web/src/animation3d/renderer.js#L23-L54) · [Explanation SVG renderer](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/19f933c286bdf118f3dc9a6e20c712509174e92d/packages/web/src/tutor-diagrams/TutorDiagram.js#L11-L31) · [Interactive SVG renderer](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/19f933c286bdf118f3dc9a6e20c712509174e92d/packages/web/src/AnimatedScene.jsx#L522)

## Lanes (MVP1, historical)

| Agent | Owns | Branch | Last merged SHA |
|---|---|---|---|
| P (Parallel) | shared registries, canvas, routes, packages, docs, candidates | `feat/animation` | `c9d0c5509126b277603a778fbcdc2b376a08ab42` |
| R runtime/renderer | `animation3d/{contract,capabilities,fixtures,runtime,renderer,scene,state,review}.js`, review page | `feat/animation-r` | `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8` |
| G generation | server `animation-*.js`, `agents/animation-*.js`, acceptance runner | `feat/animation-g` | `c7c24b9d0f5ab14682da0cc6c490c220a5aea084` |
| U UI/interaction | `Animation3DCard.jsx`, `animation3d/{Controls.jsx,interaction.js,client.js,session.js}`, M2 wiring | `feat/animation-u` | `8ebfeef330a68cc95baffd7f4aabcb62a2006fde` |
| A assets/context | `animation3d/{storage,assets,context}.js` | `feat/animation-a` | `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf` |
| V verification | `e2e/animation-mvp-check.mjs`, `e2e/animation-oracle.mjs`, races, receipt template | `feat/animation-v` | `5a9d096558a821e584f5fe65474a944436f1233d` |

## Tasks

AN-01 to AN-07 are released at production `caf7ee9bc` (MVP1); the SHAs, branches and previews in their rows are the MVP1 development
history, and what is still open from them is in plan section 7. The ladder rows follow.

| Task/subtask | Phase | Owner | Branch | Implemented SHA (latest) | Focused test / CI | Preview | Status | Next action |
|---|---|---|---|---|---|---|---|---|
| AN-01 plan, checklist, fix log, spend ledger | MVP | P | feat/animation | `28c34c57f6a6cf8c99f64bce85e41085e0ac915f` | n/a (docs) | released 2026-11-03 (production) | deployed | plan, checklist and spend synced 2026-11-03 (MVP2a); — |
| AN-01 contract, capabilities, fixtures | MVP | R | feat/animation-r | `9a4d1f796cc31ad1c47e54ab7f4bb0e7a3751d98` (+ label placement `c0d450915`) | animation3d unit suites; oracle sweeps | released 2026-11-03 (production) | deployed | see plan section 7 (owner smoke 13.7) |
| AN-02 renderer, scene, review capture page | MVP | R | feat/animation-r | `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8` | unit; fast-e2e animation-mvp; Browser Rendering probe (18 images inspected) | released 2026-11-03 (production) | deployed | see plan section 7 (owner smoke 13.7) |
| AN-03 card, /animation command, proposal, controls | MVP | U (+P) | feat/animation-u | `8ebfeef330a68cc95baffd7f4aabcb62a2006fde`; orbit/press fix `ef73e0e90` | unit; fast-e2e animation-mvp, slash-sheet, motion-command, inline-ai | released 2026-11-03 (production) | deployed | see plan section 7 (owner smoke 13.7) |
| AN-04 runtime and atomic state | MVP | R + U | feat/animation-r | `169c6b54a3fd2e321f4a3ae70e6e74103e6c8530`; session race `8ebfeef33` | real QuickJS runtime tests; fast-e2e reload steps | released 2026-11-03 (production) | deployed | see plan section 7 (owner smoke 13.7) |
| AN-05 planner, author, review, repair, job | MVP | G (+P) | feat/animation-g | `c7c24b9d0f5ab14682da0cc6c490c220a5aea084` | control-plane animation tests; 4 real accepted builds (receipt) | released 2026-11-03 (production) | deployed | see plan section 7 (owner smoke 13.7) |
| AN-06 persistence, cancel, hydration | MVP | A (+P) | feat/animation-a | `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf`; canvas flush on feat/animation | unit; fast-e2e reload with zero job/model requests (mocked job server); start-board save-race regression (FX-AN-017, `622d17501`) | released 2026-11-03 (production) | deployed | see plan section 7 (owner smoke 13.7) |
| AN-07 MVP qualification | MVP | V + P | feat/animation-v | `5a9d096558a821e584f5fe65474a944436f1233d` | receipt M3 | released 2026-11-03 (production) | deployed | see plan section 7 (owner smoke 13.7) |
| AN-17 honest failure, transport, repair and billing | MVP2a + MVP2b | G + P | main | `18d92571` | Escrow, streaming, retry, repair and strict-schema evaluation coverage | C14b release | deployed | Strict tool-output schema redesign parked with AN-22 |
| AN-18 contract primitives | MVP3 | R | main | `18d92571` | Five capability flags and old-client HTTP 409 coverage | C14b release | deployed | — |
| AN-19 renderer, framing and golden fixture | MVP3 | R + V | main | `18d92571` | Fixture browser check and C14 product-review acceptance for the golden | C14b release | deployed | Golden is a fixture |
| AN-20 prompts, archetype, assertions and author harness | MVP4 | G + V | main | `18d92571` | C14 validated 20/20 SGD drafts and 8/9 regressions | C14b release | implementation deployed, full Gate 1 parked | Gate 1 requires 9/9 regressions and 16 owner-approved captures |
| AN-21 qualification harness and scoped release | MVP5 | V + P | main | `18d92571` | C13 Gate 2 accepted 7/9, both targeted C14 reruns rejected | C14b release and read-only verification | release production_verified, SGD qualification parked | SGD claim, signed-in acceptance and weekly canary parked |
| AN-22 patch-style repair | proposed | G | — | — | — | — | deferred (after the ladder) | not authorized by the ladder |
| AN-08..AN-16 | post-MVP | — | — | — | — | — | blocked: owner MVP approval | none until approval |

Ladder ledger UUID `857a0d92-9bb6-4b9b-9739-ae85d7df3d27`; children: AN-17 `b8a06a01-84bf-40af-bccb-9c548e55ef57`, AN-18
`951e8c49-67ee-4f3a-8264-6bff7b67478e`, AN-19 `e6ab6c6c-a7e2-4685-9010-02e15b8a412c`, AN-20 `54823918-c7a9-47d6-8dcc-0a2029be508b`, AN-21
`d7a65dd9-906e-46db-9be7-f3881353f6f1`.

## Milestones

| Milestone | Status | SHA | Preview | Receipt |
|---|---|---|---|---|
| M0 kickoff contract | done | `28c34c57f6a6cf8c99f64bce85e41085e0ac915f` | n/a | — |
| M1 first visible slice (fixtures) | done | `38918a481358517ae0708ebabcc6c709ab188c9b` | deployed 2026-10-30 | — |
| M2 generated slice | done | first accepted real build on `a006319c994a0981b487169b49231a120b2839cf` (game) | deployed | M3 receipt covers it |
| M3 MVP ready for decision | done (superseded by MVP1) | `c9d0c5509126b277603a778fbcdc2b376a08ab42` | clone, superseded | [M3-8ed7e52ed](receipts/M3-8ed7e52ed.md) |
| MVP1 released | deployed (production), signed-in smoke pending | `caf7ee9bc7355ba6d76f971d00872b0da8a1254b` | n/a | run 41736512175; limited acceptance on a grid game (plan 13.2) |
| MVP2a honest failure | deployed | — | production | [Billing escrow](billing-escrow.md) |
| MVP2b transport and repair | deployed | `18d92571` | production | [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md) |
| MVP3 primitives and renderer | deployed | `18d92571` | production | Golden fixture accepted on C14 |
| MVP4 authoring | deployed, full Gate 1 parked | `18d92571` | production | [C13/C14 evidence](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/evidence/README.md#L125) |
| MVP5 scoped release | production_verified, SGD qualification parked | `18d92571` | production | [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md) |
| Continuation gate | AN-08 through AN-16 blocked, AN-22 deferred | — | — | [Decision 38](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/superpowers/plans/2026-10-30-animation.md#L1122) |

## Owner approval record

- 2026-11-02 (as relayed in the production release brief): production GO for the Animation MVP once technical acceptance
  and release checks pass, with the additive production config below. It does not authorize unrelated schema changes,
  AN-08 onward, /whiteboard or Creator Analytics.

- 2026-11-03, about 3:00 to 3:30 PM PT (plan section 1, decisions 11 to 17): the SGD qualification ladder AN-17 to AN-21 is a
  scoped exception to the AN-08 gate (decision 15); paid attempts for its two gates are approved and the budget is raised as needed
  (decision 14); the billing default was settled later that day (decision 17 amended, decision 20).
- 2026-11-03 (decision 20): the answers to Parallel's eight questions, all as recommended: AN-17 splits into MVP2a and MVP2b;
  Explore Top rides in MVP2a; streaming is limited to the Animation roles behind a role flag; Gate 2 uses a second test session;
  paid batches are announced and proceed; the `--mvp` branch follows the escrow release.
- 2026-11-03 (decisions 21 and 22): gates run on the dev preview of a frozen candidate, never after a release (Gate 1 on MVP3's,
  Gate 2 on MVP4's), samples in parallel across up to five dev test sessions; MVP4 and MVP5 release as one when both gates pass the
  same day. Gate 1 measures the AN-20 prompt files, imported into the harness at a frozen hash with the golden exemplar at a frozen
  hash, against MVP3's contract and renderer; its table records the MVP3 SHA, the prompt-files hash and the golden artifact hash, and
  MVP4's candidate must match them or Gate 1 reruns.

AN-08 onward stays `blocked: owner MVP approval` until the owner's explicit approval of them is recorded here verbatim
with date, time and scope.

## Production activation

The C14b receipt records the read-only verification at release, including the declared client capabilities and final request copy. The signed-in SGD acceptance and weekly canary are parked. [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)

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
