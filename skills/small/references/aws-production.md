# Production on AWS — infrastructure as code with CDK

Read this when the AWS side of a tool outgrows one hand-made resource: the
user says "production", a second resource appears (queue, bucket, schedule,
second function), or they need staging, review, or clean teardown.

## When NOT to use this

One Lambda behind an MVP does not need a stack — the hand-made function from
references/aws-compute.md is fine. Do not gold-plate; promote to CDK when
repeatability starts paying rent, and say why in one sentence.

## The shape

One CDK app per tool, in the tool's repo, Python (match the user's language):

```
their-tool/
├── app.py / job.py        # the small app — unchanged
├── small.toml
└── infra/                 # the whole AWS footprint, as code
    ├── app.py             # CDK entry
    └── stack.py           # one stack: small-<app-name>
```

Everything AWS the tool touches lives in that one stack:

- **Compute**: `DockerImageFunction` for Lambda (CDK builds and pushes the
  container itself — no hand ECR steps), `ApplicationLoadBalancedFargateService`
  or a plain task definition for Fargate, Batch job queues for backlogs.
- **Pipelines**: Step Functions state machines for multi-step flows,
  EventBridge rules for schedules, S3 buckets and queues between stages.
- **Every role from references/aws-compute.md, in the stack**: CDK creates
  the execution/task roles implicitly per construct — accept those defaults,
  then grant by reference instead of writing policy JSON:
  `weightsBucket.grant_read(fn)` (Lambda execution role),
  `taskDefinition.task_role` grants for what the container touches,
  `queue.grant_send_messages(...)` between pipeline stages. A Step Functions
  state machine gets its role the same way — CDK wires `states:StartExecution`
  and per-step invoke grants for you.
- **The small `[aws]` role too**: define it in the stack — trust policy
  exactly as the failed `small deploy` printed it (principal + org ExternalId),
  then the side-2 grants from references/aws-compute.md by reference:
  `fn.grant_invoke(small_role)`, `state_machine.grant_start_execution(small_role)`,
  `bucket.grant_read_write(small_role)`. The whole footprint, both sides of
  every role, is then reviewable code — and a removed construct takes its
  grants with it, so policies never rot.

Stack outputs (function ARN, bucket name) go into `.env` / `[inputs]` defaults
— never hard-coded in the script.

## Discipline

1. `cdk bootstrap` once per account/region (tell the user it creates a small
   S3 bucket and roles for deployments).
2. **`cdk diff` before every `cdk deploy`** — summarize the diff to the user
   in one sentence ("adds one queue, widens nothing") and wait for a yes when
   anything is destroyed or IAM changes.
3. Migrating the hand-made MVP: recreate the resource in the stack, cut the
   ARN over in `.env`, verify a run, then delete the hand-made one. Simpler
   and safer than `cdk import` for one or two resources.
4. Teardown is `cdk destroy` — mention it exists; it is the reason the stack
   beats console clicking.
5. Tag everything (`small:app = <app-name>`) so the user's bill is legible.
6. Costs: before the first deploy, say what runs idle (Fargate service ≠
   Lambda) in plain money terms.

The small app remains the front door — login, Run form, runbook. CDK only
makes the heavy half reproducible.

## Skipped

- CI/CD for the stack itself (pipelines deploying `cdk deploy` on push) —
  ponytail: the agent redeploys on request; add when a team asks for
  unattended promotion.
- Multi-account/stage setups — ponytail: one account, one stack until the
  user has a real staging account.
