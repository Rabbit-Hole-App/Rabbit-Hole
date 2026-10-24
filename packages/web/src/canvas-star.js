// Canvas Stars (docs/features/stars.md): the client's one star action for a canvas. Pure (no React, no DOM), so the ordering
// rules are tested. The server owns the truth: every answer carries { starred_by_me, star_count }, and the store shows only
// what the last answer said - except while a request is in flight, when it shows the state being asked for as "saving".
import { wsHeaders } from './api.js';

const failure = async response => {
  const data = await response.json().catch(() => ({}));
  return Object.assign(new Error(data.error || 'The star could not be saved. Try again.'), { status: response.status, data });
};

// `surface` (a fixed list on the server: card_library, card_home, card_explore, card_profile, personal_stars, profile_stars,
// shared_page, canvas_header) says where the press happened, for analytics only; the server drops anything else.
const call = async (url, method, surface) => {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: { ...wsHeaders(), ...(surface ? { 'Content-Type': 'application/json' } : {}) }, ...(surface && method !== 'GET' ? { body: JSON.stringify({ surface }) } : {}) });
  if (!response.ok) throw await failure(response);
  return response.json();
};

// A shared link's star: PUT stars, DELETE unstars (desired state, never a toggle), GET reads. `token` is the link the page
// is open on (a share or a publication token); the server resolves it to the canvas. A card in Explore or on a profile uses its
// publication token the same way.
export const sharedStarApi = surface => ({
  read: token => call(`/api/learn/boards/shared/${encodeURIComponent(token)}/star`, 'GET'),
  send: (token, starred) => call(`/api/learn/boards/shared/${encodeURIComponent(token)}/star`, starred ? 'PUT' : 'DELETE', surface),
});
export const starApi = sharedStarApi();

// The owner's star on their own canvas (Library and Home cards): the canvas's name, not a link. The owner route has no GET of
// its own, so the canvas answer is read for the state.
export const ownerStarApi = (name, surface) => ({
  read: async () => { const app = await call(`/api/apps/${encodeURIComponent(name)}`, 'GET'); return { starred_by_me: !!app.starred_by_me, star_count: app.star_count }; },
  send: (_token, starred) => call(`/api/apps/${encodeURIComponent(name)}/star`, starred ? 'PUT' : 'DELETE', surface),
});

// Which of these publication tokens (cards in a public list) I have starred: a Set. Signed out is an empty one. A failed read
// is an empty one too: the cards then show unstarred and the press itself still answers with the truth.
export async function starredTokens(tokens) {
  if (!tokens.length) return new Set();
  try {
    const response = await fetch('/api/learn/stars/state', { method: 'POST', credentials: 'same-origin', headers: { ...wsHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: tokens.slice(0, 100) }) });
    return new Set(response.ok ? (await response.json()).starred || [] : []);
  } catch { return new Set(); }
}

// My personal Stars (GET /api/learn/stars?q=&cursor=) and the way out of any one star by its own id (DELETE).
export const starsApi = {
  list: ({ q = '', cursor = '' } = {}) => call(`/api/learn/stars?${new URLSearchParams({ ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) })}`, 'GET'),
  remove: id => call(`/api/learn/stars/${encodeURIComponent(id)}`, 'DELETE', 'personal_stars'),
};

// State: { starred, count, saving, desired, error }. `starred` and `count` are the last confirmed answer; `desired` is what
// the person last asked for (equal to `starred` when idle). Requests for one canvas run one at a time, so an older answer can
// never land after a newer one; presses made while one is in flight collapse to the last wish. A failure drops the wish and
// returns to the confirmed state with the error. `refresh` (another tab, a return to the page) reads the server's state and is
// ignored while a save is in flight, which will bring the newest answer anyway.
export function starStore(token, initial = {}, api = starApi) {
  let state = { starred: !!initial.starred, count: typeof initial.count === 'number' ? initial.count : null, saving: false, desired: !!initial.starred, error: null };
  const listeners = new Set();
  let running = null;
  const set = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  async function drain() {
    while (state.desired !== state.starred) {
      const wanted = state.desired;
      try {
        const answer = await api.send(token, wanted);
        set({ starred: answer.starred_by_me, count: answer.star_count });
        if (state.desired === wanted) set({ desired: answer.starred_by_me }); // nothing newer was asked for
      } catch (error) {
        set({ desired: state.starred, error });
        break;
      }
    }
    set({ saving: false });
  }
  return {
    get: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set(desired) {
      set({ desired: !!desired, error: null, saving: desired !== state.starred || state.saving });
      if (state.desired === state.starred && !running) { set({ saving: false }); return Promise.resolve(); }
      if (running) return Promise.resolve(); // the run in flight picks up the newest wish; only the press that started it reports
      running = drain().finally(() => { running = null; });
      return running;
    },
    async refresh() {
      if (running) return;
      try {
        const answer = await api.read(token);
        if (!running) set({ starred: answer.starred_by_me, desired: answer.starred_by_me, count: answer.star_count });
      } catch { /* the state on screen stays: a failed read changes nothing */ }
    },
  };
}

// 0, 12, 1.2k (as the Fork count). Large values are compact on screen and exact in the accessible name.
export const starNumber = n => (n < 1000 ? String(n) : `${+(n / 1000).toFixed(1)}k`);
export const starLabel = n => `${n.toLocaleString('en-US')} ${n === 1 ? 'star' : 'stars'}`;

// Where a signed-out press goes: sign-in, returning to this page with ?star=1 (the shared page) or ?star=<publication token>
// (a list of cards, `mark`), which the page reads once and drops.
export const starSignInUrl = (pathname, search = '', mark = '1') => {
  const params = new URLSearchParams(search); params.set('star', mark);
  return `/login?next=${encodeURIComponent(`${pathname}?${params}`)}`;
};

// Back from sign-in on a list of cards: the publication token to star once, and the address without it, so Back never stars again.
export function takeStarReturn(win = window) {
  const query = new URLSearchParams(win.location.search), token = query.get('star');
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  query.delete('star');
  win.history.replaceState(null, '', win.location.pathname + (query.size ? `?${query}` : ''));
  return token;
}
