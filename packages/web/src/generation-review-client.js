// UI-15.1: the thin client API for a generation proposal's review (docs/features/generation-review-contract.md). No UI, no React:
// the shared renderer (GenerationProposalCard) and the pill editor call these. `api` is web/src/api.js api(path, opts), which throws
// an Error carrying { status, data } for a non-2xx answer; tests pass a fake.
//
//   fetchProposal  GET  /api/learn/chat/messages/:id/proposal      -> { proposal, message_id, used, references, view }
//   saveProposal   PUT  the same path with { expected_version, ...edit } -> { proposal, references, view }
//   confirmProposal  one in-flight Generate per proposal revision; the generator's own start call is passed in (the adapter).
// Saving never calls a model. Generate is allowed only for the SAVED current revision with no unsaved edits (canGenerate).
import { changedKeys, proposalView } from './generation-confirmation-schema.js';

const path = messageId => `/api/learn/chat/messages/${encodeURIComponent(messageId)}/proposal`;
const asView = (proposal, references, extra = {}) => proposalView(proposal, { validation_errors: references.filter(r => r.state !== 'ok').map(r => ({ path: `references.${r.id}`, message: r.message })), ...extra });

export async function fetchProposal(api, messageId) {
  const data = await api(path(messageId));
  return { ...data, view: asView(data.proposal, data.references || [], data.used ? { status: 'completed' } : {}) };
}

// edit: any of settings, description, title, references, requirements, assumptions, missing_information, limitations (the
// schema says which a command may change). base: the revision the edit was made from. -> { proposal, references, view }
export async function saveProposal(api, messageId, base, edit) {
  const data = await api(path(messageId), { method: 'PUT', body: JSON.stringify({ expected_version: base.version, ...edit }) });
  return { ...data, view: asView(data.proposal, data.references || []) };
}

// What a failed save or Generate means for the person. The draft is never dropped: every kind keeps it.
//   stale     a newer revision exists (another tab, a chat refinement): `current` is it, shown beside the draft
//   used      the proposal already started; nothing is editable
//   invalid   a field or the prompt is wrong: `errors` are { path, message }
//   references  a reference is changed, deleted, inaccessible or unsupported: `states` are every reference with its words
//   refused   the proposal expired, is for another canvas or learner: it must be asked for again
//   failed    anything else, with the message
export function problemOf(error) {
  const status = error?.status, data = error?.data || {};
  if (status === 409 && data.code === 'reference_blocked') return { kind: 'references', states: data.references || [], message: data.error };
  if (status === 409 && data.code === 'proposal_used') return { kind: 'used', message: data.error, current: data.current ?? null };
  if (status === 409 && (data.code === 'proposal_stale' || data.current)) return { kind: 'stale', message: data.error, current: data.current ?? null, currentMessageId: data.current_message_id ?? null };
  if (status === 409 && ['proposal_canvas', 'proposal_refused', 'brief_stale', 'proposal_invalid'].includes(data.code)) return { kind: 'refused', code: data.code, message: data.error };
  if (status === 400 || status === 422) return { kind: 'invalid', message: data.error || error.message, errors: data.errors || [], code: data.code ?? null };
  return { kind: 'failed', message: data.error || error?.message || 'Something went wrong.' };
}

// Generate is for the saved, current, valid revision only: no unsaved edits, nothing in validation_errors or missing information,
// and the schema's allowed actions say so. draft: the form's unsaved changes ({ title, description, settings, ... }) or null.
export function canGenerate(view, draft = null) {
  return view.allowed_actions.includes('generate') && !(draft && changedKeys(view, draft).length);
}

// One press, one job: a second call for the same proposal revision while the first is in flight (or after it started) returns the
// first's promise. start(proposal) is the generator adapter's call (it creates the output card, or approves the existing job).
const pressed = new Map();
export function confirmProposal(proposal, start) {
  const key = `${proposal.proposal_id}:${proposal.version}`;
  if (pressed.has(key)) return pressed.get(key);
  const run = Promise.resolve().then(() => start(proposal)).catch(error => { pressed.delete(key); throw error; }); // a refused start can be pressed again
  pressed.set(key, run);
  return run;
}
export const forgetPress = proposal => pressed.delete(`${proposal.proposal_id}:${proposal.version}`);
