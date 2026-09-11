# Heavy compute on the user's AWS — choosing and wiring it

This reference covers a hosted app delegating a heavy operation to AWS. When
the user wants the entire CPU job hosted in their account, use the AWS hosting
route in `SKILL.md`; do not replace that choice with hosted compute.

Read this when the user wants their script "to run on AWS" — a model too big
for the app machine, batch inference, GPU, or an existing AWS account they
must use.

## First: does it need AWS at all?

Most "run it on AWS" asks really mean "run it not-on-my-laptop". That is
`small deploy` (server) or `small run` (job), with no customer AWS account or
extra moving parts. Reach for AWS compute only when the work truly does
not fit: model or data too large, GPU required, more than a few minutes per
item at real volume, or the data already lives in their AWS. Say so in one
sentence and let the user choose.

## Choosing the compute (ask, in plain words)

Ask at most three questions, in the user's terms, not AWS terms:

1. **How much?** "A few dozen images a day, or thousands per hour?"
2. **How fast?** "Does someone wait for the answer, or can it land later?"
3. **How heavy?** "Roughly how long does one item take on your laptop?"

Then decide:

| Situation | Pick | Why |
|---|---|---|
| MVP, bursty, one item fits Lambda's current execution limits, CPU is fine | **Lambda** (container image) | Zero idle cost and scales to zero |
| Steady volume, long-running items, still CPU | **Fargate** (ECS service or task) | No 15-min limit, no cold starts at volume |
| Needs a GPU | **SageMaker endpoint** (or ECS on GPU EC2) | Lambda and Fargate have no GPUs |
| Huge offline backlog, nobody waiting | **AWS Batch** | Queue it, let it drain cheap |

Default to **Lambda** for an MVP that fits the service limits verified for the
customer's region and account. Do not offer the whole table to the user; pick one and say why in one
sentence ("bursty and small — Lambda, it costs nothing while idle").

## Roles — two directions, never mixed

Every choice needs IAM on **both sides**. Name them all `small-<app-name>-<purpose>`.

**Side 1 — roles the service itself runs as** (create these with the user's
local credentials after stating what will be created and why):

| Compute | Create | It needs |
|---|---|---|
| Lambda | one execution role | `AWSLambdaBasicExecutionRole` (logs) + exactly what the function code touches (e.g. `s3:GetObject` on the weights bucket) |
| Fargate | **two**: execution role + task role | execution: `AmazonECSTaskExecutionRolePolicy` (pull image, logs). task: what the container code touches — keep them separate, that is the point |
| SageMaker endpoint | one execution role | S3 read on the model artifacts, ECR pull, logs |
| Batch | job role (+ execution role for the container) | job role: what the job code touches; execution: image pull + logs |

**Side 2 — one new statement on the small `[aws]` role** so the app may call it:

| Compute | Add to the small role |
|---|---|
| Lambda | `lambda:InvokeFunction` on that one function ARN |
| Fargate (task per run) | `ecs:RunTask` on the task definition + `iam:PassRole` on its two roles |
| Fargate (always-on service) | nothing — the app calls it over the network |
| SageMaker endpoint | `sagemaker:InvokeEndpoint` on that endpoint ARN |
| Batch | `batch:SubmitJob` on the job queue + job definition |

For every new AWS call in code, add one statement for its named resource before
redeploying; remove statements when the
call goes. The service's own role never gets what only the app needs, and the
small role never gets what only the service needs.

## Wiring it into small

The small app stays the front door — login, Run form, runbook, logs. AWS only
does the heavy call. Use this checklist:

- [ ] Provision with the user's local AWS credentials after one sentence explaining
   what will be created and why.
   For Lambda: build the container image, push to ECR, create the function.
- [ ] Let the small app invoke it with boto3 through the `[aws]` role — add exactly
   `lambda:InvokeFunction` on that one function ARN (or the equivalent single
   permission for Fargate/SageMaker/Batch) to the role's inline policy.
- [ ] Deploy with `small deploy` — the role verification and review will show the
   AWS call. For a job, results still go to `$SMALL_OUTPUTS`; the Lambda
   returns bytes or writes S3 and the job copies them there.

The user's mental model stays "my tool has a URL / a Run button"; AWS is an
implementation detail they approved once.

## Production later

When "MVP on Lambda" grows up, revisit with the same three questions — the
move is usually Lambda → Fargate (steady volume) or → SageMaker (GPU). The
small app does not change: same `[aws]` role, one new permission, one changed
boto3 call.
