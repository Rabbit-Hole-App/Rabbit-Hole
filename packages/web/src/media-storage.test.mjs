import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READ_WAITS, mediaMeta, readOriginal, storeMedia } from './media-storage.js';
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

// ---- reading a stored original (task b4b89fb0): a generated image's card is placed before the board save that registers this
// canvas's reference to its source (file_source_refs), so the first read can be the server's 404 "Not available". The card must
// keep loading, read again after the save or with bounded backoff, and only then say the file could not be read.
const SRC = { id: `fs_${'c'.repeat(24)}`, rev: 'd'.repeat(64) };
const card = { id: 'k1', type: 'file', kind: 'image', fileRef: { v: 1, source: SRC, family: 'image', meta: { name: 'generated-image.png', type: 'image/png' } } };
const settle = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
// Wait for a state, not a fixed time: poll until ok() holds (bounded at 3 s, then the caller's assertion reports what is wrong).
const until = async (ok, limit = 3000) => { for (const t0 = Date.now(); !ok() && Date.now() - t0 < limit;) await settle(1); };
const last = states => states.at(-1)?.status;
const png = () => ({ ok: true, status: 200, blob: async () => new Blob(['png bytes'], { type: 'image/png' }) });
const notAvailable = () => ({ ok: false, status: 404, blob: async () => new Blob(['{"error":"Not available"}']) });
// The page's file reads, answered by answer(n) for the nth read. Every URL is recorded: nothing else may be asked.
function files(answer) {
  const urls = [], real = globalThis.fetch, server = { urls, answered: 0, restore: () => { globalThis.fetch = real; } };
  globalThis.fetch = async url => { urls.push(String(url)); try { return await answer(urls.length); } finally { server.answered++; } };
  return server;
}
// The board-saved signal (LearnPage saveBoard dispatches rh:board-saved), as the reader subscribes to it.
const boardSaves = () => { const fns = new Set(); return { onSaved: fn => { fns.add(fn); return () => fns.delete(fn); }, fire: () => [...fns].forEach(fn => fn()), listeners: () => fns.size }; };

test('a generated image whose board reference is not saved yet (404) loads once the board save lands, without a reload', async () => {
  resetUploads(); setFileScope({ app: 'canvas-abcdef12', board: 'main' });
  let registered = false;
  const server = files(() => (registered ? png() : notAvailable()));
  const saves = boardSaves(), states = [];
  try {
    // Long backoff: only the board save can make this read succeed inside the test.
    const cancel = readOriginal(card, state => states.push(state), { waits: Array(6).fill(60000), onSaved: saves.onSaved });
    await until(() => server.answered === 1); await settle(); // the 404 is answered and handled
    assert.deepEqual(states.map(s => s.status), ['loading'], 'still loading after the 404: never "could not be read" in this window');
    registered = true; saves.fire(); // the board PUT answered: the reference row exists now
    await until(() => states.length === 2);
    assert.deepEqual(states.map(s => s.status), ['loading', 'ready']);
    assert.equal(await states[1].blob.text(), 'png bytes');
    assert.deepEqual(server.urls, Array(2).fill(`/api/learn/files/${SRC.id}?app=canvas-abcdef12&board=main`), 'the same scoped read, twice; no other request');
    cancel();
    assert.equal(saves.listeners(), 0, 'the card stops listening when it goes');
  } finally { server.restore(); setFileScope(null); resetUploads(); }
});

test('a board save that lands while the first read is still in flight reads again at once', async () => {
  resetUploads(); setFileScope({ app: 'canvas-abcdef12', board: 'main' });
  let open, registered = false;
  const gate = new Promise(resolve => { open = resolve; });
  const server = files(async n => { if (n === 1) { await gate; return notAvailable(); } return registered ? png() : notAvailable(); });
  const saves = boardSaves(), states = [];
  try {
    readOriginal(card, state => states.push(state), { waits: Array(6).fill(60000), onSaved: saves.onSaved });
    await until(() => server.urls.length === 1); // the first read is in flight
    registered = true; saves.fire(); open(); // the save answered before the 404 for the read it raced came back
    await until(() => states.length === 2);
    assert.deepEqual(states.map(s => s.status), ['loading', 'ready']);
    assert.equal(server.urls.length, 2);
  } finally { server.restore(); setFileScope(null); resetUploads(); }
});

