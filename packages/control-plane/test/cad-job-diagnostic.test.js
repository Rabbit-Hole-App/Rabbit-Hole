import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cadJobDiagnostic } from '../src/cad-job-diagnostic.js';
import { CadJobs } from '../src/cad-jobs.js';
import { newCadId, publicCadJob } from '../src/cad-contract.js';

const token='diagnostic-test-only-token-1234567890';
function fixture() {
  const id=newCadId('board-one'), reads=[];
  const job={id,attempt:1,state:'failed',failureCode:'validation_failed',failureStage:'checking',failurePhase:'check',failureAttempt:1,failureDiagnostics:'ValueError: no solid\nBearer private-provider-secret',lastFailure:{code:'execution_failed',stage:'building',phase:'build',attempt:0,diagnostics:'private-provider-secret',owner:'private'},source:{id:'source',key:'cad/source.py',sha256:'hash',credential:'private'},prompt:'make a frame',brief:{units:'mm'},checks:[{id:'bounds',kind:'bounds_mm',value:[40,20,5]}],owner:{email:'private'},sourceText:'private code',pendingResult:{private:true}};
  const storage=new Proxy({get:async key=>{reads.push(key);return key==='job:'+id?structuredClone(job):undefined;}},{get(target,key){if(key==='get')return target.get;return()=>{throw Error('Forbidden storage operation: '+String(key));};}});
  const env={CAD_DIAGNOSTIC_READ_TOKEN:token,CAD_MODEL_API_KEY:'private-provider-secret'};
  const state={id:'actor:board-one',storage,blockConcurrencyWhile:()=>{throw Error('No gate needed');}};
  const actor=new CadJobs(state,env);
  env.CAD_JOBS={idFromName:name=>'actor:'+name,get:id=>{assert.equal(id,state.id);return{fetch:(url,init)=>actor.fetch(new Request(url,init))};}};
  const request=(query='?job='+id,options={})=>new Request('https://app/internal/cad-job-diagnostic'+query,{headers:{authorization:'Bearer '+token},...options});
  return{env,state,actor,id,reads,job,request};
}
test('operator read returns sanitized single-job whitelist without any storage mutation',async()=>{
  const f=fixture(),response=await cadJobDiagnostic(f.request(),f.env),body=await response.json();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(f.reads,['job:'+f.id]);
  assert.deepEqual(Object.keys(body.job).sort(),['id','attempt','state','failureCode','failureStage','failurePhase','failureAttempt','failureDiagnostics','lastFailure','source','prompt','brief','checks'].sort());
  assert.match(body.job.failureDiagnostics,/ValueError: no solid/);assert.doesNotMatch(JSON.stringify(body),/private-provider-secret|credential|sourceText|pendingResult|owner/);
  assert.deepEqual(body.job.source,{id:'source',key:'cad/source.py',sha256:'hash'});assert.equal(body.job.lastFailure.diagnostics,'[redacted]');assert.deepEqual(body.job.checks,f.job.checks);
  assert.equal(publicCadJob(f.job).failureDiagnostics,undefined);assert.equal(publicCadJob(f.job).lastFailure,undefined);
});
test('missing, incorrect and oversized dedicated credentials cannot read jobs',async()=>{
  for(const authorization of ['', 'Bearer wrong', 'Bearer '+'x'.repeat(1100)]){const f=fixture();assert.equal((await cadJobDiagnostic(f.request(undefined,{headers:{authorization}}),f.env)).status,401);assert.deepEqual(f.reads,[]);}
  const f=fixture();delete f.env.CAD_DIAGNOSTIC_READ_TOKEN;assert.equal((await cadJobDiagnostic(f.request(),f.env)).status,503);assert.deepEqual(f.reads,[]);
});
test('GET only and exactly one canonical job parameter are required',async()=>{
  const f=fixture();assert.equal((await cadJobDiagnostic(f.request(undefined,{method:'POST'}),f.env)).status,405);
  for(const query of ['', '?job=bad','?job='+f.id+'&extra=1','?job='+f.id+'&job='+f.id])assert.equal((await cadJobDiagnostic(f.request(query),f.env)).status,400);
  assert.deepEqual(f.reads,[]);
});
test('missing job is404 and actor mismatch refuses before storage access',async()=>{
  const f=fixture(),missing=newCadId('board-one');assert.equal((await cadJobDiagnostic(f.request('?job='+missing),f.env)).status,404);assert.deepEqual(f.reads,['job:'+missing]);
  f.reads.length=0;f.state.id='actor:another';assert.equal((await f.actor.fetch(new Request('https://cad/diagnostic?id='+f.id))).status,404);assert.deepEqual(f.reads,[]);
});
test('internal read rejects malformed queries and methods without storage access',async()=>{
  const f=fixture();assert.equal((await f.actor.fetch(new Request('https://cad/diagnostic?id='+f.id,{method:'POST'}))).status,405);
  assert.equal((await f.actor.fetch(new Request('https://cad/diagnostic?id=bad'))).status,400);assert.deepEqual(f.reads,[]);
});
test('binding failures expose no private error text and mismatched returned IDs fail closed',async()=>{
  const f=fixture();for(const fetch of [async()=>{throw Error('private-provider-secret');},async()=>Response.json({job:{id:'wrong',owner:'private'}})]){
    f.env.CAD_JOBS.get=()=>({fetch});const result=await cadJobDiagnostic(f.request(),f.env);assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private-provider-secret|owner/);
  }
});
test('production entry routes the operator read before the ordinary worker',()=>{
  const source=readFileSync(new URL('../../web/app-worker.js',import.meta.url),'utf8');
  assert.match(source,/if \(url.pathname === '\/internal\/cad-job-diagnostic'\) return cadJobDiagnostic\(req, env\)/);
  assert.ok(source.indexOf("url.pathname === '/internal/cad-job-diagnostic'")<source.indexOf('return worker.fetch'));
});
