import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBlueprint } from './interact-blueprint-check.js';
import { blueprintRunner, getEngine, guestSource, runSweep } from './interact-blueprint-run.js';
import { runProgram } from './explain-program/runtime.js';

// Release brief (owner, 2026-11-24), the two checker faults behind job ej_318bdf4291f94c7a8a9cb1109471e36f ("how does a decision tree works?"): the model's function was not flat and its parts did move; the checker said they did not.
// 1. runSweep sent state.over and state.values but the guest's evaluate read state.times only, so every sweep returned ONE row and check 7 called any graph drawn against a control flat.
// 2. check 4 compared a part's position at the first and the last check time only, so a motion that comes back to its start read as "No part moves".
const examples = JSON.parse(readFileSync(new URL('../../../docs/features/interact/interactive-blueprint-examples.json', import.meta.url), 'utf8'));
const copy = name => structuredClone(examples[name]);
const codeEdit = (blueprint, from, to) => { assert.ok(blueprint.math.code.includes(from), `the function has no "${from}"`); blueprint.math.code = blueprint.math.code.replace(from, to); return blueprint; };
const positions = (from, to, count) => Array.from({ length: count }, (_, k) => from + ((to - from) * k) / (count - 1));
const codes = result => result.problems.map(problem => problem.code);

// the pendulum example with its graph drawn against the control lengthB instead of against time
function graphOverControl(seriesValue, seriesOf) {
  const blueprint = copy('pendulum');
  Object.assign(blueprint.pictures.panel, { title: 'Period against length', x: { over: 'lengthB', label: 'String length', unit: 'm' }, y: { label: 'Period', unit: 's' }, series: [{ value: seriesValue, label: 'The period', of: seriesOf, style: 'line' }] });
  return blueprint;
}

test('a sweep returns one row per value, and the control is what moves between the rows', async () => {
  const runner = blueprintRunner(copy('pendulum')), xs = positions(0.5, 2, 96);
  const run = await runner.sweep({ massB: 1, lengthB: 1 }, 'lengthB', xs, 0);
  assert.equal(run.ok, true);
  assert.equal(run.rows.length, xs.length, 'as many rows as values');
  assert.equal(new Set(run.rows.map(row => row.periodB)).size, xs.length, 'periodB changes with every value of lengthB');
  assert.equal(run.rows[0].periodB < run.rows.at(-1).periodB, true, 'and rises with it');
  assert.equal(new Set(run.rows.map(row => row.periodA)).size, 1, 'periodA does not depend on lengthB: one value in every row');
  const other = await runner.sweep({ massB: 1, lengthB: 1 }, 'lengthB', xs, 4);
  assert.deepEqual(other.rows.map(row => row.periodB), run.rows.map(row => row.periodB), 'the time is the one time given; periodB does not depend on it');
  assert.notDeepEqual(other.rows.map(row => row.angleB), run.rows.map(row => row.angleB), 'angleB does, so the time reaches the function');
  const batch = await runner.run({ massB: 1, lengthB: 1 }, [0, 2, 4]);
  assert.equal(batch.rows.length, 3, 'a run over times still returns one row per time');
});

test('a sweep that runs out of time is split in halves, as a batch of times is: 96 values run where one call could not', async () => {
  // the engine's limit is 50 ms of wall clock for one call; this function costs about 7 ms a call, so 96 values cannot run in one
  const code = 'function compute(inputs, t) { let s = 0; for (let i = 0; i < 40000; i++) s += Math.sqrt(i); return { y: inputs.x * 2 + s * 0 }; }';
  const source = guestSource(code, [{ id: 'y', kind: 'number' }]), values = Array.from({ length: 96 }, (_, k) => k), engine = await getEngine();
  const whole = runProgram(engine, { source, request: { requestId: '1', inputs: { x: 0 }, time: 0, seed: 0, state: { times: [0], over: 'x', values } }, sdkVersion: 'sdk-8' });
  assert.deepEqual([whole.ok, whole.code], [false, 'runtime_limit'], 'one call with all 96 values runs out of time');
  const run = await runSweep(source, { x: 0 }, 'x', values, 0);
  assert.equal(run.ok, true);
  assert.deepEqual(run.rows.map(row => row.y), values.map(value => value * 2), 'every value, in order');
  const never = await runSweep(guestSource('function compute(inputs, t) { while (true) {} }', [{ id: 'y', kind: 'number' }]), { x: 0 }, 'x', [1, 2, 3], 0);
  assert.deepEqual([never.ok, never.error?.code], [false, 'runtime_limit'], 'a single value that never ends is still an error, not a loop of splits');
});

test('check 7: a graph drawn against a control with a changing series passes; a truly flat series still fails', async () => {
  const changing = await checkBlueprint(graphOverControl('periodB', 'B'));
  assert.deepEqual([changing.ok, changing.problems], [true, []], 'every check passes, check 7 too: periodB rises with lengthB');
  const flat = await checkBlueprint(graphOverControl('periodA', 'A'));
  const graph = flat.problems.filter(problem => problem.code === 'graph');
  assert.deepEqual(graph.map(problem => problem.message), ['`pictures.panel.series[0]` (`periodA`) is a flat line at the default settings; draw a quantity that changes.']);
});

test('check 4: a dot that makes exactly one full loop during the run passes; a card where nothing moves still fails', async () => {
  const loop = codeEdit(copy('pendulum'), 'Math.cos(2 * Math.PI * t / period)', 'Math.cos(2 * Math.PI * t / 8)'); // the run is 8 s: back at the start at the last check time
  const looped = await checkBlueprint(loop);
  assert.equal(codes(looped).includes('moves'), false, JSON.stringify(looped.problems));
  const still = await checkBlueprint(codeEdit(copy('pendulum'), 'Math.cos(2 * Math.PI * t / period)', '1'));
  assert.deepEqual(still.problems.map(problem => problem.code), ['moves']);
  assert.match(still.problems[0].message, /No part moves during the run/);
});

// The failed job's own two recorded Design answers (packages/web/src/__fixtures__/blueprint-replay-ej_318bdf4.json, cut from docs/features/interact/benchmarks/release-stage1/plan-check-run-ej_318bdf4-record.json), run through the checker with
// the job's settled Plan answer. Recorded then: "No part moves" (the first) and two flat series (the corrected). With both faults fixed they pass checks 4 to 7 and stop at check 8, claim 4. Check 8 is not changed.
const replay = JSON.parse(readFileSync(new URL('./__fixtures__/blueprint-replay-ej_318bdf4.json', import.meta.url), 'utf8'));
for (const which of ['first', 'corrected']) {
  test(`the failed job's ${which} Design answer: checks 4 to 7 pass, and it stops at check 8, claim 4`, async () => {
    const answer = JSON.parse(replay.answers[which]);
    assert.match(replay.recordedProblems[which][0], /No part moves|flat line/, 'recorded as failing check 4 or 7');
    const result = await checkBlueprint(answer, { seeded: replay.settled });
    assert.deepEqual(result.problems.map(problem => [problem.check, problem.code, problem.path]), [[8, 'claims', 'claims[3]']]);
    assert.equal(result.problems[0].message, 'Claim 4 fails: `accuracy` does not rise as `separation` rises from 1.875 to 2.25 (95 to 95).');
  });
}
