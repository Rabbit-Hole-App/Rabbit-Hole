import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaMeta, storeMedia } from './media-storage.js';
import { resetUploads, setFileScope, uploadState } from './file-source-client.js';

test('a new SVG or audio import is a fileRef card at once: its copy waits under fileRef.local while one upload starts', async () => {
  resetUploads();
  setFileScope(null); // no owner scope here, so the upload settles as refused instead of touching the network
  const card = await storeMedia(new File(['x'], 'song.flac'), { kind: 'audio', meta: { name: 'song.flac', size: 1, type: 'audio/flac', codec: 'flac', duration: 2 } });
  assert.equal(card.assetKey, undefined, 'never a board file');
  assert.equal(card.fileRef.source, null, 'not stored until the server says so');
  assert.match(card.fileRef.local, /^import:[0-9a-f-]{36}$/);
  assert.equal(card.fileRef.family, 'audio');
  assert.deepEqual(card.fileRef.meta, { name: 'song.flac', size: 1, type: 'audio/flac', codec: 'flac', duration: 2, title: 'song' });
  assert.ok(JSON.stringify(card.fileRef).length < 2048, 'contract section 3: under 2 KB');
  assert.doesNotMatch(JSON.stringify(card), /blob:|base64|https?:/);
  assert.ok(uploadState(card.fileRef.local), 'the upload started from the file in hand');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual([uploadState(card.fileRef.local).stage, uploadState(card.fileRef.local).error], ['failed', 'Only the canvas owner can save files here.'], 'a page that cannot write says so');
  const svg = await storeMedia(new File(['<svg/>'], 'logo.svg'), { kind: 'svg', meta: { name: 'logo.svg', type: 'image/svg+xml', size: 6, width: 300, height: 150 } });
  assert.equal(svg.fileRef.family, 'svg');
  await assert.rejects(storeMedia(new File(['x'], 'a.png'), { kind: 'image', meta: {} }), /board-file path/, 'image drops keep their asset path (lead ruling)');
  resetUploads();
});

test('the card reads fileRef.meta first, the old block meta otherwise', () => {
  assert.equal(mediaMeta({ meta: { type: 'old' }, fileRef: { meta: { type: 'audio/flac' } } }).type, 'audio/flac');
  assert.equal(mediaMeta({ meta: { type: 'image/png' } }).type, 'image/png');
  assert.deepEqual(mediaMeta({}), {});
});
