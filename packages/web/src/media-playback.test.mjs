import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeState, playbackKey, requestPlayback, retryPlayback, watchPlayback } from './media-playback.js';

const fileRef = { v: 1, source: { id: 'fs_0123456789abcdef01234567', rev: 'a'.repeat(64) }, family: 'audio', meta: { name: 'x.m4a' } };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('card states follow what the card holds and the last job status', () => {
  assert.deepEqual(derivativeState({ fileRef: null, job: null }), { state: 'awaiting-converter' }, 'no stored source: nothing can be converted yet');
  assert.equal(derivativeState({ fileRef, job: null }).state, 'requesting');
  assert.equal(derivativeState({ fileRef: { ...fileRef, job: 'fj_1' }, job: null }).state, 'working');
  assert.deepEqual(derivativeState({ fileRef, job: { state: 'converting', stage: 'converting' } }), { state: 'working', stage: 'converting' });
  const ready = derivativeState({ fileRef, job: { state: 'ready', derivatives: [{ id: 'fd_probe', kind: 'probe' }, { id: 'fd_play', kind: 'playback' }] } });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.url, '/api/learn/files/fs_0123456789abcdef01234567/d/fd_play');
  assert.equal(derivativeState({ fileRef, job: { state: 'ready_with_limitations', derivative_ids: ['fd_only'] } }).derivative, 'fd_only');
  assert.equal(derivativeState({ fileRef, job: { state: 'ready', derivatives: [] } }).state, 'failed', 'ready without a playback file is not a success');
  assert.deepEqual(derivativeState({ fileRef, job: { state: 'failed', error: 'unsupported_format' } }), { state: 'failed', error: 'unsupported_format' });
  assert.equal(derivativeState({ fileRef, job: { state: 'cancelled' } }).state, 'failed');
  assert.equal(derivativeState({ fileRef: { ...fileRef, derivatives: { playback: 'fd_kept' } }, job: null }).url, '/api/learn/files/fs_0123456789abcdef01234567/d/fd_kept', 'after reload the card plays its saved derivative');
});

test('the request goes to the control plane job route, idempotent per source revision and options', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return reply({ job: { id: 'fj_9', state: 'queued' } }, 202); };
  const { id } = await requestPlayback({ fileRef, cardId: 'card-1', fetchImpl });
  assert.equal(id, 'fj_9');
  const [url, init] = calls[0];
  assert.equal(url, '/api/learn/files/fs_0123456789abcdef01234567/jobs');
  assert.equal(init.method, 'POST');
  const body = JSON.parse(init.body);
  assert.deepEqual([body.converter, body.options, body.card], ['audio-playback', { bitrate_kbps: 128 }, 'card-1']);
  assert.equal(body.idempotency_key, playbackKey(fileRef));
  assert.equal(playbackKey(fileRef), `audio-playback:${'a'.repeat(64)}:128`, 'a second card or a retry after reload reuses the same job');
  await assert.rejects(requestPlayback({ fileRef, cardId: 'c', fetchImpl: async () => reply({ error: 'You cannot edit this board.' }, 403) }), /You cannot edit this board\./);
});

test('watching reads until the job settles and never advances it', async () => {
  const states = ['queued', 'converting', 'preparing_preview', 'ready'];
  const seen = [], methods = [];
  const fetchImpl = async (url, init = {}) => { methods.push(init.method || 'GET'); return reply({ job: { id: 'fj_9', state: states[seen.length], derivatives: [{ id: 'fd_p', kind: 'playback' }] } }); };
  const job = await watchPlayback({ jobId: 'fj_9', fetchImpl, delays: [0], onUpdate: next => seen.push(next.state) });
  assert.deepEqual(seen, states);
  assert.equal(job.state, 'ready');
  assert.ok(methods.every(method => method === 'GET'));
  const controller = new AbortController(); controller.abort();
  assert.equal(await watchPlayback({ jobId: 'fj_9', fetchImpl, signal: controller.signal }), null, 'an unmounted card stops reading');
});

test('retry posts to the job retry route', async () => {
  let called = null;
  const job = await retryPlayback({ jobId: 'fj_9', fetchImpl: async (url, init) => { called = [url, init.method]; return reply({ id: 'fj_9', state: 'queued' }); } });
  assert.deepEqual(called, ['/api/learn/files/jobs/fj_9/retry', 'POST']);
  assert.equal(job.state, 'queued');
});
