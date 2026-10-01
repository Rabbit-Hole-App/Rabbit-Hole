# Voice Tutor MVP

Status: built on `feature/voice-tutor-mvp` (worktree `workspace/voice-tutor-mvp`, from main 5fac2ee2).
Not merged. Live provider calls wait for the owner's typed `GO VOICE LIVE`.

## What it is

The learner clicks the microphone in the Learn composer and enters **Voice Mode**. Voice Mode stays on
across turns until the learner clicks the red microphone again:

```
VOICE ON
  LISTENING   learner speaks; realtime STT runs hidden; nothing of it is shown
  THINKING    committed utterance -> the SAME Tutor turn as typed input (input_modality 'voice')
  SPEAKING    canvas actions already applied; Fish TTS speaks the Tutor's words; left caption shows them
  -> LISTENING again, automatically
VOICE OFF     normal composer
```

It feels like a professor beside the canvas, not dictation into a chatbot:

- The learner's words are never shown: no partial or committed transcript, no user bubble, nothing in
  the composer.
- The Tutor's spoken words appear only in a small left caption, never as a chat bubble.

## Where voice is available

Voice Mode exists wherever the Tutor is active (`useTutor().active`: the `nanogpt-attention-tutor` board
and its Rabbit Holes). There is no voice brain of its own. Without the Tutor there is no mic button.

- ponytail: canvases without the Tutor have no voice. Add it when the Tutor runs on every canvas.
- Voice Mode stays on until the learner clicks the red mic (owner, 2026-10-01). Going down or back up a
  Rabbit Hole remounts the Learn surface and ends its session, so the next surface turns Voice Mode back
  on by itself (a new mic stream and a new Scribe token).
- A Tutor dive suggestion made in a voice turn never carries the spoken words into the hole: its opening
  question is `Take me into <title>.`, because the dock sends the opening as a typed message.

## Contracts (the workstreams build to these)

### 1. Tutor input: `useTutor().ask` and the LearnerTurn (owner D)

- `tutor.ask({ raw, targetId, opening, signal, inputModality = 'text', turnId })`
  - Unchanged for typed calls.
  - Returns the display string, as today.
- `tutor.voiceTurn({ raw, targetId, signal, turnId })` resolves to `{ speech, turnId }`.
  - It runs the same `turn()` as `ask`, with `inputModality: 'voice'`.
  - `speech` is the Tutor's own words: `result.text`, meaning `respond_text` plus `ask_question`.
  - It is never one of the fallbacks 'See the canvas.' or 'Nothing to add here yet.'. When there are no
    words, `speech` is `''`.
  - Canvas actions run inside `turn()` before it resolves, exactly as for typed turns.
  - It rejects as `ask` does: AbortError on Stop, TimeoutError at 60 s.
- `runTurn({ ..., inputModality, turnId })`, then `buildTurn`:
  - The LearnerTurn gains `input_modality: 'text' | 'voice'`, default `'text'`.
  - `turn_id` is `turnId || crypto.randomUUID()`. Both `buildTurn` calls in a turn use the same id.
- Typed turns are byte-identical to today: same plan context, same enforced actions. A golden-trace test
  pins this.
- The planner context carries `input_modality` only for voice turns, and `PLANNER_SYSTEM` gets one line:
  when `turn.input_modality` is `'voice'`, `respond_text` is spoken aloud. It must be at most two short
  sentences of plain speech, with no markdown, code or equations read out. Show cards rather than narrate
  them. Always speak English.
- `/api/learn/tutor/evaluate` is untouched. Grading never sees the modality.
- The bench event gains `input_modality`. It still never carries learner text.

### 2. Voice session controller: `packages/web/src/voice-session.js` (owner D, pure, no DOM, no React)

```js
createVoiceSession({ stt, tts, tutor, telemetry, now }) -> {
  state,                       // 'off' | 'listening' | 'thinking' | 'speaking'
  caption,                     // { current: string, previous: string|null, error: string|null }
  enter(), exit(),             // the mic toggle
  interrupt(),                 // at any point of a turn (owner, 2026-10-01): thinking cancels the Tutor turn,
                               // speaking stops the audio now; either way it goes listening (Voice stays ON)
  subscribe(listener) -> unsubscribe
}
```

- `enter()`: emits `voice_mode_enter`, calls `stt.start()`, then goes `listening`.
  - On permission denied it stays `off` and sets `caption.error = 'Microphone access is required for Voice Mode.'`.
