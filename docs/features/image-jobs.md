# Image generation jobs (IMG-01)

Status: server substrate built 2026-10-23 on branch `feat/image-jobs` (lane feat-image-jobs). **Disabled**:
`IMAGE_GENERATE_ENABLED` is `"false"` in every committed config and `IMAGE_GENERATE_RESERVED_USD` is unset, so no image can be
quoted or started. No provider was called while building it; every provider test uses a fixture transport.

Code: `packages/control-plane/src/image-jobs.js` (route + `ImageJobs` Durable Object), `packages/control-plane/src/image-providers.js`
(model allowlist, quote, adapters). Tests: `packages/control-plane/test/image-jobs.test.js`, `image-providers.test.js`.
Not here (owned elsewhere): the confirmation card and the generation-confirmation schema (lane `feat/ui15-contract`,
`docs/features/generation-review-contract.md`), the Image card, the slash and Ctrl+K entries.

## 1. Design choice

One `ImageJobs` Durable Object per generation, driven by its own alarm. This is the chosen fit for this application, not the only
possible design: an independent executor (a queue consumer or Workflow) with a D1 job table would also work, but needs a learn
migration and an executor this repo does not run in production. The DO needs no D1 migration, survives the browser leaving, and
reuses the image-edit job pattern (`inline-image-edit-job.js`) and the existing ledger. Background: `C:/s/spec/img-01/shutdown-and-storage.md`
Part 2.

What a separate object per image does NOT give: protection against two jobs of one person overspending. That is the ledger's job:
`admitSpend` (`learn-spend-ledger.js`) checks the payer's monthly allowance plus everything already held and inserts the reservation
in ONE D1 batch, i.e. one transaction at the shared account level. ImageJobs calls it from inside each object. Proven by
`two generations for one account near its limit: the shared ledger admits exactly one`.

## 2. Stages

`queued -> admitting -> admitted -> submitting -> stored -> recorded -> ready`; terminal `ready`, `refused`, `cancelled`, `failed`,
`unknown`. Each stage is saved in DO storage BEFORE the work it guards. Every terminal transition saves the stage and its ledger
outcome (`settlement {status, calls, costUsd, done:false}`) first, then settles; `done` turns true only after the ledger rows are
confirmed.

| Stage saved | Then | Ledger |
|---|---|---|
| queued | at create, before the 201 reply; alarm armed (+50 ms) | nothing |
| admitting | before `admitSpend` (op id `image_generate:<sha(org,email,generationId)>`) | reservation of `IMAGE_GENERATE_RESERVED_USD` in `usage_operations` + `usage_attempts` (kind media) |
| admitted | after the ledger row is confirmed | held |
| submitting | before the request leaves, with `leaseUntil` and a recovery alarm at +180 s | held |
| stored | after the output is in R2 at `file-sources/<sourceId>/original/<sha256>` (customMetadata `imageJob`) | held |
| recorded | after the `file_sources` row is inserted and read back (owner = canvas owner, family image, status stored) | held |
| ready | then settled: measured cost if the provider reported priceable usage, else cost NULL (reservation kept as unknown cost) | settled |

## 3. Job API (what the shared confirmation flow calls)

All JSON, `Cache-Control: no-store`, same-origin for POST. Identity is the signed-in requester (`repositoryIdentity`); the canvas
scope is `boardOwner`/`ownerRow` (owner-only canvases). The object is named `image-job:<org>|<email>|<generationId>`, so the job
id IS the generation id and another person's lookup reaches an empty object (404).

- `GET /api/learn/image-jobs` -> `{ available, models: [{ id, label, provider, configured }] }`. `available` is the flag only.
- `POST /api/learn/image-jobs` with `{ generationId, proposal, app, board?, cardId? }`.
  - `generationId`: `^[A-Za-z0-9_-]{16,64}$`, made by the browser once per deliberate Generate press and resent on reload or retry.
  - `proposal`: the signed, approved generate-image proposal. Read from it ONLY: `command` (must be `generate-image`),
    `description` (the pill-free prompt, 1 to 4,000 characters), `settings {model, quality?, aspect_ratio, resolution}`,
    `references [{id, kind:'file', sourceId: fs_<24 hex>, revision: sha256}]`, `quote {estimate_credits, reserve_credits}`.
  - Order: flag (503 `image_generation_disabled`, nothing else read) -> bindings (503 `not_configured`) -> identity and canvas ->
    an existing job under this generation id is returned as is (200; reconnect) -> `verify` (409 `proposal_refused`) ->
    settings (409 `settings_invalid`) -> server quote (409 `quote_unknown` with `reason`) -> the signed quote must equal the server's
    (409 `quote_changed`) -> every reference re-resolved with `authorizeFileSource` under the canvas row (409 `reference_blocked`
    with `references: [{id, state: ok|changed|inaccessible|unsupported}]`) -> `consumeProposal` keyed by the generation id
    (409 `proposal_used` / `proposal_stale` / `proposal_canvas`) -> job created (201 `{ job }`).
  - Nothing is reserved in this request and no provider is contacted in it; the object's alarm does both.
