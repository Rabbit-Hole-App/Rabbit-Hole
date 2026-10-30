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
| 5 | Reservation | `INLINE_IMAGE_EDIT_RESERVED_USD` (var, dollars) | finite number greater than zero; shown to people as credits (x100) | Absent; `0.03` on `feat/ctrlk-activate` |
| 6 | Platform spending limit | `USAGE_PLATFORM_DAY_USD` | must be set, or admission refuses `cap_unset` and the job ends `refused` with nothing held | Required by `scripts/prod-release.mjs` on the app Worker, so present; the check is a release guard, not read by this lane |
| 7 | Person's allowance | `AI_MONTHLY_ALLOWANCE_USD` and grants | the payer is the signed-in requester; too little credit refuses before any provider call | In the production config |

Not needed: any new DO class, D1 migration (tables exist), `worker_loaders`, or a second OpenAI key (one `OPENAI_API_KEY` is shared with IMG-01).

## What installing `OPENAI_API_KEY` also switches on (verified in code, 2026-10-26)

| Feature | Gate | Effect of installing the key |
|---|---|---|
| `/api/learn/transcribe` (spoken answers, `dev-worker.js`) | Was the key alone. Now also `TRANSCRIBE_ENABLED` exactly `true` (commit 13147839, default `"false"` in dev, parallel and production configs) | **Release that commit BEFORE installing the key.** Without it, installing the key switches paid transcription on for every signed-in user. With it, nothing changes until the flag is set. Owner decision O-8 resolved 2026-10-29: transcription is approved for retained Explain-back voice notes (flag `"true"` in all three configs, priced `transcribeSpendTransport`); this legacy route stays refused |
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

## Price, reservation and what the person is charged (updated 2026-10-26: settlement from provider usage)

- Verified rates (`pricing-registry.js`, official page read 2026-10-23/25): `gpt-image-2.5-sunburst-2026-09-08` input text 5, input image 8, output image 30 USD per million tokens.
- Measured once (image-jobs.md run img-B-1): an OpenAI **edit**, low quality, 1024x1024, two references: US$0.010171. Generation, same size: US$0.005975.
- **Settlement (branch `feat/ctrlk-complete`):** the provider-reported usage is priced with those rates (`imageCost`, the function IMG-01 settles with) and the person is charged
  **min(priced usage, reservation)**: the whole reservation is never a flat charge, and a charge never exceeds what they approved. Usage that cannot be priced (absent, malformed, no rate) is not turned into zero:
  the attempt is recorded with cost unknown. Correction of an earlier note in this file: an unknown-cost attempt **charges the person nothing and holds nothing** (learn-usage.js: only a running call holds
  credits; the platform's daily guard keeps the reservation as the provider-cost bound). So before this change a delivered edit would have been free to the person; after it, the person pays the priced usage.
  Tests: `inline-image-ledger.test.js` (real ledger; negative control: without the cost function the usage tests fail) and `inline-image-edit-job.test.js`.
- **Still unverified:** the exact billed cost of the Ctrl+K request (one PNG, an alpha mask, a prompt, `quality: low`, `1024x1024`): the reference-image token count is not published. The first deployed acceptance
  records the real figure; expect about 1 credit (US$0.01) per edit. Output over the reservation is clipped to it (flagged on the job as `costClippedToReservation`), so the platform, not the person, absorbs any excess.
- `INLINE_IMAGE_EDIT_RESERVED_USD`: **0.03** (3 credits) on the activation branch, about 3x the measured two-reference edit. Nothing in the repo derives a better number until the acceptance run reports a real one.
- Dollars never reach the person: the quote and job payloads carry credits and phase names only (`reservedCredits`, `publicJob`); the UI formats credits. The acceptance command fails if a dollar figure appears.

## Fixture evidence versus deployed

| Evidence | What it proves |
|---|---|
| `test/inline-image-jobs.test.js`, `inline-image-edit-job.test.js`, `inline-image-edit-provider.test.js` | Route, one-attempt coordinator, provider adapter with a fake transport |
| `test/inline-image-ledger.test.js` | Missing configuration says unavailable and never reaches the Durable Object, ledger or provider; refusal at an unset platform cap or short allowance holds nothing; disabling after queueing cancels without a hold; a delivered edit reserves, then settles at min(priced usage, reservation); unpriceable usage is recorded unknown; a provider failure keeps the hold, no retry. Real `admitSpend`/`settleSpend`/`settleAttempt` on SQLite |
| `scripts/ctrlk-image-acceptance.test.mjs` | The deployed acceptance command against a simulated deployment (no network) |
| Browser receipts `ctrlk-background-removal-receipt.md`, `ctrlk-regional-image-receipt.md`, `ctrlk-image-action-receipt.md` | UI wiring with intercepted or fixture jobs |
| **Nothing yet** | A real provider run, real segmentation quality, the deployed route on production, the settled amount for a real edit. `scripts/ctrlk-image-acceptance.mjs` is the instrument; it has not been run |

## Deployed acceptance (prepared, NOT run)

`node scripts/ctrlk-image-acceptance.mjs --dry-run`, then without `--dry-run` in a terminal. Production origin only; your `small_session` cookie at a hidden prompt (memory only); every paid run is booked in
`C:/s/spec/budget/budget.mjs` before its request (US$0.05 each, five paid runs, US$0.25 booked, about US$0.05 expected to settle) and settled at the credits actually charged; a clipped or unclear run stays booked at its maximum.
Runs, in order, stopping at the first failure: `free-refusals` (no confirmation, consent below the reservation, stale revision, unknown card, mask on a removal: all refused and nothing charged), `bg-api` and `region-api` (the route directly:
duplicate submit reaches one job, a conflicting reuse of the key is refused, status re-read, stored result downloads with a PNG signature, 1024x1024, alpha for removal, the original untouched, credits charged within the reservation and not the flat reservation,
hold released, cost not unknown), `cancel`, then `bg-ui` and `region-ui` where you press Ctrl+K, approve, reload mid-run, press Apply and reload again. Receipts hold no secret (`C:/s/spec/ctrlk-image-accept/receipts`).

## Owner-only steps, in order (none run by this lane)

The complete ordered list, including the loader probe, is in [ctrlk-completion.md](ctrlk-completion.md).

## Owner decisions

| Decision | Options | Recommendation |
|---|---|---|
| Settle from provider usage | decided 2026-10-26: yes, min(priced usage, reservation) | built on `feat/ctrlk-complete` |
| Reservation `INLINE_IMAGE_EDIT_RESERVED_USD` | A `0.03` (3 credits); B `0.05`; C `0.20` (the IMG-01 hold) | A (on the activation branch); raise only if the acceptance run shows real cost near it |
| Who may use it | A every signed-in user with credits (what the code does: there is no allow-list for this route); B add an owner-only window first (code change) | A, because the reservation and the clip cap the exposure; B only if the owner wants a private soak |
| O-8 recorded-answer transcription | A install the key and set `TRANSCRIBE_ENABLED=true`; B remove the mic | Resolved 2026-10-29: on for retained Explain-back voice notes only (docs/features/transcription-migration.md); independent of this feature |
