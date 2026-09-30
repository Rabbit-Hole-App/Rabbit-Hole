import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoIdFrom, parseExaResults, validateMoment, embedUrl, validateVideoContext, searchYouTube } from '../src/learn-youtube.js';

// --- naming a video ---

test('every shape a YouTube URL takes yields the same id', () => {
  for (const url of [
    'Ilg3gGewQ5U',
    'https://www.youtube.com/watch?v=Ilg3gGewQ5U',
    'https://www.youtube.com/watch?v=Ilg3gGewQ5U&t=252s',
    'https://youtu.be/Ilg3gGewQ5U',
    'https://youtu.be/Ilg3gGewQ5U?t=42',
    'https://www.youtube.com/embed/Ilg3gGewQ5U',
    'https://www.youtube.com/shorts/Ilg3gGewQ5U',
    'https://m.youtube.com/watch?v=Ilg3gGewQ5U',
  ]) assert.equal(videoIdFrom(url), 'Ilg3gGewQ5U', url);
});

test('a channel, playlist or foreign page is not a video', () => {
  for (const url of [
    'https://www.youtube.com/@3blue1brown',
    'https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr',
    'https://www.youtube.com/c/veritasium',
    'https://evil.example/watch?v=Ilg3gGewQ5U',
    'https://fakeyoutube.com/watch?v=Ilg3gGewQ5U',
    'not a url at all',
    '',
  ]) assert.equal(videoIdFrom(url), null, url);
});

// --- parsing what Exa returns ---

test('Exa results become videos, pages dropped, duplicates collapsed', () => {
  const videos = parseExaResults({ results: [
    { url: 'https://www.youtube.com/watch?v=Ilg3gGewQ5U', title: 'Backpropagation, intuitively | Chapter 3 - YouTube', author: '3Blue1Brown' },
    { url: 'https://www.youtube.com/@3blue1brown', title: 'A channel page' },
    { url: 'https://www.youtube.com/watch?v=Ilg3gGewQ5U', title: 'The same video again' },
    { url: 'https://youtu.be/FaHHWdsIYQg', title: 'Backprop Explained' },
  ] });
  assert.equal(videos.length, 2);
  assert.equal(videos[0].title, 'Backpropagation, intuitively | Chapter 3', 'the site suffix is not part of the title');
  assert.equal(videos[0].channel, '3Blue1Brown');
  assert.equal(videos[1].videoId, 'FaHHWdsIYQg');
});

test('a result with no usable title falls back to the id, not to blank', () => {
  const [video] = parseExaResults({ results: [{ url: 'https://youtu.be/Ilg3gGewQ5U', title: ' - YouTube' }] });
  assert.equal(video.title, 'Ilg3gGewQ5U');
});

test('an empty or malformed payload is an empty list, not a crash', () => {
  assert.deepEqual(parseExaResults({}), []);
  assert.deepEqual(parseExaResults(null), []);
  assert.deepEqual(parseExaResults({ results: [{}] }), []);
});

// --- moments ---

test('a moment is whole seconds, ordered', () => {
  assert.deepEqual(validateMoment(252.9, 338.1), { start: 252, end: 338 });
  assert.deepEqual(validateMoment(0, null), { start: 0, end: null });
  assert.deepEqual(validateMoment(undefined, undefined), { start: 0, end: null });
});

test('a backwards, negative or absurd moment is refused', () => {
  assert.throws(() => validateMoment(100, 50), /ends after it starts/);
  assert.throws(() => validateMoment(100, 100), /ends after it starts/);
  assert.throws(() => validateMoment(-5, 50), /Invalid moment start/);
  assert.throws(() => validateMoment(999999, null), /Invalid moment start/);
  assert.throws(() => validateMoment('soon', null), /Invalid moment start/);
});

test('the embed URL carries the window, so playback enforces it', () => {
  assert.equal(embedUrl('Ilg3gGewQ5U', 252, 338), 'https://www.youtube-nocookie.com/embed/Ilg3gGewQ5U?start=252&end=338');
  assert.equal(embedUrl('Ilg3gGewQ5U'), 'https://www.youtube-nocookie.com/embed/Ilg3gGewQ5U');
  assert.equal(embedUrl('Ilg3gGewQ5U', 0, 90), 'https://www.youtube-nocookie.com/embed/Ilg3gGewQ5U?end=90');
});

