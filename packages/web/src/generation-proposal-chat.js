// UI-15 / MOT-20: the chat side of a generation proposal (control-plane generation-proposal.js). A proposal arrives in an answer's
// meta (answer_meta live, the saved meta on reload) and GenerationProposalCard draws it under that answer. Pure helpers here:
// which version is live, what a chat turn sends so the server can propose (and revise the live one), and the card Generate adds.
import { motionContext } from './learn-slash.js';
import { commandDefinition, fieldsFor } from './generation-confirmation-schema.js';
import { imageGenerationOn } from './generate-image.js';
import { isBriefCommand } from './material-brief.js';
import { isSmallTalk } from './inline-ai-route.js';
import { startTiming } from './client-timing.js';

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
// /explain (EXP-T20, Lane C) and /animation (AN-05, control-plane animation-job.js): no card to add, because the job's card already
// waits on its canvas; Generate approves that job (ops.approveExplain sends it to the command's own job route).
// /whiteboard (roadmap W1.5, control-plane whiteboard-job.js) likewise: its pending card waits for the plan's Generate.
export const approvesJob = p => ['explain', 'animation', 'whiteboard-video'].includes(p?.command) && typeof p.input?.job === 'string' && !proposalBlock(p);
// The Explain review card's heading. It carries no cost note (owner 2026-11-07).
export const EXPLAIN_REVIEW_HEADING = 'Review explanation';
export const EXPLAIN_STOPPED = 'Stopped before anything was generated.';
// The /animation plan's review card heading (owner, 2026-10-31: no long cost note; owner decision 35, 2026-11-04: one line on what Generate costs).
export const ANIMATION_REVIEW_HEADING = 'Review your scene';
// The /animation card's cost line: what a change asked for in Chat costs (the plan call, the server's planCredits) and Generate's most a build can cost, which is the SERVER's
// figure (proposal.usage.max_credits, from animationReservation(); never typed here, so a change to the call limits moves it). No figure from the server, no Generate sentence.
export const animationCostNote = p => {
  const planCredits = p?.input?.scene?.planCredits, max = p?.usage?.max_credits;
  return [planCredits ? `Edit plan uses up to ${planCredits} AI credits to rewrite the plan.` : null,
    Number.isFinite(max) ? `Generate: up to ${max.toLocaleString('en-US')} credits; most animations use 50–100; a failed one is refunded.` : null].filter(Boolean).join(' ') || null;
};
// /whiteboard's review card (roadmap 1.3): its heading, and the cost line "up to <N> credits" with the SERVER's worst case for this plan
// (proposal.usage.max_credits, whiteboardReservation; W-D2). No figure from the server, no cost line.
export const WHITEBOARD_REVIEW_HEADING = 'Review your whiteboard';
export const whiteboardCostNote = p => (Number.isFinite(p?.usage?.max_credits) ? `up to ${p.usage.max_credits.toLocaleString('en-US')} credits` : null);
// A length change on the whiteboard card re-plans (W-D7): after its saved revision, the job's refine with the note `duration: <n>`. -> the note,
// or null when the length did not change.
export const durationRefinement = (before, after) => (after?.command === 'whiteboard-video' && Number.isInteger(after.settings?.duration_seconds)
  && after.settings.duration_seconds !== before?.settings?.duration_seconds ? `duration: ${after.settings.duration_seconds}` : null);
