import { wsHeaders } from './api.js';

// The author's reader highlights and the server's identity of a PDF (pdf-excerpts contract, "Server API"): thin wrappers over
// /api/learn/pdf-source and /api/learn/pdf-highlights. `home` rides only when it is another canvas, as paperBytesUrl does.
// A refusal throws an Error with the server's message and `status` (404 not available, 409 document changed).
// A webpage capture's highlights (key web:<lineage>) name its manifest in place of home (webcard-interface.md section 1).
const query = ({ app, key, home, manifest }) => new URLSearchParams({ app, key, ...(home && home !== app ? { home } : {}), ...(manifest ? { manifest } : {}) }).toString();
async function call(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...wsHeaders(), ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error || 'Something went wrong. Try again.'), { status: response.status, body });
  return body;
}

export const getSource = (source, signal) => call(`/api/learn/pdf-source?${query(source)}`, { signal });
export const listHighlights = (source, signal) => call(`/api/learn/pdf-highlights?${query(source)}`, { signal });
// Retry-safe: the caller keeps one id per highlight intent and resends the same body.
export const putHighlight = (id, { app, key, home = null, ...body }) => call(`/api/learn/pdf-highlights/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ app, key, home, ...body }) });
export const deleteHighlight = (id, source) => call(`/api/learn/pdf-highlights/${encodeURIComponent(id)}?${query(source)}`, { method: 'DELETE' });

// 'pdfh_' / 'pdfx_' + 24 random hex: one per highlight or insertion intent.
export const newId = prefix => `${prefix}_${[...crypto.getRandomValues(new Uint8Array(12))].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
