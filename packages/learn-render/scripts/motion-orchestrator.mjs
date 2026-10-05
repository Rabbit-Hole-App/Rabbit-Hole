// M7A development orchestrator (motion/orchestrator.mjs) on the local Motion stack: HTTPS on
// 127.0.0.1 with the stack's certificate (scripts/motion-local-check.mjs setup), the bearer token
// from .small/motion-local/app/.dev.vars (MOTION_ORCHESTRATOR_TOKEN, never printed).
//   node scripts/motion-orchestrator.mjs [--port 8856] [--service <url>] [--max-calls 16]
//   node scripts/motion-orchestrator.mjs --stub <final.mp4> [--stub-fail authoring]   no model call, no render
// Model calls use ANTHROPIC_API_KEY from the environment, else MOTION_ENV_FILE or <repo>/.env (names
// only are read; values are never printed). Without --service the render service runs in this
// process with the unsandboxed child (the authoring host); with --service, MOTION_RENDERER_TOKEN.
// Every finished job appends its stages, calls, cost and timings to out/motion/m7a-telemetry.jsonl.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropic } from '../../control-plane/src/ask.js';
import { motionOrchestrator } from '../motion/orchestrator.mjs';
import { abortableSleep } from '../motion/review-job.mjs';
import { localService, serviceClient } from '../motion/render-job.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const LOCAL = join(ROOT, '.small', 'motion-local');
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const port = Number(opt('--port') || 8856);
const url = opt('--service');
const stub = opt('--stub');
const vars = Object.fromEntries(readFileSync(join(LOCAL, 'app', '.dev.vars'), 'utf8').trim().split(/\r?\n/).map(l => l.split(/=(.*)/s).slice(0, 2)));
if (!vars.MOTION_ORCHESTRATOR_TOKEN) { console.error('✗ no MOTION_ORCHESTRATOR_TOKEN in .small/motion-local/app/.dev.vars: run scripts/motion-local-check.mjs setup'); process.exit(2); }

function credentials() {
  const env = Object.fromEntries(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID', 'MOTION_DIRECTOR_MODEL', 'MOTION_AUTHOR_MODEL', 'MOTION_VISUAL_REVIEW_MODEL', 'MOTION_PEDAGOGICAL_REVIEW_MODEL'].map(k => [k, process.env[k]]));
  const file = process.env.MOTION_ENV_FILE || join(ROOT, '.env');
  if (!env.ANTHROPIC_API_KEY && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID)=(.*)$/.exec(line.trim());
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return env;
}

// The stub pipeline: the same stages and timings shape, no model call and no render. It proves the
// card, the Durable Object and Stop without spending anything.
const stubRun = ({ dir, signal, onStage }) => (async () => {
  const sleep = abortableSleep(signal), t0 = Date.now();
  try {
    for (const stage of ['resolving', 'directing', 'storyboarding', 'authoring', 'review_and_render']) {
      onStage(stage);
      if (stage === opt('--stub-fail')) return { status: 'failed', failure_reason: `stub: failed during ${stage}`, timings: {}, cost_usd: 0 };
      await sleep(Number(opt('--stub-stage-ms') || 3000));
    }
  } catch { return { status: 'cancelled', failure_reason: 'stub: stopped', timings: {}, cost_usd: 0 }; }
  mkdirSync(join(dir, 'final'), { recursive: true });
  copyFileSync(stub, join(dir, 'final', 'final.mp4'));
  const brief = JSON.parse(readFileSync(join(PKG, 'motion', 'fixtures', 'm2', 'softmax-15s-attention.brief.json'), 'utf8'));
  return { status: 'ready', brief, block: { motion: { job_id: 'stub', duration_seconds: 15, renderer: 'remotion', teaching_mode: brief.teaching_mode, prompt_spec_version: brief.prompt_spec_version, source_refs: brief.source_refs.map(({ id, kind, repository, commit, path, start_line, end_line }) => ({ id, kind, repository, commit, path, start_line, end_line })), claim_ids: [] } }, render: { render_id: '0'.repeat(32) }, job: { repair_count: 0 }, cost_usd: 0, timings: { total: +((Date.now() - t0) / 1000).toFixed(1) } };
})();

const env = credentials();
if (!stub && !env.ANTHROPIC_API_KEY) { console.error(`✗ no ANTHROPIC_API_KEY in the environment or ${process.env.MOTION_ENV_FILE || join(ROOT, '.env')}`); process.exit(2); }
if (url && !process.env.MOTION_RENDERER_TOKEN) { console.error('✗ --service needs MOTION_RENDERER_TOKEN in the environment'); process.exit(2); }
const svc = url ? { client: serviceClient({ url: url.replace(/\/$/, ''), token: process.env.MOTION_RENDERER_TOKEN }), close: () => {} } : await localService();
const outDir = join(PKG, 'out', 'motion', 'm7a');
const orchestrator = motionOrchestrator({
  token: vars.MOTION_ORCHESTRATOR_TOKEN, service: svc.client, call: anthropic, env, outDir, maxCalls: Number(opt('--max-calls') || 16),
  ...(stub ? { run: stubRun } : {}),
  log: line => {
    console.log(`${new Date().toISOString()} ${line}`);
    const m = /^job ([0-9a-f]{32}): (ready|failed|cancelled|needs_clarification)/.exec(line);
    const job = m && orchestrator.jobs.get(m[1]);
    if (job) appendFileSync(join(PKG, 'out', 'motion', 'm7a-telemetry.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), job_id: job.id, stub: !!stub, request: job.request, status: job.status, stage: job.stage, repair_count: job.result?.job?.repair_count ?? null, cost_usd: job.result?.cost_usd ?? null, model_latency_s: job.result?.model_latency_s ?? null, timings: job.result?.timings ?? null, calls: (job.result?.calls || []).map(c => ({ stage: c.stage, round: c.round, latency_ms: c.latency_ms, output_tokens: c.usage?.output_tokens, cost_usd: c.cost_usd })) })}\n`);
  },
});
mkdirSync(outDir, { recursive: true });
createServer({ key: readFileSync(join(LOCAL, 'certs', 'leaf.key')), cert: readFileSync(join(LOCAL, 'certs', 'leaf.pem')) }, orchestrator.handle)
  .listen(port, '127.0.0.1', () => console.log(`✓ Motion orchestrator on https://localhost:${port} (${stub ? `stub: ${stub}` : `render service: ${url || 'local, sandbox none (authoring host)'}`})`));
process.on('SIGINT', () => { svc.close(); process.exit(0); });
