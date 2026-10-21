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
