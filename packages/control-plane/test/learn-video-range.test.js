// Clip playback through the real route (videoFetch -> LearnVideos -> serveClip), against an R2 stub that answers
// the way the Workers binding (and miniflare) does: get() always sets object.range, {offset 0, length size} when no
// range was asked; a Headers range reads its Range header; an impossible range object throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LearnVideos, videoFetch } from '../src/learn-video.js';

const SIZE = 1000, BYTES = Uint8Array.from({ length: SIZE }, (_, i) => i % 251), KEY = 'a'.repeat(64), ETAG = '"clip-etag-1"';

function r2(bytes) {
  const calls = [];
  const meta = () => ({ size: bytes.byteLength, httpEtag: ETAG, etag: 'clip-etag-1', range: { offset: 0, length: bytes.byteLength } });
  const resolve = range => {
    if (range instanceof Headers) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.get('range') || '');
      if (!m) return { offset: 0, length: bytes.byteLength }; // no or unparsable header: the whole object, range still set
      range = m[1] ? { offset: Number(m[1]), ...(m[2] ? { length: Number(m[2]) - Number(m[1]) + 1 } : {}) } : { suffix: Number(m[2]) };
    }
    let { offset, length, suffix } = range;
    if (suffix !== undefined) { if (suffix <= 0) throw new Error('InvalidRange'); suffix = Math.min(suffix, bytes.byteLength); offset = bytes.byteLength - suffix; length = suffix; }
    offset ??= 0; length ??= bytes.byteLength - offset;
    if (offset < 0 || offset > bytes.byteLength || length <= 0) throw new Error('InvalidRange');
    return { offset, length: Math.min(length, bytes.byteLength - offset) };
  };
  return {
    calls,
    head: async key => { calls.push(['head', key]); return key === 'clips/k.mp4' ? meta() : null; },
    get: async (key, opts = {}) => {
      calls.push(['get', key, opts.range]);
      if (key !== 'clips/k.mp4') return null;
      const range = opts.range === undefined ? { offset: 0, length: bytes.byteLength } : resolve(opts.range);
      return { ...meta(), range, body: new Blob([bytes.slice(range.offset, range.offset + range.length)]).stream() };
    },
  };
}

function route() {
  const data = new Map([[`job:${KEY}`, { key: KEY, status: 'ready', storageKey: 'clips/k.mp4', contentType: 'video/mp4' }]]);
  const state = { id: 'actor', storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, v), list: async () => new Map(), setAlarm: async () => {} }, blockConcurrencyWhile: fn => fn() };
  const media = r2(BYTES);
  const env = {
    LEARN_MEDIA: media,
    CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', email: 'learner@test', org: 'org' }) },
    LEARN_VIDEOS: { idFromName: name => name, get: () => actor },
  };
  const actor = new LearnVideos(state, env);
  const fetchClip = (headers = {}, method = 'GET') => videoFetch(new Request(`https://dev.test/api/learn/video?app=demo&asset=${KEY}`, { method, headers }), env);
  return { media, fetchClip };
}
const bytesOf = async response => new Uint8Array(await response.arrayBuffer());

test('playback: a GET without Range is 200 with the whole clip, its length, type, Accept-Ranges and ETag', async () => {
  const { fetchClip } = route();
  const res = await fetchClip();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-range'), null);
  assert.equal(res.headers.get('content-length'), String(SIZE));
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('etag'), ETAG);
  assert.equal(res.headers.get('cache-control'), 'private, max-age=3600');
  assert.deepEqual(await bytesOf(res), BYTES);
});

