import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { videoLabel, motionConfirm, MOTION_PAUSED, resumesJob, readsAgain, SETTLE_READS, RECOVERY_BUTTONS, recoveryButtons, motionUsageLine, pressOperation, withPressId } from './learn-video-label.js';
import { motionVideoBlock } from '../../learn-render/motion/video-block.js';

// The two samples' operations as BLOCK_TYPES.mathAnimation / videoGenerate build them (LearningBlocks.jsx).
const maths = { operation: { op: 'generate_math_animation', scene: { steps: [{ kind: 'equation' }, { kind: 'plot' }, { kind: 'plot' }] } } };
const clip = { operation: { op: 'generate_video', purpose: 'physical_process', duration: 4, aspectRatio: '16:9' } };
const brief = JSON.parse(readFileSync(new URL('../../learn-render/motion/fixtures/demo-a/brief.json', import.meta.url), 'utf8'));
const motion = motionVideoBlock({ brief, renderId: 'a'.repeat(32), jobId: 'motion-job-demo-a' });

test('a Motion render has its own copy: duration, Motion explainer, Remotion and its sources, never the maths words', () => {
  const label = videoLabel(motion);
  assert.deepEqual(label, {
    detail: '15s · Motion explainer · Remotion', button: 'Add the rendered video', progress: 'Fetching the render', expected: 30,
    sources: ['model.py:44–45', 'model.py:62–64', 'model.py:65–71', 'model.py:48–50'],
  });
  assert.doesNotMatch(JSON.stringify(label), /manim|sigmoid|maths/i);
});

test('the maths and generate_video copy is unchanged, and neither gets a Motion sources line', () => {
  assert.deepEqual(videoLabel(maths), { detail: '3 steps · equation, plot, plot · rendered by manim', button: 'Render the animation', progress: 'Rendering the animation', expected: 240 });
  assert.deepEqual(videoLabel(clip), { detail: '4s · 16:9 · physical process', button: 'Generate the video', progress: 'Generating the clip', expected: 180 });
});

// M7A: a /motion request (development builds) on the same video card.
test('a /motion request: its own copy, Stop allowed, and once ready the duration and sources it brought', () => {
  const request = { operation: { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } } };
  assert.deepEqual(videoLabel(request), { detail: 'Motion explainer', button: 'Generate the explainer', progress: 'Planning, reviewing and rendering', expected: 900, stoppable: true });
  const ready = { ...request, motion: { duration_seconds: 15, renderer: 'remotion', source_refs: [{ path: 'model.py', start_line: 62, end_line: 64 }] } };
  assert.deepEqual(videoLabel(ready), { detail: '15s · Motion explainer · Remotion', button: 'Generate the explainer', progress: 'Planning, reviewing and rendering', expected: 900, stoppable: true, sources: ['model.py:62–64'] });
  for (const other of [motion, maths, clip]) assert.equal(videoLabel(other).stoppable, undefined, 'only a /motion request can be stopped');
});

// M7B: the card names the backend its provenance names; a pending request names none.
test('a Motion video names the renderer that made it: Remotion or HyperFrames', () => {
  const hf = motionVideoBlock({ brief, renderId: 'b'.repeat(32), jobId: 'motion-job-hf', renderer: 'hyperframes' });
  assert.equal(videoLabel(hf).detail, '15s · Motion explainer · HyperFrames');
  assert.equal(videoLabel(motion).detail, '15s · Motion explainer · Remotion');
  const ready = { operation: { op: 'motion_request', request: '/motion 15s explain me softmax func', location: {} }, motion: { duration_seconds: 15, renderer: 'hyperframes', source_refs: [] } };
  assert.equal(videoLabel(ready).detail, '15s · Motion explainer · HyperFrames');
});

// Owner brief 2026-10-21 message 11 item 5: a video made with no source says so, and one whose supplied source did not
// mention its topic names what it is not grounded in; neither shows a Sources line.
test('an ungrounded Motion video is labelled on its card, never shown as sourced', () => {
  const none = { operation: { op: 'motion_render', render_id: 'c'.repeat(32) }, motion: { duration_seconds: 10, renderer: 'remotion', source_refs: [], grounding: { status: 'no_source_supplied' } } };
  assert.deepEqual([videoLabel(none).detail, videoLabel(none).sources], ['10s · Motion explainer · Remotion · Not grounded in a source', []]);
  const elsewhere = { operation: { op: 'motion_request', request: '/motion explain gradient descent', location: {} }, motion: { duration_seconds: 10, renderer: 'remotion', source_refs: [], grounding: { status: 'not_in_source', searched: ['karpathy/nanoGPT@3adf61e'] } } };
  assert.equal(videoLabel(elsewhere).detail, '10s · Motion explainer · Remotion · Not grounded in karpathy/nanoGPT@3adf61e');
  const brief = { ...JSON.parse(readFileSync(new URL('../../learn-render/motion/fixtures/demo-a/brief.json', import.meta.url), 'utf8')), source_refs: [], evidence: [], grounding: { status: 'no_source_supplied' } };
  assert.deepEqual(motionVideoBlock({ brief, renderId: 'd'.repeat(32), jobId: 'motion-job-u' }).motion.grounding, { status: 'no_source_supplied' });
});

