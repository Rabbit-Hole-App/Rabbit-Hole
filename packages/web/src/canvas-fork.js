// Fork (docs/features/canvas-forking.md): every surface - a Library card, the canvas top bar, a shared
// board, a future Explore card - forks through this one call. Pure, so the retry rule is tested.
import { wsHeaders } from './api.js';

// POST /api/learn/boards/fork. `source` is { canvas } (your own) or { token } (a share link); `state` is
// your browser's copy of your own canvas, where its content lives. Duplicate (docs/features/canvas-naming.md) is the
// same copy of your own canvas without the lineage: path /api/learn/boards/duplicate. A browser holding none of it
// (localBoard's null) sends no state, never a null one: the server copy decides.
export async function postFork({ state, ...body }, path = '/api/learn/boards/fork') {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify(state ? { ...body, state } : body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'The fork could not be made.'), { status: response.status, data });
  return data;
}

// One user action, one fork. A press while a fork is in flight joins it (a double click); a press after
// a failure retries with the same key, so a fork the server made before the reply was lost comes back
// instead of a second one. Only a finished fork lets the next press make a new one.
export function forkAction(send = postFork, newKey = () => crypto.randomUUID()) {
  let key = null, flight = null;
  return ({ source, state = null }) => {
    if (flight) return flight;
    key ||= newKey();
    flight = send({ source, key, ...(state ? { state } : {}) })
      .then(data => { key = null; return data; })
      .finally(() => { flight = null; });
    return flight;
  };
}
