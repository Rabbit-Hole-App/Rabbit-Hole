#!/usr/bin/env node
// scripts/interact/bench-expressions.mjs (owner brief 2026-11-13 14:20, section 4): does a fast model get the physics right when it is NOT asked to type a program? Same loop as bench-author.mjs, a different
// contract: for a toss plan the model returns strict JSON { quantities: { <id>: ScalarExpr }, moments: { <id>: ScalarExpr } } (interact-plan.js grammar: data, never code), the ids exactly the plan's
// (every scene quantity; every checkpoint that has a time). `t` is the elapsed seconds since launch (the plan's own relations use it), the other readable names are the plan's number inputs.
// Check: evalScalar of every expression at every case of the plan's oracle (start, end, cp-*, bound-*: the same inputs and times, expected values and 1e-6 tolerance as interact-oracle.js) and the moments at each case's
// inputs against the checkpoints' own times. pass = every id present, every expression resolvable, every value and moment within tolerance. No program is built, nothing is rendered, no job, no clone.
//   node scripts/interact/bench-expressions.mjs --model <id|all> [--plan toss-overview|toss-standard|toss-deep|all] [--n 10] [--concurrency 2] [--cap-usd 2] [--scripted] [--no-write]
//   node scripts/interact/bench-expressions.mjs --report        (docs/features/interact/benchmarks/bench-expressions.jsonl -> bench-expressions.md)
// Only the bench roles run (benchRole): no fallback chain, no judge, no Opus model (INTERACT_FALLBACK=off in the context).
// shortcut: three quantities of the Standard plan (dropVelocity, dropAcceleration, dropHeight) are piecewise (held, then released at the top); ScalarExpr has no min/max/branch, so no expression can match the oracle at
// every case. They are PIECEWISE below: a wrong value there is reported as a grammar gap (gapIds), not a failed row. Widen the grammar only with a proof (interact-plan.js says so), never here.
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScalarExprError, evalScalar, planHash } from '../../packages/web/src/interact-plan.js';
import { interactFixtures } from '../../packages/web/src/interact-plan-fixtures.js';
import { BENCH_MODELS, benchRole, callInteractRole } from '../../packages/control-plane/src/interact-models.js';
import { interactOracle, tossCasesOf } from '../../packages/control-plane/src/interact-oracle.js';
import { approvedPlanOf } from '../../packages/control-plane/src/interact-build.js';
import { scriptedAdapter } from '../../packages/control-plane/src/interact-fixtures.js';
import { priceUsage } from '../../packages/control-plane/src/pricing-registry.js';
import { BENCH_DIR, PLANS, benchContext, readCredentials } from './bench-author.mjs';

export const OUT = join(BENCH_DIR, 'bench-expressions.jsonl'), REPORT = join(BENCH_DIR, 'bench-expressions.md');
export const PIECEWISE = new Set(['dropVelocity', 'dropAcceleration', 'dropHeight']);
const round1 = n => Math.round(n * 10) / 10, now = () => globalThis.performance.now(), clip = (s, n = 300) => String(s).replace(/\s+/g, ' ').slice(0, n);

export const EXPRESSIONS_SYSTEM = [
  'You write equations, not code. Given the approved plan, return the equations of its quantities and its named moments as data.',
  'An expression is one JSON tree. Its nodes are exactly: {"op":"literal","value":<number>}, {"op":"input","id":"<name>"}, and {"op":"add"|"subtract"|"multiply"|"divide","left":<node>,"right":<node>}.',
  'There are no other operations: no functions, no powers (multiply the factor out), no conditions. At most 64 nodes and 12 levels deep.',
  'The readable names are `t` (elapsed seconds since launch, 0 at the launch) and the plan\'s `inputs` by id. A value the plan fixes is a literal.',
  'quantities: one expression for every id in the plan\'s `quantities`, in its unit and its sign convention (up is positive), as a function of t and the inputs.',
  'moments: one expression for every id in the plan\'s `moments`, the elapsed seconds since launch at which that moment happens, as a function of the inputs only (no t); a moment that lists tInputs is read with those inputs set to those values.',
  'Return expressions only; no prose; use only `t` and the input ids.',
].join('\n');

