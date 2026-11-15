import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { designStack } from './interact-design-fixture.js';

const proof = JSON.parse(readFileSync(new URL('../../../docs/features/interact/references/stepper-merge-brief-proof.json', import.meta.url), 'utf8'));
// The clone's capabilities (brief 27): inputs, seek, programs on, the template build, the dev environment, the stepper design pin.
const CLONE = { SMALL_ENV: 'dev', INTERACT_DESIGN_FIXTURE: 'stepper', INTERACT_BUILD_KIND: 'template', INTERACT_INPUTS_V2: 'on', INTERACT_SEEK: 'on', EXPLAIN_PROGRAM_ENABLED: 'true', EXPLAIN_PROGRAM_STATEFUL: 'true', INTERACT_DESCRIPTION_FIT: 'estimate', INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow' };
// The guest has a 50 ms deadline (limits.interruptMs) and the stepper program takes 15 to 25 ms warm, so a loaded machine can trip it: only that
// host timing failure is retried; every other failure ends the test at once.
const timing = job => job.stage === 'failed' && /runtime_limit\): time limit/.test(job.failure?.message ?? '');

async function readyJob(t) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const s = designStack(t);
    delete s.deps.descriptionFit; s.deps.buildScene = undefined;
    Object.assign(s.env, CLONE);
    const { body } = await s.create({ depth: 'brief' });
    const id = body.job.id;
    assert.equal((await s.design(id)).job.stage, 'awaiting_approval', 'the pinned plan passes the design verify (runtimeProblems) with no revision loop');
    assert.equal((await s.approve(id)).status, 202);
    for (let i = 0; i < 30; i++) {
      await s.actor.alarm();
      const job = s.state.data.get('job:' + id);
      if (['ready', 'failed', 'cancelled'].includes(job.stage) && !job.inFlight) break;
    }
    const job = s.state.data.get('job:' + id);
    if (timing(job) && attempt < 3) continue;
    return { s, id, job };
  }
}

test('the pinned merge-sort Brief job builds through the sealed path with zero model calls and no outbound fetch', async t => {
  const quiet = console.log; console.log = () => {}; t.after(() => { console.log = quiet; });
  const sent = [], original = globalThis.fetch;
  globalThis.fetch = async url => { sent.push(String(url)); throw new Error('no model/network call allowed'); };
  t.after(() => { globalThis.fetch = original; });
  const { s, id, job } = await readyJob(t);
  assert.equal(job.stage, 'ready', JSON.stringify([job.stopReason, job.failure, job.findings]));
  assert.deepEqual(job.build.counts, { build_author: 0, build_review: 0, build_repair: 0 });
  assert.equal(job.build.kind, 'template');
  assert.equal(job.calls.length, 0);
  assert.deepEqual(s.model.roles(), []);
  assert.deepEqual(sent, []);
  const { main } = s.state.data.get('build:' + id + ':artifacts');
  assert.equal(main.kind, 'program');
  // The sealed artifact carries the plan's own tuple and manifest capabilities: sdk-8 with the index input's inputs_v2 and the tuple-bearing figures.
  assert.equal(main.program.manifest.capabilities.join(','), 'figures,inputs_v2');
  assert.equal(main.program.sdkVersion, 'sdk-8');
  // The four frames of the sealed program against the approved proof: object count and state id per state.
  const engine = await loadEngine(), data = s.stored(id, 'final').plan?.scene?.data ?? s.stored(id, 'final').scene?.data;
  const states = data.data.variants[0].states, cases = [];
  assert.equal(states.length, proof.cases.length);
  for (let step = 0; step < states.length; step++) {
    let out;
    for (let tries = 0; tries < 4; tries++) {
      out = runProgram(engine, { source: main.program.source, sdkVersion: 'sdk-8', operation: 'evaluate', request: { requestId: 'step-' + step, inputs: { step }, time: 0, seed: 1, state: null } });
      if (out.ok || out.code !== 'runtime_limit') break;
    }
    assert.equal(out.ok, true, JSON.stringify(out));
    cases.push({ step, stateId: states[step].id, objects: out.value.frame.objects.length });
  }
  assert.deepEqual(cases, proof.cases.map(({ step, stateId, objects }) => ({ step, stateId, objects })));
  assert.deepEqual(cases.map(c => c.objects), [59, 58, 59, 58]);
});
