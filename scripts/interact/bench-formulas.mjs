#!/usr/bin/env node
// scripts/interact/bench-formulas.mjs (owner brief 2026-11-13 15:35, section 6): can a fast model WRITE the formulas when it is not handed them? bench-expressions.mjs gave the model the plan's own `relation` strings and
// asked for expression trees; here the plan reaches the model with relation, formula, switchAt and formulaAfter REMOVED from every quantity (id, label, unit, meaning, reference, the inputs with their ranges, the fixed values
// and the time symbol stay; no moments: a checkpoint's time is the plan's own). The model returns, as flat strings, { quantities: { <id>: { formula, switchAt, formulaAfter } } }.
// Check: interact-formula.js parseFormula + evalQuantity (via interact-formula-check.js checkQuantityFormulas) at every case of the plan's oracle, the oracle's expected values and tolerances. No program, no render, no job, no clone.
//   node scripts/interact/bench-formulas.mjs --model <id|all> [--plan toss-overview|toss-standard|toss-deep|ledge-toss-moon|all] [--n 10] [--concurrency 2] [--cap-usd 1.5] [--scripted] [--no-write]
//   node scripts/interact/bench-formulas.mjs --report        (docs/features/interact/benchmarks/bench-formulas.jsonl -> bench-formulas.md)
// Only the bench roles run (benchRole): no fallback chain, no judge, no Opus model (INTERACT_FALLBACK=off in the context). First try only.
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planHash } from '../../packages/web/src/interact-plan.js';
import { interactFixtures } from '../../packages/web/src/interact-plan-fixtures.js';
import { BENCH_MODELS, benchRole, callInteractRole } from '../../packages/control-plane/src/interact-models.js';
import { approvedPlanOf } from '../../packages/control-plane/src/interact-build.js';
import { scriptedAdapter } from '../../packages/control-plane/src/interact-fixtures.js';
import { priceUsage } from '../../packages/control-plane/src/pricing-registry.js';
import { checkQuantityFormulas, planFormulas } from '../../packages/control-plane/src/interact-formula-check.js';
import { BENCH_DIR, PLANS as AUTHOR_PLANS, benchContext, readCredentials } from './bench-author.mjs';

export const OUT = join(BENCH_DIR, 'bench-formulas.jsonl'), REPORT = join(BENCH_DIR, 'bench-formulas.md');
// The three toss plans of bench-author.mjs and the fourth (brief 7, section 5; its plan data arrives with agent D's branch: a run on a checkout without it is refused, never faked).
export const PLANS = Object.freeze({ ...AUTHOR_PLANS, 'ledge-toss-moon': { key: 'ledgeTossMoon', depth: 'brief' } });
const round1 = n => Math.round(n * 10) / 10, now = () => globalThis.performance.now(), clip = (s, n = 300) => String(s).replace(/\s+/g, ' ').slice(0, n);

export const FORMULAS_SYSTEM = [
  'You write the equations of a physics scene as formula strings. Given the approved plan, return one formula for every quantity in its `quantities`, in its unit and its sign convention (up is positive).',
  'A formula is text: numbers, names, + - * /, unary minus, parentheses, and ^ with a literal whole-number exponent 2, 3 or 4 (for example t^2). Nothing else: no functions, no conditions, no other powers. At most 200 characters and 32 nodes.',
  'The readable names are `t` (elapsed seconds since launch, 0 at the launch), the plan\'s `inputs` by id, and the ids of its `fixedValues`. Write nothing else.',
  'A quantity that changes rule at one moment is piecewise: `formula` applies while t < switchAt, `formulaAfter` from switchAt on. switchAt is a formula over the inputs and fixedValues only (no t).',
  'Give switchAt and formulaAfter as null when the quantity has one rule at every time. Return formulas only; no prose.',
].join('\n');

// The plan as the model sees it: no relation, no formula, no moments.
export function formulasInput(plan) {
  const inputs = plan.controls.filter(c => c.type === 'number' && c.binding.kind === 'input').map(c => ({ id: c.binding.id, label: c.label, unit: c.unit, min: c.min, max: c.max, default: c.default }));
  return {
    title: plan.title, story: plan.story, scene: plan.scene.description,
    quantities: plan.scene.quantities.map(({ id, label, unit, meaning, reference }) => ({ id, label, unit, meaning, reference })),
    inputs, fixedValues: plan.mode.fixedValues, time: { symbol: 't', unit: 's', meaning: 'elapsed seconds since launch' },
  };
}

