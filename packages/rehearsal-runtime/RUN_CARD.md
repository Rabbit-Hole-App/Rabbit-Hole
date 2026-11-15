# Run card: contracts (owner rule 2026-11-14: everything runs inside Rabbit Hole)

A notebook-shaped card on a canvas whose repository has a rehearsal record. Cells are the rehearsal's route (install, prepare, train, sample, knobs). Run executes a cell in one Modal sandbox per (canvas, user, commit); cells share it, so files, installed packages and cwd carry from cell to cell. Output streams into a pane; the record's expected output sits under each cell. No notebook download, no Colab, no arbitrary shell.

## Frozen shapes (schemas/, with examples under schemas/examples/)

| Shape | File | Used by |
|---|---|---|
| Session request and state | `schemas/session.json` (`$defs.request`, `$defs.state`) | controller `POST /sessions`, `GET /sessions/<id>`, `POST /sessions/<id>/stop` |
| Cells and the allowed-command rule | `schemas/cells.json` | derived by the controller; the card renders them |
| Run request | `schemas/run-request.json` | `POST /sessions/<id>/run` |
| Run status | `schemas/run-status.json` | `GET /sessions/<id>/runs/<runId>`; full log at `.../log` (text/plain) |
| Record additions | `schemas/record.json`: `snapshotImage`, `steps[].stdoutHead`, `steps[].stdoutTail` | the rehearsal job writes them; sessions read them |

Two deliberate differences from the Reviewer's first sketch: a run request carries `cellId` and `flags`, never `cmd` (the controller builds the command from the cell, so a client can never choose one), and the session request carries the whole record (the control plane reads it from R2), so the controller needs no storage of its own.

## Controller (lane A, `sessions.py`, routes in `server.py`, same Bearer token)

- `POST /sessions` (request) answers state (201, or 200 with `existing: true`). One session per (canvas, user, commit); limits.MAX_SESSIONS concurrent per controller (429 beyond).
- `GET /sessions/<id>` state; `POST /sessions/<id>/run` (run-request) answers `{runId}` 202; `GET /sessions/<id>/runs/<runId>` run-status; `GET /sessions/<id>/runs/<runId>/log`; `POST /sessions/<id>/stop` terminates with `wait=True`.
- A run executes in a thread; stdout and stderr are drained into the full log as they arrive; one run at a time per session (409 otherwise).
- Reaper thread every limits.REAPER_INTERVAL_SEC: list the app's sandboxes, terminate any past its deadline or idle limit, log one line per termination (`reaper terminated <sandboxId> session <id> reason <hard|idle|orphan>`).
- Fast start: at the end of a rehearsal job `sb.snapshot_filesystem()` image id goes to `record.snapshotImage`; a session created from it skips clone and install. If the snapshot is absent or fails, the session runs the rehearsal's clone and install as a first, automatic step and reports `snapshot: false`.

## Control plane (lane B, `learn-rehearsal.js`)

`POST /api/learn/run` body `{app, board, action, ...}`, owner only (same authorisation and canvas-repository resolution as `/api/learn/rehearsal`), `action`:

| action | extra fields | forwards to the controller | answers |
|---|---|---|---|
| `start` | none | reads the record from R2 (409 `no_record` if the rehearsal has not run), `POST /sessions` with `user` = an opaque id derived from the signed-in user, never the email | session state |
| `run` | `sessionId`, `cellId`, `flags` | `POST /sessions/<id>/run` | `{runId}` |
| `poll` | `sessionId`, `runId` | `GET /sessions/<id>/runs/<runId>` | run-status |
| `log` | `sessionId`, `runId` | `GET .../log` | `{log}` |
| `stop` | `sessionId` | `POST /sessions/<id>/stop` | session state |

The browser polls every 2 s; no Durable Object and no WebSocket. The control plane never accepts a command; it forwards `cellId` and `flags` only.

