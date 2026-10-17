import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYBACK, derivativeState, derivativeUrl, findPlayback, requestPlayback, retryPlayback, watchPlayback } from './media-playback.js';
import { setFileScope } from './file-source-client.js';

const fileRef = { v: 1, source: { id: 'fs_0123456789abcdef01234567', rev: 'a'.repeat(64) }, family: 'audio', meta: { name: 'x.m4a' } };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('card states follow what the card holds and the last job status', () => {
  setFileScope({ app: 'canvas-1', board: 'main' });
  assert.deepEqual(derivativeState({ fileRef: { ...fileRef, source: null } }), { state: 'saving' }, 'not stored yet: nothing to convert');
  assert.equal(derivativeState({ fileRef }).state, 'checking');
  assert.deepEqual(derivativeState({ fileRef, checked: true }), { state: 'working', stage: 'Queued' });
  assert.deepEqual(derivativeState({ fileRef, checked: true, writable: false }), { state: 'elsewhere' }, 'a viewer or fork never starts a job');
  assert.deepEqual(derivativeState({ fileRef, job: { state: 'converting' } }), { state: 'working', stage: 'Converting' });
  assert.deepEqual(derivativeState({ fileRef, job: { state: 'failed', error: 'This file format is not supported by the converter.' } }), { state: 'failed', error: 'This file format is not supported by the converter.' });
  assert.equal(derivativeState({ fileRef, job: { state: 'cancelled' } }).state, 'failed');
  assert.equal(derivativeState({ fileRef: { ...fileRef, derivatives: { playback: 'fd_kept' } } }).url, '/api/learn/files/fs_0123456789abcdef01234567/d/fd_kept?app=canvas-1&board=main', 'after reload the card plays its saved derivative, read through its board');
  assert.equal(derivativeUrl(fileRef, 'fd_x', { share: 'tok' }), '/api/learn/files/fs_0123456789abcdef01234567/d/fd_x?share=tok');
  setFileScope(null);
});

test('the request goes through file-jobs-client: converter audio-playback, 128 kbps, the board, one key per card and revision', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return reply({ job: { id: 'fj_9', state: 'queued' } }, 201); };
  const job = await requestPlayback({ fileRef, cardId: 'card-1', fetchImpl, at: { app: 'canvas-1', board: 'main' } });
  assert.equal(job.id, 'fj_9');
  const [url, init] = calls[0];
  assert.equal(url, '/api/learn/files/fs_0123456789abcdef01234567/jobs');
  const body = JSON.parse(init.body);
  assert.deepEqual([body.converter, body.options, body.card, body.app, body.board], ['audio-playback', { bitrate_kbps: 128 }, 'card-1', 'canvas-1', 'main']);
  assert.equal(body.idempotency_key, `card:card-1:audio-playback:${'a'.repeat(16)}`);
  await assert.rejects(requestPlayback({ fileRef, cardId: 'c', fetchImpl: async () => reply({ error: 'Board not found' }, 404), at: { app: 'x' } }), /Board not found/);
});

test('an existing playback copy is found by source revision, converter and options hash, through the page scope', async () => {
  let asked = null;
  const id = await findPlayback(fileRef, { at: { share: 'tok' }, fetchImpl: async url => { asked = new URL(url, 'http://x'); return reply({ derivatives: [{ id: 'fd_probe', kind: 'probe' }, { id: 'fd_play', kind: 'playback' }] }); } });
  assert.equal(id, 'fd_play');
  assert.equal(asked.pathname, '/api/learn/files/sources/fs_0123456789abcdef01234567/derivatives');
  assert.deepEqual([asked.searchParams.get('sha'), asked.searchParams.get('converter'), asked.searchParams.get('share')], ['a'.repeat(64), 'audio-playback', 'tok']);
  assert.match(asked.searchParams.get('options'), /^[0-9a-f]{64}$/);
  assert.equal(await findPlayback(fileRef, { at: null, fetchImpl: async () => reply({}, 404) }), null, 'not readable from here: no copy, never an error');
  assert.deepEqual(PLAYBACK, { converter: 'audio-playback', options: { bitrate_kbps: 128 } });
});

test('watching reads until the job settles and never advances it; retry posts to the retry route', async () => {
  const states = ['queued', 'converting', 'preparing_preview', 'ready'];
  const seen = [], methods = [];
  const fetchImpl = async (url, init = {}) => { methods.push(init.method || 'GET'); return reply({ job: { id: 'fj_9', state: states[seen.length] } }); };
  const job = await watchPlayback({ jobId: 'fj_9', fetchImpl, delays: [0], onUpdate: next => seen.push(next.state), at: null });
  assert.deepEqual(seen, states);
  assert.equal(job.state, 'ready');
  assert.ok(methods.every(method => method === 'GET'));
  const controller = new AbortController(); controller.abort();
  assert.equal(await watchPlayback({ jobId: 'fj_9', fetchImpl, signal: controller.signal }), null, 'an unmounted card stops reading');
  let called = null;
  const again = await retryPlayback({ jobId: 'fj_9', fetchImpl: async (url, init) => { called = [url, init.method]; return reply({ job: { id: 'fj_9', state: 'queued' } }); } });
  assert.deepEqual(called, ['/api/learn/files/jobs/fj_9/retry', 'POST']);
  assert.equal(again.state, 'queued');
});
