// The transcript window's auto-scroll rule (transcript-scroll.js), pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { atBottom, followAfterScroll, scrollTopAfterGrow } from './transcript-scroll.js';

const m = (scrollTop, scrollHeight = 1000, clientHeight = 200) => ({ scrollTop, scrollHeight, clientHeight });

test('at the bottom means within 24 px of it', () => {
  assert.equal(atBottom(m(800)), true);
  assert.equal(atBottom(m(780)), true);
  assert.equal(atBottom(m(700)), false);
  assert.equal(atBottom(m(0, 150, 200)), true, 'text shorter than the block');
});

test('following: the text grew, so go to the very bottom; not following: stay where the learner is', () => {
  assert.equal(scrollTopAfterGrow(true, m(500)), 800);
  assert.equal(scrollTopAfterGrow(false, m(500)), 500);
  assert.equal(scrollTopAfterGrow(true, m(0, 100, 200)), 0, 'never negative');
});

test('our own scroll never changes the decision; the learner scrolling up stops it, back to the bottom resumes it', () => {
  assert.equal(followAfterScroll(true, m(300), true), true, 'a smooth scroll still moving');
  assert.equal(followAfterScroll(false, m(800), true), false, 'ours changes nothing either way');
  assert.equal(followAfterScroll(true, m(300), false), false, 'the learner scrolled up');
  assert.equal(followAfterScroll(false, m(500), false), false, 'still reading further up');
  assert.equal(followAfterScroll(false, m(790), false), true, 'back at the bottom');
});
