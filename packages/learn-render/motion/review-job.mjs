// M6: one Motion job from an Author result through review, its repairs and the final render (spec
// §4.8 steps 5-9, §13.3). The harness decides every transition. Repairs (owner decision 2026-10-05):
// one per artifact stage, the storyboard's and the Author's, never shared and never looped.
//
//   preview (render-job.mjs renderPreview) -> harness checks + fresh visual + fresh pedagogical review
//     no blocking finding -> final render + final validation (renderComposition) -> ready | failed
//     blocking, Author repair unused -> the Author repair:
//         storyboard-level findings, storyboard repair unused -> one Director revision (checked
//                                                                again), then the Author call
//         otherwise                                          -> the Author call alone
//       -> preview -> fresh reviews again -> still blocking: failed, no further repair or call
//   An Author needs_revision spends both repairs (revision + regeneration); with one spent, it fails.
//
// The harness's own preview checks are findings by reviewer "harness": a composition the render
// gate refuses or that fails to render (renderer_failure), a preview that breaks the artifact
// contract (corrupt_output), a blank or near-blank frame (blank_frame) at any frame the final
// would be refused for, and (M7A) a render that does not show the storyboard (storyboard_fidelity).
// All of them block, so a blank opening or a missing object spends the repair round before any
// final render. Reviewers are fresh calls per pass and never see findings, sources or notes.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAuthor } from './author.js';
import { DEFAULT_RENDERER, JOB_STATUSES, MODEL_ROLES, STAGE, afterNeedsRevision, afterReview, classifyFindings, noRepairs, startRepair, validateJob } from './contracts.js';
import { resolveRole } from './model-config.js';
import { renderComposition, renderPreview } from './render-job.mjs';
import { runReviewer } from './review.js';
import { runStoryboard } from './storyboard.js';

// Findings the storyboard decides (what is shown, claimed and in which order): they go to one
// Director revision first. Visual and render findings go to the Author alone.
// ponytail: the brief itself is never revised; a brief-level defect fails at the second review.
export const STORYBOARD_LEVEL = ['unsupported_claim', 'must_not_claim_violation', 'required_claim_contradicted', 'wrong_source_branch', 'missing_must_show', 'narration_contradicts_visuals'];
// Development jobs (M1-M6) have no product owner; M7 scopes jobs the LearnVideos way.
export const HARNESS_OWNER = Object.freeze({ org: 'development', app: 'motion-v1-harness', learner: 'harness' });

// Stop (M7A): the harness checks the signal at every stage boundary and while it waits on a render.
// A model call or render already in flight finishes and is discarded; nothing new starts.
export class MotionCancelled extends Error { constructor() { super('cancelled'); this.name = 'MotionCancelled'; } }
export const checkpoint = signal => { if (signal?.aborted) throw new MotionCancelled(); };
export const abortableSleep = signal => ms => new Promise((done, fail) => {
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); fail(new MotionCancelled()); }, { once: true });
});

const harness = (round, category, description, extra = {}) => ({ reviewer: 'harness', round, category, ...extra, description });

// The harness's findings on one preview.
export function harnessFindings(preview, round) {
  if (!preview.submitted) return [harness(round, 'renderer_failure', `The render gate refused the composition: ${preview.reason}${preview.errors?.length ? `: ${preview.errors.slice(0, 5).join('; ')}` : ''}`)];
  const r = preview.result;
  if (r.status === 'render_failed') return [harness(round, 'renderer_failure', `The preview did not render: ${r.failure.category}: ${r.failure.detail}`)];
  if (r.status === 'artifact_invalid') return [harness(round, 'corrupt_output', `The preview broke the artifact contract: ${r.failure.category}: ${r.failure.detail}`)];
  const findings = [];
  // M7A: the storyboard as rendered, judged on the preview (an object missing from its beat, a shared
  // object vanishing at a boundary): the Author fixes it in the repair round.
  if (r.coverage && !r.coverage.ok) findings.push(harness(round, 'storyboard_fidelity',
    `The render does not show the storyboard: ${r.coverage.errors.slice(0, 8).join('; ')}. An object listed in a beat is visible (opacity above 0.05, on stage) at that beat's middle, an object in two consecutive beats stays visible across the boundary between them, and every text inside a code panel renders in JetBrains Mono.`,
    /^B\d+/.test(r.coverage.errors[0]) ? { beat_id: r.coverage.errors[0].match(/^B\d+/)[0] } : {}));
  if (r.nonblank.ok) return findings;
  const blank = r.nonblank.blank;
  return [...findings, harness(round, 'blank_frame',
    `Blank or near-blank frames: ${blank.map(b => `#${b.frame} (${(b.frame / STAGE.fps).toFixed(2)} s, luma stddev ${b.luma_stddev})`).join(', ')}. Every sampled frame (0, 1, each beat's start, start + 1, middle and end - 1, and the last frame) needs luma standard deviation above ${r.nonblank.threshold}; the final render is refused otherwise.`,
    { beat_id: blank[0].beat, timestamp: +(blank[0].frame / STAGE.fps).toFixed(2) })];
}

