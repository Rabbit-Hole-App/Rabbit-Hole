import { wsHeaders } from './api.js';
import { scopeQuery } from './file-source-client.js';

// The webpage card's server calls (C:/s/spec/day-1021/webcard-interface.md section 2). Capture, Retry and the status poll are the
// owner's; tiles and text runs are file sources read through this page's scope (file-source-client.js), which refuses them until
// screening passed. None of these is a model call made for the learner's reading: scrolling, locking, selecting, highlighting and
// Ask never reach this module's capture routes.
const headers = () => { try { return wsHeaders(); } catch { return {}; } };

// A Result, or a refusal folded into one ({ status, reason }) so the card has one shape to show.
async function result(url, init, fetchImpl) {
  let response;
  try { response = await fetchImpl(url, { ...init, headers: { ...headers(), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } }); }
  catch { return { status: 'error', reason: 'Could not reach Rabbit Hole. Check the connection and retry.' }; }
  const body = await response.json().catch(() => null);
  if (response.ok && body?.status) return body;
  const reason = body?.error || body?.reason || `The capture failed (${response.status}).`;
  // A refused URL is blocked; an unsaved board, a lapsed sign-in or a server fault can be retried; a daily cap or a worker with no
  // browser is unavailable.
  const retryable = response.status === 401 || response.status === 404 || (response.status >= 500 && response.status !== 503);
  return { status: response.status === 400 && body?.status === 'blocked' ? 'blocked' : retryable ? 'error' : 'unavailable', reason };
}

// lineage: present for a Refresh (or a Retry of a capture that stopped), so the new version joins the same highlights namespace.
export const capturePage = ({ app, board, url, lineage = null }, fetchImpl = globalThis.fetch) =>
  result('/api/learn/webpages', { method: 'POST', body: JSON.stringify({ app, board, url, ...(lineage ? { lineage } : {}) }) }, fetchImpl);
export const rescreen = (manifestId, { app, board }, fetchImpl = globalThis.fetch) =>
  result(`/api/learn/webpages/${encodeURIComponent(manifestId)}/screen`, { method: 'POST', body: JSON.stringify({ app, board }) }, fetchImpl);
export const readCapture = (manifestId, { app, board }, fetchImpl = globalThis.fetch) =>
  result(`/api/learn/webpages/${encodeURIComponent(manifestId)}?${new URLSearchParams({ app, board })}`, {}, fetchImpl);

// A capture file (manifest, tile, text runs) through this page's scope. A version that just passed is indexed to its board
// by the server, but a board save already on its way with the old card can drop that index; the card's own save of the new
// version restores it, so a 404 is retried a few times before the card says the capture is not available.
export async function captureFile(id, { signal, as = 'json', fetchImpl = globalThis.fetch, retries = 4, wait = 1000 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(`/api/learn/files/${encodeURIComponent(id)}${scopeQuery()}`, { headers: headers(), signal });
    if (response.ok) return as === 'blob' ? response.blob() : response.json();
    if (response.status !== 404 || attempt >= retries || signal?.aborted) throw Object.assign(new Error('This capture is not available.'), { status: response.status });
    await new Promise(resolve => setTimeout(resolve, wait));
  }
}
