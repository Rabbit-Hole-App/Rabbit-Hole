// Read existing trusted STEP measurements, never execute code or infer dimensions from pixels.
import { ownerRow } from './learn-boards.js';
import { authorizeFileSource } from './file-access.js';
import { learnMedia } from './learn-storage.js';
import { sniffImageType, MEDIA_UPLOAD_LIMIT } from './learn-media.js';
import { base64 } from './token.js';
const LIMIT = 128 * 1024;
const unavailable = 'Only recorded STEP measurements are available. Unmeasured hole counts, depths, positions, pockets, clearance and topology cannot be inferred from the preview.';
async function bytesOf(bucket, derivative, limit) {
  if (!derivative || !Number.isSafeInteger(derivative.bytes) || derivative.bytes <= 0 || derivative.bytes > limit) return null;
  const object = await bucket.get(derivative.r2_key);
  if (!object || object.size !== derivative.bytes) return null;
  const reader = object.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) { const {done,value}=await reader.read(); if(done)break; length+=value.byteLength; if(length>limit){await reader.cancel();return null;} chunks.push(value); }
  } finally { reader.releaseLock(); }
  if(length!==derivative.bytes)return null;
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function recordedCadFacts(validation) {
  if(validation?.baselinePassed!==true || validation.geometry_units!=='mm')return null;
  const facts={}, input=validation.facts || {};
  if(['x','y','z'].every(axis=>finite(input.bounds_mm?.[axis])))facts.bounds_mm=Object.fromEntries(['x','y','z'].map(axis=>[axis,input.bounds_mm[axis]]));
  if(finite(input.volume_mm3))facts.volume_mm3=input.volume_mm3;
  if(Number.isSafeInteger(input.solid_count)&&input.solid_count>=0)facts.solid_count=input.solid_count;
  if(Array.isArray(input.circular_diameters_mm))facts.circular_edge_diameters_mm=input.circular_diameters_mm.filter(finite).slice(0,100);
  const checks=(Array.isArray(validation.checks)?validation.checks:[]).slice(0,100).map(check=>({id:String(check.id || '').slice(0,100),status:['passed','failed','unchecked'].includes(check.status)?check.status:'unchecked',...(finite(check.actual)?{actual:check.actual}:{}),...(finite(check.expected)?{expected:check.expected}:{}),...(finite(check.tolerance)?{tolerance:check.tolerance}:{})}));
  return {units:{length:'mm',volume:'mm3',solid_count:'count'},facts,checks,unavailable};
}
export async function inspectSavedCad(req,env,{access,board='main',targetIds=[],includePreview=false}) {
  if(!env.LEARN_DB || !Array.isArray(targetIds) || !targetIds.length)return {blocks:[]};
  const row=await ownerRow(env,access,access.name,board);
  if(!row)return {blocks:[]};
  let state;try{state=JSON.parse(row.state_json || '{}');}catch{return {blocks:[]};}
  const selected=(Array.isArray(state.blocks)?state.blocks:[]).filter(block=>block.type==='cad' && targetIds.includes(block.id)).slice(0,4);
  const blocks=[];let previewUsed=false;
  for(const block of selected){
    const revision=block.revisionId, sourceId=block.fileRef?.source?.id;
    const missing=()=>blocks.push({type:'text',text:JSON.stringify({cadInspection:{cardId:block.id,revisionId:revision || null,status:'unavailable',unavailable}})});
    if(typeof revision!=='string'||typeof sourceId!=='string'){missing();continue;}
    const authorization=await authorizeFileSource(req,env,sourceId,{row});
    if(authorization instanceof Response){missing();continue;}
    const derivative=kind=>env.LEARN_DB.prepare("SELECT * FROM file_derivatives WHERE source_id = ? AND source_sha256 = ? AND options_hash = ? AND kind = ? AND converter = 'cad-execute' AND status = 'ready' ORDER BY created_at DESC LIMIT 1").bind(sourceId,authorization.source.sha256,revision,kind).first();
    try {
      const record=await derivative('validation'), raw=await bytesOf(learnMedia(env),record,LIMIT);
      const facts=raw && recordedCadFacts(JSON.parse(new TextDecoder().decode(raw)));
      if(!facts){missing();continue;}
      blocks.push({type:'text',text:JSON.stringify({cadInspection:{cardId:block.id,revisionId:revision,provenance:'Trusted saved STEP validation at build time; not a new geometry execution',validationSha256:record.sha256,...facts}})});
      if(includePreview&&!previewUsed){
        try {
        const thumbnail=await derivative('thumbnail'), image=await bytesOf(learnMedia(env),thumbnail,MEDIA_UPLOAD_LIMIT), mediaType=image&&sniffImageType(image);
        if(mediaType){blocks.push({type:'text',text:'Preview of the same accepted CAD revision. Use recorded STEP measurements, not pixels, for dimensions.'},{type:'image',source:{type:'base64',media_type:mediaType,data:base64(image)}});previewUsed=true;}
        } catch { blocks.push({type:'text',text:'The accepted CAD preview is unavailable. The recorded measurements above remain available.'}); }
      }
    }catch{missing();}
  }
  return {blocks};
}
