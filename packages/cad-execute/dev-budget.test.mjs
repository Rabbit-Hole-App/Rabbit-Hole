import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DevBudget } from './dev-budget.mjs';
test('dev egress reservations survive restart and charge repeated wire attempts',()=>{
  const dir=mkdtempSync(join(tmpdir(),'cad-budget-'));
  try { const options={file:join(dir,'budget.json'),deadline:'2030-01-01T00:00:00Z',maximum:3*1024**2,now:()=>0};
    const first=new DevBudget(options);first.reserve('one',10);
    const next=new DevBudget(options);assert.equal(next.summary().reservedBytes,1024**2+10);next.reserve('one',10);
    assert.throws(()=>next.reserve('three',10),/dev_egress_limit/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('cannot accept a build too close to fixed dev shutdown',()=>{
  const dir=mkdtempSync(join(tmpdir(),'cad-deadline-'));
  try {const budget=new DevBudget({file:join(dir,'budget.json'),deadline:'2030-01-01T00:00:00Z',now:()=>Date.parse('2029-12-31T23:55:00Z')});assert.throws(()=>budget.reserve('one',1),/dev_budget_expired/);}
  finally{rmSync(dir,{recursive:true,force:true});}
});
