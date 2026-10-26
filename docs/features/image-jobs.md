# Image generation jobs (IMG-01)

Status: server substrate built 2026-10-23 on branch `feat/image-jobs` (lane feat-image-jobs), live in production since r3 (35c9555b) with
public generation **off**: `IMAGE_GENERATE_ENABLED` is `"false"` in every committed config. The production config adds the controlled
owner-only acceptance path (section 6d: `IMAGE_ACCEPTANCE_EMAILS`, `IMAGE_GENERATE_RESERVED_USD`). Evidence kinds are kept apart (section 6e):
the unit and integration tests use fixture transports only; five provider-adapter validation runs (2026-10-23) and four more (2026-10-25)
called the REAL providers from a LOCAL harness (the production adapter code, not the deployed Worker); **no run has gone through the
deployed Worker, the signed route and the browser**: that is the owner-only production acceptance, still to do.

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
| ready | then settled at the measured cost, else at the estimated upper bound (labelled so), else cost NULL (provider cost unknown; the learner is charged zero and holds nothing); see section 6, Cost | settled |

## 3. Job API (what the shared confirmation flow calls)

All JSON, `Cache-Control: no-store`, same-origin for POST. Identity is the signed-in requester (`repositoryIdentity`); the canvas
scope is `boardOwner`/`ownerRow` (owner-only canvases). The object is named `image-job:<org>|<email>|<generationId>`, so the job
id IS the generation id and another person's lookup reaches an empty object (404).

- `GET /api/learn/image-jobs` -> `{ available, models: [{ id, label, provider, configured }] }`. `available` is the flag only.
- `POST /api/learn/image-jobs` with `{ generationId, proposal, app, board?, cardId? }`.
  - `generationId`: `^[A-Za-z0-9_-]{16,64}$`, made by the browser once per deliberate Generate press and resent on reload or retry.
  - `proposal`: the signed, approved generate-image proposal. Read from it ONLY: `command` (must be `generate-image`),
    `description` (the pill-free prompt, 1 to 4,000 characters), `settings {model, quality?, aspect_ratio, resolution}`,
    `references [{id, kind:'file', sourceId: fs_<24 hex>, revision: sha256}]`, `quote {estimate_credits, max_credits, reserve_credits}` (6f).
  - Order: flag (503 `image_generation_disabled`, nothing else read) -> bindings (503 `not_configured`) -> identity and canvas ->
    an existing job under this generation id is returned as is (200; reconnect) -> `verify` (409 `proposal_refused`) ->
    settings (409 `settings_invalid`) -> server quote (409 `quote_unknown` with `reason`) -> the signed quote must equal the server's
    (409 `quote_changed`, with the live quote in credits; a changed maximum charge counts) -> every reference re-resolved with `authorizeFileSource` under the canvas row (409 `reference_blocked`
    with `references: [{id, state: ok|changed|inaccessible|unsupported}]`) -> `consumeProposal` keyed by the generation id
    (409 `proposal_used` / `proposal_stale` / `proposal_canvas`) -> job created (201 `{ job }`).
  - Nothing is reserved in this request and no provider is contacted in it; the object's alarm does both.
- `GET /api/learn/image-jobs/:id` -> `{ job }`: `id, stage, reason, message (refused: the allowance text), provider, model,
  estimate_credits, max_credits, charged_credits (once settled; null while unsettled or unknown), artifact {sourceId, sha256, mimeType, bytes} (ready only), cost (measured|estimated_upper_bound|unknown|null),
  saveRetryable, createdAt, updatedAt`.
- `GET /api/learn/image-jobs/:id/inspect` -> the full record without bytes: settings, prompt, reference ids and hashes, quote,
  proposal id and version, output, provider model, usage, provider timing and status, settlement, retries, last error.
- `POST /api/learn/image-jobs/:id/retry-save` -> 202 when the job is `stored`, `recorded` or has an unsettled ledger outcome;
  re-arms the alarm for those steps only. 409 `nothing_to_retry` otherwise. Works with the flag off.

Status, inspect and retry-save keep working with the flag off: disabling stops new submissions only.

Integration (branch `image/int`, 2026-10-23): the default `verify` is `verifyImageProposal` (generation-proposal.js), which accepts only a
v3-signed `generate-image` proposal. The server makes that proposal itself, with no model call: `POST /api/learn/chat/image-proposals`
(chat-proposal-route.js) takes `{ app, thread_id, prompt (with reference pills), settings, references?, title? }`, validates the settings
with the canonical schema, signs a v3 proposal whose `quote` is the server's own `imageQuote()` (never a client's; `null` when unknown) and
stores it as an answer row with its one-shot state, so the card's GET/PUT, revisions (which re-quote) and `consumeProposal` are the ones
chat proposals use. Off with the same 503 `image_generation_disabled`. `readiness` (unsigned, like `usage`) is `imageReadiness()`.

## 4. Recovery matrix

