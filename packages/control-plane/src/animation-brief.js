// /animation planner stage (AN-05; plan section 3). One animation_brief call turns the request, the enabled capability registry and
// the sources the server actually read into an animation-plan/1, checked by the shared contract (animation3d/contract.js
// validateAnimationPlan) against the phase the SERVER chose. Every capability the learner explicitly asked for that the phase does
// not enable gets the server's own limitation line before the plan is shown, so a downgrade is never silent; a plan that uses a
// capability the phase lacks is an invalid turn, never trimmed into something else.
import { ANIMATION_CAPABILITIES, ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { PLAN_SCHEMA, validateAnimationPlan } from '../../web/src/animation3d/contract.js';
import { ANIMATION_BRIEF_SYSTEM, PLAN_TOOL } from './agents/animation-brief.js';
import { AnimationPolicyError } from './animation-policy.js';
import { modelEvidence } from './explain-evidence.js';
import { plainPrompt } from '../../web/src/generation-review.js';

// The phase this server builds in. The browser cannot choose another: the validators accept only registry objects.
export const enabledCapabilities = () => ANIMATION_CAPABILITIES;
// The features a browser declared (capabilities.js ANIMATION_CLIENT_FEATURES), only those this server knows; none means an older build.
export const clientFeatures = value => (Array.isArray(value) ? ANIMATION_CLIENT_FEATURES.filter(f => value.includes(f)) : []);
// How a curved surface is drawn, said the same way to the planner (input data), the author, the repair and the review (owner
// 2026-11-02: tube wireframes for MVP1). aj_086fd46: the plan promised a bowl surface no shape could draw, the author's filled discs hid
// the moving parts and the repair's curves were 1 px lines; each stage judged a different representation.
export const SURFACES = Object.freeze({
  tubes: 'No shape draws a filled curved surface. A curved surface (a bowl, a hill, a saddle) is drawn as a wireframe of tube curves (curves with a radius): a few level lines and cross-sections placed exactly on its equation, so the parts that move on or inside it stay visible. Describe it to the learner as a wireframe.',
  legacy: 'No shape draws a filled curved surface, and the browser that asked for this scene cannot draw tube curves (a curve is a 1 px line there): do not plan or draw a scene that depends on a curved surface; say so in limitations.',
});
export const surfaceCapability = job => ({ surfaces: clientFeatures(job?.features).includes('curve_radius') ? SURFACES.tubes : SURFACES.legacy });
const issuesText = issues => issues.slice(0, 6).map(i => `${i.path || 'plan'}: ${i.message}`).join('; ');
// What the plan uses instead, in the learner's words (no enum on the review card, owner 2026-10-31).
const INSTEAD = {
  experience: { inspect: 'makes a scene to look around', watch: 'makes a looping scene to watch', experiment: 'makes an experiment', game: 'makes a mini-game' },
  behavior: { prescribed: 'uses set motion', analytical: 'uses motion computed from formulas', rules: 'uses step-by-step rules' },
  controlProfile: { inspect: 'uses look-around controls', manipulate: 'uses controls you can change' },
};
const NAMES = { walkthrough: 'a walkthrough', assembly: 'an assembly', physics: 'real physics simulation', walk: 'walking controls', attached_models: 'attached models', image_reference: 'an image reference' };
const named = value => NAMES[value] || `"${value}"`;
// How each of the server's own limitation lines begins, so the review card keeps them in view (animation-job.js planScene).
export const ASKED_FOR = 'You asked for ';

// The server's own words for each explicitly requested capability the phase does not enable. -> [string]
export function unsupportedRequests(requested, plan, caps = enabledCapabilities()) {
  const out = [];
  const enabled = { experience: caps.experiences, behavior: caps.behaviors, controlProfile: caps.controlProfiles };
  for (const key of ['experience', 'behavior', 'controlProfile']) {
    const asked = requested?.[key];
    if (typeof asked === 'string' && !enabled[key].includes(asked)) out.push(`${ASKED_FOR}${named(asked)}, which is not available yet; this plan ${INSTEAD[key][plan[key]] ?? `uses ${plan[key]}`} instead.`);
  }
  for (const feature of Array.isArray(requested?.features) ? requested.features : []) {
    if (!caps.features.includes(feature)) out.push(`${ASKED_FOR}${named(feature)}, which is not available yet; this plan works without it.`);
  }
  return [...new Set(out)];
}

const listOf = (value, n) => (Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()).map(v => v.replace(/\s+/g, ' ').trim()).slice(0, n) : []);

