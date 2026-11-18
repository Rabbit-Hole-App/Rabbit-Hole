// W1.3: MP3 measurement, timing, narration transport and the render client, each against stubs and real files. No Fish, model or renderer call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mp3Duration } from '../src/whiteboard-mp3.js';
import { audioKeyOf, fitTiming } from '../src/whiteboard-timing.js';
import { FISH_URL, fishBody, narrateBeat } from '../src/whiteboard-tts.js';
import { renderStep } from '../src/whiteboard-render-client.js';

// Six real Fish-style narration clips (moved here from the retired nanoGPT course's web/public/audio, Tutor cleanup P4).
const real = name => new Uint8Array(readFileSync(new URL(`./fixtures/whiteboard/audio/${name}`, import.meta.url)));
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/whiteboard/${name}`, import.meta.url), 'utf8'));

// A synthetic stream: n frames of one header (payload zeros), optionally after an ID3v2 tag and with a Xing frame first.
function frames(header, n, { id3 = 0, xing = false } = {}) {
  const [b1, b2] = [header[1], header[2]];
  const version = { 0: 2.5, 2: 2, 3: 1 }[(b1 >> 3) & 3], layer = { 1: 3, 2: 2, 3: 1 }[(b1 >> 1) & 3];
  const kbps = { '1-3': [0, 32, 40, 48, 56, 64], '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64], '1-2': [0, 32, 48, 56, 64] }[`${version === 1 ? 1 : 2}-${layer}`][b2 >> 4];
  const rate = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] }[version][(b2 >> 2) & 3];
  const length = Math.floor((((layer === 3 && version !== 1 ? 576 : 1152) / 8) * kbps * 1000) / rate);
  const out = [], tag = id3 ? [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, (id3 >> 7) & 0x7f, id3 & 0x7f, ...new Array(id3).fill(0)] : [];
  out.push(...tag);
  for (let i = 0; i < n + (xing ? 1 : 0); i++) {
    const frame = new Array(length).fill(0); frame.splice(0, 4, ...header);
    if (xing && i === 0) frame.splice(4 + (version === 1 ? 17 : 9), 4, // 0xc4: mono, so side info is 17 (MPEG-1) or 9 bytes
      ...[...'Xing'].map(c => c.charCodeAt(0)));
    out.push(...frame);
  }
  return new Uint8Array(out);
}

test('mp3: the duration from real Fish-style files matches their recorded durations within 1 ms (MPEG-1 Layer III, 44.1 kHz)', () => {
  const recorded = JSON.parse(readFileSync(new URL('./fixtures/whiteboard/audio/durations.json', import.meta.url), 'utf8'));
  for (const { file, ms } of recorded) {
    const d = mp3Duration(real(file));
    assert.ok(Math.abs(d.seconds * 1000 - ms) <= 1, `${file}: ${d.seconds} s against ${ms} ms`);
    assert.deepEqual([d.sampleRate, d.samplesPerFrame], [44100, 1152]);
  }
});

test('mp3: version and layer decide samples per frame and rate; ID3v2 is skipped, a Xing frame is not counted, garbage is refused', () => {
  // MPEG-1 Layer III 64 kbps 44.1 kHz: 1152 samples a frame.
  assert.equal(mp3Duration(frames([0xff, 0xfb, 0x50, 0xc4], 100)).seconds, (100 * 1152) / 44100);
  // MPEG-2 Layer III 64 kbps 24 kHz: 576 samples a frame.
  const v2 = mp3Duration(frames([0xff, 0xf3, 0x84, 0xc4], 125));
  assert.deepEqual([v2.sampleRate, v2.samplesPerFrame, v2.seconds], [24000, 576, 3]);
  // MPEG-2.5 Layer III 8 kbps 8 kHz.
  assert.equal(mp3Duration(frames([0xff, 0xe3, 0x18, 0xc4], 50)).seconds, (50 * 576) / 8000);
  // MPEG-1 Layer II 64 kbps 48 kHz: 1152 samples.
  assert.equal(mp3Duration(frames([0xff, 0xfd, 0x44, 0xc4], 40)).seconds, (40 * 1152) / 48000);
  assert.equal(mp3Duration(frames([0xff, 0xfb, 0x50, 0xc4], 100, { id3: 300, xing: true })).frames, 100);
  assert.throws(() => mp3Duration(new Uint8Array([1, 2, 3, 4, 5])), { code: 'mp3_invalid' });
});

test('timing: beats follow one another from their window\'s start; an overrun names its scene; the total is exactly d x 30', () => {
  const plan = fixture('plan-10.json'), scene = fixture('scene-1.json');
  const audio = seconds => new Map([[audioKeyOf('s1', 'b1'), { seconds }], [audioKeyOf('s1', 'b2'), { seconds }]]);
  const { timing } = fitTiming(plan, [scene], audio(3.788));
  assert.deepEqual(timing.beats.map(b => [b.id, b.startFrame, b.audioFrames, b.audioKey]), [['b1', 0, 114, 'audio/s1-b1.mp3'], ['b2', 114, 114, 'audio/s1-b2.mp3']]);
  assert.equal(timing.totalFrames, 300);
  // 2 x 150 frames + the 15-frame pause after b2 is 315, over the 300-frame window.
  assert.deepEqual(fitTiming(plan, [scene], audio(5)).overrun, [{ sceneId: 's1', needed: 315, window: 300 }]);
  const silent = { ...scene, beats: [scene.beats[0], { ...scene.beats[1], narration: '' }] };
  assert.equal(fitTiming(plan, [silent], new Map([[audioKeyOf('s1', 'b1'), { seconds: 2 }]])).timing.beats[1].audioFrames, 0);
});

test('narration: the 4.2 body, one retry on 429 or a failure before acceptance, never a second POST after Fish accepted', async () => {
  assert.deepEqual(fishBody('Hi.'), { text: 'Hi.', reference_id: '802e3bc2b27e49c2995d23ef70e6ac89', format: 'mp3', mp3_bitrate: 64, latency: 'balanced', normalize: true, temperature: 0.5, top_p: 0.6, prosody: { speed: 0.92 } });
  const mp3 = real('narration-0.mp3'), env = { FISH_AUDIO_API_KEY: 'k', SMALL_ENV: 'test' };
  const fish = answers => { const posts = []; return { posts, fetch: async (url, init) => { posts.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); const a = answers[posts.length - 1]; if (a instanceof Error) throw a; return a(); } }; };
  const ok = () => new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
  let f = fish([() => new Response('busy', { status: 429 }), ok]);
  const out = await narrateBeat(env, 'Hello there.', { fetch: f.fetch });
  assert.deepEqual([f.posts.length, f.posts[0].url, f.posts[0].auth, out.attempts, Math.round(out.seconds * 1000)], [2, FISH_URL, 'Bearer k', 2, 3788]);
  f = fish([Object.assign(new Error('t'), { name: 'TimeoutError' }), ok]);
  assert.equal((await narrateBeat(env, 'x', { fetch: f.fetch })).attempts, 2);
  f = fish([() => new Response('busy', { status: 429 }), () => new Response('busy', { status: 429 }), ok]);
  await assert.rejects(narrateBeat(env, 'x', { fetch: f.fetch }), { code: 'tts_failed' });
  assert.equal(f.posts.length, 2, 'one retry only');
  // Accepted (200), then the body never arrives: reconciling, and no second POST.
  const broken = () => new Response(new ReadableStream({ start(c) { c.error(new Error('reset')); } }), { status: 200 });
  f = fish([broken, ok]);
  await assert.rejects(narrateBeat(env, 'x', { fetch: f.fetch }), { code: 'reconciling' });
  assert.equal(f.posts.length, 1);
  await assert.rejects(narrateBeat({}, 'x', { fetch: f.fetch }), { code: 'tts_not_configured' });
});

// A scripted renderer: each request is answered by the first matching handler of the script; every request is recorded.
function renderer(script) {
  const seen = [];
  return { seen, fetch: async (url, init = {}) => {
    const u = new URL(url), r = { method: init.method || 'GET', path: u.pathname, key: init.headers?.['Idempotency-Key'], auth: init.headers?.Authorization, bytes: init.body?.length ?? 0 };
    seen.push(r);
    const h = script(r, seen.filter(x => x.path === r.path && x.method === r.method).length);
    return h instanceof Response ? h : Response.json(h.body ?? {}, { status: h.status ?? 200 });
  } };
}
const ENV = { WHITEBOARD_RENDERER_URL: 'https://renderer.test/', WHITEBOARD_RENDERER_TOKEN: 'tok' };
const ID = 'a'.repeat(32), ID2 = 'b'.repeat(32);
const body = async () => ({ schema: 'whiteboard-render/1', job_id: 'wj_1', segment: { index: 0, of: 1, startFrame: 0, endFrame: 300 }, manifest: {}, audio: [], illustrations: [] });
async function drive(r, state, max = 20, make = body) {
  for (let i = 0; i < max; i++) {
    const step = await renderStep(ENV, state, make, { fetch: r.fetch });
    if (step.files) return step;
    state = step.state;
  }
  return { state };
}
const ready = { body: { status: 'ready', frame_count: 300, duration_seconds: 10, output_bytes: 3 } };
const art = () => new Response(new Uint8Array([1, 2, 3]));

test('render client: version first, one POST with the idempotency key, poll, pull the three artifacts; a 429 never re-POSTs', async () => {
  const r = renderer(({ method, path }, n) => (path === '/health' ? { body: { whiteboard: 'whiteboard-renderer-1' } } : method === 'POST' ? { status: 202, body: { render_id: ID } }
    : path === `/whiteboard/${ID}` ? (n === 1 ? { status: 429 } : n === 2 ? { body: { status: 'rendering' } } : ready) : art()));
  const done = await drive(r, { key: 'wj_1:1:0', total: 300 });
  assert.deepEqual(Object.keys(done.files), ['final.mp4', 'poster.png', 'contact-sheet.png']);
  assert.deepEqual(done.measured, { frames: 300, seconds: 10 });
  const posts = r.seen.filter(x => x.method === 'POST');
  assert.deepEqual(posts.map(p => [p.path, p.key, p.auth]), [['/whiteboard/render', 'wj_1:1:0', 'Bearer tok']]);
  assert.ok(r.seen.filter(x => x.path.includes('/artifacts/')).every(x => x.auth === 'Bearer tok'));
  // A busy POST (429) waits and asks with the same key; it is never a second key.
  const busy = renderer(({ method, path }, n) => (path === '/health' ? { body: { whiteboard: 'whiteboard-renderer-1' } } : method === 'POST' ? (n === 1 ? { status: 429 } : { status: 202, body: { render_id: ID } }) : path === `/whiteboard/${ID}` ? ready : art()));
  const first = await renderStep(ENV, { key: 'wj_1:1:0', total: 300 }, body, { fetch: busy.fetch });
  assert.deepEqual([first.waitMs, busy.seen.filter(x => x.method === 'POST').length], [30000, 1]);
  await drive(busy, first.state);
  assert.deepEqual(busy.seen.filter(x => x.method === 'POST').map(x => x.key), ['wj_1:1:0', 'wj_1:1:0']);
});

test('render client: a forgotten render (404) asks by-key, then re-POSTs once with a new key; lost twice it fails, never a third POST', async () => {
  let n404 = 0;
  const r = renderer(({ method, path }) => (path === '/health' ? { body: { whiteboard: 'whiteboard-renderer-1' } } : method === 'POST' ? { status: 202, body: { render_id: ID } }
    : path.startsWith('/render/by-key/') ? { status: 404, body: { error: 'unknown_job' } } : path === `/whiteboard/${ID}` ? (n404++, { status: 404 }) : art()));
  await assert.rejects(drive(r, { key: 'wj_1:1:0', total: 300 }), { code: 'render_lost', reason: 'the drawing could not be rendered' });
  assert.deepEqual(r.seen.filter(x => x.method === 'POST').map(x => x.key), ['wj_1:1:0', 'wj_1:1:0:r1']);
  assert.deepEqual(r.seen.filter(x => x.path.startsWith('/render/by-key/')).map(x => x.path), ['/render/by-key/wj_1%3A1%3A0', '/render/by-key/wj_1%3A1%3A0%3Ar1']);
  // A key the service still knows as live is followed, with no POST.
  const known = renderer(({ method, path }, n) => (path === '/health' ? { body: { whiteboard: 'whiteboard-renderer-1' } } : method === 'POST' ? { status: 202, body: { render_id: ID } }
    : path.startsWith('/render/by-key/') ? { body: { render_id: ID2, live: true } } : path === `/whiteboard/${ID}` ? { status: 404 } : path === `/whiteboard/${ID2}` ? ready : art()));
  await drive(known, { key: 'wj_1:1:0', total: 300 });
  assert.equal(known.seen.filter(x => x.method === 'POST').length, 1);
});

test('render client: fails closed on a version mismatch, a request over 16 MiB, a failed render or a wrong frame count', async () => {
  const health = version => renderer(({ path }) => (path === '/health' ? { body: { whiteboard: version } } : { status: 202, body: { render_id: ID } }));
  const old = health('whiteboard-renderer-0');
  await assert.rejects(renderStep(ENV, { key: 'k', total: 300 }, body, { fetch: old.fetch }), { code: 'renderer_version', reason: 'the drawing could not be rendered' });
  assert.equal(old.seen.filter(x => x.method === 'POST').length, 0);
  const big = health('whiteboard-renderer-1');
  await assert.rejects(renderStep(ENV, { key: 'k', total: 300 }, async () => ({ ...(await body()), pad: 'x'.repeat(16 * 1024 * 1024) }), { fetch: big.fetch }), { code: 'request_too_large' });
  assert.equal(big.seen.filter(x => x.method === 'POST').length, 0);
  const failed = renderer(({ path }) => (path === '/health' ? { body: { whiteboard: 'whiteboard-renderer-1' } } : { body: { status: 'failed', error: 'audio_mismatch', detail: 'b01 is 3.9 s' } }));
  await assert.rejects(renderStep(ENV, { key: 'k', total: 300, renderId: ID, versionOk: true }, body, { fetch: failed.fetch }), { code: 'render_failed' });
  const short = renderer(() => ({ body: { status: 'ready', frame_count: 299 } }));
  await assert.rejects(renderStep(ENV, { key: 'k', total: 300, renderId: ID, versionOk: true }, body, { fetch: short.fetch }), { code: 'render_frames' });
  await assert.rejects(renderStep({}, { key: 'k' }, body, { fetch: short.fetch }), { code: 'renderer_not_configured' });
});