| Boundary | What is durable | What a later alarm does | Provider calls | Test |
|---|---|---|---|---|
| (1) before submission | `queued`/`admitting`/`admitted`; maybe a reservation | `admitting` reads the ledger row by op id: admitted -> continue, absent -> admit again (nothing was reserved), anything else -> failed. `admitted` submits. Flag off or key missing -> released (cost 0). | exactly 1 | `boundary 1, before submission: a restart resumes safely and submits exactly once`; `switching off after a job was queued or admitted contacts no provider and releases any hold` |
| (2) after submission, outcome unknown | `submitting` | not running in this isolate: look for this job's own R2 output; none -> `unknown`, ledger failed with cost NULL (provider cost unknown, kept as the platform ledger's bound; the learner is charged zero and holds nothing). An expired lease changes nothing. Never resent. | 1, never 2 | `boundary 2, submitted with the outcome unknown: unknown, cost held, never resubmitted, an expired lease included`; `provider failures: not sent is released, an answered error is failed at unknown cost, a timeout is unknown` |
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

## 6. Providers

Adapter interface: `{ provider, capabilities: { generate, edit, retrieve, idempotency }, generate(input), edit(input) }`, input
`{ model, prompt, settings, references: [{bytes, mimeType}], signal }`, result `{ bytes, mimeType, providerModel, usage }`, errors
carry `code`, `providerRequestStarted`, `definiteResponse`. `retrieve` and `idempotency` are false for all four models: neither
provider page read documents looking up or deduplicating a lost image request. Timeout 120 s. Output checked by file signature
(PNG, JPEG, WebP) and size (20 MiB), not decoded. Keys read by name (`OPENAI_API_KEY`, `GEMINI_API_KEY`) inside the worker only;
logs carry job id, step, stage, provider, model, error code, timing and usage, never keys, prompts or image bytes.

