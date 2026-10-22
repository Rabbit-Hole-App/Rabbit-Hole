// Canvas context documents (docs/features/canvas-context-docs.md): PDFs and text files a learner
// uploads so the agent can read them, never placed on the canvas. The bytes are in LEARN_MEDIA under
// a key derived from the session; LEARN_DB canvas_context_documents is the list and the toggle.
import { sha256, randomHex, base64 } from './token.js';
import { learnMedia } from './learn-storage.js';
import { NOT_YOURS } from './learn-paper.js';
import { WHOLE_PDF_BYTES, PDF_UPLOAD_LIMIT, SEND_CHARS, readPageTexts, putPageTexts, putPagesError, readPageMeta, readPages, pdfStatus, pagesDocument } from './pdf-pages.js';

export const TEXT_LIMIT = 1024 * 1024;
export const DOCUMENTS_PER_CANVAS = 20;
export const ATTACHED_LIMIT = 10; // packages/web/src/context-docs.js shows it; context-docs.test.mjs pins the two
// Every switched-on document rides every ask in full, so the ones on share a budget beside the count. 15 MB is what
// three 5 MB PDFs could already send before the limit was 10: 20 MB of base64, inside the API's 32 MB request with
// 12 MB left for a chat attachment or a paper, and inside the 128 MB isolate (learn-paper.js). Text is denser in
// tokens (1 MB is about 300k), so 2 MB of text keeps it well inside the models' 1M-token window.
// A long PDF (reads 'pages', pdf-pages.js) counts at the page text one question sends, not its file size.
export const ATTACHED_BYTES = 3 * WHOLE_PDF_BYTES;
export const ATTACHED_TEXT_BYTES = 2 * TEXT_LIMIT;
const mb = bytes => `${(Math.ceil(bytes / (1024 * 1024) * 10) / 10).toFixed(1)} MB`; // up, so one byte over never reads as the limit
const sent = doc => (doc.reads === 'pages' ? SEND_CHARS : doc.size);
const sum = docs => docs.reduce((total, doc) => total + sent(doc), 0);
// Why `doc` cannot join the switched-on `on` - the budget it breaks and the largest documents to switch off - or null.
function budgetRefusal(on, doc) {
  for (const [limit, label, kind] of [[ATTACHED_BYTES, 'documents'], [ATTACHED_TEXT_BYTES, 'text', 'text']]) {
    const same = kind ? on.filter(d => d.kind === kind) : on;
    const after = sum(same) + (!kind || doc.kind === kind ? sent(doc) : 0);
    if (after <= limit) continue;
    const off = [];
    for (const d of same.toSorted((a, b) => b.size - a.size)) { if (after - sum(off) <= limit) break; off.push(d); }
    return `${doc.name} would put ${mb(after)} of ${label} on; the agent reads at most ${mb(limit)} at once. Switch off ${off.map(d => d.name).join(', ')} first.`;
  }
  return null;
}
const ID = /^ctx:[0-9a-f]{12}$/;
const CANVAS = /^canvas-[a-f0-9]{8}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// The canvas identity from canvasAccess: its org and name, and the signed-in owner's email.
const owner = app => ({ org: app.org, app: app.name, email: app.email });
async function objectKey(who, id) {
  const digest = await sha256(JSON.stringify([who.org, who.app, who.email]));
  return `learn-context/${digest}/${id}`;
}
export const documentName = name => {
  const clean = String(name ?? '').replace(/\p{Cc}/gu, ' ').trim();
  return clean ? clean.slice(0, 200) : 'Document';
};

// { kind, bytes } or { error }: trust the bytes for a PDF, the extension and UTF-8 for text.
export function readUpload(name, bytes) {
  if (!bytes.length) return { error: 'That file is empty' };
  if (new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') {
    if (bytes.length > PDF_UPLOAD_LIMIT) return { error: `That PDF is larger than ${PDF_UPLOAD_LIMIT / (1024 * 1024)} MB` };
    return { kind: 'pdf', bytes };
  }
  if (!/\.(txt|md|markdown)$/i.test(String(name || ''))) return { error: 'Upload a PDF, .txt or .md file' };
  if (bytes.length > TEXT_LIMIT) return { error: 'That text file is larger than 1 MB' };
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return { error: 'That text file is not UTF-8' }; }
  return { kind: 'text', bytes };
}

