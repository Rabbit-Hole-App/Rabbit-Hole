// The composer on a shared canvas (docs/features/shared-canvas-ask.md). Pure, so the sign-in round trip,
// the draft and the history sent with a question are tested without a browser.

// Blocked storage (an embed in a browser that refuses third-party storage) throws on the read itself: a null store makes every reader below fall back.
const session = () => { try { return globalThis.sessionStorage; } catch { return null; } };
export const askPath = token => `/api/learn/boards/shared/${encodeURIComponent(token)}/ask`;
const draftKey = token => `small.shared-ask-draft:${token}`;
const chatKey = (token, viewer) => `small.shared-ask:${token}:${viewer}`;

const targetKey = token => `small.shared-ask-target:${token}`;
// Signed out, Send (or "Sign in to continue" after the guest trial, SHARE-03) keeps the draft and the attached card for this
// link and goes through sign-in, back here with ?ask=1 - as Fork does with ?fork=1 (ForkButton.jsx). Returns where to go.
// `page` is where the link opened: /b/<token> for a share, /e/<token> for an Explore publication.
// target: the selected card's pill ({ id, kind, title }), restored beside the draft; only its id is ever sent.
export function signInForAsk(token, draft, storage = session(), page = `/b/${token}`, target = null) {
  try {
    storage.setItem(draftKey(token), draft);
    if (target?.id) storage.setItem(targetKey(token), JSON.stringify({ id: target.id, kind: target.kind ?? null, title: target.title ?? null }));
  } catch { /* the draft is lost, sign-in still works */ }
  return `/login?next=${encodeURIComponent(`${page}?ask=1`)}`;
}

// Back from sign-in: the kept draft, once. It goes into the composer; the viewer presses Send.
export function takeDraft(token, storage = session()) {
  try { const draft = storage.getItem(draftKey(token)) || ''; storage.removeItem(draftKey(token)); return draft; } catch { return ''; }
}
// ...and the card it was about, once (null when none was attached).
export function takeTarget(token, storage = session()) {
  try { const target = JSON.parse(storage.getItem(targetKey(token)) || 'null'); storage.removeItem(targetKey(token)); return target?.id ? target : null; } catch { return null; }
}

// Guest Chat (SHARE-03, C:/s/spec/share/contract-guest-chat.md). A signed-out visitor's conversation is kept under GUEST in
// this tab; after sign-in it becomes the viewer's (adoptGuestChat), so the conversation survives authentication.
export const GUEST = 'guest';
export function adoptGuestChat(token, viewer, storage = session()) {
  if (!viewer || viewer === GUEST) return;
  const guest = loadChat(token, GUEST, storage);
  if (!guest.length) return;
  if (!loadChat(token, viewer, storage).length) saveChat(token, viewer, guest, storage);
  try { storage.removeItem(chatKey(token, GUEST)); } catch { /* nothing kept */ }
}
// One request identity per Send (X-RH-Action-Key), reused by its transport retry so the server counts it once.
export const sendKey = () => `ask-${crypto.randomUUID()}`;
// The guest trial as the server counts it: { limit, used, remaining }, or null signed in or unreadable (the server decides).
export async function readGuestAllowance(token, fetcher = globalThis.fetch) {
  try {
    const response = await fetcher(askPath(token), { headers: { 'Content-Type': 'application/json' } });
    return response.ok ? (await response.json()).guest ?? null : null;
  } catch { return null; }
}

// The viewer's own conversation about this link, in this tab only: never on the server, never the owner's.
export function loadChat(token, viewer, storage = session()) {
  try { const turns = JSON.parse(storage.getItem(chatKey(token, viewer)) || '[]'); return Array.isArray(turns) ? turns : []; } catch { return []; }
}
export function saveChat(token, viewer, turns, storage = session()) {
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
