// INTERACT_CHAIN=on (overnight brief section 2): the stages of an interact job run back to back inside one alarm. Scripted provider only: no paid call, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designStack } from './interact-design-fixture.js';
import { chainRecoveryMs } from '../src/explain-job.js';

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

// ---- the recovery alarm while chaining (brief 19): short for a stage that makes no model call, 30 s for one that does ----
test('the chain recovery alarm is 5 s for a stage with no model call, 30 s for a model stage or a call in flight, and the setting is bounded', () => {
  const quiet = { flow: {}, stage: 'validating' }, model = { flow: {}, stage: 'design_authoring' };
  assert.equal(chainRecoveryMs({}, quiet), 5000);
  for (const stage of ['design_verifying', 'validating', 'rendering']) assert.equal(chainRecoveryMs({}, { flow: {}, stage }), 5000, stage);
  for (const stage of ['preparing', 'design_authoring', 'design_reviewing', 'design_revising', 'reviewing', 'repairing']) assert.equal(chainRecoveryMs({}, { flow: {}, stage }), 30000, stage);
  assert.equal(chainRecoveryMs({}, { ...quiet, inFlight: { key: 'k' } }), 30000, 'a call in flight keeps the long recovery');
  assert.equal(chainRecoveryMs({ INTERACT_CHAIN_RECOVERY_MS: '2000' }, quiet), 2000);
  for (const bad of ['999', '30001', 'x', '-5']) assert.equal(chainRecoveryMs({ INTERACT_CHAIN_RECOVERY_MS: bad }, quiet), 5000, `invalid ${bad} falls back to the default`);
  assert.equal(chainRecoveryMs({ INTERACT_CHAIN_RECOVERY_MS: '2000' }, model), 30000);
  assert.equal(chainRecoveryMs({}, { flow: {}, stage: 'authoring' }), 30000, 'a model build (no template gate) calls build_author');
  assert.equal(chainRecoveryMs({ INTERACT_BUILD_KIND: 'template' }, { flow: {}, stage: 'authoring', design: { plan: { scene: { template: 'nope' } } } }), 30000, 'an unknown template takes the model build');
});

test('a chained alarm arms 5 s for the quiet stages and 30 s for the model ones; unchained it arms only the 30 s; the log line names the recovery delay', async t => {
  async function armed(env) {
    const s = designStack(t); Object.assign(s.env, env);
    const delays = [], storage = s.actor.state.storage, real = storage.setAlarm?.bind(storage), lines = [], log = console.log;
    storage.setAlarm = async at => { delays.push(at - Date.now()); return real?.(at); };
    console.log = line => lines.push(line);
    try { const { body } = await s.create(); for (let i = 0; i < 6; i++) { await s.actor.alarm(); const j = s.state.data.get(`job:${body.job.id}`); if (['awaiting_approval', 'failed', 'ready'].includes(j.stage)) break; } } finally { console.log = log; }
    return { delays: delays.map(d => Math.round(d / 1000) * 1000), lines };
  }
  const plain = await armed({}), chained = await armed({ INTERACT_CHAIN: 'on' });
  assert.ok(plain.delays.every(d => d === 30000 || d <= 1000), `unchained: only the 30 s recovery (and the 1 s wake): ${plain.delays}`);
  assert.ok(chained.delays.includes(5000), `chained arms 5 s for a quiet stage: ${chained.delays}`);
  assert.ok(chained.delays.includes(30000), `chained keeps 30 s for the model stage: ${chained.delays}`);
  const alarmLine = chained.lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(l => l?.event === 'interact_alarm');
  assert.ok(alarmLine && 'recoveryMs' in alarmLine, 'the interact_alarm line carries the recovery delay');
});
