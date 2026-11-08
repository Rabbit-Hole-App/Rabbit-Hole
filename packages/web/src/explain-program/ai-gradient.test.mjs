import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { parseGuestResult } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { gradientFixture } from './ai-gradient-fixture.js';
import { LIMITS as DEFAULT_LIMITS } from './limits.js';
// These tests check numbers, not the evaluation deadline: a loaded machine can pass the default 50 ms (genuine-card.test.mjs does the same).
const runProgram = (engine, input) => runWithDefaultLimits(engine, input, { ...DEFAULT_LIMITS, interruptMs: 5000 });

const engine=await loadEngine();
const artifact=await buildProgramArtifact({manifest:gradientFixture.manifest,source:gradientFixture.source});
function evaluate(rate,step) {
  const reply=runProgram(engine,{source:artifact.source,sdkVersion:artifact.sdkVersion,operation:'evaluate',request:{requestId:'gradient',inputs:{rate:String(rate),step},time:0,seed:1,state:null}});
  assert.equal(reply.ok,true,reply.detail);
  const parsed=parseGuestResult(reply.value,artifact.manifest);assert.equal(parsed.ok,true,parsed.issue);
  const view=normalizeFrame(parsed.value.frame,artifact.manifest);assert.equal(view.ok,true,view.issue);
  return parsed.value;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('all rates and steps match the closed-form quadratic update and fit the frame',()=>{
  for(const rate of [.2,.8,1.2,2.1]) for(let step=0;step<=8;step++) {
    const {frame,quantities:q}=evaluate(rate,step), expected=3*(1-rate)**step;
    near(q.weight,expected);near(q.loss,.5*expected**2);near(q.gradient,expected);near(q.change,-rate*expected);
    assert.equal(q.step,step);assert.ok(q.extent>Math.abs(expected));
    assert.ok(frame.objects.length<=60);
    assert.equal(frame.objects.filter(o=>o.id.startsWith('plot:descent:s:positions:')).length,step+1);
  }
});

test('the example distinguishes monotone convergence, shrinking overshoots and divergence',()=>{
  for(const rate of [.2,.8]) {
    const first=evaluate(rate,1).quantities,last=evaluate(rate,8).quantities;
    assert.ok(first.weight>0);assert.ok(last.weight>0);assert.ok(last.loss<first.loss);
  }
  const shrink1=evaluate(1.2,1).quantities,shrink2=evaluate(1.2,2).quantities;
  near(shrink1.weight,-.6);near(shrink2.weight,.12);assert.ok(shrink2.loss<shrink1.loss);
  const grow1=evaluate(2.1,1).quantities,grow2=evaluate(2.1,2).quantities;
  near(grow1.weight,-3.3);near(grow2.weight,3.63);assert.ok(grow2.loss>grow1.loss);
});

test('the step strip separates the shrinking overshoots and follows the selected step', () => {
  const slotsAt = step => evaluate(1.2, step).frame.objects.filter(object => object.id.startsWith('step-slot-'));
  const slots = slotsAt(8);
  assert.deepEqual(slots.map(slot => slot.text), ['0 +', '1 −', '2 +', '3 −', '4 +', '5 −', '6 +', '7 −', '8 +']);
  assert.ok(slots.slice(1).every((slot, index) => slot.x > slots[index].x + slots[index].w));
  for (let step = 0; step <= 8; step++) {
    const current = slotsAt(step);
    assert.deepEqual(current.filter(slot => slot.role === 'learner').map(slot => slot.id), [`step-slot-${step}`]);
    assert.deepEqual(current.slice(step + 1).map(slot => slot.text), slots.slice(step + 1).map((_, index) => String(step + 1 + index)));
  }
});

test('the step 8 readouts distinguish a tiny weight and loss from zero', () => {
  const { frame } = evaluate(1.2, 8);
  assert.equal(frame.objects.find(object => object.id === 'weight-value')?.text, 'w: 0.000007680');
  assert.equal(frame.objects.find(object => object.id === 'loss-value')?.text, 'Loss: 2.949e-11');
});

test('step zero is the same starting value and bounds do not move as steps advance',()=>{
  for(const rate of [.2,.8,1.2,2.1]) {
    const first=evaluate(rate,0),last=evaluate(rate,8);
    assert.equal(first.quantities.weight,3);assert.equal(first.quantities.loss,4.5);
    assert.equal(first.quantities.extent,last.quantities.extent);
    assert.ok(!first.frame.objects.some(o=>o.id==='plot:descent:s:updates'));
  }
});
