#!/usr/bin/env node
// scripts/interact/bench-design-mvp.mjs (owner brief 11, 2026-11-13 19:35, sections 2 and 3): can a fast model write the PLAN of the three toss cards from the prompt and the depth alone? One call fills a flat plan brief
// (packages/web/src/interact-plan-brief.js: briefSchema, expandBrief, extractBrief, familyDescription, referenceFormulaCheck); code expands it into the ScenePlan; the sealed template build turns the plan into the card.
//   fill        one role call, input { request, depth } and nothing about the toss; system = SCENE_TEACHING_GUIDE verbatim + the family description + the roles, word keys and the formula grammar; no examples
//   steps       schema parse -> expandBrief -> parseScenePlan + runtimeProblems + captureBudgetProblems + description fit (the design stage's own close) -> referenceFormulaCheck (24 points) ->
//               generateProgram + validateBuildOutput (buildTemplate) -> headless run, layout rules, convention and the arrow-direction rule (captureAndCheck with the family arrow oracle) -> match to the approved card
//   pass        every step clean and the match holds. First try only, no correction call. Rows: docs/features/interact/benchmarks/bench-design-mvp.jsonl (raw replies and expanded plans beside it).
//   node scripts/interact/bench-design-mvp.mjs --model <id|all> [--depth brief|balanced|detailed|all] [--n 10] [--concurrency 2] [--cap-usd 2] [--scripted] [--no-write]
//   node scripts/interact/bench-design-mvp.mjs --report        (bench-design-mvp.jsonl -> bench-design-mvp.md)
// Only the bench roles run (benchRole): no fallback chain, no judge, no Opus model. Secrets by env NAME from small-deploy/.env (parsed, never sourced or printed).
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureBudgetProblems, parseScenePlan, planHash, descriptionFitProblems } from '../../packages/web/src/interact-plan.js';
import { descriptionFit } from '../../packages/web/src/interact-description-fit.js';
import { interactFixtures } from '../../packages/web/src/interact-plan-fixtures.js';
import { briefSchema, expandBrief, extractBrief, familyDescription, referenceFormulaCheck } from '../../packages/web/src/interact-plan-brief.js';
import { SCENE_TEACHING_GUIDE } from '../../packages/control-plane/src/agents/interact-design-author.js';
import { runtimeProblems } from '../../packages/control-plane/src/interact-design.js';
import { BENCH_MODELS, benchRole, callInteractRole } from '../../packages/control-plane/src/interact-models.js';
import { approvedPlanOf } from '../../packages/control-plane/src/interact-build.js';
import { buildTemplate } from '../../packages/control-plane/src/interact-template.js';
import { captureAndCheck } from '../../packages/control-plane/src/interact-checks.js';
import { verticalThrowArrowOracle } from '../../packages/control-plane/src/interact-oracle.js';
import { scriptedAdapter } from '../../packages/control-plane/src/interact-fixtures.js';
import { priceUsage } from '../../packages/control-plane/src/pricing-registry.js';
import { BENCH_DIR, benchContext, readCredentials } from './bench-author.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '..', '..');
export const OUT = join(BENCH_DIR, 'bench-design-mvp.jsonl'), REPORT = join(BENCH_DIR, 'bench-design-mvp.md'), SAVE_DIR = join(BENCH_DIR, 'bench-design-mvp');
export const REQUEST = 'At the highest point of a vertical throw, is acceleration zero because velocity is zero?'; // docs/features/interact/references/tutor-scene-examples.md
export const DEPTHS = Object.freeze(['brief', 'balanced', 'detailed']);
const PINNED = { brief: 'tossOverview', balanced: 'tossStandard', detailed: 'tossDeep' };
const round1 = n => Math.round(n * 10) / 10, now = () => globalThis.performance.now(), clip = (s, n = 400) => String(s).replace(/\s+/g, ' ').slice(0, n);
export const FILL_MAX_TOKENS = 8000; // a brief is a few hundred to a thousand tokens: cap a runaway reply