// Flat and strings only (no recursion, which Gemini refuses): keys exactly the plan's quantity ids. A nullable string is anyOf string or null, the widest-supported spelling.
const NULLABLE = { anyOf: [{ type: 'string', maxLength: 200 }, { type: 'null' }] };
export function formulasSchema(plan) {
  const ids = plan.scene.quantities.map(q => q.id);
  const quantity = { type: 'object', properties: { formula: { type: 'string', maxLength: 200 }, switchAt: NULLABLE, formulaAfter: NULLABLE }, required: ['formula', 'switchAt', 'formulaAfter'], additionalProperties: false };
  return { type: 'object', properties: { quantities: { type: 'object', properties: Object.fromEntries(ids.map(id => [id, quantity])), required: ids, additionalProperties: false } }, required: ['quantities'], additionalProperties: false };
}

// The $0 harness proof: the plan's own formulas when it carries them for every quantity, else the physics written here for the toss quantities.
const TOSS = { launchSpeed: { formula: 'launchSpeed' }, gravity: { formula: 'gravity' }, mass: { formula: 'mass' }, apexTime: { formula: 'launchSpeed / gravity' }, apexHeight: { formula: 'launchSpeed^2 / (2 * gravity)' },
  velocity: { formula: 'launchSpeed - gravity * t' }, tossedVelocity: { formula: 'launchSpeed - gravity * t' }, height: { formula: 'launchSpeed * t - gravity * t^2 / 2' }, tossedHeight: { formula: 'launchSpeed * t - gravity * t^2 / 2' },
  acceleration: { formula: '-gravity' }, tossedAcceleration: { formula: '-gravity' }, force: { formula: 'mass * gravity' },
  dropVelocity: { formula: '0', switchAt: 'launchSpeed / gravity', formulaAfter: '-gravity * (t - launchSpeed / gravity)' }, dropAcceleration: { formula: '0', switchAt: 'launchSpeed / gravity', formulaAfter: '-gravity' },
  dropHeight: { formula: 'launchSpeed^2 / (2 * gravity)', switchAt: 'launchSpeed / gravity', formulaAfter: 'launchSpeed^2 / (2 * gravity) - gravity * (t - launchSpeed / gravity)^2 / 2' } };
export function referenceFormulas(plan) {
  const own = planFormulas(plan), ids = plan.scene.quantities.map(q => q.id), by = ids.every(id => own[id]) ? own : TOSS;
  return { quantities: Object.fromEntries(ids.map(id => [id, { formula: by[id]?.formula ?? '0', switchAt: by[id]?.switchAt ?? null, formulaAfter: by[id]?.formulaAfter ?? null }])) };
}
export const scriptedFormulasAdapter = () => scriptedAdapter({ build_author: ({ input }) => referenceFormulas(input.__plan) });

// A call's own price is null when the provider reports cached prompt tokens (no cache_read row for Gemini or Fireworks, charged at the input rate): folded into input like bench-expressions.mjs.
const costOf = (config, usage, micros) => {
  if (micros != null) return micros / 1e6;
  const qs = usage?.quantities, p = config.pricingKey;
  if (!qs) return null;
  const folded = priceUsage({ provider: p.provider, model: p.model, tier: p.tier, quantities: { ...qs, input: (qs.input ?? 0) + (qs.cache_read ?? 0), cache_read: 0 } });
  return folded ? folded.micros / 1e6 : null;
};

