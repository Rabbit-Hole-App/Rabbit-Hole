// INT-07B: the shared runner, persistence and the script entry. The stage functions are the ones the durable job calls; here they run against an
// in-memory store, a run-directory store and the real CLI, all with scripted roles (zero paid calls, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureDraft, standardOracle } from '../../web/src/interact-build-fixtures.js';
import { resolveInteractProfile } from '../src/interact-models.js';
import { StaleRevisionError, TERMINAL, advanceInteract, createMemoryStore, initialState, runInteract } from '../src/interact-runner.js';
import { fixtureCaptureCard, fixtureRun, fixtureScript, scriptedAdapter } from '../src/interact-fixtures.js';
import { createRunDirStore } from '../../../scripts/interact/run-dir-store.mjs';

const profile = resolveInteractProfile('opus-baseline');
const REQUEST = { runId: 'run-1', prompt: 'Why does a thrown ball still accelerate at the top?', depth: 'standard', fixture: 'toss-drop-standard' };
const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
let fetches;
test.beforeEach(t => {
  const original = globalThis.fetch;
  fetches = 0;
  globalThis.fetch = () => { fetches += 1; throw new Error('network call in a fixture test'); };
  t.after(() => { globalThis.fetch = original; assert.equal(fetches, 0, 'no network, no paid call'); });
});

// A fresh ctx per "process": new adapters, so a call made after a simulated restart is visible in its log.
async function ctxFor(script, extra = {}) {
  const fx = await fixtureRun('toss-drop-standard', 'standard');
  const adapter = scriptedAdapter(script ?? fixtureScript('standard'));
  return { ...fx, adapters: { anthropic: adapter }, adapter, profile, ...extra };
}
const corrupt = () => { const d = fixtureDraft('standard'); d.main.program.source = d.main.program.source.replace('velocity = U - G * t;', 'velocity = -(U - G * t);'); return d; };
const WRONG = script => ({ ...script, build_author: () => ({ kind: 'scene', ...corrupt() }) });
const oracle = standardOracle();

// ---- the stages (INT-07B-C01, C03) ----
test('one stage per advance: design, approval, build, check, deliver; a card exists only at card_ready', async () => {
  const ctx = await ctxFor(null, { oracle });
  let state = await initialState('s1', REQUEST, profile);
  const seen = [state.stage], effects = [];
  const approval = null;
  for (let i = 0; i < 10 && !TERMINAL.includes(state.stage); i += 1) {
    const step = await advanceInteract(state, { ...ctx, approval: state.stage === 'plan_ready' ? { planHash: state.planHash } : approval });
    state = { ...state, ...step.patch, stage: step.stage, effects: [...state.effects, ...step.effects] }; effects.push(...step.effects); seen.push(state.stage);
  }
  assert.deepEqual(seen, ['new', 'plan_ready', 'approved', 'built', 'checked', 'card_ready']);
  assert.deepEqual(effects.map(e => e.type), ['publish_plan', 'deliver_card']);
  assert.ok(effects.every(e => e.key.startsWith('s1:') && e.acked === false));
  assert.ok(effects[0].key.endsWith(state.planHash) && effects[1].key.endsWith(state.composition.envelopeHash), 'keys bind the run and the plan or result hash');
  assert.equal((await advanceInteract(state, ctx)).stage, 'card_ready', 'a finished run does nothing more');
});

test('--until plan stops at the reviewed plan: no builder call, no card, and the result is not labelled a built card', async () => {
  const ctx = await ctxFor(), store = createMemoryStore();
  const state = await runInteract(REQUEST, { ctx, store, until: 'plan' });
  assert.equal(state.stage, 'plan_ready'); assert.match(state.planHash, /^[0-9a-f]{64}$/);
  assert.equal(ctx.adapter.log.length, 0, 'builder calls are zero before approval'); assert.equal(state.artifacts, undefined); assert.equal(state.result, undefined);
  assert.deepEqual(state.effects.map(e => [e.type, e.acked]), [['publish_plan', true]], 'the plan is published once, by key, and acknowledged');
});

