// model-formats.js and model-archive.js on the generated fixtures (e2e/model-fixtures.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { allFixtures, glb, gltfSeparate, plySplat, zip, png, stlBinary } from '../e2e/model-fixtures.mjs';
import { sniffModel, inspectPly, planBundle, bundlePath, referenceOf, findInBundle, headerCounts, overBudget, sizeLabel, threeMfUnit, MODEL_LIMITS } from './model-formats.js';
import { zipEntries, readModelZip, packBundle } from './model-archive.js';

const F = allFixtures();
const enc = s => new TextEncoder().encode(s);

test('every model fixture sniffs as its own format and not as the others', () => {
  const cases = { 'cube.glb': 'glb', 'gltf-separate/cube.gltf': 'gltf', 'cube-binary.stl': 'stl', 'cube-ascii.stl': 'stl', 'obj/cube.obj': 'obj', 'cube.3mf': '3mf', 'cube-ascii.fbx': 'fbx', 'cube-binary.fbx': 'fbx', 'cube-header-only.step': 'step', 'mesh-ascii.ply': 'ply', 'ring.splat': 'splat', 'ring.ksplat': 'ksplat', 'ring.spz': 'spz' };
  for (const [name, format] of Object.entries(cases)) assert.equal(sniffModel(name, F[name]).format, format, name);
  // The bytes must agree with the name.
  assert.match(sniffModel('cube.glb', F['cube-ascii.stl']).error, /valid \.glb/);
  assert.match(sniffModel('cube.stl', F['obj/cube.obj']).error, /valid \.stl/);
  assert.match(sniffModel('ring.splat', F['mesh-binary.ply']).error, /valid \.splat/);
  assert.match(sniffModel('notes.gltf', enc('{"hello":1}')).error, /valid \.gltf/);
  assert.match(sniffModel('cube.step', enc('solid x')).error, /valid \.step/);
  assert.match(sniffModel('empty.obj', new Uint8Array(0)).error, /empty/);
  assert.match(sniffModel('photo.png', png()).error, /not a 3D model/);
});

test('PLY: mesh, point cloud and splat are told apart by their header', () => {
  assert.deepEqual([inspectPly(F['mesh-ascii.ply']).kind, inspectPly(F['mesh-binary.ply']).kind], ['mesh', 'mesh']);
  assert.equal(inspectPly(F['mesh-binary.ply']).faces, 12);
  const points = inspectPly(F['points.ply']);
  assert.equal(points.kind, 'points'); assert.equal(points.vertices, 2000); assert.equal(points.colored, true);
  const splat = inspectPly(F['splat-3dgs.ply']);
  assert.equal(splat.kind, 'splat'); assert.equal(splat.splats, 512); assert.equal(splat.shDegree, 0);
  assert.equal(inspectPly(F['splat-3dgs-sh1.ply']).shDegree, 1);
});

test('PLY: inconsistent schemas are refused with the reason', () => {
  assert.match(inspectPly(F['bad-splat-missing-rot.ply']).error, /missing rot_3/);
  assert.match(inspectPly(plySplat({ rest: 5 })).error, /5 f_rest coefficients/);
  const head = body => enc(`ply\nformat binary_little_endian 1.0\n${body}end_header\n`);
  assert.match(inspectPly(head('element vertex 3\nproperty float x\nproperty float y\nelement face 1\nproperty list uchar int vertex_indices\n')).error, /no z/);
  assert.match(inspectPly(enc('ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 2\nproperty uchar flags\nend_header\n')).error, /no vertex_indices/);
  assert.match(inspectPly(head('element vertex 1000\nproperty float x\nproperty float y\nproperty float z\n')).error, /truncated/);
  assert.match(inspectPly(enc('ply\nformat binary_middle_endian 1.0\nend_header\n')).error, /not supported/);
  assert.match(inspectPly(head('element face 1\nproperty list uchar int vertex_indices\n')).error, /no vertex element/);
  assert.match(inspectPly(head('element vertex 1\nproperty float x\nproperty float y\nproperty float z\nproperty float packed_position\nelement chunk 1\nproperty float min_x\n')).error, /compressed-splat/);
});

