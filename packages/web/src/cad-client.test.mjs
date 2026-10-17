import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCadBlock, cadContext, cadArtifact, cadStage, cadClient, submitCadOnce } from './cad-client.js';
test('server status preserves layout, camera and last accepted revision while an edit builds', () => {
 const old={type:'cad',id:'card',revisionId:'r1',manifestUrl:'/r1',dx:24,dy:35,w:500,camera:{x:1}};
 const next=mergeCadBlock(old,{type:'cad',id:'card',jobId:'edit',baseRevisionId:'r1',revisionId:'r2',awaitingAccept:true,status:'ready',manifestUrl:'/r2'});
 assert.equal(next.revisionId,'r1'); assert.equal(next.manifestUrl,'/r1'); assert.equal(next.proposedRevisionId,'r2'); assert.equal(next.dx,24); assert.deepEqual(next.camera,{x:1});
});
test('artifact links only come from the matching immutable manifest',()=>{
 assert.equal(cadArtifact({revisionId:'r1',artifacts:[{kind:'glb',url:'/glb'}]},'glb','r2'),null);
 assert.equal(cadArtifact({revisionId:'r1',artifacts:[{kind:'glb',url:'/glb'}]},'glb','r1').url,'/glb');
});
test('context names measured coverage without attaching model source',()=>{
 const text=cadContext({title:'Part',modelId:'m',revisionId:'r',units:'mm',briefSummary:'Bracket',parameters:{width:20},source:'private python'}).text;
 assert.match(text,/mm/); assert.match(text,/r/); assert.doesNotMatch(text,/private python/); assert.match(text,/not exact geometry/);
});
test('waiting stage is explicit and unknown progress is not fabricated',()=>{
 assert.equal(cadStage('waiting_for_answer'),'Waiting for your answer'); assert.equal(cadStage('building'),'Building geometry');
});

test('a building edit retains the existing preview and is never treated as accepted',()=>{
 const before={id:'c',revisionId:'r1',manifestUrl:'/old',status:'ready'};
 const after=mergeCadBlock(before,{id:'c',baseRevisionId:'r1',revisionId:null,manifestUrl:'/new',status:'building'});
 assert.equal(after.revisionId,'r1');assert.equal(after.manifestUrl,'/old');assert.equal(after.status,'building');
});

test('accepted revision clears a stale proposal without altering position',()=>{
 const result=mergeCadBlock({id:'c',revisionId:'r1',proposedRevisionId:'r2',dx:7},{id:'c',revisionId:'r2',status:'ready'});
 assert.equal(result.revisionId,'r2');assert.equal(result.proposedRevisionId,undefined);assert.equal(result.dx,7);
});
test('retry and clarification explicitly authorize only their existing job action',async()=>{
 const calls=[];const client=cadClient(async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return {};},'canvas-a','main');
 await client.action('job/one','clarify',{answer:'mm'});await client.action('job/one','retry');await client.action('job/one','exports',{format:'stl'});
 assert.equal(calls[0].body.confirmed,true);assert.equal(calls[1].body.confirmed,true);assert.equal(calls[2].body.confirmed,undefined);
 assert.match(calls[0].path,/job%2Fone/);assert.equal(calls[0].body.answer,'mm');
});
test('a lost response retries the same identity; concurrent sends share one submission',async()=>{
 const pending=new Map(),requests=[];let attempt=0,id=0;
 const start=async request=>{requests.push(request);if(attempt++===0)throw Error('network response lost');return {job:{id:'j'}};};
 await assert.rejects(submitCadOnce(pending,'same',start,{prompt:'plate'},()=>`id${++id}`),/lost/);
 const [a,b]=await Promise.all([submitCadOnce(pending,'same',start,{prompt:'plate'}),submitCadOnce(pending,'same',start,{prompt:'plate'})]);
 assert.deepEqual(a,b);assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(requests[0].cardId,requests[1].cardId);assert.equal(pending.size,0);
});

test("pending CAD cards have no artifacts before their manifest exists", () => { assert.equal(cadArtifact(null, "glb"), null); assert.equal(cadArtifact(undefined, "thumbnail"), null); });