- `GET /api/learn/image-jobs/:id` -> `{ job }`: `id, stage, reason, message (refused: the allowance text), provider, model,
  estimate_credits, artifact {sourceId, sha256, mimeType, bytes} (ready only), cost (measured|estimated|unknown|null),
  saveRetryable, createdAt, updatedAt`.
- `GET /api/learn/image-jobs/:id/inspect` -> the full record without bytes: settings, prompt, reference ids and hashes, quote,
  proposal id and version, output, provider model, usage, provider timing and status, settlement, retries, last error.
- `POST /api/learn/image-jobs/:id/retry-save` -> 202 when the job is `stored`, `recorded` or has an unsettled ledger outcome;
  re-arms the alarm for those steps only. 409 `nothing_to_retry` otherwise. Works with the flag off.

Status, inspect and retry-save keep working with the flag off: disabling stops new submissions only.

Integration note for the contract lane: the default `verify` is `verifyProposal` from `generation-proposal.js`, which on main does
not sign `generate-image` and rejects the v3 fields, so this route refuses every image proposal until the UI-15.1 v3 envelope adds
`generate-image` (tested: the default-verify case in `the approval is enforced before anything is consumed or reserved`). The
contract should sign `quote` from `imageQuote(env, settings, references.length, promptBytes)` in `image-providers.js`, so the
server can recompute and compare it here. The model table here and `IMAGE_MODELS` in the web schema must agree; the server's is
the one enforced.

## 4. Recovery matrix

| Boundary | What is durable | What a later alarm does | Provider calls | Test |
|---|---|---|---|---|
| (1) before submission | `queued`/`admitting`/`admitted`; maybe a reservation | `admitting` reads the ledger row by op id: admitted -> continue, absent -> admit again (nothing was reserved), anything else -> failed. `admitted` submits. Flag off or key missing -> released (cost 0). | exactly 1 | `boundary 1, before submission: a restart resumes safely and submits exactly once`; `switching off after a job was queued or admitted contacts no provider and releases any hold` |
| (2) after submission, outcome unknown | `submitting` | not running in this isolate: look for this job's own R2 output; none -> `unknown`, ledger failed with cost NULL (reservation kept as unknown cost). An expired lease changes nothing. Never resent. | 1, never 2 | `boundary 2, submitted with the outcome unknown: unknown, cost held, never resubmitted, an expired lease included`; `provider failures: not sent is released, an answered error is failed at unknown cost, a timeout is unknown` |
| (3) provider answered, before durable storage | `submitting`; bytes in memory only | R2 write failed -> `unknown` (`result_not_stored`): the provider may have billed, the image is lost. Not called recoverable. | 1 | `boundary 3, provider answered but the result could not be stored: unknown, never regenerated` |
| (3->4) in R2, state not yet saved | R2 object, `submitting` | adopts the object found under the job's deterministic prefix with its `imageJob` metadata -> `stored` | 1 | `boundary 3 to 4: output in R2 but the object died before saving it: adopted from R2, not regenerated` |
| (4) in R2, before the database record | `stored` | retries only the `file_sources` insert (ON CONFLICT DO NOTHING, read back); backoff 30 s x n, up to 20, then `retry-save` | 1 | `boundary 4, stored in R2 before the database record: only the record is retried, also by retry-save with the flag off` |
| (5) recorded, before settlement | `recorded`, or `ready` with `settlement.done false` | retries only the settlement. Repeats and a release after a settle are no-ops (ledger `WHERE status = 'admitted'` / `'running'`) | 1 | `boundary 5, recorded before settlement: settlement is retried alone and is idempotent; release after settle is a no-op` |

