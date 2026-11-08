// EXP-09-C02 / EXP-11-C05, C08, C09 (docs/features/explain.md): the written /explain benchmark harness. Entirely offline: every provider is a scripted double and the
// real generateArtifact / production validator runs behind it. These tests prove the harness, its files and its honesty rules, not any model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExplanationProfileError, explanationProfileBinding } from '../src/explanation-models.js';
import {
  BenchmarkError, InterruptRun, LIVE_REFUSAL, LiveRefusedError, RUN_ID_RE, applyCorrections, assertSameEvidenceClass, authorInput, createVirtualClock, deriveProfile, fixtureProvider, loadCorpusFromFiles,
  hashCorpusFiles, makeCorrection, makeRunId, orderAttempts, planRun, presentableAsLive, redactorFor, registryFromConfig, resolveMatrix, runBenchmark, stageCeilings,
} from '../src/explanation-benchmark.js';
import { createRunStore, freezeCorpus, loadCorpus, readCorpusFiles } from '../src/explanation-benchmark-io.js';
import { deterministicEvaluator, evaluateCard, modelEvaluatorStub, EvaluatorRefusedError, summarize, summaryCsv } from '../src/explanation-benchmark-eval.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const corpusDir = resolve(repo, 'benchmarks/explain/corpus/v2');
const config = JSON.parse(await readFile(resolve(repo, 'benchmarks/explain/fixture-config.json'), 'utf8'));
const registry = registryFromConfig(config);
const corpus = await loadCorpus(corpusDir);
const matrixOf = (...ids) => resolveMatrix({ profileIds: ids, registry });
const NOW = new Date('2026-11-08T12:00:00Z');
const tmp = () => mkdtemp(join(tmpdir(), 'explain-bench-'));
const lines = async path => (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
const allFiles = async dir => (await readdir(dir, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).map(e => join(e.parentPath, e.name));

// One fixture run into a fresh temp directory. `extra` overrides any runBenchmark option.
async function run(profileIds, extra = {}) {
  const dir = extra.dir ?? await tmp();
  const matrix = await matrixOf(...profileIds);
  const type = extra.mode ?? 'fixture';
  const store = createRunStore({ dir, type, redact: extra.redact ?? redactorFor({}), root: extra.root });
  const runId = extra.runId ?? makeRunId({ now: NOW, codeSha: 'abc1234', suffix: 'test01' });
  const result = await runBenchmark({ mode: 'fixture', runId, corpus, matrix, config, store, codeSha: 'abc1234', wall: () => NOW, ...extra });
  return { dir, store, result, runId, matrix, rows: await lines(join(dir, 'results.jsonl')), calls: await lines(join(dir, 'calls.jsonl')) };
}
const row = (rows, profile, caseId) => rows.find(r => r.profile.id === profile && r.caseId === caseId);
const cleanup = dir => rm(dir, { recursive: true, force: true });

test('the run id is <UTC-YYYYMMDDTHHMMSSZ>-<short-code-sha>-<unique-suffix> and suffixes differ', () => {
  assert.equal(makeRunId({ now: NOW, codeSha: 'abc1234', suffix: 'test01' }), '20261108T120000Z-abc1234-test01');
  const a = makeRunId({ now: NOW, codeSha: 'abc1234' }), b = makeRunId({ now: NOW, codeSha: 'abc1234' });
  assert.match(a, RUN_ID_RE); assert.notEqual(a, b);
  assert.throws(() => makeRunId({ now: NOW, codeSha: 'not hex!', suffix: 'x' }), e => e.code === 'bad_run_id');
});

test('the frozen corpus covers EX-01 at every Depth, EX-07, prose-only at every Depth, a held-out topic and seeded defects, and verifies its hash file', async () => {
  const bench = corpus.cases.filter(c => c.kind === 'benchmark'), cal = corpus.cases.filter(c => c.kind === 'calibration');
  assert.deepEqual(bench.filter(c => c.ref === 'EX-01').map(c => c.depth).sort(), ['deep', 'overview', 'standard']);
  for (const c of bench.filter(c => c.ref === 'EX-01')) assert.deepEqual(authorInput(c).visualRequirements.items.map(i => i.kind), ['table'], 'the coffee table is a required visual at every Depth');
  const ex07 = authorInput(bench.find(c => c.ref === 'EX-07'));
  assert.deepEqual(ex07.visualRequirements.items.map(i => [i.kind, i.diagramKind, i.trace]), [['diagram', 'flow', true]]);
  assert.deepEqual(bench.filter(c => c.ref === 'EX-02-style').map(c => c.depth).sort(), ['deep', 'overview', 'standard']);
  for (const c of bench.filter(c => c.ref === 'EX-02-style')) assert.equal(authorInput(c).visualRequirements, undefined, 'prose-only cases require no visual');
  assert.equal(bench.filter(c => c.heldOut).length, 1);
  assert.deepEqual(cal.map(c => c.script).sort(), ['bad-diagram', 'clean', 'no-table', 'over-cap', 'wrong-fact']);
  for (const c of bench) { assert.match(c.promptLabel, /^(original|reconstructed|newly-specified)$/); assert.ok(c.promptSource); assert.ok(corpus.rubrics[c.id], c.id); assert.ok(corpus.fixtures[c.id].clean, c.id); }
  // The hash file matches the files on disk, and the expected-facts hash is apart from the author-visible hash.
  const files = await readCorpusFiles(corpusDir); delete files['HASHES.json'];
  const frozen = JSON.parse(await readFile(join(corpusDir, 'HASHES.json'), 'utf8')), now = await hashCorpusFiles(files);
  assert.equal(now.corpusHash, frozen.corpusHash); assert.equal(now.expectedFactsHash, frozen.expectedFactsHash); assert.notEqual(frozen.corpusHash, frozen.expectedFactsHash);
  assert.equal(corpus.hash, frozen.corpusHash);
});

test('a corpus file edited after the freeze is refused, and CRLF checkouts hash the same', async () => {
  const files = await readCorpusFiles(corpusDir);
  const crlf = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.replace(/\r?\n/g, '\r\n')]));
  await loadCorpusFromFiles(crlf); // does not throw
  await assert.rejects(loadCorpusFromFiles({ ...files, 'rubrics/ex01-coffee-standard.json': files['rubrics/ex01-coffee-standard.json'].replace('"major"', '"minor"') }), e => e.code === 'corpus_changed');
  await assert.rejects(loadCorpusFromFiles({ ...files, 'cases/ex01-coffee-standard.json': files['cases/ex01-coffee-standard.json'].replace('coffee', 'tea') }), e => e.code === 'corpus_changed');
  const { 'HASHES.json': _, ...unfrozen } = files;
  await assert.rejects(loadCorpusFromFiles(unfrozen), e => e.code === 'corpus_unfrozen');
  const dir = await tmp(); try { for (const [k, v] of Object.entries(unfrozen)) { await mkdir(join(dir, k, '..'), { recursive: true }); await writeFile(join(dir, k), v); } const h = await freezeCorpus(dir); assert.equal(h.corpusHash, corpus.hash, 'freezing the same files reproduces the same hash'); } finally { await cleanup(dir); }
});

