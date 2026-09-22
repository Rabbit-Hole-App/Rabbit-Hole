import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RETRY_AFTER, readMomentRecord, negativeFresh, writeNegative, writeIndexed, guardedCaptions } from '../src/learn-moment-index.js';
import { findVideoMoments } from '../src/learn-youtube.js';

const bucket = () => {
  const store = new Map();
  return {
    store,
    get: async key => { const hit = store.get(key); return hit && { json: async () => JSON.parse(hit) }; },
    put: async (key, body) => store.set(key, body),
  };
};
const VID = 'Ilg3gGewQ5U';

test('a failed fetch writes its reason; a fresh negative skips the next fetch', async () => {
  const env = { RUNS: bucket() };
  let fetches = 0;
  const captions = guardedCaptions(env, async () => { fetches++; return { lines: null, reason: 'no-track' }; });
  assert.equal((await captions(VID)).reason, 'no-track');
  assert.equal(fetches, 1);
  const again = await captions(VID);
  assert.equal(again.reason, 'no-track');
  assert.equal(again.cached, true, 'answered from the record');
  assert.equal(fetches, 1, 'no second probe');
  const record = await readMomentRecord(env, VID);
  assert.equal(record.videoId, VID);
  assert.ok(record.checkedAt);
});

test('expiry is per reason: rate limits retry in hours, no captions in weeks', () => {
  const base = Date.parse('2026-09-22T00:00:00Z');
  const record = reason => ({ reason, checkedAt: new Date(base).toISOString() });
  assert.equal(negativeFresh(record('rate-limited'), base + 2 * 3600e3), true);
  assert.equal(negativeFresh(record('rate-limited'), base + 4 * 3600e3), false);
  assert.equal(negativeFresh(record('no-track'), base + 20 * 86400e3), true);
  assert.equal(negativeFresh(record('no-track'), base + 22 * 86400e3), false);
  assert.equal(negativeFresh(record('deleted'), base + 300 * 86400e3), true);
  assert.equal(negativeFresh({ reason: null, checkedAt: new Date(base).toISOString() }, base), false, 'a success record never blocks');
  assert.equal(negativeFresh(null, base), false);
  assert.ok(RETRY_AFTER.blocked < RETRY_AFTER['no-track']);
});

test('an expired negative is absent: the video is probed again', async () => {
  const env = { RUNS: bucket() };
  const past = Date.now() - 22 * 86400e3;
  await writeNegative(env, VID, 'no-track', past);
  let fetches = 0;
  const captions = guardedCaptions(env, async () => { fetches++; return { lines: [{ start: 0, duration: 2, text: 'hi' }], kind: 'manual', language: 'en', duration: 60, title: 'T' }; });
  const outcome = await captions(VID);
  assert.equal(fetches, 1);
  assert.ok(outcome.lines);
});

test('the ledger half survives a later negative, so pruning can still reconstruct ids', async () => {
  const env = { RUNS: bucket() };
  await writeIndexed(env, VID, { cut: 1, starts: [0, 30, 60] });
  await writeNegative(env, VID, 'deleted');
  const record = await readMomentRecord(env, VID);
  assert.equal(record.reason, 'deleted');
  assert.deepEqual(record.starts, [0, 30, 60]);
  assert.equal(record.cut, 1);
  assert.ok(record.indexedAt);
});

test('without R2 the guard is a plain pass-through', async () => {
  let fetches = 0;
  const plain = async () => { fetches++; return { lines: null, reason: 'blocked' }; };
  const captions = guardedCaptions({}, plain);
  assert.equal(captions, plain);
  await captions(VID); await captions(VID);
  assert.equal(fetches, 2);
});

test('a malformed video id never becomes an R2 key', async () => {
  const env = { RUNS: bucket() };
  assert.equal(await readMomentRecord(env, '../secrets'), null);
  await writeNegative(env, '../secrets', 'blocked');
  assert.equal(env.RUNS.store.size, 0);
});

test('findVideoMoments consults the record before fetching', async () => {
  const env = { RUNS: bucket() };
  await writeNegative(env, VID, 'no-track');
  let fetches = 0;
  const result = await findVideoMoments('backprop', env, {
    search: async () => [{ videoId: VID, title: 'Backprop', channel: '3Blue1Brown' }],
    captions: async () => { fetches++; return { lines: null, reason: 'no-track' }; },
  });
  assert.equal(fetches, 0, 'the fresh negative answered');
  assert.equal(result.videos[0].hasCaptions, false);
  assert.equal(result.videos[0].captionNote, 'no-track');
});

test('pruning reconstructs vector ids from the ledger and flips the record to deleted', async () => {
  const { vectorIds, pruneVideo } = await import('../src/learn-moment-index.js');
  const env = { RUNS: bucket(), MOMENTS: { deleted: null, deleteByIds: async ids => { env.MOMENTS.deleted = ids; } } };
  await writeIndexed(env, VID, { cut: 1, starts: [0, 30] });
  const before = await readMomentRecord(env, VID);
  assert.deepEqual(vectorIds(before), [`${VID}:1:0`, `${VID}:1:30`]);
  const result = await pruneVideo(env, VID);
  assert.equal(result.pruned, 2);
  assert.deepEqual(env.MOMENTS.deleted, [`${VID}:1:0`, `${VID}:1:30`]);
  const after = await readMomentRecord(env, VID);
  assert.equal(after.reason, 'deleted');
  assert.deepEqual(after.starts, [0, 30], 'the ledger survives for a retried delete');
});

