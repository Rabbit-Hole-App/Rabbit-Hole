# /animation checklist

Plan: [2026-10-30-animation.md](../../superpowers/plans/2026-10-30-animation.md) (owner decisions: section 17; kickoff
inventory: section 18). Blockers and fixes: [fix.md](fix.md). Spend: [spend.md](spend.md). Receipts: `receipts/`.
Ledger parent task `8b56bdab`. Times are PT.

States: `not_started`, `in_progress`, `blocked`, `pushed`, `tested`, `preview_ready`, `ready_for_owner_review`,
`owner_approved`, `deployed`, `enabled`, `production_verified`, `deferred`.

Kickoff base: main `a3376817f003a9c41824fc5b76b644778bc9c6e3`. Integration branch `feat/animation` (worktree `animation`).
Preview: `rabbit-hole-web-dev-animation` (not yet deployed).

## Lanes

| Agent | Owns | Branch | Worktree |
|---|---|---|---|
| P (Parallel) | shared registries, canvas, routes, packages, lockfile, docs, release candidates | `feat/animation` | `animation` |
| R runtime/renderer | `animation3d/{contract,capabilities,fixtures,runtime,renderer,state}.js` + tests | `feat/animation-r` | `animation-r` |
| G generation | server `animation-{brief,author,render,review,repair,job,policy}.js` + tests | `feat/animation-g` | `animation-g` |
| U UI/interaction | `Animation3DCard.jsx`, `animation3d/{Controls.jsx,interaction.js,client.js}` + tests | `feat/animation-u` | `animation-u` |
| A assets/context | `animation3d/{storage,assets,context}.js` + tests | `feat/animation-a` | `animation-a` |
| V verification | server `animation-evidence.js` (post-MVP), `e2e/animation-*-check.mjs`, oracles, receipts | `feat/animation-v` | `animation-v` |

## Tasks

| Task/subtask | Phase | Owner | Dependency | Branch | Implemented SHA | Focused test / CI | Preview / release | Status | Next action |
|---|---|---|---|---|---|---|---|---|---|
| AN-01 kickoff, plan, checklist, fix log, spend ledger | MVP | P | none | feat/animation | (M0 commit) | n/a (docs) | n/a | pushed | lanes start |
| AN-01 contract, capabilities, fixtures | MVP | R | none | feat/animation-r | `9a4d1f796cc31ad1c47e54ab7f4bb0e7a3751d98` | `node --test src/animation3d/*.test.mjs` 10/10 (local) | merged into feat/animation 1:25 PM | tested | lanes consume |
| AN-02 renderer (+ scene.js) | MVP | R | AN-01 | feat/animation-r | `7e83bd5813d7ba26aa68726df0606126417c8456` | animation3d 56/56 on feat/animation f75c91df2; WebGL unverified until CI browser check | not deployed | pushed | U wires into card |
| AN-03 card, proposal settings, controls | MVP | U (+P registries) | AN-01 fixture | feat/animation-u | | | | in_progress | build against fixtures |
| AN-04 runtime and atomic state | MVP | R + U | AN-01 | feat/animation-r | `169c6b54a3fd2e321f4a3ae70e6e74103e6c8530` | real QuickJS runtime tests; web unit 4722 pass 0 fail (R branch) | not deployed | tested | U wires into card |
| AN-05 planner, author, review, job | MVP | G (+P routes) | AN-01 contract | feat/animation-g | | | | in_progress | fake-transport pipeline |
| AN-06 persistence, cancel, hydration | MVP | A (+P board) | AN-01 | feat/animation-a | `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf`; canvas flush 196e92f..73fbfcd07 on feat/animation | storage/assets 24/24; web unit 4733 pass 1 fail (pinned source test, fixed 73fbfcd07) | not deployed | tested | real-navigation browser step pending |
| AN-07 MVP qualification | MVP | V + P | AN-02..06 | feat/animation-v | `dfccf341c5d1e0a63f64baf7d7a161a23ba318a8` (not yet merged) | oracle 4/4 (full sweeps, 9 wrong programs rejected); animation-mvp-check.mjs 24 steps never executed | n/a | pushed | merge with U card + check-map patch |
| AN-08..AN-16 | post-MVP | — | owner MVP approval | — | — | — | — | blocked: owner MVP approval | none until approval |

## Milestones

| Milestone | Status | SHA | Preview | Receipt |
|---|---|---|---|---|
| M0 kickoff contract | in_progress | | n/a | |
| M1 first visible slice (fixtures) | not_started | | | |
| M2 generated slice | not_started | | | |
| M3 MVP ready for decision | not_started | | | |
| APPROVAL GATE | not reached | | | |

## Owner approval record

None yet. AN-08 onward stays `blocked: owner MVP approval` until the owner's explicit approval is recorded here
verbatim with date, time and scope.

## Rulings (P)

- 2026-10-30: no separate scene hash for MVP (lane A gap). Stored artifacts are immutable by id + revision and the scene is fully revalidated on load; plan and program hashes are pinned.
- 2026-10-30: wheel/drag over a scene go to the outer canvas until the learner enters scene interaction; then wheel zooms within scene bounds and left-drag orbits; Escape/blur release (plan sections 3.7 and 4).
- 2026-10-30: animation program Workers keep their own budget of 2, separate from /explain's private pool (2 + 2 per board) for the MVP; sharing needs an explain-program change.
