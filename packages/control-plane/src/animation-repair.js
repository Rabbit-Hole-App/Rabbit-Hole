// /animation bounded repair (AN-05; plan section 7). At most one animation_repair call per confirmed build (the job enforces it):
// the whole corrected artifact draft or none. The host seals, validates, renders and reviews the result again; a repair that changes
// nothing, or that is not allowed for the failure, stops the job instead of spending. Also the request-fit preflight: an artifact the
// review or the repair could not receive within their roles' limits is a problem found before any review is spent.
import { canonicalJson } from '../../web/src/explain-program/contract.js';
import { ANIMATION_REPAIR_SYSTEM, ANIMATION_REVIEW_SYSTEM, planNeedsProgram, repairTool } from './agents/animation-author.js';
import { REVIEW_TOOL } from './explain-review.js';
import { ANIMATION_ROLES, animationRequest } from './animation-policy.js';
import { ANIMATION_REVIEW_LIMITS, CORRECTION_WORST, buildReviewContent, correctionBlock, loadCaptures, repairableFindings, reviewArtifactView } from './animation-review.js';
import { actionCapability, enabledCapabilities, surfaceCapability } from './animation-brief.js';
import { modelEvidence } from './explain-evidence.js';
import { captureManifest } from './animation-render.js';

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
// The worst case the request-fit check reserves room for (fitProblems): 8 validation problems and 8 review findings of 300 characters.
// What a real repair is sent is decided by repairContent's fits, against the repair request's own limit.
export const REPAIR_FORWARD = Object.freeze({ findings: 8, problems: 8, text: 300 });
const rank = f => (f.severity === 'blocker' ? 0 : f.severity === 'major' ? 1 : 2);

// One entry per distinct issue: its severity, category and whole message, with every capture and object it was reported on
// (aj_ad936ec1: one message on six captures took six of eight slots; aj_086fd46 review 1: 12 distinct findings, 4 cut, among them the
// only word on a missing readout). Never truncated, never merged with another message. -> ranked: blocker, major, minor, as reported.
export function distinctFindings(findings) {
  const issues = new Map();
  for (const f of findings || []) {
    const key = JSON.stringify([f.severity, f.category, String(f.message ?? '')]), target = { capture: f.target?.capture ?? null, object: f.target?.object ?? null };
    const issue = issues.get(key) ?? issues.set(key, { category: f.category, severity: f.severity, message: String(f.message ?? ''), targets: [] }).get(key);
    if (!issue.targets.some(t => t.capture === target.capture && t.object === target.object)) issue.targets.push(target);
  }
  return [...issues.values()].sort((a, b) => rank(a) - rank(b));
}

