// Fish streaming playback, measured locally (docs/features/voice-tutor-mvp.md §4): the real createFishTts in
// Chromium against a local server that plays the Fish role with a real narrator MP3. No paid call.
// The pace comes from the live run (2026-10-01): first byte ~210 ms, and the rest of the body over ~2 s
// (first Tutor audio 11773 ms - first canvas action 9505 ms, with the request starting right after the plan).
// Each mode runs RUNS times: buffered (MediaSource off, the old path) and streamed (MediaSource on).
// Usage: node e2e/voice-tts-stream-check.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';

const FIRST_BYTE_MS = 210, BODY_MS = 2000, TICK_MS = 50, RUNS = 5;
const mp3 = readFileSync(new URL('../public/audio/nanogpt-l1-p1-5.mp3', import.meta.url));
const bundle = (await esbuild.build({ entryPoints: [new URL('../src/voice-tts.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, format: 'iife', globalName: 'VoiceTts', write: false })).outputFiles[0].text;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const server = createServer(async (req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(`<!doctype html><script>${bundle}</script>`); }
  if (req.url !== '/api/learn/voice/tts') { res.writeHead(404); return res.end(); }
  await wait(FIRST_BYTE_MS);
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
  const step = Math.ceil(mp3.length / (BODY_MS / TICK_MS));
  for (let at = 0; at < mp3.length && !res.destroyed; at += step) {
    res.write(mp3.subarray(at, at + step));
    await wait(TICK_MS);
  }
  res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(base);

// One speak; returns ms from request start to first byte / first audible playback, and, when stopAfter is set,
// ms from stop() to silence and whether any stale audio played after the stop.
const speak = (streamed, stopAfter = null) => page.evaluate(async ({ streamed, stopAfter }) => {
  const marks = {};
  let audio;
  const tts = VoiceTts.createFishTts({
    post: (path, body, signal) => fetch(path, { method: 'POST', body: JSON.stringify(body), signal }),
    onEvent: event => { marks[event.type] ??= event.at; },
    makeAudio: url => (audio = new Audio(url)),
    MediaSource: streamed ? window.MediaSource : null,
  });
  const done = tts.speak('Here it is. Notice the division right before softmax.', { turnId: 't' });
  if (stopAfter == null) {
    await new Promise(resolve => { const check = () => (marks.tts_play_start ? resolve() : setTimeout(check, 5)); check(); });
    tts.stop();
    await done;
    return { firstByte: marks.tts_first_byte - marks.tts_request_start, firstAudio: marks.tts_play_start - marks.tts_request_start };
  }
  await new Promise(resolve => { const check = () => (marks.tts_play_start ? resolve() : setTimeout(check, 5)); check(); });
  await new Promise(resolve => setTimeout(resolve, stopAfter));
  const before = audio.currentTime;
  const clicked = performance.now();
  tts.stop();
  // Silence = the playhead no longer moves. Sample it right after the stop and 2.5 s later, while the
  // server is still streaming the rest of the body: nothing may resume.
  const silentAt = performance.now();
  const outcome = await done;
  const at = audio.currentTime;
  await new Promise(resolve => setTimeout(resolve, 2500));
  return { outcome, wasPlaying: before > 0, stopToPause: silentAt - clicked, stale: !audio.paused || audio.currentTime !== at };
}, { streamed, stopAfter });

const stats = xs => ({ n: xs.length, mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), min: Math.round(Math.min(...xs)), max: Math.round(Math.max(...xs)) });
const result = {};
for (const [mode, streamed] of [['buffered', false], ['streamed', true]]) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await speak(streamed));
  result[mode] = { firstByte: stats(runs.map(r => r.firstByte)), requestToFirstAudio: stats(runs.map(r => r.firstAudio)) };
}
const stop = await speak(true, 300);
assert.equal(stop.outcome, 'stopped');
assert.ok(stop.wasPlaying, 'audio was playing when Stop was pressed');
assert.equal(stop.stale, false, 'no stale audio after Stop');
result.streamedStop = { stopToPauseMs: Math.round(stop.stopToPause * 10) / 10, playheadFrozenFor2500ms: !stop.stale };
result.savedMs = result.buffered.requestToFirstAudio.mean - result.streamed.requestToFirstAudio.mean;
assert.ok(result.savedMs > 0, 'streaming starts sooner');
console.log(JSON.stringify({ pace: { FIRST_BYTE_MS, BODY_MS, bytes: mp3.length }, ...result }, null, 1));
await browser.close();
server.close();
