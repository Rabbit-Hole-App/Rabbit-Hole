import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEncoding, addEncodingAttempt, lessonProgressKey } from '../src/lesson-progress.js';

test('encoding check scores new text, handles formats and rejects malformed responses', () => {
  for (const input of ['2, 3, 4, 0', '[2,3,4,0]', '2 3 4 0']) assert.equal(checkEncoding(input).correct, true);
  assert.equal(checkEncoding('0,1,2,3').correct, false);
  for (const input of ['', '2,3,0', '2,3,4,0,1', '2,,3,4,0', '2e0,3,4,0', 'NaN', '[2,3,4,0', '<script>']) assert.equal(checkEncoding(input).valid, false, input);
});

test('retry retains first incorrect attempt while recording eventual correctness and reveal', () => {
  const first = addEncodingAttempt({ pages: { 0: true } }, '0 1 2 3', 10);
  const next = addEncodingAttempt(JSON.parse(JSON.stringify(first)), '2 3 4 0', 20);
  assert.equal(next.encoding.first.correct, false);
  assert.equal(next.encoding.first.revealedBeforeAnswer, false);
  assert.equal(next.encoding.last.revealedBeforeAnswer, true);
  assert.equal(next.encoding.count, 2);
  assert.equal(next.encoding.everCorrect, true);
  assert.equal(next.pages[0], true);
  assert.throws(() => addEncodingAttempt(next, 'oops'), /four integer/);
});

test('progress scope isolates learner, workspace, app, source and lesson revision', () => {
  const app = { org: 'team', email: 'one@example.com', owner_email: 'owner@example.com', name: 'repo' };
  const original = lessonProgressKey(app, 'lesson-r3', 'sha1');
  for (const field of ['org', 'email', 'name']) assert.notEqual(lessonProgressKey({ ...app, [field]: 'different' }, 'lesson-r3', 'sha1'), original);
  assert.notEqual(lessonProgressKey(app, 'lesson-r4', 'sha1'), original);
  assert.notEqual(lessonProgressKey(app, 'lesson-r3', 'sha2'), original);
  assert.equal(lessonProgressKey({ ...app, email: undefined }, 'lesson-r3', 'sha1'), null);
});
