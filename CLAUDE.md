# CLAUDE.md

Operating guide for Claude in this repository. This file on `main` is the single authoritative copy: if your branch
carries an older version, read `git show rabbit-hole/main:CLAUDE.md` before working and rebase onto main. Codex reads
`AGENTS.md`; this file does not depend on it.

## Rabbit Hole

This repository is **Rabbit Hole**, a learning application served at digrabbithole.com. Its main areas are the
learning canvas and its cards, Chat and the Tutor, sources and context (files, links, a repository, Study, notebooks),
and generation features (Explain, CAD, images, Motion, voice). Shipped versus in-progress status lives in each
feature's spec and in the code, not here.

- For a task, read the relevant spec in `docs/features/<name>.md` and the current implementation. Implement the spec;
  do not expand it. Where a spec conflicts with a later owner decision, the latest owner decision applies (record it
  in the commit and update the conflicting doc).
- `docs/SCOPE.md` and `docs/v1_mvp_shipped.md` describe the retired `small` CLI MVP. They are history, not Rabbit
  Hole's scope; their exclusions (such as "no web dashboard") do not apply.

### Retired areas and legacy names

CLI and BYOC are retired product areas. Legacy files or resources may remain (`packages/cli`, `packages/runtime`,
`packages/byoc`, `skills/small`, `examples/`, `small.toml`, BYOC bindings in dev configs). Their presence does not make
them part of the active Rabbit Hole scope. Do not reactivate them or perform unrelated maintenance while implementing
Rabbit Hole features. Removing them is a separate, dependency-checked retirement task, never a side effect.

Product prose says "Rabbit Hole"; new resources are named `rabbit-hole-*`. Some operational identifiers still carry
the legacy `small` name (for example the shared dev worker `small-cp-dev` in `packages/web/wrangler.dev.jsonc`). Use
them exactly as configured until their migration is done; never substitute an invented `rabbit-hole-*` name in a
command, and never rename a resource in place.

## Repository map

- `packages/web`: the React (Vite) app and its Workers. Production is the `rabbit-hole-app` Worker
  (`app-worker.js`, `wrangler.rabbit-hole-prod.jsonc`): it serves the built assets, runs the Learn routes and Durable
  Objects (it reuses `dev-worker.js`), owns its own D1 and R2 bindings, and reaches the control plane through the
  `CONTROL_PLANE` service binding. `dev-worker.js` with `wrangler.dev.jsonc` is the dev/review Worker. Topology:
  `docs/features/rabbit-hole-production.md`.
- `packages/control-plane`: the control plane Worker (`rabbit-hole-cp`, `wrangler.rabbit-hole-prod.jsonc`; dev
  `wrangler.rabbit-hole-dev.jsonc`): sign-in, sessions, accounts and the shared server modules (`src/`) that the app
  Worker also imports.
- Rendering and execution services (Fly apps, each with its own `fly.*.toml`): `learn-render` (Motion and lecture
  video), `lesson-renderer`, `math-renderer`, `cad-execute`, `file-convert`.
- `tests/unit_tests`, `tests/integration_tests`: Python-side tests; JS tests live beside each package.
- Resource names, bindings, database IDs and deployment targets: read the `wrangler.*.jsonc` and `fly.*.toml` files.
  Do not copy them into instructions.
- Credentials: each secret lives on the Worker or service that uses it (see the config comments and feature docs).
  Private provider keys stay server-side; the browser never receives them.

## Commands

Verified against `packages/*/package.json`, `Makefile`, `run.sh` and `packages/web/playwright.config.js`. A command's
meaning depends on its working directory.

