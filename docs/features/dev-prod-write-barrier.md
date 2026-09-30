# Dev/prod write barrier (P0-B phase 1)

Status: code on `hotfix/dev-prod-write-isolation`. Nothing is deployed. No Cloudflare, Fly or secret state was
changed. The audit behind this work is `docs/dev-prod-storage-isolation-plan.md` (§3, §4, §7).

**Invariant.** A dev or review worker (`packages/web/dev-worker.js`: the shared `small-cp-dev` and every
`small-cp-dev-<worktree>` clone) never writes production D1, R2 or Fly state. It also never reads production
storage into dev history. It may read a short, documented list of production data through production
`small-cp`, and nothing else.

Line numbers below are for this branch. Production `small-cp` runs an older commit (e8af0661, 2026-09-16) that is
not in this repository. So every "reads only" proof below is for this branch's handlers. Re-check the proofs
against the deployed code, or deploy this branch's control plane (an approved step), before you rely on them.

## 1. The barrier

`dev-worker.js` answers its own routes first. Everything it does not answer goes through
`forwardToProduction` (`packages/control-plane/src/dev-forwarding.js`), the last line of `fetch()`.

- The barrier fails closed. A request reaches production only when its method and path match the allowlist.
  Anything else gets `403 {"error":"Blocked on this preview: it would change live state."}` and is never
  forwarded.
- The barrier does not go by HTTP method. Only the listed `GET`s and the five sign-in routes cross. `HEAD`,
  and every `GET` that is not listed, are refused.
- `dev-worker.js` calls `env.CONTROL_PLANE.fetch` in only one place: the barrier. A test pins this
  (`dev-barrier.test.js`).

### 1a. Allowed production reads

Each entry below is a `GET` handler that does these things only:

- It runs `SELECT`s on D1, or `get`/`list` on R2.
- It runs the shared request authentication: `cliAuth` :52 and `sessionOf` :60 check HMAC signatures, and
  `workspaceFor` :109 runs one `SELECT` on `workspace_members`.
- It makes no Fly, AWS, Slack, email or model call, and no `INSERT`, `UPDATE` or `DELETE`.

| Endpoint | Why the dev UI needs it | Data it exposes to the dev host | Proof it has no side effect (`index.js`) |
|---|---|---|---|
| `GET /` | Root link | none (302 to `/apps`) | router :2489 |
| `GET /api/workspaces` | Workspace switcher; identity fallback | caller's workspaces: slug, name, role | `apiWorkspaces` :119, one SELECT |
| `GET /api/watch` | The bell | open observations, caller's settled runs (3 days) | `apiWatchList` :1230: SELECTs through `appForUser` :526, `orgVisibleApps` :892, `memberRole` :73 |
| `GET /api/ask/threads`, `/api/ask/threads/<n>` | Legacy chat history for live apps (canvas history is answered on dev) | caller's own thread titles and messages | `apiAskThreads` :1286, `apiAskThread` :1337, `askThreadForUser` :1304: SELECTs only |
| `GET /api/runs/<id>` | Run page | run status, logs, input names | `apiRunGet` :2147: SELECTs, `RUNS.list`. No `sweepStaleRuns` |
| `GET /api/runs/<id>/outputs`, `/outputs/<name>` | Run outputs and charts (`ask.jsx`, `ChartBlock.jsx`) | output files of runs the caller can view | `apiRunOutputsList` :2020, `apiRunOutputGet` :2029: `runForUser` :2010 SELECT, `RUNS.list` / `RUNS.get` |
| `GET /api/apps/<name>` | App page; `authorizedBoardApp` and BYOC name checks | app metadata the caller can view | `apiAppGet` :546: SELECTs only |
| `GET /api/apps/<name>/deploys` | Deploy history | deploy rows | `apiDeploys` :1840: SELECTs |
| `GET /api/apps/<name>/runbook` | Runbook panel | runbook text | `apiRunbookGet` :668: `appForUser` SELECT |
| `GET /api/apps/<name>/learn-course` | Learn mounts a course for a live app | course row (owner, or approved revision) | `handleLearnCourse` (`learn-course.js`:62): `appForUser` plus one SELECT, returns before the POST branch |
| `GET /api/trash` | Trash; identity fallback (email) | names of deleted apps in the workspace | `apiTrash` :1624, one SELECT |
| `GET /api/org/ai` | Settings | provider, model, region, role ARN, base URL. The OpenAI key is masked `•••` | `apiOrgAiGet` :682, one SELECT |
| `GET /api/teams` | Settings | team names and member emails | `apiTeams` :1710, one SELECT |
| `GET /api/members` | Settings | workspace member emails | `apiOrgMembers` :1737: the POST branch is skipped, then two SELECTs |
| `GET /api/request-logs` | App request log | request log lines of a visible app | `apiRequestLogs` :1880: SELECTs |
| `GET /api/review` | Deploy review panel | stored review JSON | `apiReview` :333: `appRow` and `canView` SELECTs |

