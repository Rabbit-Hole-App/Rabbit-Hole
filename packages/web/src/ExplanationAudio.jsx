// The Explanation card's audio control (docs/features/explain.md, the "Audio control" row): the spoken 60 to 90 second version of the card, one compact pill in the
// card header's trailing slot (LearningBlocks Kicker `action`, CardHeader `trailing`): [ play / pause | replay ] (no time shown). It reads `block.narration`
// = { status: 'preparing' | 'ready' | 'failed', fileRef, seconds, ... } and nothing else; generating it is a later task. No narration or a failed one: nothing is drawn.
// The file is read like the card's figures (IllustrationFigure.jsx followSource: file-source-client loadSource, so the same scope, headers and retries) but only on the first press, so a board of
// cards downloads no audio until one is played. One audio element per card; one card plays at a time (`playing`); never autoplay.
import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import { followSource } from './IllustrationFigure.jsx';
import { clearPlayingCard, closeTranscript, openTranscript, restartTranscript, setPlayingCard, updateTranscript } from './audio-playing.js';
import { ExplanationHost } from './explanation-host.js';
import { wantPlay } from './explanation-audio.js';
import { ConfirmDialog, toast } from './ui.jsx';
import { UNKNOWN_PRICE, usageLine } from './GenerationProposalCard.jsx';

let playing = null; // the audio element that is playing now; starting another pauses it

const PILL = 'inline-flex h-7 items-center rounded-full border border-line-strong bg-surface text-ink-2';
const BUTTON = 'grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full border-0 p-0 text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45';
const stop = event => event.stopPropagation(); // a press on the control never drags or selects the card

