// Tutor v2 turn trace: one trace_id, per-stage timing, status and result category.
import test from 'node:test';
import assert from 'node:assert/strict';
import { turnTrace } from './learn-tutor-trace.js';

test('stages record ok, error and timeout; errors are rethrown; marks are offsets', async () => {
  let clock = 0;
  const tracer = turnTrace(() => clock);
  assert.deepEqual(await tracer.step('router', () => { clock += 2; return { row: 'gap' }; }, value => value.row), { row: 'gap' });
  await assert.rejects(tracer.step('planner', async () => { clock += 5; throw new Error('The tutor timed out'); }));
  await assert.rejects(tracer.step('evaluate', async () => { throw new Error('500'); }));
  tracer.add('jev', 120, 'ok', 'settled');
  tracer.mark('first_visible_response');
  const { trace } = tracer;
  assert.match(trace.trace_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(trace.stages.map(stage => [stage.stage, stage.status, stage.result, stage.ms]), [
    ['router', 'ok', 'gap', 2], ['planner', 'timeout', 'The tutor timed out', 5], ['evaluate', 'error', '500', 0], ['jev', 'ok', 'settled', 120],
  ]);
  assert.equal(trace.marks.first_visible_response, 7);
});
