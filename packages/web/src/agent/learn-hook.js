import { navigate } from '../api.js';

// Learn hook, caller side (T02 §9; Tutor cleanup P4: teach only, always sent). The receiver is LearnPage take() from feature/parallel-work
// cc0cbf8: it reads small.learn.request once on mount, listens for small:learn-request while open,
// answers each id once with small:learn-result (also kept at small.learn.result:<id>), and only
// replays a repeated id.
export const ADDING = 'Adding to canvas';
const WAIT_MS = { teach: 12000 };
const DONE = { prefilled: null, timeout: 'Still working, check the canvas' };

// A canvas always opens as Learn (routes.js); a project shows Learn on ?tab=learn.
const onLearn = (win, app) =>
  win.location.pathname === `/apps/${app}` && (app.startsWith('canvas-') || new URLSearchParams(win.location.search).get('tab') === 'learn');

export function readLearnResult(id, storage = sessionStorage) {
  try { return JSON.parse(storage.getItem(`small.learn.result:${id}`)); } catch { return null; }
}

// Resolves with Learn's result for this id, or status 'timeout'. A timeout cancels nothing:
// the card may still land, and readLearnResult(id) finds it later.
export function sendLearnRequest(request, { timeoutMs, win = window, storage = sessionStorage }) {
  return new Promise((resolve) => {
    const finish = (result) => {
      clearTimeout(timer);
      win.removeEventListener('small:learn-result', onResult);
      resolve(result);
    };
    const onResult = (event) => { if (event.detail?.id === request.id) finish(event.detail); };
    const timer = setTimeout(() => finish(readLearnResult(request.id, storage) || { id: request.id, kind: request.kind, status: 'timeout' }), timeoutMs);
    win.addEventListener('small:learn-result', onResult);
    // Stored for a Learn that mounts next, and dispatched when Learn may already be open on this
    // app. Both are safe: a repeated id only replays its result.
    try { storage.setItem('small.learn.request', JSON.stringify(request)); } catch { /* blocked storage: the event only */ }
    if (onLearn(win, request.app)) win.dispatchEvent(new CustomEvent('small:learn-request', { detail: request }));
  });
}

// The one way /teach reaches Learn: Learn's composer is filled and never sent. contextRefs (optional) are the context refs
// Chat already uses, attached beside the text.
export async function learnAction(kind, payload, ctx, { win = window, storage = sessionStorage } = {}) {
  const app = payload.app || ctx.scope.slug;
  const open = () => { if (!onLearn(win, app)) navigate(`/apps/${app}?tab=learn`); };
  const request = { id: crypto.randomUUID(), kind, app, prompt: payload.prompt, ...(payload.contextRefs?.length ? { contextRefs: payload.contextRefs } : {}) };
  const pending = sendLearnRequest(request, { timeoutMs: WAIT_MS[kind], win, storage });
  open();
  const result = await pending;
  return { ...result, message: result.status in DONE ? DONE[result.status] : result.reason };
}
