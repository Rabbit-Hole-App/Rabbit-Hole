# v3 — bring-your-own-AWS (2026-09-04)

The business direction: the customer's compute stays in the customer's cloud.
v3 proves it end to end with a YOLO Lambda living in a personal AWS account,
fronted by a small-deployed Gradio app. small never holds the customer's
long-lived AWS keys — the container gets 1-hour STS session credentials minted
by the control plane from a role the customer created.

## Where things actually run

The link serves the UI only; the model never leaves the AWS account.

- **Fly container** (behind the wall) — gradio + boto3 + PIL, 512 MB, ~150 MB
  image. No torch, no weights. It base64s the upload, calls `lambda.invoke()`,
  and draws the boxes that come back.
- **AWS Lambda `small-yolo`** — torch + ultralytics. Weights: `yolov8n.pt`
  (6.5 MB) in the private bucket **`small-yolo-weights-637423432890`**
  (us-east-1); the Lambda role can `s3:GetObject` exactly that key and nothing
  else, and downloads it to `/tmp` on cold start. (The bucket also holds
  `src/lambda-src.zip`, CodeBuild's source from the image build — deletable.)

## How to test the deployed app

Browser: open
https://small-cp.zeroshothq.workers.dev/a/gmail-com/yolo-lambda/ — sign in
(magic link echoed inline on the test instance), upload any photo → boxed
image + detections JSON (~5–15 s warm, ~20 s after idle).

Terminal:

```
make test-integration                                            # full e2e, ~2 min
uv run pytest tests/integration_tests/examples/yolo-lambda/ -v   # just this app
make deploy DIR=examples/yolo-lambda                             # full redeploy loop
```

Attribution check: after an upload, CloudWatch log group `/aws/lambda/small-yolo`
shows `invoke user=<your email>` for that invocation.

## Step 1 — the AWS test rig (no small involvement)

Built entirely from boto3 (no aws CLI or Docker installed on this machine).
Reproducible from the repo: `examples/yolo-lambda/lambda/setup.py`
(`rig` / `invoke` / `role` subcommands, see the example's README):

- Weights: `yolov8n.pt` in private bucket **`small-yolo-weights-637423432890`**
- Image: built in the cloud by **CodeBuild** (`small-yolo-lambda-build`, S3-zip
  source, privileged docker, buildspec inline) → ECR `small-yolo-lambda:latest`.
  Local Docker was not needed at any point.
- Lambda: **`arn:aws:lambda:us-east-1:637423432890:function:small-yolo`** —
  container image, 2048 MB, 120 s timeout. Handler downloads the weights from
  S3 to /tmp on cold start, decodes `image_b64`, returns
  `{"boxes": [{label, conf, xyxy}], "user"}` and logs `invoke user=<user>`.
- Proven with `aws lambda invoke`: bus.jpg → 6 boxes (bus, 4 person, stop sign).
  Cold invoke 45.5 s (image pull + weights + torch import), warm ~2 s.

## Step 2 — the front end (crude version, superseded by step 4)

`examples/yolo-lambda`: Gradio app, image → base64 → `boto3` invoke → draws the
returned boxes with PIL. Light image (gradio + boto3 + pillow — no torch).
The crude version read `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` of IAM user
`small-yolo-invoker` (inline policy: `lambda:InvokeFunction` on that one ARN,
nothing else) from `.env`. When step 4 landed the keys were removed from the
example's `.env` and deleted in IAM (the keyless user shell remains).

## Step 3 — attribution

`predict(img, request: gr.Request)` reads the `X-Small-User` header the wall
injects, and sends it as the `user` field of every Lambda payload. The handler
prints `invoke user=<email>` → CloudWatch `/aws/lambda/small-yolo`. The
integration test asserts the invoking test user's email shows up there.

## Step 4 — `[aws]` in small.toml

```toml
[aws]
role_arn = "arn:aws:iam::637423432890:role/small-yolo-demo"
```

Flow:

1. CLI (0.0.5) sends `awsRoleArn` with `/api/deploy`; worker stores it on the
   app row (D1 `apps.aws_role_arn`) and the CLI sets `SMALL_CP_URL` as a Fly
   secret so the guard knows to fetch.
2. At machine boot the guard POSTs `{secret: SMALL_PROXY_SECRET}` to
   `/api/runtime/aws-creds`. The worker looks the app up **by proxy secret**
   (per-app, 256-bit — no CLI token in the machine), calls STS `AssumeRole`
   (hand-rolled SigV4 in `src/aws.js`, no SDK) with
   `ExternalId = <app org>`, and returns 1 h session creds.
3. The guard writes them as a boto3 shared-credentials file and starts the app
   with `AWS_SHARED_CREDENTIALS_FILE` pointing at it. A daemon thread refreshes
   the file 10 minutes before expiry; boto3 clients created per request pick up
   the new session. **The app env never contains AWS keys.**
4. The worker's own AWS principal is IAM user `small-cp` (only permission:
   `sts:AssumeRole`); its keys are Worker secrets, same trust level as the Fly
   org token.

### Trust policy the user pastes on their role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::637423432890:user/small-cp" },
      "Action": "sts:AssumeRole",
      "Condition": { "StringEquals": { "sts:ExternalId": "<your small org, e.g. gmail-com>" } }
    }
  ]
}
```

Plus a permissions policy on the role for whatever the app may touch — here:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:637423432890:function:small-yolo"
    }
  ]
}
```

The `ExternalId` condition closes the confused deputy: org A pasting org B's
role ARN into small.toml gets `AccessDenied`, because the worker always sends
the calling app's own org as ExternalId. Revocation = the customer deletes the
trust policy; small's access dies instantly, no key rotation.

## Step 5 — integration test

