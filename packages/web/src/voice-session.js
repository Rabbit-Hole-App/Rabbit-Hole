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

export function createVoiceSession({ stt, tts, tutor, telemetry = () => {}, now = () => (globalThis.performance ?? Date).now() }) {
  let state = 'off', caption = { current: '', previous: null, error: null };
  let sessionId = null, starting = false, epoch = 0;
  let heard = {};      // the utterance being listened to: speech_start, first partial
  let current = null;  // the turn in flight: { turnId, controller, marks }
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
      speech_end_to_canvas_action: span(m.speech_end, m.canvas_action_visible),
      tts_request_to_first_byte: span(m.tts_request_start, m.tts_first_byte),
      tts_play_duration: span(m.tts_play_start, m.tts_play_end),
      speech_end_to_listening_resumed: span(m.speech_end, m.listening),
    } });
  }

  async function commit(text) {
    const turn = current = { turnId: crypto.randomUUID(), controller: new AbortController(), marks: { ...heard } };
    const m = turn.marks, turnId = turn.turnId;
    heard = {};
    stt.pause();
    m.commit = now();
    m.speech_end = m.commit - VAD_SILENCE_MS;
    emit('speech_end', { turn_id: turnId, at: m.speech_end, estimated: true });
    emit('stt_commit', { turn_id: turnId, at: m.commit });
    set('thinking', { error: null });
    m.tutor_request_start = now();
    emit('tutor_request_start', { turn_id: turnId, at: m.tutor_request_start });
    let reply;
    try {
      reply = await tutor.voiceTurn({ raw: text, turnId, signal: turn.controller.signal });
    } catch (error) {
      if (current !== turn) return; // exited: nothing to show
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
    set(null, { current: speech, previous: caption.current || null });
    if (!speech) return finish(turn);
    set('speaking');
    const outcome = await tts.speak(speech, { turnId });
    if (outcome === 'failed' && current === turn) emit('voice_error', { turn_id: turnId, kind: 'tts' });
    finish(turn); // ended, failed or stopped: the caption stays, the canvas has already acted
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
    starting = false;
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
      set('listening');
    },
    exit() {
      const on = state !== 'off' || starting;
      stop();
      if (on) emit('voice_mode_exit');
      // A deliberate Voice OFF leaves no stale turn error over the normal composer.
      set('off', { error: null });
    },
    // While speaking: the audio stops now and the learner has the floor; Voice stays on.
    interrupt() {
      if (state !== 'speaking' || !current) return;
      const turn = current;
      tts.stop();
      finish(turn);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    sttEvent(event) {
      if (event?.type === 'error') return sttFailed(event.kind);
      if (state !== 'listening') return;
      if (event?.type === 'speech_start' && heard.speech_start == null) {
        heard.speech_start = now();
        emit('speech_start', { at: heard.speech_start });
      } else if (event?.type === 'partial' && heard.first_partial == null) {
        heard.first_partial = now();
        emit('stt_first_partial', { at: heard.first_partial });
      } else if (event?.type === 'commit') {
        const text = String(event.text || '').trim();
        if (text) commit(text);
      }
    },
    ttsEvent(event) {
      if (!current || event?.turnId !== current.turnId || event.type === 'tts_error') return;
      current.marks[event.type] = event.at ?? now();
      emit(event.type, { turn_id: current.turnId, at: current.marks[event.type] });
    },
  };
}
