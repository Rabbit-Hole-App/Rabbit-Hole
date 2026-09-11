# Private AWS Agent and run chat with Bedrock

Status: enabled on dev and live. On 2026-09-11 the
user explicitly approved Bedrock activation on dev then live, including inference
in us-east-1, us-east-2, and us-west-2. `GetInferenceProfile` confirmed exactly
those destination regions for `us.anthropic.claude-sonnet-4-6`, status ACTIVE.
Amazon installation operations use account 503561429929 only.

The [separate private AWS dev installation](byoc-dev.md) is now the first target
for activating and testing Bedrock. Its initial releases carried the chat code
without a configured model or invocation permission, which hid the composer.
The image-cleanup release did not enable chat; this activation does.

## Activation evidence (2026-09-11)

Dev release `0.1.0-dev.3` reached `UPDATE_COMPLETE`, and installer `finish`
published its private dashboard. Both test apps advertise `run_chat` and
`app_chat` with the approved Bedrock profile. The release preserves the existing
apps, images, run history, and dev/live isolation.

A real dev API call about synthetic run `r-1789112779853-ed52e9f64414` returned
word_count 4, unique_words 3, and cited `report.json`. A follow-up retained the
conversation; History returned four messages. An app-scoped question returned
the declared text input and `job.py`. App history contained its own thread and
excluded the run thread. These calls used the deployed Lambda role, actual
Bedrock inference, and customer DynamoDB, invoked through an AWS-admin-authenticated
gateway event. They do not claim a completed human browser login.

Nine browser scenarios passed against the packaged dev UI with synthetic
identity/API responses, including Logs chat, Agent chat, History, New Chat,
and enlarge/minimize. Both release manifests contain 209 verified files. The
template diff from the image-cleanup releases changes only `ApiFunction`,
`ApiRole`, `AppAccessBoundary`, and the new `ChatTable`. No app rebuild or
application run is required to enable chat.

Eight live-build browser scenarios also passed; the dev-only preview scenario
was intentionally skipped. Live release `0.1.0-pilot.6.2` reached
`UPDATE_COMPLETE`. Its catalog contains exactly drift-debug, oof-debug, and
overreach-debug, each advertising Logs and Agent Bedrock chat. The removed
proof apps were not recreated. Live business runs were not started for testing;
actual model answering and history were exercised with dev's synthetic run.

Synthetic answer/history proof is stored in ignored
`.small/byoc-private/bedrock-dev-proof.json` and on the customer dev box at
`~/small-images-rollout/bedrock-dev-proof.json`.

## Outcome

Open an app's Agent tab and ask how to use the job or what its recent results
show. Open a run from Logs to ask about that specific run in the existing
right-panel chat box. Both support follow-ups, New Chat, and History. The
Agent's Open as page and Minimize chat controls preserve its conversation;
the enlarged run page uses the same run chat. Existing hosted chat and the
four Coaching inspection tabs keep their current behavior.

## Implementation

- Reuse AskPanel and its History, New Chat, rename/delete, source picker, model
  control, and evidence presentation. Private requests use existing Cognito
  authentication and the installation's own API. Unsupported attachment and
  cross-app controls remain visible with a clear explanation.
- Reuse the private Ask routes for app and run scopes. Every request checks current
  workspace membership, app visibility, run ownership, and chat ownership in
  code. A chat never changes its app/run. App history excludes run chats and
  run history excludes app chats. Revoked access also blocks history.
- Read bounded context through the existing customer job API: run status,
  scalar inputs, the log tail, output names/sizes, and small text outputs.
  Sources disabled in the picker are not fetched. Signed URLs, credentials,
  and internal transport fields are excluded from model context.
- App context includes the latest job definition (entry filename, input schema,
  deployment status, and declared grants), at most five recent run summaries,
  and the latest run's bounded log/output evidence. Its source picker offers
  Recent runs, Latest run log, and Latest run outputs; the job definition is
  always included. Apps with no deploy or no runs can still be discussed, with
  missing evidence stated explicitly. Source code, builder sessions, and approved
  decisions are not supplied. The model must not invent design reasons or assume
  the latest run used the latest deployment.
- Make one Bedrock Converse call, using the private backend's own role and
  exact configured model resources. The public hosted Bedrock adapter and its
  cross-account trust are not used. Model responses are text; no execution
  tools, role grants, deployment changes, or automatic runs are attached.
- Keep bounded chat history in a separate customer DynamoDB table with a
  90-day expiry and the existing Delete action. Conditional writes prevent
  concurrent replies from silently overwriting one another. Limit requests
  per user and cap message, context, output, and model-call duration.
