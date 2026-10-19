import { modelDecideRequest } from '../src/learn-inline-route.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceComputeAvailable, checkSourceCompute } from '../src/inline-source-compute.js';
import { inlineDecideFetch, inlineGenerateFetch } from '../src/learn-inline.js';
import { KEY_ENV, jevSays } from './learn-inline-fixture.js';
const sourceId='file:fs_'+ 'a'.repeat(24)+'@'+'b'.repeat(64);
const page={targetId:'pdf',sourceId,range:{page:2}};
const request=()=>({kind:'selection',mode:'explain',targetIds:['pdf'],prompt:'Extract the selected page table and plot length against time',context:{target:{ids:['pdf']},sourceRanges:[structuredClone(page)],sourceComputation:{type:'table_plot'}}});
const input=()=>({summary:'Review recognized values and plot',sourceComputation:{table:{columns:['Time','Length'],rows:[['0','2'],['1','4']]},operation:{type:'table_plot',columns:[1],units:['mm'],xColumn:0,xUnit:'s'}},uncertainties:[]});
const readings=[{...page,coverage:'partial'}];
test('result binds exact authorized page scope and retains recognized cells and partial coverage',()=>{
 const prompt=modelDecideRequest(request(),{capability:'note'});assert.match(prompt.system,/table and plot preview/);assert.doesNotMatch(prompt.system,/Other requested outputs are unsupported here/);
 const value=checkSourceCompute(input(),request(),'request-123',readings).result;
 assert.equal(value.kind,'source_compute');assert.deepEqual(value.table,input().sourceComputation.table);assert.deepEqual(value.sourceReadings,readings);assert.equal(value.requestId,'request-123');assert.equal(value.graph,undefined);
 assert.ok(checkSourceCompute(input(),request(),'request-123',[{...readings[0],range:{page:1}}]).error);
 assert.ok(checkSourceCompute({...input(),sourceReadings:readings},request(),'request-123',readings).error);
 assert.ok(checkSourceCompute({...input(),sourceComputation:{...input().sourceComputation,points:[]}},request(),'request-123',readings).error);
 assert.equal(checkSourceCompute({clarify:{question:'Which units?'}},request(),'request-123',readings).result.kind,'clarify');
});
test('only explicit page plot scope is eligible, never implicit image/chat/source selection or Edit',()=>{
 for(const mutate of [r=>{r.mode='edit';},r=>{delete r.context.sourceComputation;},r=>{r.context.sourceComputation.type='table_summary';},r=>{r.context.sourceComputation.code='run';},r=>{r.context.image={id:'image'};},r=>{r.targetIds.push('other');},r=>{r.textRange={id:'pdf',from:0,to:1};},r=>{r.context.sourceRanges[0].sourceId='ctx:pdf';}]){const r=request();mutate(r);assert.equal(sourceComputeAvailable(r),false);}
});
test('signed one-call extraction uses exact page text, publishes computed-only proposal and refuses tampering',async()=>{
 const post=body=>new Request('https://test/api/learn/inline/generate',{method:'POST',body:JSON.stringify(body)});
 const body={app:'canvas-demo',request_id:'request-123',request:request(),enabled:['note']};
 body.request.context.extra='UNRELATED-CONTEXT-SENTINEL';
 const row={id:'board',state_json:JSON.stringify({blocks:[{id:'pdf',fileRef:{family:'pdf',source:{id:'fs_'+'a'.repeat(24),rev:'b'.repeat(64)}}}]})};
 let calls=0;
 const deps={authorize:async()=>({name:'canvas-demo',email:'owner@test'}),ask:jevSays('proceed'),sourceRangeDeps:{loadBoard:async()=>row,read:async()=>({blocks:['[p. 2] PAGE-TABLE-SENTINEL time(s) length(mm): 0 2; 1 4'],coverage:new Map([[sourceId+'|{"page":2}','partial']])})},callModel:async(_env,prompt)=>{
 calls++;assert.equal(prompt.tools[0].name,'inline_source_compute');assert.match(JSON.stringify(prompt.messages),/PAGE-TABLE-SENTINEL/);assert.doesNotMatch(JSON.stringify(prompt.messages),/UNRELATED-CONTEXT-SENTINEL/);assert.match(prompt.system,/does not verify recognition/);
 return Response.json({stop_reason:'tool_use',content:[{type:'tool_use',name:prompt.tools[0].name,input:input()}]});}};
 const decision=await(await inlineDecideFetch(post(body),KEY_ENV,deps)).json();assert.ok(decision.token);
 const output=await(await inlineGenerateFetch(post({...body,token:decision.token}),KEY_ENV,deps)).text();assert.match(output,/"kind":"source_compute"/);assert.match(output,/"coverage":"partial"/);assert.equal(calls,1);
 const malformed=structuredClone(body);malformed.request.context.sourceComputation.code='execute';assert.equal((await inlineDecideFetch(post(malformed),KEY_ENV,{...deps,ask:()=>assert.fail('no validator for unsupported computation')})).status,400);
 assert.equal((await inlineGenerateFetch(post({...body,token:decision.token,revise:{prompt:'change',result:'UNTRUSTED PRIOR DATA'}}),KEY_ENV,deps)).status,400);
 const changed=structuredClone(body);changed.request.context.sourceRanges[0].range.page=1;assert.equal((await inlineGenerateFetch(post({...changed,token:decision.token}),KEY_ENV,deps)).status,403);
 const inaccessible={...deps,sourceRangeDeps:{...deps.sourceRangeDeps,loadBoard:async()=>null},callModel:()=>assert.fail('no request after source revoked')};assert.equal((await inlineGenerateFetch(post({...body,token:decision.token}),KEY_ENV,inaccessible)).status,409);
});
