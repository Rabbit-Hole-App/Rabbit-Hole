# /animation receipt: <milestone> at <shortsha>

<!-- Template (AN-07). Copy to receipts/<milestone>-<shortsha>.md and fill in from evidence only. Plan sections 12 and 14.
     Every cell names its evidence (run/job ID, test command and count, artifact hash, spend row) or says "not run".
     Keep the three evidence columns separate: a fixture pass never fills a real-provider or deployed cell.
     Allowed cell values: "pass <evidence>", "fail <evidence> (fix.md FX-AN-nnn)", "not run", "not covered by this tier",
     "n/a <reason>". Never "done", "ok" or a tick without evidence. -->

- Milestone: <M1 | M2 | M3>
- Candidate: branch `<feat/animation>`, full SHA `<40 hex>`, parent/base `<40 hex>`, tree `<40 hex>`
- Lane SHAs merged into it: R `<sha>`, G `<sha>`, U `<sha>`, A `<sha>`, V `<sha>`
- Written at: <date, time PT> by <agent>
- Preview: `https://rabbit-hole-web-dev-<worktree>.tryrabbithole.workers.dev` (worker version `<id>`, build of `<sha>`), or "not deployed"
- Feature activation on the preview: <flag/capability phase and its value, read from the deployed config>
- Spend: <$ total from spend.md rows <ids>> of the $10 cap; remaining <$>
- Open fix.md IDs: <FX-AN-nnn, ...> or none

## Exact-SHA CI

| Workflow | Run ID | SHA | Result | Selected animation checks (executed count) |
|---|---|---|---|---|
| verify | | | | n/a (unit + build) |
| fast-e2e | | | | `animation-mvp-check.mjs` <N/N checks passed, part n, job id> or "not selected" |
| gate (if required) | | | | <reuse <sha> or run id> |

Unit suites at this SHA: `packages/web` `npm run test:unit` <pass/fail counts>; `packages/control-plane` `npm test` <counts>;
oracle `node --test src/animation3d/oracle.test.mjs` <counts>.

## Acceptance matrix (plan section 12, MVP rows)

| Case | Task | Expected evidence | Fixture / unit (mocked) | Real provider (generated) | Deployed preview (user flow) |
|---|---|---|---|---|---|
| `/animation` help, pill, bare command makes no paid call | AN-03 | help pane, pill text, no generation request | | n/a | |
| New request; duplicated submit; changed proposal | AN-03/05 | one current approval, one job/card, edited format preserved | | | |
| Novel passive loop | AN-02/04/07 | 3D scene, play/pause/restart, loops without input loss | | | |
| Parameter experiment | AN-04/07 | min/default/max inputs: geometry and readouts match the oracle | | | |
| Simple game | AN-04/06/07 | wrong/correct action, hint, attempts, reset, reload restore | | | |
| Fresh prompt outside the fixtures | AN-07 | original artifact hash, renders, behaviour checked | n/a | | |
| Late responses and rapid input | AN-04/06 | latest accepted edits win; invalid/reset/late output keeps prior state | | | |
| Save / reload / cancel / delete / board switch | AN-05/06 | correct card and revision only; no duplicate job; no lost good artifact; zero model calls on reload | | | |
| Focus and gestures | AN-03 | outer canvas wheel/drag, typing in Chat, Escape and blur release | | n/a | |
| Narrow and wide card, light and dark | AN-03 | controls fit, no clipped control | | n/a | |
| WebGL unavailable | AN-02/03 | poster/description and an honest unavailable state | | n/a | |
| Legacy compatibility | AN-01/07 | `/explain` animation, `/3d`/CAD viewer and shared proposal unchanged | | n/a | |

## Real-provider runs (one row per run; spend.md is the ledger)

| Request (verbatim) | Experience | spend.md row | Model / tokens | Proposal id + version | Job id | Artifact id + hash | Rendered? | Behaviour vs oracle | Result |
|---|---|---|---|---|---|---|---|---|---|

## Focused regressions reused or rerun

| Area | Check | Evidence SHA | Reused or rerun (why) | Result |
|---|---|---|---|---|
| `/explain` program cards | explain-program-card / -state checks | | | |
| `/3d` and CAD viewer | slash-3d-check (windows-only), cad-viewer-check | | | |
| Shared proposal | generation-proposal tests, explain-proposal-card-check | | | |
| Card sizing and focus | | | | |

## Not verified at this SHA

<!-- Each line: the behaviour, why it is unverified (no run, no access, not in this tier), and the next action. -->

## Try it (3-5 steps on the preview)

1.

## Owner request (M3 only)

<!-- One clear request to approve continuing past the MVP. No AN-08+ work before the approval is recorded in checklist.md. -->