function AudioPill({ narration, cardId }) {
  const ref = useRef(null), want = useRef(null), halted = useRef(false); // halted: a failure paused it, so that pause event is not a learner's pause
  const [phase, setPhase] = useState('idle'); // idle | loading | playing | paused
  const [failed, setFailed] = useState(false), [url, setUrl] = useState(''), [wanted, setWanted] = useState(false);
  const audio = () => ref.current || (ref.current = new Audio());
  const shown = typeof narration.transcript === 'string' && narration.transcript.trim() ? narration.transcript : narration.script; // the window shows the LaTeX form when there is one; the voice only ever got the script
  const live = useRef({}); live.current = { cardId, script: shown }; // the transcript window's owner and displayed text (audio-playing.js), read by the element's events
  const fail = () => { want.current = null; halted.current = true; audio().pause(); setPhase('idle'); setFailed(true); if (cardId) closeTranscript(cardId); };
  const failRef = useRef(fail); failRef.current = fail;

  useEffect(() => {
    const a = audio();
    const on = {
      play: () => { setPhase('playing'); const { cardId: id, script } = live.current; if (id) { openTranscript(id, script); if (a.currentTime < 0.05) restartTranscript(id); } },
      timeupdate: () => { const { cardId: id } = live.current; if (id) updateTranscript(id, a.currentTime, a.duration); },
      pause: () => { if (!a.ended && !halted.current) setPhase('paused'); },
      ended: () => { const { cardId: id } = live.current, length = a.duration; a.currentTime = 0; setPhase('idle'); if (id && length > 0) updateTranscript(id, length, length); }, // the window stays open with the full text
      error: () => failRef.current(), stalled: () => failRef.current(),
    };
    for (const [name, fn] of Object.entries(on)) a.addEventListener(name, fn);
    return () => { for (const [name, fn] of Object.entries(on)) a.removeEventListener(name, fn); a.pause(); if (playing === a) playing = null; };
  }, []);
  useEffect(() => (wanted ? followSource(narration.fileRef, { setUrl, setMissing: missing => { if (missing) failRef.current(); } }) : undefined), [wanted]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = restart => {
    const a = audio();
    if (restart) a.currentTime = 0;
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
  useEffect(() => { if (cardId && wantPlay.delete(cardId)) press(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the Play that made this voice also asks to hear it

  const active = phase === 'playing', loading = phase === 'loading';
  // The canvas card's green frame and the minimap's mark follow `phase === 'playing'` (audio-playing.js); a pause, the end, a failure or unmounting clears it.
  useEffect(() => { if (cardId) { if (active) setPlayingCard(cardId); else clearPlayingCard(cardId); } }, [active, cardId]);
  useEffect(() => () => { if (cardId) { clearPlayingCard(cardId); closeTranscript(cardId); } }, [cardId]);
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
    </span>
  );
}

// The Play button of a card whose voice is not made yet ('script') or whose last step failed ('error'): its press makes what is missing (host.narrate, a paid step the press confirms), then the
// ready pill takes its place and starts. A failure says why in a notice and leaves the button to press again.
function GeneratePill({ narration, cardId, narrate }) {
  const [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false), alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const failed = narration.status === 'error';
  const label = busy ? 'Preparing audio' : failed ? 'Audio could not play. Try again.' : 'Play explanation';
  const done = made => { if (alive.current) setBusy(false); return made; };
  // The voice is paid: the press asks first and shows its cost in AI units (the server's figure, as the other paid features show theirs: GenerationProposalCard usageLine). A card with no script yet
  // (its free step failed) makes the script first, then asks.
  const press = async () => {
    if (busy) return;
    if (narration.script) { setConfirming(true); return; }
    setBusy(true);
    let made = null;
    try { made = await narrate(cardId, { voice: false }); } catch { /* the notice below says it */ }
    done(made);
    if (made?.status === 'script') setConfirming(true); else toast(made?.reason || 'The audio could not be made. Try again.');
  };
  const generate = async () => {
    setConfirming(false); setBusy(true); wantPlay.add(cardId);
    let made = null;
    try { made = await narrate(cardId); } catch { /* the notice below says it */ }
    if (made?.status !== 'ready') { wantPlay.delete(cardId); toast(made?.reason || 'The audio could not be made. Try again.'); }
    done(made);
  };
  const cost = usageLine(narration);
  return (
    <span data-explanation-audio data-audio-state={busy ? 'preparing' : failed ? 'failed' : 'script'} onPointerDown={stop} className={PILL}>
      <button type="button" data-audio-play title={label} aria-label={label} aria-busy={busy || undefined} disabled={busy} onClick={press} className={BUTTON}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
      {confirming && createPortal(
        <ConfirmDialog title="Make the audio" body={<span data-audio-confirm>{`This uses paid generation. ${cost || UNKNOWN_PRICE}`}</span>} confirmLabel="Generate" confirmVariant="inverse" confirmDisabled={!cost} onConfirm={generate} onCancel={() => setConfirming(false)} />, document.body)}
    </span>
  );
}

// Every viewer of the card gets the pill: the file route admits a share or publication link whose board references the narration (file-access.js authorizeFileSource, file-refs.js), and the page reads it through that scope (file-source-client.js).
export function ExplanationAudio({ narration, cardId }) {
  const narrate = useContext(ExplanationHost)?.narrate;
  if (!narration) return null;
  if (narrate && cardId && (narration.status === 'script' || narration.status === 'error')) return <GeneratePill key={cardId} narration={narration} cardId={cardId} narrate={narrate} />;
  if (narration.status === 'preparing') {
    return (
      <span data-explanation-audio data-audio-state="preparing" onPointerDown={stop} className={PILL}>
        <button type="button" data-audio-play disabled title="Preparing audio" aria-label="Preparing audio" className={BUTTON}><Loader2 size={14} className="animate-spin" aria-hidden="true" /></button>
      </span>
    );
  }
  const source = narration.fileRef?.source;
  return narration.status === 'ready' && source?.id ? <AudioPill key={`${source.id}:${source.rev}`} narration={narration} cardId={cardId} /> : null;
}
