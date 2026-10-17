// An imported 3D model, point cloud, Gaussian splat or CAD model on the canvas (file-imports Lane 4). Lazily imported by
// AdaptiveCanvas for `file` blocks of kind `model`; renders through the shared viewer (three-d-renderer.js).
//
// Interaction is explicit: the viewer is inactive until Interact (or a double-click on it). Inactive, the viewer area
// only selects the card - the wheel pans and zooms the canvas, keys are the canvas's, and a press never drags the card
// (the header strip does). Active, orbit / pan / zoom stay inside the viewer and Esc ends the interaction first. At most
// MAX_LIVE viewers hold a renderer (viewer-slots.js); off-screen or displaced ones show a poster. A lost graphics context
// pauses the viewer and never writes the card.
import { useEffect, useRef, useState } from 'react';
import { Download, FilePlus, Rotate3d, Scan, TriangleAlert } from 'lucide-react';
import { cacheAsset, cachedAsset } from './learn-asset-cache.js';
import { formatLabel, modelKindLabel } from './model-import.js';
import { addModelFiles, chooseModel, openModelFiles } from './model-storage.js';
import { MODEL_ACCEPT } from './model-drop.js';
import { headerCounts, overBudget, sizeLabel } from './model-formats.js';
import { activateViewer, claimViewer, deactivateViewer, releaseViewer } from './viewer-slots.js';
import { TERMINAL, cadCardState, cadFacts, fetchCadDerivatives, fetchCadJob } from './model-cad.js';

const OFFSCREEN_RELEASE_MS = 2000;
const posterKey = id => `poster:${id}`;
const n = value => value.toLocaleString('en-US');

