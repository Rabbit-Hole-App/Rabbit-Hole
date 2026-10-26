# Ctrl+K image edit and background removal: activation checklist

Ledger 9453f5f0-2fb1-46f5-a9f7-04ea173142c4. Written 2026-10-26 on main 7b105a4b. Code: `packages/control-plane/src/inline-image-jobs.js`
(route and Durable Object protocol), `inline-image-edit-job.js` (one-attempt coordinator), `inline-image-edit-provider.js` (OpenAI adapter).
Shared plumbing: [file-jobs-production.md](file-jobs-production.md) (the `FileJobs` class; binding alone completes nothing).

**State today: implemented, unit-tested with fixtures, browser-tested with provider fixtures, NOT deployed enabled, NOT accepted.** No real
provider call has ever been made through this path; segmentation and image quality are unverified.

## What must be true, by name (all on the app Worker `rabbit-hole-app`)

The route answers `503 not_configured` ("Image editing is not available.") and `GET` answers `available:false` unless every row holds.
Tests: `test/inline-image-ledger.test.js` (every row removed in turn), `test/inline-image-jobs.test.js`.

| # | Ingredient | Name | Exact rule in code | State |
|---|---|---|---|---|
| 1 | Durable Object binding and class | `FILE_JOBS` (`FileJobs`) | `env.FILE_JOBS` present (`inline-image-jobs.js:48`); `app-worker.js` exports `FileJobs`; migration `file-jobs-1` | In main (plumbing). Deployed only when that release ships |
| 2 | Database and storage | `LEARN_DB`, `LEARN_MEDIA` | both bound | Exist in production |
| 3 | Enable flag | `INLINE_IMAGE_EDIT_ENABLED` | exactly the string `true` (not `TRUE`, `1`) | Absent in production |
| 4 | Provider key | `OPENAI_API_KEY` (secret) | non-empty string | Optional secret, not installed |
| 5 | Reservation | `INLINE_IMAGE_EDIT_RESERVED_USD` (var, dollars) | finite number greater than zero; shown to people as credits (x100) | Absent; value not decided (below) |
| 6 | Platform spending limit | `USAGE_PLATFORM_DAY_USD` | must be set, or admission refuses `cap_unset` and the job ends `refused` with nothing held | Required by `scripts/prod-release.mjs` on the app Worker, so present; the check is a release guard, not read by this lane |
| 7 | Person's allowance | `AI_MONTHLY_ALLOWANCE_USD` and grants | the payer is the signed-in requester; too little credit refuses before any provider call | In the production config |

Not needed: any new DO class, D1 migration (tables exist), `worker_loaders`, or a second OpenAI key (one `OPENAI_API_KEY` is shared with IMG-01).

## What installing `OPENAI_API_KEY` also switches on (verified in code, 2026-10-26)

| Feature | Gate | Effect of installing the key |
|---|---|---|
| `/api/learn/transcribe` (spoken answers, `dev-worker.js`) | Was the key alone. Now also `TRANSCRIBE_ENABLED` exactly `true` (commit 13147839, default `"false"` in dev, parallel and production configs) | **Release that commit BEFORE installing the key.** Without it, installing the key switches paid transcription on for every signed-in user. With it, nothing changes until the flag is set. Owner decision O-8 (key or remove the mic) stays open |
| IMG-01 `/image` generation with OpenAI models | `IMAGE_GENERATE_ENABLED` is `false` | Only the controlled owner acceptance path (`IMAGE_ACCEPTANCE_EMAILS`: two named identities) can then run OpenAI image jobs, under the ordinary hold and settlement rules (paid) |
| Planning model (`planModel`, `learn-models.js:102`) | needs `LEARN_PLAN_MODEL` as well; not set in production | None |
| Legacy `/api/learn/image` | `LEGACY_IMAGE_GENERATION` exactly `true`; set in no config | None |
| Ctrl+K image edit | rows 1 to 7 above | Still off until the flag and reservation exist |

Proof: `test/openai-key-install-effects.test.js` runs each path with the production config's own vars plus the key (owner decision D3, 2026-10-26): transcription 503, legacy image 503, Ctrl+K edit unavailable,
public image generation off with only `IMAGE_ACCEPTANCE_EMAILS` allowed, planning model unchanged, and a tripwire that fails if any other server file starts reading the key. Every file that reads it, with a key present:

