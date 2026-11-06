// Source passage references (Tutor release R3, docs/features/source-refs.md; learn-migrations/0038). The server mints a ref from
// a selection the learner can read now, binds it to the source's immutable revision (the sha256 of the stored bytes) and keeps
// its last resolution. A job or a card carries a sourceRef only through this module: a client-supplied id or anchor is never
// proof of access. Reuses pdf-excerpts.js's reader (readSource) and hash, so the access rule and the revision are exactly the
// highlight and crop routes': a fork or share viewer, another account, a removed file or a changed document get no way in.
//
//   POST /api/learn/source-refs          { app, key, home?, rev, anchor }  -> { ref }   (404 not available, 409 source_changed)
//   POST /api/learn/source-refs/resolve  { app, ids: [sref_...] }          -> { refs: [{ id, status, rev }] }
// Statuses: current | changed (the revision differs) | missing (the owner cannot read their own source on this canvas now:
// deleted, or not on this canvas) | unavailable (not this learner's ref, or a ref that does not exist: one answer for both).
// No model call, no navigation guess: a changed or missing source is reported, never matched by position or text.
import { highlightAnchor, readSource, sourceHash, HIGHLIGHT_LIMITS } from './pdf-excerpts.js';
import { SOURCE_KEY, SOURCE_REF_ID, SHA256, kindOfKey, CREATE_REFUSED } from '../../web/src/source-ref.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const MAX_RESOLVE = 50;
export const NOT_AVAILABLE = 'This source is not available to you.';
export const SOURCE_CHANGED = CREATE_REFUSED.source_changed, SOURCE_UNAVAILABLE = CREATE_REFUSED.source_unavailable;

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const mint = () => `sref_${hex(crypto.getRandomValues(new Uint8Array(12)))}`;
const text = (v, max, empty = true) => typeof v === 'string' && v.length <= max && (empty || v.length > 0);

export const sourceRefsRoute = path => path === '/api/learn/source-refs' || path === '/api/learn/source-refs/resolve';

// The anchor a ref stores, rebuilt from known keys in a fixed order (a repeat compares equal), or an error string.
export function refAnchor(kind, anchor) {
  if (kind === 'pdf') return highlightAnchor(anchor);
  const quote = anchor?.quote, L = HIGHLIGHT_LIMITS;
  if (!quote || typeof quote !== 'object' || !text(quote.exact, L.quote, false) || !text(quote.prefix ?? '', L.context) || !text(quote.suffix ?? '', L.context)) return `quote.exact must be 1-${L.quote} characters, prefix and suffix at most ${L.context}`;
  return { quote: { exact: quote.exact, prefix: quote.prefix ?? '', suffix: quote.suffix ?? '' } };
}

export const publicRef = row => ({ v: 1, id: row.id, kind: row.kind, source: { key: row.source_key, rev: row.source_rev, name: row.source_name, home: row.source_home ?? null }, anchor: JSON.parse(row.anchor_json) });

// One ref's source read now by its owner, on the canvas `app`: { status, rev }. Not found is `missing`; the revision is the
// sha256 of the stored bytes, so equal means the anchor still points at the same text, different means it may not.
async function resolveRow(req, env, row, app, deps, seen) {
  const key = `${row.source_key}|${row.source_home ?? ''}`;
  if (!seen.has(key)) {
    seen.set(key, (async () => {
      const source = await readSource(req, env, { app, key: row.source_key, home: row.source_home }, deps);
      if (!source) return null;
      return source.sha || await sourceHash(env.LEARN_DB, source.app, row.source_key, source.bytes);
    })().catch(() => null));
  }
  const rev = await seen.get(key);
  return !rev ? { status: 'missing', rev: null } : { status: rev === row.source_rev ? 'current' : 'changed', rev };
}
const record = (db, id, status) => db.prepare('UPDATE learn_source_refs SET status = ?, checked_at = ? WHERE id = ?').bind(status, Date.now(), id).run();

const ownRow = (db, user, id) => (SOURCE_REF_ID.test(id || '') ? db.prepare('SELECT * FROM learn_source_refs WHERE id = ? AND org = ? AND owner_email = ?').bind(id, user.org, user.email).first() : null);