function countLine(counts = {}) {
  if (counts.splats) return `${n(counts.splats)} splats`;
  if (counts.points) return `${n(counts.points)} points`;
  const parts = [];
  if (counts.triangles || counts.faces) parts.push(`${n(counts.triangles || counts.faces)} ${counts.triangles ? 'triangles' : 'faces'}`);
  if (counts.vertices) parts.push(`${n(counts.vertices)} vertices`);
  if (counts.textures) parts.push(`${counts.textures} texture${counts.textures === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export default function ModelCard({ block, selected, onChange, onSelect = null, board = null }) {
  const model = block.model || {};
  const root = useRef(null), host = useRef(null), engine = useRef(null), latest = useRef(block);
  latest.current = block;
  const [blob, setBlob] = useState(null), [pkg, setPkg] = useState(null), [problem, setProblem] = useState('');
  const [live, setLive] = useState(false), [visible, setVisible] = useState(false), [ready, setReady] = useState(false);
  const [active, setActive] = useState(false), [lost, setLost] = useState(false), [attempt, setAttempt] = useState(0);
  const [info, setInfo] = useState(null), [poster, setPoster] = useState(null), [report, setReport] = useState({ missing: [], blocked: [] });
  const [cad, setCad] = useState(null), [clips, setClips] = useState([]);
  const [job, setJob] = useState(null);
  const cadState = model.render === 'cad' ? cadCardState(block.fileRef, job) : null;
  // A STEP card with a job polls its status (read-only) until it ends; the derivative ids it reports are the card's own
  // cache of them, written only while the card still names that job (a late result never lands on another revision).
  useEffect(() => {
    const jobId = block.fileRef?.job; if (model.render !== 'cad' || !jobId) return;
    let stopped = false, timer = 0; const abort = new AbortController();
    const poll = async () => {
      try {
        const next = await fetchCadJob(jobId, board, abort.signal); if (stopped) return;
        setJob(next);
        if (TERMINAL.includes(next.state)) {
          const current = latest.current;
          if (next.derivatives?.mesh && current.fileRef?.job === jobId && !current.fileRef.derivatives?.mesh) onChange({ ...current, fileRef: { ...current.fileRef, derivatives: { ...current.fileRef.derivatives, ...next.derivatives } } });
          return;
        }
      } catch (error) { if (stopped) return; setJob(previous => previous || { state: 'queued' }); }
      timer = setTimeout(poll, 3000);
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); abort.abort(); };
  }, [block.fileRef?.job]);

  // The card's own files (model-storage.js: its fileRef sources, or the board asset), then what they hold.
  useEffect(() => {
    let live = true; setProblem(''); setPkg(null); setBlob(null);
    openModelFiles(latest.current).then(opened => { if (live) { setPkg(opened); setBlob(opened.download); } }, error => { if (live) setProblem(error.message); });
    cachedAsset(posterKey(block.id)).then(value => { if (live && typeof value === 'string') setPoster(value); }).catch(() => {});
    return () => { live = false; };
  }, [block.assetKey, block.fileRef?.source?.id, block.fileRef?.bundle?.length]);

  const entry = pkg?.plan.entries.find(e => e.path === model.entry) || null;
  const choices = !model.entry && model.entries?.length ? model.entries : null;
  const known = entry ? headerCounts(entry, pkg.files.get(entry.path)) : {};
  const limitation = entry?.limitation || overBudget(known) || null;
  const missing = [...new Set([...(entry?.missing || []), ...report.missing])], blocked = [...new Set([...(entry?.blocked || []), ...report.blocked])];
  const viewable = model.render === 'cad' ? ['ready', 'limited'].includes(cadState?.state) : !!(entry && !entry.error && !limitation);

  // Visible on screen (with a margin) -> ask for a renderer slot; off-screen for a while -> poster and give it back.
  useEffect(() => {
    const element = root.current; let timer = 0;
    const observer = new IntersectionObserver(([seen]) => {
      clearTimeout(timer);
      if (seen.isIntersecting) setVisible(true);
      else timer = setTimeout(() => setVisible(false), OFFSCREEN_RELEASE_MS);
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!viewable || !visible) { if (!active) { setLive(false); releaseViewer(block.id); } return; }
    setLive(claimViewer(block.id, () => setLive(false)));
  }, [viewable, visible, block.id, attempt]);
  useEffect(() => () => { releaseViewer(block.id); deactivateViewer(block.id); }, [block.id]);

  // The renderer, while this card holds a slot.
  useEffect(() => {
    if (!live || !host.current) return;
    let disposed = false, instance = null;
    setReady(false); setLost(false); setProblem(''); setReport({ missing: [], blocked: [] });
    const current = latest.current;
    const props = { modelUrl: '', camera: current.camera || {}, animation: current.animation || { autoplay: false }, animationTime: 0, autoRotate: false };
    const load = async context => {
      const { loadModel } = await import('./model-loaders.js');
      let files = pkg?.files, target = entry, units = model.units || null, facts = null;
      if (current.model?.render === 'cad') {
        const { mesh, structure } = await fetchCadDerivatives(current.fileRef, board);
        files = new Map([['model.glb', mesh]]); target = { path: 'model.glb', format: 'glb', render: 'mesh', deps: [] };
        facts = cadFacts(structure, job?.limitations); units = facts.units; setCad(facts);
      }
      const result = await loadModel({ files, entry: target, ...context });
      const over = overBudget(result.stats);
      if (over) { result.dispose(); throw new Error(`Preview limited: ${over}. The original is kept; download it to open it in a desktop viewer.`); }
      if (!disposed) { setReport(result.report); setInfo({ stats: result.stats, units: facts ? units : (result.units || units), kind: result.kind }); }
      return result;
    };
    import('./three-d-renderer.js').then(({ createThreeDRenderer }) => {
      if (disposed) return;
      instance = createThreeDRenderer(host.current, props, () => {}, (names, view) => {
        if (disposed) return;
        setClips(names);
        setInfo(previous => ({ ...previous, size: view?.size })); setReady(true);
        // The poster is the first good frame; kept in this browser only.
        requestAnimationFrame(() => { const still = instance?.poster(); if (still) { setPoster(still); cacheAsset(posterKey(block.id), still).catch(() => {}); } });
      }, message => { if (!disposed) setProblem(message); }, { load, onLost: () => { if (!disposed) { setLost(true); setActive(false); } } });
      engine.current = instance;
    }).catch(error => { if (!disposed) setProblem(error.message); });
    return () => {
      disposed = true;
      const still = instance?.poster(); if (still) { setPoster(still); cacheAsset(posterKey(block.id), still).catch(() => {}); }
      instance?.destroy(); engine.current = null; setReady(false);
    };
  }, [live, pkg, entry?.path, attempt]);

  // Interaction: only one viewer at a time; Esc, a press outside the card, or losing the selection ends it.
  const exit = () => {
    setActive(false); deactivateViewer(block.id); engine.current?.interact(false);
    const camera = engine.current?.camera();
    if (camera && JSON.stringify(camera) !== JSON.stringify(latest.current.camera || {})) onChange({ ...latest.current, camera });
  };
  const exitRef = useRef(exit); exitRef.current = exit;
  const enter = event => {
    if (!ready || lost) return;
    if (!selected) onSelect?.(block.id, event);
    activateViewer(block.id, () => exitRef.current());
    setActive(true); engine.current?.interact(true);
    requestAnimationFrame(() => host.current?.parentElement?.focus());
  };
  useEffect(() => { if (!selected && active) exit(); }, [selected]);
  useEffect(() => {
    if (!active) return;
    const outside = event => { if (!root.current?.contains(event.target)) exitRef.current(); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [active]);
  // The canvas pans on the wheel and drags on a press at its own elements; an active viewer keeps both for itself
  // (native listeners, so they hold whether the canvas listens through React or directly).
  useEffect(() => {
    const element = host.current?.parentElement; if (!element || !active) return;
    const keep = event => event.stopPropagation();
    element.addEventListener('wheel', keep, { passive: true }); element.addEventListener('pointerdown', keep);
    return () => { element.removeEventListener('wheel', keep); element.removeEventListener('pointerdown', keep); };
  }, [active, live]);

  const download = () => { if (!blob) return; const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = model.download || block.label || 'model'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const addFiles = async list => {
    try { onChange(await addModelFiles(latest.current, list, { blob })); } catch (error) { setProblem(error.message); }
  };
  const choose = path => { const e = pkg?.plan.entries.find(x => x.path === path); if (e) onChange(chooseModel(block, e)); };
  const stop = event => event.stopPropagation();
  // Animation clips the file carries (glTF, FBX): play/pause and which clip, kept on the card.
  const animation = block.animation || { autoplay: false };
  useEffect(() => { engine.current?.update({ modelUrl: '', camera: engine.current.camera() || latest.current.camera || {}, animation, animationTime: undefined, autoRotate: false }); }, [animation.autoplay, animation.clipName, ready]);

  const counts = info?.stats ? { ...known, ...info.stats } : known;
  // A CAD mesh is in metres; its size is shown in the STEP file's declared unit, and only when it declared one.
  const size = cad ? (cad.units && info?.size ? sizeLabel(info.size.map(v => v * cad.perMetre), cad.units) : null) : sizeLabel(info?.size, info?.units || model.units);
  const kind = modelKindLabel(entry ? { render: entry.render } : model);
  // A loader error when files are missing or were refused is about those files: say so, not the parser's words.
  const status = (problem && (missing.length || blocked.length) ? 'This model cannot be shown without the files listed below.' : problem) || (lost ? 'The graphics context was lost, so this viewer paused. The card is unchanged.' : '');
  return (
    <div ref={root} data-model-card data-model-format={model.format || ''} data-model-state={active ? 'active' : ready ? 'ready' : 'idle'} className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      <div data-drag-zone className="flex shrink-0 cursor-grab items-center gap-2 px-1 pb-2 active:cursor-grabbing">
        <span className="text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-2 uppercase"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-ink align-middle" />{kind}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3" title={block.label}>{block.label}</span>
        <div className="flex shrink-0 items-center gap-0.5" onPointerDown={stop}>
          {viewable && <button type="button" data-model-interact aria-pressed={active} disabled={!ready || lost} onClick={event => (active ? exit() : enter(event))} title={active ? 'Done (Esc)' : 'Interact: orbit, pan and zoom the model'} aria-label={active ? 'Done interacting' : 'Interact with the 3D view'}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium disabled:opacity-40 ${active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}><Rotate3d size={14} />{active ? 'Done' : 'Interact'}</button>}
          {viewable && <button type="button" data-model-fit disabled={!ready} onClick={() => engine.current?.fit()} title="Fit the model in view" aria-label="Fit the model in view" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40"><Scan size={14} /></button>}
          <button type="button" data-model-download disabled={!blob} onClick={download} title={`Download the original (${model.download || block.label})`} aria-label="Download the original file" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40"><Download size={14} /></button>
        </div>
      </div>
      <div data-pointer-body tabIndex={-1} {...(active ? { 'data-viewer-active': true } : {})} aria-label={`${kind} viewer${active ? ', interacting' : ''}`}
        onPointerDown={event => { if (active) stop(event); }} onDoubleClick={event => { stop(event); enter(event); }} onContextMenu={event => { if (active) event.preventDefault(); }}
        onKeyDown={event => { if (active && event.key === 'Escape') { event.preventDefault(); stop(event); exit(); } }}
        className={`relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-[#f4f5f7] outline-none ${active ? 'border-ink' : 'border-line'}`}>
        <div ref={host} className="h-full w-full" style={{ pointerEvents: active ? 'auto' : 'none' }} />
        {!live && poster && <img src={poster} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
        {/* Inactive: a plain surface over the viewer, so a press selects the card and the wheel reaches the canvas. */}
        {!active && <div className="absolute inset-0" />}
        {active && <p className="pointer-events-none absolute top-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-ink-2">Drag to orbit · Scroll to zoom · Right-drag to pan · Esc to finish</p>}
        {choices && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-4 text-center" onPointerDown={stop}>
          <p className="text-sm text-ink">This package holds {choices.length} models. Show:</p>
          <div className="flex max-h-40 flex-col gap-1 overflow-auto">{choices.map(choice => <button key={choice.path} type="button" data-model-choice={choice.path} onClick={() => choose(choice.path)} className="rounded-md border border-line px-3 py-1 text-left text-xs hover:bg-hover"><span className="font-mono">{choice.path}</span> <span className="text-ink-3">{choice.label}</span></button>)}</div>
        </div>}
        {cadState && !viewable && <div className="absolute inset-0 grid place-content-center gap-2 bg-white p-4 text-center text-xs text-ink-2"><p data-model-cad={cadState.state}>{cadState.label}</p></div>}
        {(limitation || entry?.error) && <div className="absolute inset-0 grid place-content-center gap-2 bg-white p-4 text-center text-xs text-ink-2"><TriangleAlert size={16} className="mx-auto" /><p data-model-limited>Preview limited: {entry?.error || limitation}. The original is kept; Download gives it back.</p></div>}
        {viewable && !ready && !status && !(!live && poster) && <p role="status" className="absolute inset-0 grid place-content-center text-xs text-ink-2">{live ? `Opening the ${kind.toLowerCase()}…` : 'Paused off-screen'}</p>}
        {!live && viewable && visible && !problem && <button type="button" data-model-show onPointerDown={stop} onClick={() => setAttempt(a => a + 1)} className="absolute right-2 bottom-2 rounded-md border border-line bg-white px-2 py-1 text-xs hover:bg-hover">Show 3D</button>}
        {status && <div className="absolute inset-0 grid place-content-center gap-2 bg-white/95 p-4 text-center text-xs text-ink-2" onPointerDown={stop}><p data-model-error>{status}</p>{(lost || problem) && blob && <button type="button" onClick={() => setAttempt(a => a + 1)} className="mx-auto rounded-md border border-line px-3 py-1 text-ink hover:bg-hover">Reload viewer</button>}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 text-[11px] text-ink-3">
        {entry && <span>{formatLabel(entry.format)}</span>}
        {countLine(counts) && <span data-model-counts>{countLine(counts)}</span>}
        {size && <span data-model-size title="Bounding box in the file's declared units">{size}</span>}
        {clips.length > 0 && <span className="flex items-center gap-1" onPointerDown={stop}>
          <button type="button" data-model-animation onClick={() => onChange({ ...block, animation: { ...animation, autoplay: !animation.autoplay } })} className="rounded border border-line px-1.5 py-0.5 text-ink-2 hover:bg-hover">{animation.autoplay ? 'Pause animation' : 'Play animation'}</button>
          {clips.length > 1 && <select aria-label="Animation clip" value={clips.includes(animation.clipName) ? animation.clipName : clips[0]} onChange={event => onChange({ ...block, animation: { ...animation, clipName: event.target.value } })} className="rounded border border-line px-1 py-0.5">{clips.map((name, index) => <option key={index} value={name}>{name || `Clip ${index + 1}`}</option>)}</select>}
        </span>}
        {cad?.parts != null && <span>{cad.parts} part{cad.parts === 1 ? '' : 's'}</span>}
        {cad && <span data-model-cad-note title={cad.limitations.join('\n') || 'Tessellated preview of the STEP file'}>Preview mesh: CAD features and tolerances are not kept</span>}
      </div>
      {(missing.length > 0 || blocked.length > 0) && <div data-model-missing className="mt-2 rounded-lg border border-line bg-hover px-3 py-2 text-xs text-ink-2" onPointerDown={stop}>
        {missing.length > 0 && <p>Missing from what was dropped: <span className="font-mono text-ink">{missing.join(', ')}</span></p>}
        {blocked.length > 0 && <p>Not loaded (outside the dropped files): <span className="font-mono break-all">{blocked.slice(0, 3).join(', ')}</span></p>}
        {missing.length > 0 && blob && <label className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-ink hover:bg-hover"><FilePlus size={12} />Add the missing files
          <input type="file" multiple accept={MODEL_ACCEPT} className="sr-only" onChange={event => { const list = [...(event.target.files || [])]; event.target.value = ''; if (list.length) addFiles(list); }} /></label>}
      </div>}
    </div>
  );
}
