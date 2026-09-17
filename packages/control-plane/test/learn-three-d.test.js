import test from 'node:test';
import assert from 'node:assert/strict';
import { validateThreeD } from '../src/learn-three-d-schema.js';
import { validateBoardPlan } from '../src/learn-board.js';
import { inspectGlb, MAX_MODEL_BYTES } from '../../web/src/three-d-asset.js';
import { getThreeDContext } from '../../web/src/three-d-context.js';
import { disposeModel } from '../../web/src/three-d-renderer.js';

const op = { op: 'interactive_3d', id: 'sample', concept: 'Spatial exploration', modelUrl: 'https://assets.example.com/model.glb', camera: { position: [4, 3, 6], target: [0, 0, 0] } };
test('3D lesson operation accepts data and rejects executable fields or invalid cameras/URLs', () => {
  assert.equal(validateThreeD(op), op);
  assert.doesNotThrow(() => validateBoardPlan({ summary: 'Explore', needsClarification: false, blocks: [{ kind: 'three_d', text: 'Orbit the model', fromObjectId: null, operation: op }] }, { relatedObjects: [] }));
  for (const patch of [{ javascript: 'run()' }, { modelUrl: 'javascript:alert(1)' }, { modelUrl: 'http://localhost/a.glb' }, { modelUrl: 'https://127.0.0.1/a.glb' }, { camera: { position: [1, 2] } }, { camera: { position: [0, 0, Infinity] } }, { camera: { position: [0, 0, 0], target: [0, 0, 0] } }, { animation: { callback: 'run()' } }]) assert.throws(() => validateThreeD({ ...op, ...patch }));
});
function glb(json) {
  let text = JSON.stringify(json); text += ' '.repeat((4 - text.length % 4) % 4);
  const bytes = new TextEncoder().encode(text), buffer = new ArrayBuffer(bytes.length + 20), view = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, bytes.length, 0x4e4f534a].forEach((n, i) => view.setUint32(i * 4, n, true));
  new Uint8Array(buffer, 20).set(bytes); return buffer;
}
test('GLB inspection bounds size and complexity and rejects external dependencies', () => {
  assert.equal(inspectGlb(glb({ asset: { version: '2.0' } })).asset.version, '2.0');
  assert.throws(() => inspectGlb(new ArrayBuffer(MAX_MODEL_BYTES + 1)));
  assert.throws(() => inspectGlb(glb({ buffers: [{ uri: 'https://other.test/large.bin' }] })));
  assert.throws(() => inspectGlb(glb({ images: [{ uri: 'data:image/png;base64,stuff' }] })));
  assert.throws(() => inspectGlb(glb({ accessors: [{ count: 5000001 }] })));
  const invalid = glb({}); new DataView(invalid).setUint32(12, 999999, true); assert.throws(() => inspectGlb(invalid));
});
test('live 3D context uses current camera and playback state', () => {
  const shape = { type: 'three-d-viewer', meta: { objectId: 'spatial', concept: 'Perspective' }, props: { modelUrl: op.modelUrl, camera: { position: [8, 1, 2], target: [1, 0, 0] }, animation: { autoplay: false, clipName: 'Walk' }, animationTime: 1.2 } };
  const context = getThreeDContext({ getShape: () => shape }, 'shape:x');
  assert.deepEqual(context.camera.position, [8, 1, 2]); assert.equal(context.animationTime, 1.2); assert.equal(context.selectedObject, null);
});
test('cleanup disposes shared GPU resources and closes image bitmaps once', () => {
  const calls = {}; const item = name => ({ dispose() { calls[name] = (calls[name] || 0) + 1; } });
  const image = { close() { calls.image = (calls.image || 0) + 1; } };
  const texture = { ...item('texture'), isTexture: true, source: { data: image } };
  const material = { ...item('material'), map: texture }, geometry = item('geometry'), skeleton = item('skeleton');
  disposeModel({ scenes: [{ traverse(fn) { fn({ geometry, skeleton, material }); fn({ geometry, material: [material] }); } }] });
  assert.deepEqual(calls, { geometry: 1, skeleton: 1, image: 1, texture: 1, material: 1 });
});
