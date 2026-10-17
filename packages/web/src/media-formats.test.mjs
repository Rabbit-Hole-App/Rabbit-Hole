import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { imageInfo, mediaInfo, playbackPlan, playType } from './media-formats.js';
import { mediaFamilyOf } from './media-family.js';

// Real files, made by Pillow 12.3, libsndfile 1.2.2, PyAV 19.0.1 (FFmpeg) and Chrome 155 MediaRecorder (src/__fixtures__/media).
const fx = name => readFileSync(new URL(`./__fixtures__/media/${name}`, import.meta.url));

test('image sizes come from the headers, with JPEG EXIF orientation swapping the displayed sides', () => {
  assert.deepEqual(imageInfo(fx('photo.png')), { format: 'png', width: 400, height: 300, displayWidth: 400, displayHeight: 300, orientation: 1, frames: 1 });
  assert.equal(imageInfo(fx('photo.jpg')).displayWidth, 400);
  const turned = imageInfo(fx('photo-orient6.jpg'));
  assert.deepEqual([turned.width, turned.height, turned.orientation, turned.displayWidth, turned.displayHeight], [400, 300, 6, 300, 400],
    'Chrome, Chromium, Firefox and WebKit all show orientation 6 as 300 x 400 (measured), so the card reserves that shape');
  const webp = imageInfo(fx('photo-orient6.webp'));
  assert.deepEqual([webp.displayWidth, webp.displayHeight, webp.orientation], [400, 300, 1], 'every engine ignores WebP EXIF orientation (measured), so the card does too');
  assert.deepEqual([imageInfo(fx('photo.webp')).width, imageInfo(fx('photo.webp')).height], [400, 300]);
});

test('GIF and animated WebP frames are counted; a still GIF is one frame', () => {
  assert.deepEqual([imageInfo(fx('anim.gif')).frames, imageInfo(fx('anim.gif')).width, imageInfo(fx('anim.gif')).height], [12, 120, 80]);
  assert.equal(imageInfo(fx('still.gif')).frames, 1);
  assert.equal(imageInfo(fx('anim.webp')).frames > 1, true);
});

test('bytes that are not an image are not one, whatever the name', () => {
  assert.equal(imageInfo(fx('tone.mp3')), null);
  assert.equal(imageInfo(Buffer.from('GIF8')), null, 'a truncated header');
  assert.equal(imageInfo(new Uint8Array(0)), null);
});

test('audio containers and codecs are read from real files', () => {
  const rows = {
    'tone.mp3': ['mp3', 'audio/mpeg', 'mp3'], 'tone.wav': ['wav', 'audio/wav', 'pcm'], 'tone-adpcm.wav': ['wav', 'audio/wav', 'ima-adpcm'],
    'tone.ogg': ['ogg', 'audio/ogg', 'vorbis'], 'tone-opus.ogg': ['ogg', 'audio/ogg', 'opus'], 'tone.flac': ['flac', 'audio/flac', 'flac'],
    'tone.m4a': ['mp4', 'audio/mp4', 'mp4a.40.2'], 'tone-alac.m4a': ['mp4', 'audio/mp4', 'alac'],
  };
  for (const [file, [container, mime, codec]] of Object.entries(rows)) {
    const info = mediaInfo(fx(file));
    assert.deepEqual([info.container, info.mime, info.codec, info.video], [container, mime, codec, false], file);
  }
  assert.equal(Math.round(mediaInfo(fx('tone.flac')).duration * 100), 25, 'FLAC STREAMINFO duration');
  assert.equal(Math.round(mediaInfo(fx('tone.wav')).duration * 100), 25, 'WAV data / byte rate');
});

test('video containers are told from audio by their tracks, not the ftyp brand', () => {
  assert.deepEqual([mediaInfo(fx('clip.mp4')).video, mediaInfo(fx('clip.mp4')).codec], [true, 'avc1.42E01E']);
  assert.equal(mediaInfo(fx('clip-hevc.mp4')).codec, 'hvc1.1.6.L93.B0');
  assert.deepEqual([mediaInfo(fx('clip.webm')).container, mediaInfo(fx('clip.webm')).video, mediaInfo(fx('clip.webm')).codec], ['webm', true, 'vp8']);
  assert.equal(mediaInfo(fx('photo.png')), null);
  assert.equal(mediaInfo(Buffer.from('plain text, not audio')), null);
});

test('canPlayType gets the container and codec it can judge', () => {
  assert.equal(playType(mediaInfo(fx('tone-opus.ogg'))), 'audio/ogg; codecs="opus"');
  assert.equal(playType(mediaInfo(fx('tone-alac.m4a'))), 'audio/mp4; codecs="alac"');
  assert.equal(playType(mediaInfo(fx('tone.wav'))), 'audio/wav', 'Chrome answers "" for codecs="3" WAV it plays (measured)');
  assert.equal(playType(mediaInfo(fx('tone.mp3'))), 'audio/mpeg');
});

test('the decode probe decides playback; canPlayType only breaks a timeout', () => {
  assert.equal(playbackPlan({ canPlay: '', probe: 'ok' }), 'native', 'Chrome: canPlayType "" for float WAV, which plays');
  assert.equal(playbackPlan({ canPlay: 'probably', probe: 'error' }), 'derivative', 'WebKit says probably and fails');
  assert.equal(playbackPlan({ canPlay: 'maybe', probe: 'timeout' }), 'native');
  assert.equal(playbackPlan({ canPlay: '', probe: 'timeout' }), 'derivative');
});

test('family by extension, case-insensitive', () => {
  assert.equal(mediaFamilyOf('A.PNG'), 'image');
  assert.equal(mediaFamilyOf('x.jpeg'), 'image');
  assert.equal(mediaFamilyOf('x.gif'), 'gif');
  assert.equal(mediaFamilyOf('x.SVG'), 'svg');
  for (const ext of ['mp3', 'wav', 'ogg', 'm4a', 'flac']) assert.equal(mediaFamilyOf(`a.${ext}`), 'audio');
  assert.equal(mediaFamilyOf('a.webm'), 'video');
  assert.equal(mediaFamilyOf('a.pdf'), null);
  assert.equal(mediaFamilyOf('mp3'), null, 'no extension');
});
