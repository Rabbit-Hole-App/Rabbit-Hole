# Private AWS dev installation

BYOC has separate dev and live installations in the customer's AWS account.
Develop and test new Small features on dev; promote an approved software version
to live separately. App deployments, run history, uploads, outputs, grants, and
workspace membership belong to their installation and are not copied on promotion.

For the Amazon pilot, both installations use **503561429929**, **us-east-1**.
Never use the personal account or the shared Cloudflare AWS connection for Amazon.

| | Dev | Live |
| --- | --- | --- |
| Stack | `small-private-byoc-dev` | `small-private-byoc` |
| Workspace | `w-small-aws-dev` / Small AWS Dev | `w-small-aws` / Small AWS |
| Apps | `dev-cpu-job`, `dev-word-count` | Existing apps including drift-debug, oof-debug, overreach-debug |
| Release | `0.1.0-dev.2` | `0.1.0-pilot.5.2` |
| URL | https://dviorrcko52ft.cloudfront.net/apps | https://d3sgti338uxlc.cloudfront.net/apps |

The existing Cognito user directory is shared, with a **separate public app client**
for dev. The same user can sign in at either site; workspace membership is granted
independently. Each API accepts only its own app client's tokens. Colleagues use
the browser; the SSH tunnel applies only to CLI login on a remote development box.
Users still need a Cognito account and an explicit member entry in each workspace.

Both stacks reuse `private-template.mjs` and `install-private.py`. Dev has its own
CloudFront distribution, S3 buckets, DynamoDB tables, Lambda API, IAM roles, build
project, ECR repository, and private job VPC. A new installation needs a **new
installationId**, stack name, and workspace; upgrades keep those values stable.

The dev configuration's `protectedResourceArns` reserves the live installation's
storage and backend. The existing grant validator rejects these resources before
approval; both app permission boundaries also deny them in IAM. This optional list
contains customer installation identifiers, not account-specific implementation.
The live stack and its grants are not changed by creating dev.

Dev identifiers: distribution `ELXPWJNXN10PK`, API `78c31tudv0`, client
`3e2g9lj3kv00pl3d8v8bo1j2en`, installation `d00414561f984b23a78d8ed3478b3e60`.
Metadata: `small-private-byoc-dev-Metadata-1MPTCLPF23CRI`; data bucket:
`small-private-byoc-dev-databucket-rzzlj0hitldg`; web bucket:
`small-private-byoc-dev-webbucket-7wzampfc88hx`.

To deploy a test app with the existing CLI, use the dev URL and workspace:

```sh
small login --api https://dviorrcko52ft.cloudfront.net
small deploy --workspace w-small-aws-dev
```

For colleagues, open the dev URL and sign in. They need no CLI or SSH tunnel.

## Build and deploy

Installation settings are local operator configuration:
`.small/byoc-private/installation-dev.json`. Each immutable release lives under
`.small/byoc-private/releases/<version>/`. The package checksums cover the exact
dashboard and Lambda code that will be installed.

From `packages/web`:

```powershell
$env:VITE_PRIVATE_BYOC = 'true'
$env:VITE_SMALL_ENV = 'dev'
$env:VITE_COACHING_DEV = 'true'
$env:VITE_BYOC_DEV = 'false'
npm run build -- --outDir dist-private
```

`VITE_SMALL_ENV=dev` adds the reusable DEV badge on login and the workspace row.
The Coaching flag enables existing sample inspection tabs, including when model
chat is not enabled. The legacy hosted AWS preview flag stays off for private AWS.
Separate stacks and authorization provide isolation; these UI flags do not.

From the repository root, after choosing a fresh version in the dev config:

```powershell
node packages/byoc/package-private.mjs .small/byoc-private/installation-dev.json .small/npm-release/0.0.11/small-deploy-0.0.11.tgz
```

Transfer the release to the customer dev box. In that release directory:

