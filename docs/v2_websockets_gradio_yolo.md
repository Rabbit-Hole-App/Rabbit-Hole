# v2 — websockets, gradio, first ML app (2026-09-04)

v1 proved the loop with a Flask counter. v2 proves the platform carries a real
workload: a YOLOv8n object-detection app on Gradio, deployed with the same one
command, behind the same wall. Everything below is live and tested.

## What was built

| Piece | Change |
|---|---|
| `packages/runtime/guard.py` | Websocket passthrough: after the `X-Small-Proxy` check, `Upgrade: websocket` requests are replayed to the app and then tunneled as raw bytes both ways (two stdlib pump threads). Plain HTTP path unchanged. |
| CLI (`small-deploy@0.0.3` on npm) | Gradio framework support: detect hint (`import gradio`), runner `GRADIO_SERVER_NAME=0.0.0.0 GRADIO_SERVER_PORT=$PORT python <entry>`. Top-level `system = [...]` in small.toml → apt-get layer in the Dockerfile; top-level `memory = "2GB"` → fly.toml vm memory. 0.0.3 also sets `GRADIO_ROOT_PATH` (see issues). |
| `examples/yolo-gradio` | Image upload → image with boxes drawn + detections JSON. `yolov8n.pt` (6.5 MB) committed and baked into the image; CPU-only torch via `--extra-index-url https://download.pytorch.org/whl/cpu`. |
| `run.sh` / `Makefile` | Framework-aware `run-local` / `run-guarded` (read `framework` from the dir's small.toml), so `make run-local DIR=examples/yolo-gradio` just works. Dead cookiecutter targets removed. Workflow: test locally from `examples/` first, then `make deploy`. |
| Tests | `test_guard_ws.py` — hand-rolled RFC 6455 handshake + masked frame echo through the guard, plus 403-without-header on the upgrade request. `tests/integration_tests/examples/yolo-gradio/test_app.py` — uploads bus.jpg through the wall (`gradio_api/upload` → `call/predict` → SSE), asserts ≥1 box. Suite: 8 tests, all green. |

## The three numbers (shared-cpu-1x, CPU inference)

- **Image size: 532 MB** (python:3.13-slim + CPU torch + ultralytics + gradio + weights)
- **Cold start: ~30 s** from wake-triggering request to first 200 (measured 19.5–30.0 s across boots; Fly answers 502 while gradio+torch import)
- **Minimum memory: 1024 MB** — at 512 MB the kernel OOM-kills python during model load (`code 137`, confirmed in machine logs). small.toml stays at 2 GB for headroom.

Warm inference through the wall: ~9 s for bus.jpg (1 bus + 4 persons, conf 0.33–0.87).

## Issues hit and how they were resolved

1. **Gradio UI rendered as an unstyled skeleton through the proxy.** All top-level
   assets returned 200, but gradio builds every runtime URL (component chunks,
   fonts, API) from `config.root`, which it derives from the Host header — and the
   guard rewrites Host to `127.0.0.1:8090`. The browser was fetching chunks from
   localhost. Fix: gradio accepts a full URL in `GRADIO_ROOT_PATH` and uses it
   verbatim; the CLI knows the public URL at deploy time and now sets it as a Fly
   secret for gradio apps (0.0.3). Live app patched the same way.
2. **502 Bad Gateway on first visit after idle.** Scale-to-zero + 30 s boot means
   Fly 502s until the app listens. A worker-side fix (hold GET/HEAD and retry up
   to ~45 s during wake) is written in `packages/control-plane/src/index.js` but
   **not yet deployed or committed** — pending decision.
3. **venv pytest broke: `No module named 'tests.fixtures'`.** The ultralytics
   wheel installs a top-level `tests` package into site-packages, and a regular
   package beats our namespace `tests/` during import. Fix: `tests/__init__.py`
   (regular package at cwd wins) + `--import-mode=importlib` in pyproject, which
   also allows the two `test_app.py` files and hyphenated example dirs.
4. **`make` failed from PowerShell: `CreateProcess(NULL, bash ...) failed`.**
   bash is not on the PowerShell PATH. The Makefile now derives it from git's
   install dir on Windows (`...\Git\cmd\git.exe` → `...\Git\bin\bash.exe`).
   Known ceiling: breaks if git lives under a path with spaces — set `BASH=` then.
5. **`run-guarded` ran the flask branch for gradio dirs.** The
   `$(_app-run-cmd "$dir")` substitution was evaluated *after* `cd "$dir"`, so a
   relative DIR resolved against itself and small.toml wasn't found. Fix: compute
   the command before entering the subshell.
6. **`.env` `FLY_API_TOKEN` is unauthorized for machine operations** (stop,
   update, secrets). Workaround used everywhere: fetch the working org token from
   the control plane the same way the CLI does (`GET /api/logs?app=...`). The
   .env value should be replaced with a current token.
7. **512 MB OOM diagnosis**: the page still loaded at 512 MB (gradio serves), but
   uploads 502'd — the OOM kill happens under inference load, not at boot.
   Lesson: memory-floor tests must exercise inference, not just the front page.

## Deviations / skipped (ponytail)

- SSE through the guard is still full-buffered — works because gradio closes each
  event stream after the result; true streaming needs a chunked proxy path.
- `/manifest.json` (PWA) 302s through the wall — cosmetic, ignored.
- No S3, no GPU, no volumes — per scope. Counter state and uploaded files are
  ephemeral per machine.
- Websocket passthrough is guard-side only. The Cloudflare worker proxies
  gradio 6 fine because it uses SSE + HTTP, not websockets, for inference. A
  websocket-heavy app (streamlit) additionally needs the worker to speak
  websocket upgrade — not built yet.

## Current state

- Live: https://small-cp.zeroshothq.workers.dev/a/gmail-com/yolo-gradio/
- npm: `small-deploy@0.0.3` · Fly app: `small-yolo-gradio-b64146` (2 GB)
- Suite: `make test` — 8 pass (~40 s, includes a real Flask deploy and live YOLO inference)
- Commits: `a1bcdd6` (ws + gradio + example), `2528744`/`5b6ea57` (pyproject, trim),
  `83b89f6` (framework-aware run), `48044e8` (Makefile bash), `ed0e0e0` (root path, 0.0.3)

## v3 candidates

~~Deploy the worker cold-start hold~~ (done); websocket upgrade in the worker
(streamlit); ~~scoped per-app Fly deploy tokens~~ (done); real domain + Resend
for outside-org sharing; persistent volume or object storage for apps that keep
files.

## Addendum (2026-09-04, later): scoped Fly tokens shipped

The org-wide-token ceiling is closed. New flow (CLI `0.0.4`, worker redeployed):

- `/api/deploy` no longer returns the org token. The worker itself creates the
  Fly app (Machines API `POST /v1/apps`), allocates the shared IPv4 (GraphQL
  `allocateIpAddress`, idempotent), and mints a **deploy token scoped to that
  one app, expiring in 1 hour** (GraphQL `createLimitedAccessToken`, profile
  `deploy`, `profileParams.app_id`). `/api/logs` mints the same way.
- The CLI dropped `flyctl apps create`; it still shells out to flyctl for
  build+deploy — this is the documented **fallback path**. The primary path
  (worker builds from an uploaded tarball) is not workable: Fly has no
  build-from-tarball REST endpoint; remote builds speak the Docker/BuildKit
  wire protocol to a builder machine, which a Cloudflare Worker cannot.
- Credential note: minting limited tokens requires the **user auth token**
  (`flyctl auth token`) — org tokens from the dashboard get UNAUTHORIZED on
  `createLimitedAccessToken` (verified empirically). That token lives only in
  `.env` and the worker secret.
- New tests: `~/.small/config.json` and deploy stdout contain no `FlyV1`/`fm2_`;
  the returned token lists its own app's machines (200) but 403s on another
  app's. Worker fails closed (502) if minting breaks.
- Old CLIs (≤0.0.3) break against the new worker (they call `flyctl apps create`
  with a token that can't) — upgrade with `npm i -g small-deploy`.