// A reply is a few hundred tokens: cap it so a runaway reply cannot eat the budget (the expressions bench lost $0.17 on one).
export const FORMULAS_MAX_TOKENS = 6000;
export async function formulasAttempt({ planName, model, ctx: given, save = null, ts = new Date().toISOString(), scripted = false }) {
  const ctx = { ...given, profile: { ...given.profile, roles: { ...given.profile.roles, build_author: { ...given.profile.roles.build_author, maxOutputTokens: FORMULAS_MAX_TOKENS } } } };
  const { key, depth } = PLANS[planName], { referencePlans, referenceCapabilities } = await interactFixtures();
  if (!referencePlans[key]) throw new Error(`plan ${planName} (${key}) is not in this checkout's fixtures`);
  const job = { id: `bench-${planName}`, plan: structuredClone(referencePlans[key]), planHash: await planHash(referencePlans[key]), capabilities: referenceCapabilities };
  const { plan } = await approvedPlanOf(job), schema = formulasSchema(plan), input = formulasInput(plan);
  const row = { ts, plan: planName, depth, model, provider: ctx.profile.roles.build_author.provider, contract: 'formulas', round: 0, validator: 'formula-v1', timing: 'v3' };
  const t0 = now();
  let done;
  try { done = await callInteractRole(ctx, 'build_author', { system: FORMULAS_SYSTEM, schema, input: scripted ? { ...input, __plan: plan } : input, name: 'return_formulas', description: 'Return the formulas of the plan\'s quantities.' }); }
  catch (error) {
    const text = `${error.code ?? 'error'}: ${error.message}`, problems = error.problems?.length ? error.problems : [text];
    Object.assign(row, { result: 'fail', firstProblem: clip(problems[0]), problems: problems.slice(0, 12).map(p => clip(p)), parseErrors: [], missingIds: [], wrongIds: [], msAuthor: round1(now() - t0), msCheck: 0, msTotal: round1(now() - t0),
      costUsd: costOf(ctx.profile.roles.build_author, error.usage, error.costMicros), outTokens: error.usage?.quantities?.output ?? null, error: clip(error.message) });
    row.replyPath = save?.({ error: { code: error.code, message: error.message, problems: error.problems ?? null } }) ?? null;
    return row;
  }
  row.msAuthor = round1(now() - t0);
  row.costUsd = costOf(ctx.profile.roles.build_author, done.usage, done.costMicros); row.outTokens = done.usage?.quantities?.output ?? null; row.served = done.served?.model ?? null;
  row.replyPath = save?.({ reply: done.output, usage: done.usage?.raw ?? null }) ?? null;
  const t1 = now(), c = checkQuantityFormulas(plan, done.output?.quantities);
  row.msCheck = round1(now() - t1); row.msTotal = round1(row.msAuthor + row.msCheck);
  const problems = [...c.missingIds.map(id => `missing: ${id}`), ...c.parseErrors.map(e => `parse: ${e.id}${e.case ? ` at ${e.case}` : ''}: ${e.message}`), ...c.wrongIds.map(w => `wrong: ${w.id} at ${w.case}: got ${w.got}, expected ${w.expected}`)];
  Object.assign(row, { result: problems.length ? 'fail' : 'pass', firstProblem: problems[0] ?? null, problems: problems.slice(0, 12), parseErrors: c.parseErrors.slice(0, 6), missingIds: c.missingIds, wrongIds: c.wrongIds.slice(0, 12), checkedValues: c.checked });
  return row;
}

