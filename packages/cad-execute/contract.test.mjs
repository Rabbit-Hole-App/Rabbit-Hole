import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, link, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { validateJob } from './contract.mjs';
import { boundedBody, artifact, phaseOutcome, privateDiagnostic } from './server.mjs';
const job = () => ({ schema: 'cad-execute/1', job_id: 'cad_abc', revision_id: 'rev_abc', attempt: 1, operation: 'build', source: { url: 'https://cp.test/source', bytes: 10, sha256: 'a'.repeat(64) }, callback: { url: 'https://cp.test/callback', token: 'a'.repeat(32), expires_at: new Date(Date.now()+1200000).toISOString() }, requirements: { units:'mm', checks:[] }, formats:['step','glb','thumbnail'], limits:{} });
test('valid bounded request', () => assert.deepEqual(validateJob(job(), ['https://cp.test']), []));
test('untrusted callbacks and source rejected', () => { const j=job();j.source.url='https://evil.test/source';j.callback.url='https://evil.test/x';assert.equal(validateJob(j,['https://cp.test']).length,2); });
test('credential-bearing URLs rejected',()=>{const j=job();j.source.url='https://secret@cp.test/x';assert.ok(validateJob(j,['https://cp.test']).length);});
test('unbounded execution and unknown format rejected',()=>{const j=job();j.limits.total_seconds=100000;j.formats.push('gcode');assert.equal(validateJob(j,['https://cp.test']).length,2);});
test('expired callback rejected',()=>{const j=job();j.callback.expires_at='2020-01-01';assert.ok(validateJob(j,['https://cp.test']).length);});
test('missing units and mandatory preview rejected',()=>{const j=job();j.requirements.units=null;j.formats=['step'];assert.equal(validateJob(j,['https://cp.test']).length,2);});
test('stream cap enforced without trusting header',async()=>{await assert.rejects(boundedBody(Readable.from([Buffer.alloc(4),Buffer.alloc(4)]),7),/size_limit/);});
test('artifact cap and empty artifact rejected',async()=>{const dir=await mkdtemp(join(tmpdir(),'cad-artifact-'));try{await writeFile(join(dir,'empty'),'');await assert.rejects(artifact(join(dir,'empty'),10));await writeFile(join(dir,'large'),'abcd');await assert.rejects(artifact(join(dir,'large'),3));assert.equal((await artifact(join(dir,'large'),4)).toString(),'abcd');}finally{await rm(dir,{recursive:true,force:true});}});
test('hard-linked output cannot cross the artifact boundary',async()=>{const dir=await mkdtemp(join(tmpdir(),'cad-link-'));try{await writeFile(join(dir,'input'),'source');await link(join(dir,'input'),join(dir,'output'));await assert.rejects(artifact(join(dir,'output'),20),/invalid_artifact/);}finally{await rm(dir,{recursive:true,force:true});}});
test('board-scoped opaque IDs accepted; path traversal refused',()=>{const j=job();j.job_id='cj.'+'a'.repeat(580)+'.0123456789abcdef';assert.deepEqual(validateJob(j,['https://cp.test']),[]);j.job_id='../other';assert.ok(validateJob(j,['https://cp.test']).length);});
test('kernel limits cannot be silently accepted without enforcement',()=>{const j=job();j.limits.memory_bytes=1024;assert.ok(validateJob(j,['https://cp.test']).some(e=>e.includes('kernel')));});
test('sandbox launcher isolates source and trusted checks structurally',async()=>{const script=await readFile(new URL('./sandbox/sandbox-init',import.meta.url),'utf8');assert.match(script,/remount,bind,ro \/tmp\/job/);assert.match(script,/mount -t tmpfs.*\/var\/cad/);assert.match(script,/env -i/);assert.match(script,/CADGEN_DAEMON=0/);assert.match(script,/no-new-privs/);const parent=await readFile(new URL('./sandbox/cad-sandbox',import.meta.url),'utf8');assert.match(parent,/--net --pid --mount --ipc --uts/);assert.match(parent,/\$RC prepare/);assert.match(parent,/\$RC finish/);});
test('failed and aborted processes still require positive cleanup proof',async()=>{
  for (const exit of [0,2,null]) {
    await assert.rejects(phaseOutcome(exit,'unused',async()=>{throw Error('missing');}),/sandbox_cleanup_failed/);
    await assert.rejects(phaseOutcome(exit,'unused',async()=>JSON.stringify({cleanup:{ok:false}})),/sandbox_cleanup_failed/);
  }
  await assert.rejects(phaseOutcome(2,'unused',async()=>JSON.stringify({cleanup:{ok:true}})),/execution_failed/);
  assert.equal((await phaseOutcome(0,'unused',async()=>JSON.stringify({cleanup:{ok:true}}))).cleanup.ok,true);
});
test('executable shell scripts have Linux line endings',async()=>{
  for(const name of ['entrypoint','sandbox/cad-sandbox','sandbox/sandbox-init']) {
    const bytes=await readFile(new URL(name,import.meta.url));assert.equal(bytes.includes(Buffer.from('\r\n')),false,name);assert.ok(bytes.subarray(0,10).toString().startsWith('#!/bin/sh\n'));
  }
});
test('private diagnostics are bounded and redact paths/credential markers',()=>{
  const text=privateDiagnostic(Buffer.from('File "/tmp/job/in/model.py" secret=abc Bearer sample sk-secretvalue\n'+ 'x'.repeat(10000)));
  assert.ok(Buffer.byteLength(text)<8300);assert.ok(!text.includes('/tmp/job'));assert.ok(!text.includes('abc'));assert.ok(!text.includes('sample'));assert.ok(!text.includes('sk-secretvalue'));
});
