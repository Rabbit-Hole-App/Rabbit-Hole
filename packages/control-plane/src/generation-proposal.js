// UI-15 (owner message 40) and MOT-20 (owner message 39): one generation-proposal schema for every generation command that
// needs the learner's review, and the explicit rules for which do. Motion is the first and only wired consumer.
//
// A Learn chat turn (the existing chat path: its transport, model and allowance accounting) may call propose_generation. The
// worker validates the proposal here, signs it for the learner, and the chat draws it with trusted UI (GenerationProposalCard):
//   { proposal_id, version, command, title, description (3-10 sentences), settings (per command), source_refs,
//     input (what the command generates from, bound by the signature), expires_at, sig, usage (server-derived, unsigned) }
// A settings change on the card is the next version, signed here with no model call; a refinement in chat is the next
// version from the next turn, and earlier versions are inactive. Generate sends the signed proposal back: for Motion as
// motion_request.proposal, which LearnVideos verifies (signature, learner, expiry, one video per proposal) and whose title,
// duration and description the orchestrator's Director takes as binding input. Nothing is authored, narrated or rendered
// before Generate.
import { validateMotionContext } from './motion-context.js';
import { MotionRequestProvider, motionReservationMicros } from './motion-provider.js';

export const PROPOSAL_TTL_S = 24 * 60 * 60;
const TITLE_MAX = 120, DESCRIPTION_MAX = 1500, REQUEST_MAX = 500, REFS_MAX = 8;
const ID = /^gp-[0-9a-f]{16}$/, SIG = /^[0-9a-f]{64}$/;
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);

// Which commands are proposed first, and the card's fields (proposal-rules.js, shared with the web). A proposed command also
// needs its settings validator below.
export { PROPOSAL_RULES, reviewRequired } from './proposal-rules.js';
import { PROPOSED } from './proposal-rules.js';
export const WIRED = PROPOSED;

// Motion's settings (learn-render motion/duration.js DURATION). Audio On stays unavailable until narration works.
export const MOTION_DURATION = Object.freeze({ min: 5, max: 30 });
const SETTINGS = {
  motion(value) {
    if (!plain(value)) return { error: 'settings must be {duration_seconds, audio}' };
    const extra = Object.keys(value).find(k => !['duration_seconds', 'audio'].includes(k));
    if (extra) return { error: `settings.${extra} is not a Motion setting` };
    if (value.audio === true) return { error: 'narration audio is not available yet; propose the video without it' };
    if (value.audio !== undefined && value.audio !== false) return { error: 'settings.audio must be false' };
    const seconds = value.duration_seconds;
    if (!Number.isInteger(seconds) || seconds < MOTION_DURATION.min || seconds > MOTION_DURATION.max) return { error: `settings.duration_seconds must be a whole number from ${MOTION_DURATION.min} to ${MOTION_DURATION.max}` };
    return { value: { duration_seconds: seconds, audio: false } };
  },
};

// Offered only where a video can start: an orchestrator is configured and new generation is not paused (owner message 28:
// MOTION_GENERATION_PAUSED "1"; nothing new starts or is reserved, and a /motion chat turn is answered before any model call).
export const MOTION_PAUSED = 'Motion generation is temporarily unavailable while we fix a reliability issue.';
export const motionPaused = env => env.MOTION_GENERATION_PAUSED === '1';
export const motionOffered = env => !motionPaused(env) && !new MotionRequestProvider(env).unavailable();

