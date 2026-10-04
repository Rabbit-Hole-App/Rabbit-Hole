// Voice Mode on the Learn page (docs/features/voice-tutor-mvp.md §6b): one voice session per canvas
// while the Tutor is active. It owns no brain: every utterance is tutor.voiceTurn, the same Tutor turn
// as a typed message. ?voice=fake swaps in the scripted adapters and exposes window.__voiceFake, in the dev/review
// build only (reviewTools): production ignores it and always runs the real providers.
import { useEffect, useReducer, useRef, useState } from 'react';
import { api, wsHeaders } from './api.js';
import { reviewTools } from './flags.js';
import { createVoiceSession } from './voice-session.js';
import { createFakeStt, createScribeStt } from './voice-stt.js';
import { createFakeTts, createFishTts } from './voice-tts.js';
import { voiceEvent } from './voice-telemetry.js';

// Going down or back up a Rabbit Hole remounts the Learn surface (LearnPage.jsx keys it by hole), which
// ends its voice session; Voice Mode stays the learner's choice, so the next surface turns it back on.
let onAcrossMove = false;

// -> { state, caption: { current, previous, error }, enter, exit, interrupt } | null without the Tutor.
// onTargetUsed: the armed card rides one voice turn and is then cleared, as a typed turn clears it (ask.jsx).
export function useVoiceSession({ tutor, app, access, targetId, onTargetUsed = null }) {
  const active = !!tutor?.active;
  // Read at use time: the target is the one armed when the learner finishes speaking.
  const live = useRef(null);
  live.current = { tutor, access, targetId, onTargetUsed };
  const [session, setSession] = useState(null);
  const [, rerender] = useReducer(count => count + 1, 0);
  const appName = app?.name ?? app;

  useEffect(() => {
    if (!active) return undefined;
    let voice = null;
    const scope = () => ({ app: live.current.access.app, ...(live.current.access.pending ? { pending: live.current.access.pending } : {}) });
    const onStt = event => voice?.sttEvent(event);
    const onTts = event => voice?.ttsEvent(event);
    const fake = reviewTools && new URLSearchParams(window.location.search).get('voice') === 'fake';
    let stt, tts;
    if (fake) {
      const ttsOptions = { onEvent: onTts };
      stt = createFakeStt({ onEvent: onStt });
      tts = createFakeTts(ttsOptions);
      window.__voiceFake = {
        say: text => stt.say(text),
        failStt: (kind = 'error') => stt.fail(kind),
        failTts: (fail = true) => { ttsOptions.fail = fail; },
        setTtsMs: ms => { ttsOptions.ms = ms; },
        get ttsMs() { return ttsOptions.ms; },
        set ttsMs(ms) { ttsOptions.ms = ms; },
      };
    } else {
      // Turning Voice Mode on is the learner's confirmation for both paid providers (§5).
      stt = createScribeStt({ onEvent: onStt, fetchToken: () => api('/api/learn/voice/scribe-token', { method: 'POST', body: JSON.stringify({ ...scope(), confirmed: true }) }) });
      tts = createFishTts({
        onEvent: onTts,
        post: (path, body, signal) => fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify({ ...scope(), ...body }), signal }),
      });
    }
    voice = createVoiceSession({
      stt, tts, telemetry: voiceEvent,
      tutor: { voiceTurn: args => {
        const used = live.current.targetId ?? null;
        if (used) live.current.onTargetUsed?.();
        return live.current.tutor.voiceTurn({ ...args, targetId: used });
      } },
    });
    const unsubscribe = voice.subscribe(rerender);
    setSession(voice);
    if (onAcrossMove) { onAcrossMove = false; voice.enter(); }
    return () => {
      unsubscribe();
      if (voice.state !== 'off') onAcrossMove = true;
      voice.exit();
      setSession(null);
      if (fake) delete window.__voiceFake;
    };
  }, [active, appName]);

  if (!active || !session) return null;
  // on: Voice Mode is on or turning on (it re-enters after a Rabbit Hole move); say: a Tutor turn without learner speech.
  return { state: session.state, caption: session.caption, enter: session.enter, exit: session.exit, interrupt: session.interrupt, on: session.state !== 'off' || session.starting, say: session.say };
}
