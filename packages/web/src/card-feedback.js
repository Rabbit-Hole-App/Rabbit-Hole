// Card feedback (Explain-on-Canvas roadmap R1): a learner's private up/down self-report on a GENERATED card. Pure and import-free
// at load, so the control plane (card-feedback.js there) and the canvas share one rule for which cards can be rated. The value
// lives in learn_card_feedback beside the board (learn-migrations/0036), never in the card's JSON, so a share link, a fork and a
// duplicate cannot carry it and no sanitizer has a new card field to strip.

export const FEEDBACK_VALUES = Object.freeze(['up', 'down']);
export const validFeedback = value => value === null || FEEDBACK_VALUES.includes(value);

// A generated card is material the app made for the learner. Imported sources (files, PDFs, pages, YouTube moments,
// papers, wiki, photos, repository code, canvas links) and the learner's own notes never are. The practice cards (challenge,
// quiz, code exercise, flashcards) are generated too, so they get the pair (Lead 2026-11-05); their thumbs stay a self-report,
// apart from the assessed evidence R9 adds.
// ponytail: an allowlist by saved block type; a card type added later gets no control until it is listed here.
const GENERATED = new Set(['explanation', 'table', 'snippet', 'graph', 'knowledge', 'flow', 'mermaid', 'scene', 'animation', 'animation3d', 'cad', 'whiteboardVideo', 'challenge', 'quiz', 'code', 'flashcards']);
const PENDING = ['explainJob', 'animation3dJob', 'whiteboardJob']; // a card still waiting for its job has nothing to rate yet
// A type alone cannot tell an imported card from a generated one that looks like it (a PDF excerpt or an uploaded Markdown note drawn
// as a text card): whatever carries a source of its own is imported. `sources` (the evidence a generated card cites) and `sourceRef`
// (where a generated card came from) are not in this list.
const IMPORTED = ['excerpt', 'pdf', 'assetKey', 'fileRef', 'paper', 'videoId', 'repository'];

export function isFeedbackCard(block) {
  if (!block || typeof block !== 'object' || typeof block.id !== 'string') return false;
  if (PENDING.some(key => block[key])) return false;
  if (block.status === 'failed' || block.failed) return false; // a failed placeholder holds nothing to rate
  if (IMPORTED.some(key => block[key] != null && block[key] !== false)) return false;
  if (block.type === 'image' || block.type === 'video') return block.mode === 'generate' && !!block.src; // a made picture or clip, not a search result or a YouTube moment
  if (!GENERATED.has(block.type)) return false;
  if (block.type === 'animation') return !!(block.scene || block.program);
  if (block.type === 'whiteboardVideo') return block.whiteboard?.status === 'ready';
  if (block.type === 'cad') return !!block.manifest;
  return true;
}

