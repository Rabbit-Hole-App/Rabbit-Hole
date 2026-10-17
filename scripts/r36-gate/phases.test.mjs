import test from 'node:test';
import assert from 'node:assert/strict';
import { prerequisite, keepsProbeStack, extraReceipts } from './phases.mjs';
import { stageCount } from '../dev-deploy.mjs';

const identity={applicationSha:'a'.repeat(40),applicationTree:'b'.repeat(40),harnessSha:'c'.repeat(40),grant:'isolated-job-1'};
const passing={...identity,phase:'preflight',pass:true,ended:'2026-10-12T22:00:00Z'};
test('phase continuation requires a completed passing exact-identity prerequisite',()=>{
  assert.equal(prerequisite('dive',passing,identity),null);
  assert.equal(prerequisite('gate',{...passing,phase:'dive'},identity),null);
  for(const key of ['applicationSha','applicationTree','harnessSha','grant'])assert.match(prerequisite('dive',{...passing,[key]:'wrong'},identity),/identity/);
  for(const change of [{pass:false},{ended:null},{cleanupFailure:'ports remain'},{phase:'gate'}])assert.ok(prerequisite('dive',{...passing,...change},identity));
  assert.match(prerequisite('gate',null,identity),/missing/);
});
test('full gate cannot skip a failed or absent Dive receipt',()=>{
  assert.match(prerequisite('gate',passing,identity),/dive/);
  assert.ok(prerequisite('gate',{...passing,phase:'dive',pass:false},identity));
  assert.equal(prerequisite('preflight',null,identity),null);
  assert.equal(prerequisite('all',null,identity),null);
  assert.match(prerequisite('unknown',null,identity),/Unknown/);
});
test('full units need no prior receipt; only the all phase keeps the sign-in probe stack for its Dive',()=>{
  assert.equal(prerequisite('units',null,identity),null);
  assert.equal(keepsProbeStack('all'),true);
  for(const phase of ['preflight','focused','shard-2'])assert.equal(keepsProbeStack(phase),false,`${phase} releases the gate ports before the next preflight`);
  assert.equal(prerequisite('shard-2',null,identity),null,'each gate shard is a fresh runner with its own preflight');
  assert.match(prerequisite('shard-x',null,identity),/Unknown/);
});

// The lines int35.sh prints for a stage (run(): "<stage> provider-tripwire hits: N" then "<stage> exit <rc>  <cnt>").
const gate=(menu,{routing='answer-routing exit 0  15/15 checks passed',hits='0'}={})=>['answer-routing provider-tripwire hits: 0',routing,`project-menu provider-tripwire hits: ${hits}`,menu,'INT35-DONE',''].join('\r\n');
test('project-menu passes on its own declared total, whatever that total is; a short, padded-out or uncounted run does not',()=>{
  for(const n of [9,12,14])assert.equal(extraReceipts(gate(`project-menu exit 0  ${n}/${n} checks passed`),stageCount),true,`${n}/${n}`);
  for(const line of ['project-menu exit 0  11/12 checks passed','project-menu exit 0  0/0 checks passed','project-menu exit 1  9/9 checks passed',
    'project-menu exit 0  12 checks passed','project-menu exit 0  ok 12','project-menu exit 0  9/9 checks passed, failed: 1','project-menu exit 0'])
    assert.equal(extraReceipts(gate(line),stageCount),false,line);
  assert.equal(extraReceipts(gate('project-menu exit 1  8/9 checks passed')+gate('project-menu exit 0  9/9 checks passed'),stageCount),true,'the last run of the stage is judged');
  assert.equal(extraReceipts(gate('project-menu exit 0  9/9 checks passed')+gate('project-menu exit 1  8/9 checks passed'),stageCount),false,'the last run of the stage is judged');
  assert.equal(extraReceipts(gate('project-menu exit 0  9/9 checks passed',{hits:'1'}),stageCount),false,'a provider-tripwire hit fails it');
  assert.equal(extraReceipts(gate('').replace(/^project-menu.*\r\n/gm,''),stageCount),false,'a missing project-menu receipt fails it');
});
test('answer-routing keeps its floor of 15 checks',()=>{
  assert.equal(extraReceipts(gate('project-menu exit 0  9/9 checks passed',{routing:'answer-routing exit 0  14/14 checks passed'}),stageCount),false);
  assert.equal(extraReceipts(gate('project-menu exit 0  9/9 checks passed',{routing:'answer-routing exit 0  16/16 checks passed'}),stageCount),true);
});
