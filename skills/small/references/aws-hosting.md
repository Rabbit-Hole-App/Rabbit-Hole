# Host a CPU job in the customer's AWS account

## Private Small installation with Cognito

If Small's interface itself is installed in customer AWS, install
`small-deploy@0.0.10` or newer from npm. Use the installation URL supplied by
the customer's administrator; this command installs the CLI, not AWS infrastructure.
Sign in on the machine running the CLI:

```text
npm install -g small-deploy@0.0.10
small login --api <installation-url>
small workspaces
small deploy --workspace <returned-slug>
small run <app-name> --workspace <returned-slug> --count 8
small logs <app-name> --workspace <returned-slug>
small run <app-name> --workspace <returned-slug> --download ./out
```

Login opens Cognito and returns to the local CLI with PKCE. The installer
registers `http://127.0.0.1:8766/auth/callback`; use `--no-browser` when the
user prefers opening the printed link themselves. Complete sign-in on that
same computer. For a CLI running over SSH, forward local port `8766` to port
`8766` on that host before login and keep both commands running until sign-in
finishes. `--no-browser` alone does not forward the callback. Never request
passwords, copy browser tokens, or create a user
to bypass membership. The saved login is bound to this installation's origin.
Clear a conflicting `SMALL_API` shell override, or set it to the same AWS URL.
Hosted `SMALL_TOKEN` credentials are ignored for a private login.

Use `type = "job"` and `[deploy] target = "aws"` as shown below. Source goes
directly to customer S3; CodeBuild, ECR, Fargate, CloudWatch, and job output
remain in that account. The normal Apps list, Run, and Logs show the job.
Private release `0.1.0-pilot.5.1` supports the installation owner, scalar and file
inputs, and configurable app permissions. Sharing changes are deferred. The CLI
discovers these capabilities from the installation; older releases need an
installation update for grants and uploads. Installing the CLI alone is not
that update.

### Images and successful replacements

On installations with image retirement, a successful deploy replaces that app's
current version. Failed or unfinished replacements leave its working version
available. Older deployment IDs cannot start new runs or uploads: deploy the old
source again to run it. Small removes replaced build images after their jobs
finish; run history, logs, and outputs remain. No seven-day rollback window.

CLI `0.0.11` and later upgrade available Debian
packages before Python requirements and remove Perl last. Rebuild existing apps
to receive the fix; an installation update does not rebuild their images.
The generated image deliberately does not support system packages or Perl.

### Declare the app's AWS permissions

Read the app's actual SDK operations and resource configuration. Declare only
the actions and resources it needs. Keep `grants` on **one physical line**; the
small TOML parser supports inline arrays, not multiline arrays or `[[aws.grants]]`.
Use the customer's real resource ARNs, not the illustrative account below:

```toml
[aws]
grants = [{ action = "s3:PutObject", resource = "arn:aws:s3:::company-jobs/jobs/*" }, { action = "s3:GetObject", resource = "arn:aws:s3:::company-jobs/reports/*" }, { action = "s3:ListBucket", resource = "arn:aws:s3:::company-jobs" }, { action = "lambda:InvokeFunction", resource = "arn:aws:lambda:us-east-1:123456789012:function:report-launcher" }, { action = "ecs:DescribeTasks", resource = "arn:aws:ecs:us-east-1:123456789012:task/report-jobs/*" }]
```

`small deploy` requests approval before uploading source. In this private
installation's **Settings > Connections > AWS > App access**, the owner sees
each exact action and ARN and chooses **Approve & deploy** or **Cancel**.
Approval replaces that app's complete grant set. Unchanged grants reuse their
approval. `grants = []` requests removal; changed grants block new runs of old
deployments until the new configuration is deployed. Existing running tasks
remain subject to AWS permission propagation.

The default installation enables the five actions above. For another action,
the AWS administrator updates the stack parameter **AppGrantActions**, retaining
the existing actions and adding the exact action required. This changes the
installation ceiling; it grants nothing to any app. The agent then retries
deployment and requests the app's exact resource approval. No new Small release
is needed for an additional compatible action. Do not edit the stack, broaden
permissions, or approve a request without the user's authorization.

Supported grants have exact action names and same-account, `us-east-1` resource
ARNs. S3 accepts exact bucket/object ARNs and trailing folder `/*`; ECS task
inspection accepts a named cluster's `task/cluster/*`. At most 20 grants per app.
Wildcard actions, `Resource = "*"`, cross-account resources, IAM/STS and
organization/account/CloudFormation management are unsupported. AWS validates
each policy before approval; syntactically valid ARNs do not guarantee an action
supports that resource type. ListBucket applies to the named bucket's listing.
The boundary also requires AWS to supply `aws:ResourceAccount` for the action;
operations without that ownership context remain denied.

