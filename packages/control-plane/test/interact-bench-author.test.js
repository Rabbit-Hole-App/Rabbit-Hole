// The bench-author harness (scripts/interact/bench-author.mjs) proven with the scripted adapter, $0: each of the three plans passes validate, the headless run and the oracle; a refused reply is a fail row with its first
// problem and a saved reply; benchRole is bench-only (not a registry profile, so no deploy selects it) and every bench model resolves as a valid build_author step; the report reads the rows.
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { PLANS, benchAttempt, benchContext, scriptedBuildAdapterByInput } from '../../../scripts/interact/bench-author.mjs';
import { benchReport } from '../../../scripts/interact/bench-report.mjs';
import { scriptedAdapter } from '../src/interact-fixtures.js';
import { BENCH_MODELS, INTERACT_REGISTRY, benchRole, resolveInteractProfile } from '../src/interact-models.js';
import { tossDraft } from '../../web/src/interact-toss-programs.js';

test('the scripted adapter: each of the three plans passes validate, the headless run and the oracle and the layout rules, at $0, with every stage timed', async () => {
  for (const planName of Object.keys(PLANS)) {
    const rows = await benchAttempt({ planName, model: 'gemini-3.5-flash-lite', ctx: benchContext({ model: 'gemini-3.5-flash-lite', env: {}, scripted: scriptedBuildAdapterByInput() }) });
    assert.equal(rows.length, 1, planName);
    const [row] = rows;
    assert.equal(row.result, 'pass', `${planName}: ${row.firstProblem}`);
    assert.deepEqual([row.round, row.timing, row.validator, row.costUsd], [0, 'v3', 'v1', 0]);
    for (const k of ['msAuthor', 'msValidate', 'msRun', 'msCheck']) assert.equal(typeof row[k], 'number', `${planName} ${k}`);
    assert.ok(row.msRun > 0 && row.msTotal >= row.msRun, `${planName}: the headless run is measured, not zero by construction`);
    assert.ok(row.oracleChecked >= 18, `${planName} oracle rows ${row.oracleChecked}`);
  }
});

test('a build the validator or a rule refuses is a fail row naming its first problem; with rounds 1 the same model is asked again with the problems; the raw reply is saved', async () => {
  const saved = [];
  let calls = 0;
  const adapter = scriptedAdapter({ build_author: ({ input }) => { calls++; const draft = tossDraft('tossOverview'); if (!input.correction) draft.main.program.source = draft.main.program.source.replace('sdk.vector', 'sdk.nope'); else assert.ok(input.correction.problems.length); return { kind: 'scene', ...draft }; } });
  const model = 'accounts/fireworks/models/gpt-oss-120b';
  const rows = await benchAttempt({ planName: 'toss-overview', model, rounds: 1, ctx: benchContext({ model, env: {}, scripted: adapter }), save: data => { saved.push(data); return `saved-${saved.length}`; } });
  assert.equal(calls, 2);
  assert.deepEqual(rows.map(r => [r.round, r.result]), [[0, 'fail'], [1, 'pass']]);
  assert.ok(rows[0].firstProblem && rows[0].repairCauses, 'the failed round names its first problem and its cause');
  assert.deepEqual(rows.map(r => r.replyPath), ['saved-1', 'saved-2']);
  assert.match(benchReport(rows.map(r => ({ ...r, ts: 't' }))), /gpt-oss-120b \| brief \| 1 \| 0\/1 \| 1\/1 /);
});

test('benchRole is bench only: not a registry profile, every bench model is a valid build_author step with the fast profile settings, and an unknown model is refused', () => {
  assert.ok(!Object.keys(INTERACT_REGISTRY.profiles).some(id => /bench/.test(id)));
  for (const model of BENCH_MODELS) {
    const role = benchRole(model);
    assert.equal(role.model, model);
    assert.equal(role.pricingKey.model, model);
    const registry = { ...INTERACT_REGISTRY, profiles: { ...INTERACT_REGISTRY.profiles, b: { version: 1, extends: 'opus-baseline', roles: { build_author: role } } } };
    assert.equal(resolveInteractProfile('b', registry).roles.build_author.model, model, `${model} passes the registry's own role checks`);
  }
  assert.deepEqual([benchRole('accounts/fireworks/models/gpt-oss-120b').settings, benchRole('gemini-3.5-flash').settings], [{ reasoning_effort: 'low', temperature: 0, seed: 7 }, { reasoning_effort: 'low' }]);
  assert.deepEqual(benchRole('claude-sonnet-5-5').settings, { effort: 'low' });
  assert.equal(benchRole('claude-sonnet-5-5').adapter, 'anthropic');
  assert.equal(benchRole('gemini-3.5-flash').credentialRef, benchRole('gemini-3.5-flash-lite').credentialRef);
  assert.throws(() => benchRole('claude-opus-5-5'), /No bench model/);
});

test('deploy-clone.mjs refuses a bench model as the build profile before it touches anything', () => {
  const script = fileURLToPath(new URL('../../../docs/features/interact/evidence/2026-11-12-clone-runs/scripts/deploy-clone.mjs', import.meta.url));
  for (const model of BENCH_MODELS) {
    const r = spawnSync(process.execPath, [script, 'deploy', `INTERACT_BUILD_PROFILE=${model}`], { encoding: 'utf8' });
    assert.equal(r.status, 2, model);
    assert.match(r.stderr, /not a deployable profile/);
  }
});

test('no Opus (owner 2026-11-13 14:30): the bench context refuses an Opus model and any fallback chain, and its adapters refuse an Opus model at the wire', async () => {
  assert.throws(() => benchContext({ model: 'claude-opus-5-5', env: {} }), /No bench model/);
  for (const model of BENCH_MODELS) {
    const ctx = benchContext({ model, env: {}, scripted: scriptedBuildAdapterByInput() });
    assert.ok(!ctx.profile.roles.build_author.fallbacks, model);
    assert.ok(!/opus/i.test(ctx.profile.roles.build_author.model));
    await assert.rejects(() => ctx.adapters.anthropic.call({ config: { model: 'claude-opus-5-5', role: 'build_author' } }), /never calls an Opus model/);
  }
});
