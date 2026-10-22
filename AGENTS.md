# AGENTS.md

Read `CLAUDE.md` first and follow it exactly — layout, rules, and coding
guidelines all live there. This file only adds where the history is.

> **Production GO means a usable feature** (owner, 2026-10-21; full rule in
> [CLAUDE.md](CLAUDE.md#production-go-means-a-usable-feature)). A production GO covers deployment, activation and
> verification of the real production flow, without another routine GO. Deployed-but-disabled and
> enabled-but-unverified are incomplete, never "finished". Reconcile stale dev-only or default-off restrictions and
> docs; split a shared flag rather than enable unrelated experiments. Keep checks, permissions, allowance, spend
> policy and rollback; stop only for new authority (infrastructure, migrations, extra paid tests); never bypass a
> failing gate. Report SHA/build, activation state and evidence, and say so when signed-in access blocks verification.

## Confirm understanding before implementation

Follow [Scope and autonomy](CLAUDE.md#scope-and-autonomy) in `CLAUDE.md`. When a
request can mean different things in a way that materially affects scope or
behavior, briefly state your understanding and ask one concrete clarification
question before changing implementation files. Wait for the answer; do not
silently choose a different deliverable. An approved, unambiguous brief needs no
further confirmation or planning cycle.

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

Always make side panels resizable by dragging their edge. Reuse
`ResizableSidePanel` for inline right panels and `SlidePanel` for overlays;
preserve keyboard resizing and responsive bounds. Never add a fixed-width-only
desktop side panel.

Chat references use the existing neutral source-pill presentation, including
paper links. Do not introduce blue link text.

## Deliver UI changes on the dev web app

Use the user's verified subscription for all agent-run model tests and dev Learn
inference. Never use an API key, paid cloud provider, or paid fallback without
new explicit authorization. Check authentication before invoking a model; having
an API key in .env is not authorization to spend it. If subscription access is
unavailable or exhausted, stop and report it instead of switching providers.

Current explicit exception: the user authorized switching regular dev Learn back
to the paid Claude API after the subscription tunnel failed (2026-09-16).
This covers dev Learn inference and its focused end-to-end verification. Do not
extend that authorization to unrelated paid experiments or other environments.

Before recommending a test or saying a flow works, run the exact user-facing
scenario yourself against the intended deployed environment. For AI features,
verify the real model/tool path and inspect the result; mocked tests alone do
not establish that the feature works. If access or another dependency prevents
verification, state precisely what remains unverified instead of asking the user
to discover the failure. Preserve this rule across tasks and sessions.

A request to add or change UI includes authorization to build and deploy it to
your own isolated dev clone for the user's visual review, following
[Deploy rule for parallel sessions](CLAUDE.md#deploy-rule-for-parallel-sessions).
Complete the dev deployment before reporting the UI change as done, and provide
the relevant dev page link. A local edit, build, commit, or push alone does not
finish a UI request. Do not wait for a separate deployment request.
Shared preview and live promotion keep their established rules; live still
requires the user's explicit approval, and once given it covers activation and
production verification ([Production GO means a usable feature](CLAUDE.md#production-go-means-a-usable-feature)).

## What this is

small — deploy a Python app for your team, behind a work-email login, in one
command. Product truth: `docs/SCOPE.md` and `docs/PRODUCT.md`.

## What has been done so far

- `docs/v*.md` — one numbered file per shipped feature wave, in order, with
  the why. Read the highest-numbered few before changing anything substantial.
- `docs/features/<name>.md` — feature specs. Implement the spec; don't expand it.
- [Coaching UI and dev deployment](docs/features/coaching.md) — read and update when changing the Agent preview tabs, shared presentation helpers, or dev deployment.
- [AWS BYOC CPU-job MVP](docs/features/byoc-aws.md) — read and update when changing AWS installation, permissions, CLI routing, or the AWS app in dev.
- [Private AWS dev and live](docs/features/byoc-dev.md) — Amazon BYOC changes go
  to `small-private-byoc-dev` with separate test apps/data. Keep
  `small-private-byoc` and its drift/oof/overreach apps stable; live updates need
  explicit approval. Reuse the dev installation's identifiers for later updates.
- Amazon BYOC uses account **503561429929** in **us-east-1**, with the private
  AWS-hosted Small installation documented above. **637423432890 is personal;
  never use its credentials, installer, or trust principal for Amazon.** The
  verified `default` AWS profile is on the user's Amazon dev box, not Windows.
- `git log` — commit messages carry the reasoning; they are the changelog.

## Live state (shared, be careful)

For requested integrations on regular dev, the user approves installing their
provided API keys as server secrets on `small-cp-dev` (2026-09-17). Keep secret
values out of browser bundles, source control and logs. This does not authorize
live/BYOC promotion. Public browser SDK keys must follow that SDK's documented
usage; private provider credentials remain server-side.

One live Cloudflare worker (`small-cp`), one D1 database (`small`), one npm
package (`small-deploy` + `small-skill`) are shared by every worktree and
every agent session. Never deploy the control plane from one branch's view
alone.

Delete each worktree once its branch is merged to main (owner, 2026-10-21): confirm its head is an
ancestor of `rabbit-hole/main`, keep any uncommitted work that matters, stop only the processes your
task started, check that no other worktree's `node_modules` points into it, then `git worktree
remove` it and delete its local stack data and dev clone.

No gate for UI and copy changes (owner, 2026-10-21). A candidate that changes only web UI or copy
reuses the last passing gate: its gates note is `reuse <gated main sha>`. Reusable paths are
`packages/web/src/**`, `packages/web/test/**`, `packages/web/e2e/**` (not `production-bundle-check.mjs`),
`packages/web/public/**`, `docs/**` and root `*.md`, minus every file a Worker bundles (the
`workerGraph` of `scripts/dev-deploy.mjs`). A path naming credit, allowance, usage, motion, video, sign-in,
auth, login, oauth, billing or payment keeps the gate. Unit CI and the web build still run on the exact SHA. Server
code, money, sign-in, schema or migrations, config, dependencies and workflows keep the gate. A mixed
batch needs the gate. Check a diff with `notReusableBetween` in `scripts/dev-deploy.mjs`.

`small-cp-dev` uses the existing live control plane for app actions and real shared
data. Its AWS preview has a separate connection-metadata database and scoped AWS
installer credentials; job data stays in customer AWS. Sessions, Sources,
Capture, and Decisions remain sample UI enabled only in dev builds. Preserve
both dev build flags (the build in [Deploy rule for parallel sessions](CLAUDE.md#deploy-rule-for-parallel-sessions)).

## Deploy rule for parallel sessions

See [Deploy rule for parallel sessions](CLAUDE.md#deploy-rule-for-parallel-sessions)
in `CLAUDE.md` and [docs/features/parallel-dev-deploys.md](docs/features/parallel-dev-deploys.md).
Never run bare `wrangler deploy`.
