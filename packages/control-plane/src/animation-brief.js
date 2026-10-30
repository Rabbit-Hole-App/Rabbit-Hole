// /animation planner stage (AN-05; plan section 3). One animation_brief call turns the request, the enabled capability registry and
// the sources the server actually read into an animation-plan/1, checked by the shared contract (animation3d/contract.js
// validateAnimationPlan) against the phase the SERVER chose. Every capability the learner explicitly asked for that the phase does
// not enable gets the server's own limitation line before the plan is shown, so a downgrade is never silent; a plan that uses a
// capability the phase lacks is an invalid turn, never trimmed into something else.
import { ANIMATION_CAPABILITIES } from '../../web/src/animation3d/capabilities.js';
import { PLAN_SCHEMA, validateAnimationPlan } from '../../web/src/animation3d/contract.js';
import { ANIMATION_BRIEF_SYSTEM, PLAN_TOOL } from './agents/animation-brief.js';
import { AnimationPolicyError } from './animation-policy.js';
import { modelEvidence } from './explain-evidence.js';
import { plainPrompt } from '../../web/src/generation-review.js';

// The phase this server builds in. The browser cannot choose another: the validators accept only registry objects.
export const enabledCapabilities = () => ANIMATION_CAPABILITIES;
const issuesText = issues => issues.slice(0, 6).map(i => `${i.path || 'plan'}: ${i.message}`).join('; ');
const WORDS = { experience: 'experience', behavior: 'behavior', controlProfile: 'controls' };
const NAMES = { walkthrough: 'a walkthrough', assembly: 'an assembly', physics: 'real physics simulation', walk: 'walking controls', attached_models: 'attached models', image_reference: 'an image reference' };
const named = value => NAMES[value] || `"${value}"`;

// The server's own words for each explicitly requested capability the phase does not enable. -> [string]
export function unsupportedRequests(requested, plan, caps = enabledCapabilities()) {
  const out = [];
  const enabled = { experience: caps.experiences, behavior: caps.behaviors, controlProfile: caps.controlProfiles };
  for (const key of ['experience', 'behavior', 'controlProfile']) {
    const asked = requested?.[key];
    if (typeof asked === 'string' && !enabled[key].includes(asked)) out.push(`You asked for ${named(asked)}, which is not available yet; this plan uses ${plan[key]} ${WORDS[key]} instead.`);
  }
  for (const feature of Array.isArray(requested?.features) ? requested.features : []) {
    if (!caps.features.includes(feature)) out.push(`You asked for ${named(feature)}, which is not available yet; this plan works without it.`);
  }
  return [...new Set(out)];
}

const listOf = (value, n) => (Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()).map(v => v.replace(/\s+/g, ' ').trim()).slice(0, n) : []);

// The preparing stage. -> { plan } | { gap }
export async function prepareStage(job, ctx) {
  const caps = enabledCapabilities();
  const content = JSON.stringify({ request: job.prompt, refinement: job.refinement ?? null, previous: job.plan ?? null,
    context: job.context ? { refText: job.context.refText ?? null, refs: (job.context.refs || []).map(({ name, kind, status, note }) => ({ name, kind, status, ...(note ? { note } : {}) })) } : null,
    evidence: modelEvidence(job.evidence),
    capabilities: { phase: caps.phase, experiences: caps.experiences, behaviors: caps.behaviors, controlProfiles: caps.controlProfiles, features: caps.features, limits: { parameters: caps.limits.parameters, actions: caps.limits.actions, nodes: caps.limits.nodes } } });
  const { input } = await ctx.call('brief', { system: ANIMATION_BRIEF_SYSTEM, tool: PLAN_TOOL, content });
  if (input.gap?.reason) return { gap: { capability: 'animation', needs: ['other'], source: 'brief', reason: String(input.gap.reason).slice(0, 300), message: 'This animation needs something that is not available yet, so edit the request.' } };
  const draft = { schema: PLAN_SCHEMA, title: input.title, description: input.description, experience: input.experience, reason: input.reason, behavior: input.behavior,
    controlProfile: input.controlProfile, sourceRefs: [], parameters: Array.isArray(input.parameters) ? input.parameters : [], interactions: listOf(input.interactions, 8),
    assumptions: listOf(input.assumptions, 8), limitations: [], requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [],
    ...(typeof input.learningGoal === 'string' && input.learningGoal.trim() ? { learningGoal: input.learningGoal.trim() } : {}), ...(input.duration != null ? { duration: input.duration } : {}) };
  // The server's limitations first, then the planner's, within the contract's eight.
  draft.limitations = [...unsupportedRequests(input.requested, draft, caps), ...listOf(input.limitations, 8)].slice(0, 8);
  const checked = validateAnimationPlan(draft, caps);
  if (!checked.ok) throw new AnimationPolicyError('invalid_turn', `The plan was not buildable: ${issuesText(checked.issues)}.`, { issues: checked.issues });
  return { plan: checked.value };
}

// The executed plan at Generate: the learner's reviewed title, description, assumptions and experience over the prepared plan, checked
// again against the enabled phase. Throws (with the reason) when the edited plan cannot be built; nothing is consumed then.
export function approvedPlan(plan, proposal) {
  const reviewed = typeof proposal.prompt === 'string';
  const edited = { ...plan, title: proposal.title ?? plan.title, description: reviewed ? plainPrompt(proposal.prompt, proposal.references || []).trim() : proposal.description ?? plan.description,
    ...(Array.isArray(proposal.assumptions) ? { assumptions: proposal.assumptions.slice(0, 8) } : {}), experience: proposal.settings?.experience ?? plan.experience };
  const checked = validateAnimationPlan(edited, enabledCapabilities());
  if (!checked.ok) {
    const off = checked.issues.find(i => i.code === 'unsupported_capability');
    throw new Error(off ? `${off.message[0].toUpperCase()}${off.message.slice(1)}. Choose another option.` : `This plan cannot be generated as edited (${issuesText(checked.issues)}).`);
  }
  return checked.value;
}
