// Canvas Stars (docs/features/stars.md): the client's one star action for a canvas. Pure (no React, no DOM), so the ordering
// rules are tested. The server owns the truth: every answer carries { starred_by_me, star_count }, and the store shows only
// what the last answer said - except while a request is in flight, when it shows the state being asked for as "saving".
import { wsHeaders } from './api.js';

const failure = async response => {
  const data = await response.json().catch(() => ({}));
  return Object.assign(new Error(data.error || 'The star could not be saved. Try again.'), { status: response.status, data });
};

// A shared link's star: PUT stars, DELETE unstars (desired state, never a toggle), GET reads. `token` is the link the page
// is open on (a share or a publication token); the server resolves it to the canvas.
export const starApi = {
  async read(token) {
    const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/star`, { credentials: 'same-origin', headers: wsHeaders() });
    if (!response.ok) throw await failure(response);
    return response.json();
  },
  async send(token, starred) {
    const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/star`, { method: starred ? 'PUT' : 'DELETE', credentials: 'same-origin', headers: wsHeaders() });
    if (!response.ok) throw await failure(response);
    return response.json();
  },
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

// Where a signed-out press goes: sign-in, returning to this canvas with ?star=1, which the page reads once and drops.
export const starSignInUrl = (pathname, search = '') => {
  const params = new URLSearchParams(search); params.set('star', '1');
  return `/login?next=${encodeURIComponent(`${pathname}?${params}`)}`;
};
