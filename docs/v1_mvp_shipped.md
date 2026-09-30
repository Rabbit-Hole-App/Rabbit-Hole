# v1 — MVP shipped (2026-09-04)

The SCOPE.md loop is closed: a Python app in a directory becomes a URL behind a
work-email login in one command, and the defining test passed — two users, two
sessions, one shared counter.

## What exists now

| Piece | Where | State |
|---|---|---|
| CLI `small` | npm **`small-deploy@0.0.1`** (`packages/cli`) | published, zero runtime deps |
| Guard proxy | `packages/runtime/guard.py` | baked into every image, stdlib only |
| Control plane | `packages/control-plane` → **https://small-cp.zeroshothq.workers.dev** | live (Cloudflare Worker + D1) |
| Containers | Fly Machines, remote builder, scale-to-zero | live (`small-counter-e3ce84` etc.) |
| Example | `examples/counter` | deployed at `/a/gmail-com/counter/` |
| Agent skill | `skills/small/SKILL.md` | written |
| Tests | `tests/` | 5 passing (unit + live integration) |

## Architecture (as built)

```
browser ── https://small-cp.zeroshothq.workers.dev/a/<org>/<app>/ ──┐
                                                                    │
             ┌─────────────── Cloudflare Worker (small-cp) ─────────┤
             │  session cookie? ──no──> /login (magic link)         │
             │  member/domain check (D1)                            │
             │  strip cookie, add X-Small-User/Org/Proxy ──────────>│
             │                                                      ▼
             │                              https://<flyapp>.fly.dev (Fly Machine)
             │                                guard.py on $PORT
             │                                  header secret ok? ──> app on :8090
             │                                  else 403
             └── /api/* (Bearer token) <── small CLI (login/deploy/share/list/logs)
                                              └── flyctl deploy --remote-only (build on Fly)
```

Deviations from SCOPE.md, chosen deliberately (see memory/small-deploy-decisions):

- **Path URLs, not subdomains** — no custom domain, so `/a/<org>/<app>/` on
  workers.dev instead of `<app>.<org>.small.app`. Consequence: apps must use
  relative URLs; the proxy rewrites absolute `Location` headers as a fallback.
- **flyctl remote builder, not local Docker** — no Docker on dev machines; the
  CLI shells out to `flyctl deploy --remote-only`. flyctl is the one binary dep.
- **Worker never calls the Fly API** — `/api/deploy` hands the CLI the org Fly
  token plus a generated app name and proxy secret; the CLI does all flyctl work.
  *(Superseded 2026-09-04: the worker now calls the Fly API itself — creates the
  app, allocates the IP, and mints a 1h app-scoped deploy token; the org-wide
  token never leaves the worker. See v2 doc.)*

## Auth model

- CLI: email → 8-digit code → HMAC-signed bearer token (no expiry — rotate
  MASTER_KEY to revoke).
- Browser: magic link → HMAC-signed session cookie (7 days). No session table.
- Org = email domain (`gmail.com` → `gmail-com`). `domain` visibility admits
  the whole domain; `private` admits owner + shared members only.
- Container: refuses everything without `X-Small-Proxy: <per-app secret>` — a
  leaked fly.dev URL answers 403.
- **Test instance**: SMALL_ENV `test` or `dev` + TEST_BYPASS_SECRET set, so when
  email can't be sent, login codes and magic links are echoed inline, and
  `/test/session` mints sessions for the integration tests. Any other SMALL_ENV
  (small-cp sets `production`) ignores the bypass secret; echo paths return 503.

## Daily commands

```
make deploy DIR=examples/counter      # deploy any app dir
make login / make logs / make share EMAIL=alice@gmail.com
make run-local DIR=...                # plain flask on :8000
make run-guarded DIR=...              # prod-like behind guard on :8080
make test-unit                        # guard proxy, no network, <1s
make test-integration                 # real deploy + wall/guard/shared-state, ~30s
make cp-deploy / make cp-tail         # control plane worker
make publish-cli                      # npm test + publish (bump version first)
```

Secrets/config live in root `.env` (gitignored): SMALL_API, SMALL_TEST_BYPASS,
FLY_API_TOKEN, NPM_TOKEN. CLI login state in `~/.small/config.json`.

## Test suite

- `tests/unit_tests/packages/runtime/test_guard.py` — guard 403/403/200 + POST
  body roundtrip against a stdlib echo app.
- `tests/integration_tests/examples/counter/test_app.py` — generates a Flask
  counter in a temp dir, deploys it with the **globally installed npm package**
  (app `itest-flask`), then asserts: entry detection printed, anonymous → 302,
  direct fly.dev origin → 403, and two bypass-token sessions see one counter.

## Known ceilings (marked `ponytail:` in code)

- No websockets/SSE through guard (full-buffer proxy) — streamlit interactive
  features won't work yet.
- ~~Org-wide Fly token is handed to any authenticated org member at deploy time~~
  *(fixed 2026-09-04: per-app 1h scoped deploy tokens, minted by the worker)*
- CLI tokens never expire; counter state is in-memory (single worker, resets on
  machine replacement).
- Colleague magic-link email needs a Resend account + verified domain.

## Hard-won environment notes

- Windows: `subprocess.run(..., encoding="utf-8")` or the CLI's `→` mojibakes;
  `node --test test/` (trailing dir) fails — use bare `node --test`.
- Cloudflare blocks python-urllib's default User-Agent (error 1010) — tests
  send a custom UA.
- npm publish with 2FA-less account: granular token with "bypass 2FA" ticked,
  fed via isolated `NPM_CONFIG_USERCONFIG` npmrc.
- flyctl lives at `~\.fly\bin\flyctl.exe` (installer's PATH symlink needs
  elevation); `lib/fly.js` falls back to that path automatically.

## v2 direction (not started)

Bring-your-own-cloud: same CLI, containers in the customer's AWS behind their
IdP — that is the business. Also: real domain + wildcard subdomains, Resend
domain for real emails, scoped Fly tokens, websocket passthrough.
