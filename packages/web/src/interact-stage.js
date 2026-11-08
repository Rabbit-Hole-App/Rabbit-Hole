// /interact in Chat and on the pending card (docs/features/interact.md INT-03-C04, C10): the review heading, how a signed proposal says it
// belongs to the new flow, and the public words for the design stages. Dependency free on purpose (explain-client.js imports it).
// The server lane (branch interact/i1-design) owns the real stage names and proposal fields; this file is the single swap point:
// rename a key in INTERACT_STAGES or the three field reads in interactIdentity and nothing else in the web app changes.

export const INTERACT_REVIEW_HEADING = 'Review scene plan';

// Public stage copy by the server's stage. The real stage always stays on the card as data-explain-pending (diagnostics); only the
// words are mapped. awaiting_approval reads Ready to review for a new-flow job only: the older flow keeps its own sentence.
// ponytail: stage keys assumed from the spec's role names (author, review, revise, checks) until interact/i1-design fixes them.
export const INTERACT_STAGES = Object.freeze({
  designing: 'Designing scene',
  design_review: 'Reviewing scene design',
  design_revise: 'Updating scene plan',
  design_check: 'Checking scene plan',
  awaiting_approval: 'Ready to review',
});
const DESIGN_ONLY = new Set(['designing', 'design_review', 'design_revise', 'design_check']);

// A job is a new-flow job when it says so, or sits in a design stage that only the new flow has.
export const isInteractJob = job => !!job && (job.flow === 'interact' || DESIGN_ONLY.has(job.stage));
// -> the public words for this job's stage, or null (the older flow, or a build stage that keeps its existing words).
export const interactStageText = job => (isInteractJob(job) ? INTERACT_STAGES[job.stage] ?? null : null);
// Diagnostics: the real server stage, kept apart from the words shown.
export const interactDiagnostics = job => (isInteractJob(job) ? { stage: job.stage ?? null, shown: interactStageText(job) } : null);

// A signed proposal of the new flow carries scene_plan_version, scene_plan_hash and profile_hash as input. -> null for any other proposal.
export function interactIdentity(proposal) {
  const input = proposal?.command === 'explain' ? proposal.input : null;
  if (!input || !Number.isInteger(input.scene_plan_version)) return null;
  return { version: input.scene_plan_version, hash: typeof input.scene_plan_hash === 'string' ? input.scene_plan_hash : null, profileHash: typeof input.profile_hash === 'string' ? input.profile_hash : null };
}
export const isInteractProposal = proposal => !!interactIdentity(proposal);
// The resolvable plan the proposal carries (or the authenticated job route returned for it). One line to swap when the server decides.
export const planOfProposal = proposal => proposal?.input?.scene_plan ?? null;
