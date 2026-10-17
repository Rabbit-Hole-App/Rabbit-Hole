// model-import.js (drop -> cards), viewer-slots.js, model-cad.js and model-drop.js on the generated fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allFixtures, png } from '../e2e/model-fixtures.mjs';
import { importModelFiles, openModelPackage, addFilesToPackage } from './model-import.js';
import { ENTRY_FORMATS } from './model-formats.js';
import { MODEL_ACCEPT, isModelDrop } from './model-drop.js';
import { FAMILIES, acceptList, familyOf } from './file-capabilities.js';
import { MAX_LIVE, claimViewer, releaseViewer, activateViewer, deactivateViewer, activeViewer, isLive, liveCount, resetViewers } from './viewer-slots.js';
import { cadCardState, cadFacts } from './model-cad.js';
import { describeCanvasObject } from './learn-ask-target.js';

const F = allFixtures();
const file = (path, extra = {}) => Object.assign(new File([F[path]], path.split('/').pop()), extra);

test('the registry offers every model format, package and part; the drop routes exactly the model cards', () => {
  const lane4 = FAMILIES.filter(f => f.lane === 4);
  assert.ok(lane4.every(f => f.status === 'shipped' && f.route === (f.id === 'model-part' ? 'model-part' : 'model')));
  assert.deepEqual(lane4.filter(f => f.id !== 'model-part').flatMap(f => f.extensions).filter(e => e !== 'zip').sort(), Object.keys(ENTRY_FORMATS).sort(), 'registry and detector name the same formats');
  assert.equal(familyOf({ name: 'tex.png' }).id, 'image', 'a standalone picture stays an image (5 MiB)');
  assert.equal(FAMILIES.find(f => f.id === 'model-part').limits.bytes, 25 * 1048576, 'a texture inside a model bundle may be 25 MiB');
  const offered = acceptList().split(',');
  for (const ext of [...Object.keys(ENTRY_FORMATS), 'zip', 'bin', 'mtl']) { assert.ok(offered.includes(`.${ext}`), ext); assert.ok(MODEL_ACCEPT.split(',').includes(`.${ext}`), ext); }
  for (const ext of [...Object.keys(ENTRY_FORMATS), 'zip']) assert.ok(isModelDrop([new File(['x'], `a.${ext.toUpperCase()}`)]), ext);
  assert.equal(isModelDrop([new File(['x'], 'cube.bin')]), false, 'a lone part is not a model');
  assert.equal(isModelDrop([new File(['x'], 'photo.png')]), false);
  assert.equal(isModelDrop([Object.assign(new File(['x'], 'a.png'), { bundleRoot: 'scan' })]), true);
  assert.equal(familyOf({ name: 'scene.GLB' }).id, 'gltf');
  assert.equal(familyOf({ name: 'scan.ply' }).can.context, false, 'Ask lists a model; it does not understand it');
  assert.equal(familyOf({ name: 'part.step' }).can.preview, false, 'STEP preview awaits the converter');
});

test('a GLB drop is one card; the board keeps a compact record, the bytes go to the asset', async () => {
  const { cards, leftovers, errors } = await importModelFiles([file('cube.glb')]);
  assert.deepEqual(errors, []); assert.deepEqual(leftovers, []); assert.equal(cards.length, 1);
  const { block, blob } = cards[0];
  assert.equal(block.type, 'file'); assert.equal(block.kind, 'model'); assert.match(block.assetKey, /^model:/);
  assert.deepEqual({ ...block.model }, { v: 1, family: 'gltf', format: 'glb', render: 'mesh', package: 'file', entry: 'cube.glb', download: 'cube.glb', units: 'm' });
  assert.equal(blob.size, F['cube.glb'].length);
  assert.ok(JSON.stringify(block).length < 600, 'the card record stays compact');
});

test('a .gltf dropped with its .bin and texture is one card whose original is one ZIP of exactly those files', async () => {
  const drop = [file('gltf-separate/cube.gltf'), file('gltf-separate/cube.bin'), file('gltf-separate/textures/checker.png')];
  const { cards, leftovers, errors } = await importModelFiles(drop);
  assert.deepEqual(errors, []); assert.deepEqual(leftovers, []); assert.equal(cards.length, 1);
  const { block, blob } = cards[0];
  assert.equal(block.model.package, 'zip'); assert.equal(block.model.download, 'cube.zip');
  const { files, plan } = await openModelPackage(block, blob);
  assert.deepEqual([...files.keys()].sort(), ['checker.png', 'cube.bin', 'cube.gltf']);
  assert.deepEqual(plan.entries[0].missing, []); // textures/checker.png found by its name in the bundle
});

