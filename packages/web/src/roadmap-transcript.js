// Fix B (T4, owner plan 5.1): the roadmap's Chat lines as transcript items, drawn by the existing ChatMessage (ChatMessages.jsx)
// and ChatOutputs (Go to card). Pure: everything is derived from the polled server view (chatOf), so a poll or a reload redraws
// the same items under the same keys and never appends a duplicate. Nothing here is a learner message, and nothing is stored:
// the server's roadmap is the record. The one saved message is the invitation that opened the Tutor thread (chat-persist.js).
import { chatOf, pillOf } from './roadmap-client.js';
import { STRINGS } from './roadmap-strings.js';

// The client_id the invitation is saved under: one per invitation, so a retried save writes it once (canvases.js saveChatMessage).
export const invitationClientId = invitationId => `roadmap-inv-${String(invitationId).replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 80);

const say = (key, content, extra = {}) => ({ key, m: { role: 'assistant', content, status: 'done', meta: { roadmap: key } }, ...extra });
// A line still in progress: ChatMessage's waiting row (spinner and its words), the same one an answer shows while it streams.
const waiting = (key, text) => ({ key, m: { role: 'assistant', content: '', status: text, meta: { roadmap: key } } });
const WAITING = new Set(['planning']);

// -> [{ key, m, actions?, outputs?, depth?, pill?, review? }]. invitation: invitationOf; saved: the open thread already shows the saved
// invitation sentence; choosing: Explain on canvas was pressed for this invitation, so its Depth is confirmed before planning (T5).
// actions: [{ id, label, run: { kind, ... } }] for the page to wire to the controller; outputs: ChatOutputs' shape; depth: the
// DepthMenu and Start planning row; pill: pillOf (the same Accept [Tab] | Cancel as the canvas); review: the line opens Contents.
export function transcriptOf(state, { invitation = null, saved = false, choosing = false } = {}) {
  const items = [];
  if (invitation) {
    const actions = choosing ? [] : invitation.choices.map(choice => ({ id: choice.id, label: choice.label, run: { kind: choice.id } }));
    items.push(saved ? { key: `invitation:${invitation.id}`, m: null, ...(actions.length ? { actions } : {}) } : say(`invitation:${invitation.id}`, invitation.text, actions.length ? { actions } : {}));
    if (choosing) items.push(say(`invitation:${invitation.id}:depth`, STRINGS.chooseDepth(state.invitation?.title || ''), { depth: true }));
  }
  const rid = state.view?.roadmap?.id || 'none';
  for (const line of chatOf(state)) {
    const key = `${rid}:${line.id}`;
    if (WAITING.has(line.id) || /^(making|held):/.test(line.id)) { items.push(waiting(key, line.text)); continue; }
    if (line.id === 'plan') { items.push({ key, m: null, review: line.text }); continue; } // the line itself opens Contents (owner 2026-11-06)
    const text = line.label ? `${line.label}\n\n${line.text}` : line.text;
    const actions = line.kind === 'question' ? line.options.map(o => ({ id: o.id, label: o.label, run: { kind: 'answer', optionId: o.id } }))
      : line.kind === 'coverage' ? line.choices.map(c => ({ id: `${c.locationId}:${c.part}`, label: c.label, run: { kind: 'part', choice: c } }))
      : line.kind === 'limitation' ? line.offers.map(o => ({ id: o.kind, label: o.label, run: { kind: 'offer', offer: o } }))
      : [];
    items.push(say(key, line.kind === 'coverage' && line.notes?.length ? `${text}\n\n${line.notes.join('\n\n')}` : text, actions.length ? { actions } : {}));
  }
  // The pending proposal: its title and description, and the canvas's own Accept [Tab] | Cancel for the same version.
  const pill = pillOf(state);
  if (pill) items.push(say(`${rid}:proposal:${pill.proposalId}:${pill.version}`, pill.description ? `**${pill.title}**\n\n${pill.description}` : `**${pill.title}**`, { pill }));
  // Accepted work: a delivered card is reached by Go to card; a failed one says so in Chat's error row. No Retry (owner, 2026-11-06).
  const view = state.view;
  for (const r of view?.results || []) {
    const step = view.steps?.find(s => s.id === r.stepId);
    if (r.failure) items.push(say(`${rid}:failed:${r.id}`, `✗ ${r.failure.message}`));
    else if (r.delivery === 'delivered' && r.slot?.cardId) items.push({ key: `${rid}:delivered:${r.id}`, m: null, outputs: [{ cardId: r.slot.cardId, kind: 'explanation', title: step?.title || '' }] });
  }
  return items;
}
// ponytail: no Edit for the proposal in Chat (ROADMAP_EDIT_ENABLED is off in production); refinement stays in the Contents conversation.
