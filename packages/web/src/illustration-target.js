// A written Explanation's attached illustration. Add illustration is removed (EXP-13, owner 2026-11-08): nothing marks a card any more, but a card saved with a mark
// (illustration.pending.proposalId, written when the learner pressed it) still says which finished /image job is its picture, so a reload still attaches it (LearnPage attachIllustration).
// The caption an attached illustration carries (generate-image.js illustrationFrom): it is lesson text, so it counts toward the card's Depth budget (control-plane learn-primitives.js illustrationProblem).
export const ILLUSTRATION_CAPTION = 'Generated illustration, not a photograph or a measurement.';
// The Explanation waiting for this plan's picture, if any (LearnPage attachIllustration), pure so it is tested here.
export const pendingBlock = (blocks, proposalId) => (blocks || []).find(entry => entry?.type === 'explanation' && entry.illustration?.pending?.proposalId === proposalId) || null;
