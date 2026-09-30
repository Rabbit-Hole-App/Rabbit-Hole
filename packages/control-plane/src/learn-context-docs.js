// Canvas context documents (docs/features/canvas-context-docs.md): PDFs and text files a learner
// uploads so the agent can read them, never placed on the canvas. The bytes are in LEARN_MEDIA under
// a key derived from the session; LEARN_DB canvas_context_documents is the list and the toggle.
import { sha256, randomHex, base64 } from './token.js';
import { learnMedia } from './learn-storage.js';
import { PAPER_UPLOAD_LIMIT } from './learn-paper.js';

export const TEXT_LIMIT = 1024 * 1024;
export const DOCUMENTS_PER_CANVAS = 20;
export const ATTACHED_LIMIT = 3;
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

export const contextDocsRoute = url => url.pathname === '/api/learn/context' || /^\/api\/learn\/context\/ctx:[0-9a-f]{12}$/.test(url.pathname);

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
    const doc = { id: `ctx:${randomHex(6)}`, name: documentName(file.name), kind: upload.kind, size: upload.bytes.length, attached: current.filter(d => d.attached).length < ATTACHED_LIMIT };
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
    if (body.attached && !row.attached && current.filter(d => d.attached).length >= ATTACHED_LIMIT) return json({ error: `At most ${ATTACHED_LIMIT} documents can be on at once. Turn one off first.` }, 409);
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
export async function contextDocumentBlocks(env, app) {
  if (!env?.LEARN_DB || !app?.name || !CANVAS.test(app.name) || !app.email) return [];
  const who = owner(app);
  const on = (await list(env.LEARN_DB, who)).filter(d => d.attached).slice(0, ATTACHED_LIMIT);
  const blocks = [];
  for (const doc of on) {
    const object = await learnMedia(env).get(await objectKey(who, doc.id));
    if (!object) continue;
    const bytes = new Uint8Array(await object.arrayBuffer());
    blocks.push(doc.kind === 'pdf'
      ? { type: 'document', title: doc.name, source: { type: 'base64', media_type: 'application/pdf', data: base64(bytes) } }
      : { type: 'document', title: doc.name, source: { type: 'text', media_type: 'text/plain', data: new TextDecoder().decode(bytes) } });
  }
  return blocks;
}
