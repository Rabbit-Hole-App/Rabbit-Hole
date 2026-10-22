// UI-15 / MOT-20: the chat side of a generation proposal (control-plane generation-proposal.js). A proposal arrives in an answer's
// meta (answer_meta live, the saved meta on reload) and GenerationProposalCard draws it under that answer. Pure helpers here:
// which version is live, what a chat turn sends so the server can propose (and revise the live one), and the card Generate adds.
import { motionContext } from './learn-slash.js';

const proposalOf = m => (m?.role === 'assistant' && m.meta?.proposal?.proposal_id ? m.meta.proposal : null);
// Each proposal's newest version in the conversation: a refinement in chat is a later message with the same id.
const newest = msgs => msgs.reduce((map, m) => { const p = proposalOf(m); if (p && !(map.get(p.proposal_id) >= p.version)) map.set(p.proposal_id, p.version); return map; }, new Map());
// Live: the newest version of its proposal, not generated yet (made: its card is on the canvas) and not expired. Earlier
// versions stay in the conversation as history, inactive.
export function proposalActive(p, msgs, made = () => false, now = Date.now()) {
  return !!p && newest(msgs).get(p.proposal_id) === p.version && !made(p.proposal_id) && p.expires_at * 1000 > now;
}
// The live proposal a chat turn may revise: the last one in the conversation that is still live.
export function currentProposal(msgs, made = () => false, now = Date.now()) {
  for (let i = msgs.length - 1; i >= 0; i--) { const p = proposalOf(msgs[i]); if (p && proposalActive(p, msgs, made, now)) return p; }
  return null;
}
// The chat turn's generation field: what a Motion proposal would be about (the canvas concept and the selected card, with its
// text as sent) and the live proposal it may revise. Null where this build offers no Motion.
export function generationField({ offered, concept = null, target = null, current = null }) {
  if (!offered) return null;
  const context = motionContext(target);
  return { motion: { concept: String(concept || '').slice(0, 100) || null, ...(context ? { context } : {}) }, ...(current ? { current } : {}) };
}
// Generate: the existing Motion video card, already confirmed, carrying the exact approved proposal (its request, concept and
// card are the proposal's own input). The card makes its request id when it starts (one per press).
export const proposalBlock = p => ({
  type: 'video', mode: 'generate', title: p.title.slice(0, 120), src: '', caption: '', status: 'idle', confirmedStart: true,
  operation: { op: 'motion_request', request: p.input.request, location: { concept: p.input.concept ?? null }, ...(p.input.context ? { context: p.input.context } : {}), proposal: p },
});
// The card a proposal already made, so a second press (or a reload) finds it instead of adding another.
export const madeFrom = proposalId => block => block?.operation?.proposal?.proposal_id === proposalId;
