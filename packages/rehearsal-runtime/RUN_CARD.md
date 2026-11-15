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
