# Heavy compute on the user's AWS — choosing and wiring it

Read this when the user wants their script "to run on AWS" — a model too big
for the app machine, batch inference, GPU, or an existing AWS account they
must use.

## First: does it need AWS at all?

Most "run it on AWS" asks really mean "run it not-on-my-laptop". That is
`small deploy` (server) or `small run` (job) — 2 GB machine, no AWS account,
no extra moving parts. Reach for AWS compute only when the work truly does
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
| MVP, bursty, one item < 15 min, CPU is fine | **Lambda** (container image) | Zero idle cost, scales to zero, the yolo demo shape |
| Steady volume, long-running items, still CPU | **Fargate** (ECS service or task) | No 15-min limit, no cold starts at volume |
| Needs a GPU | **SageMaker endpoint** (or ECS on GPU EC2) | Lambda and Fargate have no GPUs |
| Huge offline backlog, nobody waiting | **AWS Batch** | Queue it, let it drain cheap |

Default to **Lambda** for anything that smells like an MVP — a torch model
fits a Lambda container image (10 GB limit; the small demo runs YOLOv8 this
way). Do not offer the whole table to the user; pick one and say why in one
sentence ("bursty and small — Lambda, it costs nothing while idle").

## Wiring it into small

The small app stays the front door — login, Run form, runbook, logs. AWS only
does the heavy call:

1. Provision with the user's local AWS credentials (same consent style as
   references/aws.md: one sentence about what you are creating, then create).
   For Lambda: build the container image, push to ECR, create the function.
2. The small app invokes it with boto3 through the `[aws]` role — add exactly
   `lambda:InvokeFunction` on that one function ARN (or the equivalent single
   permission for Fargate/SageMaker/Batch) to the role's inline policy.
3. Deploy with `small deploy` — the role verification and review will show the
   AWS call. For a job, results still go to `$SMALL_OUTPUTS`; the Lambda
   returns bytes or writes S3 and the job copies them there.

The user's mental model stays "my tool has a URL / a Run button"; AWS is an
implementation detail they approved once.

## Production later

When "MVP on Lambda" grows up, revisit with the same three questions — the
move is usually Lambda → Fargate (steady volume) or → SageMaker (GPU). The
small app does not change: same `[aws]` role, one new permission, one changed
boto3 call.
