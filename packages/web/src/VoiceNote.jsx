import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AudioLines, Loader2, Mic, Pause, Play, RotateCcw, Square, Trash2, X } from 'lucide-react';
import { LIMIT_WARNING_MS, clock } from './explain-back-media.js';

// The retained voice note row on the Explain-back answer card (plan section 5). Record voice -> Recording, elapsed time,
// Pause/Resume, Stop -> a replayable note with play/pause, a neutral progress track (no invented waveform), elapsed and
// duration, scrubbing, Remove and Re-record. It renders a controller from voiceNoteFor(draftKey, ...) in
// explain-back-media.js, which outlives this component; it never sees or changes the typed answer.
//
// Props:
//   note        the controller (required).
//   readOnly    a submitted attempt's note: playback only.
//   transcript  optional { status: 'ready' | 'pending' | 'failed', text } shown read-only under the player; it is never
//               put into the answer field.
//   disabled    greys Record voice (for example while the answer is being submitted).
// The card's Submit uses voiceSubmitState(useVoiceNote(note)) for its disabled label.
export const useVoiceNote = note => useSyncExternalStore(note.subscribe, note.get, note.get);

const ACTIVE = new Set(['requesting', 'recording', 'paused', 'stopping']);
const button = 'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink hover:bg-hover disabled:opacity-40';
const icon = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';

export default function VoiceNote({ note, readOnly = false, transcript = null, disabled = false }) {
  const state = useVoiceNote(note);
  const { status, error, notice, take, saved, limitMs, progress } = state;
  const has = !!(take || saved);

  if (ACTIVE.has(status)) return <Recorder note={note} state={state} />;
  return (
    <div data-voice-note={status} className="mt-2 text-sm">
      {has ? <Player note={note} state={state} readOnly={readOnly} disabled={disabled} /> : !readOnly && (
        <div className="flex items-center gap-2">
          <button type="button" data-voice-record disabled={disabled} onClick={note.start} className={button}>
            <Mic size={14} />Record voice
          </button>
          <span className="text-xs text-ink-2">Up to {clock(limitMs)}</span>
        </div>
      )}
      <div aria-live="polite" className="text-xs">
        {status === 'saving' && <p className="mt-1 text-ink-2">Saving voice note{progress?.total ? ` ${Math.min(99, Math.round((progress.sent / progress.total) * 100))}%` : ''}</p>}
        {notice && <p className="mt-1 text-ink-2">{notice}</p>}
        {error && (
          <p data-voice-error={error.kind} className="mt-1 flex flex-wrap items-center gap-x-2 text-red-700">
            <span>{error.message}</span>
            {error.kind === 'upload' && error.retryable && <button type="button" onClick={note.retry} className="font-medium underline">Retry</button>}
            {error.kind !== 'upload' && has && <button type="button" onClick={note.retry} className="font-medium underline">Dismiss</button>}
          </p>
        )}
      </div>
      {transcript && has && <Transcript transcript={transcript} />}
    </div>
  );
}

function Recorder({ note, state }) {
  const { status, elapsedMs, limitMs } = state;
  const left = limitMs - elapsedMs;
  const live = status === 'recording';
  if (status === 'requesting' || status === 'stopping') {
    return (
      <div data-voice-note={status} aria-live="polite" className="mt-2 flex h-8 items-center gap-2 text-xs text-ink-2">
        <Loader2 size={14} className="animate-spin" />
        {status === 'requesting' ? 'Waiting for microphone permission' : 'Finishing recording'}
        {status === 'requesting' && <button type="button" onClick={note.cancel} className="font-medium underline">Cancel</button>}
      </div>
    );
  }
  return (
    <div data-voice-note={status} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1 text-sm">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${live ? 'animate-pulse bg-red-600' : 'bg-ink-3'}`} aria-hidden="true" />
      <span aria-live="polite" className="font-medium">{live ? 'Recording' : 'Paused'}</span>
      <span data-voice-elapsed className={`tabular-nums text-xs ${left <= LIMIT_WARNING_MS ? 'font-medium text-amber-700' : 'text-ink-2'}`}>
        {clock(elapsedMs)} / {clock(limitMs)}{left <= LIMIT_WARNING_MS ? ` · ${clock(left)} left` : ''}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <button type="button" data-voice-pause onClick={live ? note.pause : note.resume} className={button}>
          {live ? <><Pause size={14} />Pause</> : <><Mic size={14} />Resume</>}
        </button>
        <button type="button" data-voice-stop onClick={note.stop} className={button}><Square size={12} fill="currentColor" />Stop</button>
        <button type="button" data-voice-cancel onClick={note.cancel} aria-label="Discard this recording" title="Discard this recording" className={icon}><X size={15} /></button>
      </span>
    </div>
  );
}

