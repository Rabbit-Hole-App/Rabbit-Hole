// Model-driven Motion validation (owner task a940a2a8, 2026-10-23): one /motion request through the real path
// (runMotionRequest in motion/pipeline.mjs: Director, storyboard, Author, preview, reviews, one repair, final render on the
// deployed dev renderer). At most the three runs below; each is reserved on the SHARED ledger before its first model call.
//   node scripts/motion-model-run.mjs M1|M2|M3 --service <url>            free rehearsal: grounding, request sizes, worst cases, /health
//   node scripts/motion-model-run.mjs M1|M2|M3 --service <url> --call     the paid run (MOTION_RENDERER_TOKEN from the environment)
// Credentials: ANTHROPIC_API_KEY / ANTHROPIC_WORKSPACE_ID by name from MOTION_ENV_FILE (the owner's credentials file); values are
// never printed. A refusal from the provider is recorded verbatim and ends the run: no other key or provider is tried.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { budgetLedger, worstCase } from '../motion/benchmark.mjs';
import { directorContext, directorRequest } from '../motion/director.js';
import { durationDecision } from '../motion/duration.js';
import { fixtureSource } from '../motion/fixture-source.js';
import { resolveRole } from '../motion/model-config.js';
import { apiCall } from '../motion/orchestrator-main.mjs';
import { runMotionRequest } from '../motion/pipeline.mjs';
import { serviceClient } from '../motion/render-job.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const BUDGET = 'file:///C:/s/spec/budget/budget.mjs';
const LANE = 'motion-model-runs';
const MODEL_CEILING_USD = 2.95; // the per-run model bound the call guard enforces ...
const RENDER_ALLOWANCE_USD = 0.05; // ... plus an allowance for the machine time (0.0904 USD/h): together the owner's $3 ceiling
const RESERVE_USD = +(MODEL_CEILING_USD + RENDER_ALLOWANCE_USD).toFixed(2);
const HOURLY_USD = 0.0904;

const MLP = { label: 'MLP', range: { path: 'model.py', start: 78, end: 92 } };
const PREP = { label: 'character-level data preparation', range: { path: 'data/shakespeare_char/prepare.py', start: 23, end: 45 } };
export const RUNS = Object.freeze({
  M1: { ratio: '16:9', seconds: 15, message: '/motion 15s explain me softmax func', location: { concept: 'Attention' }, note: 'the reference request (code + math + matrix), original ratio' },
  M2: {
    ratio: '9:16', seconds: 30, message: '/motion 30s explain this', repository_context: MLP,
    approved: { title: 'The MLP block in nanoGPT', duration_seconds: 30, aspect_ratio: '9:16', description: 'What the two linear layers and the GELU between them do to each token, read from model.py lines 78 to 92.' },
    note: 'a portrait ratio and a non-attention shape, approved proposal as the product sends it',
  },
  // 2026-10-25: the 15 s pair with the smallest fixture margin to the 420 s limit that has no model-built video: 9:16 at 15 s (D02-c4 service total 121.47 s,
  // the largest of the nine 15 s ratios; 16:9 has M1). The same request as M1 so the two ratios compare; the ratio travels in an approved proposal as the product sends it.
  M4: {
    ratio: '9:16', seconds: 15, message: '/motion 15s explain me softmax func', location: { concept: 'Attention' },
    approved: { title: 'Softmax in attention', duration_seconds: 15, aspect_ratio: '9:16', description: 'How softmax turns a row of attention scores into weights that sum to one, read from model.py line 69.' },
    note: 'the 15 s pair with the least margin to the render limit and no model-built video; the M1 request in a portrait stage',
  },
  // 2026-10-25: pairs that the initial activation enables, most used first (the product default is 10 s at 16:9), all the M1 request so the pairs compare.
  M5: { ratio: '16:9', seconds: 10, message: '/motion 10s explain me softmax func', location: { concept: 'Attention' }, note: 'the product default duration at the default ratio' },
  M6: { ratio: '16:9', seconds: 30, message: '/motion 30s explain me softmax func', location: { concept: 'Attention' }, note: 'the longest duration of the first expanded release at the default ratio' },
  M7: {
    ratio: '1:1', seconds: 15, message: '/motion 15s explain me softmax func', location: { concept: 'Attention' },
    approved: { title: 'Softmax in attention', duration_seconds: 15, aspect_ratio: '1:1', description: 'How softmax turns a row of attention scores into weights that sum to one, read from model.py line 69.' },
    note: 'the square stage at 15 s',
  },
  M8: {
    ratio: '4:5', seconds: 15, message: '/motion 15s explain me softmax func', location: { concept: 'Attention' },
    approved: { title: 'Softmax in attention', duration_seconds: 15, aspect_ratio: '4:5', description: 'How softmax turns a row of attention scores into weights that sum to one, read from model.py line 69.' },
    note: 'a portrait stage other than 9:16 at 15 s',
  },
  M3: { ratio: '16:9', seconds: 60, message: '/motion 60s explain this', repository_context: PREP, note: 'the longest duration on a non-model system flow: the capacity ceiling of the fixture evidence (medium and simple pass to 60 s)' },
});