test('a photo dropped beside a model goes back to the ordinary drop path; texture-only drops are not models', async () => {
  const photo = new File([png()], 'holiday.png');
  const { cards, leftovers } = await importModelFiles([file('cube-binary.stl'), photo]);
  assert.equal(cards.length, 1); assert.deepEqual(leftovers, [photo]);
  const lonelyPart = await importModelFiles([file('cube-binary.stl'), file('gltf-separate/cube.bin')]);
  assert.deepEqual([lonelyPart.cards.length, lonelyPart.leftovers.length, lonelyPart.errors], [1, 0, ['cube.bin: no model in this drop uses this file']]);
  const only = await importModelFiles([photo]);
  assert.equal(only.cards.length, 0); assert.deepEqual(only.leftovers, [photo]);
});

test('several loose models are one card each, in input order; invalid ones are refused with the reason', async () => {
  const { cards, errors } = await importModelFiles([file('cube-binary.stl'), file('points.ply'), file('ring.splat'), file('bad-splat-missing-rot.ply'), Object.assign(new File(['solid nope'], 'x.glb'))]);
  assert.deepEqual(cards.map(c => [c.block.label, c.block.model.render, c.block.model.counts]), [['cube-binary.stl', 'mesh', { triangles: 12 }], ['points.ply', 'points', { points: 2000 }], ['ring.splat', 'splat', { splats: 512 }]]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^bad-splat-missing-rot\.ply: .*missing rot_3/);
  assert.match(errors[1], /^x\.glb: this does not look like a valid \.glb/);
});

test('3MF units come from the file; STEP becomes a CAD card awaiting the converter', async () => {
  const { cards } = await importModelFiles([file('cube.3mf'), file('cube-header-only.step')]);
  assert.equal(cards[0].block.model.units, 'mm');
  assert.equal(cards[1].block.model.render, 'cad');
  assert.equal(cadCardState(cards[1].block.fileRef).state, 'awaiting', 'an asset card (no fileRef) never converts');
});

test('a ZIP is one package card; several models inside ask for a choice; unsafe ZIPs are refused', async () => {
  const one = await importModelFiles([file('gltf-bundle.zip')]);
  assert.equal(one.cards[0].block.model.entry, 'model/cube.gltf');
  assert.equal(one.cards[0].blob.size, F['gltf-bundle.zip'].length); // the dropped ZIP itself is the original
  const two = await importModelFiles([file('two-models.zip')]);
  assert.equal(two.cards[0].block.model.entry, null);
  assert.deepEqual(two.cards[0].block.model.entries.map(e => e.path), ['a/cube.stl', 'b/cube.glb']);
  for (const [name, reason] of [['traversal.zip', /outside the package/], ['symlink.zip', /symbolic link/], ['bomb.zip', /decompression bomb/]]) {
    const { cards, errors } = await importModelFiles([file(name)]);
    assert.equal(cards.length, 0, name); assert.match(errors[0], reason, name);
  }
  const empty = await importModelFiles([new File([allFixtures()['two-models.zip'].slice(0, 0)], 'notes.zip')]);
  assert.match(empty.errors[0], /^notes\.zip: /);
});

test('a dropped folder is one package card, packed with its relative paths', async () => {
  const root = 'scan';
  const drop = ['model/cube.gltf', 'model/cube.bin', 'model/textures/checker.png'].map(path => Object.assign(new File([F[`gltf-separate/${path.replace('model/', '')}`]], path.split('/').pop()), { bundleRoot: root, bundlePath: path }));
  const { cards, errors } = await importModelFiles(drop);
  assert.deepEqual(errors, []);
  assert.equal(cards[0].block.label, 'scan'); assert.equal(cards[0].block.model.entry, 'model/cube.gltf'); assert.equal(cards[0].block.model.download, 'scan.zip');
  const { plan } = await openModelPackage(cards[0].block, cards[0].blob);
  assert.deepEqual(plan.entries[0].missing, []);
});