// attached: 1 on, 0 off, -1 removed from the canvas context (materials-remove.md): the row and bytes stay for cards and pages
// that name it, but it is listed nowhere and rides no turn as a whole document.
const homeOf = (who, doc) => (doc.home ? { ...who, app: doc.home } : who);
// Every entry carries its page status (pdf-pages.js pdfStatus; text: ready, no pages). A PDF's small .meta is read for it.
const withStatus = async (env, who, doc) => (doc.kind === 'pdf'
  ? { ...doc, ...pdfStatus(doc.size, await readPageMeta(learnMedia(env), await objectKey(homeOf(who, doc), doc.id))) }
  : { ...doc, pages: null, status: 'ready', reads: null, noText: 0, error: null });
const list = async (env, who) => Promise.all((await env.LEARN_DB.prepare('SELECT id, name, kind, size, attached, created_at FROM canvas_context_documents WHERE org=? AND owner_email=? AND app=? AND attached >= 0 ORDER BY created_at DESC, rowid DESC')
  .bind(who.org, who.email, who.app).all()).results.map(row => withStatus(env, who, { ...row, attached: !!row.attached })));
const removedIds = async (db, who) => (await db.prepare('SELECT id FROM canvas_context_documents WHERE org=? AND owner_email=? AND app=? AND attached < 0')
  .bind(who.org, who.email, who.app).all()).results.map(row => row.id);
// A PDF card or page copied to another canvas (a Duplicate or a fork: pdf-to-canvas.md) still names its
// document by id. Read on that copy, the id is this learner's own document of that id on whichever of their canvases holds
// it - never anyone else's: the lookup is the session's org and email, as every storage key here is. Someone who forked a
// shared canvas has no such row, so a copied page never opens its owner's whole PDF. `home` is the canvas that holds it.
const ownDocument = async (env, who, id) => {
  const row = await env.LEARN_DB.prepare('SELECT app AS home, id, name, kind, size, attached FROM canvas_context_documents WHERE org=? AND owner_email=? AND id=? LIMIT 1').bind(who.org, who.email, id).first();
  return row && withStatus(env, who, { ...row, attached: row.attached > 0, removed: row.attached < 0 });
};
// This learner's own context PDF by id, read exactly as the bytes route reads it (ownDocument): { name, bytes } or null.
// pdf-excerpts.js calls it on every highlight and crop request, so access is re-checked each time.
export async function readOwnDocument(env, app, id) {
  if (!ID.test(id) || !app?.email || !env?.LEARN_DB) return null;
  const who = owner(app), doc = await ownDocument(env, who, id);
  if (!doc || doc.kind !== 'pdf') return null;
  const object = await learnMedia(env).get(await objectKey(homeOf(who, doc), id));
  return object && { name: doc.name, bytes: new Uint8Array(await object.arrayBuffer()) };
}

// The browser encodes the id's colon (ctx%3A...), so match the decoded path.
const decodedPath = url => { try { return decodeURIComponent(url.pathname); } catch { return url.pathname; } };
export const contextDocsRoute = url => url.pathname === '/api/learn/context' || /^\/api\/learn\/context\/ctx:[0-9a-f]{12}(\/pages)?$/.test(decodedPath(url));

