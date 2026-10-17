import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importMedia, MEDIA_LIMITS } from './media-import.js';

const bytes = name => readFileSync(new URL(`./__fixtures__/media/${name}`, import.meta.url));
const fileOf = (name, as = name, type = '') => new File([bytes(name)], as, { type });

test('each real fixture becomes its card, with the facts the card needs', async () => {
  const rows = [
    ['photo.png', 'image', { type: 'image/png', width: 400, height: 300 }],
    ['photo-orient6.jpg', 'image', { type: 'image/jpeg', width: 300, height: 400, orientation: 6 }],
    ['photo.webp', 'image', { type: 'image/webp', width: 400, height: 300 }],
    ['anim.gif', 'gif', { type: 'image/gif', width: 120, height: 80, frames: 12 }],
    ['plain.svg', 'svg', { type: 'image/svg+xml', width: 200, height: 100 }],
    ['tone.mp3', 'audio', { type: 'audio/mpeg', codec: 'mp3' }],
    ['tone.wav', 'audio', { type: 'audio/wav', codec: 'pcm', duration: 0.25 }],
    ['tone.ogg', 'audio', { type: 'audio/ogg', codec: 'vorbis' }],
    ['tone-opus.ogg', 'audio', { type: 'audio/ogg', codec: 'opus' }],
    ['tone.flac', 'audio', { type: 'audio/flac', codec: 'flac', duration: 0.25 }],
    ['tone.m4a', 'audio', { type: 'audio/mp4', codec: 'mp4a.40.2' }],
    ['tone-alac.m4a', 'audio', { type: 'audio/mp4', codec: 'alac' }],
    ['clip.mp4', 'clip', { type: 'video/mp4', codec: 'avc1.42E01E' }],
    ['clip.webm', 'clip', { type: 'video/webm', codec: 'vp8' }],
  ];
  for (const [name, kind, meta] of rows) {
    const result = await importMedia(fileOf(name));
    assert.equal(result.kind, kind, name);
    for (const [key, value] of Object.entries(meta)) assert.equal(result.meta[key], value, `${name} ${key}`);
    assert.equal(result.meta.size, bytes(name).length, `${name} size`);
  }
});

test('an upper-case extension and a missing MIME type change nothing', async () => {
  assert.equal((await importMedia(fileOf('tone.flac', 'TONE.FLAC'))).kind, 'audio');
  assert.equal((await importMedia(fileOf('photo.png', 'Photo.PNG'))).kind, 'image');
});

test('bytes that do not match the name are refused with the name and the reason', async () => {
  assert.match((await importMedia(fileOf('tone.mp3', 'fake.png'))).error, /^fake\.png: this is not a PNG, JPEG, WebP or GIF image/);
  assert.match((await importMedia(fileOf('photo.png', 'fake.gif'))).error, /^fake\.gif: this is not/);
  assert.match((await importMedia(fileOf('fake.svg'))).error, /^fake\.svg: this is not an SVG drawing/);
  assert.match((await importMedia(fileOf('tone.ogg', 'song.mp3'))).error, /^song\.mp3: its bytes are not MP3 audio/);
  assert.match((await importMedia(fileOf('tone.m4a', 'movie.mp4'))).error, /^movie\.mp4: this file has no video track/);
  assert.match((await importMedia(fileOf('clip.mp4', 'song.m4a'))).error, /^song\.m4a: this file holds video/);
  assert.match((await importMedia(fileOf('photo.png', 'clip.webm'))).error, /^clip\.webm: this is not an MP4 or WebM video/);
});

test('hostile and broken SVGs: refused when they cannot be parsed safely, cleaned when they can', async () => {
  assert.match((await importMedia(fileOf('xxe.svg'))).error, /^xxe\.svg: .*entity \(&xxe;\)/);
  const hostile = await importMedia(fileOf('hostile.svg'));
  assert.equal(hostile.kind, 'svg');
  assert.ok(hostile.meta.removed.includes('script'));
  const gz = new File([new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0])], 'logo.svg');
  assert.match((await importMedia(gz)).error, /compressed SVG \(\.svgz\) is not supported/);
});

test('limits: exactly the cap is taken, one byte over is refused before any parse; empty is refused', async () => {
  const at = n => new File([new Uint8Array(n)], 'big.flac');
  assert.match((await importMedia(at(MEDIA_LIMITS.audio + 1))).error, /^big\.flac: audio files up to 25 MiB \(this one is 25\.0 MiB\)/);
  assert.doesNotMatch((await importMedia(at(MEDIA_LIMITS.audio))).error, /up to/, 'at the cap the bytes are checked instead (and these zeros are not FLAC)');
  assert.match((await importMedia(new File([], 'x.wav'))).error, /x\.wav: the file is empty/);
  assert.match((await importMedia(new File([new Uint8Array(MEDIA_LIMITS.image + 1)], 'big.png'))).error, /images up to 5 MiB/);
  assert.match((await importMedia(new File([new Uint8Array(MEDIA_LIMITS.video + 1)], 'big.mp4'))).error, /videos up to 50 MiB/);
});

test('an image over the pixel budget is refused with its size and the rule', async () => {
  // A PNG header claiming 20000 x 20000 (the measured 400 MP case that took 2.3-4.2 s to draw).
  const png = new Uint8Array(bytes('photo.png'));
  new DataView(png.buffer).setUint32(16, 20000); new DataView(png.buffer).setUint32(20, 20000);
  assert.match((await importMedia(new File([png], 'huge.png'))).error, /^huge\.png: 20000 x 20000 px is too large to show; the canvas takes images up to 100 megapixels and 16384 px a side/);
  new DataView(png.buffer).setUint32(16, 16385); new DataView(png.buffer).setUint32(20, 10);
  assert.match((await importMedia(new File([png], 'wide.png'))).error, /16385 x 10 px is too large/);
  new DataView(png.buffer).setUint32(16, 10000); new DataView(png.buffer).setUint32(20, 10000);
  assert.equal((await importMedia(new File([png], 'ok.png'))).kind, 'image', '100 MP exactly is taken');
});

test('files that are not media are left to the other import paths', async () => {
  assert.equal(await importMedia(new File(['%PDF-1.4'], 'paper.pdf')), null);
  assert.equal(await importMedia(new File(['x = 1'], 'a.py')), null);
});
