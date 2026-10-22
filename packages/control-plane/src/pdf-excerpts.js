// PDF highlights and excerpt crops (C:/s/spec/pdf-excerpts/contract.md "Server API"; learn-migrations/0024). Every route
// re-reads the PDF the way its bytes route does - readOwnDocument for doc:ctx:<id>, readUploadedPaper under paperIdentity
// for pdf:upload:<id> - so a fork viewer, another account or a removed file gets the one 404 on every call; a known
// highlight id or hash never stands in for that read. No model call here.
//   GET    /api/learn/pdf-source?app=&key=&home=                         -> { key, sha256, name, bytes }
//   GET    /api/learn/pdf-highlights?app=&key=&home=                     -> { sha256, highlights, changed }
//   PUT    /api/learn/pdf-highlights/<pdfh id>                           { app, key, home, sha256, kind, page, rects, rotate, view, quote }
//   DELETE /api/learn/pdf-highlights/<pdfh id>?app=&key=&home=
//   PUT    /api/learn/pdf-excerpts/<pdfx id>/crop?app=&board=&key=&home=&sha256=&page=   raw image/png
import { readOwnDocument } from './learn-context-docs.js';
import { paperIdentity, readUploadedPaper } from './learn-paper.js';
import { boardOwner, ownerRow } from './learn-boards.js';
import { learnMedia } from './learn-storage.js';
import { authorizeFileSource } from './file-access.js';
import { family } from '../../web/src/file-capabilities.js';
import { fileCardFromSource } from '../../web/src/file-to-canvas.js';

export const NOT_AVAILABLE = 'This file is not available to you.';
export const CHANGED = 'This document changed since you selected this.';
export const CROP_LIMITS = Object.freeze({ bytes: 4 * 1024 * 1024, side: 4096 });
export const HIGHLIGHT_LIMITS = Object.freeze({ rects: 64, quote: 8000, context: 500, label: 40 });
// web:<lineage> is a webpage card's capture lineage (webpage-capture.js); its version is the manifest the card shows.
const KEY = /^((doc:ctx|pdf:upload):[0-9a-f]{12}|web:wc_[0-9a-f]{24})$/;
const FS_ID = /^fs_[0-9a-f]{24}$/;
const HIGHLIGHT_ID = /^pdfh_[0-9a-f]{24}$/, EXCERPT_ID = /^pdfx_[0-9a-f]{24}$/, SHA = /^[0-9a-f]{64}$/;
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refuse = () => json({ error: NOT_AVAILABLE }, 404);
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));

export const pdfExcerptsRoute = path => path === '/api/learn/pdf-source' || path === '/api/learn/pdf-highlights'
  || /^\/api\/learn\/pdf-highlights\/[^/]+$/.test(path) || /^\/api\/learn\/pdf-excerpts\/[^/]+\/crop$/.test(path);

// { app, name, bytes } of the session's own stored PDF, or null for any refusal (no canvas access, not theirs, gone).
async function readSource(req, env, { app: appName, key, home, manifest }, deps) {
  if (typeof appName !== 'string' || typeof key !== 'string' || !KEY.test(key)) return null;
  // learn-board.js imports index.js, which imports modules that import this one: load it here (as learn-context-docs.js does).
  const authorize = deps.authorize || (await import('./learn-board.js')).authorizedBoardApp;
  const app = await authorize(req, env, appName);
  if (app instanceof Response || !app?.email) return null;
  try {
    // A webpage capture: the screened manifest this viewer reads as its owner or through their own board's reference.
    // Its sha256 is the version; file-access.js serves 'stored' (screened) manifests only.
    if (key.startsWith('web:')) {
      if (typeof manifest !== 'string' || !FS_ID.test(manifest)) return null;
      let found = await authorizeFileSource(req, env, manifest);
      if (found instanceof Response) {
        const row = await ownerRow(env, app, appName, 'main');
        found = row ? await authorizeFileSource(req, env, manifest, { row }) : found;
      }
      if (found instanceof Response || found.source.family !== 'webpage' || found.source.declared_type !== 'webpage-manifest') return null;
      return { app, name: found.source.name, sha: found.source.sha256 };
    }
    if (key.startsWith('doc:')) {
      const doc = await readOwnDocument(env, app, key.slice(4));
      return doc && { app, name: doc.name, bytes: doc.bytes };
    }
    const paper = await readUploadedPaper(env, paperIdentity(app, typeof home === 'string' ? home : null), key.slice(4));
    return { app, name: paper.title, bytes: paper.bytes };
  } catch { return null; }
}

