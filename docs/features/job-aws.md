# [aws] on jobs

Servers already get AWS via `[aws] role_arn` — guard fetches STS session creds from the
control plane and refreshes them (docs/v3). Jobs now get the same role, the lazy way:
the control plane mints **one STS session at machine start** and passes it in the run
machine's env as the standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
`AWS_SESSION_TOKEN` / `AWS_REGION`. runner.py does nothing; the child process inherits
the env and boto3 finds the creds on its own.

- A failed mint fails the run at start (`sts assume role failed ...`), not mid-script.
- The 1h session outlives a normal run. ponytail: no refresh — a job running past 1h
  loses AWS; add a re-mint when such a job exists.
- Same trust model as servers: customer role trusts small's principal with the org as
  `ExternalId`; nothing stored, creds die with the machine.

S3 in/out needs no platform support beyond this: declare the URI and destination as
`text` inputs and let the script use boto3 — see `examples/s3-job` (reads
`s3://bucket/key`, writes a report to `$SMALL_OUTPUTS` and back to a bucket).

Demo role for the example/tests: `small-s3-demo` (S3 rw on the demo bucket only;
created by the scratchpad IAM script, same trust as `small-yolo-demo`).

## Skipped

- s3:// values for `file`-type inputs — ponytail: text input + boto3 in the script covers it; teach the CLI SigV4 only if scripts keep reinventing the download.
- An `--output-bucket` platform flag / outputs-to-S3 sync — ponytail: destination is just another input; R2 outputs + `--download` already keep results.
- Cred refresh for >1h jobs — ponytail: mint-at-start only until a long job exists.
