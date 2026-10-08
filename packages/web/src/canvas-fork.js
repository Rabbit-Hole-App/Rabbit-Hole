// Fork (docs/features/canvas-forking.md): every surface - the shared header, another person's Explore card - forks
// through this one call. Pure, so the retry rule is tested.
import { wsHeaders } from './api.js';

// POST /api/learn/boards/fork. `source` is { canvas } (your own) or { token } (a share link); `state` is
// your browser's copy of your own canvas, where its content lives; `title` is the name typed in the Fork dialog (blank: the
// source's, decided by the server). Duplicate (docs/features/canvas-naming.md) is the
// same copy of your own canvas without the lineage: path /api/learn/boards/duplicate.
export async function postFork(body, path = '/api/learn/boards/fork') {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'The fork could not be made.'), { status: response.status, data });
  return data;
}

// One user action, one fork. A press while a fork is in flight joins it (a double click); a press after
// a failure retries with the same key, so a fork the server made before the reply was lost comes back
// instead of a second one. Only a finished fork lets the next press make a new one.
export function forkAction(send = postFork, newKey = () => crypto.randomUUID()) {
  let key = null, flight = null;
  return ({ source, state = null, title = null }) => {
    if (flight) return flight;
    key ||= newKey();
    flight = send({ source, key, ...(state ? { state } : {}), ...(title ? { title } : {}) })
      .then(data => { key = null; return data; })
      .finally(() => { flight = null; });
    return flight;
  };
}
