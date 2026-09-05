# AWS access — create and maintain the role yourself

Read this when the tool calls AWS (boto3, S3, Lambda, …).

**Never put AWS keys in `.env`.** Declare a role instead:

```toml
[aws]
role_arn = "arn:aws:iam::<account-id>:role/small-<app-name>"
```

small's control plane assumes the role per session (servers) or per run (jobs)
and injects short-lived STS creds into the environment — boto3 finds them with
zero config lines. `small deploy` verifies the role is assumable; when it is
not, it fails with the exact trust policy JSON to paste.

The user is likely non-technical; their AWS credentials are on this machine
(`aws sts get-caller-identity` to check; if that fails, ask the user to sign
in to AWS first). Steps:

1. Tell the user in one sentence what you are about to create and why
   ("a role that lets small run this tool against your S3 bucket, nothing
   else"). Then:
2. Get the account id from `aws sts get-caller-identity`, fill
   `role_arn = "arn:aws:iam::<account>:role/small-<app-name>"` into small.toml,
   and run `small deploy`. It fails and prints the trust policy.
3. Create the role with that trust policy **verbatim** (save it to a file,
   `aws iam create-role --role-name small-<app-name>
   --assume-role-policy-document file://trust.json`). Never edit the
   ExternalId — it is the user's org and closes the confused-deputy hole.
4. Attach an inline permissions policy for **exactly what the code you wrote
   touches** — you know the actions and resources because you wrote the calls.
   `s3:GetObject` on the one bucket, `lambda:InvokeFunction` on the one
   function. Never `*` actions, never `AdministratorAccess`, never resources
   the tool does not use. (`aws iam put-role-policy`.)
5. `small deploy` again — it must print `✓ aws role: … (verified)`.

**Updating**: when a code change adds a new AWS call, widen the inline policy
by that one action/resource before redeploying. If a run's log shows
`AccessDenied`, the message names the blocked operation — add exactly that,
rerun. Shrink the policy when calls are removed.

Never work around a failed verification or a denied action with access keys
in `.env` or hard-coded credentials — fix the role.
