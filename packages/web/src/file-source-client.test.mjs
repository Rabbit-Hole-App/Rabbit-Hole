// The shared file-source client (file-source-client.js; canvas-file-imports.md sections 3 and 4.2): upload with a sha256 and
// byte progress, reuse of stored bytes, a board not saved yet, failures with Retry, and reading a card's original by fileRef
// through the page's scope, or by an older card's assetKey. No network: fetch and XMLHttpRequest are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canWrite, loadSource, resetUploads, scopeQuery, setFileScope, sha256Hex, startUpload, uploadSource, uploadState, watchUpload } from './file-source-client.js';
import { fitBytes, lineUnits } from './file-text-units.js';

const file = (text = 'id,name\n00123,Zoë\n', name = 'a.csv') => new File([text], name, { type: 'text/csv' });
const sha = text => createHash('sha256').update(text).digest('hex');
const ok = body => ({ status: 200, ok: true, json: async () => body });
// An XMLHttpRequest stand-in: reports progress in two steps, then answers `answer(body)`.
const xhrFor = answer => class {
  constructor() { this.upload = {}; this.headers = {}; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  send(body) {
    const size = body.size;
    queueMicrotask(async () => {
      this.upload.onprogress?.({ loaded: Math.floor(size / 2), total: size, lengthComputable: true });
      this.upload.onprogress?.({ loaded: size, total: size, lengthComputable: true });
      const { status, body: out } = await answer(this, body);
      this.status = status; this.responseText = JSON.stringify(out);
      this.onload();
    });
  }
};

test('the scope a page reads through, and only the owner canvas writes', () => {
  assert.equal(scopeQuery({ app: 'canvas-1', board: 'main' }), '?app=canvas-1&board=main');
  assert.equal(scopeQuery({ share: 'tok en' }), '?share=tok%20en');
  assert.equal(scopeQuery({ member: '42' }), '?member=42');
  assert.equal(scopeQuery(null), '');
  assert.deepEqual([canWrite({ app: 'a' }), canWrite({ share: 't' }), canWrite({ member: '1' }), canWrite(null)], [true, false, false, false]);
});

test('uploadSource hashes, declares, sends the bytes with progress and returns the stored revision', async () => {
  const f = file(), calls = [], progress = [];
  const fetchImpl = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { status: 201, json: async () => ({ source: { id: 'fs_000000000000000000000001', rev: 'pending' }, upload: { method: 'PUT', url: '/api/learn/files/fs_000000000000000000000001' } }) }; };
  const Request = xhrFor(async (xhr, body) => ({ status: 200, body: { source: { id: 'fs_000000000000000000000001', rev: sha(await body.text()), status: 'stored' } } }));
  const { source } = await uploadSource(f, { app: 'canvas-1', board: 'main', family: 'delimited', fetchImpl, Request, onProgress: p => progress.push(p) });
  assert.equal(await sha256Hex(f), sha('id,name\n00123,Zoë\n'));
  assert.deepEqual(calls, [['/api/learn/files', { app: 'canvas-1', board: 'main', name: 'a.csv', type: 'text/csv', size: f.size, sha256: sha('id,name\n00123,Zoë\n'), family: 'delimited' }]]);
  assert.deepEqual([source.id, source.rev], ['fs_000000000000000000000001', sha('id,name\n00123,Zoë\n')]);
  assert.deepEqual(progress.map(p => p.stage), ['hashing', 'uploading', 'uploading', 'sent']);
  assert.equal(progress[1].sent, Math.floor(f.size / 2), 'byte progress');
});

test('stored identical bytes are not sent again; refusals and a lost connection are visible reasons', async () => {
  const reused = await uploadSource(file(), { app: 'a', family: 'text', fetchImpl: async () => ok({ source: { id: 'fs_000000000000000000000002', rev: 'r' }, upload: null }), Request: xhrFor(() => { throw Error('must not send'); }) });
  assert.equal(reused.source.id, 'fs_000000000000000000000002');
  await assert.rejects(uploadSource(file(), { app: 'a', family: 'text', fetchImpl: async () => ({ status: 413, json: async () => ({ error: 'This file is over 25 MiB, the limit for table files.' }) }) }),
    error => error.message === 'This file is over 25 MiB, the limit for table files.' && error.retryable === false);
  await assert.rejects(uploadSource(file(), { app: 'a', family: 'text', fetchImpl: async () => { throw TypeError('offline'); } }), error => /Check the connection and retry/.test(error.message) && error.retryable);
  await assert.rejects(uploadSource(file(), { app: 'a', family: 'text', fetchImpl: async () => ({ status: 404, json: async () => ({ error: 'Save this board first.' }) }) }), error => error.boardNotSaved === true);
  const mismatch = xhrFor(async () => ({ status: 400, body: { error: 'These bytes do not match the sha256 this upload declared.' } }));
  await assert.rejects(uploadSource(file(), { app: 'a', family: 'text', fetchImpl: async () => ok({ source: { id: 'fs_000000000000000000000003' }, upload: { url: '/x' } }), Request: mismatch }), /do not match/);
});