Production reads that the dev worker makes itself, not through the barrier:

| Call | Where | Proof |
|---|---|---|
| `GET /api/me` | `devIdentity` (`dev-forwarding.js`), used by repositories, canvases and BYOC | new route `index.js`:2350. It returns `{email, org, orgName}` from the authentication above. A test runs the real handler and records only SELECTs |
| `GET /api/workspaces` and `GET /api/trash` | `devIdentity` fallback while production does not have `/api/me` (§4) | rows above |
| `GET /api/apps/<name>` | `authorizedBoardApp` (`learn-board.js`), and the BYOC hosted-name check (`byoc.js` `hostedApp`) | row above |

### 1b. Sign-in bridge (allowed, not a read)

`GET /login`, `POST /login`, `GET /auth`, `GET /logout`, `POST /test/session` (`index.js` :2231, :2250, :2448,
:2259).

- They write no D1, R2 or Fly state. Magic links and sessions are HMAC-signed tokens, not rows.
- They stay allowed because dev identity is still production identity until the dev control plane exists
  (deployment step 5, §6). Without them no review clone could sign in.
- **Known gap.** These sessions are signed with the production `MASTER_KEY`. That is the P0 identity issue, and
  deployment steps 5 to 8 close it.
- **Owner decision.** Once production has `RESEND_API_KEY` (step 2), `POST /login` on a dev host sends a real
  email whose link points at the dev host. Removing `'POST /login'` from `SESSION` in `dev-forwarding.js` is a
  one-line change.

### 1c. Refused route classes

A refusal is always a JSON 403 and is never forwarded:

- **Every other POST, PUT, PATCH and DELETE:**
  - deploy, runs, stop, schedule, image
  - ask, approve, reject, `ask/file`, thread rename and delete
  - app PATCH and DELETE, restore, duplicate, rename, description, generate-runbook
  - learn-course POST on live apps, request-access
  - apps/find, runs/find, runbook POST and PUT, review/run
  - workspaces, members, teams, folders, share, unshare, org/ai POST, watch dismiss
  - CLI login and verify, runtime callbacks (`aws-creds`, run log, outputs, request-log ingest)
  - `/test/watch`, `/test/openai/*`
- **Side-effectful GETs:**
  - `GET /api/logs`: `apiLogs` :1850 calls `deployTokenFor` (`fly.js`:131). It mints a Fly deploy token,
    writes `apps.deploy_token`, and returns the token.
  - `GET /api/runs`: `apiRunsList` :2135 runs `sweepStaleRuns` :447, an UPDATE.
  - `GET /api/apps`: `apiApps` :450 runs the same sweep. The dev worker answers this route itself.
- **Customer AWS reads:** `GET /api/apps/<n>/s3-list`, `s3-object` and `role` (:1507, :1547, :730). Each one
  assumes the customer's role with production AWS keys, which writes CloudTrail and STS sessions in the
  customer's account.
- **Slack:** `GET /slack/oauth` (:1203) writes `slack_installs`. `GET /slack/install` (:1195) mints a
  MASTER_KEY-signed state for that callback. The `POST /slack/*` routes are refused too.
- **Customer apps:** `/a/<org>/<name>/*` with any method (`proxyApp` :2278). It forwards the request to the
  customer's Fly app with the production proxy secret, and what a GET does there is unknown.
- **Other:** runner input downloads (`GET /api/runs/<id>/inputs/<f>`), `HEAD` on any path, and any path not
  listed above.

Writes that the dev worker answers itself still work, on dev storage only. Examples are canvases (LEARN_DB),
repositories, Learn media (LEARN_MEDIA), boards and BYOC (BYOC_DB).

## 2. RUNS and LEARN_MEDIA

- `RUNS` (production `small-runs`) is removed from `wrangler.dev.jsonc` and `wrangler.parallel.jsonc`. No
  `packages/web` wrangler config binds a production bucket under any name (`learn-storage.test.js`). No dev
  feature needed the binding:
  - Run outputs are read through production `small-cp` (§1a).
  - `getBundle` (`ask.js`) returns null without RUNS.
  - Mentions no longer read live apps on dev (§3).
- `learnMedia(env)` is `LEARN_MEDIA || RUNS`. Production has no LEARN_MEDIA, so it keeps `small-runs`
  unchanged. On a dev worker, RUNS is unbound, so without LEARN_MEDIA `learnMedia` is `undefined`. Callers then
  refuse (503, 404 or empty) or throw. None can fall back to production.
- Every dev entry point refuses without `LEARN_MEDIA`:
  - `dev-worker.js` fetch returns 503.
  - The queue consumer throws.
  - The `LearnVideos` and `LearnScenes` alarms throw before they poll or render (new). The job keeps its
    ticket and status, so there is no paid resubmission, and the retried alarm continues once the binding is back.

## 3. DB-unbound behaviour

Production D1 (`DB`) is still bound on the dev configs, because removing it was not in this scope. The dev code
paths no longer depend on it:

