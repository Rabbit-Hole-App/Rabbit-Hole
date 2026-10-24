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
// UI-15.1 (docs/features/generation-review-contract.md): the v3 envelope adds what the person reviews and edits (the prompt with its
// reference pills, the references bound by revision, the lists, the destination, a review hash) under its own signature; v1 and v2
// proposals keep validating. Settings are validated by the canonical schema (web/src/generation-confirmation-schema.js).
import { validateMotionContext } from './motion-context.js';
import { MotionRequestProvider, motionReservationMicros } from './motion-provider.js';
import { CHAT_CAPABILITIES, chatCapability } from '../../web/src/inline-ai-route.js';
import { hmacHex } from './token.js';
import { explainReservation } from './explain-policy.js';
import { SCHEMA_VERSION, commandDefinition, firstReadOnly, settingsOf, validateSettings as validateCommandSettings } from '../../web/src/generation-confirmation-schema.js';
import { REVIEW_LISTS, escapeText, plainPrompt, reviewHash, reviewOf, validateReview } from '../../web/src/generation-review.js';
import { imageQuote } from './image-providers.js';
import { imageReadiness } from './image-settings.js';

export const PROPOSAL_TTL_S = 24 * 60 * 60;
const TITLE_MAX = 120, DESCRIPTION_MAX = 1500, REQUEST_MAX = 500, REFS_MAX = 8;
const ID = /^gp-[0-9a-f]{16}$/, SIG = /^(v[23]\.)?[0-9a-f]{64}$/;
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);

// CR-1: which commands are proposed is the capability declaration's flow (web/src/inline-ai-route.js CHAT_CAPABILITIES). A
// proposed command also needs its settings validator below.
export const reviewRequired = command => chatCapability(command)?.flow === 'proposal';
export const WIRED = Object.freeze(Object.keys(CHAT_CAPABILITIES).filter(reviewRequired));
// What the server may sign: the chat tool's commands plus /explain, whose brief the server prepares itself (EXP-T12/T16).
// The chat model is offered only WIRED; /explain joins it when its capability is declared (Lane B, CHAT_CAPABILITIES).
// IMG-01: /generate-image is signed (v3 only, chat-proposal-route.js) by the server from the person's own request: no chat model proposes it.
export const SIGNABLE = Object.freeze([...new Set([...WIRED, 'explain', 'generate-image'])]);

