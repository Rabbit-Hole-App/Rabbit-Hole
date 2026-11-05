// W1.1: the /whiteboard policy (roadmap v1 sections 4.2, 6.1 and 6.5). Offline, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN_TASKS } from '../src/learn-models.js';
import { RENDERER_VERSION, WHITEBOARD_LIMITS, WHITEBOARD_ROLES, maxScenesFor, whiteboardReservation, whiteboardRole, whiteboardRoleBoundMicros } from '../src/whiteboard-policy.js';

const plan = n => ({ scenes: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}` })) });

test('the limits are one frozen object with the roadmap 6.5 numbers', () => {
  assert.ok(Object.isFrozen(WHITEBOARD_LIMITS) && Object.isFrozen(WHITEBOARD_LIMITS.durations));
  assert.deepEqual(WHITEBOARD_LIMITS.durations, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  assert.deepEqual([WHITEBOARD_LIMITS.defaultSeconds, WHITEBOARD_LIMITS.servedMaxSeconds], [60, 60]);
  assert.deepEqual([maxScenesFor(10), maxScenesFor(20), maxScenesFor(60), maxScenesFor(90), maxScenesFor(120)], [1, 2, 4, 6, 8]);
  // The roadmap's own numbers, kept as written: 8 scenes x 80 primitives would be 640, the video allows 400 (reported in the W1.1 hand-back).
  assert.deepEqual([WHITEBOARD_LIMITS.primitivesPerScene, WHITEBOARD_LIMITS.primitivesPerVideo], [80, 400]);
  assert.equal(WHITEBOARD_LIMITS.manifestBytes, 262144);
  assert.throws(() => { WHITEBOARD_LIMITS.beatChars = 9999; }, TypeError);
  assert.match(RENDERER_VERSION, /^whiteboard-renderer-\d+$/);
});

test('the two W1 roles: Opus 5.5 at medium effort, 6,000 and 4,000 output tokens, no picker or fallback', () => {
  assert.deepEqual(Object.keys(WHITEBOARD_ROLES), ['plan', 'author']);
  assert.ok(Object.isFrozen(WHITEBOARD_ROLES) && Object.values(WHITEBOARD_ROLES).every(Object.isFrozen));
  for (const [role, maxTokens, maxInputTokens] of [['plan', 6000, 24000], ['author', 4000, 32000]]) {
    const r = whiteboardRole(role);
    assert.deepEqual([r.task, r.model, r.effort, r.maxTokens, r.maxInputTokens, r.maxImages, r.picker, r.fallback], [`whiteboard_${role}`, 'claude-opus-5-5', 'medium', maxTokens, maxInputTokens, 0, false, 'none']);
    assert.ok(Object.isFrozen(LEARN_TASKS[`whiteboard_${role}`]));
  }
  assert.throws(() => whiteboardRole('review'), { code: 'unknown_role' });
  assert.throws(() => whiteboardRole('plan', { ...LEARN_TASKS, whiteboard_plan: undefined }), { code: 'task_unconfigured' });
});

test('a call\'s bound: (input + images) at the cache-write price plus max_tokens at the output price', () => {
  // Opus 5.5: $4 / $20 per million. plan: 24,000 x 4 x 1.25 + 6,000 x 20 = 240,000 micro-USD; author: 32,000 x 4 x 1.25 + 4,000 x 20 = 240,000.
  assert.equal(whiteboardRoleBoundMicros('plan'), 240000);
  assert.equal(whiteboardRoleBoundMicros('author'), 240000);
  assert.throws(() => whiteboardRoleBoundMicros('plan', { whiteboard_plan: { model: 'unpriced', maxTokens: 1 } }), { code: 'unpriced_model' });
});

test('the worst case of the largest W1 plan (60 s, 4 scenes): every call it may make, at its bound', () => {
  const r = whiteboardReservation(JSON.parse(readFileSync(new URL('./fixtures/whiteboard/plan-60.json', import.meta.url), 'utf8')));
  assert.deepEqual(r.calls, { plan: 4, author: 6 });
  assert.equal(r.planMicros, 4 * 240000); // the planner and its three revisions
  // 6 author calls; Fish at $15 per MB on (4,000 narration + 4,000 re-narrated characters) x 4 bytes = 32,000 bytes = 480,000 micro-USD.
  assert.equal(r.generationMicros, 6 * 240000 + 480000);
  assert.deepEqual(r.estimate, { planMicros: 240000, generationMicros: 4 * 240000 + 60000 });
  assert.ok(r.estimate.generationMicros < r.generationMicros && r.estimate.planMicros < r.planMicros);
});

test('the worst case grows with the scenes and the narration is bounded per scene and per video', () => {
  const at = n => whiteboardReservation(plan(n)).generationMicros;
  // 1 scene: 3 author calls; narration at most 4 beats x 600 = 2,400 characters, re-narrated once: 4,800 x 4 bytes x $15/MB = 288,000.
  assert.equal(at(1), 3 * 240000 + 288000);
  assert.ok(at(1) < at(2) && at(2) < at(4) && at(4) < at(8));
  assert.equal(at(8) - at(4), 4 * 240000, 'past 4,000 characters the narration bound is the video\'s');
  assert.throws(() => whiteboardReservation(plan(0)), { code: 'bad_plan' });
  assert.throws(() => whiteboardReservation(plan(9)), { code: 'bad_plan' });
});