const [name, ...rest] = process.argv.slice(2);
const opt = key => { const i = rest.indexOf(key); return i >= 0 ? rest[i + 1] : null; };
const run = RUNS[name];
if (!run || !opt('--service')) { console.error(`usage: node scripts/motion-model-run.mjs ${Object.keys(RUNS).join('|')} --service <url> [--call]`); process.exit(2); }
const live = rest.includes('--call');
const url = opt('--service').replace(/\/+$/, '');
const runId = `mmr-${name}${process.env.MOTION_MODEL_RUN_SUFFIX || ''}`;
const OUT = process.env.MOTION_MODEL_RUN_OUT ? resolve(process.env.MOTION_MODEL_RUN_OUT) : join(PKG, 'out', 'motion', 'model-runs', name);
const write = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };
const money = n => `$${(+n).toFixed(4)}`;

function credentials() {
  const env = {};
  const file = process.env.MOTION_ENV_FILE;
  if (!file || !existsSync(file)) throw new Error('MOTION_ENV_FILE must name the credentials file');
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error('no ANTHROPIC_API_KEY in the credentials file');
  return env;
}

const source = fixtureSource();
const repository_context = run.repository_context ? { ...run.repository_context, commit: source.commit } : null;
const location = run.location ?? {};
const turn = resolveLearnerTurn({ message: run.message, location, repository_context });
const grounding = groundTarget(turn, source);

// Free part: what would be sent, its size, the worst case of its first call, and the renderer's identity.
const model = resolveRole('MOTION_DIRECTOR_MODEL', {});
const decision = durationDecision(run.approved ? `${run.approved.duration_seconds}s` : turn.structured_interpretation.request_text);
const first = grounding.status === 'grounded' || grounding.status === 'ungrounded' ? directorRequest(directorContext(turn, grounding, decision, run.approved ?? null), { effort: 'high' }) : null;
const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(15000) }).then(r => r.json()).catch(e => ({ error: String(e.message || e) }));
const rehearsal = {
  run: name, ratio: run.ratio, seconds: run.seconds, request: run.message, grounding: grounding.status, target: grounding.resolved_target?.label ?? null,
  duration_decision: decision, director_model: model, director_first_call_worst_case_usd: first ? worstCase(first, model) : null,
  per_run: { model_ceiling_usd: MODEL_CEILING_USD, render_allowance_usd: RENDER_ALLOWANCE_USD, reserve_usd: RESERVE_USD },
  renderer: { ok: health.ok ?? null, git_revision: health.settings?.git_revision ?? null, cpus: health.settings?.cpus ?? null, memory_gib: health.settings?.memory_gib ?? null, error: health.error ?? null },
};
console.log(JSON.stringify(rehearsal, null, 2));
write(join(OUT, 'rehearsal.json'), rehearsal);
if (!live) process.exit(grounding.status === 'grounded' && health.ok ? 0 : 1);

