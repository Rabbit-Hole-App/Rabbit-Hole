import test from 'node:test';
import assert from 'node:assert/strict';
import {createInlineCodeClient} from './inline-code-client.js';
function fixture(){
 const scope={app:'canvas-12345678',board:'main',sourceId:'code-card'},ownerKey='org:owner';
 let live={scope,ownerKey,language:'javascript',code:'return input.x;',input:{x:2},readOnly:false};
 const calls=[],saved=[];let phase='succeeded',failure=false;
 const client=createInlineCodeClient({...live,current:()=>live,persistTicket:async ticket=>saved.push(ticket),pollMs:0,fetchImpl:async(path,options)=>{
  calls.push({path,options});if(path==='/api/learn/code-runs'&&options.method==='GET')return Response.json({available:true,maximumReservedMicros:5000});
  if(failure)throw Error('fixture transport loss');
  const ticket=saved.at(-1);assert.ok(ticket,'Ticket must persist before any submission');
  const body=options.body&&JSON.parse(options.body);if(options.method==='POST'&&!path.endsWith('cancel'))assert.equal(body.id,ticket.id);
  return Response.json({job:{id:ticket.id,scope:{app:scope.app,board:scope.board},phase:path.endsWith('cancel')?'cancelled':phase,sourceSha256:ticket.sourceSha256,inputSha256:ticket.inputSha256,result:{status:'ok',stdout:[{level:'log',text:'actual fixture output'}],result:2}}});
 }});
 return {client,calls,saved,setLive:patch=>live={...live,...patch},setFailure:value=>failure=value,setPhase:value=>phase=value};
}
test('construction and quote never submit; explicit run persists hashes before POST and polls actual result',async()=>{
 const h=fixture();assert.equal(h.calls.length,0);await h.client.quote();assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);const value=await h.client.run({confirmed:true,maxReservedMicros:5000});assert.equal(value.job.result.result,2);assert.equal(h.saved.length,1);assert.equal(h.saved[0].code,undefined);assert.equal(h.saved[0].input,undefined);assert.match(h.saved[0].sourceSha256,/^[a-f0-9]{64}$/);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);await assert.rejects(h.client.run({confirmed:true,maxReservedMicros:5000}),/already submitted/);
});
test('lost submission preserves ticket and forbids automatic resubmission; explicit resume only GET',async()=>{
 const h=fixture();h.setFailure(true);await assert.rejects(h.client.run({confirmed:true,maxReservedMicros:5000}));assert.equal(h.saved.length,1);h.setFailure(false);await h.client.resume(h.saved[0]);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
});
test('owner/source/input/read-only changes refuse before submission and stale resume',async()=>{
 for(const patch of [{ownerKey:'other'},{code:'return 3;'},{input:{x:4}},{readOnly:true},{scope:{app:'other',board:'main',sourceId:'code-card'}}]){const h=fixture();h.setLive(patch);await assert.rejects(h.client.run({confirmed:true,maxReservedMicros:5000}));assert.equal(h.calls.length,0);}
 const h=fixture();await h.client.run({confirmed:true,maxReservedMicros:5000});h.setLive({code:'return 3;'});const before=h.calls.length;await assert.rejects(h.client.resume(h.saved[0]),/earlier snapshot/);assert.equal(h.calls.length,before);
});
test('explicit cancellation does not require unchanged source text and never resubmits',async()=>{
 const h=fixture();await h.client.run({confirmed:true,maxReservedMicros:5000});h.setLive({code:'return 3;'});assert.equal((await h.client.cancel(h.saved[0])).job.phase,'cancelled');assert.equal(h.calls.at(-1).path.endsWith('/cancel'),true);
});
test('ticket arrays and changed hashes are rejected without fetch',async()=>{
 const h=fixture();await h.client.run({confirmed:true,maxReservedMicros:5000});const before=h.calls.length;for(const patch of [{id:[h.saved[0].id]},{sourceSha256:'a'.repeat(64)},{ownerKey:'other'}])await assert.rejects(h.client.resume({...h.saved[0],...patch}));assert.equal(h.calls.length,before);
});
test('no consent, failed persistence or pre-abort produces no execution request',async()=>{
 const h=fixture();await assert.rejects(h.client.run({confirmed:false,maxReservedMicros:5000}));await assert.rejects(h.client.run({confirmed:true,maxReservedMicros:5000,signal:AbortSignal.abort()}));assert.equal(h.calls.length,0);
 const client=createInlineCodeClient({ownerKey:'o',scope:{app:'app',board:'main',sourceId:'id'},language:'javascript',code:'return 1;',current:()=>({ownerKey:'o',scope:{app:'app',board:'main',sourceId:'id'},language:'javascript',code:'return 1;',input:null}),persistTicket:()=>{throw Error('storage full');},fetchImpl:()=>{throw Error('must not fetch');}});await assert.rejects(client.run({confirmed:true,maxReservedMicros:1}),/storage full/);
});
test('unknown is terminal and never retries',async()=>{
 const h=fixture();h.setPhase('unknown');const value=await h.client.run({confirmed:true,maxReservedMicros:5000});assert.equal(value.job.phase,'unknown');assert.equal(h.calls.length,2);
});

test('saved execution keys separate source/input snapshots without storing their private contents',async()=>{
 const {inlineCodeTicketKey}=await import('./inline-code-client.js');
 const value={ownerKey:'owner',scope:{app:'canvas',board:'main',sourceId:'code'},code:'return privateInput;',input:{secret:'private-input'}};
 const first=await inlineCodeTicketKey(value);assert.equal(await inlineCodeTicketKey(structuredClone(value)),first);
 for(const changed of [{...value,code:'return 2;'},{...value,input:2},{...value,ownerKey:'other'}])assert.notEqual(await inlineCodeTicketKey(changed),first);
 assert.ok(!first.includes('privateInput'));assert.ok(!first.includes('private-input'));
});
