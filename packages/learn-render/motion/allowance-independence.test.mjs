// 2026-10-27 (owner): no complexity class allowance ever relaxes a render timeout or a resource limit. The class decides only which STATIC composition
// sizes are refused before rendering; the 420 s render limit, the 25 MB output cap, the 3300 s job timeout, the 9-call cap and the US$ ceiling are
// constants of the render service and the orchestrator that never read the class.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPLEXITY_CLASSES, checkCompositionLimits } from './composition-limits.js';
import { LIMITS } from './service/server.mjs';
import { validateJobRequest } from './orchestrator.mjs';
import { motionExecutionTerms } from '../../control-plane/src/motion-settings.js';
import { MEASURED_READY_POLICY, MEASURED_RENDERER_CONFIG } from '../../control-plane/src/motion-ready-policy.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const source = f => readFileSync(join(HERE, f), 'utf8');

test('the render service never reads the class: its limits are constants and no service source mentions a complexity class or the allowance', () => {
  assert.equal(LIMITS.timeout_seconds, 420);
  assert.equal(LIMITS.output_max_bytes, 25 * 1024 * 1024);
  for (const f of readdirSync(join(HERE, 'service')).filter(f => /\.(mjs|js)$/.test(f) && !/\.test\./.test(f))) {
    assert.doesNotMatch(source(`service/${f}`), /allowed_complexity|COMPLEXITY_CLASSES|composition-limits|complexityClass/, `service/${f} must not read the class`);
  }
  assert.doesNotMatch(source('render-job.mjs'), /allowed_complexity|COMPLEXITY_CLASSES|composition-limits/, 'the render job does not read the class either');
});

test('the allowance carries a renderer configuration id and classes only: no timeout, resource, call or money field can ride on it', () => {
  for (const e of MEASURED_READY_POLICY.entries) {
    const terms = motionExecutionTerms({ MOTION_RENDERER_CONFIG: MEASURED_RENDERER_CONFIG }, { duration_seconds: e.min_seconds, aspect_ratio: e.aspect_ratio });
    assert.deepEqual(Object.keys(terms).sort(), ['allowed_complexity', 'renderer_config'].filter(k => k in terms), `${e.aspect_ratio} ${e.min_seconds}s`);
    assert.ok(e.complexity.every(c => COMPLEXITY_CLASSES.includes(c)) && !e.complexity.includes('heavy'), 'heavy is never allowed');
  }
  const base = { request: '/motion 15s x', location: {}, idempotency_key: 'abcdefgh', grant: { micros: 1, issued_at: 1, boot: 'a'.repeat(32), sig: 'x' } };
  const ok = { title: 't', duration_seconds: 15, description: 'd', allowed_complexity: ['simple', 'standard'] };
  assert.deepEqual(validateJobRequest({ ...base, approved_proposal: ok }).filter(e => /approved_proposal/.test(e)), []);
  for (const extra of ['timeout_seconds', 'render_timeout_s', 'max_calls', 'ceiling_usd', 'memory_gib']) assert.ok(validateJobRequest({ ...base, approved_proposal: { ...ok, [extra]: 9999 } }).some(e => /approved_proposal/.test(e)), `${extra} is refused`);
});

test('a class allowance never lifts the absolute table: beyond the heaviest class, or past 60 s, a composition is refused whatever classes are allowed', () => {
  const huge = '<AbsoluteFill>' + '<Sequence><div>x</div></Sequence>'.repeat(60) + '</AbsoluteFill>';
  assert.equal(checkCompositionLimits(huge, { durationSeconds: 15, allowed: ['simple', 'standard', 'heavy'] }).ok, false);
  assert.equal(checkCompositionLimits('<div>x</div>', { durationSeconds: 61, allowed: ['simple', 'standard', 'heavy'] }).ok, false, 'a duration beyond 60 s is outside every class');
  assert.equal(checkCompositionLimits('<div>x</div>', { durationSeconds: 15, allowed: ['simple', 'standard'] }).ok, true);
});