test('bundle paths never leave the bundle; references resolve only to bundle files', () => {
  assert.equal(bundlePath('model\\textures\\a.png'), 'model/textures/a.png');
  assert.equal(bundlePath('a/./b/../c.png'), 'a/c.png');
  for (const bad of ['../x.png', '/etc/passwd', 'C:/Windows/x.png', 'C:\\x.png', 'https://x/y.png', 'a/../../x', '', 'a\0b']) assert.equal(bundlePath(bad), null, bad);
  assert.deepEqual(referenceOf('model/cube.gltf', 'textures/checker.png'), { path: 'model/textures/checker.png' });
  assert.deepEqual(referenceOf('cube.gltf', 'my%20tex.png'), { path: 'my tex.png' });
  assert.deepEqual(referenceOf('cube.gltf', 'data:application/octet-stream;base64,AAAA'), { embedded: true });
  assert.deepEqual(referenceOf('cube.gltf', 'https://example.com/cube.bin'), { blocked: 'https://example.com/cube.bin' });
  assert.deepEqual(referenceOf('cube.gltf', 'blob:https://x/1'), { blocked: 'blob:https://x/1' });
  // An absolute author path is matched by its file name among the bundle's files, never read.
  assert.deepEqual(referenceOf('cube.mtl', 'C:\\Users\\me\\tex.png'), { name: 'tex.png' });
  assert.deepEqual(referenceOf('cube.mtl', 'file:///home/me/tex.png'), { name: 'tex.png' });
  assert.deepEqual(referenceOf('cube.mtl', '../../outside.png'), { name: 'outside.png' });
  const paths = ['m/a.gltf', 'm/Tex/Checker.PNG', 'm/b.bin'];
  assert.equal(findInBundle(paths, { path: 'm/tex/checker.png' }), 'm/Tex/Checker.PNG');
  assert.equal(findInBundle(paths, { name: 'b.bin' }), 'm/b.bin');
  assert.equal(findInBundle(['a/x.png', 'b/x.png'], { name: 'x.png' }), null); // ambiguous: not guessed
});

test('glTF with its .bin and texture is one entry with both dependencies; missing ones are named', () => {
  const files = ['gltf-separate/cube.gltf', 'gltf-separate/cube.bin', 'gltf-separate/textures/checker.png'].map(path => ({ path, bytes: F[path] }));
  const plan = planBundle(files);
  assert.equal(plan.entries.length, 1);
  assert.deepEqual(plan.entries[0].deps.sort(), ['gltf-separate/cube.bin', 'gltf-separate/textures/checker.png']);
  assert.deepEqual(plan.entries[0].missing, []); assert.deepEqual(plan.unused, []);
  assert.equal(plan.entries[0].units, 'm');
  const lonely = planBundle([files[0]]);
  assert.deepEqual(lonely.entries[0].missing.sort(), ['checker.png', 'cube.bin']);
  const external = planBundle([{ path: 'cube-external-refs.gltf', bytes: F['cube-external-refs.gltf'] }]).entries[0];
  assert.deepEqual(external.blocked, ['https://example.com/cube.bin']);
  assert.deepEqual(external.missing, ['checker.png']); // the file:/// author path is looked for by name only
  assert.deepEqual(planBundle([{ path: 'cube-embedded.gltf', bytes: F['cube-embedded.gltf'] }]).entries[0].missing, []);
});

test('glTF required extensions the viewer cannot decode are refused up front', () => {
  const draco = glb({ json: json => ({ ...json, extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] }) });
  assert.match(planBundle([{ path: 'd.glb', bytes: draco }]).entries[0].limitation, /Draco-compressed meshes/);
  const big = glb({ json: json => ({ ...json, accessors: json.accessors.map(a => ({ ...a, count: a.count * 1_000_000 })) }) });
  assert.match(planBundle([{ path: 'big.glb', bytes: big }]).entries[0].limitation, /too complex/);
});

test('OBJ resolves its MTL and the MTL its texture, including an absolute author path', () => {
  const files = ['obj/cube.obj', 'obj/cube.mtl', 'obj/checker.png'].map(path => ({ path, bytes: F[path] }));
  assert.deepEqual(planBundle(files).entries[0].deps, ['obj/cube.mtl', 'obj/checker.png']);
  const authored = [{ path: 'cube.obj', bytes: F['obj/cube.obj'] }, { path: 'cube.mtl', bytes: enc('newmtl C\nmap_Kd -s 1 1 1 C:\\Users\\me\\checker.png\n') }, { path: 'checker.png', bytes: png() }];
  assert.deepEqual(planBundle(authored).entries[0].deps, ['cube.mtl', 'checker.png']);
  assert.deepEqual(planBundle([{ path: 'cube.obj', bytes: F['obj/cube.obj'] }]).entries[0].missing, ['cube.mtl']);
  assert.deepEqual(planBundle([files[0], files[1]]).entries[0].missing, ['checker.png']);
});

