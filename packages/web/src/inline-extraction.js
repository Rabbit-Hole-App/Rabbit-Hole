import {fileContextManifest} from './file-context-manifest.js';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const image=block=>block?.type==='image'||(block?.type==='file'&&block.kind==='image');
const fail=error=>({ok:false,error});

// A read receipt identifies the input, not the correctness of recognized content.
export function validateExtraction(value,{block,ids=[]}={}){
 if(!keys(value,['source','uncertainties'])||!Array.isArray(value.uncertainties)||value.uncertainties.length>8)return fail('Invalid image interpretation receipt.');
 const source=value.source;
 if(!keys(source,['blockId','source','contentSha256','coverage'])||!text(source.blockId,160)||source.coverage!=='whole-image'||!image(block)||block.id!==source.blockId||!ids.includes(block.id))return fail('The interpretation does not belong to this selected image.');
 if(source.source!==undefined){
  if(!keys(source.source,['id','rev'])||!text(source.source.id,200)||!sha(source.source.rev)||source.contentSha256!==undefined||!same(source.source,block.fileRef?.source)||!fileContextManifest(block.fileRef))return fail('The image revision changed. Prepare a new interpretation.');
 }else if(!sha(source.contentSha256)||!text(block.assetKey,500)||block.fileRef?.source)return fail('The original image identity is unavailable.');
 for(const uncertainty of value.uncertainties)if(!keys(uncertainty,['location','message'])||!text(uncertainty.location,120)||!text(uncertainty.message,240))return fail('Invalid image recognition uncertainty.');
 return{ok:true,extraction:structuredClone(value)};
}

// Recheck the same authorized source at acceptance, including legacy byte identity.
// Uses the existing owner-main-canvas read/retention seam; no new source access.
export async function verifyExtractionRead({extraction,before,ids,scope,current,headers={},signal,fetchImpl=globalThis.fetch}){
 const at=structuredClone(scope),initial=structuredClone(before);
 const check=()=>{
  const now=current();
  if(signal?.aborted||!at?.app||at.board!=='main'||at.share||at.member||!same(now.scope,at)||now.readOnly||now.locked)throw Error('The image or its permissions changed.');
  const valid=validateExtraction(extraction,{block:now.block,ids});
  if(!valid.ok||!image(initial)||initial.id!==now.block?.id||(!extraction.source.source&&initial.assetKey!==now.block.assetKey))throw Error(valid.error||'The image changed.');
  return valid;
 };
 check();
 const source=extraction.source.source;
 const path=source?`/api/learn/files/${encodeURIComponent(source.id)}?app=${encodeURIComponent(at.app)}&board=${encodeURIComponent(at.board)}`
  :`/api/learn/boards/${encodeURIComponent(at.app)}/${encodeURIComponent(at.board)}/assets/${encodeURIComponent(initial.assetKey)}`;
 const response=await fetchImpl(path,{method:source?'HEAD':'GET',headers,signal,cache:'no-store'});
 if(!response.ok)throw Error('The source image is no longer accessible.');
 if(source){if(response.headers.get('x-source-rev')!==source.rev)throw Error('The source image revision changed.');}
 else{
  const limit=5*1024*1024;
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('The source image exceeds the supported read limit.');}
  const reader=response.body?.getReader();if(!reader)throw Error('The source image could not be read.');
  const chunks=[];let length=0;
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>limit){await reader.cancel();throw Error('The source image exceeds the supported read limit.');}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(digest!==extraction.source.contentSha256)throw Error('The source image bytes changed.');
 }
 const checked=check(),manifest=source?fileContextManifest(initial.fileRef):null;
 if(source&&!manifest)throw Error('The original image reference cannot be retained.');
 return{extraction:checked.extraction,retainedSource:manifest?{id:`file:${source.id}@${source.rev}`,kind:'file',attached:false,label:initial.fileRef.meta?.name||initial.title||'Source image',fileRef:manifest}:null};
}

export function withExtraction(tx,{extraction,provenance,retainedSource}){
 const stamp=value=>({...value,inline:{...value.inline,...structuredClone(provenance),extraction:structuredClone(extraction)}});
 if(tx.kind==='diagram')return{...tx,...Object.fromEntries(['shapes','links','groups'].map(key=>[key,(tx[key]||[]).map(stamp)])),retainedSources:retainedSource?[retainedSource]:[]};
 if(tx.kind==='edit'&&!tx.changes?.length&&!tx.removals?.length&&tx.additions?.length&&tx.additions.every(item=>item.list==='items'&&item.after.kind==='equation'))return{...tx,additions:tx.additions.map(item=>({...item,after:stamp(item.after)})),retainedSources:retainedSource?[retainedSource]:[]};
 throw Error('Image interpretation can only create a separate native result.');
}
