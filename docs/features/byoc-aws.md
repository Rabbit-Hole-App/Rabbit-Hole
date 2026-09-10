# AWS BYOC: CPU jobs in one workspace connection

[Cognito setup reference](byoc-cognito-reference.md) preserves the user-provided
React examples and records the verified pool settings. The private installation
uses that pool through `oidc-client-ts`; the token-display sample is not shipped.

The customer-hosted slice moves Small's UI, login, API, and workspace metadata
into customer AWS. See the
[customer-hosted implementation plan](../../tasks/plan.md) and
[task checklist](../../tasks/todo.md).

## Private installation: first dashboard milestone

First milestone on 2026-09-09: internal release `0.1.0-pilot.1` was deployed at
**[Small AWS](https://d3sgti338uxlc.cloudfront.net/apps)**. This release supports
Cognito sign-in and an empty local workspace in the existing Apps interface.
That first release did not deploy or run jobs. On 2026-09-09, the user confirmed that
sign-in to the deployed Small dashboard works. Separate live refresh/logout
confirmation remains outstanding; those paths pass the automated browser checks.

- Target: **Amazon account `503561429929`, `us-east-1`**. The remote dev box's
  `default` profile was verified as `DrishtiAdminRole`. Windows has no such
  profile; installation runs over SSH on the user-provided Amazon dev box.
- **`637423432890` is the user's personal account. Never use its credentials,
  installer, trust principal, or hosted connection for Amazon deployments.**
- Stack: `small-private-byoc`; initial workspace `w-small-aws` / **Small AWS**.
  The existing confirmed Cognito user `cyudhist@amazon.com` is its initial owner.
  Initial stack status was `CREATE_COMPLETE`; distribution `E3PCNTVI41XBAB`, API
  `13bbxg9r6b`, metadata table `small-private-byoc-Metadata-AI3GZ98RP94P`, and web
  bucket `small-private-byoc-webbucket-u96wrqr0jzim` belong to the Amazon account.
- Customer S3/CloudFront serves the existing React dashboard. API Gateway checks
  Cognito JWTs and the `openid` scope before invoking customer Lambda. Lambda
  checks the exact issuer, client, access-token type, expiry, and DynamoDB
  membership on each request. Matching an email domain grants no access.
- `/api/auth/config` contains public login configuration only. Catalog,
  workspace, and member responses come from customer DynamoDB. Other actions
  return an explicit unsupported response and never proxy to hosted Small.
- Tokens stay in browser memory; only the one-use PKCE transaction uses session
  storage. Reload uses Cognito's login session. The callback consumes its state
  before the shared router runs; logout returns to this installation's login.
- No external ConnectionRole, hosted signer, public Lambda Function URL, or
  runtime Cloudflare/Fly/D1/R2 service exists in this stack. The Lambda role can
  read its metadata table and write its logs. S3 permits only this distribution's
  service access and denies insecure transport. API responses are not cached.
- These are authenticated AWS HTTPS endpoints, not a claim that traffic stays
  inside a VPC. Cognito login and CloudFront are reachable over the internet.

### Private release files and installation

| File | Purpose |
| --- | --- |
| `packages/web/src/private-auth.js`, `PrivateAuthGate.jsx` | Code/PKCE, callback, in-memory session, sign-out; preserve the existing app shell |
| `packages/web/src/api.js`, `app-data.js` | Private same-origin transport and local catalog; hosted behavior remains available in hosted builds |
| `packages/byoc/private_api.py` | Explicit subject membership and read-only dashboard routes |
| `packages/byoc/private-template.mjs` | Customer web, API, metadata, and restricted service policies |
| `packages/byoc/package-private.mjs` | Versioned web/backend/installer artifacts plus SHA-256 manifest |
| `packages/byoc/install-private.py` | Customer AWS CLI installer; checks account/checksums and preserves existing Cognito settings |

Build with `VITE_PRIVATE_BYOC=true` into `packages/web/dist-private`, then run
`node packages/byoc/package-private.mjs <installation-config.json>`. The
installation configuration supplies the verified account, region, pool, client,
domain, stack/workspace names, initial owner email, and release version. Internal
pilot packages live under ignored `.small/byoc-private/releases/<version>`.

Run the packaged installer where the customer's AWS CLI profile exists:

```sh
python3 install-private.py inspect --account-id 503561429929 --profile default
python3 install-private.py deploy --account-id 503561429929 --profile default
python3 install-private.py status --account-id 503561429929 --profile default
# Once the stack is CREATE_COMPLETE or UPDATE_COMPLETE:
python3 install-private.py finish --account-id 503561429929 --profile default
```

The installer clears environment access keys, explicitly selects the profile,
and refuses an STS account mismatch before mutation. It only updates an existing
stack carrying the installation's Purpose tag. `finish` initializes the owner
without promoting existing members, appends the exact callback/logout URLs,
preserves all existing writable app-client settings, and uploads the web assets.
The package needs Python stdlib and the AWS CLI on the installation machine;
it needs neither Node nor a source checkout. Assets and metadata are retained
if the stack is removed. No existing AWS job installation is migrated or removed.

Private local previews must also set `VITE_PRIVATE_BYOC=true`; this disables
Vite's hosted proxy. The shared Cloudflare dev build keeps private mode off
and preserves both existing dev flags. It cannot demonstrate Amazon isolation.

### Private milestone checks

- 8 API tests: token/context checks, explicit membership, workspace isolation,
  catalog visibility, response contracts, unsupported mutations, and safe errors.
- 6 infrastructure tests: no external account Allow, scoped JWT routes, no API
  cache, authorization forwarding, durable resources, and SPA callback routes.
- 6 installer tests: account mismatch, corrupt package, unrelated stack,
  no silent member promotion, and preserved Cognito settings/return URLs.
- 8 auth helper tests and 5 existing AWS app-adapter regressions.
- 2 isolated browser tests use the real OIDC client with synthetic provider/API
  replies: login, existing dashboard, reload, logout, missing/replayed state,
  no persisted tokens, and no hosted network requests. These do not establish
  a real-user Cognito sign-in. The user separately confirmed that sign-in works
  at the deployed AWS URL on 2026-09-09.
- Private production build passes. The new OIDC dependency has no reported
  advisory in the npm audit at this checkpoint. Existing transitive advisories
  remain in diagram/editor packages and dev tooling; no forced dependency
  upgrade is included. Those features are not activated in this dashboard slice.
- Live AWS checks: `/apps` serves the SPA with its security headers;
  `/api/auth/config` returns the intended issuer/client; missing and invalid
  bearer credentials are rejected with HTTP 401. The real Cognito page shows
  **Email address → Next**.
- An administrator-invoked Lambda diagnostic reads the real DynamoDB workspace
  and returns its owner and zero apps. This proves the installed backend/data
  wiring, not a real-user JWT login. Cognito's original callback and scopes are
  retained alongside the new callback and logout URLs.
- Shared UI build deployed to `small-cp-dev` as version
  `57a96323-3d5f-4a67-b309-360991af744f`, with both preview flags preserved and
  private mode off. Production and public npm packages were not changed.

<!-- ponytail: private CLI login, job deployment/run/sharing, local S3 approval,
additional member onboarding, and hosted integrations follow this milestone. -->

## Private installation: CLI and CPU milestone

The user approved connecting the CLI and proving one CPU app after confirming
dashboard sign-in. Internal release `0.1.0-pilot.3` is installed in
`503561429929`, `us-east-1`, at the same CloudFront URL. Real CLI sign-in,
sample deployment, run, log retrieval, and output download passed. The stack
is `UPDATE_COMPLETE`. This slice does not complete the later
sharing and S3-approval tasks in the full checklist.

- `packages/cli/lib/cognito.js` uses Node's crypto, HTTP, and fetch APIs for a
  loopback code/PKCE login. It validates state, signed Cognito ID/access tokens,
  issuer/client, nonce, expiry, and workspace membership before saving a login.
  The CLI binds credentials to one HTTPS origin and does not reuse hosted
  `SMALL_TOKEN` credentials or fall back after a private authentication failure.
- The private gateway authorizes membership and app ownership, then invokes an
  internal job Lambda through its IAM role. That Lambda uses the existing
  `packages/byoc/api.py` engine. It has no public route, function URL, hosted
  signer, signing secret, or external account principal.
- Deploy uses customer S3, CodeBuild and ECR. Fargate jobs run in a private
  subnet with S3/ECR/CloudWatch endpoints. The existing Run and Logs components
  use the private `/api/jobs` routes and customer S3 output links.
- App creation/deployment is restricted to the owner for this pilot. Membership
  is checked on each request; existing visibility rules apply to reads/runs.
  No extra S3 folder permissions are enabled in this release.
- Templates larger than CloudFormation's inline limit are staged in a separate
  private customer S3 bucket owned by `small-private-byoc-releases`. Backend
  templates and the CLI archive are not published with the web assets.

Package the private web build and the locally packed CLI together:

```text
npm pack --workspace packages/cli --pack-destination .small/byoc-private/cli
node packages/byoc/package-private.mjs <installation-config.json> .small/byoc-private/cli/small-deploy-0.0.9.tgz
```

CPU configuration adds `jobs: true`, a stable 32-hex `installationId`,
`jobName`, and `cliRedirectUri: "http://127.0.0.1:8766/auth/callback"`.
Reuse that installation ID for upgrades. Each release has a new version and
SHA-256 manifest, including `small-deploy.tgz`. When transferring a Windows ZIP
to Linux, normalize ZIP entry separators to `/` within the release directory.
Use the same `inspect`, `deploy`, `status`, and `finish` installer commands
above. `finish` preserves existing Cognito callbacks and adds the CLI callback.

Install the supplied CLI with `npm install -g ./small-deploy.tgz`, then:

```text
small login --api https://d3sgti338uxlc.cloudfront.net
small workspaces
small deploy --workspace w-small-aws
small run aws-private-proof --workspace w-small-aws --count 8
small logs aws-private-proof --workspace w-small-aws
small run aws-private-proof --workspace w-small-aws --download ./out
```

Run deploy from `examples/byoc-private-cpu` (or an equivalent project with
`type = "job"` and `[deploy] target = "aws"`). Clear a conflicting `SMALL_API`
override or set it to the same AWS origin. The CLI login link must be opened
on the computer running the command. Public npm and production remain unchanged.

Focused verification before AWS update: 25 Node CLI/template tests and 42
Python engine/API/installer tests passed. Coverage includes wrong-account
refusal, foreign/unshared apps, deploy permissions, token origin binding,
invalid state/signature, legacy authentication, and private artifact staging.
The private web build passed. Browser checks cover the actual OIDC client and
existing dashboard login/reload/logout/replay paths with synthetic replies.
The additional CPU browser check caught missing account metadata and an
unstable request adapter; both are fixed. That check now passes the existing
Run form, run panel, log line, report link, and Logs table, with no hosted requests.
After the real login, 18 CLI authentication/workspace/deployment regressions
also passed with fixture config isolated from the user's saved credentials;
the five existing web adapter tests passed.

Real proof on 2026-09-09 (local time):

- The user completed CLI Cognito sign-in as `cyudhist@amazon.com` for `w-small-aws`.
  The live API returns this app's hosting account as `503561429929`.
- App: [aws-private-proof](https://d3sgti338uxlc.cloudfront.net/apps/aws-private-proof).
  Deployment `d-1789013429327-d057c38a82b6` built in customer CodeBuild and is ready.
- Run `r-1789013587930-68fb628c493f` ran on Fargate and exited `0`.
  The CLI retrieved its CloudWatch output and downloaded the 74-byte `report.json`
  from customer S3. Its checked values are `count: 8`, `sum_of_squares: 204`,
  and `label: "Private AWS proof"`.
- Customer data bucket: `small-private-byoc-databucket-7siqli2pchdw`;
  internal job API: `small-byoc-7f3da1e29839-api`. The later package preserves
  the same workspace, app, data bucket, deployment, and run.
- Final private dashboard was published with `install-private.py finish` for
  `0.1.0-pilot.3`. The CLI package is included in that release; no public npm
  publication or production promotion was performed.
- Shared dev UI version `9aee52fd-39da-46b3-9556-6376e743a01c` preserves both
  preview flags and private mode off. It includes the requested **Type** label.

## Existing hosted preview

The remaining sections describe the **legacy personal-account dev preview**.
Its external-role trust and Cloudflare login/grant flow must not be used for
the Amazon installation above.

Distribution is planned as versioned Small installation packages under a
commercial subscription, following the Retool self-hosted model. The immediate
deliverable is the working private BYOC pilot and a reproducible internal
release; billing and license-key enforcement are later work.

## Approved scope

Prove install → connect → deploy → run → view logs and outputs for one CPU job
in one AWS account. The first proof uses account `637423432890`, `us-east-1`.
The user approved an authenticated AWS HTTPS endpoint for this MVP. Jobs run in
private subnets; a corporate VPN is not required for the dashboard or CLI.

The next accepted slice reuses that connection for multiple CPU-job apps in
`us-east-1`. Keep the existing `aws-cpu-proof` app and its history, deploy a
second app through the same installation, and show both in the normal sidebar.
The current accepted slice lets a new workspace connect a different AWS account.
Setup asks for its 12-digit account ID and the first app name. The user starts in
Small, approves the CloudFormation stack in their AWS console, then returns to
Small to finish verification. Keep one connection per workspace, multiple CPU
jobs, `us-east-1`, and the existing connected apps. No AWS keys are collected.

The CLI/skill follow-up adds explicit workspace selection and documents this
flow for coding agents. It remains a dev preview. Commit and push the work to
main; public npm publication and production promotion remain held.

The next accepted slice adds one read-only S3 folder per CPU-job app. The coding
agent declares `[aws] s3_read = "s3://bucket/folder/"`; deploy prepares an update
to the existing installation when that app's access changes. The installer
approves the update in AWS and retries deploy. Unchanged approved permissions
need no further stack update. The first test uses a sample CSV in `test-ws`.
Keep this on dev, in the connected account and `us-east-1`.

The accepted follow-up replaces per-folder AWS console updates with approval
inside Small. Existing installations receive one AWS-owner-approved template
upgrade; new installations include it. The installer reviews the exact folder
under Settings → Connections → AWS and selects **Approve & deploy** or **Cancel**.
The CLI waits up to 30 minutes before uploading source and resumes after approval.

### Approval in Small acceptance

- [x] Add an IAM-only customer Lambda restricted to installation-specific app roles.
- [x] Require an immutable S3-read-only permissions boundary on role creation and updates.
- [x] Keep existing stack resources and grants through the one-time upgrade.
- [x] Bind approval to the installer, workspace, app, exact folder, and request ID.
- [x] Record approval in customer DynamoDB; block incomplete changes and allow exact retries.
- [x] Preserve normal app/settings UI; add approval, cancellation, and CLI automatic resume.
- [x] Test viewers, stale/replayed requests, cancellation, failure recovery, and role isolation.
- [x] Build and deploy dev; prove the upgrade and a CSV app through the real approval UI.

The new handler cannot change the stack, its own role, the boundary, or other
installation roles. Its IAM authority is CreateRole/GetRole/PutRolePolicy only
under `small-s3-<installation>-*`. CreateRole and PutRolePolicy require the exact
boundary. The boundary explicitly denies actions other than S3 GetObject and
denies objects outside the customer account/region. The generated inline policy
allows only the reviewed folder and explicitly denies other folders.
See [AWS permissions boundaries](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html).

The metadata table holds current overrides and an audit record per approval.
A conditional state write claims the request before IAM changes; a transaction
commits current access and its audit together. API reads are consistent and
block the affected app while a change is incomplete. Small claims its pending
request before invoking AWS, so Cancel cannot race a started approval. A failed
approval keeps **Retry approval** available; it never silently grants access.
Existing CloudFormation-managed app roles are retained during migration. New
runs use current overrides; already running work is not terminated. Managed
roles are denied all access when their grant is removed.

<!-- ponytail: retired managed roles and approval audit rows are retained in the
customer account. Automated cleanup/retention and stopping running tasks are deferred. -->

### S3 access acceptance

- [x] Reject wildcard/bucket-wide or unsupported permission declarations before upload.
- [x] Generate a reviewable stack update, retaining the other apps' approved access.
- [x] Require AWS-observed approval; a Small request or registration callback grants nothing.
- [x] Give each approved app its own read-only task role; other apps retain no data access.
- [x] Re-check permissions when deploying and running, including older deployments.
- [x] Show pending access requests and their approval controls in the existing AWS connection settings.
  The user removed the static approved-folder list; hide the section when there
  is no upgrade, pending request, result notice, or error. Existing AWS grants stay intact.
- [x] Prove the sample CSV report, denied access outside its folder, and unchanged normal outputs.
- [x] Update CLI/skill instructions, run focused tests, review, and deploy dev.

<!-- ponytail: this slice supports GetObject of explicit keys only. Bucket listing,
writes, KMS decryption grants, cross-account/cross-region buckets, and multiple
folders per app are deferred. -->

Small may hold connection metadata and deployment status. Source, input values,
output files, build logs, and run logs go directly between the client and the
customer's AWS account. No deploy review, runbook generation, or Coaching model
call may send this job's content through the hosted control plane.

## Implementation

- A CloudFormation installer provisions one job environment: private Fargate
  tasks, ECR, S3, CloudWatch, CodeBuild, a small authenticated Lambda HTTPS API,
  and separate API/build/execution/task/connection IAM roles.
- Connected jobs join the existing Apps list and sidebar. They use the same app
  page, Run form, Logs table, run side panel, and enlarged run page as other jobs.
  Setup lives inside Settings → Connections → AWS. There is no separate feature
  page; the old `/aws` route redirects to `/apps`. Existing Fly apps and production
  routes keep their behavior. Dev connection records have their own D1 database.
- The AWS connection heading has a neutral `!` icon. Hovering or focusing it
  shows the source/input/log/output privacy explanation in the shared tooltip.
  AWS and Slack use the same `SettingsRow` component with actions aligned right.
  A right-aligned **Connected** button replaces the app shortcut and opens the
  shared confirmation modal with **Disconnect** and **Cancel**. Only the installer
  can confirm disconnect. Cancel leaves the connection unchanged.
- Pending setup has one **Open AWS installation** button. It refreshes the
  installation link and opens AWS in a new tab, or in the current tab if the
  browser blocks the popup. There is no second installation link.
- Disconnect marks only the connection metadata as disconnected and removes the
  jobs from the workspace catalog. It blocks new access grants while preserving
  the AWS installation, active jobs, and all customer data. Existing grants and
  output links expire within three minutes; already running work continues.
  **Connect AWS** verifies and reconnects the retained installation.
- A connection belongs to the authenticated small workspace and its installer.
  The installer can deploy; workspace members can run and inspect these jobs.
  The first proof is workspace-visible; private/share-list AWS jobs are deferred.
- New setup accepts a 12-digit customer account ID; it never defaults to the
  operator's account. `us-east-1` remains the only region. A pending setup can be
  corrected before registration; changing its account or app name rotates the
  installation identity and external ID so the old template cannot register.
  An installed, connected, or disconnected account cannot be replaced in place.
- The hosted connection role can verify the installation and invoke the IAM-only
  signer and, after upgrading, the bounded S3 approval handler. It cannot read
  the signing secret, source, job inputs, outputs, or logs. A unique
  installation external ID binds STS assumption to the owning workspace.
- The platform IAM user can assume installation connection roles in customer
  accounts only when an external ID is supplied. Each installed role separately
  trusts the exact platform principal and its own randomly generated external
  ID, following [AWS's third-party access pattern](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html).
  Registration must match the selected account, region, and installation ARNs.
  Authenticated connection verification checks the signer metadata and completed
  stack before issuing grants. Small never receives customer AWS access keys.
- Short-lived signed grants authorize the AWS API. It validates signature,
  expiry, installation, workspace, and operation before using any AWS service.
  Browser grants stay in memory; the API never logs request bodies or tokens.
- `small deploy` recognizes connected AWS apps before any Fly or hosted-review
  path. Packaging excludes secrets and symlinks. Source uploads go directly to
  S3; CodeBuild builds the image in the customer account. Fargate runs a pinned
  image with 1 vCPU and 2 GiB of memory.
- `small workspaces` lists the authenticated user's workspace slugs.
  `--workspace <slug>` selects one for a command; `SMALL_WORKSPACE` is a shell
  default and the flag wins. Selection is checked against membership before
  app requests and then confirmed against the server's active workspace,
  preventing an old server or unknown-slug fallback from redirecting a
  deployment. JSON, form, and binary requests carry the workspace header.
  Login stays unscoped; the AWS transport continues using only its signed grant.
  Deploy prints workspace/account/region, and the output-download hint retains
  the selected workspace. No selection keeps the email-workspace default.
- [The deployment skill](../../skills/small/SKILL.md) branches to
  [AWS hosting instructions](../../skills/small/references/aws-hosting.md)
  before running init, so source is never sent to hosted runbook generation.
  The older AWS role/compute references remain for hosted apps calling AWS.
- One installation now serves multiple app names. Deployment and run records
  for new apps live under `apps/<name>/` in customer S3; the original app keeps
  its paths and history. Each deployment pins its task definition revision and
  image digest. Archives use globally unique IDs under `sources/`, matching
  the existing build-role permissions. Run uploads are limited to that app/run.
- The browser loads app names directly from the AWS API and keeps separate
  request adapters for each app. `small.toml` with `[deploy] target = "aws"`
  selects this connection for a new CPU job. Hosted app-name collisions fail
  before source upload. Disconnect removes all connected AWS apps from the
  catalog; reconnect restores them.
- AWS builds use the Docker Official Python image from
  [Amazon ECR Public](https://aws.amazon.com/blogs/containers/docker-official-images-now-available-on-amazon-elastic-container-registry-public/).
  This avoids the Docker Hub pull-rate limit encountered during the second app proof.
- The default task role has no data permissions. S3-approved apps receive their
  own task role with only `GetObject` under the declared folder, constrained to
  the installed account and region. The API chooses the role from AWS-installed
  metadata and rechecks it for every deploy and run. Clients cannot pass role ARNs.
  The task sends stdout through the ECS
  log driver and receives presigned uploads limited to its own output prefix and
  completion record. Run payloads stay in S3. The dashboard
  reads the AWS API directly and downloads outputs from short-lived S3 URLs.
- `packages/web/src/app-data.js` merges connection metadata and AWS app names into the app
  catalog and adapts direct AWS requests to the existing run components. Unknown
  AWS operations fail without falling back to hosted data endpoints. AWS runbook
  and Agent tabs explain that these features are not connected yet. Native app
  sharing, editing, and Agent controls retain their existing behavior.

The first installer creates its own VPC. CodeBuild uses AWS-managed build
networking to fetch public Python/container dependencies. Tasks have no public
IP or NAT route; their AWS traffic uses VPC endpoints. This is customer-account
hosting, not a promise that every AWS managed service lives inside the VPC.

## Acceptance checklist

Current different-account slice:

- [x] Accept a customer account ID instead of the operator account constant.
- [x] Keep installation, role, region, owner, and workspace verification strict.
- [x] Permit the platform to assume only installation connection roles across accounts.
- [x] Show the AWS approval steps in the existing Settings connection flow.
- [x] Test new-account setup and preserve the existing connected apps on dev.
- [x] Record the boundary between automated checks and a live second-account installation.

CLI/skill follow-up:

- [x] List workspace slugs and select one explicitly for authenticated commands.
- [x] Reject unknown slugs before app access; keep `--workspace` out of job inputs.
- [x] Show the deployment workspace, account, and region before uploading source.
- [x] Document setup, workspace selection, data boundaries, and MVP limits in the skill.
- [x] Verify the local CLI package/skill payload and record final checks.
- [x] Commit and push main, keeping the release on dev.

Current multiple-app slice:

- [x] Deploy and run a second CPU-job app using the existing connection.
- [x] Keep each app's schema, deployments, runs, logs, and outputs separate.
- [x] Preserve the original app and existing run/output history.
- [x] Reject cross-app record access and viewer deployment attempts.
- [x] Deploy dev and verify both apps through the existing app interface.

- [x] Install a reviewable CloudFormation stack in the approved account.
- [x] Connect it to the authenticated workspace without copying resource IDs.
- [x] Reject forged/expired grants, another workspace, and non-owner deploys.
- [x] Deploy a CPU job without sending its source to small/Fly/models; exclude known credential files.
- [x] Start the job and show its actual status and CloudWatch log.
- [x] Download and verify an actual output from customer S3.
- [x] Build and deploy the dev dashboard for visual review.
- [x] Review IAM/data boundaries and run focused regression tests.
- [x] Record live resource identifiers and proof results below.
- [x] Integrate the job into the existing Apps/sidebar and deploy the dev UI.

## Deliberately deferred

<!-- ponytail: one connection per workspace in us-east-1; changing an already installed connection's account, arbitrary resource grants,
existing VPC selection, GPU/server workloads, schedules, file-input forms,
app secrets, and Coaching in AWS need their own accepted slice. -->

## Verification

Dev UI cleanup, 2026-09-09: the user removed the static list of approved S3
folders because it offered no action. The idle section is hidden while new
permission requests and their existing controls still appear automatically.
No AWS permissions were changed. Dev version
`c402091f-e052-4175-a82f-863378d01ce3`; build and all 31 unit tests passed.

Approval in Small follow-up, 2026-09-09:

- Dev version `37a0ce41-779c-460a-96b9-655c5849e046` includes approval/cancellation,
  the one-time upgrade flow, and automatic discovery of requests while Settings
  is already open. Both preview flags remain enabled. Production and npm are held.
- The reviewed change set `small-access-upgrade-c9347a29800f` upgraded the existing
  `test-ws` installation to `UPDATE_COMPLETE`. It added the approval Lambda,
  role, boundary, log group, and metadata table. Existing VPC, bucket, build role,
  execution role, app roles, and grants were retained. This was applied through
  the AWS SDK after review; the full AWS console wizard is not claimed tested.
- A real CLI deployment of `aws-s3-approval` paused for approval. Clicking
  **Cancel** in the dev browser stopped it before source upload or creation of
  an AWS deployment. A second attempt resumed the same CLI process after
  **Approve & deploy**, without a second command or another stack update.
- Deployment `d-1789000778585-e37a9e89cce7` is available in the normal app UI at
  [aws-s3-approval](https://small-cp-dev.zeroshothq.workers.dev/apps/aws-s3-approval).
  Run `r-1789000832258-8e023a87c1b5` produced the five-row CSV report, total `94.30`.
  Run `r-1789000828736-51069f2ba37e` tried the adjacent folder and received
  `AccessDenied`. Both existing apps retained their previous deployment IDs.
- Approval `c2fa20b87cfb4bc080a7c80817e648ab` was independently read from customer
  DynamoDB: installer, app, exact folder, and timestamp were recorded.
- 37 focused Node tests, 35 BYOC Python tests, and all 31 repository unit tests
  passed. The real browser/CLI/CSV proof passed. Review fixed compatibility
  with old deployments and made the open Settings panel discover new requests.
  The final panel/navigation check uses simulated metadata and AWS navigation;
  it does not grant access or exercise the AWS console wizard.

S3 access slice, 2026-09-09:

- Dev version `d1ee690c-1021-40f7-b184-e7a7ac802ce5` serves the approval UI
  and metadata endpoints. Both preview flags remain enabled. Only the separate
  dev database gained `access_requests`; production and npm releases stay held.
- The CLI requests only app name and desired S3 folder from Small, before any
  source upload. Small stores one pending update per connection and generates
  an immutable template. It reads the installed signer metadata and completed
  CloudFormation status to confirm approval. Repeated deploys reuse approval;
  changed or removed access requires a new update. Other apps' grants are kept.
- The new task roles grant only `s3:GetObject` in the approved folder, with
  account/region conditions. The shared role remains empty. Run-time role
  overrides prevent old task definitions from retaining a superseded grant;
  deployments with no requested S3 access use the empty role. No source, input
  values, logs, or outputs go through the hosted control plane.
- Live proof uses `test-ws` (`w-test-ws`), account `637423432890`, stack
  `small-byoc-1f1a024bd89d`, and bucket
  `small-byoc-1f1a024bd89d-databucket-nsztsawbpbxn`. The reviewed update added one
  app role and updated API permissions/code and signer metadata. The VPC, bucket,
  and existing app deployment were preserved; the stack reached `UPDATE_COMPLETE`.
- [aws-s3-report](https://small-cp-dev.zeroshothq.workers.dev/apps/aws-s3-report)
  reads `small-samples/s3-report/sample.csv`. Run
  `r-1788998315776-c381ef274281`, started through the existing Run form, produced
  `report.json`: 5 rows, total sales `94.30` (East `42.30`, North `25.00`, West
  `27.00`). Browser download and sidebar checks passed without JavaScript errors.
- Run `r-1788998312048-b70b909696ce` tried an existing sample CSV in the adjacent
  `small-samples/s3-report-denied/` folder. AWS returned `AccessDenied`; there
  was no report output. API tests additionally cover another app requesting the
  same grant, client-supplied role ARNs, and old/revoked deployment access.
- The pending approval panel was checked in a real isolated browser with real
  dev metadata. AWS console navigation was stubbed for that UI check. The exact
  generated template was applied through a reviewed AWS SDK change set for the
  live proof; the full customer AWS console wizard is not claimed tested.
  Small exposes a copyable template URL if AWS does not prefill it.
- CLI, customer API, permission/template, web adapter, and browser checks pass;
  `make test-unit` passes all 31 tests. Review added an idempotent callback for
  an already connected stack, with no state write or grant, and fixed the skill
  lint to scan BYOC code and recognize environment-variable names containing digits.
- AWS behavior references: [task role overrides](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_TaskOverride.html),
  [S3 account/prefix conditions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazon-s3-policy-keys.html),
  and [reviewing a stack update in the console](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-direct.html).

Use the repository CLI for this slice. In the sample app, enter an S3 key inside
the approved folder and click **Run**; **Logs** shows both the successful report
and the deliberate denied-access test. New access requests appear under
**Settings → Connections → AWS → S3 access** for approval; the static list of
already-approved folders is no longer displayed. The reusable source and declaration
example are in `examples/byoc-s3-report`; replace its example bucket before use.

CLI/skill follow-up, 2026-09-09:

- CLI tests cover workspace listing, explicit flags, shell defaults, precedence,
  invalid selections, JSON/form/binary headers, and direct AWS data transport.
  The output-download hint keeps the workspace. Both local npm archives install
  identical current skill/reference files; the CLI archive includes the AWS
  transport and runtime. No package was published to npm.
- The live read exposed a shared-backend gap: `cliAuth` returned the email
  workspace embedded in the token and ignored the workspace header. Browser
  login already resolved workspace membership correctly. The fix
  reuses that same resolver for CLI authentication; three tests cover member,
  nonmember/default, and invalid-token behavior.
- The CLI verifies the server's active workspace before any app request. An old
  server stops with `Server did not select workspace` instead of uploading into
  another account. The user separately approved the shared authentication fix.
  It is deployed to `small-cp` as `2323101b-89d0-4691-917a-6c567debbd4d`.
  The auth-only deployment used the exact current production frontend assets;
  Wrangler uploaded no changed assets, and all 133 files matched afterward.
  AWS features and UI remain on dev; no public npm release was made.
- Workspace listing on dev returned `w-test-ws` for the user's `test-ws`.
  The previous live `list --workspace` result was not valid selection proof:
  it exposed the backend issue above. After rollout, live reads confirmed the
  active workspace and app catalog identify `w-test-ws`, and the AWS connection
  belongs to that workspace (connected, account `637423432890`). No customer app
  was deployed or run.
- Final regression checks: 41 CLI tests plus three authentication tests passed;
  `make test-unit` passed 31 tests. Package/installer and live auth/UI checks
  passed. Public skill behavioral evaluation remains deferred with publication.

<!-- ponytail: behavioral skill evaluation and public npm publication are held
until the user approves a public release; current skill checks are consistency
lint and package/installer checks. -->

The duplicate installation link was removed in dev version
`1a89d7d0-e42a-4cd5-8538-50e24fe12c42`. The build passed. The browser check
confirmed one installation button, opening a new tab normally and the current
tab when popups are blocked, then completing the existing verification flow.
Installation and connection requests were stubbed; no customer connection changed.

Different-account setup release, 2026-09-09:

- Removed the fixed customer account from the dev configuration and installer.
  The existing connection and its apps remain in account `637423432890`.
- Updated only the platform IAM user's preview policy. AWS policy simulation
  allowed a connection-role ARN in a different fixture account with an external
  ID, and denied a missing external ID, an unrelated role, and direct customer
  S3 reads. This verifies the platform identity policy; customer role trust is
  additionally required when a real account installs the template.
- Passed 13 connection API tests, 4 template tests, and 18 Python API/policy
  tests. New coverage includes another account, account corrections, stale
  callbacks, metadata mismatches, and preserving installed connections.
- Three browser/live checks passed against dev: the new account-ID form and AWS
  approval steps; the existing Connected/Disconnect/Cancel/reconnect UI; and
  real access to both existing deployed apps after the IAM policy update.
  New-account installation, connection, and disconnect writes were stubbed in
  the browser tests. No second-account infrastructure was created.
- Build and whitespace checks passed. Dev version:
  `4b948ace-3d68-43f2-b7f0-d4cdb19e6c28`. Both preview flags remain enabled.
- **Remaining live proof:** an account owner must approve the stack in a real
  second AWS account, finish connecting, then deploy and run a CPU job there.
  No second-account ID/profile was provided for that test. The setup is ready
  in the normal Settings flow of a workspace without an existing connection.

Multiple-app proof, 2026-09-09:

- Updated only the existing stack's Lambda code; CloudFormation reached
  `UPDATE_COMPLETE`. No new connection, VPC, database, or data migration.
- Deployed `examples/byoc-word-count` through the CLI to
  [aws-word-count](https://small-cp-dev.zeroshothq.workers.dev/apps/aws-word-count),
  deployment `d-1788983268666-4db303d22cd9`.
- The browser started `r-1788983405983-3d9656c5c40a` through the shared Run form
  with `small small apps share one AWS connection`. It exited `0`, with
  `word_count=7`, `unique_words=6` in its CloudWatch log and downloaded S3 report.
- Both apps appeared in the sidebar. Switching apps showed their distinct input
  forms; the existing enlarged run layout and sidebar remained intact.
- The original app's deployment stayed unchanged and its existing browser run
  still downloaded `count=8`, `sum_of_squares=204`. Run lists remained separate.
  Reading the other app's run, log, output, or deployment through the wrong app
  endpoint returned `404`. The browser observed no customer payload sent to Small.
- Passed 16 customer API tests, 34 CLI tests, 4 template tests, 5 web adapter
  tests, and the real dev browser proof. The CLI suite includes transport tests.
  The dev build and whitespace check passed. Reviewed storage prefixes, legacy
  routes, deployment permissions, task revisions, native-app routing, and
  disconnect behavior for multiple apps.
- Dev Worker version: `0b7d2218-1191-4edd-88b0-4bad5ba390f9`. Both preview flags
  remained enabled. At that release, different-account onboarding was deferred
  and the installer was restricted to the approved account and region.

Proved on 2026-09-09 in account `637423432890`, region `us-east-1`:

| Resource | Value |
| --- | --- |
| Dev app | https://small-cp-dev.zeroshothq.workers.dev/apps/aws-cpu-proof |
| Workspace / installer | `gmail-com` / `yudhisteer.chin@gmail.com` |
| Stack | `small-byoc-b2cece2356ce` (`UPDATE_COMPLETE`) |
| Customer data bucket | `small-byoc-b2cece2356ce-databucket-8diggysg3x0h` |
| ECR repository / ECS cluster | `small-byoc-b2cece2356ce` |
| Connection role | `arn:aws:iam::637423432890:role/small-byoc-b2cece2356ce-connection` |
| AWS API | `https://ilpszbmigkma264gjca5b6i3zu0kohed.lambda-url.us-east-1.on.aws/` |
| CLI proof run | `r-1788978258237-3110d84b6daf` |
| Browser proof run after review fixes | `r-1788978860120-7aa015589f2e` |
| Integrated app browser proof run | `r-1788980386215-0fb7e2c01192` |
| Dev Worker version | `1a89d7d0-e42a-4cd5-8538-50e24fe12c42` |

`examples/byoc-cpu-job` built in CodeBuild, published an ECR image pinned by
digest, and ran on Fargate. The task exited `0`. CloudWatch showed the actual job
and upload messages. The CLI and browser downloaded the same 67-byte
`report.json` from customer S3: `count=8`, `sum_of_squares=204`.

The browser check confirmed the dev Run form, Logs view, output link, preserved
sidebar, and no JavaScript page errors. The source/input transport tests enforce
direct AWS destinations; the browser trace observed no sample payload sent to
Small. This is a functional MVP proof, not an independent infrastructure audit.
After the review fixes were deployed, clicking **Run in AWS** in the browser
started a new task that also exited `0` and returned the verified `204` report.

After integration, a browser check opened the job through the normal sidebar,
started run `r-1788980386215-0fb7e2c01192` with the shared Run form, and verified
its CloudWatch log and S3 report (`count=8`, `sum_of_squares=204`) in the shared
run panel and full page. The normal Logs table contained the new run. Switching
to a native app preserved all five Agent tabs. No JavaScript page errors or AWS
input/run data requests to hosted Small endpoints were observed. Four focused
web adapter tests cover workspace catalog isolation, direct AWS transport,
status/log/output mapping, and rejection of unsupported operations.

The Connected-button release passed eight connection API tests and four web
adapter tests. A browser check against dev verified right alignment with Slack,
the privacy tooltip on hover/focus, the confirmation modal, Cancel without an
API write, confirmation sending one disconnect request, and reconnecting.
Browser disconnect/reconnect responses were stubbed; the actual AWS connection
was left connected. API tests independently enforce installer/workspace
permissions, retained installation metadata, blocked grants after disconnect,
and rejection of registration callbacks for disconnected installations.

Review identified and fixed failed starts remaining `starting`, a permanent
CodeBuild retry lock, and missing credential/recursive-ignore exclusions. Tests
reproduced each failure before the fixes. The AWS stack and dev installer include
the fixes. Source packaging honors the supported ignore patterns and excludes
known credential files; it does not detect arbitrary secrets embedded in code.

Initial MVP validation: 12 customer API tests, 4 template tests, 6 connection/signing tests,
and the CLI transport/archive tests pass. The full CLI suite passed 33 tests;
archive and existing bundle tests were rerun after the final exclusion fix.
`make test-unit` passed all 31 tests. The broader control-plane Node suite found
four existing failures in `test/review.test.js`: its DB mock lacks `.first()`.
That review implementation/test was unchanged by this feature; this suite is
not claimed green. No production deployment or npm publication was performed.

## Use the preview

Open the dev app in the workspace whose AWS installation you connected.
When the original Gmail connection is connected, **aws-cpu-proof** and
**aws-word-count** appear in its sidebar and Apps list. Use **Run** to start
the job; **Logs** shows earlier runs and their downloadable output in the
existing run panels. Other workspaces have their own connection state.

The BYOC CLI changes currently live in this repository. From
`examples/byoc-cpu-job`, in PowerShell:

```powershell
$env:SMALL_API = 'https://small-cp-dev.zeroshothq.workers.dev'
node ../../packages/cli/bin/small.js workspaces
node ../../packages/cli/bin/small.js deploy --workspace gmail-com
node ../../packages/cli/bin/small.js run aws-cpu-proof --workspace gmail-com --count 8 --label 'BYOC proof'
node ../../packages/cli/bin/small.js run aws-cpu-proof --workspace gmail-com --download ./out
```

To add another app on this workspace connection, give it a unique name, a Python
entry, `type = "job"`, and `[deploy] target = "aws"` in `small.toml`, then use
the repository CLI to deploy. No additional AWS installation is needed.
`examples/byoc-word-count` is a complete second app. From that directory:

```powershell
$env:SMALL_API = 'https://small-cp-dev.zeroshothq.workers.dev'
node ../../packages/cli/bin/small.js deploy --workspace gmail-com
node ../../packages/cli/bin/small.js run aws-word-count --workspace gmail-com --text 'small apps run in your AWS account'
node ../../packages/cli/bin/small.js run aws-word-count --workspace gmail-com --download ./out
```

For a new workspace, substitute its actual slug from `workspaces` in every
command. A browser workspace switch does not select the CLI workspace. The
public npm package does not include this preview yet; use the repository CLI
above or install `./packages/cli` locally. `small skill` installs the updated
skill payload, including `references/aws-hosting.md`, into the current app.

For a new workspace, use **Settings → Connections → AWS**:

1. Enter the customer's 12-digit AWS account ID and first app name.
2. Click **Connect AWS**. It prepares a private template and opens CloudFormation
   in `us-east-1` in a new tab.
3. Sign in to that AWS account, review the resources and IAM permissions, and
   click **Create stack** in AWS. The approving user needs permission to create
   the template's infrastructure and IAM roles.
4. Wait for the stack to finish, return to Small, and click **Finish connecting**.
   Small verifies the installed role, account, workspace, and completed stack.
5. **Connected** appears. Deploy CPU jobs with `[deploy] target = "aws"`; they
   share this connection and appear in the existing app sidebar.

Approval happens in AWS; Small starts the process and verifies the result.
The first app name remains editable during pending setup. Additional apps need
no new installation. A different account can be connected in a new workspace;
replacing an already installed workspace connection remains deferred.

The operator helper `scripts/byoc-admin.py` supports `inspect`, `bootstrap`,
`install`, `status`, `connect`, Lambda-code `update`, and `enable-cross-account`.
The last action checks and updates only the preview platform IAM policy and
backs up its previous value locally. The helper checks the approved operator
AWS account and keeps generated credentials/install URLs only under ignored
`.small/byoc/`. Its initial proof used the existing local operator credentials;
customers use CloudFormation in their own AWS session.

Dev uses D1 `small-byoc-dev` (`67723b56-de7a-4b5e-af91-ae1af32cc4d8`) for connection
metadata only. Its scoped `small-byoc-dev` IAM user can upload/read installer
templates and assume installation connection roles; it has no customer-data
permissions. The private installer bucket is
`small-byoc-installer-637423432890-us-east-1`. Worker credentials are separate
from the customer API/build/execution/task roles.

The preview stack remains installed for review. Its interface VPC endpoints
incur AWS charges while idle. Stack deletion deliberately retains the customer
S3 bucket and ECR repository; removing those retained data resources is a
separate, explicit cleanup action.
