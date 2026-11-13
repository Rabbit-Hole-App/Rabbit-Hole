#!/usr/bin/env node
// scripts/interact/bench-author.mjs (owner brief 2026-11-13 14:20, section 1): which fast model writes the CURRENT program contract one-shot. One attempt is the real build path with a real
// provider and everything after the model call in this process, no clone, no browser, no canvas:
//   approvedPlanOf -> buildInput + buildSchema (interact-build.js, the plan's frameIds, timeline and controlBindings as the job sends them) -> the role call through the real adapter of the model's
//   benchRole (callInteractRole) -> cleanBuildReply -> validateBuildOutput -> headlessCaptureCard (the sealed programs in the pinned QuickJS engine) -> the deterministic checks and the oracle
//   (captureAndCheck: layout rules, convention, arrow_direction, quantities), the stage order and limits of the durable job.
//   node scripts/interact/bench-author.mjs --model <id|all> [--plan toss-overview|toss-standard|toss-deep|all] [--n 5] [--rounds 0] [--validator v1] [--seed 7] [--concurrency 2] [--scripted] [--no-write]
// One JSONL row per model call (a first try is round 0; with --rounds 1 a refused round 0 gets one correction call, row round 1) goes to docs/features/interact/benchmarks/bench-author.jsonl and the raw
// reply to benchmarks/bench-author/<ts>-<plan>-<model>-r<round>.json. Timing is performance.now() around each stage (timing=v3): msAuthor is the provider round trip, msValidate, msRun (the headless
// run over every capture case) and msCheck (oracles and layout rules) are measured, msTotal is their sum. costUsd is the adapter's usage priced by the registry (priceUsage), never guessed.
// Secrets are read by the env NAMES the registry declares (GEMINI_API_KEY, FIREWORKS_API_KEY, ANTHROPIC_API_KEY) from small-deploy/.env (parsed, never sourced, never printed or written).
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planHash } from '../../packages/web/src/interact-plan.js';
import { interactFixtures } from '../../packages/web/src/interact-plan-fixtures.js';
import { INTERACT_BUILD_SYSTEM, INTERACT_BUILD_TOOL_NAME } from '../../packages/control-plane/src/agents/explain-author.js';
import { AUTHOR_CORRECTION, approvedPlanOf, buildInput, buildSchema, cleanBuildReply, validateBuildOutput } from '../../packages/control-plane/src/interact-build.js';
import { captureAndCheck, headlessCaptureCard } from '../../packages/control-plane/src/interact-checks.js';
import { BENCH_MODELS, INTERACT_REGISTRY, InteractModelError, benchRole, callInteractRole, interactAdapters, resolveInteractProfile } from '../../packages/control-plane/src/interact-models.js';
import { interactOracle } from '../../packages/control-plane/src/interact-oracle.js';
import { CHAIN_ENDPOINTS } from '../../packages/control-plane/src/explanation-fast-chain.js';
import { priceUsage } from '../../packages/control-plane/src/pricing-registry.js';
import { problemCause } from '../../packages/control-plane/src/interact-ledger.js';
import { scriptedAdapter } from '../../packages/control-plane/src/interact-fixtures.js';
import { tossDraft } from '../../packages/web/src/interact-toss-programs.js';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '..', '..');
export const BENCH_DIR = join(REPO, 'docs/features/interact/benchmarks');
export const PLANS = Object.freeze({ 'toss-overview': { key: 'tossOverview', depth: 'brief' }, 'toss-standard': { key: 'tossStandard', depth: 'balanced' }, 'toss-deep': { key: 'tossDeep', depth: 'detailed' } });
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const UA = 'rabbit-hole-bench-author/1';
const round1 = n => Math.round(n * 10) / 10, now = () => globalThis.performance.now();

// Only the credential NAMES the registry declares are read, from the owner's env file, by parsing it (never sourcing it); values stay in this process's memory.
export function readCredentials(file = ENV_FILE) {
  const wanted = new Set([...Object.values(INTERACT_REGISTRY.providers).map(p => p.credentialRef), 'ANTHROPIC_WORKSPACE_ID']), out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && wanted.has(m[1])) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

