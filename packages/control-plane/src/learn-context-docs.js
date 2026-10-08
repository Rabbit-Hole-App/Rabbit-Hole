// Canvas context documents (docs/features/canvas-context-docs.md): PDFs and text files a learner
// uploads so the agent can read them, never placed on the canvas. The bytes are in LEARN_MEDIA under
// a key derived from the session; LEARN_DB canvas_context_documents is the list and the toggle.
import { sha256, randomHex, base64 } from './token.js';
import { learnMedia } from './learn-storage.js';
import { PAPER_UPLOAD_LIMIT } from './learn-paper.js';

export const TEXT_LIMIT = 1024 * 1024;
export const DOCUMENTS_PER_CANVAS = 20;
export const ATTACHED_LIMIT = 10; // packages/web/src/context-docs.js shows it; context-docs.test.mjs pins the two
// Every switched-on document rides every ask in full, so the ones on share a budget beside the count. 15 MB is what
// three 5 MB PDFs could already send before the limit was 10: 20 MB of base64, inside the API's 32 MB request with
// 12 MB left for a chat attachment or a paper, and inside the 128 MB isolate (learn-paper.js). Text is denser in
// tokens (1 MB is about 300k), so 2 MB of text keeps it well inside the models' 1M-token window.
// ponytail: PDF tokens follow pages, which the server does not store; a pages column bounds them if long PDFs fail asks.
export const ATTACHED_BYTES = 3 * PAPER_UPLOAD_LIMIT;
export const ATTACHED_TEXT_BYTES = 2 * TEXT_LIMIT;
const mb = bytes => `${(Math.ceil(bytes / (1024 * 1024) * 10) / 10).toFixed(1)} MB`; // up, so one byte over never reads as the limit
const sum = docs => docs.reduce((total, doc) => total + doc.size, 0);
// Why `doc` cannot join the switched-on `on` - the budget it breaks and the largest documents to switch off - or null.
function budgetRefusal(on, doc) {
  for (const [limit, label, kind] of [[ATTACHED_BYTES, 'documents'], [ATTACHED_TEXT_BYTES, 'text', 'text']]) {
    const same = kind ? on.filter(d => d.kind === kind) : on;
    const after = sum(same) + (!kind || doc.kind === kind ? doc.size : 0);
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
    if (bytes.length > PAPER_UPLOAD_LIMIT) return { error: `That PDF is larger than ${PAPER_UPLOAD_LIMIT / (1024 * 1024)} MB` };
    return { kind: 'pdf', bytes };
  }
  if (!/\.(txt|md|markdown)$/i.test(String(name || ''))) return { error: 'Upload a PDF, .txt or .md file' };
  if (bytes.length > TEXT_LIMIT) return { error: 'That text file is larger than 1 MB' };
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return { error: 'That text file is not UTF-8' }; }
  return { kind: 'text', bytes };
}

const list = async (db, who) => (await db.prepare('SELECT id, name, kind, size, attached, created_at FROM canvas_context_documents WHERE org=? AND owner_email=? AND app=? ORDER BY created_at DESC, rowid DESC')
  .bind(who.org, who.email, who.app).all()).results.map(row => ({ ...row, attached: !!row.attached }));

// The browser encodes the id's colon (ctx%3A...), so match the decoded path.
const decodedPath = url => { try { return decodeURIComponent(url.pathname); } catch { return url.pathname; } };
export const contextDocsRoute = url => url.pathname === '/api/learn/context' || /^\/api\/learn\/context\/ctx:[0-9a-f]{12}$/.test(decodedPath(url));