export const PROPOSAL_TOOL = {
  name: 'propose_generation',
  description: 'Propose something to generate for the learner to approve. Nothing is generated when you call this: the learner sees your proposal as a card with a Generate button and can ask you to change it. Call it at most once per answer.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['command', 'title', 'description', 'settings'],
    properties: {
      command: { type: 'string', enum: WIRED, description: 'motion: a short animated explainer video.' },
      title: { type: 'string', description: 'A short, specific title, at most 80 characters.' },
      description: { type: 'string', description: 'What the result will contain, in order: 3 to 10 complete sentences, normally 3 or 4. For a video it is the brief of what it shows, not its narration. No labels, lists, ids or code names.' },
      settings: { type: 'object', description: `motion: {duration_seconds: what the learner asked for, else 10 to 20 (${MOTION_DURATION.min} to ${MOTION_DURATION.max}), audio: false}.` },
      source_ref_ids: { type: 'array', items: { type: 'string' }, description: 'The sourceIds of attached materials it is about; empty when none.' },
    },
  },
};
export const PROPOSAL_SYSTEM = `Generation proposals: when the learner asks for an animated or explainer video (a /motion line included), or asks to change a proposal you made, call ${PROPOSAL_TOOL.name} once with the whole proposal, changed where they asked (command motion). Do not repeat the description in your reply: the card shows it. Reply with one short sentence. Narration audio is not available yet; say so only if asked.`;