test('a read that fails in transit is tried again with backoff and shows the image', async () => {
  resetUploads(); setFileScope({ app: 'canvas-abcdef12', board: 'main' });
  const server = files(n => { if (n <= 2) throw new TypeError('Failed to fetch'); return png(); });
  const states = [];
  try {
    const cancel = readOriginal(card, state => states.push(state), { waits: [1, 2, 4, 8, 16, 32], onSaved: boardSaves().onSaved });
    await until(() => last(states) === 'ready'); cancel();
    assert.deepEqual(states.map(s => s.status), ['loading', 'ready']);
    assert.equal(server.urls.length, 3);
  } finally { server.restore(); setFileScope(null); resetUploads(); }
});

test('a source that stays missing says so after the bounded retries; Retry reads the same stored file again and nothing else', async () => {
  resetUploads(); setFileScope({ app: 'canvas-abcdef12', board: 'main' });
  let there = false;
  const server = files(() => (there ? png() : notAvailable()));
  const states = [];
  try {
    readOriginal(card, state => states.push(state), { waits: [1, 1, 1], onSaved: boardSaves().onSaved });
    await until(() => last(states) === 'missing');
    assert.deepEqual(states.map(s => s.status), ['loading', 'missing']);
    assert.equal(server.urls.length, 4, 'one read and three retries, then it stops');
    await settle(100); // a negative: nothing more may come, so a bounded wait is the check
    assert.equal(server.urls.length, 4, 'no read after the retries ran out');
    // Retry (the card's button) runs the read again: the existing stored asset only. No image job, no provider, no charge.
    there = true;
    readOriginal(card, state => states.push(state), { waits: [1, 1, 1], onSaved: boardSaves().onSaved });
    await until(() => last(states) === 'ready');
    assert.deepEqual(states.map(s => s.status), ['loading', 'missing', 'loading', 'ready']);
    assert.ok(server.urls.every(url => url.startsWith(`/api/learn/files/${SRC.id}?`)), server.urls.join(' '));
  } finally { server.restore(); setFileScope(null); resetUploads(); }
});

test('a source this page may not read stays unavailable: the same 404, no bytes, no other route', async () => {
  resetUploads(); setFileScope({ share: 'tok-1' });
  const server = files(() => notAvailable());
  const states = [];
  try {
    readOriginal(card, state => states.push(state), { waits: [1, 1], onSaved: boardSaves().onSaved });
    await until(() => last(states) === 'missing');
    assert.deepEqual(states.map(s => [s.status, s.blob]), [['loading', null], ['missing', null]]);
    assert.deepEqual(server.urls, Array(3).fill(`/api/learn/files/${SRC.id}?share=tok-1`), 'read only through the link it was opened with');
  } finally { server.restore(); setFileScope(null); resetUploads(); }
});

test('a late result after the card is deleted, its source replaced or the page left is ignored', async () => {
  const saves = boardSaves(), states = [];
  let finish;
  const cancel = readOriginal(card, state => states.push(state), { load: () => new Promise(resolve => { finish = resolve; }), waits: [1], onSaved: saves.onSaved });
  await settle(1);
  cancel(); finish(new Blob(['late bytes']));
  await settle(5); // a negative: nothing may be published, so a bounded wait is the check
  assert.deepEqual(states.map(s => s.status), ['loading'], 'nothing published after cancel');
  // Cancelled while a retry waits: neither the timer nor a board save reads again.
  let reads = 0;
  const later = readOriginal(card, state => states.push(state), { load: async () => { reads++; return null; }, waits: [60000], onSaved: saves.onSaved }); // the retry timer never fires by itself
  await until(() => reads === 1);
  later(); saves.fire();
  await settle(100); // a negative: nothing more may come, so a bounded wait is the check
  assert.equal(reads, 1);
  assert.equal(saves.listeners(), 0);
});

test('a card with no stored source and no copy here is missing at once, with no retry', async () => {
  let reads = 0;
  const states = [];
  readOriginal({ kind: 'svg', fileRef: { source: null, local: 'import:gone' } }, state => states.push(state), { load: async () => { reads++; return null; }, waits: [1, 1], onSaved: boardSaves().onSaved });
  await until(() => last(states) === 'missing');
  assert.deepEqual([states.map(s => s.status), reads], [['loading', 'missing'], 1]);
});

test('the default retries are bounded and back off', () => {
  assert.ok(READ_WAITS.length >= 4 && READ_WAITS.length <= 8);
  assert.ok(READ_WAITS.every((ms, i) => i === 0 || ms > READ_WAITS[i - 1]), 'each wait longer than the last');
  assert.ok(READ_WAITS.reduce((a, b) => a + b, 0) <= 60000, 'the card gives up within a minute');
});
