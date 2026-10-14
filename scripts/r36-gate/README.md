# r36 complete Windows gate

The authoritative failed baseline is `46fbe04283a424e69db5272f9e1f3c7b9c19e846`, tree
`2555e2aa4a6784b2984e629ee5ed77dd37bff0be`, run 38315013501. This directory is an execution
harness on a separate branch, not an application change. Every receipt records
both application identity and the harness checkout's HEAD.

Run `node scripts/r36-gate/run.mjs` from the harness checkout on the authorized
GitHub-hosted Windows job. Required environment: `APP_ROOT`, `GATE_ROOT`,
`ARTIFACT_ROOT`, `HARNESS_SHA`, `GATE_GRANT_ID`, `TESTED_SHA`, `TESTED_TREE`.
The latter two must name the exact reviewed application commit and tree; the
entrypoint verifies HEAD, index and tracked content before execution.
`GATE_BASH` points to Git Bash.
Use fresh workspace/temp directories without spaces. No provider credentials or
deployment credentials are permitted. Synthetic local authentication is generated
internally; do not supply production credentials. Ports 8878/8879 and 9318/9319
must be free. Old recovery ports 8868/8869 are not used by this gate.

Install from the application's locks: Node 24.19.0, Python 3.13, `npm ci`,
`uv sync --locked`, and `npx playwright install chromium`. The application lock
pins Wrangler 4.129.0 or 4.150.0, Playwright 1.62.1 and Vite 8.2.2. Preserve the original
1500 MiB available-memory guard. `make`, GNU `timeout`, `curl`, `sed`, Python
and Windows PowerShell must be available to Git Bash.

## Final r36 verification (workflow r36-windows-gate.yml)

Pinned to the frozen candidate in the workflow env. Three clean runners in parallel: `run.mjs units` (supervised
`make test-unit` and the nanoGPT fixture regression on the exact tree, no stack) and `run.mjs focused` (SCA, selected-pill, J1-J8, Tutor slice).
A third runner runs preflight, Dive and the complete gate at the same time, uploading after each; preview
deployment needs all three to pass. Every
phase except `all` stops the sign-in probe stack and proves 8878/8879/9318/9319 free before the next preflight.

## Sharded gate (workflow gate-sharded.yml, owner GO 2026-10-13)

The same checks on nine clean Windows runners at once: `units`, `checkpoints` (preflight then Dive,
uploaded as today) and `shard-1`..`shard-7` (packed by measured duration, "Shard packing" below). `units` runs `make test-unit` and the fixture regression, the two stages
no shard runs (`UNIT_STAGES` in `shards.mjs`); it writes them to its `gate-shard.log` in int35.sh's line format. Each
shard is `run.mjs shard-N`: the same fresh preflight as the `focused` phase, then
`shard-N.sh`, which is the prepared `int35.sh` with only the other shards' stages removed (`shards.mjs`). A shard keeps
the header, its stage lines in the original order, the stacks those stages run on, their stops and every `export`. The
`collect` job (Linux) merges the units record and the seven `gate-shard.log` records into one `gate.log` (the two unit stage lines
first, where int35.sh printed them): same stage lines, same order, same counts. It then applies run.mjs's gate-phase verdict (the candidate's `gateVerdict` plus the routing and project-menu
receipts) with the passed Dive receipt as the prerequisite. A failed matrix job, a failed or missing shard, or a missing,
duplicated or stray stage, or a missing or failed units record, fails it. It also fails unless the newest same-SHA `verify.yml` run succeeded for both the harness SHA and the application SHA (`verify-check.mjs`; checked once here, no longer by every runner before its phase). A verify that is only still running is polled (status only, every 30 s) for up to 10 min and fails closed if it has not completed by then. A missing, failed or unreadable (`gh` error) verify fails at once. It never passes by default, and `receipt.json` records the accepted run as `verify: [{ sha, databaseId }]`.

Shared state, kept inside one shard (`UNITS` in `pack.mjs`; the packer never splits one). The stage times are from run 38352166115 attempt 2:
- rh-app, comments and comments-invite run on the stack-app.sh build, so they stay with their stack start, and
  `shardScript` needs a stack.sh stage after them in the same shard.
