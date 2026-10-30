// Canvas context documents (docs/features/canvas-context-docs.md), browser side: the list, upload,
// toggle and delete behind /api/learn/context. The Files panel and the composer's Context button each
// use the hook; a change in one is announced so the other re-reads.
import { useCallback, useEffect, useRef, useState } from 'react';
import { wsHeaders } from './api.js';
import { PDF_UPLOAD_LIMIT, openPdf, processing, readPageTexts } from './context-doc-pages.js';
import { classifyLink } from './link-kind.js';
import { capturePage, readCapture } from './webcard-api.js';
// ui.jsx's toast, by its event: importing the JSX kit would keep this module out of plain-node tests (selection-ref.test.mjs).
const toast = message => window.dispatchEvent(new CustomEvent('small:toast', { detail: { message: String(message) } }));

export const ATTACHED_LIMIT = 10; // the server's (learn-context-docs.js), pinned by context-docs.test.mjs
export const CONTEXT_ACCEPT = '.pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown';
// A canvas, or a repository project's Main canvas (the server's CANVAS, learn-context-docs.js): files supplement a repository's context.
export const isContextCanvas = app => /^(?:canvas-[a-f0-9]{8}|repo-[a-f0-9]{8}-[a-z0-9-]{1,64})$/.test(String(app || ''));
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

// A link kept as context with no card (Start a rabbit hole): the server resolves it into a small text note and stores that as a
// context document; the same link twice answers with the one note. Throws the server's reason.
export async function uploadContextLink(app, url) {
  const data = await request('POST', '/api/learn/context/link', { app, url });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { app } }));
  return data.document;
}

// Add context with a web address (owner brief 2026-10-29): resolves with the Context document; throws the reason, said plainly.
// arXiv, Wikipedia and YouTube keep their note (uploadContextLink: the abstract, the introduction, or only the address, and the
// note says which). Any other public HTTPS page is captured and screened by the webpage-card pipeline for this canvas's Context
// (context: true: on no board), then its approved capture is linked as a Context document (learn-context-docs.js linkCapture).
// { id, lineage }: Refresh of that document - a version that did not pass leaves the last good one in use. The same address on
// the same canvas while one is in flight waits on that one (a double submit captures once). A reply still screening is polled.
const adding = new Map();
const POLL_MS = 3000, POLLS = 80; // the server calls a screening that ran past 3 minutes an error, so the polls end before this
export function addContextUrl(app, url, { id = null, lineage = null, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const link = classifyLink(url);
  if (!link.ok) return Promise.reject(new Error(link.error));
  if (!id && link.type !== 'webpage') return uploadContextLink(app, link.url);
  if (!id && !/^https:/i.test(link.url)) return Promise.reject(new Error('Add an https:// address.'));
  const key = `${app}|${id || link.url}`;
  if (!adding.has(key)) adding.set(key, (async () => {
    let reply = await capturePage({ app, context: true, url: link.url, ...(lineage ? { lineage } : {}) });
    for (let n = 0; reply.status === 'screening' && reply.manifestId && n < POLLS; n += 1) { await wait(POLL_MS); reply = await readCapture(reply.manifestId, { app, context: true }); }
    if (reply.status !== 'ready') throw new Error(reply.reason || 'This page could not be captured. Try again.');
    const data = await request('POST', '/api/learn/context/link', { app, manifest: reply.manifestId, ...(id ? { id } : {}) });
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { app, data } }));
    return data.document;
  })().finally(() => adding.delete(key)));
  return adding.get(key);
}

// A stored file source (file-source-client.js uploadSource) made context without sending its bytes again: the server copies it
// inside its own storage, for the source's owner and the revision named only.
export async function uploadContextSource(app, source) {
  const body = new FormData();
  body.append('app', app);
  body.append('source_id', source.id);
  body.append('source_rev', source.rev);
  const data = await request('POST', '/api/learn/context', body);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { app } }));
  return data.document;
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
// One DELETE per document at a time (UI-26): a second press, from this or any other list, waits on the first. Its answer (the
// list and removed ids after the removal) goes with the event, so every mounted list of that canvas applies it at once instead
// of re-reading - no refresh, and no older read in flight can bring the row back (listSync).
const removing = new Map();
export function removeContextDoc(app, id) {
  const key = `${app}|${id}`;
  if (!removing.has(key)) removing.set(key, request('DELETE', `/api/learn/context/${encodeURIComponent(id)}?app=${encodeURIComponent(app)}`)
    .then(data => { window.dispatchEvent(new CustomEvent(EVENT, { detail: { app, data } })); return data; })
    .finally(() => removing.delete(key)));
  return removing.get(key);
}

// A Materials row's canvas context switch (pdf-materials-refinement.md section 1): the canvas-level attached flag of that one
// document. Throws the server's reason (the ten-on limit, the budget), so the row that asked can show it.
export async function toggleContextDoc(app, id, attached) {
  const data = await request('PATCH', `/api/learn/context/${encodeURIComponent(id)}`, { app, attached });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { app, data } }));
  return data;
}

// A canvas's list arrives from reads and from changes, in any order. A read takes its number when it is sent; a change's answer
// (DELETE, PATCH) takes the next number when it lands, so it outranks every read sent before it. Only a newer number applies:
// a slow read sent before a removal can never bring the removed row back.
export function listSync() {
  let issued = 0, applied = 0;
  return {
    issue: () => ++issued,
    settle: () => (applied = ++issued),
    accept: n => (n > applied ? ((applied = n), true) : false),
  };
}

export function useContextDocs(app) {
  const enabled = isContextCanvas(app);
  // The list belongs to the canvas it was read for: an answer for another canvas (switched away meanwhile) never shows here.
  const [list, setList] = useState({ app, docs: [], removed: [] });
  const [busy, setBusy] = useState(false);
  const sync = useRef(null), current = useRef(app);
  sync.current ||= listSync();
  current.current = app;
  const apply = useCallback((forApp, data) => {
    if (forApp !== current.current) return;
    setList(previous => ({ app: forApp, docs: data.documents || (previous.app === forApp ? previous.docs : []), removed: data.removed || (previous.app === forApp ? previous.removed : []) }));
  }, []);
  const read = useCallback(() => {
    if (!enabled) return;
    const n = sync.current.issue();
    request('GET', `/api/learn/context?app=${encodeURIComponent(app)}`).then(data => { if (sync.current.accept(n)) apply(app, data); }).catch(() => {});
  }, [app, enabled, apply]);
  useEffect(() => {
    read();
    const on = event => {
      if (event.detail?.app !== app) return;
      if (!event.detail.data) return read();
      sync.current.settle();
      apply(app, event.detail.data);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [read, app, apply]);
  const docs = list.app === app ? list.docs : [], removed = list.app === app ? list.removed : [];
  const changed = data => window.dispatchEvent(new CustomEvent(EVENT, { detail: { app, data } }));
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
  const remove = (id) => run(() => removeContextDoc(app, id), 'Removed from context');
  return { enabled, docs, removed, busy, upload, toggle, remove, on: docs.filter(doc => doc.attached).length };
}
