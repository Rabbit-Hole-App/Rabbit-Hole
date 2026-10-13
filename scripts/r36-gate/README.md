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
pins Wrangler 4.129.0, Playwright 1.62.1 and Vite 8.2.2. Preserve the original
1500 MiB available-memory guard. `make`, GNU `timeout`, `curl`, `sed`, Python
and Windows PowerShell must be available to Git Bash.

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
