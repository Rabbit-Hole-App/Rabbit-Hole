// UI-15 / MOT-20: the chat side of a generation proposal (control-plane generation-proposal.js). A proposal arrives in an answer's
// meta (answer_meta live, the saved meta on reload) and GenerationProposalCard draws it under that answer. Pure helpers here:
// which version is live, what a chat turn sends so the server can propose (and revise the live one), and the card Generate adds.
import { motionContext } from './learn-slash.js';
import { commandDefinition, fieldsFor } from './generation-confirmation-schema.js';
import { imageGenerationOn } from './generate-image.js';

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
// edit: current is the card the person pressed Edit on (an explicit target): the server revises exactly that revision or refuses.
export function generationField({ offered, concept = null, target = null, current = null, edit = false }) {
  if (!offered) return null;
  const context = motionContext(target);
  return { motion: { concept: String(concept || '').slice(0, 100) || null, ...(context ? { context } : {}) }, ...(current ? { current } : {}), ...(current && edit ? { edit: true } : {}) };
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
// /explain (EXP-T20, Lane C): no card to add, because the job's card already waits on its canvas; Generate approves that job.
export const approvesJob = p => p?.command === 'explain' && typeof p.input?.job === 'string' && !proposalBlock(p);
// The Explain review card (owner, 2026-10-29): its heading, and what it says about cost. The brief it shows was a model call, as a
// change asked for in Chat is; Save is not (generation-review-client.js); Generate starts the paid work. Said as CAD's brief says it.
export const EXPLAIN_REVIEW_HEADING = 'Review explanation';
export const EXPLAIN_COST_NOTE = 'Preparing this plan used one model call, and each change asked for in Chat uses another. Saving edits here makes no call. Generate starts the paid work: writing the explanation, checking it and reviewing its render.';
export const EXPLAIN_STOPPED = 'Stopped before anything was generated.';
// How a proposal starts, by its command's adapter: 'output' (add the output card, needs ops.insertCard), 'job' (approve the existing job, needs
// ops.approveExplain) or null (this build cannot start it). Generate is enabled by THIS, never by one command's adapter.
// 'image' (IMG-01, generate-image.js): the image job is started and followed from the card, behind the web flag.
export const startAdapter = (p, ops) => (proposalBlock(p) ? (ops?.insertCard ? 'output' : null) : approvesJob(p) ? (ops?.approveExplain ? 'job' : null) : p?.command === 'generate-image' ? (imageGenerationOn() && ops?.insertCard ? 'image' : null) : null);
// ---- The card's Edit (conversational editing): an explicit Chat target on the exact revision the person clicked ----
// The target the Chat holds (chat-workspace.jsx editing): command, proposal id and revision, its message and thread, its canvas
// and title; an Explain brief also its job and brief hash. The signed proposal rides, so the turn names that exact revision.
export const editTarget = (p, messageId, threadId = null) => ({ command: p.command, proposalId: p.proposal_id, version: p.version, messageId: String(messageId), threadId,
  canvas: p.input?.app ?? null, title: p.title, ...(typeof p.input?.job === 'string' ? { jobId: p.input.job, briefHash: p.input.brief_hash ?? null } : {}), proposal: p });
// How a proposal is revised in chat: 'motion' (the chat turn, index.js generation.edit) or 'explain' (its job's refine; the send says so
// when the brief no longer waits); null keeps the card's own details form (Image and CAD have no chat revision; attached references
// ride neither path).
export const editPath = (p, ops) => (p?.references?.length ? null : p?.command === 'motion' ? (ops?.generation?.(null, null) ? 'motion' : null)
  : approvesJob(p) && ops?.refineExplain ? 'explain' : null);
export const EDIT_ONE_THING = 'This message edits the proposal in the Editing pill. Remove the pill to run a command or attach a file.';
// A turn with a target never runs another command or takes a file: it is refused in words and the draft is kept. -> text or null
export const editRefusal = (target, { command = null, file = null } = {}) => (target && (command || file) ? EDIT_ONE_THING : null);
// The target is spent once its revision is not the live one (a revision published, generated or expired): it is cleared, never retargeted.
export const editSpent = (target, msgs, made = () => false, now = Date.now()) => !!target && !proposalActive(target.proposal, msgs, made, now);
// MOT-22: a settings save the server refused because the proposal changed: the learner's choice (draft) beside the latest
// (current). here: the latest is this answer's card, so it shows it and Use mine saves the draft from it; retryable: not generated.
// -> null for any other failure.
export function settingsConflict(problem, draft, messageId) {
  const current = problem?.status === 409 ? problem.data?.current : null;
  if (!current) return null;
  const used = problem.data.code === 'proposal_used', say = s => settingsText(current.command, s);
  const noun = commandDefinition(current.command)?.noun || 'result';
  return { draft, current, here: String(problem.data.current_message_id) === String(messageId), retryable: !used,
    message: used ? `Not saved: this proposal already made ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}. Your choice was ${say(draft)}.` : `Not saved: this proposal changed meanwhile. Latest: ${say(current.settings)} (version ${current.version}). Yours: ${say(draft)}.` };
}
// A command's settings in words, from the schema (each field that applies and is available, by its option label or value and unit).
export function settingsText(command, settings) {
  return fieldsFor(command, settings || {}).filter(f => f.available !== false && settings?.[f.key] !== undefined && settings[f.key] !== null && f.type !== 'parameter_group')
    .map(f => { const v = settings[f.key]; return f.options?.find(o => o.value === v)?.label ?? (f.type === 'boolean' ? (v ? 'on' : 'off') : `${v}${f.unit ? ` ${f.unit}` : ''}`); }).join(', ');
}
// A chat refinement that lost to another revision: its text, kept with the answer, beside the current one.
export const refinementConflictText = c => `Not applied: the proposal changed meanwhile. Your version: ${c.draft.title}. ${c.draft.description}`;
// MOT-22: a Generate the server refused for its proposal (a newer version exists, it was made on another canvas or needs a
// refresh, or it already made its video) marks its card proposalRefused: never the card this proposal made, so the latest
// version stays live with Generate. The card and the proposal say why; ProposalSlot hears it by PROPOSAL_REFUSED_EVENT.
const REFUSED = { proposal_stale: 'This proposal changed; use the latest version.', proposal_canvas: 'Refresh this proposal.', proposal_refused: 'Refresh this proposal.', proposal_used: 'This proposal already made a video.',
  motion_quote_stale: 'The price changed. Review the card and generate again.', motion_not_ready: 'These settings are not ready to generate yet.', motion_renderer_changed: 'The video renderer was updated. Ask for the proposal again.', motion_settings_invalid: 'These video settings are not valid. Change them on the card.', motion_max_unknown: 'The most this video can cost is not available yet, so it cannot be generated.' };
// The Motion codes the server words itself (the updated price is in the sentence); the card shows that sentence.
const SERVER_WORDED = new Set(['motion_quote_stale', 'motion_not_ready', 'motion_renderer_changed', 'motion_settings_invalid', 'motion_max_unknown']);
export const proposalRefusal = problem => (SERVER_WORDED.has(problem?.data?.code) && typeof problem.data.error === 'string' ? problem.data.error : REFUSED[problem?.data?.code] ?? null);
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