| Model | Endpoint | Unverified |
|---|---|---|
| `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare` | `POST /v1/images/generations` (JSON) and `/v1/images/edits` (multipart, `image[]`), `output_format png`, size from (aspect ratio, resolution) on OpenAI's common-size list | multi-image field name (the guide's curl uses `image[]`); maximum references (4 enforced, the guide says 16); output tokens per quality/size are not published, so only the MEASURED low-quality sizes have a price (6c) and the rest cannot start; sizes above 2560x1440 are marked experimental by OpenAI and are never quoted (`experimental_size`); whether the 2.5 models return `usage`. A 4xx keeps its stable reason code (OpenAI `error.code`, e.g. `moderation_blocked`; Google `error.status`) as `providerCode` on the failed job (never the message, which can echo the prompt); the job stays failed at unknown cost |
| `gemini-nano-banana-2.1`, `gemini-3-pro-image` | `POST https://generativelanguage.googleapis.com/v1beta/interactions`, `x-goog-api-key`, `input` text + inline images, `response_format {type:'image', mime_type:'image/jpeg', aspect_ratio, image_size}`: a live request for `image/png` was refused (400, supported `image/jpeg`, 2026-10-23), so Google images are JPEG while OpenAI stays PNG; the stored type (R2 content type, `file_sources.media_type`/`declared_type`, `.jpg` name, artifact) is the one the file signature shows, never the requested one; whether `gemini-3-pro-image` accepts `image/jpeg` is first shown by run D | the live response (shapes are from the API reference, not yet seen); input image limits; background/retrieval support for image models. Read as documented: the LAST image block of the `model_output` steps (what the SDK's `output_image` returns; that property is SDK-only); `status` honoured (absent or `completed` is read, `failed`/`cancelled` are definite failures, `incomplete`/`in_progress`/`requires_action` are an unknown outcome and are never resubmitted); `usage` kept on the job and priced as measured only when it reconciles exactly, otherwise as an estimated upper bound (see Cost below). `store:false` is sent: the API otherwise retains interactions (prompts and reference images) 55 days on the paid tier; the docs list only background execution and `previous_interaction_id` as incompatible, and whether image output works with it is first shown by a live call (acceptance run C) |

Quote (`imageQuote`): published per-image output price + references + prompt bytes x text rate (bytes bound tokens from above);
`unknown` (blocks Generate) when the price is unverified (OpenAI beyond its measured low-quality sizes, and OpenAI with references, whose
token count is not published; see 6c), when `IMAGE_GENERATE_RESERVED_USD` is unset, or when the bound is below the estimate. The estimate excludes thinking tokens (billed, count not published), so it is shown
as an estimate (it is the quote shown before approval, not a cost).

Cost (owner 2026-10-23): three values are kept apart on the job (`job.cost`, shown by inspect as `costs`), in the closed log line, and in the
settlement; the public status shows only the state, `measured` | `estimated_upper_bound` | `unknown`.
- `measuredUsd`: only when the provider usage reconciles exactly and the rates are verified. OpenAI: `input_tokens` equals its text + image
  details and there are no text output tokens (no text-output rate is published). Google: `output_tokens_by_modality` and
  `input_tokens_by_modality` add up to `total_output_tokens` / `total_input_tokens`, thought tokens are reported (billed at the text
  rate, apart from `total_output_tokens`) and no tool-use tokens exist.
- `estimatedUpperBoundUsd`: input tokens at the input rate by modality (unattributed or unknown-modality input at the highest input
  rate) + max(`total_output_tokens`, the sum of every reported output component: modality tokens + thought + tool-use) x the model's HIGHEST
  output rate (the image rate). Assumption: no reported token costs more than that rate. It exists because real Gemini payloads do not
  reconcile: `total_output_tokens` is not image + thought and thought tokens can exceed what it leaves over (runs C, D, E). The same
  `total_tokens` = input + output + thought held on all three, so a tighter estimate is possible, but it is not used.
- `reservedMaxUsd`: what the job held (the quote's reserve).
Settlement records the REAL cost on the platform ledger (`usage_operations.cost_usd`) as the measured cost, else the upper bound, never clipped to
the reservation, and charges the learner's attempt (`usage_attempts.cost_micros`, state `settled`, so the learner's balance) `min(that, the maximum
charge signed into the quote)` (6f); no usable usage keeps the reservation as unknown cost. The ledger
has no basis column: an upper-bound settlement is marked `usage_operations.error = cost_estimated_upper_bound`, and an amount above the
reservation is flagged `spend_bound_exceeded` by `settleSpend` and recorded on the job as `overrun { exceeded, amountUsd }`. Note the
existing platform guard (`admitSpend`) refuses further platform admissions for a day while a `spend_bound_exceeded` row exists.
Rates (verified on the pages read 2026-10-23: Google https://ai.google.dev/gemini-api/docs/pricing, OpenAI
https://developers.openai.com/api/pricing; `RATES` in image-providers.js): Nano Banana 2.1 input $1.5/M, text and thinking out $7.5/M, image
out $30/M; Pro input $2/M, text and thinking $12/M, image $120/M; GPT Image 2.5 text in $5/M, image in $8/M, image out $30/M. The per-image
quote table (`PRICES`) is separate and unchanged. Real-payload bounds: C (Nano Banana 2.1, 14 text in, out 1439, image 1120, thought
1000) $0.063621; D (Pro, 14 in, out 1218, image 1120, thought 80) $0.146188; E (Nano Banana 2.1, 14 text + 1120 image in, out 1407, image
1120, thought 497) $0.050211; OpenAI A $0.005975 and B $0.010171 are measured.

## 6b. Validated combinations (image-settings.js)

Every option stays visible. Only combinations a live provider run covered may be generated; any other shows its reason on the card before
confirmation (`readiness`, Generate disabled) and is refused by the route with 409 `image_not_ready`, before the quote, the references and the
consume. The list is data (`IMAGE_VALIDATED`, with its evidence, policy `acceptance-2026-10-25`); extending it needs a new run.

| Model | Operation | Quality | Ratio, resolution | References | Run (section 6e) |
|---|---|---|---|---|---|
| gpt-image-2.5-flare | generate | low | 1:1, 1K (1024x1024) | 0 | A |
| gpt-image-2.5-flare | generate | low | 16:9, 2K (2048x1152) | 0 | imgact-flare169-1 |
| gpt-image-2.5-sunburst | generate | low | 1:1, 1K (1024x1024) | 0 | imgact-sunburst1k-1 |
| gpt-image-2.5-sunburst | edit | low | 1:1, 1K (1024x1024) | up to 2 | B |
| gemini-nano-banana-2.1 | generate | none | 1:1, 1K | 0 | C, imgact-nb21-1k-1 |
| gemini-nano-banana-2.1 | generate | none | 16:9, 1K | 0 | imgact-nb21-169-1 |
| gemini-nano-banana-2.1 | edit | none | 1:1, 1K | up to 1 | E |
| gemini-3-pro-image | generate | none | 1:1, 1K | 0 | D |

Ready is not the same as startable (6c). Every row above is priced and startable since the maximum charge (6f): Sunburst editing carries a MEASURED
reference row (run B: 256 image input tokens per reference, US$0.0021), which is an estimate and not a bound, because OpenAI publishes no tokens per
reference image; what protects the learner is the signed maximum. Flare has no reference row and no editing row. Everything not listed
(OpenAI medium and above, 2K at 1:1, 4K, other ratios, Pro at 2K or 4K or with references, Nano Banana at 2K or 4K or with more than one
reference) stays visible and greyed with what was tested; none is substituted or removed.

## 6c. Prices, the hold and what the learner is charged (official pages read 2026-10-25)

Sources and the arithmetic: `C:/s/spec/image-activation/price-verification.md`. Per-image prices (`PRICES`): Nano Banana 2.1 1K US$0.0336, 2K 0.0504,
4K 0.113 (3,780 tokens x US$30/M; the earlier "contradiction" came from another page's 2,520 figure) plus US$0.00168 per reference (a Gemini 3 input
image is at most 1,120 tokens at the default media resolution, observed 1,120 in run E, x US$1.5/M); Pro 1K and 2K 0.134, 4K 0.24, a reference about
0.0011 (published). OpenAI publishes token rates only (image out US$30/M, image in US$8/M, text in US$5/M) and no tokens per image, so the OpenAI rows are
MEASURED: at quality low 196 output tokens at 1024x1024 (three runs) and 157 at 2048x1152 (one run), rounded up to 200 tokens, US$0.006. No other
OpenAI quality or size has a row. The prompt is added at its UTF-8 byte count x the text rate (a token is at least one byte).

(The reference row for Sunburst is the one MEASURED reference price: `referenceImage` 0.0021 = 256 image input tokens x US$8/M rounded up, run B; Flare has none.)

`IMAGE_GENERATE_RESERVED_USD` is the hold admitted before a job and released at settlement. Derivation: the largest priced estimate among the enabled
rows is Pro 1K, 0.134 + 4,000 prompt bytes x US$2/M = 0.142; the largest real settlement seen for it is 0.1462 (run D); US$0.20 covers both. A test in
`rabbit-hole-prod-config.test.js` recomputes the maximum from `IMAGE_VALIDATED` and fails if the configured hold ever falls below it.

HELD per-model hold (branch `feat/image-per-model-reserve`, owner decision): `IMAGE_RESERVED_USD_BY_MODEL` (JSON) gives each model its own hold, read by `imageQuote` (`reserveFor`, fail closed
on an unreadable map or a non-positive value): Flare and Sunburst 0.05 (5 credits), Nano Banana 2.1 0.10 (10), Pro 0.30 (30); `IMAGE_GENERATE_RESERVED_USD` stays the default for a model the map does not
name. It removes the 20-credit floor for a 1-credit OpenAI image and gives Pro room for about 1,300 thinking tokens instead of about 480. The signed quote carries the model's `reserve_credits`, and the job
already admits, settles and judges an overrun against its own quote, so no other code changes.

The learner is charged the measured cost, else the estimated upper bound (section 6, Cost), and never more than the signed maximum charge (6f). The gap
between the shown estimate and that charge is now disclosed before Generate (for Nano Banana 2.1 the upper bound prices thinking tokens at the image rate,
so the real charge can be up to about twice the estimate: run C, estimate 0.0336, bound 0.0636; the card shows "Most it can cost: 8 AI credits"). Users
see AI credits only (1 credit = US$0.01); dollar amounts, usage and costs are in `inspect`, which only an operator may read.

## 6d. The owner-only acceptance window (owner 2026-10-25)

PUBLIC generation is ON in this branch (`IMAGE_GENERATE_ENABLED` "true", the primitive `image_generate` ready and direct): held for the owner's GO until the deployed owner-only acceptance has passed (it cannot run after this flip, it requires the owner path). Who may use it: everyone signed in, within the settings 6f lists as supported; everything else stays visible, greyed, with the reason, and is refused by the server. Rollback: set `IMAGE_GENERATE_ENABLED` to "false" and redeploy. `IMAGE_ACCEPTANCE_EMAILS` (production config) lists exactly two entries, the owner's
Google application principal and the Gmail address, compared whole and lower-cased, as Motion's `MOTION_ACCEPTANCE_EMAILS` is. The identity is the
verified session (`repositoryIdentity`, the control plane's `/api/me` by cookie); a header, body field or query never names the caller. For anyone
else every route answers what it answers when generation is off (503 `image_generation_disabled`, `inspect` 404) and nothing is stored. The server
tells the web build who may use it: `GET /api/learn/image-jobs` answers `available` (and `operatorOnly`) for THIS caller, and the web build holds no
switch (`image-capability.js` sets `agent/slash.js imageGenerationLive`). The chat router decides per caller as well (`chat-capability-route.js`).
Operators may also send `fault` on a job (`provider_400`, `provider_429`, `network`, `invalid_output`): the real adapter builds the real request and
the real job settles it, but a stub transport answers, so nothing leaves the Worker and nothing is billed (the owner sets `localStorage['rh-image-fault']` in the browser; the next Generate sends it; anyone else gets a 400). `/image <words>` (alias `/generate-image`; owner, 2026-10-26: `/image` generates and `/photos` is the photo search) in the chat
composer asks the server for the plan (`POST /api/learn/chat/image-proposals`, no model call), which saves it in the chat as the plan card; Generate,
edits, reload and the job all start from that card, and after a reload the card follows the existing job instead of inviting a second press (the job
id is a function of the plan).

### Deployed acceptance command and the held public flip (2026-10-26)

`node scripts/image-acceptance.mjs --dry-run` prints the plan and writes nothing; the real run (owner, interactive terminal, the `small_session` cookie at a
hidden prompt, never printed or written) drives the deployed owner-only path: five free-path runs first (`refuse-unready`: a combination no live run covered is
refused 409 `image_not_ready` and shows no price; the four injected faults end `failed/provider_rejected` (400 and 429), `unknown/outcome_unknown` (network) and
`failed/invalid_output`, each charging nothing; plus `refuse-tampered-max`, a plan whose signed maximum was raised by one credit, refused 409 `proposal_refused`), then one
paid run per model and per path: GENERATION (`flare`, `sunburst`, `nb21`, `pro`) and EDITING with one reference uploaded through the file API (`sunburst-edit`, `nb21-edit`). Every run that can reach a provider is booked in the shared budget BEFORE its job request (`C:/s/spec/budget/budget.mjs reserve`, US$0.20 for a paid
run, US$0.40 for Pro; US$0.02 for a free-path run; total US$1.52) and settled from the cost the job recorded (`imageCost` over the inspect `usage`); an unclear answer keeps the
booking at its maximum. A paid run checks the plan's signed quote in credits as three numbers (estimate <= the most it can cost <= the hold, and the maximum and hold equal to THIS
checkout's configuration), its survival across a read, one edit saved and a stale one refused (409), a second press reaching the same job and a different press of
the spent plan refused (409 `proposal_used`, no job), operator `inspect` (settled, one call, no retry), the stored image (hash, type, size, PNG/JPEG signature), for an
editing run that the reference reached the job and the provider billed it as image input, credits charged equal to `min(real cost, signed maximum)` and never above
the maximum, the platform's absorbed difference (a FINDING when real cost passes the maximum), the hold released, the same estimate, maximum and charge after a reload
and a repeated Generate charging nothing more, and, in UI mode (`flare` and `nb21`, where the
owner presses Generate in the browser), that the image card is placed by the browser, persisted on the board and still there after a reload. A card is placed only
by the browser (a job that ended before a reload is only shown), so `--api-only` reports the card as not verified. Receipts (no secrets): `C:/s/spec/image-activate/receipts`.
The command stops at the first failure, skips runs with a PASS receipt on a re-run (`--force` repeats), and refuses a private ledger (`BUDGET_FILE`).
Tests: `scripts/image-acceptance.test.mjs` (a simulated deployed Rabbit Hole and a fake ledger, plus the real entry's `--dry-run` under Node's permission model).

Public activation is one reviewed commit, held on branch `feat/image-activation-public-flip` for the owner's GO: the primitive `image_generate.ready`
(`learn-primitives.js`; `direct`, so `artifactPlan` keeps it off the planning model's path) and `IMAGE_GENERATE_ENABLED` "true" in `wrangler.rabbit-hole-prod.jsonc`,
with `PUBLIC` in `image-public-gates.test.js` set to match. The web constant `IMAGE_GENERATION` (`agent/slash.js`) is deliberately NOT flipped: once the server flag is
public, `GET /api/learn/image-jobs` answers available for everyone and the build lists the command from that answer; a true constant would list it whatever the server
says (no UI-side rollback) and rewrites 20 web tests written for the per-caller design. `image-public-gates.test.js` fails when the primitive and the server flag
disagree or the web constant moves (negative control on the real files), and pins that the owner path works, `inspect` and fault injection stay operator-only, and a
look-alike address is a learner. The flip changes no secret, no hold, no owner list and no dev config.

### Cost bound per combination (what US$0.20 does and does not bound; enumerated through the real code, 1,500 settings the UI can submit)

`IMAGE_GENERATE_RESERVED_USD` is a hold, not a cap on what a provider bills. Where a combination is refused: `image_not_ready` (no live run covered it, 409 at Generate and
the card says so first) and `quote_unknown` (no verified price, 409). Estimates are at the longest prompt the quote bounds (4,000 bytes) and the most references the row allows.

| Model, combinations | Verified price (price-verification.md) | Estimate at max prompt | Bounded by 0.20? | What the code does |
|---|---|---|---|---|
| Flare low 1:1 1K, low 16:9 2K; Sunburst low 1:1 1K (3 enabled) | measured 196 / 157 output tokens x US$30/M, rounded to 0.006 | 0.026 | Yes, 7x over the largest measured settlement (0.0060) | enabled |
| Sunburst edit, 1 or 2 references (ready) | reference input tokens NOT published; MEASURED 256 per reference (run B), US$0.0021 | 0.0302 at 2 references | Estimate yes. A larger reference bills more (unpublished); the signed maximum caps the learner | enabled (6f) |
| Nano Banana 2.1 generate 1:1 1K, 16:9 1K; edit 1:1 1K, 1 reference (3 enabled) | published 0.0336 per 1K image + 0.00168 per reference; thinking billed, count not published | 0.0396 to 0.0413 | Estimate yes. Settlement: the charged upper bound reaches 0.20 only at about 5,300 thinking tokens (observed 728 to 1,000, bound 0.055 to 0.064) | enabled; above 0.20 it settles as an explicit overrun, never clipped |
| Nano Banana Pro generate 1:1 1K (1 enabled) | published 0.134 per 1K image; thinking billed at the image rate (US$120/M), count not published | 0.142 | Estimate yes. Settlement: NOT provable. The charged upper bound reaches 0.20 at about 480 thinking tokens (observed 80, bound 0.1462) | enabled; above 0.20 it settles as an explicit overrun (the learner is charged the full amount, which may pass their allowance by the difference) |
| Pro 2K (priced 0.134) and every other Google combination with no live run (627 NB 2.1, 299 Pro below 4K) | published | up to 0.143 (NB) and 0.157 (Pro) | Yes | refused before the call: `image_not_ready` |
| Pro 4K, any ratio or reference count (150 combinations) | published 0.24 per 4K image | 0.263 at 14 references | NO, above the hold | refused twice before any call: `image_not_ready`, and the quote is unknown (`reserve_below_estimate`, "paused: its spending bound is below this estimate") |
| Flare and Sunburst, every quality above low, every size with no row, 4K sizes | NOT published (no tokens per image); sizes above 2560x1440 are OpenAI-experimental | none | n/a | refused before the call: `quote_unknown` (`pricing_unverified`, `experimental_size`) |
| Flare with any reference; Sunburst with a reference at any size but 1:1 1K low (no live run) | reference input tokens NOT published | none | n/a | refused before the call: `image_not_ready` (Sunburst) or `quote_unknown` (`reference_pricing_unpublished`, Flare) |

Result: every ENABLED combination's quoted estimate is bounded by the 0.20 hold; every combination above it or without a verified price is refused before a provider is
contacted. What 0.20 does not prove is the Google thinking tokens (the adapter sets no thinking or output limit and the count is unpublished): Pro settles above 0.20 from about
480 thinking tokens. The branch `feat/image-per-model-reserve` (held) makes the hold per model so Pro holds more than 0.20 and the OpenAI rows hold less. The acceptance Pro run
sends the longest prompt the quote bounds and is booked at US$0.40, so the worst enabled price is the one measured.

## 6f. Estimate, maximum charge and hold: three numbers (owner 2026-10-26)

Same decision and the same shape as Motion (`docs/features/motion-credit-disclosure.md`). Users see AI credits only. The three numbers are recorded, signed,
sent and shown separately; none is derived from another at the card.

| Number | Meaning | Source | Flare, Sunburst | Nano Banana 2.1 | Nano Banana Pro |
|---|---|---|---|---|---|
| Estimate | The published (or measured) price for these settings and this prompt, thinking tokens excluded. Not a promise. | `PRICES` in `image-providers.js`; registry rows `packages/control-plane/src/pricing-registry.js` (OpenAI image text 5 / image 8 / image out 30 per M, Google 2.1 text 1.5, thinking 7.5, image out 30, Pro text 2, thinking 12, image out 120: all `verified`, retrieved 2026-10-23) | 1 credit (3 at a 4,000-byte prompt; Sunburst editing up to 4) | 4 (5 with a reference at the longest prompt) | 14 (15 at the longest prompt) |
| Maximum charge | The most one image can ever charge this learner, explicitly authorized when they press Generate. Signed into the quote. | `IMAGE_MAX_CHARGE_USD_BY_MODEL` (Worker variable, no default) | 4 | 8 | 20 |
| Temporary hold | Held from the allowance while the job runs, released at settlement. Not the expected charge and not the maximum. | `IMAGE_RESERVED_USD_BY_MODEL` (per model) | 5 | 10 | 30 |

Rule: `estimate <= maximum <= hold` for every combination or the quote is paused and Generate is blocked: `max_unset` (no value, no default),
`max_below_estimate`, `max_above_reserve`, beside the existing `reserve_unset` / `reserve_below_estimate`. A test (`rabbit-hole-prod-config.test.js`) recomputes every ready
combination from the checked-in production configuration at the longest prompt (4,000 bytes) and fails if any breaks the order. Settings priced above their model's maximum
are paused for the same reason (Nano Banana 4K estimate 0.113 > 0.08, Pro 4K 0.263 > 0.20): they are not validated either, so nothing changes for the learner.
Derivation of the values: the maximum sits above the model's largest ENABLED estimate (0.0302, 0.0413, 0.142) and above every charge seen (OpenAI measured 0.006 to 0.010;
Nano Banana upper bound 0.0555 to 0.0636, 6 to 7 credits; Pro 0.1462, 15 credits), and below the hold, which keeps room for Google's unpublished thinking tokens.

**Signing and staleness.** The quote `{ estimate_credits, max_credits, reserve_credits }` is part of the signed proposal (v3; a raised maximum fails the signature). Generate
recomputes it from the live configuration; any difference, or a proposal signed before the maximum existed, answers 409 `quote_changed` with the live quote in credits
and a sentence ("The price changed to 4 AI credits, and it can cost up to 8 AI credits. Review it and press Generate again to confirm."), before any hold, consume or provider
call. The card (`ChatMessages.jsx`) signs the same settings again, shows the new three numbers and the sentence, and Generate works only on the next press. A missing maximum
is `quote_unknown` with reason `max_unset`; the card then says "Price not available yet" and Generate stays disabled (`requires_max` in `generation-confirmation-schema.js`).

**Settlement.** The job's cost has three parts: `settledUsd` (the real cost, measured else the upper bound), `chargedUsd = min(settledUsd, maxChargeUsd)` and `absorbedUsd = settledUsd -
chargedUsd`. The platform ledger (`usage_operations.cost_usd`) records `settledUsd`; the learner's attempt (`usage_attempts.cost_micros`) is `chargedUsd`; a charge-capped
settlement is marked `usage_operations.error = charge_capped` (or `spend_bound_exceeded` when the real cost also passes the hold, as before, which still pauses further platform
admissions for a day). The overrun metric is explicit: `cost.absorbedUsd` on the job, `absorbed` in the operator inspect, `absorbedUsd` in the `closed` log line, `absorbedUsd` in the
acceptance receipt. The learner is never charged above the maximum; the platform absorbs the difference. Zero-credit failures are unchanged and never pass through the cap: nothing
left the Worker (released, 0 credits), a provider 429 (known 0), our own storage or configuration failure (cost unknown, charged nothing). `job.charged_credits` tells the requester what
was charged (0 for refused and cancelled jobs, null while unsettled or unknown) and the card says it once the image is ready.

**What the person sees** (existing plan card, no new page): "Estimated cost: N AI credits", "Most it can cost: M AI credits. You are never charged more.", "H AI credits are held while it
runs; whatever is not used is released." in three separate lines; "Price not available yet" with Generate disabled when any of the numbers is missing; the stale-quote sentence above;
for unsupported settings the readiness line below; after settlement "The image is ready on the canvas. Charged C AI credits.".

**Supported and unsupported.** Supported (ready AND priced, nothing else can be generated): Flare low 1:1 1K and 16:9 2K; Sunburst low 1:1 1K, and Sunburst editing at low 1:1 1K with 1 or 2
references; Nano Banana 2.1 1:1 1K and 16:9 1K, and editing at 1:1 1K with 1 reference; Nano Banana Pro 1:1 1K. Every other combination stays visible on the card, greyed by the readiness
line, with what was tested: "<Model> has only been tested for <the rows above for that model>. Other settings cannot be generated yet." Specifically unsupported, refused with 409
`image_not_ready` before any quote or hold: OpenAI quality medium, high, xhigh, max or auto; any OpenAI size but those two; 4K (OpenAI marks it experimental; Google 4K is unvalidated and
priced above the maximum); 2K for Google; Pro at any ratio but 1:1 or with references; Nano Banana with more than one reference or another ratio; Flare with any reference. Unpriced
reference combinations (Flare editing, OpenAI references beyond the measured small image) are `quote_unknown` (`reference_pricing_unpublished`).

**Not proven by tests.** The real cost of a Sunburst edit with a large reference (the measured row is one run with two small references), the Google thinking-token count (unpublished; the
learner is protected, the platform absorbs), the browser rendering of the three lines (SSR tests only; no browser check covers the image card), and everything through the deployed Worker
until the owner-only acceptance (6d) runs.

## 6e. Evidence record: what exists, and what it does and does not prove

Kinds: (A) fixture tests; (B) provider-adapter validation, the REAL provider called from a LOCAL harness; (C) deployed full-flow acceptance, never done.
Harness 1 (runs A to E): `C:/s/img-01-accept`, a local `wrangler dev` with the real `ImageJobs` object and the production adapter, local D1 and R2, the
provider reached through a metered proxy (receipts `C:/s/img-01-accept/receipts/<run>.jsonl`; the per-check PASS lines were not saved, only the
integrator's note "8/8" in the budget ledger). Harness 2 (imgact-*): the current main adapter (`image-providers.js` at 29622d8e) called directly
(`C:/s/spec/image-activation/validate.mjs`, receipts `C:/s/spec/image-activation/receipts/<run>.json`; no job, storage or ledger).

| Run | Model | Endpoint and settings | Adapter revision | Result | Cost |
|---|---|---|---|---|---|
| img-A-1 | gpt-image-2.5-flare | images/generations, low, 1024x1024 | 319c0f4e | 200, 8/8 | measured 0.005975 |
| img-B-1 | gpt-image-2.5-sunburst | images/edits, low, 1024x1024, 2 references | 319c0f4e | 200, ledger note 8/8 (no saved check list) | measured 0.010171 |
| img-C-1, C-2, C-3 | gemini-nano-banana-2.1 | interactions, 1K | 319c0f4e (C-3: 89459f02) | 400, 400 (image/png not supported), 429 (free tier) | 0 each |
| img-C-4 | gemini-nano-banana-2.1 | interactions, 1:1 1K, JPEG, store false | 89459f02 | 200, 8/8 | upper bound 0.0636 |
| img-D-1 | gemini-3-pro-image | interactions, 1:1 1K | 89459f02 | 200, 8/8 | upper bound 0.1462 |
| img-E-1 | gemini-nano-banana-2.1 | interactions, 1:1 1K, 1 reference | 89459f02 | 200, 8/8 | upper bound 0.05 |
| imgact-sunburst1k-1 | gpt-image-2.5-sunburst | generations, low, 1024x1024 | 29622d8e | 200, PNG 1024x1024 | measured 0.005975 |
| imgact-flare169-1 | gpt-image-2.5-flare | generations, low, 2048x1152 | 29622d8e | 200, PNG 2048x1152 | measured 0.004805 |
| imgact-nb21-1k-1 | gemini-nano-banana-2.1 | interactions, 1:1 1K | 29622d8e | 200, JPEG | upper bound 0.055461 |
| imgact-nb21-169-1 | gemini-nano-banana-2.1 | interactions, 16:9 1K | 29622d8e | 200, JPEG | upper bound 0.056901 |

From 89459f02 to 29622d8e the request building (`openaiImageAdapter`, `geminiImageAdapter`, `post`, the size map) is unchanged; what changed is the cost
functions, settlement, readiness and the signed route. So A to E still prove the request and response shapes, `store:false`, JPEG, the `image[]`
multi-image field and the usage fields; they do not exercise the current cost and settlement code (the imgact runs do, on real usage), the signed
route, the production Durable Object, secrets, R2 and D1 on Cloudflare, or the browser. They were not repeated: the request code did not change.
The production acceptance and its receipt: `C:/s/spec/image-activation/activation-package.md`.

## 7. Configuration and migration

- Binding `IMAGE_JOBS` -> class `ImageJobs` in `packages/web/wrangler.rabbit-hole-prod.jsonc`, `wrangler.dev.jsonc`,
  `wrangler.parallel.jsonc`; exported by `dev-worker.js` (and so by its tripwire, gate-stub and dev-access entries via
  `export *`) and by `app-worker.js`.
- Durable Object migration tag `image-jobs-1` (`new_sqlite_classes: ["ImageJobs"]`), last in each array. Tags in use before:
  `learn-videos-1, learn-scenes-1, repository-imports-1, file-jobs-1, cad-jobs-1, explain-jobs-1`; `image-jobs-1` appears in no
  config and in no commit on any ref (`git log --all -S image-jobs-1`, 2026-10-23). The other web configs (notebook sites) bind no
  Durable Objects. `rabbit-hole-cp` is unchanged.
- No D1 or learn migration: `file_sources` (0023), `usage_operations` (0016), `usage_actions`/`usage_attempts` (0022) exist.
- Vars: `IMAGE_GENERATE_ENABLED: "false"` in all three. Production also sets `IMAGE_GENERATE_RESERVED_USD` ("0.20", 6c), `IMAGE_RESERVED_USD_BY_MODEL` (6c), `IMAGE_MAX_CHARGE_USD_BY_MODEL` (6f) and `IMAGE_ACCEPTANCE_EMAILS` (6d);
  dev and parallel set neither. Secrets `OPENAI_API_KEY` and `GEMINI_API_KEY` are installed on `rabbit-hole-app` by the owner command
  `C:/s/spec/image-activation/prod-image-secrets.mjs` (never in a config). `/api/learn/transcribe` (dev-worker.js) is NO LONGER enabled by the key alone: it also needs
  `TRANSCRIBE_ENABLED` exactly `"true"` (default `"false"` in the dev, parallel and production configs, 2026-10-26), so installing the key for image work
  does not switch on spoken-answer transcription. Whether to enable it (key plus flag) or remove the mic is owner decision O-8 and stays open.
- The tag is applied by the normal `wrangler deploy` of each worker (the release flow); it is the only irreversible step, and with
  the flag off nothing calls the class.

## 8. Rollback

0. Owner-only window: empty `IMAGE_ACCEPTANCE_EMAILS` and redeploy; the owner then gets the same refusals as everyone.
1. Public: set `IMAGE_GENERATE_ENABLED` to `"false"` (or remove it) and redeploy. New submissions answer 503; queued or admitted jobs are
   cancelled and released by their next alarm without a provider call; jobs past submission finish their storage and settlement.
2. Leave the class, binding and tag in place, so existing jobs can be inspected, saved (`retry-save`) and settled.
3. Fix forward. Do not plan on a version rollback across the migration (not verified for the legacy `migrations` array). Removing
   the class later needs a `deleted_classes` migration, which deletes every job record; generated images stay in R2 and
   `file_sources`.

## 9. Open items

- DECIDED 2026-10-25 (derivation in 6c): the reservation bound `IMAGE_GENERATE_RESERVED_USD` is US$0.20 and the estimate table is the one in
  6c. STILL OPEN: OpenAI qualities above low and OpenAI reference tokens beyond the measured small image (not published), 2K and 4K validation runs. CLOSED 2026-10-26 (6f): the Nano
  Banana thinking-token charge versus the shown estimate is disclosed as "Most it can cost" and capped at the signed maximum.
- NEEDS DECISION: per-person or per-canvas in-flight limit (none here; the allowance bounds money, not concurrency).
- The legacy `POST /api/learn/image` (`gpt-image-1`, no reservation) is untouched here; retiring it is a separate change
  (shutdown-and-storage.md Part 1 option 2).
- Response shapes are verified (6e). Still unverified: the whole flow through the deployed Worker, the signed route and the browser (the owner-only production acceptance, 6d).
