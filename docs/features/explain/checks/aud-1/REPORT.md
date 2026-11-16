# AUD-1: a spoken explanation (60 to 90 s) for an /explain card. No-spend part.

Read-only, no provider call; code at main 5f29c23a6; prices read 2026-11-16 from the cited pages; UNVERIFIED = not read from a page. Written from the research agent's report; spot-checked against the code: learn-voice-tts.js:8,14,24 and pricing-registry.js:111.

## Headlines
1. One TTS provider in the product: Fish Audio `s1`, one pinned narrator (reference_id 802e3bc2b27e49c2995d23ef70e6ac89). ElevenLabs is speech-to-text only; no code calls ElevenLabs, OpenAI, Gemini or Polly for TTS.
2. Fish `s1` is deprecated and retires 2026-12-31 (docs.fish.audio pricing page); then `s1` requests are served by `s2.1-pro` at the same $15/M bytes. The code pins `model: 's1'` in 3 places; the price registry has only a `fish|s1` row.
3. OpenAI tts-1, tts-1-hd and gpt-4o-mini-tts shut down 2027-01-06: excluded.
4. The card is much shorter than the script: prose budget 450 chars (hard 700, chat-depth.js:41) is about 30-45 s of speech; a 90 s script (about 215 words, about 1,150 chars; the owner's 1,400 chars is about 110 s) is a new explanation, not a read-aloud.
5. Existing routes cap below a 90 s script: /api/learn/voice/tts 1,200 chars (learn-voice-tts.js:14; client 600), whiteboard beats 600 (whiteboard-policy.js:24), only /api/learn/tts allows 4,000 (web/dev-worker.js:287). Voice and whiteboard abort at 20 s (learn-voice-tts.js:8, whiteboard-tts.js:11); measured generation is 0.76 to 0.98 s per audio second, so a non-streamed 90 s clip could take 60 to 90 s.
6. Money is not the decision: the script call is about $0.001-0.003, TTS arms $0.014-0.112 per card. The decision is quality, voice continuity and the s1 retirement.

## Existing speech synthesis (key names only)
- Voice Tutor speaking, POST /api/learn/voice/tts: Fish s1, mp3 64 kbps, latency balanced, speed 0.92; $15/M UTF-8 bytes (pricing-registry.js:111), fishSpendTransport (learn-paid-transport.js:33-54); key FISH_AUDIO_API_KEY present.
- Narration card "Read it aloud", POST /api/learn/tts: Fish s1, mp3 128 kbps, under 4,000 chars, paid confirmation (dev-worker.js:289-298; LearningBlocks.jsx:1394-1425).
- /whiteboard narration: Fish s1 per beat, duration from MP3 frames (whiteboard-mp3.js), stored in LEARN_MEDIA (whiteboard-job.js:70-75); beat at most 600 chars, video at most 4,000 chars, 8 MiB per beat.
- learn-render lectures (offline CLI): Fish speech-1.5; the script reads FISH_AUDIO_KEY (absent; the file has FISH_AUDIO_API_KEY).
- STT only: ElevenLabs Scribe v2 realtime (paused: voice-availability.js:36); OpenAI gpt-transcribe (explain-back). HeyGen video (parked). No browser speechSynthesis, Polly, Google, Cartesia or Deepgram client.
- Recorded latency: Fish first byte about 210 ms (docs/features/tutor-architecture-v2.md:12). Whiteboard smoke runs: 10 s video 7.2 s audio (16 words, 134 wpm, 6.2 s wall), 30 s 21.7 s (144 wpm, 16.6 s), 60 s 42.0 s (144 wpm, 41.0 s). The pinned voice speaks about 144 wpm: 60 s is about 145 words / 760 chars, 90 s about 215 words / 1,150 chars.

## Script source
- Card author call: artifactFetch (learn-artifact.js:373) to generateArtifact (:172); production profile google-low (Gemini gemini-3.5-flash-lite, Fireworks gpt-oss-120b fallback). The card schema {title, visuals, body} has no narration field.
- The explain ledger forbids a second model call on the main path and more than about 500 extra input tokens (docs/features/explain/benchmarks/test-ledger.md:96): so no new field and no call inside generateArtifact. Hook: a new on-demand route beside artifactFetch (for example POST /api/learn/artifact/narration) that takes the saved card and returns {script} through the same spendTransport/stepCall machinery; the audio call follows in the same background request. Card latency is unchanged (p50 3.62 s).
- Script call cost (assumed about 1,500 input and 1,100 output tokens; not measured): Gemini about $0.0032, Fireworks about $0.0009; expect 5-8 s, off the critical path.

## Audio storage and access
- LEARN_MEDIA = R2 bucket rabbit-hole-prod-learn-media (learn-storage.js:11). Recommended: store the mp3 as a file_sources row of family `audio` (already shipped: file-capabilities.js:39, 25 MB cap, audio/mpeg allowed, learn-files.js:22) and put block.narration = {status, fileRef, seconds, script, provider, model, voiceId} next to figures; a 90 s mp3 is about 0.7 MB at 64 kbps; playback via GET /api/learn/files/<id> (Range supported, private, no-cache; a browser check must confirm an audio element plays it).
- The explain-archive record is written before audio exists (learn-artifact.js:436): use a sibling explain-archive/<day>/<id>.narration.json, or save block.narration with the card.
- Access: no public bucket URL; authorizeFileSource (file-access.js:25-38) admits the owner, a share token or a referencing board; a signed-out viewer gets 404; paid routes need the learner's confirmation and the subscription-owner check; a new paid call needs a priced transport and a pricing-registry row.

## Candidates (cost per 1,400 chars / per 1,150 chars)
| provider | status | price | 1,400 | 1,150 | notes |
|---|---|---|---|---|---|
| Fish s1 (current) | integrated, key present | $15/M UTF-8 bytes; retires 2026-12-31 | $0.0210 | $0.0173 | first byte about 210 ms; concurrency 5 on Starter |
| Fish s2.1-pro | same key, no registry row | $15/M bytes | $0.0210 | $0.0173 | the s1 successor |
| Fish drama-3 | no | $50/M bytes (promo $10/M until 2026-11-30) | $0.070 | $0.0575 | |
| ElevenLabs Flash | key only, no TTS client | $0.04 per 1K chars | $0.056 | $0.046 | max length unverified |
| ElevenLabs v2/v3 | same | $0.08 per 1K chars | $0.112 | $0.092 | |
| Gemini 3.8 Flash TTS | key only | audio $9/M tokens to 2026-12-31 then $18/M | $0.0205 (2027 $0.041) | $0.0182 | WAV/PCM, no mp3; no latency figure |
| Gemini 3.8 Flash-Lite TTS | same | $6/M then $12/M | $0.0137 | $0.0121 | |
| Amazon Polly | no client; AWS keys present (retired BYOC) | Neural $16/M, Generative $30/M | $0.0224 / $0.042 | | needs SigV4 |
| Google Cloud TTS | no | page did not load; UNVERIFIED | | | |
| OpenAI TTS, HeyGen | excluded | | | | shutdown 2027-01-06 / video only |

## Recommendation and measurement plan (not run)
Default: Fish on the already-pinned narrator, tested as s2.1-pro with s1 as the baseline (integrated end to end, cheapest mp3-native arm, the only provider with recorded product latency, the same voice as Tutor and whiteboard). One confirmation is needed: the narrator voice and settings must sound right on s2.1-pro, because s1 stops 2026-12-31. Gemini Flash TTS is the cost-competitive challenger (price doubles in 2027, WAV output, no recorded latency); ElevenLabs Flash is the quality reference at 2.7 times the cost.

Plan: one fixed 1,400-character English script, 4 arms x 3 runs = 12 serial whole-clip calls: Fish s1 (narrator, row-1 settings), Fish s2.1-pro (same), ElevenLabs eleven_flash_v2_5 (one stock voice, mp3_44100_64), Gemini gemini-3.8-flash-tts (voice Kore, WAV 24 kHz). Record per call: status, time to first byte, total time, audio seconds, bytes, chars per second, wpm, billed units, USD, the saved audio for blind listening, and whether the 20 s product timeout would cut it. An arm that fails its first 2 runs stops; no retry loop; stop at the cap. Calls run from a script (bypassing the in-app ledger; logged in the evidence file only); keys by name, never printed.

SPEND OK NEEDED: Fish s1 + Fish s2.1-pro + ElevenLabs eleven_flash_v2_5 + Gemini gemini-3.8-flash-tts, 3 runs each (12 TTS calls, one fixed 1,400-character script), estimated total about $0.36 USD, hard cap $1.00 USD.

## Not checked
Whether s2.1-pro accepts the narrator reference_id and the speed/temperature settings like s1; Fish per-request text limit; real ElevenLabs and Gemini latency and maximum input; Polly per-request limit; Google Cloud TTS prices; whether the board save accepts an unknown block.narration field (a build must confirm save and reload).


---

# MEASURED RESULTS (owner OK 2026-11-16 12:05 PT; 12 calls planned, cap USD 1.00)

Fixed script: script.txt, 1,382 characters, 254 words (more words than the 215 estimated; the characters match). 3 serial whole-clip runs per arm, body streamed so time-to-first-byte is the first chunk. All MP3 are 44.1 kHz, 64 kbps; audio seconds from MP3 frame parsing (whiteboard-mp3.js). The last column is whether the product's 20 s timeout (learn-voice-tts.js:8) would have cut the clip (total time over 20,000 ms).

| arm | run | HTTP | TTFB ms | total ms | audio s | wpm | USD | cut at 20 s |
|---|---|---|---|---|---|---|---|---|
| Fish s1 | 1 | 200 | 1521 | 20987 | 83.88 | 182 | 0.02073 | YES |
| Fish s1 | 2 | 200 | 394 | 19483 | 81.35 | 187 | 0.02073 | no |
| Fish s1 | 3 | 200 | 389 | 19025 | 80.04 | 190 | 0.02073 | no |
| Fish s2.1-pro | 1 | 200 | 280 | 32098 | 81.11 | 188 | 0.02073 | YES |
| Fish s2.1-pro | 2 | 200 | 332 | 34063 | 82.63 | 184 | 0.02073 | YES |
| Fish s2.1-pro | 3 | 200 | 410 | 32142 | 81.24 | 188 | 0.02073 | YES |
| ElevenLabs flash v2.5 | 1 | 200 | 480 | 2014 | 90.12 | 169 | 0.05528 | no |
| ElevenLabs flash v2.5 | 2 | 200 | 315 | 1688 | 88.87 | 172 | 0.05528 | no |
| ElevenLabs flash v2.5 | 3 | 200 | 308 | 1735 | 88.22 | 173 | 0.05528 | no |
| Gemini 3.8 flash tts | 1 | 429 | 408 | 409 | none | none | 0 | no |
| Gemini 3.8 flash tts | 2 | 429 | 210 | 210 | none | none | 0 | no |

Medians: Fish s1 TTFB 394 ms, total 19.5 s, 81.3 s of audio, USD 0.0207 per clip, 1 of 3 runs over 20 s. Fish s2.1-pro TTFB 332 ms, total 32.1 s, 81.2 s of audio, USD 0.0207, 3 of 3 over 20 s. ElevenLabs flash TTFB 315 ms, total 1.7 s, 88.9 s of audio, USD 0.0553, 0 of 3 over 20 s. Estimated spend USD 0.29022 (Fish s1 0.06219, Fish s2.1-pro 0.06219, ElevenLabs 0.16584, Gemini 0), at the report's prices, not provider invoices; 9 billed calls, 2 refused Gemini calls, 2 free GET list calls.

## Does s2.1-pro take the narrator voice id?
Yes in the sense that matters for the product's request: with the product's exact body and reference_id 802e3bc2b27e49c2995d23ef70e6ac89 it returned HTTP 200 with audio on all 3 runs (no 4xx, so no fallback runs). Whether it is the SAME VOICE is not established: bytes and duration only (s1 640-671 KB and 80.0-83.9 s; s2.1-pro 649-661 KB and 81.1-82.6 s) show that the speed setting 0.92 was honoured, nothing about voice identity. Someone has to listen: samples/fish-s1-run1..3.mp3 against samples/fish-s21-run1..3.mp3.

## Findings that change the plan
1. Fish generates at roughly real time for a long clip: first byte is fast (about 0.3-0.4 s) but an 80-84 s clip takes 19-21 s on s1 and 32-34 s on s2.1-pro. The product's 20 s timeout covers the streamed body, so it would cut 1 of 3 s1 runs and all 3 s2.1-pro runs; and the existing voice route caps text at 1,200 characters. A Fish narration of this length has to be a background job (a "preparing audio" state, a saved file, no 20 s request), or be streamed to the player while it is generated.
2. ElevenLabs flash finished the whole 89 s clip in 1.7-2.0 s: near instant. It costs about 2.7 times Fish (USD 0.055 against 0.021 per clip). Voice used: Matilda (id XrExE9yKIg1WjnnlVkGX, premade, American, educational) picked from GET /v1/voices.
3. The pinned Fish voice read this script at about 185 wpm (not 144): 254 words became 80-84 s of audio.
4. Gemini 3.8 flash tts: the model id exists and supports generateContent; the Interactions API (POST /v1beta/interactions, voice Kore) returned HTTP 429 twice: "Your project has exceeded its monthly spending cap" (Google AI Studio project spend cap). The arm stopped after 2 failures per the stop rule; there is no Gemini data. The same cap refused the FLAG-1 Gemini check: it needs the owner to raise the Google spend cap. It may also affect production /explain if the production Worker uses the same Gemini project (unknown).

## Updated recommendation
- Instant start matters (the learner presses play and hears the explanation): ElevenLabs Flash, USD 0.055 per card, but it is a second voice vendor (a new Worker secret use, a new priced transport, a registry row).
- Cost and voice continuity matter more: Fish on the pinned narrator, as a background job, saved to the file store, with the card showing "preparing audio". On s2.1-pro the clip takes 32-34 s to generate, so the 20 s request limit cannot apply to it; s1 retires 2026-12-31 in any case.
- Decide the voice by ear first (s1 against s2.1-pro samples, plus Matilda), then the vendor.

Files: script.txt, results.json, results.md, rows.jsonl, el-voices.json, el-voice.json, samples/ (9 mp3), run.mjs, lib.mjs, list.mjs, summarize.mjs. No key was printed or written.
