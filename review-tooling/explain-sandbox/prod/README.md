# /explain generated programs: production release and rollbacks

One script, `explain-prod.sh`, run by the owner through `explain-prod.cmd` (any directory; it opens its own console, logs to
`C:\s\spec\logs\explain-prod-<action>-<time>.log`, keeps the exit code, and a rerun resumes). Every action has a read-only
`--check`. It reuses the landing release path: `C:/s/spec/day-1021/rel-after-gate.sh` (gate note, forward-only dev push,
deploy-dev) and `rel-main.sh` (fast-forward main push, the release run, probes), then a read-back of the production Worker
through `with-cf.mjs` + `explain-worker-vars.mjs`, `explain-bindings.mjs` and `cp-served.mjs` (Cloudflare GET only).

| Command | What it does | Typed at the console | Duration |
|---|---|---|---|
| `C:\s\spec\explain-sandbox\prod\explain-prod.cmd release` | Releases `release.pins` (EXPLAIN_PROGRAM_ENABLED true, EXPLAIN_PROGRAM_EXECUTION_KILL false). Records the Worker pair it replaces in `state/prev-worker.txt` before pushing. | none (running it is the GO) | dev deploy + release run; the same path was quoted at about 6 minutes for the Motion flip, not measured here |
| `... explain-prod.cmd generation-off` | Releases `generation-off.pins`: EXPLAIN_PROGRAM_ENABLED false. | `GENERATION OFF` | same as a release, plus the gate/CI of that commit if not run yet |
| `... explain-prod.cmd kill` | Releases `kill.pins`: EXPLAIN_PROGRAM_EXECUTION_KILL true. | `KILL EXECUTION` | same as a release |
| `... explain-prod.cmd emergency` | `wrangler rollback` of rabbit-hole-app, then rabbit-hole-cp, to the pair recorded by `release`. No CI. | `ROLL BACK WORKER` | about 1 minute (two rollbacks and a read-back) |

Add `--check` to any line first: every check and the live read-back, nothing pushed, rolled back or recorded.

## Which rollback when

- **Generation off** for a cost or quality problem with NEW programs. Changes: no new program is generated (`programEnabled`
  is false; `explain-author.js` authors scenes again). Also: an Edit of an existing program card is refused ("cannot be
  edited this way yet", `explain-job.js`). Does not change: accepted program cards already on canvases keep loading and
  running (the execution answer stays allowed); scene explanations, `/explain v2` (EXPLAIN_V2_ENABLED) and everything
  else stay as released.
- **Execution kill** for an execution problem (a program card misbehaving when it runs). Changes: the job and result routes
  answer `execution: { allowed: false }`, so a program card that LOADS afterwards refuses to run (program-card.js checks it when the
  artifact is loaded; the cards are kept, not deleted). Does NOT change: a card already open and running keeps running until it is
  reloaded or reopened; the check is not repeated while it runs. Not an instant stop of every open card.
  Does not change: generation. EXPLAIN_PROGRAM_ENABLED stays true, so new program requests are still authored and charged,
  and their cards do not run until the kill is lifted. If spend must stop too, use emergency.
- **Emergency Worker rollback** for anything else broken by the release, or when the two above are too slow (each needs
  its own gate, verify and fast-e2e on its SHA). Changes: both production Workers serve the recorded pre-release pair again,
  so EVERY change since then (not only /explain) is undone. That stops new program generation too: the restored version has EXPLAIN_PROGRAM_ENABLED unset, and the launcher's read-back fails loudly unless it confirms programs are off; open running cards still run until reloaded (the restored Worker then answers no program). Does not change: `main` (it still holds
  the release; the next main push redeploys it), any D1 data or saved board (a Worker rollback never restores data).
  After it, fix forward with `generation-off` (allowed while production serves the recorded pair) or a fix release.

The kill and generation-off commits are each a direct child of the released commit, so after one of them is on main the
other must be re-cut on the new main before it can run (the launcher refuses with that fix). Use emergency meanwhile.

## Pins (the integrator fills them)

`release.pins`, `generation-off.pins`, `kill.pins`, three lines each:

```
SHA=<40-hex candidate, the worktree HEAD>
GATE=<the sharded gate run id for exactly that SHA>
MAIN_PREV=<40-hex main this release fast-forwards from>
```

`PENDING` or a malformed value refuses with a one-line fix. A stale pin refuses: main must equal MAIN_PREV (or already be SHA,
on a rerun), main and dev must be ancestors of SHA, the gate must be success and the newest verify and fast-e2e runs on SHA
must include a success. For generation-off and kill, SHA must be a direct child of MAIN_PREV changing only the prod config
and its pinning test, and the committed config must hold the expected flag values.

Current state (2026-10-28):
- `release.pins`: SHA c59bae9627bb (worktree `explain-prod`, branch release/explain-prod2). GATE and MAIN_PREV PENDING. Both
  a644f5e46c46 and the landing commit e801cf290676 are ancestors of c59bae962, so MAIN_PREV is whichever main is when the
  release runs.
- `generation-off.pins`: SHA 9f7060d475d9 (worktree `explain-prod-off`, branch release/explain-prod2-off, LOCAL ONLY),
  MAIN_PREV c59bae962, GATE PENDING.
- `kill.pins`: SHA 31f349d60139 (worktree `explain-prod-kill`, branch release/explain-prod2-kill, LOCAL ONLY), MAIN_PREV
  c59bae962, GATE PENDING.
- To make the two rollbacks ready, push both branches to `rabbit-hole`, run the gate, verify and fast-e2e on each SHA, and
  fill GATE. If the release SHA changes (re-cut), re-cut both flip commits on it and update SHA and MAIN_PREV.

## Files

- `explain-prod.sh`, `explain-prod.cmd`: the launcher. `cp-served.mjs`: read-only GET of the control plane's served version.
- `state/prev-worker.txt`: `release|<released sha>|<app version>|<app sha12>|<cp version>|<cp sha12>|<epoch>`, written by
  `release` before its push, never overwritten on a rerun. `emergency` refuses without it.
- `RUNBOOK.md`: the order of operations and what to do on each failure.
- Harness (enforced isolation): see "Isolation harness" in RUNBOOK.md.