// The stored bytes' sha256, hashed once per (owner, key) and cached; bytes are never replaced in place (contract facts).
async function sourceHash(db, app, key, bytes) {
  const cached = await db.prepare('SELECT sha256 FROM pdf_source_hashes WHERE org = ? AND owner_email = ? AND source_key = ? AND bytes = ?').bind(app.org, app.email, key, bytes.length).first();
  if (cached) return cached.sha256;
  const sha = await digest(bytes);
  await db.prepare('INSERT INTO pdf_source_hashes (org, owner_email, source_key, sha256, bytes, computed_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (org, owner_email, source_key) DO UPDATE SET sha256 = excluded.sha256, bytes = excluded.bytes, computed_at = excluded.computed_at')
    .bind(app.org, app.email, key, sha, bytes.length, Date.now()).run();
  return sha;
}

const finite = v => typeof v === 'number' && Number.isFinite(v);
const rect = r => Array.isArray(r) && r.length === 4 && r.every(finite) && r[0] <= r[2] && r[1] <= r[3];
const text = (v, max, empty = true) => typeof v === 'string' && v.length <= max && (empty || v.length > 0);

// The anchor a PUT stores, rebuilt from known keys in a fixed order (so a retry compares equal), or an error string.
export function highlightAnchor(body) {
  const L = HIGHLIGHT_LIMITS, { kind, page, rects, rotate, view, quote } = body || {};
  if (kind !== 'text' && kind !== 'region') return 'kind must be text or region';
  if (!page || typeof page !== 'object' || !Number.isInteger(page.index) || page.index < 1) return 'page.index must be an integer of at least 1';
  if (!(page.label == null || text(page.label, L.label, false))) return `page.label must be null or 1-${L.label} characters`;
  if (!Array.isArray(rects) || !rects.length || rects.length > L.rects || !rects.every(rect)) return `rects must be 1-${L.rects} rectangles [x1, y1, x2, y2] of finite numbers`;
  if (kind === 'region' && rects.length !== 1) return 'a region has exactly one rectangle';
  if (![0, 90, 180, 270].includes(rotate)) return 'rotate must be 0, 90, 180 or 270';
  if (!(Array.isArray(view) && view.length === 4 && view.every(finite))) return 'view must be four finite numbers';
  let q = null;
  if (kind === 'text') {
    if (!quote || typeof quote !== 'object' || !text(quote.exact, L.quote, false) || !text(quote.prefix ?? '', L.context) || !text(quote.suffix ?? '', L.context)) return `quote.exact must be 1-${L.quote} characters, prefix and suffix at most ${L.context}`;
    q = { exact: quote.exact, prefix: quote.prefix ?? '', suffix: quote.suffix ?? '' };
  } else if (quote != null) return 'a region has no quote';
  return { kind, page: { index: page.index, label: page.label ?? null }, rects: rects.map(r => [...r]), rotate, view: [...view], quote: q };
}
const publicHighlight = row => ({ id: row.id, ...JSON.parse(row.anchor_json), created_at: row.created_at });