test('pruning an unindexed video still writes the deleted record, without a vector call', async () => {
  const { pruneVideo } = await import('../src/learn-moment-index.js');
  const env = { RUNS: bucket() };
  const result = await pruneVideo(env, VID);
  assert.equal(result.pruned, 0);
  assert.equal((await readMomentRecord(env, VID)).reason, 'deleted');
});

// --- step 4: consumer + producer ---
const aiEnv = () => {
  const env = {
    RUNS: bucket(),
    AI: { calls: [], run: async (model, { text }) => { env.AI.calls.push({ model, count: text.length }); return { data: text.map(() => [0.1, 0.2, 0.3]) }; } },
    MOMENTS: { rows: null, upsert: async rows => { env.MOMENTS.rows = rows; } },
  };
  return env;
};
const LINES = Array.from({ length: 240 }, (_, at) => ({ start: at * 2, duration: 2, text: `line ${at} about backprop` }));
const CAPTIONS = async () => ({ lines: LINES, kind: 'manual', language: 'en', duration: 480, title: 'Backprop' });

test('indexVideo embeds every window in batches and upserts versioned rows', async () => {
  const env = aiEnv();
  const result = await import('../src/learn-moment-index.js').then(m => m.indexVideo(VID, env, { captions: CAPTIONS, now: () => Date.parse('2026-09-22T12:00:00Z') }));
  assert.ok(result.indexed > 1);
  assert.equal(env.MOMENTS.rows.length, result.indexed);
  const row = env.MOMENTS.rows[0];
  assert.equal(row.id, `${VID}:1:0`);
  assert.equal(row.namespace, 'windows');
  assert.deepEqual(Object.keys(row.metadata).sort(), ['captionKind', 'captionLanguage', 'cut', 'embeddingModel', 'end', 'indexedAt', 'start', 'videoId']);
  assert.equal(row.metadata.embeddingModel, '@cf/baai/bge-m3');
  assert.ok(env.AI.calls.every(call => call.count <= 50), JSON.stringify(env.AI.calls));
  const record = await readMomentRecord(env, VID);
  assert.equal(record.cut, 1);
  assert.equal(record.starts.length, result.indexed);
  assert.equal(record.reason, null);
});

test('an indexed video is not re-embedded; a fresh negative is not probed', async () => {
  const env = aiEnv();
  const { indexVideo } = await import('../src/learn-moment-index.js');
  await indexVideo(VID, env, { captions: CAPTIONS });
  const calls = env.AI.calls.length;
  assert.equal((await indexVideo(VID, env, { captions: CAPTIONS })).skipped, 'indexed');
  assert.equal(env.AI.calls.length, calls);
  await writeNegative(env, 'FaHHWdsIYQg', 'no-track');
  assert.equal((await indexVideo('FaHHWdsIYQg', env, { captions: CAPTIONS })).skipped, 'no-track');
});

test('without bindings indexing declines instead of failing', async () => {
  const { indexVideo } = await import('../src/learn-moment-index.js');
  assert.equal((await indexVideo(VID, { RUNS: bucket() }, { captions: CAPTIONS })).skipped, 'no-bindings');
});

test('a poison message retries alone; its batchmates ack', async () => {
  const env = aiEnv();
  const { consumeIndexQueue } = await import('../src/learn-moment-index.js');
  const outcomes = [];
  const message = (videoId, poison = false) => ({ body: { videoId }, ack: () => outcomes.push(`ack:${videoId}`), retry: () => outcomes.push(`retry:${videoId}`) });
  const captions = async videoId => { if (videoId === 'FaHHWdsIYQg') throw new Error('boom'); return CAPTIONS(); };
  await consumeIndexQueue({ messages: [message(VID), message('FaHHWdsIYQg'), message('aircAruvnKk')] }, env, { captions });
  assert.deepEqual(outcomes, [`ack:${VID}`, 'retry:FaHHWdsIYQg', 'ack:aircAruvnKk']);
});

test('a cold answer enqueues captioned candidates, skipping the already indexed', async () => {
  const env = aiEnv();
  const { indexVideo, enqueueForIndex } = await import('../src/learn-moment-index.js');
  await indexVideo(VID, env, { captions: CAPTIONS });
  env.INDEX_QUEUE = { sent: [], send: async body => env.INDEX_QUEUE.sent.push(body) };
  const sent = await enqueueForIndex(env, [
    { videoId: VID, hasCaptions: true },
    { videoId: 'FaHHWdsIYQg', hasCaptions: true },
    { videoId: 'aircAruvnKk', hasCaptions: false },
  ]);
  assert.equal(sent, 1);
  assert.deepEqual(env.INDEX_QUEUE.sent, [{ videoId: 'FaHHWdsIYQg' }]);
});
