import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { parseGuestResult, resolveInputs } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { convolutionFixture as fixture } from './ai-convolution-fixture.js';
import { LIMITS as DEFAULT_LIMITS } from './limits.js';
// These tests check numbers, not the evaluation deadline: a loaded machine can pass the default 50 ms (genuine-card.test.mjs does the same).
const runProgram = (engine, input) => runWithDefaultLimits(engine, input, { ...DEFAULT_LIMITS, interruptMs: 5000 });

const engine=await loadEngine();
const artifact=await buildProgramArtifact({manifest:fixture.manifest,source:fixture.source});
function evaluate(values) {
  const inputs=resolveInputs(fixture.manifest,values);
  const raw=runProgram(engine,{source:artifact.source,sdkVersion:artifact.sdkVersion,operation:'evaluate',request:{requestId:'convolution',inputs,state:null,time:0,seed:1}});
  assert.equal(raw.ok,true,raw.detail);
  const parsed=parseGuestResult(raw.value,artifact.manifest);assert.equal(parsed.ok,true,parsed.issue);
  const normalized=normalizeFrame(parsed.value.frame,artifact.manifest);assert.equal(normalized.ok,true,normalized.issue);
  assert.ok(parsed.value.frame.objects.length<=60);
  return parsed.value;
}

test('all 27 kernel/window combinations render with stable objects and correct output selection',()=>{
  let ids;
  for(const kernel of ['vertical','horizontal','blur']) for(let row=1;row<=3;row++)for(let col=1;col<=3;col++){
    const result=evaluate({kernel,row,col});
    const objects=result.frame.objects;
    ids ||= objects.map(o=>o.id);assert.deepEqual(objects.map(o=>o.id),ids);
    assert.equal(objects.find(o=>o.id===`output.r${row-1}c${col-1}`).role,'learner');
    const chosen=objects.filter(o=>o.id.startsWith('image.r')&&o.role==='learner');
    assert.equal(chosen.length,9);
    for(let r=row-1;r<row+2;r++)for(let c=col-1;c<col+2;c++)assert.ok(chosen.some(o=>o.id===`image.r${r}c${c}`));
  }
});

test('independent corner results establish cross-correlation orientation and blur normalization',()=>{
  // Top-left patch has one 1 at bottom-right; bottom-right patch is [[1,1,1],[1,1,0],[1,0,0]].
  assert.equal(evaluate({row:1,col:1,kernel:'vertical'}).quantities.result,1);
  assert.equal(evaluate({row:1,col:1,kernel:'horizontal'}).quantities.result,1);
  assert.equal(evaluate({row:1,col:1,kernel:'blur'}).quantities.result,1/9);
  assert.equal(evaluate({row:3,col:3,kernel:'vertical'}).quantities.result,-2);
  assert.equal(evaluate({row:3,col:3,kernel:'horizontal'}).quantities.result,-2);
  assert.equal(evaluate({row:3,col:3,kernel:'blur'}).quantities.result,6/9);
});

test('products sum to the displayed calculation and input controls change the window',()=>{
  const a=evaluate({row:1,col:1,kernel:'vertical'}),b=evaluate({row:2,col:3,kernel:'vertical'});
  assert.notDeepEqual(a.frame.objects,b.frame.objects);
  for(const kernel of ['vertical','horizontal','blur']){
    const result=evaluate({row:2,col:3,kernel});
    const products=result.frame.objects.filter(o=>/^products\.r\d+c\d+$/.test(o.id));
    assert.equal(products.reduce((sum,o)=>sum+Number(o.text),0),result.quantities.sum);
  }
});
