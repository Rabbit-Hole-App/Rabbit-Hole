// Fault drills 6 and 7 (spec S6.2b) on REAL crashes: crash-drills.json holds the logs of two local single-stage runs of
// cross-device (retry-safe) on the gate's fork stack, wrangler 4.150.0 (the note in the file says how they were taken).
// It records what classifyRetry answers on them; the classifier is unchanged.
//   node --test scripts/r36-gate/crash-drills.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyRetry } from './templates/classify-retry.mjs';

const cfg = JSON.parse(readFileSync(new URL('./templates/transients.json', import.meta.url), 'utf8'));
const drills = JSON.parse(readFileSync(new URL('./crash-drills.json', import.meta.url), 'utf8'));
// The classifier's inputs as int35.sh retry_check passes them for cross-device (the audited blob is the candidate's: 3233d9e4 has it).
const classify = (d, over = {}) => classifyRetry({ name: 'cross-device', exitCode: d.exitCode, stackAlive: d.stackAlive, checkLog: d.checkLog,
  appLog: d.appLog + d.cpLog, wranglerLogs: d.wranglerEntries, retrySafe: cfg.retrySafe, transients: cfg.transients, workerErrors: cfg.workerErrors,
  retriesUsed: 0, maxRetries: cfg.maxRetriesPerPart, candidateBlob: cfg.retrySafe['cross-device'].blob, ...over });
const withoutMetricsLine = log => log.split('\n').filter(l => !l.includes('configPath.endsWith')).join('\n');
const d6 = drills['drill-6'], d7 = drills['drill-7'];

test('drill 6, the user-worker workerd killed mid-check: wrangler 4.150 restarts it and the check passes, so nothing is retried', () => {
  assert.match(d6.appLog, /The Workers runtime crashed unexpectedly and is being restarted \(crash #1\)/);
  assert.match(d6.appLog, /recovered on attempt \d after a dropped connection to the UserWorker/);
  assert.match(d6.checkLog, /^13\/13 checks passed/m);
  assert.deepEqual(classify(d6), { retry: false, reason: 'passed' });
});

test('drill 6 is inert: had the check failed on those logs, the classifier would refuse the retry, twice over', () => {
  // Every app stack's app.log opens with wrangler 4.150's metrics warning, which carries the workerErrors marker "TypeError:".
  assert.match(d6.appLog, /Failed to parse config for metrics\. Using defaults\. TypeError: configPath\.endsWith is not a function/);
  assert.deepEqual(classify(d6, { exitCode: 1, stackAlive: false }), { retry: false, reason: 'worker exception in the app log' });
  // Without that line, the real crash still prints "Uncaught ... Network connection lost" (a workerErrors marker), and its
  // debug log has no entry holding the proxy-keepalive pair ("Error inside ProxyWorker" with "Network connection lost").
  const app = withoutMetricsLine(d6.appLog);
  assert.match(app, /uncaught exception; source = Uncaught \(in promise\); stack = Error: Network connection lost\./);
  assert.deepEqual(classify({ ...d6, appLog: app }, { exitCode: 1, stackAlive: false }), { retry: false, reason: 'worker exception in the app log' });
  assert.equal(d6.wranglerEntries.some(e => e.includes('Error inside ProxyWorker') && e.includes('Network connection lost')), false);
});

test('drill 7, the app wrangler killed mid-check: the check fails with the stack dead, and it is not retried', () => {
  assert.match(d7.checkLog, /ECONNREFUSED 127\.0\.0\.1:8878/);
  assert.deepEqual(classify(d7), { retry: false, reason: 'worker exception in the app log' });
  // Without the metrics line it is still refused: no recognized signature.
  assert.deepEqual(classify({ ...d7, appLog: withoutMetricsLine(d7.appLog) }), { retry: false, reason: 'stack died without a recognized transient signature' });
});
