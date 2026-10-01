# Rabbit Hole dev environment (P0-B Phase 2B)

The dev and review environment runs on its own Cloudflare account, **rabbit-hole**
(`c08d3dbdc53a3afd3cb09a536ac42318`, workers.dev subdomain `tryrabbithole`). It shares no Worker,
database, bucket or secret with production `small-cp`. That account is different, so a dev Worker
cannot bind a production resource even by mistake. `scripts/rabbit-hole-dev-verify.mjs` checks this.

Branch: `infra/rabbit-hole-dev-control-plane`. It is based on the P0-B Phase 1 barrier and includes
the P0-A auth hotfix, cherry-picked.

## Resources

| Kind | Name | Id / URL | Built from |
|---|---|---|---|
| D1 (main, `DB`) | `rabbit-hole-dev` | `1ad18fef-ccf9-4a2c-86c7-dc7e87b268a2` | `bootstrap.sql` + `migrations/` |
| D1 (`LEARN_DB`) | `rabbit-hole-learn-dev` | `028f800f-ce8e-4461-adb2-827f417492eb` | `repository-schema.sql` |
| D1 (`BYOC_DB`) | `rabbit-hole-byoc-dev` | `cae839e6-6d58-4037-9e92-d47346356c2f` | `packages/byoc/schema.sql` |
| R2 (`LEARN_MEDIA`) | `rabbit-hole-dev-learn-media` | | |
| R2 (`REPOSITORY_SNAPSHOTS`) | `rabbit-hole-dev-repositories` | | |
| Dev control plane | `rabbit-hole-cp-dev` | https://rabbit-hole-cp-dev.tryrabbithole.workers.dev | `packages/control-plane/wrangler.rabbit-hole-dev.jsonc` |
| Dev / review worker | `small-cp-dev` (clones: `small-cp-dev-<worktree>`) | https://small-cp-dev.tryrabbithole.workers.dev | `packages/web/wrangler.dev.jsonc` |
| Notebook origins | `small-learn-canvas-notebook-dev`, `small-learn-notebook-dev` | `*.tryrabbithole.workers.dev` | static JupyterLite sites |

**Deliberately absent in Phase 2B:**
- **No `RUNS` bucket and no Fly tokens.** Run inputs refuse with a 503, and run outputs list empty.
- **No crons.**
- **No Resend key.**
- **No paid-provider keys.**
- **Workers AI, Vectorize (`small-learn-moments`) and the index Queue (`small-learn-index`) stay
  unbound.** Every use is guarded (`learn-moment-index.js`), so Learn falls back to the cold path.
- **Repository import uses `rabbit-hole-lesson-renderer-dev`** (Fly org `rabbit-hole`). Its fresh
  `SCENE_WORKER_TOKEN` is set on that app and on `small-cp-dev` (2026-10-01). The personal-org
  `small-lesson-renderer-dev` stays stopped as a rollback until the final `small-*` cleanup.
