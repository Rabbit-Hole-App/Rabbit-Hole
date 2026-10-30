# Spoken-answer transcription: default-off flag and the gpt-transcribe migration

Written 2026-10-26. Route: `POST /api/learn/transcribe` in `packages/web/dev-worker.js` (the production Worker `rabbit-hole-app` reuses it); UI: the mic in
`packages/web/src/SpeakAnswer.jsx` (Explain back and similar blocks). **State: owner decision O-8 resolved 2026-10-29: transcription is approved for dev and
production for retained Explain-back voice notes only. `TRANSCRIBE_ENABLED` is `"true"` in the dev, parallel and production configs (rides the full gate and the
owner's release). Explain-back voice notes are transcribed at submission/assessment through `ensureTranscript` and the priced, capped
`transcribeSpendTransport` (`packages/control-plane/src/learn-media.js`, `learn-paid-transport.js`). This legacy route (Speak answer dictation into the field)
stays refused: it still admits through the fail-closed `paidSubmissionRefusal`. Live Voice Mode (FX-71) stays paused.**

## What is in the code (this branch)

| Piece | Rule | Where |
|---|---|---|
| Default-off flag | `TRANSCRIBE_ENABLED` exactly the string `true`, AND `OPENAI_API_KEY` present. Otherwise the same 503 `Speech to text is not configured on this environment.` as before, after the empty-recording 400 and board authorization, and before any cap check, usage record or upstream request. `"false"` in the dev, parallel and production configs | `dev-worker.js`, three `wrangler.*.jsonc`; commit 13147839 (stands alone; branch `feat/transcribe-default-off`) |
| Model choice | `TRANSCRIBE_MODEL` exactly `gpt-transcribe` selects the replacement; absent or any other value sends `gpt-4o-transcribe` exactly as today. The var is in no config | `dev-worker.js` |
| Price row | `gpt-transcribe`, `audio_minute`, US$0.0045 per minute, status **verified** (billed per minute of audio duration; no token rates are listed). `gpt-4o-transcribe` keeps its estimate row ($0.006 per minute estimated; the bill is per token). `PRICE_VERSION` is not bumped: nothing prices with the new row until `TRANSCRIBE_MODEL` is set; decide the bump at activation | `pricing-registry.js` |
| Estimate and credits | The server does not know the clip length; the route assumes one minute (it asks for a recording under a minute). `TRANSCRIBE_ESTIMATE` 6,000 micros (0.6 credit) with the old model; `TRANSCRIBE_NEXT_ESTIMATE` 4,500 micros (0.45 credit, 1 credit = US$0.01) with the new one. Recorded after the call as an `estimated` attempt, never settled spend | `learn-usage-estimates.js` |
| Tests | Flag off, key or no key: 503, nothing touched; flag on, no key: 503; flag on with key reaches the paid path; `TRANSCRIBE_MODEL` selects the model sent and recorded, unknown values keep the old model; the estimate and price row | `learn-spend-boundary.test.js`, `openai-key-install-effects.test.js`, `learn-usage.test.js`, `credits-2500.test.js` |

Unchanged and still true: no reservation before dispatch, the only guard is the platform daily cap (`paidSubmissionRefusal`), and the route takes no explicit paid confirmation
(learn-cleanup.md "paid-persist-4"). Not changed here: that is a product decision, not part of this migration.

## Provider facts (read 2026-10-26 on the official pages)

- Deprecations page: `gpt-4o-transcribe` (and `gpt-4o-mini-transcribe`) **shut down Feb 26, 2027**; replacement "`gpt-live-transcribe` or `gpt-transcribe`" (https://developers.openai.com/api/docs/deprecations).
- Pricing page: `gpt-transcribe` "$0.0045 / minute"; `gpt-4o-transcribe` $2.50 in and $10.00 out per million tokens, "$0.006 / minute" estimated (https://developers.openai.com/api/docs/pricing).
- Model page: `gpt-transcribe` supports `v1/audio/transcriptions`; default rate limits Build 5,000 RPM, Launch 10,000, Grow 30,000 (https://developers.openai.com/api/docs/models/gpt-transcribe).
- **Not confirmed by any page I could read:** that the multipart request (`file` as `answer.webm`, `model`) is accepted unchanged, that WebM is a supported input, the maximum file size, and what the response reports for usage. These are the acceptance run's job. (The pages were read through a summarizing fetch, not raw HTML.)

## Acceptance plan: one real recording (NOT run; paid; needs the integrator's say-so)

Budget: `node C:/s/spec/budget/budget.mjs status` on 2026-10-26 read cap US$100, spent US$17.9994, reserved US$0.25, remaining US$81.7506.
Cost: two clips of at most 3 minutes, one per model: 3 x 0.006 + 3 x 0.0045 = US$0.0315. Reserve **US$0.05** (`node C:/s/spec/budget/budget.mjs reserve <runId> fj-ctrlk 0.05`), settle with the real figure from the OpenAI usage page.

1. Owner records one 20 to 30 second WebM answer in the app mic on a dev clone (`rabbit-hole-web-dev-<worktree>`); secrets do not clone, so the owner installs `OPENAI_API_KEY` on that clone, and deploys it with `TRANSCRIBE_ENABLED` set to `true` (a deploy-time `--var`, never edited into a committed config).
2. Run A, `TRANSCRIBE_MODEL` unset: expect the words back and one `usage_attempts` row model `gpt-4o-transcribe`, `cost_state` estimated, 6,000 micros.
3. Run B, `TRANSCRIBE_MODEL=gpt-transcribe`, same clip: expect 200, the words back, a row model `gpt-transcribe`, 4,500 micros. Record whether OpenAI accepted `answer.webm` and what the response carries for usage.
4. Compare the billed amount on the OpenAI usage page with 0.0045 x the clip's seconds / 60. Pass: within rounding. This is the first measured price for the new model.
5. Redeploy with the flag back to `false`: the route answers the 503 text again (the existing check proves it; confirm once on the clone).
6. Delete the clone. Success: both runs transcribe correctly, estimates recorded as above, the billed figure matches the per-minute rate.
Rollback at any step: set `TRANSCRIBE_ENABLED` to `false`.

## Owner decision O-8: recorded-answer transcription (resolved 2026-10-29)

Decision: transcription is approved for dev and production, for retained Explain-back voice notes (plan
`docs/superpowers/plans/2026-10-30-explain-back.md` section 5). The transcript is separate data and is never inserted into the typed answer. Each call is
admitted before the call for the longer of two minutes and the stored clip's 16 kbps duration, at OpenAI's per-minute figure, and settled at the usage the
response reports (platform spend; the learner is not charged for Explain-back assessment). The legacy Speak answer dictation route below stays refused.
The options as they were weighed before the decision:

The mic in Speak answer exists in the shipped UI. Today it records, then shows "Speech to text is not configured on this environment." Installing the OpenAI key for image editing no longer changes that.

- **A. Keep the mic and turn it on** with `gpt-transcribe`: install `OPENAI_API_KEY` (shared with image editing), add `TRANSCRIBE_MODEL` = `gpt-transcribe`, run the one-recording acceptance above, then set `TRANSCRIBE_ENABLED` to `true` in a release. Cost about US$0.0045 a minute (about 0.45 credit for a one-minute answer, recorded as an estimate). The old model is not used, so the February 2027 shutdown is not a risk.
- **B. Remove the mic** from Speak answer until speech is a planned feature. No cost, no key, and no dead control.
- Recommendation: **A**, but only through `gpt-transcribe` and only after the acceptance run; the cost is small and the button is already shipped. If the owner prefers not to spend on speech now, choose B rather than leaving a mic that always errors.

## Owner secrets command (`C:/s/spec/image-activation/prod-image-secrets.mjs`)

Re-checked 2026-10-26: it puts exactly the secrets `OPENAI_API_KEY` and `GEMINI_API_KEY` (`SECRETS` in `prod-image-secrets-core.mjs`) and nothing else. `TRANSCRIBE_ENABLED` and `TRANSCRIBE_MODEL` are plain vars, not secrets, so no new secret NAME and no change to the script are needed;
its dry-run is still accurate. The only rule is ordering: **release commit 13147839 before running it**, otherwise installing the key switches transcription on. Its own activation-package.md already lists this option (item 1, option B).
