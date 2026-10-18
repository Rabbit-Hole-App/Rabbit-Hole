import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageEditJobCoordinator } from '../src/inline-image-edit-job.js';
const image=new Uint8Array([1,2,3]),hash=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const sourceSha256=await hash(image);
function harness(overrides={}) {
 const records=new Map(),calls={admit:[],edit:[],publish:[],settle:[]};let queue=Promise.resolve();
 const storage={get:async key=>structuredClone(records.get(key)),put:async(key,value)=>{records.set(key,structuredClone(value));},transaction(fn){const next=queue.then(()=>fn(storage));queue=next.catch(()=>{});return next;}};
 const deps={storage,admitSpend:async input=>{calls.admit.push(input);return {refused:false,opId:input.opId};},settleSpend:async(...args)=>{calls.settle.push(args);},edit:async input=>{calls.edit.push(input);return {bytes:new Uint8Array([4,5]),mimeType:'image/png',validation:'png-pixels',usage:{total_tokens:5}};},publish:async input=>{calls.publish.push(input);return{id:'asset-1'};},...overrides};
 return {records,calls,deps,job:createImageEditJobCoordinator(deps)};
}
const create=job=>job.create({id:'job1',operation:'remove_background',sourceSha256,reservedUsd:0.15});
const run=job=>job.run('job1',{image});

test('immutable create binding, positive reservation, and source hash are enforced before admission',async()=>{
 const h=harness();await create(h.job);await create(h.job);
 await assert.rejects(h.job.create({id:'job1',operation:'remove_background',sourceSha256,reservedUsd:0.2}),{code:'conflict'});
 await assert.rejects(h.job.create({id:'bad',operation:'remove_background',sourceSha256,reservedUsd:0}),{code:'invalid_input'});
 await assert.rejects(h.job.run('job1',{image:new Uint8Array([9])}),{code:'source_mismatch'});
 await assert.rejects(h.job.run('job1',{image,prompt:'changed'}),{code:'invalid_input'});assert.equal(h.calls.admit.length,0);
});
test('duplicate invocation admits, generates, publishes and settles only once',async()=>{
 const h=harness();await create(h.job);const [a,b]=await Promise.all([run(h.job),run(h.job)]);assert.equal(a.phase,'ready');assert.deepEqual(a,b);await run(h.job);
 for(const key of ['admit','edit','publish','settle'])assert.equal(h.calls[key].length,1);
 assert.equal(h.calls.admit[0].category,'image_edit');assert.equal(h.calls.admit[0].opId,'image_edit:job1');assert.equal(h.calls.settle[0][1].costUsd,null);assert.equal(a.reservation,'settled_at_reserved_bound');
 assert.equal(JSON.stringify([...h.records.values()]).includes('"bytes"'),false);
});
test('cancel before start generates no admission or provider request',async()=>{
 const h=harness();await create(h.job);await h.job.cancel('job1');assert.equal((await run(h.job)).phase,'cancelled');assert.equal(h.calls.admit.length,0);assert.equal(h.calls.edit.length,0);
});
test('restart at every uncertain phase holds reservation and never retries',async()=>{
 for(const phase of ['admitting','started','publishing']){const h=harness();await create(h.job);const record=h.records.get('image-edit:job1');h.records.set('image-edit:job1',{...record,phase,reservation:'held'});const restarted=createImageEditJobCoordinator(h.deps);assert.equal((await run(restarted)).phase,'unknown');assert.equal(h.calls.admit.length,0);assert.equal(h.calls.edit.length,0);assert.equal(h.calls.publish.length,0);assert.equal(h.calls.settle.length,0);}
});
test('crash after admission before started marker cannot duplicate provider call',async()=>{
 const h=harness();await create(h.job);const put=h.deps.storage.put;h.deps.storage.put=async(key,value)=>{if(value.phase==='started')throw Error('storage crash');return put(key,value);};
 await assert.rejects(run(h.job),/storage crash/);h.deps.storage.put=put;assert.equal((await run(createImageEditJobCoordinator(h.deps))).phase,'unknown');assert.equal(h.calls.admit.length,1);assert.equal(h.calls.edit.length,0);
});
test('cancel during admission fences dispatch and releases only acknowledged unused reservation',async()=>{
 let release;const wait=new Promise(resolve=>release=resolve);const h=harness({admitSpend:async()=>{await wait;return{refused:false};}});await create(h.job);const pending=run(h.job);while((await h.job.get('job1')).phase!=='admitting')await new Promise(resolve=>setTimeout(resolve,1));await h.job.cancel('job1');release();assert.equal((await pending).phase,'cancelled');assert.equal(h.calls.edit.length,0);assert.equal(h.calls.settle[0][1].calls,0);assert.equal(h.calls.settle[0][1].costUsd,0);
});
test('cancel after provider starts holds reservation with no publication or refund claim',async()=>{
 let began,release;const started=new Promise(resolve=>began=resolve),waiting=new Promise(resolve=>release=resolve);const h=harness({edit:async()=>{began();await waiting;return {bytes:image,mimeType:'image/png',validation:'png-pixels'};}});await create(h.job);const pending=run(h.job);await started;await h.job.cancel('job1');release();const result=await pending;assert.equal(result.phase,'unknown');assert.equal(result.cancelRequested,true);assert.equal(h.calls.publish.length,0);assert.equal(h.calls.settle.length,0);
});
test('cancel during publication cannot be overwritten by ready',async()=>{
 let began,release;const started=new Promise(resolve=>began=resolve),waiting=new Promise(resolve=>release=resolve);const h=harness({publish:async()=>{began();await waiting;return{id:'asset1'};}});await create(h.job);const pending=run(h.job);await started;await h.job.cancel('job1');release();const result=await pending;assert.equal(result.phase,'unknown');assert.equal(result.cancelRequested,true);assert.equal(result.artifactId,'asset1');assert.equal(h.calls.settle.length,0);
});
test('unknown output and publication failure never trigger another provider request',async()=>{
 for(const overrides of [{edit:async()=>({bytes:image,mimeType:'text/plain'})},{publish:async()=>{throw Error('storage unavailable');}}]){const h=harness(overrides);await create(h.job);assert.equal((await run(h.job)).phase,'unknown');assert.equal((await run(h.job)).reservation,'held');assert.equal(h.calls.admit.length,1);assert.equal(h.calls.settle.length,0);}
});
test('settlement failure preserves ready artifact and never reruns generation',async()=>{
 const h=harness({settleSpend:async()=>{throw Error('ledger unavailable');}});await create(h.job);assert.equal((await run(h.job)).phase,'ready');assert.equal((await run(createImageEditJobCoordinator(h.deps))).phase,'ready');assert.equal(h.calls.edit.length,1);assert.equal(h.calls.publish.length,1);assert.equal((await h.job.get('job1')).reservation,'held');
});
test('regional job uses immutable prompt and mask; no arbitrary per-run prompt accepted',async()=>{
 const h=harness();await h.job.create({id:'job1',operation:'edit_image',sourceSha256,maskSha256:sourceSha256,prompt:'Red hat',reservedUsd:0.15});await assert.rejects(run(h.job),{code:'source_mismatch'});await h.job.run('job1',{image,mask:image});assert.equal(h.calls.edit[0].prompt,'Red hat');
});

