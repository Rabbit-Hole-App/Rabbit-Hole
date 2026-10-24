// Comment attachments (docs/features/canvas-comments.md section 15, owner decision D3, 2026-10-23): images and PDFs in the
// LEARN_MEDIA bucket under comment-attachments/<board id>/<attachment id>. The limits are enforced here and in the one
// conditional INSERT that reserves an upload (canvas-comments.js), never by a check that a parallel upload could slip past.
// Access is the thread's, checked on every download; nothing here knows who may read.
import { learnMedia } from './learn-storage.js';

// Accepted types and the structure each must show in its first bytes (file-sniff.js FORMATS). SVG is not accepted: it is a page.
export const ATTACHMENT_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export const ATTACHMENT_NOTE = 'Attach an image (PNG, JPEG, GIF or WebP) or a PDF.';

// A name as shown and as offered on download: no path, no control characters, at most 120 characters.
export function safeName(value, fallback = 'file') {
  const base = String(value ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base.slice(0, 120) || fallback;
}

// Objects of purged attachments (rows with purged_at) leave the bucket - unless another live row still names the same
// object, which is then left alone - and then the rows go. Best effort: a failure leaves the purged rows for the next sweep, and
// access is already gone because every read ignores a purged row.
export async function releasePurged(env, org, canvas, limit = 50) {
  const db = env.LEARN_DB, bucket = learnMedia(env);
  const { results } = await db.prepare('SELECT id, object_key FROM canvas_comment_attachments WHERE org = ? AND canvas = ? AND purged_at IS NOT NULL LIMIT ?').bind(org, canvas, limit).all();
  if (!results.length) return 0;
  const done = [];
  for (const row of results) {
    try {
      const shared = await db.prepare('SELECT 1 FROM canvas_comment_attachments WHERE object_key = ? AND purged_at IS NULL LIMIT 1').bind(row.object_key).first();
      if (!shared && bucket) await bucket.delete(row.object_key);
      done.push(row.id);
    } catch (error) { console.error('comment attachment release failed', row.id, error?.message || String(error)); }
  }
  if (done.length) await db.prepare(`DELETE FROM canvas_comment_attachments WHERE purged_at IS NOT NULL AND id IN (${done.map(() => '?').join(', ')})`).bind(...done).run();
  return done.length;
}

// A canvas (or hole) that is being deleted for good: every attachment of it, live or not, leaves the bucket and the table, before the
// caller's batch removes the canvas. A failure throws, so the delete does not go ahead and half-clean (the caller retries).
export async function purgeCanvasAttachments(env, org, canvas) {
  const db = env.LEARN_DB, bucket = learnMedia(env);
  await db.prepare('UPDATE canvas_comment_attachments SET purged_at = COALESCE(purged_at, ?) WHERE org = ? AND canvas = ?').bind(new Date().toISOString(), org, canvas).run();
  for (;;) {
    const { results } = await db.prepare('SELECT id, object_key FROM canvas_comment_attachments WHERE org = ? AND canvas = ? LIMIT 50').bind(org, canvas).all();
    if (!results.length) return;
    for (const row of results) {
      const shared = await db.prepare('SELECT 1 FROM canvas_comment_attachments WHERE object_key = ? AND (org <> ? OR canvas <> ?) AND purged_at IS NULL LIMIT 1').bind(row.object_key, org, canvas).first();
      if (!shared && bucket) await bucket.delete(row.object_key);
      await db.prepare('DELETE FROM canvas_comment_attachments WHERE id = ?').bind(row.id).run();
    }
  }
}
