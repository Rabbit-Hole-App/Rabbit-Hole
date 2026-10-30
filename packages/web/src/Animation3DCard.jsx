import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Pencil, RefreshCw, RotateCcw, Rotate3d } from 'lucide-react';
import { api } from './api.js';
import { Pill } from './ui.jsx';
import { CardPromptControl, PromptSlot } from './CardPrompt.jsx';
import { claimViewer, releaseViewer } from './viewer-slots.js';
import { watchSeen } from './explain-program/playback.js';
import { animationClient, animationResultBlock, animationRetry, animationRunning, animationStage } from './animation3d/client.js';
import {
  artifactRefOf, cardPhase, detectWebGL, EXPERIENCE_LABELS, failureText, FIXTURE_LABEL, FIXTURE_NOTE, fixtureIdOf, INTERACT_LEGEND,
  jobOf, posterOf, retryLabel, visibleControls, WEBGL_UNAVAILABLE, withSaved,
} from './animation3d/card.js';
import { ANIMATION_FIXTURES } from './animation3d/fixtures.js';
import { createCardSession } from './animation3d/session.js';
import { useSceneInteraction } from './animation3d/interaction.js';
import { Actions, buttonClass, GamePanel, Parameters, Readouts, Toolbar } from './animation3d/Controls.jsx';

// The Animation card (`animation3d` block; plan section 4, AN-03): a live 3D scene a learner can watch, inspect, adjust or
// play, in the shared card shell. Header (Animation, title, experience, prompt), a working viewport that fills the card
// (never the text-card natural-height clamp), the toolbar, the local parameter/action area, and the footer (Interact, Reset,
// Edit, Ask). The scene runs through the injected runtime and renderer (lane R's runtime.js and renderer.js); this file only
// draws and relays. Nothing here calls a model: playing, adjusting and resetting are local to the accepted artifact.
//
// Props beyond the canvas's usual block/onChange/onChangeQuiet/selected/readOnly:
//   createRuntime(options)  createRenderer(options)  lane R's factories (P wires the real ones); loadArtifact(block, { signal })
//   defaults to loadAnimationArtifact below
//   onEdit()  the reviewed refinement path (proposal)     onAsk()  Ask Tutor with this card as context
//   webgl     override the browser check (tests)          fetchJson  the app's api() (tests inject a stub)
const OFFSCREEN_RELEASE_MS = 2000;

// The default artifact source: a fixture card's built-in example by its name (fixtures.js), else the accepted result through the
// owner's result route (client.js). The session validates whatever comes back before anything runs or draws it.
// ponytail: artifactRef { id, boardId } and the { artifact } answer are proposed until lanes A and G hand back.
export const loadAnimationArtifact = fetchJson => async (block, { signal }) => {
  const name = fixtureIdOf(block);
  if (name) {
    const fixture = ANIMATION_FIXTURES.find(entry => entry.name === name);
    if (!fixture) throw new Error('This example is not available.');
    return structuredClone(fixture.artifact);
  }
  const ref = artifactRefOf(block);
  if (!ref?.id || !ref.boardId) throw new Error('This card has no saved scene.');
  return (await animationClient(fetchJson, ref.boardId).result(ref.id, { signal })).artifact;
};

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