test('startUpload: one upload per local key, waits for a board not saved yet, and Retry runs a failed one again', async () => {
  resetUploads();
  const at = { app: 'canvas-1', board: 'main' };
  let creates = 0, fail = true;
  const fetchImpl = async () => { creates++; if (creates === 1) return { status: 404, json: async () => ({ error: 'Save this board first.' }) }; if (fail) return { status: 500, json: async () => ({ error: 'Server error' }) }; return ok({ source: { id: 'fs_000000000000000000000004', rev: 'r4' }, upload: null }); };
  const seen = [];
  const unwatch = watchUpload('import:1', state => seen.push(state.stage));
  const settled = () => new Promise(resolve => { const off = watchUpload('import:1', s => { if (s.stage === 'stored' || s.stage === 'failed') { off(); resolve(s); } }); });
  let done = settled();
  startUpload('import:1', { family: 'delimited', file: file(), at, fetchImpl, wait: async () => {} });
  assert.equal(startUpload('import:1', { family: 'delimited', file: file(), at, fetchImpl }).stage !== 'failed', true, 'a second start joins the running one');
  const failed = await done;
  assert.deepEqual([failed.stage, failed.error, failed.retryable, creates], ['failed', 'Server error', true, 2], 'waited once for the board, then failed visibly');
  fail = false;
  done = settled();
  startUpload('import:1', { family: 'delimited', file: file(), at, fetchImpl });
  const stored = await done;
  assert.deepEqual([stored.stage, stored.source.id], ['stored', 'fs_000000000000000000000004']);
  assert.deepEqual(uploadState('import:1').source, { id: 'fs_000000000000000000000004', rev: 'r4' });
  assert.ok(seen.includes('waiting') && seen.includes('failed') && seen.at(-1) === 'stored');
  unwatch();
  resetUploads();
  done = new Promise(resolve => watchUpload('import:2', s => { if (s.stage === 'failed') resolve(s); }));
  startUpload('import:2', { family: 'delimited', at: { share: 'x' }, file: file(), fetchImpl });
  assert.match((await done).error, /Only the canvas owner can save files here/, 'a link page never uploads');
  done = new Promise(resolve => watchUpload('import:3', s => { if (s.stage === 'failed') resolve(s); }));
  startUpload('import:3', { family: 'delimited', at });
  const gone = await done;
  assert.deepEqual([/never saved/.test(gone.error), gone.retryable], [true, false], 'no local copy after a reload: said, no Retry');
});

test('loadSource: a stored fileRef reads through the page scope; an older card reads its board file', async () => {
  resetUploads();
  const urls = [];
  const fetchImpl = async url => { urls.push(url); return { ok: true, blob: async () => new Blob(['bytes']) }; };
  setFileScope({ member: '7' });
  const blob = await loadSource({ fileRef: { source: { id: 'fs_000000000000000000000005', rev: 'r5' } } }, { fetchImpl });
  assert.equal(await blob.text(), 'bytes');
  assert.deepEqual(urls, ['/api/learn/files/fs_000000000000000000000005?member=7']);
  setFileScope(null);
  assert.equal(await loadSource({ fileRef: { source: null } }, { fetchImpl }), null, 'not stored and no local copy here');
  assert.equal(await loadSource({ type: 'file' }, { fetchImpl }), null);
  assert.equal(urls.length, 1, 'nothing read for a card with no source');
});

test('the extracted text fits the 2 MiB route, saying what was left out', () => {
  const text = Array.from({ length: 40000 }, (_, i) => `line ${i} ${'x'.repeat(60)}`).join('\n');
  const body = fitBytes(lineUnits(text));
  assert.ok(new TextEncoder().encode(JSON.stringify(body)).byteLength <= 2 * 1024 * 1024);
  assert.equal(body.complete, false);
  assert.match(body.limited, /^lines 1-\d+ \(2 MiB extraction limit\)$/);
  const small = lineUnits('a\nb');
  assert.equal(fitBytes(small), small, 'a body that fits is unchanged');
});
