# Image activation package (ledger task 125bbcae-8d5c-443b-89d7-bc774395c9d4)

Candidate branch `feat/image-activation` (pushed to `rabbit-hole`), SHA in status.md. Public activation candidate (NOT pushed, NOT to be run before the owner GO):
local branch `config/image-public-activation` in C:/Users/cyudhist/Desktop/workspace/image-activation (one commit on top of the candidate; config flag + 2 test lines).

## 0. Decisions the owner must make before the commands (recommendation first)
1. TRANSCRIPTION GOES LIVE WITH THE OPENAI KEY (independent of IMAGE_GENERATE_ENABLED). `POST /api/learn/transcribe` (dev-worker.js, shared by the production Worker) answers 503
   "not configured" today only because the key is absent. With the key it works for ANY signed-in canvas member (Learning-block "Explain back / Challenge" microphone, SpeakAnswer.jsx).
   How it is metered: the clip (max 20 MiB, never stored by us, sent to OpenAI gpt-4o-transcribe) is guarded only by the PLATFORM daily USD cap (`paidSubmissionRefusal`: refused when
   USAGE_PLATFORM_DAY_USD is reached); there is NO per-person allowance check, NO hold, NO per-person limit. After the call `recordMedia` writes one usage attempt with cost_state
   `estimated` of 60 s x US$0.006/min = US$0.006 (the real clip length is not known; `ponytail: not measured`). Estimated attempts are NOT counted in the learner's used credits
   (USED_SUM counts `settled` only), so it is free to the learner and visible only as an estimate. It has no acceptance of its own.
   Recommendation: A) accept it going live for now (bounded by the platform daily cap; about US$0.006 a call) and give it its own owner-run check (record 5 seconds in a challenge
   block signed in; expect the words back); or B) have me add a one-line `TRANSCRIBE_ENABLED` gate so installing the key does NOT switch it on until you say (small, keeps the
   key install image-only). I did not add B because it changes an existing feature without your decision.
   What else the OpenAI key switches on: nothing without another setting. `/api/learn/image` (legacy gpt-image-1) needs LEGACY_IMAGE_GENERATION (unset); inline image edit needs
   INLINE_IMAGE_EDIT_ENABLED and INLINE_IMAGE_EDIT_RESERVED_USD (unset); the planning model needs LEARN_PLAN_MODEL (unset; and SUBSCRIPTION_ONLY must not be 'true'). GEMINI_API_KEY has
   exactly one consumer: image-providers.js.
2. Hold of US$0.20 per image job (20 credits, released at settlement): a learner with fewer than 20 credits left is refused even for a 1-credit image (price-verification.md).
   Recommendation: accept for the first release; per-model holds are a code change.
3. Learner charge versus shown estimate for Nano Banana (up to about 2x, price-verification.md last section). Recommendation: accept now, tighten later.

## 1. Owner commands, in order (each is an owner command; I run none against production)
1. Gate + release of the candidate to production (integrator dispatches the gate; the owner runs the main push as usual). The release deploys the Worker with IMAGE_GENERATE_ENABLED "false",
   IMAGE_GENERATE_RESERVED_USD "0.20" and the two-entry IMAGE_ACCEPTANCE_EMAILS. Until the secrets exist nothing can call a provider (providerConfigured is false: jobs are released unbilled).
2. Secrets (names only; values never printed): `node C:/s/spec/image-activation/prod-image-secrets.mjs --dry-run`, then `node C:/s/spec/image-activation/prod-image-secrets.mjs`
   (type PUT IMAGE SECRETS). SUBSCRIPTION_OWNER_EMAIL is preserved (never read, written or deleted); the script lists names before and after and fails if it vanished. Each
   `secret put` creates a new version of the CURRENTLY deployed Worker code with that secret.
3. Owner access, by behaviour (no secret is read): signed in as yourself, open `https://digrabbithole.com/api/learn/image-jobs` in the browser. Expected JSON: `"available":true,"operatorOnly":true`
   and four models each `"configured":true`. If `available` is false, your session principal is not in the list; stop and tell me (the list holds
   user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid and yudhisteer.chin@gmail.com). Signed in as yudhisteer.chin01@gmail.com (or any other account) the same URL must say `"available":false`.
4. Tell me when you start. I then reserve the acceptance budget (section 4) and settle each run from its inspect JSON.
5. Click-through (section 2). Paste the inspect JSON of each job to me; I write the receipt.
6. After the receipt passes and you say GO: the public activation candidate (section 5), another gate and release (config keeps the gate).

## 2. Production acceptance click-through (owner-only window; every step is the real UI on the real Worker)
Use a throw-away canvas. Never press Send in a local composer for testing (standing rule); this is production.
A. Visibility: type `/` in the chat composer. /generate-image is listed (as the owner). In the other account it is not, and typing it says it is not available.
B. Plan: `/generate-image a small red lighthouse on a rock at dusk, flat illustration`. A plan card appears in the chat with Nano Banana 2.1, 1:1, 1K and a credit estimate (expect "about 4 credits").
   Reload the page: the plan card is still there (saved, with its message id).
