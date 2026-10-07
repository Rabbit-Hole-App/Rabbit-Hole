// Voice Mode's session controller (docs/features/voice-tutor-mvp.md §2). Pure: no DOM, no React.
//   off -> enter() -> listening -> commit -> thinking (the Tutor turn) -> speaking -> listening ...
// Voice stays on across turns until exit(). The learner's words go to tutor.voiceTurn and nowhere
// else: the state, the caption and every telemetry event carry ids, kinds and timings only.
// The adapters' onEvent are wired to sttEvent / ttsEvent (LearnVoice.jsx, the tests).

export const MIC_REQUIRED = 'Microphone access is required for Voice Mode.';
export const STT_STOPPED = 'Voice input stopped. Click the mic to try again.';
export const TUTOR_FAILED = 'The Tutor could not answer. Try again.';
export const TUTOR_TIMEOUT = 'The Tutor took too long to answer. Try again.'; // ask.jsx's TimeoutError message
// Scribe reports no end of speech: speech_end is the commit minus its VAD silence window (an estimate).
export const VAD_SILENCE_MS = 1000;

const PERMISSION = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);
const round = value => Math.round(value * 10) / 10;
const span = (from, to) => (from == null || to == null ? null : round(to - from));
// The learner talks over the Tutor (owner, 2026-10-01): the mic stays open while the Tutor speaks, and
// new words of the learner's take the floor. The Tutor's own voice leaking from the speakers past echo
// cancellation must not: it is made of the reply's words, so only the newest words of each partial are judged
// (Scribe partials grow through the whole segment), and they need two learner words that are not the Tutor's
// and not filler, or a stop word the Tutor is not saying.
const words = text => String(text || '').toLowerCase().match(/[a-z0-9']+/g) || [];
const STOP_WORDS = new Set(['stop', 'wait', 'hold', 'pause']);
const FILLER = new Set(['yeah', 'yes', 'okay', 'ok', 'uh', 'um', 'huh', 'mm', 'hmm', 'ah', 'oh', 'right', 'i', 'see', 'so']);
export function bargesIn(heard, spoken) {
  const said = words(heard), tutor = new Set(words(spoken));
  const last = said.at(-1);
  if (!last) return false;
  if (STOP_WORDS.has(last) && !tutor.has(last)) return true;
  const tail = said.slice(-4);
  // "soft max" for "softmax": a misheard split word still counts as the Tutor's.
  const own = (word, i) => tutor.has(word) || tutor.has(word + (tail[i + 1] ?? '')) || tutor.has((tail[i - 1] ?? '') + word);
  return tail.filter((word, i) => !own(word, i) && !FILLER.has(word)).length >= 2;
}
// The Tutor's own words, committed by Scribe just after it stops speaking: they repeat the end of the reply
// (one misheard word in five allowed), at least three words of it or all of a shorter reply - so a short
// answer that reuses the question's last words ("the fourth") still counts. A learner turn is never judged
// this way after an interruption.
const ECHO_TAIL_MS = 2500;
export function echoesEnd(heard, spoken) {
  const said = words(heard), reply = words(spoken);
  if (said.length < Math.min(3, reply.length) || said.length > reply.length) return false;
  const end = reply.slice(-said.length);
  return said.filter((word, i) => word !== end[i]).length <= Math.floor(said.length / 5);
}
// After a barge-in the commit can start with the Tutor's words heard before the learner's: drop a run of
// four or more at its start.
function withoutEcho(text, spoken) {
  const tokens = String(text).trim().split(/\s+/), tutor = new Set(words(spoken));
  let lead = 0;
  while (lead < tokens.length && words(tokens[lead]).every(word => tutor.has(word))) lead++;
  return lead >= 4 && lead < tokens.length ? tokens.slice(lead).join(' ') : text;
}

export function createVoiceSession({ stt, tts, tutor, telemetry = () => {}, now = () => (globalThis.performance ?? Date).now() }) {
  let state = 'off', caption = { current: '', previous: null, error: null };
  let sessionId = null, starting = false, epoch = 0;
  let heard = {};      // the utterance being listened to: speech_start, first partial
  let current = null;  // the turn in flight: { turnId, controller, marks }
  let lastSpoken = null; // { text, at }: the Tutor's last reply when it played to the end, for echoesEnd
  let pendingSay = null; // a say() that arrived while Voice Mode was still starting
  let barge = null;      // while speaking: { hits } qualifying partials in a row; after a barge-in: { speech }
  let holds = 0;         // learner-started media with sound playing now (hold())
  const listeners = new Set();

  const set = (next, words) => {
    if (next) state = next;
    if (words) caption = { ...caption, ...words };
    for (const listener of [...listeners]) listener();
  };
  const emit = (name, detail = {}) => { try { telemetry(name, { session_id: sessionId, ...detail }); } catch { /* telemetry never breaks a turn */ } };

  // Ends the turn: back to listening, with the turn's derived timings.
  function finish(turn) {
    if (current !== turn) return;
    current = null;
    // Only a reply that played to the end leaves an echo tail; an interrupted one never filters the learner.
    lastSpoken = turn.speech && turn.marks.interrupted == null ? { text: turn.speech, at: now() } : null;
    const m = turn.marks;
    m.listening = now();
    heard = {};
    Promise.resolve(stt.resume()).catch(() => sttFailed('resume'));
    set('listening');
    emit('voice_listening_resumed', { turn_id: turn.turnId, at: m.listening });
    emit('voice_turn', { turn_id: turn.turnId, ms: {
      speech_start_to_first_partial: span(m.speech_start, m.first_partial),
      speech_end_to_commit: span(m.speech_end, m.commit),
      speech_end_to_tutor_speaking: span(m.speech_end, m.tts_play_start),
      speech_end_to_first_sentence: span(m.speech_end, m.first_sentence),
      speech_end_to_canvas_action: span(m.speech_end, m.canvas_action_visible),
      tts_request_to_first_byte: span(m.tts_request_start, m.tts_first_byte),
      // Streaming playback (owner, 2026-10-01): text ready is when the Tutor's reply arrived here.
      text_ready_to_tts_request: span(m.text_ready, m.tts_request_start),
      tts_request_to_play_start: span(m.tts_request_start, m.tts_play_start),
      text_ready_to_play_start: span(m.text_ready, m.tts_play_start),
      // Stop click to the pause call; the silence itself is measured in e2e/voice-tts-stream-check.mjs.
      stop_to_pause: span(m.interrupted, m.tts_stopped),
      tts_play_duration: span(m.tts_play_start, m.tts_play_end),
      speech_end_to_listening_resumed: span(m.speech_end, m.listening),
    } });
  }

  // opening: a Rabbit Hole's opening turn (say()), not words the learner spoke - no STT marks, same Tutor turn.
  // nextStep: a Professor Next Steps hook clicked while Voice is on (say('', { nextStep, selectedAt })) - the same Tutor turn
  // with the step and no words, no STT marks, spoken like any reply.
  async function commit(text, { opening = false, nextStep = null, selectedAt = null } = {}) {
    const quiet = opening || !!nextStep;
    const turn = current = { turnId: crypto.randomUUID(), controller: new AbortController(), marks: quiet ? {} : { ...heard } };
    const m = turn.marks, turnId = turn.turnId;
    heard = {};
    stt.pause();
    m.commit = now();
    if (!quiet) {
      m.speech_end = m.commit - VAD_SILENCE_MS;
      emit('speech_end', { turn_id: turnId, at: m.speech_end, estimated: true });
      emit('stt_commit', { turn_id: turnId, at: m.commit });
    }
    set('thinking', { error: null });
    m.tutor_request_start = now();
    emit('tutor_request_start', { turn_id: turnId, at: m.tutor_request_start });
    // The Tutor's first validated, self-contained sentence (Tutor v2) starts Fish before the plan is complete.
    let early = null;
    const onSpeakable = sentence => {
      const words = typeof sentence === 'string' ? sentence.trim() : '';
      if (current !== turn || early || !words) return;
      m.first_sentence = now();
      emit('first_sentence', { turn_id: turnId, at: m.first_sentence });
      early = { text: words };
      speak(turn, words);
      early.speaking = tts.speak(words, { turnId });
    };
    let reply;
    try {
      reply = await tutor.voiceTurn({ raw: text, turnId, signal: turn.controller.signal, onSpeakable, ...(opening ? { opening: true } : {}), ...(nextStep ? { nextStep, ...(selectedAt ? { selectedAt } : {}) } : {}) });
    } catch (error) {
      if (current !== turn) return; // exited: nothing to show
      // The plan failed after its first sentence began: that sentence never validated as a reply, so it stops.
      if (early) tts.stop();
      const timeout = error?.name === 'TimeoutError';
      emit('voice_error', { turn_id: turnId, kind: timeout ? 'tutor_timeout' : 'tutor' });
      set(null, { error: timeout ? TUTOR_TIMEOUT : TUTOR_FAILED });
      return finish(turn);
    }
    if (current !== turn) return;
    // The Tutor's own timings, measured from its turn start (about tutor_request_start).
    for (const [name, key] of [['evidence_ready', 'to_evidence_ready'], ['planner_ready', 'to_planner_ready'], ['canvas_action_visible', 'canvas_done']]) {
      const ms = reply?.ms?.[key];
      if (typeof ms !== 'number') continue;
      m[name] = m.tutor_request_start + ms;
      emit(name, { turn_id: turnId, ms });
    }
    const speech = typeof reply?.speech === 'string' ? reply.speech : '';
    if (early) {
      // The first sentence is already playing: the caption shows the whole reply, and what follows that
      // sentence is spoken once it ends. The plan validated the sentence as the reply's opening.
      turn.speech = speech || early.text;
      set(null, { current: turn.speech });
      // The continuation is requested now, while the first sentence still plays, and queued behind it: no
      // dead gap between them, never reordered or repeated; Stop ends both (tts.stop()).
      const rest = speech.startsWith(early.text) ? speech.slice(early.text.length).trim() : '';
      const queued = rest ? tts.speak(rest, { turnId, after: early.speaking }) : null;
      const outcome = await early.speaking;
      if (current !== turn) return;
      if (outcome === 'failed') emit('voice_error', { turn_id: turnId, kind: 'tts' });
      if (queued) {
        const more = await queued;
        if (more === 'failed' && current === turn) emit('voice_error', { turn_id: turnId, kind: 'tts' });
      }
      return finish(turn);
    }
    if (!speech) return finish(turn);
    speak(turn, speech);
    const outcome = await tts.speak(speech, { turnId });
    if (outcome === 'failed' && current === turn) emit('voice_error', { turn_id: turnId, kind: 'tts' });
    finish(turn); // ended, failed or stopped: the caption stays, the canvas has already acted
  }

  // Into speaking with these words on the caption. Listen while speaking, so the learner can interrupt by
  // talking (sttEvent) - only where the browser confirms echo cancellation; otherwise the mic waits.
  function speak(turn, words) {
    turn.marks.text_ready ??= now();
    turn.speech = words;
    set('speaking', { current: words, previous: caption.current || null });
    barge = { hits: 0, heard: false };
    if (stt.echoCancelled !== false) Promise.resolve(stt.resume()).catch(() => sttFailed('resume'));
  }

  function interrupt() {
    if (!current || (state !== 'speaking' && state !== 'thinking')) return;
    const turn = current, from = state;
    turn.marks.interrupted = now();
    emit('voice_interrupted', { turn_id: turn.turnId, from, at: turn.marks.interrupted });
    if (from === 'speaking') tts.stop();
    finish(turn);
    // Thinking, or speaking an early sentence while the plan is still coming: cancel the Tutor turn.
    turn.controller.abort();
  }

  function sttFailed(kind) {
    if (state === 'off' && !starting) return;
    emit('voice_error', { kind: String(kind || 'stt') });
    stop();
    set('off', { error: STT_STOPPED });
  }

  // Everything off: the turn in flight is aborted and its late answer ignored.
  function stop() {
    epoch++;
    pendingSay = null;
    starting = false;
    holds = 0;
    const turn = current;
    current = null;
    heard = {};
    turn?.controller.abort();
    tts.stop();
    stt.stop();
  }

  return {
    get state() { return state; },
    get caption() { return caption; },
    async enter() {
      if (state !== 'off' || starting) return;
      starting = true;
      const mine = ++epoch;
      sessionId = crypto.randomUUID();
      caption = { current: '', previous: null, error: null };
      emit('voice_mode_enter');
      set();
      try { await stt.start(); }
      catch (error) {
        if (mine !== epoch) return;
        starting = false;
        stt.stop();
        const denied = PERMISSION.has(error?.name);
        emit('voice_error', { kind: denied ? 'permission' : 'stt_start' });
        return set('off', { error: denied ? MIC_REQUIRED : STT_STOPPED });
      }
      if (mine !== epoch) return;
      starting = false;
      // Media started while the mic was still opening: it stays closed until the media ends (hold()).
      if (holds) { stt.pause(); return set('held'); }
      set('listening');
      if (pendingSay) { const { text, options } = pendingSay; pendingSay = null; commit(text, options); }
    },
    exit() {
      const on = state !== 'off' || starting;
      stop();
      if (on) emit('voice_mode_exit');
      // A deliberate Voice OFF leaves no stale turn error over the normal composer.
      set('off', { error: null });
    },
    // At any point of a turn the learner can take the floor back; Voice stays on.
    // Speaking: the audio stops now. Thinking: the Tutor turn is cancelled and its late answer ignored.
    interrupt,
    // Learner-started media with sound - an avatar clip now, narrated Motion later (rabbit-hole-avatar-teacher-v1-spec.md
    // §4.3): the Tutor and the media never speak at once, and the mic never transcribes the media. hold() stops the
    // Tutor's speech, cancels a turn in flight (its late answer is never spoken) and pauses STT; Voice Mode stays on,
    // in state 'held'. It returns release(), for the media's end or Stop, which resumes listening once every hold is
    // released. Off: a no-op. Exit while held drops the holds.
    hold() {
      if (state === 'off' && !starting) return () => {};
      const mine = epoch;
      holds++;
      const turn = current;
      if (turn) {
        turn.marks.interrupted = now();
        emit('voice_interrupted', { turn_id: turn.turnId, from: state, at: turn.marks.interrupted });
        current = null;
        turn.controller.abort();
      }
      tts.stop();
      stt.pause();
      heard = {}; barge = null; lastSpoken = null;
      emit('voice_held');
      if (!starting) set('held');
      let released = false;
      return () => {
        if (released || mine !== epoch) return;
        released = true;
        if (--holds || starting) return;
        Promise.resolve(stt.resume()).catch(() => sttFailed('resume'));
        set('listening');
        emit('voice_listening_resumed', { after: 'hold' });
        // A hook click that waited for the clip (or arrived while Voice was starting) runs now, once.
        if (pendingSay?.options.nextStep) { const { text, options } = pendingSay; pendingSay = null; commit(text, options); }
      };
    },
    get starting() { return starting; },
    // A Tutor turn Voice Mode runs without the learner speaking - a Rabbit Hole's opening, or a hook click with no words
    // (options.nextStep) (ask.jsx): spoken and captioned like any voice reply, never a chat bubble. Waits for listening if
    // Voice Mode is still starting; false when Voice Mode is off or busy (never a second turn while one runs), so the caller
    // can fall back to the typed path. A hook click is never sent down the typed path while Voice is on: speaking, it takes
    // the floor like a barge-in; held by a clip, it waits for the hold to end (the newest click); false only off or thinking.
    say(text, options = {}) {
      const words = String(text || '').trim();
      if (!words && !options.nextStep) return false;
      if (state === 'listening' && !current) { commit(words, options); return true; }
      if (starting) { pendingSay = { text: words, options }; return true; }
      if (options.nextStep && state === 'speaking' && current) { interrupt(); commit(words, options); return true; }
      if (options.nextStep && state === 'held') { pendingSay = { text: words, options }; return true; }
      return false;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    sttEvent(event) {
      if (event?.type === 'error') return sttFailed(event.kind);
      // New speech on the mic while the Tutor speaks (the adapter's speech_start after it resumed). A partial
      // before that is a leftover of an utterance from before the reply (live, 2026-10-01: the tail of a split
      // sentence arrived once the mic reopened and cut the Tutor off), never a barge-in.
      if (state === 'speaking' && current && event?.type === 'speech_start') barge.heard = true;
      if (state === 'speaking' && current && barge?.heard && (event?.type === 'partial' || event?.type === 'commit')) {
        // Two qualifying partials in a row (or a commit) take the floor; one stray partial does not.
        barge.hits = bargesIn(event.text, current.speech) ? barge.hits + 1 : 0;
        if (barge.hits >= 2 || (barge.hits && event.type === 'commit')) {
          const speech = current.speech;
          emit('voice_barge_in', { turn_id: current.turnId });
          interrupt();
          barge = { speech };
          heard.speech_start ??= now();
          emit('speech_start', { at: heard.speech_start });
        }
      }
      if (state !== 'listening') return;
      if (event?.type === 'speech_start' && heard.speech_start == null) {
        heard.speech_start = now();
        emit('speech_start', { at: heard.speech_start });
      } else if (event?.type === 'partial' && heard.first_partial == null) {
        heard.first_partial = now();
        emit('stt_first_partial', { at: heard.first_partial });
      } else if (event?.type === 'commit') {
        let text = String(event.text || '').trim();
        if (barge?.speech) { text = withoutEcho(text, barge.speech); barge = null; }
        else if (text && lastSpoken && now() - lastSpoken.at < ECHO_TAIL_MS && echoesEnd(text, lastSpoken.text)) {
          // The Tutor's own last words, committed just after it stopped speaking: not a turn.
          emit('voice_echo_ignored');
          return;
        }
        if (text) commit(text);
      }
    },
    ttsEvent(event) {
      if (!current || event?.turnId !== current.turnId || event.type === 'tts_error') return;
      // A turn can play two clips (the early first sentence, then the rest): the start marks keep the first
      // clip, which is when the learner first heard the Tutor; the end marks take the last.
      const first = ['tts_request_start', 'tts_first_byte', 'tts_play_start'].includes(event.type);
      if (first) current.marks[event.type] ??= event.at ?? now();
      else current.marks[event.type] = event.at ?? now();
      emit(event.type, { turn_id: current.turnId, at: event.at ?? now() });
    },
  };
}
