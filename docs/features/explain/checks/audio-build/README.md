# Card audio build (feat/audio-build)

Branch `feat/audio-build` on `rabbit-hole`, worktree `C:/s/audio-build`, based on `owner/local` 8c07c57b1. Tip 5be5d3402.

| Item | Commit | Diff |
|---|---|---|
| Paid-call plumbing: ElevenLabs price row, `elevenSpendTransport`, usage features `explanation_script` (free) and `explanation_audio` (charged), usage label | 77c4b74b2 | hunk.diffs/1-plumbing.diff |
| Script route + prompt + number check, voice route, caps, dev-worker route, server tests, check-map rows | 1916cbb01 | hunk.diffs/2-server-routes.diff |
| Web: trigger on a new card, Play pill states, retry per step, host `narrate`, web tests | 522f389f7 | hunk.diffs/3-web.diff |
| Docs: `docs/features/explain.md` "Card audio" | 5be5d3402 | hunk.diffs/4-docs.diff |

## Routes (control plane, served by `packages/web/dev-worker.js:387`, so also `app-worker.js`)
- `POST /api/learn/explanation-audio/script`: `packages/control-plane/src/explanation-audio.js:158` (`scriptRoute`), model call `writeScript` :56, prompt `explanation-audio-script.js` `scriptSystem`.
- `POST /api/learn/explanation-audio/voice`: `explanation-audio.js:183` (`voiceRoute`), ElevenLabs + file source `makeVoice` :107, entry `explanationAudioRoute` :131.
- Paid transport: `learn-paid-transport.js:59` `elevenSpendTransport`. Price row: `pricing-registry.js:115` `elevenlabs | eleven_flash_v2_5 | input_chars` (0.04 USD per 1,000 chars, ESTIMATE status).
- Usage features: `learn-usage.js` `explanation_script` (in FREE_FEATURES) and `explanation_audio`; ROUTES map both paths. Caps: `AUDIO_LIMITS` (script 60/h 200/d, audio 30/h 100/d).

## `block.narration` (the shape ExplanationAudio.jsx consumes)
`{ status, fileRef, seconds, script, transcript, provider, model, voiceId }` plus `scriptBy` and, on error, `failed` / `code` / `reason`.
Statuses: `script` (script made, no audio), `preparing` (existing spinner, never saved; the Play button shows it while busy), `ready`, `error` (`failed: 'script' | 'audio'`). An old `failed` still draws nothing. The brief said `error`; the doc comment in the pill said `failed`, so both are tolerated.

## Prompt diff vs v1.1 (`prompt-diff-vs-v1.1.txt`; shipped text in `prompt-shipped-*.txt`)
1. Numbers: v1.1's "only numbers in the card, or trivially simple whole numbers ... nothing harder than adding or doubling" is replaced by the owner's rule in its own NUMBERS block: only numbers that appear in the card text or labels, exactly as written; never compute (sums, products, roots, percentages, rounding, conversions); describe in words if a number is missing. This also ends why.md's "known wart" (the numbers rule and the reuse rule pulled opposite ways): the reuse rule now only forbids replaying the card's own worked example, not citing its numbers.
2. Output is `{"script","transcript"}`: the transcript is the same sentences in the same order with every spoken equation or number as LaTeX in `$..$` (what the window shows). The sentence-for-sentence alignment is what lets the check remove a sentence from both.
3. Length: Detailed is "up to about 2 minutes, 300 to 360 words" (v1.1 said 100 to 130 s, 300 to 390 words); the depth line shows only the card's own depth and the model is told which it is. Gemini gets the V6 block (higher words plus a content checklist; Detailed 320 to 380), Fireworks the plain v1.1 block.
4. Dropped v1.1's worked phrase "one minus one over n, all raised to the power n" from the spoken-math examples: it is the bootstrap card's own example and steers other cards toward it.
5. Kept from v1.1: the add-on framing, the reuse rule, the opening ban ("The hardest part"), mirror-the-card style, ear-first rules, no recap.
6. Outside the prompt (v1.1 section D, now code): symbol characters in the spoken script remove their sentence; plus the number check below.

## Number safety (no model, no retry)
Every number a sentence speaks (digits, and spelled-out words: "zero point three six eight" is 0.368, "twenty five" 25) must be a number of the card: its prose, the learner's question, every string and number inside its diagrams, in digits or in words. A sentence with another number is removed from script and transcript together (paired by position when the sentence counts match). A lone "one" is not a number (pronoun). Script under 40 words after the check is an error (`too_short`). Unit-tested, including spelled-out card numbers, decimals, "constructor"-type words, pairing and the unequal-count path.