// The formula grammar, as in bench-formulas.mjs: what the parser reads and nothing else.
const GRAMMAR = [
  'A formula is text: numbers, names, + - * /, unary minus, parentheses, and ^ with a literal whole-number exponent 2, 3 or 4 (for example t^2). Nothing else: no functions, no conditions, no other powers. At most 200 characters and 32 nodes.',
  'The readable names are `t` (elapsed seconds since launch, 0 at the launch), the scene\'s numeric inputs by id (launchSpeed, gravity, mass where the scene has them) and, where the scene fixes gravity, `gravity`. Up is positive; a force is a magnitude. A quantity that changes rule at one moment is piecewise: `formula` applies while t < switchAt, `formulaAfter` from switchAt on; switchAt is a formula over the inputs only (no t). Give switchAt and formulaAfter as null when the quantity has one rule at every time.',
].join('\n');

// The keys of the brief with what each one is, from briefSchema(depth).keys (one source for the schema and the prompt): the text keys, the launch height, the inputs, the formula roles with unit, meaning and sign
// convention, and the word keys with their length limits.
function keyLines(keys) {
  const piece = role => (role.piecewise ? ' Piecewise: formula applies before switchAt, formulaAfter from switchAt on.' : '');
  return [
    ...keys.text.map(k => `- ${k.key}: ${k.what} (at most ${k.max} characters)`),
    `- launchHeight: ${keys.launchHeight}`,
    ...keys.inputs.map(i => `- ${i.id}: ${i.label}, ${i.unit}. ${i.meaning}${i.reference ? ` ${i.reference}` : ''} (${i.kind})`),
    // A formula role's `reference` IS the answer (its reference formula): never sent. The role keeps its label, unit and meaning (the sign convention).
    // (a role's meaning may spell out its switch moment, "(switchAt = ...)": that is the formula the model is asked to write, so it is cut)
    ...keys.formulas.map(f => `- formulas.${f.id}: ${f.label}, ${f.unit}. ${f.meaning.replace(/ \(switchAt = [^)]*\)/, '')}${piece(f)}`),
    ...keys.words.map(w => `- words.${w.key}: ${w.what} (at most ${w.max} characters)`),
  ];
}

export function fillSystem(depth, schemaInfo) {
  return [SCENE_TEACHING_GUIDE, '', `## The scene family (depth ${depth})`, familyDescription(depth), '', '## The keys of the plan brief', ...keyLines(schemaInfo.keys), '', '## Formulas', GRAMMAR, '', 'Return the brief only: no prose.'].join('\n');
}

const costOf = (config, usage, micros) => {
  if (micros != null) return micros / 1e6;
  const qs = usage?.quantities, p = config.pricingKey;
  if (!qs) return null;
  const folded = priceUsage({ provider: p.provider, model: p.model, tier: p.tier, quantities: { ...qs, input: (qs.input ?? 0) + (qs.cache_read ?? 0), cache_read: 0 } });
  return folded ? folded.micros / 1e6 : null;
};

// The match to the approved card: the pinned plan at this depth. Same control ids; the number controls' units; a default inside the pinned range; a range at most twice and at least half as wide; the same fixed gravity (the Overview).
export function matchProblems(plan, pinned) {
  const out = [], numbers = p => p.controls.filter(c => c.type === 'number' && c.binding.kind === 'input');
  const ids = p => p.controls.map(c => c.id).sort().join(',');
  if (ids(plan) !== ids(pinned)) out.push(`match: control ids ${ids(plan)} differ from the approved card's ${ids(pinned)}`);
  for (const want of numbers(pinned)) {
    const got = numbers(plan).find(c => c.binding.id === want.binding.id);
    if (!got) { out.push(`match: control "${want.binding.id}" is missing`); continue; }
    if (got.unit !== want.unit) out.push(`match: "${want.binding.id}" unit "${got.unit}", the approved card's is "${want.unit}"`);
    if (!(got.default >= want.min && got.default <= want.max)) out.push(`match: "${want.binding.id}" default ${got.default} is outside the approved ${want.min} to ${want.max}`);
    const ratio = (got.max - got.min) / (want.max - want.min);
    if (!(ratio >= 0.5 && ratio <= 2)) out.push(`match: "${want.binding.id}" range ${got.min} to ${got.max} is ${round1(ratio * 100) / 100}x as wide as the approved ${want.min} to ${want.max} (allowed 0.5x to 2x)`);
  }
  for (const [name, value] of Object.entries(pinned.mode.fixedValues)) if (plan.mode.fixedValues?.[name] !== value) out.push(`match: fixed ${name} is ${plan.mode.fixedValues?.[name]}, the approved card's is ${value}`);
  return out;
}

