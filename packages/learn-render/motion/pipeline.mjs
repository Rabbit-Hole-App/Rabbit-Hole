// M7A: one raw /motion request through every stage, development only (spec §4.8). The harness
// decides each transition; no model controls the loop.
//
//   raw request -> Learner Intent Resolver (control-plane learner-intent.js) -> source grounding
//   (source-grounding.js) -> Motion Director: MotionBrief -> storyboard -> Author -> review job
//   (review-job.mjs: preview, harness checks, fresh reviewers, the Author repair, final render)
//   -> the existing type "video" block (video-block.js), ready for LearnVideos to fetch.
//
// Semantic repairs (owner decision 2026-10-05): one per artifact stage, never shared, never looped.
//   storyboard: 1st pass -> (fails its checks) one Director revision -> final storyboard
//   Author:     1st pass -> preview + review -> (blocking) one Author repair -> preview + review -> final
// At most two in a job. Schema-only re-asks and the Author's one transport retry never count.
// An unresolved target stops before any paid call with one clarification. Stop (signal) takes
// effect at the next stage boundary: a model call or render already in flight is discarded.
//
// M7B: renderer picks the Author target and the render backend ("remotion" by default). plan
// ({brief, storyboard, from}) reuses an already-accepted brief and storyboard for the same request,
// so a renderer proof tests the Author and render path, not a new Director run: the request is
// still resolved and grounded, the plan is validated again, and the record says where it came from.
//
// MOT-20: approved ({title, duration_seconds, description}) is the proposal the learner approved in chat. The Director takes it
// as binding input and only adds the internal detail; a brief that does not keep its title and duration fails the job.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { validateMotionContext } from '../../control-plane/src/motion-context.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { runAuthor } from './author.js';
import { runDirector } from './director.js';
import { fixtureSource } from './fixture-source.js';
import { DEFAULT_RENDERER, validateBrief, validateStoryboard } from './contracts.js';
import { renderComposition } from './render-job.mjs';
import { MotionCancelled, abortableSleep, checkpoint, runMotionJob } from './review-job.mjs';
import { runStoryboard } from './storyboard.js';
import { motionVideoBlock } from './video-block.js';

const secs = ms => +(ms / 1000).toFixed(1);
// Why a job ended without a video, so recovery fits it (owner message 38): renderer (a temporary render failure: render the
// saved composition again), content (reviewer or check findings: a targeted repair with them), missing_context (one question
// for the learner), model (a model call failed: continue from the saved work), limit (the job's call or spend bound) and
// stopped. Recovery reuses result.checkpoint: the request, the validated brief and storyboard, the latest valid composition
// with its review state (unreviewed | blocking | accepted), that review's verbatim findings and its preview's keyframes.
export const CAUSES = Object.freeze(['renderer', 'content', 'missing_context', 'model', 'limit', 'stopped']);

// What a brief must keep of the approved proposal (MOT-20): its exact title, its duration and its aspect ratio.
export const approvedErrors = (brief, approved) => (!approved ? [] : [
  ...(brief.title === approved.title ? [] : [`title ${JSON.stringify(brief.title)} is not the approved ${JSON.stringify(approved.title)}`]),
  ...(brief.duration?.seconds === approved.duration_seconds ? [] : [`duration ${brief.duration?.seconds}s is not the approved ${approved.duration_seconds}s`]),
  // An approval without a ratio (made before the setting existed) is the original 16:9.
  ...(brief.aspect_ratio === (approved.aspect_ratio ?? '16:9') ? [] : [`aspect ratio ${brief.aspect_ratio} is not the approved ${approved.aspect_ratio ?? '16:9'}`]),
]);