test('the runner never invents an approval: none waits, a different plan hash is refused, only the ready plan hash builds', async () => {
  const store = createMemoryStore();
  let ctx = await ctxFor();
  let state = await runInteract(REQUEST, { ctx, store, until: 'card' });
  assert.equal(state.stage, 'plan_ready'); assert.equal(state.waiting, 'approval'); assert.equal(ctx.adapter.log.length, 0);
  ctx = await ctxFor();
  state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: 'b'.repeat(64) });
  assert.equal(state.stage, 'plan_ready'); assert.equal(state.refused.code, 'approval_mismatch'); assert.equal(ctx.adapter.log.length, 0, 'a refused approval builds nothing');
  const hash = (await store.load(REQUEST.runId)).planHash;
  state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: hash });
  assert.equal(state.stage, 'card_ready'); assert.equal(state.approval.planHash, hash);
});

// ---- resume and persistence (INT-07B-C09, C12) ----
test('resume after each completed stage reaches the same card with the same IDs, and a reload makes no second role call', async () => {
  const store = createMemoryStore();
  let state = await runInteract(REQUEST, { ctx: await ctxFor(null, { oracle }), store, until: 'plan' });
  const hash = state.planHash;
  const logs = [];
  // A new process per stage: the second run re-reads the stored state and must pick up exactly where the first stopped.
  for (let i = 0; i < 8 && !TERMINAL.includes((await store.load(REQUEST.runId)).stage); i += 1) {
    const ctx = await ctxFor(null, { oracle });
    const before = await store.load(REQUEST.runId);
    const step = await advanceInteract(before, { ...ctx, approval: { planHash: hash } });
    await store.save(REQUEST.runId, before.revision, { ...before, ...step.patch, stage: step.stage, effects: [...before.effects, ...step.effects] });
    logs.push(ctx.adapter.log.map(l => l.role));
  }
  state = await store.load(REQUEST.runId);
  assert.equal(state.stage, 'card_ready');
  assert.deepEqual(logs.flat(), ['build_author', 'build_review'], 'each role was called once, in its own process');
  assert.deepEqual(state.calls.map(c => c.id), ['run-1:build_author:1', 'run-1:build_review:1']);
  // A reload of the finished run is free.
  const reload = await ctxFor(null, { oracle });
  const again = await runInteract(REQUEST, { ctx: reload, store, until: 'card', approvedPlanHash: hash });
  assert.equal(reload.adapter.log.length, 0, 'no role call on reload'); assert.equal(again.result.envelopeHash, state.result.envelopeHash); assert.equal(again.calls.length, 2);
});

test('a different profile or request on a saved run is refused; a stale save is refused', async () => {
  const store = createMemoryStore();
  await runInteract(REQUEST, { ctx: await ctxFor(), store, until: 'plan' });
  const other = { ...resolveInteractProfile('opus-baseline'), version: 2 };
  await assert.rejects(runInteract(REQUEST, { ctx: await ctxFor(null, { profile: other }), store }), error => error.code === 'profile_mismatch');
  await assert.rejects(runInteract({ ...REQUEST, prompt: 'something else' }, { ctx: await ctxFor(), store }), error => error.code === 'request_mismatch');
  const saved = await store.load(REQUEST.runId);
  await assert.rejects(store.save(REQUEST.runId, saved.revision - 1, saved), StaleRevisionError);
  assert.equal(await store.save(REQUEST.runId, saved.revision, saved), saved.revision + 1);
});

test('effects are applied after the durable write, replayed by key until acknowledged, and never duplicated', async () => {
  const store = createMemoryStore(), applied = [];
  let fail = true;
  const applyEffect = async e => { if (fail && e.type === 'deliver_card') { fail = false; throw new Error('delivery store unavailable'); } applied.push(e.key); };
  const first = await ctxFor(null, { oracle, applyEffect });
  await runInteract(REQUEST, { ctx: first, store, until: 'plan' });
  const hash = (await store.load(REQUEST.runId)).planHash;
  await assert.rejects(runInteract(REQUEST, { ctx: first, store, until: 'card', approvedPlanHash: hash }), /delivery store unavailable/);
  const crashed = await store.load(REQUEST.runId);
  assert.equal(crashed.stage, 'card_ready', 'the state write came first'); assert.equal(crashed.effects.find(e => e.type === 'deliver_card').acked, false);
  const calls = crashed.calls.length;
  const restart = await ctxFor(null, { oracle, applyEffect });
  const done = await runInteract(REQUEST, { ctx: restart, store, until: 'card', approvedPlanHash: hash });
  assert.equal(restart.adapter.log.length, 0, 'replaying an effect makes no model call'); assert.equal(done.calls.length, calls);
  assert.ok(done.effects.every(e => e.acked)); assert.equal(applied.filter(k => k.includes('deliver_card')).length, 1, 'one delivery, keyed by the result hash');
  assert.equal(new Set(applied).size, applied.length);
});