// A confirmed job still making this card: the server's stage until the result attaches here, Stop while it works, and the
// job's own Retry when it failed (one targeted action; a double press sends one).
function AnimationPending({ block, onChange, onChangeQuiet, readOnly, fetchJson }) {
  const waiting = jobOf(block);
  const [job, setJob] = useState(null), [problem, setProblem] = useState(''), [busy, setBusy] = useState(false);
  const latest = useRef(block); latest.current = block;
  const client = useMemo(() => animationClient(fetchJson, waiting.boardId), [fetchJson, waiting.boardId]);
  const apply = data => {
    setJob(data.job);
    const next = data.result ? animationResultBlock(latest.current, data.job, data.result) : null;
    if (next) { onChange(next); return; }
    // The stage rides on the card quietly so a reload shows where it was; not an undo step.
    if (data.job?.stage && data.job.stage !== latest.current.animationJob?.stage) (onChangeQuiet || onChange)({ ...latest.current, animationJob: { ...latest.current.animationJob, stage: data.job.stage } });
  };
  useEffect(() => {
    if (readOnly) return undefined;
    let live = true, timer;
    const poll = async () => {
      try { const data = await client.get(waiting.id); if (!live) return; setProblem(''); apply(data); if (animationRunning(data.job)) timer = setTimeout(poll, 2000); }
      catch (error) { if (live) setProblem(error.message); }
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [waiting.id, client, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const acting = useRef(false);
  const act = async (name, body) => {
    if (acting.current) return;
    acting.current = true; setBusy(true); setProblem('');
    try { apply(await client.action(waiting.id, name, body)); } catch (error) { setProblem(error.message); } finally { acting.current = false; setBusy(false); }
  };
  const shown = job || { stage: waiting.stage };
  const running = animationRunning(shown), retry = animationRetry(shown), failed = shown.stage === 'failed';
  const request = String(block.promptUsed || '').trim();
  return (
    <div data-animation-pending={shown.stage} className="flex min-h-[125px] flex-col items-start gap-3 pt-2">
      <div className="flex items-center gap-2">
        {running && <Loader2 aria-hidden size={16} className="shrink-0 text-ink-3 motion-safe:animate-spin" />}
        <p data-animation-stage aria-live="polite" className={`text-sm ${failed ? 'text-fail' : running ? 'shimmer' : 'text-ink-2'}`}>{animationStage(shown)}</p>
      </div>
      {request && failed && <p className="text-xs text-ink-2">Your request: {request}</p>}
      {problem && <p role="alert" className="text-xs text-fail">{problem}</p>}
      {!readOnly && (
        <div className="flex gap-1.5">
          {running && <button type="button" data-animation-stop disabled={busy} onClick={() => act('cancel')} className={buttonClass}>Stop</button>}
          {retry && <button type="button" data-animation-job-retry disabled={busy} onClick={() => act('retry', { expectedAttempt: shown.attempt })} className={buttonClass}>
            <RefreshCw size={13} aria-hidden />{retry === 'retry_render' ? 'Render again' : 'Try again'}</button>}
        </div>
      )}
    </div>
  );
}

function AnimationScene({ block, onChange, onChangeQuiet, selected, readOnly, onEdit, onAsk, loadArtifact, createRuntime, createRenderer, webgl, fetchJson }) {
  const latest = useRef(block); latest.current = block;
  const root = useRef(null), scene = useRef(null), host = useRef(null), press = useRef(null);
  const viewerId = useRef(null); viewerId.current ||= `animation3d:${block.id}:${Math.random().toString(36).slice(2)}`;
  const descriptionId = useId();
  const webglOk = useMemo(() => webgl ?? detectWebGL(), [webgl]);
  const [view, setView] = useState(null), [hintOpen, setHintOpen] = useState(false), [visible, setVisible] = useState(false), [slot, setSlot] = useState(false);
  const session = useRef(null);
  session.current ||= createCardSession({
    loadArtifact: loadArtifact ?? loadAnimationArtifact(fetchJson), createRuntime, createRenderer: webglOk ? createRenderer : null, onUpdate: setView,
    // A share-link visitor or read-only viewer keeps the scene's state in memory only; the owner's settled changes save quietly.
    save: saved => { if (!readOnly) (onChangeQuiet || onChange)(withSaved(latest.current, saved)); },
  });
  const live = session.current;
  const state = view ?? live.state();
  const sourceKey = JSON.stringify([artifactRefOf(block), fixtureIdOf(block)]);
  useEffect(() => { live.start(latest.current); }, [block.id, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
    onExit: () => { live.releaseGestures(); live.interact(false); },
    onRelease: () => live.releaseGestures(),
  });
  // Losing the selection ends the interaction, as on the CAD viewer.
  useEffect(() => { if (!selected && interaction.active) interaction.exit('outside'); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const phase = cardPhase({ block, artifact: state.artifact, failure: state.failure, webgl: webglOk, renderer: state.renderer });
  const model = state.model;
  const show = model ? visibleControls(model, { webgl: webglOk, readOnly }) : null;
  const poster = state.poster || posterOf(block);
  const runtimeReady = state.runtime === 'ready';
  const values = state.pending ?? state.inputs;
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

  return (
    <div ref={root} data-animation3d-card data-animation-phase={phase} data-animation-experience={model?.experience} className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3">
      <Header title={model?.title || block.title || 'Animation'} experience={model?.experience} fixture={model?.fixture || !!fixtureIdOf(block)} />
      {(model?.fixture || fixtureIdOf(block)) && <p data-animation-fixture-note className="text-xs text-ink-2">{FIXTURE_NOTE}</p>}
      {/* The viewport: before Interact every press, drag and wheel here belongs to the canvas (it moves and selects the card);
          after it, they turn the scene until Esc, Done, a press outside or focus leaving. */}
      <div ref={scene} data-animation-viewport data-viewer-live={ready || undefined} data-viewer-active={interaction.active || undefined} tabIndex={-1}
        role="group" aria-label={interaction.active ? `${model?.title || 'Animation'} 3D scene, interacting` : `${model?.title || 'Animation'} 3D scene`} aria-describedby={descriptionId}
        {...interaction.handlers}
        className={`relative min-h-[180px] flex-1 overflow-hidden rounded-lg border bg-surface outline-none ${interaction.active ? 'border-ink' : 'border-line'}`}>
        <div ref={host} data-animation-host className="absolute inset-0" style={{ pointerEvents: interaction.active ? 'auto' : 'none' }} />
        {poster && !ready && <img data-animation-poster src={poster} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
        {phase === 'loading' && <p role="status" className="pointer-events-none absolute inset-0 grid place-content-center p-4 text-center text-xs text-ink-2">{state.artifact && !slot && webglOk ? 'Click to show the 3D view' : 'Preparing the scene'}</p>}
        {phase === 'unavailable' && <p data-animation-webgl-unavailable role="status" className="absolute inset-x-0 bottom-0 border-t border-line bg-white p-2 text-xs text-ink-2">{WEBGL_UNAVAILABLE}</p>}
        {phase === 'recovery' && (
          <div role="alert" data-animation-failure={state.failure.stage} className="absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-line bg-white p-2 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
            <p>{failureText(state.failure)}{poster && state.failure.stage === 'renderer' ? ' The last captured view is shown.' : ''}</p>
            <div><button type="button" data-animation-retry onClick={() => live.retry()} className={buttonClass}><RefreshCw size={13} aria-hidden />{retryLabel(state.failure)}</button></div>
          </div>
        )}
        {webglOk && state.artifact && !interaction.active && phase !== 'recovery' && (
          <div data-animation-click-surface onPointerDown={event => { press.current = { x: event.clientX, y: event.clientY }; }} onClick={click} className="absolute inset-0 cursor-pointer" />
        )}
        {interaction.active && <p data-animation-legend className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-ink-2">{INTERACT_LEGEND}</p>}
      </div>
      <p id={descriptionId} data-animation-description className={phase === 'unavailable' ? 'text-xs text-ink' : 'sr-only'}>{model?.description || ''}</p>
      {model && (
        <div ref={below} data-scroll={scrolls || undefined} data-animation-controls className="-mx-1 flex min-h-0 shrink flex-col gap-2 overflow-y-auto px-1" onPointerDown={event => event.stopPropagation()}>
          <Toolbar show={show} playing={state.playing} speed={state.speed} speeds={model.loop?.speeds ?? []} live={ready} disabled={!runtimeReady}
            onPlay={live.play} onPause={live.pause} onRestart={() => live.restart()} onSpeed={live.setSpeed} onResetView={live.resetView} />
          {show.game && <GamePanel goal={model.goal} status={state.goal} hintOpen={hintOpen} onHint={() => setHintOpen(open => !open)} />}
          <Parameters parameters={model.parameters} values={values} disabled={!runtimeReady} onChange={(id, value) => live.setParameter(id, value)} />
          <Actions actions={model.actions} disabled={!runtimeReady} onAction={id => live.action(id)} />
          <Readouts readouts={state.readouts} />
          {state.notice && <p role="status" data-animation-notice className="text-xs text-fail">{state.notice}</p>}
          {model.assumptions.length > 0 && (
            <details data-animation-assumptions className="text-xs text-ink-2">
              <summary className="cursor-pointer select-none">Assumptions</summary>
              <ul className="mt-1 list-disc pl-4">{model.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {model && (
        <div data-animation-footer className="flex flex-wrap items-center gap-1.5" onPointerDown={event => event.stopPropagation()}>
          {show.interact && <button type="button" data-animation-interact aria-pressed={interaction.active} disabled={!ready} onClick={() => (interaction.active ? interaction.exit('exit') : interaction.enter())} className={buttonClass}>
            <Rotate3d size={14} aria-hidden />{interaction.active ? 'Done' : 'Interact'}</button>}
          {show.reset && <button type="button" data-animation-reset disabled={!runtimeReady || !state.changed} onClick={() => { setHintOpen(false); live.reset(); }} className={buttonClass}><RotateCcw size={14} aria-hidden />Reset scene</button>}
          {show.edit && onEdit && <button type="button" data-animation-edit onClick={onEdit} className={buttonClass}><Pencil size={14} aria-hidden />Edit</button>}
          {onAsk && <button type="button" data-animation-ask onClick={onAsk} className={buttonClass}><MessageCircle size={14} aria-hidden />Ask Tutor</button>}
        </div>
      )}
    </div>
  );
}

export default function Animation3DCard({ block, onChange, onChangeQuiet, selected = true, readOnly = false, onEdit = null, onAsk = null,
  loadArtifact = null, createRuntime, createRenderer = null, webgl = undefined, fetchJson = api }) {
  const pending = !!jobOf(block) && !artifactRefOf(block) && !fixtureIdOf(block);
  if (pending) {
    return (
      <div data-animation3d-card data-animation-phase={cardPhase({ block })} className="flex min-h-0 flex-1 flex-col px-4 pb-3">
        <Header title={block.title || 'Animation'} experience={null} fixture={false} />
        <AnimationPending block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} readOnly={readOnly} fetchJson={fetchJson} />
      </div>
    );
  }
  return <AnimationScene block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} selected={selected} readOnly={readOnly} onEdit={onEdit} onAsk={onAsk}
    loadArtifact={loadArtifact} createRuntime={createRuntime} createRenderer={createRenderer} webgl={webgl} fetchJson={fetchJson} />;
}
