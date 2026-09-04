# yolo-lambda — bring-your-own-AWS example

The Gradio UI runs on small; YOLO inference runs in **your** AWS account on a
Lambda. Weights stay in your private S3 bucket, behind your Lambda. small never
holds your AWS keys — you grant it a role instead.

## One-time AWS setup (your account, admin creds in env)

```
cd lambda
python setup.py rig      # S3 bucket + weights + CodeBuild image build + Lambda (~10 min)
python setup.py invoke   # sanity: bus.jpg -> boxes, no small involved
python setup.py role     # role small assumes; prints role_arn
```

`rig` creates bucket `small-yolo-weights-<account-id>`, uploads `yolov8n.pt`,
builds the container image in CodeBuild (no local Docker needed), and creates
function `small-yolo` with `WEIGHTS_BUCKET`/`WEIGHTS_KEY` as Lambda env vars —
that's how `handler.py` finds the bucket. It also writes `../.env` with
`LAMBDA_ARN`.

`role` creates `small-yolo-demo`: trust policy naming small's AWS principal
with your small org as `ExternalId` (so nobody else's app can use your role),
permissions = `lambda:InvokeFunction` on this one function. Deleting that trust
policy revokes small instantly.

## Deploy

Paste the printed `role_arn` into `small.toml` under `[aws]`, then:

```
small deploy
```

At boot the container receives 1-hour STS session credentials for your role
(auto-refreshed); its env never contains AWS keys. Every Lambda invocation
carries the signed-in user's email (`X-Small-User`) into CloudWatch logs.
