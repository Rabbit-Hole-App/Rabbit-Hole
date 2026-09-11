# Tasks: customer-hosted AWS BYOC with Cognito

Status: first dashboard milestone deployed on 2026-09-09 at
[Small AWS](https://d3sgti338uxlc.cloudfront.net/apps), Amazon account
`503561429929`, release `0.1.0-pilot.1`. All 35 focused checks pass, along with
both web builds. Live API denial, backend/DynamoDB wiring, Cognito settings
preservation, and the real email-first login form are checked. On 2026-09-09,
the user confirmed that sign-in to the deployed dashboard works. Separate live
refresh/logout confirmation remains pending. See [the plan](plan.md) for scope and
architecture. Paths marked **new** below are proposals for remaining work.
Refine file boundaries when implementing;
keep each task focused and record its verification before checking it off.

## 1. Confirm the pilot installation inputs

Read the customer's current AWS identity and Cognito settings, then record the
small set of routes/data the existing dashboard needs for the CPU-job flow.

**Acceptance**

- [x] Customer caller account, region, pool/client ownership, managed-login
  domain, and initial user subjects are verified without changing AWS resources.
- [x] Actual hosting/callback URLs are distinguished from the Cognito demo URL.
- [ ] The route contract covers workspace, catalog, members/sharing, deploys,
  runs, and S3 approval; unsupported integrations cannot fall back to hosted APIs.

**Verification:** Compare recorded facts with AWS read-only output and the
call sites in `main.jsx`, `api.js`, `app-data.js`, `Sidebar.jsx`, and `SharePage.jsx`.

**Dependencies:** None. **Scope:** Small.
**Likely files:** `tasks/plan.md`, `docs/features/byoc-cognito-reference.md`,
`docs/features/byoc-aws.md`.

## 2. Serve an authenticated local workspace

Add the minimal customer API adapter and membership lookup needed to open
Small with an owner and an initially empty app list.

**Acceptance**

- [x] Verified Cognito identity maps to an explicit local workspace membership
  using `sub`; the owner is initialized from the confirmed installation inputs.
- [x] Existing UI contracts for workspace/profile/catalog reads return local
  data; an authenticated nonmember is denied.
- [x] Authorization is separate from the job dispatcher so later deploy/run
  routes can use the same checks without trusting client-supplied owner IDs.

**Verification:** Focused Python tests for missing claims, membership denial,
owner lookup, and expected API response shapes. Live JWT checks follow in task 3.

**Dependencies:** 1. **Scope:** Medium.
**Implemented files:** `packages/byoc/private_api.py` and
`packages/byoc/test/test_private_api.py`. The small identity check stays in the
API module; no separate auth module is needed for these routes.

## 3. Host the pilot inside customer AWS

Create the AWS web/API entry points and local metadata table first. Reuse the
current CPU-resource design when private job deployment is added in task 7;
this login milestone does not create idle job infrastructure.

**Acceptance**

- [x] Customer S3/CloudFront serves Small; API Gateway authenticates access
  tokens before invoking Lambda. Private API responses are not cached.
- [x] External connection/signer trust and the public Lambda URL are absent;
  service invocation policies are restricted to the installation's resources.
- [x] Pilot artifacts are staged and deployed with the verified customer
  identity; the existing Cognito pool/users are retained.

**Verification:** Template tests plus deployed requests rejecting missing,
expired, wrong-client/issuer, and ID tokens. Check Lambda cannot be called
through an unauthenticated alternate URL and inspect generated Allow policies.

**Dependencies:** 2. **Scope:** Medium.
**Likely files:** `packages/byoc/private-template.mjs` (**new**),
`packages/byoc/template.mjs`,
`packages/byoc/test/private-template.test.mjs` (**new**),
`packages/byoc/test/template.test.mjs`.

### Checkpoint: customer foundation

- [x] A customer-owned HTTPS endpoint serves the protected local API.
- [x] Focused tests pass and no new external AWS account trust exists.
- [x] Report the verified target and any scope questions before the UI slice.

## 4. Connect Cognito to the existing React application

Wire code/PKCE login into Small's root without replacing its interface with
the saved quickstart component.

**Acceptance**

- [x] Login callback completes before route normalization; state/PKCE errors
  fail clearly and successful login returns to the intended app path.
- [x] Refresh, expiry, and sign-out behave consistently; tokens are never
  displayed in the product or written to application logs.
- [x] Hosted Small retains its existing login behavior when private mode is off.

**Verification:** Focused callback/session checks and web build. Exercise
successful login, callback replay/error, deep-link refresh, and logout against
the pilot pool after configuring exact callback and sign-out URLs.

**Dependencies:** 3. **Scope:** Medium.
**Implemented files:** `packages/web/src/main.jsx`, `private-auth.js`,
`PrivateAuthGate.jsx`, `packages/web/test/private-auth.test.mjs`,
`packages/web/e2e/private-login.spec.js`, `packages/web/package.json`, and
`package-lock.json`. Browser evidence uses synthetic provider/API replies;
the user separately confirmed real sign-in on 2026-09-09. Live reload/logout
confirmation remains outstanding.

## 5. Open the existing dashboard using only local APIs

Connect the shared web API/app-data adapters to the private endpoint and
provide the local responses needed by the existing shell.

**Acceptance**

- [x] Cognito login opens the normal Apps interface at the AWS URL, with the
  existing sidebar, app layouts, and Settings navigation intact.
- [x] The app list and member/workspace reads use local data. Unavailable
  operations are explicit and do not call Cloudflare/Fly/external integrations.
- [x] Private authentication failures return to the private login flow;
  hosted mode continues to use its original transport.

**Verification:** Build and inspect the existing screens in the AWS pilot;
verify network destinations and private/hosted transport separation. Publish
any shared UI changes to Cloudflare dev with synthetic data and both dev flags.

**Dependencies:** 4. **Scope:** Medium.
**Likely files:** `packages/web/src/api.js`, `packages/web/src/app-data.js`,
`packages/byoc/private_api.py`,
`packages/byoc/test/test_private_api.py`,
`packages/web/src/private-api.test.mjs` (**new**).

## 6. Log the CLI into the private installation

Add browser-based Cognito login for an explicitly selected customer API URL.
Use Node's built-in HTTP/crypto support and retain the current hosted login.

**Acceptance**

- [x] The CLI uses a registered loopback callback and code/PKCE, validates
  OAuth state, and requires no client secret or new CLI dependency.
- [x] Stored credentials are bound to the selected API origin; changing
  endpoints cannot reuse or transmit a previous installation's token.
- [x] Private expiry/authentication errors do not fall back to hosted Small.

**Verification:** Node tests for callback/state validation, token exchange
failure, endpoint-bound config, and existing hosted behavior pass. The user
completed real CLI sign-in as `cyudhist@amazon.com` in `w-small-aws`.

**Dependencies:** 3 and 5. **Scope:** Medium.
**Likely files:** `packages/cli/bin/small.js`, `packages/cli/lib/api.js`,
`packages/cli/lib/cognito.js` (**new**),
`packages/cli/test/cognito.test.js` (**new**), `packages/cli/test/api.test.js`.

### Checkpoint: first visible milestone

- [x] The user signs into the actual Small dashboard at the customer AWS URL.
- [ ] The user verifies refresh/logout at the AWS URL. Private CLI is task 6.
- [x] Share the URL and login result for review before expanding the app flow.

## 7. Deploy a CPU sample through the private endpoint

Route the existing CLI bundle/upload/build/finalize workflow to the local
API and make the resulting app appear in the normal sidebar.

**Acceptance**

- [x] The builder deploys a sample Python CPU job without a hosted Small grant.
- [x] Source upload, build, image storage, and deployment records stay on
  customer AWS endpoints; owner checks precede upload/presign operations.
- [ ] Deploying another app reuses the installation without replacing the first.

**Verification:** Focused CLI/API tests including nonowner denial and failed
build reporting; deploy two small synthetic apps and confirm catalog results.

**Dependencies:** 5 and 6. **Scope:** Medium.
**Likely files:** `packages/cli/lib/byoc.js`,
`packages/cli/lib/byoc-client.mjs`, `packages/byoc/private_api.py`,
`packages/cli/test/byoc.test.js`, `packages/byoc/test/test_private_api.py`.

## 8. Share an app with the second test user

Back the existing sharing interface with customer-local membership and app
permissions. Test with the administrator-created colleague account.

**Acceptance**

- [ ] The owner can share/unshare using the existing app controls; access
  is bound to verified user identity and survives a fresh sign-in.
- [ ] The colleague sees only permitted apps and cannot deploy, alter shares,
  approve S3 access, or guess another app's identifiers to gain access.
- [ ] Revocation blocks new API and presign requests immediately; previously
  issued object URLs have a documented, tested short expiry.

**Verification:** API permission tests across catalog, app/run resources and
mutations, then a two-browser owner/colleague sharing check.

**Dependencies:** 7. **Scope:** Medium.
**Likely files:** `packages/byoc/private_api.py`,
`packages/byoc/private_auth.py`, `packages/byoc/private-template.mjs`,
`packages/byoc/test/test_private_api.py`,
`packages/byoc/test/test_private_auth.py`.

## 9. Run the sample and inspect its result

Use the existing Run, Logs, and output views with the customer API and current
Fargate/S3 pipeline.

**Acceptance**

- [ ] The colleague runs the shared CPU job and gets the expected
  result, readable logs, and a downloadable output through normal app tabs.
- [ ] Polling, logs, and output links enforce the same app permissions as
  the Run action, including error paths and guessed run IDs.
- [ ] Network inspection shows no job data sent through hosted Small.

**Verification:** Focused run/adapter tests, then one two-user run with synthetic
input; compare output to the known result and inspect failure display.

**Completed owner-only checkpoint, 2026-09-09:** private CLI login, deployment
`d-1789013429327-d057c38a82b6`, and run `r-1789013587930-68fb628c493f`
passed in Amazon account `503561429929`. The job exited `0`; the CLI read its
CloudWatch log and downloaded `report.json` with `count: 8` and
`sum_of_squares: 204`. The synthetic browser test passes the normal Run, Logs,
and output UI without hosted requests. Release `0.1.0-pilot.3` is published at
[aws-private-proof](https://d3sgti338uxlc.cloudfront.net/apps/aws-private-proof).
The two-user sharing acceptance above remains pending; it was not part of
this owner-only checkpoint.

**Dependencies:** 8. **Scope:** Medium.
**Likely files:** `packages/web/src/app-data.js`, `packages/byoc/private_api.py`,
`packages/byoc/api.py`, `packages/byoc/test/test_private_api.py`,
`packages/byoc/test/test_api.py`.

### Checkpoint: useful app

- [ ] Builder deploys and shares; colleague runs and reads the job result.
- [ ] The unchanged app interface works at the customer AWS URL.
- [ ] Access denial and account-boundary checks pass; share the concrete result.

## 10. Keep scoped S3 approval inside the installation

Connect the existing exact-folder approval and deploy-resume behavior to
local owner authorization and customer metadata.

**Acceptance**

- [x] A new folder request appears in existing Settings; only the workspace
  owner can approve the exact app/folder request or cancel it.
- [x] The bounded IAM handler preserves other apps' grants and cannot broaden
  its own boundary or access another app's folder.
- [x] Waiting CLI deployment resumes after approval and handles cancellation,
  retries, and partial failures without source upload before approval.

**Verification:** Existing permissions/API tests extended for Cognito owner
authorization and request binding; read a folder of synthetic test objects and verify
an adjacent folder is denied.

**Dependencies:** Private CPU path is shipped; user selected S3 before colleague
sharing. **Scope:** Medium. Shipped in private `0.1.0-pilot.4`: Cognito owner
routes, private IAM resources, existing Settings/CLI approval flow, and synthetic
AWS proof. The supplied CLI paused/resumed; the CSV run returned 5 rows/94.30,
the adjacent folder returned AccessDenied, and the original CPU app still ran.
See [recorded results](../docs/features/byoc-aws.md#private-installation-s3-approval-milestone).
Colleague sharing/onboarding is still outstanding.
**Likely files:** `packages/byoc/private_api.py`, `packages/byoc/permissions.py`,
`packages/byoc/private-template.mjs`,
`packages/byoc/test/test_private_api.py`,
`packages/byoc/test/test_permissions.py`.

## 11. Make the pilot installation repeatable

Package the verified pilot setup into a customer-operated installation path,
reusing the existing Cognito pool and creating no dependency on Small's AWS account.
Deliver an internal versioned release of web assets, backend packages, and
installer files, with checksums and no development-repository requirement.
Billing and license-key enforcement remain later work.

**Acceptance**

- [x] Installer validates caller/target account and release checksums, stages
  versioned artifacts in customer AWS, and prints the actual Small URL and
  required login configuration; installation needs no repository access.
- [x] Callback/logout updates preserve existing app-client settings and users;
  runtime roles cannot administer the pool or replace their own boundaries.
- [ ] Repeating an install/update preserves app data and grants; rollback is
  limited to the pilot's changed resources and retains durable data.

**Verification:** Installer/template tests with mocked AWS failures, account
mismatch, and corrupt artifacts; install from the release package without a
source checkout, then repeat the pilot update and confirm users, apps, and run
history survive.

**Dependencies:** Initial package brought forward for tasks 3-5; complete
preservation checks after task 10. **Scope:** Medium.
**Implemented files:** `packages/byoc/install-private.py`,
`packages/byoc/package-private.mjs` (**new**),
`packages/byoc/private-template.mjs`,
`packages/byoc/test/test_private_installer.py`,
`packages/byoc/test/private-template.test.mjs` (**new in task 3**).

## 12. Review the MVP and publish accurate instructions

Review the final account boundary and two-user result, then document the
implemented installation and CLI flow without claiming a public release.

**Acceptance**

- [ ] Evidence records account/region, installed URL, successful sample run,
  relevant negative checks, and absence of new external trust or hosted dependencies.
- [ ] Feature docs and CLI skill instructions describe actual commands and
  availability, and prevent the old external-principal setup being used for this mode.
- [ ] Remaining limitations are explicit; production deployment, npm publication,
  SSO, and migrations remain separate from the completed pilot.

**Verification:** Review generated/runtime policies and browser/CLI destinations;
complete any remaining focused tests and web build. Use `make test-unit` before
commit and `make test-integration` before merge if those actions are requested.
Do not repeat a passing full run without a change or unresolved concern.

**Dependencies:** 11. **Scope:** Medium.
**Likely files:** `docs/features/byoc-aws.md`,
`docs/features/byoc-cognito-reference.md`, `skills/small/SKILL.md`,
`skills/small/references/aws-hosting.md`, `tasks/todo.md`.

### Checkpoint: repeatable MVP

- [ ] Install -> Cognito sign-in -> deploy -> share -> run -> logs/output works.
- [ ] Local S3 approval and repeat installation preserve the account boundary.
- [ ] Return the customer AWS dev URL and concise results for user review.
