// INTERACT_CHAIN=on (overnight brief section 2): the stages of an interact job run back to back inside one alarm. Scripted provider only: no paid call, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designStack } from './interact-design-fixture.js';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

const DONE = ['awaiting_approval', 'failed', 'cancelled', 'ready'];

// One job, one alarm at a time until the design stops or the job ends. -> the alarm count, the stages saved in order, the finished job.
async function run(t, env = {}) {
  const s = designStack(t);
  Object.assign(s.env, env);
  const saved = [], save = s.actor.save.bind(s.actor);
  s.actor.save = async job => { if (saved.at(-1) !== job.stage) saved.push(job.stage); return save(job); };
  const { body } = await s.create();
  const id = body.job.id; let alarms = 0;
  for (let i = 0; i < 40; i++) {
    await s.actor.alarm(); alarms++;
    const job = s.state.data.get(`job:${id}`);
    if (DONE.includes(job.stage) && !job.inFlight) break;
  }
  return { s, id, alarms, saved, job: s.state.data.get(`job:${id}`) };
}
// The part of a job that is the same whatever the alarm cadence (no ids, clocks or timing).
const shape = r => ({ stage: r.job.stage, finalHash: r.job.design.finalHash, counts: r.job.design.counts, roles: r.s.model.roles(), calls: r.job.calls.map(c => [c.role, c.status]) });

test('stages chain inside one alarm: the design reaches awaiting_approval in one alarm instead of one per stage, with the same stages saved in the same order and the same result', async t => {
  const plain = await run(t), chained = await run(t, { INTERACT_CHAIN: 'on' });
  assert.ok(plain.alarms > 2, `unchained takes one alarm per stage (${plain.alarms})`);
  assert.equal(chained.alarms, 1);
  assert.equal(chained.job.stage, 'awaiting_approval');
  assert.deepEqual(chained.saved, plain.saved, 'every stage is saved before the next one starts, as before');
  assert.deepEqual(shape(chained), shape(plain), 'the same final job minus timing');
});

test('a chain that runs out of budget yields to the alarm and the next alarm resumes at the saved stage, to the same result', async t => {
  const plain = await run(t), s = designStack(t);
  Object.assign(s.env, { INTERACT_CHAIN: 'on', INTERACT_CHAIN_BUDGET_MS: '0' });
  const { body } = await s.create(), id = body.job.id;
  await s.actor.alarm();
  const first = s.state.data.get(`job:${id}`);
  assert.ok(!DONE.includes(first.stage), `zero budget runs the first stage only and stops (${first.stage})`);
  delete s.env.INTERACT_CHAIN_BUDGET_MS;
  for (let i = 0; i < 40; i++) { await s.actor.alarm(); if (s.state.data.get(`job:${id}`).stage === 'awaiting_approval') break; }
  const done = { s, job: s.state.data.get(`job:${id}`) };
  assert.equal(done.job.stage, 'awaiting_approval');
  assert.deepEqual(shape(done), shape(plain));
});

test('the setting is off by default: no chaining without INTERACT_CHAIN=on', async t => {
  const off = await run(t, { INTERACT_CHAIN: 'off' });
  assert.ok(off.alarms > 2);
});
