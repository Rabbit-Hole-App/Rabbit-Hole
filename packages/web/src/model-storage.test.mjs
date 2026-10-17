// model-storage.js with a stand-in for file-source-client.js (its startUpload / watchUpload / uploadState / canWrite /
// loadSource): one source per file, the lead-approved fileRef shape (source = entry or ZIP, view.entry, bundle =
// [{ path, source }]), local copies while uploading, stored sources written in per entry, reads only the card's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allFixtures } from '../e2e/model-fixtures.mjs';
import { importModelFiles } from './model-import.js';
import { addModelFiles, chooseModel, openModelFiles, pendingUploads, placeModelCard, setSourceClient, withStored } from './model-storage.js';

const F = allFixtures();
const file = (path, extra = {}) => Object.assign(new File([F[path]], path.split('/').pop()), extra);
function stand() {
  const local = new Map(), store = new Map(), states = new Map(), uploads = [], reads = [];
  const client = {
    uploads, reads, states,
    canWrite: () => true,
    uploadState: key => states.get(key) || null,
    watchUpload: () => () => {},
    startUpload(key, { family, file: f, name }) { uploads.push({ key, family, name }); states.set(key, { stage: 'waiting', file: f || local.get(key) }); },
    finish(key) { const id = `fs_${String(store.size).padStart(24, '0')}`; store.set(id, states.get(key).file); const source = { id, rev: `r${id}` }; states.set(key, { stage: 'stored', source }); return source; },
    async loadSource(block) { const ref = block.fileRef; if (ref.source?.id) { reads.push(ref.source.id); return store.get(ref.source.id) || null; } return local.get(ref.local) || null; },
  };
  setSourceClient(client, async (key, value) => { local.set(key, value); });
  return client;
}
// Every upload stores; the card takes each source as it lands.
const storeAll = (client, block) => pendingUploads(block).reduce((b, { key }) => withStored(b, key, client.finish(key)), block);

test('a .gltf with its .bin and texture: three uploads, the entry is fileRef.source, the others its bundle', async () => {
  const client = stand();
  const { cards } = await importModelFiles([file('gltf-separate/cube.gltf'), file('gltf-separate/cube.bin'), file('gltf-separate/textures/checker.png')]);
  let block = await placeModelCard(cards[0]);
  assert.equal(block.assetKey, undefined, 'no board asset: the files are sources');
  assert.deepEqual(client.uploads.map(u => [u.name, u.family]), [['cube.gltf', 'gltf'], ['cube.bin', 'model-part'], ['checker.png', 'model-part']]);
  assert.equal(block.fileRef.source, null); assert.match(block.fileRef.local, /^model:/);
  assert.deepEqual(block.fileRef.bundle.map(b => [b.path, b.source]), [['cube.bin', null], ['checker.png', null]]);
  // Before any upload finishes the card opens from this browser's copies.
  assert.deepEqual((await openModelFiles(block)).plan.entries[0].missing, []);
  block = storeAll(client, block);
  assert.deepEqual(pendingUploads(block), []);
  assert.ok(block.fileRef.source.id && !block.fileRef.local && block.fileRef.bundle.every(b => b.source.id && !b.local));
  assert.ok(JSON.stringify(block.fileRef).length < 2048, 'fileRef under 2 KB');
  const { plan, files, download } = await openModelFiles(block);
  assert.deepEqual(plan.entries[0].missing, []); assert.equal(files.size, 3);
  assert.deepEqual(client.reads.sort(), [block.fileRef.source.id, ...block.fileRef.bundle.map(b => b.source.id)].sort(), 'reads exactly the card\'s own sources');
  assert.equal(download.type, 'application/zip');
  setSourceClient(null);
});

test('a stored upload lands only on the entry that still names its local key', async () => {
  const client = stand();
  const { cards } = await importModelFiles([file('gltf-separate/cube.gltf'), file('gltf-separate/cube.bin')]);
  const block = await placeModelCard(cards[0]);
  const binKey = block.fileRef.bundle[0].local, source = client.finish(binKey);
  const once = withStored(block, binKey, source);
  assert.deepEqual(once.fileRef.bundle[0].source, source); assert.equal(once.fileRef.source, null);
  assert.equal(withStored(once, binKey, { id: 'fs_late', rev: 'x' }), once, 'a late or repeated result changes nothing');
  assert.equal(withStored(once, 'model:someone-else', source), once);
  setSourceClient(null);
});

test('a dropped ZIP is one source (the original); view.entry is the path inside it', async () => {
  const client = stand();
  const { cards } = await importModelFiles([file('gltf-bundle.zip')]);
  const block = storeAll(client, await placeModelCard(cards[0]));
  assert.deepEqual(client.uploads.map(u => [u.name, u.family]), [['gltf-bundle.zip', 'model-package']]);
  assert.equal(block.fileRef.family, 'model-package'); assert.equal(block.fileRef.view.entry, 'model/cube.gltf'); assert.equal(block.fileRef.bundle, undefined);
  const opened = await openModelFiles(block);
  assert.deepEqual(opened.plan.entries[0].missing, []);
  assert.equal(opened.download.size, F['gltf-bundle.zip'].length, 'Download gives the dropped ZIP back');
  setSourceClient(null);
});

test('a folder with two models: one source per file; choosing swaps which source is the entry', async () => {
  const client = stand();
  const drop = [['a/cube.stl', 'cube-binary.stl'], ['b/cube.glb', 'cube.glb']].map(([path, fixture]) => Object.assign(new File([F[fixture]], path.split('/').pop()), { bundleRoot: 'models', bundlePath: path }));
  const { cards } = await importModelFiles(drop);
  let block = storeAll(client, await placeModelCard(cards[0]));
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

test('a missing dependency becomes a new bundle entry with its own upload when the learner adds it', async () => {
  const client = stand();
  const { cards } = await importModelFiles([file('gltf-separate/cube.gltf')]);
  const block = storeAll(client, await placeModelCard(cards[0]));
  assert.deepEqual((await openModelFiles(block)).plan.entries[0].missing.sort(), ['checker.png', 'cube.bin']);
  const next = await addModelFiles(block, [file('gltf-separate/cube.bin'), file('gltf-separate/textures/checker.png')]);
  assert.deepEqual(next.fileRef.bundle.map(b => [b.path, b.family]), [['cube.bin', 'model-part'], ['checker.png', 'model-part']]);
  assert.deepEqual(pendingUploads(next).map(p => p.name), ['cube.bin', 'checker.png']);
  assert.deepEqual((await openModelFiles(next)).plan.entries[0].missing, []);
  await assert.rejects(addModelFiles(block, [new File(['x'], 'notes.txt')]), /model's own files/);
  setSourceClient(null);
});