// Owner messages 30 and 32: the learner never sees the reservation amount or how it is held. The confirmation is the paid-generation
// line with the server's estimate in credits (1 credit = $0.01), or PaidConfirm's default when the server sent none.
test('the Motion confirmation: the server estimate in credits, else the plain paid-generation line; never a reservation (owner messages 30 and 32)', () => {
  assert.equal(motionConfirm(100), 'This uses paid generation · about 100 credits');
  assert.equal(motionConfirm(1), 'This uses paid generation · about 1 credit');
  for (const none of [null, undefined, NaN, 0, -5, 8.96]) assert.equal(motionConfirm(none), 'This uses paid generation.', String(none));
});

test('while the server pauses new Motion generation, the confirmation says so (owner message 28)', () => {
  assert.equal(motionConfirm('paused'), 'Motion generation is temporarily unavailable while we fix a reliability issue.');
  assert.equal(MOTION_PAUSED, motionConfirm('paused'));
});

// MOT-11 (owner review of 274bd689): a reloaded card follows its saved job when it failed or was stopped too, not only while it runs,
// and keeps reading (GET only) while its hold is pending, up to a bound; a released hold, or the bound, stops the reads.
test('a reloaded failed or stopped card resumes its job, and reads again only while its hold is pending, bounded', () => {
  for (const status of ['generating', 'queued', 'failed']) assert.equal(resumesJob({ status, placementId: 'p1' }), true, status);
  for (const block of [{ status: 'failed' }, { status: 'ready', placementId: 'p1' }, { status: 'idle', placementId: 'p1' }, null]) assert.equal(resumesJob(block), false, JSON.stringify(block));
  const pending = { status: 'failed', hold: { usd: 8.96, state: 'pending' } };
  assert.equal(readsAgain(pending, 0), true);
  assert.equal(readsAgain(pending, SETTLE_READS - 1), true);
  assert.equal(readsAgain(pending, SETTLE_READS), false, 'bounded');
  for (const done of [{ status: 'failed', hold: { usd: 8.96, state: 'released' } }, { status: 'failed' }, { status: 'ready', hold: { state: 'pending' } }, undefined]) assert.equal(readsAgain(done, 0), false, JSON.stringify(done));
  assert.ok(SETTLE_READS > 0 && SETTLE_READS <= 120);
});

test('a failed /motion card offers only its recovery actions, named as the ruling says; usage in credits, never dollars or the hold', () => {
  assert.deepEqual(RECOVERY_BUTTONS, { fix: 'Continue fixing', render: 'Retry rendering', edit: 'Edit request', regenerate: 'Generate again' });
  assert.deepEqual(recoveryButtons({ actions: ['render'], regenerate: true }), ['render', 'regenerate']);
  assert.deepEqual(recoveryButtons({ actions: ['edit', 'fix'], regenerate: false }, { composer: true }), ['fix', 'edit']);
  assert.deepEqual(recoveryButtons({ actions: ['edit'], regenerate: false }), [], 'Edit request needs the Chat composer');
  assert.deepEqual(recoveryButtons({ actions: ['source', 'other'] }), [], 'an action the card cannot run is never offered');
  assert.equal(recoveryButtons(null), null);
  assert.ok(!Object.values(RECOVERY_BUTTONS).includes('Retry render'), 'paid regeneration is never Retry render');
  assert.equal(motionUsageLine({ usedMicros: 770_000 }, { usd: 8.96, state: 'released' }), 'Used 77 credits · reservation released');
  assert.equal(motionUsageLine({ usedMicros: 4_000 }, null), 'Used less than 1 credit · reservation released');
  assert.equal(motionUsageLine({ usedMicros: 10_000, unknown: true }, { usd: 8.96, state: 'pending' }), 'Used 1 credit so far · reservation pending');
  assert.doesNotMatch(motionUsageLine({ usedMicros: 770_000 }, { usd: 8.96, state: 'reserved' }), /\$|8\.96/);
  assert.equal(motionUsageLine(null, null), null);
});

// The reload race (owner priority 2, 2026-10-21): a confirmed /motion card is saved with confirmedStart before the save that
// carries its started job; a reload then mounts it confirmed again and its Generate runs once more. Without a request id on the
// saved card each mount made its own (two jobs, two holds); the card now lands with its press's id, so both mounts send one job.
test('a confirmed /motion card restarted after a reload sends the same request id: one job', () => {
  const block = { type: 'video', mode: 'generate', status: 'idle', confirmedStart: true, operation: { op: 'motion_request', request: '/motion 15s explain photosynthesis', location: { concept: null } } };
  let n = 0;
  const id = () => `press-${++n}aaaaaaa`;
  // As the card was saved before (no id at insert): the first mount and the remount after a reload are two different jobs.
  assert.notEqual(pressOperation(block, false, id).request_id, pressOperation(block, false, id).request_id);
  // As it is inserted now: the saved card holds its id, and every mount sends it.
  const saved = JSON.parse(JSON.stringify(withPressId(block)));
  assert.match(saved.operation.request_id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(pressOperation(saved, false, id).request_id, saved.operation.request_id);
  assert.equal(pressOperation(saved, false, id).request_id, saved.operation.request_id);
  // Owner message 37 holds: another press (another confirmed card) is another id; Retry keeps the key; other cards are untouched.
  assert.notEqual(withPressId(block).operation.request_id, saved.operation.request_id);
  assert.equal(pressOperation({ ...block, status: 'failed' }, true), block.operation);
  const unconfirmed = { ...block, confirmedStart: undefined };
  assert.equal(withPressId(unconfirmed), unconfirmed);
  const other = { type: 'video', confirmedStart: true, operation: { op: 'generate_video', id: 'prism' } };
  assert.equal(withPressId(other), other);
});
