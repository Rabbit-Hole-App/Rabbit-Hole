import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import { api } from '../api.js';
import { explainClient } from '../explain-client.js';
import { Frame } from '../AnimatedScene.jsx';
import { InputWidget } from '../SceneControls.jsx';
import { normalizeFrame } from './frame.js';
import { createProgramHost, programStamps } from './host.js';
import {
  clampTime, evaluateRequestFor, fixturesAdmitted, isCurrentReply, programChanged, programErrorMessage, programInputs, programTime, resetProgram, resolveProgram,
  setProgramInput,
} from './program-card.js';

// The interactive program card (plan sections 5.2 and 8): the existing Explanation card shell around the shared Frame. This file
// only draws and relays: the saved program runs in the host's isolated interpreter (host.js), its frame is validated and
// normalised (frame.js) and drawn by the same Frame every scene card uses. Nothing here evaluates generated source, reads source
// from the block, or calls a model; playing, scrubbing and input changes are local evaluations of the saved artifact.

const NOOP = () => {};
const STILL = { duration: 0 };

// One scalar control: the labelled range slider the scene cards' sliders use, with a readout that keeps its unit.
function NumberInput({ input, value, onInput }) {
  const decimals = input.step && input.step < 1 ? String(input.step).split('.')[1]?.length ?? 0 : 0;
  const shown = Number(value).toFixed(decimals);
  return (
    <div role="group" aria-label={input.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{input.label}:</span>
      <input type="range" data-input-control={input.id} min={input.min} max={input.max} step={input.step ?? (input.max - input.min) / 100} value={value}
        aria-label={input.label} aria-valuetext={`${shown}${input.unit ? ` ${input.unit}` : ''}`}
        onChange={event => onInput(input.id, Number(event.target.value), { live: true })} className="h-8 w-44 accent-accent" />
      <span data-input-readout={input.id} className="text-xs tabular-nums text-ink-2">{shown}{input.unit ? ` ${input.unit}` : ''}</span>
    </div>
  );
}

export default function ProgramScene({ block, onChange, onChangeQuiet, onControlsHeight = null }) {
  const [artifact, setArtifact] = useState(null);
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0); // "Restart explanation" bumps it: the same saved artifact, a fresh host
  const [hostReady, setHostReady] = useState(0);
  const [view, setView] = useState(null);
  const [time, setTime] = useState(block.time || 0);
  const [playing, setPlaying] = useState(false);
  const still = useReducedMotion();
  const latest = useRef(block);
  latest.current = block;
  const host = useRef(null);
  const counter = useRef(0);
  const frame = useRef(0);
  const controls = useRef(null);
  const manifest = artifact?.manifest ?? null;

  // Resolve the saved reference to a runnable artifact. A fixture card needs the build flag; an accepted program is fetched through
  // the authorized job route and must match this card's identity and saved hash (program-card.js).
  useEffect(() => {
    let live = true;
    setArtifact(null); setView(null); setFailure(null);
    (async () => {
      const current = latest.current;
      const boardId = current.explain?.canvas?.boardId;
      const out = await resolveProgram(current, { client: boardId ? explainClient(api, boardId) : null, fixtures: fixturesAdmitted(import.meta.env), stamps: await programStamps() });
      if (!live) return;
      if (out.ok) setArtifact(out.artifact); else setFailure(out.error);
    })();
    return () => { live = false; };
  }, [block.id, block.program?.bundleHash, block.program?.fixtureId, block.explain?.resultId, attempt]);

  // One host per artifact, disposed with the card (hidden, deleted, navigated away): a Worker is never left behind.
  useEffect(() => {
    if (!artifact) return undefined;
    const created = createProgramHost({ artifact });
    host.current = created;
    setHostReady(count => count + 1);
    return () => { if (host.current === created) host.current = null; created.dispose('card closed'); };
  }, [artifact]);

  const inputs = manifest ? programInputs(manifest, block) : null;
  const inputsKey = inputs ? JSON.stringify(inputs) : '';
  // Evaluate whenever the inputs or the moment change. The newest request wins: an answer for an older one is dropped.
  useEffect(() => {
    if (!manifest || !host.current) return undefined;
    let live = true;
    const id = ++counter.current;
    host.current.evaluate(evaluateRequestFor(manifest, latest.current, time, id)).then(reply => {
      if (!live || !isCurrentReply(reply, counter.current)) return;
      const out = normalizeFrame(reply.frame, manifest);
      if (out.ok) { setView(out); setFailure(null); } else setFailure(out.error);
    }, error => { if (live && id === counter.current && error?.name !== 'AbortError') setFailure(error); }); // a superseded or disposed request is not a failure
    return () => { live = false; };
  }, [manifest, hostReady, inputsKey, time]);

  const duration = manifest?.duration ?? 0;
  // Play advances real simulation time (the readouts are never rescaled); the loop is the scene card's.
  useEffect(() => {
    if (!playing || !duration) return undefined;
    const origin = performance.now() - time * 1000;
    const tick = now => {
      const next = (now - origin) / 1000;
      if (next >= duration) { setTime(duration); setPlaying(false); return; }
      setTime(next);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, duration]);
  // The paused moment is saved quietly (a view change, never an undo step), as the scene card does.
  useEffect(() => {
    if (playing || !manifest) return;
    const saved = Number(clampTime(manifest, time).toFixed(2));
    if (saved !== (latest.current.time ?? 0)) (onChangeQuiet || onChange)({ ...latest.current, time: saved });
  }, [playing, time, manifest]);
  // A hidden tab pauses playback instead of burning the interpreter.
  useEffect(() => {
    const hide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  // The controls row reports its real height so the card grows by it, as SceneControls does.
  useLayoutEffect(() => {
    if (!onControlsHeight || !controls.current) return undefined;
    const observer = new ResizeObserver(() => onControlsHeight(controls.current ? controls.current.offsetHeight + 8 : 0));
    observer.observe(controls.current);
    return () => { observer.disconnect(); onControlsHeight(0); };
  }, [onControlsHeight, manifest]);

  if (failure) {
    return (
      <div data-program-error={failure.code || 'runtime_error'} role="alert" className="grid min-h-24 place-content-center justify-items-center gap-2 p-4 text-center text-xs text-red-700">
        <span>{programErrorMessage(failure)}</span>
        <button type="button" data-program-restart onClick={() => { setPlaying(false); setAttempt(count => count + 1); }}
          className="flex h-8 items-center rounded-lg border border-line px-3 text-sm text-ink hover:bg-hover">Restart explanation</button>
      </div>
    );
  }
  if (!manifest || !view) return <div data-program-loading className="grid min-h-24 place-content-center p-4 text-center text-xs text-ink-2">Preparing the explanation</div>;

  const setInput = (name, value, { live = false } = {}) => {
    const next = setProgramInput(latest.current, manifest, name, value);
    if (next === latest.current) return;
    setPlaying(false);
    (live && onChangeQuiet ? onChangeQuiet : onChange)(next);
  };
  const atEnd = time >= duration - 0.001;
  const play = () => {
    if (still) { setTime(atEnd ? 0 : duration); return; } // reduced motion: show the end, do not travel to it
    if (atEnd && !playing) setTime(0);
    setPlaying(value => !value);
  };
  const reset = () => { setPlaying(false); setTime(0); onChange(resetProgram(latest.current)); };
  const rows = manifest.inputs;
  return (
    <div data-program-card className="flex min-h-0 flex-1 flex-col gap-2" onPointerDown={event => event.stopPropagation()}>
      <div data-program-frame role="group" aria-label={manifest.description} className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-white">
        <Frame scene={view.scene} state={view.state} selecting={false} marked={null} picked={null} pop={STILL} fixedView onPick={NOOP} onRegion={NOOP} />
      </div>
      <p className="sr-only">{manifest.summary}</p>
      {view.readouts.length > 0 && (
        <p data-program-readouts aria-live="polite" className="shrink-0 text-sm tabular-nums text-ink">
          {view.readouts.map(readout => `${readout.label}: ${readout.text}`).join(' · ')}
        </p>
      )}
      {duration > 0 && (
        <div data-animation-transport className="flex shrink-0 items-center gap-1.5">
          <button type="button" data-animation-play onClick={play} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-hover">
            {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
          <input type="range" aria-label="Explanation time" min={0} max={duration} step={0.05} value={time}
            onChange={event => { setPlaying(false); setTime(clampTime(manifest, Number(event.target.value))); }} className="h-8 min-w-0 flex-1 accent-accent" />
          <span data-program-time className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-2">{time.toFixed(1)}s</span>
        </div>
      )}
      {rows.length > 0 && (
        <div ref={controls} data-scene-controls className="shrink-0 rounded-lg border border-line bg-white px-3 pt-1.5 pb-2">
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">Interact</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {rows.map(input => (input.type === 'number'
              ? <NumberInput key={input.id} input={input} value={inputs[input.id]} onInput={setInput} />
              : <InputWidget key={input.id} declaration={{ name: input.id, type: 'choice', label: input.label, options: input.options.map(option => ({ id: option.value, label: option.label })) }}
                  value={inputs[input.id]} onInput={setInput} />))}
            {(programChanged(manifest, latest.current) || programTime(manifest, latest.current) > 0) && (
              <button type="button" data-scene-reset onClick={reset} className="flex h-8 items-center rounded-lg px-2.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">Reset experiment</button>
            )}
          </div>
        </div>
      )}
      {manifest.assumptions.length > 0 && <p data-program-assumptions className="shrink-0 text-[11px] text-ink-2">Assumes: {manifest.assumptions.join(' ')}</p>}
    </div>
  );
}
