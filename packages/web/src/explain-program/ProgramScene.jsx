import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import { api } from '../api.js';
import { explainClient, sharedProgramClient } from '../explain-client.js';
import { CardSourceScope } from '../use-card-source.js';
import { Frame } from '../AnimatedScene.jsx';
import { InputWidget } from '../SceneControls.jsx';
import { legibleFrame, normalizeFrame } from './frame.js';
import { createProgramHost, programStamps } from './host.js';
import { createFrameScheduler } from './playback.js';
import ProgramNotes from './ProgramNotes.jsx';
import {
  clampTime, evaluateRequestFor, fixturesAdmitted, keptProgram, programChanged, programErrorMessage, programInputs, programTime, resetProgram, resolveProgram,
  setProgramInput, shownProgram,
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

export default function ProgramScene({ block: saved, onChange: save, onChangeQuiet: saveQuiet, onControlsHeight = null, onProgramFrame = null }) {
  // On a share link (SharedBoardPage's CardSourceScope) the program is read by the link, and the visitor's inputs and time stay in
  // this card's memory: never saved (not the owner's board, not the visitor's tab copy), so a reload starts from the saved card.
  const scope = useContext(CardSourceScope);
  const token = scope?.token || null;
  const [local, setLocal] = useState(null);
  const block = token ? shownProgram(saved, local) : saved;
  const keep = next => setLocal(keptProgram(saved, next));
  const onChange = token ? keep : save, onChangeQuiet = token ? keep : saveQuiet;
  const [artifact, setArtifact] = useState(null);
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0); // "Restart explanation" bumps it: the same saved artifact, a fresh host
  const [hostReady, setHostReady] = useState(0);
  const [view, setView] = useState(null); // the drawn frame: normalizeFrame's result plus the time it was evaluated at
  const [time, setTime] = useState(block.time || 0); // the requested moment (the clock, the scrubber)
  const [epoch, setEpoch] = useState(0); // bumped by a jump in time (scrub, replay, reset): older answers are then never drawn
  const [box, setBox] = useState(null); // the legible frame box, from the first frame of this artifact (frame.js legibleFrame)
  const [playing, setPlaying] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false); // the viewer's own: never saved, never part of the card's derived size
  const notesId = useId();
  const still = useReducedMotion();
  const latest = useRef(block);
  latest.current = block;
  const host = useRef(null);
  const scheduler = useRef(null);
  const counter = useRef(0);
  const frame = useRef(0);
  const controls = useRef(null);
  const manifest = artifact?.manifest ?? null;

  // Resolve the saved reference to a runnable artifact. A fixture card needs the build flag; an accepted program is fetched through
  // its saved result (the owner's result route, or the link's program read) and must match this card's identity and saved hash (program-card.js).
  useEffect(() => {
    let live = true;
    setArtifact(null); setView(null); setFailure(null);
    (async () => {
      const current = latest.current;
      const boardId = current.explain?.canvas?.boardId;
      const client = token ? sharedProgramClient(token) : boardId ? explainClient(api, boardId) : null;
      const out = await resolveProgram(current, { client, fixtures: fixturesAdmitted(import.meta.env), stamps: await programStamps() });
      if (!live) return;
      if (out.ok) setArtifact(out.artifact); else setFailure(out.error);
    })();
    return () => { live = false; };
  }, [block.id, block.program?.bundleHash, block.program?.fixtureId, block.explain?.resultId, attempt, token]);

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
  // One frame scheduler per host (playback.js): it draws every completed frame of the current inputs and epoch, in order, and
  // settles on the exact requested moment. It is not torn down when the time changes, so a frame slower than one animation
  // frame is drawn instead of dropped.
  useEffect(() => {
    if (!manifest || !host.current) return undefined;
    const target = host.current;
    const created = createFrameScheduler({
      evaluate: job => target.evaluate(evaluateRequestFor(manifest, { ...latest.current, inputs: job.inputs }, job.time, ++counter.current)),
      show: (reply, job) => {
        const out = normalizeFrame(reply.frame, manifest);
        if (out.ok) { setView({ ...out, time: job.time }); setFailure(null); } else setFailure(out.error);
      },
      fail: error => setFailure(error),
    });
    scheduler.current = created;
    return () => { created.dispose(); if (scheduler.current === created) scheduler.current = null; };
  }, [manifest, hostReady]);
  useEffect(() => {
    if (manifest) scheduler.current?.want({ key: `${inputsKey}#${epoch}`, time: clampTime(manifest, time), inputs });
  }, [manifest, hostReady, inputsKey, epoch, time]);
  // The card's size comes from the artifact's first frame only (LearningBlocks sizeFor), so playback never resizes it.
  useEffect(() => { setBox(null); }, [artifact]);
  useEffect(() => {
    if (!view || box) return;
    const legible = legibleFrame(view.scene);
    setBox(legible);
    onProgramFrame?.(legible);
  }, [view, box, onProgramFrame]);

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
  // The rows under the frame (readouts, transport, Interact, assumptions) report their real height so the card grows by it, as
  // SceneControls does. They exist only once a frame is drawn, so the observer starts then (keyed on drawn, not on the manifest,
  // which arrives a render earlier and found no rows to observe).
  const drawn = !!(manifest && view);
  useLayoutEffect(() => {
    if (!onControlsHeight || !controls.current) return undefined;
    const observer = new ResizeObserver(() => onControlsHeight(controls.current ? controls.current.offsetHeight + 8 : 0));
    observer.observe(controls.current);
    return () => { observer.disconnect(); onControlsHeight(0); };
  }, [onControlsHeight, drawn]);
  // The drawing changes only when a new frame is drawn, not on every clock tick.
  const picture = useMemo(() => view && <Frame scene={view.scene} state={view.state} selecting={false} marked={null} picked={null} pop={STILL} fixedView onPick={NOOP} onRegion={NOOP} />, [view]);

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
  // A jump in time (not the clock running): answers asked for before it are never drawn after it.
  const seek = next => { setTime(next); setEpoch(count => count + 1); };
  const play = () => {
    if (still) { seek(atEnd ? 0 : duration); return; } // reduced motion: show the end, do not travel to it
    if (atEnd && !playing) seek(0);
    setPlaying(value => !value);
  };
  const reset = () => { setPlaying(false); seek(0); onChange(resetProgram(latest.current)); };
  const rows = manifest.inputs;
  // While playing, the time shown is the drawn frame's own moment, so the label never runs ahead of the picture; paused, it is
  // the requested moment, which the picture settles on within one evaluation (data-program-settling until then).
  const shownTime = playing ? view.time : time;
  // The frame keeps its legible box: a larger card draws it larger; a smaller one (a phone's Focus, a learner's resize) scrolls
  // the drawing inside its viewport instead of shrinking its text below the floors, and the rows below stay in view.
  const legible = box ?? legibleFrame(view.scene);
  return (
    <div data-program-card data-program-settling={(!playing && view.time !== clampTime(manifest, time)) || undefined} className="flex min-h-0 flex-1 flex-col gap-2"
      onPointerDown={event => event.stopPropagation()}>
      <div data-program-viewport className="flex min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-white">
        <div data-program-frame role="group" aria-label={manifest.description} className="flex-1" style={{ minWidth: legible.w, minHeight: legible.h }}>{picture}</div>
      </div>
      <p className="sr-only">{manifest.summary}</p>
      <div ref={controls} className="flex shrink-0 flex-col gap-2">
      {view.readouts.length > 0 && (
        // Each readout keeps one line and its value a fixed minimum width, so a changing number never rewraps the row
        // (and never resizes the card) during playback.
        <p data-program-readouts aria-live="polite" className="text-sm tabular-nums text-ink">
          {view.readouts.map((readout, index) => (
            <span key={readout.id}>
              <span className="inline-block whitespace-nowrap">{readout.label}: <span className="inline-block" style={{ minWidth: `${valueWidth(manifest, readout.id)}ch` }}>{readout.text}</span></span>
              {index < view.readouts.length - 1 && ' · '}
            </span>
          ))}
        </p>
      )}
      {duration > 0 && (
        <div data-animation-transport className="flex items-center gap-1.5">
          <button type="button" data-animation-play onClick={play} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-hover">
            {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
          <input type="range" aria-label="Explanation time" min={0} max={duration} step={0.05} value={time}
            onChange={event => { setPlaying(false); seek(clampTime(manifest, Number(event.target.value))); }} className="h-8 min-w-0 flex-1 accent-accent" />
          <span data-program-time className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-2">{shownTime.toFixed(1)}s</span>
        </div>
      )}
      {rows.length > 0 && (
        <div data-scene-controls className="rounded-lg border border-line bg-white px-3 pt-1.5 pb-2">
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
      {/* Notes (the manifest's assumptions): collapsed under the controls; opening grows the card by the rows' measured height. */}
      <ProgramNotes id={notesId} notes={manifest.assumptions} open={notesOpen} onToggle={() => setNotesOpen(value => !value)} />
      </div>
    </div>
  );
}

// The minimum width (ch) of a readout's value: a sign, three digits, its decimals and its unit. Static per manifest, so the
// readouts row keeps its layout while the numbers change; a longer value only widens its own item.
function valueWidth(manifest, id) {
  const definition = manifest.readouts.find(readout => readout.id === id);
  if (!definition) return 0;
  return 4 + (definition.decimals ? definition.decimals + 1 : 0) + (definition.unit ? definition.unit.length + 1 : 0);
}
