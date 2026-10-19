import {FILE_SOURCE} from './file-chat-ref.js';
import {fileContextManifest} from './file-context-manifest.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function selectedSourcePages(blocks,ids,pages){
 const ranges=[];
 for(const id of ids||[]){if(!Object.hasOwn(pages,id))continue;const block=blocks.find(block=>block.id===id),sourceId=`file:${block?.fileRef?.source?.id}@${block?.fileRef?.source?.rev}`,page=Number(pages[id]);
  if(block?.fileRef?.family!=='pdf'||!FILE_SOURCE.test(sourceId)||!Number.isSafeInteger(page)||page<1||String(pages[id]).trim()==='')throw Error('Choose a positive page number for each selected saved PDF.');
  ranges.push({targetId:id,sourceId,range:{page}});
 }
 if(ranges.length>4)throw Error('Choose at most four PDF pages.');return ranges;
}
export function sourcePageRequest(blocks,ids,pages,plot=false){
 const ranges=selectedSourcePages(blocks,ids,pages);
 if(plot&&(!ranges.length||ranges.length!==ids.length||ids.some(id=>!ranges.some(entry=>entry.targetId===id))))throw Error('Choose one explicit PDF page for every selected source before requesting a plot.');
 return ranges;
}
export function validateSourceReadings(readings,ranges){
 if(!Array.isArray(ranges)||!ranges.length||!Array.isArray(readings)||readings.length!==ranges.length)return{ok:false,error:'The response is missing the requested source-page receipt.'};
 for(let i=0;i<ranges.length;i++){const value=readings[i];if(!value||Object.keys(value).some(key=>!['targetId','sourceId','range','coverage'].includes(key))||!same({targetId:value.targetId,sourceId:value.sourceId,range:value.range},ranges[i])||!['partial','extracted'].includes(value.coverage))return{ok:false,error:'The response read a different source page or has invalid coverage.'};}
 return{ok:true,readings:structuredClone(readings)};
}
export async function verifySourceReadings({readings,frozen,current,headers={},fetchImpl=globalThis.fetch}){
 const scope=frozen.sourceScope;
 const check=()=>{const now=current();if(now.readOnly||now.locked||now.mode!=='explain'||!scope?.app||scope.board!=='main'||scope.share||scope.member||!same(now.scope,scope)||!same(now.ranges,frozen.sourceRanges))throw Error('The source page, scope or permissions changed.');
  const checked=validateSourceReadings(readings,frozen.sourceRanges);if(!checked.ok)throw Error(checked.error);
  for(const entry of frozen.sourceRanges){const block=now.blocks.find(block=>block.id===entry.targetId);if(!same(block,frozen.sourceBlocks[entry.targetId]))throw Error('The selected source changed.');}return now;};
 check();const response=await fetchImpl(`/api/learn/boards/${encodeURIComponent(scope.app)}/${encodeURIComponent(scope.board)}`,{headers,cache:'no-store'});if(!response.ok)throw Error('The source board is no longer accessible.');const remote=await response.json();
 const retainedSources=[];
 for(const entry of frozen.sourceRanges){const block=remote.state?.blocks?.find(block=>block.id===entry.targetId),before=frozen.sourceBlocks[entry.targetId];if(block?.locked||!same(block?.fileRef,before?.fileRef))throw Error('The saved source revision or permissions changed.');const source=before.fileRef.source;
  const res=await fetchImpl(`/api/learn/files/${encodeURIComponent(source.id)}?app=${encodeURIComponent(scope.app)}&board=${encodeURIComponent(scope.board)}`,{method:'HEAD',headers,cache:'no-store'});if(!res.ok||res.headers.get('x-source-rev')!==source.rev)throw Error('The source revision is unavailable.');
  const fileRef=fileContextManifest(before.fileRef);if(!fileRef)throw Error('The source cannot be retained.');retainedSources.push({id:entry.sourceId,kind:'file',attached:false,label:before.fileRef.meta?.name||before.title||'Source PDF',fileRef});
 }
 check();return{readings:structuredClone(readings),retainedSources};
}
export function stampSourceReadings(tx,{readings,retainedSources}){
 const stamp=value=>({...value,inline:{...value.inline,sourceReadings:structuredClone(readings)}});
 if(tx.kind==='card')return{...tx,block:stamp(tx.block),links:(tx.links||[]).map(stamp),retainedSources:[...(tx.retainedSources||[]),...retainedSources]};
 if(tx.kind==='explain')return{...tx,shapes:tx.shapes.map(stamp),links:tx.links.map(stamp),retainedSources:[...(tx.retainedSources||[]),...retainedSources]};
 throw Error('Explicit source pages can only produce a separate note or comparison card.');
}