- explore's phone creator-card row needs a second creator with a live publication. In the unsharded order,
  comments-check publishes one (comments-check.mjs:233) and never unpublishes it. project-canvases deletes its own
  canvases. So explore follows comments on the same persisted D1 (the same shard, which also gives the trio its stack.sh stage).
- bundle(dist) and bundle(dist-dev) check the `stack.sh prod` rebuild directly before them.
- journey, tutor-slice, blank-hooks, practice-card and canvas-chrome share the journey stack and its `.dev.vars`.
- library-folders and share-revocation are one `for beta` block in int35.sh, which `shardScript` refuses to split.
- answer-routing reads `LOCAL_CP_VARS`, exported after sketch; the export stays in every shard script.
- Every other browser check signs in as a per-run user (`Date.now().toString(36)`) and finds its own rows. dive and
  answer-routing use the preflight identity, but each creates its own canvases. sca's D1 seed uses the gate-local
  PERSIST through its fixture adapter.
- The provider tripwire counts hits over a stack's lifetime. A hit still shows in the tripwire line of the stage that
  caused it, as it did unsharded, so any hit still fails the gate.

`canary_fail_stage` (dispatch input, proof only) swaps one run-line stage's check for a missing file, so the gate must
fail. It can only fail a stage, never pass or skip one.

## Removed duplicate runs (2026-10-13)

| Removed execution | Kept execution | Why it is the same logical test |
|---|---|---|
| focused: sca | shard: sca | same `run stack.sh sca shared-canvas-ask-check.mjs` line (r36 adapter), same stack.sh dev section; the shard run follows more stages, as in the full gate |
| focused: selected-pill | shard: selected-pill | same run line and section |
| focused: journey J1-J8 | shard: journey J1-J8 | same journey() function on the same jstack.sh |
| focused: tutor-slice | shard: tutor-slice | same slice() function on the same jstack.sh |
| shard-1: make test-unit | units: make test-unit | same command on the same windows-2022 image and tree |
| shard-1: fixture regression | units: fixture regression | moved: the units part did not run it before, and now does; same node --test file on the same tree |

Kept on purpose: the Dive checkpoint (fresh stack) and shard dive (after fork) - different preceding state.

`inventory.mjs` lists each stage with its check file, stack script and the parts that run it; `inventory.test.mjs` fails
if any stage runs in more than one part, and checks that the old configuration shows exactly the four focused duplicates.
The `focused` phase of `run.mjs` stays for r36-windows-gate.yml; gate-sharded.yml no longer runs it.

## Speed baseline (2026-10-13)

Measured with `node scripts/r36-gate/timing.mjs <run> [attempt] --artifacts <dir>` on three green runs of
`gate-sharded.yml`: job records from the GitHub API, per-process receipts from the artifacts. Minutes throughout.
Wall is run created to last job done; queue is run created to first job started; runner is the sum of every job's run
time (a runner held by the verify wait counts). Pass `--artifacts` only the `shard-*`, `units` and `preflight`
artifacts: `focused`, `checkpoints` and `dive` repeat sca, selected-pill, dive and the journey stages, so their
receipts would be counted twice.

| Run | Candidate | Wall | Queue | Runner | Slowest part | Verify-wait idle (all jobs) |
|---|---|---|---|---|---|---|
| 38469483022 | bc32c0a1, wrangler 4.150.0 | 13.12 | 0.07 | 71.92 | shard-3 12.40 | 1.34 |
| 38443590589 | 2bdeb288, wrangler 4.129.0 | 14.62 | 0.08 | 78.78 | shard-3 13.78 | 7.92 |
| 38458116477 (attempt 2) | c044b86a, wrangler 4.129.0 | 18.23 | 0.05 | 75.21 | shard-4 14.60 | 0.73 |

- Wall is the slowest shard plus `collect`: 12.40 + 0.60, 13.78 + 0.68, 14.60 + 3.53.
- 38458116477 attempt 2 is the retry of a run whose shard-2 failed; only attempt 2 is measured. Its `collect` spent
  3.00 in "Download checkpoint and shard evidence" (0.05 in the other two runs). That step only downloads artifacts, so
  it is transfer time, not gate work, and it is why this wall is 18.2. Its shard-4 also reran rh-local on a restarted
  stack (about +2).
