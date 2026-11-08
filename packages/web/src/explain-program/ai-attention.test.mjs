import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { parseGuestResult } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { attentionFixture as fixture } from './ai-attention-fixture.js';
import { LIMITS as DEFAULT_LIMITS } from './limits.js';
// These tests check numbers, not the evaluation deadline: a loaded machine can pass the default 50 ms (genuine-card.test.mjs does the same).
const runProgram = (engine, input) => runWithDefaultLimits(engine, input, { ...DEFAULT_LIMITS, interruptMs: 5000 });

const engine=await loadEngine();
const artifact=await buildProgramArtifact({manifest:fixture.manifest,source:fixture.source});
function evaluate(query,mask) {
  const result=runProgram(engine,{source:artifact.source,sdkVersion:artifact.sdkVersion,operation:'evaluate',request:{requestId:'attention',inputs:{query,mask},time:0,seed:1,state:null}});
  assert.equal(result.ok,true,result.detail);
  const parsed=parseGuestResult(result.value,artifact.manifest);
  assert.equal(parsed.ok,true,parsed.issue);
  const view=normalizeFrame(parsed.value.frame,artifact.manifest);
  assert.equal(view.ok,true,view.issue);
  assert.ok(parsed.value.frame.objects.length<=60);
  return parsed.value;
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('every attention control combination produces a valid bounded frame',()=>{
  const seen=[];
  for(const query of ['a','b','c'])for(const mask of ['causal','none']){
    const out=evaluate(query,mask);seen.push(out.quantities);
    const {weightA:a,weightB:b,weightC:c}=out.quantities;
    close(a+b+c,1);
    assert.ok([a,b,c].every(w=>Number.isFinite(w)&&w>=0&&w<=1));
  }
  assert.notDeepEqual(seen[0],seen[1]);
});

test('query A with causal masking attends only to itself and returns its value',()=>{
  const out=evaluate('a','causal'),q=out.quantities;
  assert.deepEqual([q.weightA,q.weightB,q.weightC],[1,0,0]);
  assert.deepEqual([q.outputX,q.outputY],[2,0]);
  for(const row of [1,2])assert.equal(out.frame.objects.find(o=>o.id===`attention.r${row}c2`).text,'blocked');
});

test('query B causal weights match independently calculated two-way softmax',()=>{
  const q=evaluate('b','causal').quantities;
  const p=1/(1+Math.exp(-1/Math.sqrt(2)));
  close(q.weightA,1-p);close(q.weightB,p);assert.equal(q.weightC,0);
  close(q.outputX,2*(1-p));close(q.outputY,4*p);
  close(q.scoreA,0);close(q.scoreB,1/Math.sqrt(2));
});

test('unmasked query B includes C and computes the weighted value sum',()=>{
  const q=evaluate('b','none').quantities;
  const e=Math.exp(1/Math.sqrt(2)),denom=1+2*e;
  close(q.weightA,1/denom);close(q.weightB,e/denom);close(q.weightC,e/denom);
  close(q.outputX,(2+2*e)/denom);close(q.outputY,6*e/denom);
});

test('last query has identical causal and unmasked outputs, without rounded arithmetic',()=>{
  const a=evaluate('c','causal'),b=evaluate('c','none');
  assert.deepEqual(a.quantities,b.quantities);
  const e=Math.exp(1/Math.sqrt(2)),last=e/(2+e);
  close(a.quantities.weightC,last);
  const weightCell=a.frame.objects.find(o=>o.id==='attention.r2c3');
  assert.equal(weightCell.text,last.toFixed(3));
  close(a.quantities.outputY,4/(2+e)+2*last);
});
