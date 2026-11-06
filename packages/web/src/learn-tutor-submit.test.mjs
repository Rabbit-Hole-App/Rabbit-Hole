// Tutor lane T8: the rest of the browser submission (draft Task 05, "U2") beside T5's activity card. Feedback that is still
// pending is read again until it is final, a drawing is submitted only as a saved image (T6), and the card learns from the
// controls' read whether this deployment assesses drawings. No model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { settledAttempt } from './learn-coaching-materials.js';
import { drawingContent } from './learn-tutor-image.js';
import { createCoachingSync } from './learn-coaching-client.js';

const view = status => ({ attempt: { attemptId: 'at_1' }, assessment: { assessmentId: 'as_1', status } });
const noWait = async () => {};

test('pending feedback is read again until it is final; a failed read keeps what is shown; the follow-up stops', async () => {
  const replies = [() => Promise.reject(new Error('offline')), async () => view('pending'), async () => view('completed')];
  let reads = 0;
  const done = await settledAttempt(() => { reads += 1; return replies.shift()(); }, view('pending'), { wait: noWait });
  assert.deepEqual([done.assessment.status, reads], ['completed', 3]);
  assert.equal((await settledAttempt(() => assert.fail('no read'), view('unavailable'), { wait: noWait })).assessment.status, 'unavailable', 'a final status is never read again');
  let bounded = 0;
  assert.equal((await settledAttempt(async () => { bounded += 1; return view('pending'); }, view('pending'), { wait: noWait, tries: 4 })).assessment.status, 'pending');
  assert.equal(bounded, 4, 'bounded: an abandoned check is the server\'s to settle as unknown');
  let after = 0;
  await settledAttempt(async () => { after += 1; return view('pending'); }, view('pending'), { wait: noWait, live: () => after < 1 });
  assert.equal(after, 1, 'a card that went away stops reading');
});

// The canvas as submittedDrawing reads it: a selected image card, saved remotely (persist) with its stored revision.
const REV = 'a'.repeat(64);
const canvasWith = (block, saved = { ok: true, remote: 'ok' }) => ({ block: id => (id === block?.id ? block : null), persist: async () => saved });
const IMAGE = { id: 'img1', type: 'file', kind: 'image', fileRef: { source: { id: 'src1', rev: REV } } };

test('a drawing answer is the saved image card at its stored revision, with the optional explanation; strokes or an unsaved card submit nothing', async () => {
  assert.deepEqual(await drawingContent({ canvas: canvasWith(IMAGE), selection: ['img1'], explanation: '  The curve flattens at both ends. ' }),
    { content: { image: { block_id: 'img1', source: { id: 'src1', rev: REV } }, explanation: 'The curve flattens at both ends.' } });
  assert.deepEqual(await drawingContent({ canvas: canvasWith(IMAGE), selection: ['img1'] }), { content: { image: { block_id: 'img1', source: { id: 'src1', rev: REV } } } });
  assert.match((await drawingContent({ canvas: canvasWith(IMAGE), selection: [] })).notice, /Select the image of your drawing/);
  assert.match((await drawingContent({ canvas: canvasWith({ id: 's1', type: 'strokes' }), selection: ['s1'] })).notice, /Select the image of your drawing/, 'strokes are never a submission');
  assert.match((await drawingContent({ canvas: canvasWith(IMAGE, { ok: true, remote: 'failed' }), selection: ['img1'] })).notice, /could not be saved as a stored image/, 'unsaved: nothing submitted');
});

test('the controls read carries whether this deployment assesses drawings; an older server that says nothing means no', async () => {
  const sync = reply => { const s = createCoachingSync({ scope: { app: 'canvas-0a1b2c3d', board: 'main' }, call: async () => reply }); return s.start().then(() => s.view()); };
  const state = { controls: { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 1 }, goals: [], revision: 1 };
  assert.deepEqual((await sync({ state, capabilities: { drawing: true } })).capabilities, { drawing: true });
  assert.deepEqual((await sync({ state })).capabilities, {});
});
