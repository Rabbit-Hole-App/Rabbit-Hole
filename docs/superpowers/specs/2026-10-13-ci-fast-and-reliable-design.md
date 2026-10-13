# CI: a verdict in minutes, and failures that mean bugs

Owner, 2026-10-13: "lets brainstorm how we can stop avoiding all these errors for the CI tests and other github actions failed. this should be done in minutes".

The owner made four choices:
- two tiers;
- a check whose stack died is retried once, then reported;
- the fast tier runs on Linux;
- affected checks come from a map file, with a safe default.

## Why

On 2026-10-13, gate runs failed for reasons that were not product bugs, and each rerun cost 14-33 minutes. The table covers the main causes; push resets and API errors added smaller delays.

| Cause | Runs hit | Guard in this spec |
|---|---|---|
| wrangler 4.129 dev exits on a dropped keep-alive (dive, rh-local) | 5 | wrangler 4.150, plus retry once (sections 3 and 4) |
| e2e checks stale after a UI change (comments, card-context-menu, connectors, navigator) | 4 | the fast tier runs a touched screen's checks on push (section 2) |
| races inside checks (cross-device, plus an unrun test edit) | 3 | check-writing rules (section 6) |
| flaky unit test canvas-members.test.js:260 | 1 | fixed and listed (section 6) |
| collect only reads the current attempt, so a failed-only rerun cannot pass | 1 | latest attempt per part (section 3) |
| push and gh API resets (502, 504, connection reset) | about 8 | retry wrapper (section 6) |
| production lacked USAGE_PLATFORM_DAY_USD; all paid Learn calls refused for about 2 hours | 1 | production settings parity in the release preflight (section 5) |

Success means:
- a normal push gets a pass or fail status in 4-6 minutes, and the full gate is no longer run on every push;
- a release gate fails only for a real defect, or for a check that failed twice;
- a setting the dev config has can never be missing in production unnoticed.

## 1. Two tiers

- **Fast tier**: every push to a branch other than main and dev. Unit suites plus the e2e checks for the screens the push touches. Linux. A status on the commit. It is advisory for development and is not the release evidence.
- **Release gate**: the existing 43-stage sharded gate (`gate-sharded.yml` on `parallel/gate-sharded`), Windows, unchanged in scope. It runs only for a release candidate:
  - dispatched by the release lead, or
  - fired by `gate-on-push.yml` for a push to `release/*`. That workflow no longer fires on every branch.
- It is still the only evidence `deploy-dev.yml` accepts, through the `refs/notes/gates` note.

## 2. Fast tier

- **Where**: a second job, `affected-e2e`, in `.github/workflows/verify.yml`, after the existing `verify` job. It reuses that job's checkout, `npm ci`, natives and page build, with the dist-dev build passed as an artifact, so nothing is installed or built twice.
  - The `verify` job and its `refs/notes/verify` note are unchanged, so `deploy-dev.yml` and `scripts/dev-deploy-gate.mjs` see no difference.
- **Install cache**: npm's cache keyed by the `package-lock.json` digest (setup-node `cache: npm`) and Playwright's browser cache keyed by its version.
- **Selection**: `scripts/ci/check-map.json` maps path globs to e2e check files. For example, `packages/web/src/AdaptiveCanvas.jsx` maps to canvas-editing-check, comments-check, card-context-menu-check, canvas-shell-check and canvas-toolbar-check.
  - A changed path that matches no glob adds the DEFAULT set: about 10 checks covering canvas editing, cards, comments, dive, sharing and sign-in.
  - A changed e2e check file always runs itself.
  - `scripts/ci/affected.mjs` prints the chosen list and why each check is in it, one line per check: `canvas-shell-check: AdaptiveCanvas.jsx`.
- **Run**: up to 3 parallel matrix jobs. Each starts one local stack (app and control plane, keyless, mocked providers, the same `PERSIST` seed as the gate) and runs its share of the list, one check at a time.
- **Target**: 4-6 minutes from push to status for a typical change. A change that hits the DEFAULT set may take 8.
- **Linux readiness**: the gate's stack scripts are Windows (PowerShell). The fast tier gets its own `scripts/ci/stack.sh` (start, health wait, stop), built from the same wrangler commands.
  - Before the map covers a check, that check must pass 3 runs in a row on Linux. A check that cannot is listed as `windows-only` in the map and stays covered by the release gate.

