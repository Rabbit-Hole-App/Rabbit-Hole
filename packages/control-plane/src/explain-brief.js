// /explain v2 sourced brief and capability adapter (EXP-T16; plan v2.1 sections 1.1, 1.4, 3.3). The preparing stage of the
// ExplainJobs pipeline: one explain_brief call, preflighted against what can be drawn, then the server's decision (briefDecision;
// the model cannot override it). Every new explanation request is reviewed (owner, 2026-10-29: this replaces the earlier rule that
// simple requests within EXPLAIN_BRIEF_THRESHOLDS go straight to authoring). The brief becomes the common signed proposal
// (generation-proposal.js, command explain) on the learner's chat thread, under MOT-22's one state.
import { catalogue } from '../../web/src/visual-components/registry.js';
import { capabilityGap, compilerSupport } from './explain-author.js';
import { EXPLAIN_BRIEF_SYSTEM, EXPLAIN_PROGRAM_BRIEF_SYSTEM, briefTool } from './agents/explain-brief.js';
import { programContext } from './agents/explain-author.js';
import { PROGRAM_CAPABILITIES, PROGRAM_LIMITS, programEnabled } from './explain-program.js';
import { ExplainPolicyError } from './explain-policy.js';
import { proposalUsage } from './generation-proposal.js';

const text = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value, max, n = 8) => (Array.isArray(value) ? value.map(v => text(v, max)).filter(Boolean).slice(0, n) : []);
const sentences = value => value.match(/[^.!?]+[.!?]+["')\]]*(?=\s|$)/g) || [];

// Brief thresholds (Worker var EXPLAIN_BRIEF_THRESHOLDS, JSON {"components": n, "credits": n}). They no longer decide whether a new
// request is reviewed (every one is); they only name density and cost among the reasons, and keep a same-card Edit on its direct path.
export function briefThresholds(env) {
  try {
    const t = JSON.parse(env.EXPLAIN_BRIEF_THRESHOLDS || 'null');
    return Number.isSafeInteger(t?.components) && t.components > 0 && Number.isSafeInteger(t?.credits) && t.credits > 0 ? { components: t.components, credits: t.credits } : null;
  } catch { return null; }
}
// Before any call: whether the request prepares a brief. Every new explanation does, whatever request class the client sent. Only a
// same-card Edit (bound by the server to an accepted card revision, applied by the learner through Apply changes) keeps its earlier
// path: direct within configured thresholds, a brief without them.
export const needsPreparation = (env, requestClass) => requestClass !== 'edit' || !briefThresholds(env);

// The server's decision (CapabilityDecision). A brief is always reviewed; the reasons say what else makes it worth reading.
export function briefDecision(env, brief, { evidence = [], source = 'explicit' } = {}) {
  const thresholds = briefThresholds(env), reasons = ['review_always'];
  if (!thresholds) reasons.push('threshold_missing');
  if (evidence.some(record => ['web', 'paper', 'repository'].includes(record.kind))) reasons.push('research');
  if (brief.ambiguous) reasons.push('ambiguous_subject');
  if (brief.assumptions.length) reasons.push('assumptions');
  if (brief.expanded) reasons.push('expanded_meaning');
  if (brief.presentation !== 'static') reasons.push('interactive');
  if (thresholds && brief.components.length > thresholds.components) reasons.push('density');
  const credits = proposalUsage(env, 'explain').reserve_credits;
  if (thresholds && credits > thresholds.credits) reasons.push('cost');
  return { capability: 'explain', source, uncertain: !!brief.ambiguous, missingInputs: [], requiresBrief: true, briefReasons: reasons, permittedActions: ['brief', 'clarify'] };
}

// The preparing stage. -> { brief, decision } | { gap }. With the program route on (EXPLAIN_PROGRAM_ENABLED), the brief is planned
// against the program runtime's capabilities and limits, with no component list to check; off, against the catalogue as before.
export async function prepareStage(job, ctx) {
  const program = programEnabled(ctx.env || {});
  const cat = program ? [] : catalogue(), names = cat.map(entry => entry.name), supported = program ? null : compilerSupport();
  const content = JSON.stringify({ request: job.prompt, context: job.context ?? null, refinement: job.refinement ?? null, previous: job.brief ?? null,
    evidence: (job.evidence || []).map(({ id, kind, location, excerpt, limitations }) => ({ id, kind, location, excerpt, limitations })),
    ...(program ? { runtime: { capabilities: PROGRAM_CAPABILITIES, limits: programContext(PROGRAM_LIMITS, PROGRAM_CAPABILITIES).limits } } : { catalogue: cat.map(({ name, description }) => ({ name, description })), supported }) });
  const { input } = await ctx.call('brief', { system: program ? EXPLAIN_PROGRAM_BRIEF_SYSTEM : EXPLAIN_BRIEF_SYSTEM, tool: briefTool(program ? null : names), content });
  if (input.gap?.needs?.length) return { gap: capabilityGap(input.gap.needs, input.gap.reason, 'brief') };
  const summary = text(input.summary, 1500), count = sentences(summary).length;
  if (!text(input.title, 120) || count < 1 || count > 10) throw new ExplainPolicyError('invalid_turn', 'The brief needs a title and 1 to 10 plain sentences.');
  if (!['static', 'steps', 'time', 'experiment'].includes(input.presentation)) throw new ExplainPolicyError('invalid_turn', 'The brief named no presentation.');
  // Preflight: never promise what cannot be drawn. A program plans no components (the runtime draws every presentation).
  const components = program ? [] : list(input.components, 64, 40);
  const unknown = components.find(name => !names.includes(name));
  if (unknown) return { gap: capabilityGap(['component'], `The brief planned "${unknown}", which is not available.`, 'brief') };
  if (!program && input.presentation !== 'static' && supported[input.presentation] === false) return { gap: capabilityGap([input.presentation], null, 'brief') };
  const known = new Set((job.evidence || []).map(record => record.id));
  const brief = { version: 1, title: text(input.title, 120), summary, request: job.prompt, assumptions: list(input.assumptions, 300), presentation: input.presentation,
    components, evidenceIds: list(input.evidence_ids, 64, 16).filter(id => known.has(id)), limitations: list(input.limitations, 300),
    ambiguous: input.ambiguous === true, expanded: input.expanded === true };
  return { brief, decision: briefDecision(ctx.env, brief, { evidence: job.evidence || [], source: job.source }) };
}
