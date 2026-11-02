import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Pencil, RefreshCw } from 'lucide-react';
import { api } from './api.js';
import { Pill } from './ui.jsx';
import { CardPromptControl, PromptSlot } from './CardPrompt.jsx';
import { claimViewer, releaseViewer } from './viewer-slots.js';
import { watchSeen } from './explain-program/playback.js';
import { ANIMATION_JOB_EVENT, animationClient, animationProgress, animationRetry, animationRunning, animationStage, readyResult, RETRY_LABELS } from './animation3d/client.js';
import {
  artifactRefOf, cardPhase, detectWebGL, EXPERIENCE_LABELS, failureText, FIXTURE_LABEL, FIXTURE_NOTE, fixtureIdOf, INTERACT_LEGEND,
  jobOf, keyAction, KEYS_HINT, retryLabel, visibleControls, WEBGL_UNAVAILABLE,
} from './animation3d/card.js';
import { ANIMATION_FIXTURES } from './animation3d/fixtures.js';
import { cancelAnimationJob, createAnimationSaver, hydrateAnimation, landHydration, nextView, resumeAnimationJob, settleAnimationJob } from './animation3d/storage.js';
import { createAnimationRuntime } from './animation3d/runtime.js';
import { createAnimationRenderer } from './animation3d/renderer.js';
import { AnimationBoard } from './animation3d/board-context.js';
import { EXPLAIN_BRIEF_EVENT } from './explain-client.js';
import { createCardSession } from './animation3d/session.js';
import { editableTarget, useSceneInteraction } from './animation3d/interaction.js';
import { Actions, buttonClass, GamePanel, leadControls, PrimaryReadout, Readouts, ResetState, Settings, Toolbar } from './animation3d/Controls.jsx';

// The Animation card (`animation3d` block; plan section 4, AN-03): a live 3D scene a learner can watch, inspect, adjust or
// play, in the shared card shell. Header (Animation, title, experience, prompt), a working viewport that takes most of the card
// (never the text-card natural-height clamp) with an optional primary readout over it, the one toolbar right under it (playback,
// Reset view, Labels, Interact), the primary control (a game's moves) with the rest collapsed and the state reset beside them, and
// the footer (Edit, Ask). The scene runs in runtime.js and draws through renderer.js (both injectable for tests); this file only draws and
// relays. Nothing here calls a model: playing, adjusting and resetting are local to the accepted artifact.
//
// Props beyond the canvas's usual block/onChange/onChangeQuiet/selected/readOnly:
//   context   { kind: 'owner' | 'share' | 'publication' | 'embed' | 'fork', boardId } (storage.js hydrateAnimation); default: the
//             AnimationBoard context the owner's canvas provides. A saved card shows its honest placeholder without either
//   readArtifact(ref, { signal })  the durable result read (default: client.js result route)
//   onEdit()  the reviewed refinement path (proposal)     onAsk()  Ask Tutor with this card as context
//   createRuntime / createRenderer / webgl / fetchJson  tests inject stand-ins
const OFFSCREEN_RELEASE_MS = 2000;
const aborted = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

// The scene a card shows: a built-in example by its fixture name (its state kept in this page only), else the saved envelope
// hydrated by storage.js (owner only in the MVP; the artifact read through the result route, checked against its reference) and
// landed on the card as it is now, so edits made while it loaded win.
export const sceneLoader = ({ context: contextOf, readArtifact, latest }) => async (block, { signal }) => {
  const context = contextOf(); // read at load time: the canvas's board id can arrive after the card mounts
  const name = fixtureIdOf(block);
  if (name) {
    const fixture = ANIMATION_FIXTURES.find(entry => entry.name === name);
    if (!fixture) throw Object.assign(new Error('This example is not available.'), { retry: false });
    return { artifact: structuredClone(fixture.artifact), sim: null, view: null };
  }
  let off = false; // lane G's kill switch (results route execution.allowed false): the artifact is never run
  const read = async (ref, options) => { try { return await readArtifact(ref, options); } catch (error) { off = error?.code === EXECUTION_OFF; throw error; } };
  const result = await hydrateAnimation(block, { context, readArtifact: read, signal });
  if (result.status === 'aborted') throw aborted();
  if (off) throw Object.assign(new Error('3D animations are turned off right now. Your saved scene is kept.'), { code: EXECUTION_OFF, retry: true });
  if (result.status !== 'ready') throw Object.assign(new Error(result.message || 'The animation could not be loaded.'), { code: result.status, retry: result.retry });
  const landed = landHydration(latest(), result, { boardId: context?.boardId });
  if (!landed.ok) throw aborted();
  return { artifact: result.artifact, sim: landed.sim, view: landed.view };
};
const defaultReadArtifact = fetchJson => async (ref, { signal }) => {
  const answer = await animationClient(fetchJson, ref.boardId).result(ref.artifactId, { signal });
  if (answer?.execution?.allowed === false) throw Object.assign(new Error('execution off'), { code: EXECUTION_OFF });
  return answer?.artifact ?? null;
};
const EXECUTION_OFF = 'execution_off';

