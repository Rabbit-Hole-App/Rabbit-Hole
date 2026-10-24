// UI-15.1: the shared generation-review contract (docs/features/generation-review-contract.md). Pure and dependency free, so the
// browser (pill editor, confirmation card) and the control plane (signing, execution) read ONE definition of what a learner
// approves: the editable task prompt with inline reference pills, its ordered references, settings and destination.
//
// Prompt text carries a pill as the token {{ref:<id>}}. Text outside tokens escapes a backslash as \\ and a brace as \{, so a
// token can never be produced by (or collide with) anything a learner types: parsePrompt(serializePrompt(x)) is x for every x.
// A reference binds by its stable id in this proposal and by the source's identity AND revision, never by its label.

export const REVIEW_LIMITS = Object.freeze({ lines: 20, line: 300, title: 120, prompt: 4000, request: 500, label: 120, references: 8, constraints: 8, constraint: 200, sourceId: 600, revision: 128, range: 1024 });
// The ContextRef kinds (control-plane chat-modes.js KINDS: a test keeps the two lists equal).
export const REFERENCE_KINDS = Object.freeze(['doc', 'card', 'group', 'code', 'image', 'media', 'web', 'graph', 'file', 'excerpt', 'progress', 'canvas']);
export const REVIEW_MODES = Object.freeze(['generate', 'edit']);
export const REFERENCE_STATES = Object.freeze(['ok', 'changed', 'deleted', 'inaccessible', 'unsupported']);

const LISTS = ['requirements', 'assumptions', 'missing_information', 'limitations'];
const REF_ID = /^[A-Za-z0-9_-]{1,32}$/;
const REVISION = /^[A-Za-z0-9:._@+=-]{1,128}$/;
const TOKEN = /\{\{ref:([A-Za-z0-9_-]{1,32})\}\}/y;
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const bad = (code, error, field = null) => ({ error, code, ...(field ? { field } : {}) });
const squash = text => String(text).replace(/\s+/g, ' ').trim();

// ---- the pill grammar ----
export const pillToken = id => `{{ref:${id}}}`;
export const escapeText = text => String(text).replace(/[\\{]/g, char => `\\${char}`);
// -> { segments: [{ text } | { ref: id }] } or { error, code: 'prompt_syntax', at } for a brace or backslash that is neither
// an escape nor a whole token. Adjacent text is one segment; empty text is dropped.
export function parsePrompt(prompt) {
  if (typeof prompt !== 'string') return bad('prompt_syntax', 'The prompt must be text.', 'prompt');
  const segments = [];
  let text = '';
  const flush = () => { if (text) segments.push({ text }); text = ''; };
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt[i];
    if (char === '\\') {
      const next = prompt[i + 1];
      if (next !== '\\' && next !== '{') return { ...bad('prompt_syntax', 'A backslash in the prompt must be doubled.', 'prompt'), at: i };
      text += next; i++;
    } else if (char === '{') {
      TOKEN.lastIndex = i;
      const match = TOKEN.exec(prompt);
      if (!match) return { ...bad('prompt_syntax', 'A reference in the prompt is not complete.', 'prompt'), at: i };
      flush(); segments.push({ ref: match[1] }); i += match[0].length - 1;
    } else text += char;
  }
  flush();
  return { segments };
}
export const serializePrompt = segments => segments.map(s => (s.ref !== undefined ? pillToken(s.ref) : escapeText(s.text))).join('');
// The ids a prompt mentions, in order of first appearance.
export const mentionedIds = segments => [...new Set(segments.filter(s => s.ref !== undefined).map(s => s.ref))];

