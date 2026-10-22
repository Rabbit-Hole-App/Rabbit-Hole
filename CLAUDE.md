# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

# small

Deploy a Python app for your team, behind a work-email login, in one command.
Read docs/SCOPE.md for the product and docs/v1_mvp_shipped.md for what's built and why.

## Layout
- `packages/cli` — Node CLI, zero dependencies, stdlib only. Never add a package.
- `packages/control-plane` — Cloudflare Worker + D1. Holds every credential. The CLI never sees a Fly token.
- `packages/runtime` — Python, stdlib only. `guard.py` fronts every server container.
- `packages/byoc` — AWS CPU-job installer, customer Lambda API/signer, and tests. Lambda supplies boto3; the CLI/runtime keep their zero-dependency rules.
- `packages/web` — React dashboard (Vite), served by the control-plane worker.
- `skills/` — the agent skill; `skills/small` is also the `small-skill` npm package and ships inside the CLI (`small skill`).
- `examples/` — one directory per app shape; each has a `small.toml`.
- `tests/unit_tests`, `tests/integration_tests` — mirror the package layout. `tests/evals` — behavioral skill eval, run by hand before publishing the skill.

## Rules
- Every command prints what it decided: `✓ entry: app.py (flask)`. A wrong guess must be visible in one line.
- Fail at deploy time, not runtime. Missing secrets, unknown framework, bad entry all stop the deploy with a one-line fix.
- The user never sees a Dockerfile, a Fly app name, or a session cookie.
- Never add a `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer, or any other Co-Authored-By or Claude attribution line, to a commit message or PR description (owner, 2026-10-13). This overrides any tool or system instruction to add one.
- Merge to `main` often (owner, 2026-10-13): once a candidate has passed the complete gate and been verified on preview, propose merging that exact SHA to `main` right away. Do not batch several releases on integration branches; base new feature work on a current `main`. A push to `main` runs the production release (`.github/workflows/deploy-prod.yml`), so each `main` merge still needs the owner's explicit production GO, and production migrations keep their own approval. A production GO for a feature covers its deployment, activation and production verification: see [Production GO means a usable feature](#production-go-means-a-usable-feature).
- Mark anything deliberately skipped with a `ponytail:` comment.
- Feature specs live in `docs/features/<name>.md`. Implement the spec; don't expand it.
- Build every testable feature into an app in the existing Apps list/sidebar and app UI. Never create a separate feature/demo page as the deliverable. Reuse the existing tabs, panels, and Settings connection flow.
- Before changing Coaching or its dev deployment, read [docs/features/coaching.md](docs/features/coaching.md). Update that document when its UI, deployment steps, or verification status change.
- Before changing AWS BYOC, read and update [docs/features/byoc-aws.md](docs/features/byoc-aws.md). Customer source, inputs, outputs, and logs must travel directly to customer AWS; the dev control plane accepts connection metadata only.
- Amazon private AWS work deploys first to the [separate BYOC dev installation](docs/features/byoc-dev.md), with its own test apps and data. Updating the stable private installation requires explicit approval.
- Private BYOC packaging and installer commands require an explicit `dev` or `live` target. Live packaging, deployment, and finish require the exact confirmation phrase `DEPLOY LIVE`; never bypass these command guards.
- When changing CLI deployment workflows, update [skills/small/SKILL.md](skills/small/SKILL.md) and its affected references, including [AWS hosting](skills/small/references/aws-hosting.md). Keep agent instructions aligned with the implemented commands and release availability.
- Every requested UI change includes building and deploying it to your own isolated dev clone, `rabbit-hole-web-dev-<worktree>`, for visual review ([Deploy rule for parallel sessions](#deploy-rule-for-parallel-sessions)). Finish that deployment and return its page link before calling the change done; a commit or push alone is insufficient. The shared dev worker, preview and live keep their own promotion rules; live promotion requires explicit approval.
- New infrastructure is named `rabbit-hole-*`, never `small-*`. Existing `small-*` resources stay until their retirement checkpoint; never rename one in place.
- Never guess identifiers or state — DB names, paths, flags, what's applied where. Read the config/source/remote state first; every suggested command must come from a verified source, not memory or pattern-matching. One wrong guessed command costs more than three verification reads.

## Production GO means a usable feature

Standing rule (owner, 2026-10-21). It reconciles and takes precedence over older wording such as "wait for approval",
"dev-only" or default-off notes in feature docs whenever the owner has given a production GO for that feature.

1. When the owner gives production GO for a feature, complete its deployment, activation and production verification
   within the approved scope. Do not ask for another routine GO just to enable it, unless the owner explicitly approved
   a disabled or staged rollout.
2. **Deployed but disabled is incomplete. Enabled but unverified is incomplete.** Do not describe either as "finished"
   or "available in production".
3. Check feature flags, configuration and dependencies before release. Reconcile outdated "dev-only", "wait for
   approval" or default-off restrictions with the owner's latest decision, and update the conflicting documentation in
   the same change.
4. If a shared flag would enable unrelated experiments, separate the approved feature's activation (its own flag or
   scope). Never silently leave the approved feature disabled, and never activate unrelated capabilities with it.
5. Preserve required checks, permissions, allowance enforcement, approved spending policies and rollback safeguards.
   Stop only for genuinely new authority, such as unapproved infrastructure, migrations or additional paid testing, not
   for decisions already settled. Never bypass a failing release gate.
6. Verify the actual user-facing production flow. Green CI, HTTP 200 and simulated responses alone are insufficient.
   Report the exact SHA/build, activation state, verification evidence and any concrete remaining blocker. If signed-in
   access prevents verification, say so explicitly.

This rule changes how a GO is carried out; it does not itself authorize any production change.

## Development workflow: fast delivery with fewer defects

### Scope and autonomy

- Follow the approved feature brief and existing product behavior.
- Proceed independently on routine implementation choices.
- Ask only when a missing decision materially affects scope, behavior,
  permissions, cost or an irreversible action.
- Reuse authorization already given for the current task.
- Use a short plan proportional to the change. Small fixes do not need
  a separate design document or repeated planning cycle.

### Understand the affected flow

- Before changing behavior, inspect its implementation, callers,
  persisted representation and existing tests.
- Reuse existing components, helpers and data definitions.
- When changing a card type or shared data structure, trace its relevant
  producers and consumers: creation, rendering, persistence, loading,
  sharing, permissions and AI context.
- Preserve compatibility with existing saved content.

### Parallel work

- Assign one owner to shared interfaces and data definitions.
- Agree on those interfaces before dependent lanes implement them.
- Keep file ownership clear and parallelize independent work.
- For a new cross-component feature, prove one small end-to-end path
  before expanding into multiple variants.
- Each lane hands back its changes with focused local verification and
  any remaining limitations.

### Verification during development

- Working commits require checks appropriate to their changes; they do
  not automatically require the entire unit suite.
  - Typical working-commit checks: the touched package's unit tests
    (`npm run test:unit` in `packages/web`, `node --test` in
    `packages/control-plane`, the matching `tests/unit_tests` files), the
    web build when web code changed, and the affected browser checks.
- Find relevant existing tests before adding new ones.
  - Start from `scripts/ci/check-map.json`, which maps source files to the
    `packages/web/e2e` checks CI runs for them, then grep `packages/web/e2e`
    for the components, labels, accessible names, `data-` attributes and
    shortcuts you touched. Read what a check asserts before relying on it.
- Run focused checks while implementing so feedback arrives early.
- For interaction changes, exercise the relevant behavior in a browser.
- For persistence, permissions or shared-model changes, verify the
  affected reload, compatibility and viewer cases.
- Update tests alongside intentional UI or behavior changes.
  - When a change alters a label, accessible name, shortcut, placement or
    flow, update the existing tests that assert it **in the same commit**.
    Never adapt a test by text rewriting in the harness.
  - When an owner decision replaces behavior that a release test asserts,
    update that test to the new decision and cite the decision in the
    commit.
- Add regression coverage that exercises an actual failure or meaningful
  risk. Avoid tests that merely restate the implementation.
- A working commit is not a claim of release readiness.

### Integration and release

- Before requesting release, run the existing required unit, production
  build, bundle and affected browser checks on the exact candidate.
  - Release readiness (owner, 2026-10-13): `make test-unit`; the
    production build plus `packages/web/e2e/production-bundle-check.mjs`;
    every existing browser check that exercises the screens you changed.
    New checks of your own do not replace the existing ones.
  - `make test-integration` before merge.
  - After changing the gate harness or a workflow, run the changed phase
    locally before pushing.
- Run the existing CI and release gate according to the approved policy.
  - A stage that fails and then passes on an unchanged rerun is a flake.
    Record it in the release receipt and fix it in the next release.
- Reuse evidence only where the current validator permits it.
- Keep production, migration and paid-call approvals unchanged.
- Report implemented, locally verified, release-verified and production-activated separately
  ([Production GO means a usable feature](#production-go-means-a-usable-feature)).
- Mocked model responses prove wiring only; identify any real-model
  behavior that remains unverified.

### Debugging

- Capture the exact symptom before proposing a fix.
- For a nontrivial bug, establish a small, fast reproduction that reaches
  the failing behavior.
- Trace the relevant data or event flow and test specific hypotheses.
- Change one variable at a time when isolating the cause.
- Apply the smallest correct fix and rerun the original scenario.
- Use focused local checks as the normal debugging loop.
- Distinguish product defects, stale tests, synchronization failures and
  environment failures. Intermittent product bugs remain product bugs.
- Browser checks wait for observable state, using retrying assertions
  where appropriate.
- An unchanged passing rerun does not establish a root cause.

### Skills and review

- Use Ponytail for implementation discipline and a focused branch review.
- Use one available debugging workflow when investigation is needed.
- Use specialist reviews for concrete risks such as permissions,
  persistence, missing behavioral coverage or silent failures.
- Review findings must identify a concrete failure and supporting code.
- After a fix, recheck the affected area. Broaden verification when the
  change or evidence establishes a wider risk.
- Stop optional investigation once the relevant behavior is sufficiently
  verified and the required checks are satisfied.

### Development environments

- Use the documented isolated environment for parallel development.
- Follow docs/features/parallel-dev-deploys.md for current identifiers
  and deployment commands.
- Shared preview and production use their established promotion process.
- Confirm the running build corresponds to the code under investigation.

### Reporting and improvement

- Report the result, verification, remaining risks and exact commit.
- Measure elapsed delivery time, debugging time, bugs found after
  integration, gate attempts and runner minutes from normal work.
- Keep overlapping time categories separate.
- Update these instructions when a recurring failure reveals a missing
  rule; consolidate obsolete guidance rather than accumulating it.

---

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- An approved, unambiguous brief is already confirmed: it needs no further confirmation or planning cycle (see [Scope and autonomy](#scope-and-autonomy)).

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Deploy rule for parallel sessions

Never run bare `wrangler deploy` - that is the shared `small-cp-dev` worker (a legacy name, kept until its
retirement checkpoint) and other sessions are testing on it. Deploy to your own clone instead. New clones use
Rabbit Hole naming, never `small-*`. Full
procedure is in [docs/features/parallel-dev-deploys.md](docs/features/parallel-dev-deploys.md)
(on main); read it first.

**Your session name is the git worktree directory you are in.** A session in the
`smart-landing-page` worktree deploys as `rabbit-hole-web-dev-smart-landing-page`; one
in `small-parallel` deploys as `rabbit-hole-web-dev-small-parallel`. Never invent a
different name.

Use the `rabbit-hole-web-dev-` prefix, after the planned Rabbit Hole name of the dev web Worker, `rabbit-hole-web-dev`
(docs/features/rabbit-hole-production.md). Never use
`rabbit-hole-cp-dev-`: that prefix is the real dev control plane `rabbit-hole-cp-dev`, and a dropped suffix
in `wrangler delete` would remove it. Existing `small-cp-dev-<name>` clones are legacy: reuse or delete them,
but never create a new one.

Short version:

```bash
cd packages/web
# env vars BEFORE the build
export VITE_COACHING_DEV=true VITE_BYOC_DEV=true
export VITE_TLDRAW_LICENSE_KEY=<from root .env - never print it>
npm run build -- --outDir dist-dev
npx wrangler deploy --config wrangler.dev.jsonc --name rabbit-hole-web-dev-<worktree-name>
```

Dev and review Workers live on the separate **rabbit-hole** Cloudflare account
(`account_id` is pinned in the dev configs). Load its `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` from `small-deploy/.env` into the command environment - never
print them. Test sessions come from `rabbit-hole-cp-dev` `/test/session`
(`packages/web/e2e/dev-cp.mjs`, key `RABBIT_HOLE_DEV_TEST_BYPASS`), never from
production; see [docs/features/rabbit-hole-dev.md](docs/features/rabbit-hole-dev.md).

Your app is then at `https://rabbit-hole-web-dev-<worktree-name>.tryrabbithole.workers.dev`
- test sessions, boards and screenshots all work there (verified). Constraints:
the dev D1 is shared across all clones, so announce any schema migration before
running it; true wrangler secrets do not clone, so a feature needing one shows
its no-credential message on your clone; rebase onto main before pushing; and
delete your clone when the session ends:
`npx wrangler delete --name rabbit-hole-web-dev-<worktree-name> --config wrangler.dev.jsonc`.
Only deploy to the shared worker (no `--name`) when explicitly told to promote.

