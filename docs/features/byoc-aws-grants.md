# Configurable AWS app grants and file inputs

Status: private release `0.1.0-pilot.5.1` installed and
`small-deploy@0.0.10` published to npm as `latest`. This is an update to the
existing private installation and app UI; shared hosted permissions keep their
current S3 folder scope. See [AWS BYOC](byoc-aws.md) for installation history.

## Why

The drift, oof, and overreach wrappers need scoped S3 writes/listing/reads,
Lambda invocation, and ECS task inspection. Overreach also needs an event ID
file input. A fixed five-action list would force software releases for future
customer capabilities. The installation therefore defines the available actions,
and each app requests an exact subset against its own resources.

## Contract

The customer AWS stack has a CommaDelimitedList parameter, `AppGrantActions`.
Its initial value is `s3:GetObject,s3:PutObject,s3:ListBucket,lambda:InvokeFunction,ecs:DescribeTasks`.
The AWS administrator can update that parameter with the current template.
Software updates preserve the customer's existing value. Each app declares a
single-line `[aws] grants` array in `small.toml`; the exact syntax lives in the
[bundled agent reference](../../skills/small/references/aws-hosting.md).

Deployment stops for approval before source upload. The installation owner
reviews each action and resource in **Settings > Connections > AWS > App access**.
Approval replaces the app's previous grants. Changing or clearing grants needs
new approval. Every deploy and run checks the latest approval and installation
ceiling. Grant changes and migrations retain conditional, recoverable request
state; no deploy runs ahead of a partly applied IAM update.

