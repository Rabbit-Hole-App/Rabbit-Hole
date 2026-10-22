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
// Generate: each proposed capability's adapter (MOT-20b) builds the card its handler already starts, confirmed, carrying the exact
// approved proposal; nothing else differs per capability. Motion: the existing video card (its request, concept and selected card
// are the proposal's own input), which makes its request id when it starts (one per press).
const ADAPTERS = {
  motion: p => ({
    type: 'video', mode: 'generate', title: p.title.slice(0, 120), src: '', caption: '', status: 'idle', confirmedStart: true,
    operation: { op: 'motion_request', request: p.input.request, location: { concept: p.input.concept ?? null }, ...(p.input.context ? { context: p.input.context } : {}), proposal: p },
  }),
};
// -> the card to add, or null for a capability this build has no adapter for (its card cannot Generate).
export const proposalBlock = p => ADAPTERS[p?.command]?.(p) ?? null;
// MOT-22: a Generate the server refused for its proposal (a newer version exists, it was made on another canvas or needs a
// refresh, or it already made its video) marks its card proposalRefused: never the card this proposal made, so the latest
// version stays live with Generate. The card and the proposal say why; ProposalSlot hears it by PROPOSAL_REFUSED_EVENT.
const REFUSED = { proposal_stale: 'This proposal changed; use the latest version.', proposal_canvas: 'Refresh this proposal.', proposal_refused: 'Refresh this proposal.', proposal_used: 'This proposal already made a video.' };
export const proposalRefusal = problem => REFUSED[problem?.data?.code] ?? null;
export const PROPOSAL_REFUSED_EVENT = 'rh-proposal-refused';
export const refusedReason = block => (block?.proposalRefused ? REFUSED[block.proposalRefused] || REFUSED.proposal_canvas : null);
// The video card after a failed start: refused for its proposal, it is marked (never playable, never generating, never the card
// the proposal made) with the reason; any other failure keeps today's failed card. -> {block, reason}
export function failedStart(block, problem) {
  const reason = proposalRefusal(problem);
  return { block: { ...block, status: 'failed', ...(reason ? { proposalRefused: problem.data.code } : {}) }, reason };
}
// ProposalSlot's Generate: one press in flight per proposal; the card is its capability's, found again if this proposal already
// made one. -> the card id, or null while a press is in flight (or with no adapter).
export function generateProposal(p, { inFlight, insertCard, wrap = block => block }) {
  const block = !inFlight && proposalBlock(p);
  return block ? insertCard(wrap(block), { same: madeFrom(p.proposal_id) })?.id ?? null : null;
}
// The card a proposal already made, so a second press (or a reload) finds it instead of adding another.
export const madeFrom = proposalId => block => block?.operation?.proposal?.proposal_id === proposalId && !block.proposalRefused;

// ---- CR-1's route decision (C:/s/spec/day-1021/chat-route-interface.md): the call a plain chat turn makes before it is sent ----
// The bound fields are read from the ask's own payload, so the ask sends them unchanged. -> the decision, or null where the
// route endpoint is not deployed (the turn is sent as today).
export async function routeChat(fetcher, payload, { capability = null, requestId = crypto.randomUUID() } = {}) {
  const body = { request_id: requestId, app: payload.scope?.app, pending: payload.scope?.pending ?? null, text: payload.message, capability,
    mode: payload.mode ?? 'auto', selection: payload.canvas_target ?? null, source_refs: payload.context_refs ?? null, motion: payload.generation?.motion ?? null };
  let response;
  try { response = await fetcher('/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { return { route: 'answer', via: 'fallback', retryable: true, code: 'unavailable', message: ROUTE_FAILED }; }
  if (response.status === 404) return null;
  const decision = await response.json().catch(() => null);
  if (!response.ok || !decision?.route) return { route: 'answer', via: 'fallback', retryable: true, code: 'malformed', message: decision?.error || ROUTE_FAILED };
  return decision;
}
export const ROUTE_FAILED = 'Couldn\'t check whether this asks for a video or another tool. Answer normally, or try again.';
// What the Chat does with a decision. send: the turn goes on (with the token a proposal needs); direct: the command's own
// handler, as if picked; show: clarification, unsupported or a router failure above the composer, the draft kept, no turn.
// Never a paid capability on a failure: a fallback is shown, not answered silently.
export function routeOutcome(decision) {
  if (!decision) return { send: true, token: null };
  if (decision.route === 'answer' && decision.via === 'fallback') return { show: { kind: 'fallback', message: decision.message || ROUTE_FAILED, retryable: decision.retryable !== false } };
  if (decision.route === 'answer') return { send: true, token: null };
  if (decision.route === 'clarify') return { show: { kind: 'clarify', message: decision.clarification?.question || 'Which did you mean?', options: decision.clarification?.options || ['answer'] } };
  if (decision.route === 'unsupported') return { show: { kind: 'unsupported', message: decision.message || 'That isn\'t available here.' } };
  const capability = decision.capability || String(decision.route).replace(/^capability:/, '');
  if (decision.flow === 'proposal') return decision.token ? { send: true, token: decision.token } : { show: { kind: 'fallback', message: ROUTE_FAILED, retryable: true } };
  return { direct: { command: capability, args: String(decision.args ?? '') } };
}