test('seeking: a mid-file range is 206 with Content-Range and exactly that slice', async () => {
  const { fetchClip } = route();
  const res = await fetchClip({ Range: 'bytes=200-299' });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes 200-299/${SIZE}`);
  assert.equal(res.headers.get('content-length'), '100');
  assert.equal(res.headers.get('etag'), ETAG);
  assert.deepEqual(await bytesOf(res), BYTES.slice(200, 300));
  const clamped = await fetchClip({ Range: `bytes=990-5000` });
  assert.deepEqual([clamped.status, clamped.headers.get('content-range')], [206, `bytes 990-999/${SIZE}`]);
  assert.deepEqual(await bytesOf(clamped), BYTES.slice(990));
});

test('open-ended and suffix ranges: bytes=N- and bytes=-N', async () => {
  const { fetchClip } = route();
  const open = await fetchClip({ Range: 'bytes=0-' });
  assert.deepEqual([open.status, open.headers.get('content-range'), open.headers.get('content-length')], [206, `bytes 0-999/${SIZE}`, String(SIZE)]);
  assert.deepEqual(await bytesOf(open), BYTES);
  const tail = await fetchClip({ Range: 'bytes=900-' });
  assert.deepEqual([tail.status, tail.headers.get('content-range')], [206, `bytes 900-999/${SIZE}`]);
  assert.deepEqual(await bytesOf(tail), BYTES.slice(900));
  const suffix = await fetchClip({ Range: 'bytes=-100' });
  assert.deepEqual([suffix.status, suffix.headers.get('content-range'), suffix.headers.get('content-length')], [206, `bytes 900-999/${SIZE}`, '100']);
  assert.deepEqual(await bytesOf(suffix), BYTES.slice(900));
  const bigSuffix = await fetchClip({ Range: 'bytes=-5000' });
  assert.deepEqual([bigSuffix.status, bigSuffix.headers.get('content-range')], [206, `bytes 0-999/${SIZE}`]);
});

test('an unsatisfiable range is 416 with Content-Range bytes */size and reads no body', async () => {
  const { fetchClip, media } = route();
  for (const range of [`bytes=${SIZE}-`, 'bytes=5000-6000', 'bytes=-0']) {
    const res = await fetchClip({ Range: range });
    assert.equal(res.status, 416, range);
    assert.equal(res.headers.get('content-range'), `bytes */${SIZE}`, range);
    assert.equal((await bytesOf(res)).byteLength, 0);
  }
  assert.ok(!media.calls.some(call => call[0] === 'get'), 'no object read for a 416');
  // Several ranges or a malformed header may be ignored (RFC 9110): the whole clip.
  for (const range of ['bytes=0-1,5-6', 'items=0-5']) assert.equal((await fetchClip({ Range: range })).status, 200, range);
});

test('HEAD: headers of the full clip or of a range, no body', async () => {
  const { fetchClip, media } = route();
  const head = await fetchClip({}, 'HEAD');
  assert.equal(head.status, 200);
  assert.deepEqual([head.headers.get('content-length'), head.headers.get('content-type'), head.headers.get('accept-ranges'), head.headers.get('etag')], [String(SIZE), 'video/mp4', 'bytes', ETAG]);
  assert.equal(head.body, null);
  const ranged = await fetchClip({ Range: 'bytes=10-19' }, 'HEAD');
  assert.deepEqual([ranged.status, ranged.headers.get('content-range'), ranged.headers.get('content-length')], [206, `bytes 10-19/${SIZE}`, '10']);
  assert.ok(!media.calls.some(call => call[0] === 'get'), 'HEAD never reads the object');
});

test('reload: repeat GETs agree, If-None-Match revalidates to 304, If-Range falls back to the whole clip when stale', async () => {
  const { fetchClip } = route();
  const first = await fetchClip(), again = await fetchClip();
  assert.deepEqual([first.status, again.status, again.headers.get('etag')], [200, 200, first.headers.get('etag')]);
  assert.deepEqual(await bytesOf(again), BYTES);
  const seek = await fetchClip({ Range: 'bytes=500-599' }), seekAgain = await fetchClip({ Range: 'bytes=500-599' });
  assert.deepEqual([seek.status, seekAgain.status, seekAgain.headers.get('content-range')], [206, 206, `bytes 500-599/${SIZE}`]);
  assert.deepEqual(await bytesOf(seekAgain), BYTES.slice(500, 600));

  const fresh = await fetchClip({ 'If-None-Match': ETAG });
  assert.equal(fresh.status, 304);
  assert.equal(fresh.headers.get('etag'), ETAG);
  assert.equal((await fetchClip({ 'If-None-Match': `W/${ETAG}` })).status, 304, 'weak comparison');
  assert.equal((await fetchClip({ 'If-None-Match': '"old"' })).status, 200);

  const sameRange = await fetchClip({ Range: 'bytes=500-599', 'If-Range': ETAG });
  assert.deepEqual([sameRange.status, sameRange.headers.get('content-range')], [206, `bytes 500-599/${SIZE}`]);
  for (const validator of ['"old"', `W/${ETAG}`, 'Wed, 21 Oct 2026 07:28:00 GMT']) {
    const stale = await fetchClip({ Range: 'bytes=500-599', 'If-Range': validator });
    assert.deepEqual([stale.status, stale.headers.get('content-range'), stale.headers.get('content-length')], [200, null, String(SIZE)], validator);
    assert.deepEqual(await bytesOf(stale), BYTES);
  }
});

test('a clip that is not ready, or missing from storage, is 404', async () => {
  const { fetchClip, media } = route();
  media.head = async () => null; media.get = async () => null;
  assert.equal((await fetchClip()).status, 404);
  assert.equal((await fetchClip({ Range: 'bytes=0-1' })).status, 404);
  assert.equal((await fetchClip({}, 'HEAD')).status, 404);
});