export async function runMotionJob({
  brief, storyboard, author, origin, service, call, env = {}, dir, effort = 'high',
  preview = renderPreview, final = renderComposition, review = runReviewer, revise = runStoryboard, repairAuthor = runAuthor,
  now = () => Date.now(), log = () => {},
  // M7A: the job may arrive with its storyboard repair already spent by the planning stages (a
  // storyboard that failed its checks; the Author's repair is untouched), with their format re-asks
  // and transport retries; signal is Stop.
  prior = null, signal = null,
  // M7B: the backend for every render and the Author repair; Remotion unless the caller says otherwise.
  renderer = DEFAULT_RENDERER,
}) {
  const stop = () => checkpoint(signal);
  const polling = signal ? { sleep: abortableSleep(signal) } : {};
  const at = () => new Date(now()).toISOString();
  const job = {
    id: prior?.id ?? `motion-job-${randomUUID().slice(0, 8)}`, status: 'rendering_preview', owner: { ...HARNESS_OWNER }, brief, storyboard,
    renderer: { name: renderer, version: (await service.health().catch(() => null))?.version ?? 'unreachable' },
    prompt_spec_version: brief.prompt_spec_version,
    director_model_config: { role: MODEL_ROLES.director, resolved_model: resolveRole(MODEL_ROLES.director, env) },
    author_model_config: { role: MODEL_ROLES.author, resolved_model: resolveRole(MODEL_ROLES.author, env) },
    review_model_config: {
      visual: { role: MODEL_ROLES.visual_review, resolved_model: resolveRole(MODEL_ROLES.visual_review, env) },
      pedagogical: { role: MODEL_ROLES.pedagogical_review, resolved_model: resolveRole(MODEL_ROLES.pedagogical_review, env) },
    },
    repairs: { ...noRepairs(), ...(prior?.repairs ?? {}) }, repair_count: 0, format_retries: [...(prior?.format_retries ?? [])], transport_retries: [...(prior?.transport_retries ?? [])], findings: [], preview_refs: null, source_refs: brief.source_refs, created_at: at(), updated_at: at(),
  };
  job.repair_count = job.repairs.storyboard + job.repairs.author;
  const out = { job, passes: [], repair: null, render: null, calls: [], composition: null, storyboard_revised: false };
  const set = status => { if (!JOB_STATUSES.includes(status)) throw Error(status); job.status = status; job.updated_at = at(); log(`job: ${status}`); };
  const record = r => { out.calls.push(...(r.calls || [])); job.format_retries.push(...(r.format_retries || [])); job.transport_retries.push(...(r.transport_retries || [])); };
  const finish = () => ({ ...out, job_errors: validateJob(job) });
  const fail = reason => { job.failure_reason = reason; set('failed'); return finish(); };

  let current = { storyboard, author };
  // round: the Author's pass, 0 first and 1 after the Author repair.
  for (let round = job.repairs.author; round <= 1; round++) {
    const a = current.author;
    const roundDir = join(dir, `round-${round}`);
    const pass = { round, author: a?.status ?? null };
    out.passes.push(pass);
    let findings = [];
    if (a?.status === 'failed') return fail(`author${round ? ' (Author repair)' : ''}: ${a.error}: ${a.detail}`);
    if (a?.status === 'needs_revision') {
      pass.reason = a.output.reason;
      if (afterNeedsRevision(job) === 'fail') return fail(`the Author returned needs_revision with a repair already spent (storyboard ${job.repairs.storyboard}, Author ${job.repairs.author}): ${a.output.reason}`);
    } else {
      if (a?.status === 'author_invalid') findings = [harness(round, 'renderer_failure', `The composition broke the Author contract: ${a.check.errors.slice(0, 5).join('; ')}`)];
      else {
        stop();
        set('rendering_preview');
        const p = await preview({ brief, storyboard: current.storyboard, author: a, service, dir: roundDir, origin, renderer, ...polling });
        pass.preview = p.submitted ? p.result : { submitted: false, reason: p.reason, errors: p.errors };
        findings = harnessFindings(p, round);
        if (p.submitted && p.result.status === 'ready') {
          job.preview_refs = { video: `round-${round}/preview.mp4`, contact_sheet: `round-${round}/contact-sheet.png`, keyframes: p.result.frames.map(f => `round-${round}/${f.file}`) };
          stop();
          set('reviewing');
          const reviewers = ['visual', 'pedagogical'];
          const reviews = await Promise.all(reviewers.map(reviewer => review({ reviewer, brief, storyboard: current.storyboard, frames: p.result.frames, dir: roundDir, call, env, effort, round })));
          for (const [i, r] of reviews.entries()) {
            record(r);
            if (r.status !== 'reviewed') return fail(`${reviewers[i]} review${round ? ' (after the Author repair)' : ''}: ${r.error}: ${r.detail}`);
            findings.push(...r.findings);
          }
        }
      }
      job.findings.push(...findings);
      const { blocking, advisory } = classifyFindings(findings);
      const decision = afterReview(job, findings);
      Object.assign(pass, { findings, blocking: blocking.length, advisory: advisory.length, decision });
      if (decision === 'fail') return fail(`still blocking after the Author repair: ${[...new Set(blocking.map(f => f.category))].join(', ')}`);
      if (decision === 'render_final') {
        stop();
        set('rendering_final');
        const r = await final({ brief, storyboard: current.storyboard, author: a, service, dir: join(dir, 'final'), origin, renderer, ...polling });
        if (!r.submitted) return fail(`final render refused: ${r.reason}`);
        out.render = r.result;
        out.composition = { composition_id: a.output.composition_id, source: a.output.source };
        set('validating_final');
        job.final_validation = r.result.validation;
        if (r.result.status !== 'ready') return fail(`final: ${r.result.status}: ${r.result.failure.category}: ${r.result.failure.detail}`);
        job.final_ref = 'final/final.mp4'; // ponytail: a job-directory file until M7 stores it in LEARN_MEDIA
        set('ready');
        return finish();
      }
    }

    // The Author repair, and the storyboard's when the findings are the storyboard's and it is unused.
    stop();
    const needsRevision = a?.status === 'needs_revision';
    const blocking = needsRevision
      ? [{ reviewer: 'author', category: 'needs_revision', description: `${a.output.reason} Requested: ${a.output.requested_changes.join('; ')}` }]
      : classifyFindings(findings).blocking;
    const storyboardLevel = needsRevision || blocking.some(f => STORYBOARD_LEVEL.includes(f.category));
    const toStoryboard = storyboardLevel && job.repairs.storyboard < 1;
    if (toStoryboard) startRepair(job, 'storyboard');
    startRepair(job, 'author');
    job.updated_at = at();
    out.repair = { route: toStoryboard ? 'director_revision_then_author' : 'author', findings: blocking.length, ...(storyboardLevel && !toStoryboard ? { storyboard_repair_already_spent: true } : {}) };
    let sb = current.storyboard;
    if (toStoryboard) {
      const s = await revise({ brief, call, env, effort, round: 1, revision: { storyboard: sb, findings: blocking } });
      record(s);
      out.repair.storyboard = { status: s.status, ...(s.check?.errors?.length ? { errors: s.check.errors } : {}), ...(s.error ? { error: s.error, detail: s.detail } : {}) };
      if (s.status !== 'storyboard') return fail(`storyboard repair (Director revision): ${s.status}${s.error ? `: ${s.error}: ${s.detail}` : `: ${s.check.errors.slice(0, 3).join('; ')}`}`);
      sb = s.storyboard;
      job.storyboard = sb;
      out.storyboard_revised = true;
    }
    stop();
    set('authoring');
    const source = a?.output?.source;
    const fixed = await repairAuthor({ brief, storyboard: sb, call, env, effort, round: 1, renderer, repair: source ? { source, findings: blocking } : null });
    record(fixed);
    if (fixed.output?.source && dir) writeFileSync(join(dir, `composition.repaired.${renderer === 'hyperframes' ? 'html' : 'jsx'}`), fixed.output.source); // diagnostics
    out.repair.author = { status: fixed.status, ...(fixed.check?.errors?.length ? { errors: fixed.check.errors } : {}), ...(fixed.error ? { error: fixed.error, detail: fixed.detail } : {}) };
    current = { storyboard: sb, author: fixed };
  }
  throw Error('unreachable: the job ends inside its two passes');
}
