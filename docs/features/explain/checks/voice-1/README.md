# VOICE-1: one narrator (ElevenLabs Jessica) on every spoken path

Branch `feat/voice-1` (worktree `C:/s/voice-1`), base `rabbit-hole/feat/audio-build-2` 215ef4279. Commits: f4b8fa985 (code, tests), 49f2c3f5f (docs). Pushed to `rabbit-hole feat/voice-1`.
`hunk.diff` here is `git diff 215ef4279..HEAD` (1,758 lines; the two commits).

## The one config

`packages/control-plane/src/narration-voice.js`: `NARRATION_VOICE` (frozen: elevenlabs, `eleven_flash_v2_5`, voice Jessica `cgSgspJ2msm6clMCkdW9`, speed 1.1, stability 0.4, similarity 0.75, `mp3_44100_64`, bitrate 64000), `VOICE_URL`, `VOICE_SETTINGS`, `narrationRequest`, `narrationMicros(chars)`, `speakNarration(env, text, { fetch, signal, category })`. `speakNarration` calls `elevenSpendTransport` (the spend guard) and then makes the one request. The request is exactly what the card audio made before (xi-api-key, `Accept: audio/mpeg`, `{ text, model_id, voice_settings }`).
Every path owns only its cap, timeout and response handling.

## Map of the four paths (real code, before -> after)

| Path | Entry (file:line) | Fish call before | Now | Cap | Abort | Response handling | Usage feature (route table, `learn-usage.js:38-61`) | Spend guard category |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Card audio | `explanation-audio.js:134` `makeVoice`, call at `:138`; route `/api/learn/explanation-audio/voice` | none (already ElevenLabs, with its own request) | `speakNarration` (shared) | script text; `VOICE_MAX_BYTES` 8 MB audio | 90 s (`VOICE_TIMEOUT_MS`, unchanged) | whole mp3 -> R2 file source of the owner; length = bytes at 64 kbps | `explanation_audio` (charged) | `explanation_audio` (unchanged) |
| Voice Tutor | `learn-voice-tts.js:22` `voiceSpeech`; route `/api/learn/voice/tts` via `learn-voice-routes.js:31` | `fishSpendTransport` to api.fish.audio, `reference_id 802e3bc2...`, mp3 64, speed 0.92 | `speakNarration` | 1 to 1200 chars (`:14`) | 20 s `AbortSignal.timeout` (`:9`, covers headers and body) | `upstream.body` returned as `audio/mpeg`, no-store; client plays through MediaSource or a Blob | `voice_tts` | `narration_tts` (was `fish_tts`) |
| Read it aloud | `dev-worker.js:288-299` inline `/api/learn/tts` (called by `LearningBlocks.jsx:1407` and `WhiteboardBlock.jsx:58`) | `fishSpendTransport`, same pinned narrator, mp3 128, no timeout | `speakNarration` | 1 to 4000 chars (`:290`) | none before and none now (kept; see decisions) | body returned as `audio/mpeg`; client does `response.blob()` -> object URL | `tts` | `narration_tts` |
| /whiteboard narration | `whiteboard-tts.js:14` `narrateBeat`, call at `:22`; job step `whiteboard-job.js:443` `paidNarration` | `fishSpendTransport`, pinned narrator, mp3 64, speed 0.92 | `speakNarration` | per beat (`beatChars`), `beatAudioBytes` 8 MB (`:33`) | 20 s per request (`TTS_TIMEOUT_MS` `:10`), one retry on 429 or a failure before acceptance | whole mp3 -> R2, duration measured from the frames | job usage under the generation key (feature `artifact`, category `whiteboard`) | `narration_tts` |

Client players need no change: all four receive a whole `audio/mpeg` body (an mp3 is an mp3; ElevenLabs sends the complete clip, no chunked stream is needed). The Tutor client's MediaSource path appends one large first chunk instead of many, which works; it was exercised only by fake bodies here (no browser run). Streaming was Fish-specific latency work (first byte 285 ms vs 2.7 s buffered at Fish's 19-32 s total); ElevenLabs Flash returned a whole 80 s clip in 1.7-2.0 s (AUD-1), so it is not needed.
Secrets: every path now reads `ELEVENLABS_API_KEY` only (already on `rabbit-hole-app`, `packages/web/wrangler.rabbit-hole-prod.jsonc` comment `:234`). `FISH_AUDIO_API_KEY` stays set but no code under `packages/control-plane/src` or `packages/web` reads it.

## What the Fish pins were, and where they went

