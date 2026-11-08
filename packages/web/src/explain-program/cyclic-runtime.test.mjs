import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { programContext } from '../../../control-plane/src/agents/explain-author.js';
import { CAPABILITIES, CONTRACT_LIMITS, parseGuestResult, verifyHashes } from './contract.js';
import { cyclicNetworkFixture as fixture } from './cyclic-fixture.js';
import { normalizeFrame } from './frame.js';
import { programStateFor, resetProgram, resolveProgram } from './program-card.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { programSdkSource } from './sdk.js';
import { CYCLIC_PROGRAM_STAMPS, MEDIUM_PROGRAM_STAMPS, PROGRAM_STAMPS } from './stamps.js';
import { LIMITS as DEFAULT_LIMITS } from './limits.js';
// These tests check numbers, not the evaluation deadline: a loaded machine can pass the default 50 ms (genuine-card.test.mjs does the same).
const runProgram = (engine, input) => runWithDefaultLimits(engine, input, { ...DEFAULT_LIMITS, interruptMs: 5000 });

const engine = await loadEngine();
const artifact = await buildProgramArtifact({ manifest: fixture.manifest, source: fixture.source });
function run(operation, state, event) {
  const result = runProgram(engine, { source: artifact.source, sdkVersion: artifact.sdkVersion, operation,
    request: { requestId:'cyclic',inputs:{},time:0,seed:1,state,event } });
  assert.equal(result.ok,true,result.detail);
  return result.value;
}
const evaluate = state => {
  const parsed = parseGuestResult(run('evaluate',state), artifact.manifest);
  assert.equal(parsed.ok,true,parsed.issue);
  const view = normalizeFrame(parsed.value.frame, artifact.manifest);
  assert.equal(view.ok,true,view.issue);
  return parsed.value.frame.objects;
};

test('cyclic SDK seals with its own fingerprint and preserves saved Medium SDK bytes', async () => {
  assert.equal(artifact.sdkVersion,'sdk-5');
  assert.equal(await verifyHashes(artifact),true);
  for (const stamps of [MEDIUM_PROGRAM_STAMPS,CYCLIC_PROGRAM_STAMPS]) {
    assert.equal(createHash('sha256').update(programSdkSource(stamps.sdkVersion)).digest('hex'),stamps.fingerprints.sdk);
  }
  await assert.rejects(buildProgramArtifact({manifest:fixture.manifest,source:fixture.source},MEDIUM_PROGRAM_STAMPS),{code:'invalid_program'});
  const combined = await buildProgramArtifact({manifest:{...fixture.manifest,capabilities:['medium_visuals','cyclic_networks']},source:fixture.source});
  assert.equal(combined.sdkVersion,'sdk-5');
});

test('normal card fixture resolves, selects every loop stage, restores state and resets', async () => {
  const block={id:'cyclic-card',type:'animation',program:{fixtureId:fixture.id}};
  const resolved=await resolveProgram(block,{fixtures:true,stamps:PROGRAM_STAMPS});
  assert.equal(resolved.ok,true);
  assert.equal(resolved.artifact.bundleHash,artifact.bundleHash);
  const initial=run('initialize',null);
  const baseline=evaluate(initial);
  for(const key of ['plan','act','observe']) {
    const state=run('reduce',initial,{type:'select',target:`loop.node.${key}`});
    assert.equal(state.selected,key);
    const objects=evaluate(state);
    assert.equal(objects.find(o=>o.id===`loop.node.${key}`).role,'learner');
    assert.notDeepEqual(objects,baseline);
    assert.deepEqual(objects.map(o=>o.id),baseline.map(o=>o.id),'all targets and routes retain identity');
    const saved={...block,programState:{bundleHash:artifact.bundleHash,state,revision:1,seed:1,inputs:{}}};
    assert.deepEqual(evaluate(programStateFor(saved,artifact).state),objects);
    const reset=resetProgram(saved,artifact);
    assert.equal(programStateFor(reset,artifact),null);
  }
  assert.deepEqual(evaluate(run('initialize',null)),baseline);
});

// Integration decision (cyclic + Medium + heat grid): like the Medium and heat-grid docs, the cyclic helper contract is for authoring. With all three stacked, a maximal valid
// program no longer fits the repair request's size budget (explain-program-budget.test.js), so the repair request carries the program itself and the validator's problems.
test('the author receives the cyclic helper contract; the repair request leaves it out, as it does the Medium and heat-grid docs', () => {
  const author=programContext(CONTRACT_LIMITS,CAPABILITIES,{stateful:true,repair:false});
  assert.match(author.sdk.cyclicGraph.signature,/sdk.cyclicGraph/);
  assert.match(author.sdk.cyclicGraph.usage,/cyclic_networks/);
  assert.equal(programContext(CONTRACT_LIMITS,CAPABILITIES,{stateful:true,repair:true}).sdk.cyclicGraph,undefined);
});
