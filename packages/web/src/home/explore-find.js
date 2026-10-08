// Explore's AI find, browser side (docs/features/explore-publish.md "AI find"). Typing stays the instant keyword search;
// a sentence-length query (4+ words, Search.jsx's aiFindAllowed rule for /api/apps/find) also asks
// POST /api/learn/boards/published/find, once per pause in typing. Pure, so the threshold and the debounce are tested.
export const FIND_WORDS = 4;
export const FIND_DEBOUNCE_MS = 700;

// The query worth a model call, or null: four or more words, spaces collapsed, at most 300 characters.
export function findQuery(text) {
  const q = String(text ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
  return q && q.split(' ').length >= FIND_WORDS ? q : null;
}

// One find per pause: run(q) after FIND_DEBOUNCE_MS unless the returned cancel runs first (the next keystroke).
export function scheduleFind(q, run, ms = FIND_DEBOUNCE_MS) {
  const timer = setTimeout(() => run(q), ms);
  return () => clearTimeout(timer);
}

// What the Recommended section shows for a response: the picks, or one line saying why there are none (nothing fits,
// not configured, over the cap, unavailable). The keyword results below never depend on it.
export async function readFind(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { canvases: [], creators: [], note: data.error || 'Recommendations are unavailable right now.' };
  return { canvases: data.canvases || [], creators: data.creators || [], note: data.note || '' };
}
