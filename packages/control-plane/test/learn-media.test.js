import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffImageType, putUploadedMedia, readUploadedMedia, uploadedMediaAsImage, isUploadedMediaId, MEDIA_UPLOAD_LIMIT } from '../src/learn-media.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new TextEncoder().encode('RIFF0000WEBPVP8 ');
const GIF = new TextEncoder().encode('GIF89a trailing bytes');

const file = (bytes, name = 'shot.png') => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const bucket = () => {
  const store = new Map();
  return {
    store,
    put: async (key, bytes, options) => store.set(key, { bytes, ...options }),
    get: async key => {
      const hit = store.get(key);
      return hit && { arrayBuffer: async () => hit.bytes.buffer, httpMetadata: hit.httpMetadata, customMetadata: hit.customMetadata };
    },
  };
};
const me = { org: 'workspace-a', name: 'counter', email: 'owner@example.test' };

test('the bytes decide the type; declared names and GIFs do not pass', () => {
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(WEBP), 'image/webp');
  assert.equal(sniffImageType(GIF), null, 'GIFs are browser-only by design');
  assert.equal(sniffImageType(new TextEncoder().encode('%PDF-1.4')), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
});

test('store and read round-trip under an identity-derived key', async () => {
  const env = { RUNS: bucket() };
  const { id, title } = await putUploadedMedia(env, me, file(PNG, 'my diagram.png'));
  assert.ok(isUploadedMediaId(id));
  assert.equal(title, 'my diagram.png');
  const [key] = env.RUNS.store.keys();
  assert.match(key, /^learn-media\/[A-Za-z0-9_-]{40,}\/media:[0-9a-f]{12}$/);
  const back = await readUploadedMedia(env, me, id);
  assert.equal(back.contentType, 'image/png');
  assert.deepEqual(back.bytes, PNG);
  const block = await uploadedMediaAsImage(env, me, id);
  assert.equal(block.image.type, 'image');
  assert.equal(block.image.source.media_type, 'image/png');
  assert.equal(atob(block.image.source.data).length, PNG.length);
});

test('another identity cannot read the same id', async () => {
  const env = { RUNS: bucket() };
  const { id } = await putUploadedMedia(env, me, file(JPEG, 'a.jpg'));
  await assert.rejects(() => readUploadedMedia(env, { ...me, email: 'other@example.test' }, id), /no longer stored/);
});

test('empty, oversized, and non-image files are refused with one-line reasons', async () => {
  const env = { RUNS: bucket() };
  await assert.rejects(() => putUploadedMedia(env, me, file(new Uint8Array(0))), /empty/);
  await assert.rejects(() => putUploadedMedia(env, me, file(new Uint8Array(MEDIA_UPLOAD_LIMIT + 1))), /larger than 5 MB/);
  await assert.rejects(() => putUploadedMedia(env, me, file(GIF, 'anim.gif')), /not a PNG, JPEG, or WebP/);
  assert.equal(env.RUNS.store.size, 0, 'nothing stored on refusal');
});

test('control characters and length leave the stored title', async () => {
  const env = { RUNS: bucket() };
  const { title } = await putUploadedMedia(env, me, file(PNG, 'abc.png'));
  assert.equal(title, 'a bc.png');
  const anon = await putUploadedMedia(env, me, { name: '', arrayBuffer: () => file(PNG).arrayBuffer() });
  assert.equal(anon.title, 'Dropped image');
});
