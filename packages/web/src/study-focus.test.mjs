// Study's Focus (study-focus.js, coordinator rulings P6 and P7): the Focus Study > Notebook started ends with Study's working
// view; a Focus the learner started on another card is left alone; Locate on canvas ends Study's Focus before its own camera
// request, so the request is the camera that stays. The browser run is e2e/pinned-study-kernel-check.mjs (steps 5b, 6b).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { endStudyFocus, studyOwnsFocus } from './study-focus.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // a Windows checkout has CRLF
// A canvas that behaves like AdaptiveCanvas's commands: exitFocus restores the saved navigation at once (and drops any pending
// camera request, as restoreNavigation clears cameraRef); focusObject leaves a camera request the next commit applies.
function fakeCanvas(focus) {
  const calls = [];
  const canvas = { calls, focus, camera: 'framed', request: null,
    focusState: () => canvas.focus,
    exitFocus: () => { calls.push('exitFocus'); canvas.focus = null; canvas.camera = 'saved'; canvas.request = null; },
    focusObject: id => { calls.push(`focusObject ${id}`); canvas.request = id; } };
  return canvas;
}
const STUDY = { work: 'notebook', notebookId: 'nb' };

test('Study owns only the Focus Study > Notebook started, on its notebook', () => {
  assert.equal(studyOwnsFocus(STUDY, { id: 'nb', kind: 'notebook' }), true);
  assert.equal(studyOwnsFocus(STUDY, { id: 'pdf1', kind: 'pdf' }), false, 'the learner focused another card');
  assert.equal(studyOwnsFocus({ ...STUDY, work: 'canvas' }, { id: 'nb', kind: 'notebook' }), false, 'focused from the card, not from Study');
  assert.equal(studyOwnsFocus(STUDY, null), false);
  assert.equal(studyOwnsFocus(null, { id: 'nb' }), false);
});

test('endStudyFocus ends Study\'s Focus once and leaves any other Focus alone', () => {
  const own = fakeCanvas({ id: 'nb', kind: 'notebook' });
  assert.equal(endStudyFocus(own, STUDY), true);
  assert.equal(endStudyFocus(own, STUDY), false, 'nothing left to end');
  assert.deepEqual(own.calls, ['exitFocus']);
  const other = fakeCanvas({ id: 'pdf1', kind: 'pdf' });
  assert.equal(endStudyFocus(other, STUDY), false);
  assert.deepEqual(other.calls, [], 'a Focus the learner started on another card stays');
  assert.equal(endStudyFocus(null, STUDY), false);
});

test('P6: Locate on canvas ends Focus first, so its camera request is the one that stays', () => {
  const canvas = fakeCanvas({ id: 'nb', kind: 'notebook' });
  endStudyFocus(canvas, STUDY); canvas.focusObject('ex'); // useStudy.locate's order
  assert.deepEqual(canvas.calls, ['exitFocus', 'focusObject ex']);
  assert.equal(canvas.request, 'ex', 'the restore did not drop the Locate request');
  // The order in StudyPane, and the AdaptiveCanvas behaviour the fake stands for.
  const locate = read('./StudyPane.jsx').match(/locate: \(\) => \{[\s\S]*?\n {4}\},/)[0];
  assert.ok(locate.indexOf('endStudyFocus(canvas, live.current.value)') < locate.indexOf('canvas.focusObject?.(id)'), 'Locate ends Focus before its own camera request');
  const adaptive = read('./AdaptiveCanvas.jsx');
  assert.match(adaptive, /exitFocus: \(\) => \{ focusShown\.current = syncFocus\(focusShown\.current, null, \{[^}]*restore: saved => commandsRef\.current\.restoreNavigation\(saved\) \}\); dispatchFocus\(\{ type: 'exit' \}\); \},/, 'exitFocus restores now, not after the next commit');
  assert.match(adaptive, /restoreNavigation: saved => \{[\s\S]*?cameraRef\.current = null;[\s\S]*?setView\(viewRef\.current\);/, 'the restore drops pending camera requests and sets the view synchronously');
  assert.match(adaptive, /focusObject: id => \{\n\s*if \(boundsRef\.current\[id\]\) \{ setSelection\(\[id\]\); cameraRef\.current = \{ id, frame: true \}; return; \}/, 'Locate\'s request is applied by the camera effect after the restore');
});

test('P7: Unpin, View > Canvas, Study > Canvas and Locate end Study\'s Focus before the arrangement changes', () => {
  const pane = read('./StudyPane.jsx');
  assert.match(pane, /setMode: mode => \{ if \(mode !== 'study'\) endStudyFocus\(api\(\), live\.current\.value\); apply\(\[\{ type: 'setMode', mode \}\]\); \},/);
  assert.match(pane, /unpin: \(\) => \{ endStudyFocus\(api\(\), live\.current\.value\); apply\(\[\{ type: 'unpin' \}\]\); \},/);
  assert.match(pane, /if \(!endStudyFocus\(canvas, live\.current\.value\) && live\.current\.value\.canvasView\) canvas\?\.setView\?\.\(live\.current\.value\.canvasView\);\n\s*apply\(\[\{ type: 'setWork', work: 'canvas' \}\]\);/);
  assert.match(pane, /\{ endStudyFocus\(canvas, live\.current\.value\); apply\(\[\{ type: 'setWork', work: 'canvas' \}\]\); \}/);
  // No Study path ends a Focus it does not own.
  assert.doesNotMatch(pane, /canvas\.exitFocus\(\)/);
});

// Pinned Study for a codebase canvas (pinned-study-codebase-spec.md 2c): Run and Runbook are Focus on their card exactly as Notebook is.
test('Study owns the Focus of its Run card and its Runbook, and only on the card it is working in', () => {
  const study = { work: 'run', runId: 'r1', runbookId: 'd1', notebookId: 'nb' };
  assert.equal(studyOwnsFocus(study, { id: 'r1', kind: 'run' }), true);
  assert.equal(studyOwnsFocus(study, { id: 'd1', kind: 'doc' }), false, 'the Runbook is not the work');
  assert.equal(studyOwnsFocus({ ...study, work: 'runbook' }, { id: 'd1', kind: 'doc' }), true);
  assert.equal(studyOwnsFocus({ ...study, work: 'canvas' }, { id: 'r1', kind: 'run' }), false);
  const own = fakeCanvas({ id: 'r1', kind: 'run' });
  assert.equal(endStudyFocus(own, study), true);
  assert.deepEqual(own.calls, ['exitFocus']);
});