```sh
AWS_PROFILE=default python3 install-private.py inspect --account-id 503561429929 --profile default
AWS_PROFILE=default python3 install-private.py deploy --account-id 503561429929 --profile default
AWS_PROFILE=default python3 install-private.py status --account-id 503561429929 --profile default
# After CREATE_COMPLETE or UPDATE_COMPLETE:
AWS_PROFILE=default python3 install-private.py finish --account-id 503561429929 --profile default
```

`finish` adds the dev callback/logout URLs to the dev app client, seeds the owner,
publishes assets, and invalidates the dev dashboard. It does not update the live
app client or distribution. For a later approved live release, build separately
with `VITE_SMALL_ENV=live`, `VITE_COACHING_DEV=false`, and private mode still true;
never package the dev `dist-private` directory into a live release.

## Image lifecycle update

Dev `0.1.0-dev.2` and live `0.1.0-pilot.5.2` reached `UPDATE_COMPLETE`, and
installer `finish` completed for both. These backend releases reuse their
respective previous dashboard artifacts byte for byte. Each release's 209 file
checksums were verified locally and on the customer dev box before installation.
The live update was explicitly approved. See [image lifecycle and rollout
evidence](byoc-images.md) for replacement, cleanup, and rebuild results.

CLI `small-deploy@0.0.11` is published and generates the hardened images for
future deployments. Update with `npm install -g small-deploy@0.0.11`.

## Initial installation verification (`0.1.0-dev.1`)

- 139 Python BYOC tests and 26 subtests passed, including dev grant rejection for
  protected live resources and existing authorization/job paths.
- 11 template tests passed, including both IAM boundaries and bundled Lambdas.
- Nine browser scenarios passed against the private dev build: PKCE, Run/Logs,
  uploads, grant approvals, chat history, and sample tabs without model calls.
- DEV badge and existing Sessions layout reviewed in a browser screenshot.
- All 209 release file checksums verified before transfer and again on the
  Amazon dev box; installer STS identity matched the target account.
- AWS stack reached `CREATE_COMPLETE`; installer `finish` published the dev
  dashboard and seeded the existing owner. `/login` returns 200 and anonymous
  `/api/apps` returns 401. Dev and live advertise different Cognito clients.
- A real browser followed dev Sign in to Cognito's password form using the new
  dev client and the exact dev callback. No credentials were entered in this check.
- Independent review found no remaining blocker in the packaged release,
  including resource names, live-resource protection, dependency graph, and DEV badge.
- The installed IAM app boundary contains all 20 live-resource deny patterns.
  The deployed gateway rejected a live client ID (401), live workspace (403),
  live app lookups (404), and a grant request for live data storage (400).
  Dev catalog contained only `dev-cpu-job` and `dev-word-count`. These backend
  checks used an AWS-admin-authenticated Lambda invocation with synthetic gateway
  claims; they do not claim a completed human browser login.
- Live remains `UPDATE_COMPLETE` on `0.1.0-pilot.5.1`, with unchanged Cognito
  callbacks and all six existing app records, including drift/oof/overreach.
- Both test app images built in dev and are ready. Sources reuse
  [the CPU example](../../examples/byoc-private-cpu) and
  [word count](../../examples/byoc-word-count), with dev-specific app names.
  The installation's one-build limit required sequential builds.
- CPU run `r-1789108001606-eb2feb14577e` finished with exit 0 and five log lines;
  its downloaded `report.json` contains count 8 and sum_of_squares 204.
- Word-count run `r-1789108092206-d703ee148c25` finished with exit 0 and four
  log lines; its downloaded `report.json` contains word_count 4 and unique_words 3.

Proof state and the synthetic app archives are under ignored
`.small/byoc-private/dev-test-apps/`. The verified release is also staged on the
Amazon dev box at `/home/cyudhist/small-private-byoc-dev-0.1.0-dev.1/`.

Bedrock activation remains pending the inference-region decision documented in
[the chat specification](byoc-bedrock-chat.md). No model profile is configured in
this first dev installation; sample Sessions/Sources/Capture/Decisions do not feed
model calls.

Cognito clients created through the API require a managed login branding entry;
the dev client uses Cognito's defaults. [AWS documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html)