// The PNG's IHDR width and height, or null when the bytes are not a PNG.
export function pngSize(bytes) {
  if (bytes.length < 24 || PNG.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function pdfExcerptsFetch(req, env, deps = {}) {
  const url = new URL(req.url), path = url.pathname, db = env.LEARN_DB;
  if (!pdfExcerptsRoute(path)) return null;
  if (!db || !learnMedia(env)) return json({ error: 'PDF highlights need the Learn database and media bucket on this worker.' }, 503);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  const params = Object.fromEntries(url.searchParams);

  if (path === '/api/learn/pdf-source' || path === '/api/learn/pdf-highlights') {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const source = await readSource(req, env, params, deps);
    // A webpage capture (web:<lineage>) has highlights but no PDF bytes: pdf-source refuses it like any other non-PDF.
    if (!source || (path === '/api/learn/pdf-source' && !source.bytes)) return refuse();
    const sha = (source.sha || await sourceHash(db, source.app, params.key, source.bytes));
    if (path === '/api/learn/pdf-source') return json({ key: params.key, sha256: sha, name: source.name, bytes: source.bytes.length });
    const mine = 'org = ? AND owner_email = ? AND source_key = ?', who = [source.app.org, source.app.email, params.key];
    const rows = (await db.prepare(`SELECT * FROM pdf_highlights WHERE ${mine} AND source_sha256 = ? ORDER BY page_index, created_at, id`).bind(...who, sha).all()).results;
    const changed = (await db.prepare(`SELECT count(*) AS n FROM pdf_highlights WHERE ${mine} AND source_sha256 != ?`).bind(...who, sha).first()).n;
    return json({ sha256: sha, highlights: rows.map(publicHighlight), changed });
  }

  const highlight = path.match(/^\/api\/learn\/pdf-highlights\/([^/]+)$/);
  if (highlight) {
    const id = highlight[1];
    if (!HIGHLIGHT_ID.test(id)) return refuse();
    if (req.method === 'DELETE') {
      const source = await readSource(req, env, params, deps);
      if (!source) return refuse();
      const row = await db.prepare('SELECT org, owner_email FROM pdf_highlights WHERE id = ?').bind(id).first();
      if (row && (row.org !== source.app.org || row.owner_email !== source.app.email)) return refuse();
      // Cards keep their own anchors (block.excerpt), so deleting a highlight touches nothing else. Absent: already deleted.
      await db.prepare('DELETE FROM pdf_highlights WHERE id = ? AND org = ? AND owner_email = ? AND source_key = ?').bind(id, source.app.org, source.app.email, params.key).run();
      return json({ deleted: true });
    }
    if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const anchor = highlightAnchor(body);
    if (typeof anchor === 'string') return json({ error: anchor }, 400);
    const source = await readSource(req, env, body, deps);
    if (!source) return refuse();
    const sha = (source.sha || await sourceHash(db, source.app, body.key, source.bytes));
    if (body.sha256 !== sha) return json({ error: CHANGED, sha256: sha }, 409);
    const anchorJson = JSON.stringify(anchor), now = Date.now();
    await db.prepare('INSERT INTO pdf_highlights (id, org, owner_email, source_key, source_sha256, kind, page_index, anchor_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
      .bind(id, source.app.org, source.app.email, body.key, sha, anchor.kind, anchor.page.index, anchorJson, now, now).run();
    const row = await db.prepare('SELECT * FROM pdf_highlights WHERE id = ?').bind(id).first();
    if (row.org !== source.app.org || row.owner_email !== source.app.email) return refuse();
    // A retry of the same highlight is the same answer; the same id with another body is a client bug, never an overwrite.
    if (row.source_key !== body.key || row.source_sha256 !== sha || row.anchor_json !== anchorJson) return json({ error: 'This highlight id is already saved with different content.' }, 409);
    return json({ highlight: publicHighlight(row) });
  }

  // PUT /api/learn/pdf-excerpts/<pdfx id>/crop: a region crop stored as an image file source the excerpt card's fileRef names.
  const id = path.match(/^\/api\/learn\/pdf-excerpts\/([^/]+)\/crop$/)[1];
  if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  if (!EXCERPT_ID.test(id)) return refuse();
  const board = params.board || 'main', page = Number(params.page);
  if (!BOARD.test(board) || !Number.isInteger(page) || page < 1 || !SHA.test(params.sha256 || '')) return json({ error: 'Name the board, the page (1 or more) and the document sha256.' }, 400);
  const source = await readSource(req, env, params, deps);
  if (!source) return refuse();
  // Board ownership exactly as POST /api/learn/files: only the owner adds a file to a board.
  const owner = await (deps.boardOwner || boardOwner)(req, env, params.app);
  if (owner instanceof Response || owner.org !== source.app.org || owner.email !== source.app.email) return refuse();
  const boardRow = await ownerRow(env, owner, params.app, board);
  if (!boardRow) return json({ error: 'Save this board first.' }, 404);
  const sha = (source.sha || await sourceHash(db, source.app, params.key, source.bytes));
  if (params.sha256 !== sha) { await req.body?.cancel().catch(() => {}); return json({ error: CHANGED, sha256: sha }, 409); }
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > CROP_LIMITS.bytes) { await req.body?.cancel().catch(() => {}); return json({ error: `A crop is at most ${CROP_LIMITS.bytes / (1024 * 1024)} MB.` }, 413); }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > CROP_LIMITS.bytes) return json({ error: `A crop is at most ${CROP_LIMITS.bytes / (1024 * 1024)} MB.` }, 413);
  const size = pngSize(bytes);
  if (!size) return json({ error: 'A crop must be a PNG image.' }, 415);
  if (size.width < 1 || size.height < 1 || size.width > CROP_LIMITS.side || size.height > CROP_LIMITS.side) return json({ error: `A crop is at most ${CROP_LIMITS.side} pixels on each side.` }, 413);
  const pngSha = await digest(bytes);
  // Deterministic per account and excerpt: a retried or doubled upload lands on one source (inline-image-jobs.js publish).
  const sourceId = `fs_${(await digest(new TextEncoder().encode(`pdf-excerpt:${owner.org}${owner.email}${id}`))).slice(0, 24)}`;
  const name = `${source.name.replace(/[\p{Cc}/\\]/gu, ' ').trim().slice(0, 160) || 'Document'}, page ${page} excerpt.png`;
  const same = row => row.org === owner.org && row.owner_email === owner.email && row.sha256 === pngSha && row.status === 'stored';
  const answer = row => json({ source: { id: row.id, rev: row.sha256 }, fileRef: fileCardFromSource({ id: row.id, rev: row.sha256, name: row.name, type: row.media_type, size: row.bytes }, family('image')).fileRef, ...size, bytes: row.bytes });
  const old = await db.prepare('SELECT * FROM file_sources WHERE id = ?').bind(sourceId).first();
  if (old) return same(old) ? answer(old) : json({ error: 'This excerpt already has a different crop. Start a new excerpt.' }, 409);
  const key = `file-sources/${sourceId}/original/${pngSha}`;
  await learnMedia(env).put(key, bytes, { httpMetadata: { contentType: 'image/png' }, customMetadata: { source: sourceId }, sha256: pngSha });
  await db.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, ?, ?, ?, ?, 'image', ?, 'image/png', 'image/png', ?, ?, ?, 'stored', ?, ?) ON CONFLICT (id) DO NOTHING")
    .bind(sourceId, owner.org, owner.email, params.app, boardRow.id, name, bytes.length, pngSha, key, Date.now(), Date.now()).run();
  const row = await db.prepare('SELECT * FROM file_sources WHERE id = ?').bind(sourceId).first();
  if (same(row)) return answer(row);
  if (row.r2_key !== key) await learnMedia(env).delete(key); // a concurrent upload of other bytes won: keep only its object
  return json({ error: 'This excerpt already has a different crop. Start a new excerpt.' }, 409);
}