const BASE = '/api/learn/card-feedback';
export class FeedbackError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
async function call(init, query = '') {
  const { wsHeaders } = await import('./api.js');
  const response = await fetch(`${BASE}${query}`, { ...init, headers: { 'Content-Type': 'application/json', ...wsHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new FeedbackError(data.error || `http_${response.status}`, response.status);
  return data;
}
// -> [{ cardId, value: 'up'|'down'|null, revision, title }]: the learner's rows for cards on the saved board now (a cleared one has value null).
export const readFeedback = ({ app, board }) => call({ method: 'GET' }, `?${new URLSearchParams({ app, board })}`).then(data => data.items || []);
// value null clears. -> { cardId, value, revision, updatedAt }
export const writeFeedback = ({ app, board, cardId, value }) => call({ method: 'PUT', body: JSON.stringify({ app, board, cardId, value }) });

// One learner's ratings on one canvas, shared by the cards and Progress. A change shows at once. Saves go one after another, and the
// server's per-row revision orders everything else: a read that started earlier, or a response that comes late, never replaces a newer
// choice. A failed save puts back the last value the server confirmed, but only when no newer press is still waiting.
// io: { read(), write(cardId, value) -> { revision }, persist?() } - persist saves the board first when the server has not seen the card yet.
export function createFeedbackStore(io) {
  let items = new Map(), loaded = false, failed = false, loading = null, queue = Promise.resolve(), version = 0;
  const confirmed = new Map(), pending = new Map(); // cardId -> { value, title, revision } the server holds / saves not yet answered
  const listeners = new Set();
  const emit = () => { version += 1; listeners.forEach(listener => listener()); };
  const show = (cardId, next) => { if (next && next.value) items.set(cardId, { value: next.value, title: next.title ?? '' }); else items.delete(cardId); };
  const wait = (cardId, by) => pending.set(cardId, (pending.get(cardId) || 0) + by);
  const store = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get loaded() { return loaded; },
    get error() { return failed; }, // the last read failed: Progress says so and offers a retry
    get version() { return version; }, // changes whenever what is shown does: a stable snapshot for useSyncExternalStore
    value: cardId => items.get(cardId)?.value ?? null,
    items: () => [...items.entries()].map(([cardId, item]) => ({ cardId, ...item })),
    // Reads again (Progress opening, a reload). A row is taken only if it is not older than what this tab already knows and no save of
    // that card is waiting; a card the server no longer lists is dropped likewise.
    refresh() {
      loading ||= io.read().then(list => {
        const seen = new Set();
        for (const row of list) {
          seen.add(row.cardId);
          if (pending.get(row.cardId) > 0 || (confirmed.get(row.cardId)?.revision ?? 0) > (row.revision ?? 0)) continue;
          const title = row.title ?? items.get(row.cardId)?.title ?? '';
          confirmed.set(row.cardId, { value: row.value ?? null, title, revision: row.revision ?? 0 });
          show(row.cardId, confirmed.get(row.cardId));
        }
        for (const cardId of [...items.keys()]) if (!seen.has(cardId) && !(pending.get(cardId) > 0)) { confirmed.delete(cardId); items.delete(cardId); }
        loaded = true; failed = false; emit();
      }, () => { failed = true; emit(); }).finally(() => { loading = null; });
      return loading;
    },
    // -> null when saved, else the error code.
    set(cardId, value, title = '') {
      show(cardId, value ? { value, title: title || items.get(cardId)?.title || '' } : null);
      wait(cardId, 1); emit();
      const send = () => io.write(cardId, value);
      const run = queue.then(async () => {
        let code = null;
        try {
          let answer;
          try { answer = await send(); } catch (error) { if (error?.code !== 'not_available' || !io.persist) throw error; await io.persist(); answer = await send(); }
          if ((answer?.revision ?? 0) >= (confirmed.get(cardId)?.revision ?? 0)) confirmed.set(cardId, { value, title: items.get(cardId)?.title ?? title, revision: answer?.revision ?? 0 });
        } catch (error) { code = error?.code || 'unavailable'; }
        wait(cardId, -1);
        if (code && !(pending.get(cardId) > 0)) { show(cardId, confirmed.get(cardId) ?? null); emit(); }
        return code;
      });
      queue = run;
      return run;
    },
  };
  return store;
}

const stores = new Map();
// The store of one canvas board; scope: { app, board, persist? }. The canvas names persist; Progress reads the same store without it.
// io overrides the transport (tests). Each app and board has its own store, so an answer for one canvas can only land in that canvas.
export function feedbackStoreFor({ app, board, persist }, io = null) {
  const key = `${app}\n${board}`;
  let entry = stores.get(key);
  if (!entry) {
    entry = { hold: {} };
    entry.store = createFeedbackStore(io ?? { read: () => readFeedback({ app, board }), write: (cardId, value) => writeFeedback({ app, board, cardId, value }), persist: () => entry.hold.persist?.() });
    stores.set(key, entry);
  }
  if (persist) entry.hold.persist = persist;
  return entry.store;
}

// Progress's read-out: ratings of cards still on the canvas, split by value. A rated card that was deleted has no target to open.
export function feedbackSummary(items, has = () => true) {
  const present = items.filter(item => has(item.cardId));
  return { up: present.filter(item => item.value === 'up'), down: present.filter(item => item.value === 'down'), total: present.length };
}