// A /whiteboard plan message shows only its review card (owner try, 2026-11-05): the server writes the plan as the message text for the
// history, and the card already shows it. Every other answer, proposals included, shows its text.
// A plan message with no text of its own (the model gave no lead-in; owner 2026-11-07: no canned sentence) is the card alone, never an empty bubble.
export const proposalOnly = m => m?.meta?.proposal?.command === 'whiteboard-video' || (!!m?.meta?.proposal && !String(m.content ?? '').trim());
// A job-approving proposal's heading and cost note, by its command.
export const jobReviewCopy = p => (p?.command === 'whiteboard-video' ? { eyebrow: WHITEBOARD_REVIEW_HEADING, ...(whiteboardCostNote(p) ? { note: whiteboardCostNote(p) } : {}) } : p?.command === 'animation' ? { eyebrow: ANIMATION_REVIEW_HEADING, ...(animationCostNote(p) ? { note: animationCostNote(p) } : {}) } : { eyebrow: EXPLAIN_REVIEW_HEADING });
// How a proposal starts, by its command's adapter: 'output' (add the output card, needs ops.insertCard), 'job' (approve the existing job, needs
// ops.approveExplain) or null (this build cannot start it). Generate is enabled by THIS, never by one command's adapter.
// 'image' (IMG-01, generate-image.js): the image job is started and followed from the card, behind the web flag.
// 'material' (owner spec 2026-10-29; material-brief.js): a simple command's brief; Generate asks the existing generator with the signed
// brief (ops.generateMaterial, /api/learn/artifact), which consumes it once.
export const startAdapter = (p, ops) => (proposalBlock(p) ? (ops?.insertCard ? 'output' : null) : approvesJob(p) ? (ops?.approveExplain ? 'job' : null) : p?.command === 'generate-image' ? (imageGenerationOn() && ops?.insertCard ? 'image' : null)
  : isBriefCommand(p?.command) ? (ops?.generateMaterial ? 'material' : null) : null);
// ---- The card's Edit (conversational editing): an explicit Chat target on the exact revision the person clicked ----
// The target the Chat holds (chat-workspace.jsx editing): command, proposal id and revision, its message and thread, its canvas
// and title; an Explain brief also its job and brief hash. The signed proposal rides, so the turn names that exact revision.
export const editTarget = (p, messageId, threadId = null) => ({ command: p.command, proposalId: p.proposal_id, version: p.version, messageId: String(messageId), threadId,
  canvas: p.input?.app ?? null, title: p.title, ...(typeof p.input?.job === 'string' ? { jobId: p.input.job, briefHash: p.input.brief_hash ?? null } : {}), proposal: p });
// How a proposal is revised in chat: 'motion' (the chat turn, index.js generation.edit) or 'explain' (its job's refine; the send says so
// when the brief no longer waits); null keeps the card's own details form (Image and CAD have no chat revision; attached references
// ride neither path).
// 'material': a simple brief's next revision from the learner's words, with no model call (chat-proposal-route.js material-proposals
// revise; the words are added to the request, never rewritten).
export const editPath = (p, ops) => (p?.references?.length ? null : p?.command === 'motion' ? (ops?.generation?.(null, null) ? 'motion' : null)
  : approvesJob(p) && ops?.refineExplain ? 'explain' : isBriefCommand(p?.command) && ops?.generateMaterial ? 'material' : null);
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
// A simple brief's card carries the brief's id (proposalId, set where generateMaterial inserts it).
export const madeFrom = proposalId => block => (block?.operation?.proposal?.proposal_id ?? block?.proposalId) === proposalId && !block.proposalRefused;

