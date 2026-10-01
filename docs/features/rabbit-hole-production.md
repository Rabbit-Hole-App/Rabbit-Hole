# Rabbit Hole production (prepared, not created)

Status 2026-10-01, branch `infra/rabbit-hole-production-prep`. Nothing in this document has been run.

Each of these steps needs the owner's explicit GO:
- creating Workers, D1 databases or buckets;
- setting secrets or restarting Fly;
- deploying;
- changing DNS;
- attaching the domain.

Dev is described in [rabbit-hole-dev.md](rabbit-hole-dev.md). Production `small-cp` (`packages/control-plane/wrangler.jsonc`) is the legacy hosted-apps product and is not part of this.

## Topology: one public origin, two Workers

```
browser ── https://digrabbithole.com ──▶ rabbit-hole-app  (packages/web/app-worker.js, public, custom domain)
                                            │ Landing, /sign-in, /apps, Learn, Tutor, repositories, media,
                                            │ the three Durable Objects, every /api/learn* route
                                            └─ CONTROL_PLANE service binding ─▶ rabbit-hole-cp
                                                (packages/control-plane/src/index.js, no route, no workers.dev)
                                                /auth/*, /auth/session, /login POST, /logout, /api/cli/*,
                                                /api/me, workspaces, members, threads
notebook iframes ─▶ rabbit-hole-notebook / rabbit-hole-canvas-notebook (*.tryrabbithole.workers.dev, static)
```

**Why two Workers.** The code already splits this way:
- `packages/web/dev-worker.js` is its own entry. It holds every Learn route and the `LearnVideos`, `LearnScenes` and `RepositoryImports` Durable Objects.
- It learns who is signed in from the control plane over `CONTROL_PLANE` (`GET /api/me`, `dev-forwarding.js` `devIdentity`).
- The control plane owns auth and sessions (`MASTER_KEY`).

Merging them into one Worker would be new architecture.

**Why one origin still works.**
- **Cookie.** The session cookie has no `Domain` attribute (`auth.js` `setCookie`), so it stays on whichever host served it.
- **Request URL.** The app forwards the original `Request` through the binding. The control plane therefore sees `https://digrabbithole.com/...`, builds its OAuth `redirect_uri` and magic links from that origin, and passes its CSRF origin check. No auth URL is rewritten to an internal host (`test/rabbit-hole-app-worker.test.js` checks the exact URL that crosses).
- **`PUBLIC_ORIGIN`.** Both production configs set `PUBLIC_ORIGIN=https://digrabbithole.com`; the control plane keeps `BASE_URL` (cron run links) too. No code on this branch reads it. On `origin/feature/rabbit-hole-production-auth`, `auth.js` `handleWebAuth` reads it: a sign-in route reached on any other host redirects there (a POST gets 403), and `GET /login` goes to `/sign-in`. Its `baseUrl` comes from the request URL, which is the public one, so on production nothing redirects. Dev and local Workers leave it unset.
- **Same-origin calls.** There is no CORS anywhere; the SPA calls relative `/api`.
- **Private control plane.** `rabbit-hole-cp` is not public. Its own `/` would serve the older `dist` shell, and a second public host would mint cookies the app never sees.

