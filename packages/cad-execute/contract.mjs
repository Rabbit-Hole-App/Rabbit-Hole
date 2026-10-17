// Executor contract: provider credentials and durable ownership stay in the control plane.
export const SCHEMA = 'cad-execute/1';
export const RESULT_SCHEMA = 'cad-execute-result/1';
export const LIMITS = Object.freeze({ source_bytes: 4 * 1024 ** 2, artifact_bytes: 50 * 1024 ** 2, total_artifact_bytes: 100 * 1024 ** 2, total_seconds: 600, stage_seconds: 300, memory_bytes: 2 * 1024 ** 3, workspace_bytes: 512 * 1024 ** 2 });
export const RUNTIME = Object.freeze({ cadgen: '0.7.21', build123d: '0.11.1', ocp: '7.9.3.1.1', playwright: '1.63.0', upstream: '24573128ceaab564f497d7c12f995c41784c9539', executor: 'cad-execute/1' });
const id = /^[A-Za-z0-9_.-]{1,650}$/;
export const outputName = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export function validateJob(j, origins = []) {
  const errors = [];
  if (!j || typeof j !== 'object') return ['Invalid job'];
  if (j.schema !== SCHEMA) errors.push('Invalid schema');
  for (const key of ['job_id', 'revision_id']) if (!id.test(j[key] || '')) errors.push(`Invalid ${key}`);
  if (!Number.isSafeInteger(j.attempt) || j.attempt < 1 || j.attempt > 100) errors.push('Invalid attempt');
  if (!['build', 'export', 'inspect'].includes(j.operation)) errors.push('Invalid operation');
  for (const key of ['source', 'callback']) {
    try { const u = new URL(j[key]?.url); if (u.protocol !== 'https:' || u.username || u.password || !origins.includes(u.origin)) errors.push(`Invalid ${key} origin`); } catch { errors.push(`Invalid ${key} URL`); }
  }
  if (!Number.isSafeInteger(j.source?.bytes) || j.source.bytes < 1 || j.source.bytes > LIMITS.artifact_bytes || (j.operation === 'build' && j.source.bytes > LIMITS.source_bytes)) errors.push('Invalid source size');
  if (!/^[a-f0-9]{64}$/.test(j.source?.sha256 || '')) errors.push('Invalid source hash');
  if (typeof j.callback?.token !== 'string' || j.callback.token.length < 32 || j.callback.token.length > 2048 || /\s/.test(j.callback.token)) errors.push('Invalid callback token');
  if (!Number.isFinite(Date.parse(j.callback?.expires_at)) || Date.parse(j.callback.expires_at) < Date.now() + 610000) errors.push('Callback expires too soon');
  if (!['mm', 'cm', 'm', 'in'].includes(j.requirements?.units)) errors.push('Explicit units required');
  if (!Array.isArray(j.requirements?.checks) || j.requirements.checks.length > 100) errors.push('Invalid checks');
  if (!Array.isArray(j.formats) || j.formats.some(f => !['step','glb','stl','3mf','thumbnail'].includes(f))) errors.push('Invalid formats');
  if (j.operation === 'build' && !['step','glb','thumbnail'].every(f => j.formats.includes(f))) errors.push('Build requires STEP, GLB and thumbnail');
  for (const [key, value] of Object.entries(j.limits || {})) if (!(key in LIMITS) || !Number.isSafeInteger(value) || value < 1 || value > LIMITS[key]) errors.push(`Invalid limit ${key}`);
  for (const key of ['memory_bytes', 'workspace_bytes']) if (j.limits?.[key] !== undefined && j.limits[key] !== LIMITS[key]) errors.push(`Unsupported kernel limit ${key}`);
  return errors;
}
export function effectiveLimits(job) { return { ...LIMITS, ...job.limits }; }