// ---- CR-1's route decision (C:/s/spec/day-1021/chat-route-interface.md): the call a plain chat turn makes before it is sent ----
// The bound fields are read from the ask's own payload, so the ask sends them unchanged. -> the decision, or null where the
// route endpoint is not deployed (the turn is sent as today).
async function routeDecision(fetcher, payload, { capability = null, requestId = crypto.randomUUID() } = {}) {
  const body = { request_id: requestId, app: payload.scope?.app, pending: payload.scope?.pending ?? null, text: payload.message, capability,
    mode: payload.mode ?? 'auto', selection: payload.canvas_target ?? null, source_refs: payload.context_refs ?? null, motion: payload.generation?.motion ?? null };
  // A bare greeting is never a tool request: decided here with no route request at all (the server's decideChat does the same for a direct caller).
  if (!capability && isSmallTalk(payload.message)) return { route: 'answer', via: 'default', local: true, capability: null, flow: null, token: null, retryable: false, code: null, message: null };
  let response;
  // requestId and status ride on every failure so the Worker's chat_route log line for this request can be found.
  try { response = await fetcher('/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (error) {
    if (error?.name === 'AbortError') throw error; // the learner stopped or left: not a router failure, the send does not go on
    return { route: 'answer', via: 'fallback', recoverable: true, code: 'unavailable', message: ROUTE_FAILED, requestId, status: null };
  }
  const decision = await response.json().catch(() => null);
  // A 404 with no error body is the route not being deployed (the turn is sent as today); a 404 that names its error is a scoped answer (a missing canvas) and is shown.
  if (response.status === 404 && typeof decision?.error !== 'string') return null;
  // A router that is down, slow or unreadable is recoverable (the words can still be answered); a refusal (400, 401, 403, 413) is not.
  if (!response.ok || !decision?.route) return { route: 'answer', via: 'fallback', recoverable: response.ok || response.status >= 500 || response.status === 408 || response.status === 429, code: 'malformed', message: decision?.error || REFUSALS[response.status] || ROUTE_FAILED, requestId, status: response.status };
  return decision.via === 'fallback' ? { ...decision, recoverable: true, requestId, status: response.status } : decision;
}
// What a failed route request says when the server gave no words of its own. Shown only for an authorization failure or a command that could not start.
// The route round trip, timed for benchmarking (client-timing.js): a greeting is decided locally, so its interval is the cost of the check itself.
export async function routeChat(fetcher, payload, options) {
  const timing = startTiming('chat_route_ms', { mode: payload.mode ?? 'auto', depth: payload.depth });
  let decision;
  try { decision = await routeDecision(fetcher, payload, options); } catch (error) { timing.end('cancelled'); throw error; }
  timing.end('ok', { path: decision?.local ? 'greeting' : decision?.via === 'fallback' ? 'fallback' : 'routed' });
  return decision;
}
export const ROUTE_FAILED = 'Could not reach Rabbit Hole, so nothing was started. Send it again.';
const REFUSALS = { 401: 'Your session ended. Sign in again, then send this again.', 403: 'You no longer have access to this canvas. Nothing was sent.' };
// What the Chat does with a decision. send: the turn goes on (with the token a proposal needs); direct: the command's own
// handler, as if picked; show: clarification, unsupported or a router failure above the composer, the draft kept, no turn.
// Never a paid capability on a failure. A recoverable router failure on an ordinary turn (plain: no command, no picked capability) goes on once
// as an answer-only turn (answerOnly: the server runs it with no proposal or tool, failure: the correlation fields it logs); with a command or a
// refused request the specific error is shown instead (kind 'error'; a router failure itself shows no banner and no buttons).
const COMMAND_TOKEN = /^[a-z][a-z0-9-]{0,40}$/;
const soundEnvelope = d => {
  if (typeof d.route !== 'string' || !d.route) return false;
  if (['answer', 'clarify', 'unsupported'].includes(d.route)) return true;
  const capability = d.capability ?? d.route.replace(/^capability:/, '');
  return typeof capability === 'string' && COMMAND_TOKEN.test(capability);
};
export function routeOutcome(decision, { plain = false } = {}) {
  if (!decision) return { send: true, token: null };
  if (decision.local) return { send: true, token: null, answerOnly: true, failure: null }; // a greeting: text only, enforced by the server
  // The envelope is validated before any action: a route that is not a string, or a capability that is not a command token, is never run (it reaches the command intercept).
  if (!soundEnvelope(decision)) return plain && decision.recoverable !== false ? { send: true, token: null, answerOnly: true, failure: { request_id: decision.requestId ?? null, status: decision.status ?? null, code: 'malformed' } } : { show: { kind: 'error', message: ROUTE_FAILED } };
  if (decision.route === 'answer' && decision.via === 'fallback' && plain && decision.recoverable !== false) return { send: true, token: null, answerOnly: true, failure: { request_id: decision.requestId ?? null, status: decision.status ?? null, code: decision.code ?? null } };
  if (decision.route === 'answer' && decision.via === 'fallback') return { show: { kind: 'error', message: decision.message || ROUTE_FAILED } };
  if (decision.route === 'answer') return { send: true, token: null };
  if (decision.route === 'clarify') return { show: { kind: 'clarify', message: decision.clarification?.question || 'Which did you mean?', options: decision.clarification?.options || ['answer'] } };
  if (decision.route === 'unsupported') return { show: { kind: 'unsupported', message: decision.message || 'That isn\'t available here.' } };
  const capability = decision.capability || String(decision.route).replace(/^capability:/, '');
  if (decision.flow === 'proposal') return decision.token ? { send: true, token: decision.token } : { show: { kind: 'error', message: ROUTE_FAILED } };
  return { direct: { command: capability, args: String(decision.args ?? '') } };
}
