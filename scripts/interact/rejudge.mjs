// Overnight brief section 3: re-run the shadow judge on cards that already exist, WITHOUT rebuilding them on the clone. For each job of a list: read the stored plan (read-only GET of the job detail on the dev clone),
// rebuild the card in-process (template build: zero model calls, headless capture) and ask the Sonnet judge ONCE with the readable input (interact-bench.js benchJudgeInput, bench-judge-v2). Advisory only.
//   node scripts/interact/rejudge.mjs --set <jobs.json> [--out <dir>] [--dry] [--cap-usd 1]
// jobs.json: [{ label, email, board, job }]. Keys are read BY NAME from small-deploy/.env and never printed. Dev clone only; no Opus (claude-sonnet-5-5 at effort low).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { planHash } from '../../packages/web/src/interact-plan.js';
import { buildTemplate } from '../../packages/control-plane/src/interact-template.js';
import { buildPlanCaptureCases, headlessCaptureCard, CHECK_LIMITS } from '../../packages/control-plane/src/interact-checks.js';
import { designCapabilities } from '../../packages/control-plane/src/interact-design.js';
import { benchJudgeInput } from '../../packages/control-plane/src/interact-bench.js';
import { BENCH_JUDGE_RUBRIC, BENCH_JUDGE_SCHEMA, BENCH_JUDGE_TOOL, BENCH_JUDGE_VERSION } from '../../packages/control-plane/src/agents/interact-bench-judge.js';

const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const SONNET = 'claude-sonnet-5-5', USD_PER_MTOK = { in: 2, out: 10 }; // pricing-registry.js
const BUILD_ENV = { INTERACT_BUILD_KIND: 'template', INTERACT_SEEK: 'on', EXPLAIN_PROGRAM_ENABLED: 'true', EXPLAIN_PROGRAM_STATEFUL: 'true' };

const { values: a } = parseArgs({ options: { set: { type: 'string' }, out: { type: 'string', default: 'docs/features/interact/benchmarks/judge2' }, dry: { type: 'boolean' }, 'cap-usd': { type: 'string', default: '1' } } });
if (!a.set) { console.error('usage: node scripts/interact/rejudge.mjs --set <jobs.json> [--out dir] [--dry] [--cap-usd N]'); process.exit(2); }
const env = {}; for (const l of readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const jobs = JSON.parse(readFileSync(a.set, 'utf8')), cap = Number(a['cap-usd']);
mkdirSync(a.out, { recursive: true });

const sessions = new Map();
async function planOf({ email, board, job }) {
  if (!sessions.has(email)) {
    const r = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) });
    sessions.set(email, (await r.json()).session);
  }
  const r = await fetch(`${BASE}/api/learn/explain/jobs/${job}?board=${board}&detail=1`, { headers: { ...UA, cookie: `small_session=${sessions.get(email)}` } });
  const d = await r.json(), detail = d.data ?? d;
  if (!detail.scenePlan?.plan) throw new Error(`no stored plan for ${job} (HTTP ${r.status})`);
  return detail.scenePlan.plan;
}

async function judge(input) {
  const body = { model: SONNET, max_tokens: 8000, system: BENCH_JUDGE_RUBRIC, tools: [{ name: BENCH_JUDGE_TOOL.name, description: BENCH_JUDGE_TOOL.description, input_schema: BENCH_JUDGE_SCHEMA }], tool_choice: { type: 'auto' }, output_config: { effort: 'low' }, messages: [{ role: 'user', content: input }] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-owner-bench/1', ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}) }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`anthropic http ${r.status}`);
    const j = await r.json(), out = j.content?.find(b => b.type === 'tool_use')?.input;
    const usd = ((j.usage?.input_tokens ?? 0) * USD_PER_MTOK.in + (j.usage?.output_tokens ?? 0) * USD_PER_MTOK.out) / 1e6;
    if (out?.verdict && Array.isArray(out.findings)) return { ...out, usd };
  }
  throw new Error('the judge returned no verdict twice');
}

let spent = 0;
for (const item of jobs) {
  try {
    const plan = await planOf(item), evidence = [{ id: 'kinematics_note' }];
    const capabilities = await designCapabilities(BUILD_ENV, { evidence });
    const built = await buildTemplate({ id: item.job, plan, planHash: await planHash(plan), capabilities, evidence }, { env: BUILD_ENV, capabilities });
    if (!built.artifacts) throw new Error(`rebuild refused: ${(built.problems ?? []).join(' | ').slice(0, 300)}`);
    const { cases } = buildPlanCaptureCases(plan, built.composition, built.artifacts, { limit: CHECK_LIMITS.maxCases });
    const captures = await headlessCaptureCard(BUILD_ENV)({ composition: built.composition, artifacts: built.artifacts, cases });
    const input = benchJudgeInput(plan, built.composition, cases, captures, built.artifacts.main.program.manifest);
    const bytes = new TextEncoder().encode(input).length;
    if (a.dry) { console.log(`${item.label}: input ${bytes} bytes, ${cases.length} states (dry)`); continue; }
    if (spent >= cap) { console.log(`${item.label}: skipped, spend cap US$${cap} reached`); continue; }
    const out = await judge(input); spent += out.usd;
    writeFileSync(`${a.out}/${item.job}.json`, JSON.stringify({ jobId: item.job, label: item.label, judgeModel: SONNET, rubric: BENCH_JUDGE_VERSION, inputBytes: bytes, verdict: out.verdict, costUsd: Math.round(out.usd * 1e6) / 1e6, findings: out.findings }, null, 1));
    console.log(`${item.label}: ${out.verdict}, ${out.findings.filter(f => f.severity !== 'minor').length} blocker or major, US$${out.usd.toFixed(4)}`);
  } catch (error) { console.log(`${item.label}: FAILED ${String(error.message).slice(0, 300)}`); }
}
console.log(`spend US$${spent.toFixed(4)}`);
