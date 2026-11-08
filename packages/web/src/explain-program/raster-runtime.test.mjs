import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { programContext } from '../../../control-plane/src/agents/explain-author.js';
import { CAPABILITIES, CONTRACT_LIMITS, parseGuestResult, verifyHashes } from './contract.js';
import { normalizeFrame } from './frame.js';
import { RASTER_FIXTURES } from './raster-fixtures.js';
import { resolveProgram, resetProgram } from './program-card.js';
import { loadEngine, runProgram } from './runtime.js';
import { programSdkSource } from './sdk.js';
import { RASTER_PROGRAM_STAMPS, CYCLIC_PROGRAM_STAMPS, MEDIUM_PROGRAM_STAMPS, VISUAL_PROGRAM_STAMPS, PROGRAM_STAMPS } from './stamps.js';

const engine=await loadEngine();
async function setup(fixture) {
 const artifact=await buildProgramArtifact({manifest:fixture.manifest,source:fixture.source});
 const evaluate=inputs=>{
  const out=runProgram(engine,{source:artifact.source,sdkVersion:artifact.sdkVersion,operation:'evaluate',request:{requestId:'raster',inputs,time:0,seed:1,state:null}});
  assert.equal(out.ok,true,out.detail);
  const parsed=parseGuestResult(out.value,artifact.manifest);assert.equal(parsed.ok,true,parsed.issue);
  const normalized=normalizeFrame(parsed.value.frame,artifact.manifest);assert.equal(normalized.ok,true,normalized.issue);
  return parsed.value.frame.objects;
 };
 return {artifact,evaluate};
}

test('raster SDK is opt-in; saved SDK bytes remain unchanged',async()=>{
 for(const stamps of [VISUAL_PROGRAM_STAMPS,MEDIUM_PROGRAM_STAMPS,CYCLIC_PROGRAM_STAMPS,RASTER_PROGRAM_STAMPS]) assert.equal(createHash('sha256').update(programSdkSource(stamps.sdkVersion)).digest('hex'),stamps.fingerprints.sdk);
 const f=RASTER_FIXTURES[0],{artifact}=await setup(f);
 assert.equal(artifact.sdkVersion,'sdk-6');assert.equal(artifact.rendererVersion,'renderer-4');assert.equal(await verifyHashes(artifact),true);
 await assert.rejects(buildProgramArtifact({manifest:f.manifest,source:f.source},CYCLIC_PROGRAM_STAMPS),{code:'invalid_program'});
});

for(const f of RASTER_FIXTURES) test(f.id+' resolves and redraws every control option through the real runtime',async()=>{
 const {artifact,evaluate}=await setup(f), input=f.manifest.inputs[0];
 const block={id:'raster-card',type:'animation',program:{fixtureId:f.id},inputs:{[input.id]:input.options.at(-1).value}};
 const resolved=await resolveProgram(block,{fixtures:true,stamps:PROGRAM_STAMPS});assert.equal(resolved.ok,true);assert.equal(resolved.artifact.bundleHash,artifact.bundleHash);
 const base=evaluate({[input.id]:input.default});
 for(const option of input.options.slice(1)) assert.notDeepEqual(evaluate({[input.id]:option.value}),base);
 const saved=JSON.parse(JSON.stringify(block));assert.deepEqual(evaluate(saved.inputs),evaluate(block.inputs));
 assert.deepEqual(resetProgram(saved).inputs,{});
});

test('mask covers only chosen pixels and preserves the ring hole',async()=>{
 const {evaluate}=await setup(RASTER_FIXTURES[0]);
 const pixels=evaluate({region:'ring'}).find(o=>o.id==='mask').pixels;
 const alpha=(x,y)=>pixels[(y*24+x)*4+3];
 assert.equal(alpha(8,11),0,'hole stays transparent');assert.equal(alpha(8,6),179,'ring has requested opacity');assert.equal(alpha(19,10),0,'other object stays untouched');
 assert.ok(evaluate({region:'none'}).find(o=>o.id==='mask').pixels.every((v,i)=>i%4!==3||v===0));
});

test('filters compute expected pixels and leave the original unchanged',async()=>{
 const {evaluate}=await setup(RASTER_FIXTURES[1]);
 const original=evaluate({filter:'original'}),blur=evaluate({filter:'blur'}),edges=evaluate({filter:'edges'});
 const source=original.find(o=>o.id==='source').pixels;
 assert.deepEqual(original.find(o=>o.id==='filtered').pixels,source);
 assert.deepEqual(blur.find(o=>o.id==='source').pixels,source);
 const p=(x,y)=>(y*24+x)*4;
 assert.equal(blur.find(o=>o.id==='filtered').pixels[p(0,0)],32);
 assert.equal(edges.find(o=>o.id==='filtered').pixels[p(0,0)],0);
 const x=8,y=5;let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=source[p(x+dx,y+dy)];
 assert.equal(blur.find(o=>o.id==='filtered').pixels[p(x,y)],Math.round(sum/9));
});

test('author and repair know raster and mask signatures and data limitations',()=>{
 for(const repair of [false,true]){
  const c=programContext(CONTRACT_LIMITS,CAPABILITIES,{repair});
  assert.match(c.sdk.raster.pixels,/sdk.raster/);assert.match(c.sdk.raster.mask,/sdk.mask/);assert.match(c.sdk.raster.usage,/no URLs/);
 }
});