// Motion's settings (learn-render motion/duration.js DURATION). Audio On stays unavailable until narration works.
// The bounds are the declaration's Duration field: one definition with the card.
const MOTION_SECONDS = settingsOf('motion').find(f => f.key === 'duration_seconds').options.map(o => o.value);
export const MOTION_DURATION = Object.freeze({ min: MOTION_SECONDS[0], max: MOTION_SECONDS.at(-1) });
// Every command's settings are the schema's declarations (no validator of their own here): Motion's duration, audio and aspect ratio,
// /explain's presentation. -> { value } | { error, path }
export const validateSettings = (command, value, options) => validateCommandSettings(command, value, options);

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
  const settings = validateCommandSettings(input.command, input.settings);
  if (settings.error) return { error: settings.error };
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
// v3 (UI-15.1): the same fields, then everything the person reviews and edits. review_hash is generation-review.js reviewHash of them.
const V3_EXTRA = ['schema_version', 'mode', 'original_request', 'prompt', 'visual_constraints', 'references', ...REVIEW_LISTS, 'destination', 'quote', 'review_hash'];
const SIGNED_V3 = [...SIGNED, ...V3_EXTRA];
const v3sig = sig => typeof sig === 'string' && sig.startsWith('v3.');
const canonical = (p, v3 = v3sig(p.sig)) => JSON.stringify((v3 ? SIGNED_V3 : SIGNED).map(k => p[k] ?? null));
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
// v1: HMAC-SHA256 with the worker's Motion secret (the orchestrator token), domain-separated from the job grant
// ('motion-grant|'). Verified for Motion only, so proposals already on cards keep working; signed only where no v2 key exists.
// v2 (EXP-T12, open-questions Q4): capability-neutral, so /explain works with Motion unconfigured. Its key is derived from the
// secret a model-calling worker must hold anyway, in learn-inline-route.js signingKey's order, under its own label: no new
// secret. The learner is part of what is signed, never of what the browser holds.
const v2Secret = env => env.INLINE_DECISION_KEY || env.TYPESAFE_API_KEY || env.VERCEL_TYPESAFE_API_KEY || env.ANTHROPIC_API_KEY;
const hmac = async (secret, text) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
};
const unavailable = command => new Error(command === 'motion' ? 'Motion is not available in this environment yet.' : 'Generation proposals are not available in this environment yet.');
async function signature(env, p, user, version) {
  if (version === 'v3') {
    const secret = v2Secret(env);
    if (!secret) throw unavailable(p.command);
    return `v3.${await hmac(await hmacHex(secret, 'generation-proposal-v3'), `generation-proposal|v3|${String(user).toLowerCase()}|${canonical(p, true)}`)}`;
  }
  if (version === 'v2') {
    const secret = v2Secret(env);
    if (!secret) throw unavailable(p.command);
    return `v2.${await hmac(await hmacHex(secret, 'generation-proposal-v2'), `generation-proposal|v2|${String(user).toLowerCase()}|${canonical(p)}`)}`;
  }
  if (p.command !== 'motion' || !env.MOTION_ORCHESTRATOR_TOKEN) throw unavailable(p.command);
  return hmac(env.MOTION_ORCHESTRATOR_TOKEN, `generation-proposal|${String(user).toLowerCase()}|${canonical(p)}`);
}
const signingVersion = env => (v2Secret(env) ? 'v2' : 'v1');
// The envelope a new proposal is signed in: v3 where a v2 key and the canvas are known, else as before.
export const envelopeFor = (env, bind) => (v2Secret(env) && bind?.org && bind?.app ? 'v3' : null);
export const reviewAvailable = env => !!v2Secret(env);

// What generating it uses, from the server's own settings (owner messages 30-33: credits only, 1 credit = $0.01): the estimate
// (MOTION_ESTIMATE_USD) and the temporary reservation while it runs (MOTION_JOB_RESERVATION_USD). Unsigned: display only.
const credits = usd => (Number.isFinite(usd) && usd > 0 ? Math.ceil(Number((usd * 100).toFixed(6))) : null);
export function proposalUsage(env, command) {
  // /explain: its estimate when configured (EXPLAIN_ESTIMATE_USD, from measured runs), and the policy's generation worst case
  // as what the job checks the allowance for. Never Motion's estimate or hold.
  if (command === 'explain') {
    const estimate = Number(String(env.EXPLAIN_ESTIMATE_USD ?? '').trim() || NaN);
    return { estimate_credits: credits(estimate), reserve_credits: credits(explainReservation().generationMicros / 1e6) };
  }
  if (command !== 'motion') return { estimate_credits: null, reserve_credits: null };
  const estimate = Number(String(env.MOTION_ESTIMATE_USD ?? '').trim() || NaN), hold = motionReservationMicros(env);
  return { estimate_credits: credits(estimate), reserve_credits: hold == null ? null : credits(hold / 1e6) };
}

// IMG-01: the signed quote of a generate-image proposal (what image-jobs.js compares with its own at create), the display usage from it,
// and the readiness answer for the card (image-settings.js; unsigned like usage and decided again at create).
// The prompt the provider receives is the proposal's pill-free description, trimmed (image-jobs.js), so its bytes are priced.
export function imageProposalQuote(env, r) {
  const description = (plainPrompt(r.prompt, r.references) || '').trim();
  const quote = imageQuote(env, r.settings, r.references.length, new TextEncoder().encode(description).length);
  return quote.state === 'priced' ? { estimate_credits: quote.estimate_credits, reserve_credits: quote.reserve_credits } : null;
}
const quoteUsage = quote => ({ estimate_credits: quote?.estimate_credits ?? null, reserve_credits: quote?.reserve_credits ?? null });
const readinessOf = p => (p.command === 'generate-image' ? { readiness: imageReadiness(p.settings, p.references?.length ?? 0) } : {});
// The default verifier of image-jobs.js: only the v3 envelope carries the references and the quote an image is approved with.
export async function verifyImageProposal(env, p, user) {
  if (p?.command === 'generate-image' && !v3sig(p.sig)) return 'This image proposal is out of date. Ask for it again.';
  return verifyProposal(env, p, user);
}