// The plan as the model sees it: the approved plan's own words for the quantities, its inputs with their ranges, the fixed values and the named moments (a checkpoint's label, never its time).
export function expressionsInput(plan) {
  const inputs = plan.controls.filter(c => c.type === 'number' && c.binding.kind === 'input').map(c => ({ id: c.binding.id, label: c.label, unit: c.unit, min: c.min, max: c.max, default: c.default }));
  return {
    title: plan.title, story: plan.story, scene: plan.scene.description,
    quantities: plan.scene.quantities.map(({ id, label, unit, meaning, reference, relation }) => ({ id, label, unit, meaning, reference, ...(relation ? { relation } : {}) })),
    inputs, fixedValues: plan.mode.fixedValues, time: { symbol: 't', unit: 's', meaning: 'elapsed seconds since launch' },
    moments: plan.scene.checkpoints.filter(cp => cp.time).map(({ id, label, inputOverrides }) => ({ id, label, ...(Object.keys(inputOverrides ?? {}).length ? { atInputs: inputOverrides } : {}) })),
  };
}

// ScalarExpr on the wire: ONE node type whose children are OPTIONAL and recursive. Gemini refuses a recursive $ref whose children are required ("a ref loop of required fields"), refuses a oneOf that is not
// provably exclusive (the adapter's own rule) and answers HTTP 500 to an unrolled bounded-depth tree (2026-11-13: tried at 4, 5, 6 and 8 levels), so the schema fixes the node's shape (op, value, id, left, right) and the exact grammar (a literal is exactly
// {op, value}, an operation exactly {op, left, right}, depth and node limits) is checked afterwards by interact-plan.js scalarExprProblem inside evalScalar: a malformed node is an `unsafe_expression` failure of the model.
const NODE = { $ref: '#/$defs/Expr' };
export function expressionsSchema(plan) {
  const ids = plan.scene.quantities.map(q => q.id), moments = plan.scene.checkpoints.filter(cp => cp.time).map(cp => cp.id);
  const map = keys => ({ type: 'object', properties: Object.fromEntries(keys.map(k => [k, NODE])), required: keys, additionalProperties: false });
  return { type: 'object', properties: { quantities: map(ids), moments: map(moments) }, required: ['quantities', 'moments'], additionalProperties: false,
    $defs: { Expr: { type: 'object', description: 'literal: {op, value}; input: {op, id}; add, subtract, multiply, divide: {op, left, right}.',
      properties: { op: { enum: ['literal', 'input', 'add', 'subtract', 'multiply', 'divide'] }, value: { type: 'number' }, id: { type: 'string' }, left: NODE, right: NODE }, required: ['op'], additionalProperties: false } } };
}
// -> { missingIds, unresolved, wrongIds, gapIds, checked }: the reply's expressions evaluated at the oracle's cases. wrongIds: { id, case, got, expected } (a moment is 'moment:<id>').
export function checkExpressions(plan, reply) {
  const oracle = interactOracle(plan), toss = tossCasesOf(plan);
  if (!oracle || !toss) throw new Error('no oracle cases for this plan');
  const q = reply?.quantities ?? {}, m = reply?.moments ?? {}, wrong = [], unresolved = [], gap = [];
  const quantityIds = plan.scene.quantities.map(x => x.id), momentIds = plan.scene.checkpoints.filter(cp => cp.time).map(cp => cp.id);
  const missingIds = [...quantityIds.filter(id => q[id] === undefined), ...momentIds.filter(id => m[id] === undefined).map(id => `moment:${id}`)];
  const run = (id, expr, values, domains, caseId, expected, tol) => {
    let got;
    try { got = evalScalar(expr, values, domains); } catch (error) { if (!(error instanceof ScalarExprError)) throw error; unresolved.push({ id, case: caseId, error: error.code, message: clip(error.message, 120) }); return; }
    if (expected !== undefined && !(Math.abs(got - expected) <= tol)) (PIECEWISE.has(id) ? gap : wrong).push({ id, case: caseId, got, expected });
  };
  let checked = 0;
  const seen = new Set();
  for (const [caseId, [inputs, t]] of Object.entries(toss.cases)) {
    const values = { ...inputs, t };
    for (const id of quantityIds) if (q[id] !== undefined) {
      const row = oracle.expect.find(r => r.case === caseId && r.name === id && r.panel === 'main');
      run(id, q[id], values, toss.domains, caseId, row?.expected, row?.tol ?? 1e-6); checked += row ? 1 : 0;
    }
    const key = JSON.stringify(inputs);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const cp of plan.scene.checkpoints.filter(c => c.time)) if (m[cp.id] !== undefined) {
      const at = { ...inputs, ...(cp.inputOverrides ?? {}) }; run(`moment:${cp.id}`, m[cp.id], at, toss.domains, caseId, evalScalar(cp.time, at, toss.domains), 1e-6); checked++;
    }
  }
  return { missingIds, unresolved, wrongIds: wrong, gapIds: [...new Set(gap.map(g => g.id))], checked };
}

