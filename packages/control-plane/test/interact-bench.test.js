// Build-half sprint item 3: the bench judge (interact-bench.js, agents/interact-bench-judge.js, the bench_judge role). Roles are scripted; no model is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BENCH_JUDGE_RUBRIC, BENCH_JUDGE_SCHEMA, BENCH_JUDGE_TOOL, BENCH_JUDGE_VERSION } from '../src/agents/interact-bench-judge.js';
import { benchJudge, benchJudgeInput, benchRubric } from '../src/interact-bench.js';
import { CHECK_LIMITS, buildPlanCaptureCases, headlessCaptureCard } from '../src/interact-checks.js';
import { fixtureContext, fixtureScript } from '../src/interact-fixtures.js';
import { INTERACT_REGISTRY, INTERACT_ROLES, INTERACT_ROLE_IDS, interactReservation, resolveInteractProfile } from '../src/interact-models.js';

const load = name => JSON.parse(readFileSync(new URL(`./fixtures/interact/${name}`, import.meta.url), 'utf8'));
const { artifact, composition } = load('run15-result-artifact.json'), plan = load('run15-plan.json').plan;
const artifacts = { main: { kind: 'program', program: artifact }, supporting: [] };
const captured = async () => {
  const { cases, probes } = buildPlanCaptureCases(plan, composition, artifacts, { limit: CHECK_LIMITS.maxCases });
  return { cases, captures: await headlessCaptureCard({})({ composition, artifacts, cases: [...cases, ...probes] }) };
};
const PASS = { verdict: 'pass', findings: [] };

test('the judge input is blind: claims and observations, frames and traces, and no expected text, no check text, no model or provider', async () => {
  const { cases, captures } = await captured();
  const input = benchJudgeInput(plan, composition, cases, captures);
  for (const c of plan.scene.checkpoints) assert.equal(input.includes(c.expected), false, `checkpoint ${c.id} expected text`);
  for (const c of plan.claims) { assert.equal(input.includes(c.check), false, `claim ${c.id} check text`); assert.ok(input.includes(c.text), `claim ${c.id} text`); }
  for (const o of plan.scene.observations) assert.ok(input.includes(o.text ?? o.id), `observation ${o.id}`);
  assert.doesNotMatch(input, /claude|opus|sonnet|gemini|gpt|fireworks|anthropic|oracle|numeric_mismatch/i);
  assert.match(input, /"capture":"cp-top"/);
  assert.match(input, /"readouts":\{/);
  assert.match(input, /"objects":\[\{/);
  assert.doesNotMatch(input, /probe-/, 'the probes are trace-only, the judge sees the planned states');
  assert.ok(new TextEncoder().encode(input).length <= 70000);
  assert.doesNotMatch(BENCH_JUDGE_RUBRIC, /claude|opus|sonnet|gemini|gpt|fireworks|anthropic/i);
});

test('frames shrink to fit the byte budget; the traces and readouts stay', async () => {
  const { cases, captures } = await captured();
  const fat = captures.map(c => ({ ...c, trace: { ...c.trace, objects: Array.from({ length: 80 }, (_, i) => ({ id: `o${i}`, kind: 'text', x: i, y: i, text: 'x'.repeat(160) })) } }));
  const input = benchJudgeInput(plan, composition, cases, fat);
  assert.ok(new TextEncoder().encode(input).length <= 70000);
  assert.match(input, /"quantities":\{/);
});

test('benchJudge makes the one bench_judge call on the profile\'s Sonnet and returns the verdict, findings, time, cost and the versioned rubric', async () => {
  const { captures } = await captured();
  const finding = { capture: 'cp-top', category: 'spec', severity: 'major', message: 'The readout contradicts the claim.' };
  const ctx = fixtureContext({ script: fixtureScript('standard', { bench_judge: () => ({ verdict: 'fail', findings: [finding] }) }) });
  const judge = await benchJudge({ id: 'j', plan, composition, artifacts, captures }, ctx);
  assert.deepEqual([judge.model, judge.verdict, judge.findings], ['claude-sonnet-5-5', 'fail', [finding]]);
  assert.ok(judge.ms >= 0 && 'costMicros' in judge);
  assert.deepEqual(judge.rubric, await benchRubric());
  assert.equal(judge.rubric.version, BENCH_JUDGE_VERSION);
  assert.match(judge.rubric.hash, /^[0-9a-f]{16}$/);
  const [call] = ctx.adapter.log;
  assert.deepEqual([ctx.adapter.log.length, call.role, call.system, call.images], [1, 'bench_judge', BENCH_JUDGE_RUBRIC, 0]);
  assert.equal(BENCH_JUDGE_TOOL.name, 'report_bench_judgment');
});

test('a reply that does not match the judge schema is refused (nothing is repaired), and the schema has the build_review verdict and finding vocabulary', async () => {
  const { captures } = await captured();
  const ctx = fixtureContext({ script: fixtureScript('standard', { bench_judge: () => ({ verdict: 'maybe', findings: [] }) }) });
  await assert.rejects(() => benchJudge({ id: 'j', plan, composition, artifacts, captures }, ctx), { code: 'schema_mismatch' });
  assert.deepEqual(BENCH_JUDGE_SCHEMA.properties.verdict.enum, ['pass', 'fail']);
  assert.deepEqual(BENCH_JUDGE_SCHEMA.properties.findings.items.properties.severity.enum, ['blocker', 'major', 'minor']);
});

test('bench_judge runs at low effort (settings.effort, passed through the Anthropic adapter) and no other role sets a setting', async () => {
  for (const id of Object.keys(INTERACT_REGISTRY.profiles)) {
    const roles = resolveInteractProfile(id).roles;
    assert.deepEqual([roles.bench_judge.settings, roles.bench_judge.capabilities.settings], [{ effort: 'low' }, ['effort']], id);
    assert.deepEqual(INTERACT_ROLE_IDS.filter(r => r !== 'bench_judge' && roles[r].provider === 'anthropic' && Object.keys(roles[r].settings).length), [], id);
  }
  const { createAnthropicAdapter } = await import('../src/interact-model-adapters.js');
  let body;
  const adapter = createAnthropicAdapter({ env: {}, callModel: async (_env, b) => { body = b; return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'r', input: { ok: true } }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'tool_use', model: 'claude-sonnet-5-5' }), { status: 200 }); } });
  await adapter.call({ config: resolveInteractProfile('opus-baseline').roles.bench_judge, system: 's', schema: { type: 'object', properties: {} }, input: 'x', name: 'r' });
  assert.deepEqual(body.output_config, { effort: 'low' });
});

