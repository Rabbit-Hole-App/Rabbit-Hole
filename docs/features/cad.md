# Canvas CAD

Current production: `d16c3a45` supports saved CAD viewing and shared interaction; new generation is not activated. See the [production activation proposal](cad-production.md) for exact prerequisites, preparation and approval limits.

Historical dev handoff: implementation **`049f2845`** was deployed to isolated dev; see the [final receipt](cad-evidence/dev-handoff-2026-10-17.md) and [shared interaction receipt](cad-evidence/shared-interaction-final.md) for subsequent checks, exact SHA attribution, usage, cleanup and remaining blocked assertions. Earlier review snapshots below retain their historical status.

Implementation in progress, based on `abd5f840`. Authoritative requested scope:
owner's text-to-cad specification, 2026-10-17. Main and production are untouched.

## Shared contract

The existing slash registry exposes `/cad` with a `CAD` pill. Selecting it does
not call a model. Chat and Ctrl+K creation use the same CAD client; CAD editing
never goes through generic text replacement.

`POST /api/learn/cad/jobs` accepts `{app,board,cardId,requestId,prompt,context,
confirmed:true,baseRevisionId?}`. Returns `{job,block}` only after durable save
and alarm scheduling. `GET` with `?app=&board=` returns `{jobs,blocks}` for the
authorized board; `GET /:id` returns `{job,block}`. IDs are opaque.

Actions `POST /:id/cancel`, `/clarify` (`{answer}`), `/retry`, `/accept`
(`{expectedRevisionId}`), `/exports` (`{format}`), and `/placement`
(`{hidden}`) are explicit. Hiding cancels active generation; restoring placement
never restarts it. Retrieval and exports never invoke design generation.

Job states: queued, preparing, waiting_for_answer, building, checking, repairing,
exporting, ready, failed, cancelled. Public job: id, state, stage, cardId,
modelId, revisionId, baseRevisionId, brief, question, error, manifest,
createdAt, updatedAt, limitations, awaitingAccept. An edit retains its accepted
revision until the expected revision matches on Accept.

Block: `{type:'cad',id:cardId,jobId,modelId,revisionId,status,title,units,
briefSummary,manifestUrl,thumbnailUrl,proposedRevisionId?,sourceId?,fileRef?,viewerBackground?}`.
`viewerBackground` ('white' | 'black' | 'none', absent = white) belongs to the card, not the job: a server block never
replaces it (cad-client.js mergeCadBlock), a fork keeps it, and only someone who may edit the card changes it.
Manifest `cad-model/1`: revisionId, title, units, parameters, assumptions,
validation, runtime, artifacts (name,kind,url,bytes,sha256,mediaType).
Artifact kinds: source, step, glb, thumbnail, stl, 3mf. Generated artifacts use
existing Learn R2 and file-source/derivative access. Private input references
are never copied into a publicly readable artifact manifest.

## Controls, brief review and parameter rebuilds (cad/controls, backend)

Design: `C:/s/spec/cad-controls/design.md` (owner brief and decisions 2026-10-20). UI comes after the CAD card lane.

- Parameter definitions `cad-params/1` live in `brief.controls` and, once built, `manifest.controls`
  (`cad-controls/1`: definitions, requested `values`, source-reported `computed`, `bindings` = inputs the trusted
  build actually read). Shared validator `packages/web/src/cad-parameters.js`; no expression is read from metadata.
- Source reads inputs with `cad_params.value(id)` (packages/cad-execute/runtime); the executor writes the validated
  values to the read-only `parameters.json`. A rebuild reuses the accepted source text, never edits it.
- `POST /:id/rebuild {requestId, expectedRevisionId, values}`: no model call, no review, no repair; ready result waits
  for the existing revision-guarded Accept or Cancel (Discard). Failure keeps the accepted model; a `ValueError` from the
  saved source becomes the reason. Models without bindings answer 409 `not_deterministic`.
- Behind `CAD_BRIEF_FIRST=true` (off by default): one interpretation call, state `awaiting_approval`,
  `POST /:id/brief {expectedBriefHash, brief}` (field edits, no call; structural changes 409 `reprepare_required`),
  `POST /:id/approve {briefHash, confirmed:true}`; generation and repair cannot change the approved brief or checks.
  Reservations are recorded per phase in `job.phaseUsd`.
