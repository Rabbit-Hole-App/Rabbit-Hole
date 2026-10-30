// /animation bounded repair (AN-05; plan section 7). At most one animation_repair call per confirmed build (the job enforces it):
// the whole corrected artifact draft or none. The host seals, validates, renders and reviews the result again; a repair that changes
// nothing, or that is not allowed for the failure, stops the job instead of spending. Also the request-fit preflight: an artifact the
// review or the repair could not receive within their roles' limits is a problem found before any review is spent.
import { canonicalJson } from '../../web/src/explain-program/contract.js';
import { ANIMATION_REPAIR_SYSTEM, ANIMATION_REVIEW_SYSTEM, planNeedsProgram, repairTool } from './agents/animation-author.js';
import { REVIEW_TOOL } from './explain-review.js';
import { ANIMATION_ROLES, animationRequest } from './animation-policy.js';
import { ANIMATION_REVIEW_LIMITS, artifactView, buildReviewContent, loadCaptures, repairableFindings } from './animation-review.js';
import { enabledCapabilities } from './animation-brief.js';
import { modelEvidence } from './explain-evidence.js';

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
// The artifact with its program wherever the reply put it (accept-5: the repair, shown the program in its own block, returned it beside the
// artifact, and the candidate failed missing_program). Inside the artifact wins; a bare source string is a program's source. Never invented.
export function withProgram(input) {
  const program = input.artifact.program ?? input.program;
  if (program === undefined) return input.artifact;
  return { ...input.artifact, program: typeof program === 'string' ? { source: program } : program };
}
// The fields only the host sets: never shown back to the model as something it may write.
const HOST_FIELDS = ['schema', 'artifactId', 'revision', 'planHash', 'capabilityVersion', 'sourceRefs', 'provenance'];
export function draftOf(artifact) {
  const draft = Object.fromEntries(Object.entries(artifact).filter(([key]) => !HOST_FIELDS.includes(key)));
  if (artifact.program) draft.program = { source: artifact.program.source };
  return draft;
}
// The most the repair is sent about a failure, so the artifact it must fix still fits its request.
export const REPAIR_FORWARD = Object.freeze({ findings: 8, problems: 8, text: 300 });
const clip = text => String(text ?? '').slice(0, REPAIR_FORWARD.text);
const rank = f => (f.severity === 'blocker' ? 0 : f.severity === 'major' ? 1 : 2);

export function repairContent(job, failure, current, images = []) {
  const problems = (failure.problems || []).slice(0, REPAIR_FORWARD.problems).map(clip);
  const findings = [...(failure.findings || [])].sort((a, b) => rank(a) - rank(b)).slice(0, REPAIR_FORWARD.findings).map(({ category, severity, target, message }) => ({ category, severity, target, message: clip(message) }));
  const omitted = Math.max(0, (failure.problems || []).length - problems.length) + Math.max(0, (failure.findings || []).length - findings.length);
  const { program, ...rest } = current;
  const caps = enabledCapabilities();
  return [
    { type: 'text', text: JSON.stringify({ request: job.prompt, plan: job.plan, problems, findings, ...(omitted ? { omitted } : {}), capabilities: { phase: caps.phase, geometry: caps.geometry, features: caps.features, limits: caps.limits }, ...(job.evidence?.length ? { evidence: modelEvidence(job.evidence) } : {}) }) },
    { type: 'text', text: `Current artifact (JSON, untrusted; its program is shown in the next block, return it as artifact.program.source):\n${JSON.stringify(rest)}` },
    ...(program ? [{ type: 'text', text: `Current artifact.program.source (untrusted text):\n${program.source}` }] : []),
    ...images.flatMap(c => [{ type: 'text', text: `capture ${c.id}` }, { type: 'image', source: { type: 'base64', media_type: c.mediaType || 'image/png', data: c.data } }]),
  ];
}