test('the embed URL cannot be built for a non-video', () => {
  assert.throws(() => embedUrl('"><script>'), /Invalid video/);
  assert.throws(() => embedUrl('Ilg3gGewQ5U', 90, 30), /ends after it starts/);
});

// --- what rides with a question ---

test('video context is normalised, not passed through', () => {
  assert.deepEqual(
    validateVideoContext({ videoId: 'https://youtu.be/Ilg3gGewQ5U', start: 252.7, end: 338.2, title: 'Backprop' }),
    { videoId: 'Ilg3gGewQ5U', start: 252, end: 338, title: 'Backprop' },
  );
  assert.equal(validateVideoContext({ videoId: 'Ilg3gGewQ5U' }).title, null);
});

test('a bad video context is refused before anything is sent', () => {
  assert.throws(() => validateVideoContext({ videoId: 'nope' }), /Invalid video/);
  assert.throws(() => validateVideoContext({ videoId: 'Ilg3gGewQ5U', start: 90, end: 10 }), /ends after it starts/);
  assert.throws(() => validateVideoContext(null), /Invalid video/);
});

// --- the search itself ---

const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });

test('a search needs a key, and says so as a next step', async () => {
  await assert.rejects(() => searchYouTube('backprop', {}), /not connected on this deployment/);
});

test('a junk query is refused before any request', async () => {
  let called = 0;
  const fake = async () => { called += 1; return reply(200, { results: [] }); };
  await assert.rejects(() => searchYouTube('', { EXA_API_KEY: 'k' }, fake), /Invalid video search/);
  await assert.rejects(() => searchYouTube('x'.repeat(201), { EXA_API_KEY: 'k' }, fake), /Invalid video search/);
  assert.equal(called, 0);
});

test('the key rides a header to exa.ai and only there', async () => {
  const calls = [];
  const fake = async (url, options) => { calls.push({ url, options }); return reply(200, { results: [] }); };
  await searchYouTube('backprop', { EXA_API_KEY: 'secret-key' }, fake);
  assert.equal(calls[0].url, 'https://api.exa.ai/search');
  assert.equal(calls[0].options.headers['x-api-key'], 'secret-key');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.includeDomains, ['youtube.com']);
  assert.equal(body.numResults, 10);
});

test('upstream failures become sentences naming the next step', async () => {
  await assert.rejects(() => searchYouTube('q', { EXA_API_KEY: 'k' }, async () => reply(401, {})), /key was refused/);
  await assert.rejects(() => searchYouTube('q', { EXA_API_KEY: 'k' }, async () => reply(429, {})), /rate-limited/);
  await assert.rejects(() => searchYouTube('q', { EXA_API_KEY: 'k' }, async () => reply(500, {})), /unavailable \(500\)/);
  const timeout = new Error('timed out'); timeout.name = 'TimeoutError';
  await assert.rejects(() => searchYouTube('q', { EXA_API_KEY: 'k' }, async () => { throw timeout; }), /did not answer in time/);
  await assert.rejects(() => searchYouTube('q', { EXA_API_KEY: 'k' }, async () => { throw new Error('boom'); }), /Video search is unavailable/);
});

// duplication-3: the one video-tool runner apiAsk and repositoryAsk share.
test('videoMomentTools offers the tools only with a provider, shows only found videos once, and passes other names on', async () => {
  const { videoMomentTools } = await import('../src/learn-youtube.js');
  assert.deepEqual(videoMomentTools({}, 'o').tools, []);
  assert.equal(videoMomentTools({}, 'o').system, null);
  const videos = videoMomentTools({ EXA_API_KEY: 'k' }, 'o', async () => ({ videos: [{ videoId: 'Ilg3gGewQ5U', title: 'A', hasCaptions: false, hasPassages: false }], passages: [] }));
  assert.deepEqual(videos.tools.map(tool => tool.name), ['find_video_moments', 'show_video']);
  assert.equal(await videos.run('read_source', {}), undefined);
  await assert.rejects(videos.run('show_video', { videoId: 'Ilg3gGewQ5U' }));
  await videos.run('find_video_moments', { query: 'q' });
  assert.equal((await videos.run('show_video', { videoId: 'Ilg3gGewQ5U' })).window, 'from the start');
  await assert.rejects(videos.run('show_video', { videoId: 'Ilg3gGewQ5U' }), /One video per answer/);
  assert.equal(videos.shown().videoId, 'Ilg3gGewQ5U');
});