// The two real transports. The OpenAI-compatible adapter sends with fetch (a custom User-Agent: Cloudflare 1010 refuses the bare default); the Anthropic adapter's callModel posts the same body the job's
// transport does (ask.js anthropicTransport) with the key by name.
const bareFetch = (url, init) => fetch(url, { ...init, headers: { 'User-Agent': UA, ...init.headers } });
const anthropicCall = (env, body, model) => fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST', signal: env.CAD_MODEL_ABORT_SIGNAL,
  headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'User-Agent': UA, ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}) },
  body: JSON.stringify({ ...body, model }),
});

// The $0 harness proof: build_author answers with the scripted toss program of the plan's depth (the same programs interact-scripted.js serves), everything else is the real path.
export const scriptedBuildAdapterByInput = () => scriptedAdapter({ build_author: ({ input }) => ({ kind: 'scene', ...tossDraft({ brief: 'tossOverview', balanced: 'tossStandard', detailed: 'tossDeep' }[input.depth]) }) });

// One role context: the model's own bench role as the build_author step, real adapters (or the scripted one), a no-op admission (no job, no ledger), the headless capture seam.
export function benchContext({ model, env, scripted = null, seed = null }) {
  let role = benchRole(model);
  if (seed != null && role.settings?.seed !== undefined) role = { ...role, settings: { ...role.settings, seed } };
  const base = resolveInteractProfile('opus-baseline'), profile = Object.freeze({ ...base, id: 'bench', roles: { ...base.roles, build_author: role } });
  const adapters = scripted ? { anthropic: scripted, 'openai-compatible': scripted } : { anthropic: interactAdapters({ env, callModel: anthropicCall }).anthropic, 'openai-compatible': interactAdapters({ env, fetch: bareFetch })['openai-compatible'] };
  return { ...(scripted ? { fixture: true } : {}), env: { ...env, INTERACT_SCENE_PLAN_ENABLED: 'true', INTERACT_FALLBACK: 'off' }, profile, adapters, admit: () => {}, settle: () => {}, completeCardUnavailable: true, captureCard: headlessCaptureCard({}) };
}

// The role call's own price (interactCostMicros) is null when the provider reports cached prompt tokens: the registry has no cache_read row for Gemini or Fireworks (their cached tokens are charged at the input rate,
// pricing-registry.js says so), so the bench folds cache_read into input, the registry's own stated over-estimate, instead of leaving the cost unknown.
const costOf = (config, usage, micros) => {
  if (micros != null) return micros / 1e6;
  const q = usage?.quantities, p = config.pricingKey;
  if (!q) return null;
  const folded = priceUsage({ provider: p.provider, model: p.model, tier: p.tier, quantities: { ...q, input: (q.input ?? 0) + (q.cache_read ?? 0), cache_read: 0 } });
  return folded ? folded.micros / 1e6 : null;
};
const withCorrection = (input, problems) => ({ ...input, correction: { instruction: AUTHOR_CORRECTION, problems } });
const causesOf = problems => problems.length ? [...new Set(problems.map(problemCause))].join('; ') : '';
const clip = (s, n = 400) => String(s).replace(/\s+/g, ' ').slice(0, n);

