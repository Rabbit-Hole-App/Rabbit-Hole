import {useEffect,useRef,useState} from 'react';
import BackgroundRemovalPreview from './BackgroundRemovalPreview.jsx';
import {validateMaskRegion} from './inline-regional-mask.js';
export default function RegionalImageEdit({session,onApply,onClose}) {
  const [original,setOriginal]=useState(null),[region,setRegion]=useState(session.savedEnvelope?.edit?.region||null),[prompt,setPrompt]=useState(session.savedEnvelope?.edit?.prompt||''),[error,setError]=useState('');
  const [prepared,setPrepared]=useState(null),drag=useRef(null);
  useEffect(()=>{const abort=new AbortController();let url;
    session.read(abort.signal).then(value=>{if(abort.signal.aborted)return;url=URL.createObjectURL(value.blob);setOriginal({...value,url});}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
  },[session]);
  const freeze=()=>{try{validateMaskRegion(region,original.width,original.height);if(!prompt.trim()||prompt.length>2000)throw Error('Describe the selected region edit.');setPrepared(session.prepare({prompt,region}));setError('');}catch(e){setError(e.message);}};
  const point=e=>{const b=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(original.width,Math.round((e.clientX-b.left)/b.width*original.width))),y:Math.max(0,Math.min(original.height,Math.round((e.clientY-b.top)/b.height*original.height)))}};
  const move=e=>{if(!drag.current)return;const p=point(e),a=drag.current;setRegion({x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y)});};
  if(prepared)return <BackgroundRemovalPreview {...prepared} regional onApply={onApply} onClose={onClose}/>;
  return <section data-regional-image-edit className="space-y-2" onKeyDown={e=>e.stopPropagation()}>
    <p>Select a rectangle and describe the change. The mask is uploaded only after cost confirmation. Generated pixels outside the region may also change.</p>
    {original&&<><div data-region-canvas className="relative touch-none select-none" style={{width:'100%',aspectRatio:`${original.width}/${original.height}`}} onPointerDown={e=>{if(session.savedEnvelope)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current=point(e);setRegion(null);}} onPointerMove={move} onPointerUp={e=>{move(e);drag.current=null;}}>
      <img src={original.url} alt="Original image for region selection" draggable={false} className="h-full w-full pointer-events-none"/>
      {region&&<div data-region-overlay className="absolute border-2 border-ink bg-white/30 pointer-events-none" style={{left:`${region.x/original.width*100}%`,top:`${region.y/original.height*100}%`,width:`${region.width/original.width*100}%`,height:`${region.height/original.height*100}%`}}/>}
    </div><p>{original.width} x {original.height} original pixels. Rectangular masks only.</p>
    <div className="grid grid-cols-2 gap-1">{['x','y','width','height'].map(k=><label key={k}>{k}<input aria-label={`Region ${k}`} type="number" value={region?.[k]??''} disabled={!!session.savedEnvelope} onChange={e=>setRegion({...region,[k]:e.target.value===''?null:Number(e.target.value)})} className="w-full rounded border border-line px-1"/></label>)}</div></>}
    <label>Change inside region<textarea data-region-prompt value={prompt} disabled={!!session.savedEnvelope} maxLength={2000} onChange={e=>setPrompt(e.target.value)} className="w-full rounded border border-line p-1"/></label>
    {session.savedEnvelope&&<p>A saved regional job was found. Its rectangle and prompt are fixed; continuing offers Resume without another upload.</p>}
    <button type="button" data-region-review disabled={!original||!region||!prompt.trim()} onClick={freeze} className="rounded border border-line px-2 py-1">Review region and cost</button>
    <button type="button" onClick={onClose} className="rounded border border-line px-2 py-1">Cancel region edit</button>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
