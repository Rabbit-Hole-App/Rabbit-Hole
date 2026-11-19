// A dropped document as a source (docs/features/learn-sections/roadmap-unplug-spec.md section B, owner 2026-11-19): a Markdown file or a PDF the learner drops on a canvas
// is read like a repository. Its text is stored once by sha256 (R2 learn-repositories-dev/shared/files/<sha>/text.json), cut into sections, and every section is a "file" of a
// snapshot-shaped object, so read_source, search_code, the anchors checks and the Learn plan, brief and Make read it where they read a repository (sourceText = loadDocumentSnapshot).
//
//   sectionsOf({ kind, name, text, pages }) -> [{ key, title, text }]   markdown: one section per heading ('s/intro'); pdf: one per page ('p.3')
//   documentSnapshot({ sha, name, kind, sections }) -> a snapshot { repo: 'file:<sha>', commit: <sha>, files: { <key>: text }, graph } the repository tools read
//   documentDigest(snapshot, { name, kind }) -> the text the overview is written from (outline first, then the first 24 KB)
//   canvasDocument(env, access, app) -> { docSha, id: 0, app, repo: 'file:<sha>', commit: <sha>, name, kind } | null   the one document that started this canvas's Tutor
//   loadDocumentSnapshot(env, doc) -> the snapshot (from the stored text)
//   runDocumentIndex(env, ctx, body, deps) -> a Response: the learn_index action with { source: { kind, name, text | pages } }
//
// One document starts the Tutor on a canvas (canvas_document, learn-migrations/0049); a later file is only a card.
import { indexGet } from './learn-index.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const textKey = sha => `learn-repositories-dev/shared/files/${sha}/text.json`;
export const isDocumentRepo = repo => typeof repo?.repo === 'string' && repo.repo.startsWith('file:');
export const shaOfDocumentRepo = repo => String(repo.repo).slice('file:'.length);
import { DOC_KINDS, DOC_NAME_MAX, DOC_PAGES_MAX, DOC_TEXT_MAX, documentSnapshot, fullText, sectionsOf, sha256 } from './learn-document-text.js';
export { DOC_KINDS, documentDigest, documentSnapshot, fullText, isDocumentSnapshot, sectionsOf, sha256 } from './learn-document-text.js';

// --- the store ---------------------------------------------------------------------------------------------------------------
export async function canvasDocument(env, access, app) {
  if (!access?.org || typeof app !== 'string') return null;
  try {
    const row = await env.LEARN_DB.prepare('SELECT sha, kind, name FROM canvas_document WHERE org=? AND app=?').bind(access.org, app).first();
    return row ? { docSha: row.sha, id: 0, app, repo: `file:${row.sha}`, commit: row.sha, name: row.name, kind: row.kind } : null;
  } catch { return null; } // a database without the table (before learn-migrations/0049): no document
}
export async function loadDocumentSnapshot(env, doc) {
  const object = await env.REPOSITORY_SNAPSHOTS.get(textKey(doc.docSha));
  if (!object) throw new Error('The document text is gone');
  const stored = await object.json();
  return documentSnapshot({ sha: doc.docSha, name: doc.name || stored.name, kind: stored.kind, sections: sectionsOf(stored) });
}

function sourceOf(body) {
  const s = body?.source;
  if (!s || typeof s !== 'object' || !DOC_KINDS.includes(s.kind)) return null;
  const name = typeof s.name === 'string' ? s.name.replace(/\s+/g, ' ').trim().slice(0, DOC_NAME_MAX) : '';
  if (!name) return null;
  if (s.kind === 'markdown') return typeof s.text === 'string' && s.text.trim() && s.text.length <= DOC_TEXT_MAX ? { kind: s.kind, name, text: s.text } : null;
  const pages = Array.isArray(s.pages) && s.pages.length <= DOC_PAGES_MAX && s.pages.every(p => typeof p === 'string') ? s.pages : null;
  return pages && pages.join('').trim() && pages.join('\f').length <= DOC_TEXT_MAX ? { kind: s.kind, name, pages } : null;
}
export const DOCUMENT_SHAPE = 'learn_index with a source needs { source: { kind: markdown | pdf, name, text (up to 512 KB) | pages (up to 400 strings) } }';

// The learn_index action for a dropped file. Stores the text once, records it as this canvas's document (the first one only), then reads or builds the overview.
export async function runDocumentIndex(env, { access, canvas, blockId = null }, body, deps = {}) {
  const source = sourceOf(body);
  if (!source) return json({ error: DOCUMENT_SHAPE }, 400);
  if (body.layer !== 'overview') return json({ error: 'learn_index needs { layer: overview }' }, 400);
  const sha = await sha256(fullText(source)), existing = await canvasDocument(env, access, canvas);
  if (existing && existing.docSha !== sha) return json({ status: 'ignored', reason: 'one_document_per_canvas' }); // a later file is only a card
  if (!(await env.REPOSITORY_SNAPSHOTS.head?.(textKey(sha)))) await env.REPOSITORY_SNAPSHOTS.put(textKey(sha), JSON.stringify({ kind: source.kind, name: source.name, ...(source.kind === 'pdf' ? { pages: source.pages } : { text: source.text }), savedAt: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
  if (!existing) {
    try { await env.LEARN_DB.prepare('INSERT OR IGNORE INTO canvas_document(org, app, sha, kind, name, block_id) VALUES(?,?,?,?,?,?)').bind(access.org, canvas, sha, source.kind, source.name, blockId).run(); }
    catch { return json({ error: 'document_unavailable' }, 503); }
  }
  const doc = { docSha: sha, id: 0, app: canvas, repo: `file:${sha}`, commit: sha, name: existing?.name || source.name, kind: source.kind };
  return runDocumentOverview(env, doc, await loadDocumentSnapshot(env, doc), deps);
}
// The overview of a canvas's document (read again after a reload): stored -> free; building -> building; else built.
export async function runDocumentOverview(env, doc, snapshot, deps = {}) {
  const got = await indexGet(env, { repo: doc.repo, commit: doc.commit }, 'overview', '', { build: true, snapshot, deps });
  const repository = { app: doc.app, repo: doc.repo, commit: doc.commit, name: doc.name, kind: doc.kind };
  if (got.status === 'ready') return json({ status: 'ready', index: got.value, repository });
  if (got.status === 'building') return json({ status: 'building', repository });
  if (got.reason === 'unconfigured') return json({ error: 'model_not_configured' }, 503);
  if (got.reason === 'over_cap' && !got.usd) return json({ error: 'learn_index_over_cap' }, 422);
  return json({ error: 'learn_index_failed' }, 502);
}
