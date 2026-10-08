# Stable testing URL: gated main deploys itself to dev

**Owner:** Home (stable-preview infrastructure, from 2026-10-08). Parallel runs the trigger as the last step of its merge procedure and owns the app gate.

**Status (2026-10-08):**
- The pipeline is built.
- Access is configured. Home verified it read-only on 2026-10-07: it admits the owner's email and the smoke service token, and production is untouched.
- The first automated run, for main `e03a7a53`, rolled itself back. Its smoke looked for `/assets/` instead of `/static/`. That is fixed.
- Main `1b7a2116` was deployed as version 54d4e7a7, with build `5acc0f6ba69c` and the gate reused from `e03a7a53`. At that time its smoke was **blocked** by the dev Learn schema.
- **Dev Learn schema 0004-0010 is applied** (owner GO, 2026-10-08, `rabbit-hole-learn-dev` only). Signed-in flows answer 200: see [Dev Learn schema](#dev-learn-schema-0004-0010-applied-2026-10-08-dev-only). Production is still at 0003, on hold.

Production release is a separate, held job: [prod-release.md](prod-release.md) (Home).

## What it does

**Stable testing URL:** https://rabbit-hole-web-dev-small-parallel.tryrabbithole.workers.dev, served by the Worker
`rabbit-hole-web-dev-small-parallel`. It is a dev clone ([parallel-dev-deploys.md](parallel-dev-deploys.md)) on the
rabbit-hole account. It has the dev bindings of `packages/web/wrangler.dev.jsonc` (dev D1, dev R2, `CONTROL_PLANE` =
`rabbit-hole-cp-dev`) and the dev barrier ([dev-prod-write-barrier.md](dev-prod-write-barrier.md)).

**Trigger.** The integration merge procedure ends with a push of a gated main commit. Right after that push, Parallel runs:

```bash
node scripts/dev-deploy.mjs --sha <main commit> --gate <that commit's gate record>
```

The script runs from a checkout at exactly that commit. No further GO is needed for these dev deploys.

**What `dev-deploy.mjs` guarantees** (each step prints its decision, and any refusal leaves the current deployment
serving):

1. **Exact commit.**
   - The sha is on `origin/main`.
   - The checkout's `HEAD` is that sha.
   - No tracked change, and nothing untracked under the build inputs.
2. **Passed gate.** The gate record names the commit's own tree on its first line and ends with `-DONE`. In addition:
   - `make test-unit` and every stage exit 0, counting the last attempt where a crashed stage reran;
   - every provider-tripwire and model-key count is 0.
   
   A failed or unfinished gate deploys nothing, so the last passing deployment stays.
3. **Forward only.**
   - The sha the clone serves is read from its version chain (Cloudflare API, `servedSha`):
     - each version's own upload message names its sha (`main <sha> build <hash>`), so a rollback serves that version again under its original record;
     - a version made by a secret change (an Access setting) carries the code that served when it was made, so it resolves through the deployment before it;
     - an upload without the message, or a split rollout, is **unknown**. The run then refuses, because an unknown commit could be newer than the candidate.
   - The candidate must descend from that sha. The same sha is a no-op; an older or diverged one is refused.
   - The check runs twice, before the build and again just before the deploy.
   - A lock file stops two local runs from overlapping.
4. **Build and deploy.** Everything the Worker bundles comes from this commit:
   - `npm ci` at the repo root installs the dependencies exactly as the lockfile pins them.
   - Vite and Wrangler run from that `node_modules` with no shell. `npx` would fetch an unpinned Wrangler.
   - The pages are built twice:
     - `dist` is the control plane's own shell, bundled through `control-plane/src/index.js`;
     - `dist-dev` is the documented dev build, with `VITE_COACHING_DEV`, `VITE_BYOC_DEV` and the notebook origin set before the build.
   - A leftover `dist` from another commit never ships. The 2026-10-08 run from a fresh checkout failed to bundle without one.
   - The Worker uploads `dist/index.html` as a module, because the control plane's shell import pulls it in. The run refuses unless it is byte-identical to `dist-dev/index.html`.
   - **Two identities, kept separate.**
     - `build` hashes the pages: every file of `dist-dev`.
     - `bundle` hashes the packaged Worker: wrangler's own `--dry-run` bundle of `dev-access-worker.js`, meaning the code plus every module it uploads, without source maps.
     - The page hash covers no Worker code.
     - Both appear in the upload message (`main <sha> build <pages> bundle <worker>`) and in the record.
     - Under policy A, both must equal the gated deploy's. Deploys before 2026-10-08 recorded pages only.
     - The bundle is deterministic: two bundles of `4393d912` hashed the same, and the bundle holds no absolute local path.
   - "No local changes" compares content (`git diff HEAD`). `npm ci` rewrites the line endings of `packages/cli/bin/small.js`, which `git status` would report.
   - The deploy is `wrangler deploy dev-access-worker.js --config wrangler.dev.jsonc --name rabbit-hole-web-dev-small-parallel`, with the message `main <sha> build <hash>`.
   - The entrypoint is the dev worker with the Access bridge in front; see [Access](#access).
5. **Record.**
   - The Worker's deployment history (`wrangler deployments list --name …`) is the record of what is deployed.
   - Each run also appends a line to `<git common dir>/rabbit-hole-dev-deploys.jsonl`:
     `{"sha","gates","build","bundle","smoke","worker","version","at"}`.
   - `gates` is `"pass"` for the commit's own full gate. It is `"reused"` with `app_gate_sha` under [policy A](#policy-a-reusing-a-gate).
   - `prod-release.mjs prepare` reads this record and accepts only `gates: "pass"` with `smoke: "pass"`.
6. **Smoke and rollback.**
   - The smoke waits until the URL serves this build, then checks:
     - `/library` returns 200;
     - behind Access, `GET /` and `GET /auth/google/start` return a 302 to `/library` (the sign-in redirect below);
     - the barrier refuses `POST /login`, `/logout` and `/test/session`;
     - a request without credentials is turned away;
     - signed-in `GET /api/apps` and `GET /api/profile` work.
   - A **fail** rolls back to the previous version (`wrangler rollback <version> -y`), with the message `rollback to main <sha>: …`.
   - A signed-in check that fails because the dev Learn database lacks tables the repository's `learn-migrations/` create is **blocked**, not failed. It is reported, never migrated.
   - nanoGPT and repository import are not checked: they are optional test data.

**Manual rollback:**
1. List the versions with `npx wrangler deployments list --name rabbit-hole-web-dev-small-parallel`.
2. Roll back with `npx wrangler rollback <version-id> --name rabbit-hole-web-dev-small-parallel -m "rollback to main <sha>: <why>"`.

Run both from `packages/web`, with the rabbit-hole token. A rollback serves an earlier version, and that version's own upload message still names its sha, so the forward-only check keeps working. Keep `main <sha>` in the rollback message anyway, for people reading the history.

## Policy A: reusing a gate

Owner policy, 2026-10-08:
- A docs-only change gets doc checks only.
- A deploy or pipeline change gets focused checks.
- An app, Worker, control-plane, dependency or config change gets the full gate.

`dev-deploy.mjs` enforces the reuse case:

```bash
node scripts/dev-deploy.mjs --sha <main commit> --reuse <gated main commit> --gate <the gated commit's gate record>
```

The run refuses unless all of these hold:
1. The gate record passes for the **gated** commit's tree.
2. The gated commit is an ancestor of the candidate.
3. Every path changed between the two is reusable: `docs/**`, a top-level `*.md`, or `scripts/dev-deploy(.test).mjs` / `scripts/prod-release(.test).mjs`.
   - Markdown under `packages/` is not reusable: lesson Markdown ships in the bundle.
   - `run.sh`, configs, migrations, lockfiles and every other script also need their own gate.
4. The focused tests (`scripts/dev-deploy.test.mjs`, `scripts/prod-release.test.mjs`) pass on the exact tree.
5. **The dev build is byte-identical to the gated commit's recorded build.**
   - This is the proof that no build input changed, including through a change to `dev-deploy.mjs` itself.
   - The dev build is deterministic: a clean rebuild of `e03a7a53` on 2026-10-08 reproduced its deployed hash, `5acc0f6ba69c`.
   - A gated commit with no recorded build cannot be reused.

The record says `gates: "reused"` and `app_gate_sha`, so it is never mistaken for a fresh gate.

**Not automated, on purpose.**
- **No remote migration.** Migrations are always a separate owner approval.
- **Gate trigger.** The gate runs on the integration machine (local stacks, the provider tripwire, a memory guard), so the deploy is the last step of that procedure, not a CI job.
- ponytail: a GitHub Actions trigger would need the repo to hold the Cloudflare token and a Linux port of the gate. Add it if main ever moves without the integration owner.

## Access

The stable URL is private to the owner. Cloudflare Access sits in front of the host and lets in only the owner's Google
account. A pipeline service token can also be allowed, for the smoke only. The dev worker then signs that person in to the
app's dev identity:

0. **Only this URL.** Only the stable URL's own entrypoint, `packages/web/dev-access-worker.js`, imports the bridge.
   - `dev-worker.js` (`small-cp-dev`, every other clone) and production's `app-worker.js`, which reuses `dev-worker.js`, never import it.
   - A test pins this, and the bundles were checked on 2026-10-07: the bridge is in the Access entrypoint's bundle and absent from the `dev-worker` and `app-worker` bundles.
1. **Verify the assertion.** `packages/control-plane/src/dev-access.js` checks the `Cf-Access-Jwt-Assertion` header itself:
   - signature against the team's certs;
   - issuer, audience (`ACCESS_AUD`) and expiry;
   - the email is in `ACCESS_ALLOWED_EMAILS`.
   
   A missing, forged or foreign assertion is a 403.
2. **Session.** If the browser has no session for that email, the worker mints one on `rabbit-hole-cp-dev` through the binding's
   `/test/session`, with `handle: null`, so the person keeps or chooses their own handle. It then sets the normal
   `small_session` cookie. The dev control plane's own `MASTER_KEY` signs it.
3. **Sign-in pages go to the Library.** Behind Access the person is already signed in, and the app's own sign-in can
   never complete on a preview, because the barrier refuses `/auth/*`.
   - For a verified identity, `GET` and `HEAD` on `/`, `/sign-in`, `/sign-up`, `/login`, `/auth` and `/auth/*` answer 302 to `/library` (`signInRedirect`).
   - Writes still reach the barrier, which refuses them.
   - Owner report, 2026-10-08: the first visit landed on `/`, offered Google sign-in, and showed "Blocked on this preview".
   - Without `ACCESS_AUD`, or without a verified identity, nothing is redirected.
4. **Downstream.** Every API and control-plane call then carries that session, and runs the normal account, workspace and
   ownership checks. The barrier still refuses the browser's `/login`, `/auth`, `/logout` and `/test/session`; a verified identity's GETs of the sign-in pages are redirected before reaching it (3). Production authentication
   (`app-worker.js`, `rabbit-hole-cp`) is unchanged.
5. **The smoke identity.** The Access service token named by `ACCESS_SMOKE_CLIENT_ID` carries no email. It maps to the
   synthetic `dev-deploy-smoke@example.test` user and to nothing else.

**Configuration** is Worker *secrets* on the clone only. They survive every `wrangler deploy`, and they never touch the
shared `wrangler.dev.jsonc`, so `small-cp-dev` and other clones are unaffected. The secrets are:
- `ACCESS_TEAM_DOMAIN` (`rabbit-hole.cloudflareaccess.com`);
- `ACCESS_HOST` (the clone's `workers.dev` host, the only host Access protects);
- `ACCESS_AUD` (the Access application's AUD tag);
- `ACCESS_ALLOWED_EMAILS`;
- `ACCESS_SMOKE_CLIENT_ID`;
- `DEV_TEST_BYPASS`, which equals `rabbit-hole-cp-dev`'s `TEST_BYPASS_SECRET`; `.env` key `RABBIT_HOLE_DEV_TEST_BYPASS`.

Without `ACCESS_AUD`, the worker behaves exactly as before. With `ACCESS_AUD` set:
- if any other key above is missing, the worker answers 503 and never mints a session;
- any other host is refused, including the clone's version-preview hosts, which sit outside the Access application.

**Setup (done 2026-10-07; Home verified it the same day).**
1. **Owner (dashboard):**
   - turn on Zero Trust on the rabbit-hole account and pick the team name;
   - give the rabbit-hole API token the Access permissions below;
   - in Google Cloud, add the Access callback to the dev OAuth client.
2. **Parallel (API):**
   - create the Google identity provider, the self-hosted Access application for the clone's host, the allow policy (owner email) and the smoke service token;
   - put the secrets above on the clone;
   - deploy;
   - verify fresh-browser sign-in and real signed-in operations, after the schema approval.
3. **Home:** verify independently that the policy admits only the owner (plus the smoke token), and that production auth is unchanged.

**Verification** (`packages/control-plane/test/dev-access.test.js`):
- a missing, forged, wrong-audience, wrong-issuer or expired assertion is refused before any session;
- a half configuration answers 503;
- a valid assertion replayed to another host is refused;
- a verified but unlisted email is refused;
- the allowed email gets a session for exactly that email, and other cookies are kept;
- a session for someone else is replaced;
- only the configured service token maps to the smoke user, and an email claim naming the smoke user does not;
- neither `dev-worker.js` nor `app-worker.js` imports the bridge;
- a failed mint stays refused;
- without `ACCESS_AUD`, nothing changes.

`dev-barrier.test.js` still pins two things: the guard is the handler's first statement, and the barrier is its last line.

## Dev Learn schema 0004-0010 (applied 2026-10-08, dev only)

**Applied 2026-10-08** after the owner's in-session GO, to `rabbit-hole-learn-dev` (028f800f) only.
- Home ran the commands below from a clean checkout of main `4393d912`, with the pinned wrangler. All seven files reported OK.
- The learn level is now 0010 on dev. `rabbit-hole-learn-prod` is unchanged at 0003.
- Every Worker that binds the shared dev Learn database (rabbit-hole-cp-dev, small-cp-dev and the clones) sees the new tables.

**Verified afterwards.** The checks went through Access with the smoke service token: 10 rounds, a fresh session each time, plus one cookie sequence.
- `/api/apps`, `/api/profile` (which returns the handle), `/api/canvases`, `/api/library/trash`, `/api/learn/creators` (handles) and `/library` all returned 200, in all 66 requests.
- An anonymous request is sent to the Access login.
- The earlier one-off 401 did not reproduce.

Before the migration, signed-in flows returned 500 (`no such table: user_handles`), and the smoke reported them as blocked.

**Rehearsal (2026-10-08, local only).**
- Method: copy the live schema of `rabbit-hole-learn-dev` (and of `rabbit-hole-learn-prod`, for comparison) by SELECT from `sqlite_master` into in-memory SQLite. Then apply 0004-0010 in order, twice.
- Starting state: both databases were at 0001-0003, with 15 objects each.
- Result:
  - every file applied, and the second pass was a no-op;
  - 14 new objects were created: 10 tables and 4 indexes;
  - every existing object was unchanged.
- The files contain only `CREATE ... IF NOT EXISTS` statements: no `ALTER`, `DROP`, `UPDATE`, `DELETE` or `INSERT`. No data changes.

| File | Creates |
|---|---|
| `0004-canvas-forks.sql` | `canvas_forks` + index |
| `0005-shared-canvas-v1.sql` | `board_repository_pins`, `repository_visibility`, `shared_ask_events` + 2 indexes |
| `0006-learning-journeys.sql` | `learning_journeys` + unique index, `learning_path_versions` |
| `0007-canvas-publications.sql` | `canvas_publications` |
| `0008-user-handles.sql` | `user_handles` |
| `0009-canvas-metadata.sql` | `canvas_metadata` |
| `0010-library-trash.sql` | `library_trash` |

**Commands (as run 2026-10-08; dev only).** Run them from `packages/control-plane` with the rabbit-hole token. `wrangler.rabbit-hole-dev.jsonc` binds `rabbit-hole-learn-dev` (028f800f):

```bash
for f in learn-migrations/0004-*.sql learn-migrations/0005-*.sql learn-migrations/0006-*.sql learn-migrations/0007-*.sql          learn-migrations/0008-*.sql learn-migrations/0009-*.sql learn-migrations/0010-*.sql; do
  npx wrangler d1 execute rabbit-hole-learn-dev --remote --config wrangler.rabbit-hole-dev.jsonc --file "$f" -y || break
done
npx wrangler d1 execute rabbit-hole-learn-dev --remote --config wrangler.rabbit-hole-dev.jsonc --json   --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

- **Check:** all ten tables are listed. Then re-run `dev-deploy.mjs` on the current main, or open the stable URL signed in: `/api/apps` and `/api/profile` return 200, and the smoke turns `pass`.
- **Rollback:** not needed. The migrations are additive, and the code that predates them never reads the new tables.

Production `rabbit-hole-learn-prod` is at the same 0003 level. It is a separate GO, and the [release job](prod-release.md) refuses to release main until it is migrated.

