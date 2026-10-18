import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundRemovalController } from './inline-background-removal.js';
const sourceId='fs_'+'a'.repeat(24),artifactId='fs_'+'b'.repeat(24),rev='c'.repeat(64),jobId='ij_'+'d'.repeat(32);
const block={id:'image',type:'file',kind:'image',x:41,y:52,width:300,height:200,fileRef:{source:{id:sourceId,rev}}},scope={app:'canvas',board:'main'};
const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);new DataView(bytes.buffer).setUint32(16,1024);new DataView(bytes.buffer).setUint32(20,1024);
const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function fixture({phase='ready',submitError=false,persistError=false}={}) {
 const calls={submit:0,poll:0,cancel:0,fetch:[],prepare:0,accept:0,dispose:0,persist:[]};
 const now={ownerKey:'org:owner',scope:structuredClone(scope),block:structuredClone(block),readOnly:false,locked:false};let ticket;
 const client={quote:async()=>({available:true,maximumReservedUsd:.2}),submit:async input=>{calls.submit++;if(submitError)throw Error('unknown');ticket={version:1,id:jobId,binding:{...input}};return ticket;},resume:async saved=>{calls.poll++;return{job:{phase},proposal:phase==='ready'?{artifactId,jobId,binding:saved.binding}:null};},cancel:async()=>{calls.cancel++;return{phase:'unknown',reservation:'held'};}};
 const options={block,scope,ownerKey:'org:owner',current:()=>now,jobClient:client,persistTicket:async value=>{if(persistError)throw Error('storage');calls.persist.push(structuredClone(value));},fetchImpl:async path=>{calls.fetch.push(path);return new Response(bytes,{headers:{'Content-Type':'image/png','X-Source-Rev':hash}});},prepareRevision:async args=>{calls.prepare++;const transformed=await args.transform();const saved=await args.upload();assert.equal(transformed.width,1024);assert.equal(saved.source.id,artifactId);let accepted=false;return{previewURL:'blob:fixture',before:args.block,after:{...args.block,fileRef:{source:saved.source}},retainedSource:{id:sourceId},accept:async()=>{if(accepted)throw Error('accepted');accepted=true;calls.accept++;return{before:args.block,after:{...args.block,fileRef:{source:saved.source}},retainedSource:{id:sourceId}};},dispose:()=>calls.dispose++};}};
 return {calls,now,options,controller:createBackgroundRemovalController(options)};
}
const start=h=>h.controller.start({consent:{approved:true,maxReservedUsd:.2},idempotencyKey:'fixture-key'});
test('constructor and quote do not submit; consent required before any job',async()=>{
 const h=fixture();assert.equal(h.calls.submit,0);await h.controller.quote();assert.equal(h.calls.submit,0);
 await assert.rejects(h.controller.start({consent:{approved:false,maxReservedUsd:.2}}),{code:'consent_required'});assert.equal(h.calls.persist.length,0);
});
test('explicit start saves pending then ticket, reads owned artifact and reuses existing revision contract',async()=>{
 const h=fixture(),result=await start(h);assert.equal(h.calls.submit,1);assert.equal(h.calls.prepare,1);assert.equal(h.calls.accept,0);
 assert.equal(h.calls.persist[0].state,'submission_pending');assert.ok(h.calls.persist[1].ticket);assert.deepEqual(h.calls.fetch,['/api/learn/files/'+artifactId]);
 assert.equal(result.revision.after.x,block.x);assert.equal(result.revision.after.width,block.width);assert.equal(result.revision.retainedSource.id,sourceId);
 await h.controller.accept();assert.equal(h.calls.accept,1);await assert.rejects(h.controller.accept(),/accepted/);await assert.rejects(start(h),{code:'already_started'});
});
test('reload resumes ticket without submitting and rejects wrong owner or changed source',async()=>{
 const h=fixture();await start(h);const saved=h.calls.persist.at(-1),fresh=fixture();await fresh.controller.resume(saved);assert.equal(fresh.calls.submit,0);assert.equal(fresh.calls.poll,1);
 const wrong=fixture();await assert.rejects(wrong.controller.resume({...saved,ownerKey:'other'}),{code:'stale_ticket'});assert.equal(wrong.calls.poll,0);
});
test('unknown job remains held without preview, Accept, or automatic resubmit',async()=>{
 const h=fixture({phase:'unknown'});const result=await start(h);assert.equal(result.revision,null);assert.equal(h.calls.fetch.length,0);assert.equal(h.calls.prepare,0);await assert.rejects(h.controller.accept(),{code:'not_ready'});await assert.rejects(start(h),{code:'already_started'});
});
test('persistence failure prevents submission; ambiguous submit retains pending envelope for reload refusal',async()=>{
 const failed=fixture({persistError:true});await assert.rejects(start(failed));assert.equal(failed.calls.submit,0);
 const h=fixture({submitError:true});await assert.rejects(start(h));const saved=h.calls.persist[0],fresh=fixture();await assert.rejects(fresh.controller.resume(saved),{code:'submission_unknown'});assert.equal(fresh.calls.submit,0);
});
test('owner/scope/readOnly/source drift fences explicit Accept',async()=>{
 for(const mutate of [h=>h.now.ownerKey='other',h=>h.now.scope.board='other',h=>h.now.readOnly=true,h=>h.now.block.x++]){const h=fixture();await start(h);mutate(h);await assert.rejects(h.controller.accept(),{code:'stale'});assert.equal(h.calls.accept,0);}
});
test('dispose only stops local wait; explicit cancel delegates and retains server unknown',async()=>{
 const h=fixture();await start(h);h.controller.dispose();assert.equal(h.calls.cancel,0);await assert.rejects(h.controller.accept(),{code:'stale'});
 const other=fixture();await start(other);assert.deepEqual(await other.controller.cancel(),{phase:'unknown',reservation:'held'});assert.equal(other.calls.cancel,1);
});
test('tampered derivative identity fails before preview preparation',async()=>{
 const h=fixture();h.options.fetchImpl=async()=>new Response(bytes,{headers:{'Content-Type':'image/png','X-Source-Rev':rev}});h.controller=createBackgroundRemovalController(h.options);await assert.rejects(start(h),{code:'invalid_artifact'});assert.equal(h.calls.prepare,0);
});
