import { decodeCadId, encodeBoard } from './cad-contract.js';
import { sanitizeCadDiagnostics } from './cad-failure.js';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export function diagnosticIdentity(url, parameter) {
  const entries = [...url.searchParams];
  if (entries.length !== 1 || entries[0][0] !== parameter) throw Error('Invalid query');
  const id = entries[0][1], board = decodeCadId(id);
  if (!board || id.split('.')[1] !== encodeBoard(board)) throw Error('Invalid job');
  return { id, board };
}
// Explicit operator projection: never return the stored job or nested objects wholesale.
export function diagnosticJob(job, env) {
  const result = {};
  for (const key of ['id','attempt','state','failureCode','failureStage','failurePhase','failureAttempt']) if (typeof job[key] === 'string' || typeof job[key] === 'number' || job[key] === null) result[key] = job[key];
  result.failureDiagnostics = sanitizeCadDiagnostics(job.failureDiagnostics, env);
  if (job.lastFailure) {
    result.lastFailure = {};
    for (const key of ['code','stage','phase','attempt']) if (typeof job.lastFailure[key] === 'string' || typeof job.lastFailure[key] === 'number' || job.lastFailure[key] === null) result.lastFailure[key] = job.lastFailure[key];
    result.lastFailure.diagnostics = sanitizeCadDiagnostics(job.lastFailure.diagnostics, env);
  }
  if (job.source) result.source = Object.fromEntries(['id','key','sha256'].filter(key => typeof job.source[key] === 'string').map(key => [key,job.source[key]]));
  for (const key of ['prompt','brief','checks']) if (job[key] !== undefined) result[key] = structuredClone(job[key]);
  return result;
}
export async function cadJobDiagnostic(req, env) {
  if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
  if (typeof env.CAD_DIAGNOSTIC_READ_TOKEN !== 'string' || env.CAD_DIAGNOSTIC_READ_TOKEN.length < 32) return json({ error: 'Diagnostic read is not configured' }, 503);
  const supplied = req.headers.get('authorization') || '';
  if (!supplied || supplied.length > 1024) return json({ error: 'Unauthorized' }, 401);
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a,b] = await Promise.all([digest(supplied),digest(`Bearer ${env.CAD_DIAGNOSTIC_READ_TOKEN}`)]);
  let difference = 0; for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  if (difference) return json({ error: 'Unauthorized' }, 401);
  let identity;
  try { identity = diagnosticIdentity(new URL(req.url), 'job'); } catch { return json({ error: 'Invalid job query' }, 400); }
  try {
    const response = await env.CAD_JOBS.get(env.CAD_JOBS.idFromName(identity.board)).fetch(`https://cad/diagnostic?id=${encodeURIComponent(identity.id)}`, { method: 'GET' });
    if (response.status === 404) return json({ error: 'Not found' }, 404);
    if (!response.ok) throw Error();
    const data = await response.json();
    if (data.job?.id !== identity.id) throw Error();
    return json({ job: diagnosticJob(data.job, env) });
  } catch { return json({ error: 'CAD diagnostic is temporarily unavailable' }, 503); }
}
