import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designStack } from './interact-design-fixture.js';

// Brief 36: INTERACT_DESIGN_FIXTURE=layout-cards pins the two scene-layout cards by Depth: brief is the attention card (wide layout, one token-links diagram), detailed is the pendulum card (side-by-side layout).
// Each reaches ready through the real job path (design pinned, approval, template build, validate, headless run, the host's overlap and layout rules) with zero model calls and no outbound fetch.
const CARDS = [['brief', 'stepper-attention-brief'], ['detailed', 'stepper-pendulum-detailed']];
test('the layout-cards pin reaches ready at brief (attention) and detailed (pendulum) through the real job path with zero model calls', async t => {
  const quiet = console.log; console.log = () => {}; t.after(() => { console.log = quiet; });
  const sent = [];
  for (const [depth, planId] of CARDS) {
    const s = designStack(t);
    delete s.deps.descriptionFit; s.deps.buildScene = undefined;
    Object.assign(s.env, { INTERACT_DESIGN_FIXTURE: 'layout-cards', INTERACT_BUILD_KIND: 'template', EXPLAIN_DIAGNOSTICS: 'true', INTERACT_DESCRIPTION_FIT: 'estimate', INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow', INTERACT_SEEK: 'on', INTERACT_INPUTS_V2: 'on', EXPLAIN_PROGRAM_ENABLED: 'true', EXPLAIN_PROGRAM_STATEFUL: 'true' });
    const original = globalThis.fetch;
    globalThis.fetch = async url => { sent.push(String(url)); throw new Error('no model/network call allowed'); };
    t.after(() => { globalThis.fetch = original; });
    const { body } = await s.create({ depth });
    const id = body.job.id;
    const designed = await s.design(id); assert.equal(designed.job.stage, 'awaiting_approval', depth + ': ' + JSON.stringify([designed.job.stopReason, designed.job.failure, designed.job.findings]).slice(0, 900));
    assert.equal((await s.approve(id)).status, 202);
    for (let i = 0; i < 30; i++) {
      await s.actor.alarm();
      const job = s.state.data.get('job:' + id);
      if (['ready', 'failed', 'cancelled'].includes(job.stage) && !job.inFlight) break;
    }
    const job = s.state.data.get('job:' + id);
    assert.equal(job.stage, 'ready', `${depth} (${planId}): ` + JSON.stringify([job.stopReason, job.failure, job.findings]));
    assert.deepEqual(job.build.counts, { build_author: 0, build_review: 0, build_repair: 0 });
    assert.equal(job.calls.length, 0);
    assert.equal(job.build.kind, 'template');
  }
  assert.deepEqual(sent, []);
});