- On `stt` commit(text): ignored unless `listening`; empty or whitespace text is ignored.
  1. Mints a turnId and calls `stt.pause()`.
  2. Goes `thinking` and calls `tutor.voiceTurn({ raw: text, turnId })`.
  3. When it resolves, sets the caption to `speech`. Its previous value moves to `caption.previous`.
  4. If `speech` is non-empty, goes `speaking` and runs `tts.speak(speech, { turnId })`.
  5. When speech ends (ended, failed or interrupted), resumes STT, goes `listening`, and emits
     `voice_listening_resumed`.
- A Tutor failure:
  - shows a short caption error: "The Tutor could not answer. Try again." or the TimeoutError message;
  - never leaves the session stuck in `thinking`;
  - resumes listening.
- A TTS failure: the caption stays, canvas actions have already happened, and listening resumes.
- An STT failure: `caption.error = 'Voice input stopped. Click the mic to try again.'`. The state goes
  `off` and nothing is faked. The real adapter reports one only when reconnecting cannot help (§3).
- `exit()`: stops TTS, stops STT, aborts any turn in flight, emits `voice_mode_exit`, goes `off`.
- Never stores or emits learner text anywhere except the one `tutor.voiceTurn` call.

### 3. STT adapter: `packages/web/src/voice-stt.js` (owner B)

```js
createScribeStt({ fetchToken, onEvent }) -> { start(), pause(), resume(), stop() }
createFakeStt({ onEvent }) -> same, plus say(text) and fail(kind) for tests and scripted QA
onEvent({ type: 'speech_start' | 'partial' | 'commit' | 'error', text?, kind? })
```

- `fetchToken()`:
  - POSTs `/api/learn/voice/scribe-token` with `{ app, pending?, confirmed: true }`.
  - The server returns `{ token }`, a single-use token that lasts 15 minutes.
- The adapter connects to `wss://api.elevenlabs.io/v1/speech-to-text/realtime` with these query params:
  - `model_id=scribe_v2_realtime`
  - `token=…`
  - `audio_format=pcm_16000`
  - `language_code=en`: English only (owner, 2026-10-01). Auto-detect heard a short sentence as Spanish,
    and the Tutor answered in Spanish. The planner voice line also says to always speak English.
  - `commit_strategy=vad`
  - `vad_silence_threshold_secs=1.0`
  - `min_speech_duration_ms=100`
- Mic capture:
  - `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })`.
  - An AudioWorklet, from an inline Blob URL so there is no extra served file, downsamples to 16 kHz
    mono PCM16 LE.
  - It sends `{ message_type: 'input_audio_chunk', audio_base_64, commit: false, sample_rate: 16000 }`
    about every 100 ms.
- `speech_start` comes from a local energy threshold on the worklet frames, the first one after
  `start` or `resume`.
- Server messages:
  - `partial_transcript` becomes `partial`, internal only.
  - `committed_transcript` becomes `commit`.
  - A `{ message_type, error }` frame or a socket close while listening reconnects with a fresh token,
    so Voice Mode stays on. It becomes `error` only for `auth_error`, `quota_exceeded` or
    `unaccepted_terms`, or after 3 failed reconnects in a row (a partial or commit resets the count).
- `pause()` stops sending audio, but the mic track stays and the socket may stay open. While paused it
  ignores any commit.
- `resume()` sends audio again. If the socket closed while paused, it reconnects with a fresh token.
- `stop()` releases the mic track, the AudioContext and the socket.
- The transcript text never leaves the adapter except through `onEvent`.

### 4. TTS adapter: `packages/web/src/voice-tts.js` (owner C)

```js
createFishTts({ post, onEvent, makeAudio, MediaSource }) -> { speak(text, { turnId }) -> Promise<'ended'|'stopped'|'failed'>, stop() }
createFakeTts({ onEvent, ms }) -> same; resolves 'ended' after ms (scripted QA and tests)
speakable(text) -> string
onEvent({ type: 'tts_request_start' | 'tts_first_byte' | 'tts_play_start' | 'tts_play_end' | 'tts_stopped' | 'tts_error', turnId })
```

- `speakable(text)` strips what must not be read aloud:
  - code fences and inline code;
  - `$…$` and `$$…$$` math;
  - markdown syntax and URLs.
  - It collapses whitespace and caps the result at about 600 characters.
