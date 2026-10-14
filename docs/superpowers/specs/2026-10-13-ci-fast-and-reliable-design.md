# CI speed: routine feedback in 4-6 minutes, the release gate in 12-15

Owner, 2026-10-13:
- "this should be done in minutes".
- Then: "Prioritize speed. Target 4-6 minutes for routine push feedback and 12-15 minutes for the full release gate, then measure actual results... The deliverable is faster trustworthy feedback - not a larger CI redesign."

The owner's choices:
- two tiers;
- the fast tier runs on Linux;
- checks are selected from a map;
- a recognized transient crash is retried once, then reported.

Deferred to separate work, unless it blocks speed:
- broader production configuration validation;
- reporting infrastructure;
- unrelated cleanup.

## Measured today (before)

Release gate (`gate-sharded.yml`, harness 35f141b4), from the GitHub job records:

| Run | Candidate | Wall | Runner minutes (Windows) |
|---|---|---|---|
| 38443590589 | 2bdeb288 | 14.5 min | 78.8 |
| 38458116477 attempt 1 | c044b86a | 15.1 min | 82.6 |

- **Per job**:
  - checkout, Node, uv and `npm ci` take about 1.5 min;
  - then **Wait for same-SHA canonical verify** takes 1.1-1.2 min, on every job and on the critical path;
  - then the part runs: units 1.8, focused 8.3, checkpoints about 6, shard-1 to shard-4 9.8 to 10.7 min.
- **Inside a shard**: about 2.8 min pass before the first check starts.
  - The shard builds both web bundles itself (build1, build2).
  - It starts a stack (about 45 s), and restarts stacks between check groups.
  - The 7 parts therefore repeat the same build up to 7 times.
- **Duplicate work**: shard-1 runs `make test-unit` and the fixture regression, which the `units` part also runs, on the same Windows configuration.
- **Reruns**: one stack crash costs a whole gate rerun (+15 min). A failed-only rerun cannot pass, because collect reads only the current attempt.

There is no routine-push feedback today, except `verify.yml`: Linux unit suites plus builds, about 3 min, with no browser checks.

## 1. Two tiers

- **Fast tier**: every push to a branch other than main and dev. It reports affected browser checks on Linux in 4-6 min. It is a development signal, not release evidence.
- **Release gate**: the complete gate, unchanged in coverage, plus canvas-shell and canvas-toolbar. It runs for a release candidate (dispatch, or a push to `release/*`).
  - It stays the only evidence `deploy-dev.yml` accepts, through `refs/notes/gates`.
  - `verify.yml` and its note stay unchanged.
- `gate-on-push.yml` stops firing the full gate on every branch, because the fast tier replaces that.

## 2. Release gate: 12-15 min

### 2.1 Changes