- **@-mentions in `apiAsk`.** On a seam turn (a canvas, which only a dev worker sends), or with no `DB`, a
  mentioned app is not looked up. The context says `Mentioned app <name>: not available to this chat (live apps
  are not read on this preview).` There is no crash, no production read and no fallback.
- **Repository asks.** They read mentions from `LEARN_DB`, and never read `DB`.
- **Repository courses.** They run `handleLearnCourse` with `DB` set to `LEARN_DB`.
- **Org AI.** `aiSettings(env, org)` returns null when `env.DB` is unbound. Before, `env.DB.prepare` threw a
  TypeError that the `.catch` missed. Repository course drafts now pass no org, so a dev worker never reads a
  customer's `org_ai` row (their OpenAI key or Bedrock role) and uses the configured default provider. Learn
  chat, boards, artifacts and grading already passed no org.
- **Other `DB` fallbacks.** `learnMomentsDb` still falls back to `DB` when `LEARN_DB` is missing. Every dev
  config binds `LEARN_DB` (a test pins this).
- **Regression check.** The dev-worker routing tests bind `DB` to a recorder that records every statement, and
  assert that it recorded none.

## 4. Identity until `/api/me` is deployed

`devIdentity` asks production `GET /api/me`. Production does not have that route until its next approved
deploy, so today it answers 404. On a 404, `devIdentity` builds the identity from two reads that are both on
the allowlist:

- `GET /api/workspaces`: `active` gives the org, and that entry's name gives `orgName`, or null for the
  email-domain workspace.
- `GET /api/trash`: `email`.

A 401 or 403 is passed through as sign-in required. The dev worker never calls `GET /api/apps` on production.
One visible effect: the dev catalog (`GET /api/apps` on a dev host) lists dev apps only, meaning repositories
and canvases, with `folders: []`. A live app still opens by name through `GET /api/apps/<name>`. Once `/api/me`
is live in production, delete the fallback (marked `ponytail:` in `dev-forwarding.js`).

## 5. Regression mechanism

`packages/control-plane/test/dev-barrier.test.js` imports the real `dev-worker.js` under node.
`test/worker-import.js` registers module hooks that load the `.html` and `.py` text imports. Each test gets a
recording environment:

- `CONTROL_PLANE` records every request.
- `DB` and `RUNS` are the throwing recorders from `live-storage-spy.js`.

After every test, the checks assert these things:

- `DB` recorded no statement.
- `RUNS` recorded no call.
- Every request that reached production is allowlisted, or is `GET /api/me`.

The tests cover refused writes, refused side-effectful GETs, each allowed read, dev-handled writes, a canvas
Learn ask with a mention, and the dev catalog. Each fix was first shown failing on the previous code.

## 6. Target topology and deployment order (locked)

**Topology, in the rabbit-hole Cloudflare org:**

- **Production control plane.** Production D1, R2 and `MASTER_KEY`, and no test bypass.
- **Dev control plane.**
  - A dev main-schema D1, built from `schema.sql` plus the full migration chain (including 0015-watch and
    0016-slack), with synthetic fixtures only.
  - Its own dev-only resources.
  - A separate dev `MASTER_KEY`, and the test-session path.
- **Review and dev web workers.** They write only to the dev control plane and dev storage.

**P0-A/P0-B deployment order:**

1. Home fail-closed auth, and its review.
2. `RESEND_API_KEY` and `EMAIL_FROM` on production.
3. Deploy the auth hotfix.
4. Remove `TEST_BYPASS_SECRET` from production.
5. Dev control plane with its own `MASTER_KEY` and test-session path.
6. Repoint the review and dev workers to it.
7. Verify that no review or test flow depends on production auth.
8. **Required maintenance step:** rotate the production `MASTER_KEY` in a planned window. This revokes
   clone-minted sessions, CLI tokens, in-flight run tokens, magic links and Slack OAuth states. Pick a time
   when no job is running, and tell CLI users to sign in again.

## 7. Quarantined workers

`small-cp-dev`, `small-cp-dev-smart-landing-page` and `small-cp-dev-small-deploy` run code older than these
guards. They bind `RUNS`, and have no `LEARN_MEDIA` or `REPOSITORY_SNAPSHOTS` (plan §1).

- Run no write tests against them.
- They are not deleted. Redeploying or deleting them needs the owner's approval.

## 8. `small-runs` test-data policy

- A read-only inventory of dev artifacts in `small-runs` comes later. It covers the `*-dev/` prefixes and the
  shared prefixes that need correlation (plan §9).
- Any deletion needs a manifest that the owner approves.
- Nothing is deleted now.

## 9. Dev-only resources to preserve

Keep these: `small-learn-dev` (D1), `small-byoc-dev` (D1), `small-learn-media-dev` (R2),
`small-repositories-dev` (R2), `small-learn-moments` (Vectorize) and `small-learn-index` (Queue).