| Purpose | Directory | Command | Prerequisites | What it proves | Browser / external cost |
|---|---|---|---|---|---|
| Web unit tests | `packages/web` | `npm run test:unit` | `npm ci` in `packages/web` | `node --test "src/**/*.test.mjs"` passes | No browser; intended offline |
| Web build | `packages/web` | `npm run build` | env flags for the target ([Development deployments](#development-deployments)) | `vite build` compiles and bundles | No |
| Control-plane tests | `packages/control-plane` | `npm test` | `npm ci` in `packages/control-plane` | `node --test` suites pass (fixture keys) | No browser; intended offline |
| Release unit suite | repo root | `make test-unit` | `uv`, both packages installed | `run.sh test:unit`: Python unit tests, both JS suites, Motion, evals and `scripts/*.test.mjs` | No browser; `run.sh` marks it "no network" |
| Integration suite (retired) | repo root | `make test-integration` | `uv` | `run.sh test:integration` over `tests/integration_tests` (legacy CLI deploys to Fly). `tests/integration_tests/conftest.py` marks every test skipped, so it executes nothing and proves nothing | Skipped as configured; with the skip removed it would be a real Fly deploy with external cost |
| Browser tests | `packages/web` | `npm test` | none for Claude | `playwright test` over `e2e/`, building and starting a preview server | **Browser automation: Claude does not run it** ([Browser verification](#browser-verification)) |

A successful build proves compilation and bundling only, not user interaction or real-provider behavior. Browser
coverage and deployment go through the approved CI and release procedure ([Release requirements](#release-requirements),
`docs/features/parallel-dev-deploys.md`); do not invent alternative commands.

## Repository gotchas

Non-obvious traps that have caused mistakes. Remove an entry when its condition no longer holds.

- **`npm test` means different things.** In `packages/web` it is Playwright (browser automation); in
  `packages/control-plane` it is `node --test`. Use the table above. (Each package's `package.json`.)
- **`node --test` with an absolute glob under Git Bash runs 0 tests and exits 0.** Use a relative glob from the right
  directory; `run.sh` wraps suites in `nonzero-tests` for this reason. (`run.sh`, `test:unit`.)
- **An isolated dev clone is not an isolated database.** All clones share the dev D1, and they do not inherit secrets
  installed on another Worker. ([Development deployments](#development-deployments).)
- **Green CI can mean zero relevant checks.** `fast-e2e` selects checks by diff from `scripts/ci/check-map.json`;
  confirm your check was selected and executed. ([Verification and evidence](#verification-and-evidence).)
- **Legacy names are still live.** `small-cp-dev` and other `small-*` identifiers remain operational under Rabbit Hole.
  ([Retired areas and legacy names](#retired-areas-and-legacy-names).)

## Standing owner rules

- Credentials: read only from `C:\Users\cyudhist\Desktop\workspace\small-deploy\.env`, never a worktree's own `.env`.
  Read key names only, pass values by name, never print or source the file.
- Commits and PRs carry no `Co-Authored-By` or other Claude attribution line (owner, 2026-10-13). Push only to the
  `rabbit-hole` remote.
- Never guess identifiers or state (database names, paths, flags, what is applied where). Read the config, source or
  remote state first; every suggested command comes from a verified source.
- Users see AI credits only. Dollar amounts, provider prices, margins and internal diagnostics are restricted to
  authorized operators and excluded server-side.
- UI labels never contain "..." or "…". A disabled item keeps its name, greyed.
- Build testable features into the existing app UI (canvas, panels, Settings). Never ship a separate demo page as the
  deliverable.
- Mark anything deliberately skipped with a `ponytail:` comment.
- Before changing Coaching or its dev deployment, read and keep current `docs/features/coaching.md`.

## Ask or proceed

Proceed within the approved scope and reuse authorization already given. Resolve routine implementation details using
the current code, existing patterns and the stated requirements. Ask only when an unresolved decision materially
changes user behavior, scope, permissions, cost or an irreversible action. State the recommended choice and its
consequence. Continue independent work while a genuinely blocking decision is pending.

- An approved, unambiguous brief needs no further confirmation or planning cycle.
- When a brief has two materially different readings, name them and the one you chose; do not stop over ordinary
  engineering choices.
- Ask several blocking questions at once, each with lettered options and a recommendation.
- Autonomy never bypasses tooling restrictions, release checks, or the approval boundaries in
  [Release and deployment](#release-and-deployment).

## How to execute a task

1. **Problem.** What behavior is wrong or missing, who experiences it, and what observable outcome solves it.
2. **Inspect.** The entry points and callers, shared helpers and contracts, persisted data, permissions, existing tests,
   and your branch and revision. For a card type or shared data structure, trace creation, rendering, persistence,
   loading, sharing, permissions and AI context. Preserve compatibility with saved content.
3. **Smallest coherent change.** Reuse existing mechanisms. No speculative features, abstractions or configurability.
   Do not refactor or restyle adjacent code; remove only the orphans your change creates. Explain a material tradeoff
   when there is one.
4. **Verification first.** A reproduction for a meaningful bug, the expected behavior and important edge cases, the
   existing checks to run, and what fixtures cannot establish (real-provider or deployed behavior).
5. **Scale the plan.** Small, obvious edits proceed directly. Cross-component changes get a short plan and one
   end-to-end slice before variants. No large design document for every change.

### Debugging

Capture the exact symptom before proposing a fix. Build a small, fast reproduction for a nontrivial bug, trace the
data or event flow, test one hypothesis at a time, apply the smallest correct fix and rerun the original scenario.
Distinguish product defects, stale tests, synchronization failures and environment failures; intermittent product
bugs remain product bugs. After repeated unsuccessful corrections, reassess the hypothesis and write a clean
continuation brief rather than repeating the same approach without new evidence.

## Parallel lanes

When multiple approved tasks can proceed independently, launch or resume agents for them without waiting for the owner
to request parallel work. The coordinating agent owns scheduling, dependency resolution, integration and delivery. Do
not leave executable work unassigned while suitable agent and execution capacity are available.

- **Assignments.** Divide substantial work into bounded assignments. Each states its objective and scope, base branch
  and commit, the files or interfaces it owns, dependencies, required deliverables, acceptance checks and a required
  hand-back. Independent implementation uses isolated worktrees and avoids overlapping edits.
- **Ownership.** Shared contracts, migrations, accounting semantics and integration each have one owner. Dependent
  lanes consume the committed interface; they do not invent variants.
- **Priority and capacity.** Prioritize work that unlocks other tasks or shortens the path to a usable release. If
  agent slots are full, keep an explicit ready queue and assign the next task when a slot opens. Never start a second
  agent for work already running. Use enough parallelism to improve delivery time, but do not run competing builds,
  shared-database mutations or render jobs that overload the same resource.
- **Scheduling check before waiting.** Before waiting for agents, CI, deployment, paid validation or owner input, review
  the ready queue and start any independent authorized work that can proceed. Waiting is appropriate only when no
  useful independent work is available, execution capacity is exhausted, or a concrete dependency blocks it. While
  waiting, the coordinator integrates ready hand-backs, prepares the next candidate, its scripts, acceptance instructions and checks, diagnoses unrelated
  failures, prepares migration commands, receipts, fixtures and documentation, resolves interface questions between
  lanes, and safely closes completed worktrees. Do not repeatedly report "waiting for agents" while ready tasks remain
  unassigned.
- **Blockers are per subtask.** A missing decision blocks only the work that depends on it. Continue independent
  investigation, implementation, tests and preparation, and do not invent an answer to a consequential unresolved
  decision. Pending production provisioning does not by itself block schema design, migration preparation,
  deterministic tests or work against a committed contract. Keep unrelated ready work moving when another lane fails or
  is blocked.
- **Development, validation and release.** Production promotion may be serialized; development and independent
  candidate validation should proceed concurrently where the existing workflow and resources permit. Prepare later
  candidates while the current one is in CI or awaiting its release command; run independent checks concurrently;
  serialize only operations that share mutable resources or need ordering; keep a single integration and release owner.
  Freeze a candidate, and the release base it sits on, before long validation instead of adding unrelated work and
  restarting its checks. Changing the base (for example rebasing onto a newly released `main`) needs a stated reason and
  a list of the evidence that must be rerun: apply the existing reuse rules (identical patches, unchanged files and
  contracts keep their evidence) and name the specific changed files or contract that force any rerun. When
  integration or rebasing changes the candidate SHA, obtain the required evidence for the resulting SHA. Use the
  existing gate-reuse eligibility and batching rules; do not weaken a gate or alter workflow policy to shorten the
  queue.
- **Background runs.** Every background run (harness, gate watcher, CI wait, capture, long test) has a named owner, a
  log location and an explicit completion result (exit code or `RESULT` line) that its owner reads from the run itself.
  An agent finishing its turn, or a completion notice, does not mean its background work finished: track the process
  and its log, and record the script and candidate versions that were tested.
- **Budgets.** Paid work stays inside the existing shared budget and authorization; more agents do not receive
  separate budgets.
- A hand-back contains: commit SHA; changes made; tests actually executed and their results; remaining limitations;
  integration dependencies; required migration or deployment steps; and a short "how to try it" for the owner.
- A lane's passing tests do not establish that the combined integration candidate passes; the integrator reruns the
  required checks on the exact integrated SHA.

## Verification and evidence

- Working commits run checks appropriate to the change: the touched package's unit tests (`npm run test:unit` in
  `packages/web`, `node --test` in `packages/control-plane`, matching `tests/unit_tests`), the web build when web code
  changed, and the affected browser checks through CI.
- Find existing checks before adding new ones: start from `scripts/ci/check-map.json` (source file to
  `packages/web/e2e` check, with its runner tier, such as `fork` or `windows-only`), then grep `packages/web/e2e` for
  the components, labels, accessible names, `data-` attributes and shortcuts you touched. Read what a check asserts
  before relying on it. New tests never replace relevant existing coverage.
- Update tests in the same commit as an intentional UI or behavior change. Never adapt a test by rewriting text in
  the harness. When an owner decision replaces asserted behavior, update the test and cite the decision.
- Add regression coverage for an actual failure or meaningful risk, not tests that restate the implementation.
- Keep these states distinct and report them precisely: registered, selected for a run, executed, passed, failed,
  skipped, not covered by that tier. A green workflow that selected zero relevant checks is not evidence that the
  changed behavior passed.
- For release-relevant behavior report: candidate SHA, check name, run/job ID or local receipt, executed result,
  skipped steps or cases, and what the check actually proves.
- Keep evidence categories separate: unit/fixture; browser wiring and persistence; real-provider or real-render;
  deployed user-flow. Mocked model responses prove wiring only.
- Never weaken assertions, suppress errors or raise timeouts merely to get green without explaining the underlying
  condition.
- **Preflight before expensive validation.** Before a long harness, gate or suite run, verify the candidate SHA and
  branch it will use, the harness configuration and its defaults (branch names, paths, variables) and that every
  required file or fixture exists. A stale default fails immediately, not mid-run.
- **Harnesses clean up after themselves.** Every harness, test runner and capture owns the child processes, servers,
  ports and temporary resources it starts and removes them on success, failure and cancellation. A cleanup failure stays
  visible in the output and does not stop the remaining cleanup steps. Leftover processes are stopped only when
  positively identified as that harness's own (PID, creation time, full command line and recorded sandbox), never by
  blanket termination.
- **Representative user flow early.** Before calling a feature release-ready, exercise one representative enabled user
  flow (the first thing a signed-in user does with it) through the approved route; unit and fixture checks do not
  stand in for it.

### Intermittent failures

A failure followed by a passing run on unchanged code is intermittent evidence. It does not establish whether the cause
is product behavior, test synchronization, infrastructure or the environment. Preserve the original failure evidence
(run and job IDs, logs). Classify a cause only when logs, a reproduction or a validated explanation support it;
otherwise record it as unresolved in the release receipt. Follow the existing retry and release policy; no unlimited
reruns.

### Browser verification

UI changes need interaction evidence from an approved execution environment. Claude does not run local or
browser-automation checks itself (owner, 2026-10-21) unless the owner explicitly authorizes an exception. Claude may
write or update browser checks, read their assertions, and read results from the approved CI runs (`fast-e2e`, the
release gate). Do not bypass this through an equivalent script, alternate tool or helper agent. If the required
environment is unavailable, finish the implementation and deterministic checks, report the exact unverified behavior,
and claim no visual or interaction acceptance. Unit tests are not visual verification; behavioral checks and visual
evidence do not substitute for each other. The owner tests the result in the browser.

## Release and deployment

### Production GO means a usable feature

Standing rule (owner, 2026-10-21). It takes precedence over older "wait for approval", "dev-only" or default-off notes
in feature docs whenever the owner has given a production GO for that feature.

1. When the owner gives production GO for a feature, complete its deployment, activation and production verification
   within the approved scope. Do not ask for another routine GO just to enable it, unless the owner explicitly approved
   a disabled or staged rollout.
2. **Deployed but disabled is incomplete. Enabled but unverified is incomplete.** Do not describe either as "finished"
   or "available in production".
3. Check feature flags, configuration and dependencies before release. Reconcile outdated restrictions with the
   owner's latest decision, and update the conflicting documentation in the same change.
4. If a shared flag would enable unrelated experiments, separate the approved feature's activation. Never silently
   leave the approved feature disabled, and never activate unrelated capabilities with it.
5. Preserve required checks, permissions, allowance enforcement, approved spending policies and rollback safeguards.
   Stop only for genuinely new authority (unapproved infrastructure, migrations, additional paid testing). Never bypass
   a failing release gate.
6. Verify the actual user-facing production flow. Green CI, HTTP 200 and simulated responses alone are insufficient.
   Report the exact SHA/build, activation state, verification evidence and any remaining blocker.

This rule changes how a GO is carried out; it does not itself authorize any production change.

### Release requirements

- Release readiness on the exact candidate: `make test-unit`; the production build plus
  `packages/web/e2e/production-bundle-check.mjs`; the CI gate. `make test-integration` is not a requirement: it targets
  the retired CLI/BYOC deploy path and its conftest skips every test, so it produces no evidence. After changing the
  gate harness or a workflow, run the changed phase locally before pushing when that phase is not browser automation. A
  phase that drives a browser runs only in the approved CI or designated runner ([Browser verification](#browser-verification)),
  and pushing a workflow file needs the owner's `!` command.
- Every deploy, dev or production, full gate or reused, needs the newest `fast-e2e` and `verify` runs of the exact
  candidate SHA to be completed successes (OPS-04, owner 2026-10-21). A green ancestor never stands in for them.
- **Full-gate reuse for eligible UI and copy changes** (owner, 2026-10-21). A candidate whose changes since the last
  fully gated main are eligible reuses that gate (gates note `reuse <gated main sha>`); exact-SHA unit CI, the web
  build, `fast-e2e` and `verify` still run. Eligibility is decided by `notReusableBetween` in `scripts/dev-deploy.mjs`,
  the same rule `deploy-dev` and the production release apply; do not reimplement it in prose. Server code, money,
  sign-in, schema or migrations, config, dependencies and workflows keep the gate; a mixed batch needs the gate.
- A push to `main` runs the production release (`.github/workflows/deploy-prod.yml`). Each `main` push and each
  production D1 migration needs the owner's explicit approval, normally as a `!` command the owner runs; prepare the
  exact command only when it is ready to run. Paid calls and new infrastructure keep their own approvals.
- **Owner commands are launchers** (owner, 2026-10-27). Hand the owner one copy-paste command or double-click launcher that runs from any
  directory, with the paths, environment variables, pinned SHAs and prerequisite checks inside it; the owner assembles
  nothing. It opens the right terminal itself, keeps any genuinely required manual confirmation (a typed approval is never
  automated), shows progress, writes a log automatically, ends with a clear result that preserves the real exit code, and on
  failure prints the exact error and next action. Reruns resume or skip finished steps. Verify the launcher (paths,
  terminal handling, a read-only check) before sending it, never send a placeholder or a command to adapt. Label where it
  runs: a Claude Code command starts with `!`; a command for the owner's own terminal is a single launcher with no `!`.
  The message contains only what it does, the command, the required confirmation and the expected duration and result.
- Testing any script that can mutate production (an owner script, migration, deploy, secret or resource-creating
  command) requires ENFORCED isolation: run it in a harness with no production credentials in its environment and no
  route to production services (an offline process whose PATH holds only stubs of the real executables), with mocks and
  test run configured and executed in the same process environment; shell state does not persist between tool calls.
  The production entry point must reject test-only confirmation overrides: simulated confirmations exist only inside
  the harness, and a prompt answerable by an environment variable, file or flag is not a safeguard. A dry-run mode
  must be shown unable to mutate. Shell-local mocks, stub variables and typed confirmations are not sufficient
  protection (incident 2026-10-25: a test run of a production telemetry script created production resources).
  Anything such a script touches in production is reported to the owner at once, with evidence.
- Merge to `main` often: once a candidate has passed its gate and dev deployment, propose its release. Base new work on
  current `main`. An owner-approved batch release is fine; what to avoid is unrelated work accumulating on integration
  branches without a decision.
- Report implemented, locally verified, release-verified and production-activated separately.

### Development deployments

Never run bare `wrangler deploy`: that targets the shared dev worker (legacy name `small-cp-dev`) other sessions test
on. Deploy to your own clone, named after your worktree directory: `rabbit-hole-web-dev-<worktree>` (never invent
another name, never `small-cp-dev-*`, never the `rabbit-hole-cp-dev-` prefix, which is the real dev control plane
`rabbit-hole-cp-dev` and a dropped suffix in `wrangler delete` would remove it). Full procedure and current identifiers:
`docs/features/parallel-dev-deploys.md` and `docs/features/rabbit-hole-dev.md`. Short version:

```bash
cd packages/web
# env vars BEFORE the build; do not set VITE_BYOC_DEV (retired BYOC UI)
export VITE_COACHING_DEV=true
export VITE_TLDRAW_LICENSE_KEY=<from small-deploy/.env - never print it>
npm run build -- --outDir dist-dev
npx wrangler deploy --config wrangler.dev.jsonc --name rabbit-hole-web-dev-<worktree>
```

- Dev Workers live on the rabbit-hole Cloudflare account (`account_id` pinned in the dev configs); load
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from `small-deploy/.env` by name.
- Test sessions come from `rabbit-hole-cp-dev` `/test/session` (`packages/web/e2e/dev-cp.mjs`, key
  `RABBIT_HOLE_DEV_TEST_BYPASS`), never from production.
- The dev D1 is shared by all clones: announce a schema migration before running it. True secrets do not clone, so a
  feature needing one shows its no-credential message on your clone. Confirm the running build matches the code under
  investigation. Deploy to the shared worker (no `--name`) only when explicitly told to promote.
- The app is then at `https://rabbit-hole-web-dev-<worktree>.tryrabbithole.workers.dev`.

### Worktree closeout after merge

Removing a merged worktree is part of completing the task (owner, 2026-10-21; stale worktrees filled drive C:). This
standing rule authorizes safe cleanup; no further routine permission is needed.

1. Verify on the `rabbit-hole` remote that the work is in `main`: the branch head is an ancestor of
   `rabbit-hole/main`, or for a squash or rebased merge, the merge record and the included changes. A failed ancestry
   check is not proof the work is absent, and not permission to delete.
2. Confirm there are no unmerged follow-up commits, no uncommitted or untracked work worth keeping, and no active lane
   depending on the worktree. Preserve useful receipts, logs and handoff notes first.
3. Check that no other worktree's `node_modules` (or any symlink or Windows junction) points into it.
4. Stop only the processes your task recorded for that worktree. Never kill all Node, Python, browser or server
   processes.
5. From a surviving checkout, `git worktree remove <path>`. No broad recursive delete; never force away unexplained
   changes.
6. Delete its task-owned stack data (`C:/s/toc-<lane>`) and its dev clone once nothing depends on them, verifying exact
   names first. Never delete shared dev or production resources.
7. If cleanup is blocked, report the dependency and the next action. The hand-back includes a cleanup status: merge
   verified; worktree removed or why retained; processes stopped; dev clone removed or why retained; evidence preserved.

## Continuation and review

- For work that spans sessions or context compaction, keep a short record of: objective and approved scope; branch and
  candidate SHA; decisions and authorizations; changed files; test results and unresolved failures; remaining
  dependencies; the next executable action.
- For consequential changes, use an independent review where the workflow permits, against the requirements and the
  actual diff (Ponytail for implementation discipline and focused branch review; specialist reviews for permissions,
  persistence, coverage or silent-failure risks).
- A review finding identifies a concrete correctness problem, missed requirement or meaningful risk, with supporting
  code. Style preferences and speculative improvements do not become release requirements.
- Stop optional investigation once the behavior is sufficiently verified and required checks pass.
- **Task identity.** Every actionable task the owner gives gets a permanent UUID from a standard generator, and the
  coordinator acknowledges its title and ID. The UUID is kept through implementation, reassignment, rebases,
  integration, deployment and follow-up verification. A clarification or correction updates the existing task; it does
  not create a duplicate. Independently deliverable requests get separate UUIDs; subtasks get their own UUID with a
  `parent_id`. Agent IDs, branch names, commit SHAs and CI run IDs are separate fields and never replace the UUID.
  General questions do not become tasks.
- **Progress states.** Use exactly: **To Do** (accepted and recorded, execution not started); **Doing** (started and
  still being implemented, reviewed, validated, integrated or released); **Done** (the agreed acceptance criteria and
  delivery requirements are satisfied). Phase (implementation, review, CI, integration, deployment, verification),
  blocker and execution activity are tracked separately, for example "Doing - blocked on migration approval". Doing
  does not mean an agent is executing right now. A production feature is Done only after its agreed deployment and
  verification; a research or documentation task is Done when its own deliverable is complete.
- **The ledger.** One authoritative ledger, written only by the coordinator: `C:/s/spec/ledger/ledger.json`, kept
  outside any worktree so cleanup cannot remove it. Read it first after a restart or context compaction, before creating
  tasks or launching agents. `node C:/s/spec/ledger/ledger.mjs table [--all]` prints the standard status table;
  `node C:/s/spec/ledger/ledger.mjs set <uuid-prefix> key=value ...` updates a record. Task records stay out of this
  file and out of worktrees. Each record holds: UUID and title; parent UUID; scope and acceptance criteria; progress;
  phase and execution activity; assigned agent or lane; branch and latest candidate SHA; created, updated and completed
  timestamps; latest concrete progress; dependencies by UUID; blocker, blocker owner and required next action; ETA with
  its milestone and basis; test, release and completion evidence. Agents report updates with their task UUID; the
  coordinator gives each agent its UUID when assigning work.
- **Keeping it true.** Update the ledger when a task is accepted, when an agent starts, pauses, resumes or hands back,
  when scope or dependencies change, when a check fails or passes, when integration changes the candidate, when a
  release completes and when acceptance is verified. Before reporting status, reconcile it with actual agent, process
  and CI state. Reopen the same UUID when a Done task's original acceptance was not met and record why; a genuinely new
  follow-up gets a linked new UUID. Preserve history; do not delete inconvenient failures.
- Only call work "running" or "building" when an agent or process is actually executing it. An assigned but paused
  agent, an existing branch or a planned task is not active execution. Investigate stalled work before resuming or
  reassigning it; preserve its changes and prevent duplicate writers.

## Reporting

Report the result, verification evidence, remaining risks and the exact commit. A status update says what advanced,
what is genuinely blocked, and what starts next.

- **ETA format.** When the owner asks for an ETA, report the requested tasks (for an overall request, every open
  top-level task and recently completed ones, with subtasks expanded where they explain a blocker or critical
  dependency) as a table, generated from the ledger:

  | Task | Task ID | Progress | Current phase / latest progress | ETA (PT) | Blocker / next action |
  |---|---|---|---|---|---|

  Start with an "As of" timestamp in Pacific time, converted with `America/Los_Angeles` so daylight saving is handled.
  Show real UUIDs, never invented ones. Give clock times or ranges (for example 6:30-6:45 PM PT), with the date when
  needed, and name the milestone: **ready for release** or **live**. A Done task shows its actual completion time.
  Every open top-level task also gets: the actual execution activity (agent running, CI running, queued or blocked);
  the latest concrete progress and the remaining milestones; a best-estimate **ready-for-release range in Pacific
  time**; the confidence with its basis (measured duration, similar previous work, or engineering judgment); the
  release dependency with a conditional live estimate; and the blocker, its owner and the next executable action.
  Uncertain work still gets an explicitly labeled best estimate; "Not yet estimable" is the exception, used only when
  no basis exists (then name the dependency and the milestone that will make it estimable). When timing depends on an
  owner action with no known completion time, give the duration after that action and a conditional clock estimate
  with the assumed action time stated (for example "live about 2 minutes after the release command; if the command
  runs at 8:00 PM, about 8:02 PM"). Never present an estimate as a firm date. Never move an estimate silently: update
  it when evidence changes and say why. Report concrete completed and remaining milestones, not invented percentages.
- Estimates rest on evidence: measured durations of the remaining steps first, similar previous work next, engineering
  judgment last, and the basis is stated. Report implementation readiness, validation readiness and production release
  separately; account for concurrent work rather than adding lane durations as if development were serial; name the
  actual release queue and critical dependencies.
- Measure elapsed delivery time, debugging time, post-integration bugs, gate attempts and runner minutes, keeping
  overlapping categories separate.
- Update this file when a recurring failure reveals a missing rule; consolidate rather than accumulate.

## Trigger word: `learn-cleanup`

Applies only to this deferred workflow. When the user types just `learn-cleanup`, resume the Learn cleanup on branch
`feature/learn-cleanup`:

1. Run the deferred units U7 lifecycle, U8 registries/paid/history and U9 checks/docs. Their verified findings and the
   build workflow are in `docs/features/learn-cleanup/`: rerun `build-workflow.js` with UNITS filtered to those three.
2. Re-check each finding against the current code before acting on it.
3. Then do C11 acceptance and the closeout in `docs/features/learn-cleanup.md`.

Within this workflow only, deploy, push and real model calls each need a typed go.
