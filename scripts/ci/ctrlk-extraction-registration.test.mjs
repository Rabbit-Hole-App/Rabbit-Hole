import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classify,select} from './affected.mjs';
const map=JSON.parse(readFileSync(new URL('./check-map.json',import.meta.url),'utf8'));
test('new extraction and evidence fixtures remain manual, never automatic integration coverage',()=>{
 for(const check of ['ctrlk-extraction-check.mjs','ctrlk-repository-evidence-check.mjs','ctrlk-background-removal-check.mjs']){
  assert.equal(map.checks[check].runner,'windows-only');
  const result=select([{path:`packages/web/e2e/${check}`}],map,true);
  assert.ok(!result.checks.includes(check));assert.ok(result.notCovered.includes(check));assert.deepEqual(result.unmapped,[]);
 }
 assert.match(map.checks['ctrlk-extraction-check.mjs'].why,/No real-model OCR/);
 assert.match(map.checks['ctrlk-repository-evidence-check.mjs'].why,/No actual indexed-dev-repository/);
});
test('extraction and repository inspector source changes identify their actual focused checks',()=>{
 for(const [path,check] of [['packages/web/src/inline-background-removal.js','ctrlk-background-removal-check.mjs'],['packages/web/src/BackgroundRemovalPreview.jsx','ctrlk-background-removal-check.mjs'],['packages/web/src/inline-image-job-client.js','ctrlk-background-removal-check.mjs'],['packages/web/src/inline-extraction.js','ctrlk-extraction-check.mjs'],['packages/web/src/InlineRepositoryEvidence.jsx','ctrlk-repository-evidence-check.mjs']]){
  assert.equal(classify(path,map),'mapped');const result=select([{path}],map);assert.ok(result.notCovered.includes(check));assert.deepEqual(result.unmapped,[]);
 }
});