- **Learn D1.** `rabbit-hole-learn-dev` has `learn-migrations/0001`-`0003` (`canvas_dives`, `user_profiles`,
  `canvas_context_documents`), applied 2026-10-01 with `d1 execute --file`; the Learn DB has no migrations table.
  Wiring, rotation and migration: [learn-repositories.md](learn-repositories.md#indexer-credential-scene_worker_token).

## Auth on dev

- **Configuration.** `rabbit-hole-cp-dev` runs the production control-plane code with
  `SMALL_ENV=dev`. It has its own `MASTER_KEY` and `TEST_BYPASS_SECRET`, both generated fresh and
  unrelated to production.
- **Sessions.** `POST /test/session {email, secret}` mints a session signed with the dev
  `MASTER_KEY`. The dev worker's `CONTROL_PLANE` binding points at `rabbit-hole-cp-dev`, so the dev
  worker accepts that session as its `small_session` cookie.
- **Login.** `/login` and `/api/cli/login` fail closed with a 503. They show no link or code, because
  the echo is `SMALL_ENV=test` only. A public dev control plane must not sign anyone in as anyone.
- **Barrier.** The Phase 1 barrier is unchanged. The dev worker still refuses `/login`, `/auth`,
  `/logout` and `/test/session`, and forwards only allowlisted GETs to its control plane.
- **Scripts.** Review and e2e scripts mint sessions with `DEV_CP` from `packages/web/e2e/dev-cp.mjs`.
  They read the secret from the repo-root `.env` key `RABBIT_HOLE_DEV_TEST_BYPASS` (gitignored).
  There is no production fallback.
- **Local dev.** The `vite` dev server proxies to `rabbit-hole-cp-dev`, or to `RABBIT_HOLE_DEV_CP`
  if set, and never to `SMALL_API`.
- **Integration tests.** `tests/integration_tests` is skipped: it deploys to Fly (see its
  `conftest.py`).

## Web OAuth on dev (feature/rabbit-hole-auth)

- **Hostname:** `rabbit-hole-cp-dev.tryrabbithole.workers.dev`.
- **Provider callbacks,** from `docs/features/rabbit-hole-auth-backend.md` on the auth branch:
  - `https://rabbit-hole-cp-dev.tryrabbithole.workers.dev/auth/google/callback`
  - `https://rabbit-hole-cp-dev.tryrabbithole.workers.dev/auth/github/callback`
- **Credentials.** The owner sets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET` by hand as Worker secrets. Agents never set OAuth credentials.
- **`OAUTH_MOCK` must stay unset** for the real-provider test. It was confirmed unset on
  2026-09-30, and the Worker's only secrets were `MASTER_KEY` and `TEST_BYPASS_SECRET`.
- **When the providers start working.** This branch has no OAuth routes, so the providers only work
  once the dev control plane runs code from the auth branch. At that point, apply `0026-users.sql`
  to `rabbit-hole-dev` with `migrations apply`.

## Rebuild a database from the repo

Run from `packages/control-plane` with the rabbit-hole `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the environment.

Main D1: a brand-new database only, because `bootstrap.sql` holds the two tables that predate 0001.

```bash
npx wrangler d1 execute rabbit-hole-dev --remote --config wrangler.rabbit-hole-dev.jsonc --file bootstrap.sql
npx wrangler d1 migrations apply rabbit-hole-dev --remote --config wrangler.rabbit-hole-dev.jsonc
```

Learn and BYOC D1s: both schema files are additive and can be run again safely.

```bash
npx wrangler d1 execute rabbit-hole-learn-dev --remote --config wrangler.rabbit-hole-dev.jsonc --file repository-schema.sql
npx wrangler d1 execute rabbit-hole-byoc-dev --remote --config wrangler.rabbit-hole-dev.jsonc --file ../byoc/schema.sql
```

`test/migrations-bootstrap.test.js` builds an empty SQLite database with `bootstrap.sql` and every
migration in order, then checks the result against `schema.sql`.

**Migration numbers:**
- `0025` is the CLI login challenges table (P0-A).
- `0026` is users, identities and login links. It lives on `feature/rabbit-hole-auth` and is not on
  this branch yet.
- `0027` is `learn_moments`.
- `rabbit-hole-dev` currently records 0001–0025 and 0027. `0026-users.sql` becomes pending when the
  auth branch is merged.

## Deploy

With the rabbit-hole token loaded, never your personal OAuth login:

```bash
cd packages/web
export VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_NOTEBOOK_ORIGIN=https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev
export VITE_TLDRAW_LICENSE_KEY=<from root .env - never print it>
npm run build                          # dist, served by the dev control plane
npm run build -- --outDir dist-dev     # dist-dev, served by the dev worker
cd ../control-plane && npx wrangler deploy --config wrangler.rabbit-hole-dev.jsonc
cd ../web && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-<worktree>
```

- `wrangler.jsonc` in `packages/control-plane` is **production** `small-cp`. It has no
  `account_id`, and nothing here deploys it.
- Secrets can be rotated with `wrangler secret bulk --config wrangler.rabbit-hole-dev.jsonc`, reading
  JSON from stdin. Update `RABBIT_HOLE_DEV_TEST_BYPASS` in `.env` to match.

## Verification (2026-09-30)

`node scripts/rabbit-hole-dev-verify.mjs` passed 10/10 against the deployed environment:

1. Dev login fails closed, both web and CLI.
2. `/test/session` refuses a wrong secret.
3. The dev worker accepts a dev session and rejects a missing or forged one.
4. The dev worker refuses the four auth routes.
5. A new workspace appears only in `rabbit-hole-dev`.
6. On a workspace switch, the dev worker refuses a non-member with a 403, and the control plane
   falls back to the home workspace.
7. A new canvas appears only in `rabbit-hole-learn-dev`, and another user cannot see it.
8. An uploaded media object appears only in `rabbit-hole-dev-learn-media`.
9. A repository import degrades and writes nothing.
10. Every Worker on the account binds only rabbit-hole resources, and `small-cp` does not exist on
    the account.

## Quarantined personal-account resources (not deleted)

Account `70211afe61d2fa1963f6a701847553ec`. Dev and review work no longer uses any of these.
Deleting them needs the owner's approval.

| Kind | Name |
|---|---|
| Workers (answering) | `small-cp-dev`, `small-cp-dev-final-integration`, `small-cp-dev-small-deploy`, `small-cp-dev-small-parallel`, `small-cp-dev-smart-home`, `small-cp-dev-smart-landing-page`, `small-learn-notebook-dev`, `small-learn-canvas-notebook-dev`, `small-learn-canvas-notebook-dev-small-parallel` |
| D1 | `small-learn-dev` (`433385b6…`), `small-byoc-dev` (`67723b56…`) |
| R2 | `small-learn-media-dev`, `small-repositories-dev` |
| Vectorize / Queue | `small-learn-moments`, `small-learn-index` |

**Production, untouched:** `small-cp`, D1 `small` (`3a9cc077…`) and R2 `small-runs`.
