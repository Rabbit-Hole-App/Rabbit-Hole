# Telemetry coverage inventory (Task 1)

Rechecked against `main` 73d184a8 (2026-10-23); the brief's audit was 7e403121. One row per feature and execution path. "Unknown"
is an explicit gap, never an assumed zero. Contract and storage: [telemetry.md](telemetry.md).

**Accounting wrappers** (all Credits-owned, in LEARN_DB):
- `spendTransport`: `learn-spend.js`. It admits a request with `admitSpend` (platform guard plus allowance), sends it, then
  settles with `settleSpend` and `settleAttempt`, and parses usage from the JSON reply or the SSE stream.
- `askJev`: `learn-grade-jev.js`. One admission per POST; the 429/529 retry is its own attempt.
- `fishSpendTransport`: `learn-paid-transport.js`. Reserves the byte-priced bound and settles at that bound.
- `admitTool`: `learn-paid-transport.js`, for Exa.
- `recordMedia`: `learn-usage.js`. A ledger-bypass record written after the call: `settled`, `estimated` or `unknown`, with no
  admission.
- Job admissions: the Motion hold (`learn-video.js`), the image-edit coordinator, CAD (through `spendTransport`), and Explain
  (one `spendTransport` per call).

**Telemetry today:**
- The `learn_model` Workers Logs line from `loggedModel`; streaming is repaired in this branch.
- `next_steps_telemetry` (0012) and `inline_ai_telemetry` (0018) in LEARN_DB.
- The Tutor eval archive (0017).
- Route-response decision telemetry: Tutor `prompt_version`, JEV rung.
- Workers Logs. Nothing reaches a telemetry database yet.

## Paths

