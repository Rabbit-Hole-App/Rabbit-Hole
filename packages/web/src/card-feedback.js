// Card feedback (Explain-on-Canvas roadmap R1): a learner's private up/down self-report on a GENERATED card. Pure and import-free
// at load, so the control plane (card-feedback.js there) and the canvas share one rule for which cards can be rated. The value
// lives in learn_card_feedback beside the board (learn-migrations/0036), never in the card's JSON, so a share link, a fork and a
// duplicate cannot carry it and no sanitizer has a new card field to strip.

export const FEEDBACK_VALUES = Object.freeze(['up', 'down']);
export const validFeedback = value => value === null || FEEDBACK_VALUES.includes(value);

// A generated card is material the app made for the learner. Imported sources (files, PDFs, pages, YouTube moments,
// papers, wiki, photos, repository code, canvas links) and the learner's own notes never are. The practice cards (challenge,
// quiz, code exercise, flashcards) are generated too, so they get the pair (owner/Lead 2026-11-05); their thumbs stay a self-report,
// apart from the assessed evidence R9 adds.
// ponytail: an allowlist by saved block type; a card type added later gets no control until it is listed here.
const GENERATED = new Set(['explanation', 'table', 'snippet', 'graph', 'knowledge', 'flow', 'mermaid', 'scene', 'animation', 'animation3d', 'cad', 'whiteboardVideo', 'challenge', 'quiz', 'code', 'flashcards']);
const PENDING = ['explainJob', 'animation3dJob', 'whiteboardJob']; // a card still waiting for its job has nothing to rate yet

export function isFeedbackCard(block) {
  if (!block || typeof block !== 'object' || typeof block.id !== 'string') return false;
  if (PENDING.some(key => block[key])) return false;
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
// -> [{ cardId, value, title }]: the learner's ratings of cards that are on the saved board now.
export const readFeedback = ({ app, board }) => call({ method: 'GET' }, `?${new URLSearchParams({ app, board })}`).then(data => data.items || []);
// value null clears. -> { cardId, value }
export const writeFeedback = ({ app, board, cardId, value }) => call({ method: 'PUT', body: JSON.stringify({ app, board, cardId, value }) });

// One learner's ratings on one canvas, shared by the cards and Progress. A change shows at once and is undone if the save fails.
// io: { read(), write(cardId, value), persist?() } - persist saves the board first when the server has not seen the card yet.
export function createFeedbackStore(io) {
  let items = new Map(), loaded = false, loading = null, queue = Promise.resolve(), version = 0;
  const listeners = new Set();
  const emit = () => { version += 1; listeners.forEach(listener => listener()); };
  const store = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get loaded() { return loaded; },
    get version() { return version; }, // changes whenever the ratings do: a stable snapshot for useSyncExternalStore
    value: cardId => items.get(cardId)?.value ?? null,
    items: () => [...items.entries()].map(([cardId, item]) => ({ cardId, ...item })),
    // Reads again (Progress opening, a reload): what the server holds replaces what is shown, unless a save is in flight.
    refresh() {
      loading ||= io.read().then(list => { items = new Map(list.map(item => [item.cardId, { value: item.value, title: item.title ?? '' }])); loaded = true; emit(); }, () => {}).finally(() => { loading = null; });
      return loading;
    },
    // -> null when saved, else the error code (the shown value is back to what it was).
    set(cardId, value, title = '') {
      const before = items.get(cardId);
      const apply = next => { if (next) items.set(cardId, next); else items.delete(cardId); emit(); };
      apply(value ? { value, title: title || before?.title || '' } : null);
      const send = () => io.write(cardId, value);
      // Saves go one after another, so two quick presses reach the server in the order they were made.
      const run = queue.then(async () => {
        try {
          try { await send(); } catch (error) { if (error?.code !== 'unknown_card' || !io.persist) throw error; await io.persist(); await send(); }
          return null;
        } catch (error) { apply(before); return error?.code || 'unavailable'; }
      });
      queue = run;
      return run;
    },
  };
  return store;
}

const stores = new Map();
// The store of one canvas board; scope: { app, board, persist? }. The canvas names persist; Progress reads the same store without it.
export function feedbackStoreFor({ app, board, persist }) {
  const key = `${app}\n${board}`;
  let entry = stores.get(key);
  if (!entry) {
    entry = { hold: {} };
    entry.store = createFeedbackStore({ read: () => readFeedback({ app, board }), write: (cardId, value) => writeFeedback({ app, board, cardId, value }), persist: () => entry.hold.persist?.() });
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