// The $0 harness proof and a correct reference reply: the plan's own relations written as expressions.
const lit = value => ({ op: 'literal', value }), inp = id => ({ op: 'input', id }), bin = (op, left, right) => ({ op, left, right });
export function referenceReply(plan) {
  const t = inp('t'), u = inp('launchSpeed'), isInput = id => plan.controls.some(c => c.binding?.id === id), g = isInput('gravity') ? inp('gravity') : lit(plan.mode.fixedValues.gravity ?? 9.8), m = inp('mass');
  const neg = e => bin('multiply', lit(-1), e), half = e => bin('divide', e, lit(2)), sq = e => bin('multiply', e, e);
  const top = bin('divide', u, g), height = bin('subtract', bin('multiply', u, t), half(bin('multiply', g, sq(t)))), velocity = bin('subtract', u, bin('multiply', g, t));
  const apexHeight = bin('divide', sq(u), bin('multiply', lit(2), g)), tau = bin('subtract', t, top);
  const by = { launchSpeed: u, gravity: g, mass: m, apexTime: top, apexHeight, velocity, tossedVelocity: velocity, height, tossedHeight: height, acceleration: neg(g), tossedAcceleration: neg(g), force: bin('multiply', m, g),
    dropVelocity: neg(bin('multiply', g, tau)), dropAcceleration: neg(g), dropHeight: bin('subtract', apexHeight, half(bin('multiply', g, sq(tau)))) };
  return { quantities: Object.fromEntries(plan.scene.quantities.map(x => [x.id, by[x.id] ?? lit(0)])), moments: Object.fromEntries(plan.scene.checkpoints.filter(cp => cp.time).map(cp => [cp.id, structuredClone(cp.time)])) };
}
export const scriptedExpressionsAdapter = () => scriptedAdapter({ build_author: ({ input }) => referenceReply(input.__plan) });

// The role call's own price is null when the provider reports cached prompt tokens (no cache_read row for Gemini or Fireworks, charged at the input rate): folded into input like bench-author.mjs does.
const costOf = (config, usage, micros) => {
  if (micros != null) return micros / 1e6;
  const qs = usage?.quantities, p = config.pricingKey;
  if (!qs) return null;
  const folded = priceUsage({ provider: p.provider, model: p.model, tier: p.tier, quantities: { ...qs, input: (qs.input ?? 0) + (qs.cache_read ?? 0), cache_read: 0 } });
  return folded ? folded.micros / 1e6 : null;
};

