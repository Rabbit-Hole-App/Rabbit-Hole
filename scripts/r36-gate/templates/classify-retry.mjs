// One retry, only for the recognized local-runtime transient, only for a check proven retry-safe (transients.json).
// int35.sh asks this after a check fails; the answer is `retry <id>` or `fail <reason>`, never an error.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
export function classifyRetry({ name, exitCode, stackAlive, checkLog, appLog, wranglerLogs, retrySafe, transients, workerErrors, retriesUsed, maxRetries = 2 }) {
  if (exitCode === 0) return { retry: false, reason: 'passed' };
  if (stackAlive) return { retry: false, reason: 'failed with the stack alive' };
  if (/✗|AssertionError|^not ok|^FAIL/m.test(checkLog)) return { retry: false, reason: 'assertion failure before the stack died' };
  if (workerErrors.some(e => appLog.includes(e))) return { retry: false, reason: 'worker exception in the app log' };
  const hit = transients.find(t => wranglerLogs.some(l => t.all.every(s => l.includes(s))));
  if (!hit) return { retry: false, reason: 'stack died without a recognized transient signature' };
  if (!retrySafe[name]) return { retry: false, reason: `${name} is not proven retry-safe` };
  if (retriesUsed >= maxRetries) return { retry: false, reason: `retry budget of ${maxRetries} used in this part` };
  return { retry: true, reason: hit.id };
}
if (process.argv[1] && basename(process.argv[1]) === 'classify-retry.mjs') {
  try {
    const [name, exit, alive, checkLogPath, stackDir, used] = process.argv.slice(2);
    const cfg = JSON.parse(readFileSync(new URL('./transients.json', import.meta.url), 'utf8'));
    const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '');
    const logs = join(stackDir, 'wrangler-logs');
    // int35.sh touches <stackDir>/stage-start once the stack is up for the check; a wrangler log last written before that
    // belongs to an earlier crash (a stack the part already recovered from), not to this stage.
    const since = existsSync(join(stackDir, 'stage-start')) ? statSync(join(stackDir, 'stage-start')).mtimeMs : 0;
    const stageLogs = existsSync(logs) ? readdirSync(logs).filter(f => statSync(join(logs, f)).mtimeMs >= since).map(f => read(join(logs, f))) : [];
    const r = classifyRetry({ name, exitCode: Number(exit), stackAlive: alive === '1', checkLog: read(checkLogPath), appLog: read(join(stackDir, 'app.log')) + read(join(stackDir, 'cp.log')),
      wranglerLogs: stageLogs, retrySafe: cfg.retrySafe, transients: cfg.transients, workerErrors: cfg.workerErrors,
      retriesUsed: Number(used), maxRetries: cfg.maxRetriesPerPart });
    console.log(`${r.retry ? 'retry' : 'fail'} ${r.reason}`);
  } catch (error) {
    console.log(`fail classifier error: ${String(error.message).split('\n')[0]}`); // never a retry on a broken classifier, and always exit 0
  }
}
