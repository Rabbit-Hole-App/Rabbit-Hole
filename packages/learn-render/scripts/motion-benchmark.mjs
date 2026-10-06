// M8: Remotion vs HyperFrames, paired on frozen plans (motion/benchmark.mjs; cases in motion/fixtures/m8/cases.json).
//   node scripts/motion-benchmark.mjs plan        [--case C,D]  freeze a brief + storyboard for each case without a plan (paid)
//   node scripts/motion-benchmark.mjs pairs       [--case A]    one attempt per renderer per frozen case (paid)
//   node scripts/motion-benchmark.mjs pairs --dry-run           only the grounding and budget checks: records why a pair would not start (free)
//   node scripts/motion-benchmark.mjs determinism [--case A]    render each ready final again and compare frames (free)
//   node scripts/motion-benchmark.mjs report                    metrics.json and the comparison table (free)
// Every paid call goes through one ledger (out/motion/m8/ledger.json) with a hard ceiling (--budget-usd, default 6.00).
// A case/renderer that already has a job record is never run again. The API key comes from the environment or
// MOTION_ENV_FILE (default <repo>/.env), read the same way as the orchestrator; models resolve from model-config.js.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropic } from '../../control-plane/src/ask.js';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { authorRequest } from '../motion/author.js';
import { budgetLedger, freezeAtAuthor, frozenPlan, frozenStoryboardJob, runMetrics, worstCase } from '../motion/benchmark.mjs';
import { RENDERERS, STAGE } from '../motion/contracts.js';
import { fixtureSource } from '../motion/fixture-source.js';
import { resolveRole } from '../motion/model-config.js';
import { runMotionRequest } from '../motion/pipeline.mjs';
import { localService, renderComposition } from '../motion/render-job.mjs';
import { decodeFrames } from '../motion/renderer-common.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const FIX = join(PKG, 'motion', 'fixtures');
const OUT = join(PKG, 'out', 'motion', 'm8');
const argv = process.argv.slice(2);
const phase = argv[0];
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const json = f => JSON.parse(readFileSync(f, 'utf8'));
const write = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };
if (!['plan', 'pairs', 'determinism', 'report'].includes(phase)) { console.error('usage: motion-benchmark.mjs plan|pairs|determinism|report [--case A,B] [--budget-usd 6]'); process.exit(2); }

const spec = json(join(FIX, 'm8', 'cases.json'));
if (spec.renderers.some(r => !RENDERERS.includes(r))) { console.error(`✗ cases.json renderers: ${spec.renderers} (known: ${RENDERERS})`); process.exit(2); }
const only = opt('--case')?.split(',');
const cases = spec.cases.filter(c => !only || only.includes(c.id));
const source = fixtureSource();
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
const planFile = c => (c.plan ? join(FIX, c.plan) : join(FIX, 'm8', `plan-${c.id}.json`));
const planOf = c => (existsSync(planFile(c)) ? json(planFile(c)) : null);
const runDir = (c, renderer) => join(OUT, `${c.id}-${renderer}`);
const ext = renderer => (renderer === 'hyperframes' ? 'html' : 'jsx');

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
const dry = argv.includes('--dry-run');
const paid = (phase === 'plan' || phase === 'pairs') && !dry;
const env = paid ? credentials() : {};
if (paid && !env.ANTHROPIC_API_KEY) { console.error(`✗ no ANTHROPIC_API_KEY in the environment or ${process.env.MOTION_ENV_FILE || join(ROOT, '.env')}`); process.exit(2); }
const ledger = budgetLedger(join(OUT, 'ledger.json'), Number(opt('--budget-usd') || 6));
const money = n => `$${n.toFixed(4)}`;
const refusedBudget = out => (out.failure_reason || '').includes('refused locally');