// ---- repair, exhaustion, failure (INT-05) through the runner ----
test('a wrong candidate is repaired once through the runner and the card is delivered with one correction round', async () => {
  const fixed = fixtureDraft('standard'), script = fixtureScript('standard', { build_author: () => ({ kind: 'scene', ...corrupt() }), build_repair: () => ({ operation: 'artifacts', main: fixed.main, supporting: fixed.supporting, reason: 'sign' }) });
  const ctx = await ctxFor(script, { oracle }), store = createMemoryStore();
  await runInteract(REQUEST, { ctx, store, until: 'plan' });
  const state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: (await store.load(REQUEST.runId)).planHash });
  assert.equal(state.stage, 'card_ready'); assert.equal(state.round, 1);
  assert.deepEqual(state.calls.map(c => c.role), ['build_author', 'build_repair', 'build_review'], 'the reviewer saw only the repaired candidate');
  assert.equal(state.failure, null);
});

test('an exhausted candidate never becomes ready: three repairs, then failed, with no delivery', async () => {
  const script = { ...fixtureScript('standard'), build_author: () => ({ kind: 'scene', ...corrupt() }), build_repair: ({ n }) => { const d = corrupt(); d.main.program.source += `\n// attempt ${n}`; return { operation: 'artifacts', main: d.main, supporting: d.supporting, reason: `try ${n}` }; } };
  const ctx = await ctxFor(script, { oracle }), store = createMemoryStore();
  await runInteract(REQUEST, { ctx, store, until: 'plan' });
  const state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: (await store.load(REQUEST.runId)).planHash });
  assert.equal(state.stage, 'failed'); assert.equal(state.failure.kind, 'repair_exhausted'); assert.equal(state.round, 3);
  assert.equal(ctx.adapter.log.filter(l => l.role === 'build_repair').length, 3, 'at most three correction rounds');
  assert.equal(ctx.adapter.log.filter(l => l.role === 'build_review').length, 0, 'the checks refused every candidate before any review');
  assert.ok(!state.effects.some(e => e.type === 'deliver_card')); assert.equal(state.result, undefined);
  assert.ok(state.effects.some(e => e.type === 'stop'));
});

test('a reviewer that never accepts is bounded by its call ceiling and the shared rounds; nothing is delivered', async () => {
  const reject = ({ input }) => ({ captures: String(input).match(/Captures to review: (.*)/)[1].split(', ').map(id => ({ id, semantic: 'fail', visual: 'pass', findings: [{ verdict: 'semantic', category: 'spec', severity: 'major', message: 'no', repairable: true }] })) });
  const nudge = ({ n }) => { const d = fixtureDraft('standard'); d.main.program.source += `\n// n${n}`; return { operation: 'artifacts', main: d.main, supporting: d.supporting }; };
  const ctx = await ctxFor({ ...fixtureScript('standard'), build_review: reject, build_repair: nudge }, { oracle }), store = createMemoryStore();
  await runInteract(REQUEST, { ctx, store, until: 'plan' });
  const state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: (await store.load(REQUEST.runId)).planHash });
  assert.equal(state.stage, 'failed'); assert.equal(ctx.adapter.log.filter(l => l.role === 'build_review').length, 4); assert.equal(ctx.adapter.log.filter(l => l.role === 'build_repair').length, 3);
  assert.ok(!state.effects.some(e => e.type === 'deliver_card'));
});

