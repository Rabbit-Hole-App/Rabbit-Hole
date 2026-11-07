// Send waits for the Ask about selection picture (owner 2026-11-07): no question goes without the image it shows. State machine plus source pins; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uploadStarted, uploadDone, uploadFailed } from './area-crop.js';

const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
const target = { id: 'area:1', text: 'The learner drew a rectangle on the canvas and asks about what is inside it; the attached image shows that area.' };

test('uploading -> ready: the flag clears and the image id is set', () => {
  const held = uploadStarted(target, true);
  assert.equal(held.uploading, true);
  const done = uploadDone(held, 'area:1', 'img-9');
  assert.deepEqual([done.uploading, done.image], [false, 'img-9']);
});

test('uploading -> failed: the flag clears and the text stops claiming an image', () => {
  const failed = uploadFailed(uploadStarted(target, true), 'area:1');
  assert.equal(failed.uploading, false);
  assert.match(failed.text, /no picture of it could be attached/);
});

test('no blob means nothing to wait for; removal (null) and a newer area are untouched by a late answer', () => {
  assert.equal(uploadStarted(target, false).uploading, undefined);
  assert.equal(uploadDone(null, 'area:1', 'img-9'), null);
  const newer = uploadStarted({ ...target, id: 'area:2' }, true);
  assert.equal(uploadDone(newer, 'area:1', 'img-9'), newer, 'the older upload does not release the newer hold');
  assert.equal(uploadFailed(newer, 'area:1'), newer);
});

test('Send is held while uploading: button, Enter and the send path; the chip shows the shimmering Uploading', () => {
  const composer = read('ChatComposer.jsx'), ask = read('ask.jsx'), chips = read('ContextChips.jsx');
  assert.match(composer, /if \(!busy && !disabled && !hold && \(ready \|\| value\.trim\(\)\)\) onSubmit\(value\)/, 'Enter and the form submit share this guard');
  assert.match(composer, /aria-label="Send" title=\{hold \|\| undefined\} disabled=\{busy \|\| disabled \|\| !!hold/);
  assert.match(ask, /hold=\{uploadHeld\(canvasTarget\) \? 'Waiting for the picture to upload' : ''\}/);
  assert.match(ask, /if \(uploadHeld\(canvasTarget\) && !keepDraft && !about\) return;/);
  assert.match(chips, /selection\.uploading \? <span data-area-uploading className="shimmer shrink-0">Uploading<\/span>/);
  assert.ok(!/Uploading\.\.\.|Uploading…/.test(chips));
});

test('the typed text is kept: the guard never clears the draft', () => {
  const composer = read('ChatComposer.jsx');
  assert.ok(!/hold[^;]*onChange\(''\)/.test(composer));
});

test('Send is held only for an area picture that is uploading, and released on success, failure, removal and a newer area', async () => {
  const { uploadHeld } = await import('./area-crop.js');
  const held = uploadStarted(target, true);
  assert.equal(uploadHeld(held), true);
  assert.equal(uploadHeld(uploadDone(held, 'area:1', 'img-9')), false, 'released on success');
  assert.equal(uploadHeld(uploadFailed(held, 'area:1')), false, 'released on failure');
  assert.equal(uploadHeld(null), false, 'released on removal');
  const newer = { ...target, id: 'area:2' };
  assert.equal(uploadHeld(uploadDone(held, 'area:2', 'img-1')), true, 'a newer area answering does not release the older hold');
  assert.equal(uploadHeld(newer), false, 'the newer area (no upload yet) is not held');
  assert.equal(uploadHeld({ id: 'card-1', uploading: true }), false, 'a stale flag on a non-area selection holds nothing');
  const ask = read('ask.jsx');
  assert.match(ask, /if \(uploadHeld\(canvasTarget\) && !keepDraft && !about\) return;/);
  assert.match(ask, /hold=\{uploadHeld\(canvasTarget\) \?/);
});
