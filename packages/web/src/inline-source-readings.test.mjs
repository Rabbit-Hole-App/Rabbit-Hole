import test from 'node:test';import assert from 'node:assert/strict';
import {sourcePageRequest,selectedSourcePages,validateSourceReadings,verifySourceReadings,stampSourceReadings}from'./inline-source-readings.js';
const ref={v:1,family:'pdf',source:{id:'fs_'+ 'a'.repeat(24),rev:'b'.repeat(64)},meta:{name:'paper.pdf',type:'application/pdf'}},block={id:'pdf',type:'file',kind:'pdf',fileRef:ref};
const scope={app:'canvas-one',board:'main'},ranges=selectedSourcePages([block],['pdf'],{pdf:'2'}),readings=ranges.map(entry=>({...entry,coverage:'partial'}));
const frozen={sourceScope:scope,sourceRanges:ranges,sourceBlocks:{pdf:block}};
const current=()=>({scope,ranges,blocks:[block],mode:'explain',readOnly:false,locked:false});
const fetcher=async(path,options)=>options?.method==='HEAD'?new Response(null,{headers:{'x-source-rev':ref.source.rev}}):Response.json({state:{blocks:[block]}});
test('pages require explicit saved PDF identity and positive page with no inherited selection',()=>{assert.deepEqual(selectedSourcePages([block],['pdf'],{}),[]);assert.equal(ranges[0].range.page,2);for(const value of ['',0,-1,'1.5','x'])assert.throws(()=>selectedSourcePages([block],['pdf'],{pdf:value}));assert.deepEqual(selectedSourcePages([block],[],{pdf:'2'}),[]);});
test('receipt exact source/page coverage enforced; null or malformed receipt cannot silently become normal text',()=>{assert.equal(validateSourceReadings(readings,ranges).ok,true);for(const bad of [null,[],[{...readings[0],coverage:'whole-document'}],[{...readings[0],range:{page:3}}],[{...readings[0],extra:true}]])assert.equal(validateSourceReadings(bad,ranges).ok,false);});
test('accept rechecks saved board plus authorized HEAD and retains original source with detached provenance',async()=>{const verified=await verifySourceReadings({readings,frozen,current,fetchImpl:fetcher});const tx=stampSourceReadings({kind:'explain',shapes:[{id:'note'}],links:[{id:'link',kind:'annotation'}]},verified);assert.equal(tx.retainedSources[0].fileRef.source.rev,ref.source.rev);assert.equal(tx.shapes[0].inline.sourceReadings[0].coverage,'partial');assert.notEqual(tx.shapes[0].inline.sourceReadings,readings);assert.equal(tx.links[0].kind,'annotation');});
test('access revocation, saved revision change and page changes during async read refuse',async()=>{
 await assert.rejects(verifySourceReadings({readings,frozen,current,fetchImpl:async()=>new Response(null,{status:403})}),/accessible/);
 await assert.rejects(verifySourceReadings({readings,frozen,current,fetchImpl:async()=>Response.json({state:{blocks:[{...block,locked:true}]}})}),/permissions/);
 let changed=false;await assert.rejects(verifySourceReadings({readings,frozen,current:()=>({...current(),ranges:changed?[{...ranges[0],range:{page:3}}]:ranges}),fetchImpl:async(...args)=>{changed=true;return fetcher(...args);}}),/page/);
 await assert.rejects(verifySourceReadings({readings,frozen,current:()=>({...current(),readOnly:true}),fetchImpl:fetcher}),/permissions/);
});

test('HEAD access/revision failure and live lock/scope revocation during HEAD refuse',async()=>{
 for(const response of [new Response(null,{status:403}),new Response(null,{headers:{'x-source-rev':'c'.repeat(64)}})])await assert.rejects(verifySourceReadings({readings,frozen,current,fetchImpl:async(path,options)=>options?.method==='HEAD'?response:fetcher(path,options)}),/revision/);
 for(const change of [{locked:true},{scope:{...scope,app:'other'}}]){let changed=false;await assert.rejects(verifySourceReadings({readings,frozen,current:()=>({...current(),...(changed?change:{})}),fetchImpl:async(path,options)=>{if(options?.method==='HEAD')changed=true;return fetcher(path,options);}}),/permissions/);}
});

test('explicit plot without pages or with extra selected targets refuses request preparation',()=>{assert.throws(()=>sourcePageRequest([block],['pdf'],{},true),/explicit PDF page/);assert.throws(()=>sourcePageRequest([block],['pdf','other'],{pdf:'2'},true),/every selected/);assert.deepEqual(sourcePageRequest([block],['pdf'],{pdf:'2'},true),ranges);});