- `speak` POSTs `/api/learn/voice/tts` with `{ app, pending?, text, trace_id: turnId, confirmed: true }`.
  - It reads the streamed body: the first chunk is `tts_first_byte`.
  - Streaming playback (owner, 2026-10-01): where `MediaSource.isTypeSupported('audio/mpeg')`, the audio
    element plays a MediaSource. `play()` is called at once (iOS-family Safari loads media only on play())
    and the element starts sounding when the first chunk is buffered. Each chunk is appended to its
    SourceBuffer as it arrives, and `endOfStream()` follows the last one. Elsewhere the whole body is buffered
    into a Blob URL first, as before.
  - Measured locally with a real narrator MP3 at the live Fish pace (`e2e/voice-tts-stream-check.mjs`):
    request to first audio went from 2736 ms buffered to 285 ms streamed (5 runs each). After Stop the audio
    pauses within 0.6 ms, and the playhead stays frozen for 2.5 s while the server keeps streaming.
  - It resolves on `ended`.
- `stop()` pauses playback at once and detaches the element's source, so the player is released. It
  emits `tts_stopped`, aborts the request and resolves the pending `speak` with `'stopped'`. A stop
  before the MediaSource opens settles the wait too. The run is detached, so a chunk read after the stop is never appended or
  played, and a new turn never plays the previous turn's audio.
- `voice_turn` adds `text_ready_to_tts_request`, `tts_request_to_play_start`, `text_ready_to_play_start`
  and `stop_to_pause`. Text ready is when the Tutor's reply reached the session.
- Errors resolve `'failed'` and are never thrown.

### 5. Routes: `packages/control-plane/src/learn-voice-routes.js` (owner D), dispatched in `packages/web/dev-worker.js`

```js
voiceRoute(path, req, env, deps = {}) -> Response | null   // null for any other path
  POST /api/learn/voice/scribe-token -> scribeToken(env, deps)       (learn-voice-scribe.js, owner B)
  POST /api/learn/voice/tts          -> voiceSpeech(env, body, deps)  (learn-voice-tts.js, owner C)
```

Gate order, the same as `tutorRoute` and `contextDocsFetch`:

1. 405 unless the method is POST.
2. 403 on a foreign `Origin`.
3. JSON body.
4. `(deps.authorize || authorizedBoardApp)(req, env, body.app, body.pending || null)`.
5. `subscriptionOwnerRefusal`.
6. `paidRefusal(body)`, so `confirmed: true` is required. Turning Voice Mode on is the explicit
   consent; the client sends it.
7. 503 with a one-line message when the key is missing.
8. The provider call with an `AbortSignal.timeout`.
9. On provider failure, a 502 with a short message and no provider body.

The handlers:

- `scribeToken`:
  - POST `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe` with the `xi-api-key` header
    set to `ELEVENLABS_API_KEY`.
  - Returns only `{ token }`. The API key never appears in a response.
- `voiceSpeech`:
  - `text` must be a string of 1–1200 characters.
  - POST `https://api.fish.audio/v1/tts` with:
    - `Authorization: Bearer FISH_AUDIO_API_KEY`;
    - header `model: s1`;
    - JSON `{ text, reference_id: '802e3bc2b27e49c2995d23ef70e6ac89', format: 'mp3', mp3_bitrate: 64, latency: 'balanced', normalize: true, temperature: 0.5, top_p: 0.6, prosody: { speed: 0.92 } }`.
    - Lower sampling and a slightly slower pace keep the narrator calm and the same from reply to reply
      (owner, 2026-10-01).
  - That is the same pinned narrator as `/api/learn/tts`.
  - It streams the body back as `audio/mpeg` with no-store.
  - It logs one line, `{"event":"learn_voice","kind":"tts","turn_id","status","ms","chars"}`, with no text.
- The dispatch in dev-worker.js goes after the `/api/learn/transcribe` block, not between the ask block
  and `/api/learn/tts`, because `canvases.test.js` slices that range.
- Local secrets: `ELEVENLABS_API_KEY` and `FISH_AUDIO_API_KEY` go in `packages/web/.dev.vars`, which is
  gitignored.

### 6. UI (owner A)

- **`VoiceMode.jsx`** exports:
  - `VoiceToggle`: the mic button.
  - `VoiceField`: the composer field while voice is on.
  - `TutorCaption`: the left caption.
- **Text Mode:** a neutral mic button, styled with `COMPOSER_ADD`, at the end of the dock composer's
  `leading` row, with `aria-label="Voice mode"`. It is disabled while a typed answer is in flight, because
  Voice Mode replaces that answer's Stop button.
