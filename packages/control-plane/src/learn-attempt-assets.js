// packages/control-plane/src/learn-attempt-assets.js
// Private Explain-back answer media (docs/superpowers/plans/2026-10-30-explain-back.md EB-02, learn-migrations/0034): a
// retained voice note or a static Sketch snapshot, and the transcripts of a voice note.
//
//   uploadAttemptAsset(env, actor, req, {kind, sha256, durationMs}) -> Response {asset} (201 new, 200 the same bytes again)
//   serveAttemptAsset(env, actor, req, assetId) -> Response: the bytes, whole or one range
//   ownAttemptAssets(env, actor, ids) -> Map id -> row: the actor's own assets among ids
//   putAttemptAsset(env, actor, {bytes, mime, marks?, text?, durationMs?}) -> {...asset, hash}: server/test seeding, upload's checks
//   setAssetMeta(env, actor, assetId, {marks, text}) -> the Sketch snapshot's capture data, set once
//   readAttemptAsset(env, actor, attempt, evidence) -> {bytes, mime, marks?, text?} | null: assessment's hash-checked read
//   transcriptStore(env, actor) -> {get(transcriptId), put(record)}: immutable ready transcripts; a failed one may be replaced
//   transcriptsOf(env, actor, assetId) -> transcripts of the actor's own audio
//   freezeSnapshots(env, actor, content, snapshots) / readFrozenSnapshot(env, actor, attempt, ref): board-held inputs as submitted
//
// Access: only the learner who uploaded it, on the canvas and board it was uploaded to (actor = {org, userId, app, board},
// resolved by the route). There is no board fileRef, share token, member or fork path: a viewer of a shared or forked canvas
// gets 404, as does anyone naming an id that is not theirs. Bytes are verified by structure, never by name or declared type,
// and the stored name (mime, ext) is the container the bytes are. Generic board uploads (learn-files.js) are unchanged.
import { canonical } from './learn-attempt-store.js';
import { sha256Hex } from './learn-grade-jev.js';
import { byteRange, learnMedia } from './learn-storage.js';
import { clientMismatch, uploadBody } from './upload-body.js';
import { FORMATS, HEAD_BYTES } from './file-sniff.js';
import { validateTranscript } from '../../web/src/explain-back-contract.js';

// Byte caps (P, 2026-10-30): a voice note at most 2 MiB and a Sketch PNG at most 600 KiB (R's capture limit), refused before
// storage. The stored size is the asset's `bytes`, which bounds transcription cost. shortcut: audioMs is provisional (plan
// section 5: two minutes per recording, not finalized).
export const ATTEMPT_ASSET_LIMITS = Object.freeze({ audio: 2 * 1024 * 1024, image: 600 * 1024, timeline: 2 * 1024 * 1024, audioMs: 10 * 60 * 1000 });
// ponytail: video (Sketch recordings, EB-06 M4) is not accepted yet; add it with its codec decision.
const CONTAINERS = {
  audio: [['webm', 'audio/webm', FORMATS.webm], ['ogg', 'audio/ogg', FORMATS.ogg], ['m4a', 'audio/mp4', FORMATS.mp4]],
  image: [['png', 'image/png', FORMATS.png]],
  // a Sketch recording's drawing timeline (worker M): a JSON object
  timeline: [['json', 'application/json', FORMATS.ipynb]],
};
const SHA = /^[0-9a-f]{64}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const SCOPE = 'org = ? AND owner_user_id = ? AND app = ? AND board = ?';
const scope = a => [a.org, a.userId, a.app, a.board];

/** The container these first bytes are, among the kind's accepted ones, or null. */
export function sniffAttemptAsset(kind, head) {
  const hit = (CONTAINERS[kind] || []).find(([, , is]) => is(head));
  return hit ? { ext: hit[0], mime: hit[1] } : null;
}

export const publicAsset = r => ({ assetId: r.id, kind: r.kind, mime: r.mime, ext: r.ext, bytes: r.bytes, sha256: r.sha256, durationMs: r.duration_ms ?? null });
// The object key comes from the owner scope and the bytes, never from the request: two uploads of the same bytes write the
// same object, and no id can name another learner's key.
const objectKey = async (actor, sha256) => `learn-attempt-assets/${await sha256Hex(canonical(scope(actor)))}/${sha256}`;
const byHash = (env, actor, sha256) => env.LEARN_DB.prepare(`SELECT * FROM learn_attempt_assets WHERE ${SCOPE} AND sha256 = ?`).bind(...scope(actor), sha256).first();