// fields: validateProposalInput's result plus input. A revision keeps the proposal id and takes the next version.
// v3 is signed when envelope is 'v3' (a v2 key and the destination, org and app, must exist); fields may carry prompt, references, the lists,
// original_request, mode, visual_constraints and quote (generation-review.js). Without a prompt, the description is the prompt.
// Otherwise the proposal is signed as before (v1 or v2), so every existing signer and test is unchanged.
export async function signProposal(env, fields, user, { id = null, version = 1, now = Math.floor(Date.now() / 1000), envelope = null } = {}) {
  const p = { proposal_id: id || `gp-${hex(crypto.getRandomValues(new Uint8Array(8)))}`, version, command: fields.command, title: fields.title, description: fields.description,
    settings: fields.settings, source_refs: fields.source_refs || [], input: fields.input, expires_at: now + PROPOSAL_TTL_S };
  const destination = fields.destination ?? (fields.input?.org && fields.input?.app ? { org: fields.input.org, app: fields.input.app } : null);
  if (envelope === 'v3' && !destination) throw new Error('A reviewed proposal needs its canvas.');
  if (p.command === 'generate-image' && envelope !== 'v3') throw new Error('An image proposal needs the reviewed envelope.');
  if (envelope === 'v3') {
    if (!v2Secret(env)) throw unavailable(p.command);
    const review = validateReview({ command: p.command, mode: fields.mode, original_request: fields.original_request ?? fields.input?.request ?? '', title: p.title, prompt: fields.prompt ?? escapeText(p.description),
      visual_constraints: fields.visual_constraints, references: fields.references, ...Object.fromEntries(REVIEW_LISTS.map(k => [k, fields[k]])), settings: p.settings, quote: fields.quote, destination });
    if (review.error) throw new Error(review.error);
    const r = review.value;
    // IMG-01: the price is the server's own quote for these settings and references, never a client's (null = not known, Generate stays blocked).
    if (p.command === 'generate-image') r.quote = imageProposalQuote(env, r);
    Object.assign(p, { description: plainPrompt(r.prompt, r.references), schema_version: SCHEMA_VERSION, mode: r.mode, original_request: r.original_request, prompt: r.prompt, visual_constraints: r.visual_constraints,
      references: r.references, ...Object.fromEntries(REVIEW_LISTS.map(k => [k, r[k]])), destination: r.destination, quote: r.quote, review_hash: await reviewHash(r) });
    return { ...p, sig: await signature(env, p, user, 'v3'), usage: p.command === 'generate-image' ? quoteUsage(r.quote) : proposalUsage(env, p.command), ...readinessOf(p) };
  }
  return { ...p, sig: await signature(env, p, user, signingVersion(env)), usage: proposalUsage(env, p.command) };
}