export async function contextDocsFetch(req, env, deps = {}) {
  const url = new URL(req.url);
  const db = env.LEARN_DB;
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  const id = decodeURIComponent(url.pathname.split('/').pop());
  let form = null, body = null;
  if (req.method === 'POST') { try { form = await req.formData(); } catch { return json({ error: 'Send the file as a form upload' }, 400); } }
  if (req.method === 'PATCH') { try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); } }
  const appName = form ? form.get('app') : body ? body.app : url.searchParams.get('app');
  if (typeof appName !== 'string' || !CANVAS.test(appName)) return json({ error: 'A canvas is required' }, 400);
  // learn-board.js imports index.js, which imports this module: load it here, not at the top.
  const authorize = deps.authorize || (await import('./learn-board.js')).authorizedBoardApp;
  const app = await authorize(req, env, appName);
  if (app instanceof Response) return app;
  const who = owner(app);

  if (url.pathname === '/api/learn/context') {
    if (req.method === 'GET') return json({ documents: await list(db, who) });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'Choose a file' }, 400);
    const current = await list(db, who);
    if (current.length >= DOCUMENTS_PER_CANVAS) return json({ error: `A canvas holds at most ${DOCUMENTS_PER_CANVAS} context documents` }, 409);
    const upload = readUpload(file.name, new Uint8Array(await file.arrayBuffer()));
    if (upload.error) return json({ error: upload.error }, 400);
    const doc = { id: `ctx:${randomHex(6)}`, name: documentName(file.name), kind: upload.kind, size: upload.bytes.length };
    const on = current.filter(d => d.attached);
    doc.attached = on.length < ATTACHED_LIMIT && !budgetRefusal(on, doc);
    await learnMedia(env).put(await objectKey(who, doc.id), upload.bytes, { httpMetadata: { contentType: upload.kind === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8' } });
    await db.prepare('INSERT INTO canvas_context_documents (org, owner_email, app, id, name, kind, size, attached) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(who.org, who.email, who.app, doc.id, doc.name, doc.kind, doc.size, doc.attached ? 1 : 0).run();
    return json({ document: doc, documents: await list(db, who) });
  }
  if (!ID.test(id)) return json({ error: 'Not found' }, 404);
  const current = await list(db, who);
  const row = current.find(d => d.id === id);
  if (!row) return json({ error: 'That document is not on this canvas' }, 404);
  if (req.method === 'PATCH') {
    if (typeof body.attached !== 'boolean') return json({ error: 'attached must be true or false' }, 400);
    if (body.attached && !row.attached) {
      const on = current.filter(d => d.attached);
      if (on.length >= ATTACHED_LIMIT) return json({ error: `At most ${ATTACHED_LIMIT} documents can be on at once. Turn one off first.` }, 409);
      const refused = budgetRefusal(on, row);
      if (refused) return json({ error: refused }, 409);
    }
    await db.prepare('UPDATE canvas_context_documents SET attached=? WHERE org=? AND owner_email=? AND app=? AND id=?').bind(body.attached ? 1 : 0, who.org, who.email, who.app, id).run();
    return json({ documents: await list(db, who) });
  }
  if (req.method === 'DELETE') {
    await db.prepare('DELETE FROM canvas_context_documents WHERE org=? AND owner_email=? AND app=? AND id=?').bind(who.org, who.email, who.app, id).run();
    await learnMedia(env).delete(await objectKey(who, id));
    return json({ documents: await list(db, who) });
  }
  return json({ error: 'Method not allowed' }, 405);
}

// The switched-on documents of a canvas as model content blocks: PDFs as base64 documents, text as
// text documents. `app` is a canvasAccess result (org, name, the session email). Missing bytes are skipped.
// Rows on past the count or the budget (switched on around the route) are not sent, newest first wins: a
// closing text block tells the model which, and one log line records it.
export async function contextDocumentBlocks(env, app) {
  if (!env?.LEARN_DB || !app?.name || !CANVAS.test(app.name) || !app.email) return [];
  const who = owner(app);
  const on = [], skipped = [];
  for (const doc of (await list(env.LEARN_DB, who)).filter(d => d.attached)) (on.length < ATTACHED_LIMIT && !budgetRefusal(on, doc) ? on : skipped).push(doc);
  const blocks = [];
  for (const doc of on) {
    const object = await learnMedia(env).get(await objectKey(who, doc.id));
    if (!object) continue;
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
  return blocks;
}
