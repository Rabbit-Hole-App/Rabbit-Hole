import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TEACHING_FIXTURES } from './ai-teaching-fixtures.js';
import { resolveProgram, resetProgram } from './program-card.js';
import { resolveInputs, verifyHashes, parseGuestResult } from './contract.js';
import { PROGRAM_STAMPS } from './stamps.js';
import { loadEngine, runProgram } from './runtime.js';
import { normalizeFrame } from './frame.js';

const engine=await loadEngine();
for(const fixture of AI_TEACHING_FIXTURES) test(fixture.id+' uses the normal card resolver, saves controls, and resets',async()=>{
 const block={id:'example',type:'animation',program:{fixtureId:fixture.id}};
 assert.equal((await resolveProgram(block,{fixtures:false,stamps:PROGRAM_STAMPS})).ok,false);
 const resolved=await resolveProgram(block,{fixtures:true,stamps:PROGRAM_STAMPS});
 assert.equal(resolved.ok,true,resolved.error?.message);
 const a=resolved.artifact;assert.equal(await verifyHashes(a),true);
 const draw=inputs=>{
  const result=runProgram(engine,{source:a.source,sdkVersion:a.sdkVersion,operation:'evaluate',request:{requestId:'example',inputs,time:0,seed:1,state:null}});
  assert.equal(result.ok,true,result.detail);
  const parsed=parseGuestResult(result.value,a.manifest);assert.equal(parsed.ok,true,parsed.issue);
  const view=normalizeFrame(parsed.value.frame,a.manifest);assert.equal(view.ok,true,view.issue);
  return parsed.value.frame;
 };
 const defaults=resolveInputs(a.manifest), baseline=draw(defaults);
 for(const input of a.manifest.inputs){
  const values=input.type==='select'?input.options.map(o=>o.value):[input.min,input.max];
  for(const value of values){
   const saved=JSON.parse(JSON.stringify({...block,inputs:{...defaults,[input.id]:value}}));
   const reopened=await resolveProgram(saved,{fixtures:true,stamps:PROGRAM_STAMPS});assert.equal(reopened.artifact.bundleHash,a.bundleHash);
   assert.deepEqual(draw(resolveInputs(a.manifest,saved.inputs)),draw({...defaults,[input.id]:value}));
   assert.deepEqual(draw(resolveInputs(a.manifest,resetProgram(saved).inputs)),baseline);
  }
 }
});
