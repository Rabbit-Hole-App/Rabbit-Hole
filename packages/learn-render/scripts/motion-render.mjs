// Motion M5 render harness: one saved, validated Author composition through the Motion render
// service and its sandbox, artifact validation on this side, one RenderResult. No model calls:
// the inputs are the real M4 Author outputs (motion/fixtures/m5/inputs.json).
//   node scripts/motion-render.mjs softmax|generate|reference [--service <url>] [--out <dir>]
// Without --service it starts the same service in this process with the unsandboxed child (the
// authoring host). With --service it uses that deployment; the bearer token comes from
// MOTION_RENDERER_TOKEN and is never printed.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localService, renderComposition, serviceClient } from '../motion/render-job.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const FIX = join(PKG, 'motion', 'fixtures');
const INPUTS = JSON.parse(readFileSync(join(FIX, 'm5', 'inputs.json'), 'utf8'));
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const name = argv[0];
if (!INPUTS[name]) { console.error(`usage: node scripts/motion-render.mjs ${Object.keys(INPUTS).join('|')} [--service <url>] [--out <dir>]`); process.exit(2); }
const input = INPUTS[name];
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const brief = json(input.brief), storyboard = json(input.storyboard), source = readFileSync(join(FIX, input.composition), 'utf8');
const url = opt('--service');
const out = opt('--out') || join(PKG, 'out', 'motion', `m5-${name}${url ? '-remote' : ''}`);
const section = (n, title, body) => console.log(`\n${n}. ${title}\n${body}`);

console.log(`✓ input: ${name} (${brief.id}, ${storyboard.id}, ${input.composition})`);
console.log(`✓ origins: storyboard ${input.storyboard_origin}, composition ${input.composition_origin}`);
if (url && !process.env.MOTION_RENDERER_TOKEN) { console.error('✗ --service needs MOTION_RENDERER_TOKEN in the environment'); process.exit(2); }
const svc = url ? { client: serviceClient({ url: url.replace(/\/$/, ''), token: process.env.MOTION_RENDERER_TOKEN }), sandbox: 'the deployment', close: () => {} } : await localService();
console.log(`✓ renderer: ${url ? `${url} (sandbox: the deployment's)` : 'local service, sandbox none (authoring host; acceptance renders run in the Linux sandbox)'}`);

let r;
try {
  r = await renderComposition({ brief, storyboard, author: { status: 'composition', output: { status: 'composition', composition_id: input.composition_id, source } }, service: svc.client, dir: out, origin: { storyboard: input.storyboard_origin, composition: input.composition_origin } });
} finally { svc.close(); }
if (!r.submitted) { console.log(`✗ not submitted: ${r.reason}\n  ${(r.errors || []).join('\n  ')}`); process.exit(1); }
const res = r.result, v = res.validation;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'render-result.json'), JSON.stringify(res, null, 2));

section(1, 'Status', `${res.status}${res.failure ? ` (${res.failure.category}: ${res.failure.detail})` : ''}  render ${res.render_id}  ${res.composition_id}`);
section(2, 'Renderer', Object.entries(res.renderer).map(([k, x]) => `  ${k}: ${x}`).join('\n'));
if (v) {
  if (res.artifacts.final_mp4) section(3, 'Artifacts', Object.entries(res.artifacts).map(([k, f]) => `  ${k}: ${f}  sha256 ${res.hashes[k]}`).join('\n'));
  section(4, 'final.mp4', `${res.duration_seconds}s ${res.width}x${res.height} @${res.fps}\n${v.final.checks.map(c => `  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail.slice(0, 160)}`).join('\n')}`);
  if (v.artifacts) section(5, 'Other artifacts', v.artifacts.checks.map(c => `  ${c.ok ? '✓' : '✗'} ${c.artifact} ${c.name}: ${c.detail}`).join('\n'));
  section(6, 'Beat and transition coverage', `  ${v.coverage.ok ? '✓' : '✗'} ${v.coverage.observed}/${v.coverage.frames} frames observed${v.coverage.errors.length ? `\n  ${v.coverage.errors.join('\n  ')}` : ''}`);
  section(7, 'Determinism (decoded pixels, two fresh contexts)', `  ${v.determinism.ok ? '✓' : '✗'} ${v.determinism.frames.map(f => `#${f.frame} ${f.hashes[0].slice(0, 12)}${f.hashes[0] === f.hashes[1] ? '' : ` != ${f.hashes[1].slice(0, 12)}`}`).join(', ')}${v.determinism.errors.length ? `\n  ${v.determinism.errors.join('\n  ')}` : ''}`);
  section(8, 'Preview vs final', `  ${v.preview_final.ok ? '✓' : '✗'} max mean difference ${v.preview_final.max} (threshold ${v.preview_final.threshold})`);
}
section(9, 'Provenance', Object.entries(res.provenance).map(([k, x]) => `  ${k}: ${typeof x === 'object' ? Object.entries(x).map(([f, h]) => `${f} ${h.slice(0, 12)}`).join(', ') : x}`).join('\n'));
section(10, 'Timings (s)', JSON.stringify(res.timings, null, 2));
section(11, 'Resources', JSON.stringify(res.resources?.limits ?? { sandbox: res.resources?.sandbox?.mode ?? null }, null, 2));
// For M8: what the Author spent and what rendering cost, per composition.
const svcT = res.timings.service || {};
const telemetry = {
  at: new Date().toISOString(), input: name, status: res.status, renderer: url ? 'remote' : 'local',
  author: { calls: input.author_calls.length, latency_s: secs(input.author_calls.reduce((s, c) => s + c.latency_ms, 0)), output_tokens: input.author_calls.reduce((s, c) => s + c.usage.output_tokens, 0), cost_usd: +input.author_calls.reduce((s, c) => s + c.cost_usd, 0).toFixed(4) },
  source: { bytes: res.provenance.source_bytes, chars: res.provenance.source_chars },
  compile_s: svcT.bundle ?? null, render_s: +['preview', 'final'].reduce((s, k) => s + (svcT[k] || 0), 0).toFixed(2), service_total_s: svcT.total ?? null, end_to_end_s: res.timings.total_s,
};
section(12, 'Telemetry', JSON.stringify(telemetry, null, 2));
appendFileSync(join(PKG, 'out', 'motion', 'render-telemetry.jsonl'), `${JSON.stringify(telemetry)}\n`);
console.log(`\n✓ ${join(out, 'render-result.json')}`);
process.exitCode = res.status === 'ready' ? 0 : 1;
function secs(ms) { return +(ms / 1000).toFixed(1); }
