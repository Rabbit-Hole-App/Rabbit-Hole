import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageJobClient } from './inline-image-job-client.js';
const id='ij_'+'a'.repeat(32),sourceId='fs_'+'b'.repeat(24),artifactId='fs_'+'c'.repeat(24),sourceSha256='d'.repeat(64);
const input={operation:'remove_background',app:'canvas',board:'main',cardId:'image',sourceId,sourceSha256,idempotencyKey:'unique-key',paidConfirmation:true,maxReservedUsd:0.2};
const ticket={version:1,id,binding:input};
const job=(phase='queued',extra={})=>({id,sourceSha256,phase,reservation:'held',...(phase==='ready'?{artifactId}:{}),...extra});
function fixture(replies) {
 const calls=[];
 const client=createImageJobClient({pollMs:0,fetchImpl:async(path,options)=>{calls.push({path,options});const reply=replies.shift();if(reply instanceof Error)throw reply;return Response.json({job:reply});}});
 return {client,calls};
}
test('submit sends once and returns an immutable serializable reload ticket without applying',async()=>{
 const h=fixture([job()]), request=structuredClone(input), result=await h.client.submit(request);
 request.cardId='other';assert.equal(result.binding.cardId,'image');assert.ok(Object.isFrozen(result.binding));
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.method,'POST');
 const sent=JSON.parse(h.calls[0].options.body);assert.equal(sent.sourceSha256,undefined);assert.equal(sent.sourceId,sourceId);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),result);assert.equal(result.proposal,undefined);
});
test('resume polls saved job only and readiness remains a separate explicit Accept proposal',async()=>{
 const h=fixture([job(),job('started'),job('ready')]), progress=[];
 const result=await h.client.resume(JSON.parse(JSON.stringify(ticket)),{onProgress:j=>progress.push(j.phase)});
 assert.deepEqual(progress,['queued','started','ready']);assert.ok(h.calls.every(c=>c.options.method==='GET'&&c.path.endsWith(id)));
 assert.equal(result.proposal.requiresExplicitAccept,true);assert.equal(result.proposal.binding.sourceSha256,sourceSha256);
 assert.equal(result.proposal.artifactId,artifactId);assert.ok(Object.isFrozen(result.proposal));
});
test('unknown/refused/cancelled are terminal, retain held reservation and never retry or propose',async()=>{
 for(const phase of ['unknown','refused','cancelled']){const h=fixture([job(phase)]);const result=await h.client.resume(ticket);assert.equal(result.proposal,null);assert.equal(result.job.reservation,'held');assert.equal(h.calls.length,1);}
});
test('cancel is explicit and preserves server uncertainty without refund claims',async()=>{
 const h=fixture([job('started',{cancelRequested:true})]);const result=await h.client.cancel(ticket);
 assert.equal(h.calls[0].options.method,'POST');assert.ok(h.calls[0].path.endsWith('/cancel'));assert.equal(result.phase,'started');assert.equal(result.reservation,'held');
 const ready=fixture([job('ready',{cancelRequested:true})]);assert.equal((await ready.client.resume(ticket)).proposal,null);
});
test('local abort stops waiting but never implicitly sends cancel',async()=>{
 const controller=new AbortController(),h=fixture([job()]);
 await assert.rejects(h.client.resume(ticket,{signal:controller.signal,onProgress:()=>controller.abort()}),{code:'wait_aborted'});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.method,'GET');
});
test('ambiguous submission never automatically retries and retains source binding',async()=>{
 const h=fixture([new Error('network secret text')]);
 await assert.rejects(h.client.submit(input),error=>error.code==='submission_unknown'&&error.binding.sourceId===sourceId&&!error.message.includes('secret'));
 assert.equal(h.calls.length,1);
});
test('pre-aborted or unconfirmed submits perform no request',async()=>{
 const h=fixture([]),controller=new AbortController();controller.abort();
 await assert.rejects(h.client.submit(input,{signal:controller.signal}),{code:'wait_aborted',submissionStarted:false});
 await assert.rejects(h.client.submit({...input,paidConfirmation:false}),{code:'confirmation_required'});assert.equal(h.calls.length,0);
});
test('mismatched source, job, invalid phase and missing artifact fail closed',async()=>{
 for(const invalid of [job('ready',{sourceSha256:'e'.repeat(64)}),job('ready',{id:'ij_'+'f'.repeat(32)}),job('retrying'),job('ready',{artifactId:null})]){
  const h=fixture([invalid]);await assert.rejects(h.client.resume(ticket),{code:'invalid_response'});assert.equal(h.calls.length,1);
 }
});
test('regional inputs require explicit owned-source mask ID and bounded prompt',async()=>{
 const h=fixture([job()]);await assert.rejects(h.client.submit({...input,operation:'edit_image'}),{code:'invalid_input'});
 await h.client.submit({...input,operation:'edit_image',maskSourceId:artifactId,prompt:'Replace the sky'});
 const sent=JSON.parse(h.calls[0].options.body);assert.equal(sent.maskSourceId,artifactId);assert.equal(sent.prompt,'Replace the sky');
});
test('status failure does not resubmit or retry; invalid ticket causes no fetch',async()=>{
 const calls=[];const client=createImageJobClient({fetchImpl:async(...args)=>{calls.push(args);return new Response(null,{status:404});}});
 await assert.rejects(client.resume(ticket),{code:'http_error',status:404});assert.equal(calls.length,1);
 await assert.rejects(client.status({...ticket,id:'../../elsewhere'}),{code:'invalid_ticket'});assert.equal(calls.length,1);
});
test('poll timeout interrupts pending fetch, preserving resumable ticket and no resubmit',async()=>{
 let calls=0;
 const client=createImageJobClient({fetchImpl:async(path,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
 const keepAlive=setTimeout(()=>{},100);
 try { await assert.rejects(client.resume(ticket,{timeoutMs:5}),error=>error.code==='wait_timeout'&&error.ticket.id===id); } finally {clearTimeout(keepAlive);}
 assert.equal(calls,1);
});

test('abort during ready notification cannot deliver a stale proposal',async()=>{
 const h=fixture([job('ready')]),controller=new AbortController();
 await assert.rejects(h.client.resume(ticket,{signal:controller.signal,onProgress:()=>controller.abort()}),{code:'wait_aborted'});
 assert.equal(h.calls.length,1);
});

test('JSON array identities cannot bypass immutable ticket validation',async()=>{
 const h=fixture([]);
 for(const key of ['sourceId','sourceSha256','idempotencyKey']) await assert.rejects(h.client.submit({...input,[key]:[input[key]]}),{code:'invalid_binding'});
 await assert.rejects(h.client.status({...ticket,id:[id]}),{code:'invalid_ticket'});
 await assert.rejects(h.client.submit({...input,operation:'edit_image',maskSourceId:[artifactId],prompt:'sky'}),{code:'invalid_input'});
 assert.equal(h.calls.length,0);
 for(const patch of [{id:[id]},{artifactId:[artifactId]}]) await assert.rejects(fixture([job('ready',patch)]).client.resume(ticket),{code:'invalid_response'});
});
test('numeric consent bound persists on reload ticket and reaches server without coercion',async()=>{
 const h=fixture([job()]);for(const maxReservedUsd of [undefined,'0.2',0,-1,Infinity])await assert.rejects(h.client.submit({...input,maxReservedUsd}),{code:'invalid_binding'});
 const saved=await h.client.submit(input);assert.equal(saved.binding.maxReservedUsd,.2);assert.equal(JSON.parse(h.calls[0].options.body).maxReservedUsd,.2);
});
test('quote is readonly and validates configured maximum without submitting',async()=>{
 const calls=[];const client=createImageJobClient({fetchImpl:async(path,init)=>{calls.push(init.method);return Response.json({available:true,maximumReservedUsd:.2,model:'fixture'});}});
 assert.equal((await client.quote()).maximumReservedUsd,.2);assert.deepEqual(calls,['GET']);
});