export async function contextDocsFetch(req, env, deps = {}) {
  const url = new URL(req.url);
  const db = env.LEARN_DB;
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  // PUT .../<id>/pages: the page text of a stored PDF, read again in the browser (Retry, contract-pdf-status.md section 3).
  const pagesRoute = decodedPath(url).endsWith('/pages');
  const id = decodedPath(url).split('/').at(pagesRoute ? -2 : -1);
  let form = null, body = null;
  if (req.method === 'POST') { try { form = await req.formData(); } catch { return json({ error: 'Send the file as a form upload' }, 400); } }
  if (pagesRoute !== (req.method === 'PUT')) return json({ error: 'Method not allowed' }, 405);
  if (req.method === 'PATCH' || req.method === 'PUT') { try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); } }
  const appName = form ? form.get('app') : body ? body.app : url.searchParams.get('app');
  if (typeof appName !== 'string' || !CANVAS.test(appName)) return json({ error: 'A canvas is required' }, 400);
  // learn-board.js imports index.js, which imports this module: load it here, not at the top.
  const authorize = deps.authorize || (await import('./learn-board.js')).authorizedBoardApp;
  const app = await authorize(req, env, appName);
  if (app instanceof Response) return app;
  const who = owner(app);

  if (url.pathname === '/api/learn/context') {
    if (req.method === 'GET') return json({ documents: await list(env, who), removed: await removedIds(db, who) });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'Choose a file' }, 400);
    const current = await list(env, who);
    if (current.length >= DOCUMENTS_PER_CANVAS) return json({ error: `A canvas holds at most ${DOCUMENTS_PER_CANVAS} context documents` }, 409);
    const upload = readUpload(file.name, new Uint8Array(await file.arrayBuffer()));
    if (upload.error) return json({ error: upload.error }, 400);
    // A PDF's page text from the uploading browser (pdf-pages.js), or its reason for not having it. With neither (an older
    // page) it is read whole if small enough, else listed failed until Retry.
    const texts = upload.kind === 'pdf' && form.has('pages') ? readPageTexts(form.get('pages')) : null;
    if (texts?.error) return json({ error: texts.error }, 400);
    const doc = { id: `ctx:${randomHex(6)}`, name: documentName(file.name), kind: upload.kind, size: upload.bytes.length };
    const key = await objectKey(who, doc.id);
    await learnMedia(env).put(key, upload.bytes, { httpMetadata: { contentType: upload.kind === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8' } });
    if (texts) await putPageTexts(learnMedia(env), key, texts.pages);
    else if (upload.kind === 'pdf' && form.has('pages_error')) await putPagesError(learnMedia(env), key, Number(form.get('page_count')), form.get('pages_error'));
    Object.assign(doc, await withStatus(env, who, doc));
    const on = current.filter(d => d.attached);
    doc.attached = on.length < ATTACHED_LIMIT && !budgetRefusal(on, doc);
    await db.prepare('INSERT INTO canvas_context_documents (org, owner_email, app, id, name, kind, size, attached) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(who.org, who.email, who.app, doc.id, doc.name, doc.kind, doc.size, doc.attached ? 1 : 0).run();
    return json({ document: doc, documents: await list(env, who) });
  }
  if (!ID.test(id)) return json({ error: 'Not found' }, 404);
  const current = await list(env, who);
  // Reading follows a copied card or page to this learner's own document (ownDocument); switching and deleting stay on this canvas.
  const row = current.find(d => d.id === id) ?? (req.method === 'GET' ? await ownDocument(env, who, id) : null);
  if (!row) return json({ error: req.method === 'GET' ? NOT_YOURS : 'That document is not on this canvas' }, 404);
  // The bytes, for the Chat's Sources reader (web chat-context.js docUrl). Owner only, like PATCH and DELETE; nosniff so
  // an uploaded .txt or .md is never rendered as a page.
  if (req.method === 'GET') {
    const object = await learnMedia(env).get(await objectKey(homeOf(who, row), id));
    if (!object) return json({ error: NOT_YOURS }, 404);
    return new Response(object.body, { headers: { 'Content-Type': row.kind === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (req.method === 'PATCH') {
    if (typeof body.attached !== 'boolean') return json({ error: 'attached must be true or false' }, 400);
    if (body.attached && !row.attached) {
      const on = current.filter(d => d.attached);
      if (on.length >= ATTACHED_LIMIT) return json({ error: `At most ${ATTACHED_LIMIT} documents can be on at once. Turn one off first.` }, 409);
      const refused = budgetRefusal(on, row);
      if (refused) return json({ error: refused }, 409);
    }
    await db.prepare('UPDATE canvas_context_documents SET attached=? WHERE org=? AND owner_email=? AND app=? AND id=?').bind(body.attached ? 1 : 0, who.org, who.email, who.app, id).run();
    return json({ documents: await list(env, who) });
  }
  if (req.method === 'PUT') {
    if (row.kind !== 'pdf') return json({ error: 'Only a PDF has pages' }, 400);
    const texts = readPageTexts(body?.pages);
    if (texts.error) return json({ error: texts.error }, 400);
    await putPageTexts(learnMedia(env), await objectKey(who, id), texts.pages);
    const documents = await list(env, who);
    return json({ document: documents.find(d => d.id === id), documents });
  }
  // Remove from canvas context: never the file itself, which cards and pages on this or a copied canvas may still read.
  // ponytail: removed bytes are never reclaimed; a sweep of removed rows no board block names reclaims them.
  if (req.method === 'DELETE') {
    await db.prepare('UPDATE canvas_context_documents SET attached=-1 WHERE org=? AND owner_email=? AND app=? AND id=?').bind(who.org, who.email, who.app, id).run();
    return json({ documents: await list(env, who), removed: await removedIds(db, who) });
  }
  return json({ error: 'Method not allowed' }, 405);
}

// The switched-on documents of a canvas as model content blocks: PDFs as base64 documents, text as
// text documents. `app` is a canvasAccess result (org, name, the session email). Missing bytes are skipped.
// Rows on past the count or the budget (switched on around the route) are not sent, newest first wins: a
// closing text block tells the model which, and one log line records it.
// ids: a Chat turn's doc refs (chat-modes.js docIds) name exactly the documents that ride; null keeps the switched-on ones.
// also: with ids null, documents that ride beside the switched-on ones (a Tutor turn's page, learn-tutor-routes.js pageBlocks).
// pages: the ids among `ids` that a ref names at a page (chat-modes.js pageDocIds). A document removed from the canvas context
// rides only that way (or through `also`); a whole-document ref to it, a stale chip, sends nothing.
// query, page: a long PDF (reads 'pages') sends only the pages this question needs (pdf-pages.js selectPages), starting at the
// page a ref names (`pages` as chat-modes.js pageDocIds' Map of id -> page) or `page` (a Map, the Tutor's page).
export async function contextDocumentBlocks(env, app, ids = null, { also = [], pages = new Set(), query = '', page = new Map() } = {}) {
  if (!env?.LEARN_DB || !app?.name || !CANVAS.test(app.name) || !app.email) return [];
  const who = owner(app);
  const on = [], skipped = [], unavailable = [];
  const here = await list(env, who);
  // A ref to a document not on this canvas: a copied page's, read from this learner's own canvas that holds it (ownDocument).
  const elsewhere = [];
  for (const id of ids || also) {
    if (here.some(d => d.id === id)) continue;
    const doc = await ownDocument(env, who, id);
    if (!doc) unavailable.push(id);
    else if (!doc.removed || !ids || pages.has(id)) elsewhere.push(doc);
  }
  for (const doc of [...here.filter(d => (ids ? ids.has(d.id) : d.attached || also.includes(d.id))), ...elsewhere]) (on.length < ATTACHED_LIMIT && !budgetRefusal(on, doc) ? on : skipped).push(doc);
  const blocks = [], unread = [];
  for (const doc of on) {
    if (doc.reads === 'pages') {
      const texts = doc.status === 'ready' && await readPages(learnMedia(env), await objectKey(homeOf(who, doc), doc.id));
      if (texts) blocks.push(pagesDocument(doc.name, texts, { query, page: (pages instanceof Map ? pages.get(doc.id) : null) ?? page.get(doc.id) ?? null }));
      else unread.push(doc.name);
      continue;
    }
    const object = await learnMedia(env).get(await objectKey(homeOf(who, doc), doc.id));
    if (!object) { unavailable.push(doc.id); continue; }
    const bytes = new Uint8Array(await object.arrayBuffer());
    blocks.push(doc.kind === 'pdf'
      ? { type: 'document', title: doc.name, source: { type: 'base64', media_type: 'application/pdf', data: base64(bytes) } }
      : { type: 'document', title: doc.name, source: { type: 'text', media_type: 'text/plain', data: new TextDecoder().decode(bytes) } });
  }
  if (skipped.length) {
    const names = skipped.map(d => d.name);
    console.warn(JSON.stringify({ event: 'learn_context_skipped', app: app.name, sent: on.length, skipped: names }));
    blocks.push({ type: 'text', text: `Context documents switched on but not sent (over the ${ATTACHED_LIMIT}-document, ${mb(ATTACHED_BYTES)} or ${mb(ATTACHED_TEXT_BYTES)}-of-text budget): ${names.join(', ')}.` });
  }
  if (unread.length) blocks.push({ type: 'text', text: `Attached PDFs whose pages have not been read yet (the learner can press Retry in Context): ${unread.join(', ')}. You have not seen them; say so if the question needs them.` });
  // Never a silent loss: a document the learner attached that this account cannot read is named, so the answer can say so.
  if (unavailable.length) blocks.push({ type: 'text', text: `Attached documents this account cannot read (removed, or another person's): ${unavailable.map(id => `doc:${id}`).join(', ')}. You have not seen them; say so if the question needs them.` });
  return blocks;
}