test('a lonely .gltf lists its missing files; supplying them repacks one ZIP and clears the list', async () => {
  const { cards } = await importModelFiles([file('gltf-separate/cube.gltf')]);
  const { block, blob } = cards[0];
  assert.deepEqual((await openModelPackage(block, blob)).plan.entries[0].missing.sort(), ['checker.png', 'cube.bin']);
  const next = await addFilesToPackage(block, blob, [file('gltf-separate/cube.bin'), file('gltf-separate/textures/checker.png')]);
  assert.notEqual(next.block.assetKey, block.assetKey); assert.equal(next.block.model.package, 'zip');
  assert.deepEqual((await openModelPackage(next.block, next.blob)).plan.entries[0].missing, []);
  await assert.rejects(addFilesToPackage(block, blob, [new File(['x'], 'notes.txt')]), /model's own files/);
});

test('oversized sources are refused before they are read', async () => {
  const big = { name: 'huge.glb', size: 26 * 1048576, arrayBuffer: () => { throw new Error('read'); } };
  const { errors } = await importModelFiles([big]);
  assert.match(errors[0], /huge\.glb: 3D files up to 25 MiB/);
});

test('viewer slots: at most MAX_LIVE renderers; the least recently used gives way, never the active one', () => {
  resetViewers();
  const released = [];
  for (let i = 0; i < MAX_LIVE; i++) assert.ok(claimViewer(`v${i}`, () => released.push(`v${i}`)));
  activateViewer('v0', () => released.push('exit v0'));
  assert.ok(claimViewer('v3', () => released.push('v3')));
  assert.deepEqual(released, ['v1']); // v0 is older but interactive
  assert.equal(liveCount(), MAX_LIVE); assert.ok(isLive('v0')); assert.ok(!isLive('v1'));
  activateViewer('v2', () => released.push('exit v2'));
  assert.deepEqual(released, ['v1', 'exit v0']); // one interactive viewer at a time
  assert.equal(activeViewer(), 'v2');
  deactivateViewer('v2'); releaseViewer('v3');
  assert.equal(activeViewer(), null); assert.equal(liveCount(), MAX_LIVE - 1);
  resetViewers();
});

test('CAD card states follow the source, the job and its derivatives; units only when the converter reported them', () => {
  const stored = { source: { id: 'fs_1', rev: 'r' }, job: null };
  assert.equal(cadCardState(null).state, 'awaiting');
  assert.equal(cadCardState({ source: null, local: 'model:x' }).state, 'saving');
  assert.equal(cadCardState(stored, { owner: true }).label, 'Queued for conversion');
  assert.match(cadCardState(stored, { owner: false }).label, /Converting in the original canvas/, 'a shared or forked card never starts a job');
  assert.equal(cadCardState({ ...stored, job: 'fj_1' }, { job: { state: 'converting', stage: 'converting' } }).label, 'Converting to a viewing mesh');
  assert.deepEqual(cadCardState({ ...stored, job: 'fj_1' }, { job: { state: 'failed', error: 'too_complex' } }), { state: 'failed', label: 'The STEP preview could not be made: too_complex. The original STEP file is kept.', retry: true });
  assert.equal(cadCardState({ ...stored, job: 'fj_1' }, { job: { state: 'ready_with_limitations' }, mesh: true }).state, 'limited');
  assert.equal(cadCardState({ ...stored, job: 'fj_1' }, { job: { state: 'cancelled' } }).retry, true);
  assert.match(cadCardState(stored, { error: 'The cad converter does not take mesh files' }).label, /could not be started/);
  // The converter's structure.json (file-convert step.mjs): source_unit long names, the mesh in metres.
  assert.deepEqual(cadFacts({ source_unit: 'millimetre', unit: 'metre', parts: 3 }, ['Tessellated preview: no B-rep, parametric features or PMI']), { units: 'mm', perMetre: 1000, parts: 3, limitations: ['Tessellated preview: no B-rep, parametric features or PMI'] });
  assert.equal(cadFacts({ source_unit: 'inch' }).units, 'in');
  assert.equal(cadFacts({ source_unit: null, unit: 'metre' }).units, null); // no declared unit: no measurement
  assert.equal(cadFacts({ source_unit: 'furlong' }).units, null);
  assert.equal(cadFacts(null).units, null);
});

test('Ask context lists a model card by name and declared counts only', () => {
  const text = describeCanvasObject({ type: 'file', kind: 'model', label: 'ring.splat', model: { format: 'splat', render: 'splat', counts: { splats: 512 } } }).text;
  assert.equal(text, 'Gaussian splat on the canvas: ring.splat (.splat, 512 splats). Only its name and these counts are known here; its shape was not inspected.');
});