// The shape only (synchronous, for motion_request validation); verifyProposal checks the signature.
export function proposalShape(p) {
  if (!plain(p) || Object.keys(p).some(k => ![...(v3sig(p.sig) ? SIGNED_V3 : SIGNED), 'sig', 'usage', 'readiness'].includes(k))) return 'the proposal is not a generation proposal';
  if (!ID.test(p.proposal_id || '') || !Number.isSafeInteger(p.version) || p.version < 1 || !SIGNABLE.includes(p.command) || !SIG.test(p.sig || '') || !Number.isSafeInteger(p.expires_at) || !plain(p.settings) || !plain(p.input)) return 'the proposal is not a generation proposal';
  return null;
}
// -> null when this is a proposal the worker signed for this learner and it has not expired, else why it is refused.
export async function verifyProposal(env, p, user, now = Math.floor(Date.now() / 1000)) {
  const bad = proposalShape(p);
  if (bad) return bad;
  if (!user) return 'Sign in first';
  let want;
  // The envelope names its version; a v1 envelope is valid only for Motion (signature refuses any other command).
  try { want = await signature(env, p, user, v3sig(p.sig) ? 'v3' : p.sig.startsWith('v2.') ? 'v2' : 'v1'); } catch (error) { return error.message; }
  let diff = want.length ^ p.sig.length;
  for (let i = 0; i < Math.min(want.length, p.sig.length); i++) diff |= want.charCodeAt(i) ^ p.sig.charCodeAt(i);
  if (diff) return 'This proposal was not made for you, or it was changed. Ask for it again in chat.';
  if (p.expires_at < now) return 'This proposal has expired. Ask for it again in chat.';
  return v3sig(p.sig) ? consistent(p) : null;
}
// A v3 envelope is also internally consistent: a valid review whose hash is review_hash, whose description is the prompt without
// its pills, and whose destination is the canvas bound into its input. The signature already says the worker made it; this catches a
// worker bug before it reaches a person or an executor.
async function consistent(p) {
  const review = validateReview(reviewOf(p));
  if (review.error || p.review_hash !== await reviewHash(review.value) || p.description !== plainPrompt(p.prompt, p.references)) return 'This proposal is inconsistent. Ask for it again in chat.';
  if (p.input.org !== undefined && (p.input.org !== p.destination.org || p.input.app !== p.destination.app)) return 'This proposal is inconsistent. Ask for it again in chat.';
  return null;
}

// A settings change on the card: the next version of the same proposal, signed again, with no model call.
// bind {org, app}: the canvas the server found the proposal on (MOT-22), signed into its input; an old unbound proposal is bound here.
export async function reviseSettings(env, p, settings, user, bind = null) {
  return reviseProposal(env, p, { settings }, user, bind);
}

// A person's edit of a proposal on its card (UI-15.1): any of settings, description (the prompt with its pills), title, references and
// the lists, made from the SERVER's current revision, never from the browser's copy. Only what the command's editable_fields allow;
// original_request, command, mode, destination and quote never change. Validated by the schema (settings, references) and the
// review (prompt against references), signed as the next revision with no model call. -> { proposal }
// (words for the person; a draft is never dropped by a refusal): { error, code?, errors? } when refused.
const EDITABLE_LISTS = ['title', 'references', ...REVIEW_LISTS];
export async function reviseProposal(env, p, edit, user, bind = null) {
  const refused = await verifyProposal(env, p, user);
  if (refused) return { error: refused };
  if (!plain(edit)) return { error: 'The edit must be an object.' };
  const extra = Object.keys(edit).find(k => ![...EDITABLE_LISTS, 'settings', 'description', 'prompt', 'visual_constraints'].includes(k));
  if (extra) return { error: `${extra} cannot be edited.`, code: 'field_not_editable' };
  if (edit.description !== undefined && edit.prompt !== undefined && edit.description !== edit.prompt) return { error: 'Send the description once.' };
  const text = edit.prompt ?? edit.description;
  const destination = p.destination ?? (bind?.org && bind?.app ? { org: bind.org, app: bind.app } : p.input?.org && p.input?.app ? { org: p.input.org, app: p.input.app } : null);
  const current = { ...reviewOf(p), destination };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const references = edit.references ?? current.references;
  let settings = p.settings;
  // The value's own problem is said first (audio on, an unknown setting); then whether this command lets it change.
  if (edit.settings !== undefined) {
    const checked = validateCommandSettings(p.command, edit.settings, { references });
    if (checked.error) return { error: checked.error, errors: [{ path: checked.path, message: checked.error }] };
    settings = checked.value;
  }
  const keys = [...(text !== undefined && text !== current.prompt ? ['description'] : []), ...EDITABLE_LISTS.filter(k => edit[k] !== undefined && !same(edit[k], current[k])),
    ...[...new Set([...Object.keys(settings), ...Object.keys(p.settings)])].filter(k => !same(settings[k], p.settings[k]))];
  const locked = edit.visual_constraints !== undefined && !same(edit.visual_constraints, current.visual_constraints) ? 'visual_constraints' : firstReadOnly(p.command, keys);
  if (locked) return { error: `${locked} cannot be edited on this proposal.`, code: 'field_not_editable' };
  if (!destination && keys.some(k => !(k in p.settings))) return { error: 'This proposal needs refreshing: ask for it again in chat.', code: 'proposal_canvas' };
  const fields = { ...current, settings, references, prompt: text ?? current.prompt };
  for (const k of EDITABLE_LISTS) if (edit[k] !== undefined) fields[k] = edit[k];
  const next = destination ? validateReview(fields) : { value: fields };
  if (next.error) return { error: next.error, code: next.code, errors: [{ path: next.field || 'prompt', message: next.error }] };
  const probs = validateCommandSettings(p.command, settings, { references: next.value.references });
  if (probs.error) return { error: probs.error, errors: [{ path: probs.path, message: probs.error }] };
  // Every save is the next revision, as it always was (a save of the same values included): the compare-and-swap decides which one lands.
  const r = next.value;
  const v3 = !!destination && !!(v2Secret(env));
  return { proposal: await signProposal(env, { command: p.command, title: r.title, description: p.description, settings, source_refs: p.source_refs, input: { ...p.input, ...bind }, prompt: r.prompt, references: r.references,
    ...Object.fromEntries(REVIEW_LISTS.map(k => [k, r[k]])), original_request: r.original_request, mode: r.mode, visual_constraints: r.visual_constraints, quote: r.quote, destination }, user, { id: p.proposal_id, version: p.version + 1, envelope: v3 ? 'v3' : null }) };
}

