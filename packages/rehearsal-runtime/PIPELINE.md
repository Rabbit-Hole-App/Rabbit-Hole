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

## Partial records and `/api/learn/run` with a route
A rehearsal whose repair loop gives up completes: the record carries the steps that passed plus the failing step marked `failed` with `error` (one line) and `tried`, `allChecksPassed` false and `gaveUp` set; the controller answers status `ready` (not `failed`), the DO stores the record, and the chat says so (cannot-run-edge-cases.md section 1a). `POST /api/learn/run` takes an optional `routeId` on every action (`start` reads that route's record); a `run` card stores the routeId; absent means the record written before the catalogue.

## Implementation notes (lane A, task 3ac0b26d)

- `catalogue.py`: the rule pass (`rule_pass`), the one model call (`run_catalogue`: claude-sonnet-5-5, 6,000 output tokens, input guard 60k tokens, US$0.50 cap, one re-ask) and the 2c checks. `python catalogue.py <snapshot.json>` prints the rule pass and calls no model. Hardware facts the model is not trusted with are enforced after its reply: Docker routes are `Medium — needs Docker`, `practical:false`, reason "Docker isn't available in the sandbox yet"; GPU, accounts, a download of 5 GB or more and a non-Python language (Node, Rust, Go and so on) are never practical; more than 8 practical routes move to `more`; a route whose `stepsSketch` cites a source outside the candidate list is dropped (a source is valid when it lies inside a candidate's `path:line` or `path:first-last` range, or one of its flags' lines). A candidate's source is the line of the command, script entry or decorator, or a range `header-key` for a manifest entry.
- Controller: `POST /catalogues` (catalogue-job.json, body up to 12 MB), `GET /catalogues/<key>` (status.json), `GET /catalogues/<key>/asset` (catalogue.json). Its own light slot (`CAT_SLOT`), not the rehearsal's. A failed job reads `no_catalogue: <plain reason>` (the one re-ask was spent) or `catalogue_unavailable: <exception class>`.
- The catalogue job key is sha256 of `app|commit|catalogue|cpu` (the Durable Object name), as in this file's Keys section; the description in `schemas/catalogue-job.json` says `app|commit|hardware|catalogue`, which is only prose: the key is any 64-hex string.
- `discover.py` with `job.catalogueRoute`: expands that route only (prerequisite routes first, sources kept), checks that the prerequisite sources are cited and every cited file exists, forces `routeId`, `title` and `prerequisites` from the catalogue route and drops `alternatives`. A job without `catalogueRoute` (the old flow) still chooses a route.
- `runner.py`: `port_listens`, `http_200`, `tests_passed`; a `longRunning` step is started with `{ setsid nohup bash -c <cmd> > /tmp/rehearsal-<id>.log 2>&1 & echo $!; }`, probed (the probe wait ends early when the pid died), its log read, and killed (`kill -- -<pid>`, then `-9`) at the end of `run_route` in a `finally`; a server step's knobs are verified by starting it with the knob values (a port knob gets a port not in use and the port checks move with it: `port_listens` and `http_200` are probed on THAT port) and stopping it, with a retry on the port knob alone when the combined start fails; a server step with knobs always ends with a `knobsVerified` or a `knobsFailed` entry (a skipped check is recorded with its reason, never silent). Traps are generated by the runner by rule from the knob types, never chosen by a model (`runner.trap_plan`, max 6 per job, each recorded with `kind` and `knob`): `wrong_type` (per numeric type, on its first knob: an int knob gets `abc`; a float knob gets an int-looking `1` when the step's flags are all `--key=value`, the type-checking configurator style, else `abc`), `string_equals` (the first string knob gets `A=B`), `unknown_flag` (a misspelled flag); a server step's trap runs under `timeout 20` and a timeout is a finding, not a failure as expected. `run_output.stdout_kind` calls a block a table only when 3 or more lines share a shape and none starts with a timestamp or log level. A suite that ran with failures (`N failed` and `M passed`) is not sent to the repair loop.
- First-failure rule: the step the repair loop gave up on (or that ran out of job time) is appended to `record.steps` with `failed`, a one-line `error` and `tried`; `allChecksPassed` is false and `gaveUp` is set; the snapshot (when earlier steps passed), the zip and the plan are still produced and `run_rehearsal` returns `ready`. `failed` stays for the sandbox not starting, the clone failing, no route and an internal error.
