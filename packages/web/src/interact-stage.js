// /interact in Chat and on the pending card (docs/features/interact.md INT-03-C04, C10): the review heading, how a signed proposal says it
// belongs to the new flow, and the public words for the design stages. Dependency free on purpose (explain-client.js imports it).
// The server (control-plane interact-design.js DESIGN_STAGES, explain-job.js planProposalFields and scenePlanView) owns the stage names and the proposal fields;
// this file is the single place the web app reads them.

export const INTERACT_REVIEW_HEADING = 'Review scene plan';

// Public stage copy by the server's stage. The real stage always stays on the card as data-explain-pending (diagnostics); only the
// words are mapped. awaiting_approval reads Ready to review for a new-flow job only: the older flow keeps its own sentence.
// The server sends the same words as job.designState; the stage keys are the server's own (interact-design.js DESIGN_STAGES).
export const INTERACT_STAGES = Object.freeze({
  design_authoring: 'Designing scene',
  design_reviewing: 'Reviewing scene design',
  design_revising: 'Updating scene plan',
  design_verifying: 'Checking scene plan',
  awaiting_approval: 'Ready to review',
});
const DESIGN_ONLY = new Set(['design_authoring', 'design_reviewing', 'design_revising', 'design_verifying']);

// A job is a new-flow job when it carries the server's flow ({ version }), or sits in a design stage that only the new flow has.
export const isInteractJob = job => !!job && (!!job.flow || DESIGN_ONLY.has(job.stage));
// -> the public words for this job's stage, or null (the older flow, or a build stage that keeps its existing words).
export const interactStageText = job => (isInteractJob(job) ? INTERACT_STAGES[job.stage] ?? null : null);
// Diagnostics: the real server stage, kept apart from the words shown.
export const interactDiagnostics = job => (isInteractJob(job) ? { stage: job.stage ?? null, shown: interactStageText(job) } : null);

// A signed proposal of the new flow carries scene_plan_version, scene_plan_hash, profile_hash and plan_revision as input (explain-job.js planProposalFields).
// -> null for any other proposal.
export function interactIdentity(proposal) {
  const input = proposal?.command === 'explain' ? proposal.input : null;
  if (!input || !Number.isInteger(input.scene_plan_version)) return null;
  return { version: input.scene_plan_version, hash: typeof input.scene_plan_hash === 'string' ? input.scene_plan_hash : null, profileHash: typeof input.profile_hash === 'string' ? input.profile_hash : null,
    revision: Number.isInteger(input.plan_revision) ? input.plan_revision : null };
}
export const isInteractProposal = proposal => !!interactIdentity(proposal);
// The plan a proposal reviews. The signed proposal does not carry it (it names it by hash): the authenticated job route returns it as scenePlan
// { version, hash, revision, plan, ... } (explain-job.js scenePlanView). Only the plan at the proposal's own hash and revision counts; any other is not this proposal's.
export const planOfProposal = (proposal, scenePlan = null) => {
  const identity = interactIdentity(proposal);
  return identity && scenePlan?.plan && scenePlan.hash === identity.hash && scenePlan.revision === identity.revision ? scenePlan.plan : null;
};