export async function uploadAttemptAsset(env, actor, req, { kind, sha256, durationMs = null }) {
  if (!CONTAINERS[kind]) return json({ error: 'invalid_asset', detail: 'kind must be audio, image or timeline' }, 400);
  if (typeof sha256 !== 'string' || !SHA.test(sha256)) return json({ error: 'invalid_asset', detail: 'sha256 must be 64 lower-case hex characters' }, 400);
  const ms = durationMs == null || durationMs === '' ? null : Number(durationMs);
  const timed = kind !== 'image';
  if (timed ? !(Number.isInteger(ms) && ms > 0 && ms <= ATTEMPT_ASSET_LIMITS.audioMs) : ms !== null) {
    return json({ error: 'invalid_asset', detail: timed ? `durationMs: 1-${ATTEMPT_ASSET_LIMITS.audioMs}` : 'an image has no duration' }, 400);
  }
  // The same bytes again (a retried or resumed upload): the asset already stored, body unread.
  const same = await byHash(env, actor, sha256);
  if (same) return same.kind === kind ? json({ asset: publicAsset(same) }) : json({ error: 'unsupported_asset', detail: `these bytes are ${same.kind}` }, 415);
  const got = await uploadBody(req, { cap: ATTEMPT_ASSET_LIMITS[kind], sniffBytes: HEAD_BYTES });
  if (got.refused === 'over') return json({ error: 'asset_too_large', detail: { max: ATTEMPT_ASSET_LIMITS[kind] } }, 413);
  if (got.refused === 'length') return json({ error: 'asset_length_required' }, 411);
  const container = sniffAttemptAsset(kind, got.head);
  if (!container) { await got.body.cancel?.().catch(() => {}); return json({ error: 'unsupported_asset', detail: { audio: 'audio must be WebM, Ogg or MP4', image: 'a Sketch snapshot must be PNG', timeline: 'a timeline must be a JSON object' }[kind] }, 415); }
  if (!got.streamed && hex(await crypto.subtle.digest('SHA-256', got.body)) !== sha256) return json({ error: 'asset_hash_mismatch' }, 400);
  try {
    // R2 verifies the declared sha256 as it stores a streamed body; a mismatch stores nothing.
    await learnMedia(env).put(await objectKey(actor, sha256), got.body, { httpMetadata: { contentType: container.mime }, sha256 });
  } catch (error) {
    if (await clientMismatch(got, error)) return json({ error: 'asset_hash_mismatch' }, 400);
    throw error;
  }
  const id = `aa_${crypto.randomUUID()}`;
  await env.LEARN_DB.prepare(`INSERT INTO learn_attempt_assets (id, org, owner_user_id, app, board, kind, mime, ext, bytes, sha256, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (org, owner_user_id, app, board, sha256) DO NOTHING`)
    .bind(id, ...scope(actor), kind, container.mime, container.ext, got.length, sha256, ms, new Date().toISOString()).run();
  const row = await byHash(env, actor, sha256);
  return json({ asset: publicAsset(row) }, row.id === id ? 201 : 200);
}

/**
 * Store bytes as the actor's attempt asset without a request: the same checks as an upload (container by bytes, kind caps,
 * dedup by hash), for server code and test fixtures (A's assessment tests seed voice and Sketch evidence with it).
 * @returns {Promise<{assetId, hash, kind, mime, ext, bytes, sha256, durationMs}>} hash is the evidence hash
 */
export async function putAttemptAsset(env, actor, { bytes, mime, marks, text, durationMs = null }) {
  const kind = /^audio\//.test(mime) ? 'audio' : /^image\//.test(mime) ? 'image' : mime === 'application/json' ? 'timeline' : null;
  const container = kind && sniffAttemptAsset(kind, bytes.subarray(0, HEAD_BYTES));
  if (!container) throw new TypeError('putAttemptAsset: unsupported bytes');
  if (bytes.byteLength > ATTEMPT_ASSET_LIMITS[kind]) throw new TypeError('putAttemptAsset: over the cap');
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  await learnMedia(env).put(await objectKey(actor, sha256), bytes, { httpMetadata: { contentType: container.mime }, sha256 });
  await env.LEARN_DB.prepare(`INSERT INTO learn_attempt_assets (id, org, owner_user_id, app, board, kind, mime, ext, bytes, sha256, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (org, owner_user_id, app, board, sha256) DO NOTHING`)
    .bind(`aa_${crypto.randomUUID()}`, ...scope(actor), kind, container.mime, container.ext, bytes.byteLength, sha256, kind !== 'image' ? durationMs ?? 1000 : null, new Date().toISOString()).run();
  const row = await byHash(env, actor, sha256);
  if (kind === 'image' && (marks != null || text != null) && !row.meta_json) await setAssetMeta(env, actor, row.id, { marks, text });
  return { ...publicAsset(row), hash: row.sha256 };
}

