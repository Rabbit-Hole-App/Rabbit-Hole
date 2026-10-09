# Production release job

Status 2026-10-09: **hold lifted** by the owner in Home's session (`HOLD = false` in `scripts/prod-release.mjs`). The production Learn database is at 0014, the same as dev. A push to Rabbit-Hole-App `main` that passes every check below releases.

**Policy (owner, 2026-10-07):**
- Production is a separate job, approved by hand.
- The approval names one exact commit and its build. The job never deploys whatever main holds later.
- Dev auto-deploy is Parallel's job: [dev-auto-deploy.md](dev-auto-deploy.md) and `scripts/dev-deploy.mjs`.

Resources, secrets and the build flags are in [rabbit-hole-production.md](rabbit-hole-production.md).

## The hold

`release` checks `HOLD` first and exits with code 2 before any remote call, whatever its arguments are.
- Lifting the hold is a reviewed code change to that one line, plus its pinning test in `scripts/prod-release.test.mjs`. It is never an environment variable or a flag.
- Lifting the hold does not approve a release by hand: that still needs the owner's in-session GO for that sha and build. From 2026-10-08, a push to Rabbit-Hole-App `main` that passes every check is also an approval (below).

## Release on a push to main (owner, 2026-10-08)

The owner chose B1 in Home's session: Rabbit-Hole-App/Rabbit-Hole `main` is the production trigger, and a push that passes every check is the approval. `.github/workflows/deploy-prod.yml` runs the same job:

- **Trigger:** a push to `main`, and nothing else. It runs only in Rabbit-Hole-App/Rabbit-Hole, one release at a time, in the `production` environment. That environment admits only `main` and holds `CLOUDFLARE_API_TOKEN` and `VITE_TLDRAW_LICENSE_KEY`.
- **Green dev deployment:** the exact commit needs its dev deploy record in `refs/notes/dev-deploys`, written by the dev workflow, with gates `pass` and smoke `pass`. Without it nothing is released.
  - **Reused gate (owner, 2026-10-09, option a):** a record with gates `reused` also releases, but only when all of these hold:
    - its own smoke passed;
    - its base G (`app_gate_sha`) has its own record with gates `pass` and smoke `pass`;
    - both records carry the same page build and Worker bundle;
    - G is an ancestor of the commit.
  - The workflow appends G's record for that check. The byte-identical build means G's full gate tested exactly what ships.
- **Then** `prepare --dev-record <that note>` builds it, and `release --approve "RELEASE <sha> <build>"` uses the prepared build. Every rule below still applies: HOLD first, the exact prepared build, the read-only preflight of secrets and of main and learn migrations. It never applies a migration.
- **The hold** was lifted on 2026-10-09 with the owner's GO. Putting it back is the one-line change to `HOLD = true`: then the release step exits 2 before any remote call, and a push to `main` releases nothing.

## Steps

**1. Prepare.** Local only, no network call:

```bash
git fetch origin main && git checkout --detach <sha>
(cd packages/web && npm ci) && (cd packages/control-plane && npm ci)
node scripts/prod-release.mjs prepare --sha <sha>
```

Prepare refuses unless all of these hold:
- `<sha>` is a full 40-character sha on `origin/main`;
- the dev-deploy record has a line for it with `gates` and `smoke` both `pass`;
- `HEAD` is `<sha>` and no tracked file has changes;
- `VITE_TLDRAW_LICENSE_KEY` is in the environment or the repo-root `.env`. It is read by key name and never printed.

Prepare then does the following:
- Builds `dist` and `dist-dev` with the production env: `VITE_RABBIT_HOLE=true` and the two notebook origins. It removes `VITE_COACHING_DEV` and `VITE_BYOC_DEV`.
- Runs `e2e/production-bundle-check.mjs`.
- Bundles both Workers with `wrangler deploy --dry-run`, which uploads nothing.
- Prints the build hash: sha256 over both page builds and both Worker bundles, first 16 hex characters.
- Prints the migration levels the release will need.

**2. Approval.** The owner approves in session with the exact phrase that prepare printed:
`RELEASE <sha> <build>`.

**3. Release.** Never run while `HOLD` is true:

```bash
node scripts/prod-release.mjs release --sha <sha> --build <build> --approve "RELEASE <sha> <build>"
```