// A reply is a few hundred tokens: the role's own 16000-token ceiling would let a runaway reply (gemini-3.5-flash cut off at it, 2026-11-13, +$0.17 for one attempt) eat the budget, so the bench caps it.
export const EXPRESSIONS_MAX_TOKENS = 6000;
export async function expressionsAttempt({ planName, model, ctx: given, save = null, ts = new Date().toISOString(), scripted = false }) {
  const ctx = { ...given, profile: { ...given.profile, roles: { ...given.profile.roles, build_author: { ...given.profile.roles.build_author, maxOutputTokens: EXPRESSIONS_MAX_TOKENS } } } };
  const { key, depth } = PLANS[planName], { referencePlans, referenceCapabilities } = await interactFixtures();
  const job = { id: `bench-${planName}`, plan: structuredClone(referencePlans[key]), planHash: await planHash(referencePlans[key]), capabilities: referenceCapabilities };
  const { plan } = await approvedPlanOf(job), schema = expressionsSchema(plan), input = expressionsInput(plan);
  const row = { ts, plan: planName, depth, model, provider: ctx.profile.roles.build_author.provider, contract: 'expressions', round: 0, validator: 'expr-v1', timing: 'v3' };
  const t0 = now();
  let done;
  try { done = await callInteractRole(ctx, 'build_author', { system: EXPRESSIONS_SYSTEM, schema, input: scripted ? { ...input, __plan: plan } : input, name: 'return_expressions', description: 'Return the equations of the plan as expression trees.' }); }
  catch (error) {
    const text = `${error.code ?? 'error'}: ${error.message}`, problems = error.problems?.length ? error.problems : [text];
    const missing = problems.map(p => /\$\.(quantities|moments)\.(\w+): required/.exec(p)).filter(Boolean).map(r => (r[1] === 'moments' ? `moment:${r[2]}` : r[2]));
    Object.assign(row, { result: 'fail', firstProblem: clip(problems[0]), problems: problems.slice(0, 12).map(p => clip(p)), missingIds: missing, wrongIds: [], gapIds: [], msAuthor: round1(now() - t0), msCheck: 0, msTotal: round1(now() - t0),
      costUsd: costOf(ctx.profile.roles.build_author, error.usage, error.costMicros), outTokens: error.usage?.quantities?.output ?? null, error: clip(error.message) });
    row.replyPath = save?.({ error: { code: error.code, message: error.message, problems: error.problems ?? null } }) ?? null;
    return row;
  }
  row.msAuthor = round1(now() - t0);
  row.costUsd = costOf(ctx.profile.roles.build_author, done.usage, done.costMicros); row.outTokens = done.usage?.quantities?.output ?? null; row.served = done.served?.model ?? null;
  row.replyPath = save?.({ reply: done.output, usage: done.usage?.raw ?? null }) ?? null;
  const t1 = now(), c = checkExpressions(plan, done.output);
  row.msCheck = round1(now() - t1); row.msTotal = round1(row.msAuthor + row.msCheck);
  const problems = [...c.missingIds.map(id => `missing: ${id}`), ...c.unresolved.map(u => `unresolvable: ${u.id} at ${u.case}: ${u.error}`), ...c.wrongIds.map(w => `wrong: ${w.id} at ${w.case}: got ${w.got}, expected ${w.expected}`)];
  Object.assign(row, { result: problems.length ? 'fail' : 'pass', firstProblem: problems[0] ?? null, problems: problems.slice(0, 12), missingIds: c.missingIds, unresolved: c.unresolved.slice(0, 6), wrongIds: c.wrongIds.slice(0, 12), gapIds: c.gapIds, checkedValues: c.checked });
  return row;
}