const sentences = text => text.match(/[^.!?]+[.!?]+["')\]]*(?=\s|$)/g) || [];
// -> the proposal's shared fields and validated settings, or { error } in words the model (and a test) reads.
export function validateProposalInput(input, refs = []) {
  if (!plain(input)) return { error: 'the proposal must be an object' };
  const extra = Object.keys(input).find(k => !['command', 'title', 'description', 'settings', 'source_ref_ids'].includes(k));
  if (extra) return { error: `${extra} is not a field` };
  if (!WIRED.includes(input.command)) return { error: `command must be one of ${WIRED.join(', ')}` };
  const title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : '';
  if (!title || title.length > TITLE_MAX) return { error: `the title must be 1 to ${TITLE_MAX} characters` };
  const raw = typeof input.description === 'string' ? input.description : '';
  const description = raw.replace(/\s+/g, ' ').trim();
  if (!description || description.length > DESCRIPTION_MAX) return { error: `the description must be 1 to ${DESCRIPTION_MAX} characters` };
  if (/(^|\n)\s*([-*•]|\d+[.)])\s/.test(raw) || /\b(will show|title|description)\s*:/i.test(description)) return { error: 'the description is plain sentences: no lists or labels' };
  const found = sentences(description);
  if (found.join(' ').replace(/\s+/g, ' ').trim() !== description || found.length < 3 || found.length > 10) return { error: `the description must be 3 to 10 complete sentences (it has ${found.length})` };
  const settings = SETTINGS[input.command](input.settings);
  if (settings.error) return settings;
  const ids = input.source_ref_ids ?? [];
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return { error: 'source_ref_ids must be a list of sourceIds' };
  const known = new Map((refs || []).filter(r => r?.sourceId).map(r => [r.sourceId, r]));
  const unknown = ids.find(id => !known.has(id));
  if (unknown) return { error: `${unknown} is not an attached material` };
  const source_refs = [...new Set(ids)].slice(0, REFS_MAX).map(id => { const r = known.get(id); return { kind: r.kind, sourceId: r.sourceId, ...(typeof r.name === 'string' ? { name: r.name.slice(0, 200) } : {}) }; });
  return { command: input.command, title, description, settings: settings.value, source_refs };
}

// Motion's input: the /motion line the job runs (the resolver grounds on it), the canvas concept and the selected card
// (motion-context.js) the chat turn sent as motion {concept, context}. -> null when the body sends no usable one.
export function motionAbout(value) {
  if (!plain(value)) return null;
  const concept = typeof value.concept === 'string' ? value.concept.trim().slice(0, 100) || null : null;
  let context = null;
  try { context = validateMotionContext(value.context); } catch { return null; }
  return { concept, ...(context ? { context } : {}) };
}
export const motionRequestLine = message => `/motion ${String(message || '').replace(/^\s*\/motion\b\s*/i, '').trim() || 'explain this'}`.slice(0, REQUEST_MAX);

const SIGNED = ['proposal_id', 'version', 'command', 'title', 'description', 'settings', 'source_refs', 'input', 'expires_at'];
const canonical = p => JSON.stringify(SIGNED.map(k => p[k] ?? null));
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
// HMAC-SHA256 with the worker's Motion secret (the orchestrator token, set wherever Motion can start), domain-separated from
// the job grant ('motion-grant|'). The learner is part of what is signed, never of what the browser holds.
async function signature(env, p, user) {
  if (!env.MOTION_ORCHESTRATOR_TOKEN) throw new Error('Motion is not available in this environment yet.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.MOTION_ORCHESTRATOR_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`generation-proposal|${String(user).toLowerCase()}|${canonical(p)}`)));
}

// What generating it uses, from the server's own settings (owner messages 30-33: credits only, 1 credit = $0.01): the estimate
// (MOTION_ESTIMATE_USD) and the temporary reservation while it runs (MOTION_JOB_RESERVATION_USD). Unsigned: display only.
const credits = usd => (Number.isFinite(usd) && usd > 0 ? Math.ceil(Number((usd * 100).toFixed(6))) : null);
export function proposalUsage(env, command) {
  if (command !== 'motion') return { estimate_credits: null, reserve_credits: null };
  const estimate = Number(String(env.MOTION_ESTIMATE_USD ?? '').trim() || NaN), hold = motionReservationMicros(env);
  return { estimate_credits: credits(estimate), reserve_credits: hold == null ? null : credits(hold / 1e6) };
}

// fields: validateProposalInput's result plus input. A revision keeps the proposal id and takes the next version.
export async function signProposal(env, fields, user, { id = null, version = 1, now = Math.floor(Date.now() / 1000) } = {}) {
  const p = { proposal_id: id || `gp-${hex(crypto.getRandomValues(new Uint8Array(8)))}`, version, command: fields.command, title: fields.title, description: fields.description,
    settings: fields.settings, source_refs: fields.source_refs || [], input: fields.input, expires_at: now + PROPOSAL_TTL_S };
  return { ...p, sig: await signature(env, p, user), usage: proposalUsage(env, p.command) };
}

// The shape only (synchronous, for motion_request validation); verifyProposal checks the signature.
export function proposalShape(p) {
  if (!plain(p) || Object.keys(p).some(k => ![...SIGNED, 'sig', 'usage'].includes(k))) return 'the proposal is not a generation proposal';
  if (!ID.test(p.proposal_id || '') || !Number.isSafeInteger(p.version) || p.version < 1 || !WIRED.includes(p.command) || !SIG.test(p.sig || '') || !Number.isSafeInteger(p.expires_at) || !plain(p.settings) || !plain(p.input)) return 'the proposal is not a generation proposal';
  return null;
}
// -> null when this is a proposal the worker signed for this learner and it has not expired, else why it is refused.
export async function verifyProposal(env, p, user, now = Math.floor(Date.now() / 1000)) {
  const bad = proposalShape(p);
  if (bad) return bad;
  if (!user) return 'Sign in first';
  let want;
  try { want = await signature(env, p, user); } catch (error) { return error.message; }
  let diff = want.length ^ p.sig.length;
  for (let i = 0; i < Math.min(want.length, p.sig.length); i++) diff |= want.charCodeAt(i) ^ p.sig.charCodeAt(i);
  if (diff) return 'This proposal was not made for you, or it was changed. Ask for it again in chat.';
  if (p.expires_at < now) return 'This proposal has expired. Ask for it again in chat.';
  return null;
}

// A settings change on the card: the next version of the same proposal, signed again, with no model call.
export async function reviseSettings(env, p, settings, user) {
  const refused = await verifyProposal(env, p, user);
  if (refused) return { error: refused };
  const checked = SETTINGS[p.command]?.(settings);
  if (!checked || checked.error) return { error: checked?.error || 'These settings cannot be changed here.' };
  return { proposal: await signProposal(env, { ...p, settings: checked.value }, user, { id: p.proposal_id, version: p.version + 1 }) };
}

// What the orchestrator's Director takes as binding input (orchestrator.mjs approved_proposal).
export const approvedProposal = p => ({ title: p.title, duration_seconds: p.settings.duration_seconds, description: p.description });