| # | Feature / path | Entry point | Provider / service | IDs | Accounting wrapper | Usage source | Payer | Telemetry today | Gaps |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Onboarding / monthly credit renewal | `admissionPayer` (learn-usage.js), Credits' `usage_grants` (feat/credits-2500, not on main) | none (no provider call) | users.id, period | allowance read at admission | `AI_MONTHLY_ALLOWANCE_USD` (prod config: 50) | n/a | none | No grant or renewal event on main. Grant rows arrive with Credits 0027. There is no renewal job: a grant is written lazily on the first admission or read of the month. |
| 2 | Chat / Ask (canvas, sheet, repository) | `POST /api/learn/ask`, `/selection`, `/api/repositories/<repo>/ask` -> `apiAsk` -> `researchAnswer` | Anthropic Messages (stream), optional OpenAI-compatible or Bedrock org AI; arXiv and Wikipedia free | usage action (`act-*`), op_id = attempt_id, `X-RH-Action-Key` | `anthropic()` -> `spendTransport` per research step | SSE `message_start`/`message_delta` usage | user (`ask`, would_charge); public link: platform | `learn_model` per call (streams were missing before this branch) | Per-step attempt ids are not exposed to the logger (joined by action_id only). Tool steps (arXiv) are unbilled and untracked. |
| 3 | Shared-link Ask / embed | `/api/learn/boards/shared/<t>/ask` | Anthropic | action, op_id | `spendTransport` | as 2 | anonymous: platform (`anonymous_public`); signed-in viewer: viewer | as 2 | as 2 |
| 4 | Routing (chat capability, inline route) | `/api/learn/chat/route`, `/api/learn/inline/route` | TypeSafe JEV (direct or Vercel gateway) | action, op_id per POST | `askJev` | direct: `input_tokens` x price; gateway: `provider_metadata.gateway.cost` | the feature's payer (`inline_route` kind routing) | `inline_ai_telemetry` for inline; route response | Cost basis (reported versus computed) is not recorded. JEV calls emit no `model_call` events: the logger wraps Messages only. |
| 5 | Inline editing | `/api/learn/inline/generate`, `/decide`, `/evidence` | Anthropic via `planModel` (OpenAI when `LEARN_PLAN_MODEL`) | action | `spendTransport` | SSE or JSON usage | user | `inline_ai_telemetry` (stage timings, outcome) | Not wrapped by `loggedModel` (`learn-inline.js` calls `planModel` directly). Accept, reject, undo and stale results are only in `inline_ai_telemetry` metrics_json. |
| 6 | Clarification | inside chat and Tutor turns | as 2 / 8 | as parent | as parent | as parent | as parent | none of its own | Not distinguishable as a stage. |
| 7 | Home ask, Explore find | `/api/learn/home-ask`, `/api/learn/boards/published/find` | Anthropic (Sonnet 5.5, Haiku 4.5) | action | `loggedModel` -> `anthropic()` -> `spendTransport` | JSON usage | user | `learn_model` | An Explore cache hit (a per-isolate cache) makes no call and leaves no record. |
| 8 | Tutor planning | `/api/learn/tutor/plan` | Anthropic Opus 5.5 (fast-mode beta optional) | action, op_id, turn in route response | `spendCallModel` -> `spendTransport` | SSE or JSON | user (`tutor`) | `learn_model`; `prompt_version` in response | Decision reason codes are not persisted (Task 12). |
| 9 | Next Steps (owned, shared) | `/api/learn/tutor/next-steps`, `/boards/shared/<t>/next-steps` | Anthropic Sonnet 5.5, escalation Opus 5.5 | action; hook set row | `journeyLogged` -> `spendTransport` | JSON | owner or signed-in viewer | `learn_model`; `next_steps_telemetry` (tier, escalation, calls, cost, versions) | Generated sets are recorded; shown, selected, dismissed and completed are not. A cache hit writes no row, so exposure is unmeasured. |
| 10 | Assessment / grading | `/api/learn/assess`, `/api/learn/grade/*`, `/tutor/evaluate`, `/tutor/attempts/*/reassess` | JEV, then Anthropic Opus 5.5 evaluator | action, op_id | `askJev`, `spendCallModel` | as 4 / 2 | free_action: the user is recorded, the platform pays (`assess`, `grade`, `tutor_evaluate`) | `learn_model`; attempt store (0026) | AI score versus verified outcome is not separated in analytics. Rubric and visual assessment are flagged off in prod. |
| 11 | Escalation (Tutor larger rung, Next Steps) | `largerRung`, escalation planner | Anthropic Opus 5.5 | attempt kind `escalation` | `spendCallModel` | JSON | as parent | `learn_model` | none beyond 8 |
| 12 | Tutor handoff | `/api/learn/tutor/handoff` | Anthropic | action | `loggedModel` -> `spendTransport` | JSON | user | `learn_model` | none |
| 13 | Journey planners (resolver, diagnostic, path, section, adapt) | `/api/learn/journey/*` | Anthropic Sonnet and Opus 5.5 | action | `journeyLogged` -> `spendTransport` | JSON | user | `learn_model` | none |
| 14 | Slash cards (artifact), whiteboard (board) | `/api/learn/artifact`, `/api/learn/board` | Anthropic or OpenAI (`planModel`); Pexels, arXiv free | action | `loggedModel` -> `planModel` -> `spendTransport` | JSON (OpenAI usage normalized in `spendTransport`) | user | `learn_model` per call | OpenAI cached input is recorded as `cache_read_input_tokens: 0` (learn-spend.js), which loses `prompt_tokens_details.cached_tokens`: a Credits item. |
| 15 | Course authoring | `/api/apps/<slug>/learn-course` | Anthropic via `anthropic()` | action (`course`) | `spendTransport` | JSON | user | none | Not wrapped by `loggedModel` (learn-course.js:44). |
| 16 | Files and context extraction | `/api/learn/files*`, context docs, PDF excerpts | none for upload and text; image context goes to the parent model call | file ids | n/a | n/a | n/a | none | Upload, extraction and indexing stages are untimed (Task 14). |
| 17 | File conversion jobs | `/api/learn/files/<job>` -> FileJobs DO -> `CONVERT_URL` | converter service on Fly (dev only; `FILE_JOBS` is not bound in prod) | job id | none | none | platform | none | Converter compute is unattributed. Unknown machine time. |
| 18 | Links and webpage capture | `/api/learn/webpages*` | Cloudflare Browser Run (`env.BROWSER`), then JEV screening (text and images) | manifest id, action | JEV through `askJev`; browser time: none | JEV as 4; browser seconds not read | platform (`webpage_capture`, free) | none | Browser Run session time is billed and not recorded: unknown. |
| 19 | Repository import | `/api/repositories*` -> RepositoryImports DO -> `SCENE_WORKER_URL` (indexing) | lesson renderer on Fly | repo id, job | none | none | platform | none | Fly compute is unattributed: unknown. GitHub API calls are free. |
| 20 | Study attachments, notebooks / kernel | canvas-notebook Workers (`rabbit-hole-canvas-notebook`, `rabbit-hole-notebook`); the kernel runs in the learner's browser | Cloudflare Workers; CDN packages | notebook id | none | none | platform (Workers) | none | No kernel start, execution or failure telemetry (Task 14). Inline code runs (`/api/learn/code-runs`) use Dynamic Workers, which are not bound in prod. |
| 21 | Image generation (legacy) | `POST /api/learn/image` | OpenAI `gpt-image-1` | action | `paidSubmissionRefusal` + `recordMedia` estimate (no reservation) | estimate only (`imageEstimate`) | user | none | Off: `LEGACY_IMAGE_GENERATION` is set nowhere (the model was shut down 2026-10-23). |
| 22 | Image editing (ImageJobs) | `/api/learn/files/image-edits*` -> coordinator DO | OpenAI `gpt-image-2.5` image edits | operation id = attempt | `admitSpend` in the coordinator, `settleSpend` with `costUsd: null` | none read | user | none | **Tracked (decision 2):** measured versus estimated cost must survive into shared accounting. Today a settled edit is `unknown` and holds its reservation. Fix on `feat/image-jobs` after it lands. |
| 23 | Motion generation, review, repair, render, preview, poster | `/api/learn/video` -> LearnVideos DO -> `MOTION_ORCHESTRATOR_URL` (Fly), which calls Anthropic itself (`orchestrator-main.mjs:24`) | Anthropic (from Fly), Remotion renderer on Fly | job id, op_id (`motion` hold) | `admitSpend` hold (`MOTION_JOB_RESERVATION_USD` 8.96), settled from the orchestrator's reported cost | orchestrator summary | user | job diagnostics in the DO | **Tracked (decision 2):** Motion summaries turn missing call costs into 0. Per-call attempts, provider usage and pricing provenance are lost in the lifecycle. Fly machine time is unattributed. Fix on the Motion branch after it lands. |
| 24 | Maths clips (Manim), Fal video | LearnVideos DO -> `MATH_WORKER_URL`; `queue.fal.run` | Manim worker; Fal Seedance | ticket | `recordMedia` (uncertain or ticket) | none | user | none | Unknown cost (no estimate). Fal is unset in prod config. |
| 25 | 3D scenes | `/api/learn/scene` -> LearnScenes DO -> `SCENE_WORKER_URL` | Blender lesson renderer on Fly | scene key | render admission (`learn-render-admission.js`); feature `render` | none | platform (`render`, owner 5A) | none | Render compute is unknown (recorded as unknown, never 0). |
| 26 | CAD | `/api/learn/cad/*` -> CadJobs DO; executor `CAD_EXECUTOR_URL` (Fly) | Anthropic (`cad-model.js`); build123d executor on Fly | job id, op_id | `spendTransport` (CAD_MAX_USD 0.20, 2 calls); `CAD_PRODUCTION_MONTHLY_MODEL_USD` budget alert | SSE or JSON | user | `/internal/cad-job-diagnostic`, budget alert | Not wrapped by `loggedModel`. Executor machine time is unattributed. |
| 27 | Explain | `/api/learn/explain/*` -> ExplainJobs DO | Anthropic Opus 5.5 (brief, author, review, repair); Browser Run render (`explain-render.js`) | job id, prep and action keys, op_id per call | `spendTransport` per call; render via `recordMedia` (`explain_renderer`) | JSON | user | `learn_model` (explain-policy.js uses `loggedModel`) | Render browser time is unknown. A call sent before Stop settles, but its result is dropped (reservation kept). |
| 28 | Voice transcription (answer) | `POST /api/learn/transcribe` | OpenAI `gpt-4o-transcribe` | action | `paidSubmissionRefusal` + `recordMedia` estimate | `TRANSCRIBE_ESTIMATE` | user | none | No reservation before dispatch; only the estimate is recorded. |
| 29 | Voice Mode STT token | `POST /api/learn/voice/scribe-token` | ElevenLabs realtime Scribe (single-use token; billed per streamed second, client to ElevenLabs) | action | `paidSubmissionRefusal` + `recordMedia` (no estimate) | none | user | none | Unknown cost: usage happens browser to provider after the token, so no server record of duration. |
| 30 | Voice synthesis | `POST /api/learn/tts`, `/api/learn/voice/tts` | Fish Audio S1 | action, op_id | `fishSpendTransport` | computed: UTF-8 bytes x $15/M, settled at the bound | user | none | Cost basis is computed from price, not provider-reported; it is labelled `settled`. Playback and interruption are not tracked. |
| 31 | Search (Exa) | `/api/learn/search`, YouTube finder | Exa | action, op_id | `admitTool` / `recordMedia` | `exaCost(response)` (reported), else estimate | user | none | none beyond basis labelling |
| 32 | Avatar teacher | `learn-avatar-*` | HeyGen; Anthropic director | ticket | not wired (parked) | n/a | n/a | n/a | Off in every environment (`LEARN_AVATAR_PROVIDER` unset). |
| 33 | Moment index embeddings | Queue consumer (`learn-moment-index.js`) | Workers AI (`env.AI.run`) | moment id | none | none | platform | none | Not bound in prod config (no `ai` binding or consumer). If enabled: unaccounted neurons. |
| 34 | Comments, sharing, forks, canvas persistence | `/api/learn/c/*`, `/api/learn/boards/*`, canvases | none (D1, R2) | board and comment ids | n/a | n/a | platform (storage) | none | No events (Task 16). Storage share is unallocated. |
| 35 | Authentication | `rabbit-hole-cp` (`auth.js`, `index.js:56` Resend email) | Google and GitHub OAuth (free), Resend email | users.id | none | none | platform | Workers Logs | Resend sends are unaccounted (unknown per-email cost). Auth failure events need bindings on the control plane (Task 16). |
| 36 | Legacy control-plane AI (Agent panel `/api/ask`, org AI test, Watch cron, failure diagnosis `askOnce`, deploy review `review.js:100`) | `rabbit-hole-cp` / small-cp | Anthropic, OpenAI-compatible, Bedrock | none or system action | `spendTransport` (ask), `recordMedia` without admission (review.js) | JSON | system or org | none | No crons on Rabbit Hole workers, so the Watch cron does not run. review.js bypasses admission (its own ponytail note). `index.js:761` org-AI test call: coverage unknown. |
| 37 | Background jobs, reconciliation, retries | DO alarms, `askJev` retry, Explain repair, CAD repair | as each feature | attempt kind `retry`/`repair` | per call | per call | as parent | partial | No reconciliation job yet (Task 8 manual CSV import is increment 5). Stuck-job detection does not exist. |
| 38 | Evaluation runs and acceptance tests | e2e runners (`journey-corpus-run.mjs`, `tutor-corpus-run.mjs`), CI gate on dev | Anthropic on dev | none | the dev ledger (dev LEARN_DB) | as features | platform or test user on dev | receipts under `C:/s/spec/*/receipts` | Not separated from dev usage in LEARN_DB: no test or evaluation marker on `usage_actions`. Runner-side price tables duplicate `MODEL_PRICES` (learn-models.js ponytail). |
| 39 | Infrastructure and storage | Workers, D1 (`rabbit-hole-prod`, `-learn-prod`), R2 (`learn-media`, `repositories`), DO SQLite, Browser Run, Fly apps (cad, lesson renderer, motion orchestrator and renderer, converter), GitHub Actions | Cloudflare, Fly, GitHub | n/a | none | invoices only | platform | none | All of it is unallocated account-level cost. Fly billing API coverage is unverified (decision 6.8). CI runner minutes are only in receipts. |

