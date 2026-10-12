# r36 complete Windows gate

Application is frozen at `46fbe04283a424e69db5272f9e1f3c7b9c19e846`, tree
`2555e2aa4a6784b2984e629ee5ed77dd37bff0be`. This directory is an execution
harness on a separate branch, not an application change. Every receipt records
both application identity and the harness checkout's HEAD.

Run `node scripts/r36-gate/run.mjs` from the harness checkout on the authorized
GitHub-hosted Windows job. The workflow invokes the same entrypoint in three
success-gated phases: `preflight`, `dive`, then `gate`; each phase writes a
receipt and uploads its sanitized artifact before the next phase starts.
Running the entrypoint with no phase retains the all-in-one local compatibility
mode. Required environment: `APP_ROOT`, `GATE_ROOT`,
`ARTIFACT_ROOT`, `HARNESS_SHA`, `GATE_GRANT_ID`. `GATE_BASH` points to Git Bash.
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

1. **Preflight:** assert source identities and clean tracked application tree;
   check tools, available RAM, child spawning and ports. Instantiate reviewed
   local configs, initialize local schemas only, build/start Workers and verify authenticated access, stop the stack, and write a
   passing preflight receipt.
2. **Dive:** resume only from a matching passing preflight receipt. Start the
   original development stack through the process observer. Require
   wrong-secret `/test/session` rejection, successful synthetic authentication
   and authenticated `/api/apps` responses from both Workers. Run the
   unchanged candidate's `e2e/dive-check.mjs`, retain Worker stdout/stderr,
   native exit observations, memory and last completed requests, then clean up
   and write a passing Dive receipt.
3. **Gate:** resume only from a matching passing Dive receipt. Run every
   original `int35.sh` stage in its original order, plus the corrected local
   answer-routing browser harness after sketch. This includes full units,
   nanoGPT fixture, both application modes, browser stages, bundle checks,
   journeys and Tutor stages.
4. Require the exact candidate's `scripts/dev-deploy.mjs` gate verifier to
   accept the terminal log; additionally require routing and project-menu
   counts and zero provider-tripwire hits. Cleanup failure invalidates pass.

`source-manifest.json` records original helper hashes and portable template
hashes. Preparation replaces machine paths, wraps existing commands for
diagnostics and separates local Wrangler registries; it does not reduce checks.
`harness.test.mjs` checks ordered stage preservation and actual process receipts.

Only `ARTIFACT_ROOT` may be uploaded. Configs, `.dev.vars`, local databases and
browser profiles stay private to the ephemeral runner. Logs redact generated
test secrets. A terminal `receipt.json` with pass=false is failure evidence;
neither a successful push nor an incomplete log is a gate receipt. No deployment
or production migration is part of this job.