**Production entry.** `packages/web/app-worker.js` reuses `dev-worker.js` unchanged, so a route added for dev (for example Voice's `/api/learn/voice/*`) also ships to production.
- Its only differences:
  - `ownControlPlane(env)` marks the binding as this deployment's own control plane, so the P0-B barrier passes sign-in and writes through instead of returning 403;
  - `GET /login` redirects to `/sign-in` with the query string kept;
  - `/a` and `/a/*` get a bare 404 and never reach the control plane (see Untrusted content below).
- **`/` is Landing.** `dev-worker.js` answers `/` with Landing for every method before any fall-through, so the control plane's legacy `/` → `/apps` 302 is unreachable. `test/rabbit-hole-app-worker.test.js` pins it: GET and HEAD `/` are Landing and `CONTROL_PLANE` is never called.
- Only code can set that mark, not config. The dev configs keep `main: dev-worker.js`, pinned by `test/rabbit-hole-prod-config.test.js`.

**Barrier fix found during this prep.** On a deployed service binding every property name reads as an RPC method stub, so the old `binding.guarded` check was always truthy (verified under `wrangler dev`). `guardControlPlane` therefore left module-level `CONTROL_PLANE` calls unwrapped on the live dev worker; the `fetch()` fall-through was unaffected. Wrappers are now tracked in a `WeakSet` (`test/dev-barrier.test.js`).

### Routes

| Path | Served by | Notes |
|---|---|---|
| `/`, `/blog`, `/features`, `/pricing`, `/manifesto`, `/team`, `/docs*`, `/privacy`, `/terms`, unknown pages | app | Bundled Landing pages; HTML 404 page |
| `/sign-in`, `/sign-up`, `/check-email` | app | Landing auth page; its JS calls `/auth/*` |
| `/login` (GET, HEAD) | app | 302 to `/sign-in?<same query>`. Auth errors, logout and the SPA's 401 handler all land here. |
| `/apps`, `/apps/*`, `/library`, `/explore`, `/b/<token>`, `/dash`, `/chat`, `/members` | app | SPA shell (`dist-dev/index.html`) |
| Learn: `/api/canvases*`, `/api/learn/*`, `/api/learn/boards/*`, `/api/learn/grade*`, `/api/profile`, `/api/learn/context*` | app | `/dive` is a slash command persisted through `/api/canvases/dives` |
| Tutor: `/api/learn/tutor/{evaluate,plan}` | app | `learn-tutor-routes.js` |
| Voice: `/api/learn/voice/*` | app | Once `feature/voice-tutor-mvp` merges into `dev-worker.js`; needs `ELEVENLABS_API_KEY` and `FISH_AUDIO_API_KEY` |
| Repository import: `/api/repositories*`, `/api/apps/repo-*` | app | Needs the indexer (below) |
| Media: `/api/learn/media` | app | `LEARN_MEDIA` |
| `GET /api/apps` | app | Canvases and repositories only |
| `/auth/{google,github}/start`, `/auth/{google,github}/callback`, `/auth/email/start`, `/auth?token=`, `/auth/session`, `POST /login`, `/logout` | cp, through the app | Callbacks to register: `https://digrabbithole.com/auth/google/callback` and `https://digrabbithole.com/auth/github/callback` |
| `/api/cli/login`, `/api/cli/verify`, `/api/me`, `/api/workspaces*`, `/api/members`, `/api/ask/threads*`, other `/api/*` | cp, through the app | |
| `/test/*` | cp | Dead: `SMALL_ENV=production`, and no test secret is set |
| `/a`, `/a/*` | app | Plain-text 404, `Cache-Control: no-store`, no cookie, no CORS. Never forwarded (below). |
| `/slack/*`, run and deploy APIs | cp | Legacy hosted-app features; they answer 503 without Fly, RUNS or Slack secrets |

### Untrusted content on the public origin

A response on `https://digrabbithole.com` that runs someone else's script is same-origin with the session cookie and can call `/api/*` as the signed-in person.

**`/a/*` is blocked.** It is the control plane's hosted-app proxy (`index.js` `proxyApp`), which serves deployed apps' own HTML and JS unsandboxed. `app-worker.js` answers `/a` and `/a/*`, any method, with a plain-text 404 before anything reaches `CONTROL_PLANE`. `test/rabbit-hole-app-worker.test.js` checks that the response has no app HTML or JS, no `Set-Cookie` and no CORS header, and that the binding received nothing.

If hosted apps ever ship on Rabbit Hole, they move to a separate *site*, such as a dedicated Worker on `*.workers.dev`. They never go on a `*.digrabbithole.com` subdomain, which is same-site and gets the `SameSite=Lax` cookie. Nothing may send credentialed CORS back to the app.

**The other routes that return user or stored content:**

| Route | Content | Decision |
|---|---|---|
| `/api/runs/<id>/outputs/<name>` (`index.js` `apiRunOutputGet`) | Files a hosted run wrote; `.html` is `text/html` | Isolated. HTML gets `Content-Security-Policy: sandbox allow-scripts`, with no `allow-same-origin`, so it runs in an opaque origin, with no cookie and no same-origin `/api` read. No SVG type. Also unreachable: production binds no `RUNS`, so it answers 404. |
| `/api/runs/<id>/inputs/<name>` | Run inputs | `application/octet-stream` (downloaded, never rendered); production has no `RUNS` |
| `/api/apps/<app>/s3-object` | Customer S3 preview | Images, PDF, JSON, text and CSV only, `nosniff`; no HTML or SVG. Needs AWS keys production does not set. |
| `/api/learn/boards/<id>/assets/<key>` (`learn-boards.js`) | Board files people upload | Isolated. `sandbox; default-src 'none'`, `Content-Disposition: attachment`, `nosniff`; the stored type is limited to images, PDF, video, audio and a cached-string type, never HTML or SVG. |
| `/api/learn/media` (`learn-board.js` `mediaFetch`) | Uploaded images | Bytes are sniffed on upload: PNG, JPEG or WebP only; `nosniff` |
| `/api/learn/paper` | Uploaded or arXiv PDFs | `application/pdf` with `nosniff`. Browsers render PDF in their own viewer, which runs no script with the page origin; a `sandbox` CSP would break Chrome's viewer. Not blocked. |
| `/api/learn/video`, `/api/learn/scene` | Generated MP4, glTF | Fixed media types, `nosniff` |
| `/b/<token>`, `/apps/*` | Shared boards and canvases | The first-party SPA shell renders the stored JSON; no stored file is served as a page |
| Notebook iframes | Notebook Python and JS | Already on separate `*.workers.dev` sites (Notebooks below) |

So `/a/*` is the only route that is blocked.

## Resources

| Kind | Name | Bound by | Built from |
|---|---|---|---|
| Worker | `rabbit-hole-app` | — | `packages/web/wrangler.rabbit-hole-prod.jsonc` |
| Worker | `rabbit-hole-cp` | app `CONTROL_PLANE` | `packages/control-plane/wrangler.rabbit-hole-prod.jsonc` |
| D1 `DB` | `rabbit-hole-prod` | app, cp | `bootstrap.sql`, then `migrations/` 0001–0027 |
| D1 `LEARN_DB` | `rabbit-hole-learn-prod` | app, cp | `repository-schema.sql` (already includes `learn-migrations/0001–0003`) |
| R2 `LEARN_MEDIA` | `rabbit-hole-prod-learn-media` | app, cp | — |
| R2 `REPOSITORY_SNAPSHOTS` | `rabbit-hole-prod-repositories` | app, cp | — |
| Durable Objects | `LearnVideos`, `LearnScenes`, `RepositoryImports` (SQLite; tags `learn-videos-1`, `learn-scenes-1`, `repository-imports-1`) | app | Created on the first deploy |
| Static Workers | `rabbit-hole-notebook`, `rabbit-hole-canvas-notebook` | iframes | `.small/notebook-site`, `.small/canvas-notebook-site` (see Notebooks) |

**Not needed:**
- **Hosted apps:** `RUNS`, Fly tokens, crons and Slack. These are the legacy hosted-apps product.
- **KV:** nothing uses it.
- **`AI`, Vectorize and Queue:** guarded, so Learn falls back to the cold path.
- **Test secrets:** `TEST_BYPASS_SECRET`, `SMALL_TEST_BYPASS` and `OAUTH_MOCK` must never be set on production.

**Owner decisions:**
- **BYOC.** `BYOC_DB` plus the AWS keys. The UI hides AWS Connection on a 503, so leaving them unbound is safe.
- **Moment log.** `learn_moments` is in the main DB (0027) but not in `repository-schema.sql`. With `LEARN_DB` bound, `learnMomentsDb` picks `LEARN_DB`, so the video-moment log stays off until a `learn-migrations/0004` adds it. That is the same as dev today.
- **Preview restrictions.** Every Rabbit Hole build (`learnPreview`) also ships them: `/chat` and `/members` redirect, and the browser refuses writes outside Learn (`flags.js`, `api.js`).
  - Landing, `/sign-in`, `/sign-up`, `/check-email`, and the support and docs pages no longer need the flag. `vite.config.js` emits them in every build except private BYOC (`src/landing/public-pages-build.test.mjs`).
  - The legacy `dist` build carries them too, under `dist/design/`. `small-cp` serves none of them: it bundles only `index.html` and passes just `/static/*` and the icons to `ASSETS`.
  - **Learn UI flag.** Production builds with `VITE_RABBIT_HOLE=true`, which turns on Rabbit Hole (`learnPreview`, the Learn,
    Home and canvas chunks) and nothing else. `VITE_COACHING_DEV=true` stays the dev/review build: the same app plus the dev-only
    tools (coaching dev panel, review fixtures, the canvas lesson-block workbench, dev palette items, the supplied nanoGPT course).
    `node e2e/production-bundle-check.mjs` (packages/web, after the production build) fails if the Learn chunks are missing or
    any dev-only tool shipped.
  - **Open (owner):** the supplied nanoGPT course (`LearnPage.jsx`) is still dev-only, so production `karpathy/nanoGPT` gets the
    generated course, not the supplied one.
- **Data.** Should anything carry over from legacy `small` (users, workspaces, `learn_courses`)? The default is a fresh start. No Rabbit Hole canvas or board data exists in `small`.

### Secrets

| Worker | Required | Optional |
|---|---|---|
| `rabbit-hole-cp` | `MASTER_KEY` (fresh), `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | `RESEND_API_KEY` with an `EMAIL_FROM` var on a verified domain (target `digrabbithole.com`, sender `Rabbit Hole <signin@digrabbithole.com>`, not configured) (email sign-in), `ANTHROPIC_API_KEY` |
| `rabbit-hole-app` | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY`, `DESMOS_API_KEY`, `PEXELS_API_KEY`, `EXA_API_KEY`, `FISH_AUDIO_API_KEY`, `ELEVENLABS_API_KEY` (Voice), `FAL_API_KEY` with the vars `LEARN_VIDEO_PROVIDER` and `LEARN_VIDEO_RESOLUTION` (video; dev uses `fal-seedance-lite`, `480p`), `SCENE_WORKER_URL` var + `SCENE_WORKER_TOKEN` (indexer) |

### Repository-import indexer

Repository import calls the lesson-renderer Fly app with a shared bearer `SCENE_WORKER_TOKEN` ([learn-repositories.md](learn-repositories.md#indexer-credential-scene_worker_token)).
- Production has no indexer yet. Without one, import answers 503 "Repository import is unavailable because the indexing service is not configured on this server." and writes nothing.
- Shipping it means a production renderer app, for example `rabbit-hole-lesson-renderer`, deployed from `packages/lesson-renderer`. It must have its own token, set on that Fly app and on `rabbit-hole-app` from one generated value.

## Production bootstrap (NOT RUN)

Run from `packages/control-plane`, with the rabbit-hole `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` loaded.
1. Run the local check first: `node --test test/migrations-bootstrap.test.js`.
2. Create the resources and the schema:

```bash
# --config keeps wrangler off wrangler.jsonc (legacy small-cp). Answer "no" if it offers to add the binding to a config.
npx wrangler d1 create rabbit-hole-prod --config wrangler.rabbit-hole-prod.jsonc
npx wrangler d1 create rabbit-hole-learn-prod --config wrangler.rabbit-hole-prod.jsonc
npx wrangler r2 bucket create rabbit-hole-prod-learn-media --config wrangler.rabbit-hole-prod.jsonc
npx wrangler r2 bucket create rabbit-hole-prod-repositories --config wrangler.rabbit-hole-prod.jsonc
# Replace the four PENDING-* database_id values in both wrangler.rabbit-hole-prod.jsonc files with the printed ids
# (rabbit-hole-prod-config.test.js keeps the names; a PENDING id refuses to deploy).

# Main D1, brand-new database only: bootstrap first (apps + members predate 0001), then every migration.
npx wrangler d1 execute rabbit-hole-prod --remote --config wrangler.rabbit-hole-prod.jsonc --file bootstrap.sql
npx wrangler d1 migrations apply rabbit-hole-prod --remote --config wrangler.rabbit-hole-prod.jsonc
# Learn D1 (additive, re-runnable).
npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --file repository-schema.sql
# Check: expect "No migrations to apply!"
npx wrangler d1 migrations list rabbit-hole-prod --remote --config wrangler.rabbit-hole-prod.jsonc
```

**Migration order** (locked; never renumber or reuse):
- 0001–0023;
- `0024-learn-courses`;
- `0025-cli-login-challenges`;
- `0026-users`;
- `0027-learn-moments`.

Prefix 0001–0003 each have two files. Wrangler and the test both sort by full filename, so the order is fixed.

3. Build first. `src/index.js` imports `../../web/dist/index.html` and `dev-worker.js` bundles `dist-dev`, and both directories are gitignored. A clean checkout fails to bundle; a dirty one ships a stale page.

```bash
cd ../web
# The production Rabbit Hole build: never VITE_COACHING_DEV (dev-only tools) or VITE_BYOC_DEV.
export VITE_RABBIT_HOLE=true
export VITE_NOTEBOOK_ORIGIN=https://rabbit-hole-canvas-notebook.tryrabbithole.workers.dev
export VITE_LESSON_NOTEBOOK_ORIGIN=https://rabbit-hole-notebook.tryrabbithole.workers.dev
export VITE_TLDRAW_LICENSE_KEY=<from root .env - never print it>
npm run build && npm run build -- --outDir dist-dev
node e2e/production-bundle-check.mjs    # Learn app in, dev-only tools out
```

4. Deploy the control plane before the app, so the app's binding resolves. Set each Worker's secrets (table above) after its first deploy, piping every value into `wrangler secret put` from that Worker's own directory:

```bash
cd ../control-plane
npx wrangler deploy --config wrangler.rabbit-hole-prod.jsonc                                    # rabbit-hole-cp
printf '%s' "$VALUE" | npx wrangler secret put MASTER_KEY --config wrangler.rabbit-hole-prod.jsonc  # and the rest of its row
cd ../web
npx wrangler deploy --config wrangler.rabbit-hole-prod.jsonc                                    # rabbit-hole-app, attaches digrabbithole.com
printf '%s' "$VALUE" | npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.rabbit-hole-prod.jsonc  # and the rest of its row
```

The zone is active (see digrabbithole.com below), so the app deploy can attach the domain. To smoke-test before cutover, deploy once with the route removed and `workers_dev: true`. OAuth would then need that host's callbacks registered too.

**Hazard.** `make cp-deploy` / `make web-deploy` (`run.sh`) runs a bare `wrangler deploy` of `wrangler.jsonc`, which is legacy `small-cp`. Never use them for Rabbit Hole.

## digrabbithole.com

Canonical production domain, bought inside the Rabbit Hole Cloudflare account (owner decision 2026-10-01). `tryrabbithole.dev` is no longer the production origin (see Legacy below).

**Zone state, read-only API check 2026-10-01:**
- Zone `ff5791fb6665b929a46acbb6cfd4ec27`, **active**, full setup, Free plan, in account `rabbit-hole` (`c08d3dbdc53a3afd3cb09a536ac42318`).
- Assigned nameservers: `addilyn.ns.cloudflare.com`, `robert.ns.cloudflare.com`. Public NS (`nslookup -type=NS digrabbithole.com 1.1.1.1`) returns the same two, so delegation matches.
- The zone's permission list for the current token shows `#zone:read` and `#dns_records:read` but no DNS, redirect-rule or zone edit permission (only Workers, D1, R2 and Vectorize edit). Nothing was changed.

**Domain plan:**
- Apex `https://digrabbithole.com` is canonical: a custom domain on `rabbit-hole-app`.
- `https://www.digrabbithole.com/*` answers 301 to `https://digrabbithole.com/*`, path and query preserved.
- OAuth callbacks: `https://digrabbithole.com/auth/google/callback` and `https://digrabbithole.com/auth/github/callback`.
- Resend: target domain `digrabbithole.com`, suggested sender `Rabbit Hole <signin@digrabbithole.com>`. **Not configured**; it needs separate approval.

**Steps (each needs the owner's GO; the zone is already active):**
1. **Apex.** The app config's `routes: [{ "pattern": "digrabbithole.com", "custom_domain": true }]` creates the DNS record and certificate on deploy. A custom domain cannot be added over an existing CNAME.
2. **`www` is not canonical.** Add a proxied `A www 192.0.2.0` placeholder record. Then add a Single Redirect from the "Redirect from WWW to root" template: `https://www.*` to `https://${1}`, status 301, query string preserved. To perform steps 1 and 2 the token needs Zone DNS Edit, Workers Routes Edit and Single Redirect Edit (env var `CLOUDFLARE_API_TOKEN` for the rabbit-hole account).
3. **Checks.** In the dashboard, check Always Use HTTPS, HSTS and minimum TLS (unknown today because the token cannot read zone settings).
4. **OAuth.** Register the two callbacks above with Google and GitHub.

**Legacy: `tryrabbithole.dev`.** Not a launch blocker. Its zone is stuck pending (`ns_mismatch`) because the domain's registrar and delegation sit in another Cloudflare account. Later: move it into the Rabbit Hole account and 301-redirect it to `https://digrabbithole.com`. No production config names it, and `rabbit-hole-prod-config.test.js` pins that.

## Notebooks

The notebook iframes use `sandbox="allow-scripts allow-same-origin"`, so only a separate *site* keeps notebook Python away from the session.
- Host them on `*.tryrabbithole.workers.dev` and not on a `digrabbithole.com` subdomain: a subdomain is same-site, so the `SameSite=Lax` cookie would ride along. `workers.dev` is a different registrable domain from digrabbithole.com, so notebooks are cross-site and the same-site cookie concern does not apply.
- `workers.dev` is on the Public Suffix List (checked 2026-10-01), so each `*.workers.dev` host is its own site.

**Production notebook sites (configs ready, NOT CREATED):**

| Worker | Config | Serves | Build variable |
|---|---|---|---|
| `rabbit-hole-notebook` | `packages/web/wrangler.rabbit-hole-notebook-prod.jsonc` | `.small/notebook-site` (Lesson view, `LearnExtras.jsx`) | `VITE_LESSON_NOTEBOOK_ORIGIN=https://rabbit-hole-notebook.tryrabbithole.workers.dev` |
| `rabbit-hole-canvas-notebook` | `packages/web/wrangler.rabbit-hole-canvas-notebook-prod.jsonc` | `.small/canvas-notebook-site` (canvas cards, `learn-notebook.js`) | `VITE_NOTEBOOK_ORIGIN=https://rabbit-hole-canvas-notebook.tryrabbithole.workers.dev` |

Both are static assets only, on the rabbit-hole account, with nothing bound and no route (`rabbit-hole-prod-config.test.js`).
- **To create later (owner GO):** build the two JupyterLite sites (`packages/web/notebook/README.md`, `packages/web/notebook-canvas/README.md`), then `npx wrangler deploy --config <each config>` from `packages/web`. Deploy them before the app build that points at them.
- **Defaults.** Without the variables, a build uses the rabbit-hole account's dev sites (`small-learn-notebook-dev`, `small-learn-canvas-notebook-dev` on `tryrabbithole.workers.dev`), never the personal-account `zeroshothq` hosts (`src/notebook-hosts.test.mjs`).

## Legacy `small-*` names

| Name | Where | Class | Plan |
|---|---|---|---|
| `small-cp` | personal account | Still required (legacy product, CLI `DEFAULT_API`) | Not renamed. Rabbit Hole production is a new script beside it. |
| `rabbit-hole-cp-dev` | rabbit-hole | Required | Already on the target name |
| `small-cp-dev` | rabbit-hole | Required (the dev web Worker) | Rename candidate: `rabbit-hole-web-dev` |
| `small-cp-dev-<worktree>` clones | none on rabbit-hole | Transient | Prefix change after the dev web rename, if wanted |
| `small-learn-notebook-dev`, `small-learn-canvas-notebook-dev` | rabbit-hole | Required (dev iframes) | Rename candidates: `rabbit-hole-notebook-dev`, `rabbit-hole-canvas-notebook-dev` |
| Fly `small-lesson-renderer-dev` | personal Fly org | Superseded by `rabbit-hole-lesson-renderer-dev` (Fly org `rabbit-hole`, 2026-10-01); stopped, kept as rollback | Retire in the final `small-*` cleanup |
| Fly `small-math-renderer-dev` | personal Fly org | Required for maths animation if kept | Optional new `rabbit-hole-*` Fly app with a new token |
| Personal-account `small-cp-dev*`, `small-learn-*-dev`, `small-*-dev` D1/R2, `small-learn-moments`, `small-learn-index` | personal account | Obsolete (quarantined) | Delete only with owner approval |
| Fly `small-itest-*`, `small-yolo-*` and similar | personal Fly org | Obsolete test leftovers | Delete only with owner approval |

**Order.** Smallest blast radius first. Each step creates the new name beside the old one, repoints, verifies, and only then retires the old one with owner approval.
1. ~~Fix the two notebook defaults~~ (done: rabbit-hole account dev defaults plus build variables).
2. Rename the notebook sites. `rabbit-hole-dev-config.test.js` pins the web config *file names*, not the Worker names.
3. Rename `small-cp-dev` to `rabbit-hole-web-dev`. This is the largest step:
   - it covers about 38 e2e defaults, `rabbit-hole-dev-verify.mjs`, `byoc-admin.py`, the CLI README and the docs;
   - the Durable Objects and preview URLs reset;
   - verify with `node scripts/rabbit-hole-dev-verify.mjs` before deleting the old Worker.
4. Change the clone prefix in the Makefile, the four guard regexes and their tests, in one commit.
5. Optionally move the Fly renderers to new apps with fresh tokens.
6. Retire the quarantined personal-account resources.

A Cloudflare Worker "rename" is a new script: the old one keeps serving, and keeps its secrets and Durable Object state, until it is deleted.