- The verify wait is idle runner time and depends on when the canonical verify finishes. 38443590589 waited 1.10-1.20
  in each of its 7 jobs (7.92 runner minutes); the other two found it done (0.08-0.17 per job, and 0.63 for
  `checkpoints` in 38469483022).

Per part, median of the three runs:

| Part | Setup | Verify wait | Run step | Preflight | Unit tests | Builds + stops | Stack starts | Checks | Other | Post | Job |
|---|---|---|---|---|---|---|---|---|---|---|---|
| units | 1.92 | 0.17 | 1.77 | - | - | - | - | - | - | 0.17 | 4.20 |
| checkpoints | 1.86 | 0.63 | 5.33 | - | - | - | - | - | - | 0.37 | 8.48 |
| focused | 1.77 | 0.10 | 8.28 | - | - | - | - | - | - | 0.25 | 10.43 |
| shard-1 | 1.84 | 0.12 | 10.03 | 1.38 | 1.65 | 1.25 | 0.50 | 4.01 | 1.22 | 0.21 | 12.62 |
| shard-2 | 1.62 | 0.12 | 9.85 | 1.35 | - | 0.39 | 0.19 | 6.85 | 1.00 | 0.18 | 12.27 |
| shard-3 | 1.78 | 0.10 | 10.57 | 1.39 | - | 0.39 | 0.20 | 7.01 | 1.50 | 0.24 | 12.82 |
| shard-4 | 1.75 | 0.17 | 10.43 | 1.38 | - | 1.27 | 0.38 | 6.37 | 1.01 | 0.20 | 13.50 |
| collect | 0.47 | - | 0.10 | - | - | - | - | - | - | 0.08 | 0.68 |

- Setup is every step before the verify wait: two checkouts, Node, uv, the Playwright cache and "Install locked
  application dependencies" (0.97-1.05 in 38469483022, 0.38-0.72 in the other two). For `collect`, Run step is the
  merge and upload after its download (the download step is 0.05, 0.05 and 3.00 for the three runs).
- The shard columns split the Run step with the receipts. Preflight: harness start to the start of `shard-N.sh` (tool
  checks, local D1 schema, one full stack build and start, its stops). Unit tests: `make test-unit` plus the fixture
  regression, shard-1 only. Builds + stops: the time from the script start (after the unit tests) or the previous
  stack's stop to the next stack's app worker start: `stop.ps1` (about 8 s) and the two `vite build` runs (about 6 s
  each). Stack starts: app worker start to the first check (for shard-1's `stack.sh prod`, to the final stop, less the
  bundle checks). Checks: the sum of the check processes. Other: the per-check overhead (memcheck, tree check,
  tripwire probe: 4.6 s median from one check's exit to the next one's start, 99 gaps) plus the script's closing stop
  and the harness exit.
- shard-1 carries the three stacks (stack-app, stack, prod) and the unit tests; shards 2 and 3 carry one stack.

### Per-stage durations (`durations.json`)

`durations.json` is `{ "<stage>": <median minutes> }` for every name in `ORDER` in `shards.mjs`: the median of the
three runs. All 43 stages are measured; none is null.

- Check stages (39 of the 43): the check process only, from `process-<check>-<ms>-<pid>.start.json` to `.exit.json`.
  Every `timeout N node e2e/...` is wrapped by `prepare.mjs`, so the journey-stack checks (journey J1-J8, tutor-slice,
  blank-hooks, practice-card, canvas-chrome) and rh-local have receipts too. Receipt names follow the prepared script,
  not `int35.sh`: `r36-shared-canvas-ask-check.mjs` (sca), `r36-selected-pill-check.mjs`, `r36-tutor-slice-check.mjs`,
  `r36-repo-browser-check.mjs`, `r36-routing-operator.mjs` (answer-routing, inserted after sketch) and
  `rabbit-hole-check.mjs` (rh-local). `shared-rabbit-hole-check.mjs` runs twice in shard-1, so the first receipt is
  rh-app and the second rh-dev.
- A stage the old gate reran on failure has two receipts; the LAST is used. That happened once: rh-local in
  38458116477 (1.36 on the first try with the stack down, 1.13 on the rerun).
- Not in a check duration: the stack starts, the unit tests, the preflight and the per-check overhead of about 0.08 per
  stage (the 4.6 s gap above). Add them when balancing shards from this file.
