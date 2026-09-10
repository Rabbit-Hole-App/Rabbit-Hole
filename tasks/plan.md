# Plan: customer-hosted AWS BYOC with Cognito

Status: implementation authorized by the user on 2026-09-09. The first slice
(private web login and local dashboard) is deployed in AWS at
[Small AWS](https://d3sgti338uxlc.cloudfront.net/apps). The real sign-in form and
API boundary are checked; the user confirmed successful dashboard sign-in on
2026-09-09. The user then approved private CLI login and one CPU app proof.
Release `0.1.0-pilot.3` is installed; focused CLI, authorization, template,
installer, and browser checks pass. Real CLI sign-in, deployment, CPU run,
logs and the downloaded report passed for `aws-private-proof` (exit `0`, sum `204`).
Sharing changes and S3 approvals remain later checkpoints. Work
items and acceptance checks live in
[todo.md](todo.md). Update both files as implementation progresses.

## Outcome

An administrator installs Small in the customer's AWS account. The builder
signs in with Cognito, deploys a Python CPU job, and shares it with a colleague.
The colleague signs in to the same Small interface, runs the job, and reads
its logs and outputs. Use one workspace in `us-east-1` for the first proof.
Support multiple CPU-job apps through the same installation. Verify the full
deployment/run flow with a small CPU job and synthetic input.

The first visible milestone is **Cognito sign-in opening the existing Small
dashboard at a customer-owned AWS URL**. Preserve the app list, sidebar,
existing app tabs, sharing controls, and enlarged layouts. Do not deliver a
separate AWS demo page or replace Small with the Cognito sample UI.

## What is already known

- The user reported successful sign-in to Cognito's default redirect page.
  This demonstrates the test login, not authentication into Small.
- Reuse the verified pool `us-east-1_K3auyaHVg` and public SPA client
  `3auv96ol86dhoic2c04n5sfo2n` in Amazon account `503561429929`.
  Email sign-in is configured and self-registration is disabled.
- [The saved Cognito examples](../docs/features/byoc-cognito-reference.md)
  are reference material. The supplied CloudFront return URL is not a verified
  Small installation. The verified managed-login domain is
  `https://us-east-1k3auyahvg.auth.us-east-1.amazoncognito.com`; the installer
  appends this installation's callback and sign-out URLs.
- The user's Amazon dev box
  `dev-dsk-cyudhist-1e-31f1d797.us-east-1.amazon.com` has the `default` AWS profile,
  verified as `DrishtiAdminRole` in `503561429929`. The Windows agent environment
  lacks that profile. Run the packaged Python/AWS CLI installer over SSH there.
  **`637423432890` is personal; never use it or its credentials for Amazon.**
- [The existing BYOC preview](../docs/features/byoc-aws.md) already provides
  source upload, CodeBuild builds, ECR images, Fargate CPU runs, logs, outputs,
  and scoped S3 approvals. Reuse these paths.
- Today the dashboard still obtains its login, workspace/app metadata, and
  short-lived AWS grants through Cloudflare. Its AWS connection trusts an
  external Small principal. Connecting Cognito alone does not remove those
  dependencies.

## Proposed architecture

| Part | Location and implementation |
| --- | --- |
| Small interface | Existing React/Vite app in customer S3, served through customer-owned CloudFront with origin access control |
| Login | Existing Cognito pool; authorization code with PKCE; administrator-created test users |
| API entry | API Gateway HTTP API with a Cognito JWT authorizer, invoking customer Lambda |
| App API | Reuse the Python BYOC job API behind a small adapter for the existing dashboard/CLI routes |
| Workspace and access | Customer DynamoDB records for membership, app ownership/sharing, and approvals; identities keyed by Cognito `sub` |
| Deployments and runs | Existing S3 records, CodeBuild, ECR, Fargate, CloudWatch, and app-specific task roles |
| Installer | Customer-operated installation using their authenticated AWS identity and artifacts staged in their account |
| CLI | Existing Node CLI with explicit private endpoint selection and browser-based Cognito login; keep zero dependencies |

Serve authenticated API requests through the installation's `/api` route with
Authorization forwarded and API caching disabled. Source, run inputs, logs,
and outputs use customer AWS endpoints directly. Use the existing runtime's
presigned S3 flows for large objects.

The private deployment omits the external ConnectionRole, hosted grant signer,
and publicly invokable Lambda Function URL. API Gateway is the Lambda entry
point, with invocation permission scoped to that installation. This is a
deployment mode of the existing product, not a fork of its interface or a port
of the entire Cloudflare control plane.

### Distribution

The agreed direction is a commercial self-hosted release model, like
[Retool's self-hosted edition](https://retool.com/govern-enterprise-apps/self-hosted).
Small supplies versioned web assets, backend packages, and an AWS installer.
Installing a release must not require access to the development repository.
The customer stages those artifacts into their own AWS account using their
own authenticated installer identity; Small receives no cross-account role.

For this pilot, first make the BYOC flow work and package a reproducible
internal release with a version and checksums. Subscription billing,
license-key enforcement, commercial contract changes, and public distribution
are later work. If license enforcement is added, it must preserve this mode's
ability to operate without contacting hosted Small.

Release packaging does not promise source secrecy: the current Python backend
remains inspectable by administrators of the installation. Do not add a
language rewrite or obfuscation project to this MVP.

### Authentication and permissions

Use the web OIDC library in the saved example where suitable; dependencies
remain allowed in the web package, not in the CLI or Python runtime. Process
the login callback before `main.jsx` normalizes the route. Do not render tokens
from the quickstart in the UI or put them in application logs.

Configure the API authorizer for the intended issuer/client and required
access-token scopes. Check membership and app permission inside the API on
every protected operation. A valid Cognito token or matching email domain is
not app authorization. Bootstrap the initial owner and colleague using their
verified Cognito subjects; additional member onboarding can build on this later.

For this proof, the owner deploys, shares, and approves S3 access. A colleague
can see and run a shared app and view its permitted run records. Removing a
share blocks subsequent API access even if the login token has not expired.
Already-issued S3 links remain usable until their short expiry; record and test
that limit rather than promising immediate recall of downloaded data.

CLI login binds a loopback callback, validates OAuth state, and uses PKCE
without a client secret. Store login state against the selected API origin.
An expired private login must not cause fallback to hosted Small or send a
credential to another endpoint.

### Account boundary

The private path must work without `small-cp`, `small-cp-dev`, hosted D1/R2,
Fly.io, or account `637423432890`. There is no external model or telemetry call
in this CPU-job proof. Stage the installer and job artifacts in customer AWS.

Review generated **Allow** policies for external AWS principals and public
access. Retain legitimate protection statements such as S3 TLS **Deny** with
`Principal: "*"`, and allow AWS service principals only with the appropriate
resource/account restrictions. Do not merely search-and-replace an account ID
or suppress Access Analyzer findings.

This design removes the external AWS account trust that caused the reported
finding. It does not promise exemption from other company approval processes.
The pilot uses authenticated AWS HTTPS, including AWS managed endpoints; it
does not claim every request stays inside a VPC.

## Delivery sequence

| Checkpoint | Tasks | Observable result |
| --- | --- | --- |
| Customer foundation | 1-3 | Verified installation inputs, local workspace API, and protected AWS hosting |
| First visible milestone | 4-5, installer subset of 11 | Existing Small dashboard opens after Cognito login |
| Private CLI | 6 | CLI signs into the same customer installation |
| Useful app | 7-9 | Builder deploys and shares a CPU app; colleague runs it and sees logs/output |
| Repeatable MVP | 10-12 | Local S3 approval, repeatable installation, reviewed evidence and current instructions |

Use [the task checklist](todo.md) as the execution record. Report each visible
checkpoint with the customer AWS dev URL. Surface scope changes before
implementation; checkpoint reviews are not a request to repeat already given
authorization for routine work.

Any shared UI change still follows the existing
[Cloudflare dev preview workflow](../docs/features/coaching.md#deploy-dev),
with both dev flags preserved and only synthetic data for this new private
mode. That preview cannot demonstrate private BYOC isolation. Real Cognito
sessions and customer job data are tested at the customer-owned AWS dev URL.
Production promotion and public npm publication are separate actions.

## Verification

Test each changed path before moving to the next checkpoint. Use focused
Python unittest and Node tests for API, policy, CLI, and installer behavior;
build the web app after its changes. At the final checkpoint, run the two-user
sample flow against AWS and inspect requests/policies for the intended account
boundary. Run `make test-unit` before any commit and `make test-integration`
before any merge, as required by the repository.

Keep evidence small: installed account/region, deployed URL, relevant test
results, app/run IDs, expected job output, and any limitations. Do not save
tokens, full request headers, or private data as evidence.

## Limits and open facts

- Resolve by read-only inspection first: customer AWS profile/caller account,
  pool ownership, managed-login domain, actual client callback/logout settings,
  and initial user subjects. If the target identity remains ambiguous, ask the
  user before creating resources.
- Use the existing manually created Cognito pool for this pilot. Automated
  creation of a new pool for every future customer can follow once this path
  works; do not recreate the user's working pool.
- Enterprise SSO, GPU/server apps, billing, and migration of existing hosted
  apps are outside this proof. Coaching, Slack, Watch, and other hosted
  integrations need their own customer-hosted design before activation here.
  Preserve existing UI elements; any proposed removal needs user agreement.
- A fresh private install must preserve existing users and data on update.
  Keep rollback limited to the pilot installation. Do not remove old roles,
  resources, or applications as a side effect of building this plan.

## Design references

- [Cognito authorization code with PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html)
- [API Gateway JWT authorizers and access-token scopes](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [CloudFront origin access control for private S3 content](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
