# AGENTS.md

Read `CLAUDE.md` first and follow it exactly — layout, rules, and coding
guidelines all live there. This file only adds where the history is.

## What this is

small — deploy a Python app for your team, behind a work-email login, in one
command. Product truth: `docs/SCOPE.md` and `docs/PRODUCT.md`.

## What has been done so far

- `docs/v*.md` — one numbered file per shipped feature wave, in order, with
  the why. Read the highest-numbered few before changing anything substantial.
- `docs/features/<name>.md` — feature specs. Implement the spec; don't expand it.
- `git log` — commit messages carry the reasoning; they are the changelog.

## Live state (shared, be careful)

One live Cloudflare worker (`small-cp`), one D1 database (`small`), one npm
package (`small-deploy` + `small-skill`) are shared by every worktree and
every agent session. Never deploy the control plane from one branch's view
alone. `make test-unit` before every commit.