Provider outcomes (`provider failures: not sent is released, an answered error is failed at unknown cost, a timeout is unknown`):
nothing left the worker (no key, invalid input) -> released, cost 0; the provider answered with an error or an unusable body ->
`failed`, cost unknown (it may bill); no answer -> `unknown`. None is retried automatically; a new attempt is a new generation id
and a new approval.

The fix the matrix tests forced: a step that fails after saving a later stage must not be overwritten by the snapshot it began
with (the retry path re-reads the stored job). Without that, a storage failure right after the provider answered put the job back
at `admitted` and the next alarm would have sent a second request.

## 5. What runs after the browser disconnects

- The POST returns 201 as soon as `queued` is saved and an alarm is set 50 ms ahead. Everything else runs in `ImageJobs.alarm()`,
  which no browser request awaits. Tested: `the job is persisted before any provider contact and completes from alarms alone after
  the browser is gone` (no request after the create; the job reaches `ready` from the alarm alone).
- One driver per object (`drive()`): an alarm arriving while the same isolate is still running the job waits for that run.
- Before the provider request the job saves `submitting` and sets the alarm to +180 s (the adapter's timeout is 120 s). If the
  isolate is evicted or restarted mid-call, that alarm runs `alarm()` in a fresh object, which finds `submitting` and applies
  boundary (2). Tested by evicting an object whose provider call never returns.
- Failing persistence steps re-arm their own alarm with backoff; the handler does not throw for them.

Cloudflare limits, verified 2026-10-23 on developers.cloudflare.com:
- `alarm()` has guaranteed at-least-once execution and is retried on an uncaught exception with exponential backoff starting at
  two seconds, up to six retries (Durable Objects API, Base).
- An alarm handler invocation has a maximum wall time of 15 minutes (Workers limits); the job needs at most about 2 minutes.
- `ctx.waitUntil()` extends a request for up to 30 seconds after the response or disconnect (Workflows/Workers limits table):
  too short for a 25 to 120 s image call, which is why the call is not in the request.
- If an unexpected error terminates the Durable Object, the alarm handler is re-instantiated and runs from the beginning
  (Alarms API example), which is why every stage is idempotent and saved first.
- Alarms can run concurrently with other requests to the same object (changelog 2026-08-25): fetch handlers here only read the job
  or re-arm the alarm; only the alarm advances it.
Not verified: whether a second alarm can start while a first handler is still running in the same isolate (handled either way by
`drive()`); placement and latency.

## 6. Providers (no call made)

Adapter interface: `{ provider, capabilities: { generate, edit, retrieve, idempotency }, generate(input), edit(input) }`, input
`{ model, prompt, settings, references: [{bytes, mimeType}], signal }`, result `{ bytes, mimeType, providerModel, usage }`, errors
carry `code`, `providerRequestStarted`, `definiteResponse`. `retrieve` and `idempotency` are false for all four models: neither
provider page read documents looking up or deduplicating a lost image request. Timeout 120 s. Output checked by file signature
(PNG, JPEG, WebP) and size (20 MiB), not decoded. Keys read by name (`OPENAI_API_KEY`, `GEMINI_API_KEY`) inside the worker only;
logs carry job id, step, stage, provider, model, error code, timing and usage, never keys, prompts or image bytes.

| Model | Endpoint | Unverified |
|---|---|---|
| `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare` | `POST /v1/images/generations` (JSON) and `/v1/images/edits` (multipart, `image[]`), `output_format png`, size from (aspect ratio, resolution) on OpenAI's common-size list | multi-image field name (the guide's curl uses `image[]`); maximum references (4 enforced, the guide says 16); output tokens per quality/size, so NO OpenAI option has a price and none can start; sizes above 2560x1440 are marked experimental by OpenAI and are never quoted (`experimental_size`); whether the 2.5 models return `usage`. A 4xx keeps its stable reason code (OpenAI `error.code`, e.g. `moderation_blocked`; Google `error.status`) as `providerCode` on the failed job (never the message, which can echo the prompt); the job stays failed at unknown cost |
| `gemini-nano-banana-2.1`, `gemini-3-pro-image` | `POST https://generativelanguage.googleapis.com/v1beta/interactions`, `x-goog-api-key`, `input` text + inline images, `response_format {type:'image', mime_type:'image/jpeg', aspect_ratio, image_size}`: a live request for `image/png` was refused (400, supported `image/jpeg`, 2026-10-23), so Google images are JPEG while OpenAI stays PNG; the stored type (R2 content type, `file_sources.media_type`/`declared_type`, `.jpg` name, artifact) is the one the file signature shows, never the requested one; whether `gemini-3-pro-image` accepts `image/jpeg` is first shown by run D | the live response (shapes are from the API reference, not yet seen); input image limits; background/retrieval support for image models. Read as documented: the LAST image block of the `model_output` steps (what the SDK's `output_image` returns; that property is SDK-only); `status` honoured (absent or `completed` is read, `failed`/`cancelled` are definite failures, `incomplete`/`in_progress`/`requires_action` are an unknown outcome and are never resubmitted); `usage` kept on the job and priced when `output_tokens_by_modality` adds up to `total_output_tokens` (input at the input rate, image tokens at the image rate, other output and `total_thought_tokens` at the text rate), otherwise cost stays `estimated`. `store:false` is sent: the API otherwise retains interactions (prompts and reference images) 55 days on the paid tier; the docs list only background execution and `previous_interaction_id` as incompatible, and whether image output works with it is first shown by a live call (acceptance run C) |

Quote (`imageQuote`): published per-image output price + references + prompt bytes x text rate (bytes bound tokens from above);
`unknown` (blocks Generate) when the price is unverified (all OpenAI; Nano Banana 2.1 at 4K, whose published $0.113 contradicts its
own token math; Nano Banana 2.1 with references, whose per-image input cost is not stated), when `IMAGE_GENERATE_RESERVED_USD` is
unset, or when the bound is below the estimate. The estimate excludes thinking tokens (billed, count not published), so it is shown
as an estimate; the ledger holds the full reservation and settles below it only on measured usage. Cost on the job: `measured`
(provider-reported tokens x verified rates, OpenAI or Google), `estimated` (the quote; the allowance still holds the reservation as unknown), `unknown`.

## 7. Configuration and migration

- Binding `IMAGE_JOBS` -> class `ImageJobs` in `packages/web/wrangler.rabbit-hole-prod.jsonc`, `wrangler.dev.jsonc`,
  `wrangler.parallel.jsonc`; exported by `dev-worker.js` (and so by its tripwire, gate-stub and dev-access entries via
  `export *`) and by `app-worker.js`.
- Durable Object migration tag `image-jobs-1` (`new_sqlite_classes: ["ImageJobs"]`), last in each array. Tags in use before:
  `learn-videos-1, learn-scenes-1, repository-imports-1, file-jobs-1, cad-jobs-1, explain-jobs-1`; `image-jobs-1` appears in no
  config and in no commit on any ref (`git log --all -S image-jobs-1`, 2026-10-23). The other web configs (notebook sites) bind no
  Durable Objects. `rabbit-hole-cp` is unchanged.
- No D1 or learn migration: `file_sources` (0023), `usage_operations` (0016), `usage_actions`/`usage_attempts` (0022) exist.
- Vars: `IMAGE_GENERATE_ENABLED: "false"` in all three. Set in no config: `IMAGE_GENERATE_RESERVED_USD`; the `GEMINI_API_KEY` secret is on no worker (H2 in the audit).
- The tag is applied by the normal `wrangler deploy` of each worker (the release flow); it is the only irreversible step, and with
  the flag off nothing calls the class.

## 8. Rollback

1. Set `IMAGE_GENERATE_ENABLED` to `"false"` (or remove it) and redeploy. New submissions answer 503; queued or admitted jobs are
   cancelled and released by their next alarm without a provider call; jobs past submission finish their storage and settlement.
2. Leave the class, binding and tag in place, so existing jobs can be inspected, saved (`retry-save`) and settled.
3. Fix forward. Do not plan on a version rollback across the migration (not verified for the legacy `migrations` array). Removing
   the class later needs a `deleted_classes` migration, which deletes every job record; generated images stay in R2 and
   `file_sources`.

## 9. Open items

- NEEDS DECISION: the reservation bound `IMAGE_GENERATE_RESERVED_USD` (one value per image job) and the per-model estimate table
  values; OpenAI pricing for the quote (output tokens by quality and size).
- NEEDS DECISION: per-person or per-canvas in-flight limit (none here; the allowance bounds money, not concurrency).
- The legacy `POST /api/learn/image` (`gpt-image-1`, no reservation) is untouched here; retiring it is a separate change
  (shutdown-and-storage.md Part 1 option 2).
- First owner-authorized call per provider verifies the response shapes above before the flag is switched on anywhere.