test('build failures are told apart: a gap stops the run, an unknown outcome blocks it without a resend, a render outage retries then blocks', async () => {
  let ctx = await ctxFor({ ...fixtureScript('standard'), build_author: () => ({ kind: 'capability_gap', gap: { needs: ['experiment'], reason: 'No such control.' } }) }), store = createMemoryStore();
  await runInteract(REQUEST, { ctx, store, until: 'plan' });
  let state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: (await store.load(REQUEST.runId)).planHash });
  assert.equal(state.stage, 'failed'); assert.equal(state.failure.kind, 'capability_gap'); assert.equal(state.calls.length, 1);

  const { InteractModelError } = await import('../src/interact-models.js');
  ctx = await ctxFor({ ...fixtureScript('standard'), build_author: () => { throw new InteractModelError('unknown_outcome', 'timeout', { sent: true }); } }); store = createMemoryStore();
  await runInteract(REQUEST, { ctx, store, until: 'plan' });
  state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: (await store.load(REQUEST.runId)).planHash });
  assert.equal(state.stage, 'blocked'); assert.equal(state.failure.kind, 'unknown_outcome');
  const reload = await ctxFor(); await runInteract(REQUEST, { ctx: reload, store, until: 'card', approvedPlanHash: state.planHash });
  assert.equal(reload.adapter.log.length, 0, 'an unknown outcome is never resent by a reload');

  const { RenderError } = await import('../src/explain-render.js');
  let attempts = 0;
  ctx = await ctxFor(null, { captureCard: async () => { attempts += 1; throw new RenderError('render_unavailable', 'down'); } }); store = createMemoryStore();
  await runInteract(REQUEST, { ctx, store, until: 'plan' });
  state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: (await store.load(REQUEST.runId)).planHash });
  assert.equal(state.stage, 'blocked'); assert.equal(state.failure.kind, 'render_unavailable'); assert.equal(attempts, 3, 'recaptured twice without a model call or a correction round');
  assert.equal(state.round, 0); assert.equal(ctx.adapter.log.filter(l => l.role === 'build_repair').length, 0);
});

test('cancel fences the run: an aborted signal ends it failed with no card', async () => {
  const store = createMemoryStore(), plain = await ctxFor();
  await runInteract(REQUEST, { ctx: plain, store, until: 'plan' });
  const ctx = await ctxFor(null, { signal: AbortSignal.abort() });
  const state = await runInteract(REQUEST, { ctx, store, until: 'card', approvedPlanHash: (await store.load(REQUEST.runId)).planHash });
  assert.equal(state.stage, 'failed'); assert.equal(state.failure.kind, 'cancelled'); assert.equal(ctx.adapter.log.length, 0, 'a cancelled run sends nothing'); assert.ok(!state.effects.some(e => e.type === 'deliver_card'));
});

test('the role ceilings of the whole run are enforced before anything is sent', async () => {
  const ctx = await ctxFor(), store = createMemoryStore();
  await runInteract(REQUEST, { ctx, store, until: 'plan' });
  const saved = await store.load(REQUEST.runId);
  const used = { ...saved, stage: 'approved', approval: { planHash: saved.planHash }, calls: [{ role: 'build_author', id: 'x:build_author:1' }, { role: 'build_author', id: 'x:build_author:2' }] }; // the ceiling is 2: the build and its one correction
  const step = await advanceInteract(used, { ...ctx });
  assert.equal(step.stage, 'failed'); assert.equal(step.patch.failure.kind, 'call_ceiling'); assert.equal(ctx.adapter.log.length, 0);
});