AppGrantActions is an administrator's policy, not a classification of harmless
operations. PutObject can replace data; InvokeFunction runs with the function's
existing role; other explicitly enabled actions can change resources. Each
addition needs deliberate review of those effects. Jobs have no public network
route. The installation supplies S3, ECR, CloudWatch Logs, Lambda, and ECS
endpoints; another service may also require a customer-configured VPC endpoint.
KMS-encrypted data needs the appropriate key permission and network access.
Do not silently change encryption or add broad permissions to work around it.

### File inputs

Use the existing Run form's file picker, or a local CLI file path:

```toml
[inputs]
event_ids_file = { type = "file", accept = ".txt,.csv", required = true }
```

```text
small run <app-name> --workspace <returned-slug> --event-ids-file ./events.txt
```

The Python entry receives a local path in `SMALL_INPUT_EVENT_IDS_FILE` (and the
matching entry in the JSON file referenced by `SMALL_INPUTS`). Read the uploaded
file normally. Up to five files,
10 MiB each, go directly to the installation's S3 bucket. Uploads are bound to
the signed-in user, app, and deployment, verified by checksum, and pinned to an
S3 version before execution. Never put local source data in the source archive
as a workaround. Write results to `SMALL_OUTPUTS` as before.

### Existing single-folder S3 configuration

`[aws] s3_read` remains supported for existing apps. Do not combine it with
`grants`; switching to `grants` requires explicit approval even for the same
GetObject folder. Small retires the old role's permissions during that switch.

For S3, declare `[aws] s3_read = "s3://your-bucket/your-folder/"` in
`small.toml`, then run `small deploy`. When access changes, deployment waits
before uploading source. The owner opens this **private installation's**
**Settings > Connections > AWS** and reviews the exact app/folder, then clicks
**Approve & deploy** or **Cancel**. The CLI resumes after approval; unchanged
approved folders do not prompt again. No folder inventory appears when idle.

With `s3_read`, each app has its own ECS task role. It can get objects only in the approved
folder, in the installation's account and `us-east-1`; it cannot list buckets,
write, delete, or read another folder. Use `SMALL_S3_BUCKET` and `SMALL_S3_PREFIX`
in the job, plus a known object key. SSE-KMS buckets need separately scoped KMS
support and are outside this legacy single-folder flow. Do not add broad KMS permissions.

If approval fails while applying, retry that same request in Settings. A
pending unapproved request can be cancelled. Changing or removing `s3_read`
requests a new approval; old deployments cannot start new runs with an outdated
folder. Already running tasks and in-flight requests are not synchronously
recalled. The permissions handler runs inside this customer's AWS account;
it uses no external account role. Install the versioned private update once;
individual folder approvals do not require another CloudFormation update.

Use only the customer's installation and AWS account for private BYOC.
Do not use the hosted Connect AWS flow or add an external trust role for it.

## Hosted dashboard dev preview

Use this flow when the user wants the job itself hosted in their AWS account,
or the project already has `[deploy] target = "aws"`. The workspace has one
AWS connection and can host multiple CPU-job apps through it.

This feature currently lives on the dev dashboard:
https://small-cp-dev.zeroshothq.workers.dev/apps
Install `small-deploy@0.0.9` or newer and run `small skill` in the project to
install its matching agent instructions. This hosted AWS interface remains a
dev preview; the private installation above uses its own URL.

## Connect once

1. In the desired workspace, open **Settings → Connections → AWS**.
2. Enter the customer's 12-digit AWS account ID and first app name.
3. Click **Connect AWS**. The customer reviews the installation in their AWS
   console and clicks **Create stack**. They need permission to create the
   template's resources and IAM roles. Do not request AWS access keys.
4. After the stack completes, return to Small and click **Finish connecting**.
   Continue when it says **Connected**. A connected workspace needs no new
   installation for its second or later app.

The region is `us-east-1`. A disconnected installation can be reconnected;
use a new workspace to connect a different AWS account.

## Select the workspace and deploy

Point the CLI at dev first. In PowerShell:

```powershell
$env:SMALL_API = 'https://small-cp-dev.zeroshothq.workers.dev'
small workspaces
```

If login is required, have the user run `small login` interactively in that
shell. Match the intended workspace to its returned slug. Pass that slug with
`--workspace` on deploy, run, runs, logs, and downloads. `SMALL_WORKSPACE` is
an optional shell default; the flag overrides it. An invalid slug stops the
command before it accesses an app. No selection uses the login's email workspace.
If the CLI says `Server did not select workspace`, stop: that server needs its
CLI authentication update. Do not retry without the workspace flag or change
the hosting target.

