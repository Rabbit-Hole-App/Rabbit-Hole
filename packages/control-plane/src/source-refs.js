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
import { SOURCE_KEY, SOURCE_REF_ID, SHA256, QUOTE_LIMITS, kindOfKey, CREATE_REFUSED } from '../../web/src/source-ref.js';
// pdf-excerpts.js imports learn-boards.js, which saves the index below: it is loaded when a source is read, not when this module is.
const pdf = () => import('./pdf-excerpts.js');

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const MAX_RESOLVE = 50;
export const NOT_AVAILABLE = 'This source is not available to you.';
export const SOURCE_CHANGED = CREATE_REFUSED.source_changed, SOURCE_UNAVAILABLE = CREATE_REFUSED.source_unavailable;

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const mint = () => `sref_${hex(crypto.getRandomValues(new Uint8Array(12)))}`;
const text = (v, max, empty = true) => typeof v === 'string' && v.length <= max && (empty || v.length > 0);

export const sourceRefsRoute = path => path === '/api/learn/source-refs' || path === '/api/learn/source-refs/resolve' || path === '/api/learn/source-refs/cards';

// The anchor a ref stores, rebuilt from known keys in a fixed order (a repeat compares equal), or an error string.
export async function refAnchor(kind, anchor) {
  if (kind === 'pdf') return (await pdf()).highlightAnchor(anchor);
  const quote = anchor?.quote, L = QUOTE_LIMITS;
  if (!quote || typeof quote !== 'object' || !text(quote.exact, L.exact, false) || !text(quote.prefix ?? '', L.context) || !text(quote.suffix ?? '', L.context)) return `quote.exact must be 1-${L.exact} characters, prefix and suffix at most ${L.context}`;
  return { quote: { exact: quote.exact, prefix: quote.prefix ?? '', suffix: quote.suffix ?? '' } };
}

export const publicRef = row => ({ v: 1, id: row.id, kind: row.kind, source: { key: row.source_key, rev: row.source_rev, name: row.source_name, home: row.source_home ?? null }, anchor: JSON.parse(row.anchor_json) });

// One ref's source read now by its owner, on the canvas `app`: { status, rev }. Not found is `missing`; the revision is the
// sha256 of the stored bytes, so equal means the anchor still points at the same text, different means it may not.
async function resolveRow(req, env, row, app, deps, seen) {
  const key = `${row.source_key}|${row.source_home ?? ''}`;
  if (!seen.has(key)) {
    seen.set(key, (async () => {
      const { readSource, sourceHash } = await pdf();
      const source = await readSource(req, env, { app, key: row.source_key, home: row.source_home }, deps);
      if (!source) return null;
      return source.sha || await sourceHash(env.LEARN_DB, source.app, row.source_key, source.bytes);
    })().catch(() => null));
  }
  const rev = await seen.get(key);
  return !rev ? { status: 'missing', rev: null } : { status: rev === row.source_rev ? 'current' : 'changed', rev };
}
// The last resolution, on the ref and on every card of the owner's boards that holds it.
const record = (db, id, status) => db.batch([db.prepare('UPDATE learn_source_refs SET status = ?, checked_at = ? WHERE id = ? AND status != ?').bind(status, Date.now(), id, status),
  db.prepare('UPDATE learn_source_ref_cards SET status = ? WHERE ref_id = ? AND status != ?').bind(status, id, status)]);

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
  const kind = kindOfKey(key), rebuilt = await refAnchor(kind, anchor);
  if (typeof rebuilt === 'string') return json({ error: rebuilt }, 400);
  const { readSource, sourceHash } = await pdf();
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
    await record(env.LEARN_DB, row.id, found.status);
    refs.push({ id, status: found.status, rev: found.rev });
  }
  return json({ refs });
}

// ---- The derived source-to-card index, committed with the board (learn_source_ref_cards, migration 0038) ----

