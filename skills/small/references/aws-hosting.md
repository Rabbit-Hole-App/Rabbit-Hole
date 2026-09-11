# Host a CPU job in the customer's AWS account

## Contents

- [Deployment checklist](#deployment-checklist)
- [Private Small installation with Cognito](#private-small-installation-with-cognito)
- [Hosted dashboard connection](#hosted-dashboard-connection)
- [Select the workspace and deploy](#select-the-workspace-and-deploy)
- [Fixed values in Run > Constants](#fixed-values-in-run--constants)
- [Read an existing S3 folder](#read-an-existing-s3-folder)
- [MVP limits and data boundary](#mvp-limits-and-data-boundary)

## Deployment checklist

- [ ] Use the installation URL, account, region, and workspace returned by the customer environment.
- [ ] Derive inputs, constants, and AWS grants from code the job actually runs.
- [ ] Validate the source boundary before upload and obtain approval for changed grants.
- [ ] Deploy, run one representative input, and inspect logs and outputs.
- [ ] Fix any mismatch at its source, then repeat validation and the representative run.

## Private Small installation with Cognito

If Small's interface itself is installed in customer AWS, install
the current `small-deploy` package from npm. Use the installation URL supplied by
the customer's administrator; this command installs the CLI, not AWS infrastructure.
Sign in on the machine running the CLI:

Command template—replace every angle-bracket placeholder with a value returned
by the installation or CLI:

```text
npm install -g small-deploy
small login --api <installation-url>
small workspaces
small deploy --workspace <returned-slug>
small run <app-name> --workspace <returned-slug> --<input-name> <value>
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
The CLI discovers supported inputs, constants, tooltips, and app permissions
from the installation. When a capability is absent, update the installation;
installing the CLI alone does not change customer AWS infrastructure.

### Images and successful replacements

On installations with image retirement, a successful deploy replaces that app's
current version. Failed or unfinished replacements leave its working version
available. Older deployment IDs cannot start new runs or uploads: deploy the old
source again to run it. Small removes replaced build images after their jobs
finish; run history, logs, and outputs remain. No seven-day rollback window.

Generated images upgrade available Debian packages before Python requirements
and remove Perl last. Rebuild an existing app to receive image changes; an
installation update does not rebuild deployed app images.
The generated image deliberately does not support system packages or Perl.

### Declare the app's AWS permissions

Read the app's actual SDK operations and resource configuration. Declare only
the actions and resources it needs. Keep `grants` on **one physical line**; the
small TOML parser supports inline arrays, not multiline arrays or `[[aws.grants]]`.
Example only—replace the bucket, account, region, function, cluster, and app
resources with values verified from the customer's application and AWS account:

```toml
[aws]
grants = [{ action = "s3:PutObject", resource = "arn:aws:s3:::<job-bucket>/jobs/*" }, { action = "s3:GetObject", resource = "arn:aws:s3:::<job-bucket>/reports/*" }, { action = "s3:ListBucket", resource = "arn:aws:s3:::<job-bucket>" }, { action = "lambda:InvokeFunction", resource = "arn:aws:lambda:<installation-region>:<customer-account-id>:function:<launcher-name>" }, { action = "ecs:DescribeTasks", resource = "arn:aws:ecs:<installation-region>:<customer-account-id>:task/<cluster-name>/*" }]
```

Validate each grant by tracing it to one SDK operation and one resolved customer
resource. Remove or correct anything without that trace, then repeat until every
grant is accounted for and no example placeholder or wildcard remains. Deployment
and owner approval execute the validated plan.

`small deploy` requests approval before uploading source. In this private
installation's **Settings > Connections > AWS > App access**, the owner sees
each exact action and ARN and chooses **Approve & deploy** or **Cancel**.
Approval replaces that app's complete grant set. Unchanged grants reuse their
approval. `grants = []` requests removal; changed grants block new runs of old
deployments until the new configuration is deployed. Existing running tasks
remain subject to AWS permission propagation.

Never infer the installation's allowed actions from that example. For an action
outside the installation's advertised allowlist,
the AWS administrator updates the stack parameter **AppGrantActions**, retaining
the existing actions and adding the exact action required. This changes the
installation ceiling; it grants nothing to any app. The agent then retries
deployment and requests the app's exact resource approval. No new Small release
is needed for an additional compatible action. Do not edit the stack, broaden
permissions, or approve a request without the user's authorization.

Supported grants have exact action names and same-account resource
ARNs. S3 accepts exact bucket/object ARNs and trailing folder `/*`; ECS task
inspection accepts a named cluster's `task/cluster/*`. At most 20 grants per app.
Wildcard actions, `Resource = "*"`, cross-account resources, IAM/STS and
organization/account/CloudFormation management are unsupported. AWS validates
each policy before approval; syntactically valid ARNs do not guarantee an action
supports that resource type. ListBucket applies to the named bucket's listing.
The CLI uses the installation's reported region and rejects a different one.
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

Example only—replace the input name, accepted extensions, and CLI flag with the
real job input:

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

For S3, declare `[aws] s3_read = "s3://<customer-bucket>/<approved-prefix>/"` in
`small.toml`, then run `small deploy`. When access changes, deployment waits
before uploading source. The owner opens this **private installation's**
**Settings > Connections > AWS** and reviews the exact app/folder, then clicks
**Approve & deploy** or **Cancel**. The CLI resumes after approval; unchanged
approved folders do not prompt again. No folder inventory appears when idle.

With `s3_read`, each app has its own ECS task role. It can get objects only in the approved
folder, in the installation's account and reported region; it cannot list buckets,
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

## Hosted dashboard connection

Use this flow when the user wants the job itself hosted in their AWS account,
or the project already has `[deploy] target = "aws"`. The workspace has one
AWS connection and can host multiple CPU-job apps through it.

Use the dashboard URL supplied by the user or workspace administrator. Do not
copy a URL from this reference. Install the current `small-deploy` package and
run `small skill` in the project to install its matching agent instructions.
The private installation above uses its own customer-controlled URL.

## Connect once

1. In the desired workspace, open **Settings → Connections → AWS**.
2. Enter the customer's 12-digit AWS account ID and first app name.
3. Click **Connect AWS**. The customer reviews the installation in their AWS
   console and clicks **Create stack**. They need permission to create the
   template's resources and IAM roles. Do not request AWS access keys.
4. After the stack completes, return to Small and click **Finish connecting**.
   Continue when it says **Connected**. A connected workspace needs no new
   installation for its second or later app.

Use the region reported by the connection. A disconnected installation can be reconnected;
use a new workspace to connect a different AWS account.

## Select the workspace and deploy

Command template—replace `<small-api-origin>` with the exact origin supplied by
the user or connection screen:

```powershell
$env:SMALL_API = '<small-api-origin>'
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

Example only—replace the app name, entry, inputs, defaults, and bounds with the
real job contract:

```toml
name = "<app-name>"
entry = "<python-entry>"
type = "job"

[deploy]
target = "aws"

[inputs]
<input-name> = { type = "number", default = <default>, min = <minimum>, max = <maximum> }
```

Keep the working Python code; use a thin adapter if needed. The entry reads the
declared input as `SMALL_INPUT_<INPUT_NAME>` and writes downloadable files under
`SMALL_OUTPUTS`.
Use a unique app name with 1–40 lowercase letters, digits, or hyphens.

Command template—replace `<slug>`, `<app-name>`, `<input-name>`, and `<value>`
with values from `small workspaces` and the real `small.toml`:

```text
small deploy --workspace <slug>
small run <app-name> --workspace <slug> --<input-name> <value>
small runs <app-name> --workspace <slug>
small logs <app-name> --workspace <slug>
small run <app-name> --workspace <slug> --download ./out
```

The CLI prints the workspace, AWS account, and region before upload. Source
goes directly to customer S3, builds run in their account, and the job runs on
Fargate. Relay the app link printed by deploy. The app appears in the normal
sidebar; users run it and inspect logs and outputs in the existing app tabs.

## Fixed values in Run > Constants

Inputs may also include optional `tooltip` text (up to 2000 characters). Small
shows an information icon beside the label; hover, click or focus it to read the
explanation. `help` remains below the input. This is explanatory text and does
not define the Python behavior or change the selected option.

Example only—the profiles, thresholds, distances, and cooldowns below illustrate
tooltip prose; replace them with facts from the real application:

```toml
[inputs]
profile = { type = "select", default = "prod", options = ["prod", "sensitive"], help = "Choose a detection profile.", tooltip = "Prod: arm elevation 90 degrees, wrist distance 300 mm, cooldown 7 frames. Sensitive: arm elevation 80 degrees, wrist distance 400 mm, cooldown 5 frames." }
```

Keep the inline definition on one physical line with the CLI's TOML subset.
Write plain text; tooltip contents are not interpreted as HTML or executable code.

Use the current `small-deploy` package and an installation that advertises
constants support. Put fixed, non-secret application behavior in `small.toml`:

Every declared constant must be consumed by the underlying application and
affect behavior or result interpretation. Trace it to the code before adding it.
Do not copy model names or other settings into `[constants]` solely to display
them; an unused declaration becomes stale. Platform limits and adapter settings
also stay out of this section.

Good example—the Python snippet below consumes this exact value:

```toml
[constants]
acceptance_threshold = { value = 0.85, tooltip = "Minimum score accepted." }
```

```python
import json
import os

constants = json.loads(os.environ["SMALL_CONSTANTS"])
acceptance_threshold = constants["acceptance_threshold"]
```

Bad example—do not add display-only or platform values that the application
does not consume:

```toml
[constants]
model_name = "<display-only-model-name>"
run_limit_mb = 45
```

The examples establish the boundary: declare a constant only when the real job
reads it and it affects behavior or result interpretation. Keep inline definitions
on one physical line. Tooltip text is limited to 2000 characters and counts
toward the 2 KiB declaration limit. The runtime receives only the scalar value,
never the tooltip or definition object.

Small displays these values read-only under Run > Constants. Redeploy to change
them; do not offer them as editable `[inputs]` or duplicate the value in Python.
Every run records its constants snapshot. Existing apps without a declaration
receive `{}`. For local testing, supply `SMALL_CONSTANTS` with the JSON values
from the same TOML file. If loading `[constants]` with Python's `tomllib`, unwrap
each inline definition's `value` before using it as runtime constants.

The MVP accepts at most 20 scalar values and 2 KiB total JSON: strings, finite
numbers, and booleans. Names start with a letter and contain letters, digits or
underscores, at most 40 characters. Numbers must be in the JavaScript safe range.
No arrays or nested tables. These are visible configuration values, never secrets.
Older private installations and shared hosting must be updated/supported before
deploying a constants declaration; the CLI stops rather than ignoring it.

## Read an existing S3 folder

Declare one folder in `small.toml`, using a bucket in the connected AWS account
and the installation's reported region.

Example only—replace the bucket and prefix with the approved customer location:

```toml
[aws]
s3_read = "s3://<customer-bucket>/<approved-prefix>/"
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

- CPU jobs only. Read the connection and deployment output for its region,
  compute size, supported inputs, and enabled capabilities; do not infer them
  from examples in this reference.
- The connection installer can deploy; workspace members can run and inspect.
  Private app sharing and per-app edit grants are not implemented for AWS jobs.
- App secrets, extra `[aws] role_arn` grants, system packages, persistent
  volumes, schedules, GPU jobs, and web servers are deferred. Use only input
  types advertised by the installation.
  Do not silently change the hosting target to make an unsupported job deploy.
- Small receives connection metadata and deployment status. Customer source,
  input values, outputs, and logs travel directly between the client and AWS.
  Do not send them to hosted review, runbook generation, or Coaching. Slack and
  the Coach Agent are not connected to these AWS jobs yet.

For a hosted app that only calls an AWS service, or delegates heavy work to AWS,
return to the direct reference routing in `SKILL.md`; those are separate paths.
