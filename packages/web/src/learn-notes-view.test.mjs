import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// LearnPage.jsx cannot be rendered under node, so these read its source: the
// My notes view and its right-panel Learn Agent chat, with no lesson player.
const source = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// The demo needs the parked tldraw player, so it is always disabled: a pill
// that never enabled, and typing its prompt silently sent nothing.
test('no AskPanel in LearnPage gets the parked sigmoid demo', () => {
  const panels = source.match(/<AskPanel\b[^\n]*/g);
  assert.ok(panels.some(panel => panel.includes('headerTitle="Learn Agent"')));
  assert.deepEqual(panels.filter(panel => /\bdemo=/.test(panel)), []);
});

// Runs the real returnToNoteLesson with recording stand-ins for its closure.
function returnToNoteLesson(overrides = {}) {
  const start = source.indexOf('  const returnToNoteLesson = async');
  const body = source.slice(start, source.indexOf('\n  };\n', start) + 5);
  const calls = [];
  const record = name => (...args) => { calls.push([name, ...args]); };
  const deps = {
    editor: null, lesson: { current: null }, suppliedCourse: true, nanoLesson: { id: 'course-1001-a' },
    sampleCourse: { lessons: [{ id: 'sigmoid-demo' }] }, course: { course: null },
    demo: { run: record('demo.run') }, previewLesson: record('previewLesson'), navigateLesson: record('navigateLesson'),
    playback: { current: null }, setNarration: record('setNarration'), setNotesError: record('setNotesError'),
    setNoteEditing: record('setNoteEditing'), setLearningView: record('setLearningView'), setCourseView: record('setCourseView'),
    requestAnimationFrame: callback => callback(), ...overrides,
  };
  const run = new Function(...Object.keys(deps), `${body}\nreturn returnToNoteLesson;`)(...Object.values(deps));
  return { run, calls };
}

test('Return to lesson with no lesson player shows the canvas and calls no editor code', async () => {
  for (const lessonId of ['course-1001-a', 'sigmoid-demo']) {
    const { run, calls } = returnToNoteLesson();
    await run({ lessonId, sectionIndex: 0, frame: 0 }, false);
    assert.deepEqual(calls, [['setNoteEditing', null], ['setLearningView', 'lesson'], ['setCourseView', false]], lessonId);
  }
});
