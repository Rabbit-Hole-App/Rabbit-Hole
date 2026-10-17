import { SlidePanel } from './ui.jsx';
import { useEffect, useRef, useState } from 'react';
import { api, apiFetch } from './api.js';
import { fileScope, scopeQuery } from './file-source-client.js';
import { inspectGlb, MAX_MODEL_BYTES } from './three-d-asset.js';
import { activateViewer, deactivateViewer, claimViewer, releaseViewer } from './viewer-slots.js';
import { cadArtifact, cadClient, cadRunning, cadStage, mergeCadBlock } from './cad-client.js';

// Use the existing file scope for shared/member reads. Never forward its token
// or workspace headers to an artifact URL outside Rabbit Hole.
const readUrl = path => {
  const url=new URL(path,window.location.origin);
  if(url.origin!==window.location.origin || !/^\/api\/learn\/(files|cad\/jobs)\//.test(url.pathname))throw new Error('This CAD artifact has an invalid delivery URL.');
  for(const [key,value] of new URLSearchParams(scopeQuery(fileScope()).slice(1)))url.searchParams.set(key,value);
  return `${url.pathname}${url.search}`;
};
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
const button = 'rounded-md border border-line px-2 py-1 text-xs hover:bg-hover disabled:opacity-50';
// The shared GLB renderer only exists while this card is active; its observer pauses offscreen work.
export function CadPreview({ manifest, active = false }) {
  const host = useRef(null), engine = useRef(null), viewerId = useRef(`cad-viewer:${crypto.randomUUID()}`);
  const [visible,setVisible] = useState(false), [slot,setSlot] = useState(false), [interacting,setInteracting] = useState(false);
  useEffect(()=>{if(!active)setInteracting(false);},[active]);
  useEffect(()=>{engine.current?.interact(interacting);if(interacting)activateViewer(viewerId.current,()=>setInteracting(false));return()=>deactivateViewer(viewerId.current);},[interacting]);
  useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(active && visible)setSlot(claimViewer(viewerId.current,()=>setSlot(false)));else{setSlot(false);releaseViewer(viewerId.current);}return()=>releaseViewer(viewerId.current);},[active,visible]);
  const [error,setError] = useState(''), [ready,setReady] = useState(false), [poster,setPoster] = useState(null);
  const glb = cadArtifact(manifest,'glb'), thumb = cadArtifact(manifest,'thumbnail');
  useEffect(()=>{
    if(!thumb?.url){setPoster(null);return;}
    let live=true,url;const abort=new AbortController();
    Promise.resolve().then(()=>apiFetch(readUrl(thumb.url),{signal:abort.signal})).then(response=>{if(!response.ok)throw Error('Preview image is unavailable.');return response.blob();}).then(blob=>{if(!live)return;url=URL.createObjectURL(blob);setPoster(url);}).catch(problem=>{if(live)setError(problem.message);});
    return()=>{live=false;abort.abort();if(url)URL.revokeObjectURL(url);};
  },[thumb?.url]);
  useEffect(() => {
    setReady(false);
    if (!active || !slot || !glb) return;
    let disposed=false, instance; const abort=new AbortController();setError('');
    import('./three-d-renderer.js').then(({createThreeDRenderer})=>{
      if(disposed) return;
      const load=async context=>{
        const response=await apiFetch(readUrl(glb.url),{signal:abort.signal});
        if(!response.ok)throw new Error(`Model download failed (${response.status})`);
        if(Number(response.headers.get('content-length'))>MAX_MODEL_BYTES){await response.body?.cancel();throw new Error('Preview exceeds the 20 MB viewer limit. Download STEP to inspect the model.');}
        const chunks=[],reader=response.body.getReader();let size=0;
        try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_MODEL_BYTES){await reader.cancel();throw new Error('Preview exceeds the 20 MB viewer limit.');}chunks.push(value);}}finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}inspectGlb(bytes.buffer);
        const {loadModel}=await import('./model-loaders.js');
        return loadModel({files:new Map([['model.glb',bytes]]),entry:{path:'model.glb',format:'glb',render:'mesh',deps:[]},...context});
      };
      instance=createThreeDRenderer(host.current,{modelUrl:'',camera:{},animation:{autoplay:false},animationTime:0,autoRotate:false},()=>{},()=>{if(!disposed)setReady(true);},message=>{if(!disposed){setReady(false);setError(message);}},{load});
      engine.current=instance; instance.interact(interacting);
    }).catch(problem=>{if(!disposed)setError(problem.message);});
    return ()=>{disposed=true;abort.abort();instance?.destroy();engine.current=null;};
  },[active,slot,glb?.url]);
  return <div data-cad-viewer data-viewer-active={interacting || undefined} className="relative min-h-40 flex-1 overflow-hidden rounded-lg border border-line bg-hover" onPointerDown={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()} tabIndex={0} onKeyDown={event=>{if(interacting){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();setInteracting(false);}}}}>
    <div ref={host} className="absolute inset-0"/>{active && glb ? <><button disabled={!ready} className={`${button} absolute left-2 top-2 bg-surface`} onClick={()=>setInteracting(value=>!value)}>{interacting?'Done':'Interact'}</button><button disabled={!ready} className={`${button} absolute right-2 top-2 bg-surface`} onClick={()=>engine.current?.fit()}>Fit view</button></> : poster ? <img src={poster} alt={manifest?.title || 'CAD model preview'} className="absolute inset-0 h-full w-full object-contain"/> : <p className="p-5 text-center text-xs text-ink-2">{glb ? 'Select the card to explore the model.' : 'The interactive preview is not available yet.'}</p>}
    {error && <p role="alert" className="absolute inset-x-0 bottom-0 bg-surface p-2 text-xs">{error}</p>}
  </div>;
}
export default function CadCard({block,onChange,onChangeQuiet,appName,selected=false,readOnly=false,onEdit,onExplain}) {
  const mutable=cadCanMutate(block,readOnly);
  const client=cadClient((path,options)=>api((options?.method || 'GET')==='GET'?readUrl(path):path,options),appName), latest=useRef(block); latest.current=block;
  const [job,setJob]=useState(null),[manifest,setManifest]=useState(block.manifest || null),[error,setError]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false),[expanded,setExpanded]=useState(false),[elapsed,setElapsed]=useState(0);
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
  const action=async(name,body)=>{if(!mutable)return;setBusy(true);setError('');try{const result=await client.action(block.jobId,name,body);apply(result,name==='accept');setRefresh(value=>value+1);if(name==='accept'){setPreview(false);setManifest(result.job?.manifest || manifest);}}catch(problem){setError(problem.message);}finally{setBusy(false);}};
  const proposed=job?.awaitingAccept || block.proposedRevisionId;
  const shown=preview && proposed ? job?.manifest : manifest;
  const download=async artifact=>{setError('');try{const response=await apiFetch(readUrl(artifact.url));if(!response.ok)throw new Error(`Download failed (${response.status})`);const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=artifact.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(problem){setError(problem.message);}};
  return <div data-cad-card data-cad-state={state} className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3">
    <p data-drag-zone className="cursor-grab text-sm font-medium">{block.title || 'CAD model'}</p>
    <div role="status" className="flex flex-wrap gap-2 text-xs text-ink-2"><span>{proposed?'Revision ready for review':cadStage(state)}</span><span>{block.units || 'Units pending'}</span>{running && !!job?.createdAt && <span>{elapsed}s elapsed</span>}</div>
    {block.cadDetached && <p data-cad-detached className="text-xs text-ink-2">Saved model copy. Explore, Explain and download existing artifacts; generation, edits and new exports are unavailable for this copy.</p>}
    <CadPreview manifest={shown} active={selected && !expanded}/>
    <div className="flex flex-wrap gap-1" onPointerDown={event=>event.stopPropagation()}>
      <button className={button} disabled={!cadArtifact(shown,'glb')} onClick={()=>setExpanded(true)}>Expand</button>
      {mutable && <button data-cad-action="edit" className={button} disabled={!block.revisionId || running} onClick={()=>onEdit?.()}>Edit</button>}
      {onExplain && <button className={button} onClick={()=>onExplain()}>Explain</button>}
      <details><summary data-cad-action="download" className={button}>Download</summary><div className="flex flex-wrap gap-1 py-1">{['step','glb','stl','3mf'].map(format=>{const artifact=cadArtifact(manifest,format);return artifact?<button key={format} onClick={()=>download(artifact)} className={button}>{format.toUpperCase()}</button>:mutable && block.revisionId && ['stl','3mf'].includes(format)?<button key={format} className={button} disabled={busy || ['queued','preparing','exporting'].includes(job?.exportState)} onClick={()=>action('exports',{format})}>Prepare {format.toUpperCase()}</button>:null;})}</div></details>
      {mutable && (running || state==='waiting_for_answer') && <button data-cad-action="cancel" className={button} disabled={busy} onClick={()=>action('cancel')}>Cancel</button>}
      {mutable && ['failed','cancelled'].includes(state) && <button className={button} disabled={busy} onClick={()=>action('retry')}>Retry generation</button>}
    </div>
    {proposed && mutable && <div className="flex flex-wrap gap-1" onPointerDown={event=>event.stopPropagation()}><button className={button} onClick={()=>setPreview(value=>!value)}>{preview?'Show current model':'Preview revision'}</button><button data-cad-action="accept" className={button} disabled={busy} onClick={()=>action('accept',{expectedRevisionId:block.revisionId})}>Accept</button><button className={button} disabled={busy} onClick={()=>action('cancel')}>Reject</button></div>}
    {mutable && state==='waiting_for_answer' && <form onPointerDown={event=>event.stopPropagation()} onSubmit={event=>{event.preventDefault();action('clarify',{answer});}}><label className="text-xs">{job?.question || 'Please clarify the design.'}<input className="mt-1 w-full rounded border border-line bg-surface p-2" value={answer} onChange={event=>setAnswer(event.target.value)} disabled={!mutable || busy}/></label>{mutable && <button className={button} disabled={busy || !answer.trim()}>Continue</button>}</form>}
    {job?.exportState && <p className="text-xs text-ink-2">Export: {job.exportState}{job.exportError ? ` - ${job.exportError}` : ''}</p>}
    {(error || job?.error) && <p role="alert" className="text-xs text-red-700">{error || job.error}{error && <button className={button} onClick={()=>setRefresh(value=>value+1)}>Retry status</button>}</p>}
    <details className="overflow-auto text-xs text-ink-2" onPointerDown={event=>event.stopPropagation()}><summary data-cad-action="details" className="cursor-pointer">Brief, parameters & checks</summary><p>{typeof block.briefSummary==='string' ? block.briefSummary : job?.brief?.object || 'Design brief is being prepared.'}</p>{(shown?.assumptions || []).map((text,index)=><p key={index}>{typeof text==='string'?text:JSON.stringify(text)}</p>)}<pre className="whitespace-pre-wrap">{JSON.stringify({parameters:shown?.parameters || {},validation:shown?.validation || [],limitations:job?.limitations || []},null,2)}</pre><p>Preview supports visual exploration, not exact face selection or measurements.</p>{mutable && block.revisionId && <button className={button} disabled={running} onClick={()=>onEdit?.()}>Refine assumptions</button>}</details>
    {expanded && <SlidePanel title={block.title || 'CAD model'} width={720} z={60} expandable onClose={()=>setExpanded(false)}><div className="flex min-h-0 flex-1 flex-col p-4"><CadPreview manifest={shown} active/></div></SlidePanel>}
  </div>;
}