// context: motion_request.context (control-plane motion-context.js), the learner's selected card.
// source: a pinned repository the canvas really has (the harness), never a default: a request with
// no selection and no source is ungrounded (owner, 2026-10-21). sources: the pinned repositories a
// selected repository card's sourceRefs may be read from, by commit.
export async function runMotionRequest({
  message, location = {}, context = null, repository_context = null, source = null, sources = [fixtureSource()],
  call, env = {}, service, dir, effort = 'high', signal = null, onStage = () => {},
  stages = {}, now = () => Date.now(), renderer = DEFAULT_RENDERER, plan = null, approved = null,
  // recover {mode, checkpoint}: a recovery attempt from a saved checkpoint, no Director call. mode 'render' renders its
  // accepted composition again (no model call); 'fix' continues from it: the repair with its exact findings, the review of
  // an unreviewed composition, or the Author from its storyboard.
  recover = null,
}) {
  const { director = runDirector, storyboarder = runStoryboard, author = runAuthor, job: reviewJob = runMotionJob, final: renderFinal = renderComposition } = stages;
  const t0 = now();
  const out = { status: 'running', stage: 'resolving', renderer, calls: [], format_retries: [], transport_retries: [], timings: {}, repairs: { storyboard: 0, author: 0 }, storyboard_repair: null, repair: null };
  const record = r => { out.calls.push(...(r.calls || [])); out.format_retries.push(...(r.format_retries || [])); out.transport_retries.push(...(r.transport_retries || [])); };
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
  const fail = (reason, cause = 'model') => end('failed', { failure_reason: reason, cause });
  const save = part => { out.checkpoint = { ...out.checkpoint, ...part }; }; // replaced, never mutated: the orchestrator notices it on the next stage or job log line
  // Diagnostics stay with the job: every stage's artifact, whatever happens next.
  const keep = (name, value) => { if (!dir) return; mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };

  try {
    if (recover) return await fromCheckpoint();
    // Free: no model call until the target is grounded.
    const { turn, grounding } = await enter('resolving', () => {
      const card = validateMotionContext(context)?.selection;
      const refs = card?.sourceRefs ?? null;
      const turn = resolveLearnerTurn({
        message, location, repository_context,
        selection: card ? { kind: 'card', id: card.cardId, ...(card.title ? { title: card.title } : {}) } : null,
        ...(card?.text ? { canvas_target: { id: card.cardId, kind: card.kind, ...(card.title ? { title: card.title } : {}), text: card.text } } : {}),
      });
      return { turn, grounding: groundTarget(turn, refs ? sources.find(s => s.commit === refs[0].commit) ?? null : source, { cardRefs: refs }) };
    });
    out.request = turn.raw_user_message;
    out.target = ['grounded', 'ungrounded'].includes(grounding.status) ? { label: grounding.resolved_target.label, resolution: grounding.resolution, source_refs: grounding.source_refs.map(r => (r.path ? `${r.path}:${r.start_line}-${r.end_line}` : `card ${r.card_id}`)), ...(grounding.grounding ? { grounding: grounding.grounding } : {}) } : null;
    if (!out.target) return end('needs_clarification', { clarification: grounding.clarification, cause: 'missing_context' });

    if (plan) return await fromPlan(grounding);
    const d = await enter('directing', () => director({ turn, grounding, call, env, effort, ...(approved ? { approved } : {}) }));
    record(d);
    out.decision_line = d.decision_line ?? null;
    if (d.status === 'needs_clarification') return end('needs_clarification', { clarification: d.clarification, cause: 'missing_context' });
    if (d.status !== 'brief') return fail(`brief: ${d.error}: ${d.detail}${d.errors?.length ? `: ${d.errors.slice(0, 3).join('; ')}` : ''}`);
    const brief = out.brief = d.brief;
    keep('brief.json', brief);
    const unkept = approvedErrors(brief, approved);
    if (unkept.length) return fail(`brief: it does not keep the approved proposal: ${unkept.join('; ')}`);

    let s = await enter('storyboarding', () => storyboarder({ brief, call, env, effort }));
    record(s);
    if (s.storyboard) keep('storyboard.round-0.json', { status: s.status, errors: s.check?.errors ?? [], storyboard: s.storyboard });
    if (s.status === 'storyboard_invalid') {
      // The storyboard's one repair: one Director revision against the failed checks. The
      // Author's repair stays available for its own output.
      out.repairs.storyboard = 1;
      const findings = s.check.errors.map(e => ({ reviewer: 'harness', category: 'storyboard_check', description: e }));
      out.storyboard_repair = { findings: findings.length, errors: s.check.errors };
      s = await enter('storyboard_revision', () => storyboarder({ brief, call, env, effort, round: 1, revision: { storyboard: s.storyboard, findings } }));
      record(s);
      out.storyboard_repair.status = s.status;
      if (s.storyboard) keep('storyboard.round-1.json', { status: s.status, errors: s.check?.errors ?? [], storyboard: s.storyboard });
    }
    if (s.status !== 'storyboard') return fail(`storyboard${out.repairs.storyboard ? ' (after its repair)' : ''}: ${s.status}${s.error ? `: ${s.error}: ${s.detail}` : `: ${s.check.errors.slice(0, 3).join('; ')}`}`, s.status === 'failed' ? 'model' : 'content');
    const storyboard = out.storyboard = s.storyboard;
    save({ request: out.request, renderer, brief, storyboard, composition: null, findings: [], frames: [] });
    return await authorAndRender(brief, storyboard);
  } catch (error) {
    if (error instanceof MotionCancelled) return end('cancelled', { failure_reason: `stopped during ${out.stage}`, cause: 'stopped' });
    // Anything else fails the request with the calls made so far (a call in flight is not recorded).
    return fail(`${out.stage}: ${String(error?.message || error).split('\n')[0]}`);
  }

  // A reused plan: validated again as the contract, never edited; its origin travels with the job.
  async function fromPlan(grounding) {
    const errors = [...validateBrief(plan.brief), ...validateStoryboard(plan.storyboard, plan.brief)];
    if (errors.length) return fail(`plan: ${errors.slice(0, 3).join('; ')}`);
    // A reused brief may cite only what this request's own grounding produced.
    const refKey = refs => JSON.stringify(refs.map(r => `${r.id} ${r.path ?? r.card_id}:${r.start_line}-${r.end_line}`));
    if (refKey(plan.brief.source_refs) !== refKey(grounding.source_refs)) return fail('plan: its brief cites sources this request was not grounded in');
    out.plan = { from: plan.from, storyboard_origin: 'model_generated', reused: true };
    out.brief = plan.brief;
    out.storyboard = plan.storyboard;
    keep('brief.json', plan.brief);
    keep('storyboard.plan.json', { from: plan.from, storyboard: plan.storyboard });
    save({ request: out.request, renderer, brief: plan.brief, storyboard: plan.storyboard, composition: null, findings: [], frames: [] });
    return authorAndRender(plan.brief, plan.storyboard);
  }

  // A recovery attempt: the checkpoint's brief and storyboard are validated again as the contract, never re-planned.
  async function fromCheckpoint() {
    const cp = recover.checkpoint;
    out.request = cp.request;
    out.recovered = { mode: recover.mode, from: cp.composition?.state ?? 'storyboard' };
    const errors = [...validateBrief(cp.brief), ...validateStoryboard(cp.storyboard, cp.brief)];
    if (errors.length) return fail(`checkpoint: ${errors.slice(0, 3).join('; ')}`, 'content');
    Object.assign(out, { brief: cp.brief, storyboard: cp.storyboard, checkpoint: cp });
    const given = cp.composition && { status: 'composition', output: cp.composition.output };
    if (recover.mode === 'render') {
      if (cp.composition?.state !== 'accepted') return fail('recover: only an accepted composition is rendered again', 'content');
      const r = await enter('rendering_final', () => renderFinal({ brief: cp.brief, storyboard: cp.storyboard, author: given, service, dir: join(dir, 'final'), origin: { storyboard: 'model_generated', composition: 'model_generated' }, renderer, ...(signal ? { sleep: abortableSleep(signal) } : {}) }));
      checkpoint(signal);
      if (!r.submitted) return fail(`final render refused: ${r.reason}`, 'renderer');
      out.render = r.result;
      if (r.result.status !== 'ready') return fail(`final: ${r.result.status}: ${r.result.failure.category}: ${r.result.failure.detail}`, r.result.status === 'render_failed' ? 'renderer' : 'content');
      out.block = motionVideoBlock({ brief: cp.brief, renderId: r.result.render_id, jobId: r.result.render_id, renderer });
      return end('ready');
    }
    if (recover.mode !== 'fix') return fail(`recover: unknown mode ${recover.mode}`, 'content');
    return authorAndRender(cp.brief, cp.storyboard, given ? { given, resume: cp.composition.state === 'blocking' ? { findings: cp.findings } : null } : {});
  }

  async function authorAndRender(brief, storyboard, { given = null, resume = null } = {}) {
    const a = given ?? await enter('authoring', () => author({ brief, storyboard, call, env, effort, round: 0, renderer }));
    record(a);
    if (!given && a.output?.source) keep(renderer === 'hyperframes' ? 'composition.html' : 'composition.jsx', a.output.source);
    if (a.output?.status === 'needs_revision') keep('author.needs_revision.json', a.output);
    if (a.status === 'failed') return fail(`author: ${a.error}: ${a.detail}`);

    const job = await enter('review_and_render', () => reviewJob({
      brief, storyboard, author: a, origin: { storyboard: 'model_generated', composition: 'model_generated' },
      service, call, env, dir, effort, signal, renderer, prior: { repairs: { ...out.repairs }, format_retries: out.format_retries, transport_retries: out.transport_retries },
      log: line => onStage(line.replace(/^job: /, 'job:'), out), save, resume,
    }));
    out.calls.push(...job.calls);
    Object.assign(out, { job: job.job, passes: job.passes, render: job.render, job_errors: job.job_errors, storyboard_revised: job.storyboard_revised, repairs: { ...job.job.repairs }, transport_retries: job.job.transport_retries });
    if (job.repair) out.repair = job.repair;
    if (job.job.status !== 'ready') return fail(job.job.failure_reason, job.cause);
    out.block = motionVideoBlock({ brief, renderId: job.render.render_id, jobId: job.job.id, renderer });
    return end('ready');
  }
}
