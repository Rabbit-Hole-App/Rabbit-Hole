import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TEACHING_FIXTURES } from './ai-teaching-fixtures.js';
import { resolveProgram, resetProgram, programStateFor } from './program-card.js';
import { resolveInputs, verifyHashes, parseGuestResult, parseEvent, stateProblem } from './contract.js';
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
 const call=(operation,inputs,state=null,event)=>{
  const result=runProgram(engine,{source:a.source,sdkVersion:a.sdkVersion,operation,request:{requestId:'example',inputs,time:0,seed:1,state,...(event?{event}:{})}});
  assert.equal(result.ok,true,result.detail);
  if(operation!=='evaluate'){assert.equal(stateProblem(result.value),null);return result.value;}
  const parsed=parseGuestResult(result.value,a.manifest);assert.equal(parsed.ok,true,parsed.issue);
  const view=normalizeFrame(parsed.value.frame,a.manifest);assert.equal(view.ok,true,view.issue);
  return parsed.value.frame;
 };
 const initial=inputs=>a.schemaVersion===2?call('initialize',inputs):null;
 const draw=(inputs,state=initial(inputs))=>call('evaluate',inputs,state);
 const defaults=resolveInputs(a.manifest), baseline=draw(defaults);
 const reopen=async(inputs,state)=>{
  const saved=JSON.parse(JSON.stringify({...block,inputs,...(a.schemaVersion===2?{programState:{bundleHash:a.bundleHash,state,revision:1,seed:1,inputs}}:{})}));
  const reopened=await resolveProgram(saved,{fixtures:true,stamps:PROGRAM_STAMPS});assert.equal(reopened.artifact.bundleHash,a.bundleHash);
  const restored=a.schemaVersion===2?programStateFor(saved,reopened.artifact):null;
  if(a.schemaVersion===2)assert.deepEqual(restored.state,state);
  assert.deepEqual(draw(resolveInputs(a.manifest,saved.inputs),restored?.state??null),draw(inputs,state));
  const reset=resetProgram(saved);
  assert.equal(reset.programState,undefined);
  assert.deepEqual(draw(resolveInputs(a.manifest,reset.inputs)),baseline);
 };
 for(const input of a.manifest.inputs){
  const values=input.type==='select'?input.options.map(o=>o.value):[input.min,input.max];
  for(const value of values){
   const inputs={...defaults,[input.id]:value};
   const state=a.schemaVersion===2?call('reduce',inputs,initial(defaults),{type:'input',input:input.id,value}):null;
   await reopen(inputs,state);
  }
 }
 if(a.schemaVersion===2){
  let inputs=defaults,state=initial(inputs);
  assert.ok(fixture.events?.length,'stateful teaching example declares a representative interaction sequence');
  for(const event of fixture.events){
   assert.equal(parseEvent(event,a.manifest).ok,true,JSON.stringify(event));
   if(event.type==='input')inputs={...inputs,[event.input]:event.value};
   state=call('reduce',inputs,state,event);
   await reopen(inputs,state);
  }
  assert.notDeepEqual(state,initial(inputs),'representative sequence leaves a changed state');
 }
});