// ---- references ----
const sortKeys = value => (Array.isArray(value) ? value.map(sortKeys) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])])) : value);
// -> { value } | { error, code, field }. Exactly {id, label, kind, sourceId, revision, range}; nothing else is carried.
export function validateReference(input, at = 'reference') {
  if (!plain(input)) return bad('reference_invalid', `${at} must be an object.`, at);
  const extra = Object.keys(input).find(k => !['id', 'label', 'kind', 'sourceId', 'revision', 'range'].includes(k));
  if (extra) return bad('reference_invalid', `${at}.${extra} is not a reference field.`, at);
  if (!REF_ID.test(input.id ?? '')) return bad('reference_invalid', `${at}.id must be 1 to 32 letters, digits, - or _.`, at);
  const label = typeof input.label === 'string' ? squash(input.label) : '';
  if (!label || label.length > REVIEW_LIMITS.label) return bad('reference_invalid', `${at}.label must be 1 to ${REVIEW_LIMITS.label} characters.`, at);
  if (!REFERENCE_KINDS.includes(input.kind)) return bad('reference_invalid', `${at}.kind is not a known kind.`, at);
  if (typeof input.sourceId !== 'string' || !input.sourceId || input.sourceId.length > REVIEW_LIMITS.sourceId) return bad('reference_invalid', `${at}.sourceId is required.`, at);
  if (typeof input.revision !== 'string' || !REVISION.test(input.revision)) return bad('reference_invalid', `${at}.revision is required: a reference binds to one revision of its source.`, at);
  const range = input.range ?? null;
  if (range !== null && (!plain(range) || JSON.stringify(range).length > REVIEW_LIMITS.range)) return bad('reference_invalid', `${at}.range must be an object or null.`, at);
  return { value: { id: input.id, label, kind: input.kind, sourceId: input.sourceId, revision: input.revision, range: range === null ? null : sortKeys(range) } };
}
const rangeKey = r => JSON.stringify(r.range ?? null);
// The kind's own revision when the id carries it (file:<fs id>@<sha256>), else the ref's version string. null: nothing to bind to.
export const revisionOfContextRef = ref => (ref?.kind === 'file' ? /@([0-9a-f]{64})$/.exec(ref.sourceId)?.[1] : null) ?? (typeof ref?.version === 'string' && REVISION.test(ref.version) ? ref.version : null);
// The next free pill id for a prompt in progress: r1, r2, ...
export function nextReferenceId(references) {
  const used = new Set((references || []).map(r => r.id));
  for (let n = 1; ; n++) if (!used.has(`r${n}`)) return `r${n}`;
}
// An attached ContextRef (web/chat-context.js) as a reference. typeLabel: the card's kind as the learner reads it ("CAD").
// -> { value } | { error }. The label is "<type> · <title>"; two cards with one title stay distinct by id and source.
export function referenceFromContextRef(ref, id, typeLabel = '') {
  const revision = revisionOfContextRef(ref);
  if (!revision) return bad('reference_invalid', 'This card has no saved revision to bind to. Save it first.', 'revision');
  return validateReference({ id, label: typeLabel ? `${typeLabel} · ${ref.name}` : ref.name, kind: ref.kind, sourceId: ref.sourceId, revision, range: ref.range ?? null });
}