export async function ownAttemptAssets(env, actor, ids) {
  if (!ids.length) return new Map();
  const { results } = await env.LEARN_DB.prepare(`SELECT * FROM learn_attempt_assets WHERE ${SCOPE} AND id IN (${ids.map(() => '?').join(', ')})`).bind(...scope(actor), ...ids).all();
  return new Map(results.map(r => [r.id, r]));
}

// Playback and assessment reads. Reading never calls a model.
export async function serveAttemptAsset(env, actor, req, assetId) {
  const row = (await ownAttemptAssets(env, actor, [assetId])).get(assetId);
  if (!row) return json({ error: 'unknown_asset' }, 404);
  let range = null;
  if (req.headers.get('range')) {
    range = byteRange(req.headers.get('range'), row.bytes);
    if (range === false) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${row.bytes}`, 'Cache-Control': 'private, no-store' } });
  }
  const object = req.method === 'HEAD' ? null : await learnMedia(env).get(await objectKey(actor, row.sha256), range ? { range } : undefined);
  if (!object && req.method !== 'HEAD') return json({ error: 'unknown_asset' }, 404);
  return new Response(object?.body ?? null, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': row.mime, 'Content-Length': String(range ? range.length : row.bytes), 'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
      ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${row.bytes}` } : {}),
      // private learner media: never a shared cache, and not kept by the browser either
      'Cache-Control': 'private, no-store',
    },
  });
}

// The Sketch capture's marks and text beside its PNG (worker R), set once by the owner: a second, different write is refused,
// so what assessment reads is what the learner captured. -> the stored meta, or null when the asset is not theirs or not an image.
export const META_CHARS = 8000;
export async function setAssetMeta(env, actor, assetId, meta) {
  const json = JSON.stringify({ marks: meta?.marks ?? null, text: typeof meta?.text === 'string' ? meta.text : null });
  if (json.length > META_CHARS) throw new TypeError(`setAssetMeta: at most ${META_CHARS} characters`);
  const row = (await ownAttemptAssets(env, actor, [assetId])).get(assetId);
  if (!row || row.kind !== 'image') return null;
  await env.LEARN_DB.prepare(`UPDATE learn_attempt_assets SET meta_json = ? WHERE id = ? AND ${SCOPE} AND meta_json IS NULL`).bind(json, assetId, ...scope(actor)).run();
  const stored = (await ownAttemptAssets(env, actor, [assetId])).get(assetId).meta_json;
  if (stored !== json) throw new TypeError('setAssetMeta: this snapshot already has its capture data');
  return JSON.parse(stored);
}

/**
 * Assessment's read of one submitted piece of evidence: the attempt's own voice, Sketch or recording asset, whole, checked
 * against the hash the attempt froze. Only evidence the attempt names, owned by its learner on its canvas; anything else, a
 * changed or missing object included, is null (never a substitute). -> {bytes, mime, marks?, text?} | null
 */
export async function readAttemptAsset(env, actor, attempt, evidence) {
  const content = attempt?.submittedContent;
  const named = [...(content?.voice ?? []), ...(content?.sketch ? [content.sketch] : []), ...(content?.recording ? [content.recording] : []), ...(content?.recording?.narration ? [content.recording.narration] : [])]
    .some(e => e.evidenceId === evidence?.evidenceId && e.assetId === evidence.assetId && e.hash === evidence.hash);
  if (!named) return null;
  const row = (await ownAttemptAssets(env, actor, [evidence.assetId])).get(evidence.assetId);
  if (!row || row.sha256 !== evidence.hash) return null;
  const object = await learnMedia(env).get(await objectKey(actor, row.sha256));
  if (!object) return null;
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== row.sha256) return null;
  const meta = row.meta_json ? JSON.parse(row.meta_json) : {};
  return { bytes, mime: row.mime, ...(meta.marks != null ? { marks: meta.marks } : {}), ...(meta.text != null ? { text: meta.text } : {}) };
}

/**
 * The owner's transcript store for one audio asset family (worker M's ensureTranscript). Records are the contract's Transcript
 * (explain-back-contract.js validateTranscript). A ready record is immutable: put of its id returns it unchanged. A failed
 * record is replaced by the next put of its id: ensureTranscript (learn-media.js) reaches put for an existing failed record
 * only on the learner's explicit retry, so the retry decision stays in one place.
 *   get(transcriptId) -> record | null
 *   put(record) -> the stored record
 */