- make test-unit (1.64, 1.58, 1.42): the units job's supervised `make test-unit`, `unit-process-*.start.json` to
  `.exit.json`. It is the same command on the same tree. In shard-1 the script start to the first app worker is 2.09,
  2.11 and 2.06, which holds it plus the fixture regression, a stop and two vite builds.
- fixture regression (0.07 in all three): the TAP `# duration_ms` of the `node --test` run, in
  `diag13/gate35/fixture.log` (4.16 s).
- bundle(dist) and bundle(dist-dev) (0.04 each; 0.042, 0.042, 0.045 per run): `production-bundle-check.mjs` is not run
  under `timeout`, so it has no receipt. Both run on shard-1's `stack.sh prod` stack. Their combined time is bracketed
  by that stack's cp worker start and the start of the script's final `stop.ps1` (script end less the 7.8 s that stop
  takes), minus `stack.sh`'s fixed 3 s sleep, and split in halves. It is an upper bound: the bracket also holds the
  readiness wait and two `clear-local.ps1` calls.
- Largest stages: dive 2.75, selected-pill 2.17, cross-device 1.89, make test-unit 1.58, tutor-slice 1.57, thumbnails
  1.29, rh-local 1.13. Per shard (check minutes only): shard-1 5.76, shard-2 6.81, shard-3 7.00, shard-4 6.36.

### Shard packing (`pack.mjs`)

`SHARDS` in `shards.mjs` is the committed output of `pack(durations, K)`; `pack.test.mjs` fails if the literal drifts
from `durations.json` or from the packer, and if K stops being the choice below. The packer takes the indivisible units
(`UNITS`) and then every other stage, longest first, and puts each on the shard it leaves cheapest. In the tables below
"shard-1..4" are the four shards of the Speed baseline, not the seven now committed.

A shard's cost is the minutes of its own work: each stage's `durations.json` minutes plus the per-stage overhead, each
stack section it starts (stop plus start), the journey stack's extra setup, and the prod build. The preflight builds the
dev flavor and `build-once.sh` reuses it, so only a `stack.sh prod` section builds, and a journey stack after it
rebuilds dev. Constants (`C` in `pack.mjs`, minutes), all medians of the Speed baseline's three runs:

| Constant | Value | Source |
|---|---|---|
| per stage | 0.08 | "Not in a check duration": the 4.6 s gap between checks (99 gaps) |
| stack start | 0.19 | Stack starts column: shard-2 0.19, shard-3 0.20, shard-4 0.38 / 2 stacks, shard-1 0.50 / 3 stacks |
| stack stop | 0.19 | Builds + stops of a one-stack part (shard-2 and shard-3 0.39) less its two vite builds (0.20) |
| build | 0.20 | two vite builds of one flavor, about 6 s each (Builds + stops note) |
| journey stack extra | 0.49 | shard-4 Builds + stops 1.27 less its dev stack 0.39 less the journey stack's own stop and build (0.19 + 0.20) |
| per part, before its first stage | 3.15 | Setup 1.77 (median of the four shards 1.84, 1.62, 1.78, 1.75) + Preflight 1.38 (1.38, 1.35, 1.39, 1.38) |

Check against the old four shards (pre-A4, so every stack builds both flavors; Run step less the 1.65 of unit tests in
shard-1): the model gives 8.11, 9.41, 10.08, 10.03 against the measured 8.38, 9.85, 10.57, 10.43. It runs 0.3-0.5 low on
every shard, the same offset each time (the closing stop and harness exit), so it ranks shards and values of K correctly.

Predicted wall is the per-part overhead plus the slowest shard; runner minutes are the K shards' overhead plus work
(`units`, `checkpoints` and `collect` add about 13.4 whatever K is). `chooseK` takes the smallest K whose wall is within
0.5 min of the best, because fewer shards means fewer runner minutes:

| K | Predicted wall | Shard runner minutes |
|---|---|---|
| 4 | 11.02 | 43.51 |
| 5 | 9.46 | 47.04 |
| 6 | 8.55 | 50.57 |
| 7 | 7.83 | 53.72 |

K = 7: K = 6 is 0.72 min slower than K = 7, so 6 is outside the 0.5 band. The committed shards, each with its predicted
cost (own work) and wall (plus the 3.15):

