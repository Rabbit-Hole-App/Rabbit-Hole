// The composer on a shared canvas (docs/features/shared-canvas-ask.md). Pure, so the sign-in round trip,
// the draft and the history sent with a question are tested without a browser.

export const askPath = token => `/api/learn/boards/shared/${encodeURIComponent(token)}/ask`;
const draftKey = token => `small.shared-ask-draft:${token}`;
const chatKey = (token, viewer) => `small.shared-ask:${token}:${viewer}`;

// Signed out, Send keeps the draft for this link and goes through sign-in, back here with ?ask=1 - as Fork
// does with ?fork=1 (ForkButton.jsx). Returns where to go.
// `page` is where the link opened: /b/<token> for a share, /e/<token> for an Explore publication.
export function signInForAsk(token, draft, storage = globalThis.sessionStorage, page = `/b/${token}`) {
  try { storage.setItem(draftKey(token), draft); } catch { /* the draft is lost, sign-in still works */ }
  return `/login?next=${encodeURIComponent(`${page}?ask=1`)}`;
}

// Back from sign-in: the kept draft, once. It goes into the composer; the viewer presses Send.
export function takeDraft(token, storage = globalThis.sessionStorage) {
  try { const draft = storage.getItem(draftKey(token)) || ''; storage.removeItem(draftKey(token)); return draft; } catch { return ''; }
}

// The viewer's own conversation about this link, in this tab only: never on the server, never the owner's.
export function loadChat(token, viewer, storage = globalThis.sessionStorage) {
  try { const turns = JSON.parse(storage.getItem(chatKey(token, viewer)) || '[]'); return Array.isArray(turns) ? turns : []; } catch { return []; }
}
export function saveChat(token, viewer, turns, storage = globalThis.sessionStorage) {
  try { storage.setItem(chatKey(token, viewer), JSON.stringify(turns)); } catch { /* the chat lasts until reload */ }
}

// What rides with a question: answered pairs only (a failed or stopped answer and its question stay out),
// the last HISTORY_TURNS - the server caps the same.
export const HISTORY_TURNS = 10;
export function askHistory(turns) {
  const pairs = [];
  turns.forEach((turn, i) => {
    const next = turns[i + 1];
    if (turn.role === 'user' && next?.role === 'assistant' && next.content && !next.error && !next.pending) pairs.push({ role: 'user', content: turn.content }, { role: 'assistant', content: next.content });
  });
  return pairs.slice(-HISTORY_TURNS);
}
