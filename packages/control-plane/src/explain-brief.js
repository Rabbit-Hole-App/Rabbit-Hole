// /explain v2 sourced brief and capability adapter (EXP-T16; plan v2.1 sections 1.1, 1.4, 3.3). The preparing stage of the
// ExplainJobs pipeline: one explain_brief call, preflighted against the registry and compiler, then the server's decision
// whether the learner reviews it (briefDecision; the model cannot override it). A reviewed brief becomes the common signed
// proposal (generation-proposal.js, command explain) on the learner's chat thread, under MOT-22's one state.
import { catalogue } from '../../web/src/visual-components/registry.js';
import { capabilityGap, compilerSupport } from './explain-author.js';
import { EXPLAIN_BRIEF_SYSTEM, briefTool } from './agents/explain-brief.js';
import { ExplainPolicyError } from './explain-policy.js';
import { proposalUsage } from './generation-proposal.js';

const text = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value, max, n = 8) => (Array.isArray(value) ? value.map(v => text(v, max)).filter(Boolean).slice(0, n) : []);
const sentences = value => value.match(/[^.!?]+[.!?]+["')\]]*(?=\s|$)/g) || [];

// Brief thresholds (Worker var EXPLAIN_BRIEF_THRESHOLDS, JSON {"components": n, "credits": n}). Missing or invalid: every
// request is reviewed (plan 1.4: missing policy thresholds mean review).
export function briefThresholds(env) {
  try {
    const t = JSON.parse(env.EXPLAIN_BRIEF_THRESHOLDS || 'null');
    return Number.isSafeInteger(t?.components) && t.components > 0 && Number.isSafeInteger(t?.credits) && t.credits > 0 ? { components: t.components, credits: t.credits } : null;
  } catch { return null; }
}
// Before any call: whether the request prepares a brief at all. A simple request within configured thresholds goes straight
// to authoring (one author call, one review).
export const needsPreparation = (env, requestClass) => requestClass === 'researched' || !briefThresholds(env);

// The server's decision (CapabilityDecision): which triggers fired. Any one means the learner reviews the brief first.
export function briefDecision(env, brief, { evidence = [], source = 'explicit' } = {}) {
  const thresholds = briefThresholds(env), reasons = [];
  if (!thresholds) reasons.push('threshold_missing');
  if (evidence.some(record => ['web', 'paper', 'repository'].includes(record.kind))) reasons.push('research');
  if (brief.ambiguous) reasons.push('ambiguous_subject');
  if (brief.assumptions.length) reasons.push('assumptions');
  if (brief.expanded) reasons.push('expanded_meaning');
  if (brief.presentation !== 'static') reasons.push('interactive');
  if (thresholds && brief.components.length > thresholds.components) reasons.push('density');
  const credits = proposalUsage(env, 'explain').reserve_credits;
  if (thresholds && credits > thresholds.credits) reasons.push('cost');
  return { capability: 'explain', source, uncertain: !!brief.ambiguous, missingInputs: [], requiresBrief: reasons.length > 0, briefReasons: reasons,
    permittedActions: reasons.length ? ['brief', 'clarify'] : ['generate'] };
}

// The preparing stage. -> { brief, decision } | { gap }.
export async function prepareStage(job, ctx) {
  const cat = catalogue(), names = cat.map(entry => entry.name), supported = compilerSupport();
  const content = JSON.stringify({ request: job.prompt, context: job.context ?? null, refinement: job.refinement ?? null, previous: job.brief ?? null,
    evidence: (job.evidence || []).map(({ id, kind, location, excerpt, limitations }) => ({ id, kind, location, excerpt, limitations })),
    catalogue: cat.map(({ name, description }) => ({ name, description })), supported });
  const { input } = await ctx.call('brief', { system: EXPLAIN_BRIEF_SYSTEM, tool: briefTool(names), content });
  if (input.gap?.needs?.length) return { gap: capabilityGap(input.gap.needs, input.gap.reason, 'brief') };
  const summary = text(input.summary, 1500), count = sentences(summary).length;
  if (!text(input.title, 120) || count < 1 || count > 10) throw new ExplainPolicyError('invalid_turn', 'The brief needs a title and 1 to 10 plain sentences.');
  if (!['static', 'steps', 'time', 'experiment'].includes(input.presentation)) throw new ExplainPolicyError('invalid_turn', 'The brief named no presentation.');
  // Preflight: never promise what cannot be drawn.
  const components = list(input.components, 64, 40);
  const unknown = components.find(name => !names.includes(name));
  if (unknown) return { gap: capabilityGap(['component'], `The brief planned "${unknown}", which is not available.`, 'brief') };
  const needs = input.presentation === 'experiment' ? 'experiment' : input.presentation;
  if (needs !== 'static' && supported[needs] === false) return { gap: capabilityGap([needs], null, 'brief') };
  const known = new Set((job.evidence || []).map(record => record.id));
  const brief = { version: 1, title: text(input.title, 120), summary, request: job.prompt, assumptions: list(input.assumptions, 300), presentation: input.presentation,
    components, evidenceIds: list(input.evidence_ids, 64, 16).filter(id => known.has(id)), limitations: list(input.limitations, 300),
    ambiguous: input.ambiguous === true, expanded: input.expanded === true };
  return { brief, decision: briefDecision(ctx.env, brief, { evidence: job.evidence || [], source: job.source }) };
}
