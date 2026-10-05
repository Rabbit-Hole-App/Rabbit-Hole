// M7A: one raw /motion request through every stage, development only (spec §4.8). The harness
// decides each transition; no model controls the loop.
//
//   raw request -> Learner Intent Resolver (control-plane learner-intent.js) -> source grounding
//   (source-grounding.js) -> Motion Director: MotionBrief -> storyboard -> Author -> review job
//   (review-job.mjs: preview, harness checks, fresh reviewers, the ONE repair round, final render)
//   -> the existing type "video" block (video-block.js), ready for LearnVideos to fetch.
//
// The one repair round is shared by the whole job. A storyboard that fails its checks spends it on
// one Director revision; the Author's output then gets no repair. An unresolved target stops
// before any paid call with one clarification. Stop (signal) takes effect at the next stage
// boundary: a model call or render already in flight completes and is discarded.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { runAuthor } from './author.js';
import { runDirector } from './director.js';
import { fixtureSource } from './fixture-source.js';
import { MotionCancelled, checkpoint, runMotionJob } from './review-job.mjs';
import { runStoryboard } from './storyboard.js';
import { motionVideoBlock } from './video-block.js';

const secs = ms => +(ms / 1000).toFixed(1);

export async function runMotionRequest({
  message, location = {}, selection = null, repository_context = null, source = fixtureSource(),
  call, env = {}, service, dir, effort = 'high', signal = null, onStage = () => {},
  stages = {}, now = () => Date.now(),
}) {
  const { director = runDirector, storyboarder = runStoryboard, author = runAuthor, job: reviewJob = runMotionJob } = stages;
  const t0 = now();
  const out = { status: 'running', stage: 'resolving', calls: [], format_retries: [], timings: {}, repair: null };
  const record = r => { out.calls.push(...(r.calls || [])); out.format_retries.push(...(r.format_retries || [])); };
  const enter = async (stage, fn) => {
    checkpoint(signal);
    out.stage = stage;
    onStage(stage, out);
    const t = now();
    try { return await fn(); } finally { out.timings[stage] = secs(now() - t); }
  };
  const end = (status, extra = {}) => {
    Object.assign(out, { status, ...extra });
    out.timings.total = secs(now() - t0);
    out.cost_usd = +out.calls.reduce((s, c) => s + (c.cost_usd || 0), 0).toFixed(4);
    out.model_latency_s = secs(out.calls.reduce((s, c) => s + (c.latency_ms || 0), 0));
    if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'pipeline.json'), JSON.stringify(out, null, 2)); }
    onStage(status, out);
    return out;
  };
  const fail = reason => end('failed', { failure_reason: reason });
  // Diagnostics stay with the job: every stage's artifact, whatever happens next.
  const keep = (name, value) => { if (!dir) return; mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };

  try {
    // Free: no model call until the target is grounded.
    const { turn, grounding } = await enter('resolving', () => {
      const turn = resolveLearnerTurn({ message, location, selection, repository_context });
      return { turn, grounding: groundTarget(turn, source) };
    });
    out.request = turn.raw_user_message;
    out.target = grounding.status === 'grounded' ? { label: grounding.resolved_target.label, resolution: grounding.resolution, source_refs: grounding.source_refs.map(r => `${r.path}:${r.start_line}-${r.end_line}`) } : null;
    if (grounding.status !== 'grounded') return end('needs_clarification', { clarification: grounding.clarification });

    const d = await enter('directing', () => director({ turn, grounding, call, env, effort }));
    record(d);
    out.decision_line = d.decision_line ?? null;
    if (d.status === 'needs_clarification') return end('needs_clarification', { clarification: d.clarification });
    if (d.status !== 'brief') return fail(`brief: ${d.error}: ${d.detail}${d.errors?.length ? `: ${d.errors.slice(0, 3).join('; ')}` : ''}`);
    const brief = out.brief = d.brief;
    keep('brief.json', brief);

    let repairCount = 0;
    let s = await enter('storyboarding', () => storyboarder({ brief, call, env, effort }));
    record(s);
    if (s.storyboard) keep('storyboard.round-0.json', { status: s.status, errors: s.check?.errors ?? [], storyboard: s.storyboard });
    if (s.status === 'storyboard_invalid') {
      // The job's one repair round: one Director revision against the failed checks.
      repairCount = 1;
      const findings = s.check.errors.map(e => ({ reviewer: 'harness', category: 'storyboard_check', description: e }));
      out.repair = { stage: 'storyboard', findings: findings.length, errors: s.check.errors };
      s = await enter('storyboard_revision', () => storyboarder({ brief, call, env, effort, round: 1, revision: { storyboard: s.storyboard, findings } }));
      record(s);
      out.repair.status = s.status;
      if (s.storyboard) keep('storyboard.round-1.json', { status: s.status, errors: s.check?.errors ?? [], storyboard: s.storyboard });
    }
    if (s.status !== 'storyboard') return fail(`storyboard${repairCount ? ' (repair round)' : ''}: ${s.status}${s.error ? `: ${s.error}: ${s.detail}` : `: ${s.check.errors.slice(0, 3).join('; ')}`}`);
    const storyboard = out.storyboard = s.storyboard;

    const a = await enter('authoring', () => author({ brief, storyboard, call, env, effort, round: repairCount }));
    record(a);
    if (a.output?.source) keep('composition.jsx', a.output.source);
    if (a.output?.status === 'needs_revision') keep('author.needs_revision.json', a.output);
    if (a.status === 'failed') return fail(`author: ${a.error}: ${a.detail}`);

    const job = await enter('review_and_render', () => reviewJob({
      brief, storyboard, author: a, origin: { storyboard: 'model_generated', composition: 'model_generated' },
      service, call, env, dir, effort, signal, prior: { repair_count: repairCount, format_retries: out.format_retries },
      log: line => onStage(line.replace(/^job: /, 'job:'), out),
    }));
    out.calls.push(...job.calls);
    Object.assign(out, { job: job.job, passes: job.passes, render: job.render, job_errors: job.job_errors, storyboard_revised: job.storyboard_revised });
    if (job.repair) out.repair = job.repair;
    if (job.job.status !== 'ready') return fail(job.job.failure_reason);
    out.block = motionVideoBlock({ brief, renderId: job.render.render_id, jobId: job.job.id });
    return end('ready');
  } catch (error) {
    if (error instanceof MotionCancelled) return end('cancelled', { failure_reason: `stopped during ${out.stage}` });
    // Anything else fails the request with the calls made so far (a call in flight is not recorded).
    return fail(`${out.stage}: ${String(error?.message || error).split('\n')[0]}`);
  }
}