// For a job or a delivery: this learner's ref by id, re-read now. -> { ref } or { status, code, error }. A ref whose source
// changed or went away is refused before anything is spent, so a card is never made from (or labelled with) a stale passage.
export async function trustedSourceRef(req, env, user, app, id, deps = {}) {
  const row = await ownRow(env.LEARN_DB, user, id);
  if (!row) return { status: 404, code: 'source_unavailable', error: SOURCE_UNAVAILABLE };
  const found = await resolveRow(req, env, row, app, deps, new Map());
  await record(env.LEARN_DB, row.id, found.status);
  if (found.status === 'changed') return { status: 409, code: 'source_changed', error: SOURCE_CHANGED };
  if (found.status !== 'current') return { status: 409, code: 'source_unavailable', error: SOURCE_UNAVAILABLE };
  return { ref: publicRef(row) };
}

async function create(req, env, body, deps) {
  const { app, key, home, rev, anchor } = body || {};
  if (typeof app !== 'string' || !app || typeof key !== 'string' || !SOURCE_KEY.test(key) || !SHA256.test(rev || '')) return json({ error: 'Name the canvas, the source key and the source revision.' }, 400);
  if (home != null && !text(home, 100, false)) return json({ error: 'home must be a canvas name.' }, 400);
  const kind = kindOfKey(key), rebuilt = refAnchor(kind, anchor);
  if (typeof rebuilt === 'string') return json({ error: rebuilt }, 400);
  const source = await readSource(req, env, { app, key, home }, deps);
  if (!source) return json({ error: NOT_AVAILABLE }, 404);
  const sha = source.sha || await sourceHash(env.LEARN_DB, source.app, key, source.bytes);
  if (sha !== rev) return json({ error: SOURCE_CHANGED, code: 'source_changed', rev: sha }, 409);
  const { org, email } = source.app, db = env.LEARN_DB;
  const anchorJson = JSON.stringify(rebuilt), anchorHash = await digest(anchorJson);
  // An uploaded paper's bytes live on a canvas: `home` names it, defaulting to this one (as pdf-excerpt.js does), so a copy still finds it.
  const keep = key.startsWith('pdf:upload:') ? (home || app) : null;
  await db.prepare(`INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_home, source_name, source_rev, anchor_json, anchor_hash, status, checked_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, ?) ON CONFLICT (org, owner_email, source_key, source_rev, anchor_hash) DO NOTHING`)
    .bind(mint(), org, email, kind, key, keep, String(source.name || '').slice(0, 160), sha, anchorJson, anchorHash, Date.now(), Date.now()).run();
  const row = await db.prepare('SELECT * FROM learn_source_refs WHERE org = ? AND owner_email = ? AND source_key = ? AND source_rev = ? AND anchor_hash = ?').bind(org, email, key, sha, anchorHash).first();
  return json({ ref: publicRef(row) });
}

async function resolve(req, env, body, deps) {
  const { app, ids } = body || {};
  if (typeof app !== 'string' || !app || !Array.isArray(ids) || ids.length > MAX_RESOLVE) return json({ error: `Name the canvas and up to ${MAX_RESOLVE} references.` }, 400);
  const authorize = deps.authorize || (await import('./learn-board.js')).authorizedBoardApp;
  const access = await authorize(req, env, app);
  if (access instanceof Response || !access?.email) return json({ error: NOT_AVAILABLE }, 404);
  const seen = new Map(), refs = [];
  for (const id of [...new Set(ids.filter(id => typeof id === 'string'))]) {
    const row = await ownRow(env.LEARN_DB, access, id);
    if (!row) { refs.push({ id, status: 'unavailable', rev: null }); continue; }
    const found = await resolveRow(req, env, row, app, deps, seen);
    if (found.status !== row.status) await record(env.LEARN_DB, row.id, found.status);
    refs.push({ id, status: found.status, rev: found.rev });
  }
  return json({ refs });
}

export async function sourceRefsFetch(req, env, deps = {}) {
  const url = new URL(req.url);
  if (!sourceRefsRoute(url.pathname)) return null;
  if (!env.LEARN_DB) return json({ error: 'Source references need the Learn database on this worker.' }, 503);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  // The learner's identity is the canvas access the source read itself uses; create needs the org and email before its read.
  if (url.pathname.endsWith('/resolve')) return resolve(req, env, body, deps);
  return create(req, env, body, deps);
}