## Canvas card (owner 2026-11-14; `packages/web/src/RunCard.jsx`, `rehearsal-cards.js`)

The Run card is a canvas card of type `run`, made by the chat message's Open run card beside the Runbook card (one per repo and commit; a second press focuses it). It is a generated card: `generated: { kind: 'rehearsal', repo, commit }`, and no delete path removes it (the canvas's menu hides Delete, the keys and a multi-selection delete leave it, undo never removes it). The card keeps `run: { app, board, commit, hardware, cells, results, flags }`: the record reference, the cells of the last session, each cell's last output (cut to its last 8 KB) with status, rc, seconds and time, and the flag values typed. It never keeps a session id: on load it shows Start session; Stop, an expired session or a hard timeout return it to Start with the last outputs still shown, labelled with their time. A viewer who cannot edit the canvas sees the card and the last outputs with Run and Start disabled; the control plane refuses a non-owner anyway.

## Limits (limits.py)

One session per (canvas, user, commit); 2 concurrent per controller; hard cap 3600 s; idle 600 s; cell timeout = the step's route timeout (train 1200 to 1500 s); tails 200 lines / 32 KB. Stop-loss unchanged (running Modal figure, US$20).

## Run card v1.1: parameters, outputs, tabs (owner 2026-11-15; run-card-outputs-and-params-spec (1).md)

Frozen additions: `cells.json` (every step cell lists all its step's knobs with default, source, addedBy; the allowed-command rule for `addedKnobs`), `run-request.json` (cell form `{cellId, flags?, addedKnobs?}` and custom form `{custom: {steps, knobs, name?}, addedKnobs?}`; no command field), `run-status.json` (`stdoutKind`, `metrics`, `producedFiles`, `probes`, `step`), `run-card-state.json` (the `run` card's saved state: `tab`, `addedKnobs`, `customRuns`, `history` capped at 50, text tails at most 4 KB, never file bytes).

