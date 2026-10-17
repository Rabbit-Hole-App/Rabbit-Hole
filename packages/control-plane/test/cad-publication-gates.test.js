import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const moduleUrl=process.env.CAD_IMPLEMENTATION_DIR?pathToFileURL(resolve(process.env.CAD_IMPLEMENTATION_DIR,'packages/control-plane/src/cad-jobs.js')):new URL('../src/cad-jobs.js',import.meta.url);
const {CadJobs}=await import(moduleUrl.href);
function fixture(){
 let gate=0,escaped=0,alarm=null,external=0,hold=null;const data=new Map(),objects=new Map(),writes=[];
 const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>{writes.push({key:k,gate});return data.set(k,structuredClone(v));},getAlarm:async()=>alarm,setAlarm:async x=>{alarm=x;}};
 const state={storage,blockConcurrencyWhile:async fn=>{gate++;try{return await fn();}catch(error){escaped++;throw error;}finally{gate--;}}};
 const outside=()=>{external++;assert.equal(gate,0,'external R2/D1 work must not hold DO concurrency gate');};
 const bucket={head:async key=>{outside();const o=objects.get(key);return o?{size:o.bytes.length,customMetadata:{sha256:o.hash}}:null;},get:async key=>{outside();const o=objects.get(key);return o?{body:o.bytes,arrayBuffer:async()=>o.bytes.buffer}:null;},put:async(key,bytes,opts)=>{outside();if(hold&&key.startsWith('file-sources/'))await hold();objects.set(key,{bytes:new Uint8Array(bytes),hash:opts.sha256});}};
 const env={LEARN_MEDIA:bucket,LEARN_DB:{prepare:()=>({bind(){return this;}}),batch:async rows=>{outside();return rows.map(()=>({}));}},CAD_TEST_MODEL:()=>{throw Error('No model call allowed');}};
 const actor=new CadJobs(state,env);
 const job={id:'job1',attempt:1,revisionId:'r1',modelId:'model1',cardId:'card1',state:'checking',stage:'checking',operation:'build',source:{id:'fs_source',sha256:'a'.repeat(64),bytes:10},brief:{title:'Fixture',units:'mm',parameters:{},assumptions:[]},limits:{calls:6,usd:0.6,elapsedMs:10000},calls:6,reservedUsd:0.6,deadline:Date.now()+10000};
 const outputs=['step','glb','thumbnail'].map(kind=>{const bytes=new TextEncoder().encode('synthetic '+kind),sha256=createHash('sha256').update(bytes).digest('hex'),name='fixture.'+kind;objects.set(`cad-staging/job1/1/${name}`,{bytes,hash:sha256});return {name,kind,bytes:bytes.length,sha256,media_type:'application/octet-stream'};});
 job.pendingResult={schema:'cad-execute-result/1',job_id:job.id,attempt:1,revision_id:'r1',runtime:{cadgen:'0.7.21'},outputs,validation:{baselinePassed:true,units:'mm',checks:[]}};
 data.set('job:job1',structuredClone(job));
 const action=(action,payload={})=>actor.fetch(new Request('https://cad/action',{method:'POST',body:JSON.stringify({action,id:'job1',payload})}));
 return {actor,state,env,job,data,storage,action,setHold:fn=>{hold=fn;},counts:()=>({gate,escaped,external,writes})};
}
test('completion publishes R2 and D1 outside gate; commit stays gated',async()=>{
 const f=fixture();const result=await f.actor.publish(f.job);assert.equal(result.status,200);assert.ok(f.counts().external>0);assert.equal(f.counts().escaped,0);
 const saved=await f.storage.get('job:job1');assert.equal(saved.pendingResult,null);assert.equal(saved.modelPhase,'review');assert.equal(saved.completedAttempt,1);assert.equal(f.counts().writes.at(-1).gate,1);
});
test('expected action conflicts return normally through gate without triggering a platform reset',async()=>{
 const f=fixture();const response=await f.action('accept',{expectedRevisionId:'wrong'});assert.equal(response.status,409);assert.equal(f.counts().escaped,0);assert.equal((await f.storage.get('job:job1')).revisionId,'r1');
});
test('cancellation during external publication prevents accepted pointer publication',async()=>{
 const f=fixture();let release,entered;const started=new Promise(r=>{entered=r;}),blocked=new Promise(r=>{release=r;});f.setHold(async()=>{entered();await blocked;});
 const pending=f.actor.publish(f.job);await started;assert.equal((await f.action('cancel')).status,200);release();await assert.rejects(pending,/Stale CAD publication/);
 assert.equal((await f.storage.get('job:job1')).state,'cancelled');assert.equal(f.data.has('model:model1'),false);assert.equal(f.counts().escaped,0);
});
test('failed pending publication recovers on explicit Retry without new attempt or model allowance',async()=>{
 const f=fixture();await f.storage.put('job:job1',{...f.job,state:'failed',error:'publication transport failed'});
 assert.equal((await f.action('retry')).status,202);const restored=await f.storage.get('job:job1');assert.equal(restored.attempt,1);assert.equal(restored.calls,6);assert.ok(restored.pendingResult);
 const restarted=new CadJobs(f.state,f.env);await restarted.advance(restored);const saved=await f.storage.get('job:job1');assert.equal(saved.completedAttempt,1);assert.equal(saved.calls,6);assert.equal(saved.pendingResult,null);
});
test('cancelled optional export cannot be resurrected by an in-flight publication',async()=>{
 const f=fixture();f.job.state='ready';f.job.operation='export';f.job.exportState='preparing';f.job.exportFormat='stl';f.job.manifest={revisionId:'r1',artifacts:[]};
 // Export publication's storage mechanics are independent of artifact format.
 f.job.pendingResult.outputs[0].kind='stl';await f.storage.put('job:job1',f.job);await f.storage.put('model:model1',{revisionId:'r1',manifest:f.job.manifest});
 let release,entered;const started=new Promise(r=>{entered=r;}),blocked=new Promise(r=>{release=r;});f.setHold(async()=>{entered();await blocked;});
 const pending=f.actor.publish(f.job);await started;assert.equal((await f.action('cancel')).status,200);release();await assert.rejects(pending,/Stale CAD publication/);
 assert.equal((await f.storage.get('job:job1')).exportState,'failed');assert.equal((await f.storage.get('model:model1')).manifest.artifacts.length,0);
});

test('cancel then retry clears old pending result before new attempt starts',async()=>{
 const f=fixture();await f.storage.put('job:job1',{...f.job,calls:1,reservedUsd:0.1});
 assert.equal((await f.action('cancel')).status,200);assert.equal((await f.storage.get('job:job1')).pendingResult,null);
 assert.equal((await f.action('retry')).status,202);const saved=await f.storage.get('job:job1');assert.equal(saved.attempt,2);assert.equal(saved.pendingResult,null);assert.equal(saved.calls,1);
});
