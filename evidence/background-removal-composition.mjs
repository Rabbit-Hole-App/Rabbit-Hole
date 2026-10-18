import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createBackgroundRemovalController } from '../packages/web/src/inline-background-removal.js';
if(!process.env.IMAGE_REVISION_MODULE)throw Error('Set IMAGE_REVISION_MODULE to the actual existing inline-image-revision.js');
const {prepareImageRevision}=await import(pathToFileURL(process.env.IMAGE_REVISION_MODULE));
const sourceId='fs_'+'a'.repeat(24),artifactId='fs_'+'b'.repeat(24),rev='c'.repeat(64),id='ij_'+'d'.repeat(32);
const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);new DataView(bytes.buffer).setUint32(16,1024);new DataView(bytes.buffer).setUint32(20,1024);
const digest=createHash('sha256').update(bytes).digest('hex');
const block={id:'image',type:'file',kind:'image',x:45,y:62,width:320,height:240,fileRef:{v:1,source:{id:sourceId,rev},family:'image',meta:{name:'original.png'}}},scope={app:'canvas',board:'main'},calls=[];
const controller=createBackgroundRemovalController({block,scope,ownerKey:'org:owner',current:()=>({block,scope,ownerKey:'org:owner'}),prepareRevision:prepareImageRevision,persistTicket:async()=>{},objectURLs:{createObjectURL:()=> 'blob:fixture',revokeObjectURL:()=>{}},
 jobClient:{submit:async input=>({version:1,id,binding:input}),resume:async ticket=>({job:{phase:'ready'},proposal:{artifactId,jobId:id,binding:ticket.binding}})},
 fetchImpl:async(path,init={})=>{calls.push({path,method:init.method||'GET'});assert.ok(!init.method||['GET','HEAD'].includes(init.method),'No upload or provider request permitted');return new Response(init.method==='HEAD'?null:bytes,{headers:{'Content-Type':'image/png','X-Source-Rev':path.includes(artifactId)?digest:rev}});}});
const result=await controller.start({consent:{approved:true,maxReservedUsd:.2},idempotencyKey:'composition-fixture'});
assert.equal(result.revision.previewURL,'blob:fixture');assert.deepEqual(block.fileRef.source,{id:sourceId,rev});
const transaction=await controller.accept();assert.equal(transaction.after.id,block.id);assert.equal(transaction.after.x,45);assert.equal(transaction.after.width,320);assert.equal(transaction.after.fileRef.source.id,artifactId);
assert.equal(transaction.retainedSource.id,'file:'+sourceId+'@'+rev);assert.equal(transaction.retainedSource.attached,false);
assert.deepEqual(calls.map(c=>c.method),['GET','GET','HEAD']);assert.equal(calls[0].path,'/api/learn/files/'+artifactId);assert.ok(calls[1].path.includes('?app=canvas&board=main'));
controller.dispose();console.log(JSON.stringify({passed:1,failed:0,skipped:0,actualRevisionModuleSha256:createHash('sha256').update(readFileSync(process.env.IMAGE_REVISION_MODULE)).digest('hex'),coverage:'Actual prepareImageRevision composition: derivative owner GET, original scoped GET/HEAD, zero upload, explicit Accept, placement and original retention',providerCalls:0}));
