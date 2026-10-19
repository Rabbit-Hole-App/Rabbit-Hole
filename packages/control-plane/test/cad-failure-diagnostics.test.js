import test from 'node:test';
import assert from 'node:assert/strict';
import {CadJobs} from '../src/cad-jobs.js';
import {publicCadJob} from '../src/cad-contract.js';
import {sanitizeCadDiagnostics} from '../src/cad-failure.js';

function fixture(extra={}) {
 const records=new Map(),id='cad-fixture',job={id,modelId:'model',cardId:'card',attempt:1,state:'building',stage:'building',operation:'build',repairs:0,limits:{repairs:0,calls:2,usd:.2,elapsedMs:1000},calls:0,reservedUsd:0,...extra};
 records.set('job:'+id,structuredClone(job));
 const storage={get:async key=>structuredClone(records.get(key)),put:async(key,value)=>records.set(key,structuredClone(value)),getAlarm:async()=>null,setAlarm:async()=>{}};
 const actor=new CadJobs({storage,blockConcurrencyWhile:fn=>fn()},{CAD_MAX_REPAIRS:'0',CAD_EXECUTOR_TOKEN:'secret-fixture-executor-token'});
 return{actor,storage,job,fail:body=>actor.callback(new Request('https://cad/callback?id='+id+'&attempt=1&action=fail',{method:'POST',body:JSON.stringify(body)}))};
}
test('terminal executor failure retains bounded private diagnostics and useful public identity',async()=>{
 const f=fixture();await f.fail({error:'execution_failed',diagnostics:'Traceback\nFile "/var/cad/jobs/private/source.py", line 8\nValueError: bad dimension\nBearer secret-fixture-executor-token\nhttps://private.invalid/a?token=hidden\n'+'x'.repeat(9000)});
 const saved=await f.storage.get('job:cad-fixture'),pub=publicCadJob(saved);
 assert.equal(saved.state,'failed');assert.equal(saved.failureAttempt,1);assert.equal(saved.failureStage,'building');
 assert.match(saved.failureDiagnostics,/ValueError: bad dimension/);assert.ok(saved.failureDiagnostics.length<=4000);
 assert.doesNotMatch(saved.failureDiagnostics,/secret-fixture|private\.invalid|\/var\/cad|token=hidden/);
 assert.equal(pub.failureCode,'execution_failed');assert.match(pub.error,/cad-fixture/);assert.match(pub.error,/execution/i);
 assert.equal(pub.failureDiagnostics,undefined);assert.equal(pub.lastFailure,undefined);assert.equal(saved.repairs,0);
});
test('export failures preserve accepted artifacts',async()=>{
 const f=fixture({operation:'export',state:'ready',stage:'ready',exportState:'preparing',manifest:{revisionId:'accepted',artifacts:[]}});
 await f.fail({error:'export_failed',phase:'glb',diagnostics:'ExportError: unavailable format'});
 const saved=await f.storage.get('job:cad-fixture');assert.equal(saved.state,'ready');assert.equal(saved.exportState,'failed');assert.deepEqual(saved.manifest,f.job.manifest);assert.equal(saved.failureStage,'exporting');assert.equal(publicCadJob(saved).failurePhase,'glb');assert.match(saved.exportError,/glb/);assert.match(saved.exportError,/cad-fixture/);assert.match(saved.failureDiagnostics,/ExportError/);
});
test('exhausted repairs fail without another attempt and retain diagnostics',async()=>{
 const f=fixture({repairs:1,limits:{repairs:1,calls:2,usd:.2,elapsedMs:1000}});f.actor.env.CAD_MAX_REPAIRS='1';
 await f.fail({error:'validation_failed',diagnostics:'ValueError: no solid'});
 const saved=await f.storage.get('job:'+f.job.id);assert.equal(saved.state,'failed');assert.equal(saved.repairs,1);assert.equal(saved.attempt,1);assert.match(saved.failureDiagnostics,/no solid/);
});
test('allowed repair archives private diagnostic while preserving the existing repair limit',async()=>{
 const f=fixture({limits:{repairs:1,calls:2,usd:.2,elapsedMs:1000}});f.actor.env.CAD_MAX_REPAIRS='1';
 await f.fail({error:'execution_failed',phase:'build',diagnostics:'ValueError: no solid\nBearer secret-fixture-executor-token'});
 const saved=await f.storage.get('job:'+f.job.id);assert.equal(saved.state,'repairing');assert.equal(saved.repairs,1);assert.equal(saved.attempt,2);assert.equal(saved.failureCode,undefined);assert.match(saved.lastFailure.diagnostics,/no solid/);assert.equal(saved.lastFailure.phase,'build');assert.equal(saved.repairReason,saved.lastFailure.diagnostics);assert.doesNotMatch(saved.repairReason,/secret-fixture/);assert.equal(publicCadJob(saved).lastFailure,undefined);
});
test('non-executor failures expose a reference and stage without disclosing private diagnostics',async()=>{
 const f=fixture({stage:'checking'});await f.actor.fail(f.job,'Visual review could not complete.');
 const saved=await f.storage.get('job:'+f.job.id);assert.match(saved.error,/Job cad-fixture, attempt 1, stage checking/);assert.equal(saved.failureCode,'cad_failed');assert.equal(publicCadJob(saved).failureDiagnostics,undefined);
});
test('delayed failure cannot mutate pending publication diagnostics',async()=>{
 const f=fixture({pendingResult:{artifacts:[]},stage:'publishing'});await f.fail({error:'execution_failed',diagnostics:'late'});
 const saved=await f.storage.get('job:cad-fixture');assert.equal(saved.failureCode,undefined);assert.equal(saved.failureDiagnostics,undefined);assert.equal(saved.stage,'publishing');
});
test('explicit retry keeps one private failure snapshot and clears current failure fields',async()=>{
 const f=fixture();await f.fail({error:'validation_failed',diagnostics:'ValueError: missing solid'});
 await f.actor.action({action:'retry',id:f.job.id,payload:{confirmed:true}});
 const saved=await f.storage.get('job:'+f.job.id);assert.equal(saved.attempt,2);assert.equal(saved.failureCode,undefined);assert.equal(saved.failureDiagnostics,undefined);
 assert.deepEqual(saved.lastFailure,{code:'validation_failed',stage:'building',phase:null,attempt:1,diagnostics:'ValueError: missing solid'});
 assert.equal(publicCadJob(saved).lastFailure,undefined);assert.equal(saved.repairs,0);assert.equal(saved.calls,0);
});
test('prototype-named codes and untrusted phases produce only a generic failure',async()=>{
 const f=fixture();await f.fail({error:'constructor',phase:'private-file-path',diagnostics:'ValueError'});
 const saved=await f.storage.get('job:'+f.job.id);assert.match(saved.error,/could not complete/);assert.doesNotMatch(saved.error,/function|private-file/);assert.equal(saved.failurePhase,null);
 const historical=publicCadJob({id:'old',failureCode:'execution_failed'});assert.equal(historical.failureCode,'execution_failed');assert.equal(historical.failureStage,undefined);
});
test('completed attempts reject late failure without contaminating their record',async()=>{
 const f=fixture({state:'checking',stage:'checking',completedAttempt:1});
 await assert.rejects(f.fail({error:'execution_failed',diagnostics:'late'}),/completed/);
 const saved=await f.storage.get('job:'+f.job.id);assert.equal(saved.failureCode,undefined);assert.equal(saved.state,'checking');
});
test('unknown codes stay generic and diagnostic credentials/paths never enter public errors',async()=>{
 const f=fixture();await f.fail({error:'private_internal_guess',diagnostics:'"token": "abc123"\nFile "C:\\Users\\private\\source.py", line 3\nhttps://host/file?key=abc\nValueError: missing solid'});
 const saved=await f.storage.get('job:'+f.job.id);assert.match(saved.error,/could not complete/);assert.doesNotMatch(saved.error,/private_internal_guess|abc123|source.py/);
 assert.doesNotMatch(saved.failureDiagnostics,/abc123|C:\\Users|https:\/\//);assert.match(saved.failureDiagnostics,/ValueError/);
 assert.equal(sanitizeCadDiagnostics(null),'');
});
