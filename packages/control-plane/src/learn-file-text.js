// The browser's extracted text for an imported file (docs/features/canvas-file-imports.md section 10; lead ruling
// 2026-10-16): a text, Markdown, code, CSV/TSV, workbook, Word, PowerPoint or notebook card parses its original in the
// browser, so the owner's browser stores what it extracted as the source's `text` derivative, which chat reads with its
// locations (file-context.js). Owner only: a member, a link viewer or anyone else gets the same 404.
//   PUT /api/learn/files/<source id>/text   { v: 1, units: [{ loc, text }], complete, limited?, extractor?, options? }
// One row per (source revision, converter version, options hash): the same body again is a no-op; a different body for the
// same extraction replaces the row's object (a newer extractor version is a new row). No model call.
import { authorizeFileSource } from './file-access.js';
import { learnMedia } from './learn-storage.js';
import { fileRange } from '../../web/src/file-chat-ref.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const TEXT_BODY_LIMIT = 2 * 1024 * 1024;
const MAX_UNITS = 20000;
const EXTRACTOR = /^[a-z0-9][a-z0-9.+-]{0,40}$/;
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
// The same hash file-jobs.js stores as options_hash, so a reader can ask for one extraction's results.
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const newId = () => `fd_${hex(crypto.getRandomValues(new Uint8Array(12)))}`;

export const fileTextRoute = path => /^\/api\/learn\/files\/fs_[0-9a-f]{24}\/text$/.test(path);

// The body as stored, rebuilt from known keys, or a string naming what is wrong. Each loc is one contract scope
// (file-chat-ref.js fileRange: lines, rows, sheet/cells, slide, page, notebook cell), or null for the whole source.
export function textBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'The body must be an object';
  if (value.v !== 1) return 'v must be 1';
  if (!Array.isArray(value.units) || value.units.length > MAX_UNITS) return `units must be a list of at most ${MAX_UNITS}`;
  if (typeof value.complete !== 'boolean') return 'complete must be true or false';
  if (value.limited != null && (typeof value.limited !== 'string' || value.limited.length > 200)) return 'limited must be a short string';
  const units = [];
  for (const [index, unit] of value.units.entries()) {
    if (!unit || typeof unit !== 'object' || typeof unit.text !== 'string') return `unit ${index + 1} needs text`;
    let loc;
    try { loc = fileRange(unit.loc ?? null); } catch { return `unit ${index + 1} has an unknown location`; }
    units.push({ loc, text: unit.text });
  }
  return { v: 1, units, complete: value.complete, ...(value.limited ? { limited: value.limited } : {}) };
}

export async function fileTextFetch(req, env) {
  const path = new URL(req.url).pathname;
  if (!fileTextRoute(path)) return null;
  if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  if (!env.LEARN_DB || !learnMedia(env)) return json({ error: 'File imports need the Learn database and media bucket on this worker.' }, 503);
  const sourceId = path.split('/')[4];
  // Owner only: no share, member or board route is passed, whatever the query says.
  const access = await authorizeFileSource(req, env, sourceId);
  if (access instanceof Response) return access;
  const declared = Number(req.headers.get('content-length'));
  if (declared > TEXT_BODY_LIMIT) { await req.body?.cancel().catch(() => {}); return json({ error: 'Extracted text is limited to 2 MiB.' }, 413); }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > TEXT_BODY_LIMIT) return json({ error: 'Extracted text is limited to 2 MiB.' }, 413);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const body = textBody(parsed);
  if (typeof body === 'string') return json({ error: body }, 400);
  const extractor = parsed.extractor ?? '1';
  if (typeof extractor !== 'string' || !EXTRACTOR.test(extractor)) return json({ error: 'extractor must be a short version name' }, 400);
  const options = parsed.options && typeof parsed.options === 'object' && !Array.isArray(parsed.options) ? parsed.options : {};
  if (JSON.stringify(options).length > 1000) return json({ error: 'options are limited to 1000 characters' }, 400);
  const { source } = access, db = env.LEARN_DB, bucket = learnMedia(env);
  const text = JSON.stringify(body), stored = new TextEncoder().encode(text), sha = await sha256(text), optionsHash = await sha256(canonical(options));
  const converter = 'browser-extract', version = `browser-extract/${extractor}`;
  const coverage = { text: body.complete ? 'extracted' : 'partial', units: body.units.length, ...(body.limited ? { limited: body.limited } : {}) };
  const existing = await db.prepare(`SELECT * FROM file_derivatives WHERE source_id = ? AND source_sha256 = ? AND kind = 'text' AND converter_version = ? AND options_hash = ? AND name = 'text.json'`)
    .bind(source.id, source.sha256, version, optionsHash).first();
  if (existing?.status === 'ready' && existing.sha256 === sha) return json({ derivative: publicDerivative(existing), unchanged: true });
  const id = existing?.id || newId(), key = `file-sources/${source.id}/d/${id}`, now = Date.now();
  await bucket.put(key, stored, { httpMetadata: { contentType: 'application/json' }, customMetadata: { source: source.id, sha256: sha } });
  if (existing) {
    await db.prepare(`UPDATE file_derivatives SET status = 'ready', media_type = 'application/json', bytes = ?, sha256 = ?, r2_key = ?, coverage_json = ?, error = NULL, updated_at = ? WHERE id = ?`)
      .bind(stored.byteLength, sha, key, JSON.stringify(coverage), now, id).run();
  } else {
    await db.prepare(`INSERT OR IGNORE INTO file_derivatives (id, source_id, source_sha256, kind, name, converter, converter_version, options_hash, status, media_type, bytes, sha256, r2_key, coverage_json, created_at, updated_at)
      VALUES (?, ?, ?, 'text', 'text.json', ?, ?, ?, 'ready', 'application/json', ?, ?, ?, ?, ?, ?)`)
      .bind(id, source.id, source.sha256, converter, version, optionsHash, stored.byteLength, sha, key, JSON.stringify(coverage), now, now).run();
  }
  const row = await db.prepare(`SELECT * FROM file_derivatives WHERE source_id = ? AND source_sha256 = ? AND kind = 'text' AND converter_version = ? AND options_hash = ? AND name = 'text.json'`)
    .bind(source.id, source.sha256, version, optionsHash).first();
  if (row.id !== id) await bucket.delete(key); // a concurrent store of the same extraction won: keep that one
  return json({ derivative: publicDerivative(row) }, existing ? 200 : 201);
}

const publicDerivative = row => ({ id: row.id, kind: row.kind, converter_version: row.converter_version, bytes: row.bytes, sha256: row.sha256, coverage: JSON.parse(row.coverage_json || 'null') });
