// Imported file sources (docs/features/canvas-file-imports.md section 4.2): create, upload, download. One immutable original
// per source id in LEARN_MEDIA, its record in LEARN_DB file_sources (learn-migrations/0023). Every read goes through
// authorizeFileSource (file-access.js); an id alone is never access. No model call, no conversion here.
//   POST /api/learn/files                  { app, board, name, type, size, sha256, family } -> { source, upload }
//   PUT  /api/learn/files/<source id>      the bytes; stored only when their count and sha256 match the declaration
//   GET  /api/learn/files/<source id>      the original as an attachment, with Range; ?share=<token>, ?member=<board id> or ?app=&board=
// Any other /api/learn/files path is not this module's (null): the JOBS routes live beside it.
import { boardOwner, byteRange, ownerRow } from './learn-boards.js';
import { authorizeFileSource } from './file-access.js';
import { memberContext } from './canvas-comments.js';
import { repositoryIdentity } from './repositories.js';
import { learnMedia } from './learn-storage.js';
import { clientMismatch, uploadBody } from './upload-body.js';
import { BOARD_FILE_LIMIT, family as familyById, formatBytes } from '../../web/src/file-capabilities.js';
import { HEAD_BYTES, sniffUpload } from './file-sniff.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const SOURCE_ID = /^fs_[0-9a-f]{24}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/;
// Served as itself only from this list (the board-file rule, learn-boards.js SAFE_TYPE); anything else is opaque bytes.
const SAFE_TYPE = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|wav|ogg|webm|mp4|flac))$/;
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const newId = () => `fs_${hex(crypto.getRandomValues(new Uint8Array(12)))}`;
const cleanName = name => String(name ?? '').replace(/[\p{Cc}/\\]/gu, ' ').trim().slice(0, 200) || 'file';
// A family's own source cap, or the board file cap until its lane measures one.
const capOf = fam => fam.limits?.bytes || BOARD_FILE_LIMIT;
const publicSource = row => ({ id: row.id, rev: row.sha256, family: row.family, name: row.name, type: row.media_type, size: row.bytes, status: row.status });

export const filesRoute = path => path === '/api/learn/files' || /^\/api\/learn\/files\/fs_[^/]*$/.test(path);

export async function filesFetch(req, env) {
  const path = new URL(req.url).pathname;
  if (!filesRoute(path)) return null;
  if (!env.LEARN_DB || !learnMedia(env)) return json({ error: 'File imports need the Learn database and media bucket on this worker.' }, 503);
  if (path === '/api/learn/files') return req.method === 'POST' ? create(req, env) : json({ error: 'Method not allowed' }, 405);
  const id = path.slice('/api/learn/files/'.length);
  if (!SOURCE_ID.test(id)) return json({ error: 'Not available' }, 404);
  if (req.method === 'PUT') return upload(req, env, id);
  if (req.method === 'GET' || req.method === 'HEAD') return download(req, env, id);
  return json({ error: 'Method not allowed' }, 405);
}