if (phase === 'plan') {
  for (const c of cases) {
    if (planOf(c)) { console.log(`✓ plan ${c.id}: frozen (${c.plan || `m8/plan-${c.id}.json`})`); continue; }
    const repository_context = c.repository_context ? { ...c.repository_context, commit: source.commit } : null;
    const dir = join(OUT, `plan-${c.id}`);
    if (existsSync(join(dir, 'pipeline.json'))) { console.log(`✗ plan ${c.id}: already attempted (${dir}); not run again`); continue; }
    const out = await runMotionRequest({ message: c.request, location: c.location ?? {}, repository_context, source, call: ledger.guard(anthropic, { case: c.id, phase: 'plan' }), env, dir, stages: { author: freezeAtAuthor } });
    await ledger.idle();
    const f = frozenPlan(out);
    if (f.errors.length) { console.log(`✗ plan ${c.id}: ${f.errors.slice(0, 3).join('; ')} (${money(out.cost_usd || 0)})`); if (refusedBudget(out)) break; continue; }
    write(planFile(c), { request: c.request, repository_context, from: `M8 plan stage, code ${commit}: model-generated brief and storyboard, frozen before either renderer`, brief: f.brief, storyboard: f.storyboard, plan: { storyboard_repair: out.repairs.storyboard, cost_usd: out.cost_usd, calls: out.calls.map(x => ({ stage: x.stage ?? 'brief', round: x.round ?? 0, model: x.served_model, cost_usd: x.cost_usd, latency_s: +((x.latency_ms || 0) / 1000).toFixed(1) })) } });
    console.log(`✓ plan ${c.id}: "${f.brief.title}", ${f.storyboard.beats.length} beats, storyboard repair ${out.repairs.storyboard}, ${money(out.cost_usd)} (ledger ${money(ledger.spent)})`);
  }
}

if (phase === 'pairs') {
  const svc = dry ? { close() {} } : await localService();
  try {
    for (const c of cases) {
      const plan = planOf(c);
      if (!plan) { console.log(`✗ pair ${c.id}: no frozen plan; run the plan phase first`); continue; }
      const todo = spec.renderers.filter(r => !existsSync(join(runDir(c, r), 'pipeline.json')));
      if (!todo.length) { console.log(`✓ pair ${c.id}: already run`); continue; }
      // Same source grounding: the request, its location and selection must ground to the plan's own target
      // before anything is spent (a canvas concept or a selection is part of the request, as in the product).
      const location = c.location ?? {};
      const g = groundTarget(resolveLearnerTurn({ message: plan.request, location, repository_context: plan.repository_context ?? null }), source);
      const want = plan.brief.resolved_target?.label;
      if (g.status !== 'grounded' || g.resolved_target.label !== want) { console.log(`✗ pair ${c.id}: grounds to ${g.status === 'grounded' ? `"${g.resolved_target.label}"` : g.status}, not the plan's "${want}"; nothing spent`); continue; }
      // A pair starts only when its last Author call will still pass the hard guard: the runs before it at the
      // cost of a ready run so far (at least $0.85), then that Author's worst case. The budget then never ends
      // between a pair's two halves; each call is still guarded by its own worst case.
      const ready = spec.cases.flatMap(x => spec.renderers.map(r => join(runDir(x, r), 'pipeline.json'))).filter(existsSync).map(json).filter(p => p.status === 'ready');
      const perRun = Math.max(0.85, ready.length ? ready.reduce((s, p) => s + p.cost_usd, 0) / ready.length : 0);
      const lastAuthor = worstCase(authorRequest(plan.brief, plan.storyboard, { renderer: todo.at(-1) }), resolveRole('MOTION_AUTHOR_MODEL', env));
      const need = perRun * (todo.length - 1) + lastAuthor;
      if (ledger.remaining() < need) {
        // Recorded, never silent: the pair stays in the design with what it would have needed.
        write(join(OUT, `${c.id}.not-run.json`), { case: c.id, not_run_reason: 'budget_ceiling', remaining_usd: ledger.remaining(), estimated_additional_usd: +need.toFixed(2), estimate: `${todo.length - 1} run(s) at ${money(perRun)} (the mean ready run), then the last Author's ${money(lastAuthor)} worst case`, at: new Date().toISOString() });
        console.log(`✗ pair ${c.id} not started: ${money(ledger.remaining())} left; its last Author call needs ${money(need)} (${todo.length - 1} run(s) at ${money(perRun)}, then a ${money(lastAuthor)} worst case)`);
        if (dry) continue;
        break;
      }
      if (dry) { console.log(`✓ pair ${c.id} would start: ${money(ledger.remaining())} left, needs ${money(need)}`); continue; }
      for (const renderer of todo) {
        const out = await runMotionRequest({
          message: plan.request, location, repository_context: plan.repository_context ?? null, source, plan: { brief: plan.brief, storyboard: plan.storyboard, from: plan.from },
          renderer, call: ledger.guard(anthropic, { case: c.id, renderer }), env, service: svc.client, dir: runDir(c, renderer), stages: { job: frozenStoryboardJob() },
        });
        await ledger.idle();
        console.log(`${out.status === 'ready' ? '✓' : '✗'} ${c.id} ${renderer}: ${out.status}${out.failure_reason ? ` (${out.failure_reason})` : ''}; first pass ${out.passes?.[0]?.author ?? '-'}, Author repair ${out.repairs?.author ?? 0}, ${money(out.cost_usd || 0)}, ${out.timings?.total ?? '-'} s (ledger ${money(ledger.spent)})`);
        if (refusedBudget(out)) { console.log('✗ the budget refused a call: stopping'); process.exitCode = 3; break; }
      }
      if (process.exitCode) break;
    }
  } finally { svc.close(); }
}

