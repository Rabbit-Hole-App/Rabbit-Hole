// packages/control-plane/test/learn-assessment-charging.test.js
// Owner item 4 (2026-10-21): assessment stays free to the learner. Every assessment route - keyed, JEV and its escalation,
// rubric, codebase and visual - runs here under the attempts route's own usage context (as the dev-worker boundary makes it
// from usageFeature), with spend enforced and a learner whose monthly allowance is used up. Each provider call is admitted
// platform-funded (FREE_FEATURES: payer reason free_action, charge class free), its cost is recorded, the platform daily
// guard still applies, and the learner's balance does not move. Providers are stubs that count their calls; nothing is paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askJev } from '../src/learn-grade-jev.js';
import { noteUsageIdentity, payerOf, periodOf, toMicros, usageFeature, usageTotals, withUsage } from '../src/learn-usage.js';
import { readCoachingState } from '../src/learn-coaching-store.js';
import { codebaseActivity, learningSourceMap } from '../src/learn-codebase-source-map.js';
import { putUploadedMedia } from '../src/learn-media.js';
import { paperIdentity } from '../src/learn-paper.js';
import { goalOf } from '../../web/src/learn-codebase-goals.js';
import { ANA, CHECK, act, journeyActivity, larger, never, submit, world } from './learn-attempt-fixture.js';
import { ANA_EMAIL, SIGMOID, VISUAL_CASES, WRITING, WRITING_CASES, coachingActivity, replying } from './learn-rich-fixtures.js';
import { taskboard } from './learn-codebase-fixtures.js';

const ALLOWANCE = 10_000; // micros: a $0.01 monthly allowance, all of it already spent
const PERIOD = periodOf(Math.floor(Date.now() / 1000));
const ATTEMPTS = '/api/learn/tutor/attempts';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// Spend enforced (SMALL_ENV dev), the platform cap given, both rich routes on for this test only, and ANA's allowance used up.
function paidWorld(t, { platformUsd = '100' } = {}) {
  const w = world(t, { SMALL_ENV: 'dev', USAGE_PLATFORM_DAY_USD: platformUsd, AI_MONTHLY_ALLOWANCE_USD: (ALLOWANCE / 1e6).toFixed(6), TUTOR_RUBRIC_ASSESSMENT_ENABLED: 'true', TUTOR_VISUAL_ASSESSMENT_ENABLED: 'true' });
  w.sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed', ?, 'user', 'signed_in', 'ask', 'would_charge', ?, 'completed', 1)").run(ANA.userId, PERIOD);
  w.sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('seed-a', 'seed', 'generation', ?, ?, 'settled', 'settled', 1)").run(ALLOWANCE, ALLOWANCE);
  return w;
}
// The request's usage context as the boundary builds it: the feature from the route path, the session user noted.
const asRoute = (env, path = ATTEMPTS) => {
  const scoped = withUsage(env, { feature: usageFeature('POST', path) });
  noteUsageIdentity(scoped, { userId: ANA.userId, email: ANA_EMAIL });
  return scoped;
};
// The real askJev (its own spend admission) over a stub transport answering every question: values[key], else a confident no.
function jevTransport(values = {}) {
  const calls = [];
  const ask = (env, request, options) => askJev(env, request, { ...options, fetchImpl: async (_url, init) => {
    const { questions } = JSON.parse(init.body);
    calls.push(questions);
    return Response.json({ model: 'jev-1.13.0', usage: { input_tokens: 1200 }, answers: Object.fromEntries(Object.keys(questions).map(key => [key, { type: 'noul', noul: values[key] ?? 0.02 }])) });
  } });
  return { calls, ask };
}
// A codebase goal and its first activity, made as the codebase route makes them, on ANA's own readable TaskBoard import.
async function codebaseWorld(w) {
  const snapshot = taskboard('v1');
  w.sqlite.prepare("INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,?,'repo-0a1b2c3d-proj',?,?,'main',?,'ready')").run(ANA.org, ANA_EMAIL, snapshot.repo, snapshot.commit);
  w.sqlite.prepare("INSERT INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,?,'snap')").run(snapshot.commit);
  w.env.REPOSITORY_SNAPSHOTS = { get: async () => ({ json: async () => structuredClone(snapshot) }) };
  const goal = goalOf('understand_feature'), map = await learningSourceMap(snapshot, { goal, question: 'the completion indicator' });
  await act(w.env, ANA, 'create_goal', { label: goal.label, criteria: goal.criteria });
  const goalId = (await readCoachingState(w.env, ANA)).activeGoalId, made = codebaseActivity(goal, map, { focus: 'the completion indicator' });
  const state = (await act(w.env, ANA, 'activate_activity', { activity: { goalId, objective: made.objective, prompt: made.prompt, responseKind: 'text', criterionRefs: goal.criteria.map(c => ({ criterionId: c.criterionId, version: 1 })), sourceRefs: made.sourceRefs, checkpoint: made.checkpoint } })).state;
  return state.activities.find(a => a.activityId === state.activeActivityId);
}
const CODE_ANSWER = 'toggleTask calls updateTask, then setTasks; completionPercent rounds 1/3 to 0 before multiplying by 100.';
const CODE_REPLY = { criteria: [
  { criterionId: 'trace_path', version: 1, fit: 'met', reasoning: 'supported', evidence: ['toggleTask calls updateTask, then setTasks'], explanation: 'x' },
  { criterionId: 'explain_current', version: 1, fit: 'met', reasoning: 'supported', evidence: ['rounds 1/3 to 0 before multiplying by 100'], explanation: 'x' }] };