// A new source on a board its owner writes, or the owner's existing one with the same bytes (never another account's).
async function create(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { app, board = 'main', name, type, size, sha256, family, member } = body || {};
  // A canvas member's board (?member= on reads): members view a canvas and never edit it, so they add no files to it.
  if (member !== undefined) {
    const ctx = await memberContext(req, env, String(member));
    if (ctx instanceof Response) return ctx.status === 401 ? ctx : json({ error: 'Not available' }, 404);
    if (!ctx.actor.owner) return json({ error: 'Canvas members can view this canvas but not add files to it.' }, 403);
  }
  if (typeof app !== 'string' || !BOARD.test(String(board))) return json({ error: 'Name the canvas (app) and board' }, 400);
  const fam = familyById(String(family || ''));
  if (!fam) return json({ error: 'Unknown file family' }, 400);
  if (!Number.isInteger(size) || size < 1) return json({ error: 'The file is empty' }, 400);
  if (size > capOf(fam)) return json({ error: `This file is over ${formatBytes(capOf(fam))}, the limit for ${fam.label.toLowerCase()} files.` }, 413);
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return json({ error: 'sha256 must be 64 lower-case hex characters' }, 400);
  const owner = await boardOwner(req, env, app);
  if (owner instanceof Response) return owner;
  const row = await ownerRow(env, owner, app, board);
  if (!row) return json({ error: 'Save this board first.' }, 404);
  const db = env.LEARN_DB;
  // Owner-scoped reuse: stored identical bytes need no upload; an unfinished upload of them is resumed under its id.
  const same = await db.prepare(`SELECT * FROM file_sources WHERE org = ? AND owner_email = ? AND sha256 = ? AND bytes = ? AND family = ? AND status IN ('stored', 'uploading')
    ORDER BY status = 'stored' DESC, created_at LIMIT 1`).bind(owner.org, owner.email, sha256, size, fam.id).first();
  if (same?.status === 'stored') return json({ source: publicSource(same), upload: null });
  if (same) return json({ source: publicSource(same), upload: { method: 'PUT', url: `/api/learn/files/${same.id}` } });
  const id = newId(), declared = String(type || '').split(';')[0].trim().toLowerCase().slice(0, 120);
  const media = fam.mime.includes(declared) ? declared : fam.mime[0] || 'application/octet-stream';
  await db.prepare(`INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)`).bind(id, owner.org, owner.email, app, row.id, fam.id, cleanName(name), media, declared || null, size, sha256, `file-sources/${id}/original`, Date.now()).run();
  const created = await db.prepare('SELECT * FROM file_sources WHERE id = ?').bind(id).first();
  return json({ source: publicSource(created), upload: { method: 'PUT', url: `/api/learn/files/${id}` } }, 201);
}

// The bytes of an unfinished source, by its owner. Counted and hashed as they stream to their own staging key; the record
// points at that key only once count and hash match, so a bad or concurrent upload never replaces stored bytes.
async function upload(req, env, id) {
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer;
  const db = env.LEARN_DB, bucket = learnMedia(env);
  const row = await db.prepare('SELECT * FROM file_sources WHERE id = ? AND org = ? AND owner_email = ?').bind(id, viewer.org, viewer.email).first();
  if (!row) return json({ error: 'Not available' }, 404);
  if (row.status === 'stored') { await req.body?.cancel().catch(() => {}); return json({ source: publicSource(row) }); }
  if (row.status !== 'uploading') return json({ error: 'This upload has ended. Start it again.' }, 409);
  const fam = familyById(row.family);
  // Streamed natively to its own staging key with bounded memory and CPU (upload-body.js); R2 verifies the declared sha256
  // as it stores (the put's sha256 option), so no byte is hashed in JavaScript and a mismatch stores nothing.
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) !== row.bytes) { await req.body?.cancel().catch(() => {}); return json({ error: `Send exactly ${row.bytes} bytes.` }, Number(declared) > row.bytes ? 413 : 400); }
  const got = await uploadBody(req, { cap: row.bytes, sniffBytes: HEAD_BYTES });
  if (got.refused === 'over') return json({ error: `Send exactly ${row.bytes} bytes.` }, 413);
  if (got.refused === 'length') return json({ error: 'Send this file with its Content-Length.' }, 411);
  if (got.length !== row.bytes) return json({ error: `Send exactly ${row.bytes} bytes.` }, 400);
  // Packages need their complete central directory before storage. Other families retain native streaming.
  const whole = row.family === 'model-package';
  if (whole && got.streamed) {
    try { got.body = new Uint8Array(await new Response(got.body).arrayBuffer()); }
    catch (error) { if (await clientMismatch(got, error)) return json({ error: 'These bytes do not match the declared size.' }, 400); throw error; }
    got.streamed = false;
  }
  const sniffed = sniffUpload({ family: row.family, name: row.name, head: got.head, size: row.bytes, body: whole ? got.body : null });
  if (!sniffed.ok) { await got.body.cancel?.().catch(() => {}); return json({ error: `This file is not a ${fam?.label.toLowerCase() || 'supported'} file this importer reads: ${sniffed.reason}.` }, 415); }
  if (!got.streamed && hex(await crypto.subtle.digest('SHA-256', got.body)) !== row.sha256) return json({ error: 'These bytes do not match the sha256 this upload declared.' }, 400);
  const key = `file-sources/${id}/original/${hex(crypto.getRandomValues(new Uint8Array(8)))}`;
  try {
    await bucket.put(key, got.body, { httpMetadata: { contentType: SAFE_TYPE.test(row.media_type) ? row.media_type : 'application/octet-stream' }, customMetadata: { source: id }, sha256: row.sha256 });
  } catch (error) {
    if (await clientMismatch(got, error)) return json({ error: 'These bytes do not match the size and sha256 this upload declared.' }, 400);
    throw error;
  }
  const done = await db.prepare("UPDATE file_sources SET status = 'stored', r2_key = ?, stored_at = ? WHERE id = ? AND status = 'uploading'").bind(key, Date.now(), id).run();
  if (!done.meta?.changes) await bucket.delete(key); // another upload of the same bytes finished first: keep that one
  return json({ source: publicSource(await db.prepare('SELECT * FROM file_sources WHERE id = ?').bind(id).first()) });
}