// One attempt (a first try, then up to `rounds` corrections by the same model while the last round was refused). -> the rows, one per model call. Never throws on a model or build problem.
export async function benchAttempt({ planName, model, ctx, rounds = 0, validator = 'v1', save = null, ts = new Date().toISOString() }) {
  const { key, depth } = PLANS[planName], { referencePlans, referenceCapabilities } = await interactFixtures();
  const job = { id: `bench-${planName}`, plan: structuredClone(referencePlans[key]), planHash: await planHash(referencePlans[key]), capabilities: referenceCapabilities, evidence: [], oracle: null };
  const { plan, hash } = await approvedPlanOf(job);
  job.oracle = interactOracle(plan);
  const schema = buildSchema(plan), input = buildInput(job, plan, hash), rows = [];
  let problems = [];
  for (let round = 0; round <= rounds; round++) {
    const row = { ts, plan: planName, depth, model, provider: ctx.profile.roles.build_author.provider, round, validator, timing: 'v3' };
    const args = { system: INTERACT_BUILD_SYSTEM, schema, sanitize: reply => cleanBuildReply(reply, schema), input: round ? withCorrection(input, problems.slice(0, 12)) : input, name: INTERACT_BUILD_TOOL_NAME, description: 'Build the approved scene plan.' };
    const fail = (first, all, extra = {}) => Object.assign(row, { result: 'fail', firstProblem: clip(first), problems: all.slice(0, 12).map(p => clip(p)), repairCauses: causesOf(all), ...extra });
    const t0 = now();
    let done;
    try { done = await callInteractRole(ctx, 'build_author', args); }
    catch (error) {
      const text = `${error.code ?? 'error'}: ${error.message}`, microsOf = error.costMicros;
      Object.assign(row, { msAuthor: round1(now() - t0), msValidate: 0, msRun: 0, msCheck: 0, costUsd: costOf(ctx.profile.roles.build_author, error.usage, microsOf), outTokens: error.usage?.quantities?.output ?? null, error: clip(error.message, 300), errorCode: error.code ?? null });
      fail(text, error.problems?.length ? error.problems : [text]);
      row.msTotal = round1(row.msAuthor);
      row.replyPath = save?.({ round, error: { code: error.code, message: error.message, problems: error.problems ?? null, usage: error.usage?.raw ?? null } }) ?? null;
      rows.push(row); problems = row.problems; if (error.code && !['schema_mismatch', 'invalid_output', 'truncated'].includes(error.code)) break; continue;
    }
    row.msAuthor = round1(now() - t0);
    row.overDeadline = CHAIN_ENDPOINTS[row.provider]?.deadlineMs != null && row.msAuthor > CHAIN_ENDPOINTS[row.provider].deadlineMs; // slower than the profile's per-provider deadline (the clone would have timed out)
    row.costUsd = costOf(ctx.profile.roles.build_author, done.usage, done.costMicros); row.outTokens = done.usage?.quantities?.output ?? null; row.served = done.served?.model ?? null;
    row.replyPath = save?.({ round, reply: done.output, usage: done.usage?.raw ?? null }) ?? null;
    const reply = done.output;
    if (reply?.kind === 'capability_gap') { Object.assign(row, { msValidate: 0, msRun: 0, msCheck: 0 }); fail(`capability_gap: ${JSON.stringify(reply.gap?.needs ?? []).slice(0, 120)}`, [`capability_gap: ${JSON.stringify(reply.gap ?? {}).slice(0, 300)}`]); }
    else {
      const t1 = now(); const v = await validateBuildOutput(job, reply, ctx); row.msValidate = round1(now() - t1);
      if (v.gap) { Object.assign(row, { msRun: 0, msCheck: 0 }); fail(`capability_gap: ${JSON.stringify(v.gap).slice(0, 200)}`, [`capability_gap: ${JSON.stringify(v.gap).slice(0, 400)}`]); }
      else if (v.problems) { Object.assign(row, { msRun: 0, msCheck: 0 }); fail(v.problems[0], v.problems); }
      else {
        const t2 = now(), checked = await captureAndCheck({ ...job, artifacts: v.artifacts, composition: v.composition }, ctx), wall = now() - t2;
        row.msRun = round1(checked.ms?.run ?? wall); row.msCheck = round1(checked.ms?.check ?? 0);
        const oracle = checked.failure?.details ?? [];
        row.oracleChecked = checked.check?.oracle?.checked ?? checked.det?.coverage?.oracle?.checked ?? null;
        if (checked.status === 'captured') Object.assign(row, { result: 'pass', firstProblem: null, problems: [], repairCauses: '' });
        else if (checked.status === 'failed') fail(checked.failure.problems[0], checked.failure.problems, { oracleFailed: oracle.filter(p => ['numeric_mismatch', 'quantity_missing'].includes(p.code)).length });
        else fail(`${checked.status}: ${clip(checked.reason ?? '')}`, [`${checked.status}: ${clip(checked.reason ?? '')}`]);
      }
    }
    row.msTotal = round1(['msAuthor', 'msValidate', 'msRun', 'msCheck'].reduce((n, k) => n + (row[k] ?? 0), 0));
    rows.push(row); problems = row.problems ?? [];
    if (row.result === 'pass') break;
  }
  return rows;
}

