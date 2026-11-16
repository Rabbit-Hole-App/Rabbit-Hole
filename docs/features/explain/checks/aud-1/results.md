# AUD-1 TTS benchmark results

One script (script.txt): 1,382 chars, 1,382 UTF-8 bytes, 254 words. Calls run serially from a script, whole clip, body streamed. TTFB = first body chunk. Gemini ran unary (not streamed).

| arm | run | HTTP | TTFB ms | total ms | bytes | audio s | chars/s | wpm | billed | USD | 20 s cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fish-s1 | 1 | 200 | 1521 | 20987 | 671032 | 83.88 | 16.5 | 182 | 1382 UTF-8 bytes | 0.02073 | YES |
| fish-s1 | 2 | 200 | 394 | 19483 | 650761 | 81.35 | 17.0 | 187 | 1382 UTF-8 bytes | 0.02073 | no |
| fish-s1 | 3 | 200 | 389 | 19025 | 640312 | 80.04 | 17.3 | 190 | 1382 UTF-8 bytes | 0.02073 | no |
| fish-s21 | 1 | 200 | 280 | 32098 | 648880 | 81.11 | 17.0 | 188 | 1382 UTF-8 bytes | 0.02073 | YES |
| fish-s21 | 2 | 200 | 332 | 34063 | 661001 | 82.63 | 16.7 | 184 | 1382 UTF-8 bytes | 0.02073 | YES |
| fish-s21 | 3 | 200 | 410 | 32142 | 649925 | 81.24 | 17.0 | 188 | 1382 UTF-8 bytes | 0.02073 | YES |
| eleven-flash-v2_5 | 1 | 200 | 480 | 2014 | 721023 | 90.12 | 15.3 | 169 | 1382 chars | 0.05528 | no |
| eleven-flash-v2_5 | 2 | 200 | 315 | 1688 | 710992 | 88.87 | 15.6 | 172 | 1382 chars | 0.05528 | no |
| eleven-flash-v2_5 | 3 | 200 | 308 | 1735 | 705768 | 88.22 | 15.7 | 173 | 1382 chars | 0.05528 | no |
| gemini-3.8-flash-tts | 1 | 429 | 408 | 409 | 267 | - | - | - | - | 0 | no |
| gemini-3.8-flash-tts | 2 | 429 | 210 | 210 | 267 | - | - | - | - | 0 | no |

## Per arm (successful runs)

| arm | median TTFB ms | median total ms | audio s (median) | USD per clip | runs >20 s |
|---|---|---|---|---|---|
| fish-s1 | 394 | 19483 | 81.3 | 0.02073 | 1/3 |
| fish-s21 | 332 | 32142 | 81.2 | 0.02073 | 3/3 |
| eleven-flash-v2_5 | 315 | 1735 | 88.9 | 0.05528 | 0/3 |
| gemini-3.8-flash-tts | - | - | - | - | 0/0 |

## s2.1-pro and the narrator reference_id

Fish `s2.1-pro` ACCEPTED the narrator reference_id 802e3bc2b27e49c2995d23ef70e6ac89 with the product's exact body: HTTP 200 on all 3 runs, audio came back (MP3, 44.1 kHz, 64 kbps, 648-661 KB, 81.1 to 82.6 s). No 4xx, so no no-reference fallback was run (extra Fish runs used: 0).
Same narrator: NOT established. Comparison by ear is impossible here; bytes and duration only. s1 gave 80.0 to 83.9 s (640-671 KB), s2.1-pro 81.1 to 82.6 s (649-661 KB): same length range and same chars per second, which says the speed 0.92 prosody setting was honoured, nothing about voice identity. A blind listen to samples/fish-s1-run*.mp3 vs samples/fish-s21-run*.mp3 is needed.

## Findings worth knowing

- Fish s1 and s2.1-pro are slow to finish: the audio is generated at roughly real time (s1 19.0 to 21.0 s total for 80 to 84 s of audio; s2.1-pro 32.1 to 34.1 s). First byte is fast (280 to 1521 ms). The product's 20 s timeout covers streaming the body, so it would have cut s1 run 1 (20.99 s) and all 3 s2.1-pro runs; s1 runs 2 and 3 passed with under 1 s to spare. A 1,382-char clip does not fit the existing /api/learn/voice/tts path (also capped at 1,200 chars).
- ElevenLabs Flash v2.5 returned the whole clip in 1.7 to 2.0 s (about 50x faster than real time), 2.5x the price of Fish.
- Voice used for ElevenLabs: Matilda, id XrExE9yKIg1WjnnlVkGX (premade, from GET /v1/voices; labelled informative_educational, american). Not an owner-chosen voice.
- Fish speech rate ends up about 185 wpm, not the 144 wpm in the report (the script has long sentences and the report's number came from short smoke runs). ElevenLabs about 171 wpm. So the 1,382-char script is about 82 to 90 s, not 110 s.
- Script is 254 words (the brief said about 215); characters 1,382 matches the brief. Billed bytes use 1,382.

## Failures

Gemini `gemini-3.8-flash-tts`: model id exists in GET /v1beta/models (methods generateContent, countTokens, batchGenerateContent; also listed gemini-3.8-flash-lite-tts, gemini-3.1-flash-tts-preview, 2.5 preview TTS models). Request used the Interactions API per the speech-generation doc (POST /v1beta/interactions, response_format audio, speech_config voice Kore, unary). Runs 1 and 2 both returned HTTP 429: "Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap." Per the stop rule (2 failures) the arm stopped; no audio, no spend. This is the Google project's own spend cap, so it needs the owner to raise it at AI Studio before the Gemini arm can run. Not retried. Gemini TTFB/total unmeasured (the 429s answered in 210 to 408 ms, which is not a speech measure).

## Spend

Estimated actual: USD 0.29022 (Fish s1 3 x 0.02073 = 0.06219; Fish s2.1-pro 3 x 0.02073 = 0.06219; ElevenLabs 3 x 0.05528 = 0.16584; Gemini 0). Cap USD 1.00. 11 paid-endpoint calls made (9 billed, 2 Gemini refused with 429); plus 2 free GET list calls. USD figures are from the report's prices, not provider invoices; Fish and ElevenLabs bill on their own meters.

Per-arm method notes: MP3 durations come from frame parsing with whiteboard-mp3.js; ffmpeg not used. Gemini billing would have been audio seconds x 25 tokens x $9 per million (to 2026-12-31).