// Each assessment route: how to make its activity, what the learner submits, and the stubs that stand in for its providers.
const ROUTES = {
  keyed: async w => {
    const { activity } = await journeyActivity(w.env, ANA, { responseKind: 'choice', prompt: CHECK.prompt, sourceRefs: [{ kind: 'journey_probe', id: 'c1', version: 1, locator: { sectionId: 's1' } }] });
    return { activity, content: { optionId: 'y' }, deps: never, providerCalls: () => 0 };
  },
  jev: async w => {
    const { activity } = await journeyActivity(w.env, ANA);
    const jev = jevTransport({ c0_idea0: 0.95 });
    return { activity, content: { text: 'The weighted score goes through the sigmoid.' }, deps: { ask: jev.ask, callModel: never.callModel }, providerCalls: () => jev.calls.length };
  },
  jev_escalation: async w => {
    const { activity } = await journeyActivity(w.env, ANA);
    const jev = jevTransport({ c0_idea0: 0.95, c0_contra0: 0.95 }), escalation = larger(['c0_idea0']);
    return { activity, content: { text: 'The weighted score goes through the sigmoid.' }, deps: { ask: jev.ask, callModel: escalation.callModel }, providerCalls: () => jev.calls.length + escalation.calls.length };
  },
  rubric: async w => {
    const { activity } = await coachingActivity(w.env, { criteria: WRITING });
    const stub = replying(WRITING_CASES.proposalA.reply);
    return { activity, content: { text: WRITING_CASES.proposalA.text }, deps: { ...never, callModel: stub.callModel }, providerCalls: () => stub.calls.length };
  },
  codebase: async w => {
    const activity = await codebaseWorld(w), stub = replying(CODE_REPLY);
    return { activity, content: { text: CODE_ANSWER }, deps: { ...never, callModel: stub.callModel }, providerCalls: () => stub.calls.length };
  },
  visual: async w => {
    w.env.LEARN_MEDIA = { store: new Map(), async put(key, value) { this.store.set(key, new Uint8Array(value)); }, async get(key) { const b = this.store.get(key); return b ? { key, size: b.length, arrayBuffer: async () => b.slice().buffer, httpMetadata: { contentType: 'image/png' } } : null; } };
    const id = (await putUploadedMedia(w.env, paperIdentity({ org: ANA.org, name: ANA.app, email: ANA_EMAIL }), new File([PNG], 'capture.png', { type: 'image/png' }))).id;
    const { activity } = await coachingActivity(w.env, { label: 'Sketch', criteria: SIGMOID, prompt: VISUAL_CASES.labelledSigmoid.prompt, responseKind: 'drawing' });
    const stub = replying(VISUAL_CASES.labelledSigmoid.reply);
    return { activity, content: { image: { id } }, deps: { ...never, callModel: stub.callModel }, providerCalls: () => stub.calls.length };
  },
};
const rows = (w, table, where = "action_id <> 'seed'") => w.sqlite.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY rowid`).all().map(row => ({ ...row }));

test('item 4: every assessment entry point is a free feature; a Tutor plan turn is not', () => {
  const free = path => payerOf({ feature: usageFeature('POST', path), identity: { userId: ANA.userId } });
  for (const path of [ATTEMPTS, `${ATTEMPTS}/at_1/reassess`, '/api/learn/tutor/evaluate', '/api/learn/grade', '/api/learn/assess']) {
    assert.deepEqual((({ payer, payerReason, chargeClass }) => [payer, payerReason, chargeClass])(free(path)), ['user', 'free_action', 'free'], path);
  }
  assert.equal(free('/api/learn/tutor/plan').chargeClass, 'would_charge', 'a Tutor turn is chargeable: assessment must not run inside it');
});

test('item 4: with the learner\'s allowance used up, every assessment route still completes, platform-funded, its provider cost recorded; the balance does not move', async t => {
  for (const [route, make] of Object.entries(ROUTES)) {
    const w = paidWorld(t);
    const before = await usageTotals(w.env.LEARN_DB, ANA.userId, PERIOD);
    assert.equal(before.used, ALLOWANCE, 'exhausted');
    const { activity, content, deps, providerCalls } = await make(w);
    const r = await submit(asRoute(w.env), ANA, activity, { submissionKey: `sub-${route}-charge`, submittedContent: content }, deps);
    assert.equal(r.status, 200, route);
    assert.equal(r.body.assessment.status, 'completed', `${route}: ${r.body.assessment.reason}`);
    const actions = rows(w, 'usage_actions'), attempts = rows(w, 'usage_attempts');
    if (route === 'keyed') {
      assert.deepEqual([providerCalls(), actions.length, attempts.length], [0, 0, 0], 'graded in code: no provider, nothing to record');
    } else {
      assert.ok(providerCalls() > 0, route);
      if (route === 'jev_escalation') assert.deepEqual([providerCalls(), r.body.assessment.provenance.escalation?.outcome], [2, 'completed'], 'JEV, then the larger evaluator');
      assert.equal(attempts.length, providerCalls(), `${route}: every provider call is recorded`);
      assert.deepEqual(actions.map(a => [a.feature, a.payer, a.payer_reason, a.charge_class, a.user_id]), [['tutor_evaluate', 'user', 'free_action', 'free', ANA.userId]], `${route}: one free action`);
      for (const a of attempts) {
        assert.deepEqual([a.status, a.cost_state], ['settled', 'settled'], route);
        assert.ok(Number.isSafeInteger(a.cost_micros) && a.cost_micros > 0, `${route}: provider cost recorded (${a.cost_micros} micros)`);
      }
      // The platform daily guard admitted each call: one ledger row per provider call, settled with its cost.
      const ops = w.sqlite.prepare('SELECT * FROM usage_operations ORDER BY rowid').all();
      assert.deepEqual(ops.map(o => o.op_id).sort(), attempts.map(a => a.attempt_id).sort(), route);
      assert.ok(ops.every(o => o.status === 'settled' && o.cost_usd > 0), route);
      // The cost the assessment's own provenance reports is the cost recorded (where the route reports one).
      const reported = r.body.assessment.provenance.calls.map(c => c.costUsd).filter(v => v != null);
      for (const usd of reported) assert.ok(attempts.some(a => a.cost_micros === toMicros(usd)), `${route}: provenance cost ${usd} is recorded`);
    }
    assert.deepEqual(await usageTotals(w.env.LEARN_DB, ANA.userId, PERIOD), before, `${route}: the learner's balance does not move`);
  }
});