Offline on AUD-2's real model outputs (`offline-strip.mjs`, `offline-strip.json`, no new call): Gemini V6 loses at least one sentence in 4 of 9 scripts (mean 1.2 of 12.4 sentences, 220 to 195 words); Gemini V5 4 of 9 (0.7 of 9.7, 182 to 165 words); Fireworks V5 7 of 9 (2.4 of 14.2, 290 to 245 words). Softmax Detailed lost 6 of 14 sentences (251 to 152 words).

## Live check (ONE script call, ONE voice call; local script `live-check.mjs`; shipped routes, in-memory D1 and R2, SMALL_ENV=test, keys by name, nothing on production)
Card: AUD-2 card 5 (bootstrap coverage, Balanced, with its diagram), question "why does a bootstrap sample contain only about 63% of the unique training rows?".
- Script: HTTP 200, 2.2 s, Gemini 3.5 Flash Lite (no fallback needed), 79 words kept (432 characters, estimate 26 s), transcript identical to the script (the model said no equation, so no LaTeX), 0 numbers outside the card, 0 symbols. The server log says 4 sentences were removed by the number check. `live-script.json` has the text. I did not keep the raw model answer, so I cannot say how long it was before the removal; a second call would break the one-call rule.
- Voice: HTTP 200, 0.75 s, ElevenLabs Flash v2.5 Jessica speed 1.1, 175,167 bytes, 22 s, file source `ready`, `live-narration.json`, audio `live-voice.mp3`.
- Cost (registry rows, not an invoice): voice 432 chars x 0.04/1000 = USD 0.01728; script about USD 0.002 (about 1,800 input and 600 output tokens at 0.30 / 2.50 per million; the usage was not logged). Total about USD 0.02, far under the USD 1.00 cap.
- What it shows: the wiring works end to end against the real providers; the number check ran and removed sentences; and the result is far shorter than the Balanced target (22 s against about 90 s) and its analogy is weak (a coin whose chance of heads changes with every toss). One sample, but it matches AUD-2's finding that Gemini undershoots, now compounded by the removal. See the questions.

## Cost per card (from the registry rows and the AUD-2 lengths)
Script about USD 0.002 to 0.003 (platform-funded). Voice: 40 micros a character: 430 chars (22 s) USD 0.017; 1,200 chars (about 65 s) USD 0.048; 1,800 chars (about 100 s) USD 0.072. At 100 credits to the dollar: about 2, 5 and 7 credits to the learner (only if Play is pressed).

## Tests (run singly)
- control-plane `test/explanation-audio.test.js`: 23 pass (prompt per depth, owner numbers rule, splitCard, spoken numbers, stripping and pairing, spelled-out card numbers, script route ok/fallback/empty/stripped/no key/stored/in flight/validation/refused, voice ok/kept/in flight/failure answers/confirmation/viewer, guard records usage for both features and charge classes, refused admission, rate cap, feature mapping and dev-worker route).
- control-plane touched suites: learn-usage 31, learn-spend-boundary 35, learn-spend 5, explanation-summary 12, learn-allowance 27, usage-operations 3, telemetry-provider-spend 6, credits-only-ui 3 (it caught `$0.368` and "dollar sign" in my prompt text; the delimiter is now written by code), all pass.
- web `explanation-audio-client.test.mjs`: 11 pass (trigger once per new card and never for viewers or copies or a card with narration, never awaited, script/voice requests, retry per step, in-flight sharing, landing, canvas wiring by source read).
- web `explanation-audio.test.mjs`: 17 pass (14 existing unchanged plus 3 new: Play pill for script/error with a host, none without; first Play makes the voice, busy state, then the ready pill plays; failure notice, retry, no autoplay of a late ready).
- web always-run set: learn-slash 39, palette-guard 1, stray-hex 2, account-usage 16, no-ellipsis 1; also explanation-card-interactions 26, shared-canvas-parity 9 and -canvas 3, view-only-controls 3, transcript-window 10, audio-playing 9, transcript-reveal 14, canvas-shell 16, text-contrast 13, card-header 10, explanation-full-length 7, explanation-minimize-wiring 1.
- Not mine, not edited: `scripts/ci/check-map.test.mjs` has 2 failures on `owner/local` itself (TranscriptWindow.jsx, audio-playing.js, transcript-*.js, palette files unclassified; `session-display.js` rows). My new files are classified (rows added) and do not appear in them.
- Not run: any browser check, the web build, the full suites. The pill's real sound, layout and the autoplay-after-await behaviour in a real browser are unverified (the fake Audio accepts play()).