## External billable call sites

| Call site | Provider | Covered by accounting | Covered by telemetry (this branch) |
|---|---|---|---|
| `control-plane/src/ask.js:344` | Anthropic Messages | yes, `spendTransport` | `learn_model` + `model_call.*` for every `loggedModel` caller; not course (15), inline (5) or CAD (26) |
| `control-plane/src/ask.js:274` | OpenAI chat (`planModel`) | yes | as above |
| `control-plane/src/ask.js:318`, `:324` | Bedrock, OpenAI-compatible (org AI) | yes (`unpriced` refuses) | as above |
| `control-plane/src/learn-grade-jev.js` (`JEV_TRANSPORTS`) | TypeSafe JEV direct or gateway | yes, `askJev` | no |
| `control-plane/src/inline-image-edit-provider.js:6` | OpenAI image edits | admitted; cost unknown at settle | no (tracked, decision 2) |
| `web/dev-worker.js:207` | OpenAI image generation | estimate only, no reservation | no (path off) |
| `web/dev-worker.js:287` | OpenAI transcription | estimate only, no reservation | no |
| `control-plane/src/learn-voice-scribe.js:11` | ElevenLabs Scribe token | record only, cost unknown | no |
| `web/dev-worker.js:263`, `control-plane/src/learn-voice-tts.js:22` | Fish Audio | yes, computed | no |
| `control-plane/src/learn-search.js:143`, `learn-youtube.js:99` | Exa | yes | no |
| `learn-render/motion/orchestrator-main.mjs:24` | Anthropic (from Fly) | job hold; per-call costs from the orchestrator | no (tracked, decision 2) |
| `control-plane/src/video-provider.js:33` | Fal | record only | no (unset in prod) |
| `control-plane/src/math-provider.js` | Manim worker | record only, unknown | no |
| `control-plane/src/learn-scene.js:18` | Blender renderer (Fly) | render admission, unknown cost | no |
| `control-plane/src/cad-jobs.js:328` | CAD executor (Fly) | none (compute) | no |
| `control-plane/src/file-jobs.js:75` | Converter (Fly) | none | no |
| `control-plane/src/webpage-capture.js:287`, `explain-render.js:184` | Browser Run | none (browser time) | no |
| `control-plane/src/learn-moment-index.js:96` | Workers AI | none | no (unbound in prod) |
| `control-plane/src/review.js:100` | Anthropic (deploy review) | record only, no admission | no |
| `control-plane/src/index.js:56` | Resend | none | no |
| `control-plane/src/index.js:761` | OpenAI-compatible (org AI) | unknown | no |
| `control-plane/src/learn-avatar-provider.js:65` | HeyGen | not wired | no (off) |
| `control-plane/src/fly.js` | Fly Machines and GraphQL (legacy hosted apps) | none | no (not in Rabbit Hole) |