// The final source the job rendered: the repaired composition when the Author repair ran.
const finalSource = (dir, renderer, p) => {
  const repaired = join(dir, `composition.repaired.${ext(renderer)}`);
  return readFileSync(p.job?.repairs?.author && existsSync(repaired) ? repaired : join(dir, `composition.${ext(renderer)}`), 'utf8');
};

if (phase === 'determinism') {
  const svc = await localService();
  try {
    for (const c of cases) for (const renderer of spec.renderers) {
      const dir = runDir(c, renderer), file = join(dir, 'determinism.json');
      if (!existsSync(join(dir, 'pipeline.json')) || existsSync(file)) continue;
      const p = json(join(dir, 'pipeline.json'));
      if (p.status !== 'ready') continue;
      const src = finalSource(dir, renderer, p);
      const again = await renderComposition({ brief: p.brief, storyboard: p.storyboard, author: { status: 'composition', output: { composition_id: p.render.composition_id, source: src } }, service: svc.client, dir: join(dir, 'rerender'), origin: { storyboard: 'model_generated', composition: 'model_generated' }, renderer });
      if (!again.submitted || again.result.status !== 'ready') { write(file, { identical: false, error: again.reason || again.result?.failure }); console.log(`✗ ${c.id} ${renderer}: the second final did not render`); continue; }
      const frames = [...new Set([...Array.from({ length: Math.ceil(p.brief.duration.seconds * STAGE.fps / 15) }, (_, i) => i * 15), p.brief.duration.seconds * STAGE.fps - 1])];
      const a = await decodeFrames(join(dir, 'final', 'final.mp4'), frames, join(dir, 'determinism', 'a'));
      const b = await decodeFrames(join(dir, 'rerender', 'final.mp4'), frames, join(dir, 'determinism', 'b'));
      const differing = a.filter((x, i) => x.pixels_sha256 !== b[i].pixels_sha256).map(x => x.frame);
      write(file, { identical: !differing.length, frames: frames.length, differing, method: 'a second full final render of the same source; decoded frames every 0.5 s and the last, sha256 of RGBA' });
      console.log(`${differing.length ? '✗' : '✓'} ${c.id} ${renderer}: final re-render ${differing.length ? `differs at ${differing.join(', ')}` : `identical at ${frames.length} frames`}`);
    }
  } finally { svc.close(); }
}

