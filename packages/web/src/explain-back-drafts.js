// An Explain-back card's unsubmitted answer, kept on the server (EB-02.3) so a reload, another tab or another device finds
// the same draft: text, the voice note and Sketch recording references, inputs. Against D's route
// (packages/control-plane/src/learn-attempt-routes.js):
//   GET /api/learn/tutor/attempts/drafts?app=&board=&cardId= -> {draft: {cardId, revision, answer, updatedAt} | null}
//   PUT /api/learn/tutor/attempts/drafts {app, board, cardId, expectedRevision, answer | null} -> {draft | null};
//       409 {error: 'draft_conflict', detail: {draft}} when another tab saved first. Nothing is overwritten.
// A conflict is a state the card shows; neither side is replaced until the learner picks one (resolve). A failed save keeps
// the local work and says so.
import { wsHeaders } from './api.js';

export const DRAFTS_PATH = '/api/learn/tutor/attempts/drafts';
export const SAVE_DELAY_MS = 800;
export const emptyAnswer = () => ({ v: 1, kind: 'explain_back', text: '', voice: [], resources: [], assistance: [] });

// createDraftSync({ app, board, cardId }) -> sync.
// State (get / subscribe): { status, answer, revision, server, error }
//   status   loading | ready | saving | saved | conflict | offline | error
//   answer   the local draft (what the card shows); revision: the server revision it was based on (0: none)
//   server   on a conflict, the other side's draft { revision, answer, updatedAt }
//   error    { code, message } for offline / error
export function createDraftSync({ app, board = 'main', cardId, fetchImpl = (...args) => globalThis.fetch(...args), delayMs = SAVE_DELAY_MS, timers = globalThis }) {
  let state = { status: 'loading', answer: emptyAnswer(), revision: 0, server: null, error: null };
  const listeners = new Set();
  let timer = null, inFlight = null, dirty = false;
  const set = patch => { state = { ...state, ...patch }; for (const fn of [...listeners]) fn(state); };
  const headers = () => { try { return wsHeaders(); } catch { return {}; } };

  async function request(method, body) {
    const url = method === 'GET' ? `${DRAFTS_PATH}?${new URLSearchParams({ app, board, cardId })}` : DRAFTS_PATH;
    let response;
    try { response = await fetchImpl(url, { method, headers: { 'Content-Type': 'application/json', ...headers() }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { return { offline: true }; }
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  }
  const offline = () => set({ status: 'offline', error: { code: 'offline', message: 'Not saved to your account yet: Rabbit Hole could not be reached. Your answer is kept here.' } });
  const failed = (code, status) => set(status >= 500
    ? { status: 'offline', error: { code, message: 'Not saved to your account yet. Your answer is kept here.' } }
    : { status: 'error', error: { code, message: `This draft could not be saved (${code}). Your answer is kept here.` } });

  async function load() {
    const got = await request('GET');
    if (got.offline) { offline(); return state; }
    if (!got.ok) { failed(got.data.error || `http_${got.status}`, got.status); return state; }
    const draft = got.data.draft;
    // Edits made before the load answered never silently replace a stored draft: with one, it is a conflict to resolve.
    if (dirty && draft) set({ status: 'conflict', server: draft, revision: draft.revision, error: null });
    else if (dirty) { set({ status: 'ready', revision: 0, error: null }); flush(); }
    else set({ status: 'ready', answer: draft?.answer ?? emptyAnswer(), revision: draft?.revision ?? 0, error: null });
    return state;
  }

  async function flush() {
    timers.clearTimeout(timer); timer = null;
    if (state.status === 'conflict' || state.status === 'loading') return;
    if (inFlight) { dirty = true; return inFlight; }
    dirty = false;
    set({ status: 'saving' });
    inFlight = (async () => {
      const got = await request('PUT', { app, board, cardId, expectedRevision: state.revision, answer: state.answer });
      inFlight = null;
      if (got.offline) { offline(); return; }
      if (got.status === 409 && got.data.error === 'draft_conflict') { set({ status: 'conflict', server: got.data.detail?.draft ?? null, error: null }); return; }
      if (!got.ok) { failed(got.data.error || `http_${got.status}`, got.status); return; }
      set({ status: 'saved', revision: got.data.draft?.revision ?? 0, error: null });
      if (dirty) await flush();
    })();
    return inFlight;
  }
  const schedule = () => { dirty = true; timers.clearTimeout(timer); timer = timers.setTimeout(() => { flush(); }, delayMs); };

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load,
    // The whole local answer, saved after a pause in changes.
    save(answer) { set({ answer }); schedule(); },
    // Some fields of it (the card's text, the voice note, the recording); a field set to undefined is dropped.
    patch(fields) {
      const answer = { ...state.answer, ...fields };
      for (const [key, value] of Object.entries(fields)) if (value === undefined) delete answer[key];
      set({ answer }); schedule();
    },
    flush,
    // Save again after offline or an error.
    retry: () => (state.status === 'offline' || state.status === 'error' ? flush() : undefined),
    // The learner's choice on a conflict: 'mine' saves this draft over the other one; 'theirs' takes the other one here.
    resolve(choice) {
      if (state.status !== 'conflict') return;
      const server = state.server;
      if (choice === 'theirs') { set({ status: 'saved', answer: server?.answer ?? emptyAnswer(), revision: server?.revision ?? 0, server: null }); return; }
      set({ status: 'ready', revision: server?.revision ?? 0, server: null });
      return flush();
    },
    // After a successful submit: the draft is done. A conflict here (another tab kept working) is shown, not overwritten.
    async clear() {
      timers.clearTimeout(timer); timer = null; dirty = false;
      if (inFlight) await inFlight;
      const got = await request('PUT', { app, board, cardId, expectedRevision: state.revision, answer: null });
      if (got.offline) { offline(); return false; }
      if (got.status === 409 && got.data.error === 'draft_conflict') { set({ status: 'conflict', server: got.data.detail?.draft ?? null }); return false; }
      if (!got.ok) { failed(got.data.error || `http_${got.status}`, got.status); return false; }
      set({ status: 'ready', answer: emptyAnswer(), revision: 0, server: null, error: null });
      return true;
    },
    dispose() { timers.clearTimeout(timer); listeners.clear(); },
  };
}