| Shard | Stages | Check minutes | Cost | Wall |
|---|---|---|---|---|
| shard-1 | journey J1-J8, tutor-slice, blank-hooks, practice-card, canvas-chrome | 3.12 | 4.39 | 7.54 |
| shard-2 | rh-app, comments, comments-invite, sketch, fork, handle, explore | 3.14 | 4.46 | 7.61 |
| shard-3 | sca, dive, naming, equation, filedrop | 3.85 | 4.63 | 7.78 |
| shard-4 | rh-dev, selected-pill, visibility, panel-header, slash-sheet | 3.70 | 4.48 | 7.63 |
| shard-5 | project-canvases, explore-holes, repo-browser, cross-device, library-folders, share-revocation | 3.64 | 4.50 | 7.65 |
| shard-6 | card-select, card-redesign, creator-profile, thumbnails, bundle(dist), bundle(dist-dev) | 3.09 | 4.53 | 7.68 |
| shard-7 | answer-routing, sidebar, project-menu, analytics-ui, workspace, card-context-menu, rh-local | 3.74 | 4.68 | 7.83 |

The `checkpoints` part (8.48 in the Speed baseline, which includes its 0.63 verify wait, since removed) now runs about as
long as the slowest shard, so a further shard cannot shorten the gate.

To repack after a re-measure: update `durations.json` and `C`, then print the literal with
`node -e "import('./scripts/r36-gate/pack.mjs').then(m=>console.log(JSON.stringify(m.pack(JSON.parse(require('fs').readFileSync('scripts/r36-gate/durations.json')),7))))"`
(and `m.kTable(...)` for the table). The workflow matrix lists `shard-1`..`shard-K` for that K.

## Sequence

1. Assert source identities and clean tracked application tree; check tools,
   available RAM, child spawning and ports.
2. Instantiate reviewed local configs in the disposable app checkout. Generate
   matching app/CP `.dev.vars` with SMALL_ENV=test, OAUTH_MOCK=true and
   JOURNEY_MODEL_STUB=fixtures. Initialize local bootstrap/migrations,
   repository schema and BYOC schema using `wrangler d1 ... --local` only.
3. Start the original development stack through the process observer. Require
   wrong-secret `/test/session` rejection, successful synthetic authentication
   and authenticated `/api/apps` responses from both Workers.
4. Run the unchanged candidate's `e2e/dive-check.mjs`, retain Worker stdout and
   stderr, native exit observations, memory and last completed requests. The
   existing `/main/thumbnail` fixture remains unchanged. Failure stops the job.
5. Clean up, then run every original `int35.sh` stage in its original order,
   plus the corrected local answer-routing browser harness after sketch.
   This includes full units, nanoGPT fixture, both application modes, all
   browser stages, both production-bundle checks, journeys J1–J8 and Tutor
   stages. Existing conditional folders/share/project-menu checks remain.
6. Require the exact candidate's `scripts/dev-deploy.mjs` gate verifier to
   accept the terminal log; additionally require routing and project-menu
   counts and zero provider-tripwire hits. Cleanup failure invalidates pass.

`source-manifest.json` records original helper hashes and portable template
hashes. Preparation replaces machine paths, wraps existing commands for
diagnostics and separates local Wrangler registries; it does not reduce checks.
`harness.test.mjs` checks ordered stage preservation and actual process receipts.

The failed complete run 38315013501 is retained as failure evidence. The fixture
adapters use gate-local D1 paths, pan from an unobstructed canvas point and wait
for completed navigation without duplicate narration. They produce disposable
fixture copies; tracked application fixtures and the original stage assertions
remain intact. Run the adapter and harness tests with `R36_FIXTURE_SOURCE_ROOT`
set explicitly to the reviewed application checkout. Focused adapter tests do
not establish that the browser gate passed.

`run.mjs focused` performs fresh supported preflight, then SCA, selected-pill,
the original J1-J8 journey block and Tutor slice. It writes a focused-only receipt
and never creates a complete-gate attestation. Use a fresh runner again for the
required complete gate after all fixes are integrated.

Only `ARTIFACT_ROOT` may be uploaded. Configs, `.dev.vars`, local databases and
browser profiles stay private to the ephemeral runner. Logs redact generated
test secrets. A terminal `receipt.json` with pass=false is failure evidence;
neither a successful push nor an incomplete log is a gate receipt. No deployment
or production migration is part of this job.
