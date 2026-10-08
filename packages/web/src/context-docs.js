// Canvas context documents (docs/features/canvas-context-docs.md), browser side: the list, upload,
// toggle and delete behind /api/learn/context. The Files panel and the composer's Context button each
// use the hook; a change in one is announced so the other re-reads.
import { useCallback, useEffect, useState } from 'react';
import { wsHeaders } from './api.js';
import { toast } from './ui.jsx';

export const ATTACHED_LIMIT = 10; // the server's (learn-context-docs.js), pinned by context-docs.test.mjs
export const CONTEXT_ACCEPT = '.pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown';
export const isContextCanvas = app => /^canvas-[a-f0-9]{8}$/.test(String(app || ''));
const EVENT = 'small:context-docs';

async function request(method, path, body) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: { ...wsHeaders(), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

// The model reads at most 100 PDF pages; say so before uploading rather than failing on every question.
async function pdfPages(file) {
  const { getDocument } = await import('./learn-paper-figures.js');
  return (await getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise).numPages;
}

export function useContextDocs(app) {
  const enabled = isContextCanvas(app);
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const read = useCallback(() => {
    if (!enabled) return;
    request('GET', `/api/learn/context?app=${encodeURIComponent(app)}`).then(data => setDocs(data.documents || [])).catch(() => {});
  }, [app, enabled]);
  useEffect(() => {
    read();
    const on = event => { if (event.detail?.app === app) read(); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [read, app]);
  const changed = data => { setDocs(data.documents || []); window.dispatchEvent(new CustomEvent(EVENT, { detail: { app } })); };
  const run = async (work, done) => {
    setBusy(true);
    try { changed(await work()); if (done) toast(done); } catch (error) { toast(`✗ ${error.message}`); }
    setBusy(false);
  };
  const upload = async file => {
    if (!file) return;
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      let pages;
      try { pages = await pdfPages(file); } catch { return toast('✗ That file could not be read as a PDF.'); }
      if (pages > 100) return toast(`✗ That PDF has ${pages} pages. The agent can read up to 100.`);
    }
    const body = new FormData();
    body.append('app', app);
    body.append('file', file, file.name);
    await run(() => request('POST', '/api/learn/context', body), `Added ${file.name} to context`);
  };
  const toggle = (id, attached) => run(() => request('PATCH', `/api/learn/context/${encodeURIComponent(id)}`, { app, attached }));
  const remove = (id) => run(() => request('DELETE', `/api/learn/context/${encodeURIComponent(id)}?app=${encodeURIComponent(app)}`), 'Removed from context');
  return { enabled, docs, busy, upload, toggle, remove, on: docs.filter(doc => doc.attached).length };
}
