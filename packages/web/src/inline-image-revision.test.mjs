import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareImageRevision } from './inline-image-revision.js';

function fixture(patch = {}) {
  const block = { id: 'image-1', type: 'file', kind: 'image', dx: 12, dy: 20, w: 300, h: 200,
    fileRef: { v: 1, family: 'image', source: { id: 'fs_111111111111111111111111', rev: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, meta: { name: 'photo.png' } } };
  const scope = { app: 'canvas-test', board: 'board-test' };
  const state = { block: structuredClone(block), scope, readOnly: false, locked: false };
  const calls = [], revoked = [];
  const options = { block, scope, operation: { type: 'rotate', quarterTurns: 1 }, current: () => state,
    fetchImpl: async (path, init) => { calls.push({ path, ...init }); return new Response(new Blob(['fs_111111111111111111111111']), { headers: { 'x-source-rev': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }); },
    transform: async () => ({ ok: true, blob: new Blob(['pixels'], { type: 'image/png' }), width: 20, height: 30 }),
    upload: async (file, at) => { calls.push({ upload: file, at }); return { source: { id: 'fs_222222222222222222222222', rev: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: file.name, size: file.size } }; },
    objectURLs: { createObjectURL: () => 'blob:preview', revokeObjectURL: url => revoked.push(url) }, ...patch };
  return { state, options, calls, revoked };
}
test('immutable derivative preserves target geometry and retained original; Accept rechecks access once', async () => {
  const f = fixture(), original = structuredClone(f.state.block);
  const preview = await prepareImageRevision(f.options);
  assert.deepEqual(f.state.block, original);
  assert.deepEqual([preview.after.id, preview.after.dx, preview.after.dy, preview.after.w, preview.after.h], ['image-1',12,20,300,200]);
  assert.equal(preview.after.fileRef.source.id, 'fs_222222222222222222222222');
  assert.equal(preview.retainedSource.id, 'file:fs_111111111111111111111111@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(preview.retainedSource.attached, false);
  preview.after.id = 'tampered';
  const transaction = await preview.accept();
  assert.equal(transaction.after.id, 'image-1');
  assert.deepEqual(f.calls.filter(c => c.method).map(c => c.method), ['GET','HEAD']);
  assert.ok(f.calls.filter(c => c.method).every(c => c.cache === 'no-store'));
  assert.equal(f.calls.filter(c => c.upload).length, 1);
  await assert.rejects(preview.accept(), /already being accepted or was accepted/);
  preview.dispose(); preview.dispose(); assert.deepEqual(f.revoked, ['blob:preview']);
});
test('read-only, locked and changed scope are rejected before reading or uploading', async () => {
  for (const patch of [{readOnly:true}, {locked:true}, {scope:{share:'public'}}]) {
    const f=fixture(); Object.assign(f.state,patch);
    await assert.rejects(prepareImageRevision(f.options), /permissions changed/);
    assert.equal(f.calls.length,0);
  }
});
test('source revision mismatch cannot transform or upload', async () => {
  const f=fixture({fetchImpl:async()=>new Response('wrong',{headers:{'x-source-rev':'different'}})});
  await assert.rejects(prepareImageRevision(f.options), /revision changed/);
  assert.equal(f.calls.length,0);
});
test('stale changes during transform prevent upload', async () => {
  const f=fixture(); f.options.transform=async()=>{f.state.block.dx=99;return {ok:true,blob:new Blob(['pixels']),width:1,height:1};};
  await assert.rejects(prepareImageRevision(f.options), /permissions changed/);
  assert.equal(f.calls.filter(c=>c.upload).length,0);
});
test('permission revocation on Accept never returns a transaction', async () => {
  const f=fixture(), preview=await prepareImageRevision(f.options); f.state.readOnly=true;
  await assert.rejects(preview.accept(), /permissions changed/);
  assert.equal(f.calls.filter(c=>c.method==='HEAD').length,0); preview.dispose();
});
test('cancelled preview cannot accept and never deletes stored sources', async () => {
  const controller=new AbortController(),f=fixture({signal:controller.signal});
  const preview=await prepareImageRevision(f.options);controller.abort();
  await assert.rejects(preview.accept(), /cancelled/);preview.dispose();
  assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
});
test('legacy asset remains preserved when renderer switches to a derivative file card', async () => {
  const f=fixture(); f.options.block={id:'legacy',type:'image',assetKey:'image:key',dx:5};f.state.block=structuredClone(f.options.block);
  const preview=await prepareImageRevision(f.options);
  assert.match(f.calls[0].path,/\/boards\/canvas-test\/board-test\/assets\/image%3Akey$/);
  assert.equal(preview.after.assetKey,'image:key');assert.equal(preview.after.type,'file');assert.equal(preview.retainedSource,null);preview.dispose();
});
test('legacy Accept uses GET and refuses changed bytes under the same asset key', async () => {
  const f=fixture(); f.options.block={id:'legacy',type:'image',assetKey:'image:key'};f.state.block=structuredClone(f.options.block);
  let reads=0;f.options.fetchImpl=async(path,init)=>{assert.equal(init.method,'GET');return new Response(++reads===1?'old':'new');};
  const preview=await prepareImageRevision(f.options);
  await assert.rejects(preview.accept(), /bytes changed/);assert.equal(reads,2);preview.dispose();
});
test('concurrent Accept yields at most one transaction', async () => {
  const f=fixture(), preview=await prepareImageRevision(f.options);
  const results=await Promise.allSettled([preview.accept(),preview.accept()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);preview.dispose();
});
test('malformed uploaded source identity is rejected before preview publication', async () => {
  const f=fixture({upload:async()=>({source:{id:'invalid',rev:'invalid'}})});
  await assert.rejects(prepareImageRevision(f.options), /valid identity/);
});