// ---- the review: what the learner approves ----
// Fields: { command, mode, original_request, title, prompt, visual_constraints, references, requirements, assumptions, missing_information,
// limitations, settings, quote, destination } (the four lists are the schema's string lists, [] when a command shows none).
// Settings are command-specific and validated by their command (generation-proposal.js validateSettings); here they are opaque.
// quote: null, or { estimate_credits, reserve_credits } (integers or null) once a generator prices the request before approval.
// -> { value } | { error, code, field } with every check a learner or a tamperer can fail.
export function validateReview(input) {
  if (!plain(input)) return bad('review_invalid', 'The review must be an object.');
  const command = typeof input.command === 'string' && /^[a-z0-9-]{1,32}$/.test(input.command) ? input.command : null;
  if (!command) return bad('review_invalid', 'The review needs a command.', 'command');
  const mode = input.mode ?? 'generate';
  if (!REVIEW_MODES.includes(mode)) return bad('review_invalid', `mode must be ${REVIEW_MODES.join(' or ')}.`, 'mode');
  const original_request = typeof input.original_request === 'string' ? input.original_request : '';
  if (original_request.length > REVIEW_LIMITS.request) return bad('review_invalid', `The original request is at most ${REVIEW_LIMITS.request} characters.`, 'original_request');
  const title = typeof input.title === 'string' ? squash(input.title) : '';
  if (!title || title.length > REVIEW_LIMITS.title) return bad('review_invalid', `The title must be 1 to ${REVIEW_LIMITS.title} characters.`, 'title');
  if (typeof input.prompt !== 'string' || input.prompt.length > REVIEW_LIMITS.prompt) return bad('prompt_invalid', `The prompt must be text of at most ${REVIEW_LIMITS.prompt} characters.`, 'prompt');
  const parsed = parsePrompt(input.prompt);
  if (parsed.error) return parsed;
  if (!parsed.segments.some(s => s.text && /\S/.test(s.text))) return bad('prompt_invalid', 'The prompt needs words, not only references.', 'prompt');
  const list = input.references ?? [];
  if (!Array.isArray(list) || list.length > REVIEW_LIMITS.references) return bad('reference_invalid', `At most ${REVIEW_LIMITS.references} references can be attached.`, 'references');
  const references = [];
  for (let i = 0; i < list.length; i++) {
    const one = validateReference(list[i], `references[${i}]`);
    if (one.error) return one;
    if (references.some(r => r.id === one.value.id)) return bad('reference_duplicate', `Reference id ${one.value.id} is used twice.`, 'references');
    if (references.some(r => r.sourceId === one.value.sourceId && rangeKey(r) === rangeKey(one.value))) return bad('reference_duplicate', 'The same part of the same source is attached twice.', 'references');
    references.push(one.value);
  }
  const mentioned = mentionedIds(parsed.segments), known = new Set(references.map(r => r.id));
  const unknown = mentioned.find(id => !known.has(id));
  if (unknown) return bad('prompt_reference_unknown', `The prompt names a reference (${unknown}) that is not attached.`, 'prompt');
  const unmentioned = references.find(r => !mentioned.includes(r.id));
  if (unmentioned) return bad('reference_unmentioned', `${unmentioned.label} is attached but the prompt does not say how it is used.`, 'references');
  const constraints = input.visual_constraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > REVIEW_LIMITS.constraints || constraints.some(c => typeof c !== 'string' || !squash(c) || squash(c).length > REVIEW_LIMITS.constraint)) return bad('review_invalid', `Constraints are at most ${REVIEW_LIMITS.constraints} short sentences.`, 'visual_constraints');
  const lists = {};
  for (const key of LISTS) {
    const lines = input[key] ?? [];
    if (!Array.isArray(lines) || lines.length > REVIEW_LIMITS.lines || lines.some(l => typeof l !== 'string' || !squash(l) || squash(l).length > REVIEW_LIMITS.line)) return bad('review_invalid', `${key} is at most ${REVIEW_LIMITS.lines} short lines.`, key);
    lists[key] = lines.map(squash);
  }
  if (!plain(input.settings)) return bad('review_invalid', 'The settings must be an object.', 'settings');
  const dest = input.destination;
  if (!plain(dest) || typeof dest.org !== 'string' || !dest.org || typeof dest.app !== 'string' || !dest.app || Object.keys(dest).length !== 2) return bad('review_invalid', 'The destination is {org, app}.', 'destination');
  const quote = input.quote ?? null;
  const credits = v => v === null || (Number.isSafeInteger(v) && v >= 0);
  if (quote !== null && (!plain(quote) || Object.keys(quote).some(k => !['estimate_credits', 'reserve_credits'].includes(k)) || !credits(quote.estimate_credits ?? null) || !credits(quote.reserve_credits ?? null))) return bad('review_invalid', 'The quote is {estimate_credits, reserve_credits}.', 'quote');
  return { value: { command, mode, original_request, title, prompt: input.prompt, visual_constraints: constraints.map(squash), references, ...lists, settings: sortKeys(input.settings), quote: quote === null ? null : { estimate_credits: quote.estimate_credits ?? null, reserve_credits: quote.reserve_credits ?? null }, destination: { org: dest.org, app: dest.app } } };
}

// The prompt with each pill as its label: what a model or an older card reads as plain text.
export function plainPrompt(prompt, references) {
  const parsed = parsePrompt(prompt);
  if (parsed.error) return null;
  const label = new Map((references || []).map(r => [r.id, r.label]));
  return parsed.segments.map(s => (s.ref !== undefined ? label.get(s.ref) ?? '' : s.text)).join('');
}
// For the editor and the card: the prompt as text and pill segments, each pill carrying its whole reference. -> segments | null.
export function promptSegments(prompt, references) {
  const parsed = parsePrompt(prompt);
  if (parsed.error) return null;
  const by = new Map((references || []).map(r => [r.id, r]));
  return parsed.segments.map(s => (s.ref !== undefined ? { type: 'ref', id: s.ref, reference: by.get(s.ref) ?? null } : { type: 'text', text: s.text }));
}
// Removing a reference updates both the prompt and the submitted inputs: its pills become its label as plain words (so the
// sentence still reads and the learner edits it), or vanish with asLabel false. -> { prompt, references }.
export function removeReference(fields, id, { asLabel = true } = {}) {
  const parsed = parsePrompt(fields.prompt);
  const label = fields.references.find(r => r.id === id)?.label ?? '';
  const segments = parsed.segments.map(s => (s.ref === id ? { text: asLabel ? label : '' } : s));
  return { prompt: serializePrompt(segments), references: fields.references.filter(r => r.id !== id) };
}

