// One retry, only for the recognized local-runtime transient, only for a check proven retry-safe (transients.json).
// int35.sh asks this after a check fails; the answer is `retry <id>` or `fail <reason>`, never an error.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

// A crash of the app is never the transient (spec 2.2: no retry for an out of memory or any other crash). The app log is searched,
// ignoring case, for the markers in transients.json workerErrors, and for any `[ERROR]` line that says something other than the
// transient's own error: an empty one or the ProxyWorker / ProxyController line wrangler prints for it.
const OWN_ERROR = /proxy ?worker|proxy ?controller|network connection lost/i;
const otherErrorLine = log => log.split(/\r?\n/).some(line => { const m = /\[ERROR\](.*)$/i.exec(line.replace(/\x1b\[[0-9;]*m/g, '')); return !!m && m[1].trim() !== '' && !OWN_ERROR.test(m[1]); });
const crashed = (appLog, workerErrors) => { const lower = appLog.toLowerCase(); return workerErrors.some(e => lower.includes(e.toLowerCase())) || otherErrorLine(appLog); };

export function classifyRetry({ name, exitCode, stackAlive, checkLog, appLog, wranglerLogs, retrySafe, transients, workerErrors, retriesUsed, maxRetries = 2, candidateBlob }) {
  if (exitCode === 0) return { retry: false, reason: 'passed' };
  if (stackAlive) return { retry: false, reason: 'failed with the stack alive' };
  if (/✗|AssertionError|^not ok|^FAIL/m.test(checkLog)) return { retry: false, reason: 'assertion failure before the stack died' };
  if (crashed(appLog, workerErrors)) return { retry: false, reason: 'worker exception in the app log' };
  const hit = transients.find(t => wranglerLogs.some(l => t.all.every(s => l.includes(s))));
  if (!hit) return { retry: false, reason: 'stack died without a recognized transient signature' };
  const audit = retrySafe[name];
  if (!audit) return { retry: false, reason: `${name} is not proven retry-safe` };
  // The audit read one version of the check file. A candidate whose blob differs (or cannot be read) has not been audited. A check the
  // harness owns is pinned by the harness sha instead.
  if (audit.blob && audit.owner !== 'harness' && candidateBlob !== audit.blob) return { retry: false, reason: 'retry-safe audit stale (re-audit needed)' };
  if (retriesUsed >= maxRetries) return { retry: false, reason: `retry budget of ${maxRetries} used in this part` };
  return { retry: true, reason: hit.id };
}

// wrangler's debug log (wrangler-dist log-file.ts appendToDebugLogFile) is entries of `\n--- <ISO time> <level>\n<message>\n---\n`.
// -> the messages of the entries written at or after `since` (ms). Text with no entry header yields none.
export function entriesSince(text, since = 0) {
  const parts = text.split(/^--- (\d{4}-\d\d-\d\dT[\d:.]+Z) \w+\r?$/m); // [before the first entry, time, message, time, message, ...]
  const out = [];
  for (let i = 1; i < parts.length; i += 2) if (Date.parse(parts[i]) >= since) out.push(parts[i + 1]);
  return out;
}

if (process.argv[1] && basename(process.argv[1]) === 'classify-retry.mjs') {
  try {
    const [name, exit, alive, checkLogPath, stackDir, used, candidateBlob] = process.argv.slice(2);
    const cfg = JSON.parse(readFileSync(new URL('./transients.json', import.meta.url), 'utf8'));
    const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '');
    const logs = join(stackDir, 'wrangler-logs');
    // int35.sh touches <stackDir>/stage-start once the stack is up for the check; a log entry from before it belongs to an earlier
    // crash (one the part already recovered from), not to this stage.
    const since = existsSync(join(stackDir, 'stage-start')) ? statSync(join(stackDir, 'stage-start')).mtimeMs : 0;
    const entries = existsSync(logs) ? readdirSync(logs).flatMap(f => entriesSince(read(join(logs, f)), since)) : [];
    const r = classifyRetry({ name, exitCode: Number(exit), stackAlive: alive === '1', checkLog: read(checkLogPath), appLog: read(join(stackDir, 'app.log')) + read(join(stackDir, 'cp.log')),
      wranglerLogs: entries, retrySafe: cfg.retrySafe, transients: cfg.transients, workerErrors: cfg.workerErrors,
      retriesUsed: Number(used), maxRetries: cfg.maxRetriesPerPart, candidateBlob });
    console.log(`${r.retry ? 'retry' : 'fail'} ${r.reason}`);
  } catch (error) {
    console.log(`fail classifier error: ${String(error.message).split('\n')[0]}`); // never a retry on a broken classifier, and always exit 0
  }
}