const MAX_INDEXED = 500; // position: the card's place in the board, so return targets come back in a fixed order
// The cards of a saved board that carry a sourceRef, one per card id, in board order: what the index is rebuilt from.
export function sourceRefCards(state) {
  const seen = new Set(), cards = [];
  for (const block of Array.isArray(state?.blocks) ? state.blocks : []) {
    const ref = block?.sourceRef;
    if (typeof block?.id !== 'string' || !block.id || seen.has(block.id) || typeof ref?.id !== 'string' || !SOURCE_REF_ID.test(ref.id)) continue;
    seen.add(block.id);
    cards.push({ card: block.id.slice(0, 200), ref: ref.id, key: String(ref.source?.key ?? ''), rev: String(ref.source?.rev ?? '') });
    if (cards.length >= MAX_INDEXED) break;
  }
  return cards;
}
// The board row exactly as this batch's write left it (canvas-refs.js GUARD): a rejected, stale or same-base losing save changes nothing.
const GUARD = 'EXISTS (SELECT 1 FROM learn_boards g WHERE g.id = ? AND g.state_json = ? AND g.version = COALESCE(?, g.version))';
// The index rewrite for one board write, for the same batch, after the write. A card is indexed only for a ref THIS learner minted for the
// source the card names (id, owner and key all match): a copied or forged sourceRef is not authorization and indexes nothing. The card's
// claimed revision must be the minted one, and the source's revision now (file_sources, pdf_source_hashes) must still be it: otherwise the
// entry is 'changed'; a stored file that is gone is 'missing'. A PDF whose revision was never hashed stays 'current' until it is opened.
export function sourceRefStatements(db, boardId, text, version, state, saver) {
  const cards = JSON.stringify(sourceRefCards(state)), guard = [boardId, text, version ?? null];
  return [
    db.prepare(`DELETE FROM learn_source_ref_cards WHERE board_id = ? AND ${GUARD}`).bind(boardId, ...guard),
    db.prepare(`INSERT OR IGNORE INTO learn_source_ref_cards (board_id, card_id, ref_id, source_key, source_rev, status, position)
      SELECT ?, json_extract(j.value, '$.card'), r.id, r.source_key, r.source_rev,
        CASE WHEN json_extract(j.value, '$.rev') != r.source_rev THEN 'changed'
          WHEN r.source_key LIKE 'file:%' THEN COALESCE((SELECT CASE WHEN fs.sha256 = r.source_rev THEN 'current' ELSE 'changed' END FROM file_sources fs WHERE fs.id = substr(r.source_key, 6) AND fs.org = r.org AND fs.owner_email = r.owner_email), 'missing')
          ELSE COALESCE((SELECT CASE WHEN h.sha256 = r.source_rev THEN 'current' ELSE 'changed' END FROM pdf_source_hashes h WHERE h.org = r.org AND h.owner_email = r.owner_email AND h.source_key = r.source_key), 'current') END, CAST(j.key AS INTEGER)
      FROM json_each(?) j JOIN learn_source_refs r ON r.id = json_extract(j.value, '$.ref') AND r.org = ? AND r.owner_email = ? AND r.source_key = json_extract(j.value, '$.key')
      WHERE ${GUARD}`).bind(boardId, cards, saver.org, saver.email, ...guard),
  ];
}
// A board row is deleted: its entries go with it, in the same batch.
export const dropSourceRefCards = (db, org, owner, app) => db.prepare('DELETE FROM learn_source_ref_cards WHERE board_id IN (SELECT id FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ?)').bind(org, owner, app);

// GET /api/learn/source-refs/cards?app=&key=: the owner's cards on this canvas made from this source, in board order, with each entry's
// status when the board was saved and the revision it names: the return targets for a passage (R4 and Progress read it; the canvas itself
// works from its own blocks). Another learner's canvas or a key they did not use gets the same empty answer as none.
async function cardsFor(req, env, params, deps) {
  const { app, key } = params;
  if (typeof app !== 'string' || !app || !SOURCE_KEY.test(key || '')) return json({ error: 'Name the canvas and the source key.' }, 400);
  const authorize = deps.authorize || (await import('./learn-board.js')).authorizedBoardApp;
  const access = await authorize(req, env, app);
  if (access instanceof Response || !access?.email) return json({ error: NOT_AVAILABLE }, 404);
  const { results } = await env.LEARN_DB.prepare(`SELECT c.card_id, c.ref_id, c.source_rev, c.status FROM learn_source_ref_cards c JOIN learn_boards b ON b.id = c.board_id
    WHERE b.org = ? AND b.owner_email = ? AND b.app = ? AND b.board = 'main' AND c.source_key = ? ORDER BY c.position`).bind(access.org, access.email, app, key).all();
  return json({ cards: results.map(row => ({ cardId: row.card_id, refId: row.ref_id, rev: row.source_rev, status: row.status })) });
}

export async function sourceRefsFetch(req, env, deps = {}) {
  const url = new URL(req.url);
  if (!sourceRefsRoute(url.pathname)) return null;
  if (!env.LEARN_DB) return json({ error: 'Source references need the Learn database on this worker.' }, 503);
  if (url.pathname.endsWith('/cards')) return req.method === 'GET' ? cardsFor(req, env, Object.fromEntries(url.searchParams), deps) : json({ error: 'Method not allowed' }, 405);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  // The learner's identity is the canvas access the source read itself uses; create needs the org and email before its read.
  if (url.pathname.endsWith('/resolve')) return resolve(req, env, body, deps);
  return create(req, env, body, deps);
}
