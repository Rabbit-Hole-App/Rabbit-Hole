import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import { api } from '../api.js';
import { explainClient, sharedProgramClient } from '../explain-client.js';
import { CardSourceScope } from '../use-card-source.js';
import { Frame } from '../AnimatedScene.jsx';
import { InputWidget } from '../SceneControls.jsx';
import { focusFrameBox, legibleFrame, normalizeFrame, readableScale } from './frame.js';
import { createProgramHost, programStamps } from './host.js';
import { createFrameScheduler, frameKey, watchSeen } from './playback.js';
import { useProgramState } from './use-program-state.js';
import ProgramNotes from './ProgramNotes.jsx';
import SourcesDisclosure from '../SourcesDisclosure.jsx';
import {
  clampTime, evaluateRequestFor, fixturesAdmitted, keptProgram, programChanged, programErrorMessage, programActivity, programInputs, programPlayback, programTime, rememberProgram, resetProgram, resolveProgram,
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

export default function ProgramScene({ block: saved, onChange: save, onChangeQuiet: saveQuiet, preview = false, onControlsHeight = null, onProgramFrame = null, onFile = null }) {
  // On a share link (SharedBoardPage's CardSourceScope) the program is read by the link, and the visitor's inputs and time stay in
  // this card's memory: never saved (not the owner's board, not the visitor's tab copy), so a reload starts from the saved card.
  // A Proposed preview (an Edit's candidate, ExplainEditBar) is the same: its inputs and time are this preview's own, and it never
  // calls the accepted card's save callbacks.
  const scope = useContext(CardSourceScope);
  const token = scope?.token || null;
  // The Slash Commands window's /explain example (SlashCommandPreview.jsx): its saved result is read from a bundled fixture
  // ({ client }), and the drawing is fitted whole to the window's card, as Focus fits it to the pane.
  const example = scope?.programExample || null;
  const ephemeral = !!token || preview;
  const [local, setLocal] = useState(null);
  const block = ephemeral ? shownProgram(saved, local) : saved;
  const keep = next => setLocal(keptProgram(saved, next));
  const onChange = ephemeral ? keep : save, onChangeQuiet = ephemeral ? keep : saveQuiet;
  const [artifact, setArtifact] = useState(null);
  const [sources, setSources] = useState(null); // Task 9.4: the result's sources, from the owner's result answer only
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
  const root = useRef(null);
  const [focusBox, setFocusBox] = useState(null); // in Focus only: the drawing's box (frame.js focusFrameBox)
  const manifest = artifact?.manifest ?? null;

  // Resolve the saved reference to a runnable artifact. A fixture card needs the build flag; an accepted program is fetched through
  // its saved result (the owner's result route, or the link's program read) and must match this card's identity and saved hash (program-card.js).
  useEffect(() => {
    let live = true;
    setArtifact(null); setSources(null); setView(null); setFailure(null);
    (async () => {
      const current = latest.current;
      const boardId = current.explain?.canvas?.boardId;
      const client = example ? example.client : token ? sharedProgramClient(token) : boardId ? explainClient(api, boardId) : null;
      const out = await resolveProgram(current, { client, fixtures: fixturesAdmitted(import.meta.env), stamps: await programStamps() });
      if (!live) return;
      // A Proposed preview never feeds the accepted card's description (program-card.js loaded): the Tutor describes the saved card.
      if (out.ok) { if (!preview) rememberProgram(current, out.artifact.manifest); setSources(out.sources ?? null); setArtifact(out.artifact); } else setFailure(out.error);
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
  // A schema 2 card's committed state (use-program-state.js): settled states saved quietly, a share-link visitor's kept in memory.
  // Its inputs are saved only together with the state they were committed with (never before their transition succeeds); until then the
  // controls show the pending values. A completed Reset is one undo step that saves the defaults and the new initial state together.
  const [pendingInputs, setPendingInputs] = useState(null);
  const programState = useProgramState({ host: host.current, hostKey: hostReady, artifact, block, time,
    persist: (next, how) => {
      if (how?.reset) { onChange({ ...resetProgram(latest.current), programState: next }); return; }
      const moved = JSON.stringify(programInputs(artifact.manifest, latest.current)) !== JSON.stringify(next.inputs);
      (onChangeQuiet || onChange)({ ...latest.current, inputs: next.inputs, ...(moved ? { inputRevision: (latest.current.inputRevision || 0) + 1 } : {}), programState: next });
      setPendingInputs(pending => (pending && JSON.stringify(pending) === JSON.stringify(next.inputs) ? null : pending));
    },
    fail: error => { setPendingInputs(null); setPlaying(false); setFailure(error); } });
  useEffect(() => { if (!preview) programActivity(latest.current, programState.last, programState.envelope?.revision ?? null); }, [programState.envelope, programState.last, preview]); // FX-61: the committed revision and the action it came from

  const inputs = manifest ? (programState.stateful ? pendingInputs ?? programState.envelope?.inputs ?? programInputs(manifest, block) : programInputs(manifest, block)) : null;
  // A schema 2 frame is drawn with the inputs its committed state was computed for; newer inputs wait for their own transition.
  const frameInputs = programState.envelope?.inputs ?? inputs;
  const inputsKey = inputs ? JSON.stringify(inputs) : '';
  // One frame scheduler per host (playback.js): it draws every completed frame of the current inputs and epoch, in order, and
  // settles on the exact requested moment. It is not torn down when the time changes, so a frame slower than one animation
  // frame is drawn instead of dropped.
  useEffect(() => {
    if (!manifest || !host.current) return undefined;
    const target = host.current;
    // A failed frame stops the card (playback.js: no retry loop). The clock stops too, so the next tick cannot redraw over the
    // message: without it a transient failure flashed the message for a few frames and the drawing came back.
    const stop = error => { setPlaying(false); setFailure(error); };
    const created = createFrameScheduler({
      evaluate: job => target.evaluate(evaluateRequestFor(manifest, { ...latest.current, inputs: job.inputs }, job.time, ++counter.current, job.state)),
      show: (reply, job) => {
        const out = normalizeFrame(reply.frame, manifest);
        if (out.ok) { if (!preview) rememberProgram(latest.current, manifest, { inputs: job.inputs, time: job.time, readouts: out.readouts, revision: job.revision ?? null }); setView({ ...out, time: job.time }); setFailure(null); } else stop(out.error);
      },
      fail: stop,
    });
    scheduler.current = created;
    return () => { created.dispose(); if (scheduler.current === created) scheduler.current = null; };
  }, [manifest, hostReady]);
  useEffect(() => {
    if (manifest && programState.ready) scheduler.current?.want({ key: frameKey(frameInputs, epoch, programState.envelope), time: clampTime(manifest, time), inputs: frameInputs, state: programState.envelope?.state ?? null, revision: programState.envelope?.revision ?? null });
  }, [manifest, hostReady, inputsKey, epoch, time, programState.ready, programState.envelope]);
  // The card's size comes from the artifact's first frame only (LearningBlocks sizeFor), so playback never resizes it.
  useEffect(() => { setBox(null); }, [artifact]);
  useEffect(() => {
    if (!view || box) return;
    const legible = legibleFrame(view.scene);
    setBox({ ...legible, minScale: readableScale(view.scene, legible) });
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
  useEffect(() => { if (!preview) programPlayback(latest.current, playing); }, [playing, preview]); // Task 9.3: the described moment is playing or paused
  // The rows under the frame (transport, Interact, Notes) report their real height so the card grows by it, as
  // SceneControls does. They exist only once a frame is drawn, so the observer starts then (keyed on drawn, not on the manifest,
  // which arrives a render earlier and found no rows to observe).
  // The failure message replaces the rows, so a failure ends this observer too; otherwise it keeps watching the removed rows and
  // the card stays short by their height after the drawing returns.
  const drawn = !!(manifest && view && !failure);
  // A hidden tab or a card out of view pauses playback instead of burning the interpreter (playback.js watchSeen; root exists once drawn).
  useEffect(() => watchSeen(root.current, () => setPlaying(false)), [drawn]);
  useLayoutEffect(() => {
    if (!onControlsHeight || !controls.current) return undefined;
    const observer = new ResizeObserver(() => onControlsHeight(controls.current ? controls.current.offsetHeight + 8 : 0));
    observer.observe(controls.current);
    return () => { observer.disconnect(); onControlsHeight(0); };
  }, [onControlsHeight, drawn]);
  // Focus (focus-adapter-explanation.js gives the card the whole pane): the drawing takes the room the pane leaves after the
  // card's own chrome and rows (collapsed Notes included), fitted by the smaller of the width and height scales and centred; it
  // shrinks to fit down to its readable scale (frame.js readableScale), and only under that is it drawn whole at that scale while
  // the focused card scrolls as one surface (index.css [data-focus-host]:has([data-program-viewport])). The fixed part (chrome, gaps, padding, both axes) is measured once on entering, while
  // the viewport still fills the leftover, so setting the box never feeds back into the room. Open Notes are not counted:
  // opening them grows the content, it never shrinks the drawing.
  useLayoutEffect(() => {
    // The window's example card is fitted the same way, whole (no readable-scale floor: its card is sized for its window).
    const card = root.current?.closest(example ? '[data-slash-card]' : '[data-block]');
    if (!card || !box) return undefined;
    let fixed = null;
    const measure = () => {
      const viewport = root.current?.querySelector('[data-program-viewport]'), rowsEl = controls.current;
      if ((!example && !card.hasAttribute('data-focus-host')) || !viewport || !rowsEl) { fixed = null; setFocusBox(null); return; }
      const notes = rowsEl.querySelector('[data-program-notes] > ul:not([hidden])');
      const rowsHeight = rowsEl.offsetHeight - (notes?.offsetHeight ?? 0);
      if (fixed === null) fixed = { w: card.clientWidth - viewport.clientWidth, h: card.clientHeight - viewport.clientHeight - rowsHeight };
      const next = focusFrameBox(box, { w: card.clientWidth - fixed.w, h: card.clientHeight - fixed.h - rowsHeight }, example ? 0 : box.minScale);
      setFocusBox(prev => (prev && prev.w === next.w && prev.h === next.h && prev.scroll === next.scroll ? prev : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    if (controls.current) observer.observe(controls.current);
    const marks = new MutationObserver(measure); // Focus sets data-focus-host on the card itself
    marks.observe(card, { attributes: true, attributeFilter: ['data-focus-host'] });
    return () => { observer.disconnect(); marks.disconnect(); };
  }, [box, drawn]);
  // The drawing changes only when a new frame is drawn, not on every clock tick.
  const pick = useRef(NOOP); // a click on a declared target (set below with the current state); any other object is not interactive
  const dragTo = useRef(NOOP), dragging = useRef(null); // a drag of a declared drag target (set below), and the one in progress
  const pointer = useRef(null), dragged = useRef(false); // the captured pointer of that drag; a click right after a moved drag is not a pick
  const dragIds = useMemo(() => (manifest?.targets ?? []).filter(target => target.drag).map(target => target.id), [manifest]);
  const picture = useMemo(() => view && <Frame scene={view.scene} state={view.state} selecting={false} marked={null} picked={null} pop={STILL} fixedView onPick={id => pick.current(id)} onRegion={NOOP} />, [view]);
  // A new artifact or host, or leaving the card, ends any drag in progress without sending anything more.
  useEffect(() => () => { dragging.current = null; pointer.current = null; }, [artifact, hostReady]);
  // The pointer side of a drag (Task 8.4), on the drawing's own container, so the shared Frame is unchanged: a press on a declared drag
  // target captures the pointer until it is released, cancelled or lost, and every point is read through the SVG's own screen transform
  // (getScreenCTM), so canvas zoom and pan, Focus scaling and letterboxing never reach the program. A press anywhere else is not a drag.
  const framePoint = event => {
    const matrix = event.currentTarget.querySelector('[data-animation-frame] svg')?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };
  const pointerDrag = {
    onPointerDown: event => {
      dragged.current = false;
      const id = event.button === 0 && event.target.closest?.('[data-animation-object]')?.getAttribute('data-animation-object');
      if (!id || !dragIds.includes(id)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = { id, pointerId: event.pointerId, moved: false };
      dragTo.current('start', id, framePoint(event));
    },
    onPointerMove: event => { const active = pointer.current; if (active?.pointerId !== event.pointerId) return; active.moved = true; dragTo.current('move', active.id, framePoint(event)); },
    onPointerUp: event => { const active = pointer.current; if (active?.pointerId !== event.pointerId) return; pointer.current = null; dragged.current = active.moved; dragTo.current('end', active.id, framePoint(event)); },
    // A cancelled or lost pointer ends the drag at its last point (no point given).
    onPointerCancel: event => { const active = pointer.current; if (active?.pointerId !== event.pointerId) return; pointer.current = null; dragTo.current('end', active.id, null); },
    onLostPointerCapture: event => { const active = pointer.current; if (active?.pointerId !== event.pointerId) return; pointer.current = null; dragTo.current('end', active.id, null); },
  };

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
    // A schema 2 change is a transition first: shown at once, saved only when it commits; one the queue refuses is neither.
    if (programState.stateful) {
      const next = setProgramInput({ ...latest.current, inputs }, manifest, name, value);
      if (next.inputs === inputs || next.inputs[name] === inputs[name]) return;
      if (!programState.dispatch({ type: 'input', input: name, value: next.inputs[name] }, { inputs: next.inputs, time })) return;
      setPlaying(false);
      setPendingInputs(next.inputs);
      return;
    }
    const next = setProgramInput(latest.current, manifest, name, value);
    if (next === latest.current) return;
    setPlaying(false);
    (live && onChangeQuiet ? onChangeQuiet : onChange)(next);
  };
  // Buttons and selections (schema 2): ordered transitions of the committed state, never a save of their own (the commit saves).
  // The latest inputs: any input change made before this press is already queued ahead of it.
  const act = event => { if (programState.dispatch(event, { inputs, time })) setPlaying(false); };
  const targets = manifest.targets ?? [], actions = manifest.actions ?? [];
  pick.current = id => { if (dragged.current) { dragged.current = false; return; } if (targets.some(target => target.id === id)) act({ type: 'select', target: id }); };
  // Drags (Task 8.4): bounded start/move/end events at points inside the viewport. A start the queue cannot hold is not begun; a
  // cancelled or lost pointer ends the drag at its last point, so a program is never left mid-drag.
  const viewport = manifest.viewport, inside = point => ({ x: Math.min(viewport?.width ?? 0, Math.max(0, point.x)), y: Math.min(viewport?.height ?? 0, Math.max(0, point.y)) });
  dragTo.current = (phase, id, point) => {
    if (!dragIds.includes(id)) return;
    if (phase === 'start') {
      const at = point && inside(point);
      dragging.current = at && programState.dispatch({ type: 'drag_start', target: id, ...at }, { inputs, time }) ? { target: id, ...at } : null;
      if (dragging.current) setPlaying(false);
      return;
    }
    const active = dragging.current;
    if (!active || active.target !== id) return;
    const at = point ? inside(point) : { x: active.x, y: active.y };
    if (phase === 'move') { dragging.current = { ...active, ...at }; programState.dispatch({ type: 'drag_move', target: id, ...at }, { inputs, time }); return; }
    dragging.current = null;
    programState.dispatch({ type: 'drag_end', target: id, ...at }, { inputs, time });
  };
  // The keyboard equivalent of a drag: an arrow key on a drag target's button moves it by a twentieth of the viewport (Shift: a
  // hundredth), as one start, move and end from where the frame draws it.
  const nudge = (id, event) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const object = step && view.scene.objects.find(item => item.semanticId === id);
    if (!object || !viewport) return;
    event.preventDefault();
    const { x = 0, y = 0, w = 0, h } = object.initialState, from = inside({ x: x + w / 2, y: y + (h ?? w) / 2 }), size = event.shiftKey ? 100 : 20;
    const to = inside({ x: from.x + step[0] * viewport.width / size, y: from.y + step[1] * viewport.height / size });
    dragTo.current('start', id, from); dragTo.current('move', id, to); dragTo.current('end', id, to);
  };
  const atEnd = time >= duration - 0.001;
  // A jump in time (not the clock running): answers asked for before it are never drawn after it.
  const seek = next => { setTime(next); setEpoch(count => count + 1); };
  const play = () => {
    if (still) { seek(atEnd ? 0 : duration); return; } // reduced motion: show the end, do not travel to it
    if (atEnd && !playing) seek(0);
    setPlaying(value => !value);
  };
  // A schema 2 Reset saves only once its initial state has been checked (persist above); a failed one keeps the last good state.
  const reset = () => { dragging.current = null; setPlaying(false); seek(0); if (programState.stateful) { setPendingInputs(null); programState.reset(programInputs(manifest, {})); } else onChange(resetProgram(latest.current)); };
  const rows = manifest.inputs;
  const changed = programChanged(manifest, latest.current) || programTime(manifest, latest.current) > 0 || programState.changed;
  // While playing, the time shown is the drawn frame's own moment, so the label never runs ahead of the picture; paused, it is
  // the requested moment, which the picture settles on within one evaluation (data-program-settling until then).
  const shownTime = playing ? view.time : time;
  // On the canvas the frame keeps its legible box: a larger card draws it larger; a smaller one (a learner's resize) scrolls the
  // drawing inside its viewport instead of shrinking its text below the floors. In Focus, focusBox sizes it (see the measure above).
  const legible = box ?? legibleFrame(view.scene);
  return (
    <div ref={root} data-program-card data-program-focus={focusBox ? (focusBox.scroll ? 'scroll' : 'fit') : undefined} data-program-settling={(!playing && view.time !== clampTime(manifest, time)) || undefined} className="flex min-h-0 flex-1 flex-col gap-2"
      onPointerDown={event => event.stopPropagation()}>
      <div data-program-viewport className="flex min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-white"
        style={focusBox ? { flex: 'none', width: focusBox.w + 2, height: focusBox.h + 2, overflow: 'hidden', alignSelf: 'safe center' } : undefined}>
        <div data-program-frame role="group" aria-label={manifest.description} className="flex-1" {...(dragIds.length ? pointerDrag : {})}
          style={{ ...(focusBox ? { flex: 'none', width: focusBox.w, height: focusBox.h, margin: '0 auto' } : { minWidth: legible.w, minHeight: legible.h }), ...(dragIds.length ? { touchAction: 'none' } : {}) }}>{picture}</div>
      </div>
      <p className="sr-only">{manifest.summary}</p>
      <div ref={controls} className="flex shrink-0 flex-col gap-2">
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
      {(rows.length > 0 || actions.length > 0 || targets.length > 0) && (
        <div data-scene-controls className="rounded-lg border border-line bg-white px-3 pt-1.5 pb-2">
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">Interact</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {rows.map(input => (input.type === 'number'
              ? <NumberInput key={input.id} input={input} value={inputs[input.id]} onInput={setInput} />
              : <InputWidget key={input.id} declaration={{ name: input.id, type: 'choice', label: input.label, options: input.options.map(option => ({ id: option.value, label: option.label })) }}
                  value={inputs[input.id]} onInput={setInput} />))}
            {/* Declared buttons, then the declared selectable objects (also clickable in the drawing): native buttons, so Tab, Enter and
                Space work. While the transition queue is full they are greyed and keep their names. */}
            {actions.length > 0 && (
              <div role="group" aria-label="Actions" className="flex flex-wrap items-center gap-1.5">
                {actions.map(action => (
                  <button key={action.id} type="button" data-program-action={action.id} disabled={programState.full} onClick={() => act({ type: 'action', action: action.id })}
                    className="flex h-8 items-center rounded-lg border border-line px-3 text-sm text-ink hover:bg-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent">{action.label}</button>
                ))}
              </div>
            )}
            {targets.length > 0 && (
              <div role="group" aria-label="Select" className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-ink-2">Select:</span>
                {targets.map(target => (
                  <button key={target.id} type="button" data-program-target={target.id} disabled={programState.full} onClick={() => act({ type: 'select', target: target.id })}
                    {...(target.drag ? { 'data-program-drag': '', 'aria-keyshortcuts': 'ArrowLeft ArrowRight ArrowUp ArrowDown', 'aria-description': 'Arrow keys move it', onKeyDown: event => nudge(target.id, event) } : {})}
                    className="flex h-8 items-center rounded-lg border border-line px-2.5 text-xs text-ink hover:bg-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent">{target.label}</button>
                ))}
              </div>
            )}
            {changed && (
              <button type="button" data-scene-reset onClick={reset} className="flex h-8 items-center rounded-lg px-2.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">Reset experiment</button>
            )}
          </div>
        </div>
      )}
      {/* Notes (the drawn frame's readouts as Values, the manifest's assumptions): collapsed under the controls; opening grows
          the card by the rows' measured height. */}
      <ProgramNotes id={notesId} notes={manifest.assumptions} values={view.readouts} open={notesOpen} onToggle={() => setNotesOpen(value => !value)} />
      {sources?.length > 0 && <SourcesDisclosure sources={sources} onFile={onFile} />}
      </div>
    </div>
  );
}
