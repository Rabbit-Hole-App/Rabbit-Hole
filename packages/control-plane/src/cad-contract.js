// CAD-specific limits and schemas. No provider calls or execution in this module.
export const CAD_RUNTIME = Object.freeze({ cadgen: '0.7.21', skillRevision: '24573128ceaab564f497d7c12f995c41784c9539', protocol: 'cad-execute/1' });
export const CAD_LIMITS = Object.freeze({ calls: 6, repairs: 1, usd: 0.60, elapsedMs: 900000, stageSeconds: 300, executionSeconds: 600, memoryBytes: 2147483648, workspaceBytes: 536870912, artifactBytes: 52428800, totalBytes: 104857600, sourceBytes: 128000, jobs: 100 });
export const CAD_TERMINAL = new Set(['ready', 'failed', 'cancelled']);
// Operators may lower job limits; request payloads cannot raise execution budgets.
export function cadLimits(env) {
  const limits = { ...CAD_LIMITS };
  for (const [key, name] of Object.entries({ calls:'CAD_MAX_CALLS', repairs:'CAD_MAX_REPAIRS', usd:'CAD_MAX_USD', elapsedMs:'CAD_MAX_ELAPSED_MS', artifactBytes:'CAD_MAX_ARTIFACT_BYTES', totalBytes:'CAD_MAX_TOTAL_BYTES' })) {
    if (env[name] === undefined) continue;
    const value = Number(env[name]);
    if (!Number.isFinite(value) || value < 0 || value > limits[key] || key !== 'usd' && !Number.isInteger(value)) throw cadError('Invalid CAD budget configuration', 503);
    limits[key] = value;
  }
  return limits;
}
export const cadJson = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export const cadError = (message, status = 400) => Object.assign(new Error(message), { status });
export const cadHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
export const encodeBoard = text => btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function decodeCadId(id) {
  const m = /^cj\.([\w-]{1,600})\.([a-f0-9]{32})$/.exec(id || '');
  if (!m) throw cadError('Not available', 404);
  try { return decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))); }
  catch { throw cadError('Not available', 404); }
}
export const newCadId = board => `cj.${encodeBoard(board)}.${crypto.randomUUID().replaceAll('-', '')}`;
export async function cadBody(req, limit = 64000) {
  // Bounded JSON, including chunked requests, before parsing.
  if (!req.body) return {};
  const reader = req.body.getReader(), chunks = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw cadError('Request too large', 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; }
  try { const body = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error(); return body; }
  catch { throw cadError('Invalid JSON'); }
}
export function validateCadRequest(body) {
  for (const key of ['app', 'board', 'cardId', 'requestId']) if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 200) throw cadError(`${key} is required`);
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 8000) throw cadError('Describe the object you want to create.');
  if (JSON.stringify(body.context ?? null).length > 32000) throw cadError('Selected context is too large', 413);
  if (body.baseRevisionId != null && (typeof body.baseRevisionId !== 'string' || body.baseRevisionId.length > 200)) throw cadError('Invalid model revision');
}
export function validateDesign(value) {
  if (value?.question && typeof value.question === 'string' && value.question.length <= 1500) return { question: value.question };
  if (!value || typeof value.source !== 'string' || !value.source.trim() || new TextEncoder().encode(value.source).length > CAD_LIMITS.sourceBytes) throw cadError('The CAD design did not include valid model source.');
  const b = value.brief;
  if (!b || !['mm', 'cm', 'm', 'in'].includes(b.units) || typeof b.title !== 'string' || b.title.length > 150 || !Array.isArray(b.assumptions) || !Array.isArray(b.requirements)) throw cadError('The CAD design brief is incomplete.');
  if (!b.parameters || typeof b.parameters !== 'object' || Array.isArray(b.parameters) || Object.values(b.parameters).some(v => typeof v !== 'number' || !Number.isFinite(v))) throw cadError('CAD parameters must be finite numeric dimensions.');
  if (JSON.stringify(b).length > 12000 || !Array.isArray(value.checks) || value.checks.length > 40) throw cadError('The CAD design exceeds its limits.');
  if(value.checks.some(c=>!c||typeof c!=='object'||Array.isArray(c)||typeof c.kind!=='string'||!Number.isFinite(c.value)||!Number.isFinite(c.tolerance)||c.tolerance<0||c.axis!==undefined&&!['x','y','z'].includes(c.axis)))throw cadError('CAD measurement checks are invalid.');
  // This validates the brief, never makes Python safe: only the isolated executor may run it.
  return { source: value.source, brief: b, checks: value.checks };
}
export function publicCadJob(job) {
  const keys = ['id', 'state', 'stage', 'attempt', 'cardId', 'modelId', 'revisionId', 'baseRevisionId', 'brief', 'question', 'error', 'manifest', 'createdAt', 'updatedAt', 'limitations', 'awaitingAccept', 'hidden', 'exportState', 'exportError'];
  const result=Object.fromEntries(keys.filter(k => job[k] !== undefined).map(k => [k, job[k]]));
  // Reference provenance is retained privately with the job. A shared card's
  // status must not disclose private drawings, paths, or source URLs.
  if(result.brief){const {references,context,...brief}=result.brief;result.brief=brief;}
  return result;
}
export function cadBlock(job, accepted = null) {
  const manifest = accepted?.manifest || (!job.awaitingAccept ? job.manifest : null), sourceId = manifest?.sourceId;
  return { type: 'cad', id: job.cardId, jobId: job.id, modelId: job.modelId, revisionId: manifest?.revisionId || job.baseRevisionId || null,
    status: job.state, title: manifest?.title || job.brief?.title || 'CAD model', units: manifest?.units || job.brief?.units || null,
    briefSummary: (manifest?.assumptions || job.brief?.assumptions || []).filter(x => typeof x === 'string').join('; ').slice(0, 500),
    manifest: manifest || null, acceptedManifest: manifest || null, manifestUrl: `/api/learn/cad/jobs/${encodeURIComponent(job.id)}`, thumbnailUrl: manifest?.artifacts?.find(a => a.kind === 'thumbnail')?.url || null,
    ...(job.awaitingAccept ? { proposedRevisionId: job.revisionId } : {}), ...(sourceId ? { sourceId, fileRef: { source: { id: sourceId } } } : {}) };
}