- Return the completed answer through the existing authenticated HTTP API.
  The initial version displays the waiting indicator, then the answer; it
  does not add a second streaming transport.

## Acceptance and verification

- [x] Private Logs and enlarged run page show the existing chat composer in the
      built private dashboard with synthetic authenticated API responses.
- [x] Private Agent and enlarged app chat retain History, New Chat, source
      selection, Open as page, and Minimize chat with isolated app history.
- [x] A Bedrock answer uses the selected synthetic run's evidence; follow-ups
      retain context. Missing evidence is described as unknown.
- [x] History, New Chat, and enlarged runs pass the browser scenario; rename and
      delete pass API tests. Switching runs clears the previous run's chat.
- [x] Invalid identities, hidden apps, mismatched runs/threads, revoked access,
      excess input, and concurrent writes fail without exposing other data.
- [x] Source selection, redaction, bounded output reads, and model errors have
      focused regression tests. Model output cannot trigger app actions.
- [x] The exact packaged Lambda code and IAM resources pass focused tests.
- [x] Shared dev is built/deployed with both preview flags.
- [x] The existing private AWS installation is updated and exercised with
      synthetic data.

## Earlier preparation (before activation)

Verification on 2026-09-10 (local date), including the Agent extension: 135 Python
BYOC tests and 26 subtests passed, plus all 10 private template tests. All eight
private browser scenarios passed. The new scenario covers app answers,
follow-ups, source toggles, History/New Chat, enlarge/minimize, and separation
from Logs chat; its Agent screenshot was inspected. Both dashboard builds passed.
The app-scope tests failed before implementation and passed afterward.

The fresh full-workspace dependency audit reports 7 moderate and 5 high findings
in unchanged Excalidraw/Mermaid dependency chains and Wrangler's local development
tooling (`lodash-es`, `nanoid`, and `sharp` are the originating packages). No
dependencies or lockfiles changed. This replaces the earlier zero-advisory note;
the private chat uses the existing text renderer, not those diagram/editor paths.
Dependency remediation remains a separate task; no forced downgrade was applied.

Shared dev is deployed as `9e5b5eb6-1c72-40bc-9895-4266c3b4c251` at
https://small-cp-dev.zeroshothq.workers.dev/apps. It preserves both preview flags;
it does not connect hosted job data to the private Bedrock model.
Candidate `0.1.0-pilot.6.1` includes both Agent and Logs chat and is packaged under
ignored `.small/byoc-private/releases/0.1.0-pilot.6.1/`; all 209 manifest file
checksums passed. It supersedes the local run-only `.6` candidate. Its proposed model configuration
is `us.anthropic.claude-sonnet-4-6` with the three observed US destination
Regions; the template grants invocation only through that exact profile and
its exact model ARNs. Neither the candidate nor new IAM permissions have been
deployed to Amazon at that stage. The AWS installation then remained `0.1.0-pilot.5.1`.

The AWS availability check reports the Sonnet model authorized and available.
A synthetic direct-model Converse attempt returned HTTP 400 because the model
requires an inference profile. At that stage, local answer tests used a model
double and no real Bedrock answer was claimed. The activation evidence above
records the subsequent successful profile-based answer and saved history.

Context retrieval allows four seconds of read time, without retries, before
inference; timeout tests prove that a failed lookup never invokes the model.
Bedrock allows twenty seconds of read time without retries. Context includes
the latest 200 log events (at most 18,000 characters), at most 100 output names,
and at most three text previews of 4 KiB each. Five prior question/answer pairs
are sent with the current question. Threads retain at most 20 questions for
90 days, with ten questions per user per minute. Known credential patterns
are redacted, including quoted JSON log fields; this is not a general detector
for every possible secret. The model has no action tools.

Independent review found no remaining blocker after the stale-history and
context-timeout fixes. History examines at most the user's 1,000 newest threads
and returns at most 50 for the selected run; older threads can fall outside
that listing even before expiry. DynamoDB pagination/conditional-write tests
use a test double. At that review, real IAM/SCP acceptance, service-level
persistence, and inference were pending; the activation evidence above records
the subsequent deployed dev proof.

The app-scope extension received a separate independent review with no blocking
or required findings: scope isolation, evidence bounds, private routing, and
preserved Agent/enlarged UI were reviewed.

<!-- ponytail: workspace-wide Coaching, deployed source reasoning,
attachments in private chat, cross-app mentions, and action proposals remain
separate slices. This feature explains run evidence, not why code was designed. -->

API contracts: [Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
and [inference profiles](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html).
