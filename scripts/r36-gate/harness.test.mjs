import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SOURCE, prepare, files } from './prepare.mjs';

test('portable preparation preserves the ordered baseline checks and adds routing only',()=>{
  const root=mkdtempSync(join(tmpdir(),'r36-gate-test-'));
  try {
    const app=join(root,'app'),state=join(root,'state');
    mkdirSync(join(app,'packages/web/e2e'),{recursive:true});
    const {gate,secret}=prepare({app,state,sha:'a'.repeat(40),tree:'b'.repeat(40),grant:'self-test'});
    const baseline=readFileSync(join(SOURCE,'templates/int35.sh'),'utf8');
    const generated=readFileSync(join(gate,'int35.sh'),'utf8');
    const stages=s=>s.split('\n').filter(l=>/^run /.test(l));
    assert.deepEqual(stages(generated).filter(l=>!l.includes('answer-routing')),stages(baseline));
    assert.equal(stages(generated).filter(l=>l.includes('answer-routing')).length,1);
    assert.equal((generated.match(/timeout \d+ node/g)||[]).length,(baseline.match(/timeout \d+ node/g)||[]).length);
    assert.equal(/timeout \d+ node e2e\//.test(generated),false);
    assert.ok(generated.trimEnd().endsWith('echo INT35-DONE'));
    assert.equal(readFileSync(join(app,'packages/web/.dev.vars'),'utf8'),readFileSync(join(app,'packages/control-plane/.dev.vars'),'utf8'));
    assert.match(secret,/^[a-f0-9]{48}$/);
    for(const file of files(gate).filter(p=>/\.(sh|cjs|mjs|ps1|jsonc)$/.test(p))) {
      const text=readFileSync(file,'utf8').replaceAll(app.replaceAll('\\','/'),'APP').replaceAll(gate.replaceAll('\\','/'),'GATE');
      assert.equal(/@@(?:APP|GATE)_ROOT@@|[Cc]:[\\/]Users[\\/]cyudhist/.test(text),false,file);
    }
    for(const stack of ['fork/stack.sh','fork/stack-app.sh','lp1h/jstack.sh']) {
      const text=readFileSync(join(gate,stack),'utf8');
      assert.equal((text.match(/supervise\.mjs/g)||[]).length,2,stack);
      assert.match(text,/registry-app/);assert.match(text,/registry-cp/);
    }
    const bash=process.env.GATE_BASH||process.env.GIT_BASH_PATH;
    if(bash)for(const script of ['int35.sh','fork/stack.sh','fork/stack-app.sh','lp1h/jstack.sh']) {
      const parsed=spawnSync(bash,['-n',join(gate,script)],{encoding:'utf8',windowsHide:true});
      assert.equal(parsed.status,0,`${script}: ${parsed.stderr}`);
    }
    assert.ok(existsSync(join(app,'packages/web/e2e/r36-routing-operator.mjs')));
    assert.throws(()=>prepare({app,state,sha:'a'.repeat(40),tree:'b'.repeat(40),grant:'again'}),/Refusing to overwrite/);
    assert.match(readFileSync(join(app,'packages/web/.dev.vars'),'utf8'),new RegExp(`TEST_BYPASS_SECRET=${secret}`));
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('supervisor records a real child exit and observer cleanup',{skip:process.platform!=='win32'},()=>{
  const root=mkdtempSync(join(tmpdir(),'r36-supervisor-test-'));
  try {
    const result=spawnSync(process.execPath,[join(SOURCE,'supervise.mjs'),join(root,'child'),'--','-e','setTimeout(()=>{console.log("child-proof");process.exit(7)},3500)'],{encoding:'utf8',timeout:45000,windowsHide:true});
    assert.equal(result.status,7,result.stderr);
    const receipts=files(root);
    const exit=JSON.parse(readFileSync(receipts.find(p=>p.endsWith('.exit.json')&&!p.endsWith('.monitor-exit.json')),'utf8'));
    assert.equal(exit.code,7);
    assert.equal(JSON.parse(readFileSync(receipts.find(p=>p.endsWith('.monitor-exit.json')),'utf8')).code,0);
    assert.ok(receipts.some(p=>p.endsWith('.memory.jsonl')));
    assert.match(readFileSync(receipts.find(p=>p.endsWith('.stdout.log')),'utf8'),/child-proof/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