test('an author sees only the prompt, Depth and required visuals: no expected value or rubric text reaches the author request', () => {
  for (const c of corpus.cases.filter(c => c.kind === 'benchmark')) {
    const body = prepareArtifactAuthorRequest({}, authorInput(c)).body, wire = JSON.stringify(body);
    const rubric = corpus.rubrics[c.id];
    for (const calc of rubric.calculations) assert.ok(!JSON.stringify(body.messages).includes(String(calc.expected)), `${c.id} leaks ${calc.expected}`);
    for (const fact of rubric.facts) assert.ok(!wire.includes(fact.description), `${c.id} leaks a fact description`);
    assert.ok(!wire.includes('expectedFacts') && !wire.includes('rubric'));
    assert.deepEqual(Object.keys(authorInput(c)).sort().filter(k => !['visualRequirements', 'depth'].includes(k)), ['args', 'command', 'context', 'selection']);
  }
});

test('profile matrix: validated role overrides go through resolveExplanationProfile; unsupported providers cannot be registered', async () => {
  const derived = deriveProfile('plan-default', { repair: 'fixture-fast' }, registry);
  assert.equal(derived.id, 'plan-default+repair=fixture-fast');
  assert.equal(derived.roles.author.model, (await matrixOf('plan-default'))[0].profile.roles.author.model, 'only the repair role changed');
  assert.equal(derived.roles.repair.model, 'fixture-model-fast');
  assert.throws(() => deriveProfile('plan-default', { reviewer: 'fixture-fast' }, registry), e => e instanceof BenchmarkError && e.code === 'bad_override');
  assert.throws(() => deriveProfile('plan-default', { repair: 'nope' }, registry), e => e instanceof ExplanationProfileError && e.code === 'unknown_profile');
  const cerebras = { profiles: { 'cerebras-x': { version: 1, extends: 'plan-default', roles: { author: { provider: 'cerebras', model: 'synthetic-cerebras-model', adapter: 'openai-compatible' } } } } };
  await assert.rejects(resolveMatrix({ profileIds: ['cerebras-x'], registry: registryFromConfig(cerebras) }), e => e.code === 'adapter_unsupported');
  assert.throws(() => registryFromConfig({ profiles: { 'plan-default': {} } }), e => e.code === 'config_conflict');
  await assert.rejects(resolveMatrix({ profileIds: ['plan-default', 'plan-default'], registry }), e => e.code === 'duplicate_profile');
  const [a] = await matrixOf('fixture-mixed');
  assert.deepEqual(a.binding, await explanationProfileBinding(a.profile));
});