| Pin | Where | Now |
| --- | --- | --- |
| `NARRATOR = '802e3bc2b27e49c2995d23ef70e6ac89'` (reference voice) + model header `s1` + url `api.fish.audio/v1/tts` + body (temperature 0.5, top_p 0.6, speed 0.92, mp3 64) | `learn-voice-tts.js` (Voice Tutor) | removed |
| same `NARRATOR`, `FISH_URL`, `fishBody` | `whiteboard-tts.js` | removed |
| same reference id inline, mp3 128 | `dev-worker.js` `/api/learn/tts` | removed |
| `fishSpendTransport` (guard category `fish_tts`, provider fish, model s1, byte pricing) | `learn-paid-transport.js` | removed; `elevenSpendTransport` takes a category |
| `fishMicros` / `utf8BytesPerChar: 4` reservation | `whiteboard-policy.js` | `narrationMicros(chars)`; `utf8BytesPerChar` removed |
| `priceUsage fish s1` per beat, role/count label `fish`, `paidFish` | `whiteboard-job.js` | `narrationMicros`, role/count `narration`, `paidNarration` |
| `FISH_AUDIO_API_KEY` reads | the three routes + whiteboard | `ELEVENLABS_API_KEY` |

Registry: `pricing-registry.js` `fish | s1 | input_bytes` row KEPT and marked RETIRED (comment and note), following the gpt-4o-transcribe precedent (deprecated rows stay so old usage records can be re-priced; `credits-2500.test.js` still asserts it). Delete it once old records age out.

### What stays Fish, and why
- `packages/learn-render/scripts/tts.mjs`, `render.config.json`, `README.md`, `motion/service` (reads `FISH_AUDIO_KEY`, `api.fish.audio`, `usdPerMillionBytes`): the offline Motion and lecture-video renderer, its own Fly service and env, not one of the four paths. Its default voice is `null` (no pin). Moving it is a separate ticket.
- `packages/web/e2e/provider-tripwire.js` still lists `api.fish.audio` (a host blocklist for tests: harmless, now stricter).
- `scripts/prod-release.mjs:31` still lists `FISH_AUDIO_API_KEY` as a REQUIRED production secret, and `wrangler.rabbit-hole-prod.jsonc:234` comments it. Left on purpose (release pipeline, owner decision below).
- Historical records (evidence, benchmark and cleanup JSON, tutor-architecture latency figures, avatar spec "Fish voice later comparison", whiteboard evidence READMEs).
- The six real mp3 fixtures made by Fish (`test/fixtures/whiteboard/audio`): test data, an mp3 is an mp3.
- `WHITEBOARD_VOICE = 'whiteboard-default-v1'` (a plan-schema label, not a voice pin).
- The client function was renamed `createFishTts` -> `createNarratorTts` (voice-tts.js, LearnVoice.jsx, two tests, one e2e).

## Cost per minute of audio (estimates; AUD-1 clip: 1,382 chars gave 81-90 s)

| | 81 s | 90 s | middle (85.5 s) |
| --- | --- | --- | --- |
| chars per second | 1382/81 = 17.06 | 1382/90 = 15.36 | 16.2 |
| chars per minute | 1,024 | 921 | 970 |
| ElevenLabs Flash, $0.04 per 1,000 chars | 1,024 x 0.04/1000 = $0.0409 | 921 x 0.04/1000 = $0.0369 | **$0.039 (about 4 credits)** |
| Fish s1, $15 per million UTF-8 bytes = $0.015 per 1,000 bytes (ASCII: 1 byte a char) | 1,024 x 0.015/1000 = $0.0154 | 921 x 0.015/1000 = $0.0138 | **$0.0145 (about 1.5 credits)** |

Ratio 0.04 / 0.015 = 2.67x per character. Whole AUD-1 clip: Flash $0.0553, Fish $0.0207. Same chars-per-second for both vendors is an assumption (the clip is ElevenLabs): Fish at speed 0.92 spoke slower, so its true per-minute cost is a little lower than shown (not measured). The ElevenLabs row is an ESTIMATE (list price; the bill is plan credits).
Per path ceilings now: Voice Tutor 1,200 chars = $0.048, typical 200 chars = $0.008; Read it aloud 4,000 chars = $0.16 (Fish $0.06); a 60 s whiteboard: narration estimate 4,000 chars = $0.16, maximum with re-narration 8,000 chars = $0.32 (Fish: $0.06 and $0.48 because it reserved 4 bytes a char). Whiteboard proposal credits for the 60 s fixture: estimate 134 -> 144, maximum 240 -> 224.

## Tests (all fake providers; nothing paid)

