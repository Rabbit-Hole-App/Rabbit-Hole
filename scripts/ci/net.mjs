// Bounded retry for the release scripts' network calls. A transient error may resend a command,
// but only after check() confirms the remote did not already take the mutation.
import { execFileSync } from 'node:child_process';

export const retryable = s => /Connection was reset|connection reset|timed out|HTTP 50[234]/i.test(s) && !/rejected|HTTP 4\d\d/.test(s);

const BACKOFF_MS = [5000, 15000];

// ponytail: matches stderr only, so a local spawn timeout (err.code ETIMEDOUT) is not retried; no jitter on the fixed backoff.
export function run(cmd, args, { check = () => false, exec = execFileSync, sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return exec(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      if (!retryable(String(err.stderr ?? '')) || attempt === BACKOFF_MS.length) throw err;
      if (check()) return null; // the mutation landed; stdout is unknown
      sleep(BACKOFF_MS[attempt]);
    }
  }
}