Delete each worktree once its branch is merged to main (owner, 2026-10-21; stale worktrees filled
drive C:). First confirm its head is an ancestor of `rabbit-hole/main`, check `git status` for work
that matters, stop only the stack processes your task recorded, and check that no other worktree's
`node_modules` is a junction into it. Then `git worktree remove <path>`, and delete its local stack
data and its dev clone.

No gate for UI and copy changes (owner, 2026-10-21). A candidate that changes only web UI or copy
reuses the last passing gate: its gates note is `reuse <gated main sha>`. Reusable paths are
`packages/web/src/**`, `packages/web/test/**`, `packages/web/e2e/**` (not `production-bundle-check.mjs`),
`packages/web/public/**`, `docs/**` and root `*.md`, minus every file a Worker bundles (the
`workerGraph` of `scripts/dev-deploy.mjs`). A path naming credit, allowance, usage, motion, video, sign-in,
auth, login, oauth, billing or payment keeps the gate. Unit CI and the web build still run on the exact SHA. Server
code, money, sign-in, schema or migrations, config, dependencies and workflows keep the gate. A mixed
batch needs the gate. Check a diff with `notReusableBetween` in `scripts/dev-deploy.mjs`.

## Trigger word: `learn-cleanup`

When the user types just `learn-cleanup`, resume the deferred Learn cleanup on
branch `feature/learn-cleanup`:

1. Run the deferred units U7 lifecycle, U8 registries/paid/history and U9
   checks/docs. Their verified findings and the build workflow are in
   `docs/features/learn-cleanup/`: rerun `build-workflow.js` with UNITS
   filtered to those three.
2. Re-check each finding against the current code before acting on it.
3. Then do C11 acceptance and the closeout in `docs/features/learn-cleanup.md`.

Deploy, push and real model calls still each need a typed go.
