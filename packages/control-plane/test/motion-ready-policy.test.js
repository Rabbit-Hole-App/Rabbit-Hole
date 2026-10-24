// The measured readiness policy (src/motion-ready-policy.js): enabled strictly where a receipt on the measured renderer shows a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MEASURED_POLICY_VERSION, MEASURED_READY_POLICY, MEASURED_RENDERER_CONFIG, PASSED, TIMED_OUT } from '../src/motion-ready-policy.js';
import { MOTION_NOT_READY, MOTION_RATIOS, motionExecutionTerms, motionGenerationCheck, motionReadiness, readyPolicy } from '../src/motion-settings.js';

const live = { MOTION_RENDERER_CONFIG: MEASURED_RENDERER_CONFIG };
const SECONDS = Array.from({ length: 12 }, (_, i) => 5 + 5 * i);
const at = (env, seconds, aspect_ratio) => motionReadiness(env, { duration_seconds: seconds, aspect_ratio });
const key = (r, s) => `${r}|${s}`;

// The validated pairs, written out so a change to the evidence has to change this list too.
const EXPECTED = [
  ...[5, 15, 30, 45, 60].map(s => key('16:9', s)),
  ...['9:16', '1:1', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4'].map(r => key(r, 15)),
  ...['9:16', '1:1', '3:4'].map(r => key(r, 60)),
].sort();

test('every one of the 9 ratios x 12 durations is judged; exactly the 16 receipt-backed pairs are ready, none interpolated', () => {
  assert.equal(MOTION_RATIOS.length, 9);
  const ready = [], refused = [];
  for (const r of MOTION_RATIOS) for (const s of SECONDS) {
    const x = at(live, s, r);
    if (x.ready) { assert.deepEqual([x.complexity, x.policy_version], [['simple'], MEASURED_POLICY_VERSION]); ready.push(key(r, s)); }
    else { assert.equal(x.code, MOTION_NOT_READY); assert.doesNotMatch(x.message, /\.\.\.|…|\$/, 'one plain line, credits only'); refused.push(key(r, s)); }
  }
  assert.deepEqual(ready.sort(), EXPECTED);
  assert.equal(refused.length, 108 - 16);
  // The neighbours of a validated pair stay refused: 30 and 45 passing do not enable 35 or 40; 15 and 60 do not enable 20 to 55.
  for (const s of [10, 20, 25, 35, 40, 50, 55]) assert.equal(at(live, s, '16:9').ready, false, `16:9 ${s}`);
  assert.equal(at(live, 30, '9:16').ready, false);
  assert.equal(at(live, 60, '4:3').ready, false);
});

test('each enabled pair names a passing receipt on the measured revision; the pass is inside the 420 s limit; timeouts are not enabled by themselves', () => {
  for (const c of PASSED) {
    assert.match(c.receipt, /^mv-D\d\d-c4$/, 'the 03f2a1ef matrix only');
    assert.ok(c.service_total_s > 0 && c.service_total_s < 420, c.receipt);
  }
  for (const e of MEASURED_READY_POLICY.entries) {
    assert.equal(e.min_seconds, e.max_seconds, 'one measured duration per entry');
    assert.ok(e.receipts.length >= 1);
    assert.deepEqual(e.receipts, PASSED.filter(c => c.ratio === e.aspect_ratio && c.seconds === e.min_seconds).map(c => c.receipt));
  }
  assert.deepEqual(TIMED_OUT.map(c => c.receipt), ['mv-D18-c4', 'mv-D20-c4', 'mv-D21-c4']);
  assert.equal(PASSED.length + TIMED_OUT.length, 21, 'the 21 runs of the matrix');
});

test('fails closed: another renderer configuration, no configuration, an explicit empty or malformed variable', () => {
  assert.equal(at({ MOTION_RENDERER_CONFIG: 'something-else' }, 15, '16:9').ready, false, 'measured on another renderer: nothing');
  assert.equal(at({}, 15, '16:9').ready, false, 'no live configuration id: nothing');
  assert.equal(at({ ...live, MOTION_READY_POLICY: '' }, 15, '16:9').ready, false, 'an explicit empty variable overrides the measured policy');
  assert.equal(at({ ...live, MOTION_READY_POLICY: 'not json' }, 15, '16:9').ready, false);
  assert.equal(readyPolicy({}).entries.length, 0);
  assert.equal(readyPolicy(live).entries.length, 16);
});

test('the variable still overrides the measured policy, and the checks and execution terms follow it', () => {
  const one = { ...live, MOTION_READY_POLICY: JSON.stringify({ version: 'x', renderer_config: MEASURED_RENDERER_CONFIG, entries: [{ aspect_ratio: '1:1', min_seconds: 10, max_seconds: 10, complexity: ['simple'] }] }) };
  assert.deepEqual([at(one, 10, '1:1').ready, at(one, 15, '16:9').ready], [true, false]);
  const proposal = settings => ({ request: '/motion x', proposal: { settings } });
  assert.equal(motionGenerationCheck(live, proposal({ duration_seconds: 15, aspect_ratio: '2:3', audio: false })), null);
  assert.equal(motionGenerationCheck(live, proposal({ duration_seconds: 20, aspect_ratio: '2:3', audio: false })).code, MOTION_NOT_READY);
  assert.deepEqual(motionExecutionTerms(live, { duration_seconds: 60, aspect_ratio: '3:4' }), { renderer_config: MEASURED_RENDERER_CONFIG, allowed_complexity: ['simple'] });
  assert.deepEqual(motionExecutionTerms(live, { duration_seconds: 60, aspect_ratio: '5:4' }), { renderer_config: MEASURED_RENDERER_CONFIG }, 'not validated: no cover, the start is refused first');
});