// referenceFormulaCheck's failures as problem lines: the role, the point (a parse failure has none), got and expected.
const formulaProblems = result => (result?.failures ?? []).map(f => `formula ${f.role}${f.point ? ` at ${JSON.stringify(f.point)}` : ''}: got ${f.got}, expected ${f.expected}`);

const slug = s => s.replace(/[^\w.-]+/g, '_');

// One attempt. -> the row (never throws on a model or build problem). `save(kind, data)` stores a raw reply or an expanded plan and returns its repo-relative path.
export async function designAttempt({ depth, model, ctx, save = null, ts = new Date().toISOString() }) {
  const { referencePlans, referenceCapabilities } = await interactFixtures(), pinned = referencePlans[PINNED[depth]];
  const row = { ts, depth, model, provider: ctx.profile.roles.build_author.provider, contract: 'design-mvp', round: 0, timing: 'v3' };
  const info = briefSchema(depth);
  const config = ctx.profile.roles.build_author, run = { ...ctx, profile: { ...ctx.profile, roles: { ...ctx.profile.roles, build_author: { ...config, maxOutputTokens: FILL_MAX_TOKENS } } } };
  const t0 = now();
  let done;
  const finish = (problems, extra = {}) => {
    row.msTotal = round1(['msFill', 'msExpand', 'msChecks', 'msBuild'].reduce((n, k) => n + (row[k] ?? 0), 0));
    return Object.assign(row, { result: problems.length ? 'fail' : 'pass', firstProblem: problems[0] ? clip(problems[0]) : null, problems: problems.slice(0, 12).map(p => clip(p)) }, extra);
  };
  try { done = await callInteractRole(run, 'build_author', { system: fillSystem(depth, info), schema: info.jsonSchema, input: { request: REQUEST, depth }, name: 'return_plan_brief', description: 'Return the plan brief of the scene.' }); }
  catch (error) {
    const text = `${error.code ?? 'error'}: ${error.message}`;
    Object.assign(row, { msFill: round1(now() - t0), msExpand: 0, msChecks: 0, msBuild: 0, costUsd: costOf(config, error.usage, error.costMicros), outTokens: error.usage?.quantities?.output ?? null, error: clip(error.message, 300), errorCode: error.code ?? null, step: 'fill' });
    row.replyPath = save?.('reply', { error: { code: error.code, message: error.message, problems: error.problems ?? null } }) ?? null; row.expandedPlanPath = null;
    return finish(error.problems?.length ? error.problems : [text]);
  }
  row.msFill = round1(now() - t0); row.costUsd = costOf(config, done.usage, done.costMicros); row.outTokens = done.usage?.quantities?.output ?? null; row.served = done.served?.model ?? null;
  row.replyPath = save?.('reply', { reply: done.output, usage: done.usage?.raw ?? null }) ?? null; row.expandedPlanPath = null;
  const brief = done.output;
  // The brief against its own strict schema (limits, keys).
  const parsed = info.parse ? info.parse(brief) : { ok: true, value: brief };
  if (parsed && parsed.ok === false) return finish((parsed.problems ?? ['brief: refused']).map(p => (typeof p === 'string' ? p : `${p.path ?? ''} ${p.message ?? ''}`.trim())), { step: 'schema', msExpand: 0, msChecks: 0, msBuild: 0 });
  const t1 = now();
  let plan;
  try { plan = expandBrief(parsed?.value ?? brief, depth, { catalogueHash: referenceCapabilities.catalogueHash }); } catch (error) { row.msExpand = round1(now() - t1); return finish([`expand: ${clip(error.message, 300)}`], { step: 'expand', msChecks: 0, msBuild: 0 }); }
  row.msExpand = round1(now() - t1); row.expandedPlanPath = save?.('plan', plan) ?? null;
  // The plan checks (the design stage's own close), the formula check, then the build and its checks.
  const t2 = now();
  const fail = (step, list) => { row.msChecks = round1((row.msChecks ?? 0) + (now() - t2)); return finish(list, { step, msBuild: row.msBuild ?? 0 }); };
  const job = { id: `design-mvp-${depth}`, plan, planHash: await planHash(plan), capabilities: referenceCapabilities, evidence: [], oracle: null };
  const checked = parseScenePlan(plan, referenceCapabilities);
  if (!checked.ok) return fail('plan', checked.problems.map(p => `${p.path} ${p.message}`));
  const planIssues = [...runtimeProblems(plan, referenceCapabilities), ...captureBudgetProblems(plan)].map(p => (typeof p === 'string' ? p : `${p.path ?? ''} ${p.message ?? ''}`.trim()));
  if (planIssues.length) return fail('plan', planIssues);
  const fitIssues = await descriptionFitProblems(plan, await descriptionFit(plan));
  if (fitIssues.length) return fail('plan', fitIssues.map(p => (typeof p === 'string' ? p : `${p.path ?? ''} ${p.message ?? ''}`.trim())));
  const wrong = formulaProblems(referenceFormulaCheck(parsed?.value ?? brief, depth));
  if (wrong.length) return fail('formulas', wrong);
  const t3 = now();
  row.msChecks = round1(t3 - t2);
  const built = await buildTemplate(job, ctx);
  row.msBuild = round1(now() - t3);
  if (built.problems) return finish(built.problems, { step: 'build' });
  const t4 = now();
  job.oracle = verticalThrowArrowOracle((await approvedPlanOf(job)).plan);
  const result = await captureAndCheck({ ...job, artifacts: built.artifacts, composition: built.composition }, ctx);
  row.msChecks = round1(row.msChecks + (now() - t4));
  if (result.status !== 'captured') return finish(result.status === 'failed' ? result.failure.problems : [`${result.status}: ${clip(result.reason ?? '')}`], { step: 'checks', oracleChecked: result.check?.oracle?.checked ?? null });
  const mismatch = matchProblems(plan, pinned);
  return finish(mismatch, { step: mismatch.length ? 'match' : 'done', oracleChecked: result.det?.coverage?.oracle?.checked ?? null});
}