export function transcriptStore(env, actor) {
  const key = [actor.org, actor.userId];
  const get = async transcriptId => {
    const row = typeof transcriptId === 'string' && transcriptId.length <= 200
      ? await env.LEARN_DB.prepare('SELECT record_json FROM learn_attempt_transcripts WHERE org = ? AND owner_user_id = ? AND id = ?').bind(...key, transcriptId).first()
      : null;
    return row ? JSON.parse(row.record_json) : null;
  };
  const put = async record => {
    const checked = validateTranscript(record);
    if (!checked.ok) throw new TypeError(`transcript: ${checked.errors.slice(0, 3).join('; ')}`);
    const asset = (await ownAttemptAssets(env, actor, [record.assetId])).get(record.assetId);
    if (!asset || asset.kind !== 'audio' || asset.sha256 !== record.hash) throw new TypeError('transcript: not this learner audio of that hash');
    const stored = { ...record, createdAt: record.createdAt ?? new Date().toISOString() };
    await env.LEARN_DB.prepare(`INSERT INTO learn_attempt_transcripts (org, owner_user_id, id, asset_id, audio_sha256, status, record_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (org, owner_user_id, id) DO UPDATE SET status = excluded.status, record_json = excluded.record_json,
      created_at = excluded.created_at WHERE learn_attempt_transcripts.status = 'failed'`)
      .bind(...key, record.transcriptId, asset.id, asset.sha256, record.status, JSON.stringify(stored), stored.createdAt).run();
    return get(record.transcriptId);
  };
  return { get, put };
}

/** Every stored transcript of the owner's audio of this asset's bytes, oldest first. */
export async function transcriptsOf(env, actor, assetId) {
  const asset = (await ownAttemptAssets(env, actor, [assetId])).get(assetId);
  if (!asset) return [];
  const { results } = await env.LEARN_DB.prepare('SELECT record_json FROM learn_attempt_transcripts WHERE org = ? AND owner_user_id = ? AND audio_sha256 = ? ORDER BY created_at, rowid')
    .bind(actor.org, actor.userId, asset.sha256).all();
  return results.map(r => JSON.parse(r.record_json));
}

// --- Frozen board-held resources (R's resolver, learn-explain-evidence.js deps.readFrozenSnapshot) ---------------------------
// A card, note or Notebook selection lives in the board, which keeps changing. At submission the client sends each connected
// one's snapshotOf(entry, scope) (explain-inputs.js); the server keeps only those whose canonical hash is a hash the answer
// froze, as private objects under the owner scope keyed by that hash (no table: the hash is the identity). Nothing else reads them.
export const SNAPSHOT_LIMITS = Object.freeze({ count: 50, totalChars: 1024 * 1024 });
const snapshotKey = async (actor, hash) => `learn-attempt-snapshots/${await sha256Hex(canonical(scope(actor)))}/${hash}`;
const frozenHashes = content => new Set((content?.resources ?? []).flatMap(r => [r.sourceKind !== 'file' && r.hash, ...(r.members ?? []).map(m => m.sourceKind !== 'file' && m.hash)]).filter(Boolean));

// ponytail: a frozen snapshot is checked against the answer's hash, not against the saved board (R review finding 7, accepted):
// a client could freeze content it never saved, as it could type it; assessment reads it as that learner's own submission.
/** Keep the snapshots the answer names by hash. -> {stored: hash[], ignored: number} (ignored: not named or not matching). */
export async function freezeSnapshots(env, actor, content, snapshots) {
  if (snapshots == null) return { stored: [], ignored: 0 };
  if (!Array.isArray(snapshots) || snapshots.length > SNAPSHOT_LIMITS.count) throw new TypeError(`snapshots: at most ${SNAPSHOT_LIMITS.count}`);
  const wanted = frozenHashes(content), stored = [];
  let ignored = 0;
  for (const snapshot of snapshots) {
    let text;
    try { text = canonical(snapshot); } catch { ignored += 1; continue; }
    const hash = await sha256Hex(text);
    if (!wanted.has(hash) || stored.includes(hash)) { ignored += 1; continue; }
    await learnMedia(env).put(await snapshotKey(actor, hash), text, { httpMetadata: { contentType: 'application/json' }, sha256: hash });
    stored.push(hash);
  }
  return { stored, ignored };
}

/** The frozen copy of a board-held input this attempt submitted (a resource or Group member, by its hash). -> {snapshot} | null */
export async function readFrozenSnapshot(env, actor, attempt, ref) {
  if (!ref?.hash || !frozenHashes(attempt?.submittedContent).has(ref.hash)) return null;
  const object = await learnMedia(env).get(await snapshotKey(actor, ref.hash));
  if (!object) return null;
  const text = await new Response(object.body).text();
  return (await sha256Hex(text)) === ref.hash ? { snapshot: JSON.parse(text) } : null;
}