// fits(content) -> whether the whole repair request with this content is within its limit (repairStage: the real request check). Every
// validation problem (at most REPAIR_FORWARD.problems) and every distinct finding goes whole while it fits; when it does not, the lowest
// ranked go, last first, and are named in omitted with their targets (or, if even that does not fit, counted), so the repair is never
// told the list is complete when it is not. -> content blocks, with content.forwarded = { findings, problems, omitted } for diagnostics.
export function repairContent(job, failure, current, images = [], fits = () => true) {
  const items = [...(failure.problems || []).slice(0, REPAIR_FORWARD.problems).map(problem => ({ problem: String(problem) })), ...distinctFindings(failure.findings).map(finding => ({ finding }))];
  const cutProblems = Math.max(0, (failure.problems || []).length - REPAIR_FORWARD.problems);
  const { program, ...rest } = current;
  const caps = enabledCapabilities();
  const build = (sent, left, named = true) => {
    const omittedFindings = left.filter(i => i.finding).map(({ finding: { severity, category, targets } }) => ({ severity, category, targets }));
    const omittedProblems = cutProblems + left.filter(i => i.problem).length;
    const omitted = omittedFindings.length || omittedProblems ? { ...(omittedFindings.length ? { findings: named ? omittedFindings : omittedFindings.length } : {}), ...(omittedProblems ? { problems: omittedProblems } : {}), note: 'not sent: these were reported but did not fit this request' } : null;
    const content = [
      { type: 'text', text: JSON.stringify({ request: job.prompt, plan: job.plan, problems: sent.filter(i => i.problem).map(i => i.problem), findings: sent.filter(i => i.finding).map(i => i.finding), ...(omitted ? { omitted } : {}), capabilities: { phase: caps.phase, geometry: caps.geometry, features: caps.features, limits: caps.limits, ...surfaceCapability(job), ...actionCapability(job) }, ...(job.evidence?.length ? { evidence: modelEvidence(job.evidence) } : {}) }) },
      { type: 'text', text: `Current artifact (JSON, untrusted; its program is shown in the next block, return it as artifact.program.source):\n${JSON.stringify(rest)}` },
      ...(program ? [{ type: 'text', text: `Current artifact.program.source (untrusted text):\n${program.source}` }] : []),
      ...images.flatMap(c => [{ type: 'text', text: `capture ${c.id}` }, { type: 'image', source: { type: 'base64', media_type: c.mediaType || 'image/png', data: c.data } }]),
    ];
    return Object.assign(content, { forwarded: { findings: sent.filter(i => i.finding).length, problems: sent.filter(i => i.problem).length, ...(omitted ? { omitted } : {}) } });
  };
  for (let n = items.length; n >= 0; n--) { const content = build(items.slice(0, n), items.slice(n)); if (fits(content)) return content; }
  return build([], items, false); // nothing fits but the counts: still never claims completeness (the request check then refuses it)
}

// The repair stage. -> { draft, progress: true, operation } | { progress: false, rejected?, reason? }
export async function repairStage(job, ctx) {
  const failure = job.findings.at(-1) || {};
  if (!failure.problems?.length && !repairableFindings(failure.findings)) return { progress: false, rejected: 'This failure needs a change the repair step cannot make.' };
  // The candidate as the model wrote it (its draft), not the contract-parsed artifact: the parse fills every default and grew
  // aj_fac3ca4b's 10,172 B draft to 14,270 B, past the repair request's bound (FX-AN-025). The program travels whole either way.
  const current = plain(job.draft) ? job.draft : job.artifact ? draftOf(job.artifact) : null;
  if (!plain(current)) return { progress: false, rejected: 'There is no artifact to repair.' };
  const named = new Set((failure.findings || []).map(f => f.target?.capture).filter(Boolean));
  const images = (await loadCaptures(ctx.env, (job.captures || []).filter(c => named.has(c.id)))).filter(c => typeof c.data === 'string').slice(0, ANIMATION_ROLES.repair.maxImages);
  const system = ANIMATION_REPAIR_SYSTEM, tool = repairTool({ program: !!current.program || planNeedsProgram(job.plan) });
  const fits = content => { try { animationRequest(ctx.env ?? {}, 'repair', { system, tool, content }, ctx.tasks); return true; } catch (error) { if (error?.code === 'input_too_large') return false; throw error; } };
  const content = repairContent(job, failure, current, images, fits), { forwarded } = content;
  const { input } = await ctx.call('repair', { system, tool, content: [...content] });
  const reason = typeof input.reason === 'string' ? input.reason.slice(0, 300) : null;
  if (input.operation === 'none') return { progress: false, reason, forwarded };
  if (input.operation !== 'artifact' || !plain(input.artifact)) return { progress: false, rejected: 'The repair returned no artifact.', inputKeys: Object.keys(input), forwarded };
  const draft = withProgram(input);
  if (canonicalJson(draft) === canonicalJson(current)) return { progress: false, reason: 'The repair changed nothing.', forwarded };
  return { draft, progress: true, operation: 'artifact', reason, inputKeys: Object.keys(input), artifactKeys: Object.keys(input.artifact), forwarded };
}

