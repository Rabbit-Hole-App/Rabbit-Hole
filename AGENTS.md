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

## Deliver UI changes on the dev web app

Build features into an app in the existing Apps list, sidebar, and app interface
so the user can test them there. Never create a separate feature/demo page (such
as `/aws`) as the deliverable. Reuse the normal app tabs and panels; workspace
connection setup belongs in the existing Settings flow.

A request to add or change UI includes authorization to build and deploy it to
https://small-cp-dev.zeroshothq.workers.dev for the user's visual review.
Complete the dev deployment before reporting the UI change as done, and provide
the relevant dev page link. A local edit, build, commit, or push alone does not
finish a UI request. Do not wait for a separate deployment request.
Follow [the dev deployment steps](docs/features/coaching.md#deploy-dev).
Promotion to the live app still requires the user's explicit approval.

## What this is

small — deploy a Python app for your team, behind a work-email login, in one
command. Product truth: `docs/SCOPE.md` and `docs/PRODUCT.md`.

## What has been done so far

- `docs/v*.md` — one numbered file per shipped feature wave, in order, with
  the why. Read the highest-numbered few before changing anything substantial.
- `docs/features/<name>.md` — feature specs. Implement the spec; don't expand it.
- [Coaching UI and dev deployment](docs/features/coaching.md) — read and update when changing the Agent preview tabs, shared presentation helpers, or dev deployment.
- [AWS BYOC CPU-job MVP](docs/features/byoc-aws.md) — read and update when changing AWS installation, permissions, CLI routing, or the AWS app in dev.
- `git log` — commit messages carry the reasoning; they are the changelog.

## Live state (shared, be careful)

One live Cloudflare worker (`small-cp`), one D1 database (`small`), one npm
package (`small-deploy` + `small-skill`) are shared by every worktree and
every agent session. Never deploy the control plane from one branch's view
alone. `make test-unit` before every commit.

`small-cp-dev` uses the existing live control plane for app actions and real shared
data. Its AWS preview has a separate connection-metadata database and scoped AWS
installer credentials; job data stays in customer AWS. Sessions, Sources,
Capture, and Decisions remain sample UI enabled only in dev builds. Preserve
both dev build flags using the Coaching deployment steps above.
