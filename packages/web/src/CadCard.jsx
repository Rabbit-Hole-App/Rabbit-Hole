import { SlidePanel, Tip } from './ui.jsx';
import { useEffect, useRef, useState } from 'react';
import { Ban, Download, LoaderCircle, Maximize2, RefreshCw, Rotate3d, Ruler, Scan } from 'lucide-react';
import { api, apiFetch } from './api.js';
import { fileScope, scopeQuery } from './file-source-client.js';
import { inspectGlb, MAX_MODEL_BYTES } from './three-d-asset.js';
import { activateViewer, deactivateViewer, claimViewer, releaseViewer } from './viewer-slots.js';
import { holdViewerGestures } from './content-gestures.js';
import { cadArtifact, cadClient, cadRunning, cadStage, mergeCadBlock } from './cad-client.js';
import { BACKGROUND_LABELS, VIEWER_BACKGROUNDS, viewerBackground } from './cad-viewer-background.js';
import { dropView, publishView, useCadDimensions, useCadView } from './cad-viewer-store.js';
import { chunkGone, draftsPending, failedChunkUrl, moduleLoadFailed, reloadOnce, updateReloadBlock, workDurable } from './chunk-reload.js';
import { quickEditModel } from './cad-quick-edit-model.js';
import { CadQuickEdit } from './cad-quick-edit.jsx';
import { CadDetails } from './cad-details.jsx';
import { CadDimensionsOverlay } from './cad-dimensions-overlay.jsx';
import { useCadDraft, withDraft } from './cad-draft-store.js';

