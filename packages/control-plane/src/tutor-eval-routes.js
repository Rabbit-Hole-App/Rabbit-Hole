// /api/learn/tutor-eval: the owner's private Tutor evaluation archive (learn-migrations/0017, src/tutor-eval-archive.js;
// contract reviewed by Tutor eval and Parallel 2026-10-09). Owner-only: the signed-in users.id must equal
// TUTOR_EVAL_OWNER_USER_ID. Anyone else, signed in or not, and everyone while the variable is unset, gets 404, so the
// archive's existence is not disclosed. No bulk export: retrieval is the row plus each artifact's exact bytes.
//   GET  /executions?topic&mode&status&sha&from&to      list
//   POST /executions                                      declare (resumable: identical 200, new 201, different 409)
//   GET  /executions/:id[?kind=session]                   the row, its artifacts and import status
//   PUT  /executions/:id/artifacts/:key?kind=&analysis_version=   whole bytes; the store chunks (identical 204, different 409)
//   GET  /executions/:id/artifacts/:key                   exact bytes, ETag = sha256
//   POST /executions/:id/complete                          re-hash everything; 409 while anything is missing
import { devIdentity } from './dev-forwarding.js';
import { TutorEvalArchive } from './tutor-eval-archive.js';

const PREFIX = '/api/learn/tutor-eval/';
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024; // above this the archive moves to R2 (Parallel, 2026-10-09)
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers });
const notFound = () => new Response('Not found', { status: 404, headers: { ...headers, 'Content-Type': 'text/plain;charset=utf-8' } });
// Store errors by meaning: a conflict with stored state is 409, a bad request 400, a missing thing 404.
const failure = error => {
  const m = String(error?.message || error);
  if (/already declared with different|already holds different|incomplete|artifacts put, \d+ declared/.test(m)) return json({ error: m }, 409);
  if (/^no (execution|artifact)/.test(m)) return json({ error: m }, 404);
  if (/lacks|must be|needs its analysis_version|has no analysis_version|ISO 8601/.test(m)) return json({ error: m }, 400);
  throw error;
};

export async function tutorEvalRoute(path, req, env, deps = {}) {
  if (!path.startsWith(PREFIX)) return null;
  const owner = env.TUTOR_EVAL_OWNER_USER_ID;
  if (typeof owner !== 'string' || !owner) return notFound();
  const user = await (deps.identity || devIdentity)(req, env);
  if (user instanceof Response || user?.userId !== owner) return notFound();
  const archive = new TutorEvalArchive(env.LEARN_DB);
  const url = new URL(req.url), parts = path.slice(PREFIX.length).split('/').map(decodeURIComponent);
  try {
    if (parts[0] !== 'executions') return notFound();
    const [, id, sub, key, extra] = parts;
    if (!id) {
      if (req.method === 'GET') {
        const p = url.searchParams;
        return json({ executions: await archive.list({ topic: p.get('topic'), mode: p.get('mode'), status: p.get('status'), sha: p.get('sha'), from: p.get('from'), to: p.get('to') }) });
      }
      if (req.method === 'POST') {
        let body; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        const row = await archive.declare({ ...body, imported_by: user.userId });
        return json({ execution: row }, row.resumed ? 200 : 201);
      }
      return json({ error: 'GET or POST' }, 405);
    }
    if (!sub) {
      if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
      const [row] = (await archive.list()).filter(r => r.execution_id === id);
      if (!row) return notFound();
      return json({ execution: row, artifacts: await archive.artifacts(id, { kind: url.searchParams.get('kind') || undefined }), import: await archive.status(id) });
    }
    if (sub === 'complete' && !key) {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
      return json({ import: await archive.complete(id) });
    }
    if (sub !== 'artifacts' || !key || extra !== undefined) return notFound();
    if (req.method === 'PUT') {
      const length = Number(req.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_ARTIFACT_BYTES) return json({ error: `an artifact is at most ${MAX_ARTIFACT_BYTES} bytes` }, 413);
      const bytes = Buffer.from(await req.arrayBuffer());
      if (bytes.length > MAX_ARTIFACT_BYTES) return json({ error: `an artifact is at most ${MAX_ARTIFACT_BYTES} bytes` }, 413);
      const kind = url.searchParams.get('kind'), contentType = req.headers.get('content-type')?.split(';')[0].trim() || undefined;
      await archive.put(id, key, kind, bytes, { analysisVersion: url.searchParams.get('analysis_version') || null, ...(contentType && contentType !== 'application/octet-stream' ? { contentType } : {}) });
      return new Response(null, { status: 204, headers });
    }
    if (req.method === 'GET') {
      const [meta] = (await archive.artifacts(id)).filter(a => a.key === key);
      if (!meta) return notFound();
      const bytes = await archive.bytes(id, key);
      return new Response(bytes, { headers: { ...headers, 'Content-Type': meta.content_type, ETag: `"${meta.sha256}"`, 'Content-Disposition': `attachment; filename="${key.replace(/["\\\r\n]/g, '_')}"` } });
    }
    return json({ error: 'GET or PUT' }, 405);
  } catch (error) { return failure(error); }
}
