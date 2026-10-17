// model-storage.js against a stand-in with file-source-client.js's signature: one source per file, the fileRef shape the
// lead approved (source = entry or ZIP, view.entry, bundle = [{ path, source }]), and reads limited to the card's own sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allFixtures } from '../e2e/model-fixtures.mjs';
import { importModelFiles } from './model-import.js';
import { addModelFiles, chooseModel, openModelFiles, setSourceClient, storeModelCard } from './model-storage.js';

const F = allFixtures();
const file = (path, extra = {}) => Object.assign(new File([F[path]], path.split('/').pop()), extra);
function fakeClient() {
  const store = new Map(), uploads = [], reads = [];
  return {
    uploads, reads, store,
    async uploadSource(f, { app, board, family }) { const id = `fs_${String(store.size).padStart(24, '0')}`; store.set(id, f); uploads.push({ id, name: f.name, app, board, family }); return { id, rev: `r${id}`, family }; },
    async loadSource(block) { reads.push(block.fileRef.source.id); return store.get(block.fileRef.source.id) || null; },
  };
}
const ctx = { app: 'demo', board: 'main' };

test('a .gltf with its .bin and texture: three sources, the entry is fileRef.source, the others its bundle', async () => {
  const client = fakeClient(); setSourceClient(client, ctx);
  const { cards } = await importModelFiles([file('gltf-separate/cube.gltf'), file('gltf-separate/cube.bin'), file('gltf-separate/textures/checker.png')]);
  const block = await storeModelCard(cards[0], ctx);
  assert.equal(block.assetKey, undefined, 'no board asset: the files are sources');
  assert.deepEqual(client.uploads.map(u => [u.name, u.family, u.app, u.board]), [['cube.gltf', 'gltf', 'demo', 'main'], ['cube.bin', 'model-part', 'demo', 'main'], ['checker.png', 'image', 'demo', 'main']]);
  assert.deepEqual(block.fileRef.source, { id: client.uploads[0].id, rev: `r${client.uploads[0].id}` });
  assert.equal(block.fileRef.view.entry, 'cube.gltf');
  assert.deepEqual(block.fileRef.bundle.map(b => b.path), ['cube.bin', 'checker.png']);
  assert.ok(JSON.stringify(block.fileRef).length < 2048, 'fileRef under 2 KB');
  client.reads.length = 0;
  const { plan, files, download } = await openModelFiles(block);
  assert.deepEqual(plan.entries[0].missing, []); assert.equal(files.size, 3);
  assert.deepEqual(client.reads.sort(), client.uploads.map(u => u.id).sort(), 'reads exactly the card\'s own sources');
  assert.equal(download.type, 'application/zip');
  setSourceClient(null);
});

test('a dropped ZIP is one source (the original); view.entry is the path inside it', async () => {
  const client = fakeClient(); setSourceClient(client, ctx);
  const { cards } = await importModelFiles([file('gltf-bundle.zip')]);
  const block = await storeModelCard(cards[0], ctx);
  assert.deepEqual(client.uploads.map(u => [u.name, u.family]), [['gltf-bundle.zip', 'model-package']]);
  assert.equal(block.fileRef.family, 'model-package'); assert.equal(block.fileRef.view.entry, 'model/cube.gltf'); assert.equal(block.fileRef.bundle, undefined);
  const opened = await openModelFiles(block);
  assert.deepEqual(opened.plan.entries[0].missing, []);
  assert.equal(opened.download.size, F['gltf-bundle.zip'].length, 'Download gives the dropped ZIP back');
  setSourceClient(null);
});

test('a folder with two models: one source per file; choosing swaps which source is the entry', async () => {
  const client = fakeClient(); setSourceClient(client, ctx);
  const drop = [['a/cube.stl', 'cube-binary.stl'], ['b/cube.glb', 'cube.glb']].map(([path, fixture]) => Object.assign(new File([F[fixture]], path.split('/').pop()), { bundleRoot: 'models', bundlePath: path }));
  const { cards } = await importModelFiles(drop);
  let block = await storeModelCard(cards[0], ctx);
  assert.equal(block.model.entry, null); assert.equal(client.uploads.length, 2);
  assert.equal(block.fileRef.view.entry, 'a/cube.stl'); assert.deepEqual(block.fileRef.bundle.map(b => b.path), ['b/cube.glb']);
  const glbSource = block.fileRef.bundle[0].source;
  const { plan } = await openModelFiles(block);
  block = chooseModel(block, plan.entries.find(e => e.path === 'b/cube.glb'));
  assert.deepEqual(block.fileRef.source, glbSource); assert.equal(block.fileRef.view.entry, 'b/cube.glb'); assert.equal(block.model.format, 'glb');
  assert.deepEqual(block.fileRef.bundle.map(b => b.path), ['a/cube.stl']);
  const reopened = await openModelFiles(block);
  assert.equal(reopened.files.get('b/cube.glb').length, F['cube.glb'].length, 'each path keeps its own bytes after the swap');
  setSourceClient(null);
});

test('a missing dependency becomes a new bundle source when the learner adds it', async () => {
  const client = fakeClient(); setSourceClient(client, ctx);
  const { cards } = await importModelFiles([file('gltf-separate/cube.gltf')]);
  const block = await storeModelCard(cards[0], ctx);
  assert.deepEqual((await openModelFiles(block)).plan.entries[0].missing.sort(), ['checker.png', 'cube.bin']);
  const next = await addModelFiles(block, [file('gltf-separate/cube.bin'), file('gltf-separate/textures/checker.png')]);
  assert.deepEqual(next.fileRef.bundle.map(b => b.path), ['cube.bin', 'checker.png']);
  assert.deepEqual(client.uploads.slice(1).map(u => [u.family, u.app, u.board]), [['model-part', 'demo', 'main'], ['image', 'demo', 'main']]);
  assert.deepEqual((await openModelFiles(next)).plan.entries[0].missing, []);
  await assert.rejects(addModelFiles(block, [new File(['x'], 'notes.txt')]), /model's own files/);
  setSourceClient(null);
});

test('without the client the card keeps today\'s board asset; a fileRef card says why it cannot read yet', async () => {
  setSourceClient(null);
  const { cards } = await importModelFiles([file('cube.glb')]);
  assert.match(cards[0].block.assetKey, /^model:/);
  await assert.rejects(openModelFiles({ ...cards[0].block, fileRef: { source: { id: 'fs_x', rev: 'r' } } }), /file reader has not loaded/);
});
