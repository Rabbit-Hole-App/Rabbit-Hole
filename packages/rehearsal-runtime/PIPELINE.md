# Initial pipeline: contracts (owner 2026-11-15; initial-pipeline-spec.md and route-catalogue-spec.md)

Flow: start a rabbit hole with a GitHub URL, canvas and right panel open, indexing shimmer, the catalogue runs automatically when the snapshot turns ready, the Tutor says it can or cannot run it, the intake (14 uses, or typed text routed by the JEV router), "Use the codebase" asks which route when more than one is practical, rehearsal of the chosen route only, the plan message, and the Run card and Runbook created on the canvas automatically.

## Frozen shapes (schemas/, examples under schemas/examples/)
| Shape | File |
|---|---|
| Catalogue (routes, groups, effort labels, practical and reason) | `catalogue.json` |
| Catalogue job (POST /catalogues; no sandbox, no clone) | `catalogue-job.json` |
| What the chat reads: catalogue state, per-route rehearsal state, record | `learn-rehearsal-get.json` |
| Route: `prerequisites`, `longRunning`, checks `port_listens`, `http_200`, `tests_passed`; `alternatives` deprecated (kept optional so old records validate) | `route.json` |
| Job: `routeId`, `catalogueRoute` | `job.json` |
| Record: `routeId`, step `startedSec` | `record.json` |
| The 14 uses, groups, enabled flags, intents, scoped router capabilities | `packages/web/src/learn-codebase-goals.js` (`CODEBASE_USES`, `CODEBASE_USE_GROUPS`, `CODEBASE_USE_CAPABILITIES`) |

## Keys
- R2: `learn-repositories-dev/<appId>/<commit>/catalogue-<hardware>.json` (one per repo+commit) and `.../rehearsal-<routeId>-<hardware>.json` plus `rehearsal-<routeId>-<hardware>-artifacts.zip`. A record without a routeId (made before the catalogue) is at `rehearsal-cpu.json` and is read as the route it names.
- Durable Object id for a rehearsal: `app|commit|routeId|hardware`; for a catalogue: `app|commit|catalogue|hardware`. The controller job key is the sha256 of the same string.
- Control plane: `POST /api/learn/rehearsal {app, board, action: 'catalogue'}`, `{action: 'start', routeId}`; `GET ?app=&board=[&routeId=]` answers `learn-rehearsal-get.json`. The catalogue is triggered by the repository import's DO when the snapshot turns ready, not by a click.
- Controller: `POST /catalogues` (catalogue-job.json), `GET /catalogues/<key>` (status.json), `GET /catalogues/<key>/asset` (catalogue.json); `POST /rehearsals` as today with `routeId` and `catalogueRoute`.

## Plan
`draftPlan.steps[].pattern` is a superset in the schema (old records carry predict, explain, comeback); new plans use only `see`, `run`, `change` (plus the plan message's "What the README didn't say").

## No silent failure
Every stopping point has a Tutor sentence (cannot-run-edge-cases.md section 1a). A rehearsal whose repair loop gives up completes the record with the steps that passed and the failing step marked; the Run card still appears.
