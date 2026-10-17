import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classify,select} from './affected.mjs';
const map=JSON.parse(readFileSync(new URL('./check-map.json',import.meta.url),'utf8'));
test('CAD manual checks are registered but never enter automated Linux or readiness execution',()=>{
 for(const check of ['cad-check.mjs','cad-real-check.mjs','cad-runtime-browser-check.mjs']){
  assert.equal(map.checks[check].runner,'windows-only');
  const result=select([{path:`packages/web/e2e/${check}`}],map,true);
  assert.ok(!result.checks.includes(check));assert.ok(result.notCovered.includes(check));
 }
 assert.match(map.checks['cad-real-check.mjs'].why,/MANUAL PAID VERIFICATION ONLY/);
});
test('CAD source changes retain existing browser regression checks and disclose manual coverage',()=>{
 assert.equal(classify('packages/cad-execute/server.mjs',map),'broad');
 const result=select([{path:'packages/web/src/CadCard.jsx'}],map);
 assert.ok(result.checks.includes('card-select-check.mjs'));
 assert.ok(result.notCovered.includes('cad-check.mjs'));
 assert.deepEqual(result.unmapped,[]);
 for(const path of ['packages/web/src/cad-client.js','packages/web/src/file-chat-ref.js'])assert.equal(classify(path,map),'mapped');
});
test('CAD executor workspace is linked in the lock without introducing third-party dependencies',()=>{
 const lock=JSON.parse(readFileSync(new URL('../../package-lock.json',import.meta.url),'utf8'));
 assert.deepEqual(lock.packages['node_modules/rabbit-hole-cad-execute'],{resolved:'packages/cad-execute',link:true});
 assert.deepEqual(lock.packages['packages/cad-execute'],{name:'rabbit-hole-cad-execute'});
});
