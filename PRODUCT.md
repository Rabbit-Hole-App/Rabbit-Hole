# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: an engineer at a large company who built a small internal Python tool
(often with a coding agent, in minutes) and needs named colleagues to reach it
behind a work-email login — without hosting, secrets plumbing, or a security
review. Secondary: those colleagues as viewers — they click a link, enter a
work email, click the magic link, and are in the tool.

Current stage: solo pre-launch. Only the founder deploys and tests with it; no
outside users yet.

## Product Purpose

`small` deploys a Python app from the current directory to a shared URL behind
a work-email login, in one command. Success = two people on different machines,
one URL, one shared state, no ticket, no infra work.

## Positioning

Val Town / Replit solve share-a-small-tool for JavaScript on their infra.
Nobody solves it for Python, and nobody solves it inside a company's own cloud.
v1 proves the loop on hosted infra (Fly Machines + Cloudflare Worker control
plane); BYO-AWS (deploying into the customer's cloud) is the long-term business.

## Operating Context

- User works in a terminal, usually alongside a coding agent that wrote the
  tool; the agent can also run `small deploy` at the end (skills/small/SKILL.md).
- Apps run on Fly Machines behind `guard.py`; a Cloudflare Worker + D1 is the
  control plane and auth wall (magic-link login via work email).
- Shipped feature waves are recorded in `docs/v1_*.md` … `docs/v6_*.md`
  (MVP, websockets/gradio, BYO-AWS, deploy review, jobs/`small run`, SQLite
  storage volumes).

## Capabilities and Constraints

- Commands: login, init, deploy, run, runs, share, list, logs, review.
- App shapes: flask / fastapi / streamlit / gradio servers, `kind = "job"`
  one-shot scripts, persistent `[storage]` volumes with SQLite.
- Every command prints what it decided (`✓ entry: app.py (flask)`); fail at
  deploy time, not runtime, with a one-line fix.
- The user never sees a Dockerfile, a Fly app name, or a session cookie.
- CLI is Node stdlib only (zero dependencies); runtime is Python stdlib only.
- **Web dashboard is now in scope** (relaxes SCOPE.md's "the CLI is the whole
  interface"). Built step by step, in this order:
  1. See deployed pipelines (the org's apps and their runs/status).
  2. Share — grant a colleague access from the dashboard.
  3. Start/run button — trigger a job run from the dashboard.
  Dashboard stack/serving undecided — record the decision when it is built.
  Existing browser surfaces: the magic-link login page served by the Worker,
  and the deployed apps themselves.
- URLs are workers.dev path-style for now; custom domain undecided, not binding.

## Brand Commitments

- Name: lowercase `small` (npm package `small-deploy`) — fixed.
- Voice: terse, one-line, `✓`-prefixed, decision-visible output — the product
  voice everywhere, including any future web UI.
- Dashboard UI: similar to Notion's UI — its interface feel, color, and
  layout are the reference (user-set, binding).
- No committed domain or logo; visual identity otherwise open within the
  Notion-like direction above.

## Evidence on Hand

- Working examples under `examples/` (counter with SQLite persistence,
  s3-log-writer job, gradio/yolo, websockets) — real, deployable, tested live.
- Unit + integration test suites (`tests/`), feature docs `docs/v1–v6`.
- No users, testimonials, metrics, logos, or press — do not fabricate any.

## Product Principles

1. One command, one line of output per decision — a wrong guess must be
   visible at a glance.
2. Fail at deploy time with a one-line fix, never at runtime.
3. Hide the infrastructure: no Dockerfiles, Fly names, or cookies in view.
4. Attribution and access ride the work email — org = email domain.
5. Smallest possible surface: stdlib-only CLI/runtime, features earn their way
   in via a spec in `docs/features/`.
