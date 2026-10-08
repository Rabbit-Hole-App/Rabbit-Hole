# Stable testing URL: gated main deploys itself to dev

**Owner:** Parallel (integration owner), with Home for environment verification.
**Status (2026-10-07):** the pipeline is built. Two things are still blocked:
- **Signed-in flows** wait on the separate migration request: `rabbit-hole-learn-dev` lacks learn migrations 0004–0010.
- **Access sign-in** waits on owner actions. Zero Trust is on with team `rabbit-hole.cloudflareaccess.com`, but the
  rabbit-hole API token can only read Access, and the Google OAuth client still needs the Access callback.

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
   - The Worker's current deployment message names the sha it serves.
   - The candidate must descend from that sha. The same sha is a no-op; an older or diverged one is refused.
   - The check runs twice, before the build and again just before the deploy.
   - A lock file stops two local runs from overlapping.
4. **Build and deploy.**
   - The build is the documented dev build: `VITE_COACHING_DEV`, `VITE_BYOC_DEV` and the notebook origin set before the build.
   - The deploy is `wrangler deploy dev-access-worker.js --config wrangler.dev.jsonc --name rabbit-hole-web-dev-small-parallel`, with the message `main <sha> build <hash>`.
   - The entrypoint is the dev worker with the Access bridge in front; see [Access](#access).
5. **Record.**
   - The Worker's deployment history (`wrangler deployments list --name …`) is the record of what is deployed.
   - Each run also appends `{"sha","gates","smoke","worker","version","at"}` to `<git common dir>/rabbit-hole-dev-deploys.jsonl`. This is the green dev record that `prod-release.mjs prepare` reads.
6. **Smoke and rollback.**
   - The smoke waits until the URL serves this build, then checks:
     - `/` and `/library` return 200;
     - the barrier refuses `/login`, `/auth`, `/logout` and `/test/session`;
     - a request without credentials is turned away;
     - signed-in `GET /api/apps` and `GET /api/profile` work.
   - A **fail** rolls back to the previous version (`wrangler rollback <version> -y`), with the message `rollback to main <sha>: …`.
   - A signed-in check that fails because the dev Learn database lacks tables the repository's `learn-migrations/` create is **blocked**, not failed. It is reported, never migrated.
   - nanoGPT and repository import are not checked: they are optional test data.

**Manual rollback:**
1. List the versions with `npx wrangler deployments list --name rabbit-hole-web-dev-small-parallel`.
2. Roll back with `npx wrangler rollback <version-id> --name rabbit-hole-web-dev-small-parallel -m "rollback to main <sha>: <why>"`.

Run both from `packages/web`, with the rabbit-hole token. Keep the `main <sha>` wording in the message, so that the next forward-only check knows what the URL serves.

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
3. **Downstream.** Every API and control-plane call then carries that session, and runs the normal account, workspace and
   ownership checks. The browser's `/login`, `/auth`, `/logout` and `/test/session` stay refused. Production authentication
   (`app-worker.js`, `rabbit-hole-cp`) is unchanged.
4. **The smoke identity.** The Access service token named by `ACCESS_SMOKE_CLIENT_ID` carries no email. It maps to the
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

**Setup.**
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
