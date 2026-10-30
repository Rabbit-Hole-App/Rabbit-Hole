import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRANSCRIPT_VERSION, ensureTranscript, openaiTranscriber, transcriptIdFor, transcriptParts } from '../src/learn-media.js';

const AUDIO = new TextEncoder().encode('OggS fake opus voice note');
const HASH = createHash('sha256').update(AUDIO).digest('hex');
const memoryStore = () => { const rows = new Map(); return { rows, get: async id => rows.get(id) ?? null, put: async record => { rows.set(record.transcriptId, structuredClone(record)); } }; };
const fakeTranscriber = (answers) => {
  const calls = [];
  return { calls, provider: 'openai', model: 'gpt-4o-transcribe', transcribe: async audio => { calls.push(audio); const next = answers.shift(); if (next instanceof Error) throw next; return next; } };
};
const read = () => ({ bytes: AUDIO });
const at = () => '2026-10-30T09:00:00.000Z';

test('a ready transcript is separate, immutable and reused by audio hash: the provider is called once', async () => {
  const store = memoryStore();
  const transcriber = fakeTranscriber([{ text: ' the bob swings back ', logprobs: [{ token: 'the', logprob: -0.01 }, { token: ' bob', logprob: -1.2 }] }]);
  const first = await ensureTranscript({ assetId: 'aa_voice00000001', hash: HASH, mime: 'audio/ogg', read, store, transcriber, now: at });
  assert.deepEqual(Object.keys(first).sort(), ['assetId', 'converterVersion', 'createdAt', 'derivativeHash', 'hash', 'model', 'provider', 'status', 'text', 'transcriptId', 'uncertainty', 'version']);
  assert.deepEqual([first.status, first.text, first.assetId, first.hash, first.version], ['ready', 'the bob swings back', 'aa_voice00000001', HASH, TRANSCRIPT_VERSION]);
  assert.equal(first.transcriptId, transcriptIdFor(HASH, 'openai', 'gpt-4o-transcribe'));
  assert.equal(first.converterVersion, 'openai:gpt-4o-transcribe:v1');
  assert.match(first.derivativeHash, /^[0-9a-f]{64}$/);
  assert.equal(first.segments, undefined, 'no provider timing, none invented');
  assert.deepEqual(first.uncertainty.low, [{ text: ' bob', p: 0.301 }]);
  // Same clip on a revision (another asset id) or a reassessment, even with retry: no second call, same record.
  const again = await ensureTranscript({ assetId: 'aa_voice00000002', hash: HASH, read, store, transcriber, retry: true, now: at });
  assert.deepEqual(again, first);
  assert.equal(transcriber.calls.length, 1);
  assert.equal(transcriber.calls[0].mime, 'audio/ogg');
});

test('failure keeps a failed record without retrying on its own; only an explicit retry calls again', async () => {
  const store = memoryStore();
  const transcriber = fakeTranscriber([Object.assign(new Error('503'), { code: 'provider_failed' }), { text: 'force points inward' }]);
  const failed = await ensureTranscript({ assetId: 'aa_voice00000001', hash: HASH, read, store, transcriber, now: at });
  assert.deepEqual([failed.status, failed.error, failed.text], ['failed', 'provider_failed', '']);
  assert.equal((await ensureTranscript({ assetId: 'aa_voice00000001', hash: HASH, read, store, transcriber, now: at })).status, 'failed');
  assert.equal(transcriber.calls.length, 1, 'no automatic second paid call');
  const retried = await ensureTranscript({ assetId: 'aa_voice00000001', hash: HASH, read, store, transcriber, retry: true, now: at });
  assert.deepEqual([retried.status, retried.text], ['ready', 'force points inward']);
  assert.equal(transcriber.calls.length, 2);
});

test('not configured, unreadable, mismatched or silent audio yields an honest failed status and no call', async () => {
  const store = memoryStore();
  assert.deepEqual(await ensureTranscript({ assetId: 'aa_x00000001', hash: HASH, read, store, transcriber: null, now: at }).then(r => [r.status, r.error]), ['failed', 'not_configured']);
  assert.equal(store.rows.size, 0, 'not configured is not stored: it runs once transcription is on');
  const transcriber = fakeTranscriber([{ text: '   ' }]);
  assert.equal((await ensureTranscript({ assetId: 'aa_x00000001', hash: HASH, read: () => ({ bytes: new Uint8Array(0) }), store, transcriber, now: at })).error, 'audio_unavailable');
  assert.equal((await ensureTranscript({ assetId: 'aa_x00000001', hash: HASH, read: () => ({ bytes: new Uint8Array([1, 2]) }), store, transcriber, now: at })).error, 'hash_mismatch');
  assert.equal(transcriber.calls.length, 0);
  assert.equal((await ensureTranscript({ assetId: 'aa_x00000001', hash: HASH, read, store, transcriber, now: at })).error, 'no_speech');
  await assert.rejects(ensureTranscript({ assetId: 'aa_x', hash: 'nothex', read, store, transcriber }), /sha256/);
});

test('segments are kept only when the provider returns timing', () => {
  assert.deepEqual(transcriptParts({ text: 'a b', segments: [{ start: 0, end: 1.5, text: ' a ' }, { start: 'x', end: 2 }] }), { text: 'a b', segments: [{ start: 0, end: 1.5, text: 'a' }] });
  assert.deepEqual(transcriptParts({ text: 'a' }), { text: 'a' });
});

test('openaiTranscriber: off unless enabled; names the real container; admission and spend recording wrap the call', async () => {
  assert.equal(openaiTranscriber({ OPENAI_API_KEY: 'k' }), null);
  assert.equal(openaiTranscriber({ TRANSCRIBE_ENABLED: 'true' }), null);
  const sent = [], logged = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return new Response(JSON.stringify({ text: 'hi' }), { status: 200 }); };
  const tx = openaiTranscriber({ OPENAI_API_KEY: 'k', TRANSCRIBE_ENABLED: 'true' }, { fetchImpl, record: async entry => logged.push(entry) });
  assert.deepEqual([tx.provider, tx.model], ['openai', 'gpt-4o-transcribe']);
  assert.deepEqual(await tx.transcribe({ bytes: AUDIO, mime: 'audio/mp4;codecs=mp4a.40.2' }), { text: 'hi' });
  const form = sent[0].init.body;
  assert.equal(form.get('file').name, 'voice-note.m4a');
  assert.equal(form.get('model'), 'gpt-4o-transcribe');
  assert.deepEqual(form.getAll('include[]'), ['logprobs']);
  assert.deepEqual(logged, [{ ok: true, model: 'gpt-4o-transcribe' }]);
  const refused = openaiTranscriber({ OPENAI_API_KEY: 'k', TRANSCRIBE_ENABLED: 'true' }, { fetchImpl, admit: async () => new Response('', { status: 402 }) });
  await assert.rejects(refused.transcribe({ bytes: AUDIO, mime: 'audio/webm' }), error => error.code === 'spend_refused');
  assert.equal(sent.length, 1, 'a refused admission makes no call');
});
