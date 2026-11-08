import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TEACHING_FIXTURES } from './ai-teaching-fixtures.js';
import { resolveProgram, resetProgram } from './program-card.js';
import { resolveInputs, verifyHashes, parseGuestResult } from './contract.js';
import { PROGRAM_STAMPS } from './stamps.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { normalizeFrame } from './frame.js';
import { LIMITS as DEFAULT_LIMITS } from './limits.js';
// These tests check numbers, not the evaluation deadline: a loaded machine can pass the default 50 ms (genuine-card.test.mjs does the same).
const runProgram = (engine, input) => runWithDefaultLimits(engine, input, { ...DEFAULT_LIMITS, interruptMs: 5000 });

const engine=await loadEngine();
function drawProgram(artifact, inputs) {
  const result = runProgram(engine, {
    source: artifact.source, sdkVersion: artifact.sdkVersion, operation: 'evaluate',
    request: { requestId: 'example', inputs, time: 0, seed: 1, state: null },
  });
  assert.equal(result.ok, true, result.detail);
  const parsed = parseGuestResult(result.value, artifact.manifest);
  assert.equal(parsed.ok, true, parsed.issue);
  const view = normalizeFrame(parsed.value.frame, artifact.manifest);
  assert.equal(view.ok, true, view.issue);
  return parsed.value.frame;
}

for(const fixture of AI_TEACHING_FIXTURES) test(fixture.id+' uses the normal card resolver, saves controls, and resets',async()=>{
 const block={id:'example',type:'animation',program:{fixtureId:fixture.id}};
 assert.equal((await resolveProgram(block,{fixtures:false,stamps:PROGRAM_STAMPS})).ok,false);
 const resolved=await resolveProgram(block,{fixtures:true,stamps:PROGRAM_STAMPS});
 assert.equal(resolved.ok,true,resolved.error?.message);
 const a=resolved.artifact;assert.equal(await verifyHashes(a),true);
 const draw=inputs=>drawProgram(a,inputs);
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

test('the point-in-time join uses only snapshots available on the label day', async () => {
  const block = { type: 'animation', program: { fixtureId: 'fixture-ai-point-in-time-join' } };
  const resolved = await resolveProgram(block, { fixtures: true, stamps: PROGRAM_STAMPS });
  assert.equal(resolved.ok, true, resolved.error?.message);
  assert.equal(resolved.artifact.sdkVersion, 'sdk-2');
  const expectedDays = [null, null, 3, 3, 3, 6, 6, 6, 9, 9];
  const visits = { 3: 2, 6: 5, 9: 8 };
  for (const [index, expected] of expectedDays.entries()) {
    const day = index + 1;
    const { objects } = drawProgram(resolved.artifact, { labelDay: day });
    const byId = new Map(objects.map(object => [object.id, object]));
    const snapshots = [3, 6, 9].map(at => byId.get(`join:e:snapshots:day-${at}`));
    const selected = snapshots.filter(snapshot => snapshot.role === 'learner');
    assert.deepEqual(selected.map(snapshot => snapshot.id), expected ? [`join:e:snapshots:day-${expected}`] : []);
    assert.equal(byId.get('as-of').text, expected ? `As of label · Day ${expected} · ${visits[expected]} visits` : 'As of label · No eligible snapshot');
    assert.equal(byId.get('latest').text, day < 9 ? 'Latest only · Day 9 · 8 visits · Future data' : 'Latest only · Day 9 · 8 visits');
    assert.equal(byId.get('latest').role, day < 9 ? 'warning' : 'neutral');
    assert.equal(byId.get('join:e:label:cutoff:t').text, `Day ${day}`);
    if (day === expected) assert.equal(byId.get('join:cursor:snapshots').from.x, selected[0].x);
  }
});