Release refuses unless all of these hold:
- the phrase matches exactly;
- `<sha>` was prepared with that build;
- `HEAD` is still `<sha>` and the tree is clean;
- the bundles still hash to `<build>`;
- `CLOUDFLARE_ACCOUNT_ID` is the rabbit-hole account.

Release then runs a read-only preflight. Every finding is a blocker, and the job changes nothing:
- **Secret names:** each Worker must have its required secrets. Neither may have a test secret or a dev Access bridge secret (`ACCESS_*`, `DEV_TEST_BYPASS`), and the app may not have an OAuth, Resend or `MASTER_KEY` secret.
- **Main D1:** `rabbit-hole-prod` must report "No migrations to apply".
- **Learn D1:** `rabbit-hole-learn-prod` must have every learn migration. Wrangler does not track these, so each one is detected by the first table it creates.

After the preflight passes, release deploys `rabbit-hole-cp` and then `rabbit-hole-app`, each with the message `release <sha12> build <build>`. It appends the release to the git common dir `rabbit-hole-prod-releases.jsonl`.

**4. Smoke.** Run by hand, signed out:
- `https://digrabbithole.com/` returns 200 Landing;
- `/login` returns 302 to `/sign-in`;
- `/a/x` returns 404;
- `/api/me` returns 401.

A signed-in check is done by the owner.
- **Rollback:** `npx wrangler rollback` for each Worker, from that Worker's package with `--config wrangler.rabbit-hole-prod.jsonc`. Roll back the app first, then the control plane.

**Migrations are never applied by this job.** A pending migration is reported, and it waits for its own owner GO.

## Dev-deploy record (contract with Parallel)

The record is one JSON object per line, appended by `scripts/dev-deploy.mjs` after a dev deploy and its smoke test:

```json
{"sha":"<40-hex>","gates":"pass","smoke":"pass","worker":"rabbit-hole-web-dev-<name>","version":"<cf version id>","at":"<iso>"}
```

- Default path: `$(git rev-parse --git-common-dir)/rabbit-hole-dev-deploys.jsonl`. Every worktree of the clone shares it, and it is never tracked. Override it with `--dev-record <path>`.
- Prepare accepts only an exact sha whose `gates` and `smoke` are both `pass`.

## Verification 2026-10-07 (read-only, Cloudflare API GET and SELECT only)

| Target | Finding |
|---|---|
| `rabbit-hole-web-dev-small-parallel` (c5b0a07d, "main 42f5a4f0") | Bindings are `DB` rabbit-hole-dev (1ad18fef), `LEARN_DB` rabbit-hole-learn-dev (028f800f), `BYOC_DB` rabbit-hole-byoc-dev (cae839e6), the dev R2 buckets, and `CONTROL_PLANE` to `rabbit-hole-cp-dev`. It has no secrets. Nothing points at production. The barrier answers `GET /auth`, `/auth/google/start`, `/api/me` and `POST /logout` with 403. |
| `rabbit-hole-cp-dev` (8fdf2149) | Dev D1 and R2 only, with `SMALL_ENV=dev`. Secret names: the dev OAuth secrets, `MASTER_KEY` and `TEST_BYPASS_SECRET`. It has no `RESEND_API_KEY`. |
| `rabbit-hole-cp` (01eae494, 2026-10-03) | `DB` rabbit-hole-prod (ecb90fe5), `LEARN_DB` rabbit-hole-learn-prod (f28417c4), the prod R2 buckets. It has no workers.dev. Its secrets match the required list and it has no test secret. |
| `rabbit-hole-app` (25f95ea9, 2026-10-04) | The same production D1 and R2, `CONTROL_PLANE` to `rabbit-hole-cp`, no workers.dev. Its secrets match the required list. |
| `rabbit-hole-prod` / `rabbit-hole-dev` | Migrations 0001-0027 are applied on both (30 rows each). |
| `rabbit-hole-learn-prod` / `rabbit-hole-learn-dev` | Learn migrations 0001-0012 on both (2026-10-08). Production got 0004-0012 on the owner's in-session GO; see [dev-auto-deploy.md](dev-auto-deploy.md#production-learn-schema-0004-0012-applied-2026-10-08). |