// MOT-22: ONE authoritative state per proposal, {version, sig, used}, kept as meta.proposalState on its root answer row (the
// first version's, in LEARN_DB chat_message_meta: no migration). Every revision is published, and the one Generate is consumed,
// by a compare-and-swap on that root row's exact text: a chat refinement (whichever row its answer lands on), a settings save
// (whichever card it edits) and a Generate can never both win, and only the published current revision starts, once.
// A proposal saved before this state existed takes its single highest version as its state; its first write moves it here.
// shortcut: threads has no (user, scope_ref) index, so this scans the learner's threads; add one with the next threads migration.
const RECORD = "SELECT mm.message_id, mm.meta_json FROM chat_message_meta mm JOIN threads t ON t.id = mm.thread_id WHERE t.user = ? AND t.scope_ref = ? AND mm.role = 'assistant' AND json_extract(mm.meta_json, '$.proposal.proposal_id') = ?";
export const PROPOSAL_STALE = 'A newer version of this proposal exists. Use the latest card in the chat.';
export const PROPOSAL_USED = 'This proposal already made a video. Ask for a new version in chat to make another.';
// The used text per capability (Motion's unchanged).
export const proposalUsedText = command => (command === 'explain' ? 'This proposal already made an explanation. Ask for a new version in chat to make another.' : command === 'generate-image' ? 'This proposal already made an image. Ask for a new one to make another.' : PROPOSAL_USED);
export const proposalState = p => ({ version: p.version, sig: p.sig, used: null });
// -> {rows, root, state, current}: current is the published revision's proposal (null while its answer is being written).
export async function proposalRecord(db, user, app, id) {
  const { results } = await db.prepare(RECORD).bind(user, app, id).all();
  const rows = results.map(r => ({ messageId: Number(r.message_id), raw: r.meta_json, meta: JSON.parse(r.meta_json) }));
  let root = rows.find(r => r.meta.proposalState);
  if (!root) {
    const top = Math.max(0, ...rows.map(r => r.meta.proposal.version)), latest = rows.filter(r => r.meta.proposal.version === top);
    root = latest.length === 1 ? latest[0] : null;
  }
  const state = root ? root.meta.proposalState ?? { ...proposalState(root.meta.proposal), used: root.meta.proposalUsed ?? null } : null;
  const holder = state ? rows.find(r => r.meta.proposal.sig === state.sig) : null;
  return { rows, root, state, current: holder?.meta.proposal ?? null, currentMessageId: holder ? String(holder.messageId) : null };
}
// The compare-and-swap every change goes through: the root row exactly as it was read. -> a statement; run() changes 1 when it landed.
const swapRoot = (db, root, state, meta = root.meta) => db.prepare('UPDATE chat_message_meta SET meta_json = ? WHERE message_id = ? AND meta_json = ?').bind(JSON.stringify({ ...meta, proposalState: state }), root.messageId, root.raw);
const landed = result => result?.meta?.changes === 1;
// A chat refinement publishes its new revision against the state its turn read. -> true when it became current.
export async function publishRevision(db, record, proposal) {
  return landed(await swapRoot(db, record.root, proposalState(proposal)).run());
}
// A settings save of the card at messageId (row: its meta and exact text), made from expectedVersion. -> {proposal} or {conflict}.
export async function saveRevision(db, record, { messageId, raw, meta }, proposal) {
  const state = proposalState(proposal);
  if (record.root.messageId === messageId) return landed(await swapRoot(db, record.root, state, { ...meta, proposal }).run()) ? { proposal } : { conflict: true };
  const [published] = await db.batch([swapRoot(db, record.root, state),
    db.prepare("UPDATE chat_message_meta SET meta_json = ? WHERE message_id = ? AND meta_json = ? AND EXISTS (SELECT 1 FROM chat_message_meta r WHERE r.message_id = ? AND json_extract(r.meta_json, '$.proposalState.sig') = ?)")
      .bind(JSON.stringify({ ...meta, proposal }), messageId, raw, record.root.messageId, proposal.sig)]);
  return landed(published) ? { proposal } : { conflict: true };
}
// Generate: -> null once p, the current revision on this canvas, is consumed by the press key (or already was, by this key),
// else {error, code}. Called before any hold or orchestrator call. dest {org, app}: the authorized canvas the request is for,
// from the server (learn-video.js forwardedLessonApp), compared with the canvas signed into the proposal. An old proposal
// without one is refused until its next revision (a settings change or a chat refinement) binds it.
export async function consumeProposal(db, p, user, dest, key) {
  if (!dest?.app || !dest.org || p.input?.app !== dest.app || p.input?.org !== dest.org) return { error: p.input?.app ? 'This proposal was made on another canvas. Ask for it again in chat here.' : 'This proposal needs refreshing: change a setting on its card or ask for it again in chat.', code: 'proposal_canvas' };
  const record = await proposalRecord(db, user, dest.app, p.proposal_id);
  if (!record.state) return { error: 'This proposal is not in your chat on this canvas. Ask for it again in chat.', code: 'proposal_stale' };
  if (record.state.used) return record.state.used.key === key ? null : { error: proposalUsedText(p.command), code: 'proposal_used' };
  if (record.state.sig !== p.sig) return { error: PROPOSAL_STALE, code: 'proposal_stale' };
  return landed(await swapRoot(db, record.root, { ...record.state, used: { version: p.version, key } }).run()) ? null : { error: PROPOSAL_STALE, code: 'proposal_stale' };
}
// A chat refinement revises the server's current revision, never the browser's copy. -> {proposal, record}, or null when the
// browser's is from another canvas, it already made its video, or none is current (the turn then proposes anew). An old
// unbound proposal is found on this canvas's chat and bound by the refinement (index.js signs the turn's canvas into its input).
export async function currentRevision(db, user, app, p) {
  if (!p || (p.input?.app != null && p.input.app !== app)) return null;
  try {
    const record = await proposalRecord(db, user, app, p.proposal_id);
    return record.state && !record.state.used && record.current ? { proposal: record.current, record } : null;
  } catch { return null; } // no chat tables on this database: nothing to revise
}

// What the orchestrator's Director takes as binding input (orchestrator.mjs approved_proposal).
export const approvedProposal = p => ({ title: p.title, duration_seconds: p.settings.duration_seconds, description: p.description });
