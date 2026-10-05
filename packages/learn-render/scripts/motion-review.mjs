// Motion M6 review harness: one saved Author result (motion/fixtures/m5/inputs.json) through the
// whole review loop: preview on the render service -> the harness's blank-frame check + fresh
// visual and pedagogical reviewers -> at most ONE repair round -> preview + fresh reviews again ->
// the final render and its validation (motion/review-job.mjs).
//   node scripts/motion-review.mjs softmax|generate|reference [--service <url>] [--out <dir>] [--call --max-calls N]
// Without --call it renders the first preview, prints the harness findings and the reviewer request
// sizes, and stops before any model call. With --call the reviewers, the repair round and the final
// render run; every model call (stage, round, tokens, latency, cost; never the prompt) is printed
// and appended to out/motion/review-telemetry.jsonl. --max-calls is a hard cap on paid calls,
// schema-only re-asks included. ANTHROPIC_API_KEY comes from the environment, else from
// MOTION_ENV_FILE or <repo>/.env; MOTION_RENDERER_TOKEN (with --service) from the environment.
// Values are never printed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropic } from '../../control-plane/src/ask.js';
import { classifyFindings } from '../motion/contracts.js';
import { resolveRole } from '../motion/model-config.js';
import { localService, renderPreview, serviceClient } from '../motion/render-job.mjs';
import { harnessFindings, runMotionJob } from '../motion/review-job.mjs';
import { reviewRequest } from '../motion/review.js';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const FIX = join(PKG, 'motion', 'fixtures');
const INPUTS = JSON.parse(readFileSync(join(FIX, 'm5', 'inputs.json'), 'utf8'));
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const name = argv[0];
if (!INPUTS[name]) { console.error(`usage: node scripts/motion-review.mjs ${Object.keys(INPUTS).join('|')} [--service <url>] [--out <dir>] [--call --max-calls N]`); process.exit(2); }
const input = INPUTS[name];
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const brief = json(input.brief), storyboard = json(input.storyboard), source = readFileSync(join(FIX, input.composition), 'utf8');
const author = { status: 'composition', output: { status: 'composition', composition_id: input.composition_id, source } };
const origin = { storyboard: input.storyboard_origin, composition: input.composition_origin };
const url = opt('--service');
const out = resolve(opt('--out') || join(PKG, 'out', 'motion', `m6-${name}${url ? '-remote' : ''}`));
const live = argv.includes('--call');
const maxCalls = Number(opt('--max-calls')) || Infinity;
const section = (n, title, body) => console.log(`\n${n}. ${title}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);
const secs = ms => +(ms / 1000).toFixed(1);

// Only the two Anthropic names and the Motion role names are read; values are never printed.
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

console.log(`✓ input: ${name} (${brief.id}, ${storyboard.id}, ${input.composition})`);
console.log(`✓ origins: storyboard ${origin.storyboard}, composition ${origin.composition}`);
if (url && !process.env.MOTION_RENDERER_TOKEN) { console.error('✗ --service needs MOTION_RENDERER_TOKEN in the environment'); process.exit(2); }
const env = credentials();
if (live && !env.ANTHROPIC_API_KEY) { console.error(`✗ --call needs ANTHROPIC_API_KEY in the environment or ${process.env.MOTION_ENV_FILE || join(ROOT, '.env')}`); process.exit(2); }
const svc = url ? { client: serviceClient({ url: url.replace(/\/$/, ''), token: process.env.MOTION_RENDERER_TOKEN }), close: () => {} } : await localService();
console.log(`✓ renderer: ${url ? `${url} (sandbox: the deployment's)` : 'local service, sandbox none (authoring host; acceptance renders run in the Linux sandbox)'}`);
console.log(`✓ models: visual review -> ${resolveRole('MOTION_VISUAL_REVIEW_MODEL', env)}, pedagogical review -> ${resolveRole('MOTION_PEDAGOGICAL_REVIEW_MODEL', env)}, repair Author -> ${resolveRole('MOTION_AUTHOR_MODEL', env)}${live ? `, at most ${maxCalls} paid calls` : ' (dry run: no model call)'}`);

const findingLine = f => `  ${classifyFindings([f]).blocking.length ? 'BLOCKING' : 'advisory'} ${f.reviewer}/${f.category}${f.beat_id ? ` ${f.beat_id}` : ''}${f.timestamp !== undefined ? ` @${f.timestamp}s` : ''}${f.claim_id ? ` ${f.claim_id}` : ''}: ${f.description}`;
const previewLines = p => !p ? '  (no preview)' : p.submitted === false ? `  ✗ not submitted: ${p.reason}` : [
  `  ${p.status}${p.failure ? ` (${p.failure.category}: ${p.failure.detail})` : ''}  render ${p.render_id}  ${p.composition_id}`,
  ...(p.checks?.rows || []).map(c => `  ${c.ok ? '✓' : '✗'} ${c.artifact} ${c.name}: ${c.detail}`),
  ...(p.nonblank ? [`  ${p.nonblank.ok ? '✓' : '✗'} nonblank (luma stddev > ${p.nonblank.threshold}): ${p.nonblank.detail}`] : []),
  `  timings: ${JSON.stringify(p.timings)}`,
].join('\n');

if (!live) {
  try {
    const p = await renderPreview({ brief, storyboard, author, service: svc.client, dir: join(out, 'round-0'), origin });
    section(1, 'Round 0 preview', previewLines(p.submitted ? p.result : p));
    section(2, 'Harness findings', harnessFindings(p, 0).map(findingLine).join('\n') || '  none');
    if (p.submitted && p.result.status === 'ready') {
      const sizes = ['visual', 'pedagogical'].map(r => `${r}: ${JSON.stringify(reviewRequest(r, brief, p.result.frames, join(out, 'round-0'))).length} request bytes, ${p.result.frames.length} frames`);
      section(3, 'Reviewers (dry run)', `  ${sizes.join('\n  ')}\n  Add --call --max-calls N to run the reviewers, the repair round and the final render.`);
    }
  } finally { svc.close(); }
  process.exit(0);
}

let spent = 0;
const capped = (...args) => (++spent > maxCalls ? Promise.resolve(new Response(`refused locally: the --max-calls ${maxCalls} budget is spent`, { status: 429 })) : anthropic(...args));
const t0 = Date.now();
let r;
try {
  r = await runMotionJob({ brief, storyboard, author, origin, service: svc.client, call: capped, env, dir: out, log: l => console.log(`  … ${l}`) });
} finally { svc.close(); }
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'review-job.json'), JSON.stringify(r, null, 2));
if (r.composition && r.composition.source !== source) writeFileSync(join(out, 'repaired.composition.jsx'), r.composition.source);

r.passes.forEach((p, i) => {
  section(`${i + 1}a`, `Round ${p.round} preview`, p.author === 'needs_revision' ? `  Author needs_revision: ${p.reason}` : previewLines(p.preview));
  section(`${i + 1}b`, `Round ${p.round} findings (${p.blocking ?? 0} blocking, ${p.advisory ?? 0} advisory) -> ${p.decision ?? '-'}`, (p.findings || []).map(findingLine).join('\n') || '  none');
});
if (r.repair) section(3, 'Repair round', r.repair);
if (r.render) {
  const v = r.render.validation;
  section(4, 'Final render', [
    `  ${r.render.status}${r.render.failure ? ` (${r.render.failure.category}: ${r.render.failure.detail})` : ''}  render ${r.render.render_id}`,
    ...Object.entries(r.render.hashes).map(([k, h]) => `  ${k}: ${h}`),
    ...(v ? [
      ...v.final.checks.map(c => `  ${c.ok ? '✓' : '✗'} final.mp4 ${c.name}: ${c.detail.slice(0, 200)}`),
      ...(v.artifacts?.checks || []).map(c => `  ${c.ok ? '✓' : '✗'} ${c.artifact} ${c.name}: ${c.detail}`),
      `  ${v.coverage.ok ? '✓' : '✗'} coverage ${v.coverage.observed}/${v.coverage.frames}${v.coverage.errors.length ? `: ${v.coverage.errors.join('; ')}` : ''}`,
      `  ${v.determinism.ok ? '✓' : '✗'} determinism: ${v.determinism.frames.map(f => `#${f.frame} ${f.hashes[0].slice(0, 10)}${f.hashes[0] === f.hashes[1] ? '' : ' DIFFERS'}`).join(', ')}`,
      `  ${v.preview_final.ok ? '✓' : '✗'} preview vs final: ${v.preview_final.max} (threshold ${v.preview_final.threshold})`,
    ] : []),
    `  provenance: ${JSON.stringify(r.render.provenance)}`,
    `  timings: ${JSON.stringify(r.render.timings)}`,
  ].join('\n'));
}
const j = r.job;
section(5, 'Job', `  ${j.id} ${j.status}  repair_count ${j.repair_count}  format_retries ${JSON.stringify(j.format_retries)}  storyboard_revised ${r.storyboard_revised}${j.failure_reason ? `\n  failure: ${j.failure_reason}` : ''}\n  ${r.job_errors.length ? `✗ job contract: ${r.job_errors.join('; ')}` : '✓ job contract (validateJob)'}`);
section(6, 'Model calls', r.calls.map(c => `  ${c.stage} round ${c.round}: ${c.resolved_model}${c.fell_back ? ' (fell back)' : ''}, ${secs(c.latency_ms)} s, in ${c.usage.input_tokens} / out ${c.usage.output_tokens} tokens, $${c.cost_usd}, stop ${c.stop_reason}`).join('\n') || '  none');
const sum = (rows, f) => +rows.reduce((s, c) => s + (f(c) || 0), 0).toFixed(4);
const telemetry = {
  at: new Date().toISOString(), input: name, status: j.status, repair_count: j.repair_count, renderer: url ? 'remote' : 'local',
  calls: Object.fromEntries(['visual_review', 'pedagogical_review', 'storyboard', 'author'].map(s => [s, (rows => ({ calls: rows.length, latency_s: secs(sum(rows, c => c.latency_ms)), output_tokens: sum(rows, c => c.usage.output_tokens), cost_usd: sum(rows, c => c.cost_usd) }))(r.calls.filter(c => c.stage === s))])),
  cost_usd: sum(r.calls, c => c.cost_usd),
  previews: r.passes.map(p => ({ round: p.round, service_total_s: p.preview?.timings?.service?.total ?? null, nonblank: p.preview?.nonblank?.ok ?? null, blocking: p.blocking ?? null })),
  final: r.render ? { status: r.render.status, service_total_s: r.render.timings.service?.total ?? null, source_bytes: r.render.provenance.source_bytes } : null,
  end_to_end_s: secs(Date.now() - t0),
};
section(7, 'Telemetry', telemetry);
appendFileSync(join(PKG, 'out', 'motion', 'review-telemetry.jsonl'), `${JSON.stringify(telemetry)}\n`);
console.log(`\n✓ ${join(out, 'review-job.json')}`);
process.exitCode = j.status === 'ready' ? 0 : 1;
