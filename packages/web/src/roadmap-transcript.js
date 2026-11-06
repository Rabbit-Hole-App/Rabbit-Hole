// Fix B (T4, owner plan 5.1): the roadmap's Chat lines as transcript items, drawn by the existing ChatMessage (ChatMessages.jsx)
// and ChatOutputs (Go to card). Pure: everything is derived from the polled server view (chatOf), so a poll or a reload redraws
// the same items under the same keys and never appends a duplicate. Nothing here is a learner message, and nothing is stored:
// the server's roadmap is the record. The one saved message is the invitation that opened the Tutor thread (chat-persist.js).
import { chatOf } from './roadmap-client.js';

// The client_id the invitation is saved under: one per invitation, so a retried save writes it once (canvases.js saveChatMessage).
export const invitationClientId = invitationId => `roadmap-inv-${String(invitationId).replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 80);

const say = (key, content, extra = {}) => ({ key, m: { role: 'assistant', content, status: 'done', meta: { roadmap: key } }, ...extra });
// A line still in progress: ChatMessage's waiting row (spinner and its words), the same one an answer shows while it streams.
const waiting = (key, text) => ({ key, m: { role: 'assistant', content: '', status: text, meta: { roadmap: key } } });
const WAITING = new Set(['planning']);

// -> [{ key, m, actions?, outputs? }]. invitation: invitationOf; saved: the open thread already shows the saved invitation sentence.
// actions: [{ id, label, primary?, run: { kind, ... } }] for the page to wire to the controller; outputs: ChatOutputs' shape.
export function transcriptOf(state, { invitation = null, saved = false } = {}) {
  const items = [];
  if (invitation) {
    const actions = invitation.choices.map((choice, index) => ({ id: choice.id, label: choice.label, primary: index === 0, run: { kind: choice.id } }));
    items.push(saved ? { key: `invitation:${invitation.id}`, m: null, actions } : say(`invitation:${invitation.id}`, invitation.text, { actions }));
  }
  const rid = state.view?.roadmap?.id || 'none';
  for (const line of chatOf(state)) {
    const key = `${rid}:${line.id}`;
    if (WAITING.has(line.id) || /^(making|held):/.test(line.id)) { items.push(waiting(key, line.text)); continue; }
    const text = line.label ? `${line.label}\n\n${line.text}` : line.text;
    const actions = line.kind === 'question' ? line.options.map(o => ({ id: o.id, label: o.label, run: { kind: 'answer', optionId: o.id } }))
      : line.kind === 'coverage' ? line.choices.map(c => ({ id: `${c.locationId}:${c.part}`, label: c.label, run: { kind: 'part', choice: c } }))
      : line.kind === 'limitation' ? line.offers.map(o => ({ id: o.kind, label: o.label, run: { kind: 'offer', offer: o } }))
      : [];
    items.push(say(key, line.kind === 'coverage' && line.notes?.length ? `${text}\n\n${line.notes.join('\n\n')}` : text, actions.length ? { actions } : {}));
  }
  // Accepted work: a delivered card is reached by Go to card; a failed one says so in Chat's error row. No Retry (owner, 2026-11-06).
  const view = state.view;
  for (const r of view?.results || []) {
    const step = view.steps?.find(s => s.id === r.stepId);
    if (r.failure) items.push(say(`${rid}:failed:${r.id}`, `✗ ${r.failure.message}`));
    else if (r.delivery === 'delivered' && r.slot?.cardId) items.push({ key: `${rid}:delivered:${r.id}`, m: null, outputs: [{ cardId: r.slot.cardId, kind: 'explanation', title: step?.title || '' }] });
  }
  return items;
}
// ponytail: the proposal pending (Accept/Cancel in Chat), the Depth confirmation and a Review roadmap link wait for the owner's
// answer to the reuse questions (Q2-Q4, 2026-11-06); until then the canvas slot and Contents keep those actions.