C. Edit: Edit details, change the words, Save (the version increases). Change the model to GPT Image 2.5 Flare, quality Low: the estimate changes (1 credit). Choose quality Medium: Generate is
   disabled and the card says what was tested. Choose Flare Low 1:1 1K again.
D. Generate once; double-click it on purpose: exactly one job. Reload while "Making your image" shows: the card says "Checking your image" and the image arrives (no second press needed).
   The image card is on the canvas; reload again: still there, opens full size.
E. Open `https://digrabbithole.com/api/learn/image-jobs/img-<proposal id>/inspect` (the proposal id is in the plan; or ask me to derive it from the JSON): copy it. It must show stage ready,
   settlement done true, calls 1, retries 0, output sha256, costs {state, measuredUsd or estimatedUpperBoundUsd, reservedMaxUsd 0.2}.
F. Credits: Settings usage shows the credits for that image equal to the settled cost (1 credit = US$0.01, rounded up).
G. Repeat B to E for the five paid runs: flare generate low 1:1 1K; sunburst generate low 1:1 1K; Nano Banana 2.1 generate 1:1 1K; Nano Banana 2.1 edit (attach one image as a reference on the
   card, 1:1 1K); Nano Banana Pro generate 1:1 1K. (Sunburst edit is greyed: unpublished reference price; flare 16:9 2K and Nano Banana 16:9 1K are covered by local runs only.)
H. Failure injection (no provider call, no charge from a provider): in the browser console on the canvas page run `localStorage.setItem('rh-image-fault','provider_400')`, make a plan, press
   Generate; expected card text "The image could not be made. It may have been charged. It was not tried again." Inspect: stage failed, reason provider_rejected, settlement costUsd null.
   Repeat with `provider_429` (failed, provider_rejected, costUsd 0), `network` (stage unknown, "We could not confirm whether this image was made"), `invalid_output` (failed, invalid_output).
   Then `localStorage.removeItem('rh-image-fault')`. (Any other account that sets it gets a 400 and no job.)
I. Negative: the other account's direct call `POST /api/learn/image-jobs` (console fetch) answers 503 image_generation_disabled; its `/inspect` of your job answers 404.

## 3. What the production receipt will state (and what it will NOT cover)
Covers (only if the step passes): proposal editing and the signed quote, the confirmation (Generate), provider execution through the deployed Worker with the real secrets, storage in R2 and
the file source, reload recovery (card persisted, in-flight job followed, image persisted), duplicate submission (one job), customer-credit settlement (inspect + usage page), provider-cost
recording (inspect costs and usage), deterministic failures (the four injected faults), owner-only enforcement as observed from a second account.
Models and settings covered by a production run: those in step G, each at the exact settings listed. Everything else enabled (flare 16:9 2K, Nano Banana 16:9 1K) rests on the local provider runs.
NOT covered: Telemetry (not deployed in production), storage failure and restart/eviction recovery (unit-tested only), 2K and 4K for the Google models, OpenAI quality above low, OpenAI
editing, concurrent load, moderation of arbitrary prompts, the shared-gate state of other lanes.

## 4. Money for the acceptance (shared ledger, budget.mjs only; image cap US$0.80 total)
Spent by the earlier lane US$0.123142. Left 0.676858. Planned conservative maxima, reserved by the lane right before the click-through (run ids new): imgacc-1 flare 0.04, imgacc-2 sunburst 0.04,
imgacc-3 Nano Banana generate 0.08, imgacc-4 Nano Banana edit 0.08, imgacc-5 Pro 0.20 = 0.44 (expected actual about 0.28; observed upper bounds 0.0059, 0.0059, 0.0636, 0.05, 0.1462). After:
0.2369 of the allocation stays for one re-run. Injected faults cost 0. The Motion acceptance reserve (US$2.00) is not touched: shared remaining before this is 3.0287.
Rule: if a run's settled cost exceeds its reservation or an outcome is unknown, stop and check the provider dashboard before the next.

## 5. Public activation and rollback (prepared, not run)
Activation = candidate `config/image-public-activation` (one commit; `IMAGE_GENERATE_ENABLED: "true"` in wrangler.rabbit-hole-prod.jsonc; tests pin it). The web needs no change (the server decides per
caller). It needs a gate (config) and the owner's main push. Enabled set = the eight IMAGE_VALIDATED rows; sunburst edit and everything else stays greyed with its reason.
Rollback, fastest first: (a) set `IMAGE_GENERATE_ENABLED` "false" and redeploy: new submissions answer 503; queued jobs are cancelled and released unbilled at their next alarm; jobs past submission finish
storing and settling; status and retry-save keep working. (b) Also empty `IMAGE_ACCEPTANCE_EMAILS` to switch the owner path off. (c) Secrets stay installed (removing them stops providers; a job then releases
unbilled). Do not roll back across the image-jobs-1 Durable Object migration.