// Use the existing file scope for shared/member reads. Never forward its token
// or workspace headers to an artifact URL outside Rabbit Hole.
export function cadReadUrl(path, { ownerRead = false, scope = fileScope(), origin = window.location.origin } = {}) {
  const url=new URL(path,origin);
  if(url.origin!==origin || !/^\/api\/learn\/(files|cad\/jobs)\//.test(url.pathname))throw new Error('This CAD artifact has an invalid delivery URL.');
  // Unsaved proposed artifacts are readable by their source owner before board refs exist.
  // Shared/member pages and detached copies must retain reference-scoped authorization.
  const directOwner = ownerRead && !scope?.share && !scope?.member && url.pathname.startsWith('/api/learn/files/');
  if(directOwner){url.searchParams.delete('app');url.searchParams.delete('board');}
  for(const [key,value] of new URLSearchParams(scopeQuery(directOwner ? null : scope).slice(1)))url.searchParams.set(key,value);
  return `${url.pathname}${url.search}`;
}
const readUrl = cadReadUrl;
export function cadCanMutate(block, readOnly = false) {
  return !readOnly && !block?.cadDetached && !!block?.jobId;
}
// Status polls must not dirty the board, but accepted artifact references must
// reach autosave so another session and the file permission index can restore them.
export function cadPersistenceChanged(previous, next) {
  if (!next.revisionId) return false;
  return ['revisionId','sourceId','fileRef','manifest','acceptedManifest'].some(key =>
    JSON.stringify(previous?.[key] ?? null) !== JSON.stringify(next[key] ?? null));
}
// One saved artifact to the person's disk: the card's Download and the canvas context menu (AdaptiveCanvas) both use it.
export const CAD_DOWNLOADS = ['step','glb','stl','3mf'];
export async function downloadCadArtifact(artifact, ownerRead = false) {
  const response=await apiFetch(readUrl(artifact.url,{ownerRead}));
  if(!response.ok)throw new Error(`Download failed (${response.status})`);
  const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=artifact.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const button = 'rounded-md border border-line px-2 py-1 text-xs hover:bg-hover disabled:opacity-50';
// Icon-only controls (brief section 4): 32 px targets, a visible keyboard focus ring, a tooltip (Tip) and an aria-label.
// One class per property in each state (two bg- or border- classes would let stylesheet order pick the winner).
const iconBase = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50';
const iconIdle = 'bg-white text-ink-2 hover:bg-hover hover:text-ink';
const iconButton = `${iconBase} border-line ${iconIdle}`;
const iconOn = `${iconBase} border-ink bg-active text-ink`;
const OFFSCREEN_RELEASE_MS = 2000;
// A card's last camera per revision, so a viewer that gives its renderer slot up (off screen, or to a newer viewer) or
// reopens expanded comes back where the person left it. This page only: the card does not save a camera.
const cameras = new Map();
const BLOCKED = {
  offline: "You're offline, so the page will not reload. Your work stays on this page.",
  unsaved: 'Your latest canvas changes are not confirmed saved yet, so the page will not reload. Your work stays on this page.',
  draft: 'Text you typed is not sent or saved yet, so the page will not reload. Send or clear it first.',
  storage: 'This browser is not keeping data for this page, so a reload could lose work. The page will not reload.',
  repeat: 'The page reloaded for an update moments ago, so it will not reload again now.',
};
const session = () => { try { return window.sessionStorage; } catch { return null; } };
const reloadBlock = () => updateReloadBlock({ online: navigator.onLine, durable: workDurable(), drafts: draftsPending(document.querySelectorAll('textarea:not([readonly]):not([disabled]), input[data-cad-answer]')), storage: session() });

// The live 3D view of a saved model (owner clarification 4). It renders by default while on screen and holding one of the
// shared renderer slots (viewer-slots.js, MAX_LIVE); otherwise, and while loading, it shows the saved preview image. Until
// the person clicks into it (or presses Interact in the toolbar outside the card, CadViewerTools), a press selects the card;
// the wheel and pinch over a live viewer zoom the model, never the canvas; inside, orbit, pan and zoom stay in the viewer, and Esc, Done, a press outside or losing
// the selection ends it. A viewer whose module cannot load shows the preview with Retry and, only for a confirmed stale
// build, Reload to update (chunk-reload.js; clarification 8). `viewKey` names it to its toolbar (cad-viewer-store.js);
// `showDimensions` is the toolbar's ruler toggle: the dimensions overlay (cad-dimensions-overlay.jsx); `draftPending` says a
// Quick edit draft is not built yet, `highlight` the parameter in focus there.
export function CadPreview({ manifest, active = false, ownerRead = false, id = null, background = 'white', viewKey = null, selected = true, showDimensions = false, draftPending = false, highlight = null, minHeight = 'min-h-40' }) {
  const root = useRef(null), host = useRef(null), engine = useRef(null), press = useRef(null), viewerId = useRef(`cad-viewer:${crypto.randomUUID()}`), frame = useRef(null);
  const [visible,setVisible] = useState(false), [slot,setSlot] = useState(false), [interacting,setInteracting] = useState(false), [attempt,setAttempt] = useState(0);
  const [failure,setFailure] = useState(null), [ready,setReady] = useState(false), [poster,setPoster] = useState(null);
  const [tries,setTries] = useState(0), [stale,setStale] = useState(false), [blocked,setBlocked] = useState(null), [,setTick] = useState(0);
  const glb = cadArtifact(manifest,'glb'), thumb = cadArtifact(manifest,'thumbnail');
  const cameraKey = id && `${id}:${manifest?.revisionId || ''}`, colour = (glb || thumb) ? VIEWER_BACKGROUNDS[background] ?? null : null;
  const keepCamera = () => { const camera = engine.current?.camera(); if (camera && cameraKey) cameras.set(cameraKey, camera); };
  // On screen (with a margin) asks for a slot; off screen for a while gives it back.
  useEffect(()=>{
    let timer=0;const observer=new IntersectionObserver(([seen])=>{clearTimeout(timer);if(seen.isIntersecting)setVisible(true);else timer=setTimeout(()=>setVisible(false),OFFSCREEN_RELEASE_MS);},{rootMargin:'200px'});
    if(root.current)observer.observe(root.current);return()=>{clearTimeout(timer);observer.disconnect();};
  },[]);
  useEffect(()=>{
    if(active && visible && glb && !failure)setSlot(claimViewer(viewerId.current,()=>setSlot(false)));
    else if(!interacting){setSlot(false);releaseViewer(viewerId.current);}
  },[active,visible,glb?.url,failure,attempt]);
  useEffect(()=>()=>{releaseViewer(viewerId.current);deactivateViewer(viewerId.current);},[]);
  useEffect(()=>{
    if(!thumb?.url){setPoster(null);return;}
    let live=true,url;const abort=new AbortController();
    Promise.resolve().then(()=>apiFetch(readUrl(thumb.url,{ownerRead}),{signal:abort.signal})).then(response=>{if(!response.ok)throw Error('Preview image is unavailable.');return response.blob();}).then(blob=>{if(!live)return;url=URL.createObjectURL(blob);setPoster(url);}).catch(()=>{if(live)setPoster(null);});
    return()=>{live=false;abort.abort();if(url)URL.revokeObjectURL(url);};
  },[thumb?.url,ownerRead]);
  useEffect(() => {
    setReady(false);
    if (!slot || !glb) return;
    let disposed=false, instance; const abort=new AbortController();
    // The renderer reports a failure by its message; a module that could not load is told apart by those words.
    const fail=problem=>{if(!disposed){setReady(false);setFailure({message:String(problem?.message ?? problem),module:moduleLoadFailed(problem),url:failedChunkUrl(problem,window.location.origin)});}};
    import('./three-d-renderer.js').then(({createThreeDRenderer})=>{
      if(disposed) return;
      const load=async context=>{
        const response=await apiFetch(readUrl(glb.url,{ownerRead}),{signal:abort.signal});
        if(!response.ok)throw new Error(`Model download failed (${response.status})`);
        if(Number(response.headers.get('content-length'))>MAX_MODEL_BYTES){await response.body?.cancel();throw new Error('Preview exceeds the 20 MB viewer limit. Download STEP to inspect the model.');}
        const chunks=[],reader=response.body.getReader();let size=0;
        try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_MODEL_BYTES){await reader.cancel();throw new Error('Preview exceeds the 20 MB viewer limit.');}chunks.push(value);}}finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}inspectGlb(bytes.buffer);
        const {loadModel}=await import('./model-loaders.js');
        return loadModel({files:new Map([['model.glb',bytes]]),entry:{path:'model.glb',format:'glb',render:'mesh',deps:[]},...context});
      };
      instance=createThreeDRenderer(host.current,{modelUrl:'',camera:cameras.get(cameraKey)||{},animation:{autoplay:false},animationTime:0,autoRotate:false},()=>{},()=>{if(!disposed)setReady(true);},fail,{load,background:colour,onFrame:()=>frame.current?.()});
      engine.current=instance;
    }).catch(fail);
    return ()=>{disposed=true;abort.abort();keepCamera();instance?.destroy();engine.current=null;};
  },[slot,glb?.url,ownerRead,attempt]);
  useEffect(()=>{engine.current?.background(colour);},[colour,ready]);
  // Interaction: one viewer at a time (activateViewer ends another's).
  const exit=()=>{setInteracting(false);deactivateViewer(viewerId.current);engine.current?.interact(false);keepCamera();};
  const exitRef=useRef(exit);exitRef.current=exit;
  const enter=()=>{if(!ready)return;activateViewer(viewerId.current,()=>exitRef.current());setInteracting(true);engine.current?.interact(true);requestAnimationFrame(()=>root.current?.focus({preventScroll:true}));};
  useEffect(()=>{if((!active || !selected) && interacting)exit();},[active,selected]);
  useEffect(()=>{
    if(!interacting)return;
    // A press outside the viewer and its toolbar ends the interaction; Esc anywhere hands control back to the canvas and
    // goes no further (it neither deselects the card nor closes the expanded panel).
    const outside=event=>{if(!root.current?.contains(event.target) && !event.target.closest?.('[data-cad-tools]'))exitRef.current();};
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();exitRef.current();}};
    // A native listener, so it holds before the canvas's own native press handler.
    const element=root.current,keep=event=>event.stopPropagation();
    document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',escape,true);element.addEventListener('pointerdown',keep);
    return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',escape,true);element.removeEventListener('pointerdown',keep);};
  },[interacting]);
  // Stale build: checked only once Retry has failed too, against the chunk the browser named.
  useEffect(()=>{if(!failure?.module || !tries)return;let live=true;chunkGone(failure.url).then(gone=>{if(live)setStale(gone);});return()=>{live=false;};},[failure,tries]);
  // While Reload to update is offered, what blocks it is read again every 2 s (a save may land, a draft may be sent).
  useEffect(()=>{if(!stale)return;const timer=setInterval(()=>setTick(n=>n+1),2000);return()=>clearInterval(timer);},[stale]);
  const retry=()=>{setTries(n=>n+1);setFailure(null);setStale(false);setBlocked(null);setAttempt(n=>n+1);};
  const reload=()=>{const why=reloadBlock();if(why){setBlocked(why);return;}if(!reloadOnce(session(),Date.now())){setBlocked('repeat');return;}window.location.reload();};
  const why=stale ? blocked || reloadBlock() : null;
  // A click (not the end of a drag across the viewer) enters; a paused viewer first takes a slot back.
  const click=event=>{const start=press.current;press.current=null;if(start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>4)return;if(!slot){setAttempt(n=>n+1);return;}enter();};
  const live=slot && ready && !failure;
  // The wheel and pinch over a live viewer zoom the model only, hover is enough (owner, 2026-10-22; content-gestures.js).
  useEffect(()=>{if(!live || !root.current)return undefined;return holdViewerGestures(root.current,()=>engine.current);},[live]);
  // The toolbar's handle on this viewer: one object for the viewer's life, calling the current functions.
  const handle=useRef(null), current=useRef({});current.current={enter,exit,fit:()=>engine.current?.fit()};
  handle.current ||= {enter:()=>current.current.enter(),exit:()=>current.current.exit(),fit:()=>current.current.fit()};
  useEffect(()=>{if(viewKey)publishView(viewKey,{live,interacting,api:handle.current});},[viewKey,live,interacting]);
  useEffect(()=>()=>{if(viewKey)dropView(viewKey);},[viewKey]);
  const notice=!failure ? null : !failure.module ? `The model preview could not load: ${failure.message}` : !navigator.onLine ? "You're offline, so the 3D viewer could not load." : stale ? 'This tab is running an older version of Rabbit Hole, so the 3D viewer could not load.' : 'The 3D viewer could not load.';
  return <div ref={root} data-cad-viewer data-cad-background={background} data-cad-dimensions={showDimensions ? 'on' : 'off'} data-viewer-live={live || undefined} data-viewer-active={interacting || undefined} tabIndex={-1} aria-label={interacting ? '3D model viewer, interacting' : '3D model viewer'}
    style={colour ? { background: colour } : undefined}
    className={`relative ${minHeight} flex-1 overflow-hidden rounded-lg border outline-none ${interacting ? 'border-ink' : 'border-line'}`}
    onContextMenu={event=>{if(interacting){event.preventDefault();event.stopPropagation();}}}
    onKeyDown={event=>{if(interacting)event.stopPropagation();}}>
    <div ref={host} className="absolute inset-0" style={{ pointerEvents: interacting ? 'auto' : 'none' }}/>
    {showDimensions && <CadDimensionsOverlay manifest={manifest} engine={engine} frame={frame} live={live} draftPending={draftPending} highlight={highlight}/>}
    {poster && !live && <img data-cad-poster src={poster} alt={manifest?.title || 'CAD model preview'} className="pointer-events-none absolute inset-0 h-full w-full object-contain"/>}
    {!glb && !poster && <p className="p-5 text-center text-xs text-ink-2">The interactive preview is not available yet.</p>}
    {/* Not a control (those are outside the card, CadViewerTools): the surface a click into the model enters from. */}
    {glb && !interacting && !failure && <div data-cad-click-surface onPointerDown={event=>{press.current={x:event.clientX,y:event.clientY};}} onClick={click} className="absolute inset-0 cursor-pointer"/>}
    {glb && !interacting && !failure && !live && <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-ink-2">{slot ? 'Opening the 3D view' : 'Click to show the 3D view'}</p>}
    {interacting && <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-ink-2">Drag to orbit · Scroll to zoom · Right-drag to pan · Esc to finish</p>}
    {failure && <div role="status" data-cad-viewer-fallback={failure.module ? 'module' : 'model'} className="absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-line bg-white p-2 text-xs text-ink-2" onPointerDown={event=>event.stopPropagation()}>
      <p data-cad-viewer-notice>{notice}{poster ? ' The saved preview is shown.' : ''}{why && <span className="block pt-0.5">{BLOCKED[why]}</span>}</p>
      <div className="flex flex-wrap gap-1"><button type="button" data-cad-viewer-retry className={`${button} inline-flex h-8 items-center gap-1 bg-white text-ink`} onClick={retry}><RefreshCw size={13} aria-hidden/>Retry</button>
      {stale && <button type="button" data-cad-reload-update disabled={!!why} className={`${button} h-8 bg-white text-ink`} onClick={reload}>Reload to update</button>}</div>
    </div>}
  </div>;
}
// Interact, Fit view and Show dimensions, outside the card (cad-controls brief, placement requirement): the selected card's
// toolbar row (AdaptiveCanvas LessonBlockCard) and the expanded panel's toolbar. Fit view frames the model in its own
// viewport; it never moves or zooms the canvas. A press here never deselects the card or blurs the viewer. `ruler` false: a
// model with no dimensions to show (the Slash commands window's /3d scene, LearningBlocks ThreeDBody) offers no Show dimensions.
export function CadViewerTools({ viewKey, account = '', cardId, ruler = true }) {
  const view = useCadView(viewKey), [dimensions, setDimensions] = useCadDimensions(account, cardId);
  const tool = `${iconBase} border-transparent ${iconIdle}`;
  return <div role="toolbar" aria-label="3D view" data-cad-tools={viewKey} data-thumbnail-hide onPointerDown={event=>{event.preventDefault();event.stopPropagation();}}
    className="flex w-max items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-md">
    <Tip label={view.interacting ? 'Done (Esc)' : 'Interact'} info={view.interacting ? 'Give the pointer back to the canvas' : 'Orbit, pan and zoom the model'}><button type="button" data-cad-interact aria-pressed={view.interacting} disabled={!view.live} onClick={()=>(view.interacting ? view.api?.exit() : view.api?.enter())}
      className={`${view.interacting ? `${iconBase} border-ink bg-ink text-white` : tool} gap-1 px-2 text-xs font-medium`}><Rotate3d size={15} aria-hidden/>{view.interacting ? 'Done' : 'Interact'}</button></Tip>
    <Tip label="Fit view"><button type="button" data-cad-fit aria-label="Fit view" disabled={!view.live} onClick={()=>view.api?.fit()} className={tool}><Scan size={15} aria-hidden/></button></Tip>
    {ruler && <Tip label="Show dimensions" align="end"><button type="button" data-cad-dimensions-toggle aria-label="Show dimensions" aria-pressed={dimensions} onClick={()=>setDimensions(!dimensions)} className={dimensions ? iconOn : tool}><Ruler size={15} aria-hidden/></button></Tip>}
  </div>;
}
function BackgroundControl({ value, onChange }) {
  return <div role="group" aria-label="Viewer background" data-cad-background-control className="flex items-center gap-0.5">
    {Object.keys(VIEWER_BACKGROUNDS).map(key=><Tip key={key} label={BACKGROUND_LABELS[key]} align="end"><button type="button" data-cad-background-option={key} aria-label={BACKGROUND_LABELS[key]} aria-pressed={value===key} onClick={()=>onChange(key)}
      className={value===key ? iconOn : iconButton}>{key==='none' ? <Ban size={16} aria-hidden/> : <span aria-hidden className="h-4 w-4 rounded-full border border-line-strong" style={{ background: VIEWER_BACKGROUNDS[key] }}/>}</button></Tip>)}
  </div>;
}
// `account`: whose viewing preferences (Show dimensions) and Quick edit drafts this browser keeps.
export default function CadCard({block,onChange,onChangeQuiet,appName,selected=false,readOnly=false,onEdit,account=''}) {
  const mutable=cadCanMutate(block,readOnly);
  const client=cadClient((path,options)=>api((options?.method || 'GET')==='GET'?readUrl(path):path,options),appName), latest=useRef(block); latest.current=block;
  const [job,setJob]=useState(null),[manifest,setManifest]=useState(block.manifest || null),[error,setError]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false),[expanded,setExpanded]=useState(false),[elapsed,setElapsed]=useState(0),[downloads,setDownloads]=useState(false);
  const [refresh,setRefresh]=useState(0), seen=useRef({id:null,updatedAt:0});
  const apply=(result,accept=false)=>{
    const version=new Date(result.job?.updatedAt || 0).getTime();
    if(result.job?.id===seen.current.id && version<seen.current.updatedAt)return;
    if(result.job)seen.current={id:result.job.id,updatedAt:version};
    if(result.job)setJob(result.job);
    if(result.block && mutable){
      const previous=latest.current, next=mergeCadBlock(previous,result.block);
      if(result.job?.awaitingAccept && previous.revisionId){
        // A proposed edit belongs to the review preview, never the saved model.
        for(const key of ['revisionId','sourceId','fileRef','manifest','acceptedManifest'])next[key]=previous[key];
      }
      if(JSON.stringify(next)!==JSON.stringify(previous)){
        const persist=accept || cadPersistenceChanged(previous,next);
        // Advance before notifying React: a repeated poll must not save twice.
        latest.current=next;
        (persist?onChange:(onChangeQuiet || onChange))(next);
      }
    }
    const accepted=result.block?.acceptedManifest || result.block?.manifest || result.job?.acceptedManifest || (!result.job?.awaitingAccept ? result.job?.manifest : null);
    if(accepted)setManifest(accepted);
  };
  useEffect(()=>{
    if(!mutable)return;
    let live=true,timer;
    const poll=async()=>{try{const result=await client.get(block.jobId);if(!live)return;apply(result);setError('');if(cadRunning(result.job.state) || ['queued','preparing','exporting'].includes(result.job.exportState))timer=setTimeout(poll,2500);}catch(problem){if(live)setError(problem.message);}};
    if(block.jobId)poll();return()=>{live=false;clearTimeout(timer);};
  },[block.jobId,block.status,refresh,mutable]);
  const state=job?.state || block.status, running=cadRunning(state);
  useEffect(()=>{if(!running || !job?.createdAt)return;const tick=()=>setElapsed(Math.max(0,Math.floor((Date.now()-new Date(job.createdAt).getTime())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[running,job?.createdAt]);
  // Answers the refusal (with its code and per-parameter problems) or null. A refused Preview change is Quick edit's to show.
  const action=async(name,body)=>{if(!mutable)return null;setBusy(true);setError('');try{const result=await client.action(block.jobId,name,body);apply(result,name==='accept');setRefresh(value=>value+1);if(name==='accept'){setPreview(false);setManifest(result.job?.manifest || manifest);}if(name==='cancel')setPreview(false);return null;}catch(problem){if(name!=='rebuild')setError(problem.message);return problem;}finally{setBusy(false);}};
  const proposed=job?.awaitingAccept || block.proposedRevisionId;
  const shown=preview && proposed ? job?.manifest : manifest;
  const download=artifact=>{setError('');downloadCadArtifact(artifact,mutable).catch(problem=>setError(problem.message));};
  // The background belongs to the card, not the CAD job: whoever may edit the card sets it (a fork's owner too); a
  // read-only viewer sees it without the control.
  const background=viewerBackground(block), [showDimensions]=useCadDimensions(account,block.id);
  const setBackground=value=>onChange({...latest.current,viewerBackground:value});
  // Quick edit (cad-quick-edit.jsx): a draft against the accepted revision; this card's parameter rebuild, when one is open.
  const [draft,setDraft]=useCadDraft(account,block.id,manifest?.revisionId), [quickProblem,setQuickProblem]=useState(null), [highlight,setHighlight]=useState(null);
  const rebuild=job?.rebuild && job.id===block.jobId && job.revisionId!==manifest?.revisionId ? job : null;
  const phase=!rebuild ? 'idle' : rebuild.awaitingAccept ? 'review' : rebuild.state==='failed' ? 'failed' : cadRunning(rebuild.state) ? 'building' : 'idle';
  const acceptedValues=manifest?.controls?.values || {};
  const changes=rebuild ? (rebuild.brief?.controls?.parameters || []).filter(p=>p.role==='input' && Object.hasOwn(acceptedValues,p.id) && acceptedValues[p.id]!==p.value).map(p=>({id:p.id,label:p.label,unit:p.unit,from:acceptedValues[p.id],to:p.value})) : [];
  const quick=quickEditModel(shown,{draft:phase==='idle' && shown===manifest ? draft : {}});
  const quickActions={
    draft:(id,value,accepted)=>{setQuickProblem(null);setDraft(withDraft(draft,id,value,accepted));},
    reset:()=>{setQuickProblem(null);setDraft({});},
    preview:async request=>{setQuickProblem(null);const problem=await action('rebuild',{requestId:crypto.randomUUID(),...request});if(problem)setQuickProblem({message:problem.message,status:problem.status,code:problem.data?.code,problems:problem.data?.problems || []});},
    accept:async()=>{if(!await action('accept',{expectedRevisionId:block.revisionId}))setDraft({});},
    discard:async keep=>{if(!await action('cancel') && !keep)setDraft({});},
    retry:()=>action('retry'), togglePreview:()=>setPreview(value=>!value), highlight:setHighlight,
    edit:mutable && block.revisionId && onEdit ? ()=>onEdit() : null, reload:()=>{setQuickProblem(null);setRefresh(value=>value+1);},
  };
  const draftPending=phase==='idle' && quick.draft.changed.length>0;
  // The region below the viewport takes the wheel (data-scroll; AdaptiveCanvas) only while it has something to scroll;
  // otherwise the wheel over the card pans the canvas as before.
  const below=useRef(null), [scrolls,setScrolls]=useState(false);
  useEffect(()=>{const el=below.current;if(!el)return;const check=()=>setScrolls(el.scrollHeight>el.clientHeight+1);const resize=new ResizeObserver(check),mutate=new MutationObserver(check);resize.observe(el);mutate.observe(el,{subtree:true,childList:true});check();return()=>{resize.disconnect();mutate.disconnect();};},[]);
  // A shared canvas uses hand-mode hit testing to select, then only this viewer
  // accepts pointers. Editing stays governed by mutable, not viewing selection.
  return <div data-cad-card data-cad-state={state} className={`flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 ${readOnly && selected ? 'pointer-events-auto' : ''}`}>
    <p data-drag-zone className="cursor-grab text-sm font-medium">{block.title || 'CAD model'}</p>
    {/* data-gen-active: the generation state the chat's indicator follows (UI changes contract). A spinner, never a percentage: the job reports stages only. */}
    <div role="status" data-cad-progress data-gen-active={running ? 'true' : 'false'} className="flex flex-wrap items-center gap-2 text-xs text-ink-2">{running && <LoaderCircle size={13} aria-hidden className="animate-spin"/>}<span>{proposed?'Revision ready for review':cadStage(state)}</span><span>{block.units || 'Units pending'}</span>{running && !!job?.createdAt && <span>{elapsed}s elapsed</span>}</div>
    {mutable && state==='awaiting_approval' && <p data-cad-review-hint className="text-xs text-ink">Review the design brief above the chat box. Nothing is generated until you press Generate there.</p>}
    {block.cadDetached && <p data-cad-detached className="text-xs text-ink-2">Saved model copy. Explore, Explain and download existing artifacts; generation, edits and new exports are unavailable for this copy.</p>}
    <CadPreview manifest={shown} active={!expanded} ownerRead={mutable} id={block.id} background={background} viewKey={block.id} selected={selected} showDimensions={showDimensions} draftPending={draftPending} highlight={highlight} minHeight="min-h-[45%]"/>
    {/* Below the viewport, one region that scrolls inside the card, so Quick edit and the details never spill past the card. */}
    <div ref={below} data-scroll={scrolls || undefined} data-cad-below className="-mx-1 flex min-h-0 shrink flex-col gap-2 overflow-y-auto px-1">
    <div data-cad-quick-edit-slot className="empty:hidden">{mutable && shown?.revisionId && <CadQuickEdit model={quick} phase={phase} changes={changes} previewing={preview && !!proposed} problem={quickProblem} busy={busy} error={rebuild?.error || ''} actions={quickActions}/>}</div>
    <div className="flex flex-wrap items-center gap-1" onPointerDown={event=>event.stopPropagation()}>
      <Tip label="Expand"><button type="button" aria-label="Expand" data-cad-action="expand" className={iconButton} disabled={!cadArtifact(shown,'glb')} onClick={()=>setExpanded(true)}><Maximize2 size={15} aria-hidden/></button></Tip>
      <Tip label="Download"><button type="button" aria-label="Download" aria-expanded={downloads} data-cad-action="download" className={iconButton} onClick={()=>setDownloads(open=>!open)}><Download size={15} aria-hidden/></button></Tip>
      {downloads && <div role="group" aria-label="Download formats" className="flex flex-wrap gap-1">{CAD_DOWNLOADS.map(format=>{const artifact=cadArtifact(manifest,format);return artifact?<button key={format} onClick={()=>download(artifact)} className={button}>{format.toUpperCase()}</button>:mutable && block.revisionId && ['stl','3mf'].includes(format)?<button key={format} className={button} disabled={busy || ['queued','preparing','exporting'].includes(job?.exportState)} onClick={()=>action('exports',{format})}>Prepare {format.toUpperCase()}</button>:null;})}</div>}
      {mutable && (running || state==='waiting_for_answer') && <button data-cad-action="cancel" className={button} disabled={busy} onClick={()=>action('cancel')}>Cancel</button>}
      {mutable && ['failed','cancelled'].includes(state) && !rebuild && <button className={button} disabled={busy} onClick={()=>action('retry')}>Retry generation</button>}
      {!readOnly && cadArtifact(shown,'glb') && <div className="ml-auto"><BackgroundControl value={background} onChange={setBackground}/></div>}
    </div>
    {proposed && mutable && !rebuild && <div className="flex flex-wrap gap-1" onPointerDown={event=>event.stopPropagation()}><button className={button} onClick={()=>setPreview(value=>!value)}>{preview?'Show current model':'Preview revision'}</button><button data-cad-action="accept" className={button} disabled={busy} onClick={()=>action('accept',{expectedRevisionId:block.revisionId})}>Accept</button><button className={button} disabled={busy} onClick={()=>action('cancel')}>Reject</button></div>}
    {mutable && state==='waiting_for_answer' && <form onPointerDown={event=>event.stopPropagation()} onSubmit={event=>{event.preventDefault();action('clarify',{answer});}}><label className="text-xs">{job?.question || 'Please clarify the design.'}<input data-cad-answer className="mt-1 w-full rounded border border-line bg-surface p-2" value={answer} onChange={event=>setAnswer(event.target.value)} disabled={!mutable || busy}/></label>{mutable && <button className={button} disabled={busy || !answer.trim()}>Continue</button>}</form>}
    {job?.exportState && <p className="text-xs text-ink-2">Export: {job.exportState}{job.exportError ? ` - ${job.exportError}` : ''}</p>}
    {(error || (!rebuild && job?.error)) && <p role="alert" className="text-xs text-fail">{error || job.error}{error && <button className={button} onClick={()=>setRefresh(value=>value+1)}>Retry status</button>}</p>}
    <CadDetails block={block} job={job} shown={shown} owner={mutable} changes={changes}/>
    </div>
    {expanded && <SlidePanel title={block.title || 'CAD model'} width={720} z={60} expandable onClose={()=>setExpanded(false)}><div className="flex min-h-0 flex-1 flex-col gap-2 p-4"><div className="flex justify-end"><CadViewerTools viewKey={`${block.id}:expanded`} account={account} cardId={block.id}/></div><CadPreview manifest={shown} active ownerRead={mutable} id={block.id} background={background} viewKey={`${block.id}:expanded`} showDimensions={showDimensions} draftPending={draftPending}/></div></SlidePanel>}
  </div>;
}
