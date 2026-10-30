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
| AN-02 renderer | MVP | R | AN-01 | feat/animation-r | | | | in_progress | after runtime slice |
| AN-03 card, proposal settings, controls | MVP | U (+P registries) | AN-01 fixture | feat/animation-u | | | | in_progress | build against fixtures |
| AN-04 runtime and atomic state | MVP | R + U | AN-01 | feat/animation-r | | | | in_progress | runtime.js, state.js |
| AN-05 planner, author, review, job | MVP | G (+P routes) | AN-01 contract | feat/animation-g | | | | in_progress | fake-transport pipeline |
| AN-06 persistence, cancel, hydration | MVP | A (+P board) | AN-01 | feat/animation-a | | | | in_progress | storage adapter |
| AN-07 MVP qualification | MVP | V + P | AN-02..06 | feat/animation-v | | | | in_progress | oracles, checks, CI registration |
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
