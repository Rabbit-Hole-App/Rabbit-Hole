// Diagnostics remain private; public errors contain only a bounded code/stage and job reference.
export function sanitizeCadDiagnostics(value, env = {}) {
  if (typeof value !== 'string') return '';
  let text = value.slice(0, 16000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  for (const [name, secret] of Object.entries(env)) if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && typeof secret === 'string' && secret.length >= 4) text = text.split(secret).join('[redacted]');
  return text.replace(/https?:\/\/[^\s<>"']+/gi, '[url]')
    .replace(/\bBearer\s+[^\s,"']+/gi, 'Bearer [redacted]')
    .replace(/\b(?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?[^\s,"']+/gi, '[credential]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z]:[\\/][^\r\n"']+|\/(?:[^\s/"']+\/)+[^\s"']*/g, '[path]')
    .slice(0, 4000);
}
export function recordCadFailure(job, { code = 'cad_failed', diagnostics = '', phase } = {}, env = {}) {
  job.failureCode = typeof code === 'string' && /^[a-z_]{1,80}$/.test(code) ? code : 'executor_failed';
  job.failureStage = job.operation === 'export' ? 'exporting' : ['queued','planning','building','checking','exporting','publishing','repairing'].includes(job.stage) ? job.stage : 'unknown';
  job.failureAttempt = job.attempt;
  job.failurePhase = ['build','check','glb','thumbnail','stl','3mf'].includes(phase) ? phase : null;
  job.failureDiagnostics = sanitizeCadDiagnostics(diagnostics, env);
}
export function archiveCadFailure(job) {
  if (job.failureCode) job.lastFailure = { code: job.failureCode, stage: job.failureStage, phase: job.failurePhase || null, attempt: job.failureAttempt, diagnostics: job.failureDiagnostics || '' };
  for (const key of ['failureCode','failureStage','failurePhase','failureAttempt','failureDiagnostics']) delete job[key];
}
export function cadFailureMessage(job) {
  const reasons = { execution_failed: 'CAD execution failed', validation_failed: 'CAD geometry validation failed', export_failed: 'CAD artifact export failed', cancelled: 'CAD execution was cancelled', sandbox_unavailable: 'CAD execution isolation was unavailable' };
  const reason = Object.hasOwn(reasons,job.failureCode) ? reasons[job.failureCode] : 'The CAD executor could not complete this attempt';
  return `${reason} at ${job.failureStage}${job.failurePhase ? ` (${job.failurePhase})` : ''}. Valid saved artifacts are retained. Job ${job.id}, attempt ${job.failureAttempt}.`;
}
