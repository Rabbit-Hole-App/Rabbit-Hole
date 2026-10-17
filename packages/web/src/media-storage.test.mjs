import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMediaOriginal, mediaMeta, setSourceClient, storeMedia } from './media-storage.js';

const rev = 'c'.repeat(64);
const fakeClient = () => {
  const uploads = [];
  return {
    uploads,
    async uploadSource(file, where) { uploads.push({ name: file.name, ...where }); return { source: { id: 'fs_0123456789abcdef01234567', rev } }; },
    async loadSource(block) { return block.fileRef.source.rev === rev ? new Blob(['bytes'], { type: 'audio/flac' }) : null; },
  };
};

test('with the client, a new SVG or audio import becomes one compact fileRef card, never bytes or URLs', async () => {
  const client = fakeClient();
  setSourceClient(client, { app: 'canvas-1', board: 'main' });
  const card = await storeMedia(new File(['x'], 'song.flac'), { kind: 'audio', meta: { name: 'song.flac', size: 1, type: 'audio/flac', codec: 'flac', duration: 2 } });
  assert.deepEqual(client.uploads, [{ name: 'song.flac', app: 'canvas-1', board: 'main', family: 'audio' }]);
  assert.equal(card.assetKey, undefined);
  assert.deepEqual(card.fileRef.source, { id: 'fs_0123456789abcdef01234567', rev });
  assert.equal(card.fileRef.family, 'audio');
  assert.deepEqual(card.fileRef.meta, { name: 'song.flac', size: 1, type: 'audio/flac', codec: 'flac', duration: 2, title: 'song' });
  assert.ok(JSON.stringify(card.fileRef).length < 2048, 'contract section 3: under 2 KB');
  assert.doesNotMatch(JSON.stringify(card), /blob:|base64|https?:/);
  assert.equal(mediaMeta({ ...card, meta: { type: 'stale' } }).type, 'audio/flac', 'fileRef.meta is the card\'s truth');
  const svg = await storeMedia(new File(['<svg/>'], 'logo.svg'), { kind: 'svg', meta: { name: 'logo.svg', type: 'image/svg+xml', size: 6, width: 300, height: 150 } });
  assert.equal(svg.fileRef.family, 'svg');
  setSourceClient(null);
});

test('a stored-source card reads through loadSource; without the client it is unreadable, not guessed', async () => {
  setSourceClient(fakeClient());
  const block = { type: 'file', kind: 'audio', fileRef: { v: 1, source: { id: 'fs_0123456789abcdef01234567', rev }, family: 'audio', meta: {} } };
  assert.equal(await (await loadMediaOriginal(block)).text(), 'bytes');
  assert.equal(await loadMediaOriginal({ ...block, fileRef: { ...block.fileRef, source: { ...block.fileRef.source, rev: 'd'.repeat(64) } } }), null);
  setSourceClient({ loadSource: async () => { throw new Error('403'); } });
  assert.equal(await loadMediaOriginal(block), null, 'a refused read is the missing state');
  setSourceClient(null);
  assert.equal(await loadMediaOriginal(block), null);
});

test('a failed upload throws the reason the drop shows', async () => {
  setSourceClient({ uploadSource: async () => ({}) });
  await assert.rejects(storeMedia(new File(['x'], 'a.mp3'), { kind: 'audio', meta: {} }), /could not be stored/);
  setSourceClient(null);
});