test('dry run: prints the matrix, capability gaps, call ceilings and spend bounds; no provider is touched and no result exists', async () => {
  let touched = 0;
  const r = await run(['plan-default', 'fixture-mixed', 'fixture-flaky'], { mode: 'dry', providerFactory: () => { touched++; throw new Error('a dry run must not build a provider'); } });
  try {
    assert.equal(touched, 0);
    const m = JSON.parse(await readFile(join(r.dir, 'manifest.json'), 'utf8'));
    assert.equal(m.type, 'dry'); assert.equal(m.status, 'complete'); assert.equal(m.authorizedCapUsd, null);
    assert.equal((await readFile(join(r.dir, 'results.jsonl'), 'utf8')), ''); assert.equal((await readFile(join(r.dir, 'calls.jsonl'), 'utf8')), '');
    const plan = r.result.plan;
    assert.deepEqual(plan.gaps.candidates.map(c => [c.family, c.status, c.blocked]), [['opus', 'supported', false], ['celeris', 'dev_route_only', true], ['cerebras', 'unsupported', true], ['gemini-flash', 'unsupported', true]]);
    assert.equal(plan.attemptCount, 3 * 8);
    for (const p of plan.profiles) assert.deepEqual([p.ceilings.authorCalls, p.ceilings.repairCalls, p.ceilings.evaluatorModelCalls, p.ceilings.maxProviderCallsPerAttempt], [1, 1, 0, 2]);
    assert.deepEqual(plan.spend.unknownCostProfiles, ['plan-default', 'fixture-flaky'], 'a profile without a pricing key has an unknown cost bound, not zero');
    assert.match(plan.profiles.find(p => p.id === 'fixture-mixed').costBound, /SYNTHETIC/);
    assert.equal(stageCeilings((await matrixOf('plan-default'))[0].profile, 'tutor').repairCalls, 0, 'an accepted Tutor card keeps repairs:0');
    const report = await readFile(join(r.dir, 'report.md'), 'utf8');
    assert.match(report, /^# .*\n\n> DRY RUN\./); assert.match(report, /No winner\./); assert.match(report, /cost unknown|unknown: the profile has no pricing key/);
  } finally { await cleanup(r.dir); }
});

test('live mode is a refusal: zero calls, nothing written, and the message names the cap and credentials', async () => {
  let built = 0;
  const dir = await tmp();
  try {
    const store = createRunStore({ dir, type: 'live' });
    await assert.rejects(runBenchmark({ mode: 'live', runId: 'x', corpus, matrix: await matrixOf('plan-default'), config, store, providerFactory: () => { built++; } }),
      e => e instanceof LiveRefusedError && /paid cap/.test(e.message) && /credentials/.test(e.message) && e.message === LIVE_REFUSAL);
    assert.equal(built, 0); assert.deepEqual(await readdir(dir), []);
    // Even the CLI refuses, with a planted key in the environment that must not be printed.
    const cli = spawnSync(process.execPath, ['benchmarks/explain/run.mjs', '--mode', 'live', '--cap-usd', '5'], { cwd: repo, encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: 'sk-planted-cli-key-1234567890' } });
    assert.equal(cli.status, 2); assert.match(cli.stderr, /live mode refused/); assert.ok(!(cli.stdout + cli.stderr).includes('sk-planted-cli-key'));
  } finally { await cleanup(dir); }
});