test('uncertain ledger refusal keeps possible admission held; definite cap refusal does not retry',async()=>{
 for(const [reason,phase]of [['spend_schema_unavailable','unknown'],['daily_cap_reached','refused']]){let calls=0;const h=harness({admitSpend:async()=>{calls++;return{refused:true,reason};}});await create(h.job);assert.equal((await run(h.job)).phase,phase);await run(h.job);assert.equal(calls,1);assert.equal(h.calls.edit.length,0);assert.equal(h.calls.settle.length,0);}
});
test('crash after immutable publication before ready marker does not republish or regenerate',async()=>{
 const h=harness();await create(h.job);const put=h.deps.storage.put;let published=false;
 h.deps.publish=async()=>{published=true;h.calls.publish.push('published');return{id:'asset1'};};const job=createImageEditJobCoordinator(h.deps);
 h.deps.storage.put=async(key,value)=>{if(published)throw Error('storage crash');return put(key,value);};await assert.rejects(run(job),/storage crash/);h.deps.storage.put=put;
 assert.equal((await run(createImageEditJobCoordinator(h.deps))).phase,'unknown');assert.equal(h.calls.edit.length,1);assert.equal(h.calls.publish.length,1);assert.equal(h.calls.settle.length,0);
});

test('caller mutation during admission cannot change the hash-bound upload',async()=>{
 const mutable=image.slice();const h=harness({admitSpend:async()=>{mutable[0]=99;return{refused:false};}});await create(h.job);await h.job.run('job1',{image:mutable});assert.deepEqual(h.calls.edit[0].image,image);
});