// n attempts x the plans x the models, at most `concurrency` at once. Rows are appended as each attempt ends.
export async function runBench({ models, planNames, n, rounds, validator, concurrency = 2, capUsd = Infinity, env, seed = null, scripted = null, write = true, out = join(BENCH_DIR, 'bench-author.jsonl'), say = () => {} }) {
  const jobs = [];
  for (const model of models) for (const planName of planNames) for (let i = 0; i < n; i++) jobs.push({ model, planName, i });
  const all = [];
  let next = 0, spent = 0;
  const worker = async () => {
    while (next < jobs.length && spent <= capUsd) { // the spend cap stops NEW attempts; an attempt in flight finishes
      const { model, planName, i } = jobs[next++], ts = new Date().toISOString();
      const saveDir = join(BENCH_DIR, 'bench-author');
      const save = write ? ({ round, ...data }) => {
        mkdirSync(saveDir, { recursive: true });
        const file = `${ts.replace(/[:.]/g, '-')}-${planName}-${model.replace(/[^\w.-]+/g, '_')}-a${i}-r${round}.json`;
        writeFileSync(join(saveDir, file), JSON.stringify(data, null, 1)); return `docs/features/interact/benchmarks/bench-author/${file}`;
      } : null;
      const rows = await benchAttempt({ planName, model, ctx: benchContext({ model, env, scripted, seed }), rounds, validator, save, ts });
      for (const row of rows) { spent += row.costUsd ?? 0; if (write) { mkdirSync(dirname(out), { recursive: true }); appendFileSync(out, `${JSON.stringify(row)}\n`); } all.push(row);
        say(`${planName} ${model} a${i} r${row.round} ${row.result} ${row.firstProblem ? clip(row.firstProblem, 110) : ''} | author ${row.msAuthor} ms, $${(row.costUsd ?? 0).toFixed(4)} (run total $${spent.toFixed(3)})`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), 2, jobs.length) }, worker));
  return all;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { model: { type: 'string' }, plan: { type: 'string', default: 'all' }, n: { type: 'string', default: '1' }, rounds: { type: 'string', default: '0' }, validator: { type: 'string', default: 'v1' },
    seed: { type: 'string' }, concurrency: { type: 'string', default: '2' }, scripted: { type: 'boolean' }, 'no-write': { type: 'boolean' }, 'cap-usd': { type: 'string', default: '4' }, help: { type: 'boolean' } }, strict: true });
  if (a.help || !a.model) { console.log(`usage: bench-author.mjs --model <${BENCH_MODELS.join('|')}|all> [--plan ${Object.keys(PLANS).join('|')}|all] [--n 5] [--rounds 0|1] [--validator v1|v2] [--seed 7] [--concurrency 2] [--scripted] [--no-write] [--cap-usd 4]`); process.exit(a.help ? 0 : 2); }
  const models = a.model === 'all' ? [...BENCH_MODELS] : [a.model], planNames = a.plan === 'all' ? Object.keys(PLANS) : [a.plan];
  for (const m of models) if (!BENCH_MODELS.includes(m)) { console.error(`x unknown model ${m}`); process.exit(2); }
  for (const p of planNames) if (!PLANS[p]) { console.error(`x unknown plan ${p}`); process.exit(2); }
  const scripted = a.scripted ? scriptedBuildAdapterByInput() : null;
  const env = scripted ? {} : readCredentials();
  if (!scripted) for (const m of models) { const ref = benchRole(m).credentialRef; if (!env[ref]) { console.error(`x ${ref} is not set in the env file; nothing was sent`); process.exit(2); } }
  const rows = await runBench({ models, planNames, n: Number(a.n), rounds: Number(a.rounds), validator: a.validator, concurrency: Number(a.concurrency), capUsd: Number(a['cap-usd']), env, seed: a.seed ? Number(a.seed) : null, scripted, write: !a['no-write'], say: line => console.log(line) });
  const spent = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  console.log(`RESULT ${rows.filter(r => r.result === 'pass').length}/${rows.length} pass, $${spent.toFixed(4)} spent`);
  process.exitCode = spent > Number(a['cap-usd']) ? 3 : 0; // not process.exit: a Windows libuv assertion fires when the process is cut with sockets still closing
}