| File | What it does with the key |
|---|---|
| `control-plane/src/inline-image-jobs.js` | One ingredient of `enabled()` for Ctrl+K image edit, plus the provider call. Nothing happens without `INLINE_IMAGE_EDIT_ENABLED` and the reservation |
| `control-plane/src/image-providers.js` | Names it as the secret of the OpenAI image models (`providerConfigured`). IMG-01 shows those models as configured; only `IMAGE_ACCEPTANCE_EMAILS` identities may start a job while `IMAGE_GENERATE_ENABLED` is `false` (paid) |
| `control-plane/src/learn-models.js` (`planUsesOpenAI`) and `ask.js` (`planModel`) | OpenAI planning only when `LEARN_PLAN_MODEL` is also set (absent in production). Otherwise unchanged (Anthropic) |
| `web/dev-worker.js` `/api/learn/image` | Legacy `gpt-image-1`: only when `LEGACY_IMAGE_GENERATION` is exactly `true` (set in no config); off |
| `web/dev-worker.js` `/api/learn/transcribe` | Only when `TRANSCRIBE_ENABLED` is exactly `true` (default `false`); see [transcription-migration.md](transcription-migration.md) |
| `control-plane/src/pricing-registry.js`, `learn-usage-estimates.js` | A comment and price rows only; neither reads the key |

## Price and reservation: what is and is not verified

- Verified (`pricing-registry.js`, official page read 2026-10-23/25): `gpt-image-2.5-sunburst-2026-09-08` input text 5, input image 8, output image 30 USD per million tokens.
- Measured once (image-jobs.md run img-B-1): an OpenAI **edit**, low quality, 1024x1024, two references: US$0.010171. Generation, same size: US$0.005975.
- **Unverified:** the cost of the exact Ctrl+K request (one PNG plus an alpha mask plus a prompt, `quality: low`, `size: 1024x1024`). The reference-image token count is not published,
  and image-jobs.md keeps sunburst-edit greyed for that reason. `result.usage` is stored on the job but is never priced: settlement passes `costUsd: null`
  (`inline-image-edit-job.js`), so the hold is **kept at the reservation as unknown cost** (`usage_attempts.cost_state = 'unknown'`, `usage_operations.cost_usd` = the reserve;
  asserted in `inline-image-ledger.test.js`). Consequence: **the person is held the full reservation for every delivered edit**, not the real cost.
- No value for `INLINE_IMAGE_EDIT_RESERVED_USD` is derived in the repo. Options and recommendation are in the owner decisions below.
- Dollars never reach the person: the quote and job payloads carry credits and phase names only (`inline-image-jobs.js` `reservedCredits`, `publicJob`); the UI formats credits.

## Fixture evidence (what exists) versus what does not

| Evidence | What it proves |
|---|---|
| `test/inline-image-jobs.test.js`, `inline-image-edit-job.test.js`, `inline-image-edit-provider.test.js` | Route, one-attempt coordinator, provider adapter with a fake transport |
| `test/inline-image-ledger.test.js` (new) | Missing configuration says unavailable and never reaches the Durable Object, ledger or provider; refusal at an unset platform cap or short allowance holds nothing and never calls the provider; disabling after queueing cancels without a hold; a delivered edit reserves then seals at the bound as unknown cost; a provider failure keeps the hold, no retry. Real `admitSpend`/`settleSpend`/`settleAttempt` on SQLite |
| Browser receipts `ctrlk-background-removal-receipt.md`, `ctrlk-regional-image-receipt.md`, `ctrlk-image-action-receipt.md` | UI wiring with intercepted or fixture jobs |
| **Nothing** | A real provider run, real segmentation quality, the deployed route on production, the settled amount for a real edit |

## Owner-only steps, in order (none run by this lane)

1. Release the `TRANSCRIBE_ENABLED` commit (13147839) and the FILE_JOBS plumbing. Success: `/api/learn/transcribe` still answers 503 with a key present.
2. Decide the reservation (O-8b below) and add `INLINE_IMAGE_EDIT_RESERVED_USD` (a config var) in a release.
3. Install `OPENAI_API_KEY` on `rabbit-hole-app` only (hidden prompt, never printed; coordinate with IMG-01 so it is set once).
4. Paid acceptance on a dev clone first, with the integrator's `budget.mjs reserve`: one real background removal and one regional edit through the app; read the ledger rows; the shared validation cap has about US$1.75 left and the owner has not approved more.
5. Only after step 4 passes, set `INLINE_IMAGE_EDIT_ENABLED` to `true` on production and verify the real flow. Rollback: remove the flag (queued jobs cancel without a hold; started jobs keep their hold as unknown).

## Owner decisions

| Decision | Options | Recommendation |
|---|---|---|
| O-3 activate image edit | A activate behind the key and a paid real run; B defer | A only after step 4 shows acceptable quality; until then B |
| Reservation `INLINE_IMAGE_EDIT_RESERVED_USD` | A `0.03` (3 credits, about 3x the measured two-reference edit); B `0.05`; C `0.20` (the IMG-01 hold; about 20x the measured edit) | A for the first paid run, then set from the measured settled cost. C would hold 20 credits per edit |
| Price the settlement from `result.usage` instead of holding the reserve | A leave as is; B small code change: price tokens at the registry rates and settle the real cost | B before any wide release (the person is otherwise held the full reserve); not done here because it widens scope |
| O-8 recorded-answer transcription | A install the key and set `TRANSCRIBE_ENABLED=true`; B remove the mic | Open. This lane only decoupled it from the image key |
