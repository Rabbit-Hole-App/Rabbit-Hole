# AGENTS.md

Read `CLAUDE.md` first and follow it exactly — layout, rules, and coding
guidelines all live there. This file only adds where the history is.

## Confirm understanding before implementation

Ask questions to confirm that you understand the user's intended result and scope.
When a request can mean different things, briefly state your understanding and ask
one concrete clarification question before changing implementation files. Wait for
the answer; do not silently choose a different deliverable.

For "UI only", confirm whether the user wants a visual mockup, an interactive
preview, or changes to the existing app interface. Do not add parsing, ingestion,
model calls, backend integration, or persistence unless explicitly requested.
Once scope is confirmed, work within it without repeatedly asking for the same
approval. If the scope would change, stop and confirm the new understanding first.

Preserve existing UI elements and flows. Ask the user for permission before
removing or replacing any existing UI unless they explicitly requested that
removal or replacement. Adding a feature does not authorize removing prior UI.

Reuse existing UI components and helpers for common presentation, including code
highlighting and enlarged page layouts. Extend the shared template rather than
creating a separate design for each tab.

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