// The preparing stage. -> { plan, answers } | { gap, answers }; answers: each planner reply as given, with the contract's issues for
// a refused one (diagnostics only, owner 2026-11-02 planner evaluation: the unedited answer and any correction); a stage that fails
// throws with the same answers attached.
export async function prepareStage(job, ctx) {
  const caps = enabledCapabilities();
  const content = JSON.stringify({ request: job.prompt, refinement: job.refinement ?? null, previous: job.plan ?? null,
    context: job.context ? { refText: job.context.refText ?? null, refs: (job.context.refs || []).map(({ name, kind, status, note }) => ({ name, kind, status, ...(note ? { note } : {}) })) } : null,
    evidence: modelEvidence(job.evidence),
    capabilities: { phase: caps.phase, experiences: caps.experiences, behaviors: caps.behaviors, controlProfiles: caps.controlProfiles, features: caps.features, limits: { parameters: caps.limits.parameters, actions: caps.limits.actions, nodes: caps.limits.nodes },
      geometry: caps.geometry, ...surfaceCapability(job) } }); // owner 2026-11-02: the capability description, not the frozen prompt or schema
  const system = ANIMATION_BRIEF_SYSTEM;
  const answers = [];
  const answer = reply => { const out = planFrom(reply, caps); answers.push({ input: reply?.input ?? null, issues: (out.issues || []).map(i => `${i.path || 'plan'}: ${i.message} (${i.code})`) }); return out; };
  const first = answer(await ctx.call('brief', { system, tool: PLAN_TOOL, content }));
  if (first.gap || first.plan) return { ...first, answers };
  // One bounded correction (ANIMATION_LIMITS.planCorrections, counted in the plan call bound and the worst case): the planner gets its
  // own plan back with the contract's issues and returns the whole plan again. Its answer is checked like the first; never rewritten here.
  const issues = first.issues.map(i => `${i.path || 'plan'}: ${i.message} (${i.code})`);
  // A correction call that itself fails keeps its classification and carries the refused first answer with it (no further retry).
  const corrected = await ctx.call('brief', { system, tool: PLAN_TOOL,
    content: JSON.stringify({ ...JSON.parse(content), correction: { previousPlan: first.input, issues, instruction: 'Your plan was refused by these checks. Return the whole plan again with them fixed; keep everything else the same.' } }) })
    .catch(error => { if (error && typeof error === 'object') error.answers = answers; throw error; });
  const again = answer(corrected);
  if (again.gap || again.plan) return { ...again, answers };
  throw new AnimationPolicyError('invalid_turn', `The plan was not buildable after one correction: ${issuesText(again.issues)}.`, { issues: again.issues, answers });
}

// One planner reply as a checked plan. -> { plan } | { gap } | { issues, input }
function planFrom({ input }, caps) {
  if (input.gap?.reason) return { gap: { capability: 'animation', needs: ['other'], source: 'brief', reason: String(input.gap.reason).slice(0, 300), message: 'This animation needs something that is not available yet, so edit the request.' } };
  const draft = { schema: PLAN_SCHEMA, title: input.title, description: input.description, experience: input.experience, reason: input.reason, behavior: input.behavior,
    controlProfile: input.controlProfile, sourceRefs: [], parameters: Array.isArray(input.parameters) ? input.parameters : [], interactions: listOf(input.interactions, 8),
    assumptions: listOf(input.assumptions, 8), limitations: [], requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [],
    ...(typeof input.learningGoal === 'string' && input.learningGoal.trim() ? { learningGoal: input.learningGoal.trim() } : {}), ...(input.duration != null ? { duration: input.duration } : {}) };
  // The server's limitations first, then the planner's, within the contract's eight.
  draft.limitations = [...unsupportedRequests(input.requested, draft, caps), ...listOf(input.limitations, 8)].slice(0, 8);
  const checked = validateAnimationPlan(draft, caps);
  return checked.ok ? { plan: checked.value } : { issues: checked.issues, input };
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
