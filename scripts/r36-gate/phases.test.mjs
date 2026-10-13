import test from 'node:test';
import assert from 'node:assert/strict';
import { prerequisite, keepsProbeStack } from './phases.mjs';

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
  for(const phase of ['preflight','focused'])assert.equal(keepsProbeStack(phase),false,`${phase} releases the gate ports before the next preflight`);
});