export async function runExpressions({ models, planNames, n, concurrency = 2, capUsd = Infinity, env, scripted = null, write = true, out = OUT, say = () => {} }) {
  const jobs = [];
  for (const model of models) for (const planName of planNames) for (let i = 0; i < n; i++) jobs.push({ model, planName, i });
  const all = [];
  let next = 0, spent = 0;
  const worker = async () => {
    while (next < jobs.length && spent <= capUsd) {
      const { model, planName, i } = jobs[next++], ts = new Date().toISOString(), saveDir = join(BENCH_DIR, 'bench-expressions');
      const save = write ? data => { mkdirSync(saveDir, { recursive: true }); const file = `${ts.replace(/[:.]/g, '-')}-${planName}-${model.replace(/[^\w.-]+/g, '_')}-a${i}.json`; writeFileSync(join(saveDir, file), JSON.stringify(data, null, 1)); return `docs/features/interact/benchmarks/bench-expressions/${file}`; } : null;
      const row = await expressionsAttempt({ planName, model, ctx: benchContext({ model, env, scripted }), save, ts, scripted: !!scripted });
      spent += row.costUsd ?? 0;
      if (write) { mkdirSync(dirname(out), { recursive: true }); appendFileSync(out, `${JSON.stringify(row)}\n`); }
      all.push(row);
      say(`${planName} ${model} a${i} ${row.result} ${row.firstProblem ? clip(row.firstProblem, 110) : ''} | author ${row.msAuthor} ms, $${(row.costUsd ?? 0).toFixed(5)} (total $${spent.toFixed(4)})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), 2, jobs.length) }, worker));
  return all;
}

const median = list => { const a = list.filter(x => x != null).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
export function reportMarkdown(rows) {
  const lines = ['# bench-expressions (the expressions-only contract)', '', 'Generated by `scripts/interact/bench-expressions.mjs --report`. pass = every id present, every expression resolvable, every value and moment within 1e-6 of the oracle. Piecewise quantities (a grammar gap, below) are not counted. quantities-only pass additionally forgives a wrong or missing moment (a checkpoint labelled only Rising or Falling does not say WHEN, so a moment can be underdetermined by the words of the plan).', ''];
  const models = [...new Set(rows.map(r => r.model))], depths = ['brief', 'balanced', 'detailed'];
  lines.push('| model | depth | attempts | pass | pass rate | quantities-only pass | median author s | median cost $ | gap ids |', '|---|---|---|---|---|---|---|---|---|');
  for (const model of models) for (const depth of depths) {
    const rs = rows.filter(r => r.model === model && r.depth === depth);
    if (!rs.length) continue;
    const qOk = r => r.result === 'pass' || ((r.missingIds?.length ?? 0) + (r.wrongIds?.length ?? 0) + (r.unresolved?.length ?? 0) > 0 && [...(r.missingIds ?? []), ...(r.wrongIds ?? []).map(w => w.id), ...(r.unresolved ?? []).map(u => u.id)].every(id => String(id).startsWith('moment:')));
    const pass = rs.filter(r => r.result === 'pass').length, qPass = rs.filter(qOk).length, gaps = [...new Set(rs.flatMap(r => r.gapIds ?? []))].join(', ') || '-';
    lines.push(`| ${model} | ${depth} | ${rs.length} | ${pass} | ${pass}/${rs.length} | ${qPass}/${rs.length} | ${((median(rs.map(r => r.msAuthor)) ?? 0) / 1000).toFixed(1)} | ${(median(rs.map(r => r.costUsd)) ?? 0).toFixed(5)} | ${gaps} |`);
  }
  lines.push('', '## Failed ids by model (a model under 8/10 on any depth)', '');
  for (const model of models) {
    const bad = depths.filter(d => { const rs = rows.filter(r => r.model === model && r.depth === d); return rs.length && rs.filter(r => r.result === 'pass').length / rs.length < 0.8; });
    if (!bad.length) continue;
    const count = new Map();
    for (const r of rows.filter(x => x.model === model && x.result === 'fail')) for (const id of new Set([...(r.missingIds ?? []).map(i => `missing ${i}`), ...(r.wrongIds ?? []).map(w => `wrong ${w.id}`), ...(r.unresolved ?? []).map(u => `unresolvable ${u.id}`)])) count.set(id, (count.get(id) ?? 0) + 1);
    const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, c]) => `${id} (${c})`).join('; ') || (rows.find(r => r.model === model && r.result === 'fail')?.firstProblem ?? '-');
    lines.push(`- **${model}** (under 8/10 at ${bad.join(', ')}): ${top}`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { model: { type: 'string' }, plan: { type: 'string', default: 'all' }, n: { type: 'string', default: '1' }, concurrency: { type: 'string', default: '2' }, 'cap-usd': { type: 'string', default: '2' },
    scripted: { type: 'boolean' }, 'no-write': { type: 'boolean' }, report: { type: 'boolean' } }, strict: true });
  if (a.report) { const rows = existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []; writeFileSync(REPORT, reportMarkdown(rows)); console.log(`wrote ${REPORT} from ${rows.length} rows`); }
  else {
    if (!a.model) { console.log(`usage: bench-expressions.mjs --model <${BENCH_MODELS.join('|')}|all> [--plan ${Object.keys(PLANS).join('|')}|all] [--n 10] [--concurrency 2] [--cap-usd 2] [--scripted] [--no-write] | --report`); process.exit(2); }
    const models = a.model === 'all' ? [...BENCH_MODELS] : [a.model], planNames = a.plan === 'all' ? Object.keys(PLANS) : [a.plan];
    for (const m of models) if (!BENCH_MODELS.includes(m)) { console.error(`x unknown model ${m}`); process.exit(2); }
    for (const p of planNames) if (!PLANS[p]) { console.error(`x unknown plan ${p}`); process.exit(2); }
    const scripted = a.scripted ? scriptedExpressionsAdapter() : null, env = scripted ? {} : readCredentials();
    if (!scripted) for (const m of models) { const refName = benchRole(m).credentialRef; if (!env[refName]) { console.error(`x ${refName} is not set in the env file; nothing was sent`); process.exit(2); } }
    const rows = await runExpressions({ models, planNames, n: Number(a.n), concurrency: Number(a.concurrency), capUsd: Number(a['cap-usd']), env, scripted, write: !a['no-write'], say: line => console.log(line) });
    const spent = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    console.log(`RESULT ${rows.filter(r => r.result === 'pass').length}/${rows.length} pass, $${spent.toFixed(4)} spent`);
    process.exitCode = spent > Number(a['cap-usd']) ? 3 : 0;
  }
}
