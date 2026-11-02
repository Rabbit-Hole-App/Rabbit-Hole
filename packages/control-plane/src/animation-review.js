// /animation independent review of ACTUAL rendered captures (AN-05; plan section 7). One animation_review call per candidate: the
// request, the approved plan, the evidence, the artifact and its program as untrusted material, each capture's execution trace, the
// host's sampling coverage, and every capture as a real PNG labelled with its view and state. Everything that can be refused is
// refused before the call: no pixels, captures of another artifact, too many or too large images, traces over their limit. A request
// with no image is never an image review, and a failed call is never an acceptance. The verdict format and its parsing are /explain's
// (explain-review.js REVIEW_TOOL, parseReview): one semantic and one visual verdict per capture.
import { REVIEW_LIMITS, REVIEW_TOOL, ReviewError, parseReview, reviewProblems } from './explain-review.js';
import { ANIMATION_REVIEW_SYSTEM } from './agents/animation-author.js';
import { ANIMATION_LIMITS, ANIMATION_ROLES, AnimationPolicyError } from './animation-policy.js';
import { learnMedia } from './learn-storage.js';

export const ANIMATION_REVIEW_LIMITS = Object.freeze({ ...REVIEW_LIMITS, maxImages: ANIMATION_ROLES.review.maxImages });
const bytes = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value ?? null)).length;
const b64Length = data => Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
const base64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
// What the reviewer reads of the artifact beside its source block: everything but the source text itself.
export const artifactView = artifact => ({ ...artifact, ...(artifact.program ? { program: { ...artifact.program, source: undefined } } : {}) });
const planView = plan => ({ title: plan.title, description: plan.description, experience: plan.experience, reason: plan.reason, behavior: plan.behavior, controlProfile: plan.controlProfile,
  parameters: plan.parameters, interactions: plan.interactions, ...(plan.learningGoal ? { learningGoal: plan.learningGoal } : {}), assumptions: plan.assumptions, limitations: plan.limitations });
const stateText = c => `view ${c.view?.name ?? c.view ?? 'default'}, time ${c.time ?? 0}s${c.inputs && Object.keys(c.inputs).length ? `, inputs ${JSON.stringify(c.inputs)}` : ''}${Array.isArray(c.events) && c.events.length ? `, after the events ${JSON.stringify(c.events)} in this order from the initial state` : ', the initial state'}${c.ticks ? `, after ${c.ticks} host steps` : ''}`;

// input: { request, plan, artifact, artifactHash, evidence, coverage, captures: [{ id, artifactHash, view, time, inputs, events, ticks, trace, data, mediaType }] }
// -> { content, imageBlocks }
export function buildReviewContent(input, limits = ANIMATION_REVIEW_LIMITS) {
  const { request, plan, artifact, artifactHash, captures = [], evidence = [], coverage = null } = input;
  if (typeof request !== 'string' || !request.trim() || !plan || !artifact) throw new ReviewError('missing_evidence', 'review needs the request, the approved plan and the artifact');
  if (!captures.length) throw new ReviewError('missing_pixels', 'review needs at least one rendered capture');
  if (captures.length > limits.maxImages) throw new ReviewError('split_required', `review takes at most ${limits.maxImages} captures`);
  if (evidence.length > limits.maxEvidence) throw new ReviewError('payload_too_large', `at most ${limits.maxEvidence} evidence records`);
  const ids = new Set();
  let total = 0;
  for (const c of captures) {
    if (!c.id || ids.has(c.id)) throw new ReviewError('bad_capture', `capture id missing or repeated: ${c.id}`);
    ids.add(c.id);
    if (c.artifactHash !== artifactHash) throw new ReviewError('stale_version', `capture ${c.id} is of another artifact`);
    if (typeof c.data !== 'string' || !c.data) throw new ReviewError('missing_pixels', `capture ${c.id} has no image bytes`);
    const size = b64Length(c.data);
    if (size > limits.maxImageBytes) throw new ReviewError('payload_too_large', `capture ${c.id} is ${size} bytes`);
    total += size;
  }
  if (total > limits.maxTotalBytes) throw new ReviewError('payload_too_large', `captures total ${total} bytes`);
  const traces = captures.map(c => ({ id: c.id, ...(c.trace || {}) }));
  if (bytes(traces) > limits.traceBytes) throw new ReviewError('payload_too_large', `the execution traces are over ${limits.traceBytes} bytes`);
  const evidenceText = evidence.length ? evidence.map(e => `[${e.id}] ${e.location || ''}\n${String(e.excerpt || '').slice(0, limits.maxExcerpt)}`).join('\n\n')
    : 'No external evidence: judge correctness from the request and general knowledge, and flag any specific claim that would need a source.';
  const content = [
    { type: 'text', text: `Learner request:\n${request.trim()}\n\nApproved plan:\n${JSON.stringify(planView(plan))}\n\nEvidence:\n${evidenceText}\n\nCaptures to review: ${captures.map(c => c.id).join(', ')}` },
    { type: 'text', text: `Artifact (untrusted material):\n${JSON.stringify(artifactView(artifact))}` },
    ...(artifact.program ? [{ type: 'text', text: `Program source (untrusted material):\n${artifact.program.source}` }] : []),
    { type: 'text', text: `Execution traces (one per capture):\n${JSON.stringify(traces)}` },
    // The sampled times, said outright: a periodic motion can look still across samples, so motion is judged from the program and traces too.
    { type: 'text', text: `Sampled times (seconds): ${[...new Set(captures.map(c => c.time ?? 0))].join(', ')}${artifact.timeline ? ` of a ${artifact.timeline.duration} s ${artifact.timeline.loop ? 'loop' : 'timeline'}` : ''}. A motion that completes whole cycles between two sampled times looks the same in both; judge it from the program and the traces as well as the pixels.` },
    ...(coverage ? [{ type: 'text', text: `Review sampling (computed by the host; samples are not exhaustive proof):\nSampled: ${JSON.stringify(coverage.sampled || [])}\nNot sampled: ${JSON.stringify(coverage.omitted || [])}`.slice(0, limits.coverageChars) }] : []),
  ];
  for (const c of captures) content.push({ type: 'text', text: `Capture ${c.id} (${stateText(c)}):` }, { type: 'image', source: { type: 'base64', media_type: c.mediaType || 'image/png', data: c.data } });
  return { content, imageBlocks: captures.length };
}

