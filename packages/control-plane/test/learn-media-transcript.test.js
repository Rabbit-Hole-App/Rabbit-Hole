import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { TRANSCRIBE_MAX_SECONDS, transcribeEstimate, transcribeSeconds, transcribeUsagePrice } from '../src/learn-paid-transport.js';
import { admitSpend } from '../src/learn-spend-ledger.js';
import { priceUsage } from '../src/pricing-registry.js';
import { withSystemUsage } from '../src/learn-usage.js';
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

test('openaiTranscriber: off unless enabled; names the real container and asks for logprobs', async () => {
  assert.equal(openaiTranscriber({ OPENAI_API_KEY: 'k' }), null);
  assert.equal(openaiTranscriber({ TRANSCRIBE_ENABLED: 'true' }), null);
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return Response.json({ text: 'hi' }); };
  const tx = openaiTranscriber({ OPENAI_API_KEY: 'k', TRANSCRIBE_ENABLED: 'true', SMALL_ENV: 'test' }, { fetchImpl });
  assert.deepEqual([tx.provider, tx.model], ['openai', 'gpt-4o-transcribe']);
  assert.deepEqual(await tx.transcribe({ bytes: AUDIO, mime: 'audio/mp4;codecs=mp4a.40.2' }), { text: 'hi' });
  const form = sent[0].init.body;
  assert.equal(form.get('file').name, 'voice-note.m4a');
  assert.equal(form.get('model'), 'gpt-4o-transcribe');
  assert.deepEqual(form.getAll('include[]'), ['logprobs']);
});

// The priced admission (learn-paid-transport.js transcribeSpendTransport) on a real ledger schema.
const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
function ledger(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(sql(name));
  const LEARN_DB = { prepare: text => { let args = []; const statement = sqlite.prepare(text); return { bind(...values) { args = values; return this; },
    first: async () => statement.get(...args) || null, all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: { changes: statement.run(...args).changes } }),
    runNow: () => ({ meta: { changes: statement.run(...args).changes } }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.runNow()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, LEARN_DB };
}
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));

test('transcription is admitted at the two-minute bound and settled at the reported token usage; a failure keeps it unknown', async t => {
  const { sqlite, LEARN_DB } = ledger(t);
  const env = withSystemUsage({ LEARN_DB, USAGE_PLATFORM_DAY_USD: '1', OPENAI_API_KEY: 'k', TRANSCRIBE_ENABLED: 'true' }, 'explain_back');
  const usage = { type: 'tokens', input_tokens: 330, output_tokens: 80, input_token_details: { audio_tokens: 320, text_tokens: 10 } };
  const replies = [Response.json({ text: 'the bob swings', usage }), Response.json({ text: 'no usage' }), new Response('no', { status: 500 })];
  let calls = 0;
  const tx = openaiTranscriber(env, { fetchImpl: async () => { calls++; return replies.shift(); } });
  assert.equal((await tx.transcribe({ bytes: AUDIO, mime: 'audio/webm' })).text, 'the bob swings');
  await tx.transcribe({ bytes: AUDIO, mime: 'audio/webm' });
  await assert.rejects(tx.transcribe({ bytes: AUDIO, mime: 'audio/webm' }), error => error.code === 'provider_failed');
  const reserve = transcribeEstimate('gpt-4o-transcribe', AUDIO.byteLength).micros;
  assert.equal(reserve, (TRANSCRIBE_MAX_SECONDS / 60) * 6000, 'a short clip reserves two minutes at $0.006 a minute');
  assert.equal(transcribeSeconds(240_000), 120, '240 kB at 16 kbps is two minutes');
  assert.equal(transcribeSeconds(2_000_000), 1000, 'a 2 MB clip could be 1000 s at 16 kbps: it reserves that, not two minutes');
  assert.equal(transcribeEstimate('gpt-4o-transcribe', 2_000_000).micros, 100_000);
  const tokens = priceUsage({ provider: 'openai', model: 'gpt-4o-transcribe', quantities: { input: 330, output: 80 } }).micros;
  assert.equal(tokens, 1625, '330 x $2.50 + 80 x $10 per million');
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.provider, a.model, a.reserved_micros, a.cost_micros, a.cost_state, a.status]), [
    ['openai', 'gpt-4o-transcribe', reserve, tokens, 'settled', 'settled'],
    ['openai', 'gpt-4o-transcribe', reserve, reserve, 'settled', 'settled'],
    ['openai', 'gpt-4o-transcribe', reserve, null, 'unknown', 'failed'],
  ]);
  assert.equal(calls, 3);
  // A forged long clip: the stored bytes, not the recorder, size the reservation, so its real usage stays within it.
  const big = new Uint8Array(1_200_000);
  await openaiTranscriber(env, { fetchImpl: async () => Response.json({ text: 'long', usage: { type: 'tokens', input_tokens: 6000, output_tokens: 1500 } }) }).transcribe({ bytes: big, mime: 'audio/webm' });
  const last = rows(sqlite, 'usage_attempts').at(-1);
  assert.deepEqual([last.reserved_micros, last.cost_micros], [transcribeEstimate('gpt-4o-transcribe', big.byteLength).micros, 30_000]);
  assert.ok(last.cost_micros <= last.reserved_micros);
  assert.equal(rows(sqlite, 'usage_operations').filter(o => o.error === 'spend_bound_exceeded').length, 0, 'never trips the platform guard');
  assert.deepEqual(transcribeUsagePrice('gpt-transcribe', { type: 'duration', seconds: 30 }).micros, 2250, 'gpt-transcribe settles per second of audio');
  assert.equal(transcribeUsagePrice('gpt-transcribe', { type: 'tokens', input_tokens: 5, output_tokens: 5 }), null, 'no token rows: the estimate stands');
});

test('at the daily cap transcription is refused before any call, and ensureTranscript does not record the refusal', async t => {
  const { LEARN_DB } = ledger(t);
  const env = withSystemUsage({ LEARN_DB, USAGE_PLATFORM_DAY_USD: '0.01', OPENAI_API_KEY: 'k', TRANSCRIBE_ENABLED: 'true' }, 'explain_back');
  await admitSpend(LEARN_DB, env, { opId: 'full', userId: 'fixture', org: 'platform', category: 'fixture', reservedUsd: 0.01 });
  let calls = 0;
  const transcriber = openaiTranscriber(env, { fetchImpl: async () => { calls++; return Response.json({ text: 'x' }); } });
  await assert.rejects(transcriber.transcribe({ bytes: AUDIO, mime: 'audio/ogg' }), error => error.code === 'daily_cap_reached' && error.spendRefused);
  const store = memoryStore();
  const record = await ensureTranscript({ assetId: 'aa_voice00000001', hash: HASH, mime: 'audio/ogg', read, store, transcriber, now: at });
  assert.deepEqual([record.status, record.error], ['failed', 'daily_cap_reached']);
  assert.equal(store.rows.size, 0, 'a refusal made no call, so the next preparation tries again');
  assert.equal(calls, 0);
  const unset = openaiTranscriber({ ...env, USAGE_PLATFORM_DAY_USD: '' }, { fetchImpl: async () => { calls++; return Response.json({}); } });
  await assert.rejects(unset.transcribe({ bytes: AUDIO, mime: 'audio/ogg' }), error => error.code === 'cap_unset');
  assert.equal(calls, 0);
});
