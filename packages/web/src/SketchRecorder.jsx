import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Circle, Loader2, Mic, MicOff, Pause, Play, RotateCcw, Square, Trash2, X } from 'lucide-react';
import { LIMIT_WARNING_MS, clock } from './explain-back-media.js';
import { stateAt } from './sketch-recording.js';

// The Sketch recording controls, in the single Sketch panel below the drawing (plan sections 3 and 5): Record, Audio on/off,
// Pause/Resume, Stop, elapsed time, then replay with scrubbing, Re-record and Remove. It records only the question's
// sketch that the panel passes in; it renders a controller from sketchRecordingFor(key, ...) in sketch-recording.js,
// which outlives this component.
//
// Props:
//   recording     the controller (required).
//   sketch        the question's live sketch (block.sketch); every change is passed to the recording while it runs.
//   renderReplay  (sketch) -> node: the sketch at a replay moment, read-only. For the panel:
//                 s => sketchHost.render({ ...block, sketch: s }, { still: true, docked: true }).
//   readOnly      a submitted attempt's recording: replay only.
// Unmounting mid-recording (the panel closed) stops cleanly and keeps the take. Submit uses
// recordingSubmitState(useSketchRecording(recording)).
export const useSketchRecording = recording => useSyncExternalStore(recording.subscribe, recording.get, recording.get);

const button = 'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink hover:bg-hover disabled:opacity-40';
const icon = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';

export default function SketchRecorder({ recording, sketch, renderReplay, readOnly = false }) {
  const state = useSketchRecording(recording);
  const { status, audio, elapsedMs, limitMs, take, saved, error, notice, progress } = state;
  const live = status === 'recording' || status === 'paused';

  useEffect(() => { recording.observe(sketch); }, [recording, sketch]);
  useEffect(() => () => recording.close(), [recording]);

  if (status === 'requesting') {
    return <div data-sketch-recorder={status} aria-live="polite" className="flex h-8 items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin" />Waiting for microphone permission</div>;
  }
  if (live) {
    const left = limitMs - elapsedMs;
    return (
      <div data-sketch-recorder={status} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1 text-sm">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === 'recording' ? 'animate-pulse bg-red-600' : 'bg-ink-3'}`} aria-hidden="true" />
        <span aria-live="polite" className="font-medium">{status === 'recording' ? 'Recording' : 'Paused'}<span className="font-normal text-ink-2">{audio ? ' with audio' : ' without audio'}</span></span>
        <span className={`tabular-nums text-xs ${left <= LIMIT_WARNING_MS ? 'font-medium text-amber-700' : 'text-ink-2'}`}>
          {clock(elapsedMs)} / {clock(limitMs)}{left <= LIMIT_WARNING_MS ? ` · ${clock(left)} left` : ''}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" data-sketch-record-pause onClick={status === 'recording' ? recording.pause : recording.resume} className={button}>
            {status === 'recording' ? <><Pause size={14} />Pause</> : <><Play size={14} />Resume</>}
          </button>
          <button type="button" data-sketch-record-stop onClick={recording.stop} className={button}><Square size={12} fill="currentColor" />Stop</button>
          <button type="button" onClick={recording.cancel} aria-label="Discard this recording" title="Discard this recording" className={icon}><X size={15} /></button>
        </span>
      </div>
    );
  }
  const has = !!(take || saved);
  return (
    <div data-sketch-recorder={status} className="text-sm">
      {has ? <Replay recording={recording} state={state} sketch={sketch} renderReplay={renderReplay} readOnly={readOnly} /> : !readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-sketch-record onClick={() => recording.start({ sketch })} className={button}>
            <Circle size={11} fill="currentColor" className="text-red-600" />Record sketch
          </button>
          <button type="button" data-sketch-record-audio aria-pressed={audio} onClick={() => recording.setAudio(!audio)}
            title={audio ? 'Your voice is recorded with the drawing' : 'Only the drawing is recorded; the microphone is not used'} className={button}>
            {audio ? <><Mic size={14} />Audio on</> : <><MicOff size={14} />Audio off</>}
          </button>
          <span className="text-xs text-ink-2">Up to {clock(limitMs)}</span>
        </div>
      )}
      <div aria-live="polite" className="text-xs">
        {status === 'saving' && <p className="mt-1 text-ink-2">Saving Sketch recording{progress?.total ? ` ${Math.min(99, Math.round((progress.sent / progress.total) * 100))}%` : ''}</p>}
        {notice && <p className="mt-1 text-ink-2">{notice}</p>}
        {error && (
          <p data-sketch-record-error={error.kind} className="mt-1 flex flex-wrap items-center gap-x-2 text-red-700">
            <span>{error.message}</span>
            {error.retryable && <button type="button" onClick={recording.retry} className="font-medium underline">{error.kind === 'upload' ? 'Retry' : 'Dismiss'}</button>}
          </p>
        )}
      </div>
    </div>
  );
}