test('the dry-run CLI prints the resolved output path first and last and the plan, using a temp directory outside the results root', async () => {
  const dir = await tmp();
  try {
    const out = join(dir, 'dry');
    const cli = spawnSync(process.execPath, ['benchmarks/explain/run.mjs', '--mode', 'dry', '--profile', 'plan-default', '--out', out], { cwd: repo, encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    const printed = cli.stdout.split('\n').filter(l => l.startsWith('Output: '));
    assert.deepEqual(printed, [`Output: ${out}`, `Output: ${out}`], 'the absolute output path is printed at start and at the end');
    assert.match(cli.stdout, /cerebras: unsupported \(blocked/); assert.match(cli.stdout, /gemini-flash: unsupported/); assert.match(cli.stdout, /celeris: dev_route_only/);
    assert.match(cli.stdout, /Authorized paid cap: none/);
    assert.ok((await stat(join(out, 'manifest.json'))).isFile());
    assert.deepEqual(await readdir(join(dir)), ['dry'], 'nothing is written outside --out');
  } finally { await cleanup(dir); }
});

test('fixture run: successful, failed, timed-out, invalid and defective attempts all keep their rows, and nothing is dispatched twice', async () => {
  const r = await run(['plan-default', 'fixture-fast', 'fixture-mixed', 'fixture-flaky']);
  try {
    assert.equal(r.rows.length, 4 * 8 + 5, '32 benchmark attempts plus 5 calibration attempts');
    assert.equal(new Set(r.rows.map(x => x.attemptId)).size, r.rows.length);
    const ok = row(r.rows, 'plan-default', 'ex01-coffee-standard');
    assert.deepEqual([ok.status, ok.factualPass, ok.requiredOutputPass, ok.repaired, ok.timings.usableCardMs, ok.calls], ['success', true, true, false, 4200, 1]);
    assert.deepEqual(ok.usage, { input: 1800, output: 650, cache: null, reasoning: null, complete: true });
    assert.equal(ok.cost.known, false, 'no pricing key: cost unknown, not zero'); assert.equal(ok.cost.usd, null);
    assert.equal(row(r.rows, 'fixture-fast', 'ex01-coffee-standard').cost.known, true);
    // failed (provider error), timed out, refused: failure stage recorded, usable latency null, still in the denominator
    const http = row(r.rows, 'fixture-flaky', 'heldout-tides-standard'), slow = row(r.rows, 'fixture-flaky', 'ex01-coffee-deep'), refused = row(r.rows, 'fixture-flaky', 'ex07-decision-tree');
    assert.deepEqual([http.status, http.failureStage, slow.failureStage, refused.failureStage], ['failed', 'provider_error', 'timeout', 'refusal']);
    for (const f of [http, slow, refused]) { assert.equal(f.timings.usableCardMs, null); assert.equal(f.factualPass, false); assert.equal(f.requiredOutputPass, false); assert.ok(f.flags.includes('no_card')); }
    assert.equal(slow.timings.totalMs, 60001, 'the timeout is measured on the injected clock');
    assert.deepEqual(slow.usage, { input: null, output: null, cache: null, reasoning: null, complete: false }, 'a timeout is unknown usage, never zero');
    // a truncated first answer that the one repair fixes: delivered, repaired, repair time recorded
    const fixed = row(r.rows, 'fixture-flaky', 'ex02p-gini-deep');
    assert.deepEqual([fixed.status, fixed.repaired, fixed.calls, fixed.timings.usableCardMs, fixed.timings.repairMs], ['success', true, 2, 2400, 1200]);
    // an answer that passes the validator but is factually wrong is delivered and scored as a factual failure with major errors
    const wrong = row(r.rows, 'fixture-fast', 'ex02p-gini-standard');
    assert.deepEqual([wrong.status, wrong.factualPass, wrong.requiredOutputPass], ['success', false, true]); assert.ok(wrong.majorErrors >= 3);
    assert.ok(wrong.flags.includes('calc_failed:gini-a') && wrong.flags.includes('forbidden:b-purer'));
    // invalid output (dropped table / malformed diagram / over cap) fails through the PRODUCTION validator after the one repair
    const cal = id => r.rows.find(x => x.caseId === id);
    assert.deepEqual([cal('cal-dropped-table').status, cal('cal-dropped-table').failureStage, cal('cal-dropped-table').calls], ['failed', 'validation', 2]);
    assert.match(cal('cal-dropped-table').failureReason, /required_visual_missing/);
    assert.match(cal('cal-malformed-diagram').failureReason, /explanation_bad_diagram/);
    assert.match(cal('cal-over-cap').failureReason, /explanation_over_budget/);
    // every call identity is unique and was persisted as 'dispatched' before its 'settled' line
    const dispatched = r.calls.filter(c => c.state === 'dispatched').map(c => c.callId), settled = r.calls.filter(c => c.state === 'settled' && c.role !== 'evaluator').map(c => c.callId);
    assert.equal(new Set(dispatched).size, dispatched.length); assert.deepEqual([...dispatched].sort(), [...settled].sort());
    for (const id of dispatched) assert.ok(r.calls.findIndex(c => c.callId === id && c.state === 'dispatched') < r.calls.findIndex(c => c.callId === id && c.state === 'settled'));
    assert.deepEqual(r.result.calibration, { seeded: 4, detected: 4, missed: [], controls: 1, falsePositives: [] }, 'every seeded defect is flagged and the clean control is not');
  } finally { await cleanup(r.dir); }
});

test('mixed profile: the author and repair roles run on different doubles and the cost of each is priced on its own role', async () => {
  const r = await run(['fixture-mixed']);
  try {
    const m = row(r.rows, 'fixture-mixed', 'ex01-coffee-standard');
    assert.deepEqual(m.requested.map(x => x.model), ['fixture-model-draft', 'fixture-model-repair']);
    assert.deepEqual(m.served, ['fixture-model-draft', 'fixture-model-repair']);
    assert.deepEqual([m.status, m.repaired, m.timings.authorMs, m.timings.repairMs, m.timings.usableCardMs], ['success', true, 1500, 2100, 3600]);
    const calls = r.calls.filter(c => c.attemptId === m.attemptId && c.state === 'settled' && c.role !== 'evaluator');
    assert.deepEqual(calls.map(c => c.role), ['author', 'repair']);
    // price: draft is fast-priced (1/4 per MTok), repair is slow-priced (3/12): 1800*1+580*4 and 2400*3+600*12, in USD per million tokens
    assert.deepEqual(calls.map(c => c.cost.usd), [Number(((1800 * 1 + 580 * 4) / 1e6).toFixed(6)), Number(((2400 * 3 + 600 * 12) / 1e6).toFixed(6))]);
    assert.equal(m.cost.usd, Number((calls[0].cost.usd + calls[1].cost.usd).toFixed(6)));
    const manifest = JSON.parse(await readFile(join(r.dir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.profiles[0].roles.author.model, 'fixture-model-draft'); assert.equal(manifest.profiles[0].roles.repair.model, 'fixture-model-repair');
    assert.equal(m.profile.hash, r.matrix[0].binding.hash, 'the row pins the resolved profile hash');
  } finally { await cleanup(r.dir); }
});

test('unknown usage stays unknown: it is never summed as zero, and the unknown-cost count says so', async () => {
  const r = await run(['fixture-flaky', 'plan-default']);
  try {
    const flaky = r.rows.filter(x => x.profile.id === 'fixture-flaky' && x.status === 'success');
    assert.ok(flaky.length >= 5);
    for (const x of flaky) { assert.equal(x.usage.input, null); assert.equal(x.usage.output, null); assert.equal(x.cost.known, false); assert.equal(x.cost.usd, null); }
    const csv = (await readFile(join(r.dir, 'summary.csv'), 'utf8')).split('\n').map(l => l.split(','));
    const head = csv[0], all = p => csv.find(c => c[0] === p && c[2] === 'all');
    assert.equal(all('fixture-flaky')[head.indexOf('unknown_cost_count')], '8', 'every flaky attempt, delivered or not, has an unknown cost');
    assert.equal(all('plan-default')[head.indexOf('unknown_cost_count')], '8');
    assert.equal(all('plan-default')[head.indexOf('known_cost_usd')], '0', 'known cost sums known values only; the unknown count carries the rest');
  } finally { await cleanup(r.dir); }
});

test('evaluator calls and cost are recorded under their own role and never added to the profile cost', async () => {
  const priced = { ...deterministicEvaluator, id: 'fixture-model-evaluator', kind: 'deterministic-fixture', modelCalls: null,
    async evaluate(ctx) {
      const base = await deterministicEvaluator.evaluate(ctx);
      const unknown = ctx.attempt.caseId.includes('tides');
      return { evaluation: { ...base.evaluation, evaluator: 'fixture-model-evaluator' }, calls: [{ role: 'evaluator', category: 'evaluation', kind: 'fixture-model', providerCall: false, requested: { provider: 'fixture-evaluator', model: 'fixture-eval-model' },
        usage: unknown ? { input: null, output: null, cache: null, reasoning: null } : { input: 500, output: 100, cache: null, reasoning: null }, cost: unknown ? { usd: null, known: false } : { usd: 0.01, known: true } }] };
    } };
  const base = await run(['fixture-fast']);
  const r = await run(['fixture-fast'], { evaluator: priced });
  try {
    const evalCalls = r.calls.filter(c => c.role === 'evaluator');
    assert.equal(evalCalls.length, r.rows.length); assert.ok(evalCalls.every(c => c.category === 'evaluation'));
    assert.ok(r.calls.filter(c => c.role !== 'evaluator').every(c => c.category === 'generation'));
    const csv = (await readFile(join(r.dir, 'summary.csv'), 'utf8')).split('\n').map(l => l.split(',')), head = csv[0], all = csv.find(c => c[0] === 'fixture-fast' && c[2] === 'all');
    assert.equal(Number(all[head.indexOf('evaluator_known_cost_usd')]), 0.07, '7 delivered benchmark cases at 0.01; the held-out one has an unknown evaluator cost');
    assert.equal(all[head.indexOf('evaluator_unknown_cost_count')], '1');
    const baseAll = (await readFile(join(base.dir, 'summary.csv'), 'utf8')).split('\n').map(l => l.split(',')).find(c => c[0] === 'fixture-fast' && c[2] === 'all');
    assert.equal(all[head.indexOf('known_cost_usd')], baseAll[head.indexOf('known_cost_usd')], 'the profile cost is unchanged by the evaluator spend');
    assert.equal(JSON.parse(await readFile(join(r.dir, 'manifest.json'), 'utf8')).evaluator.id, 'fixture-model-evaluator');
  } finally { await cleanup(r.dir); await cleanup(base.dir); }
});

test('a model-based evaluator is a stub: it refuses without an evaluator profile and cap, and the run does not start', async () => {
  await assert.rejects(modelEvaluatorStub.evaluate({}), e => e instanceof EvaluatorRefusedError && /paid cap/.test(e.message));
  const dir = await tmp();
  try {
    await assert.rejects(run(['plan-default'], { dir, evaluator: modelEvaluatorStub }), e => e.code === 'evaluator_refused');
    assert.deepEqual(await readdir(dir), []);
  } finally { await cleanup(dir); }
});

test('the evaluator flags every seeded defect and does not flag a clean answer', async () => {
  for (const c of corpus.cases.filter(c => c.kind === 'benchmark')) {
    const clean = { title: corpus.fixtures[c.id].clean.title, ...corpus.fixtures[c.id].clean };
    assert.deepEqual(evaluateCard(clean, corpus.rubrics[c.id]).flags, [], `${c.id}: the clean fixture is not flagged`);
    for (const [name, reply] of Object.entries(corpus.fixtures[c.id]).filter(([n]) => n === 'wrong-fact')) assert.ok(evaluateCard(reply, corpus.rubrics[c.id]).flags.length > 0, `${c.id}/${name} is flagged`);
  }
  // A tampered clean answer is caught by each check type.
  const tides = corpus.rubrics['heldout-tides-standard'], fx = corpus.fixtures['heldout-tides-standard'].clean;
  assert.ok(evaluateCard({ ...fx, body: fx.body.replace(/about 12\.4 hours, not exactly 12/, 'about 9 hours') }, tides).flags.includes('calc_failed:interval'), 'a number outside tolerance');
  assert.ok(evaluateCard({ ...fx, body: fx.body.replace(/Moon/g, 'planet') }, tides).flags.includes('fact_missing:moon-gravity'), 'a missing fact');
  assert.ok(evaluateCard({ ...fx, body: `${fx.body} Tides are caused by the wind.` }, tides).flags.includes('forbidden:wind-cause'), 'a forbidden claim');
  const coffee = corpus.rubrics['ex01-coffee-standard'], cf = corpus.fixtures['ex01-coffee-standard'].clean;
  assert.ok(evaluateCard({ ...cf, body: cf.body.replace(/\| Early[\s\S]*Slower \|/, '') }, coffee).flags.includes('visual:table'), 'a dropped table');
  assert.ok(evaluateCard({ ...cf, body: `${cf.body} The coffee loses about 2 degrees per minute.` }, coffee).flags.includes('forbidden:invented-rate'), 'an invented rate');
  const tree = corpus.rubrics['ex07-decision-tree'], tf = corpus.fixtures['ex07-decision-tree'].clean;
  assert.ok(evaluateCard({ ...tf, body: tf.body.replace(/"highlightPath":\[[^\]]*\],?/, '').replace(',}', '}') }, tree).flags.includes('visual:flow'), 'a flow that no longer traces the applicant');
});

test('results are appended as they arrive and an interrupted run resumes without duplicating a scored attempt or re-dispatching a call', async () => {
  const dir = await tmp(), dispatched = [];
  const runId = makeRunId({ now: NOW, codeSha: 'abc1234', suffix: 'resume1' });
  const profiles = ['plan-default', 'fixture-mixed'];
  let n = 0;
  try {
    const hooks = { afterDispatch: open => { dispatched.push(open.callId); if (++n === 7) throw new InterruptRun('test crash after the 7th dispatch'); } };
    await assert.rejects(run(profiles, { dir, runId, hooks }), e => e instanceof InterruptRun);
    const mid = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    assert.equal(mid.status, 'running'); assert.equal(mid.endedAt, null);
    const scored = await lines(join(dir, 'results.jsonl'));
    assert.ok(scored.length >= 1 && scored.length < 21, `${scored.length} scored before the crash`);
    // The crashed attempt has an identity and a dispatched call on disk but no result row.
    const attempts = await readdir(join(dir, 'attempts'));
    const pending = attempts.filter(a => !scored.some(s => s.attemptId === a));
    assert.equal(pending.length, 1);
    // Resume: same run id, same directory.
    const resumed = await run(profiles, { dir, runId, resume: true, hooks: { afterDispatch: open => { dispatched.push(open.callId); } } });
    assert.equal(new Set(dispatched).size, dispatched.length, 'no provider call was dispatched twice');
    const rows = resumed.rows;
    assert.equal(new Set(rows.map(x => x.attemptId)).size, rows.length, 'no attempt has two result rows');
    assert.equal(rows.length, 2 * 8 + 5);
    assert.equal(resumed.result.counts.skipped, scored.length); assert.equal(resumed.result.counts.reconciled, 1);
    const interrupted = rows.find(x => x.attemptId === pending[0]);
    assert.deepEqual([interrupted.status, interrupted.failureStage, interrupted.cost.known, interrupted.usage.input], ['failed', 'interrupted', false, null]);
    assert.deepEqual(rows.slice(0, scored.length), scored, 'rows scored before the crash are untouched');
    const last = new Map(resumed.calls.map(c => [c.callId, c]));
    assert.ok([...last.values()].some(c => c.state === 'reconciled' && c.error.class === 'interrupted'), 'the unsettled call is marked unknown, not zero');
    const done = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    assert.equal(done.status, 'complete'); assert.equal(done.startedAt, mid.startedAt);
    // The derived summary counts the interrupted attempt in its denominator.
    assert.equal(summarize(rows).filter(s => s.stratum === 'all').reduce((t, s) => t + s.total, 0), 2 * 8);
    // A crash after the calls but before the result row is also never re-dispatched.
    const dir2 = await tmp(); const ids2 = [];
    await assert.rejects(run(['plan-default'], { dir: dir2, runId, hooks: { afterDispatch: o => ids2.push(o.callId), beforeResult: () => { throw new InterruptRun(); } } }), InterruptRun);
    await run(['plan-default'], { dir: dir2, runId, resume: true, hooks: { afterDispatch: o => ids2.push(o.callId) } });
    assert.equal(new Set(ids2).size, ids2.length); await cleanup(dir2);
    // A different run id or evidence class cannot adopt the directory.
    await assert.rejects(run(profiles, { dir, runId: makeRunId({ now: NOW, codeSha: 'abc1234', suffix: 'other01' }), resume: true }), e => e.code === 'resume_mismatch');
    await assert.rejects(run(profiles, { dir, runId, resume: true, mode: 'dry' }), e => e.code === 'mixed_evidence');
  } finally { await cleanup(dir); }
});

test('summary.csv and report.md recompute from the raw rows, failures stay in the denominator, and the report says no winner', async () => {
  const r = await run(['plan-default', 'fixture-fast', 'fixture-mixed', 'fixture-flaky']);
  try {
    const csv = (await readFile(join(r.dir, 'summary.csv'), 'utf8')).trimEnd().split('\n').map(l => l.split(',')), head = csv[0];
    const get = (p, s, col) => csv.find(c => c[0] === p && c[2] === s)[head.indexOf(col)];
    const median = v => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    for (const p of ['plan-default', 'fixture-fast', 'fixture-mixed', 'fixture-flaky']) {
      const mine = r.rows.filter(x => x.kind === 'benchmark' && x.profile.id === p), good = mine.filter(x => x.status === 'success');
      assert.equal(Number(get(p, 'all', 'total')), mine.length); assert.equal(Number(get(p, 'all', 'success')), good.length); assert.equal(Number(get(p, 'all', 'failed')), mine.length - good.length);
      assert.equal(Number(get(p, 'all', 'factual_pass_rate')), Number((mine.filter(x => x.factualPass).length / mine.length).toFixed(4)), `${p}: failures are in the factual-pass denominator`);
      assert.equal(Number(get(p, 'all', 'required_output_pass_rate')), Number((mine.filter(x => x.requiredOutputPass).length / mine.length).toFixed(4)));
      assert.equal(Number(get(p, 'all', 'major_errors')), mine.reduce((t, x) => t + x.majorErrors, 0));
      assert.equal(Number(get(p, 'all', 'usable_ms_median')), median(good.map(x => x.timings.usableCardMs)));
      assert.equal(Number(get(p, 'all', 'usable_n')), good.length);
      assert.equal(Number(get(p, 'all', 'repair_attempts')), mine.filter(x => x.repaired).length);
      assert.equal(Number(get(p, 'all', 'unknown_cost_count')), mine.filter(x => !x.cost.known).length);
      assert.equal(Number(get(p, 'depth=deep', 'total')), mine.filter(x => x.depth === 'deep').length, 'depth strata are separate rows');
    }
    assert.equal(summaryCsv(summarize(r.rows)), await readFile(join(r.dir, 'summary.csv'), 'utf8'), 'the file is exactly the derivation of the raw rows');
    assert.ok(!csv.some(c => c[0] === 'calibration'), 'calibration attempts are not a profile');
    const report = await readFile(join(r.dir, 'report.md'), 'utf8');
    assert.match(report, /\*\*No winner\.\*\*/);
    for (const p of ['plan-default', 'fixture-fast', 'fixture-mixed', 'fixture-flaky']) {
      const line = report.split('\n').find(l => l.startsWith(`| ${p} |`) && /^\| [\w-]+ \| \d+ \| \d+ \|/.test(l));
      const cells = line.split('|').map(c => c.trim());
      assert.deepEqual([cells[2], cells[3]], [get(p, 'all', 'total'), get(p, 'all', 'success')], `${p}: the report table is the summary`);
    }
    for (const failed of r.rows.filter(x => x.kind === 'benchmark' && x.status !== 'success')) assert.ok(report.includes(failed.attemptId), `${failed.attemptId} is listed in the report`);
    assert.match(report, /Seeded defects flagged: 4 of 4/);
  } finally { await cleanup(r.dir); }
});

test('corrections keep the original row, require a reason, and are applied only on top when deriving', async () => {
  const r = await run(['plan-default']);
  try {
    const before = await readFile(join(r.dir, 'results.jsonl'), 'utf8'), target = r.rows.find(x => x.kind === 'benchmark');
    assert.throws(() => makeCorrection({ attemptId: target.attemptId, patch: { factualPass: false }, reason: '  ', original: target, at: NOW.toISOString() }), e => e.code === 'correction_needs_reason');
    await r.store.appendCorrection(makeCorrection({ attemptId: target.attemptId, patch: { factualPass: false, majorErrors: 1 }, reason: 'human review found a wrong figure the pattern check missed', original: target, at: NOW.toISOString() }));
    assert.equal(await readFile(join(r.dir, 'results.jsonl'), 'utf8'), before, 'results.jsonl is never rewritten');
    const effective = applyCorrections(r.rows, await r.store.readCorrections());
    const fixed = effective.find(x => x.attemptId === target.attemptId);
    assert.deepEqual([fixed.factualPass, fixed.corrected], [false, true]);
    assert.equal(summarize(effective).find(s => s.stratum === 'all').factual_pass_rate, 0.875);
    const [c] = await r.store.readCorrections(); assert.equal(c.original.factualPass, true); assert.match(c.reason, /human review/);
  } finally { await cleanup(r.dir); }
});

test('dry and fixture evidence cannot be presented as live, or mixed with it', async () => {
  const dry = await run(['plan-default'], { mode: 'dry' }), fx = await run(['plan-default']);
  try {
    const md = JSON.parse(await readFile(join(dry.dir, 'manifest.json'), 'utf8')), mf = JSON.parse(await readFile(join(fx.dir, 'manifest.json'), 'utf8'));
    assert.deepEqual([md.type, mf.type, md.evidenceClass, mf.evidenceClass], ['dry', 'fixture', 'dry', 'fixture']);
    assert.equal(presentableAsLive(md), false); assert.equal(presentableAsLive(mf), false);
    assert.throws(() => assertSameEvidenceClass([md, mf]), e => e.code === 'mixed_evidence');
    assert.throws(() => assertSameEvidenceClass([mf, { ...mf, type: 'live' }]), e => e.code === 'mixed_evidence');
    assert.equal(assertSameEvidenceClass([mf, mf]), 'fixture');
    for (const x of fx.rows) { assert.equal(x.evidenceClass, 'fixture'); assert.equal(x.servedProvider, 'fixture-double'); }
    const report = await readFile(join(fx.dir, 'report.md'), 'utf8');
    assert.match(report, /^# .*\n\n> FIXTURE RUN\. Every model reply was a scripted offline provider double\. No model generated any card and no provider was contacted\./);
    assert.match(report, /NOT live evidence/); assert.doesNotMatch(report, /LIVE RUN/);
    assert.ok(mf.limitations.some(l => /SYNTHETIC/.test(l)) && mf.limitations.some(l => /scripted/.test(l)));
  } finally { await cleanup(dry.dir); await cleanup(fx.dir); }
});

test('the run directory has exactly the files the spec lists, with the manifest fields it requires', async () => {
  const r = await run(['plan-default', 'fixture-mixed']);
  try {
    assert.deepEqual((await readdir(r.dir)).sort(), ['attempts', 'calls.jsonl', 'manifest.json', 'report.md', 'results.jsonl', 'summary.csv']);
    const ids = await readdir(join(r.dir, 'attempts'));
    assert.equal(ids.length, r.rows.length);
    for (const id of ids) assert.deepEqual((await readdir(join(r.dir, 'attempts', id))).sort(), ['attempt.json', 'evaluation.json', 'output.json', 'validation.json'], id);
    const m = JSON.parse(await readFile(join(r.dir, 'manifest.json'), 'utf8'));
    for (const key of ['schemaVersion', 'runId', 'type', 'status', 'codeSha', 'corpus', 'expectedFactsHash', 'versions', 'profiles', 'evaluator', 'order', 'authorizedCapUsd', 'startedAt', 'endedAt', 'environment']) assert.ok(key in m, key);
    assert.deepEqual([m.runId, m.codeSha, m.corpus.hash, m.expectedFactsHash], [r.runId, 'abc1234', corpus.hash, corpus.expectedFactsHash]);
    for (const key of ['promptHash', 'schemaHash', 'visualRequirements', 'harness']) assert.ok(m.versions[key], key);
    assert.deepEqual([m.order.concurrency, m.order.seed, m.order.trials], [1, 'e7-1', 1]); assert.match(m.order.cachePolicy, /cache=miss/);
    assert.equal(m.counts.ran, r.rows.length);
    const a = JSON.parse(await readFile(join(r.dir, 'attempts', ids.find(i => i.includes('ex07')), 'attempt.json'), 'utf8'));
    assert.equal(a.status, 'done'); assert.equal(a.profile.roles.author.credentialRef, 'ANTHROPIC_API_KEY', 'the credential NAME is recorded, never a value');
    assert.equal(a.request.messages[0].role, 'user'); assert.ok(a.request.requestHash && a.request.system.sha);
    const ev = JSON.parse(await readFile(join(r.dir, 'attempts', ids.find(i => i.includes('ex07')), 'evaluation.json'), 'utf8'));
    assert.equal(ev.evaluator, 'deterministic-offline-v1'); assert.ok(ev.checks.some(c => c.id === 'visual:flow' && c.pass));
    const out = JSON.parse(await readFile(join(r.dir, 'attempts', ids.find(i => i.includes('ex07')), 'output.json'), 'utf8'));
    assert.match(out.block.body, /rh-diagram/); assert.equal(out.normalizedCalls[0].output.title.length > 0, true);
  } finally { await cleanup(r.dir); }
});

test('secrets never reach any output file, even when a provider error echoes one', async () => {
  const secret = 'sk-planted-secret-value-9f8e7d6c5b4a', token = 'tok_planted_bearer_abcdefghijklmnop';
  const saved = { a: process.env.ANTHROPIC_API_KEY, b: process.env.FAKE_SERVICE_TOKEN };
  process.env.ANTHROPIC_API_KEY = secret; process.env.FAKE_SERVICE_TOKEN = token;
  let n = 0;
  const leaky = opts => { const real = fixtureProvider(opts); return async (env, body, model) => { if (++n % 5 === 0) throw new Error(`upstream echoed Authorization: Bearer ${token} and key ${secret}`); return real(env, body, model); }; };
  const r = await run(['plan-default', 'fixture-mixed'], { redact: redactorFor(process.env), providerFactory: leaky });
  try {
    assert.ok(r.rows.some(x => x.failureStage === 'error'), 'the leaky provider failed some attempts');
    for (const file of await allFiles(r.dir)) { const text = await readFile(file, 'utf8'); assert.ok(!text.includes(secret), `${file} holds the key`); assert.ok(!text.includes(token), `${file} holds the token`); assert.ok(!/Bearer\s+tok_/.test(text), `${file} holds a bearer`); }
    const m = JSON.parse(await readFile(join(r.dir, 'manifest.json'), 'utf8'));
    assert.ok(m.redactions > 0, 'the redactor reports how many values it removed, not what they were');
    assert.ok((await readFile(join(r.dir, 'manifest.json'), 'utf8')).includes('ANTHROPIC_API_KEY'), 'the variable NAME is kept');
    assert.ok(r.rows.some(x => /\[redacted\]/.test(x.failureReason ?? '')));
  } finally {
    for (const [k, v] of [['ANTHROPIC_API_KEY', saved.a], ['FAKE_SERVICE_TOKEN', saved.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await cleanup(r.dir);
  }
});

test('trial order is seeded, interleaves profiles within a case and is stable', async () => {
  const matrix = await matrixOf('plan-default', 'fixture-fast', 'fixture-mixed');
  const a = orderAttempts({ corpus, matrix, trials: 2, seed: 's1' }), b = orderAttempts({ corpus, matrix, trials: 2, seed: 's1' }), c = orderAttempts({ corpus, matrix, trials: 2, seed: 's2' });
  assert.deepEqual(a.map(x => x.attemptId), b.map(x => x.attemptId)); assert.notDeepEqual(a.map(x => x.attemptId), c.map(x => x.attemptId));
  const bench = a.filter(x => x.kind === 'benchmark');
  assert.equal(bench.length, 3 * 8 * 2);
  for (let i = 0; i < bench.length; i += 3) assert.equal(new Set(bench.slice(i, i + 3).map(x => x.caseId)).size, 1, 'the profiles of a matched case run back to back');
  assert.equal(a.filter(x => x.kind === 'calibration').length, 5);
});

test('the README index is appended once per run inside the results root and never replaced; a run outside the root is not indexed', async () => {
  const root = await tmp(), outside = await tmp();
  try {
    const r1 = await run(['plan-default'], { dir: join(root, 'run-a'), root, runId: makeRunId({ now: NOW, codeSha: 'abc1234', suffix: 'index01' }) });
    const r2 = await run(['fixture-mixed'], { dir: join(root, 'run-b'), root, runId: makeRunId({ now: new Date('2026-11-09T00:00:00Z'), codeSha: 'abc1234', suffix: 'index02' }) });
    await run(['plan-default'], { dir: join(outside, 'x') , root, runId: makeRunId({ now: NOW, codeSha: 'abc1234', suffix: 'index03' }) });
    const readme = await readFile(join(root, 'README.md'), 'utf8');
    assert.match(readme, /^# Explain benchmark results/);
    assert.ok(readme.includes(`| ${r1.runId} |`) && readme.includes(`| ${r2.runId} |`));
    assert.ok(readme.indexOf(r1.runId) < readme.indexOf(r2.runId), 'older rows stay first');
    assert.equal(readme.split('\n').filter(l => /^\| \d{8}T/.test(l)).length, 2, 'two runs indexed; the outside run is not');
    assert.match(readme, /\| fixture \|/); assert.match(readme, /no winner, no promotion/);
    const before = readme;
    await run(['plan-default'], { dir: join(root, 'run-a'), root, runId: r1.runId, resume: true });
    assert.equal(await readFile(join(root, 'README.md'), 'utf8'), before, 'resuming a finished run adds no second row');
  } finally { await cleanup(root); await cleanup(outside); }
});

test('the virtual clock drives timings and an unknown fixture script is refused before anything is written', async () => {
  const clock = createVirtualClock(10); clock.advance(5); assert.equal(clock.now(), 15);
  const dir = await tmp();
  try {
    await assert.rejects(run(['plan-default'], { dir, config: { ...config, behaviors: { '*': { script: 'clean>nonexistent' } } } }), e => e.code === 'bad_fixture_script');
    await assert.rejects(run(['plan-default'], { dir, config: { ...config, behaviors: { 'other': {} } } }), e => e.code === 'no_fixture_behavior');
    assert.deepEqual(await readdir(dir), []);
  } finally { await cleanup(dir); }
});
