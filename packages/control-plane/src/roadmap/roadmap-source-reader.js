// The production readSourceForActor for roadmap-source.js (R4.03): an imported Markdown file the acting learner OWNS, read from its
// stored original with no Request or session (the roadmap Durable Object has none). Same owner-only rule as authorizeFileSource
// (file-access.js: org and owner_email must match the source row; every refusal is the same `missing`, so a foreign id is not an oracle).
// Before R14 the actor is always the board owner. ponytail: file: sources only; web captures, pasted docs and PDFs are R7+.
const FILE_KEY = /^file:([A-Za-z0-9_-]{1,64})$/;
// A file above this is not read at all (a Worker should not pull an arbitrary object into memory); the caller is told it is incomplete.
const MAX_BYTES = 2 * 1024 * 1024;

export async function readMarkdownForActor(env, access, { key, rev }) {
  // R7b: a context-document PDF is read as page text, only behind its own switch (roadmap-source-pdf.js). Otherwise it is unsupported, as before.
  if (/^doc:ctx:[0-9a-f]{12}$/.test(String(key))) {
    if (env?.ROADMAP_ENABLED !== 'true' || env?.ROADMAP_PDF_ENABLED !== 'true') return { status: 'unsupported' };
    return (await import('./roadmap-source-pdf.js')).readPdfTextForActor(env, access, { key, rev });
  }
  const m = FILE_KEY.exec(String(key));
  if (!m || !env?.LEARN_DB || !env?.LEARN_MEDIA) return { status: 'unsupported' };
  const source = await env.LEARN_DB.prepare("SELECT id, name, family, bytes, sha256, r2_key FROM file_sources WHERE id = ? AND status = 'stored' AND org = ? AND owner_email = ?")
    .bind(m[1], access.org, access.actorEmail).first();
  if (!source) return { status: 'missing' };
  if (source.family !== 'markdown') return { status: 'unsupported' };
  if (source.sha256 !== rev) return { status: 'changed', rev: source.sha256 };
  // Too big to read: an incomplete read, so the caller offers a passage and never a prefix. Smaller files are read whole; the 40,000-character bound is enforced by readRoadmapSource.
  if (source.bytes > MAX_BYTES) return { status: 'ok', text: '', rev: source.sha256, name: source.name, complete: false };
  const object = await env.LEARN_MEDIA.get(source.r2_key).catch(() => null);
  if (!object) return { status: 'missing' };
  const text = await object.text();
  return { status: 'ok', text, rev: source.sha256, name: source.name, complete: true };
}