// Paid part.
if (grounding.status !== 'grounded') { console.error(`✗ ${name} does not ground (${grounding.status}); nothing spent`); process.exit(1); }
if (!health.ok) { console.error('✗ the renderer did not answer /health ok; nothing spent'); process.exit(1); }
if (!process.env.MOTION_RENDERER_TOKEN) { console.error('✗ MOTION_RENDERER_TOKEN is not set (use C:/s/motion-run/with-token.mjs)'); process.exit(2); }
if (existsSync(join(OUT, 'pipeline.json'))) { console.error(`✗ ${name} already ran (${OUT}); a rerun needs the owner's go and a new run id`); process.exit(2); }
const env = credentials();
const budget = await import(BUDGET);
const reserved = budget.reserve(runId, LANE, RESERVE_USD);
if (!reserved.ok || reserved.reused) { console.error(`✗ shared ledger refused (a reused run id holds no new reservation; set MOTION_MODEL_RUN_SUFFIX): ${JSON.stringify(reserved)}`); process.exit(3); }
console.log(`reserved ${money(RESERVE_USD)} on the shared ledger: ${JSON.stringify(budget.status())}`);

const ledger = budgetLedger(join(OUT, 'ledger.json'), MODEL_CEILING_USD);
const errors = [];
// The provider's own words for any refusal, recorded verbatim (an error body carries no secret).
// MOTION_MODEL_RUN_STUB=refuse: the free rehearsal of this script's paid path (a provider refusal, no network, a temporary ledger).
const send = process.env.MOTION_MODEL_RUN_STUB === 'refuse' ? async () => Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'stub refusal' } }, { status: 400 }) : apiCall; // the orchestrator's own transport (api.anthropic.com, the key and workspace headers), not the Learn worker's spend-gated ask.js
const call = async (e, body, m) => {
  const response = await ledger.guard(send, { run: name })(e, body, m);
  if (!response.ok) errors.push({ at: new Date().toISOString(), status: response.status, body: (await response.clone().text()).slice(0, 2000) });
  return response;
};
const client = serviceClient({ url, token: process.env.MOTION_RENDERER_TOKEN });
const t0 = Date.now();
let out = null, thrown = null;
try {
  out = await runMotionRequest({
    message: run.message, location, repository_context, source, ...(run.approved ? { approved: run.approved } : {}),
    renderer: 'remotion', call, env, service: client, dir: OUT,
  });
  await ledger.idle();
} catch (error) { thrown = error; try { await ledger.idle(); } catch { /* the guard's own bookkeeping */ } }

const wallS = +((Date.now() - t0) / 1000).toFixed(1);
const modelUsd = +ledger.state.spent_usd.toFixed(4);
const renderUpperUsd = +(Math.min(RENDER_ALLOWANCE_USD, HOURLY_USD * wallS / 3600)).toFixed(4);
const calls = out?.calls ?? [];
const tokens = {};
for (const c of calls) for (const [k, v] of Object.entries(c.usage || {})) if (typeof v === 'number') tokens[k] = (tokens[k] || 0) + v;
const summary = {
  run: name, status: out?.status ?? 'exception', failure_reason: out?.failure_reason ?? (thrown ? String(thrown.message || thrown).slice(0, 500) : null), cause: out?.cause ?? null,
  renderer: { git_revision: health.settings?.git_revision, cpus: health.settings?.cpus, memory_gib: health.settings?.memory_gib },
  served_models: [...new Set(calls.map(c => c.served_model).filter(Boolean))], resolved_models: [...new Set(calls.map(c => c.resolved_model).filter(Boolean))],
  calls: calls.map(c => ({ stage: c.stage, round: c.round ?? null, role: c.role, served_model: c.served_model, stop_reason: c.stop_reason, usage: c.usage, cost_usd: c.cost_usd, latency_ms: c.latency_ms })),
  tokens_by_category: tokens, wall_s: wallS,
  cost: { measured_model_usd: out?.cost_usd ?? null, guard_ledger_model_usd: modelUsd, render_upper_bound_usd: renderUpperUsd, reserved_max_usd: RESERVE_USD },
  provider_errors: errors,
};
write(join(OUT, 'summary.json'), summary);
console.log(JSON.stringify(summary, null, 2));

// Settle: the guard ledger's model spend (a call whose cost could not be read counts at its worst case) plus the render upper bound.
// An exception or an unanswered call leaves the run uncertain at its maximum; a definite refusal with no usage settles at what was spent.
const answeredAll = !thrown && out;
if (!answeredAll) { budget.uncertain(runId); console.log('ledger: uncertain (counted at the reserved maximum)'); process.exit(1); }
console.log('ledger:', JSON.stringify(budget.settle(runId, +(modelUsd + renderUpperUsd).toFixed(4))));
process.exit(out.status === 'ready' ? 0 : 1);
