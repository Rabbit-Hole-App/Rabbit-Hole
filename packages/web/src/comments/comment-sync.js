// The open thread's sync (docs/features/canvas-comments.md section 10, Sync protocol), shared by the server
// (control-plane canvas-comments.js readThread) and the panel's ThreadView, so both sides read one contract:
// - every thread read answers `cursor`, the server's time when it began reading;
// - `GET …/threads/:id?since=<cursor>` answers the messages created, edited or deleted after the cursor less an overlap,
//   plus the thread as it now is; more changes than one page answer a full read with `reset: true`;
// - the reader merges by message id, so the overlap, a retry or a replayed cursor after a reconnect never shows a
//   message twice.
export const SYNC_MS = 10_000;
// A write stamped just before a read began can commit just after it (and isolates' clocks differ by a little): each
// since-read reaches back this far, and the merge by id makes the repeats harmless.
export const SYNC_OVERLAP_MS = 60_000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// Server: the instant a since-read starts from, or null for a missing or malformed cursor (then it is a full read).
export function changesFrom(cursor) {
  if (typeof cursor !== 'string' || !ISO.test(cursor)) return null;
  const at = Date.parse(cursor);
  return Number.isFinite(at) ? new Date(at - SYNC_OVERLAP_MS).toISOString() : null;
}

// Oldest first, as the thread shows them; created_at then id, the server's order.
const order = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The shown messages with the changed ones in place (an edit or a delete replaces its message; a new one joins in order).
// `earlier`: older replies exist that the reader has not loaded, so a change to one of them stays out until they load it.
export function mergeMessages(current, changed, earlier = false) {
  const first = current[0];
  const by = new Map(current.map(message => [message.id, message]));
  for (const message of changed) if (by.has(message.id) || !earlier || !first || order(message, first) >= 0) by.set(message.id, message);
  return [...by.values()].sort(order);
}

// How many of the changed messages are new here and someone else's: what "New replies" counts.
export function newFromOthers(current, changed) {
  const known = new Set(current.map(message => message.id));
  return changed.filter(message => !known.has(message.id) && !message.mine && !message.deleted).length;
}

// The thread view's data after an answer: a full read (the first, or a reset) replaces it; a since-read merges into it and
// keeps the loaded older replies and their Earlier replies cursor.
export function applySync(data, answer) {
  if (!data || !answer.since) return { thread: answer.thread, messages: answer.messages, before: answer.before ?? null, cursor: answer.cursor ?? null };
  return { ...data, thread: answer.thread, messages: mergeMessages(data.messages, answer.messages, !!data.before), cursor: answer.cursor ?? data.cursor };
}