function Player({ note, state, readOnly, disabled }) {
  const audio = useRef(null);
  const [src, setSrc] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const known = (state.take || state.saved)?.durationMs || 0;
  const [mediaMs, setMediaMs] = useState(0);
  // MediaRecorder WebM and fragmented MP4 report no duration until played through, so the recorded length stands in.
  const total = mediaMs || known;
  const identity = state.take?.sha256 || state.saved?.sha256 || null;

  // A new take is a new source: forget the old one and the playhead.
  useEffect(() => { setSrc(null); setAt(0); setPlaying(false); setMediaMs(0); setLoadError(''); }, [identity]);
  // A local take plays at once; a stored note loads only when Play asks for it.
  useEffect(() => { if (state.take && !src) note.source().then(setSrc).catch(() => {}); }, [state.take, src, note]);

  const toggle = async () => {
    const el = audio.current;
    if (!el) return;
    if (playing) { el.pause(); return; }
    if (!src) {
      try {
        const next = await note.source();
        if (!next) { setLoadError('This voice note cannot be played here.'); return; }
        setSrc(next);
        el.src = next;
      } catch { setLoadError('This voice note could not be loaded. Try again.'); return; }
    }
    el.play().catch(() => setLoadError('This voice note could not be played.'));
  };
  const seek = ms => { if (audio.current && src) audio.current.currentTime = ms / 1000; setAt(ms); };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1">
      <audio ref={audio} src={src || undefined} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setAt(total); }}
        onTimeUpdate={e => setAt(e.currentTarget.currentTime * 1000)}
        onDurationChange={e => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setMediaMs(d * 1000); }}
        onError={() => src && setLoadError('This voice note could not be played.')} />
      <button type="button" data-voice-play onClick={toggle} aria-label={playing ? 'Pause voice note' : 'Play voice note'} title={playing ? 'Pause' : 'Play'} className={icon}>
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <AudioLines size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
      <input type="range" data-voice-seek min={0} max={Math.max(1, Math.round(total))} step={100} value={Math.min(Math.round(at), Math.max(1, Math.round(total)))}
        onChange={e => seek(Number(e.target.value))} disabled={!src}
        aria-label="Voice note position" aria-valuetext={`${clock(at)} of ${clock(total)}`}
        className="h-1 min-w-24 flex-1 cursor-pointer accent-ink-2 disabled:cursor-default" />
      <span data-voice-time className="tabular-nums text-xs text-ink-2">{clock(at)} / {clock(total)}</span>
      {!readOnly && (
        <span className="flex items-center">
          <button type="button" data-voice-rerecord disabled={disabled || state.status === 'saving'} onClick={() => { audio.current?.pause(); note.start(); }}
            aria-label="Re-record voice note" title="Re-record" className={icon}><RotateCcw size={15} /></button>
          <button type="button" data-voice-remove disabled={disabled} onClick={() => { audio.current?.pause(); note.remove(); }}
            aria-label="Remove voice note" title="Remove" className={icon}><Trash2 size={15} /></button>
        </span>
      )}
      {loadError && <p className="basis-full text-xs text-red-700">{loadError}</p>}
    </div>
  );
}

function Transcript({ transcript }) {
  if (transcript.status === 'pending') return <p className="mt-1 text-xs text-ink-2">Transcript in progress</p>;
  if (transcript.status === 'failed') return <p className="mt-1 text-xs text-ink-2">No transcript; the recording itself is kept.</p>;
  if (!transcript.text) return null;
  return (
    <details className="mt-1 text-xs text-ink-2">
      <summary className="cursor-pointer">Transcript</summary>
      <p data-voice-transcript className="mt-1 whitespace-pre-wrap">{transcript.text}</p>
    </details>
  );
}
