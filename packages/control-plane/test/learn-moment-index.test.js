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