test('bench_judge: Sonnet 5.5 in every registered profile (never Opus), text only, one call, evaluation, its own phase', () => {
  assert.deepEqual([INTERACT_ROLES.bench_judge.phase, INTERACT_ROLES.bench_judge.kind, INTERACT_ROLES.bench_judge.calls, INTERACT_ROLES.bench_judge.maxImages], ['bench', 'evaluation', 1, 0]);
  for (const id of Object.keys(INTERACT_REGISTRY.profiles)) {
    const role = resolveInteractProfile(id).roles.bench_judge;
    assert.deepEqual([role.model, role.pricingKey.model, role.provider, role.adapter, role.maxImages, role.capabilities.vision], ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'anthropic', 'anthropic', 0, true], id);
  }
  assert.deepEqual(INTERACT_ROLE_IDS.filter(r => resolveInteractProfile('opus-baseline').roles[r].model !== 'claude-opus-5-5'), ['bench_judge']);
});

test('the reservation is unchanged with the role present: the bench judge is in neither phase, so the allowance check before Generate is the same $8.42 build and $5.68 design worst case', () => {
  const r = interactReservation(resolveInteractProfile('opus-baseline'));
  assert.deepEqual(r, { version: 1, profile: { id: 'opus-baseline', version: 1 }, preparationMicros: 5681120, generationMicros: 8420320, unknownRoles: [], perRole: {
    design_author: { calls: 2, boundMicros: 635680 }, design_review: { calls: 4, boundMicros: 595680 }, design_revise: { calls: 3, boundMicros: 675680 },
    build_author: { calls: 2, boundMicros: 815680 }, build_review: { calls: 5, boundMicros: 743520 }, build_repair: { calls: 4, boundMicros: 767840 } } });
  assert.equal('bench_judge' in r.perRole, false);
});
