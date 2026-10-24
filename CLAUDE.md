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

- A lane assignment states its objective and scope, base branch and commit, the files or interfaces it owns, its
  dependencies, required deliverables and acceptance checks.
- Shared schemas, accounting semantics and contracts have one owner. Dependent lanes consume the committed interface;
  they do not invent variants.
- Independent lanes use isolated worktrees and avoid overlapping edits.
- Keep unrelated ready work moving when another lane is blocked.
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
  `packages/web/e2e/production-bundle-check.mjs`; the CI gate; `make test-integration` before merge. After changing
  the gate harness or a workflow, run the changed phase locally before pushing.
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

## Reporting

Report the result, verification evidence, remaining risks and the exact commit. Give ETAs only when derived from the
remaining steps and their measured durations; when a duration is unknown, say what is unknown and when it will be
known. Measure elapsed delivery time, debugging time, post-integration bugs, gate attempts and runner minutes, keeping
overlapping categories separate. Update this file when a recurring failure reveals a missing rule; consolidate rather
than accumulate.

## Trigger word: `learn-cleanup`

Applies only to this deferred workflow. When the user types just `learn-cleanup`, resume the Learn cleanup on branch
`feature/learn-cleanup`:

1. Run the deferred units U7 lifecycle, U8 registries/paid/history and U9 checks/docs. Their verified findings and the
   build workflow are in `docs/features/learn-cleanup/`: rerun `build-workflow.js` with UNITS filtered to those three.
2. Re-check each finding against the current code before acting on it.
3. Then do C11 acceptance and the closeout in `docs/features/learn-cleanup.md`.

Within this workflow only, deploy, push and real model calls each need a typed go.