function Header({ title, experience, fixture }) {
  const slot = useContext(PromptSlot);
  useLayoutEffect(() => { slot?.claim(true); return () => slot?.claim(false); }, [slot?.claim]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-focus-hide>
      <div data-drag-zone className="-mx-4 -mt-3 mb-1 flex cursor-grab items-center justify-between gap-2 px-4 pt-3 pb-1 active:cursor-grabbing">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-2 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-ink" />Animation</span>
          {experience && <Pill data-animation-badge={experience} color="blue">{EXPERIENCE_LABELS[experience]}</Pill>}
          {fixture && <Pill data-animation-fixture color="yellow">{FIXTURE_LABEL}</Pill>}
        </span>
        {slot?.text && <span className="relative inline-block h-[17px] w-[3.25rem] shrink-0"><CardPromptControl text={slot.text} selected={slot.selected} className="absolute top-1/2 right-0 -translate-y-1/2" /></span>}
      </div>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{title}</p>
    </div>
  );
}

// A job still making this card's first version: the server's stage until its result lands here (storage.js settleAnimationJob binds
// it to this card, board, request and sources), Stop while it works, and the job's own Retry when it failed.
function AnimationPending({ block, onChange, onChangeQuiet, readOnly, fetchJson }) {
  const waiting = jobOf(block);
  const [job, setJob] = useState(null), [problem, setProblem] = useState(''), [busy, setBusy] = useState(false);
  const latest = useRef(block); latest.current = block;
  const client = useMemo(() => animationClient(fetchJson, waiting.boardId), [fetchJson, waiting.boardId]);
  // A ready job's result is read once and mapped onto the board's reference (client.js readyResult) before it may land.
  const apply = async data => {
    const polled = data?.job ?? null;
    setJob(polled);
    // A plan ready for review, or the job's failure explained: the chat showing its thread reloads it, so the plan and its Generate,
    // or the server's one failure message, appear (as /explain's brief).
    if (['awaiting_approval', 'failed'].includes(polled?.stage) && latest.current.animation3dJob?.stage !== polled.stage && waiting.threadId) window.dispatchEvent(new CustomEvent(EXPLAIN_BRIEF_EVENT, { detail: { threadId: waiting.threadId, jobId: waiting.id } }));
    const settled = polled?.stage === 'ready' ? await readyResult(polled, id => client.result(id)) : polled;
    if (!settled) { setProblem('The finished scene could not be read. Try again in a moment.'); return; }
    const out = settleAnimationJob(latest.current, settled, { boardId: waiting.boardId });
    if (out.action === 'apply') { latest.current = out.block; onChange(out.block); return; }
    // The stage rides on the card quietly so a reload shows where it was; not an undo step.
    if ((out.action === 'progress' || out.action === 'keep') && out.block !== latest.current) { latest.current = out.block; (onChangeQuiet || onChange)(out.block); }
  };
  // A failed card reads its job, and the job Revise plan made in its place (successor, followed to the newest), for what the server
  // has now. Still failed: its current recovery actions. Moved on (a Retry from another tab, or one whose answer was lost): the card
  // waits on it again (storage.js resumeAnimationJob), and once the canvas renders that, the poll below observes it and a ready result
  // lands through apply. GETs only: nothing is started, charged or posted again.
  const reconcile = async (live = () => true) => {
    let polled = (await client.get(waiting.id))?.job ?? null;
    for (let hop = 0; polled?.successor && hop < 20; hop++) polled = (await client.get(polled.successor))?.job ?? null; // bounded: a chain is one per Revise plan
    if (!live()) return;
    setJob(polled);
    const next = resumeAnimationJob(latest.current, polled);
    if (next !== latest.current) { latest.current = next; (onChangeQuiet || onChange)(next); }
  };
  const ended = ['failed', 'cancelled'].includes(waiting.stage);
  useEffect(() => {
    if (readOnly || waiting.stage === 'cancelled') return undefined;
    let live = true, timer;
    // A failed card (also after a reload) is reconciled once; it is not polled.
    if (ended) { reconcile(() => live).catch(error => { if (live) setProblem(error.message); }); return () => { live = false; }; }
    const poll = async () => {
      try { const data = await client.get(waiting.id); if (!live) return; setProblem(''); await apply(data); if (animationRunning(data?.job)) timer = setTimeout(poll, 2000); }
      catch (error) { if (live) setProblem(error.message); }
    };
    poll();
    // Generate, a refinement or Stop moved the job on from the chat: observe it again (a GET; it never advances the job).
    const again = event => { if (event.detail?.jobId === waiting.id) { clearTimeout(timer); poll(); } };
    window.addEventListener(ANIMATION_JOB_EVENT, again);
    return () => { live = false; clearTimeout(timer); window.removeEventListener(ANIMATION_JOB_EVENT, again); };
  }, [waiting.id, ended, client, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const acting = useRef(false);
  const act = async (name, body) => {
    if (acting.current) return;
    acting.current = true; setBusy(true); setProblem('');
    try {
      const data = await client.action(waiting.id, name, body);
      // Stop: the card stops waiting at once; a later result is refused (storage.js cancelAnimationJob).
      if (name === 'cancel') { const next = cancelAnimationJob(latest.current); latest.current = next; (onChangeQuiet || onChange)(next); setJob(data?.job ?? null); }
      // An accepted Retry or Revise plan: the card waits again on the job the server answered (polling restarts), quietly.
      else if (name === 'retry') { const next = resumeAnimationJob(latest.current, data?.job); setJob(data?.job ?? null); if (next !== latest.current) { latest.current = next; (onChangeQuiet || onChange)(next); } }
      else await apply(data);
    } catch (error) {
      setProblem(error.message);
      // A refused Retry (the offer changed meanwhile) or a lost answer (it may have been accepted): the card shows what the server has now.
      if (name === 'retry') reconcile().catch(() => {});
    } finally { acting.current = false; setBusy(false); }
  };
  const shown = job || { stage: waiting.stage, ...(waiting.message ? { failure: { message: waiting.message } } : {}) };
  const running = animationRunning(shown), progress = animationProgress(shown), retry = animationRetry(shown), failed = shown.stage === 'failed';
  const request = String(block.promptUsed || '').trim();
  return (
    <div data-animation-pending={shown.stage} className="flex min-h-[125px] flex-col items-start gap-3 pt-2">
      <div className="flex items-center gap-2">
        {running && !progress && <Loader2 aria-hidden size={16} className="shrink-0 text-ink-3 motion-safe:animate-spin" />}
        <p data-animation-stage aria-live="polite" className={`text-sm ${failed ? 'text-fail' : running ? 'shimmer' : 'text-ink-2'}`}>{animationStage(shown)}</p>
      </div>
      {progress && <StageProgress progress={progress} stage={animationStage(shown)} />}
      {request && failed && <p className="text-xs text-ink-2">Your request: {request}</p>}
      {problem && <p role="alert" className="text-xs text-fail">{problem}</p>}
      {!readOnly && (
        <div className="flex gap-1.5">
          {running && <button type="button" data-animation-stop disabled={busy} onClick={() => act('cancel')} className={buttonClass}>Stop</button>}
          {retry && <button type="button" data-animation-job-retry={retry} disabled={busy} onClick={() => act('retry', { expectedAttempt: shown.attempt, action: retry })} className={buttonClass}>
            <RefreshCw size={13} aria-hidden />{RETRY_LABELS[retry]}</button>}
        </div>
      )}
    </div>
  );
}

// Four segments after Generate: done are filled, the current one pulses (motion-safe), the rest are empty. A correction restarts at
// Build and says "Correcting"; there are no percentages or time guesses.
function StageProgress({ progress: { steps, current, correcting }, stage }) {
  return (
    <div className="flex w-full max-w-[260px] flex-col gap-1.5">
      <p data-animation-progress-label className="text-xs text-ink-3">{correcting ? 'Correcting' : `Step ${current + 1} of ${steps.length}`}</p>
      <div data-animation-progress role="progressbar" aria-label="Scene progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current + 1}
        aria-valuetext={correcting ? `Correcting: ${stage}` : `Step ${current + 1} of ${steps.length}, ${steps[current]}: ${stage}`} className="flex gap-1">
        {steps.map((name, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          return (
            <div key={name} className="flex flex-1 flex-col gap-1">
              <span data-animation-progress-step={state} data-step-name={name}
                className={`h-1.5 rounded-full ${state === 'done' ? 'bg-ink' : state === 'current' ? 'bg-accent motion-safe:animate-pulse' : 'bg-line-strong'}`} />
              <span aria-hidden className={`text-[11px] ${state === 'todo' ? 'text-ink-3' : 'text-ink-2'}`}>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnimationScene({ block, onChange, onChangeQuiet, selected, readOnly, onEdit, onAsk, context, readArtifact, createRuntime, createRenderer, webgl, fetchJson }) {
  const latest = useRef(block); latest.current = block;
  const root = useRef(null), scene = useRef(null), host = useRef(null), press = useRef(null);
  const viewerId = useRef(null); viewerId.current ||= `animation3d:${block.id}:${Math.random().toString(36).slice(2)}`;
  const descriptionId = useId();
  const webglOk = useMemo(() => webgl ?? detectWebGL(), [webgl]);
  const [view, setView] = useState(null), [hintOpen, setHintOpen] = useState(false), [visible, setVisible] = useState(false), [slot, setSlot] = useState(false);
  // Settled changes of the owner's saved card: storage.js's saver (bounded debounce, flushed with the board). A fixture card, a
  // read-only viewer and a share link keep theirs in this page only.
  const ref = artifactRefOf(block), refKey = ref ? `${ref.boardId}:${ref.artifactId}:${ref.revision}` : '';
  const saver = useRef(null);
  useEffect(() => {
    if (!ref || readOnly || context?.kind !== 'owner') return undefined;
    const write = apply => { const next = apply(latest.current); if (next !== latest.current) { latest.current = next; (onChangeQuiet || onChange)(next); } };
    const created = createAnimationSaver({ boardId: ref.boardId, cardId: block.id, write });
    saver.current = created;
    return () => { created.dispose(); if (saver.current === created) saver.current = null; };
  }, [refKey, block.id, readOnly, context?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const contextRef = useRef(context); contextRef.current = context;
  const session = useRef(null);
  session.current ||= createCardSession({
    loadScene: sceneLoader({ context: () => contextRef.current, readArtifact: readArtifact ?? defaultReadArtifact(fetchJson), latest: () => latest.current }),
    createRuntime, createRenderer: webglOk ? createRenderer : null, onUpdate: setView,
    persist: {
      simulation: sim => saver.current?.simulation(sim),
      view: ({ camera, selection }) => saver.current?.view(nextView(latest.current, { camera, selection })),
    },
  });
  const live = session.current;
  const state = view ?? live.state();
  const sourceKey = `${refKey}|${fixtureIdOf(block) ?? ''}`;
  useEffect(() => { live.start(latest.current); }, [block.id, sourceKey, context?.kind, context?.boardId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => live.dispose(), [live]);

  // On screen (with a margin) asks for one of the shared WebGL slots (viewer-slots.js MAX_LIVE); off screen for a while gives it
  // back, keeping a poster and the camera. The scene's state and readouts stay either way.
  useEffect(() => {
    if (!root.current || !globalThis.IntersectionObserver) { setVisible(true); return undefined; }
    let timer = 0;
    const observer = new IntersectionObserver(entries => { clearTimeout(timer); if (entries.at(-1).isIntersecting) setVisible(true); else timer = setTimeout(() => setVisible(false), OFFSCREEN_RELEASE_MS); }, { rootMargin: '200px' });
    observer.observe(root.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  const wantsSlot = webglOk && visible && !!state.artifact && state.failure?.stage !== 'renderer';
  useEffect(() => {
    const id = viewerId.current;
    if (wantsSlot) setSlot(claimViewer(id, () => setSlot(false)));
    else { setSlot(false); releaseViewer(id); }
  }, [wantsSlot]);
  useEffect(() => { if (slot && host.current) live.attach(host.current); else live.detach(); }, [slot, live]);
  useEffect(() => () => releaseViewer(viewerId.current), []);
  // A hidden tab or a card out of view pauses playback: coming back shows the same moment, paused.
  useEffect(() => watchSeen(root.current, () => live.pause()), [live]);

  const ready = state.renderer === 'ready';
  const interaction = useSceneInteraction({
    id: viewerId.current, root, surface: scene, ready,
    onEnter: () => live.interact(true),
    onExit: () => live.interact(false),
    onRelease: () => live.releaseGestures(interaction.active),
  });
  // Losing the selection ends the interaction, as on the CAD viewer.
  useEffect(() => { if (!selected && interaction.active) interaction.exit('outside'); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const phase = cardPhase({ block, artifact: state.artifact, failure: state.failure, webgl: webglOk, renderer: state.renderer });
  const model = state.model;
  const show = model ? visibleControls(model, { webgl: webglOk, readOnly }) : null;
  const lead = model ? leadControls(model) : null;
  const primaryReadout = state.readouts.find(item => item.id === lead?.readout) ?? null;
  const moves = model && show.game && !lead.primary; // a game's moves lead: drawn before any setting
  const resetScene = () => { setHintOpen(false); live.reset(); };
  const fixture = model?.fixture || !!fixtureIdOf(block);
  const poster = state.poster;
  const runtimeReady = state.runtime === 'ready';
  const values = state.pending ?? state.inputs;
  // The state reset sits beside the settings it affects, else with the moves, else on its own: one place, never twice.
  const reset = show?.reset ? <ResetState experience={model.experience} disabled={!runtimeReady || !state.changed} onReset={resetScene} /> : null;
  const resetWith = !model ? null : model.parameters.length ? 'settings' : model.actions.length ? 'actions' : 'alone';
  // A click (not the end of a drag across the card) enters the scene; a card without a slot asks for one first.
  const click = event => {
    const start = press.current; press.current = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    if (ready) interaction.enter(); else if (!slot && wantsSlot) setSlot(claimViewer(viewerId.current, () => setSlot(false)));
  };
  // The region under the viewport takes the wheel (data-scroll) only while it has something to scroll, as on the CAD card.
  const below = useRef(null), [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const element = below.current;
    if (!element || !globalThis.ResizeObserver) return undefined;
    const check = () => setScrolls(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(check); observer.observe(element); check();
    return () => observer.disconnect();
  }, [model]);
  const title = model?.title || block.title || 'Animation';
  // The scene's directional keys (artifact keys), only while this card interacts: the same validated path and disabled state as its
  // move buttons (session.js action), one move per press (a held key's repeats are taken but never sent, so nothing is ever held), and
  // never from a field, select, slider or dialog inside the card. A taken key goes no further: no page scroll, canvas nudge or camera move.
  const keys = model && Object.keys(model.keys).length > 0;
  const gameKey = event => {
    const action = keys && interaction.active ? keyAction(model.keys, event) : null;
    const dialog = action && event.target?.closest?.('[role="dialog"],[aria-modal="true"]');
    if (!action || editableTarget(event.target) || (dialog && root.current?.contains(dialog))) return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat && runtimeReady) live.action(action);
  };

  return (
    <div ref={root} data-animation3d-card data-animation-phase={phase} data-animation-experience={model?.experience}
      data-animation-time={model ? state.time.toFixed(3) : undefined} data-animation-duration={model?.loop?.duration}
      onKeyDownCapture={gameKey} className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3">
      <Header title={title} experience={model?.experience} fixture={fixture} />
      {fixture && (
        <div data-animation-fixture-note className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
          <span>{FIXTURE_NOTE}</span>
          {/* An example card switches among the built-in examples (M1 try-it path); a saved generated card never shows this. */}
          {fixtureIdOf(block) && (
            <label className="inline-flex items-center gap-1.5">
              <span>Example</span>
              <select data-animation3d-example value={fixtureIdOf(block)} disabled={readOnly}
                onChange={event => { const next = ANIMATION_FIXTURES.find(entry => entry.name === event.target.value); if (next) onChange({ ...latest.current, fixtureId: next.name, title: next.artifact.title }); }}
                className="h-7 rounded-lg border border-line bg-white px-1.5 text-xs text-ink disabled:text-ink-3">
                {ANIMATION_FIXTURES.map(entry => <option key={entry.name} value={entry.name}>{entry.artifact.title}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {/* The viewport: before Interact every press, drag and wheel here belongs to the canvas (it moves and selects the card);
          after it, they turn the scene until Esc, Done, a press outside or focus leaving. data-animation-frame: the last applied
          frame, for the browser checks. */}
      <div ref={scene} data-animation-viewport data-viewer-live={ready || undefined} data-viewer-active={interaction.active || undefined} tabIndex={-1}
        data-animation-frame={state.frame ? JSON.stringify(state.frame) : undefined}
        role="group" aria-label={interaction.active ? `${title} 3D scene, interacting` : `${title} 3D scene`} aria-describedby={descriptionId}
        {...interaction.handlers}
        className={`relative min-h-[240px] flex-1 overflow-hidden rounded-lg border bg-surface outline-none ${interaction.active ? 'border-ink' : 'border-line'}`}>
        <div ref={host} data-animation-host className="absolute inset-0" style={{ pointerEvents: interaction.active ? 'auto' : 'none' }} />
        {poster && !ready && <img data-animation-poster src={poster} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
        <PrimaryReadout item={primaryReadout} />
        {phase === 'loading' && <p role="status" className="pointer-events-none absolute inset-0 grid place-content-center p-4 text-center text-xs text-ink-2">{state.artifact && !slot && webglOk ? 'Click to show the 3D view' : 'Preparing the scene'}</p>}
        {phase === 'unavailable' && <p data-animation-webgl-unavailable role="status" className="absolute inset-x-0 bottom-0 border-t border-line bg-white p-2 text-xs text-ink-2">{WEBGL_UNAVAILABLE}</p>}
        {phase === 'recovery' && (
          <div role="alert" data-animation-failure={state.failure.stage} className="absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-line bg-white p-2 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
            <p>{failureText(state.failure)}{poster && state.failure.stage === 'renderer' ? ' The last captured view is shown.' : ''}</p>
            {state.failure.retry && <div><button type="button" data-animation-retry onClick={() => live.retry()} className={buttonClass}><RefreshCw size={13} aria-hidden />{retryLabel(state.failure)}</button></div>}
          </div>
        )}
        {webglOk && state.artifact && !interaction.active && phase !== 'recovery' && (
          <div data-animation-click-surface onPointerDown={event => { press.current = { x: event.clientX, y: event.clientY }; }} onClick={click} className="absolute inset-0 cursor-pointer" />
        )}
        {interaction.active && <p data-animation-legend className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-ink-2">{INTERACT_LEGEND}{keys && <span data-animation-keys-hint className="block">{KEYS_HINT}</span>}</p>}
      </div>
      <p id={descriptionId} data-animation-description className={phase === 'unavailable' ? 'text-xs text-ink' : 'sr-only'}>{model?.description || ''}</p>
      {/* The main toolbar, directly under the viewport and outside the scrolling region, so it is always in reach. */}
      {model && (
        <div onPointerDown={event => event.stopPropagation()}>
          <Toolbar show={show} seekable={!!model.loop?.seekable} playing={state.playing} status={runtimeReady && !state.failure} speed={state.speed} speeds={model.loop?.speeds ?? []}
            disabled={!runtimeReady} live={ready} interacting={interaction.active} optionalLabels={state.optionalLabels} labels={state.labels}
            onPlay={live.play} onPause={live.pause} onRestart={() => live.restart()} onSpeed={live.setSpeed} onResetView={live.resetView}
            onInteract={() => (interaction.active ? interaction.exit('exit') : interaction.enter())} onLabels={live.setLabels} />
        </div>
      )}
      {model && (
        <div ref={below} data-scroll={scrolls || undefined} data-animation-controls className="-mx-1 flex min-h-0 shrink flex-col gap-2 overflow-y-auto px-1" onPointerDown={event => event.stopPropagation()}>
          {show.game && <GamePanel goal={model.goal} status={state.goal} hintOpen={hintOpen} onHint={() => setHintOpen(open => !open)} />}
          {moves && <Actions actions={model.actions} disabled={!runtimeReady} reset={resetWith === 'actions' ? reset : null} onAction={id => live.action(id)} />}
          <Settings primary={lead.primary} secondary={lead.secondary} values={values} disabled={!runtimeReady} reset={resetWith === 'settings' ? reset : null}
            onChange={(id, value) => live.setParameter(id, value)} />
          {!moves && <Actions actions={model.actions} disabled={!runtimeReady} reset={resetWith === 'actions' ? reset : null} onAction={id => live.action(id)} />}
          {resetWith === 'alone' && reset && <div className="flex justify-end">{reset}</div>}
          <Readouts readouts={state.readouts.filter(item => item !== primaryReadout)} collapsed={!!primaryReadout} />
          {state.notice && <p role="status" data-animation-notice className="text-xs text-fail">{state.notice}</p>}
          {model.assumptions.length > 0 && (
            <details data-animation-assumptions className="text-xs text-ink-2">
              <summary className="cursor-pointer select-none">Assumptions</summary>
              <ul className="mt-1 list-disc pl-4">{model.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {model && ((show.edit && onEdit) || onAsk) && (
        <div data-animation-footer className="flex flex-wrap items-center gap-1.5" onPointerDown={event => event.stopPropagation()}>
          {show.edit && onEdit && <button type="button" data-animation-edit onClick={onEdit} className={buttonClass}><Pencil size={14} aria-hidden />Edit</button>}
          {onAsk && <button type="button" data-animation-ask onClick={onAsk} className={buttonClass}><MessageCircle size={14} aria-hidden />Ask Tutor</button>}
        </div>
      )}
    </div>
  );
}

export default function Animation3DCard({ block, onChange, onChangeQuiet, selected = true, readOnly = false, onEdit = null, onAsk = null, context = null, readArtifact = null,
  createRuntime = createAnimationRuntime, createRenderer = createAnimationRenderer, webgl = undefined, fetchJson = api }) {
  // Waiting on its first version: no saved scene and no example yet.
  const board = useContext(AnimationBoard); // the owner's canvas (LearnPage); a prop wins (tests, the Slash Commands window)
  if (jobOf(block) && !artifactRefOf(block) && !fixtureIdOf(block)) {
    return (
      <div data-animation3d-card data-animation-phase={cardPhase({ block })} className="flex min-h-0 flex-1 flex-col px-4 pb-3">
        <Header title={block.title || 'Animation'} experience={null} fixture={false} />
        <AnimationPending block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} readOnly={readOnly} fetchJson={fetchJson} />
      </div>
    );
  }
  // ponytail: a regeneration in flight on a card that already has a scene shows the scene only; its status line comes with AN-14's revisions.
  return <AnimationScene block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} selected={selected} readOnly={readOnly} onEdit={onEdit} onAsk={onAsk}
    context={context ?? board} readArtifact={readArtifact} createRuntime={createRuntime} createRenderer={createRenderer} webgl={webgl} fetchJson={fetchJson} />;
}
