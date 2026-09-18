import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonMilestones } from './learn-milestones.js';

test('a dot sits where each lesson finishes', () => {
  // two lessons, two sections each
  const keys = ['a:0', 'a:1', 'b:0', 'b:1'];
  assert.deepEqual(lessonMilestones(keys), [
    { id: 'a', label: 'Lesson 1', at: 0.5, done: 2 },
    { id: 'b', label: 'Lesson 2', at: 1, done: 4 },
  ]);
});

test('lessons of different lengths put their dots proportionally', () => {
  const keys = ['a:0', 'b:0', 'b:1', 'b:2'];
  assert.deepEqual(lessonMilestones(keys).map(m => m.at), [0.25, 1]);
});

// The nanoGPT course appends objective checks that carry no lesson prefix of
// their own; they are their own group rather than part of the last lesson.
test('keys with no colon group together at the end', () => {
  const keys = ['a:0', 'a:1', 'predict-next', 'represent-text'];
  const milestones = lessonMilestones(keys);
  assert.deepEqual(milestones.map(m => m.label), ['Lesson 1', 'Lesson 2']);
  assert.deepEqual(milestones.map(m => m.at), [0.5, 1]);
});

test('one lesson gives one dot, at the end', () => {
  assert.deepEqual(lessonMilestones(['a:0', 'a:1']), [{ id: 'a', label: 'Lesson 1', at: 1, done: 2 }]);
});

test('no sections means no dots rather than a divide by zero', () => {
  assert.deepEqual(lessonMilestones([]), []);
});

// A lesson interleaved with another would give it two dots, which reads as two
// lessons. Grouping by identity rather than by run keeps one dot per lesson.
test('a lesson split across the list still gets a single dot', () => {
  const keys = ['a:0', 'b:0', 'a:1'];
  const milestones = lessonMilestones(keys);
  assert.equal(milestones.length, 2);
  assert.deepEqual(milestones.map(m => m.id), ['a', 'b']);
});