// The original, whole or one byte range, to whoever authorizeFileSource admits: the owner; ?share=<token>; or ?app=&board=,
// the requester's own board (a fork's owner reads through their own reference).
async function download(req, env, id) {
  const params = new URL(req.url).searchParams;
  let through = {};
  if (params.get('share')) through = { token: params.get('share') };
  else if (params.get('member')) {
    // A canvas member (or its owner) reads through the member board, as the JOBS routes do: owner or active member, not in Trash.
    const ctx = await memberContext(req, env, params.get('member'));
    if (ctx instanceof Response) return ctx.status === 401 ? ctx : json({ error: 'Not available' }, 404);
    through = { row: await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE id = ?').bind(ctx.board.id).first() };
  } else if (params.get('app')) {
    const owner = await boardOwner(req, env, params.get('app'));
    if (owner instanceof Response) return owner.status === 401 ? owner : json({ error: 'Not available' }, 404);
    const row = await ownerRow(env, owner, params.get('app'), params.get('board') || 'main');
    if (!row) return json({ error: 'Not available' }, 404);
    through = { row };
  }
  let access = await authorizeFileSource(req, env, id, through);
  if (access instanceof Response) return access;
  // Saved CAD Python is owner-only (CAD decision 9): a share, member, board or fork reference reaches its geometry
  // derivatives, never the source itself. Same 404 as any refusal.
  if (access.source.family === 'cad' && access.via !== 'owner') {
    access = await authorizeFileSource(req, env, id);
    if (access instanceof Response) return access.status === 401 ? access : json({ error: 'Not available' }, 404);
  }
  const { source } = access, bucket = learnMedia(env);
  let range = null;
  if (req.headers.get('range')) {
    range = byteRange(req.headers.get('range'), source.bytes);
    if (range === false) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${source.bytes}`, 'Cache-Control': 'private, no-cache' } });
  }
  const object = req.method === 'HEAD' ? null : await bucket.get(source.r2_key, range ? { range } : undefined);
  if (!object && req.method !== 'HEAD') return json({ error: 'Not available' }, 404);
  return new Response(object?.body ?? null, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': SAFE_TYPE.test(source.media_type) ? source.media_type : 'application/octet-stream',
      'Content-Length': String(range ? range.length : source.bytes),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(source.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Accept-Ranges': 'bytes',
      'X-Source-Rev': source.sha256,
      ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${source.bytes}` } : {}),
      // Immutable bytes, but access is per request: never a shared cache.
      'Cache-Control': 'private, no-cache',
    },
  });
}