1. **Verify off the critical path.** The per-job "Wait for same-SHA canonical verify" step is removed. `collect` checks that the same-SHA `verify.yml` run succeeded before it passes the gate. The protection is the same and costs about 1.2 min less.
2. **Build once, share the artifact.**
   - A new `build` job (Windows) runs checkout, Node, `npm ci`, then both web bundles (dist and dist-dev with the gate's flags), and uploads them as `r36-build-<sha>`.
   - Every part starts at the same time, does its own checkout, Node and `npm ci` while `build` runs, then downloads `r36-build-<sha>` and checks its digest before starting a stack.
   - No part builds.
3. **Duplicate stages removed.** `make test-unit` and the fixture regression run only in `units`. They are removed from shard-1, and the manifest (section 2.3) keeps each stage exactly once.
4. **Shards balanced by measured duration.**
   - `scripts/r36-gate/durations.json` records each stage's median duration from the last 5 gate runs, read from the per-process `start` and `exit` diagnostics the harness already writes.
   - A small packer assigns stages to parts longest first. It keeps stages that share a stack type (fork, lp1h, dive) together, so a part restarts its stack as rarely as possible.
   - The part count goes from 7 to 8 (units, checkpoints, and 6 browser parts).
   - The durations file is refreshed from the gate's own artifacts after each release, as a commit reviewed like any other.
5. **Isolated stacks.** Each part is its own runner, with its own stack, ports, persist directory and wrangler registry, as now. No part shares a server or a database.
6. **Recognized transient retried in place.** See 2.2. A crash no longer costs a whole-gate rerun.
7. **Caches.** The npm cache is keyed by the `package-lock.json` digest, and the Playwright browser cache by its version, on every job.

### 2.2 Recognized transient (one retry)

Exactly one condition is recognized, listed in `scripts/r36-gate/transients.json`:
- the check exited non-zero;
- its stack's app or control-plane process exited during the check;
- the process's wrangler debug log (`WRANGLER_LOG=debug`, captured to the artifact) contains `Error inside ProxyWorker` with cause `Network connection lost`;
- the check printed no assertion failure (`✗`, `AssertionError`, `not ok`) before the stack died.

That case restarts the stack and reruns the check once:
- the first attempt's logs, wrangler log and screenshots stay under `attempt-1/`;
- the gate note records `<check>: retried (proxy-keepalive)`.

Anything else is a failure and is not retried:
- an assertion failure;
- any other crash, or a crash with no log;
- an exception in our worker;
- out of memory;
- a timeout with a live stack.

A second failure fails the gate.

### 2.3 Aggregation

- `scripts/r36-gate/manifest.json` lists every required stage once, with its part: today's 43, plus canvas-shell and canvas-toolbar, for **45** stages.
- For this run id and this sha, `collect` reads every attempt of every part (`/actions/runs/{id}/attempts/{n}/jobs` plus the artifact `r36-windows-<part>-<sha>-<attempt>`). It takes each part's **newest attempt in which the job ran**:
  - a part that was not rerun keeps its attempt;
  - a newer failed or cancelled attempt is never replaced by an older pass.
- The gate passes only when every manifest stage appears exactly once with pass, and the same-SHA `verify.yml` run succeeded. A missing, duplicate or extra stage fails the gate and names it.
- With this, a failed-only rerun works: about 9 min for one part, not 15 for all.

### 2.4 Critical path

```
before: setup 1.5 | wait verify 1.2 | shard: build+stack 2.8 | checks 7.9 | collect 0.6     = 14.0-15.1 min
after:  build job: setup 1.5 + both bundles 2.0 = 3.5 --+
        parts:     setup 1.5 (in parallel) ............ +-- download 0.2 | stack 0.8 | checks ~6.5 | collect 0.6 = ~11.6 min
```

- "checks ~6.5" assumes the shard-check time today (four browser parts at about 7.9 min each, plus focused at 8.3 min) spread over 6 browser parts. The packer's real numbers replace this estimate.
- **Expected**: about 11-12 min wall, inside the 12-15 target.
- **Runner minutes**:
  - removed: 7 × 1.2 waiting on verify, about 2 builds × 6 parts, and the duplicate unit run;
  - added: one more part and the build job;
  - net expected: **about 65-70 Windows minutes**, against 79-83.

## 3. Fast tier: 4-6 min

### 3.1 Selection

- `scripts/ci/check-map.json` maps path globs to e2e checks.
- `scripts/ci/affected.mjs` sorts every changed path into one of four classes:
  - **docs** (`docs/**`, `*.md`): no browser checks;
  - **mapped**: the mapped checks, plus any edited check file;
  - **broad**: the full Linux-ready set. This covers dependencies and lockfiles, wrangler configs, the worker entries (`dev-worker.js`, `app-worker.js`, `control-plane/src/index.js`), auth, spending, persistence, canvas infrastructure (`AdaptiveCanvas.jsx`, `LearnPage.jsx`, `RichText.jsx`), and CI and release scripts;
  - **unmapped executable**: **selection fails** with `add <path> to scripts/ci/check-map.json`.
- A unit test fails if a tracked executable file has no class, so a new file gets classified in the push that adds it.
- A check that does not yet run on Linux is marked `windows-only`. The fast-tier summary lists it as "not covered here; release gate only", and the release manifest keeps it. No assertion is weakened to run on Linux.

### 3.2 Job graph

```
push --+-- select (20 s): affected list, split into N parts by measured duration
       +-- build (ubuntu): checkout | node_modules cache restore (or npm ci) | dist-dev | upload fast-dist-<sha>
       +-- e2e[1..N] (ubuntu): checkout | restore the same cache | wait for build | download | stack | its checks
       +-- verify.yml (unchanged, in parallel; unit suites)
```

- **Concurrency**: `group: fast-e2e-${{ github.ref }}` with `cancel-in-progress: true`. A newer push to the same branch cancels the older fast run. The release gate never cancels.
- **Caching**:
  - `node_modules` is cached by OS, Node major and the lock digest; `build` writes it on a miss, and the e2e jobs restore it;
  - the Playwright Chromium cache is keyed by version.
- **Build once**: the e2e jobs never build. They serve this sha's artifact.
- **No waiting on unit tests**: the e2e jobs depend only on `select` and `build`.
- **Allocation**: N = 3 for mapped pushes, N = 6 for broad ones, packed by measured check duration.

### 3.3 Critical path

```
select 0.3 ----------------------------------------------+
build: setup 0.5 | cache 0.3 | dist-dev 1.5 = 2.3 ----------+-- e2e: download 0.1 | stack 0.6 | checks 2-3 = ~5-6 min (mapped)
e2e jobs: setup + cache restore in parallel (0.8) ..........+                       checks ~4  = ~7 min   (broad)
```

- **Runner minutes (Linux)**: about 2.5 for build plus 3 × 3.5 for the browser jobs, about **13** for a mapped push, against 0 today, since browser checks are new on push. The full gate no longer runs on routine pushes, which saves its 79-83 Windows minutes on each one.

## 4. Flakes that cause reruns

- **Wrangler dev crash**: wrangler 4.150.0 (fix/wrangler-4150, bc32c0a1; the harness accepts 4.129.0 or 4.150.0 from 947f818a).
  - Locally, 4.129.0 crashed 8 of 8 reproduction runs and 4.150.0 survived 5 of 5.
  - **CI confirmation pending**: gate run 38469483022 on bc32c0a1.
  - The upstream reference for the retry is still to be found, and must be linked before the harness pins 4.150.0 only.
  - Residual: a POST or PUT in the same window can still crash. It is covered by 2.2, retried once and recorded.
- **cross-device**: fixed in df144158 (A leaves C1 and its last save settles before B edits). It passed in CI on c044b86a.
- **canvas-members.test.js:260** (an intermittent 401): reproduce and fix.

## 5. Bounded network retry

`scripts/ci/net.mjs` wraps git push, ls-remote and gh calls, in scripts and workflows.
- Retry only on: connection reset, timeout, 502, 503, 504. At most 3 attempts, with 5 s then 15 s backoff.
- Never retry: 401 or 403, a rejected push, or another 4xx.
- **Before resending a mutation, look at the remote:**
  - a push whose ref already equals the target is done; a ref that moved elsewhere stops with a report;
  - before dispatching again, find a run of that workflow created since the first attempt with the same ref and inputs, and use it;
  - a notes push checks for the note first.

## 6. Rollout, proof, rollback

1. Build the gate changes on `parallel/gate-sharded-next`. Workflow pushes are made by the owner (`!`).
2. **Proof before switching**:
   - **Inventory**: on one candidate sha, run the current gate (947f818a) and the new one. Their stage and check-line inventories must match, apart from the two added stages.
   - **Fault drills** on the new gate. Each must give its stated verdict:
     - a failed stage (`canary_fail_stage`): fails;
     - a missing part artifact: fails, naming the part;
     - a failed-only rerun that passes: passes, and the note shows the attempt each part came from;
     - a rerun that fails after an earlier pass: fails;
     - a cancelled run: fails, with no note;
     - an injected crash with the transient signature: retried once and recorded;
     - an injected crash with another signature: fails.
   - **Speed**: record wall and runner minutes for both gates on the same sha. Switch only if the new gate is faster and the inventory matches.
3. **Switch**: move `parallel/gate-sharded` to the proven commit.
4. **Fast tier**: stack.sh, the map and its unit test, affected.mjs, fast-e2e.yml, and Linux readiness for the mapped checks. Each mapped check must pass 3 runs in a row on Linux first; that is the entry bar, not proof of reliability. Then gate-on-push moves to `release/*`.
5. **Rollback**:
   - **Gate**: point `parallel/gate-sharded` back to 947f818a with the owner's `!`. The note format and its requirements are unchanged, so deploy-dev accepts the old gate's evidence.
   - **Fast tier**: disable `fast-e2e.yml`. Nothing depends on it.

## 7. Measure

After 20 runs of each tier, a short report gives, per tier:
- sample count;
- median and p95 time to verdict;
- runner minutes;
- failures by cause (defect, stale check, race, recognized transient, infrastructure, unexplained);
- retries used.

The targets are met when:
- **fast tier**: median 6 min or less, p95 9 min or less;
- **release gate**: median 15 min or less, p95 18 min or less.
