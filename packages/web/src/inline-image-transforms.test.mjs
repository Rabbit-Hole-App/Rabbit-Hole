import test from 'node:test';
import assert from 'node:assert/strict';
import { imageTransformPlan as plan, imageHeaderDimensions, transformImage } from './inline-image-transforms.js';

test('raster headers reject decompression bombs and malformed inputs before decoding', () => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71]); bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 4); view.setUint32(20, 2);
  assert.deepEqual(imageHeaderDimensions(bytes, 'image/png'), { width: 4, height: 2 });
  view.setUint32(16, 100000);
  assert.throws(() => imageHeaderDimensions(bytes, 'image/png'));
  assert.throws(() => imageHeaderDimensions(new Uint8Array(2), 'image/webp'));
});

test('resize preserves aspect unless stretch is explicit', () => {
  assert.equal(plan(400, 200, { type: 'resize', width: 100, height: 100 }).height, 50);
  assert.equal(plan(400, 200, { type: 'resize', width: 100, height: 100, fit: 'stretch' }).height, 100);
});
test('crop validates all source boundaries', () => {
  assert.deepEqual(plan(4, 2, { type: 'crop', x: 1, y: 0, width: 2, height: 2 }).source, [1, 0, 2, 2]);
  for (const x of [-1, 3, 0.5, NaN]) assert.throws(() => plan(4, 2, { type: 'crop', x, y: 0, width: 2, height: 2 }));
});
test('rotation normalizes quarter turns and swaps dimensions', () => {
  assert.equal(plan(4, 2, { type: 'rotate', quarterTurns: -1 }).width, 2);
  assert.equal(plan(4, 2, { type: 'rotate', quarterTurns: 2 }).width, 4);
  assert.throws(() => plan(4, 2, { type: 'rotate', quarterTurns: 0.5 }));
});
test('padding centers unchanged pixels and rejects cropping or invalid colors', () => {
  assert.deepEqual(plan(4, 2, { type: 'pad', width: 8, height: 8 }).destination, [2, 3, 4, 2]);
  assert.throws(() => plan(4, 2, { type: 'pad', width: 2, height: 2 }));
  assert.throws(() => plan(4, 2, { type: 'pad', width: 8, height: 8, color: 'url(evil)' }));
});
test('oversized dimensions and unsupported operations fail closed', () => {
  assert.throws(() => plan(8192, 8192, { type: 'rotate', quarterTurns: 1 }));
  assert.throws(() => plan(4, 2, { type: 'remove_background' }));
});
test('adapter refuses network URLs and unsupported blobs before decoding', async () => {
  assert.equal((await transformImage('https://example.com/image.png', {})).ok, false);
  assert.equal((await transformImage(new Blob(['<svg/>'], { type: 'image/svg+xml' }), {})).ok, false);
});