test('several independent models are separate entries; textures nobody names are left over', () => {
  const plan = planBundle([{ path: 'a.stl', bytes: stlBinary() }, { path: 'b.glb', bytes: glb() }, { path: 'photo.png', bytes: png() }]);
  assert.deepEqual(plan.entries.map(e => e.path), ['a.stl', 'b.glb']);
  assert.deepEqual(plan.unused, ['photo.png']);
  const ply = planBundle([{ path: 'scan.ply', bytes: F['splat-3dgs.ply'] }, { path: 'bad.ply', bytes: F['bad-splat-missing-rot.ply'] }]);
  assert.equal(ply.entries[0].render, 'splat'); assert.equal(ply.entries[0].family, 'splat');
  assert.match(ply.entries[1].error, /^bad\.ply: .*missing rot_3/);
});

test('header counts, budgets and size labels', () => {
  const plan = planBundle([{ path: 'c.stl', bytes: F['cube-binary.stl'] }, { path: 'p.ply', bytes: F['points.ply'] }, { path: 'r.splat', bytes: F['ring.splat'] }, { path: 'r.ksplat', bytes: F['ring.ksplat'] }]);
  assert.deepEqual(plan.entries.map(e => headerCounts(e, F[{ 'c.stl': 'cube-binary.stl', 'p.ply': 'points.ply', 'r.splat': 'ring.splat', 'r.ksplat': 'ring.ksplat' }[e.path]])), [{ triangles: 12 }, { points: 2000 }, { splats: 512 }, { splats: 512 }]);
  assert.equal(overBudget({ triangles: 12 }), null);
  assert.match(overBudget({ splats: MODEL_LIMITS.splats + 1 }), /splats is above/);
  assert.equal(sizeLabel([1, 0.5, 0.25], null), null); // unknown units: no measurement shown
  assert.equal(sizeLabel([20, 20, 20], 'mm'), '20.0 × 20.0 × 20.0 mm');
  assert.equal(threeMfUnit('<model unit="inch" xmlns="x">'), 'in');
  assert.equal(threeMfUnit('<model xmlns="x">'), 'mm');
});

test('ZIP packages: the entries are read; traversal, symlinks, bombs and nested ZIPs are refused or skipped', () => {
  const { files, skipped } = readModelZip(F['gltf-bundle.zip']);
  assert.deepEqual(files.map(f => f.path).sort(), ['model/cube.bin', 'model/cube.gltf', 'model/textures/checker.png']);
  assert.deepEqual(skipped, []);
  assert.deepEqual(planBundle(files).entries[0].missing, []);
  assert.deepEqual(planBundle(readModelZip(F['two-models.zip']).files).entries.map(e => e.path), ['a/cube.stl', 'b/cube.glb']);
  assert.throws(() => readModelZip(F['traversal.zip']), /outside the package \(\.\.\/evil\.png\)/);
  assert.throws(() => readModelZip(F['symlink.zip']), /symbolic link/);
  assert.throws(() => readModelZip(F['bomb.zip']), /decompression bomb/);
  assert.throws(() => zipEntries(zip({ a: enc('x'), b: enc('y') }), { ...MODEL_LIMITS, archiveEntries: 1 }), /at most 1/);
  assert.throws(() => zipEntries(zip({ 'a.bin': new Uint8Array(1000) }), { ...MODEL_LIMITS, archiveBytes: 999 }), /expands past/);
  assert.deepEqual(readModelZip(zip({ 'inner.zip': zip({ 'x.glb': glb() }), 'cube.glb': glb() })).skipped, ['inner.zip']);
  assert.throws(() => zipEntries(enc('not a zip at all, really')), /no central directory/);
});

test('a lying ZIP header cannot expand past its declared size', () => {
  const honest = zip({ 'cube.bin': new Uint8Array(4096).fill(7) });
  // Shrink the declared uncompressed size in both headers: inflating must stop, not write past it.
  const lying = honest.slice();
  for (let i = 0; i + 4 <= lying.length; i++) {
    if (lying[i] === 0x50 && lying[i + 1] === 0x4b && lying[i + 2] === 0x01 && lying[i + 3] === 0x02) new DataView(lying.buffer).setUint32(i + 24, 100, true);
    if (lying[i] === 0x50 && lying[i + 1] === 0x4b && lying[i + 2] === 0x03 && lying[i + 3] === 0x04) new DataView(lying.buffer).setUint32(i + 22, 100, true);
  }
  assert.throws(() => readModelZip(lying), /expands past its declared size/);
});

test('loose files pack into one stored ZIP that reads back byte for byte', () => {
  const separate = gltfSeparate();
  const files = [{ path: 'cube.gltf', bytes: separate.gltf }, { path: 'cube.bin', bytes: separate.bin }, { path: 'textures/checker.png', bytes: png() }];
  const packed = packBundle(files);
  assert.deepEqual(packBundle(files), packed); // deterministic
  const back = readModelZip(packed).files;
  for (const f of files) assert.deepEqual(back.find(b => b.path === f.path).bytes, f.bytes);
});