New `packages/control-plane/test/narration-voice.test.js` (6 tests): the frozen config and exact request; Voice Tutor through the shared config with the 1,200 cap and an AbortSignal; whiteboard `narrateBeat` through the shared config plus the abort at `timeoutMs`, one retry, then `tts_failed`; Read it aloud (the real inline dev-worker branch executed as written) with the 4,000 cap, the 428 gate and the 503; the card route has no request of its own; a static guard that fails on any Fish constant, any second voice id or any second `v1/text-to-speech` request in `control-plane/src`, `dev-worker.js` or `app-worker.js` (the repo's source-guard pattern).
Updated: `explanation-audio.test.js` (imports the shared constants; still 38 of 38), `learn-voice-tts.test.js`, `learn-spend-boundary.test.js` (35), `learn-allowance.test.js` (27), `learn-usage.test.js` (31; asserts the `narration_tts` guard row and provider `elevenlabs`), `learn-artifact.test.js` (23), `openai-key-install-effects.test.js` (8), `whiteboard-media.test.js` (7), `whiteboard-generation.test.js` (9), `whiteboard-policy.test.js` (5, new arithmetic), `whiteboard-job.test.js` (15), `credits-2500.test.js` (16).
Results: full control-plane `node --test` 4,985 tests, 4,976 pass, 8 fail, 1 skipped (`cp-full.log`). The 8: 5 in `rabbit-hole-prod-config.test.js` and 1 in `no-ellipsis.test.js` (explanation-audio-script.js:74 prompt string) fail identically on the base branch 215ef4279; 2 (`interact-curve-pins`, `interact-curve-templates`) failed only in the loaded full run and pass singly on both base and this branch (timing under load). `credits-2500.test.js` also failed on the base (it did not list the new `elevenlabs:estimate` registry row); fixed here.
Web (singly): voice-tts 17, voice-session 49, explanation-audio 18, explanation-audio-client 12, shared-canvas-parity 9, learn-slash 39, palette-guard 1, stray-hex 2, landing 28, signup-email-choices 6, e2e/*.test.mjs 18: all pass. `src/agent/slash.test.mjs` has 1 failure (slash flags) that fails identically on the base.
Not run: browsers, e2e checks (`voice-tts-stream-check.mjs` was edited for the rename only), builds, deploys.

## Samples (the lead runs; NOT run for real)

`C:/s/sprint2-evidence/voice-1/samples.mjs` with `sample-script.txt` (58 words, 315 chars; estimate $0.0126 per path, four paid ElevenLabs calls, about $0.05 total). Runs the real route code of all four paths locally (card: `explanationAudioRoute` VOICE_PATH with in-memory D1 and R2, as live-check2.mjs; Voice Tutor: `voiceSpeech`; Read it aloud: the inline dev-worker branch executed as written; whiteboard: `narrateBeat`), key by name from `small-deploy/.env` held in memory. Writes `voice-1-card.mp3`, `voice-1-tutor.mp3`, `voice-1-read-aloud.mp3`, `voice-1-whiteboard.mp3`, `summary.json` here. `SMALL_ENV=test` so no spend ledger is exercised. A copy of the script with a stubbed fetch (no key, no network) ran clean for all four paths before commit, to prove the plumbing.

## Decisions for the Reviewer or owner

1. Read it aloud has NO abort today (the Fish call never had one) and still has none; the ticket says keep existing behavior. Recommend adding 20 s (an 80 s clip takes about 2 s). One line, but it is a behavior change.
2. Privacy page copy (`packages/web/src/landing/support.js`): the Fish Audio line is removed and ElevenLabs now says it receives the text read aloud. This is user-visible legal text, and ElevenLabs's retention terms were not read (noted in `docs/features/rabbit-hole-support-pages.md`). Needs owner review and dev deploy review before release; no deploy was done.
3. `scripts/prod-release.mjs` still REQUIRES `FISH_AUDIO_API_KEY`; the secret may stay set (nothing reads it) but deleting it would fail the release check. Decide when to drop it from `required` and when to delete the secret.
4. Whiteboard reservation changed: estimate 134 -> 144 and maximum 240 -> 224 credits for the 60 s plan, same `WHITEBOARD_POLICY_VERSION` (1), as the price registry's PRICE_VERSION is not bumped for this row either. Jobs already proposed under the old policy keep their stored reservation. Say if you want a version bump.
5. Quality, speed and price are not equal: Read it aloud was mp3 128 kbps and is now mp3 64 kbps (the shared format); Voice Tutor and whiteboard pace moves from Fish speed 0.92 to 1.1. Flash costs 2.67x Fish per character.
6. The guard category `fish_tts` rows already in `usage_operations` stay as history; new rows are `narration_tts` (Tutor, Read it aloud, whiteboard) and `explanation_audio` (card).