export async function runFormulas({ models, planNames, n, concurrency = 2, capUsd = Infinity, env, scripted = null, write = true, out = OUT, say = () => {} }) {
  const jobs = [];
  for (const model of models) for (const planName of planNames) for (let i = 0; i < n; i++) jobs.push({ model, planName, i });
  const all = [];
  let next = 0, spent = 0;
  const worker = async () => {
    while (next < jobs.length && spent <= capUsd) {
      const { model, planName, i } = jobs[next++], ts = new Date().toISOString(), saveDir = join(BENCH_DIR, 'bench-formulas');
      const save = write ? data => { mkdirSync(saveDir, { recursive: true }); const file = `${ts.replace(/[:.]/g, '-')}-${planName}-${model.replace(/[^\w.-]+/g, '_')}-a${i}.json`; writeFileSync(join(saveDir, file), JSON.stringify(data, null, 1)); return `docs/features/interact/benchmarks/bench-formulas/${file}`; } : null;
      const row = await formulasAttempt({ planName, model, ctx: benchContext({ model, env, scripted }), save, ts, scripted: !!scripted });
      spent += row.costUsd ?? 0;
      if (write) { mkdirSync(dirname(out), { recursive: true }); appendFileSync(out, `${JSON.stringify(row)}\n`); }
      all.push(row);
      say(`${planName} ${model} a${i} ${row.result} ${row.firstProblem ? clip(row.firstProblem, 110) : ''} | author ${row.msAuthor} ms, ${row.outTokens ?? '?'} tok, $${(row.costUsd ?? 0).toFixed(5)} (total $${spent.toFixed(4)})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), 2, jobs.length) }, worker));
  return all;
}

const median = list => { const a = list.filter(x => x != null).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
export function reportMarkdown(rows) {
  const lines = ['# bench-formulas (can a fast model write the formulas when the plan does not hand them over?)', '',
    'Generated by `scripts/interact/bench-formulas.mjs --report`. The plan reaches the model without `relation`, `formula`, `switchAt` and `formulaAfter`; the reply is parsed with `parseFormula` and evaluated with `evalQuantity` at every oracle case (expected values and tolerances of the build\'s own oracle). pass = every id present, every formula parses, every value within tolerance. First try only.', ''];
  const models = [...new Set(rows.map(r => r.model))], plans = Object.keys(PLANS);
  lines.push('| model | plan | attempts | pass | median author s | median output tokens | median cost $ |', '|---|---|---|---|---|---|---|');
  for (const model of models) for (const plan of plans) {
    const rs = rows.filter(r => r.model === model && r.plan === plan);
    if (!rs.length) continue;
    lines.push(`| ${model} | ${plan} | ${rs.length} | ${rs.filter(r => r.result === 'pass').length}/${rs.length} | ${((median(rs.map(r => r.msAuthor)) ?? 0) / 1000).toFixed(1)} | ${median(rs.map(r => r.outTokens)) ?? '-'} | ${(median(rs.map(r => r.costUsd)) ?? 0).toFixed(5)} |`);
  }
  lines.push('', '## Failures (model x plan, by quantity id: case, got, expected; a parse error shows its message)', '');
  for (const model of models) for (const plan of plans) {
    const bad = rows.filter(r => r.model === model && r.plan === plan && r.result === 'fail');
    if (!bad.length) continue;
    const count = new Map();
    for (const r of bad) {
      for (const id of r.missingIds ?? []) count.set(`missing ${id}`, (count.get(`missing ${id}`) ?? 0) + 1);
      for (const e of r.parseErrors ?? []) { const k = `parse ${e.id}: ${e.message.slice(0, 90)}`; count.set(k, (count.get(k) ?? 0) + 1); }
      const seen = new Set();
      for (const w of r.wrongIds ?? []) if (!seen.has(w.id)) { seen.add(w.id); const k = `wrong ${w.id} at ${w.case}: got ${Number(w.got).toPrecision(4)}, expected ${Number(w.expected).toPrecision(4)}`; count.set(k, (count.get(k) ?? 0) + 1); }
      if (!(r.missingIds?.length || r.parseErrors?.length || r.wrongIds?.length)) count.set(r.firstProblem ?? 'failed', (count.get(r.firstProblem ?? 'failed') ?? 0) + 1);
    }
    lines.push(`- **${model} / ${plan}** (${bad.length} failed): ${[...count].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k} (${c})`).join('; ')}`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { model: { type: 'string' }, plan: { type: 'string', default: 'all' }, n: { type: 'string', default: '1' }, concurrency: { type: 'string', default: '2' }, 'cap-usd': { type: 'string', default: '1.5' },
    scripted: { type: 'boolean' }, 'no-write': { type: 'boolean' }, report: { type: 'boolean' } }, strict: true });
  if (a.report) { const rows = existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []; writeFileSync(REPORT, reportMarkdown(rows)); console.log(`wrote ${REPORT} from ${rows.length} rows`); }
  else {
    if (!a.model) { console.log(`usage: bench-formulas.mjs --model <${BENCH_MODELS.join('|')}|all> [--plan ${Object.keys(PLANS).join('|')}|all] [--n 10] [--concurrency 2] [--cap-usd 1.5] [--scripted] [--no-write] | --report`); process.exit(2); }
    const models = a.model === 'all' ? [...BENCH_MODELS] : [a.model], planNames = a.plan === 'all' ? Object.keys(PLANS) : [a.plan];
    for (const m of models) if (!BENCH_MODELS.includes(m)) { console.error(`x unknown model ${m}`); process.exit(2); }
    for (const p of planNames) if (!PLANS[p]) { console.error(`x unknown plan ${p}`); process.exit(2); }
    const scripted = a.scripted ? scriptedFormulasAdapter() : null, env = scripted ? {} : readCredentials();
    if (!scripted) for (const m of models) { const refName = benchRole(m).credentialRef; if (!env[refName]) { console.error(`x ${refName} is not set in the env file; nothing was sent`); process.exit(2); } }
    const rows = await runFormulas({ models, planNames, n: Number(a.n), concurrency: Number(a.concurrency), capUsd: Number(a['cap-usd']), env, scripted, write: !a['no-write'], say: line => console.log(line) });
    const spent = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    console.log(`RESULT ${rows.filter(r => r.result === 'pass').length}/${rows.length} pass, $${spent.toFixed(4)} spent`);
    process.exitCode = spent > Number(a['cap-usd']) ? 3 : 0;
  }
}