export async function runDesign({ models, depths, nOf, concurrency = 2, capUsd = Infinity, env, scripted = null, write = true, out = OUT, say = () => {} }) {
  const jobs = [];
  for (const model of models) for (const depth of depths) for (let i = 0; i < nOf(model); i++) jobs.push({ model, depth, i });
  const all = [];
  let next = 0, spent = 0;
  const worker = async () => {
    while (next < jobs.length && spent <= capUsd) { // the cap stops NEW attempts; one in flight finishes
      const { model, depth, i } = jobs[next++], ts = new Date().toISOString(), stem = `${ts.replace(/[:.]/g, '-')}-${depth}-${slug(model)}-a${i}`;
      const save = write ? (kind, data) => { mkdirSync(SAVE_DIR, { recursive: true }); const file = `${stem}-${kind}.json`; writeFileSync(join(SAVE_DIR, file), JSON.stringify(data, null, 1)); return `docs/features/interact/benchmarks/bench-design-mvp/${file}`; } : null;
      const row = await designAttempt({ depth, model, ctx: benchContext({ model, env, scripted }), save, ts });
      spent += row.costUsd ?? 0;
      if (write) { mkdirSync(dirname(out), { recursive: true }); appendFileSync(out, `${JSON.stringify(row)}\n`); }
      all.push(row);
      say(`${depth} ${model} a${i} ${row.result} [${row.step ?? 'done'}] ${row.firstProblem ? clip(row.firstProblem, 120) : ''} | fill ${row.msFill} ms, ${row.outTokens ?? '?'} tok, $${(row.costUsd ?? 0).toFixed(5)} (total $${spent.toFixed(4)})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), 2, jobs.length) }, worker));
  return all;
}

const median = list => { const a = list.filter(x => x != null).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
export function reportMarkdown(rows) {
  const lines = ['# bench-design-mvp (can a fast model write the plan of the toss cards from the prompt and the depth alone?)', '',
    'Generated by `scripts/interact/bench-design-mvp.mjs --report`. One call fills a flat plan brief; code expands it to the ScenePlan; the sealed template builds the card. pass = every step clean (schema, expand, plan checks, description fit, the 24-point formula check against the family physics, the template build, the headless run with layout rules and the arrow-direction rule) and the match to the approved card holds (same control ids and units, defaults inside the pinned ranges, ranges 0.5x to 2x of the pinned ones). First try only.', ''];
  const models = [...new Set(rows.map(r => r.model))];
  lines.push('| model | depth | attempts | pass | median fill s | median total s | median cost $ |', '|---|---|---|---|---|---|---|');
  for (const model of models) for (const depth of DEPTHS) {
    const rs = rows.filter(r => r.model === model && r.depth === depth);
    if (!rs.length) continue;
    lines.push(`| ${model} | ${depth} | ${rs.length} | ${rs.filter(r => r.result === 'pass').length}/${rs.length} | ${((median(rs.map(r => r.msFill)) ?? 0) / 1000).toFixed(1)} | ${((median(rs.map(r => r.msTotal)) ?? 0) / 1000).toFixed(1)} | ${(median(rs.map(r => r.costUsd)) ?? 0).toFixed(4)} |`);
  }
  lines.push('', '## Top three first problems per model (verbatim)', '');
  for (const model of models) {
    const count = new Map();
    for (const r of rows.filter(r => r.model === model && r.result === 'fail')) { const k = r.firstProblem ?? 'failed'; count.set(k, (count.get(k) ?? 0) + 1); }
    lines.push(`**${model}**`, '', ...(count.size ? [...count].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, c]) => `- ${c}x ${k}`) : ['- none (every attempt passed)']), '');
  }
  return `${lines.join('\n')}\n`;
}

// The $0 harness proof: the model "writes" the brief of the pinned plan at the depth (extractBrief), through the real adapter path of the scripted adapter.
export const scriptedDesignAdapter = (briefOf = (plan, depth) => extractBrief(plan, depth)) => scriptedAdapter({ build_author: async ({ input }) => { const { referencePlans } = await interactFixtures(); return briefOf(referencePlans[PINNED[input.depth]], input.depth); } });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { model: { type: 'string' }, depth: { type: 'string', default: 'all' }, n: { type: 'string', default: '10' }, 'n-sonnet': { type: 'string', default: '3' }, concurrency: { type: 'string', default: '2' },
    'cap-usd': { type: 'string', default: '2' }, scripted: { type: 'boolean' }, 'no-write': { type: 'boolean' }, report: { type: 'boolean' } }, strict: true });
  if (a.report) { const rows = existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []; writeFileSync(REPORT, reportMarkdown(rows)); console.log(`wrote ${REPORT} from ${rows.length} rows`); }
  else {
    if (!a.model) { console.log(`usage: bench-design-mvp.mjs --model <${BENCH_MODELS.join('|')}|all> [--depth ${DEPTHS.join('|')}|all] [--n 10] [--n-sonnet 3] [--concurrency 2] [--cap-usd 2] [--scripted] [--no-write] | --report`); process.exit(2); }
    const models = a.model === 'all' ? ['gemini-3.5-flash-lite', 'claude-sonnet-5-5'] : [a.model], depths = a.depth === 'all' ? [...DEPTHS] : [a.depth];
    for (const m of models) if (!BENCH_MODELS.includes(m)) { console.error(`x unknown model ${m}`); process.exit(2); }
    for (const d of depths) if (!DEPTHS.includes(d)) { console.error(`x unknown depth ${d}`); process.exit(2); }
    const scripted = a.scripted ? scriptedDesignAdapter() : null, env = scripted ? {} : readCredentials();
    if (!scripted) for (const m of models) { const ref = benchRole(m).credentialRef; if (!env[ref]) { console.error(`x ${ref} is not set in the env file; nothing was sent`); process.exit(2); } }
    const rows = await runDesign({ models, depths, nOf: m => Number(/sonnet/.test(m) ? a['n-sonnet'] : a.n), concurrency: Number(a.concurrency), capUsd: Number(a['cap-usd']), env, scripted, write: !a['no-write'], say: line => console.log(line) });
    const spent = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    console.log(`RESULT ${rows.filter(r => r.result === 'pass').length}/${rows.length} pass, $${spent.toFixed(4)} spent`);
    process.exitCode = spent > Number(a['cap-usd']) ? 3 : 0;
  }
}
