// The hostable Motion orchestrator entry (owner item 2, 2026-10-21): configuration from the environment only, plain
// HTTP on HOST:PORT behind the host's TLS (Fly), no local certificate or .dev.vars file. Refuses to start without its
// token, model key and the sandboxed render service. Prepared for rabbit-hole-motion-orchestrator (fly.orchestrator.toml);
// nothing deploys it.
//   MOTION_ORCHESTRATOR_TOKEN  (>= 32 chars; also signs and verifies the worker's per-job grant)
//   ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID (optional)
//   MOTION_RENDERER_URL, MOTION_RENDERER_TOKEN
//   HOST (0.0.0.0), PORT (8080), MOTION_WORK_DIR (/tmp/motion-jobs), MOTION_MAX_CALLS (9), MOTION_JOB_TIMEOUT_S (3300)
// Every job runs under PRODUCTION_POLICY (orchestrator.mjs): its worst case is the per-job hold the worker admits.
//   MOTION_DIRECTOR_MODEL, MOTION_AUTHOR_MODEL, MOTION_VISUAL_REVIEW_MODEL, MOTION_PEDAGOGICAL_REVIEW_MODEL (optional)
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRODUCTION_POLICY, motionOrchestrator, rendererCodeHashes } from './orchestrator.mjs';
import { serviceClient } from './render-job.mjs';

// The model call: Anthropic's Messages API with the orchestrator's own key, as ask.js anthropicTransport sends it (betas
// in the anthropic-beta header, the workspace header when set). Spend admission happened in the worker for the whole
// job, and the orchestrator checks each call's worst case against that job's hold before this runs. Kept here rather
// than imported from ask.js, whose import graph is most of the Learn worker.
export const apiCall = (env, body, model) => {
  const { betas = [], ...payload } = body;
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
      ...(betas.length ? { 'anthropic-beta': betas.join(',') } : {}), ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}) },
    body: JSON.stringify({ ...payload, model }),
  });
};

const ROLES = ['MOTION_DIRECTOR_MODEL', 'MOTION_AUTHOR_MODEL', 'MOTION_VISUAL_REVIEW_MODEL', 'MOTION_PEDAGOGICAL_REVIEW_MODEL'];
// -> {config} or {errors}: every missing or invalid setting, by name only.
export function orchestratorConfig(e = process.env) {
  const errors = [];
  const int = (name, fallback, min, max) => { const v = e[name] == null || e[name] === '' ? fallback : Number(e[name]); if (!Number.isInteger(v) || v < min || v > max) errors.push(`${name}: an integer from ${min} to ${max}`); return v; };
  if (!e.MOTION_ORCHESTRATOR_TOKEN || e.MOTION_ORCHESTRATOR_TOKEN.length < 32) errors.push('MOTION_ORCHESTRATOR_TOKEN: at least 32 characters');
  if (!e.ANTHROPIC_API_KEY) errors.push('ANTHROPIC_API_KEY: required');
  let renderer = null;
  try { renderer = new URL(e.MOTION_RENDERER_URL); } catch { errors.push('MOTION_RENDERER_URL: the sandboxed render service URL'); }
  if (!e.MOTION_RENDERER_TOKEN) errors.push('MOTION_RENDERER_TOKEN: required');
  const config = {
    host: e.HOST || '0.0.0.0', port: int('PORT', 8080, 1, 65535), workDir: e.MOTION_WORK_DIR || '/tmp/motion-jobs',
    maxCalls: int('MOTION_MAX_CALLS', 9, 1, 32), jobTimeoutMs: int('MOTION_JOB_TIMEOUT_S', 3300, 60, 3500) * 1000,
    renderer: renderer && { url: renderer.href.replace(/\/$/, ''), token: e.MOTION_RENDERER_TOKEN }, token: e.MOTION_ORCHESTRATOR_TOKEN,
    env: Object.fromEntries(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID', ...ROLES].filter(k => e[k]).map(k => [k, e[k]])),
  };
  return errors.length ? { errors } : { config };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { config, errors } = orchestratorConfig();
  if (errors) { for (const line of errors) console.error(`✗ ${line}`); process.exit(2); }
  const orchestrator = motionOrchestrator({
    token: config.token, service: serviceClient(config.renderer), call: apiCall, env: config.env, outDir: config.workDir,
    maxCalls: config.maxCalls, policy: PRODUCTION_POLICY, rendererHashes: rendererCodeHashes(), jobTimeoutMs: config.jobTimeoutMs, log: line => console.log(`${new Date().toISOString()} ${line}`),
  });
  const server = createServer(orchestrator.handle).listen(config.port, config.host, () => console.log(`✓ Motion orchestrator on http://${config.host}:${config.port} (renderer ${new URL(config.renderer.url).host}, sandbox required: linux; ${config.maxCalls} calls and ${config.jobTimeoutMs / 1000} s per job, the production policy; hold per job from the worker's grant)`));
  // A stop (deploy, scale) ends running jobs; the worker keeps their holds as unknown cost and refuses their grants here.
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { orchestrator.close(); server.close(); process.exit(0); });
}
