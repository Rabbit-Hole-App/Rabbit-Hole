# Canvas CAD

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
briefSummary,manifestUrl,thumbnailUrl,proposedRevisionId?,sourceId?,fileRef?}`.
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
`CAD_MODEL_API_KEY` is scoped to CAD transport so its installation does not enable
unrelated paid features. `CAD_MAX_CALLS`, `CAD_MAX_REPAIRS`, `CAD_MAX_USD` and
`CAD_MAX_ELAPSED_MS` may lower the hard job ceilings, never raise them.

Shared and forked cards expose saved immutable artifacts, not live private job
history. Forks are detached snapshots: editing or preparing new exports requires
future model adoption. See [scope and limitations](cad-scope.md).