Controller additions: `GET /sessions/<id>/runs/<runId>/files/<path>` serves a produced file (Bearer; the path must be in that run's producedFiles; previewable kinds only; binaries are never served); the control plane proxies it as `GET /api/learn/run?action=file&sessionId=&runId=&path=` under the owner's auth (a view-only link reads the same files). Detection: stat the work tree before and after each run (find newer than a marker), classify by extension, fetch previewable kinds under 5 MB per file and 25 MB per run. Metric series are parsed from `key: number` lines or the step's metric check; stdout that parses as JSON is `stdoutKind: json`; carriage-return progress is collapsed to its last state.

Card: tabs Run | Custom run | History at card level, one session for all three; Run = the cells; Custom run = pick steps in route order and edit their knobs, name, Run, Save as a preset (deletable); History = the last 50 runs with differing flags as chips, rc, duration, output kinds, Run again, Save as custom run, Compare with rehearsal; Tutor-added knobs (`addedBy: 'tutor'`, with source) are stored on the card and validated by the controller against the cloned source line before they reach a shell.

## Implementation notes (run card lane A, task 3ac0b26d)

Server side of Part 1c, 2a, 2c and the custom run of 3b. Code: `cells.py`, `sessions.py`, `run_output.py` (new), `server.py`, `runner.py`, `limits.py`; control plane `learn-rehearsal.js` `runRoute`.

- **Cells.** Every step cell lists all `route.knobs` of its step in discovery order (`value` from the step command, `--flag=v`, `--flag v` or a bare `--flag`, else the default; `default` and `source` from the knob, quotes stripped; `editable`; `addedBy: 'discovery'`). The `knobs` cell keeps its verified flags and now carries default, source and addedBy too. A step marked `failed` in the record has its cell like any other. A `longRunning` step's `expected.sec` is its `startedSec`.
- **The rule (`cells.build_command`, `build_custom`).** A flag is accepted when it is an editable flag of the cell, or in `addedKnobs` and used by the run and: name `^--[A-Za-z0-9_-]+$`, type string/float/int/bool, `source` a plain `file:line` or `file:a-b` (at most 50 lines; no leading `/`, no `..`, no backslash), the file and line exist in the session's clone (read in the sandbox: `realpath -e`, must stay under `/work/repo`, `sed -n`, the path shell-quoted) and that text contains the flag without its dashes; the value passes the type rule; at most 8 added knobs. Otherwise 400 with the flags the cell accepts. Only the knobs a run uses are checked against the source (one sandbox read each). A session still starting answers 409 for a run with added knobs. Values are placed with `set_flag` (shell-quoted): a spaced `--port 8001` is replaced by `--port=8002`; a bool in a command with no `--x=value` flag (click, argparse) is the bare flag (present for true, removed for false), otherwise `--flag=True/False`.
- **Custom run** `{custom: {steps, knobs, name}}`: `steps` are route step ids in route order, each once; `knobs` may name only those steps; each step's knobs go through the same rule. The commands run in order in one run and stop at the first non-zero exit; `status.step` names the step running; `cellId` is `custom`, `cmd` the composed commands joined with ` && `. `name` is never used by the controller.
- **longRunning cells** use the rehearsal runner's own code (`Runner._start_long`: `setsid nohup`, `port_listens` / `http_200` probes, time to the first probe, the log as stdout). The http_200 bodies (first 64 KB, with the content type) are `status.probes` (at most 4). The process is killed in a `finally` at the end of the run (done, error, timeout) and by `stop` before the sandbox is terminated; a server in a custom sequence stays up for the steps after it. A changed port knob moves the port checks (`runner.move_port_checks`, shared with the knob verification). The log is read after the probes, not streamed while they wait.
- **Produced files.** `touch` a marker before the run; afterwards `find . -newer <marker> -type f` (not `.git`, `__pycache__`, `*.pyc`, `node_modules`, `./.venv`), sorted, the first 200, with bytes and sha256; kind by extension; previewable kinds fetched with `sb.filesystem.read_bytes` when at most 5 MB, 25 MB per run and 100 MB per session (`limits.RUN_FILE_MAX_BYTES`, `RUN_FILES_MAX_BYTES`, `SESSION_FILES_MAX_BYTES`); binaries never. `producedFiles` appears on the status once the run is complete; a run whose listing failed says so on stderr.
- **Files route** `GET /sessions/<id>/runs/<runId>/files/<url-encoded path>` (Bearer): 404 when the path is not in that run's `producedFiles` or was not fetched, 403 for a binary, 410 once the session ended (the bytes are released at stop and expiry). Headers: the kind's content type (SVG is `text/plain`, never `image/svg+xml`; html is `text/html`), `Content-Disposition: inline`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`. The control plane (`GET /api/learn/run?action=file&app=&board=&sessionId=&runId=&path=[&routeId=]`, owner authorization as the other actions) streams the bytes with the same headers and passes 400/403/404/410 on plainly.
- **Status additions.** `metrics` live from stdout (`run_output.MetricParser`): the step's `metric_*` check pattern, `iter|step|epoch N: name value, ...` lines (x = N) and `key: number` lines (x = index); a generic series is reported from its second point; 8 series, 2000 points (halved when full). `stdoutKind` when complete (json object or array; 3 or more consecutive pipe or column-aligned lines is table; stdout kept up to 2 MB, longer is text). `` progress is collapsed to its last state in the tails (the full log stays raw).
- **Control plane.** `custom` and `addedKnobs` are shape-checked and forwarded unchanged; `cmd` and `command` and any unknown field are 400; `flags` may hold up to 24 flags (it was 8, below the 16 knobs of a train step).
- **Only a real Modal run proves**: the realpath and sed read of a source line, `find -newer` on the overlay filesystem, `sb.filesystem.read_bytes` for each kind, the kill of a nohup server group, curl `-D` header capture, `head -c 65536` of a binary body, and a real nanoGPT run's loss series and ckpt.pt listing.