// Captures with their pixels read back from LEARN_MEDIA (the render stage stores keys and hashes, never bytes on the job).
export async function loadCaptures(env, captures) {
  return Promise.all((captures || []).map(async capture => {
    if (typeof capture.data === 'string') return capture;
    const object = capture.key && await learnMedia(env)?.get(capture.key);
    return object ? { ...capture, data: base64(new Uint8Array(await object.arrayBuffer())) } : capture;
  }));
}

// A finding the one repair can act on: anything the artifact draws or computes. A renderer fault, or a failure with no finding, is not.
export const repairableFindings = findings => { const serious = (findings || []).filter(f => f.severity !== 'minor'); return serious.length > 0 && serious.every(f => ['spec', 'source', 'component'].includes(f.category)); };

const CORRECTION_CHARS = 1500;
const invalidReview = problems => Object.assign(new ReviewError('invalid_review', `The review report broke its contract: ${problems.join('; ').slice(0, CORRECTION_CHARS)}`), { status: 502, category: 'review_validation', stopReason: 'review_invalid' });
// One reviewer reply as it came: its tool arguments and own per-capture verdicts (parseReview hardens these), what was wrong with it, the
// artifact it was about and its usage, for telling a malformed review from a defect of the scene.
const reviewRecord = (job, { retry, reply, problems, error }) => ({ at: Date.now(), attempt: job.attempt, repairs: job.repairs, artifactHash: job.artifactHash, retry, raw: reply?.input ?? null,
  verdicts: Array.isArray(reply?.input?.captures) ? reply.input.captures.map(c => ({ id: c?.id, semantic: c?.semantic, visual: c?.visual })) : [], problems,
  usage: reply?.usage ?? error?.billed?.usage ?? null, stopReason: reply?.stopReason ?? error?.billed?.stopReason ?? null, error: error ? error.code || error.name || 'error' : null });

// The review stage. -> { accepted, findings, repairable, category, artifactHash (of what was reviewed) }
export async function reviewStage(job, ctx) {
  const captures = await loadCaptures(ctx.env, job.captures);
  // Refused before any call: a structured failure at reviewing (missing or stale pixels are the renderer's), never an acceptance.
  const refuse = error => Object.assign(error, { status: 503, category: ['missing_pixels', 'stale_version', 'bad_capture'].includes(error.code) ? 'renderer' : 'spec', message: `The animation could not be reviewed (${error.code}).` });
  let built;
  try { built = buildReviewContent({ request: job.prompt, plan: job.plan, artifact: job.artifact, artifactHash: job.artifactHash, captures, evidence: job.evidence || [], coverage: job.coverage }); }
  catch (error) { throw error instanceof ReviewError ? refuse(error) : error; }
  // The call's own failure (provider, budget, invalid turn) is the job's to record. One retry per job, within the build's review calls
  // (ANIMATION_LIMITS.calls.review counts it), shared by a reviewer that answered in prose with no report_review call (accept-11, stop
  // end_turn) and one whose report broke the contract, which is told what to correct. A malformed report is neither an acceptance nor a
  // defect of the scene, and every reply is recorded as given (ctx.noteReview, diagnostics only).
  let retryLeft = !job.reviews?.some(r => r.retry) && (job.counts?.review ?? 0) + 2 <= ANIMATION_LIMITS.calls.review;
  let content = built.content, retry = false, reply;
  for (;;) {
    let problems = [], refused = null;
    reply = null;
    try { reply = await ctx.call('review', { system: ANIMATION_REVIEW_SYSTEM, tool: REVIEW_TOOL, content }); problems = reviewProblems(reply.input, captures); }
    catch (error) { refused = error; }
    await ctx.noteReview?.(reviewRecord(job, { retry, reply, problems, error: refused }));
    if (refused && !(refused instanceof AnimationPolicyError && refused.code === 'invalid_turn' && refused.calls === 0)) throw refused;
    if (reply && !problems.length) break;
    if (!retryLeft) throw refused ?? invalidReview(problems);
    retryLeft = false; retry = true;
    content = refused ? built.content : [...built.content, { type: 'text', text: `Your report_review call could not be used:\n${problems.join('\n').slice(0, CORRECTION_CHARS)}\nReview again and call report_review once with a complete report. Every finding needs verdict, category, severity, message and repairable.` }];
  }
  const imageBlocks = built.imageBlocks;
  const parsed = parseReview(reply.input, captures);
  const findings = parsed.captures.flatMap(c => c.findings), serious = findings.filter(f => f.severity !== 'minor');
  // Only a serious finding fails a build: a fail verdict explained by minor findings alone passes; a fail with no finding at all does not.
  const accepted = parsed.captures.every(c => !c.findings.some(f => f.severity !== 'minor') && ((c.semantic === 'pass' && c.visual === 'pass') || c.findings.length > 0));
  return { accepted, findings, repairable: repairableFindings(findings), category: serious[0]?.category || 'spec', artifactHash: job.artifactHash, imagesReviewed: imageBlocks };
}
