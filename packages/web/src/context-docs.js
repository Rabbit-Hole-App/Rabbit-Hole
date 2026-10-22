// Canvas context documents (docs/features/canvas-context-docs.md), browser side: the list, upload,
// toggle and delete behind /api/learn/context. The Files panel and the composer's Context button each
// use the hook; a change in one is announced so the other re-reads.
import { useCallback, useEffect, useState } from 'react';
import { wsHeaders } from './api.js';
import { PDF_UPLOAD_LIMIT, openPdf, processing, readPageTexts } from './context-doc-pages.js';
// ui.jsx's toast, by its event: importing the JSX kit would keep this module out of plain-node tests (selection-ref.test.mjs).
const toast = message => window.dispatchEvent(new CustomEvent('small:toast', { detail: { message: String(message) } }));

export const ATTACHED_LIMIT = 10; // the server's (learn-context-docs.js), pinned by context-docs.test.mjs
export const CONTEXT_ACCEPT = '.pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown';
export const isContextCanvas = app => /^canvas-[a-f0-9]{8}$/.test(String(app || ''));
export const EVENT = 'small:context-docs'; // a change on one canvas: every list of it re-reads

async function request(method, path, body) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: { ...wsHeaders(), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

// Upload one file to a canvas's context: the stored document, or an Error with the reason (the PDF check's or the
// server's). Every list of that canvas re-reads. The hook's upload toasts the outcome; the Chat's chips show it instead.
// A PDF of any length (PDF-02): its page text is read here first (context-doc-pages.js, shown as processing) and rides the
// upload, so questions read the relevant pages. If reading fails the PDF is still stored, listed failed with a Retry.
export async function uploadContextDoc(app, file) {
  const body = new FormData();
  body.append('app', app);
  body.append('file', file, file.name);
  const send = async () => {
    const data = await request('POST', '/api/learn/context', body);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { app } }));
    return data.document;
  };
  if (!(/\.pdf$/i.test(file.name) || file.type === 'application/pdf')) return send();
  if (file.size > PDF_UPLOAD_LIMIT) throw new Error(`That PDF is larger than ${PDF_UPLOAD_LIMIT / (1024 * 1024)} MB.`);
  return processing(app, file.name, null, async progress => {
    let pdf;
    try { pdf = await openPdf(await file.arrayBuffer()); } catch { throw new Error('That file could not be read as a PDF.'); }
    try { body.append('pages', JSON.stringify(await readPageTexts(pdf, { onPage: progress }))); }
    catch (error) {
      if (/at most/.test(error.message)) throw error; // over the page limit: nothing is uploaded
      body.append('page_count', String(pdf.numPages));
      body.append('pages_error', error.message || 'This browser could not read the pages.');
    } finally { pdf.destroy?.(); }
    return send();
  });
}

// Retry (contract-pdf-status.md section 3): read a stored PDF's pages again in this browser and store them. Resolves with
// the updated document entry; throws an Error with the reason. Every list of that canvas re-reads.
export async function retryContextDoc(app, id, name = '') {
  return processing(app, name, id, async progress => {
    const response = await fetch(`/api/learn/context/${encodeURIComponent(id)}?app=${encodeURIComponent(app)}`, { credentials: 'same-origin', headers: wsHeaders() });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
    let pdf;
    try { pdf = await openPdf(await response.arrayBuffer()); } catch { throw new Error('That file could not be read as a PDF.'); }
    let pages;
    try { pages = await readPageTexts(pdf, { onPage: progress }); } finally { pdf.destroy?.(); }
    const data = await request('PUT', `/api/learn/context/${encodeURIComponent(id)}/pages`, { app, pages });
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { app } }));
    return data.document;
  });
}

// Remove from canvas context (materials-remove.md): the document leaves the list and future requests, its file stays for
// the cards and pages that name it. Throws the server's reason, so the row that asked can show it and offer a retry.
export async function removeContextDoc(app, id) {
  const data = await request('DELETE', `/api/learn/context/${encodeURIComponent(id)}?app=${encodeURIComponent(app)}`);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { app } }));
  return data;
}

// A Materials row's canvas context switch (pdf-materials-refinement.md section 1): the canvas-level attached flag of that one
// document. Throws the server's reason (the ten-on limit, the budget), so the row that asked can show it.
export async function toggleContextDoc(app, id, attached) {
  const data = await request('PATCH', `/api/learn/context/${encodeURIComponent(id)}`, { app, attached });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { app } }));
  return data;
}

export function useContextDocs(app) {
  const enabled = isContextCanvas(app);
  const [docs, setDocs] = useState([]);
  const [removed, setRemoved] = useState([]); // ids removed from this canvas's context: chips naming them are stale
  const [busy, setBusy] = useState(false);
  const read = useCallback(() => {
    if (!enabled) return;
    request('GET', `/api/learn/context?app=${encodeURIComponent(app)}`).then(data => { setDocs(data.documents || []); setRemoved(data.removed || []); }).catch(() => {});
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
    setBusy(true);
    try { await uploadContextDoc(app, file); toast(`Added ${file.name} to context`); } catch (error) { toast(`✗ ${error.message}`); }
    setBusy(false);
  };
  const toggle = (id, attached) => run(() => request('PATCH', `/api/learn/context/${encodeURIComponent(id)}`, { app, attached }));
  const remove = (id) => run(() => request('DELETE', `/api/learn/context/${encodeURIComponent(id)}?app=${encodeURIComponent(app)}`), 'Removed from context');
  return { enabled, docs, removed, busy, upload, toggle, remove, on: docs.filter(doc => doc.attached).length };
}