// Replay: the sketch as it was at each moment, with the narration in step when there is one.
function Replay({ recording, state, sketch, renderReplay, readOnly }) {
  const audio = useRef(null);
  const [timeline, setTimeline] = useState(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [problem, setProblem] = useState('');
  const total = (state.take || state.saved)?.durationMs || 0;
  const narrated = !!(state.take?.timeline.narration || state.saved?.narration);
  const identity = state.take?.sha256 || state.saved?.hash;

  useEffect(() => { setTimeline(null); setOpen(false); setPlaying(false); setAt(0); setProblem(''); }, [identity]);
  // Without narration the replay runs on the page's frame clock.
  useEffect(() => {
    if (!playing || narrated) return undefined;
    let last = performance.now(), frame = 0;
    const step = now => {
      setAt(current => { const next = Math.min(total, current + (now - last)); if (next >= total) setPlaying(false); return next; });
      last = now; frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, narrated, total]);

  const ready = async () => {
    if (timeline) return timeline;
    try {
      const loaded = await recording.timeline();
      if (!loaded) { setProblem('This recording cannot be replayed here.'); return null; }
      setTimeline(loaded);
      if (narrated && audio.current && !audio.current.src) audio.current.src = (await recording.audioSource()) || '';
      return loaded;
    } catch { setProblem('This recording could not be loaded. Try again.'); return null; }
  };
  const toggle = async () => {
    if (playing) { audio.current?.pause(); setPlaying(false); return; }
    if (!(await ready())) return;
    setOpen(true);
    const from = at >= total ? 0 : at;
    setAt(from);
    if (narrated && audio.current) { audio.current.currentTime = from / 1000; audio.current.play().then(() => setPlaying(true), () => setProblem('The narration could not be played.')); }
    else setPlaying(true);
  };
  const seek = async ms => {
    if (!(await ready())) return;
    setOpen(true); setAt(ms);
    if (audio.current && narrated) audio.current.currentTime = ms / 1000;
  };

  return (
    <div className="flex flex-col gap-2">
      {open && timeline && (
        <div data-sketch-replay className="relative h-64 overflow-hidden rounded-lg border border-line">
          {renderReplay(stateAt(timeline, at))}
          <button type="button" onClick={() => { audio.current?.pause(); setPlaying(false); setOpen(false); }} aria-label="Close replay" title="Close replay"
            className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-md bg-surface text-ink-2 hover:bg-hover"><X size={14} /></button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1">
        {narrated && <audio ref={audio} preload="none" onTimeUpdate={e => setAt(e.currentTarget.currentTime * 1000)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setAt(total); }} />}
        <button type="button" data-sketch-replay-play onClick={toggle} aria-label={playing ? 'Pause replay' : 'Replay sketch recording'} title={playing ? 'Pause' : 'Replay'} className={icon}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <input type="range" data-sketch-replay-seek min={0} max={Math.max(1, total)} step={100} value={Math.min(Math.round(at), Math.max(1, total))}
          onChange={e => seek(Number(e.target.value))} aria-label="Sketch recording position" aria-valuetext={`${clock(at)} of ${clock(total)}`}
          className="h-1 min-w-24 flex-1 cursor-pointer accent-ink-2" />
        <span className="tabular-nums text-xs text-ink-2">{clock(at)} / {clock(total)}{narrated ? '' : ' · no audio'}</span>
        {!readOnly && (
          <span className="flex items-center">
            <button type="button" data-sketch-rerecord disabled={state.status === 'saving'} onClick={() => { audio.current?.pause(); setPlaying(false); recording.start({ sketch }); }}
              aria-label="Re-record Sketch recording" title="Re-record" className={icon}><RotateCcw size={15} /></button>
            <button type="button" data-sketch-record-remove onClick={() => { audio.current?.pause(); recording.remove(); }}
              aria-label="Remove Sketch recording" title="Remove" className={icon}><Trash2 size={15} /></button>
          </span>
        )}
        {problem && <p className="basis-full text-xs text-red-700">{problem}</p>}
      </div>
    </div>
  );
}
