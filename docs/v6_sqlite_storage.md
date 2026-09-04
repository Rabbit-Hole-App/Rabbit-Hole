# v6 — storage: persistent volume + SQLite (2026-09-03)

Apps can now keep state across deploys and machine replacement: a `[storage]`
block in `small.toml` gets the app a persistent Fly volume, mounted at a path
the app finds via `SMALL_DATA`. The counter example moved from an in-memory
global to SQLite on the volume.

## How it runs

1. `small.toml`:

   ```toml
   [storage]
   path = "/data"          # mounted volume, survives machine replacement
   size = "1GB"
   ```

2. At deploy the control plane calls `ensureVolume`
   (`packages/control-plane/src/fly.js`): one volume per app, named `data`,
   idempotent — an existing volume (and its region) is reused on every
   redeploy, so data survives. If the app already has machines (deployed
   before `[storage]` existed), the volume is created in their region —
   volume and machine must share a region on Fly. The worker returns
   `volumeRegion` in the deploy response.
3. The CLI writes the mount into the generated `fly.toml`
   (`packages/cli/lib/generate.js`): `primary_region` pinned to the volume's
   region, `[mounts] source = "data" destination = <path>`, and
   `[env] SMALL_DATA = <path>`. The app just reads `SMALL_DATA` — it never
   sees Fly volume names or regions.
4. **No D1 schema change.** Volumes are tracked by Fly itself; the control
   plane only creates/reuses them by app name.
5. `small init` auto-detects: `import sqlite3` (or a `SMALL_DATA` read) in
   the entry file writes the `[storage]` block and prints
   `✓ storage: /data (1GB)`. `SMALL_*` names are also excluded from init's
   env-var secret detection — they are platform-injected, never secrets.

## Example

`examples/counter/app.py` — count lives in SQLite at
`$SMALL_DATA/counter.db`, falling back to `./counter.db` for local runs.
Connection per request, no WAL (fine at internal-tool traffic).

## Tests

- `packages/cli/test/cli.test.js` — fly.toml mount/env generation, init
  storage detection.
- `tests/integration_tests/examples/counter/test_app.py` — 7 tests including
  `test_count_survives_machine_replacement`: increment, destroy the machine,
  hit the app again, count persists. That test is the feature's proof.

## Issues hit

1. **Review false positive:** the deploy review counted `SMALL_DATA` as an
   undeclared secret, pushing the counter to risk `medium`. Fixed in
   `1f5652e` — `review.js` filters `SMALL_*` names out of
   `secrets`/`undeclared_secrets` before `computeRisk` (they are
   platform-injected, not app secrets). Verified live:
   `small review --diff` shows `risk: medium → low`; `SMALL_DATA` still
   appears as a low informational finding, which is correct.
2. Merges from the feature worktree repeatedly blocked on a CRLF-only dirty
   `packages/cli/bin/small.js` (empty content diff) — `git checkout -- <file>`
   before merging.

## Ceilings (ponytail)

- Single volume, single region per app — per-region volumes when
  multi-machine matters (marked in `fly.js`).
- Size parsed from `small.toml` but no resize path — changing `size` after
  the volume exists does nothing; extend `ensureVolume` when someone needs it.
- No backups/snapshots beyond what Fly does by default.

## Current state

- Merged to main (`3cc21fa`), live worker deployed with the review fix
  (version `f5d0ce58`), main pushed at `1f5652e`.
- **Verified live end to end:** counter deployed with the volume, integration
  7/7 including machine-replacement persistence; deploy line reads
  `review: no AWS · no outbound · no shell exec · low`.
- npm publish still pending (0.0.7 unpublished), same as v5.
