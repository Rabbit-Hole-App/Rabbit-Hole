# /animation checklist

Plan: [2026-10-30-animation.md](../../superpowers/plans/2026-10-30-animation.md) (owner decisions: section 17; kickoff
inventory: section 18). Blockers and fixes: [fix.md](fix.md). Spend: [spend.md](spend.md). MVP receipt:
[receipts/M3-8ed7e52ed.md](receipts/M3-8ed7e52ed.md). Ledger parent task `8b56bdab`. Times are PT (2026-10-30).

States: `not_started`, `in_progress`, `blocked`, `pushed`, `tested`, `preview_ready`, `ready_for_owner_review`,
`owner_approved`, `deployed`, `enabled`, `production_verified`, `deferred`.

Kickoff base: main `a3376817f003a9c41824fc5b76b644778bc9c6e3`; main `ff0fff36ad919785d1924a2f5780b2f5838e7fa8`
(release 24-eb) merged in. Integration branch `feat/animation` (worktree `animation`), MVP candidate `8ed7e52edec5baccc08109310581cee325f3577a`.
Preview: https://rabbit-hole-web-dev-animation.tryrabbithole.workers.dev, built from `8ed7e52edec5baccc08109310581cee325f3577a`, with
`ANIMATION_ENABLED=true` and `ANIMATION_DIAGNOSTICS=true` set on this clone only (deploy flags; no config file sets
them) and `ANTHROPIC_API_KEY` installed on this clone only. Production config is unchanged: /animation is not in
production.

## Lanes

| Agent | Owns | Branch | Last merged SHA |
|---|---|---|---|
| P (Parallel) | shared registries, canvas, routes, packages, docs, candidates | `feat/animation` | `8ed7e52edec5baccc08109310581cee325f3577a` |
| R runtime/renderer | `animation3d/{contract,capabilities,fixtures,runtime,renderer,scene,state,review}.js`, review page | `feat/animation-r` | `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8` |
| G generation | server `animation-*.js`, `agents/animation-*.js`, acceptance runner | `feat/animation-g` | `c7c24b9d0f5ab14682da0cc6c490c220a5aea084` |
| U UI/interaction | `Animation3DCard.jsx`, `animation3d/{Controls.jsx,interaction.js,client.js,session.js}`, M2 wiring | `feat/animation-u` | `8ebfeef330a68cc95baffd7f4aabcb62a2006fde` |
| A assets/context | `animation3d/{storage,assets,context}.js` | `feat/animation-a` | `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf` |
| V verification | `e2e/animation-mvp-check.mjs`, `e2e/animation-oracle.mjs`, races, receipt template | `feat/animation-v` | `5a9d096558a821e584f5fe65474a944436f1233d` |

## Tasks

| Task/subtask | Phase | Owner | Branch | Implemented SHA (latest) | Focused test / CI | Preview | Status | Next action |
|---|---|---|---|---|---|---|---|---|
| AN-01 plan, checklist, fix log, spend ledger | MVP | P | feat/animation | `28c34c57f6a6cf8c99f64bce85e41085e0ac915f` | n/a (docs) | n/a | pushed | — |
| AN-01 contract, capabilities, fixtures | MVP | R | feat/animation-r | `9a4d1f796cc31ad1c47e54ab7f4bb0e7a3751d98` (+ label placement `c0d450915`) | animation3d unit suites; oracle sweeps | `8ed7e52edec5baccc08109310581cee325f3577a` | preview_ready | owner review |
| AN-02 renderer, scene, review capture page | MVP | R | feat/animation-r | `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8` | unit; fast-e2e animation-mvp; Browser Rendering probe (18 images inspected) | `8ed7e52edec5baccc08109310581cee325f3577a` | preview_ready | owner review |
| AN-03 card, /animation command, proposal, controls | MVP | U (+P) | feat/animation-u | `8ebfeef330a68cc95baffd7f4aabcb62a2006fde`; orbit/press fix `ef73e0e90` | unit; fast-e2e animation-mvp, slash-sheet, motion-command, inline-ai | `8ed7e52edec5baccc08109310581cee325f3577a` | preview_ready | owner review |
| AN-04 runtime and atomic state | MVP | R + U | feat/animation-r | `169c6b54a3fd2e321f4a3ae70e6e74103e6c8530`; session race `8ebfeef33` | real QuickJS runtime tests; fast-e2e reload steps | `8ed7e52edec5baccc08109310581cee325f3577a` | preview_ready | owner review |
| AN-05 planner, author, review, repair, job | MVP | G (+P) | feat/animation-g | `c7c24b9d0f5ab14682da0cc6c490c220a5aea084` | control-plane animation tests; 4 real accepted builds (receipt) | `8ed7e52edec5baccc08109310581cee325f3577a` | preview_ready | owner review |
| AN-06 persistence, cancel, hydration | MVP | A (+P) | feat/animation-a | `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf`; canvas flush on feat/animation | unit; fast-e2e reload with zero job/model requests (mocked job server) | `8ed7e52edec5baccc08109310581cee325f3577a` | preview_ready | owner review |
| AN-07 MVP qualification | MVP | V + P | feat/animation-v | `5a9d096558a821e584f5fe65474a944436f1233d` | receipt M3 | `8ed7e52edec5baccc08109310581cee325f3577a` | ready_for_owner_review | owner decision |
| AN-08..AN-16 | post-MVP | — | — | — | — | — | blocked: owner MVP approval | none until approval |

## Milestones

| Milestone | Status | SHA | Preview | Receipt |
|---|---|---|---|---|
| M0 kickoff contract | done | `28c34c57f6a6cf8c99f64bce85e41085e0ac915f` | n/a | — |
| M1 first visible slice (fixtures) | done | `38918a481358517ae0708ebabcc6c709ab188c9b` | deployed 2026-10-30 | — |
| M2 generated slice | done | first accepted real build on `a006319c994a0981b487169b49231a120b2839cf` (game) | deployed | M3 receipt covers it |
| M3 MVP ready for decision | ready_for_owner_review | `8ed7e52edec5baccc08109310581cee325f3577a` | deployed, enabled on the clone | [M3-8ed7e52ed](receipts/M3-8ed7e52ed.md) |
| APPROVAL GATE | not reached | | | |

## Owner approval record

None yet. AN-08 onward stays `blocked: owner MVP approval` until the owner's explicit approval is recorded here
verbatim with date, time and scope.

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