## 3. Release gate reliability

- **Retry once**: when a check fails and its stack is dead ("stack alive: no"), the shard restarts the stack and reruns that check once. Shards already do this; the checkpoints job must do it too.
  - A check that fails with a live stack is not retried.
  - Every retry is written to the gate log and to the gate note as `<check>: retried after stack death`. The release report lists them.
- **Latest attempt per part**: collect downloads every attempt's artifacts and takes, for each part (units, focused, checkpoints, shard-1 to shard-4), the newest attempt. A failed-only rerun then judges the whole gate correctly. The gate note names the attempt each part came from.
- **Wrangler 4.150.0**: the app moves to it (fix/wrangler-4150, bc32c0a1). The harness accepts 4.129.0 or 4.150.0 until every open branch carries the bump, then 4.150.0 only (947f818a).
- **Coverage**: canvas-shell-check and canvas-toolbar-check join a shard. Their stale assertions were fixed on feature/toolbar-next (0113ea1d, 7c611ef9).
- **Known flakes**: `scripts/r36-gate/README.md` gains a table with one row per flaky check: the check, its symptom, the retry rule above, its owner and its fix status. A row with no owner or no fix in progress is a release blocker for whoever adds it.

## 4. Test-server crash

- **Root cause**: wrangler 4.129.0's dev ProxyWorker reuses a keep-alive connection the runtime has closed after about 5 s idle. It reports the failure without retrying, and DevEnv exits 1 with an empty "X [ERROR]".
  - Reproduced 8 of 8 runs on 4.129.0; on 4.150.0, 5 of 5 survived (investigation 2026-10-13).
  - It affects only local wrangler dev, never deployed workers.
- **Residual**: 4.150 retries only GET and HEAD. A PUT or POST that lands in the same window can still end the stack. That case is covered by the retry rule in section 3.

## 5. Production settings parity

- The release preflight (`scripts/prod-release.mjs`) compares, for each production worker, the variable names in the dev config (`packages/web/wrangler.dev.jsonc`) against the production config's vars plus its secret names (`wrangler secret list`, names only).
  - A dev variable missing in production is a blocker unless it is on `DEV_ONLY` in `prod-release.mjs`, a short commented list such as BYOC_PRINCIPAL_ARN and SUBSCRIPTION_OWNER_EMAIL.
  - The refusal names the variable and the worker.
- This generalizes `secretBlockers`, which now requires USAGE_PLATFORM_DAY_USD on both workers (fix/inline-prod-routes 39cbf4a5).
- Test: a production config missing a dev variable is refused, and an allowlisted one is not.

## 6. Writing and running checks

- **No fixed sleeps** for state: a check waits for an observed state (a selector, a server version, a request). A fixed wait needs a comment saying why no state exists.
- **Run what you edit**: a commit that edits an e2e check runs that check once, alone, before it is pushed, and the report carries its pass line. The fast tier enforces this on push.
- **Unit flake**: canvas-members.test.js:260 (401 where 200 was expected, intermittent) gets a reproduction and a fix, then leaves the known-flakes table.
- **Network retry**: `scripts/ci/retry.sh <n> <cmd>` retries git push, git ls-remote and gh calls on connection reset, 502 and 504, with backoff. Workflows use the same for their network steps.

## 7. Rollout

1. **Release gate fixes**: retry in checkpoints, latest attempt per part, the known-flakes table, wrangler 4.150 on every branch, then pin 4.150 only. These are harness and workflow changes, pushed by the owner (`!`).
2. **Fast tier**: stack.sh, check-map.json and affected.mjs, the `affected-e2e` job, and Linux readiness for the mapped checks. gate-on-push moves to `release/*`.
3. **Settings parity** in the release preflight, with its test.
4. **Measure**: a weekly 3-line report covering median push-to-status, gate failures that were not defects, and retries used.

## Not in scope

- Moving the release gate off Windows.
- Changing which checks the release gate runs, beyond adding the two above.
- Changing production deploys.