- **Voice Mode:**
  - `ChatComposer` gets a new optional prop `voice`. When it is set, it replaces the input field and the
    Send/Stop button. The composer frame stays, per the contract that the composer is never hidden.
  - `VoiceField` shows the red mic toggle, a state label, and the interrupt control:
    - The red mic is `#b42318` with a breathing ring, a 2 s ease-in-out scale and opacity cycle.
    - The label reads "Voice on · Listening", "Voice on · Thinking…" or "Voice on · Tutor speaking".
    - The label is `role="status"` and `aria-live="polite"`.
    - The interrupt control is shown while thinking ("Stop", aria-label "Stop the Tutor") and while
      speaking ("Stop speaking"), with a Square icon.
    - Below `md` the "Voice on · " prefix and the "Stop speaking" text are screen-reader only, so the
      state word stays visible at phone widths.
    - When the neutral mic or Stop speaking unmounts under keyboard focus, focus moves to the red mic.
  - Clicking the red mic always turns Voice Mode off.
  - Under reduced motion the ring is static and the label still carries the state.
- **The `+` and Auto controls** stay visible but disabled while voice is on.
- **`TutorCaption`:**
  - It is a small window (300 px wide, at most 180 px tall) at the lower left of the canvas surface, just
    above the zoom pill, anchored by a zero-width `leftRail` slot after the tools gutter. The owner chose
    this over the earlier full-height in-flow column (2026-10-01), so it floats over the canvas corner.
    On a phone it is an in-flow strip above the canvas.
  - It shows a "Tutor" label and only the reply being spoken now, with no history. While the Tutor is
    thinking, "Thinking…" replaces the last reply. When there is nothing to show, it renders nothing.
  - A failed turn shows its short error line instead of the last reply.
  - `tutor.extras` (the Rabbit Hole suggestion and chips) sit in a fixed footer under the reply. Only the
    reply text scrolls, so the suggestion's buttons stay in view, and they stay while the Tutor thinks.
  - A file dropped on the window is ignored rather than opened by the browser.
  - It can be hidden to one small button and shown again. One toggle node serves both states, so
    keyboard focus survives. A new suggestion opens a hidden window, because nothing else shows it while
    voice is on.
  - It never shows learner text.

### 6b. The handshake between UI (A) and integration (D)

