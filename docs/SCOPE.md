# small · MVP scope

## The problem, in one sentence

An engineer at a large company builds a small internal tool with an agent in twenty minutes,
and then cannot share it with three colleagues, because sharing means hosting, login, secrets
and a security review that nobody has time for. So the tool dies on a laptop.

## What we are building

A CLI called `small` that takes a Python app in the current directory and makes it reachable
by named colleagues, behind a login, in one command. Nothing else.

```
$ small deploy
✓ deployed → https://counter.acme-com.small.app
✓ login required · anyone @acme-com

$ small share alice@acme.com
✓ alice@acme.com can view counter
```

The colleague opens the link, enters their work email, clicks the link in their inbox, and is
looking at the tool. No ticket. No engineer.

## What we are NOT building in the MVP

- Databases, custom domains, crons, webhooks, billing, team admin
- Bring-your-own-cloud (deploying into the customer's AWS) — that is v2 and the real business
- Anything that is not Python
- A web dashboard. The CLI is the whole interface.

## The one test that defines done

Two people on different machines, one URL, one shared number. `examples/counter/app.py` already
exists and works locally. When two named users can click it through the deployed URL and both
see the same count, the MVP is done.

---

## Components

### 1. `packages/cli` — the CLI (Node, zero dependencies)

Commands:

| command | does |
|---|---|
| `small login` | email → 8-digit code → token stored in `~/.small/config.json` |
| `small deploy [--env .env]` | package the current directory, ship it, print the URL |
| `small share <email> [--edit]` | grant a person view or edit |
| `small list` | every app in the org |
| `small logs [app]` | recent container output |

App detection, in this order, and print what was chosen:

1. `small.toml` if present (`entry`, `framework`, `name`)
2. `--entry` flag
3. First `.py` file whose contents match a framework hint (`Flask(`, `FastAPI(`, `import streamlit`)
4. Filename convention: `app.py`, `main.py`, `server.py`
5. The only `.py` file in the directory
6. Otherwise fail with a message telling the user to add `entry = "app.py"` to `small.toml`

Framework decides the run command:

| framework | command |
|---|---|
| flask | `gunicorn --bind 0.0.0.0:$PORT --timeout 300 app:app` |
| fastapi | `uvicorn app:app --host 0.0.0.0 --port $PORT` |
| streamlit | `streamlit run app.py --server.port $PORT --server.address 0.0.0.0 --server.headless true` |
| script | `python app.py` |

`.env` is read for secrets. Secrets are sent to the control plane, never baked into the image.

### 2. `packages/runtime/guard.py` — the guard (Python, stdlib only)

A ~60-line reverse proxy baked into every image. It listens on `$PORT`, starts the user's app
on an internal port, and forwards requests **only** if they carry the header
`X-Small-Proxy: <per-app secret>`. Anything else gets a 403.

This is the security model. A container reached directly, without going through the auth
wall, answers nothing. Build this before the control plane; it is the piece that makes the
rest safe.

### 3. `packages/control-plane` — one Cloudflare Worker + D1

Three jobs:

**API for the CLI** — `/api/cli/login`, `/api/cli/verify`, `/api/deploy`, `/api/share`,
`/api/secret`, `/api/apps`, `/api/logs`. Bearer token auth.

**Auth wall for browsers** — on `*.small.app`: no session cookie → magic-link login page
(email in, signed link out via Resend); valid session → membership check → forward.

**Router** — `<app>.<org>.small.app` → look up the app's origin → forward the request with
`X-Small-User: <email>`, `X-Small-Org: <org>`, `X-Small-Proxy: <secret>`. Strip the session
cookie so the app never sees it.

Access rules:
- `domain` (default): anyone whose email is at the org's domain can view
- `private`: explicit members only
- owner and `edit` members can redeploy and share

Tokens and sessions are HMAC-signed JSON, no session table. Org = the email domain.

### 4. Where containers run

Fly Machines. One Fly app per small app, scale-to-zero, secrets as env vars, the guard's
proxy secret as `SMALL_PROXY_SECRET`. The control plane creates or updates the machine via
the Machines API and stores the resulting `https://<flyapp>.fly.dev` as the origin.

The CLI builds the image locally with Docker (generated Dockerfile in `.small/`, never shown
to the user) and pushes to a registry the control plane hands out credentials for at login.

### 5. `small.toml` — the contract

```toml
name = "counter"
entry = "app.py"
framework = "flask"

[deps]
file = "requirements.txt"
system = []              # apt packages if needed

[secrets]
required = []            # env var names the code reads; deploy fails if any are missing

[access]
visibility = "domain"    # domain | private
```

Only `entry` is required. An agent that builds a tool should write this file at the end.

### 6. `skills/small/SKILL.md`

Teaches a coding agent: when the user says "share this" or "deploy this", write `small.toml`,
run `small deploy --env .env`, print the URL, stop. This is how the CLI gets installed —
agents run it at the end of every tool they build.

---

## Build order

1. `guard.py` — test locally: start `examples/counter/app.py` behind it, curl with and without
   the header, confirm 403 vs 200.
2. CLI `deploy` up to "Dockerfile generated and image builds" — no network yet.
3. Control plane: login + deploy + router, against a Fly org and a test zone.
4. `share`, `list`, `logs`.
5. The two-machine counter test.

## Infrastructure the builder needs

- A Cloudflare zone (any domain will do for testing; `small.app` is the target)
- A Fly.io org and API token
- A Resend key for magic-link email
- An OCI registry (GHCR or Fly's registry) the CLI can push to

## Design rules

- The user never sees a Dockerfile, a Fly app, or a cookie.
- Every command prints what it decided (`✓ entry: app.py (flask)`) so a wrong guess is
  obvious in one line.
- Fail at deploy time, not at runtime: missing secrets, missing entry, unknown framework all
  stop the deploy with a one-line fix.
- No dependencies in the CLI. Node stdlib only.

## Why this exists

Val Town and Replit solve this for JavaScript on their infrastructure. Nobody solves it for
Python, and nobody solves it inside a company's own cloud. The MVP proves the loop on hosted
infrastructure; v2 moves the container into the customer's AWS with their IdP in front. That
second version is the one a large company can actually use, and it is the business.