if (phase === 'report') {
  const rows = [];
  for (const c of spec.cases) {
    const plan = planOf(c);
    const row = { id: c.id, shape: c.shape, title: plan?.brief?.title ?? null, request: plan?.request ?? c.request ?? null, plan_from: plan?.from ?? null };
    for (const renderer of spec.renderers) {
      const dir = runDir(c, renderer);
      if (!existsSync(join(dir, 'pipeline.json'))) { row[renderer] = null; continue; }
      const p = json(join(dir, 'pipeline.json'));
      const det = existsSync(join(dir, 'determinism.json')) ? json(join(dir, 'determinism.json')) : null;
      const src = p.status === 'ready' ? finalSource(dir, renderer, p) : (existsSync(join(dir, `composition.${ext(renderer)}`)) ? readFileSync(join(dir, `composition.${ext(renderer)}`), 'utf8') : '');
      row[renderer] = runMetrics(p, { source: src, determinism: det });
    }
    const notRun = join(OUT, `${c.id}.not-run.json`);
    if (spec.renderers.every(x => !row[x]) && existsSync(notRun)) row.not_run = json(notRun);
    rows.push(row);
  }
  // Attempts set aside (no model output reached a render: a missing canvas location, a machine standby),
  // with what the ledger charged for them; they are never scored.
  const voidDir = join(OUT, 'void');
  const voided = existsSync(voidDir) ? readdirSync(voidDir).map(d => { const p = json(join(voidDir, d, 'pipeline.json')); return { attempt: d, status: p.status, failure_reason: p.failure_reason ?? p.clarification?.question ?? null, recorded_cost_usd: p.cost_usd ?? 0 }; }) : [];
  const charged = ledger.state.calls.filter(x => !x.refused);
  const spend = {
    plans_usd: +charged.filter(x => x.phase === 'plan').reduce((t, x) => t + x.cost_usd, 0).toFixed(4),
    completed_pairs_usd: +charged.filter(x => x.renderer && existsSync(join(runDir({ id: x.case }, x.renderer), 'pipeline.json'))).reduce((t, x) => t + x.cost_usd, 0).toFixed(4),
    voided_attempts_usd: +charged.filter(x => x.renderer && !existsSync(join(runDir({ id: x.case }, x.renderer), 'pipeline.json'))).reduce((t, x) => t + x.cost_usd, 0).toFixed(4),
  };
  const paired = rows.filter(r => spec.renderers.every(x => r[x]));
  const agg = Object.fromEntries(spec.renderers.map(renderer => {
    const m = paired.map(r => r[renderer]), ready = m.filter(x => x.generation.ready), avg = (xs, f) => (xs.length ? +(xs.reduce((s, x) => s + (f(x) || 0), 0) / xs.length).toFixed(1) : null);
    const cost = m.reduce((s, x) => s + x.cost.api_usd, 0);
    return [renderer, {
      pairs: m.length, ready: ready.length, ready_rate: m.length ? +(ready.length / m.length).toFixed(2) : null,
      first_pass_ready: m.filter(x => x.generation.ready && !x.generation.author_repair).length,
      author_first_pass_contract: m.filter(x => x.generation.author_first_pass_contract).length,
      repairs: m.filter(x => x.generation.author_repair).length, transport_retries: m.reduce((s, x) => s + x.generation.transport_retries, 0), schema_reasks: m.reduce((s, x) => s + x.generation.schema_reasks, 0),
      blocking_findings: m.reduce((s, x) => s + [...x.pedagogy.teaching_blocking, ...x.visual.visual_blocking, ...x.visual.harness_blocking].reduce((a, b) => a + b, 0), 0),
      cosmetic_findings: m.reduce((s, x) => s + x.visual.cosmetic, 0),
      final_pedagogical_pass: m.filter(x => x.pedagogy.final_pedagogical_pass).length,
      avg_author_s: avg(m, x => x.latency.author_s), avg_final_render_s: avg(ready, x => x.latency.final_render_s), avg_preview_render_s: avg(m, x => x.latency.preview_render_s[0]),
      avg_author_to_ready_s: avg(ready, x => x.latency.author_to_ready_s),
      api_usd: +cost.toFixed(4), api_usd_per_ready: ready.length ? +(cost / ready.length).toFixed(4) : null,
      ready_per_dollar: cost ? +(ready.length / cost).toFixed(2) : null, ready_per_hour: m.length ? +(ready.length / (m.reduce((s, x) => s + (x.latency.total_s || 0), 0) / 3600)).toFixed(2) : null,
      determinism_stills: ready.filter(x => x.determinism.stills_two_contexts).length, determinism_final_rerender: ready.filter(x => x.determinism.final_rerender?.identical).length, determinism_final_rerender_measured: ready.filter(x => x.determinism.final_rerender).length,
      avg_source_bytes: avg(m, x => x.engineering.source_bytes), avg_elements: avg(m, x => x.engineering.elements),
    }];
  }));
  write(join(OUT, 'metrics.json'), { at: new Date().toISOString(), code: commit, ledger: { limit_usd: ledger.state.limit_usd, spent_usd: ledger.state.spent_usd, calls: ledger.state.calls.length, refused: ledger.state.calls.filter(x => x.refused).length, ...spend }, cases: rows, aggregate: agg, voided });
  const cell = (m, r) => (!m ? (r.not_run ? `not run: ${r.not_run.not_run_reason} (estimated additional $${r.not_run.estimated_additional_usd})` : 'not run') : `${m.status}${m.generation.author_repair ? ' after Author repair' : m.status === 'ready' ? ' first pass' : ''}; $${m.cost.api_usd}; Author ${m.latency.author_s} s; ready ${m.latency.author_to_ready_s ?? '-'} s`);
  console.log(`Case | ${spec.renderers.join(' | ')}`);
  for (const r of rows) console.log(`${r.id} ${r.title ?? ''} | ${spec.renderers.map(x => cell(r[x], r)).join(' | ')}`);
  console.log(JSON.stringify(agg, null, 2));
  for (const v of voided) console.log(`void ${v.attempt}: ${v.status} (${v.failure_reason})`);
  console.log(`ledger: $${ledger.state.spent_usd.toFixed(4)} of $${ledger.state.limit_usd} (plans $${spend.plans_usd}, completed pairs $${spend.completed_pairs_usd}, voided attempts $${spend.voided_attempts_usd})`);
}
