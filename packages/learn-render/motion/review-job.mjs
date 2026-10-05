// M6: one Motion job from an Author result through review, the single repair round and the final
// render (spec §4.8 steps 5-9, §13.3). The harness decides every transition:
//
//   preview (render-job.mjs renderPreview) -> harness checks + fresh visual + fresh pedagogical review
//     no blocking finding -> final render + final validation (renderComposition) -> ready | failed
//     blocking, round unused -> the ONE repair round:
//         storyboard-level findings -> one Director revision (checked again), then one Author call
//         otherwise                 -> one Author call
//       -> preview -> fresh reviews again -> still blocking: failed, no further repair or call
//   An Author needs_revision consumes the round; one from the repair call fails the job.
//
// The harness's own preview checks are findings by reviewer "harness": a composition the render
// gate refuses or that fails to render (renderer_failure), a preview that breaks the artifact
// contract (corrupt_output), and a blank or near-blank frame (blank_frame) at any frame the final
// would be refused for. All of them block, so a blank opening spends the repair round before any
// final render. Reviewers are fresh calls per pass and never see findings, sources or notes.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { runAuthor } from './author.js';
import { JOB_STATUSES, MODEL_ROLES, STAGE, afterNeedsRevision, afterReview, classifyFindings, startRepair, validateJob } from './contracts.js';
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

const harness = (round, category, description, extra = {}) => ({ reviewer: 'harness', round, category, ...extra, description });

// The harness's findings on one preview.
export function harnessFindings(preview, round) {
  if (!preview.submitted) return [harness(round, 'renderer_failure', `The render gate refused the composition: ${preview.reason}${preview.errors?.length ? `: ${preview.errors.slice(0, 5).join('; ')}` : ''}`)];
  const r = preview.result;
  if (r.status === 'render_failed') return [harness(round, 'renderer_failure', `The preview did not render: ${r.failure.category}: ${r.failure.detail}`)];
  if (r.status === 'artifact_invalid') return [harness(round, 'corrupt_output', `The preview broke the artifact contract: ${r.failure.category}: ${r.failure.detail}`)];
  if (r.nonblank.ok) return [];
  const blank = r.nonblank.blank;
  return [harness(round, 'blank_frame',
    `Blank or near-blank frames: ${blank.map(b => `#${b.frame} (${(b.frame / STAGE.fps).toFixed(2)} s, luma stddev ${b.luma_stddev})`).join(', ')}. Every sampled frame (0, 1, each beat's start, start + 1, middle and end - 1, and the last frame) needs luma standard deviation above ${r.nonblank.threshold}; the final render is refused otherwise.`,
    { beat_id: blank[0].beat, timestamp: +(blank[0].frame / STAGE.fps).toFixed(2) })];
}

