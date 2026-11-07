// The written Explanation a learner pressed Add illustration on, held until the /image plan it leads to is made (ask.jsx imagePlan). The plan's id is then written on that card
// (canvasOps.markIllustration), so the card itself, which is saved with the board, says which finished job belongs to it: a reload, or another tab, still attaches the picture.
let target = null;
export const setIllustrationTarget = id => { target = typeof id === 'string' && id ? id : null; };
export const peekIllustrationTarget = () => target;
export const takeIllustrationTarget = () => { const held = target; target = null; return held; };
// The words /image opens with for an Explanation: what the card is about, asked for as one clean illustration with no lettering (a model draws its own text badly).
export const illustrationPrompt = block => {
  const topic = String(block?.title || '').trim();
  return `A clear, textbook-style illustration for an explanation titled "${topic}". Simple composition on a plain warm background, no text, labels or arrows.`.slice(0, 600);
};

// The two block changes the canvas makes (LearnPage markIllustration / attachIllustration), pure so they are tested here.
// A plan marks the Explanation; only an Explanation without a picture can be marked.
export const markedBlock = (block, proposalId) => (block?.type === 'explanation' && !block.illustration?.fileRef ? { ...block, illustration: { ...(block.illustration || {}), pending: { proposalId } } } : block);
// The Explanation waiting for this plan's picture, if any.
export const pendingBlock = (blocks, proposalId) => (blocks || []).find(entry => entry?.type === 'explanation' && entry.illustration?.pending?.proposalId === proposalId) || null;