// ---- the canonical form and its hash: what approval binds to ----
// Order is fixed; object keys are sorted; the label is part of it because an older card and the executors read the prompt with
// labels. proposal id and revision are NOT: they are the envelope's (signed with it), so equal content hashes equal.
export function canonicalReview(fields) {
  const r = fields.references || [];
  return JSON.stringify(['generation-review/1', fields.command, fields.mode ?? 'generate', fields.original_request ?? '', fields.title, fields.prompt, fields.visual_constraints ?? [],
    r.map(x => [x.id, x.label, x.kind, x.sourceId, x.revision, sortKeys(x.range ?? null)]), LISTS.map(k => fields[k] ?? []), sortKeys(fields.settings ?? {}), [fields.destination?.org ?? null, fields.destination?.app ?? null], fields.quote ? sortKeys(fields.quote) : null]);
}
export async function reviewHash(fields) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalReview(fields)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- a proposal as a review (v3 carries it; v2 is derived) ----
// proposal: a signed proposal (control-plane generation-proposal.js). A v2 proposal has the model's description as its prompt and no
// references; its destination is the canvas bound into its input. -> the review fields (not validated: validateReview does that).
export function reviewOf(p) {
  if (Array.isArray(p?.references) && typeof p.prompt === 'string') {
    return { command: p.command, mode: p.mode ?? 'generate', original_request: p.original_request ?? '', title: p.title, prompt: p.prompt, visual_constraints: p.visual_constraints ?? [], references: p.references, ...Object.fromEntries(LISTS.map(k => [k, p[k] ?? []])), settings: p.settings, quote: p.quote ?? null, destination: p.destination };
  }
  return { command: p?.command, mode: 'generate', original_request: p?.input?.request ?? '', title: p?.title, prompt: escapeText(p?.description ?? ''), visual_constraints: [], references: [], settings: p?.settings ?? {}, quote: null, destination: { org: p?.input?.org, app: p?.input?.app } };
}
export const REVIEW_LISTS = LISTS;
export const isReviewProposal = p => typeof p?.sig === 'string' && p.sig.startsWith('v3.');

// A user edit on a proposal: the edit may carry prompt, references and settings (never command, mode, request or destination).
// -> { value: review fields, changed } | { error, code, field }. The next revision is signed from value.
export function applyEdit(current, edit) {
  if (!plain(edit)) return bad('review_invalid', 'The edit must be an object.');
  const extra = Object.keys(edit).find(k => !['prompt', 'references', 'settings', 'title', 'visual_constraints', ...LISTS].includes(k));
  if (extra) return bad('review_invalid', `${extra} cannot be edited.`, extra);
  const next = validateReview({ ...current, ...Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)) });
  if (next.error) return next;
  return { value: next.value, changed: canonicalReview(next.value) !== canonicalReview(current) };
}

// ---- reference state ----
// probe: what the server found for a reference now: { exists, access, supported, revision }. Missing keys mean "no problem":
// supported false is unsupported, exists false deleted, access false inaccessible, a different revision changed.
export function classifyReference(reference, probe = {}) {
  if (probe.supported === false) return 'unsupported';
  if (probe.exists === false) return 'deleted';
  if (probe.access === false) return 'inaccessible';
  if (probe.revision != null && probe.revision !== reference.revision) return 'changed';
  return 'ok';
}
const MESSAGES = {
  ok: () => null,
  changed: label => `${label} changed after you attached it. Review the prompt, then attach it again.`,
  deleted: label => `${label} was deleted. Remove it or attach another card.`,
  inaccessible: label => `${label} is not available to you. Remove it or ask for access.`,
  unsupported: label => `${label} cannot be used by this generator yet. Remove it from the prompt.`,
};
export const referenceMessage = (state, label) => MESSAGES[state]?.(label) ?? null;
// { id, label, state, message } for each reference, probes by id. The draft is never dropped: a blocked review stays editable.
export const referenceStates = (references, probes = {}) => references.map(r => { const state = classifyReference(r, probes[r.id] ?? {}); return { id: r.id, label: r.label, state, message: referenceMessage(state, r.label) }; });
export const blockedReferences = states => states.filter(s => s.state !== 'ok');
