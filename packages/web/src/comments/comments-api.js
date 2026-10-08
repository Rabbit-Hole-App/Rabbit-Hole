// The comments client (docs/features/canvas-comments.md section 10): one shape for both route families, so the panel
// works the same on your canvas (member family, by board id) and on a published page (public family, by token).
import { api } from '../api.js';

export const BODY_MAX = 5000;
export const COUNTER_FROM = 4500;
export const memberBase = boardId => `/api/learn/c/${encodeURIComponent(boardId)}`;
export const publicBase = token => `/api/learn/boards/shared/${encodeURIComponent(token)}/comments`;

const send = (url, body, method = 'POST') => api(url, { method, body: JSON.stringify(body ?? {}) });
export const commentsApi = base => ({
  base,
  about: () => api(base),
  threads: (status = 'open', audience = 'all', cursor = null) => api(`${base}/threads?status=${status}${audience !== 'all' ? `&audience=${audience}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  thread: (id, before = null) => api(`${base}/threads/${id}${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  start: body => send(`${base}/threads`, body),
  reply: (threadId, body) => send(`${base}/threads/${threadId}/comments`, body),
  edit: (id, body) => send(`${base}/comments/${id}`, { body, mentions: mentionsIn(body) }, 'PATCH'),
  people: (q, scope) => api(`${base}/people?q=${encodeURIComponent(q)}&${scope.thread ? `thread=${scope.thread}` : `audience=${scope.audience}`}`),
  remove: id => api(`${base}/comments/${id}`, { method: 'DELETE' }),
  resolve: (id, reopen) => send(`${base}/threads/${id}/${reopen ? 'reopen' : 'resolve'}`),
  read: id => send(`${base}/threads/${id}/read`),
  block: (commentId, removeComments = false) => send(`${base}/blocks`, { comment_id: commentId, remove_comments: removeComments }),
  blocks: () => api(`${base}/blocks`),
  unblock: id => api(`${base}/blocks/${id}`, { method: 'DELETE' }),
});

// Every @handle typed in a body, as the server's mapping wants it (UTF-16 pos and len of '@handle'). The server keeps only
// those in the audience's set; the rest stay plain text.
export const mentionsIn = body => [...body.matchAll(/(^|\s)@([A-Za-z0-9_]{1,40})/g)].map(m => ({ pos: m.index + m[1].length, len: m[2].length + 1, handle: m[2] }));

// A post carries a client-made id, so a retry of one that landed returns it instead of posting twice. An id_conflict is
// a client bug, never a user state: the draft is resent once with a fresh id.
export async function sendDraft(post, draft, fresh = () => crypto.randomUUID()) {
  try { return await post(draft.id); } catch (error) {
    if (error?.data?.code !== 'id_conflict') throw error;
    return post(fresh());
  }
}

// What a failed send says (section 11). Offline never sends by itself: Retry is the one send control.
export function failureText(error, online = true) {
  if (!online || error instanceof TypeError) return "You're offline. Your reply is saved here. Press Retry when you're back.";
  return error?.data?.error || "Couldn't send.";
}

// A draft (its client id, text and failure) lives in session storage per thread, so a reload or a failed send keeps it.
// Storage that throws (private mode, blocked) keeps the draft in memory only.
const draftKey = key => `rh-comment-draft:${key}`;
export const freshDraft = () => ({ id: crypto.randomUUID(), body: '', failed: null });
export function loadDraft(storage, key) {
  try { const saved = JSON.parse(storage().getItem(draftKey(key)) || 'null'); return saved && typeof saved.body === 'string' && saved.id ? saved : null; } catch { return null; }
}
export function saveDraft(storage, key, draft) {
  try { if (draft.body || draft.failed) storage().setItem(draftKey(key), JSON.stringify(draft)); else storage().removeItem(draftKey(key)); } catch { /* memory only */ }
}

// "now", "5m", "3h", "Oct 7": short, like the rest of the canvas chrome.
export function when(iso, now = Date.now()) {
  const at = new Date(iso).getTime();
  const minutes = Math.floor((now - at) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A person by what the server sends: name, else @handle, else the neutral label (Q18).
export const displayName = author => author?.name || (author?.handle ? `@${author.handle}` : 'Rabbit Hole user');
