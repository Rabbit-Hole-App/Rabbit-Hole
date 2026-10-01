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
browser ── https://tryrabbithole.dev ──▶ rabbit-hole-app  (packages/web/app-worker.js, public, custom domain)
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
- **Request URL.** The app forwards the original `Request` through the binding. The control plane therefore sees `https://tryrabbithole.dev/...`, builds its OAuth `redirect_uri` and magic links from that origin, and passes its CSRF origin check.
- **Same-origin calls.** There is no CORS anywhere; the SPA calls relative `/api`.
- **Private control plane.** `rabbit-hole-cp` is not public. Its own `/` would serve the older `dist` shell, and a second public host would mint cookies the app never sees.

**Production entry.** `packages/web/app-worker.js` reuses `dev-worker.js` unchanged, so a route added for dev (for example Voice's `/api/learn/voice/*`) also ships to production.
- Its only differences: `ownControlPlane(env)` marks the binding as this deployment's own control plane, so the P0-B barrier passes sign-in and writes through instead of returning 403; and `GET /login` redirects to `/sign-in` with the query string kept.
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
| `/auth/{google,github}/start`, `/auth/{google,github}/callback`, `/auth/email/start`, `/auth?token=`, `/auth/session`, `POST /login`, `/logout` | cp, through the app | Callbacks to register: `https://tryrabbithole.dev/auth/google/callback` and `https://tryrabbithole.dev/auth/github/callback` |
| `/api/cli/login`, `/api/cli/verify`, `/api/me`, `/api/workspaces*`, `/api/members`, `/api/ask/threads*`, other `/api/*` | cp, through the app | |
| `/test/*` | cp | Dead: `SMALL_ENV=production`, and no test secret is set |
| `/a/*`, `/slack/*`, run and deploy APIs | cp | Legacy hosted-app features; they answer 503 without Fly, RUNS or Slack secrets |

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
- **Preview restrictions.** The `VITE_COACHING_DEV=true` build also ships them: `/chat` and `/members` redirect, and the browser refuses writes outside Learn (`flags.js`, `api.js`). Production needs that build flag for Rabbit Hole to exist at all.
- **Data.** Should anything carry over from legacy `small` (users, workspaces, `learn_courses`)? The default is a fresh start. No Rabbit Hole canvas or board data exists in `small`.

### Secrets

| Worker | Required | Optional |
|---|---|---|
| `rabbit-hole-cp` | `MASTER_KEY` (fresh), `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | `RESEND_API_KEY` with an `EMAIL_FROM` var on a verified domain (email sign-in), `ANTHROPIC_API_KEY` |
| `rabbit-hole-app` | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY`, `DESMOS_API_KEY`, `PEXELS_API_KEY`, `EXA_API_KEY`, `FAL_API_KEY`, `FISH_AUDIO_API_KEY`, `ELEVENLABS_API_KEY` (Voice), `SCENE_WORKER_URL` + `SCENE_WORKER_TOKEN` (indexer) |

### Repository-import indexer

Repository import calls the lesson-renderer Fly app with a shared bearer `SCENE_WORKER_TOKEN` ([learn-repositories.md](learn-repositories.md#indexer-credential-scene_worker_token)).
- Production has no indexer yet. Without one, import answers 503 "Repository import is unavailable because the indexing service is not configured on this server." and writes nothing.
- Shipping it means a production renderer app, for example `rabbit-hole-lesson-renderer`, deployed from `packages/lesson-renderer`. It must have its own token, set on that Fly app and on `rabbit-hole-app` from one generated value.

## Production bootstrap (NOT RUN)

Run from `packages/control-plane`, with the rabbit-hole `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` loaded.
1. Run the local check first: `node --test test/migrations-bootstrap.test.js`.
2. Create the resources and the schema:

```bash
npx wrangler d1 create rabbit-hole-prod
npx wrangler d1 create rabbit-hole-learn-prod
npx wrangler r2 bucket create rabbit-hole-prod-learn-media
npx wrangler r2 bucket create rabbit-hole-prod-repositories
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

3. Set the secrets (table above) with `wrangler secret put <NAME> --config wrangler.rabbit-hole-prod.jsonc`, piping each value in.
4. Deploy, control plane first so the app's binding resolves:

```bash
npx wrangler deploy --config wrangler.rabbit-hole-prod.jsonc                # rabbit-hole-cp
cd ../web
export VITE_COACHING_DEV=true VITE_NOTEBOOK_ORIGIN=https://rabbit-hole-canvas-notebook.tryrabbithole.workers.dev
export VITE_TLDRAW_LICENSE_KEY=<from root .env - never print it>
npm run build && npm run build -- --outDir dist-dev    # dev-worker.js bundles from both
npx wrangler deploy --config wrangler.rabbit-hole-prod.jsonc                # rabbit-hole-app, attaches tryrabbithole.dev
```

The app config's custom-domain route needs the zone **active**. Until it is, the app deploy fails at the domain step. To smoke-test before cutover, deploy once with the route removed and `workers_dev: true`. OAuth would then need that host's callbacks registered too.

**Hazard.** `make cp-deploy` / `make web-deploy` (`run.sh`) runs a bare `wrangler deploy` of `wrangler.jsonc`, which is legacy `small-cp`. Never use them for Rabbit Hole.

## tryrabbithole.dev

**Zone state, read 2026-10-01:**
- Zone `96a369eea702ebde9ed876d189f2991d` on the rabbit-hole account is **pending**, with `activation_failure_reason: ns_mismatch`.
- The zone was assigned `addilyn.ns.cloudflare.com` and `robert.ns.cloudflare.com`.
- Public delegation (1.1.1.1, 8.8.8.8 and RDAP) points at `macy.ns.cloudflare.com` and `rene.ns.cloudflare.com`. Those are the zone's `original_name_servers`, and they answer authoritatively with a different SOA serial, so a second Cloudflare zone holds the domain.
- The domain was registered through Cloudflare Registrar on 2026-09-29, and Registrar delegates to a zone in the buying account. Cloudflare cannot change a zone's assigned nameservers.
- A free zone left pending for 28 days is deleted, around **2026-10-28**.

**Fix (owner):**
1. Find the account that bought the domain and holds the `macy`/`rene` zone.
2. Then either:
   - (a) move the registration to the rabbit-hole account (Cloudflare Support), delete the stray zone, and re-check activation of the rabbit-hole zone; or
   - (b) have Support set the registrar nameservers to `addilyn`/`robert`.

   Hosting the Workers in the buying account instead would move every production resource with them, because a custom domain must be in the same account as its zone and Worker.

**Token gaps.** The current token cannot read the zone's DNS records (code 10000), settings (9109), Worker routes or the Registrar. To inspect, add Zone DNS Read, Zone Settings Read and Registrar Read. To perform the steps below, add Zone DNS Edit, Workers Routes Edit and Single Redirect Edit.

**Once the zone is active:**
1. **Apex.** The app config's `routes: [{ "pattern": "tryrabbithole.dev", "custom_domain": true }]` creates the DNS record and certificate on deploy. A custom domain cannot be added over an existing CNAME.
2. **`www` is not canonical.** Add a proxied `A www 192.0.2.0` record. Then add a Single Redirect from the "Redirect from WWW to root" template: `https://www.*` → `https://${1}`, status 301, query string preserved.
3. **Checks.** In the dashboard, check Always Use HTTPS, HSTS and minimum TLS (unknown today because of the token).
4. **OAuth.** Register the two callbacks above with Google and GitHub.

## Notebooks

The notebook iframes use `sandbox="allow-scripts allow-same-origin"`, so only a separate *site* keeps notebook Python away from the session.
- Host them on `*.tryrabbithole.workers.dev` and not on a `tryrabbithole.dev` subdomain: a subdomain is same-site, so the `SameSite=Lax` cookie would ride along.
- Before relying on this, confirm `workers.dev` is on the Public Suffix List.

**Code to fix before a production build:**
- `packages/web/src/learn-notebook.js:7` defaults `VITE_NOTEBOOK_ORIGIN` to the quarantined personal-account `small-learn-canvas-notebook-dev.zeroshothq.workers.dev`.
- `packages/web/src/LearnExtras.jsx:45` hard-codes `small-learn-notebook-dev.zeroshothq.workers.dev`, with no env override.

## Legacy `small-*` names

| Name | Where | Class | Plan |
|---|---|---|---|
| `small-cp` | personal account | Still required (legacy product, CLI `DEFAULT_API`) | Not renamed. Rabbit Hole production is a new script beside it. |
| `rabbit-hole-cp-dev` | rabbit-hole | Required | Already on the target name |
| `small-cp-dev` | rabbit-hole | Required (the dev web Worker) | Rename candidate: `rabbit-hole-web-dev` |
| `small-cp-dev-<worktree>` clones | none on rabbit-hole | Transient | Prefix change after the dev web rename, if wanted |
| `small-learn-notebook-dev`, `small-learn-canvas-notebook-dev` | rabbit-hole | Required (dev iframes) | Rename candidates: `rabbit-hole-notebook-dev`, `rabbit-hole-canvas-notebook-dev` |
| Fly `small-lesson-renderer-dev`, `small-math-renderer-dev` | personal Fly org | Required for dev repository import and maths animation | Optional new Fly apps with new tokens |
| Personal-account `small-cp-dev*`, `small-learn-*-dev`, `small-*-dev` D1/R2, `small-learn-moments`, `small-learn-index` | personal account | Obsolete (quarantined) | Delete only with owner approval |
| Fly `small-itest-*`, `small-yolo-*` and similar | personal Fly org | Obsolete test leftovers | Delete only with owner approval |

**Order.** Smallest blast radius first. Each step creates the new name beside the old one, repoints, verifies, and only then retires the old one with owner approval.
1. Fix the two notebook defaults (no rename).
2. Rename the notebook sites. `rabbit-hole-dev-config.test.js` pins the web config *file names*, not the Worker names.
3. Rename `small-cp-dev` to `rabbit-hole-web-dev`. This is the largest step:
   - it covers about 38 e2e defaults, `rabbit-hole-dev-verify.mjs`, `byoc-admin.py`, the CLI README and the docs;
   - the Durable Objects and preview URLs reset;
   - verify with `node scripts/rabbit-hole-dev-verify.mjs` before deleting the old Worker.
4. Change the clone prefix in the Makefile, the four guard regexes and their tests, in one commit.
5. Optionally move the Fly renderers to new apps with fresh tokens.
6. Retire the quarantined personal-account resources.

A Cloudflare Worker "rename" is a new script: the old one keeps serving, and keeps its secrets and Durable Object state, until it is deleted.