- `GET /api/learn/files/<fs>` for a `cad` source is owner-only; shared, member and forked boards keep the geometry
  derivatives only.
- Trusted inspection adds bounding-box min/max and circular edge centres; check results name their `kind`.
- Local geometry: `node packages/cad-execute/local-fixtures.mjs <python with cadgen 0.7.21>` builds the five fixtures
  in `packages/cad-execute/fixtures/` outside the Linux sandbox (geometry evidence only, not isolation).

### UI phase (cad/controls, 2026-10-20)

- **Quick edit** (`cad-quick-edit.jsx`, in the card's `data-cad-quick-edit-slot`, owner only): rows from the displayed
  revision's definitions (`cad-quick-edit-model.js`), the first four by priority and the rest under More parameters.
  Inputs are Requested, or Assumed when the definition says `assumed: true` (the brief chose the value; a rebuild or a
  review edit that changes it drops the flag). Calculated values come from the saved source; Measured values come from
  the trusted check mapped to the parameter, named by what it measured ("Measured diameter 6.0 mm"), or "Not measured".
  Typing keeps a draft in this browser (`cad-draft-store.js`, per account, card and accepted revision; never on the
  board). Preview change → building → Accept / Discard; a failed rebuild offers Edit values, Retry or Discard.
  Discard (also of a failed rebuild) hands the card back to its accepted job; the job list skips discarded previews.
  Everything below the viewport scrolls inside the card (`data-scroll`).
- **Show dimensions** (`cad-dimensions-overlay.jsx`): labels on the model at the measured anchors, redrawn every frame
  (`three-d-renderer.js` `project`/`onFrame`), and a legend with Measured, Requested and Assumed apart. A draft marks the
  measurements as the displayed model's; a focused parameter highlights its dimension.
- **Details** (`cad-details.jsx`): Design brief (current parameter values, apart from the card's prompt), Checks (each
  check passed/failed/unchecked, generation apart from validation, fit/strength/interference/manufacturability never
  assessed, what each download keeps), Code (owner only; the file route already refuses anyone else) and Revisions.
- **Revisions and the prompt**: the accepted model record keeps `revisions` (parent, new revision, kind
  `generated`/`ai_edit`/`parameters`, and a rebuild's parameter changes; at most 20, no words) and the board block gets a
  copy. A parameter-only Accept keeps the last accepted prompt (`modelRecord`), so `acceptedResponse` still answers it.
- **Executor capability**: `/health` lists `capabilities: ['parameters']` (`cad-execute/contract.mjs`). The control plane
  refuses a rebuild with 409 `executor_unsupported` before creating a job when the executor does not list it (503
  `executor_unavailable` when `/health` does not answer), and fails a retried rebuild before dispatch. Executors deployed before this change are refused; the field is additive, so the
  current control plane keeps working with a new executor. Size check results now carry their `axis` (`validate.py`).
- **Review design** (`CadReview.jsx`, above the Chat composer; `canvasOps.cadReviews/cadRead/cadAction` in LearnPage):
  shown for the owner's cards in `awaiting_approval`. Original request exactly, interpreted object, parameters with
  Assumed marked, requirements, context used, highlighted assumptions, missing information (blocks Generate) and
  unsupported requirements. Edit details saves through `brief` (no call, new hash); Generate approves that hash; Cancel
  ends it. It is the job's own state, so it survives a reload.
- **Flag per environment**: `CAD_BRIEF_FIRST` in `vars` of `packages/web/wrangler.rabbit-hole-prod.jsonc` (production)
  and `packages/web/wrangler.dev.jsonc` (dev clones; that config binds no `CAD_JOBS` today). Both are `"false"`.
  Review-first takes at least three calls (brief, source, review). Production's `CAD_MAX_CALLS` is now 3 (inert while the
  flag is off; a pinned config test keeps calls >= 3 whenever the flag is `"true"`; control-plane test `CAD brief-first
  needs three calls` still shows the 2-call failure). Pricing, the executor budget and the first production job:
  [cad-review-first-acceptance.md](cad-review-first-acceptance.md). Review-first is NOT active in production and no real
  production review-first job has run.
- Browser check: `packages/web/e2e/cad-controls-check.mjs` (local stack, scripted CAD routes, real local-kernel facts in
  `cad-controls-facts.json`).

## Durable orchestration

One CadJobs Durable Object per authorized board uses the existing LearnScenes
storage/alarm pattern, with immutable revisions and persisted operation fences.
It does not need a new D1 schema. Existing D1 board authorization and file
source/derivative tables remain authoritative for access. A persisted in-flight
model operation interrupted by worker loss fails visibly; it is never blindly
reissued, because its provider charge is uncertain. Explicit Retry retains
prior accounting and starts a new bounded operation.

Execution follows the existing converter's dispatch/cancel/callback protocol,
with a separate CAD image. `cad-execute/1`: job_id, attempt, revision_id,
operation (build/export/inspect), source (url,bytes,sha256), requirements
(units,checks), formats, limits, callback (url,token,expires_at).
Callback base `/api/learn/cad/jobs/:id/attempts/:attempt`; GET source,
POST progress, PUT outputs/:name, POST complete/fail. Results use
`cad-execute-result/1`, output hashes, trusted validation, runtime and timings.
Callbacks are scoped to the current job/attempt. Generated Python receives no
provider credentials. Independent artifact validation runs in a fresh sandbox.

## Failed model calls and credits (fix/cad-failed-call-refund)

Each CAD model call is its own usage action (client key `cad-<job id>-<call number>`, feature `artifact`, platform ledger category `cad`) with one
attempt. `runCadModel` closes the action on every exit and, when the call throws, refunds it with `refundFailedAction`: the same policy the route
boundary applies to a failed request (`credits-2500.md`, Failed work refunds). The refund changes only `usage_attempt_detail.refunded_micros` and one
`usage_adjustments` row; the attempt's `cost_micros` and `usage_operations.cost_usd` (the provider expense) are never touched, and an unknown cost
stays NULL on the attempt and at its admission bound on the platform ledger, never 0. Refunding is one guarded UPDATE, so a repeat or replay refunds nothing twice.

| Failure class | Learner charged | Why | Refund written |
| --- | --- | --- | --- |
| Provider HTTP error (400, 401, 5xx), no usable usage | 0 | cost unknown (NULL), nothing held | none needed |
| Provider capacity refusal (429, 529, 400 "usage limits") | 0 | known zero cost | none needed |
| Transport failure or the 120 s timeout | 0 | cost unknown (NULL); the platform reservation is kept until recovery | none needed |
| Admission refused (allowance, platform cap, spend bound) | 0 | no attempt is written | none needed |
| Provider answered (billed) but the reply is not JSON | 0 | settled at the measured cost, then refunded in full | `route_failed_no_result` |
| Provider answered but the design is refused by validation, or an approved brief's source call asks for a change | 0 | as above | `route_failed_no_result` |
| Our-side bug after the provider answered (any throw in `cadModelCall` after settlement) | 0 | as above | `route_failed_no_result` |
| Answer delivered: brief, design, clarifying question, review (accepted or rejected) | measured cost | the learner received what was paid for | none |
| Valid design, later failure (executor, validation of the build, cancel, Retry) | measured cost | an answered call is charged, as Explain charges its answered calls; Retry resumes | none |

Last row is policy, not a gap: refunding a delivered design is an owner decision, not made here. Learner-visible change: a CAD call whose billed reply was
unusable no longer reduces the learner's credits; nothing else changes.

### Historical rows (reconcile and repair dry run; nothing has been applied)

Deploying the fixes does not repair earlier rows: CAD attempts that settled at a cost and whose reply was then discarded still count as used, and actions from
before the lifecycle fix still read `running` (cosmetic: the balance sums attempts, not action status). `running` says nothing about what a call delivered, so
`scripts/cad-historical-reconcile.mjs` decides each CAD attempt (action feature `artifact`, client key `cad-<job>-<call>`) from D1 evidence only. Owner-run,
from a checkout with `node_modules` (wrangler) and `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in the owner credentials file (read by name, never printed);
it reads `LEARN_DB` (`rabbit-hole-learn-prod` through `packages/web/wrangler.rabbit-hole-prod.jsonc`, or the dev pair) with three SELECTs and a runner that
refuses anything else:

```bash
node scripts/cad-historical-reconcile.mjs prod reconcile            # one line per attempt, then totals by class
node scripts/cad-historical-reconcile.mjs prod repair --dry-run     # the same, plus the rows a repair WOULD write
```

| D1 evidence for an attempt | Class |
| --- | --- |
| charge class not `would_charge`, or no settled cost | NOT ELIGIBLE (not charged) |
| `refunded_micros` equals the cost | NOT ELIGIBLE (refunded); part-refunded is UNKNOWN (owner review) |
| action `completed` (after the lifecycle fix: `cadModelCall` returned) | NOT ELIGIBLE (delivered) |
| action `failed` with a settled, unrefunded cost (after the lifecycle fix: `cadModelCall` threw after billing) | ELIGIBLE |
| `running`, and exactly one new CAD source (`file_sources`, family `cad`) saved on the job's board within 300 s of settlement, before the board's next CAD call, with no other CAD job on the board in that window and a SHA-256 not seen on the board before (a parameter rebuild re-saves the accepted text) | NOT ELIGIBLE (delivered: `saveCadSource` runs only after the design validated) |
| `running`, and the job's next call is kind `repair` while this one is not | NOT ELIGIBLE (delivered: a repair follows only a valid design whose build failed or a review that rejected it) |
| anything else `running` | UNKNOWN |

Each line prints the job, call number, provider cost (`usage_operations.cost_usd`), learner charge (`cost_micros - refunded_micros` for `would_charge`), the class
and its evidence or the exact missing evidence. A delivered design with no published build (`file_derivatives`, converter `cad-execute`), or followed by a repair,
is also listed as a policy question: it stays charged under the last row of the table above. `repair --dry-run` prints (A) action-status repairs only, cosmetic,
no money: `running` -> `completed`/`full` (ended at the attempt's settlement) for delivered calls; and (B) refunds, ELIGIBLE only, in `refundAttempt`'s shape
(`usage_attempt_detail.refunded_micros` and one `usage_adjustments` row, reason `route_failed_no_result`), each with totals in micros and credits. UNKNOWN is never
in (B). Both are guarded (`status = 'running'`, `refunded_micros = 0`), so after an apply a second dry run plans zero rows. There is no apply mode: `repair` without
`--dry-run` refuses; applying needs the owner's approval and a separate, reviewed apply mode. Tests: `node --test scripts/cad-historical-reconcile.test.mjs`
(in-memory SQLite from every learn migration; no wrangler, credential or network).

What D1 cannot prove: that a billed reply was unusable before the lifecycle fix. A refused or non-JSON reply, a clarifying question, a brief (`CAD_BRIEF_FIRST`), an
accepted review and a valid design cancelled before it was saved all leave the same D1 trace (a settled attempt and nothing else). That outcome lives in the job's
CadJobs record: `state`, `attempt`, `error`, `approval`/`briefHash`, `question`/`answer` and `lastFailure`. The operator diagnostic
(`/internal/cad-job-diagnostic?job=<job id>` on the app Worker, `cad-job-diagnostic.js`) needs `CAD_DIAGNOSTIC_READ_TOKEN` and returns state, failure fields, `lastFailure`, brief and checks, but
not `error`, `approval`, `question`/`answer` or `calls`; a model-stage failure records only `cad_failed` at stage `unknown` (a review: `checking`), the same as a failed source save. Even
the full record decides only the job's last failure: Retry clears `error`, so an earlier call of a retried job can stay undecidable.

## Execution plan and ownership

- Root (`feature/cad-integration`): API, durable orchestration, existing ledger
  integration, artifact publication, dev wiring and final integration.
- Runtime (`feature/cad-runtime`): pinned image, isolated executor, trusted
  geometry validation and exports; executor proposal.
- UI (`feature/cad-ui`): commands, card viewer, creation/edit/recovery UX.
- Verification (`test/cad-acceptance`): independent security/recovery/browser
  checks and evidence, CAD-specific model verification proposal.

Each lane has one worktree owner. First prove fixture request to durable saved
card; then add refinement, clarification, recovery and optional exports.
Focused tests accompany each slice. Final verification covers existing affected
browser checks, build and bundle, exact dev deployment and permission paths.
The unrelated existing `tasks/plan.md` and `tasks/todo.md` are preserved; this
feature-specific plan is the CAD task record.

## Gates and current limitations

The owner approved the dedicated dev executor on 2026-10-17 within $5,
four aggregate machine-hours and 1 GiB outbound, with shutdown/cleanup after
verification. Four real-model scenarios are approved: seven expected provider
requests, eleven maximum including retries, and $1.10 total. Prefer verified
subscription access; the approved Anthropic route is allowed when unavailable.
No additional scenarios, provider fallback or automatic rerun cycle is allowed.
Fixtures prove orchestration only. Actual execution and model results are
recorded separately in [verification](cad-verification.md) and the final receipt.
No production deployment, main push or production migration is part of this work.

The dev-only verification deployment restricts generation to one approved board
using `CAD_VERIFICATION_BOARD_ID`, `CAD_VERIFICATION_MAX_CALLS` and
`CAD_VERIFICATION_MAX_USD`. Reservations survive failed calls and restarts.
Dedicated CAD transport requires both `CAD_MODEL_API_KEY` and
`CAD_MODEL_WORKSPACE_ID`; it never combines either with general inference
credentials. A partial pair or simultaneous `SUBSCRIPTION_ONLY=true` fails
before transport. Existing deployments with a CAD key and an inherited general
workspace must explicitly configure the CAD workspace before enabling this route.
With neither dedicated setting, the existing general/subscription route is
unchanged unless `CAD_MODEL_REQUIRE_DEDICATED=true`; the production pilot sets
this flag so missing secrets cannot spend from the general workspace.
These settings do not enable unrelated paid features. Deterministic
transport checks verify the selected headers, not the provider-side workspace
membership or spending limit; operators must verify those separately.
`CAD_MAX_CALLS`, `CAD_MAX_REPAIRS`, `CAD_MAX_USD` and
`CAD_MAX_ELAPSED_MS` may lower the hard job ceilings, never raise them.

Shared and forked cards expose saved immutable artifacts, not live private job
history. Forks are detached snapshots: editing or preparing new exports requires
future model adoption. See [scope and limitations](cad-scope.md).

## Card viewer and controls (UI changes, 2026-10-20)

- A completed model renders its live 3D view by default while on screen; at most three viewers hold a renderer
  (viewer-slots.js), the rest and any loading viewer show the saved thumbnail. Each card keeps its camera for the page
  when its viewer gives the slot up.
- Until the person clicks into the model (or presses Interact), a press selects the card and the wheel pans the canvas.
  Interact, Fit view and Show dimensions sit in the selected card's toolbar above the card, and in the expanded panel's
  toolbar; nothing is drawn over the model. Esc, Done, a press outside or deselecting hands control back to the canvas.
  Open, those three, Add to chat and Quick Edit are ONE row (CanvasNode `data-card-chrome-row`, owner finding 2026-10-23): same
  height, one gap, the width of the card, and when they do not fit the row wraps upward, never over the card or its top
  connection handle. There is no overflow menu. `cad-controls-check` step 14 measures it.
  Fit view frames the model in its own viewport only. Show dimensions is a per-browser preference keyed by account and
  card (localStorage `rh.cad-dimensions:<org>:<email>:<card>`), never on the board; its overlay is lane C's.
- Expand and Download are icon buttons; Download is also in the card's right-click menu (one row per saved format).
  Edit and Explain are not on the card: Ctrl/Cmd+K opens both. White / Black / None paint only the model viewport.
- A viewer whose module cannot load shows the saved preview and Retry, never the raw import error. When Retry fails
  too and the failed chunk now answers 404 (a release replaced the hashed files: this tab runs an older build), it
  offers Reload to update, which reloads only on its click and only when the open board is confirmed durable on the
  server, no field holds typed text, no upload or chat message is pending and storage outlives the page
  (chunk-reload.js updateReloadBlock, LearnPage boardDurable). It is never automatic, and once per minute at most.
- Below the viewport, `<div data-cad-quick-edit-slot>` takes the optional `quickEdit` render prop; the
  "Brief, parameters & checks" disclosure is one component, `CadDetails` (lane C replaces both).
- Browser check: packages/web/e2e/cad-viewer-check.mjs (local stack, stubbed CAD routes, no model calls).
