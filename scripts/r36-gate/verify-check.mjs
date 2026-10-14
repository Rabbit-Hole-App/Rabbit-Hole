// The same-sha canonical verify.yml run must have succeeded (the protection each run job used to wait for).
import { execFileSync } from 'node:child_process';
export function verifyVerdict(runs, sha) {
  const mine = runs.filter(r => r.headSha === sha);
  if (!mine.length) return `no verify.yml run for ${sha}`;
  const newest = mine[0];
  if (newest.status !== 'completed') return `verify.yml for ${sha} not completed (${newest.status})`;
  return newest.conclusion === 'success' ? null : `verify.yml for ${sha} concluded ${newest.conclusion}`;
}
// A verify that is only still running is polled (status only) every intervalMs until timeoutMs; anything else - success,
// failure, no run, a gh error (fetch throws) - is final at once. Past the deadline it fails closed. fetch/sleep/now are injectable.
// ponytail: one fixed 10 min budget per sha; collect runs the shas in parallel so the whole wait is 10 min, not 20.
export async function awaitVerify(sha, { fetch = verifyRuns, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, timeoutMs = 600000, intervalMs = 30000 } = {}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const runs = fetch(sha), verdict = verifyVerdict(runs, sha), newest = runs.find(r => r.headSha === sha);
    if (!verdict) return { verdict: null, databaseId: newest.databaseId };
    const pending = newest && newest.status !== 'completed';
    if (!pending || now() >= deadline) return { verdict };
    await sleep(intervalMs);
  }
}
export function verifyRuns(sha) {
  return JSON.parse(execFileSync('gh', ['run', 'list', '--repo', process.env.GITHUB_REPOSITORY, '--workflow', 'verify.yml', '--commit', sha, '--limit', '20', '--json', 'databaseId,status,conclusion,headSha'], { encoding: 'utf8' }));
}