test('item 4: the platform daily guard still applies: refused before any provider call, the answer saved and unassessed', async t => {
  for (const [route, make] of Object.entries(ROUTES)) {
    if (route === 'keyed') continue;
    const w = paidWorld(t, { platformUsd: '0.000001' });
    const { activity, content, deps, providerCalls } = await make(w);
    const r = await submit(asRoute(w.env), ANA, activity, { submissionKey: `sub-${route}-guard`, submittedContent: content }, deps);
    assert.equal(r.status, 200, route);
    assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, providerCalls()], ['unavailable', 'allowance_refused', 0], route);
    assert.deepEqual(rows(w, 'usage_attempts'), [], `${route}: nothing reserved`);
    assert.ok(r.body.attempt.attemptId, 'the answer is saved');
  }
});

test('item 4 contrast: the same assessment dispatched under a chargeable context (a Tutor plan turn) would spend the learner\'s allowance and is refused', async t => {
  const w = paidWorld(t);
  const { activity, content, deps, providerCalls } = await ROUTES.codebase(w);
  const r = await submit(asRoute(w.env, '/api/learn/tutor/plan'), ANA, activity, { submissionKey: 'sub-plan-charge', submittedContent: content }, deps);
  assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, providerCalls()], ['unavailable', 'allowance_refused', 0]);
});