No customer account is hardcoded. The template supplies its own account/region
to both validation and policy enforcement. The current region remains
`us-east-1`. Action names are exact; requests have at most 20 grants. Resources
must be same-account regional ARNs or S3 ARNs, with trailing S3 object/folder
wildcards and named-cluster ECS task wildcards supported. Actions that require
an unscoped `Resource: "*"` cannot use this contract. AWS Access Analyzer policy
validation rejects errors and security warnings before changing the app role.
The boundary denies missing or foreign `aws:ResourceAccount` and any other
region. Additional actions must support that ownership context key, as well as
scoped ARNs. See [AWS's resource-account condition documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-resourceaccount).

The customer-configured ceiling is an authority decision, not a promise that
all accepted actions are harmless or read-only. Writes may overwrite data;
Lambda invocation inherits the function's existing capabilities. Additional
actions can mutate resources if the administrator deliberately enables them.
IAM, STS, Organizations, Account, and CloudFormation management are excluded.
Small's named control resources, Cognito pool, web/release buckets, and internal
source/run/upload storage are reserved. This does not claim a universal sandbox
against arbitrary administrator-approved control operations or powerful functions.

New grants use a new permissions boundary and app-role prefix. The legacy
GetObject boundary is unchanged. Each new app policy explicitly denies actions
outside its approved set and resources outside each action's approved union,
so widening the installation parameter cannot silently widen old approvals.
Migrating from `s3_read` requires approval and denies the legacy role. Existing
single-folder apps retain their old workflow and sample-folder access.

Jobs keep their private subnet. S3, ECR, Logs, Lambda, and ECS endpoints are
installed. Another service may need a customer-managed VPC endpoint before its
API is reachable; adding an IAM action does not install that endpoint. Parser
tests with another service establish configuration support, not live network
support. App permission changes within the configured ceiling need no stack
update; a new service may need both a parameter update and network configuration.

The private stack creates no external AWS trust. Amazon installation operations
use only account `503561429929`; personal account `637423432890` is never a
principal, credential source, or artifact host for this update. This addresses
that trust design; it does not promise exemption from company security review.

## File input path

The existing Run form and CLI accept up to five files of 10 MiB each. Metadata
is submitted to the authenticated customer API; bytes go by checksum-bound S3
PUT directly to the installation bucket. The saved upload belongs to a specific
user, app and deployment and expires after 15 minutes. Starting a run checks
size and checksum and pins the S3 VersionId. The runtime downloads that version,
verifies it again, and supplies a local path through existing input environment
variables. File contents never enter the shared control plane. Run details can
link back to the same versioned input. Existing scalar inputs and output/log
flows remain intact.

## Release checklist and evidence

- [x] Configurable ceiling, exact per-app approvals, and legacy migration.
- [x] CLI grants and file input support; existing Settings/Run UI extended.
- [x] Bundled agent instructions and README updated.
- [x] Python regression suite: 103 passed across the suite and final added
      run-authorization test, plus 26 subtests; repository unit suite: 31 passed.
- [x] CLI/template checks: 68 passed. Browser checks: all six scenarios passed.
- [x] Private installation updated and a synthetic app verified in AWS.
- [x] CLI package inspected, behavioral skill checks run through subscription,
      and npm release published.
- [x] Shared dev UI built with both preview flags and deployed as
      `aeff9ac6-03f3-4bd1-8ed9-f43bfd2ad732`.

AWS verification: the corrected stack reached `UPDATE_COMPLETE`; the
dashboard assets were published at the existing private URL. AWS Access Analyzer
accepted a policy combining all five default action/resource shapes (including
S3 folder and ECS task wildcards) with zero findings; that validation did not
grant the policy. The synthetic `aws-grants-proof` app migrated from a legacy
folder string to an exact grant list through the owner API, and its previous
role now contains only Deny-all. The packaged CLI deployed its source through
customer CodeBuild/ECR to the normal Apps interface.

A real Chromium request from the private installation's origin uploaded the
16-byte synthetic event file to customer S3 with HTTP 200. Starting the run
required a matching server-reported SHA-256 and non-null S3 VersionId. Input
links resolve to that pinned version. Run `r-1789086638601-fd72a60ae3d9` finished
with exit 0 and produced the expected `proof.json`: five CSV rows and exactly
`event-1`, `event-2`. This exercises the actual customer S3/API/Fargate path in
addition to the browser fixtures.

Review the app at [aws-grants-proof](https://d3sgti338uxlc.cloudfront.net/apps/aws-grants-proof).
The same Settings/Run components are on [shared dev](https://small-cp-dev.zeroshothq.workers.dev/apps);
the Amazon app and its data belong to the private installation.

The public CLI archive contains 33 files and no runtime dependencies, customer
identifiers, or configured credential values. Its SHA-256 is
`c22e01b7aadaae1106e17d9b417989e9d10e1ee874919fbd52a732b6f0e8ea27`.
The four behavioral scenarios (`plain`, `vague`, `aws`, `byoc`) passed using the
user's Claude subscription with mocked deployment commands. Final release-name
and input-file documentation corrections were applied afterward; the six skill
consistency checks pass on the published instructions. The private release's
embedded prepublication CLI has identical implementation files and earlier
documentation; new users install the final npm package. Standalone `small-skill`
was not republished: refresh the CLI's bundled instructions with `small skill`.

A fresh npm install resolved to `0.0.10`; all 33 files were checked against the
published archive (npm normalizes only the executable's shebang line ending).
That fresh CLI uploaded the event file and completed a second real run,
`r-1789086976562-f5400d4c418f`, with exit 0 and the same 95-byte output.
Release evidence is in ignored `.small/npm-release/0.0.10/`; AWS proof state
and the checked output are in `.small/byoc-private/proof-pilot5-*.json`.

```sh
npm install -g small-deploy@0.0.10
small skill
```

Keep the existing private login and workspace. The other coding agent should
declare the supplied resource ARNs under `[aws] grants` (one physical line),
declare `event_ids_file` as a file input for overreach, and run `small deploy
--workspace w-small-aws`. The owner reviews each request in the private
installation's Settings. A later action outside the configured ceiling needs
an administrator's `AppGrantActions` update before retrying deployment.

The other coding agent owns deployment of drift-debug, oof-debug and
overreach-debug. This release supplies the platform capabilities; it does not
start those workloads or claim their application tests passed.

The first AWS update (`pilot.5`) caught an invalid wildcard service segment in
the generated boundary ARN and rolled back. `pilot.5.1` replaces it with the
resource-account condition and concrete service names for internal resource
protection. A template regression test pins that correction.

<!-- ponytail: the hosted make test-integration suite was not rerun for this
main push: it expects a hosted CLI login and deploys/runs shared Fly fixtures,
while the active login targets private AWS. The private integration evidence is
recorded above. Pre-commit checks passed: make test-unit (31), BYOC Python
(103 plus 26 subtests), and focused CLI/template tests (24). -->
