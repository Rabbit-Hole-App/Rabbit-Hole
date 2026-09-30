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
- `make test-unit` before every commit. `make test-integration` before merge.
- Mark anything deliberately skipped with a `ponytail:` comment.
- Feature specs live in `docs/features/<name>.md`. Implement the spec; don't expand it.
- Build every testable feature into an app in the existing Apps list/sidebar and app UI. Never create a separate feature/demo page as the deliverable. Reuse the existing tabs, panels, and Settings connection flow.
- Before changing Coaching or its dev deployment, read [docs/features/coaching.md](docs/features/coaching.md). Update that document when its UI, deployment steps, or verification status change.
- Before changing AWS BYOC, read and update [docs/features/byoc-aws.md](docs/features/byoc-aws.md). Customer source, inputs, outputs, and logs must travel directly to customer AWS; the dev control plane accepts connection metadata only.
- Amazon private AWS work deploys first to the [separate BYOC dev installation](docs/features/byoc-dev.md), with its own test apps and data. Updating the stable private installation requires explicit approval.
- Private BYOC packaging and installer commands require an explicit `dev` or `live` target. Live packaging, deployment, and finish require the exact confirmation phrase `DEPLOY LIVE`; never bypass these command guards.
- When changing CLI deployment workflows, update [skills/small/SKILL.md](skills/small/SKILL.md) and its affected references, including [AWS hosting](skills/small/references/aws-hosting.md). Keep agent instructions aligned with the implemented commands and release availability.
- Every requested UI change includes building and deploying it to `small-cp-dev` for visual review. Finish that deployment and return the dev page link before calling the change done; a commit or push alone is insufficient. Live promotion requires explicit approval.
- Never guess identifiers or state — DB names, paths, flags, what's applied where. Read the config/source/remote state first; every suggested command must come from a verified source, not memory or pattern-matching. One wrong guessed command costs more than three verification reads.

---

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

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

Never run bare `wrangler deploy` - that is the shared `small-cp-dev` worker and
other sessions are testing on it. Deploy to your own clone instead. Full
procedure is in [docs/features/parallel-dev-deploys.md](docs/features/parallel-dev-deploys.md)
(on main); read it first.

**Your session name is the git worktree directory you are in.** A session in the
`smart-landing-page` worktree deploys as `small-cp-dev-smart-landing-page`; one
in `small-parallel` deploys as `small-cp-dev-small-parallel`. Never invent a
different name.

Short version:

```bash
cd packages/web
# env vars BEFORE the build
export VITE_COACHING_DEV=true VITE_BYOC_DEV=true
export VITE_TLDRAW_LICENSE_KEY=<from root .env - never print it>
npm run build -- --outDir dist-dev
npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-<worktree-name>
```

Your app is then at `https://small-cp-dev-<worktree-name>.zeroshothq.workers.dev`
- test sessions, boards and screenshots all work there (verified). Constraints:
the dev D1 is shared across all clones, so announce any schema migration before
running it; true wrangler secrets do not clone, so a feature needing one shows
its no-credential message on your clone; rebase onto main before pushing; and
delete your clone when the session ends:
`npx wrangler delete --name small-cp-dev-<worktree-name> --config wrangler.dev.jsonc`.
Only deploy to the shared worker (no `--name`) when explicitly told to promote.

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