// ---- the run-directory store and the script (INT-07B-C06 to C10) ----
test('the run-directory store writes atomically, refuses a stale revision and records an effect once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'interact-store-'));
  try {
    const store = createRunDirStore(dir), ctx = await ctxFor();
    const state = await runInteract(REQUEST, { ctx, store, until: 'plan' });
    const files = readdirSync(dir);
    assert.ok(['state.json', 'request.json', 'profile.json', 'plan.json', 'result.json', 'calls.jsonl'].every(f => files.includes(f)), files.join(','));
    assert.ok(!files.some(f => f.endsWith('.tmp')), 'no half-written file is left behind');
    assert.ok(!/key|secret|token/i.test(readFileSync(join(dir, 'profile.json'), 'utf8').replace(/credentialRef/g, '')), 'profile.json holds no credential');
    const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    assert.equal(result.builtCard, false); assert.equal(result.stage, 'plan_ready'); assert.equal(result.paidCalls, 0);
    await assert.rejects(store.save(REQUEST.runId, 0, state), StaleRevisionError);
    await store.applyEffect({ type: 'x', key: 'k1', payload: {} }); await store.applyEffect({ type: 'x', key: 'k1', payload: {} });
    assert.equal(readFileSync(join(dir, 'effects.jsonl'), 'utf8').trim().split('\n').filter(l => l.includes('"k1"')).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the script builds every reference row and a different subject from the same stages: the printed hash, zero paid calls, the matching oracle compared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'interact-cli-rows-'));
  const cli = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/interact/run.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '', CELERIS_API_KEY: '' } });
  const rows = [['toss-drop-standard', 'overview', 2, 'static', null], ['toss-drop-standard', 'deep', 20, 'experiment', 'Time since launch'], ['pendulum-period', 'standard', 6, 'experiment', null]];
  try {
    for (const [fixture, depth, minimum, mode, label] of rows) {
      const run = join(dir, `${fixture}-${depth}`);
      const plan = cli('--fixture', fixture, '--depth', depth, '--until', 'plan', '--run-dir', run);
      assert.equal(plan.status, 0, plan.stderr); assert.match(plan.stdout, /zero paid calls/);
      const hash = plan.stdout.match(/planHash=([0-9a-f]{64})/)[1];
      const card = cli('--resume', run, '--until', 'card', '--approve-plan-hash', hash);
      assert.equal(card.status, 0, card.stderr + card.stdout); assert.match(card.stdout, /card_ready: 2 scripted role calls, 0 paid calls/);
      const compared = Number(card.stdout.match(/(\d+) oracle comparisons/)?.[1]);
      assert.ok(compared >= minimum, `${fixture} ${depth}: the oracle compared ${compared} values`);
      const composition = JSON.parse(readFileSync(join(run, 'composition.json'), 'utf8'));
      assert.deepEqual([composition.main.mode, composition.main.timeline?.label ?? null], [mode, label], `${fixture} ${depth}`);
    }
    assert.notEqual(cli('--fixture', 'pendulum-period', '--depth', 'deep', '--until', 'plan', '--run-dir', join(dir, 'bad')).status, 0, 'a depth the fixture does not have makes no plan');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the script runs the same stages: plan only, then the printed hash builds a fixture card with zero paid calls; a wrong hash and a reused directory exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'interact-cli-')), run = dir2 => join(dir, dir2);
  const cli = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/interact/run.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '', CELERIS_API_KEY: '' } });
  try {
    const plan = cli('--fixture', 'toss-drop-standard', '--depth', 'standard', '--until', 'plan', '--run-dir', run('p'));
    assert.equal(plan.status, 0, plan.stderr); assert.match(plan.stdout, /zero paid calls/); assert.match(plan.stdout, /plan_ready \(a plan only, no card was built\)/);
    const hash = plan.stdout.match(/planHash=([0-9a-f]{64})/)[1];
    assert.equal(JSON.parse(readFileSync(run('p/result.json'), 'utf8')).builtCard, false);
    const wrong = cli('--resume', run('p'), '--until', 'card', '--approve-plan-hash', 'c'.repeat(64));
    assert.equal(wrong.status, 2, wrong.stdout); assert.match(wrong.stderr, /approval refused/);
    assert.equal(cli('--resume', run('p'), '--until', 'card').status, 2, 'no approval, no card');
    assert.equal(cli('--fixture', 'toss-drop-standard', '--run-dir', run('p')).status, 2, 'a used directory is resumed, never overwritten');
    const card = cli('--resume', run('p'), '--until', 'card', '--approve-plan-hash', hash);
    assert.equal(card.status, 0, card.stderr); assert.match(card.stdout, /card_ready: 2 scripted role calls, 0 paid calls/); assert.match(card.stdout, /41 oracle comparisons/);
    const result = JSON.parse(readFileSync(run('p/result.json'), 'utf8'));
    assert.deepEqual([result.status, result.builtCard, result.paidCalls, result.planHash], ['card_ready', true, 0, hash]);
    assert.ok(existsSync(run('p/composition.json')) && existsSync(run('p/checks.json')) && existsSync(run('p/calls.jsonl')));
    assert.equal(readFileSync(run('p/effects.jsonl'), 'utf8').trim().split('\n').length, 2, 'publish_plan and deliver_card, once each');
    const again = cli('--resume', run('p'), '--until', 'card', '--approve-plan-hash', hash);
    assert.equal(again.status, 0); assert.equal(readFileSync(run('p/calls.jsonl'), 'utf8').trim().split('\n').length, 2, 'a reload made no second role call');
    assert.equal(cli('--prompt', 'x', '--run-dir', run('paid')).status, 2, 'the paid path is not wired into the script');
    assert.equal(cli('--fixture', 'nope', '--run-dir', run('q')).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
