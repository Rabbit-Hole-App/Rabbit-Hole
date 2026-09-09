# AWS BYOC: CPU jobs in one workspace connection

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
- The hosted connection role can verify the installation and invoke an IAM-only
  signer. It cannot read the signing secret, source, job inputs, outputs, or logs. A unique
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
- The task role has no data permissions. The task sends stdout through the ECS
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
