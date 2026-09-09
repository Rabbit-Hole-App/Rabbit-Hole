# Host a CPU job in the customer's AWS account (dev preview)

Use this flow when the user wants the job itself hosted in their AWS account,
or the project already has `[deploy] target = "aws"`. The workspace has one
AWS connection and can host multiple CPU-job apps through it.

This feature currently lives on the dev dashboard:
https://small-cp-dev.zeroshothq.workers.dev/apps
The updated CLI and skill currently come from the small-deploy repository;
the public npm release is held until the dev work is approved. Use that CLI's
`packages/cli/bin/small.js` with Node (or its locally installed package).
Commands below use `small` for that updated CLI, not the older npm version.

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