Create or update `small.toml` **before running `small init`** so the AWS target
is already declared. Do not generate a hosted runbook from this source.

```toml
name = "aws-test-job"
entry = "job.py"
type = "job"

[deploy]
target = "aws"

[inputs]
count = { type = "number", default = 8, min = 1, max = 10000 }
```

Keep the working Python code; use a thin adapter if needed. The entry reads
`SMALL_INPUT_COUNT` and writes downloadable files under `SMALL_OUTPUTS`.
Use a unique app name with 1–40 lowercase letters, digits, or hyphens.

Replace `<slug>` with the value returned by `small workspaces`:

```text
small deploy --workspace <slug>
small run aws-test-job --workspace <slug> --count 8
small runs aws-test-job --workspace <slug>
small logs aws-test-job --workspace <slug>
small run aws-test-job --workspace <slug> --download ./out
```

The CLI prints the workspace, AWS account, and region before upload. Source
goes directly to customer S3, builds run in their account, and the job runs on
Fargate. Relay the app link printed by deploy. The app appears in the normal
sidebar; users run it and inspect logs and outputs in the existing app tabs.

## Read an existing S3 folder

Declare one folder in `small.toml`, using a bucket in the connected AWS account
and `us-east-1`:

```toml
[aws]
s3_read = "s3://company-data/reports/"
```

Use a literal folder, without `*`, `?`, or policy variables. A missing trailing
slash is added. This grants `GetObject` for explicit keys in that folder, with
no listing, writes, or KMS decryption grant. Use ordinary SSE-S3 objects for
this MVP. Add `boto3` to the app's requirements if its code uses that SDK.

1. Run `small deploy --workspace <slug>`. If this app needs new or changed
   access, deploy requests approval and waits before uploading source.
2. In that workspace's **Settings → Connections → AWS → S3 access**, the
   installer reviews the exact folder and clicks **Approve & deploy** or **Cancel**.
3. The waiting CLI resumes automatically after approval. Cancel stops it without
   uploading source. Subsequent deploys reuse approval until the access changes.

For an older installation, Small first shows **One-time AWS connection upgrade**.
Click **Upgrade in AWS**, select **Replace existing template**, and review the
generated template. If AWS leaves the URL empty, copy the URL shown in Small
into **Amazon S3 URL**. Choose **Update stack**, then return and **Check upgrade**.
The upgrade preserves existing grants; each new folder still requires approval
in Small. New installations already include this permission handler.

The CLI waits for up to 30 minutes; Ctrl+C stops waiting. If it exits, approve
the request and rerun deploy. A failed AWS permission operation keeps **Retry
approval** available; do not replace the request with broader access.

AWS supplies credentials automatically to this app's dedicated task role.
The runtime sets `SMALL_S3_BUCKET` and `SMALL_S3_PREFIX` from its approved scope.
Use `boto3.client("s3").get_object(Bucket=os.environ["SMALL_S3_BUCKET"], Key=key)`
with a complete key under that prefix. Keep writing generated files under
`SMALL_OUTPUTS`; the existing output upload/download flow is unchanged.

Removing `s3_read` and deploying requests removal of the grant. An older
deployment whose recorded folder no longer matches approval cannot start.
Already running work is not stopped. Cancel is unavailable once an approval
starts applying; retry that exact approval if AWS fails. Do not approve in Small
or execute an AWS installation upgrade unless the user has authorized that access.

`examples/byoc-s3-report` contains a CSV report job and sample file. Upload the
sample into the chosen folder in customer AWS; set its bucket and input key
before deploying. Data files still travel directly to AWS.

## MVP limits and data boundary

- CPU jobs only: 1 vCPU, 2 GiB, `us-east-1`. Inputs are `text`, `number`,
  `bool`, or `select`.
- The connection installer can deploy; workspace members can run and inspect.
  Private app sharing and per-app edit grants are not implemented for AWS jobs.
- App secrets, extra `[aws] role_arn` grants, system packages, persistent
  volumes, schedules, file/date inputs, GPU jobs, and web servers are deferred.
  Do not silently change the hosting target to make an unsupported job deploy.
- Small receives connection metadata and deployment status. Customer source,
  input values, outputs, and logs travel directly between the client and AWS.
  Do not send them to hosted review, runbook generation, or Coaching. Slack and
  the Coach Agent are not connected to these AWS jobs yet.

For a hosted app that only calls an AWS service, use `references/aws-role.md`.
For a hosted app delegating a heavy operation to AWS, use
`references/aws-compute.md`. Those are separate deployment paths.