// -> problems (one sentence each), [] when the real review and repair requests for this artifact fit their roles at worst-case
// image, trace and finding sizes. tasks: the job's task table. draft: the candidate as written, which is what a repair is sent
// (repairStage); without one, the artifact's own draft form.
export function fitProblems(env, artifact, job, tasks, draft = null) {
  const out = [], size = new TextEncoder().encode(JSON.stringify(reviewArtifactView(artifact, draft))).length + new TextEncoder().encode(artifact.program?.source ?? '').length;
  const tooBig = role => out.push(`this artifact (${size} bytes with its program) is too large for the ${role === 'review' ? 'independent review' : 'repair'} request: use fewer nodes, shorter labels or a shorter program`);
  // The captures this artifact's render really makes (captureManifest: their ids, views, labels, inputs, times, events and ticks, which the
  // request repeats as text), each with a trace filling the review's whole trace allowance: the worst case of the real request, not a stand-in.
  // A manifest the render would refuse leaves the old stand-in captures, at the image limit.
  const hash = 'h'.repeat(64);
  let entries;
  try { entries = captureManifest(artifact).entries; } catch { entries = []; }
  if (!entries.length) entries = Array.from({ length: ANIMATION_ROLES.review.maxImages }, (_, i) => ({ id: `v${i}`, view: { name: 'default' } }));
  const base = entries.map(e => ({ id: e.id, artifactHash: hash, data: 'AAAA', mediaType: 'image/png', view: e.view?.name ?? e.view, label: e.label, inputs: e.inputs, time: e.time, events: e.events, ...(e.leadTicks ? { leadTicks: e.leadTicks } : {}), ticks: e.ticks,
    trace: { inputs: e.inputs, time: e.time, events: e.events, ticks: e.ticks } }));
  const used = new TextEncoder().encode(JSON.stringify(base.map(c => ({ id: c.id, ...c.trace })))).length;
  const per = Math.max(0, Math.floor((ANIMATION_REVIEW_LIMITS.traceBytes - used) / base.length) - 16);
  const fake = n => base.slice(0, n);
  try {
    const captures = base.map(c => ({ ...c, trace: { ...c.trace, pad: 'x'.repeat(per) } }));
    const { content } = buildReviewContent({ request: job.prompt, plan: job.plan, artifact, artifactHash: hash, captures, evidence: job.evidence || [], coverage: { sampled: [], omitted: ['x'.repeat(ANIMATION_REVIEW_LIMITS.coverageChars)] }, draft });
    // With the one correction a malformed report may need: the largest review request this candidate can cause.
    animationRequest(env, 'review', { system: ANIMATION_REVIEW_SYSTEM, tool: REVIEW_TOOL, content: [...content, correctionBlock(CORRECTION_WORST)] }, tasks);
  } catch (error) { if (error?.code === 'input_too_large') tooBig('review'); else throw error; }
  try {
    const failure = { problems: Array(REPAIR_FORWARD.problems).fill('p'.repeat(REPAIR_FORWARD.text)), findings: Array(REPAIR_FORWARD.findings).fill({ category: 'spec', severity: 'major', target: { capture: 'v0', object: 'o'.repeat(64) }, message: 'm'.repeat(REPAIR_FORWARD.text) }) };
    // shortcut: identical, so one issue: the room reserved is 51b6560cf's (8 problems, one finding); a real repair sends every finding that
    // fits and names the rest (repairContent). Reserving 8 distinct findings would refuse drafts and plans that pass today; owner call.
    animationRequest(env, 'repair', { system: ANIMATION_REPAIR_SYSTEM, tool: repairTool({ program: true }), content: repairContent(job, failure, plain(draft) ? draft : draftOf(artifact), fake(ANIMATION_ROLES.repair.maxImages)) }, tasks);
  } catch (error) { if (error?.code === 'input_too_large') tooBig('repair'); else throw error; }
  return out;
}
