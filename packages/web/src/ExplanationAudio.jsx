// The Explanation card's audio control (docs/features/explain.md, the "Audio control" row): the spoken 60 to 90 second version of the card, one compact pill in the
// card header's trailing slot (LearningBlocks Kicker `action`, CardHeader `trailing`): [ play / pause | replay ] and the time. It reads `block.narration`
// = { status: 'preparing' | 'ready' | 'failed', fileRef, seconds, ... } and nothing else; generating it is a later task. No narration, a failed one, or a viewer who cannot edit: nothing is drawn.
// The file is read like the card's figures (IllustrationFigure.jsx followSource: file-source-client loadSource, so the same scope, headers and retries) but only on the first press, so a board of
// cards downloads no audio until one is played. One audio element per card; one card plays at a time (`playing`); never autoplay.
import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import { followSource } from './IllustrationFigure.jsx';

let playing = null; // the audio element that is playing now; starting another pauses it
export const clock = seconds => { const s = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const PILL = 'inline-flex h-7 items-center rounded-full border border-line-strong bg-surface text-ink-2';
const BUTTON = 'grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45';
const TIME = 'w-16 shrink-0 pr-2.5 pl-1 text-left text-[11px] leading-none tabular-nums select-none';
const stop = event => event.stopPropagation(); // a press on the control never drags or selects the card

function AudioPill({ narration }) {
  const ref = useRef(null), want = useRef(null), halted = useRef(false); // halted: a failure paused it, so that pause event is not a learner's pause
  const [phase, setPhase] = useState('idle'); // idle | loading | playing | paused
  const [time, setTime] = useState(0), [failed, setFailed] = useState(false), [url, setUrl] = useState(''), [wanted, setWanted] = useState(false);
  const audio = () => ref.current || (ref.current = new Audio());
  const fail = () => { want.current = null; halted.current = true; audio().pause(); setPhase('idle'); setTime(0); setFailed(true); };
  const failRef = useRef(fail); failRef.current = fail;

  useEffect(() => {
    const a = audio();
    const on = {
      play: () => setPhase('playing'),
      pause: () => { if (!a.ended && !halted.current) setPhase('paused'); },
      timeupdate: () => setTime(Math.floor(a.currentTime || 0)),
      ended: () => { a.currentTime = 0; setTime(0); setPhase('idle'); },
      error: () => failRef.current(), stalled: () => failRef.current(),
    };
    for (const [name, fn] of Object.entries(on)) a.addEventListener(name, fn);
    return () => { for (const [name, fn] of Object.entries(on)) a.removeEventListener(name, fn); a.pause(); if (playing === a) playing = null; };
  }, []);
  useEffect(() => (wanted ? followSource(narration.fileRef, { setUrl, setMissing: missing => { if (missing) failRef.current(); } }) : undefined), [wanted]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = restart => {
    const a = audio();
    if (restart) { a.currentTime = 0; setTime(0); }
    halted.current = false;
    if (playing && playing !== a) playing.pause();
    playing = a;
    Promise.resolve(a.play()).catch(() => failRef.current());
  };
  useEffect(() => { // the file arrived after the press that asked for it
    if (!url) return;
    audio().src = url;
    if (want.current) { const restart = want.current === 'restart'; want.current = null; run(restart); }
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  const press = restart => {
    setFailed(false);
    if (url) { run(restart); return; }
    want.current = restart ? 'restart' : 'play'; setPhase('loading'); setWanted(true);
  };

  const active = phase === 'playing', loading = phase === 'loading', shown = active || phase === 'paused' || time > 0;
  const label = failed ? 'Audio could not play. Try again.' : active ? 'Pause explanation' : 'Play explanation';
  return (
    <span data-explanation-audio data-audio-state={failed ? 'failed' : phase} onPointerDown={stop} className={PILL}>
      <button type="button" data-audio-play title={label} aria-label={label} aria-busy={loading || undefined} disabled={loading}
        onClick={() => (active ? audio().pause() : press(false))} className={BUTTON}>
        {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : active ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-line" />
      <button type="button" data-audio-replay title="Replay from the start" aria-label="Replay from the start" disabled={loading} onClick={() => press(true)} className={BUTTON}>
        <RotateCcw size={14} aria-hidden="true" />
      </button>
      <span data-audio-time className={TIME}>{shown ? `${clock(time)} / ${clock(narration.seconds)}` : clock(narration.seconds)}</span>
    </span>
  );
}

// canEdit: the audio route is owner-only (file-access.js: a signed-out viewer gets 404), so a card this viewer cannot edit draws nothing.
export function ExplanationAudio({ narration, canEdit }) {
  if (!canEdit || !narration) return null;
  if (narration.status === 'preparing') {
    return (
      <span data-explanation-audio data-audio-state="preparing" onPointerDown={stop} className={PILL}>
        <button type="button" data-audio-play disabled title="Preparing audio" aria-label="Preparing audio" className={BUTTON}><Loader2 size={14} className="animate-spin" aria-hidden="true" /></button>
      </span>
    );
  }
  const source = narration.fileRef?.source;
  return narration.status === 'ready' && source?.id ? <AudioPill key={`${source.id}:${source.rev}`} narration={narration} /> : null;
}