export async function runMotionJob({
  brief, storyboard, author, origin, service, call, env = {}, dir, effort = 'high',
  preview = renderPreview, final = renderComposition, review = runReviewer, revise = runStoryboard, repairAuthor = runAuthor,
  now = () => Date.now(), log = () => {},
}) {
  const at = () => new Date(now()).toISOString();
  const job = {
    id: `motion-job-${randomUUID().slice(0, 8)}`, status: 'rendering_preview', owner: { ...HARNESS_OWNER }, brief, storyboard,
    renderer: { name: 'remotion', version: (await service.health().catch(() => null))?.version ?? 'unreachable' },
    prompt_spec_version: brief.prompt_spec_version,
    director_model_config: { role: MODEL_ROLES.director, resolved_model: resolveRole(MODEL_ROLES.director, env) },
    author_model_config: { role: MODEL_ROLES.author, resolved_model: resolveRole(MODEL_ROLES.author, env) },
    review_model_config: {
      visual: { role: MODEL_ROLES.visual_review, resolved_model: resolveRole(MODEL_ROLES.visual_review, env) },
      pedagogical: { role: MODEL_ROLES.pedagogical_review, resolved_model: resolveRole(MODEL_ROLES.pedagogical_review, env) },
    },
    repair_count: 0, format_retries: [], findings: [], preview_refs: null, source_refs: brief.source_refs, created_at: at(), updated_at: at(),
  };
  const out = { job, passes: [], repair: null, render: null, calls: [], composition: null, storyboard_revised: false };
  const set = status => { if (!JOB_STATUSES.includes(status)) throw Error(status); job.status = status; job.updated_at = at(); log(`job: ${status}`); };
  const record = r => { out.calls.push(...(r.calls || [])); job.format_retries.push(...(r.format_retries || [])); };
  const finish = () => ({ ...out, job_errors: validateJob(job) });
  const fail = reason => { job.failure_reason = reason; set('failed'); return finish(); };

  let current = { storyboard, author };
  for (let round = 0; round <= 1; round++) {
    const a = current.author;
    const roundDir = join(dir, `round-${round}`);
    const pass = { round, author: a?.status ?? null };
    out.passes.push(pass);
    let findings = [];
    if (a?.status === 'failed') return fail(`author${round ? ' (repair round)' : ''}: ${a.error}: ${a.detail}`);
    if (a?.status === 'needs_revision') {
      pass.reason = a.output.reason;
      if (afterNeedsRevision(job) === 'fail') return fail(`the repair round's Author call returned needs_revision: ${a.output.reason}`);
    } else {
      if (a?.status === 'author_invalid') findings = [harness(round, 'renderer_failure', `The composition broke the Author contract: ${a.check.errors.slice(0, 5).join('; ')}`)];
      else {
        set('rendering_preview');
        const p = await preview({ brief, storyboard: current.storyboard, author: a, service, dir: roundDir, origin });
        pass.preview = p.submitted ? p.result : { submitted: false, reason: p.reason, errors: p.errors };
        findings = harnessFindings(p, round);
        if (p.submitted && p.result.status === 'ready') {
          job.preview_refs = { video: `round-${round}/preview.mp4`, contact_sheet: `round-${round}/contact-sheet.png`, keyframes: p.result.frames.map(f => `round-${round}/${f.file}`) };
          set('reviewing');
          const reviewers = ['visual', 'pedagogical'];
          const reviews = await Promise.all(reviewers.map(reviewer => review({ reviewer, brief, storyboard: current.storyboard, frames: p.result.frames, dir: roundDir, call, env, effort, round })));
          for (const [i, r] of reviews.entries()) {
            record(r);
            if (r.status !== 'reviewed') return fail(`${reviewers[i]} review${round ? ' (repair round)' : ''}: ${r.error}: ${r.detail}`);
            findings.push(...r.findings);
          }
        }
      }
      job.findings.push(...findings);
      const { blocking, advisory } = classifyFindings(findings);
      const decision = afterReview(job, findings);
      Object.assign(pass, { findings, blocking: blocking.length, advisory: advisory.length, decision });
      if (decision === 'fail') return fail(`still blocking after the repair round: ${[...new Set(blocking.map(f => f.category))].join(', ')}`);
      if (decision === 'render_final') {
        set('rendering_final');
        const r = await final({ brief, storyboard: current.storyboard, author: a, service, dir: join(dir, 'final'), origin });
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

    // The single repair round.
    startRepair(job);
    job.updated_at = at();
    const blocking = a?.status === 'needs_revision'
      ? [{ reviewer: 'author', category: 'needs_revision', description: `${a.output.reason} Requested: ${a.output.requested_changes.join('; ')}` }]
      : classifyFindings(findings).blocking;
    const toStoryboard = a?.status === 'needs_revision' || blocking.some(f => STORYBOARD_LEVEL.includes(f.category));
    out.repair = { route: toStoryboard ? 'director_revision_then_author' : 'author', findings: blocking.length };
    let sb = current.storyboard;
    if (toStoryboard) {
      const s = await revise({ brief, call, env, effort, round: 1, revision: { storyboard: sb, findings: blocking } });
      record(s);
      out.repair.storyboard = { status: s.status, ...(s.check?.errors?.length ? { errors: s.check.errors } : {}), ...(s.error ? { error: s.error, detail: s.detail } : {}) };
      if (s.status !== 'storyboard') return fail(`repair round Director revision: ${s.status}${s.error ? `: ${s.error}: ${s.detail}` : `: ${s.check.errors.slice(0, 3).join('; ')}`}`);
      sb = s.storyboard;
      job.storyboard = sb;
      out.storyboard_revised = true;
    }
    set('authoring');
    const source = a?.output?.source;
    const fixed = await repairAuthor({ brief, storyboard: sb, call, env, effort, round: 1, repair: source ? { source, findings: blocking } : null });
    record(fixed);
    out.repair.author = { status: fixed.status, ...(fixed.check?.errors?.length ? { errors: fixed.check.errors } : {}), ...(fixed.error ? { error: fixed.error, detail: fixed.detail } : {}) };
    current = { storyboard: sb, author: fixed };
  }
  throw Error('unreachable: the job ends inside its two passes');
}