`tests/integration_tests/examples/yolo-lambda/test_app.py`:

- bus.jpg through the wall → Lambda → asserts ≥1 box.
- Machines-API `exec env` in the container → asserts **no**
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`; `cat /tmp/small-aws-creds` →
  asserts `aws_session_token` (STS, not long-lived).
- CloudWatch filter → asserts `invoke user=<test email>`.

Unit: `test_guard_aws.py` — guard against a fake control plane; asserts creds
file contents + `AWS_SHARED_CREDENTIALS_FILE` in app env + no key vars.

## Issues hit

1. **Fly user auth tokens rot in ~30–60 min.** The discharge macaroon inside
   `flyctl auth token` output expires; flyctl silently refreshes it, a pasted
   copy doesn't. Symptom trail: GraphQL `viewer` keeps answering while the org
   query and Machines API go 403 — so the failure looks intermittent
   (worker isolates with a cached org id kept minting for a while). Confirmed
   definitively that **org tokens cannot mint limited tokens** (flyctl-created
   org token → "Not authorized to access this createlimitedaccesstoken", same
   as the dashboard one). Fix shipped: split tokens + stored per-app tokens —
   `FLY_ORG_TOKEN` (long-lived org token, `flyctl tokens create org -o
   personal -x 87600h`) does app create/IP/machine ops; the user token is
   needed only ONCE per app: the worker mints a **30-day app-scoped deploy
   token at app creation and stores it in D1** (`apps.deploy_token`), so
   deploys/logs of existing apps never touch the user token again. Real fix
   (v4): offline macaroon attenuation of the org token — no JS port of
   superfly/macaroon exists yet, so it means porting msgpack+HMAC caveat
   append to the Worker.
1b. **First org token was scoped to the wrong org** — `flyctl tokens create
   org` uses flyctl's current org context (the empty "small-deploy" org), and
   every API call 403'd. `-o personal` fixed it.
1c. **Gradio SSE through the guard 502'd intermittently.** gradio closes the
   `/gradio_api/call/<id>` event stream without a terminating chunk; the
   guard's full-buffer `resp.read()` raised `IncompleteRead`, dropping the
   connection mid-response, which Fly's proxy converts to 502 — and the
   worker's GET-retry loop re-triggered it for 50 s. Fix (CLI 0.0.6 guard):
   `text/event-stream` responses stream chunk-by-chunk and `IncompleteRead`
   partials are served, not raised. Unit-tested with an app that dies mid-chunk.
1d. **yolo-lambda OOM at the 256 MB default** (exit 137, `oom: true` in
   machine events) — gradio + PIL + boto3 need more under load; small.toml now
   says `memory = "512MB"`. Symptom was maddening: suite green, then 502s
   mid-run as the machine restarted.
2. **awscli v2 needs admin MSI; Docker absent** → awscli v1 + boto3 in a venv,
   CodeBuild for the image. `aws.cmd` shim broke ("File association not found
   for .py") — invoked `awscli.clidriver` directly with the venv python.
3. **New-IAM-user eventual consistency** — trust policy naming `small-cp`
   seconds after creation → `MalformedPolicyDocument: Invalid principal`;
   fixed with retry. Same for CodeBuild/Lambda role assumption (retry loops).
4. **Wrote empty Worker secrets once**: a heredoc python couldn't open an MSYS
   `/c/...` path, output redirect still created the file, and
   `wrangler secret put` happily uploaded 0 bytes. Re-uploaded with node +
   `test -s` guard. Lesson: verify the file is non-empty before piping secrets.
5. **`make` broke from git-bash** (BASH derivation found `mingw64\bin\git.exe`,
   not `cmd\git.exe`) → Makefile now prefers plain `bash` when it's on PATH.

## Ceilings (ponytail)

- Worker `FLY_API_TOKEN` (user token) rots in ~30 min — needed only when
  **creating a new app** (first mint). New-app deploys fail 502 until a fresh
  `flyctl auth token` is pushed. Existing apps are immune (stored 30-day
  tokens; re-mint before day 30 or the same dance returns).
- Stored per-app deploy tokens live in D1 for 30 days — leak blast radius is
  one app; macaroon attenuation (v4) removes them entirely.
- Guard refresh writes the shared-credentials file; an app that builds one
  boto3 client at import and holds it >50 min will see expired creds. Fine for
  request-scoped clients (the example creates one per predict).
- `small-cp` may assume any role that trusts it (`Resource: "*"`) — narrowing
  to tag-scoped roles is a later hardening.
- Weights download on every Lambda cold start (~1 s from S3) — per scope, no
  baking into the image, no GPU, no volumes.

## Current state

- Lambda ARN `arn:aws:lambda:us-east-1:637423432890:function:small-yolo`,
  bucket `small-yolo-weights-637423432890`, role `small-yolo-demo`,
  principal `small-cp`.
- npm `small-deploy@0.0.6` (0.0.5: sends role, sets SMALL_CP_URL, STS guard;
  0.0.6: SSE streaming guard).
- Worker deployed with `/api/runtime/aws-creds` + AWS secrets + split Fly
  tokens + stored per-app deploy tokens; D1 migrated (`aws_role_arn`,
  `deploy_token`). Live STS mint verified (200 + SessionToken; bad secret 403).
- Live: https://small-cp.zeroshothq.workers.dev/a/gmail-com/yolo-lambda/
  (fly app `small-yolo-lambda-90286d`, 512 MB).
- **Full suite: 14/14 green** (2m11s) — counter ×6, yolo-gradio ×1,
  yolo-lambda ×3 (boxes through wall, no-AWS-keys exec check, CloudWatch
  attribution), guard units ×4 (proxy, ws, sse, aws).
