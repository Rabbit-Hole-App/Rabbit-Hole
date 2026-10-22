// /explain v2 bounded repair (EXP-T19; plan v2.1 sections 1.4, 3.4 and 3.5). The repair stage of the ExplainJobs pipeline:
// one explain_repair call per correction round, inside the job's single ceiling (EXPLAIN_LIMITS.correctionRounds across all
// gates, enforced by explain-job.js). What a round may change depends on what failed:
// - a spec the trusted checks refused (validate problems), or a wrong claim the review found (category source): an explicit
//   corrected spec, which goes back through every check;
// - a rendered-card spec finding (layout): repairWritable hints only, through Lane A's applyHintRepair, which refuses any
//   other change and any value out of range.
// Component and renderer defects are never sent to repair (explain-job.js stops the job) and go to a deduplicated backlog.
import { applyHintRepair } from '../../web/src/visual-components/compile.js';
import { COMPOSITION, catalogue, componentFor } from '../../web/src/visual-components/registry.js';
import { SPEC_LIMITS } from './explain-author.js';
import { canonicalJson } from '../../web/src/explain-contract.js';
import { EXPLAIN_REPAIR_SYSTEM, REPAIR_TOOL } from './agents/explain-repair.js';
import { EXPLAIN_LIMITS, EXPLAIN_ROLES } from './explain-policy.js';
import { sha256Hex } from './learn-grade-jev.js';

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);

// The operations the last failure permits.
export function allowedRepairs(failure) {
  if (failure?.problems?.length) return ['spec'];
  const serious = (failure?.findings || []).filter(f => f.severity !== 'minor');
  if (!serious.length || serious.some(f => !f.specRepairable || !['spec', 'source'].includes(f.category))) return [];
  return serious.some(f => f.category === 'source') ? ['hints', 'spec'] : ['hints'];
}

// Per instance, the hints a repair may change and their declared limits (from the registry, never from the spec).
export function repairableHints(spec) {
  const out = {};
  for (const item of spec?.components || []) {
    let definition;
    try { definition = componentFor(item.component, item.version); } catch { continue; }
    if (definition.repairWritable.length) out[item.id] = { component: item.component, hints: Object.fromEntries(definition.repairWritable.map(name => [name, definition.hints[name]])), current: item.hints || {} };
  }
  return out;
}

// The repair stage. -> { spec, progress: true, operation } | { progress: false, rejected?, reason }.
export async function repairStage(job, ctx) {
  const failure = job.findings.at(-1) || {};
  const allowed = allowedRepairs(failure);
  if (!allowed.length) return { progress: false, rejected: 'This failure cannot be repaired by changing the spec.' };
  // Image-reference repairs: the captures the findings name, at most the role's image limit.
  const named = new Set((failure.findings || []).map(f => f.target?.capture ?? f.target?.state).filter(Boolean));
  const images = (job.captures || []).filter(capture => named.has(capture.id) && typeof capture.data === 'string').slice(0, EXPLAIN_ROLES.repair.maxImages);
  const content = [{ type: 'text', text: JSON.stringify({ request: job.prompt, spec: job.spec, problems: failure.problems || [], findings: (failure.findings || []).map(({ category, severity, target, message }) => ({ category, severity, target, message })),
    repairable: repairableHints(job.spec), allowed, roundsLeft: EXPLAIN_LIMITS.correctionRounds - job.round,
    // A spec correction needs the components' params, limits and anchors (a real round 2 without them named a non-anchor).
    ...(allowed.includes('spec') ? { catalogue: catalogue(), composition: COMPOSITION, limits: SPEC_LIMITS } : {}) }) },
  ...images.flatMap(capture => [{ type: 'text', text: `capture ${capture.id}` }, { type: 'image', source: { type: 'base64', media_type: capture.mediaType || 'image/png', data: capture.data } }])];
  const { input } = await ctx.call('repair', { system: EXPLAIN_REPAIR_SYSTEM, tool: REPAIR_TOOL, content });
  const reason = typeof input.reason === 'string' ? input.reason.slice(0, 300) : null;
  if (input.operation === 'none') return { progress: false, reason };
  if (!allowed.includes(input.operation)) return { progress: false, rejected: `A ${input.operation} repair is not allowed for this failure.` };
  let spec;
  if (input.operation === 'hints') {
    if (!Array.isArray(input.patches) || !input.patches.length) return { progress: false, rejected: 'The repair named no hint to change.' };
    try { spec = applyHintRepair(job.spec, input.patches); } catch (error) { return { progress: false, rejected: `The repair was refused: ${String(error.message).slice(0, 200)}.` }; }
    // Setting a hint to the value it already resolves to (its declared default included) changes nothing drawn.
    const hints = repairableHints(job.spec);
    if (input.patches.every(({ component, hint, value }) => (hints[component]?.current[hint] ?? hints[component]?.hints[hint]?.default) === value)) return { progress: false, reason: 'The repair changed nothing.' };
  } else {
    if (!plain(input.spec)) return { progress: false, rejected: 'The repair returned no spec.' };
    spec = input.spec;
  }
  if (canonicalJson(spec) === canonicalJson(job.spec)) return { progress: false, reason: 'The repair changed nothing.' };
  return { spec, progress: true, operation: input.operation, reason };
}

// Component and renderer defects found by review: deduplicated keys for the development backlog (T11). Only the component,
// its version, the category and a hash of the finding: never the learner's words or the card's text.
export async function defectKeys(spec, findings) {
  const versions = Object.fromEntries((spec?.components || []).map(item => [item.id, `${item.component}@${item.version}`]));
  const keys = [];
  for (const f of findings || []) {
    if (!['component', 'renderer'].includes(f.category)) continue;
    const component = versions[f.target?.component] || versions[String(f.target?.object || '').split('.')[0]] || 'unknown';
    keys.push({ key: `${f.category}:${component}:${(await sha256Hex(`${f.category}|${component}|${f.message}`)).slice(0, 16)}`, category: f.category, component });
  }
  return keys;
}
