import test from 'node:test';import assert from 'node:assert/strict';
import {validateExtraction,verifyExtractionRead,withExtraction} from './inline-extraction.js';
const source={id:'fs_0123456789abcdef01234567',rev:'a'.repeat(64)};
const block={id:'image',type:'file',kind:'image',fileRef:{v:1,source,family:'image',meta:{name:'original.png'}}};
const receipt={source:{blockId:'image',source,coverage:'whole-image'},uncertainties:[{location:'denominator',message:'The symbol may be x or y.'}]};
const scope={app:'canvas',board:'main'},current=()=>({block,scope,readOnly:false,locked:false});
const options=()=>({extraction:receipt,before:block,ids:['image'],scope,current,fetchImpl:async()=>new Response(null,{headers:{'x-source-rev':source.rev}})});
test('receipt is detached and only identifies the actual selected image revision',()=>{
 const result=validateExtraction(receipt,{block,ids:['image']});assert.equal(result.ok,true);result.extraction.uncertainties[0].message='changed';assert.notEqual(receipt.uncertainties[0].message,'changed');
 assert.equal(validateExtraction(receipt,{block,ids:['other']}).ok,false);
 assert.equal(validateExtraction(receipt,{block:{...block,fileRef:{...block.fileRef,source:{...source,rev:'b'.repeat(64)}}},ids:['image']}).ok,false);
 for(const bad of [{...receipt,unknown:true},{...receipt,uncertainties:[{location:'x',message:'x',trusted:true}]},{...receipt,source:{...receipt.source,contentSha256:source.rev}}])assert.equal(validateExtraction(bad,{block,ids:['image']}).ok,false);
});
test('authorized HEAD recheck retains the original file source without mutating it',async()=>{
 const reads=[],saved=structuredClone(block),result=await verifyExtractionRead({...options(),fetchImpl:async(path,init)=>{reads.push({path,init});return new Response(null,{headers:{'x-source-rev':source.rev}});}});
 assert.equal(reads.length,1);assert.equal(reads[0].init.method,'HEAD');assert.match(reads[0].path,/app=canvas&board=main$/);assert.deepEqual(result.retainedSource.fileRef.source,source);assert.deepEqual(block,saved);
});
test('revoked permission, source drift and changed scope refuse before or after the read',async()=>{
 let reads=0;for(const patch of [{readOnly:true},{locked:true},{scope:{app:'other',board:'main'}}])await assert.rejects(verifyExtractionRead({...options(),current:()=>({...current(),...patch}),fetchImpl:async()=>{reads++;throw Error('must not read');}}),/permissions changed/);assert.equal(reads,0);
 let revoked=false;await assert.rejects(verifyExtractionRead({...options(),current:()=>({...current(),readOnly:revoked}),fetchImpl:async()=>{revoked=true;return new Response(null,{headers:{'x-source-rev':source.rev}});}}),/permissions changed/);
 await assert.rejects(verifyExtractionRead({...options(),fetchImpl:async()=>new Response(null,{status:403})}),/no longer accessible/);
 await assert.rejects(verifyExtractionRead({...options(),fetchImpl:async()=>new Response(null,{headers:{'x-source-rev':'b'.repeat(64)}})}),/revision changed/);
});
test('legacy acceptance recomputes byte digest and never trusts an unchanged asset key alone',async()=>{
 const bytes=new TextEncoder().encode('image bytes'),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const legacy={id:'image',type:'file',kind:'image',assetKey:'asset/one'},extraction={source:{blockId:'image',contentSha256:hash,coverage:'whole-image'},uncertainties:[]};
 const args={...options(),before:legacy,extraction,current:()=>({...current(),block:legacy}),fetchImpl:async()=>new Response(bytes)};
 assert.equal((await verifyExtractionRead(args)).retainedSource,null);
 await assert.rejects(verifyExtractionRead({...args,fetchImpl:async()=>new Response('changed bytes')}),/bytes changed/);
});
test('native insertion stores provenance and uncertainties on each new object; source edits are refused',()=>{
 const provenance={requestId:'r',mode:'explain',sources:['image']},tx={kind:'diagram',shapes:[{id:'a'}],links:[{id:'l',from:'a',to:'b'}],groups:[]};
 const result=withExtraction(tx,{extraction:receipt,provenance,retainedSource:{id:'original'}});
 assert.deepEqual(result.shapes[0].inline.extraction,receipt);assert.deepEqual(result.links[0].inline.sources,['image']);assert.equal(tx.shapes[0].inline,undefined);assert.deepEqual(result.retainedSources,[{id:'original'}]);
 assert.throws(()=>withExtraction({kind:'edit',changes:[{id:'image'}],additions:[],removals:[]},{extraction:receipt,provenance}),/separate native result/);
 const equation=withExtraction({kind:'edit',changes:[],removals:[],additions:[{id:'eq',list:'items',after:{id:'eq',kind:'equation',latex:'x'}}]},{extraction:receipt,provenance});assert.equal(equation.additions[0].after.inline.extraction.source.blockId,'image');
});

test('legacy image reads stop at the byte limit before buffering the complete response',async()=>{
 const legacy={id:'image',type:'file',kind:'image',assetKey:'asset'},extraction={source:{blockId:'image',contentSha256:'a'.repeat(64),coverage:'whole-image'},uncertainties:[]};let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 await assert.rejects(verifyExtractionRead({...options(),before:legacy,extraction,current:()=>({...current(),block:legacy}),fetchImpl:async()=>new Response(body)}),/supported read limit/);assert.equal(cancelled,true);
});

test('generated card and paid proposal transaction retain detached extraction provenance',()=>{
 for(const confirmedStart of [undefined,true]){
  const tx={kind:'card',block:{id:'derived',type:'table',columns:['x'],rows:[['1']],...(confirmedStart?{confirmedStart}:{})},links:[{id:'annotation',kind:'annotation'}]};
  const result=withExtraction(tx,{extraction:receipt,provenance:{sources:['image']},retainedSource:{id:'original'}});
  assert.deepEqual(result.block.inline.extraction,receipt);assert.deepEqual(result.links[0].inline.extraction,receipt);assert.deepEqual(result.retainedSources,[{id:'original'}]);assert.equal(result.block.confirmedStart,confirmedStart);assert.equal(tx.block.inline,undefined);
 }
});