- **`LearnVoice.jsx` (owner D)** exports
  `useVoiceSession({ tutor, app, access, targetId, onTargetUsed }) -> voice | null`.
  - `onTargetUsed` (LearnPage's `clearAskTarget`): the armed card rides one voice turn and is then
    cleared, as a typed turn clears it.
  - It returns `null` when `!tutor?.active`.
  - Otherwise `voice` is `{ state, caption: { current, previous, error }, enter, exit, interrupt }`.
  - It picks the adapters: fake STT and TTS when the URL has `?voice=fake`, Scribe and Fish otherwise.
  - In fake mode it exposes `window.__voiceFake = { say(text), failStt(), failTts(), ttsMs }` for e2e
    and the review.
- **`AskPanel` (ask.jsx, owner A)** gets a new optional prop `voice`, the object above or null.
  - In dock mode with `voice` set, it renders `<VoiceToggle voice={voice} />` at the end of `leading`.
  - When `voice.state !== 'off'`, it passes `voice={<VoiceField voice={voice} />}` to `ChatComposer`.
  - When `voice.caption.error` is set and the state is `off`, it shows the error as a one-line notice
    above the composer.
- **`AdaptiveCanvas` (owner A)** gets a new optional prop `leftRail`, a node. It renders between
  `[data-tool-gutter]` and `[data-canvas-surface]` inside a zero-width `[data-voice-rail]` anchor.
- **`TutorCaption` (owner A)** takes `{ caption, state, extras }`. `extras` is `tutor.extras`.
- **`LearnPage.jsx` (owner D)** wires it together:
  - `const voice = useVoiceSession({ tutor, app, access: askScope, targetId: askTarget?.id })`;
  - passes `voice={voice}` to the dock `AskPanel`;
  - passes `leftRail={voice && voice.state !== 'off' ? <TutorCaption caption={voice.caption} state={voice.state} extras={tutor.extras} /> : null}` to AdaptiveCanvas.
  - While voice is on, the dock's chat sheet does not show `tutor.extras`; the caption does.

### 7. Telemetry (owner D): `packages/web/src/voice-telemetry.js`

`voiceEvent(name, { turn_id, session_id, ...timings })`:

- dispatches `window` `CustomEvent('small:tutor-voice')`;
- adds `performance.mark('rh:voice:<name>')`;
- carries ids and timings only, never words.

`small:tutor-bench` is untouched, because the e2e harnesses read its last record.

**The trace id is the Tutor's `turn_id`.** It is minted at the utterance commit and sent to the Tutor
and to TTS (as `trace_id`). One voice turn therefore carries one id end to end.

Events:

- `voice_mode_enter`, `voice_mode_exit`
- `speech_start`, `stt_first_partial`, `speech_end`, `stt_commit`
- `tutor_request_start`, `evidence_ready`, `planner_ready`, `canvas_action_visible`
- `tts_request_start`, `tts_first_byte`, `tts_play_start`, `tts_play_end`
- `voice_listening_resumed`, `voice_error` (with `kind` only)

Derived per turn, emitted on `voice_listening_resumed` as `voice_turn` with `ms`:

- `speech_start_to_first_partial`
- `speech_end_to_commit`
- `speech_end_to_tutor_speaking`
- `speech_end_to_canvas_action`
- `tts_request_to_first_byte`
- `tts_play_duration`
- `speech_end_to_listening_resumed`

`speech_end` is the commit time minus the VAD silence window (1.0 s), because Scribe reports no
end-of-speech event. This is documented as an estimate.

## Scripted tests (no paid calls)

All of these use the fake STT, the fake TTS and a stubbed Tutor:

- `packages/web/src/voice-session.test.mjs`: the state machine. VOICE-02, 05, 07, 09–19 and 21–22 run
  the real controller.
- `packages/web/src/voice-ui.test.mjs`: VOICE-01, 03, 04, 06, 08 and 20. `VoiceMode.jsx` and
  `ChatComposer.jsx` are rendered with esbuild and react-dom/server; the `ask.jsx` and `AdaptiveCanvas.jsx`
  wiring is pinned in source. No transcript rendering path, the small lower-left caption with only the current reply, mic states.
- `packages/web/src/learn-tutor.test.mjs`: a voice turn's plan context and enforced actions equal the
  typed run's (VOICE-07); the turnId pass-through; bench `input_modality`; a spoken dive suggestion only
  suggests and its hole opens on the topic, never the spoken words (VOICE-14).
- `packages/web/src/voice-tts.test.mjs` and `voice-stt.test.mjs`: `speakable`, the fake adapters, and
  the Scribe frame encoding and parsing with a fake WebSocket.
- `packages/control-plane/test/learn-voice.test.js`: both routes, covering:
  - 405 and 403 (foreign origin);
  - 428 without `confirmed`;
  - 503 without a key;
  - the token response never containing the key;
  - the Fish request shape;
  - 502 masking the provider error;
  - `null` for foreign paths.
- `packages/web/e2e/voice-check.mjs`: the local stack, with the Tutor and voice routes stubbed through
  `page.route` and the fake STT/TTS switched on by `?voice=fake`. It drives all 22 VOICE flows in the
  browser and saves the review screenshots.

## Live test (after `GO VOICE LIVE` only)

Real mic → ElevenLabs Scribe → real Tutor → Fish TTS → speakers. The sequence:

1. normal question
2. clarification
3. show implementation
4. misconception
5. quiz
6. Rabbit Hole suggestion
7. multi-turn
8. manual interruption
9. Voice OFF

**Setup for the live run.**

1. Add these keys to `packages/web/.dev.vars` in this worktree. The file is gitignored; never print it.
   - `ELEVENLABS_API_KEY` and `FISH_AUDIO_API_KEY`, which are in `small-parallel/.env`.
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` and `TYPESAFE_API_KEY`, the Tutor's own keys.
2. Restart the app worker.
3. Open the Tutor board **without** `?voice=fake`. The owner speaks; a microphone is needed, so this
   cannot be scripted.
4. Collect the `small:tutor-voice` events from the console:
   `window.addEventListener('small:tutor-voice', e => console.log(e.detail))`.

**Expected usage and cost for the full sequence.** These are estimates.

| Item | Assumption | Estimated cost |
|---|---|---|
| ElevenLabs Scribe v2 Realtime | $0.39 per audio hour. The socket stays open while Voice is on, and audio is sent only while listening. About 15 minutes connected, at most 0.25 h. | About $0.10 or less |
| Fish Audio s1 | $15 per million UTF-8 bytes. About 25 Tutor utterances of about 200 characters each, about 5,000 bytes. | About $0.08 |
| Tutor model calls | The same calls as typed turns: about 25 Opus 5.5 planner calls plus JEV and the larger evaluator when uncertain. | Like a 25-turn typed Tutor session; this dominates |
| Scribe tokens | One single-use token per connect, plus one per reconnect. | Free |

The voice providers together come to well under $1. The Tutor's own model calls are the main cost, just
as for typed turns.

## Not in the MVP

- wake word
- always-on mic outside Voice Mode
- acoustic echo work beyond the browser's `echoCancellation`
- full-duplex barge-in
- voice cloning or voice choice
- card narration
- multilingual tuning
- a saved voice preference
- production deploy
