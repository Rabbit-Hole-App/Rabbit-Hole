import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/youtube.js';
import { validateShowVideo } from '../src/learn-youtube.js';

const VID = 'Ilg3gGewQ5U';
const video = { videoId: VID, title: 'A lecture', channel: 'A channel', hasCaptions: true, hasPassages: true, duration: null };
// ctx.turn as CORE's research wrapper records it: one find_video_moments result.
const ctx = { item: { id: 'i5' }, turn: { videos: [{ videos: [video], passages: [{ videoId: VID, start: 60, end: 120, text: '' }, { videoId: VID, start: 750, end: 810, text: '' }] }] } };

test('C §5f.2: a planted window outside the passages read is refused', async () => {
  const planted = await validate({ videoId: VID, start: 300, end: 360, reason: 'r', confidence: 0.8 }, ctx);
  assert.match(planted.error, /not in the passages you read/);
});

test('C §5f.2: a 12-minute window is accepted for a section item while the chat bound stays 5 min', async () => {
  const ok = await validate({ videoId: VID, start: 80, end: 800, reason: 'the whole derivation', confidence: 0.8 }, ctx);
  assert.deepEqual(ok.perform, { op: 'video', videoId: VID, title: 'A lecture', channel: 'A channel', start: 80, end: 800 });
  assert.throws(() => validateShowVideo({ videoId: VID, start: 80, end: 800 }, new Map([[VID, video]])), /5s to 5min/);
});