## Rechecked audit findings

- `loggedModel` buffering a stream and dropping its log, and thrown transports unlogged: still present on 73d184a8, fixed in
  this branch (ccea13e0).
- OpenAI normalization setting cached input to 0 (`learn-spend.js` `finish`): still present on main and on Credits' working
  tree. Credits item.
- `settleSpend` not filling `usage_operations` token columns: still present (`input_tokens`, `output_tokens` and
  `cache_read_tokens` stay NULL). `settleAttempt` fills the input and output tokens on `usage_attempts` only. Credits item.
- Cache detail lost on settlement: only input and output tokens reach `usage_attempts`; Credits' `usage_attempt_detail.quantities`
  (uncommitted) addresses it.
- Feature diagnostics versus shared accounting: `next_steps_telemetry` carries its own cost figure computed with
  `costUsd()` (learn-models.js), separate from the ledger's settled amount. The dashboard must read the ledger, not the
  feature row.

## Tracked follow-ups (decision 2, not in this increment)

1. ImageJobs keeps measured versus estimated cost status into shared accounting (row 22).
2. Motion stops showing missing call costs as zero and keeps action and attempt ids, provider usage and pricing provenance
   through the job lifecycle (row 23).

Until then the dashboard labels image edits and Motion as incomplete or estimated. Neither changes what a user is charged
today, as far as this read shows: Motion settles from the orchestrator's reported total within the admitted hold, and an
image edit settles as unknown and keeps its hold. Whether either affects spend enforcement is for those lanes to confirm
(decision 2.5).