// The repair stage. -> { draft, progress: true, operation } | { progress: false, rejected?, reason? }
export async function repairStage(job, ctx) {
  const failure = job.findings.at(-1) || {};
  if (!failure.problems?.length && !repairableFindings(failure.findings)) return { progress: false, rejected: 'This failure needs a change the repair step cannot make.' };
  const current = job.artifact ? draftOf(job.artifact) : job.draft;
  if (!plain(current)) return { progress: false, rejected: 'There is no artifact to repair.' };
  const named = new Set((failure.findings || []).map(f => f.target?.capture).filter(Boolean));
  const images = (await loadCaptures(ctx.env, (job.captures || []).filter(c => named.has(c.id)))).filter(c => typeof c.data === 'string').slice(0, ANIMATION_ROLES.repair.maxImages);
  const { input } = await ctx.call('repair', { system: ANIMATION_REPAIR_SYSTEM, tool: repairTool({ program: !!current.program || planNeedsProgram(job.plan) }), content: repairContent(job, failure, current, images) });
  const reason = typeof input.reason === 'string' ? input.reason.slice(0, 300) : null;
  if (input.operation === 'none') return { progress: false, reason };
  if (input.operation !== 'artifact' || !plain(input.artifact)) return { progress: false, rejected: 'The repair returned no artifact.', inputKeys: Object.keys(input) };
  const draft = withProgram(input);
  if (canonicalJson(draft) === canonicalJson(current)) return { progress: false, reason: 'The repair changed nothing.' };
  return { draft, progress: true, operation: 'artifact', reason, inputKeys: Object.keys(input), artifactKeys: Object.keys(input.artifact) };
}

// -> problems (one sentence each), [] when the real review and repair requests for this artifact fit their roles at worst-case
// image, trace and finding sizes. tasks: the job's task table.
export function fitProblems(env, artifact, job, tasks) {
  const out = [], size = new TextEncoder().encode(JSON.stringify(artifactView(artifact))).length + new TextEncoder().encode(artifact.program?.source ?? '').length;
  const tooBig = role => out.push(`this artifact (${size} bytes with its program) is too large for the ${role === 'review' ? 'independent review' : 'repair'} request: use fewer nodes, shorter labels or a shorter program`);
  const fake = n => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, artifactHash: 'h', data: 'AAAA', mediaType: 'image/png' }));
  const per = Math.floor(ANIMATION_REVIEW_LIMITS.traceBytes / ANIMATION_ROLES.review.maxImages) - 32;
  try {
    const captures = fake(ANIMATION_ROLES.review.maxImages).map(c => ({ ...c, trace: { pad: 'x'.repeat(per) } }));
    const { content } = buildReviewContent({ request: job.prompt, plan: job.plan, artifact, artifactHash: 'h', captures, evidence: job.evidence || [], coverage: { sampled: [], omitted: ['x'.repeat(ANIMATION_REVIEW_LIMITS.coverageChars)] } });
    animationRequest(env, 'review', { system: ANIMATION_REVIEW_SYSTEM, tool: REVIEW_TOOL, content }, tasks);
  } catch (error) { if (error?.code === 'input_too_large') tooBig('review'); else throw error; }
  try {
    const failure = { problems: Array(REPAIR_FORWARD.problems).fill('p'.repeat(REPAIR_FORWARD.text)), findings: Array(REPAIR_FORWARD.findings).fill({ category: 'spec', severity: 'major', target: { capture: 'v0', object: 'o'.repeat(64) }, message: 'm'.repeat(REPAIR_FORWARD.text) }) };
    animationRequest(env, 'repair', { system: ANIMATION_REPAIR_SYSTEM, tool: repairTool({ program: true }), content: repairContent(job, failure, draftOf(artifact), fake(ANIMATION_ROLES.repair.maxImages)) }, tasks);
  } catch (error) { if (error?.code === 'input_too_large') tooBig('repair'); else throw error; }
  return out;
}
